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

/** Scopes needed to read the profile and publish to a personal feed. */
export const SCOPES = ["r_liteprofile", "w_member_social"];

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
 * Starts a loopback HTTP server that captures LinkedIn's redirect back to
 * `http://localhost:<port>/callback`. Resolves once the server is listening.
 */
export function startCallbackServer(
  state: string,
  envRedirect?: string,
): Promise<CallbackHandle> {
  return new Promise<CallbackHandle>((resolve, reject) => {
    let resolved = false;
    let callback!: (value: { code: string; state: string }) => void;

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
      if (path === "/" || path === "/callback") {
        res.writeHead(200);
        res.end("post CLI authorization server is running.");
        return;
      }
      res.writeHead(404);
      res.end("Not found");
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      const port = addr.port;
      const base = envRedirect && envRedirect.includes("<port>")
        ? envRedirect
        : `http://localhost:${port}/callback`;
      const redirectUri = base.replace("<port>", String(port));
      const handle: CallbackHandle = {
        port,
        redirectUri,
        callback: new Promise((resolveCode) => {
          callback = resolveCode;
        }),
        close: () => server.close(),
      };
      resolved = true;
      resolve(handle);
    });

    // If the server never starts, reject the callback promise too.
    setTimeout(() => {
      if (!resolved) rejectCallback("Authorization server timed out");
    }, 90_000);
    function rejectCallback(reason: string) {
      if (!resolved) {
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
  const handle = await startCallbackServer(state, effectiveValue("LINKEDIN_REDIRECT_URI").value);
  const authUrl =
    `${LINKEDIN_AUTH_URL}?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(handle.redirectUri)}` +
    `&state=${state}` +
    `&scope=${encodeURIComponent(SCOPES.join(" "))}`;

  const notice = opts.onNotice ?? console.log;
  notice("Opening your browser to authorize `post` with LinkedIn…");
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