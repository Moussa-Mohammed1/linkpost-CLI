import { describe, expect, it } from "vitest";
import { analyzeProject } from "../src/analyzer/analyze.js";
import { validateProject } from "../src/core/project.js";
import { makeTmpProject, npmPackage } from "./helpers.js";
import type { TmpProject } from "./helpers.js";

function sampleFixtureFiles(): Record<string, string> {
  return {
    "package.json": npmPackage({
      name: "detector",
      description: "Detects road-lane events from roadside cameras and warns drivers in real time.",
      dependencies: { react: "^18.0.0", express: "^4.18.0", prisma: "^5.0.0", redis: "^4.0.0" },
      devDependencies: { vitest: "^1.0.0" },
    }),
    "README.md": "Detector ingests road cameras, runs a detection model, and streams alerts in real time.",
    "prisma/schema.prisma": "model User { id String }",
    "Dockerfile": "FROM node:20",
    "docker-compose.yml": "services:\n  api:",
    ".github/workflows/ci.yml": "name: ci",
    "src/server.ts": [
      "import express from 'express'",
      "const app = express()",
      "app.get('/api/v1/alerts', (_req, res) => res.json({ ok: true }))",
      "export { app }",
    ].join("\n"),
    "src/model/detect.ts": "export function detect(frame: string): string { return 'x' }",
    "src/stream/alert.ts": "import { createClient } from 'redis'",
    "src/stream/alert.test.ts": "import { test, expect } from 'vitest'; test('x', () => expect(1).toBe(1))",
  };
}

function makeSample(): Promise<TmpProject> {
  return makeTmpProject(sampleFixtureFiles());
}

describe("analyzeProject (integration)", () => {
  it("produces a full report for a realistic repo", async () => {
    const proj = await makeSample();
    try {
      const report = await analyzeProject({ cwd: proj.root });

      expect(report.projectName).toBe("detector");
      expect(report.primaryLanguages).toContain("TypeScript");
      expect(report.modules.length).toBeGreaterThan(0);
      expect(report.businessPurpose.length).toBeGreaterThan(10);
      expect(report.technologies.all).toContain("Redis");
      expect(report.technologies.byCategory["orm"]).toContain("Prisma");
      expect(report.engineeringHighlights.length).toBeGreaterThan(0);

      const endpointHits = report.modules.reduce(
        (acc, m) => acc + (m.summary.match(/endpoint/g)?.length ?? 0),
        0,
      );
      expect(endpointHits).toBeGreaterThan(0);
    } finally {
      await proj.cleanup();
    }
  });

  it("notes the test tooling in engineering highlights", async () => {
    const proj = await makeSample();
    try {
      const report = await analyzeProject({ cwd: proj.root });
      expect(report.engineeringHighlights.join(" ")).toMatch(/test/i);
    } finally {
      await proj.cleanup();
    }
  });

  it("validates directory boundary with a friendly error", async () => {
    const proj = await makeTmpProject({ "placeholder.txt": "x" });
    try {
      await expect(validateProject(proj.root)).rejects.toThrow(/no software project markers/i);
    } finally {
      await proj.cleanup();
    }
  });
});