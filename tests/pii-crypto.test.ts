import { describe, it, expect, afterEach } from "vitest";

/** PII_ENCRYPTION_KEY rotation via PII_ENCRYPTION_KEY_PREVIOUS (docs/runbooks/key-rotation.md). */
describe("key rotation", () => {
  const OLD = Buffer.alloc(32, 1).toString("base64");
  const NEW = Buffer.alloc(32, 2).toString("base64");
  afterEach(() => { delete process.env.PII_ENCRYPTION_KEY_PREVIOUS; });

  it("reads values written under the previous key and rewrites them under the current one", async () => {
    const { encryptPii, decryptPii, needsRekey, rekeyPii } = await import("@/lib/pii-crypto");
    process.env.PII_ENCRYPTION_KEY = OLD;
    const legacy = encryptPii("P1234567")!;
    process.env.PII_ENCRYPTION_KEY = NEW;
    process.env.PII_ENCRYPTION_KEY_PREVIOUS = OLD;
    expect(decryptPii(legacy)).toBe("P1234567");
    expect(needsRekey(legacy)).toBe(true);
    const rotated = rekeyPii(legacy);
    expect(rotated).not.toBe(legacy);
    expect(needsRekey(rotated)).toBe(false);
    delete process.env.PII_ENCRYPTION_KEY_PREVIOUS;
    expect(decryptPii(rotated)).toBe("P1234567");
    expect(decryptPii(legacy)).toBe("[unreadable]");
  });

  it("treats plaintext as needing re-key and does not touch unreadable values", async () => {
    const { needsRekey, rekeyPii } = await import("@/lib/pii-crypto");
    process.env.PII_ENCRYPTION_KEY = NEW;
    expect(needsRekey("AB123")).toBe(true);
    const bad = "enc:v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA==:AAAA";
    expect(needsRekey(bad)).toBe(true);
    expect(rekeyPii(bad)).toBe(bad);
  });
});
