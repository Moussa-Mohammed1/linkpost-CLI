import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { PluginFactory } from "./types.js";
import type { AnalyzerPlugin } from "./types.js";
import { aiPlugin } from "./builtins/ai.js";
import { authPlugin } from "./builtins/auth.js";
import { cicdPlugin } from "./builtins/cicd.js";
import { cloudPlugin } from "./builtins/cloud.js";
import { databasePlugin } from "./builtins/database.js";
import { deploymentPlugin } from "./builtins/deployment.js";
import { dockerPlugin } from "./builtins/docker.js";
import { frameworkPlugin } from "./builtins/framework.js";
import { languagePlugin } from "./builtins/language.js";
import { ormPlugin } from "./builtins/orm.js";
import { testingPlugin } from "./builtins/testing.js";

export const BUILTIN_PLUGINS: readonly AnalyzerPlugin[] = [
  languagePlugin,
  frameworkPlugin,
  databasePlugin,
  ormPlugin,
  dockerPlugin,
  cicdPlugin,
  deploymentPlugin,
  testingPlugin,
  authPlugin,
  aiPlugin,
  cloudPlugin,
];

/** Resolve any *user-provided* plugins living under the given directories. */
export async function loadPluginsFromDirs(
  dirs: string[],
  opts: { onWarn?: (msg: string) => void } = {},
): Promise<AnalyzerPlugin[]> {
  const plugins: AnalyzerPlugin[] = [];
  for (const dir of dirs) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // directory does not exist
    }
    const files = entries
      .filter((e) => e.isFile() && /\.(mjs|js|ts|mts)$/.test(e.name))
      .map((e) => e.name);
    for (const file of files) {
      const url = pathToFileURL(join(dir, file)).href;
      try {
        const mod = await import(url);
        const candidate = mod.default ?? mod.plugin ?? mod;
        let plugin: AnalyzerPlugin | undefined;
        if (candidate && typeof candidate.detect === "function" && typeof candidate.id === "string") {
          plugin = candidate as AnalyzerPlugin;
        } else if (candidate && typeof candidate === "function") {
          const factory = candidate as PluginFactory;
          const result = await factory();
          if (result && typeof result.detect === "function" && typeof result.id === "string") {
            plugin = result;
          }
        }
        if (plugin) {
          plugins.push(plugin);
        } else {
          opts.onWarn?.(`Plugin file "${file}" did not export a valid AnalyzerPlugin; skipped.`);
        }
      } catch (err) {
        opts.onWarn?.(`Failed to load plugin "${file}": ${(err as Error).message}`);
      }
    }
  }
  return plugins;
}

export function dedupePlugins(
  builtin: readonly AnalyzerPlugin[],
  custom: readonly AnalyzerPlugin[],
): AnalyzerPlugin[] {
  const seen = new Set<string>(builtin.map((p) => p.id));
  const out = [...builtin];
  for (const plugin of custom) {
    if (seen.has(plugin.id)) {
      // replace the builtin with the custom override
      const idx = out.findIndex((p) => p.id === plugin.id);
      if (idx !== -1) out[idx] = plugin;
    } else {
      seen.add(plugin.id);
      out.push(plugin);
    }
  }
  return out;
}