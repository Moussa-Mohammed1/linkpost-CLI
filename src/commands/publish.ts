import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { CliResult } from "../core/types.js";
import { LinkedInApiError, LinkedInClient } from "../linkedin/client.js";
import {
  clientEnv,
  clearCredentials,
  loadCredentials,
  refreshAccessToken,
  runAuthorizationFlow,
  saveCredentials,
  type OAuthCredentials,
} from "../linkedin/oauth.js";

export interface PublishInput {
  cwd: string;
  noBrowser?: boolean;
  emit?: (msg: string) => void;
}

export interface PublishResult extends CliResult {
  shareUrl?: string;
  postId?: string;
  mediaSkipped?: boolean;
}

const MAX_IMAGES = 10;

const IMAGE_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
};

const SUPPORTED = new Set(Object.keys(IMAGE_EXT));

function extOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx).toLowerCase();
}

/**
 * `post publish` — reads `linkedin-post/content.txt`, uploads every supported
 * image in `linkedin-post/images/`, then publishes to the user's LinkedIn feed.
 * Missing auth and API restrictions are reported with actionable guidance.
 */
export async function publishPost(opts: PublishInput): Promise<PublishResult> {
  const emit = opts.emit ?? console.log;
  const outputDir = join(opts.cwd, "linkedin-post");

  // --- read generated content ---
  let content: string;
  try {
    content = (await readFile(join(outputDir, "content.txt"), "utf8")).trim();
  } catch {
    return {
      ok: false,
      error: "`linkedin-post/content.txt` not found. Run `post` first to generate the post.",
    };
  }
  if (!content) {
    return { ok: false, error: "`linkedin-post/content.txt` is empty." };
  }

  // --- authenticate ---
  const envToken = process.env.LINKEDIN_ACCESS_TOKEN;
  let credentials: OAuthCredentials;
  if (envToken) {
    credentials = { accessToken: envToken };
    emit("Using LINKEDIN_ACCESS_TOKEN from the environment.");
  } else {
    const stored = await loadCredentials();
    if (stored) {
      credentials = stored;
      emit("Using previously stored LinkedIn credentials.");
    } else if (clientEnv().clientId) {
      try {
        credentials = await runAuthorizationFlow({ noBrowser: opts.noBrowser, onNotice: emit });
      } catch (err) {
        return { ok: false, error: `Authorization failed: ${(err as Error).message}` };
      }
    } else {
      return {
        ok: false,
        error:
          "No LinkedIn credentials found.\n\n" +
          "Set LINKEDIN_CLIENT_ID + LINKEDIN_CLIENT_SECRET (or LINKEDIN_ACCESS_TOKEN) and " +
          "run `post publish` again. Tokens are cached in ~/.post/linkedin.json.",
      };
    }
  }

  let personId: string;
  let client: LinkedInClient;
  try {
    client = new LinkedInClient({ accessToken: credentials.accessToken });
    personId = await client.getPersonId();
  } catch (err) {
    if (err instanceof LinkedInApiError && err.status === 401 && credentials.refreshToken) {
      const env = clientEnv();
      if (env.clientId && env.clientSecret) {
        try {
          const refreshed = await refreshAccessToken({
            clientId: env.clientId,
            clientSecret: env.clientSecret,
            refreshToken: credentials.refreshToken,
          });
          await saveCredentials(refreshed);
          emit("Access token refreshed.");
          return publishPost({ cwd: opts.cwd, noBrowser: opts.noBrowser, emit });
        } catch {
          // fall through to the auth error
        }
      }
    }
    await clearCredentials().catch(() => {});
    return { ok: false, error: `LinkedIn authentication failed: ${(err as Error).message}` };
  }

  const personUrn = `urn:li:person:${personId}`;

  // --- upload images ---
  const imagesDir = join(outputDir, "images");
  const uploads: Array<{ assetId: string; title: string }> = [];
  try {
    const entries = await readdir(imagesDir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && SUPPORTED.has(extOf(e.name)))
      .slice(0, MAX_IMAGES);
    for (const file of files) {
      emit(`Uploading image: ${file.name}`);
      try {
        const bytes = new Uint8Array(await readFile(join(imagesDir, file.name)));
        const handle = await client.registerImageUpload(personUrn, IMAGE_EXT[extOf(file.name)] ?? "image/png");
        await client.uploadBinary(handle.uploadUrl, bytes);
        uploads.push({ assetId: handle.assetId, title: file.name });
      } catch (err) {
        emit(` Skipping ${file.name}: ${(err as Error).message}`);
      }
    }
  } catch {
    // images/ missing — text-only post
  }

  // --- publish ---
  const visibility = pickVisibility();
  try {
    const result = await client.createSharePost({
      personUrn,
      text: content,
      media: uploads.map((u) => ({ assetId: u.assetId, title: u.title })),
      visibility,
    });
    return {
      ok: true,
      outputDir,
      shareUrl: result.shareUrl,
      postId: result.id,
    };
  } catch (err) {
    if (uploads.length > 0) {
      emit("Post with images failed; retrying as text-only.");
      try {
        const result = await client.createSharePost({ personUrn, text: content, visibility });
        return { ok: true, outputDir, shareUrl: result.shareUrl, postId: result.id, mediaSkipped: true };
      } catch {
        // fall through to the friendly error below
      }
    }
    return { ok: false, error: friendlyPublishError(err) };
  }
}

function pickVisibility(): ShareVisibility {
  const raw = process.env.LINKEDIN_VISIBILITY?.toUpperCase();
  return raw === "CONNECTIONS" || raw === "LOGGED_IN" ? raw : "PUBLIC";
}

type ShareVisibility = "PUBLIC" | "CONNECTIONS" | "LOGGED_IN";

function friendlyPublishError(err: unknown): string {
  const e = err instanceof LinkedInApiError ? err : undefined;
  const message = e?.message ?? (err as Error).message;
  if (e?.status === 403 || /(w_member_social|member token|create content|permission|community|person)/i.test(message)) {
    return (
      "LinkedIn rejected publishing to a personal profile.\n\n" +
      "LinkedIn's API no longer grants third-party apps the ability to publish to a personal-feed profile\n" +
      "by default; it requires specific approval (e.g. the Community Management API for organizations).\n\n" +
      "Options:\n" +
      "  • Publish the saved post manually from your LinkedIn app or web — the text is ready in\n" +
      "    linkedin-post/content.txt (images in linkedin-post/images/).\n" +
      "  • If you manage an organization/Page, request Community Management access and post there.\n\n" +
      "This tool deliberately respects LinkedIn's Terms — it won't scrape, automate a browser session,\n" +
      "or reuse tokens outside the approved OAuth/API flows."
    );
  }
  return `Publish failed: ${message}`;
}