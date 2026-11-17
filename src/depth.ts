// Depth injection with tool call pairing

import type { AgentMessage } from "@earendil-works/pi-agent-core";

export interface DepthBlock {
	depth: number;
	order: number;
	role: "system" | "user" | "assistant";
	content: string;
}

/**
 * Inject depth blocks into history at their specified depths.
 * Respects tool call pairing: won't split assistant toolCall from its toolResult.
 */
export function injectAtDepth(history: AgentMessage[], depthBlocks: DepthBlock[]): AgentMessage[] {
	if (depthBlocks.length === 0) {
		return history;
	}

	// Group blocks by depth
	const byDepth = new Map<number, DepthBlock[]>();
	for (const block of depthBlocks) {
		const existing = byDepth.get(block.depth) ?? [];
		existing.push(block);
		byDepth.set(block.depth, existing);
	}

	// Sort each depth group: by order asc, then by role (assistant -> user -> system)
	const roleOrder = { assistant: 0, user: 1, system: 2 };
	for (const blocks of byDepth.values()) {
		blocks.sort((a, b) => {
			if (a.order !== b.order) return a.order - b.order;
			return roleOrder[a.role] - roleOrder[b.role];
		});
	}

	// Merge blocks at same depth and same role within same order bucket
	const mergedByDepth = new Map<number, DepthBlock[]>();
	for (const [depth, blocks] of byDepth) {
		const merged: DepthBlock[] = [];
		let current: DepthBlock | null = null;

		for (const block of blocks) {
			if (current && current.order === block.order && current.role === block.role) {
				// Merge into current
				current.content += "\n" + block.content;
			} else {
				// Start new block
				if (current) merged.push(current);
				current = { ...block };
			}
		}
		if (current) merged.push(current);
		mergedByDepth.set(depth, merged);
	}

	// Calculate injection points and inject
	const result: AgentMessage[] = [];
	const depths = Array.from(mergedByDepth.keys()).sort((a, b) => b - a); // Descending

	let historyIndex = 0;

	for (const depth of depths) {
		// Calculate injection point
		let injectionPoint = history.length - depth;

		// Clamp to valid range
		if (injectionPoint < 0) injectionPoint = 0;
		if (injectionPoint > history.length) injectionPoint = history.length;

		// Move injection point backward past any toolResult messages to keep pairs together
		while (injectionPoint > 0 && history[injectionPoint - 1]?.role === "toolResult") {
			injectionPoint--;
		}

		// Add history messages up to injection point
		while (historyIndex < injectionPoint) {
			result.push(history[historyIndex]!);
			historyIndex++;
		}

		// Add injected blocks at this depth
		const blocks = mergedByDepth.get(depth)!;
		for (const block of blocks) {
			result.push(createSyntheticMessage(block.role, block.content));
		}
	}

	// Add remaining history
	while (historyIndex < history.length) {
		result.push(history[historyIndex]!);
		historyIndex++;
	}

	return result;
}

/** Create a synthetic message for preset-injected content. */
function createSyntheticMessage(
	role: "system" | "user" | "assistant",
	content: string,
): AgentMessage {
	const timestamp = 0; // Use 0 for stable output

	if (role === "system") {
		return { role: "system", content, timestamp };
	}

	if (role === "user") {
		return { role: "user", content, timestamp };
	}

	// Assistant - use synthetic provider so transformMessages treats it as "another model"
	return {
		role: "assistant",
		content: [{ type: "text", text: content }],
		api: "openai-completions",
		provider: "pi-st-preset",
		model: "preset",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		stopReason: "stop",
		timestamp,
	};
}
