// TypeBox schema for preset files - trust boundary validation

import { Type, type Static } from "typebox";

const PlacementSchema = Type.Union([
	Type.Object({ type: Type.Literal("relative") }),
	Type.Object({
		type: Type.Literal("depth"),
		depth: Type.Number({ minimum: 0 }),
		order: Type.Optional(Type.Number()),
	}),
]);

const TriggerSchema = Type.Union([Type.Literal("user-turn"), Type.Literal("tool-turn")]);

const TextBlockSchema = Type.Object({
	kind: Type.Literal("text"),
	id: Type.String({ minLength: 1 }),
	name: Type.Optional(Type.String()),
	enabled: Type.Boolean(),
	role: Type.Union([Type.Literal("system"), Type.Literal("user"), Type.Literal("assistant")]),
	content: Type.String(),
	position: PlacementSchema,
	triggers: Type.Optional(Type.Array(TriggerSchema)),
});

const MarkerBlockSchema = Type.Object({
	kind: Type.Literal("marker"),
	id: Type.String({ minLength: 1 }),
	name: Type.Optional(Type.String()),
	enabled: Type.Boolean(),
	marker: Type.Union([Type.Literal("chatHistory"), Type.Literal("piPrompt"), Type.Literal("section")]),
	section: Type.Optional(Type.String()),
	role: Type.Optional(Type.Union([Type.Literal("system"), Type.Literal("user"), Type.Literal("assistant")])),
	triggers: Type.Optional(Type.Array(TriggerSchema)),
});

const PresetBlockSchema = Type.Union([TextBlockSchema, MarkerBlockSchema]);

const SamplingConfigSchema = Type.Object({
	temperature: Type.Optional(Type.Number()),
	top_p: Type.Optional(Type.Number()),
	top_k: Type.Optional(Type.Number()),
	frequency_penalty: Type.Optional(Type.Number()),
	presence_penalty: Type.Optional(Type.Number()),
});

export const PresetFileSchema = Type.Object({
	version: Type.Literal(1),
	name: Type.Optional(Type.String()),
	description: Type.Optional(Type.String()),
	blocks: Type.Array(PresetBlockSchema),
	variables: Type.Optional(Type.Record(Type.String(), Type.String())),
	sampling: Type.Optional(SamplingConfigSchema),
	squash: Type.Optional(
		Type.Object({
			enabled: Type.Boolean(),
			separator: Type.Optional(Type.String()),
		}),
	),
	midSystemFallback: Type.Optional(Type.Union([Type.Literal("user"), Type.Literal("hoist")])),
	keepTools: Type.Optional(Type.Boolean()),
});

export type PresetFileSchemaType = Static<typeof PresetFileSchema>;

/** Validate preset file data. Returns error message if invalid, undefined if valid. */
export function validatePresetFile(data: unknown): string | undefined {
	// TypeBox doesn't provide built-in validation, we need to implement basic checks
	if (typeof data !== "object" || data === null) {
		return "Preset file must be an object";
	}

	const obj = data as Record<string, unknown>;

	if (obj.version !== 1) {
		return "Preset version must be 1";
	}

	if (!Array.isArray(obj.blocks)) {
		return "Preset blocks must be an array";
	}

	// Validate blocks
	for (let i = 0; i < obj.blocks.length; i++) {
		const block = obj.blocks[i];
		if (typeof block !== "object" || block === null) {
			return `Block ${i} must be an object`;
		}

		const b = block as Record<string, unknown>;
		if (b.kind !== "text" && b.kind !== "marker") {
			return `Block ${i} has invalid kind: ${b.kind}`;
		}

		if (typeof b.id !== "string" || b.id.length === 0) {
			return `Block ${i} must have non-empty id`;
		}

		if (typeof b.enabled !== "boolean") {
			return `Block ${i} must have boolean enabled field`;
		}

		if (b.kind === "text") {
			if (!["system", "user", "assistant"].includes(b.role as string)) {
				return `Block ${i} has invalid role: ${b.role}`;
			}
			if (typeof b.content !== "string") {
				return `Block ${i} must have string content`;
			}
			if (!b.position || typeof b.position !== "object") {
				return `Block ${i} must have position object`;
			}
		}

		if (b.kind === "marker") {
			if (!["chatHistory", "piPrompt", "section"].includes(b.marker as string)) {
				return `Block ${i} has invalid marker: ${b.marker}`;
			}
		}
	}

	return undefined;
}
