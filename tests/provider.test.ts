import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { OpenAICompatibleProvider, resolveProvider } from "../src/llm/provider.js";

interface RecordedRequest {
  url: string;
  headers: Record<string, string | undefined>;
  body: unknown;
}

const servers: Server[] = [];
let lastRequest: RecordedRequest | undefined;

async function startMockServer(deliver: () => { status: number; json?: unknown; text?: string }): Promise<string> {
  const srv = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      lastRequest = {
        url: req.url ?? "",
        headers: req.headers as Record<string, string | undefined>,
        body: raw ? JSON.parse(raw) : undefined,
      };
      const out = deliver();
      res.writeHead(out.status, { "Content-Type": "application/json" });
      res.end(out.text ? out.text : JSON.stringify(out.body));
    });
  });
  servers.push(srv);
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const addr = srv.address();
  if (!addr || typeof addr === "string") throw new Error("no port");
  return `http://127.0.0.1:${addr.port}/v1`;
}

function send(content: string) {
  return {
    status: 200,
    body: { choices: [{ message: { content } }] },
  };
}

beforeEach(() => {
  lastRequest = undefined;
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

describe("resolveProvider", () => {
  const saved = {
    key: process.env.POST_LLM_API_KEY,
    url: process.env.POST_LLM_BASE_URL,
    openai: process.env.OPENAI_API_KEY,
  };
  afterEach(() => {
    process.env.POST_LLM_API_KEY = saved.key;
    process.env.POST_LLM_BASE_URL = saved.url;
    process.env.OPENAI_API_KEY = saved.openai;
  });

  it("returns undefined without any key or custom base URL", () => {
    process.env.POST_LLM_API_KEY = "";
    process.env.OPENAI_API_KEY = "";
    process.env.POST_LLM_BASE_URL = "";
    expect(resolveProvider()).toBeUndefined();
  });

  it("allows a local (non-OpenAI) endpoint without a key", () => {
    process.env.POST_LLM_API_KEY = "";
    process.env.POST_LLM_BASE_URL = "http://localhost:11434/v1";
    const p = resolveProvider();
    expect(p).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it("uses POST_LLM_API_KEY over OPENAI_API_KEY", () => {
    const p = resolveProvider({ apiKey: "primary" });
    expect(p).toBeInstanceOf(OpenAICompatibleProvider);
    expect(p!.model).toBe("gpt-4o-mini");
  });
});

describe("OpenAICompatibleProvider", () => {
  it("posts the right shape and returns the assistant text", async () => {
    const base = await startMockServer(() => send("Building in public!"));

    const provider = new OpenAICompatibleProvider({
      apiKey: "sk-test",
      baseUrl: base,
      model: "test-model",
    });

    const out = await provider.complete({
      system: "You are a LinkedIn copywriter.",
      prompt: "Write a post.",
      maxTokens: 500,
      temperature: 0,
    });

    expect(out).toBe("Building in public!");
    expect(lastRequest).toBeDefined();
    expect(lastRequest!.url).toBe("/v1/chat/completions");
    expect(lastRequest!.headers.authorization).toBe("Bearer sk-test");
    expect(lastRequest!.body).toMatchObject({
      model: "test-model",
      max_tokens: 500,
      temperature: 0,
      messages: [
        { role: "system", content: "You are a LinkedIn copywriter." },
        { role: "user", content: "Write a post." },
      ],
    });
  });

  it("omits the system message when none is given", async () => {
    const base = await startMockServer(() => send("ok"));
    const provider = new OpenAICompatibleProvider({ apiKey: "k", baseUrl: base });

    await provider.complete({ prompt: "hi" });
    expect(lastRequest!.body.messages).toHaveLength(1);
    expect(lastRequest!.body.messages[0].role).toBe("user");
  });

  it("throws on non-200 responses", async () => {
    const base = await startMockServer(() => ({ status: 401, body: { error: { message: "no" } } }));
    const provider = new OpenAICompatibleProvider({ apiKey: "bad", baseUrl: base });

    await expect(provider.complete({ prompt: "hi" })).rejects.toThrow(/401/);
  });

  it("throws when the response has no content", async () => {
    const base = await startMockServer(() => ({ status: 200, body: { choices: [] } }));
    const provider = new OpenAICompatibleProvider({ apiKey: "k", baseUrl: base });

    await expect(provider.complete({ prompt: "hi" })).rejects.toThrow(/no content/);
  });
});