import type { Detection } from "../../core/types.js";
import type { AnalyzerPlugin, PluginContext } from "../types.js";
import { detect } from "./util.js";

export const dockerPlugin: AnalyzerPlugin = {
  id: "builtin.docker",
  title: "Docker",
  description: "Detects containerization, Compose files and Docker-based workflows.",
  async detect(ctx: PluginContext): Promise<Detection[]> {
    const out: Detection[] = [];

    const hasDockerfile = ctx.hasFile("Dockerfile") || ctx.hasFile("Containerfile");
    const hasCompose =
      ctx.hasFile("docker-compose.yml") ||
      ctx.hasFile("docker-compose.yaml") ||
      ctx.hasFile("compose.yaml") ||
      ctx.hasFile("compose.yml");
    const hasDevcontainer =
      ctx.hasFile(".devcontainer/devcontainer.json") ||
      ctx.hasGlob(".devcontainer/**");

    if (hasDockerfile) {
      const text = await ctx.readText("Dockerfile", 8192);
      out.push(
        detect("Dockerfile", "docker", 0.95, undefined, "Dockerfile" + (text.includes(" AS ") ? " (multi-stage)" : "")),
      );
    }
    if (hasCompose) {
      out.push(
        detect("Docker Compose", "docker", 0.93, "multi-container orchestration", "docker-compose.yml"),
      );
    }
    if (hasDevcontainer) {
      out.push(detect("Dev Container", "docker", 0.75, "reproducible dev environment", ".devcontainer"));
    }
    return out;
  },
};