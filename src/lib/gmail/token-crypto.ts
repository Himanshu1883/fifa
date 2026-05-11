import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const MIN_SECRET_LEN = 32;
const VERSION_PREFIX = "v1";
const IV_BYTES = 12;

function resolveTokenSecretRaw(): string | null {
  const raw = process.env.GMAIL_OAUTH_TOKEN_SECRET?.trim();
  if (!raw) return null;
  if (raw.length < MIN_SECRET_LEN) return null;
  return raw;
}

function tryTokenKeyBytes(): Buffer | null {
  const raw = resolveTokenSecretRaw();
  if (!raw) return null;
  return createHash("sha256").update(raw, "utf8").digest();
}

export function encryptRefreshToken(refreshToken: string): string {
  const key = tryTokenKeyBytes();
  if (!key) {
    throw new Error(
      `Cannot encrypt token: GMAIL_OAUTH_TOKEN_SECRET must be set to a random string of at least ${MIN_SECRET_LEN} characters.`,
    );
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(refreshToken, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptRefreshToken(encrypted: string): string {
  const key = tryTokenKeyBytes();
  if (!key) {
    throw new Error(
      `Cannot decrypt token: GMAIL_OAUTH_TOKEN_SECRET must be set to a random string of at least ${MIN_SECRET_LEN} characters.`,
    );
  }

  const parts = encrypted.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION_PREFIX) {
    throw new Error("Invalid encrypted refresh token format.");
  }
  const iv = Buffer.from(parts[1]!, "base64url");
  const tag = Buffer.from(parts[2]!, "base64url");
  const ciphertext = Buffer.from(parts[3]!, "base64url");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

export function hasGmailTokenSecret(): boolean {
  return Boolean(resolveTokenSecretRaw());
}

