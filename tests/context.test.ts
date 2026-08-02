import { describe, expect, it } from "vitest";
import { buildContext, extractDependencyTokens, normalizeModuleName } from "../src/plugins/context.js";
import { walkRepository } from "../src/core/walk.js";
import { IgnoreRules } from "../src/core/ignore.js";
import { makeTmpProject, npmPackage } from "./helpers.js";
import type { FileSnap } from "../src/core/types.js";
import type { PluginContext } from "../src/plugins/types.js";

async function makeContext(project: Awaited<ReturnType<typeof makeTmpProject>>): Promise<PluginContext> {
  const ignore = new IgnoreRules();
  ignore.addDefaults();
  const files: FileSnap[] = [];
  for await (const snap of walkRepository(project.root, { ignore })) files.push(snap);
  return buildContext({ cwd: project.root, files });
}

describe("PluginContext", () => {
  it("indexes package.json dependencies and devDependencies", async () => {
    const proj = await makeTmpProject({
      "package.json": npmPackage({
        name: "foo-app",
        dependencies: { react: "^18.0.0", express: "^18.2.0", "@nestjs/core": "^10.0.0" },
        devDependencies: { vitest: "^1.0.0", typescript: "^5.0.0" },
      }),
      "src/index.ts": "x",
    });
    try {
      const ctx = await makeContext(proj);
      expect(ctx.hasModule("react")).toBe(true);
      expect(ctx.hasModule("express")).toBe(true);
      expect(ctx.hasModule("vitest")).toBe(true);
      expect(ctx.hasModule("npm-dom")).toBe(false);
      expect(ctx.pkg?.name).toBe("foo-app");
    } finally {
      await proj.cleanup();
    }
  });

  it("supports wildcard prefix matching (@aws-sdk/*)", async () => {
    const proj = await makeTmpProject({
      "package.json": npmPackage({
        dependencies: { "@aws-sdk/client-s3": "^3.0.0", "@google-cloud/storage": "^6.0.0" },
      }),
      "index.ts": "x",
    });
    try {
      const ctx = await makeContext(proj);
      expect(ctx.hasModule("@aws-sdk/*")).toBe(true);
      expect(ctx.hasModule("@google-cloud/*")).toBe(true);
      expect(ctx.hasModule("@azure/*")).toBe(false);
    } finally {
      await proj.cleanup();
    }
  });

  it("reads requirements.txt and pyproject manifests", async () => {
    const proj = await makeTmpProject({
      "requirements.txt": "fastapi==0.100\nflask[async]\npsycopg2-binary\n",
      "main.py": "import fastapi",
    });
    try {
      const ctx = await makeContext(proj);
      expect(ctx.hasModule("fastapi")).toBe(true);
      expect(ctx.hasModule("flask")).toBe(true);
    } finally {
      await proj.cleanup();
    }
  });
});

describe("extractDependencyTokens / normalizeModuleName", () => {
  it("extracts gradle coordinates", () => {
    const toks = extractDependencyTokens("build.gradle", 'implementation "org.springframework.boot:spring-boot-starter-web"');
    expect(toks).toContain("org.springframework.boot:spring-boot-starter-web");
  });

  it("extracts bare requirements tokens", () => {
    const toks = extractDependencyTokens("requirements.txt", "fastapi==0.100\npsycopg2-binary\n");
    expect(toks).toContain("fastapi");
    expect(toks).toContain("psycopg2-binary");
  });

  it("normalizes scoped names", () => {
    expect(normalizeModuleName("@nestjs/core")).toBe("nestjs/core");
    expect(normalizeModuleName("React")).toBe("react");
  });
});