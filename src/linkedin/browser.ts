import { spawn } from "node:child_process";
import { platform } from "node:os";

/**
 * Opens a URL in the user's default browser, cross-platform. When
 * `noBrowser` is true or the opener fails, the URL is printed instead.
 */
export async function openExternalBrowser(url: string, noBrowser = false): Promise<void> {
  if (noBrowser) {
    process.stdout.write(`\nOpen this URL in your browser:\n${url}\n\n`);
    return;
  }
  try {
    const os = platform();
    if (os === "win32") {
      spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
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