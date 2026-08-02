import type { Detection } from "../../core/types.js";
import type { AnalyzerPlugin, PluginContext } from "../types.js";
import { detect, uniqByName } from "./util.js";

const CICD: Array<{ name: string; evidence: string; checks: ((ctx: PluginContext) => boolean)[] }> = [
  {
    name: "GitHub Actions",
    evidence: ".github/workflows",
    checks: [(c) => c.hasGlob(".github/workflows/*.yml") || c.hasGlob(".github/workflows/*.yaml")],
  },
  { name: "GitLab CI/CD", evidence: ".gitlab-ci.yml", checks: [(c) => c.hasFile(".gitlab-ci.yml")] },
  { name: "CircleCI", evidence: ".circleci/config.yml", checks: [(c) => c.hasFile(".circleci/config.yml") || c.hasFile(".circleci/config.yaml")] },
  { name: "Jenkins", evidence: "Jenkinsfile", checks: [(c) => c.hasFile("Jenkinsfile") || c.hasGlob("**/Jenkinsfile")] },
  { name: "Azure Pipelines", evidence: "azure-pipelines.yml", checks: [(c) => c.hasFile("azure-pipelines.yml") || c.hasFile("azure-pipelines.yaml")] },
  { name: "Travis CI", evidence: ".travis.yml", checks: [(c) => c.hasFile(".travis.yml")] },
  { name: "Bitbucket Pipelines", evidence: "bitbucket-pipelines.yml", checks: [(c) => c.hasFile("bitbucket-pipelines.yml")] },
  { name: "Drone CI", evidence: ".drone.yml", checks: [(c) => c.hasFile(".drone.yml")] },
  { name: "AppVeyor", evidence: "appveyor.yml", checks: [(c) => c.hasFile("appveyor.yml")] },
];

export const cicdPlugin: AnalyzerPlugin = {
  id: "builtin.cicd",
  title: "CI/CD",
  description: "Detects CI and CD configuration files.",
  detect(ctx: PluginContext): Detection[] {
    const out: Detection[] = [];
    for (const spec of CICD) {
      if (spec.checks.some((check) => check(ctx))) {
        out.push(detect(spec.name, "ci-cd", 0.9, undefined, spec.evidence));
      }
    }
    return uniqByName(out);
  },
};