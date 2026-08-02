#!/usr/bin/env node
// post CLI entrypoint. Runs the compiled output; instructs how to build if missing.
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const hereDir = dirname(fileURLToPath(import.meta.url));
const distEntry = join(hereDir, "..", "dist", "index.js");

if (!existsSync(distEntry)) {
  console.error(
    "post: not built yet. Run `npm install` (builds automatically) or `npm run build`.",
  );
  process.exit(1);
}

const { main } = await import(pathToFileURL(distEntry).href);
await main(process.argv.slice(2));