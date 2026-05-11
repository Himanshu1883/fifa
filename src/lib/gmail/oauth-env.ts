const MIN_SECRET_LEN = 32;

export type GmailOAuthEnv = {
  clientId: string;
  clientSecret: string;
};

export function requireGmailOAuthEnv(): GmailOAuthEnv {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET. Set them in .env (or Vercel env) and restart the server.",
    );
  }

  return { clientId, clientSecret };
}

export function gmailTokenSecretStatus(): { ok: true } | { ok: false; reason: string } {
  const raw = process.env.GMAIL_OAUTH_TOKEN_SECRET?.trim();
  if (!raw) {
    return { ok: false, reason: "Missing GMAIL_OAUTH_TOKEN_SECRET (required to store refresh tokens)." };
  }
  if (raw.length < MIN_SECRET_LEN) {
    return {
      ok: false,
      reason: `GMAIL_OAUTH_TOKEN_SECRET must be at least ${MIN_SECRET_LEN} characters.`,
    };
  }
  return { ok: true };
}

