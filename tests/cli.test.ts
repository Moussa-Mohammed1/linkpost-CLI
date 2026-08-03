import { describe, expect, it } from "vitest";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../src/index.js";
import { generatePost } from "../src/commands/analyze.js";
import { publishPost } from "../src/commands/publish.js";
import { makeTmpProject, npmPackage } from "./helpers.js";

describe("runCli", () => {
  it("prints version and exits 0", async () => {
    const out: string[] = [];
    const write = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      out.push(chunk);
      return true;
    }) as typeof process.stdout.write;
    try {
      const code = await runCli(["--version"]);
      expect(code).toBe(0);
      expect(out.join("")).toMatch(/^post \d+\.\d+\.\d+/);
    } finally {
      process.stdout.write = write;
    }
  });

  it("rejects an unknown command", async () => {
    expect(await runCli(["frobnicate"])).toBe(2);
  });

  it("lists env vars as name=null when unset", async () => {
    const out: string[] = [];
    const write = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      out.push(chunk);
      return true;
    }) as typeof process.stdout.write;
    const saved = process.env.POST_LLM_MODEL;
    try {
      process.env.POST_LLM_MODEL = "test-model";
      delete process.env.OPENAI_API_KEY;
      const code = await runCli(["envs"]);
      expect(code).toBe(0);
      const text = out.join("");
      expect(text).toContain("POST_LLM_MODEL=test-model");
      expect(text).toContain("OPENAI_API_KEY=null");
      expect(text).toContain("LINKEDIN_ACCESS_TOKEN=null");
    } finally {
      process.stdout.write = write;
      if (saved === undefined) delete process.env.POST_LLM_MODEL;
      else process.env.POST_LLM_MODEL = saved;
    }
  });
});

describe("generatePost pipeline", () => {
  it("analyzes → writes linkedin-post/ with template output", async () => {
    const proj = await makeTmpProject(sampleFiles());
    try {
      const result = await generatePost({ cwd: proj.root, templateOnly: true });
      expect(result.ok).toBe(true);
      expect(result.outputDir).toBe(join(proj.root, "linkedin-post"));
      expect(result.template).toBe(true);

      const names = (await readdir(result.outputDir!)).sort();
      expect(names).toEqual(["content.txt", "images", "logs.txt", "metadata.json"].sort());

      const text = await readFile(join(result.outputDir!, "content.txt"), "utf8");
      expect(text).toContain("orderly");
      expect(text).toContain("TypeScript");
    } finally {
      await proj.cleanup();
    }
  });
});

describe("publishPost guardrails", () => {
  it("fails fast when content.txt is missing but identifies the fix", async () => {
    const proj = await makeTmpProject({ "package.json": npmPackage({ name: "x" }) });
    try {
      delete process.env.LINKEDIN_ACCESS_TOKEN;
      const result = await publishPost({ cwd: proj.root });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/not found/);
    } finally {
      await proj.cleanup();
    }
  });

  it("explains missing credentials without crashing", async () => {
    const proj = await makeTmpProject({ ...sampleFiles() });
    try {
      delete process.env.LINKEDIN_ACCESS_TOKEN;
      // generate the content bundle first
      await generatePost({ cwd: proj.root, templateOnly: true });
      const result = await publishPost({ cwd: proj.root });
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/LINKEDIN_CLIENT_ID|credentials/i);
    } finally {
      await proj.cleanup();
    }
  });
});

function sampleFiles(): Record<string, string> {
  return {
    "package.json": npmPackage({
      name: "orderly",
      description: "Manages line orders with a team API.",
      dependencies: { express: "^4.18.0", prisma: "^5.21.0" },
      devDependencies: { vitest: "^1.0.0" },
    }),
    "README.md": "Orderly handles batch order syncs and reconciles nightly.",
    "src/index.ts": "import express from 'express'; const app = express(); app.get('/api/orders', () => {}); export { app };",
    "prisma/schema.prisma": "model Order { id Int }",
    "src/orders.test.ts": "import { test, expect } from 'vitest'; test('ok', () => expect(1).toBe(1))",
  };
}