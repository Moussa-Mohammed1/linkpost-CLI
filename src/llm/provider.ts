export interface LlmRequest {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LlmProvider {
  readonly id: string;
  readonly model?: string;
  complete(req: LlmRequest): Promise<string>;
}

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v : undefined;
}

export const LLM_ENV = {
  apiKey: ["POST_LLM_API_KEY", "OPENAI_API_KEY"],
  baseUrl: "POST_LLM_BASE_URL",
  model: "POST_LLM_MODEL",
} as const;

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * OpenAI-compatible chat-completions provider (also works with Ollama, LM
 * Studio, OpenRouter and other OpenAI-API-compatible endpoints).
 */
export class OpenAICompatibleProvider implements LlmProvider {
  readonly id = "openai-compatible";
  readonly model: string;
  private baseUrl: string;
  private apiKey: string | undefined;

  constructor(opts: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.model = opts.model ?? DEFAULT_MODEL;
  }

  async complete(req: LlmRequest): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const body = {
      model: this.model,
      messages: [
        ...(req.system ? [{ role: "system" as const, content: req.system }] : []),
        { role: "user" as const, content: req.prompt },
      ],
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 1200,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`LLM request failed (${res.status}): ${text.slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("LLM returned no content.");
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Resolves a configured provider, or undefined when no API key is set. */
export function resolveProvider(
  overrides: { apiKey?: string; baseUrl?: string; model?: string } = {},
): LlmProvider | undefined {
  const apiKey = overrides.apiKey ?? env("POST_LLM_API_KEY") ?? env("OPENAI_API_KEY");
  if (!apiKey && !overrides.baseUrl && !env("POST_LLM_BASE_URL")) {
    // Tailscale/Ollama style local endpoints may work without a key.
    const baseUrl = overrides.baseUrl ?? env("POST_LLM_BASE_URL");
    if (!baseUrl || baseUrl.startsWith("https://api.openai.com")) return undefined;
  }
  return new OpenAICompatibleProvider({
    apiKey,
    baseUrl: overrides.baseUrl ?? env("POST_LLM_BASE_URL"),
    model: overrides.model ?? env("POST_LLM_MODEL"),
  });
}