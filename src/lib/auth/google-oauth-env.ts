export type GoogleOAuthEnv = {
  clientId: string;
  clientSecret: string;
};

export function requireGoogleOAuthEnv(): GoogleOAuthEnv {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET. Set them in .env (or Vercel env) and restart the server.",
    );
  }

  return { clientId, clientSecret };
}

