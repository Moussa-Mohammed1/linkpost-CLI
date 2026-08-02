import type { Detection } from "../../core/types.js";
import type { AnalyzerPlugin, PluginContext } from "../types.js";
import { detect, uniqByName } from "./util.js";

const DEPLOY_TOOLS: Array<{ name: string; evidence: string; checks: ((ctx: PluginContext) => boolean)[]; confidence?: number }> = [
  {
    name: "npm",
    evidence: "package-lock.json",
    checks: [(c) => c.hasFile("package-lock.json") || c.hasModule("npm")],
  },
  {
    name: "pnpm",
    evidence: "pnpm-lock.yaml",
    checks: [(c) => c.hasFile("pnpm-lock.yaml") || c.hasModule("pnpm")],
    confidence: 0.95,
  },
  {
    name: "yarn",
    evidence: "yarn.lock",
    checks: [(c) => c.hasFile("yarn.lock")],
  },
  {
    name: "Maven",
    evidence: "pom.xml",
    checks: [(c) => c.hasFile("pom.xml")],
    confidence: 0.95,
  },
  {
    name: "Gradle",
    evidence: "build.gradle",
    checks: [(c) => c.hasFile("build.gradle") || c.hasFile("build.gradle.kts") || c.hasFile("gradlew")],
    confidence: 0.95,
  },
  {
    name: "pip",
    evidence: "requirements.txt",
    checks: [(c) => c.hasFile("requirements.txt")],
  },
  {
    name: "poetry",
    evidence: "pyproject.toml",
    checks: [(c) => c.hasFile("poetry.lock") || c.hasGlob("pyproject.toml")],
    confidence: 0.8,
  },
  {
    name: "cargo",
    evidence: "Cargo.toml",
    checks: [(c) => c.hasFile("Cargo.toml") || c.hasFile("Cargo.lock")],
  },
  {
    name: "Bundler",
    evidence: "Gemfile",
    checks: [(c) => c.hasFile("Gemfile")],
  },
  {
    name: "Composer",
    evidence: "composer.json",
    checks: [(c) => c.hasFile("composer.json")],
  },
  {
    name: "Make",
    evidence: "Makefile",
    checks: [(c) => c.hasFile("Makefile")],
  },
  {
    name: "CMake",
    evidence: "CMakeLists.txt",
    checks: [(c) => c.hasFile("CMakeLists.txt")],
  },
  {
    name: "pnpm workspaces",
    evidence: "pnpm-workspace.yaml",
    checks: [(c) => c.hasFile("pnpm-workspace.yaml")],
    confidence: 0.9,
  },
];

export const deploymentPlugin: AnalyzerPlugin = {
  id: "builtin.deployment",
  title: "Build & Deployment Tools",
  description: "Detects package managers, build systems and deployment tooling.",
  detect(ctx: PluginContext): Detection[] {
    const out: Detection[] = [];
    for (const tool of DEPLOY_TOOLS) {
      if (tool.checks.some((check) => check(ctx))) {
        out.push(detect(tool.name, "deployment", tool.confidence ?? 0.85, undefined, tool.evidence));
      }
    }
    return uniqByName(out);
  },
};