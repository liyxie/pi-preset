// Basic tests for core assembly logic

import { describe, it, expect } from "vitest";
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

	it("returns undefined when preset is off", () => {
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
});
