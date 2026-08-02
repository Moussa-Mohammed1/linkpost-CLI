import { describe, expect, it } from "vitest";
import { buildContext } from "../src/plugins/context.js";
import { buildInventory } from "../src/analyzer/heuristics.js";
import { walkRepository } from "../src/core/walk.js";
import { IgnoreRules } from "../src/core/ignore.js";
import { BUILTIN_PLUGINS, loadPluginsFromDirs } from "../src/plugins/registry.js";
import { makeTmpProject, npmPackage } from "./helpers.js";
import type { Detection, FileSnap } from "../src/core/types.js";
import type { PluginContext } from "../src/plugins/types.js";

async function contextOf(root: string): Promise<PluginContext> {
  const ignore = new IgnoreRules();
  ignore.addDefaults();
  const files: FileSnap[] = [];
  for await (const snap of walkRepository(root, { ignore })) files.push(snap);
  return buildContext({ cwd: root, files });
}

async function runBuiltins(ctx: PluginContext): Promise<Detection[]> {
  const detections: Detection[] = [];
  for (const plugin of BUILTIN_PLUGINS) {
    detections.push(...(await plugin.detect(ctx)));
  }
  return detections;
}

describe("analyzer plugins", () => {
  it("detects a realistic JS stack end-to-end", async () => {
    const proj = await makeTmpProject({
      "package.json": npmPackage({
        name: "shop",
        dependencies: {
          react: "^18.0.0",
          next: "14.1.0",
          express: "^4.18.0",
          prisma: "^5.0.0",
          redis: "^4.0.0",
          openai: "^4.0.0",
          passport: "^0.7.0",
          "@nestjs/core": "^10.0.0",
        },
        devDependencies: { vitest: "^1.0.0", "@playwright/test": "^1.40.0" },
      }),
      "prisma/schema.prisma": "model User { id String }",
      "Dockerfile": "FROM node:20",
      "docker-compose.yml": "services:\n  web:",
      ".github/workflows/ci.yml": "name: ci",
      "pages/index.tsx": "export function Home(){ return <h1>home</h1> }",
      "server/router.ts": "import { Router } from 'express'; router.get('/api', async () => {})",
      "server/security.ts": "passport.initialize()",
      "server/ai.ts": "import OpenAI from 'openai'",
      "api.test.ts": "import { expect, test } from 'vitest'",
    });
    try {
      const ctx = await contextOf(proj.root);
      const detections = await runBuiltins(ctx);
      const inventory = buildInventory(detections);

      expect(inventory.byCategory["frontend-framework"]).toContain("React");
      expect(inventory.byCategory["frontend-framework"]).toContain("Next.js");
      expect(inventory.byCategory["backend-framework"]).toContain("Express");
      expect(inventory.byCategory["backend-framework"]).toContain("NestJS");
      expect(inventory.byCategory["orm"]).toContain("Prisma");
      expect(inventory.byCategory["database"]).toContain("Redis");
      expect(inventory.byCategory["ai"]).toContain("OpenAI SDK");
      expect(inventory.byCategory["authentication"]).toContain("Passport.js");
      expect(inventory.byCategory["docker"]).toContain("Dockerfile");
      expect(inventory.byCategory["docker"]).toContain("Docker Compose");
      expect(inventory.byCategory["ci-cd"]).toContain("GitHub Actions");
      expect(inventory.byCategory["testing"]).toContain("Vitest");
    } finally {
      await proj.cleanup();
    }
  });

  it("detects languages from extensions", async () => {
    const proj = await makeTmpProject({
      "a.go": "package main",
      "b.go": "package main",
      "c.py": "import os",
    });
    try {
      const ctx = await contextOf(proj.root);
      const dets = await runBuiltins(ctx);
      const names = dets.filter((d) => d.category === "language").map((d) => d.name);
      expect(names).toContain("Go");
      expect(names).toContain("Python");
    } finally {
      await proj.cleanup();
    }
  });
});

describe("custom plugin loading", () => {
  it("loads a custom plugin from disk", async () => {
    const proj = await makeTmpProject({
      "plugin-dir/marko.mjs": [
        "export default {",
        '  id: "custom.marko",',
        '  title: "Marko",',
        "  detect: async (ctx) => [{",
        '    name: "Marko", category: "frontend-framework", confidence: 1,',
        '    evidence: ctx.hasFile("x.marko") ? "x.marko" : undefined',
        "  }],",
        "};",
      ].join("\n"),
    });
    try {
      const plugins = await loadPluginsFromDirs([`${proj.root}/plugin-dir`]);
      expect(plugins).toHaveLength(1);
      expect(plugins[0]?.id).toBe("custom.marko");
    } finally {
      await proj.cleanup();
    }
  });
});