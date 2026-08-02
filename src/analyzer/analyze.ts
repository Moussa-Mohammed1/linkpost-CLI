import { join } from "node:path";
import { Logger } from "../core/logger.js";
import { IgnoreRules } from "../core/ignore.js";
import { detectProjectMarkers, validateProject } from "../core/project.js";
import type { Detection, FileSnap, ModuleInfo, ProjectReport } from "../core/types.js";
import { walkRepository } from "../core/walk.js";
import { buildContext } from "../plugins/context.js";
import { BUILTIN_PLUGINS, dedupePlugins } from "../plugins/registry.js";
import type { AnalyzerPlugin } from "../plugins/types.js";
import { discoverModules } from "./modules.js";
import { summarizeModule } from "./summarizer.js";
import {
  buildInventory,
  inferArchitecture,
  inferFeatures,
  inferProjectName,
  primaryLanguages,
} from "./heuristics.js";
import {
  inferChallenges,
  inferEngineeringHighlights,
  inferPurpose,
  pickNotableFiles,
} from "./inference.js";

export interface AnalyzeOptions {
  cwd: string;
  plugins?: AnalyzerPlugin[];
  logger?: Logger;
}

/**
 * Full analysis pipeline: validate → scan → plugin detections → per-module
 * summaries → global report. Module summaries are computed first and become
 * the sole input of global inferences, keeping LLM context bounded.
 */
export async function analyzeProject(options: AnalyzeOptions): Promise<ProjectReport> {
  const logger = options.logger ?? new Logger();
  const cwd = options.cwd;

  logger.info("Validating project directory…");
  await validateProject(cwd);
  const markers = await detectProjectMarkers(cwd);
  logger.info(`Project markers: ${markers.markers.join(", ") || "none"}`);

  // --- scan tree ---
  const ignore = new IgnoreRules();
  ignore.addDefaults();
  await ignore.loadFrom(join(cwd, ".gitignore"), "");
  await ignore.loadFrom(join(cwd, ".postignore"), "");

  const files: FileSnap[] = [];
  for await (const snap of walkRepository(cwd, { ignore })) {
    files.push(snap);
  }
  logger.info(`Indexed ${files.length} files`);
  if (files.length === 0) {
    throw new Error("No source files found after applying ignore rules.");
  }

  const ctx = await buildContext({ cwd, files });

  // --- plugin detections ---
  const allPlugins = dedupePlugins(BUILTIN_PLUGINS, options.plugins ?? []);
  const detections: Detection[] = [];
  for (const plugin of allPlugins) {
    try {
      const result = await plugin.detect(ctx);
      for (const det of result) {
        if (det && typeof det.name === "string" && typeof det.category === "string") {
          detections.push(det);
        }
      }
    } catch (err) {
      logger.warn(`Plugin "${plugin.id}" failed: ${(err as Error).message}`);
    }
  }
  logger.info(`Collected ${detections.length} technology detections`);

  // --- per-module summaries ---
  const discovered = discoverModules(files);
  const modules: ModuleInfo[] = [];
  for (const module of discovered) {
    try {
      // eslint-disable-next-line no-await-in-loop
      modules.push(
        await summarizeModule({
          relPath: module.relPath,
          name: module.name,
          files: module.files,
          readText: ctx.readText,
        }),
      );
    } catch (err) {
      logger.warn(`Failed to summarize module "${module.relPath}": ${(err as Error).message}`);
    }
  }
  modules.sort((a, b) => b.estimatedLoc - a.estimatedLoc || a.relPath.localeCompare(b.relPath));

  const inventory = buildInventory(detections);
  const readCtx = { readText: ctx.readText, hasFile: ctx.hasFile, hasModule: ctx.hasModule };
  const report: ProjectReport = {
    root: cwd,
    projectName: inferProjectName(cwd, ctx.pkg),
    primaryLanguages: primaryLanguages(detections, modules),
    technologies: inventory,
    architecture: inferArchitecture(detections, modules, files),
    modules,
    businessPurpose: await inferPurpose(
      readCtx,
      modules,
      typeof ctx.pkg?.description === "string" ? ctx.pkg.description : undefined,
    ),
    features: inferFeatures(detections),
    engineeringHighlights: inferEngineeringHighlights(readCtx, files, modules),
    engineeringChallenges: inferChallenges(
      files,
      modules,
      detections.some((d) => d.category === "testing"),
    ),
    notableFiles: pickNotableFiles(files),
    generatedAt: new Date().toISOString(),
  };

  logger.info("Analysis complete");
  return report;
}