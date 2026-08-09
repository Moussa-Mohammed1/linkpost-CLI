import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../src/index.js";
import { loadConfig, setConfigValue, unsetConfigValue, effectiveValue, configFilePath } from "../src/config/persist.js";
import { makeTmpProject, npmPackage, isolateConfig } from "./helpers.js";

async function capture(fn: () => Promise<number>): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const so = process.stdout.write;
  const se = process.stderr.write;
  process.stdout.write = ((c: string) => (out.push(c), true)) as typeof process.stdout.write;
  process.stderr.write = ((c: string) => (err.push(c), true)) as typeof process.stderr.write;
  try {
    const code = await fn();
    return { code, out: out.join(""), err: err.join("") };
  } finally {
    process.stdout.write = so;
    process.stderr.write = se;
  }
}

describe("persistent config", () => {
  it("persists values across process boundaries (file-backed)", async () => {
    const restore = await isolateConfig();
    try {
      delete process.env.LINKEDIN_CLIENT_ID;
      await setConfigValue("LINKEDIN_CLIENT_ID", "abc123");
      expect(effectiveValue("LINKEDIN_CLIENT_ID").value).toBe("abc123");
      expect(effectiveValue("LINKEDIN_CLIENT_ID").source).toBe("config");

      const raw = await readFile(configFilePath(), "utf8");
      expect(JSON.parse(raw)).toEqual({ LINKEDIN_CLIENT_ID: "abc123" });

      await unsetConfigValue("LINKEDIN_CLIENT_ID");
      expect(effectiveValue("LINKEDIN_CLIENT_ID").value).toBeUndefined();
    } finally {
      restore();
    }
  });

  it("gives a session env var precedence over the persisted config", async () => {
    const restore = await isolateConfig();
    try {
      await setConfigValue("LINKEDIN_VISIBILITY", "CONNECTIONS");
      expect(effectiveValue("LINKEDIN_VISIBILITY").source).toBe("config");
      process.env.LINKEDIN_VISIBILITY = "PUBLIC";
      expect(effectiveValue("LINKEDIN_VISIBILITY").value).toBe("PUBLIC");
      expect(effectiveValue("LINKEDIN_VISIBILITY").source).toBe("env");
      delete process.env.LINKEDIN_VISIBILITY;
      expect(effectiveValue("LINKEDIN_VISIBILITY").value).toBe("CONNECTIONS");
    } finally {
      delete process.env.LINKEDIN_VISIBILITY;
      restore();
    }
  });

  it("is used by the LLM provider when only persisted in config", async () => {
    const restore = await isolateConfig();
    try {
      process.env.POST_LLM_API_KEY = "";
      process.env.OPENAI_API_KEY = "";
      process.env.POST_LLM_BASE_URL = "";
      await setConfigValue("POST_LLM_API_KEY", "sk-persisted");
      await setConfigValue("POST_LLM_BASE_URL", "http://localhost:11434/v1");
      const { resolveProvider } = await import("../src/llm/provider.js");
      expect(resolveProvider()).toBeDefined();
    } finally {
      restore();
    }
  });

  it("loadConfig tolerates a corrupt config file", async () => {
    const restore = await isolateConfig();
    try {
      const { writeFile } = await import("node:fs/promises");
      const { mkdir } = await import("node:fs/promises");
      await mkdir(join(configFilePath(), ".."), { recursive: true });
      await writeFile(configFilePath(), "not json{{", "utf8");
      expect(loadConfig()).toEqual({});
    } finally {
      restore();
    }
  });
});

describe("post config command", () => {
  it("sets and lists a persisted value, then unset removes it", async () => {
    const restore = await isolateConfig();
    try {
      const set = await capture(() => runCli(["config", "set", "LINKEDIN_CLIENT_ID=abc123"]));
      expect(set.code).toBe(0);
      expect(set.out).toContain("LINKEDIN_CLIENT_ID");

      const list = await capture(() => runCli(["config"]));
      expect(list.code).toBe(0);
      expect(list.out).toContain("LINKEDIN_CLIENT_ID=abc123");

      const envs = await capture(() => runCli(["envs"]));
      expect(envs.out).toContain("LINKEDIN_CLIENT_ID=abc123 (config)");

      const unset = await capture(() => runCli(["config", "unset", "LINKEDIN_CLIENT_ID"]));
      expect(unset.code).toBe(0);

      const after = await capture(() => runCli(["config"]));
      expect(after.out).toContain("(empty");
    } finally {
      restore();
    }
  });

  it("rejects unknown variable names", async () => {
    const restore = await isolateConfig();
    try {
      const res = await capture(() => runCli(["config", "set", "NOPE=1"]));
      expect(res.code).toBe(2);
      expect(res.err).toContain("not a known variable");
    } finally {
      restore();
    }
  });

  it("rejects malformed set usage", async () => {
    const restore = await isolateConfig();
    try {
      const res = await capture(() => runCli(["config", "set"]));
      expect(res.code).toBe(2);
      expect(res.err).toContain("Usage");
    } finally {
      restore();
    }
  });

  it("publishes a post using credentials from persistent config", async () => {
    const restore = await isolateConfig();
    const proj = await makeTmpProject({ "package.json": npmPackage({ name: "x" }) });
    try {
      delete process.env.LINKEDIN_ACCESS_TOKEN;
      await setConfigValue("LINKEDIN_ACCESS_TOKEN", "dummy");
      // content.txt missing — must fail with the "not found" guardrail, not the credentials guardrail
      const { publishPost } = await import("../src/commands/publish.js");
      const result = await publishPost({ cwd: proj.root });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not found/);
    } finally {
      await proj.cleanup();
      restore();
    }
  });
});
