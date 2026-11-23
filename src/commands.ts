// Command implementations for /preset

import type { ExtensionAPI, ExtensionEventContext } from "@earendil-works/pi-coding-agent";
import type { PresetStore } from "./store.ts";
import { assemble } from "./assemble.ts";
import { usesRandomMacros, usesTimeMacros } from "./macros.ts";

export function registerCommands(pi: ExtensionAPI, store: PresetStore): void {
	pi.registerCommand("preset", {
		description: "Manage SillyTavern-style presets for message list transformation",
		handler: async (args, ctx) => {
			if (!args || args.trim() === "") {
				return handlePresetSelect(ctx, store);
			}

			const parts = args.trim().split(/\s+/);
			const subcommand = parts[0]!.toLowerCase();

			switch (subcommand) {
				case "list":
					return handlePresetList(ctx, store);
				case "off":
					return handlePresetOff(ctx, store);
				case "reload":
					return handlePresetReload(ctx, store);
				case "preview":
					return handlePresetPreview(ctx, store);
				case "import":
					return handlePresetImport(ctx, store, parts.slice(1));
				default:
					// Treat as preset name
					return handlePresetActivate(ctx, store, args.trim());
			}
		},
	});
}

/** Show preset selector. */
async function handlePresetSelect(ctx: ExtensionEventContext, store: PresetStore): Promise<void> {
	const presets = store.all().filter((p) => !p.error);
	const current = store.getState().name;

	const choices = [
		{ label: "Off", value: null },
		...presets.map((p) => ({
			label: `${p.data.name ?? p.id}${p.id === current ? " (active)" : ""}`,
			value: p.id,
		})),
	];

	const selected = await ctx.ui.select("Select preset", choices);

	if (selected === null) {
		store.deactivate(ctx.ui);
		ctx.ui.notify("Preset deactivated");
	} else {
		store.activate(selected, ctx.ui);
		ctx.ui.notify(`Activated preset: ${selected}`);
	}
}

/** List all presets. */
async function handlePresetList(ctx: ExtensionEventContext, store: PresetStore): Promise<void> {
	const presets = store.all();

	if (presets.length === 0) {
		ctx.ui.notify("No presets found");
		return;
	}

	const lines: string[] = ["Available presets:"];
	const current = store.getState().name;

	for (const preset of presets) {
		const active = preset.id === current ? " (active)" : "";
		const source = preset.source === "global" ? "~" : ".";

		if (preset.error) {
			lines.push(`  [${source}] ${preset.id}${active} - ERROR: ${preset.error}`);
		} else {
			const name = preset.data.name ?? preset.id;
			const blockCount = preset.data.blocks.filter((b) => b.enabled).length;
			lines.push(`  [${source}] ${preset.id}${active} - ${name} (${blockCount} blocks)`);
		}
	}

	ctx.ui.notify(lines.join("\n"));
}

/** Deactivate preset. */
async function handlePresetOff(ctx: ExtensionEventContext, store: PresetStore): Promise<void> {
	store.deactivate(ctx.ui);
	ctx.ui.notify("Preset deactivated");
}

/** Reload preset files. */
async function handlePresetReload(ctx: ExtensionEventContext, store: PresetStore): Promise<void> {
	await store.load(ctx);
	ctx.ui.notify(`Reloaded ${store.all().length} presets`);
}

/** Activate a preset by name. */
async function handlePresetActivate(
	ctx: ExtensionEventContext,
	store: PresetStore,
	name: string,
): Promise<void> {
	const preset = store.get(name);

	if (!preset) {
		ctx.ui.notify(`Preset not found: ${name}`);
		return;
	}

	if (preset.error) {
		ctx.ui.notify(`Cannot activate preset with errors: ${preset.error}`);
		return;
	}

	store.activate(name, ctx.ui);
	ctx.ui.notify(`Activated preset: ${name}`);
}

/** Preview assembled messages. */
async function handlePresetPreview(ctx: ExtensionEventContext, store: PresetStore): Promise<void> {
	const preset = store.active();

	if (!preset) {
		ctx.ui.notify("No preset is active");
		return;
	}

	// Get current session messages
	const projection = ctx.sessionManager.buildSessionProjection();
	const messages = projection.messages;

	// Build macro env
	const history = messages.filter((m) => m.role !== "system");
	const macros = store.buildMacroEnv(ctx, history);

	// Check model support for mid-convo system
	const midConvoSystem =
		ctx.model?.compat && "supportsMidConvoSystemMessages" in ctx.model.compat
			? ctx.model.compat.supportsMidConvoSystemMessages === true
			: false;

	// Assemble
	const assembled = assemble({ preset, messages, midConvoSystem, macros });

	// Format output
	const lines: string[] = [`Preview of preset "${store.getState().name}":`];
	lines.push("");

	for (let i = 0; i < assembled.length; i++) {
		const msg = assembled[i]!;
		const role = msg.role;

		let content = "";
		if (role === "system") {
			content = msg.content;
		} else if (role === "user") {
			content = msg.content;
		} else if (role === "assistant") {
			const c = msg.content;
			if (Array.isArray(c)) {
				content = c
					.filter((p) => p.type === "text")
					.map((p) => p.text)
					.join(" ");
			}
		} else if (role === "toolResult") {
			content = `[tool result: ${msg.toolCallId}]`;
		}

		const preview = content.length > 80 ? content.slice(0, 80) + "..." : content;
		const charCount = content.length;

		lines.push(`${i + 1}. [${role}] ${charCount} chars - ${preview}`);
	}

	lines.push("");
	lines.push(`Total messages: ${assembled.length}`);

	// Check for cache-breaking macros
	const warnings: string[] = [];
	for (const block of preset.blocks) {
		if (block.kind === "text") {
			if (usesRandomMacros(block.content)) {
				warnings.push("⚠ Preset uses {{random}} - breaks prefix caching");
			}
			if (usesTimeMacros(block.content)) {
				warnings.push("⚠ Preset uses {{time}} - changes every request");
			}
		}
	}

	if (warnings.length > 0) {
		lines.push("");
		lines.push(...warnings);
	}

	// Check sampling support
	if (preset.sampling && ctx.model) {
		const { supportsSampling } = await import("./sampling.ts");
		if (!supportsSampling(ctx.model.api)) {
			lines.push("");
			lines.push(`⚠ API ${ctx.model.api} does not support sampling parameter overrides`);
		}
	}

	ctx.ui.notify(lines.join("\n"));
}

/** Import SillyTavern preset. */
async function handlePresetImport(
	ctx: ExtensionEventContext,
	store: PresetStore,
	args: string[],
): Promise<void> {
	if (args.length === 0) {
		ctx.ui.notify("Usage: /preset import <st-preset-path> [new-name]");
		return;
	}

	const stPath = args[0]!;
	const newName = args[1];

	try {
		const { importAndSave } = await import("./import-st.ts");
		const report = await importAndSave(stPath, newName);

		ctx.ui.notify(report.join("\n"));

		// Reload presets to pick up the new one
		await store.load(ctx);
	} catch (err) {
		ctx.ui.notify(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
	}
}
