import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1:";

function encryptionKey(): Buffer {
  const raw =
    process.env.CLOVER_SECRETS_KEY?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    "dev-only-clover-secrets-key";
  return createHash("sha256").update(raw).digest();
}

/** Encrypt a secret for storage (AES-256-GCM). Empty input → null. */
export function encryptSecret(plaintext: string | null | undefined): string | null {
  const value = plaintext?.trim();
  if (!value) return null;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

/** Decrypt a stored secret. Returns null on missing/invalid ciphertext. */
export function decryptSecret(ciphertext: string | null | undefined): string | null {
  const raw = ciphertext?.trim();
  if (!raw) return null;
  if (!raw.startsWith(PREFIX)) return null;

  try {
    const body = raw.slice(PREFIX.length);
    const [ivB64, tagB64, dataB64] = body.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const data = Buffer.from(dataB64, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function maskSecretHint(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  if (v.length <= 8) return "••••••••";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}
