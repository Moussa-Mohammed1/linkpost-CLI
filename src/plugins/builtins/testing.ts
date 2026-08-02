import type { Detection } from "../../core/types.js";
import type { AnalyzerPlugin, PluginContext } from "../types.js";
import { detect, uniqByName } from "./util.js";

const TEST_STACKS: Array<{ name: string; modules?: string[]; files?: string[]; confidence?: number }> = [
  { name: "Jest", modules: ["jest", "@jest/globals", "ts-jest"], confidence: 0.95 },
  { name: "Vitest", modules: ["vitest"], confidence: 0.95 },
  { name: "Mocha", modules: ["mocha"], confidence: 0.9 },
  { name: "Jasmine", modules: ["jasmine"], confidence: 0.8 },
  { name: "Playwright", modules: ["@playwright/test", "playwright"], files: ["playwright.config.ts", "playwright.config.js"], confidence: 0.93 },
  { name: "Cypress", modules: ["cypress"], files: ["cypress.config.ts"], confidence: 0.93 },
  { name: "Puppeteer", modules: ["puppeteer"], confidence: 0.8 },
  { name: "Testing Library", modules: ["@testing-library/react", "@testing-library/jest-dom", "@testing-library/user-event"], confidence: 0.85 },
  { name: "Pytest", modules: ["pytest"], files: ["pytest.ini"], confidence: 0.93 },
  { name: "RSpec", modules: ["rspec"], files: [".rspec"], confidence: 0.9 },
  { name: "JUnit 5", modules: ["org.junit.jupiter"], confidence: 0.85 },
  { name: "TestNG", modules: ["org.testng"], confidence: 0.8 },
  { name: "PHPUnit", modules: ["phpunit/phpunit"], files: ["phpunit.xml"], confidence: 0.9 },
  { name: "Ginkgo", modules: ["github.com/onsi/ginkgo"], confidence: 0.85 },
  { name: "xUnit .NET", modules: ["xunit"], confidence: 0.85 },
  { name: "NUnit", modules: ["nunit"], confidence: 0.8 },
  { name: "Detox", modules: ["detox"], confidence: 0.7 },
];

function isTestPath(rel: string): boolean {
  const base = rel.toLowerCase();
  const fileName = base.split("/").pop() ?? "";
  return /(\.test\.|\.spec\.|_test\.|-test\.|\.tests\.)/.test(base) || /(^|\/)tests?\//.test(base) && /\.\w+$/.test(fileName);
}

export const testingPlugin: AnalyzerPlugin = {
  id: "builtin.testing",
  title: "Testing Framework",
  description: "Detects test frameworks and coverage tooling.",
  detect(ctx: PluginContext): Detection[] {
    const out: Detection[] = [];
    const testFiles = ctx.files.filter((f) => isTestPath(f.relPath));
    if (testFiles.length === 0) return out;

    for (const stack of TEST_STACKS) {
      const byModule = stack.modules?.some((m) => ctx.hasModule(m)) ?? false;
      const byFile = stack.files?.some((f) => ctx.hasFile(f)) ?? false;
      if (byModule || byFile) {
        out.push(
          detect(
            stack.name,
            "testing",
            stack.confidence ?? 0.85,
            undefined,
            stack.modules?.find((m) => ctx.hasModule(m)) ?? stack.files?.[0],
          ),
        );
      }
    }

    // Language-native test runners (no external framework needed).
    const goTestCount = ctx.files.filter(
      (f) => f.relPath.endsWith("_test.go") || /test_memory\.go$/.test(f.relPath),
    ).length;
    if (ctx.hasExtension("go") && goTestCount > 0) {
      out.push(detect("go test", "testing", 0.8, "built-in", "_test.go"));
    }
    const pyTestCount = ctx.files.filter(
      (f) => /(^|\/)test[_.\w-]*\.py$/.test(f.relPath) || /tests?\//.test(f.relPath),
    ).length;
    if (ctx.hasExtension("py") && pyTestCount > 0 && !out.some((d) => d.name === "Pytest")) {
      out.push(detect("pytest", "testing", 0.6, "common Python test runner", "tests/"));
    }

    // Coverage tooling.
    if (
      ctx.hasModule("nyc") ||
      ctx.hasModule("istanbul") ||
      ctx.hasFile("coverage/lcov.info") ||
      ctx.hasFile("coverage.xml") ||
      ctx.hasFile(".coveragerc")
    ) {
      out.push(detect("Coverage", "testing", 0.8, "coverage reporting", "coverage"));
    }

    return uniqByName(out);
  },
};