import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:os";

const DEBUG_LOG = join(
  process.env.POST_CONFIG_DIR ?? join(process.env.USERPROFILE ?? ".", ".post"),
  "post-debug.log",
);

/**
 * Opens a URL in the user's default browser, cross-platform. When
 * `noBrowser` is true or the opener fails, the URL is printed instead.
 */
export async function openExternalBrowser(url: string, noBrowser = false): Promise<void> {
  try {
    mkdirSync(join(process.env.POST_CONFIG_DIR ?? join(process.env.USERPROFILE ?? ".", ".post")), { recursive: true });
    appendFileSync(
      DEBUG_LOG,
      JSON.stringify({
        ts: new Date().toISOString(),
        url,
        argv: ["cmd", "/c", "start", '""', "/b", `"${url}"`],
        platform: process.platform,
        execPath: process.execPath,
        cwd: process.cwd(),
      }) + "\n",
    );
  } catch {}
  if (noBrowser) {
    process.stdout.write(`\nOpen this URL in your browser:\n${url}\n\n`);
    return;
  }
  try {
    const os = platform();
    if (os === "win32") {
      // cmd /c start "" /b "url" — the literal two-char `""` is the window
      // TITLE placeholder, and `/b` runs without a new window. The URL must be
      // quoted and arguments passed verbatim: otherwise cmd splits on `&` and
      // a URL as the first argument becomes a window title.
      spawn("cmd", ["/c", "start", '""', "/b", `"${url}"`], {
        windowsVerbatimArguments: true,
        stdio: "ignore",
        detached: true,
      }).unref();
    } else if (os === "darwin") {
      spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    } else {
      spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
    }
    await new Promise((r) => setTimeout(r, 200));
  } catch {
    process.stdout.write(`\nOpen this URL in your browser:\n${url}\n\n`);
  }
}
