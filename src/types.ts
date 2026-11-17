// Type definitions for pi-st-preset extension

/** Preset file (JSON). */
export interface PresetFile {
	/** File format version, currently 1. */
	version: 1;
	/** Display name; filename (without .json) is the preset's ID. */
	name?: string;
	description?: string;
	/** Ordered list of blocks. Array order = order within system area. */
	blocks: PresetBlock[];
	/** Preset-level variables for {{getvar::x}}. */
	variables?: Record<string, string>;
	/** Sampling parameters sent to provider (§6). */
	sampling?: SamplingConfig;
	/** How to merge adjacent system blocks in system area. */
	squash?: { enabled: boolean; separator?: string };
	/**
	 * How to handle system blocks in depth area when model doesn't support mid-convo system messages.
	 * - "user": convert to user messages (default, preserves depth position)
	 * - "hoist": merge to top (pi's default behavior, loses depth position)
	 */
	midSystemFallback?: "user" | "hoist";
	/** Whether to send pi's native tool declarations to the model. Default true. */
	keepTools?: boolean;
}

export type PresetBlock = TextBlock | MarkerBlock;

/** Fixed content block. */
export interface TextBlock {
	kind: "text";
	/** Unique within preset, ST identifier preserved on import. */
	id: string;
	/** Display name. */
	name?: string;
	enabled: boolean;
	role: "system" | "user" | "assistant";
	/** Content template, supports macros (§5.6). */
	content: string;
	/** Placement strategy. */
	position: Placement;
	/** Only inject on these request types; undefined = always inject. */
	triggers?: Trigger[];
}

/** Marker block: content is taken from pi's current state at assembly time. Corresponds to ST markers. */
export interface MarkerBlock {
	kind: "marker";
	id: string;
	name?: string;
	enabled: boolean;
	marker: MarkerKind;
	/** For section marker only: which pi prompt section to take. */
	section?: string;
	/** What role the marker content outputs as; chatHistory ignores this field. Default "system". */
	role?: "system" | "user" | "assistant";
	triggers?: Trigger[];
}

/**
 * - chatHistory: conversation history itself (the segment after system area, before depth injections)
 * - piPrompt: pi's original complete system prompt (preamble + all sections)
 * - section: a specific named section from pi's prompt, e.g. skills / project_context / cwd
 */
export type MarkerKind = "chatHistory" | "piPrompt" | "section";

export type Placement =
	/** System area: sorted by blocks array order, placed before history (ST's RELATIVE). */
	| { type: "relative" }
	/** Depth area: inserted into history, depth messages from end (ST's ABSOLUTE / In-Chat). */
	| { type: "depth"; depth: number; order?: number };

/**
 * - user-turn: last message is user message (user just spoke)
 * - tool-turn: last message is toolResult (continuation request after model called tools)
 */
export type Trigger = "user-turn" | "tool-turn";

export interface SamplingConfig {
	temperature?: number;
	top_p?: number;
	top_k?: number;
	frequency_penalty?: number;
	presence_penalty?: number;
}

/** State entry stored in session. */
export interface PresetState {
	/** Active preset name, null = preset is off. */
	name: string | null;
	/** Per-block overrides (toggle command). */
	blockOverrides?: Record<string, boolean>;
}

/** Loaded preset with metadata. */
export interface LoadedPreset {
	/** Preset ID (filename without .json). */
	id: string;
	/** Source location. */
	source: "global" | "project";
	/** Parsed preset data. */
	data: PresetFile;
	/** Parse error if failed to load. */
	error?: string;
}

/** Macro expansion environment. */
export interface MacroEnv {
	user: string;
	char: string;
	model: string;
	cwd: string;
	date: string;
	time: string;
	lastUserMessage: string;
	lastAssistantMessage: string;
	variables: Record<string, string>;
}
