import { describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";

vi.mock("node:os", () => ({ platform: vi.fn(() => "win32") }));
vi.mock("node:child_process", () => ({ spawn: vi.fn(() => ({ unref: vi.fn() })) }));
const { openExternalBrowser } = await import("../src/linkedin/browser.js");

describe("openExternalBrowser (win32)", () => {
  it('uses `start "" /b "url"` verbatim so cmd neither splits on & nor opens a window', async () => {
    const url =
      "https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=abc&scope=r_liteprofile%20w_member_social";
    await openExternalBrowser(url);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith(
      "cmd",
      ["/c", "start", '""', "/b", `"${url}"`],
      expect.objectContaining({ windowsVerbatimArguments: true }),
    );
  });
});
