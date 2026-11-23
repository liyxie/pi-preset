// Core assembly logic - pure function that rebuilds message list per request

import type { AgentMessage, SystemMessage } from "@earendil-works/pi-ai";
import { getCurrentSystemMessage, getSystemMessageText } from "@earendil-works/pi-ai";
import type { MacroEnv, MarkerBlock, PresetBlock, PresetFile } from "./types.ts";
import { expandBlocks } from "./macros.ts";
import { injectAtDepth, type DepthBlock } from "./depth.ts";

export interface AssembleInput {
	preset: PresetFile;
	messages: AgentMessage[];
	/** Whether model accepts mid-conversation system messages. */
	midConvoSystem: boolean;
	macros: MacroEnv;
}

interface RenderedBlock {
	role: "system" | "user" | "assistant";
	content: string;
	isRelative: boolean;
	depth?: number;
	order?: number;
}

/** Rebuild message list according to preset. Pure function. */
export function assemble(input: AssembleInput): AgentMessage[] {
	const { preset, messages, midConvoSystem, macros } = input;

	// ① Get current system state
	const current = getCurrentSystemMessage(messages);

	// ② Extract conversation history (all non-system messages)
	const history = messages.filter((m) => m.role !== "system");

	// ③ Determine trigger type
	const trigger = history.at(-1)?.role === "toolResult" ? "tool-turn" : "user-turn";

	// ④ Filter active blocks
	const active = preset.blocks.filter(
		(b) => b.enabled && (b.triggers === undefined || b.triggers.includes(trigger)),
	);

	// ⑤ Expand macros
	const expanded = expandBlocks(active, macros);

	// ⑥ Render blocks to messages
	const rendered = renderBlocks(expanded, current);

	// ⑦ Split into before/after/depth groups
	const { before, after, depth } = splitBlocks(rendered);

	// ⑧ Inject depth blocks into history
	const historyWithInjections = injectAtDepth(history, depth);

	// ⑨ Build head system message
	const { head, rest } = buildHead(before, current, preset);

	// ⑩ Handle mid-conversation system messages
	const tail = [...rest, ...historyWithInjections, ...after.map((block) => createMessage(block.role, block.content))];
	const finalTail = demoteMidSystem(tail, midConvoSystem, preset.midSystemFallback ?? "user");

	// ⑪ Return assembled message list
	return [head, ...finalTail];
}

/** Render blocks into message-like objects. */
function renderBlocks(
	blocks: PresetBlock[],
	current: SystemMessage,
): RenderedBlock[] {
	const rendered: RenderedBlock[] = [];

	for (const block of blocks) {
		if (block.kind === "marker") {
			if (block.marker === "chatHistory") {
				// Special marker - doesn't render to a message
				rendered.push({
					role: "system",
					content: "__CHAT_HISTORY_MARKER__",
					isRelative: true,
				});
			} else {
				const markerContent = renderMarker(block, current);
				if (markerContent === null) continue; // Skip empty markers

				rendered.push({
					role: block.role ?? "system",
					content: markerContent,
					isRelative: true,
				});
			}
		} else {
			// Text block
			if (block.content.trim() === "") continue; // Skip empty content

			if (block.position.type === "relative") {
				rendered.push({
					role: block.role,
					content: block.content,
					isRelative: true,
				});
			} else {
				rendered.push({
					role: block.role,
					content: block.content,
					isRelative: false,
					depth: block.position.depth,
					order: block.position.order ?? 100,
				});
			}
		}
	}

	return rendered;
}

/** Render marker block content. Returns null if marker has no content. */
function renderMarker(block: MarkerBlock, current: SystemMessage): string | null {
	if (block.marker === "piPrompt") {
		return getSystemMessageText(current) || null;
	}

	if (block.marker === "section") {
		if (!block.section) return null;
		return current.sections?.[block.section] ?? null;
	}

	// chatHistory - handled specially by caller
	return null;
}

/** Split rendered blocks into before/after/depth groups. */
function splitBlocks(rendered: RenderedBlock[]) {
	const chatHistoryIndex = rendered.findIndex((b) => b.content === "__CHAT_HISTORY_MARKER__");

	const before: RenderedBlock[] = [];
	const after: RenderedBlock[] = [];
	const depth: DepthBlock[] = [];

	for (let i = 0; i < rendered.length; i++) {
		const block = rendered[i]!;

		if (block.content === "__CHAT_HISTORY_MARKER__") {
			continue; // Skip marker itself
		}

		if (!block.isRelative) {
			// Depth block
			depth.push({
				depth: block.depth!,
				order: block.order!,
				role: block.role,
				content: block.content,
			});
		} else if (chatHistoryIndex === -1 || i < chatHistoryIndex) {
			// Before history (or no history marker = all relative blocks are "before")
			before.push(block);
		} else {
			// After history
			after.push(block);
		}
	}

	// If no chatHistory marker, all relative blocks are before
	return { before: chatHistoryIndex === -1 ? rendered.filter((b) => b.isRelative) : before, after, depth, chatHistoryIndex };
}

/** Build head system message from before blocks and current system state. */
function buildHead(
	before: RenderedBlock[],
	current: SystemMessage,
	preset: PresetFile,
): { head: AgentMessage; rest: AgentMessage[] } {
	const systemBlocks: string[] = [];
	const rest: AgentMessage[] = [];

	// Collect leading system blocks
	let i = 0;
	while (i < before.length && before[i]!.role === "system") {
		systemBlocks.push(before[i]!.content);
		i++;
	}

	// Rest are non-system blocks in before group
	for (; i < before.length; i++) {
		rest.push(createMessage(before[i]!.role, before[i]!.content));
	}

	// Build head content
	const separator = preset.squash?.separator ?? "\n\n";
	const headContent = systemBlocks.length > 0 ? systemBlocks.join(separator) : "";

	// Build head with tools if keepTools !== false
	const head: AgentMessage = {
		role: "system",
		content: headContent,
		timestamp: 0,
	};

	if (preset.keepTools !== false) {
		(head as SystemMessage).toolsAdded = current.toolsAdded;
	}

	return { head, rest };
}

/** Convert mid-conversation system messages based on model support. */
function demoteMidSystem(
	messages: AgentMessage[],
	midConvoSystem: boolean,
	fallback: "user" | "hoist",
): AgentMessage[] {
	if (midConvoSystem || fallback === "hoist") {
		return messages; // Keep as-is
	}

	// Convert system to user
	return messages.map((m) => {
		if (m.role === "system") {
			return { role: "user", content: m.content, timestamp: m.timestamp };
		}
		return m;
	});
}

/** Create message from rendered block. */
function createMessage(role: "system" | "user" | "assistant", content: string): AgentMessage {
	if (role === "system") {
		return { role: "system", content, timestamp: 0 };
	}

	if (role === "user") {
		return { role: "user", content, timestamp: 0 };
	}

	// Assistant
	return {
		role: "assistant",
		content: [{ type: "text", text: content }],
		api: "openai-completions",
		provider: "pi-st-preset",
		model: "preset",
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		stopReason: "stop",
		timestamp: 0,
	};
}
