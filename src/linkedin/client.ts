const REST = "https://api.linkedin.com/rest";
const V2 = "https://api.linkedin.com/v2";

export interface LinkedInClientInit {
  accessToken: string;
}

export interface UploadImageResult {
  uploadUrl: string;
  assetId: string;
}

export interface SharePostInput {
  personUrn: string;
  text: string;
  /** Owned image asset IDs from {@link LinkedInClient.registerImageUpload}. */
  media?: Array<{ assetId: string; title?: string }>;
  visibility?: "PUBLIC" | "CONNECTIONS" | "LOGGED_IN";
}

export interface SharePostResult {
  id: string;
  shareUrl: string;
}

export class LinkedInApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "LinkedInApiError";
    this.status = status;
    this.code = code;
  }
}

function bearer(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Thin, verified client for the LinkedIn REST (v2) + Images (rest) APIs. */
export class LinkedInClient {
  private readonly token: string;

  constructor(init: LinkedInClientInit) {
    this.token = init.accessToken;
  }

  /** Resolves the current user's person id (`urn:li:person:<id>`). */
  async getPersonId(): Promise<string> {
    const res = await fetch(`${V2}/userinfo`, { headers: { Authorization: `Bearer ${this.token}` } });
    if (res.ok) {
      const data = (await readJson(res)) as { sub?: string };
      if (data.sub) return data.sub;
    }
    const me = await this.v2Get("/me");
    const sub = (me as { sub?: string }).sub;
    if (!sub) throw new LinkedInApiError("Could not resolve the LinkedIn user id.", 0);
    return sub;
  }

  /**
   * Initializes an upload for one image and returns the upload URL + asset id.
   * Uses LinkedIn's REST assets endpoint (`/rest/assets?action=registerUpload`).
   */
  async registerImageUpload(personUrn: string, supportedMediaType: string): Promise<UploadImageResult> {
    const body = {
      owner: personUrn,
      supportedMediaType,
      mediaSubType: "default",
    };
    const res = await fetch(`${REST}/assets?action=registerUpload`, {
      method: "POST",
      headers: bearer(this.token),
      body: JSON.stringify(body),
    });
    const json = await readJson(res);
    if (!res.ok) {
      throw new LinkedInApiError(
        `image upload registration failed (${res.status}): ${this.str(json.message) ?? JSON.stringify(json).slice(0, 160)}`,
        res.status,
      );
    }
    const value = json.value as { uploadUrl?: string; asset?: string };
    if (!value?.uploadUrl || !value.asset) {
      throw new LinkedInApiError("LinkedIn did not return an upload URL/asset for the image.", res.status);
    }
    return { uploadUrl: value.uploadUrl, assetId: value.asset };
  }

  /** Uploads raw bytes to a LinkedIn-provided upload URL (PUT). */
  async uploadBinary(uploadUrl: string, data: Uint8Array): Promise<void> {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: data,
    });
    if (!res.ok) {
      throw new LinkedInApiError(`image upload failed (${res.status})`, res.status);
    }
  }

  /** Creates a post on the user's personal feed (UGC Posts API). */
  async createSharePost(input: SharePostInput): Promise<SharePostResult> {
    const content: Record<string, unknown> = {
      shareCommentary: { text: input.text.slice(0, 3000) },
      shareMediaCategory: input.media && input.media.length > 0 ? "IMAGE" : "NONE",
    };
    if (input.media?.length) {
      content.media = input.media.map((m) => ({
        status: "READY",
        media: m.assetId,
        ...(m.title ? { title: { text: m.title } } : {}),
      }));
    }
    const body = {
      author: input.personUrn,
      lifecycleState: "PUBLISHED",
      specificContent: { "com.linkedin.ugc.ShareContent": content },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": input.visibility ?? "PUBLIC" },
    };
    const res = await fetch(`${V2}/ugcPosts`, {
      method: "POST",
      headers: bearer(this.token),
      body: JSON.stringify(body),
    });
    const json = await readJson(res);
    if (!res.ok) {
      const code = this.str(json.code);
      const message =
        this.str(json.message) ?? this.str(json.error) ?? String(json).slice(0, 300) ?? "";
      throw new LinkedInApiError(`publishing failed (${res.status}): ${message}`, res.status, code);
    }
    const id = this.str(json.id);
    if (!id) throw new LinkedInApiError("LinkedIn did not return a post id.", res.status);
    return { id, shareUrl: `https://www.linkedin.com/feed/update/${id}` };
  }

  private v2Get(path: string): Promise<Record<string, unknown>> {
    return fetch(`${V2}${path}`, { headers: { Authorization: `Bearer ${this.token}` } }).then(readJson);
  }

  private str(v: unknown): string | undefined {
    return typeof v === "string" ? v : undefined;
  }
}