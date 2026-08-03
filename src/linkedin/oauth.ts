import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { openExternalBrowser } from "./browser.js";
import { effectiveValue } from "../config/persist.js";

export const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";

/**
 * Scopes needed to publish to a personal feed and resolve the member id.
 * LinkedIn's OpenID Connect requires `openid`, `profile` and `email` to be
 * requested together — omitting any of them fails with
 * `openid_insufficient_scope_error`. `r_liteprofile` is deprecated and not
 * granted to new apps.
 */
export const SCOPES = ["openid", "profile", "email", "w_member_social"];

export interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  issuedAt?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

const configDir = join(homedir(), ".post");
const credentialPath = join(configDir, "linkedin.json");

export function credentialFilePath(): string {
  return credentialPath;
}

export function clientEnv(): { clientId?: string; clientSecret?: string; redirectUri?: string } {
  return {
    clientId: effectiveValue("LINKEDIN_CLIENT_ID").value,
    clientSecret: effectiveValue("LINKEDIN_CLIENT_SECRET").value,
    redirectUri: effectiveValue("LINKEDIN_REDIRECT_URI").value,
  };
}

export async function loadCredentials(): Promise<OAuthCredentials | undefined> {
  try {
    const raw = await readFile(credentialPath, "utf8");
    const parsed = JSON.parse(raw) as OAuthCredentials;
    return parsed.accessToken ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export async function saveCredentials(cred: OAuthCredentials): Promise<void> {
  await mkdir(configDir, { recursive: true });
  await writeFile(credentialPath, JSON.stringify(cred, null, 2) + "\n", "utf8");
}

export async function clearCredentials(): Promise<void> {
  const { unlink } = await import("node:fs/promises");
  try {
    await unlink(credentialPath);
  } catch {
    // already gone
  }
}

/** A running local callback server with its code promise. */
export interface CallbackHandle {
  port: number;
  redirectUri: string;
  callback: Promise<{ code: string; state: string }>;
  close: () => void;
}

/**
 * Starts a loopback HTTP server that captures LinkedIn's redirect back to the
 * callback URL. When LINKEDIN_REDIRECT_URI is a fixed URL (no `<port>`
 * placeholder) the server binds exactly that URL's port so it can be
 * registered verbatim in the LinkedIn app; otherwise a random free port is
 * used (with `<port>` substituted in the env URL when present).
 */
export function startCallbackServer(
  state: string,
  envRedirect?: string,
): Promise<CallbackHandle> {
  return new Promise<CallbackHandle>((resolve, reject) => {
    let resolved = false;
    let callback!: (value: { code: string; state: string }) => void;
    let rejectCallback!: (reason: Error) => void;

    let listenPort = 0;
    let listenHost = "127.0.0.1";
    if (envRedirect && !envRedirect.includes("<port>")) {
      try {
        const parsed = new URL(envRedirect);
        listenPort = Number(parsed.port);
        listenHost = parsed.hostname === "localhost" ? "127.0.0.1" : parsed.hostname;
        if (!Number.isInteger(listenPort) || listenPort <= 0 || listenPort > 65535) {
          throw new Error("invalid port");
        }
      } catch {
        reject(
          new Error(
            `Invalid LINKEDIN_REDIRECT_URI "${envRedirect}" — use e.g. http://localhost:8000/callback`,
          ),
        );
        return;
      }
    }

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const path = url.pathname ?? "/";

      if (code && returnedState) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          "<html><body><h2>post CLI</h2><p>Authorization complete — you can close this tab.</p></body></html>",
        );
        callback({ code, state: returnedState });
        setTimeout(() => server.close(), 250);
        return;
      }

      const error = url.searchParams.get("error");
      if (error) {
        const desc = url.searchParams.get("error_description") ?? "";
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          `<html><body><h2>post CLI</h2><p>Authorization failed: ${escapeHtml(error)}` +
            `${desc ? ` — ${escapeHtml(desc)}` : ""}</p><p>You can close this tab.</p></body></html>`,
        );
        rejectCallback(
          new Error(
            `LinkedIn authorization failed: ${error}` +
              `${desc ? ` — ${decodeURIComponent(desc)}` : ""}`,
          ),
        );
        setTimeout(() => server.close(), 250);
        return;
      }

      if (path === "/" || path === "/callback") {
        res.writeHead(200);
        res.end("post CLI authorization server is running.");
        return;
      }
      res.writeHead(404);
      res.end("Not found");
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${listenPort} is already in use. Pick another free port, register it in ` +
              "LinkedIn (Auth tab) and set LINKEDIN_REDIRECT_URI to the same URL.",
          ),
        );
      } else if (err.code === "ENOTFOUND" || err.code === "EADDRNOTAVAIL" || err.code === "EACCES") {
        reject(
          new Error(
            `Cannot bind the callback server to "${listenHost}:${listenPort}" — ` +
              "LINKEDIN_REDIRECT_URI must point to a local address like " +
              "http://localhost:8000/callback (matching the URL registered in your LinkedIn app).",
          ),
        );
      } else {
        reject(err);
      }
    });
    server.listen(listenPort, listenHost, () => {
      const addr = server.address() as AddressInfo;
      const port = addr.port;
      let redirectUri: string;
      if (envRedirect && !envRedirect.includes("<port>")) {
        redirectUri = envRedirect;
      } else {
        const base = envRedirect ? envRedirect : `http://localhost:${port}/callback`;
        redirectUri = base.replace("<port>", String(port));
      }
      const handle: CallbackHandle = {
        port,
        redirectUri,
        callback: new Promise((resolveCode, rejectCode) => {
          callback = resolveCode;
          rejectCallback = rejectCode;
        }),
        close: () => server.close(),
      };
      resolved = true;
      resolve(handle);
    });

    // If the callback never arrives, reject the startup promise and release
    // the port so a re-run isn't blocked by a stale listener.
    setTimeout(() => {
      if (!resolved) failStartup("Authorization server timed out");
    }, 90_000);
    function failStartup(reason: string) {
      if (!resolved) {
        server.close();
        reject(new Error(reason));
        resolved = true;
      }
    }
  });
}

