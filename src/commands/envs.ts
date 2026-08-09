import { effectiveValue } from "../config/persist.js";

export const ENV_VARS = [
  "POST_LLM_API_KEY",
  "OPENAI_API_KEY",
  "POST_LLM_BASE_URL",
  "POST_LLM_MODEL",
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "LINKEDIN_ACCESS_TOKEN",
  "LINKEDIN_REDIRECT_URI",
  "LINKEDIN_VISIBILITY",
  "POST_PLUGIN_DIR",
] as const;

export interface EnvStatus {
  name: string;
  value: string | null;
  /** Where the value came from; undefined when unset. */
  source?: "env" | "config";
}

/** Reads the tool's known env vars (process env, then persistent config). */
export function readEnvs(names: readonly string[] = ENV_VARS): EnvStatus[] {
  return names.map((name) => {
    const { value, source } = effectiveValue(name);
    return { name, value: value ?? null, source };
  });
}
