// Macro expansion for preset content templates

import type { MacroEnv, PresetBlock, TextBlock } from "./types.ts";

/** Expand all macros in block contents. Returns new blocks array with expanded content. */
export function expandBlocks(
	blocks: PresetBlock[],
	macros: MacroEnv,
): PresetBlock[] {
	const vars = { ...macros.variables };
	const expanded: PresetBlock[] = [];

	for (const block of blocks) {
		if (block.kind === "marker") {
			expanded.push(block);
			continue;
		}

		// Expand macros in text block content
		const content = expandMacros(block.content, macros, vars);
		expanded.push({ ...block, content });
	}

	return expanded;
}

/** Expand macros in a single string. Mutates vars for setvar. */
function expandMacros(text: string, env: MacroEnv, vars: Record<string, string>): string {
	let result = text;

	// Replace macros - no recursion, single pass
	result = result.replace(/\{\{([^}]+)\}\}/g, (_match, inner: string) => {
		const trimmed = inner.trim();
		const lower = trimmed.toLowerCase();

		// Comment macro
		if (lower.startsWith("//")) {
			return "";
		}

		// Trim macro
		if (lower === "trim") {
			return "\x00TRIM\x00"; // Marker for post-processing
		}

		// Variable macros
		if (lower.startsWith("setvar::")) {
			const parts = trimmed.substring(8).split("::");
			if (parts.length >= 2) {
				const key = parts[0];
				const value = parts.slice(1).join("::");
				vars[key] = value;
			}
			return "";
		}

		if (lower.startsWith("getvar::")) {
			const key = trimmed.substring(8);
			return vars[key] ?? "";
		}

		// Random macro
		if (lower.startsWith("random::")) {
			const options = trimmed.substring(8).split("::");
			if (options.length > 0) {
				return options[Math.floor(Math.random() * options.length)] ?? "";
			}
			return "";
		}

		// Simple replacement macros
		switch (lower) {
			case "user":
				return env.user;
			case "char":
				return env.char;
			case "model":
				return env.model;
			case "cwd":
				return env.cwd;
			case "date":
				return env.date;
			case "time":
				return env.time;
			case "lastusermessage":
				return env.lastUserMessage;
			case "lastassistantmessage":
			case "lastcharmessage":
				return env.lastAssistantMessage;
			default:
				// Unknown macro - preserve original
				return `{{${inner}}}`;
		}
	});

	// Post-process trim markers
	result = result.replace(/\s*\x00TRIM\x00\s*/g, "");

	return result;
}

/** Check if content uses random macros (breaks prefix caching). */
export function usesRandomMacros(content: string): boolean {
	return /\{\{random::/i.test(content);
}

/** Check if content uses time macros (changes every request). */
export function usesTimeMacros(content: string): boolean {
	return /\{\{time\}\}/i.test(content);
}
