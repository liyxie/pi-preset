// pi-st-preset extension entry point

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { PresetStore } from "./store.ts";
import { registerCommands } from "./commands.ts";
import { assemble } from "./assemble.ts";
import { applySampling } from "./sampling.ts";

export default function stPreset(pi: ExtensionAPI) {
	const store = new PresetStore(pi);

	// Register flag for starting with a preset
	pi.registerFlag("st-preset", {
		description: "Activate ST-style preset on startup",
		type: "string",
	});

	// Register commands
	registerCommands(pi, store);

	// Load presets on session start
	pi.on("session_start", async (_event, ctx) => {
		await store.load(ctx);

		// Check for --st-preset flag
		const flagValue = ctx.flags?.["st-preset"];
		if (typeof flagValue === "string" && flagValue) {
			const preset = store.get(flagValue);
			if (preset && !preset.error) {
				store.activate(flagValue);
				ctx.ui.notify(`Auto-activated preset: ${flagValue}`);
			} else {
				ctx.ui.notify(`Failed to auto-activate preset: ${flagValue}`);
			}
		}

		// Warn if pi's example preset extension is also loaded
		const commands = pi.getCommands();
		const presetCommands = commands.filter((c) => {
			const name = typeof c === "string" ? c : c.name;
			return name?.startsWith("preset");
		});
		if (presetCommands.length > 1) {
			ctx.ui.notify(
				"⚠ Warning: Multiple preset extensions detected. pi-st-preset may conflict with examples/extensions/preset.ts",
			);
		}
	});

	// Restore state on session tree navigation
	pi.on("session_tree", async (_event, ctx) => {
		store.restoreFromBranch(ctx);
	});

	// Transform context before each request
	pi.on("context_with_system", async (event, ctx) => {
		const preset = store.active();
		if (!preset || !ctx.model) {
			return undefined; // Preset off or no model
		}

		// Build macro environment
		const history = event.messages.filter((m) => m.role !== "system");
		const macros = store.buildMacroEnv(ctx, history);

		// Check model support for mid-conversation system messages
		const midConvoSystem =
			ctx.model.compat && "supportsMidConvoSystemMessages" in ctx.model.compat
				? ctx.model.compat.supportsMidConvoSystemMessages === true
				: false;

		// Assemble messages according to preset
		const messages = assemble({
			preset,
			messages: event.messages,
			midConvoSystem,
			macros,
		});

		return { messages };
	});

	// Apply sampling parameters
	pi.on("before_provider_request", async (event, ctx) => {
		const preset = store.active();
		if (!preset?.sampling || !ctx.model) {
			return undefined;
		}

		return applySampling(event.payload, ctx.model.api, preset.sampling);
	});
}
