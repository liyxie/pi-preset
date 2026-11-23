import { describe, expect, it } from "vitest";
import { applySampling } from "../src/sampling.ts";

describe("sampling request payload", () => {
	it.each(["openai-completions", "anthropic-messages"])(
		"keeps messages at the top level for %s",
		(api) => {
			const payload = {
				model: "test-model",
				messages: [{ role: "user", content: "hello" }],
				tools: [{ name: "test-tool" }],
				stream: true,
				temperature: 1,
			};

			// Pi sends the hook's return value directly as the JSON body.
			const result = applySampling(payload, api, { temperature: 0.7, top_p: 0.9 });
			const body = JSON.parse(JSON.stringify(result));

			expect(body.messages).toEqual(payload.messages);
			expect(body).toEqual({ ...payload, temperature: 0.7, top_p: 0.9 });
			expect(body).not.toHaveProperty("payload");
			expect(payload.temperature).toBe(1);
		},
	);

	it.each(["openai-responses", "azure-openai-responses"])(
		"preserves the input field for %s",
		(api) => {
			const payload = { model: "test-model", input: "hello", stream: true };
			expect(applySampling(payload, api, { temperature: 0.7 })).toEqual({
				...payload,
				temperature: 0.7,
			});
		},
	);

	it.each(["google-generative-ai", "google-vertex"])(
		"preserves contents and config for %s",
		(api) => {
			const payload = {
				model: "test-model",
				contents: [{ role: "user", parts: [{ text: "hello" }] }],
				config: { maxOutputTokens: 1024 },
			};
			expect(applySampling(payload, api, { temperature: 0.7, top_p: 0.9 })).toEqual({
				...payload,
				config: { maxOutputTokens: 1024, temperature: 0.7, topP: 0.9 },
			});
		},
	);

	it("keeps the original request when no supported override is present", () => {
		const payload = { messages: [{ role: "user", content: "hello" }] };
		expect(applySampling(payload, "openai-completions", {})).toBeUndefined();
		expect(applySampling(payload, "unknown-api", { temperature: 0.7 })).toBeUndefined();
		expect(applySampling(payload, "openai-responses", { top_k: 40 })).toBeUndefined();
	});

	it("preserves Anthropic thinking without adding temperature", () => {
		const payload = {
			messages: [{ role: "user", content: "hello" }],
			thinking: { type: "enabled", budget_tokens: 1024 },
		};
		expect(applySampling(payload, "anthropic-messages", { temperature: 0.7 })).toBeUndefined();
		expect(applySampling(payload, "anthropic-messages", { temperature: 0.7, top_k: 40 })).toEqual({
			...payload,
			top_k: 40,
		});
	});
});
