import { requireGmailOAuthEnv } from "@/lib/gmail/oauth-env";

type TokenRefreshResponse = {
  access_token: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = requireGmailOAuthEnv();

  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("refresh_token", refreshToken);
  body.set("grant_type", "refresh_token");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token refresh failed (${res.status}). ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as TokenRefreshResponse;
  if (!json.access_token) {
    throw new Error("Token refresh response missing access_token.");
  }
  return json.access_token;
}

type GmailListResponse = {
  messages?: { id: string; threadId?: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export async function gmailListMessages(accessToken: string, maxResults: number): Promise<string[]> {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("maxResults", String(maxResults));

  const res = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gmail list failed (${res.status}). ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as GmailListResponse;
  const ids = (json.messages ?? []).map((m) => m.id).filter(Boolean);
  return ids;
}

type GmailHeader = { name?: string; value?: string };

export type GmailMessageMetadata = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  headers: Record<string, string>;
  rawHeaders: GmailHeader[];
};

type GmailGetResponse = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: GmailHeader[] };
};

export async function gmailGetMessageMetadata(
  accessToken: string,
  messageId: string,
): Promise<GmailMessageMetadata> {
  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}`);
  url.searchParams.set("format", "metadata");
  url.searchParams.append("metadataHeaders", "From");
  url.searchParams.append("metadataHeaders", "Subject");
  url.searchParams.append("metadataHeaders", "Date");

  const res = await fetch(url.toString(), {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gmail get failed (${res.status}). ${text.slice(0, 500)}`);
  }

  const json = (await res.json()) as GmailGetResponse;
  const rawHeaders = json.payload?.headers ?? [];
  const headers: Record<string, string> = {};
  for (const h of rawHeaders) {
    const name = typeof h.name === "string" ? h.name : "";
    const value = typeof h.value === "string" ? h.value : "";
    if (!name || !value) continue;
    headers[name.toLowerCase()] = value;
  }

  return {
    id: json.id,
    threadId: json.threadId,
    snippet: json.snippet,
    internalDate: json.internalDate,
    headers,
    rawHeaders,
  };
}

