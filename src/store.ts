// Preset storage and session state management

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir, userInfo } from "node:os";
import type { ExtensionAPI, ExtensionEventContext } from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { LoadedPreset, PresetFile, PresetState, MacroEnv } from "./types.ts";
import { validatePresetFile } from "./schema.ts";

const CONFIG_DIR_NAME = ".pi";
const AGENT_DIR = "agent";
const PRESET_DIR = "st-presets";

export class PresetStore {
	private presets = new Map<string, LoadedPreset>();
	private currentState: PresetState = { name: null };
	private pi: ExtensionAPI;

	constructor(pi: ExtensionAPI) {
		this.pi = pi;
	}

	/** Load presets from global and project directories. */
	async load(ctx: ExtensionEventContext): Promise<void> {
		this.presets.clear();

		// Load global presets
		const globalDir = join(homedir(), CONFIG_DIR_NAME, AGENT_DIR, PRESET_DIR);
		await this.loadFromDir(globalDir, "global");

		// Load project presets if trusted
		if (ctx.isProjectTrusted()) {
			const projectDir = join(ctx.cwd, CONFIG_DIR_NAME, PRESET_DIR);
			await this.loadFromDir(projectDir, "project");
		}

		// Restore state from session branch
		this.restoreFromBranch(ctx);
	}

	/** Load preset files from a directory. */
	private async loadFromDir(dir: string, source: "global" | "project"): Promise<void> {
		try {
			const files = await readdir(dir);
			for (const file of files) {
				if (!file.endsWith(".json")) continue;

				const id = file.slice(0, -5); // Remove .json
				const path = join(dir, file);

				try {
					const content = await readFile(path, "utf-8");
					const data = JSON.parse(content) as unknown;

					const error = validatePresetFile(data);
					if (error) {
						this.presets.set(id, { id, source, data: null as any, error });
						continue;
					}

					// Project presets override global ones with same id
					if (source === "project" || !this.presets.has(id)) {
						this.presets.set(id, { id, source, data: data as PresetFile });
					}
				} catch (err) {
					this.presets.set(id, {
						id,
						source,
						data: null as any,
						error: `Failed to load: ${err instanceof Error ? err.message : String(err)}`,
					});
				}
			}
		} catch {
			// Directory doesn't exist or can't be read - skip silently
		}
	}

	/** Restore state from session branch. */
	restoreFromBranch(ctx: ExtensionEventContext): void {
		const branch = ctx.sessionManager.getBranch();

		// Find most recent st-preset.state entry
		for (let i = branch.length - 1; i >= 0; i--) {
			const entry = branch[i];
			if (entry?.type === "custom" && entry.customType === "st-preset.state") {
				this.currentState = entry.data as PresetState;
				return;
			}
		}

		// No state found - preset is off
		this.currentState = { name: null };
	}

	/** Get currently active preset. Returns null if no preset is active or if it failed to load. */
	active(): PresetFile | null {
		if (!this.currentState.name) return null;

		const loaded = this.presets.get(this.currentState.name);
		if (!loaded || loaded.error) return null;

		return loaded.data;
	}

	/** Get loaded preset by id. */
	get(id: string): LoadedPreset | undefined {
		return this.presets.get(id);
	}

	/** Get all loaded presets. */
	all(): LoadedPreset[] {
		return Array.from(this.presets.values());
	}

	/** Activate a preset. Writes state entry. */
	activate(name: string): void {
		this.currentState = { name };
		this.pi.appendEntry("st-preset.state", this.currentState);
		this.pi.ui.setStatus("st-preset", `preset:${name}`);
	}

	/** Deactivate preset. */
	deactivate(): void {
		this.currentState = { name: null };
		this.pi.appendEntry("st-preset.state", this.currentState);
		this.pi.ui.setStatus("st-preset", undefined);
	}

	/** Get current state. */
	getState(): PresetState {
		return this.currentState;
	}

	/** Build macro environment for current request. */
	buildMacroEnv(ctx: ExtensionEventContext, history: AgentMessage[]): MacroEnv {
		const preset = this.active();
		const now = new Date();

		// Find last user and assistant messages
		let lastUserMessage = "";
		let lastAssistantMessage = "";

		for (let i = history.length - 1; i >= 0; i--) {
			const msg = history[i]!;
			if (msg.role === "user" && !lastUserMessage) {
				lastUserMessage = typeof msg.content === "string" ? msg.content : "";
			}
			if (msg.role === "assistant" && !lastAssistantMessage) {
				const content = msg.content;
				if (Array.isArray(content)) {
					const textParts = content.filter((c) => c.type === "text").map((c) => c.text);
					lastAssistantMessage = textParts.join(" ");
				}
			}
			if (lastUserMessage && lastAssistantMessage) break;
		}

		return {
			user: preset?.variables?.user ?? userInfo().username,
			char: preset?.variables?.char ?? "",
			model: ctx.model?.id ?? "unknown",
			cwd: ctx.cwd,
			date: now.toLocaleDateString(),
			time: now.toLocaleTimeString(),
			lastUserMessage,
			lastAssistantMessage,
			variables: { ...(preset?.variables ?? {}) },
		};
	}
}
