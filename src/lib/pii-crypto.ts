import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { logger } from "@/lib/logger";

/**
 * Field-level encryption for identity documents (passport numbers).
 *
 * AES-256-GCM with a key from PII_ENCRYPTION_KEY (base64, 32 bytes).
 * Ciphertext format: `enc:v1:<iv b64>:<tag b64>:<data b64>` so a plaintext
 * legacy value is recognisable and can be migrated lazily or by the admin
 * backfill endpoint.
 *
 * Without a key configured, values pass through unchanged and a warning is
 * logged once. That keeps development working but production must set the key
 * (the env validator requires it when NODE_ENV=production).
 */

const PREFIX = "enc:v1:";
let warned = false;

function loadKey(): Buffer | null {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) {
    if (!warned) {
      warned = true;
      logger.warn("[pii-crypto] PII_ENCRYPTION_KEY not set: identity documents are stored in plaintext");
    }
    return null;
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length === 32) return buf;
  // Accept any string by hashing it; still 256-bit, but document the proper form.
  return createHash("sha256").update(raw).digest();
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encryptPii(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (isEncrypted(value)) return value;
  const key = loadKey();
  if (!key) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

export function decryptPii(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (!isEncrypted(value)) return value;
  const key = loadKey();
  if (!key) return "[encrypted]";
  try {
    const [, , ivB64, tagB64, dataB64] = value.split(":");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const out = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
    return out.toString("utf8");
  } catch (err) {
    logger.error({ err: String(err) }, "[pii-crypto] decrypt failed (wrong key or corrupted value)");
    return "[unreadable]";
  }
}

/** Show only the last three characters, e.g. "•••••567". */
export function maskDocument(value: string | null | undefined): string | null {
  const plain = decryptPii(value);
  if (!plain) return null;
  if (plain.length <= 3) return "•••";
  return "•".repeat(Math.max(3, plain.length - 3)) + plain.slice(-3);
}

/**
 * Decrypt the passport field on a guest row for a caller allowed to see it,
 * or mask it for everyone else.
 */
export function revealGuestDocument<T extends { passport_number?: string | null }>(
  row: T,
  canSeeFull: boolean
): T {
  if (!row || row.passport_number === undefined) return row;
  return {
    ...row,
    passport_number: canSeeFull ? decryptPii(row.passport_number) : maskDocument(row.passport_number),
  };
}