/** Exchange an authorization code for access + refresh tokens. */
export async function exchangeCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<AuthResponse> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code: opts.code,
    redirect_uri: opts.redirectUri,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });
  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || !data.access_token) {
    throw new Error(
      `LinkedIn token exchange failed (${res.status}): ${String(
        data.error_description ?? data.error ?? "unknown",
      )}`,
    );
  }
  return data as unknown as AuthResponse;
}

export function toCredentials(data: AuthResponse): OAuthCredentials {
  return {
    accessToken: data.access_token,
    issuedAt: new Date().toISOString(),
    expiresIn: data.expires_in,
    ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
  };
}

/** Refreshes an expired access token from its refresh token. */
export async function refreshAccessToken(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<OAuthCredentials> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });
  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || !data.access_token) {
    const desc = String(data.error_description ?? data.error ?? "unknown");
    throw new Error(`LinkedIn token refresh failed (${res.status}): ${desc}`);
  }
  return toCredentials(data as unknown as AuthResponse);
}

/**
 * Full OAuth 2.0 authorization-code flow with a local callback loopback.
 * Stores the resulting credentials and returns them.
 */
export async function runAuthorizationFlow(opts: {
  clientId?: string;
  clientSecret?: string;
  noBrowser?: boolean;
  onNotice?: (msg: string) => void;
}): Promise<OAuthCredentials> {
  const clientId = opts.clientId ?? effectiveValue("LINKEDIN_CLIENT_ID").value;
  const clientSecret = opts.clientSecret ?? effectiveValue("LINKEDIN_CLIENT_SECRET").value;
  if (!clientId) {
    throw new Error(
      "LinkedIn OAuth requires LINKEDIN_CLIENT_ID (and LINKEDIN_CLIENT_SECRET) to be set.",
    );
  }

  const state = randomBytes(16).toString("hex");
  const envRedirect = effectiveValue("LINKEDIN_REDIRECT_URI").value;
  const handle = await startCallbackServer(state, envRedirect);
  const notice = opts.onNotice ?? console.log;
  if (!envRedirect || envRedirect.includes("<port>")) {
    notice(
      "WARNING: LINKEDIN_REDIRECT_URI is not a fixed URL, so this callback uses a\n" +
        "random localhost port — LinkedIn only accepts redirect URIs registered EXACTLY\n" +
        "in your app (Developer Portal → Auth → Add redirect URL).\n" +
        "Register:  http://localhost:8000/callback\n" +
        "Then run:  post config set LINKEDIN_REDIRECT_URI=http://localhost:8000/callback",
    );
  }
  const authUrl =
    `${LINKEDIN_AUTH_URL}?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(handle.redirectUri)}` +
    `&state=${state}` +
    `&scope=${encodeURIComponent(SCOPES.join(" "))}`;

  notice("Opening your browser to authorize `post` with LinkedIn…");
  notice(`Callback: ${handle.redirectUri}`);
  notice(authUrl);
  await openExternalBrowser(authUrl, opts.noBrowser);

  const { code, state: returnedState } = await handle.callback;
  if (returnedState !== state) {
    handle.close();
    throw new Error("OAuth state mismatch; aborting authorization.");
  }

  if (!clientSecret) {
    handle.close();
    throw new Error("LINKEDIN_CLIENT_SECRET is required to exchange the authorization code.");
  }

  const data = await exchangeCode({
    clientId,
    clientSecret,
    code,
    redirectUri: handle.redirectUri,
  });
  const cred = toCredentials(data);
  await saveCredentials(cred);
  handle.close();
  return cred;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}