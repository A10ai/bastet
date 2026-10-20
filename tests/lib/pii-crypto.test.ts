import { beforeAll, describe, expect, it } from "vitest";

describe("pii-crypto", () => {
  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("round-trips a passport number", async () => {
    const { encryptPii, decryptPii, isEncrypted } = await import("@/lib/pii-crypto");
    const enc = encryptPii("P1234567");
    expect(enc).not.toBe("P1234567");
    expect(isEncrypted(enc)).toBe(true);
    expect(decryptPii(enc)).toBe("P1234567");
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const { encryptPii } = await import("@/lib/pii-crypto");
    expect(encryptPii("P1234567")).not.toBe(encryptPii("P1234567"));
  });

  it("does not double-encrypt and passes legacy plaintext through decrypt", async () => {
    const { encryptPii, decryptPii } = await import("@/lib/pii-crypto");
    const once = encryptPii("AB123")!;
    expect(encryptPii(once)).toBe(once);
    expect(decryptPii("LEGACY1")).toBe("LEGACY1");
  });

  it("masks to the last three characters", async () => {
    const { encryptPii, maskDocument, revealGuestDocument } = await import("@/lib/pii-crypto");
    const enc = encryptPii("P1234567");
    expect(maskDocument(enc)).toBe("•••••567");
    expect(revealGuestDocument({ passport_number: enc }, false).passport_number).toBe("•••••567");
    expect(revealGuestDocument({ passport_number: enc }, true).passport_number).toBe("P1234567");
  });

  it("returns null for empty values", async () => {
    const { encryptPii, decryptPii } = await import("@/lib/pii-crypto");
    expect(encryptPii("")).toBeNull();
    expect(encryptPii(null)).toBeNull();
    expect(decryptPii(undefined)).toBeNull();
  });
});
