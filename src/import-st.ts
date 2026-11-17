// Import SillyTavern preset JSON to pi-st-preset format

import { readFile, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import type { PresetFile, PresetBlock, Placement } from "./types.ts";

const CONFIG_DIR_NAME = ".pi";
const AGENT_DIR = "agent";
const PRESET_DIR = "st-presets";

interface STPrompt {
	identifier: string;
	name?: string;
	role: string;
	content: string;
	injection_position?: number;
	injection_depth?: number;
	injection_order?: number;
	injection_trigger?: string;
	enabled?: boolean;
}

interface STPreset {
	prompts: STPrompt[];
	prompt_order: Array<{
		character_id: number;
		order: Array<{ identifier: string; enabled: boolean }>;
	}>;
	temperature?: number;
	top_p?: number;
	top_k?: number;
	frequency_penalty?: number;
	presence_penalty?: number;
	squash_system_messages?: boolean;
	assistant_prefill?: string;
	new_chat_prompt?: string;
	function_calling?: boolean;
}

/**
 * Import a SillyTavern preset JSON file.
 * @param stPath Path to ST preset JSON file
 * @param newName New preset name (defaults to source filename)
 * @param orderId Which prompt_order to use (defaults to 100001, ST's chat completion order)
 */
export async function importSTPreset(
	stPath: string,
	newName?: string,
	orderId: number = 100001,
): Promise<{ preset: PresetFile; report: string[] }> {
	const report: string[] = [];

	// Read ST preset
	const content = await readFile(stPath, "utf-8");
	const stPreset = JSON.parse(content) as STPreset;

	// Find the order to use
	const orderEntry = stPreset.prompt_order.find((o) => o.character_id === orderId);
	if (!orderEntry) {
		// Try first available order
		const firstOrder = stPreset.prompt_order[0];
		if (!firstOrder) {
			throw new Error("No prompt_order found in ST preset");
		}
		report.push(`Warning: order ${orderId} not found, using ${firstOrder.character_id}`);
		orderId = firstOrder.character_id;
	}

	const order = orderEntry ?? stPreset.prompt_order[0]!;

	// Convert blocks
	const blocks: PresetBlock[] = [];
	const promptMap = new Map(stPreset.prompts.map((p) => [p.identifier, p]));

	let enabledCount = 0;
	let skippedCount = 0;
	let beforeHistory = 0;
	let afterHistory = 0;

	for (const orderItem of order.order) {
		const prompt = promptMap.get(orderItem.identifier);
		if (!prompt) {
			skippedCount++;
			continue;
		}

		const enabled = orderItem.enabled;
		if (enabled) enabledCount++;

		// Convert role
		let role: "system" | "user" | "assistant" = "system";
		if (prompt.role === "user") role = "user";
		else if (prompt.role === "assistant" || prompt.role === "model") role = "assistant";

		// Handle special markers
		if (prompt.identifier === "chatHistory") {
			blocks.push({
				kind: "marker",
				id: "chatHistory",
				name: "Chat History",
				enabled,
				marker: "chatHistory",
			});
			continue;
		}

		// Skip character card / world book markers
		const skippedMarkers = [
			"worldInfoBefore",
			"worldInfoAfter",
			"charDescription",
			"charPersonality",
			"scenario",
			"personaDescription",
			"dialogueExamples",
		];
		if (skippedMarkers.includes(prompt.identifier)) {
			report.push(`Skipped marker: ${prompt.identifier}`);
			continue;
		}

		// Convert position
		const injectionPos = prompt.injection_position ?? 0;
		const position: Placement =
			injectionPos === 0
				? { type: "relative" }
				: { type: "depth", depth: prompt.injection_depth ?? 4, order: prompt.injection_order ?? 100 };

		if (position.type === "relative") {
			beforeHistory++;
		} else {
			afterHistory++;
		}

		blocks.push({
			kind: "text",
			id: prompt.identifier,
			name: prompt.name,
			enabled,
			role,
			content: prompt.content,
			position,
		});
	}

	// Count skipped prompts not in order
	const inOrder = new Set(order.order.map((o) => o.identifier));
	const notInOrder = stPreset.prompts.filter((p) => !inOrder.has(p.identifier)).length;

	report.push(
		`Imported from order ${orderId}: ${enabledCount} enabled blocks, ${skippedCount} disabled`,
	);
	report.push(`  Before history: ${beforeHistory}, After history: ${afterHistory}`);
	report.push(`Skipped ${notInOrder} prompts not in order`);

	// Convert sampling
	const sampling: PresetFile["sampling"] = {};
	if (stPreset.temperature !== undefined && stPreset.temperature !== 0) {
		sampling.temperature = stPreset.temperature;
	}
	if (stPreset.top_p !== undefined && stPreset.top_p !== 0) {
		sampling.top_p = stPreset.top_p;
	}
	if (stPreset.top_k !== undefined && stPreset.top_k !== 0) {
		sampling.top_k = stPreset.top_k;
	}
	if (stPreset.frequency_penalty !== undefined && stPreset.frequency_penalty !== 0) {
		sampling.frequency_penalty = stPreset.frequency_penalty;
	}
	if (stPreset.presence_penalty !== undefined && stPreset.presence_penalty !== 0) {
		sampling.presence_penalty = stPreset.presence_penalty;
	}

	// Build preset
	const preset: PresetFile = {
		version: 1,
		name: newName ?? basename(stPath, ".json"),
		blocks,
		squash: stPreset.squash_system_messages ? { enabled: true } : undefined,
		keepTools: stPreset.function_calling === false ? false : undefined,
		sampling: Object.keys(sampling).length > 0 ? sampling : undefined,
	};

	// Add assistant_prefill as depth 0 block if present
	if (stPreset.assistant_prefill && stPreset.assistant_prefill.trim()) {
		preset.blocks.push({
			kind: "text",
			id: "assistant_prefill",
			name: "Assistant Prefill",
			enabled: true,
			role: "assistant",
			content: stPreset.assistant_prefill,
			position: { type: "depth", depth: 0 },
			triggers: ["user-turn"],
		});
		report.push("Added assistant_prefill as depth 0 assistant block");
	}

	if (stPreset.function_calling === false) {
		report.push("Warning: keepTools=false - pi's tool declarations will not be sent");
	}

	return { preset, report };
}

/**
 * Import and save ST preset to global presets directory.
 */
export async function importAndSave(
	stPath: string,
	newName?: string,
	orderId?: number,
): Promise<string[]> {
	const { preset, report } = await importSTPreset(stPath, newName, orderId);

	const outputName = preset.name ?? "imported";
	const outputPath = join(homedir(), CONFIG_DIR_NAME, AGENT_DIR, PRESET_DIR, `${outputName}.json`);

	await writeFile(outputPath, JSON.stringify(preset, null, 2), "utf-8");
	report.push(`Saved to: ${outputPath}`);

	return report;
}
