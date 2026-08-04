import { describe, expect, it } from "vitest";
import { createServer, request } from "node:http";
import type { AddressInfo } from "node:net";
import { startCallbackServer } from "../src/linkedin/oauth.js";

async function freePort(): Promise<number> {
  const srv = createServer();
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const addr = srv.address() as AddressInfo;
  const port = addr.port;
  await new Promise<void>((r) => srv.close(() => r()));
  return port;
}

describe("startCallbackServer", () => {
  it("binds the exact port of a fixed LINKEDIN_REDIRECT_URI", async () => {
    const port = await freePort();
    const handle = await startCallbackServer("s1", `http://localhost:${port}/callback`);
    try {
      expect(handle.port).toBe(port);
      expect(handle.redirectUri).toBe(`http://localhost:${port}/callback`);
    } finally {
      handle.close();
    }
  });

  it("substitutes <port> in an env redirect with the bound port", async () => {
    const handle = await startCallbackServer("s2", "http://localhost:<port>/callback");
    try {
      expect(handle.redirectUri).toBe(`http://localhost:${handle.port}/callback`);
    } finally {
      handle.close();
    }
  });

  it("uses a random port and default URL when no env redirect is set", async () => {
    const handle = await startCallbackServer("s3");
    try {
      expect(handle.redirectUri).toBe(`http://localhost:${handle.port}/callback`);
      expect(handle.port).toBeGreaterThan(0);
    } finally {
      handle.close();
    }
  });

  it("rejects an invalid fixed redirect URL", async () => {
    await expect(startCallbackServer("s4", "not-a-url")).rejects.toThrow(/LINKEDIN_REDIRECT_URI/);
  });

  it("reports port-in-use with actionable guidance", async () => {
    const srv = createServer();
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as AddressInfo).port;
    try {
      await expect(
        startCallbackServer("s5", `http://localhost:${port}/callback`),
      ).rejects.toThrow(/already in use/);
    } finally {
      await new Promise<void>((r) => srv.close(() => r()));
    }
  });

  it("rejects with LinkedIn's error description when the callback carries an error", async () => {
    const port = await freePort();
    const handle = await startCallbackServer("s6", `http://localhost:${port}/callback`);
    try {
      const desc =
        'Scope+%26quot%3Br_liteprofile%26quot%3B+is+not+authorized+for+your+application';
      const req = request(
        {
          host: "127.0.0.1",
          port,
          path: `/callback?error=unauthorized_scope_error&error_description=${desc}&state=s6`,
          method: "GET",
        },
        (res) => res.resume(),
      );
      req.end();
      await expect(handle.callback).rejects.toThrow(/unauthorized_scope_error.*r_liteprofile/s);
    } finally {
      handle.close();
    }
  });
});
