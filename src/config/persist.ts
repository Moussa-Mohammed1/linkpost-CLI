import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";

export interface PostConfig {
  [name: string]: string;
}

export function configDir(): string {
  return process.env.POST_CONFIG_DIR?.trim() || join(homedir(), ".post");
}

export function configFilePath(): string {
  return join(configDir(), "config.json");
}

/** Loads the persistent config (~/.post/config.json by default). */
export function loadConfig(): PostConfig {
  try {
    const raw = readFileSync(configFilePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as PostConfig)
      : {};
  } catch {
    return {};
  }
}

export async function saveConfig(config: PostConfig): Promise<void> {
  await mkdir(configDir(), { recursive: true });
  await writeFile(configFilePath(), JSON.stringify(config, null, 2) + "\n", "utf8");
}

export async function setConfigValue(name: string, value: string): Promise<PostConfig> {
  const config = loadConfig();
  config[name] = value;
  await saveConfig(config);
  return config;
}

export async function unsetConfigValue(name: string): Promise<PostConfig> {
  const config = loadConfig();
  delete config[name];
  await saveConfig(config);
  return config;
}

export type ConfigSource = "env" | "config";

/**
 * Effective value for a variable: a session environment variable wins over the
 * persistent config, so `$env:X=...` overrides `post config set X=...`.
 */
export function effectiveValue(name: string): { value?: string; source?: ConfigSource } {
  const fromEnv = process.env[name]?.trim();
  if (fromEnv) return { value: fromEnv, source: "env" };
  const fromConfig = loadConfig()[name]?.trim();
  if (fromConfig) return { value: fromConfig, source: "config" };
  return {};
}
