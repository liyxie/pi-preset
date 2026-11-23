// Basic tests for core assembly logic

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { assemble } from "../src/assemble.ts";
import type { PresetFile, MacroEnv } from "../src/types.ts";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

describe("assemble", () => {
	const mockMacros: MacroEnv = {
		user: "testuser",
		char: "testchar",
		model: "claude-test",
		cwd: "/test",
		date: "2024-01-01",
		time: "12:00:00",
		lastUserMessage: "hello",
		lastAssistantMessage: "hi",
		variables: {},
	};

	it("keeps a leading system message for an empty preset", () => {
		const preset: PresetFile = {
			version: 1,
			blocks: [],
		};

		const messages: AgentMessage[] = [
			{ role: "system", content: "test", timestamp: 0 },
			{ role: "user", content: "hello", timestamp: 1 },
		];

		const result = assemble({
			preset,
			messages,
			midConvoSystem: false,
			macros: mockMacros,
		});

		// Should at least return head system message
		expect(result.length).toBeGreaterThan(0);
		expect(result[0]?.role).toBe("system");
	});

	it("preserves history when no chatHistory marker", () => {
		const preset: PresetFile = {
			version: 1,
			blocks: [
				{
					kind: "text",
					id: "test",
					enabled: true,
					role: "system",
					content: "Custom prompt",
					position: { type: "relative" },
				},
			],
		};

		const messages: AgentMessage[] = [
			{ role: "system", content: "original", timestamp: 0 },
			{ role: "user", content: "hello", timestamp: 1 },
			{
				role: "assistant",
				content: [{ type: "text", text: "hi" }],
				api: "anthropic-messages",
				provider: "anthropic",
				model: "claude-3",
				usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 },
				stopReason: "stop",
				timestamp: 2,
			},
		];

		const result = assemble({
			preset,
			messages,
			midConvoSystem: false,
			macros: mockMacros,
		});

		// Should have: head + history messages
		expect(result.length).toBeGreaterThanOrEqual(3);
		expect(result[0]?.role).toBe("system");
		expect(result.some((m) => m.role === "user")).toBe(true);
		expect(result.some((m) => m.role === "assistant")).toBe(true);
	});

	it("expands macros in text blocks", () => {
		const preset: PresetFile = {
			version: 1,
			blocks: [
				{
					kind: "text",
					id: "test",
					enabled: true,
					role: "system",
					content: "User: {{user}}, Model: {{model}}",
					position: { type: "relative" },
				},
			],
		};

		const messages: AgentMessage[] = [
			{ role: "system", content: "original", timestamp: 0 },
		];

		const result = assemble({
			preset,
			messages,
			midConvoSystem: false,
			macros: mockMacros,
		});

		const headContent = result[0]?.role === "system" ? result[0].content : "";
		expect(headContent).toContain("testuser");
		expect(headContent).toContain("claude-test");
	});

	it("filters blocks by trigger", () => {
		const preset: PresetFile = {
			version: 1,
			blocks: [
				{
					kind: "text",
					id: "user-only",
					enabled: true,
					role: "system",
					content: "user turn",
					position: { type: "relative" },
					triggers: ["user-turn"],
				},
				{
					kind: "text",
					id: "tool-only",
					enabled: true,
					role: "system",
					content: "tool turn",
					position: { type: "relative" },
					triggers: ["tool-turn"],
				},
			],
		};

		const messagesUserTurn: AgentMessage[] = [
			{ role: "system", content: "original", timestamp: 0 },
			{ role: "user", content: "hello", timestamp: 1 },
		];

		const result = assemble({
			preset,
			messages: messagesUserTurn,
			midConvoSystem: false,
			macros: mockMacros,
		});

		const headContent = result[0]?.role === "system" ? result[0].content : "";
		expect(headContent).toContain("user turn");
		expect(headContent).not.toContain("tool turn");
	});

	it("replaces the native prompt with exactly the super preset messages", () => {
		const preset = JSON.parse(readFileSync(new URL("../presets/super.json", import.meta.url), "utf8")) as PresetFile;
		const messages: AgentMessage[] = [
			{ role: "system", content: "Native pi prompt", sections: { skills: "Native skills" }, timestamp: 0 },
			{ role: "user", content: "hello", timestamp: 1 },
		];
		const result = assemble({ preset, messages, midConvoSystem: true, macros: mockMacros });
		expect(result.map((m) => m.role)).toEqual(["system", "user", "system"]);
		expect(result.map((m) => m.content)).toEqual([
			"你是 super 助手，会做如何事", "hello", "[提醒：先给结论，再给理由。]",
		]);
		expect(JSON.stringify(result)).not.toContain("Native");
		expect(messages[0].content).toBe("Native pi prompt");

	});

	it("supports assistant blocks at depth zero", () => {
		const preset: PresetFile = {
			version: 1,
			blocks: [
				{ kind: "text", id: "head", enabled: true, role: "system", content: "head", position: { type: "relative" } },
				{ kind: "text", id: "assistant", enabled: true, role: "assistant", content: "acknowledged", position: { type: "depth", depth: 0 } },
			],
		};
		const result = assemble({
			preset,
			messages: [{ role: "system", content: "native", timestamp: 0 }, { role: "user", content: "hello", timestamp: 1 }],
			midConvoSystem: true,
			macros: mockMacros,
		});
		expect(result.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
		expect(result[2].content).toEqual([{ type: "text", text: "acknowledged" }]);
	});

	it.each(["system", "user", "assistant"] as const)("places a relative %s block after chatHistory", (role) => {
		const preset: PresetFile = {
			version: 1,
			blocks: [
				{ kind: "text", id: "head", enabled: true, role: "system", content: "head", position: { type: "relative" } },
				{ kind: "marker", id: "history", enabled: true, marker: "chatHistory" },
				{ kind: "text", id: "tail", enabled: true, role, content: "tail", position: { type: "relative" } },
			],
		};
		const result = assemble({
			preset,
			messages: [{ role: "system", content: "native", timestamp: 0 }, { role: "user", content: "hello", timestamp: 1 }],
			midConvoSystem: true,
			macros: mockMacros,
		});
		expect(result.map((m) => m.role)).toEqual(["system", "user", role]);
		expect(result[0].content).toBe("head");
		expect(result[2]).toHaveProperty("timestamp", 0);
		expect(result[2].content).toEqual(role === "assistant" ? [{ type: "text", text: "tail" }] : "tail");
	});

	it("demotes a trailing system block when the model does not support it", () => {
		const preset = JSON.parse(readFileSync(new URL("../presets/super.json", import.meta.url), "utf8")) as PresetFile;
		const result = assemble({
			preset,
			messages: [{ role: "system", content: "native", timestamp: 0 }, { role: "user", content: "hello", timestamp: 1 }],
			midConvoSystem: false,
			macros: mockMacros,
		});
		expect(result.map((m) => m.role)).toEqual(["system", "user", "user"]);
	});

	it("includes native prompt text only when a piPrompt marker is enabled", () => {
		const preset: PresetFile = {
			version: 1,
			blocks: [{ kind: "marker", id: "pi", enabled: true, marker: "piPrompt" }],
		};
		const result = assemble({
			preset,
			messages: [{ role: "system", content: "native", sections: { skills: "skills" }, timestamp: 0 }],
			midConvoSystem: true,
			macros: mockMacros,
		});
		expect(result[0].content).toBe("native\n\nskills");
	});

	it("does not inject super's user-turn reminder after tool results", () => {
		const preset = JSON.parse(readFileSync(new URL("../presets/super.json", import.meta.url), "utf8")) as PresetFile;
		const result = assemble({
			preset,
			messages: [
				{ role: "system", content: "native", timestamp: 0 },
				{ role: "toolResult", toolCallId: "call-1", toolName: "read", content: [{ type: "text", text: "done" }], isError: false, timestamp: 1 },
			],
			midConvoSystem: true,
			macros: mockMacros,
		});
		expect(result.map((m) => m.role)).toEqual(["system", "toolResult"]);
	});
});
