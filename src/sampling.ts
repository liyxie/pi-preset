// Sampling parameter injection per provider API

export interface SamplingConfig {
	temperature?: number;
	top_p?: number;
	top_k?: number;
	frequency_penalty?: number;
	presence_penalty?: number;
}

/**
 * Apply sampling config to provider request payload.
 * Returns modified payload or undefined if no changes needed.
 */
export function applySampling(
	payload: Record<string, any>,
	api: string,
	sampling: SamplingConfig,
): { payload: Record<string, any> } | undefined {
	const modified = { ...payload };
	let changed = false;

	switch (api) {
		case "openai-completions": {
			// OpenAI Chat Completions API - all fields at top level
			if (sampling.temperature !== undefined) {
				modified.temperature = sampling.temperature;
				changed = true;
			}
			if (sampling.top_p !== undefined) {
				modified.top_p = sampling.top_p;
				changed = true;
			}
			if (sampling.top_k !== undefined) {
				modified.top_k = sampling.top_k;
				changed = true;
			}
			if (sampling.frequency_penalty !== undefined) {
				modified.frequency_penalty = sampling.frequency_penalty;
				changed = true;
			}
			if (sampling.presence_penalty !== undefined) {
				modified.presence_penalty = sampling.presence_penalty;
				changed = true;
			}
			break;
		}

		case "openai-responses":
		case "azure-openai-responses": {
			// OpenAI Responses API - limited fields
			if (sampling.temperature !== undefined) {
				modified.temperature = sampling.temperature;
				changed = true;
			}
			if (sampling.top_p !== undefined) {
				modified.top_p = sampling.top_p;
				changed = true;
			}
			break;
		}

		case "anthropic-messages": {
			// Anthropic Messages API - don't set temperature if thinking is enabled
			if (sampling.temperature !== undefined && !payload.thinking) {
				modified.temperature = sampling.temperature;
				changed = true;
			}
			if (sampling.top_p !== undefined) {
				modified.top_p = sampling.top_p;
				changed = true;
			}
			if (sampling.top_k !== undefined) {
				modified.top_k = sampling.top_k;
				changed = true;
			}
			break;
		}

		case "google-generative-ai":
		case "google-vertex": {
			// Google APIs - parameters go in config object
			if (!modified.config) {
				modified.config = {};
			}

			if (sampling.temperature !== undefined) {
				modified.config.temperature = sampling.temperature;
				changed = true;
			}
			if (sampling.top_p !== undefined) {
				modified.config.topP = sampling.top_p;
				changed = true;
			}
			if (sampling.top_k !== undefined) {
				modified.config.topK = sampling.top_k;
				changed = true;
			}
			if (sampling.frequency_penalty !== undefined) {
				modified.config.frequencyPenalty = sampling.frequency_penalty;
				changed = true;
			}
			if (sampling.presence_penalty !== undefined) {
				modified.config.presencePenalty = sampling.presence_penalty;
				changed = true;
			}
			break;
		}

		default:
			// Unknown API - no changes
			return undefined;
	}

	return changed ? { payload: modified } : undefined;
}

/** Check if API supports sampling parameter overrides. */
export function supportsSampling(api: string): boolean {
	return [
		"openai-completions",
		"openai-responses",
		"azure-openai-responses",
		"anthropic-messages",
		"google-generative-ai",
		"google-vertex",
	].includes(api);
}
