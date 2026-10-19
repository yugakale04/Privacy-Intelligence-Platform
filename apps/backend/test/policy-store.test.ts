import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ExtractedPolicy } from "../src/services/policy-extractor.js";
import { PolicyStorageError, PolicyStore } from "../src/services/policy-store.js";

const policyText = "We collect personal information to provide our services. We retain information only for as long as necessary.";
let temporaryDirectories: string[] = [];

async function createStorePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "privacy-policy-store-"));
  temporaryDirectories.push(directory);
  return join(directory, "policies.json");
}

function extractedPolicy(overrides: Partial<ExtractedPolicy> = {}): ExtractedPolicy {
  const text = overrides.text || policyText;
  return {
    url: "https://example.com/privacy",
    finalUrl: "https://example.com/privacy",
    title: "Privacy Policy",
    text,
    wordCount: text.split(/\s+/).length,
    characterCount: text.length,
    blocks: [{ kind: "paragraph", text }],
    ...overrides
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
  temporaryDirectories = [];
});

describe("policy storage", () => {
  it("creates a stable record and retrieves it from a new store instance", async () => {
    const path = await createStorePath();
    const record = await new PolicyStore(path).save(extractedPolicy());
    const retrieved = await new PolicyStore(path).get(record.policyId);

    expect(retrieved).toEqual(record);
    expect(record).toMatchObject({
      policyId: createHash("sha256").update("https://example.com/privacy").digest("hex"),
      requestedUrl: "https://example.com/privacy",
      finalUrl: "https://example.com/privacy",
      title: "Privacy Policy",
      text: policyText,
      contentHash: createHash("sha256").update(policyText).digest("hex"),
      version: 1,
      wordCount: policyText.split(/\s+/).length,
      characterCount: policyText.length
    });
    expect(Number.isFinite(Date.parse(record.extractedAt))).toBe(true);
  });

  it("does not update a record or version for unchanged content", async () => {
    const store = new PolicyStore(await createStorePath());
    const original = await store.save(extractedPolicy());
    const duplicate = await store.save(extractedPolicy({
      title: "A title changed without a text change",
      finalUrl: "https://example.com/legal/privacy"
    }));

    expect(duplicate).toEqual(original);
  });

  it("increments the version only when the text hash changes", async () => {
    const store = new PolicyStore(await createStorePath());
    const original = await store.save(extractedPolicy());
    const updatedText = `${policyText} We share information with service providers.`;
    const updated = await store.save(extractedPolicy({ text: updatedText }));

    expect(updated.policyId).toBe(original.policyId);
    expect(updated.contentHash).not.toBe(original.contentHash);
    expect(updated.version).toBe(original.version + 1);
    expect(updated.text).toBe(updatedText);
    expect(await store.get(original.policyId)).toEqual(updated);
  });

  it("serializes simultaneous duplicate saves into one version", async () => {
    const path = await createStorePath();
    const store = new PolicyStore(path);
    const [first, second] = await Promise.all([
      store.save(extractedPolicy()),
      store.save(extractedPolicy())
    ]);
    const file = JSON.parse(await readFile(path, "utf8")) as { policies: Record<string, unknown> };

    expect(first).toEqual(second);
    expect(first.version).toBe(1);
    expect(Object.keys(file.policies)).toHaveLength(1);
  });

  it("rejects invalid input and text above the storage limit", async () => {
    const store = new PolicyStore(await createStorePath());
    await expect(store.save(extractedPolicy({ url: "javascript:alert(1)" })))
      .rejects.toMatchObject({ code: "INVALID_POLICY" });
    await expect(store.save(extractedPolicy({ title: " " })))
      .rejects.toMatchObject({ code: "INVALID_POLICY" });
    await expect(store.save(extractedPolicy({ wordCount: 2 })))
      .rejects.toMatchObject({ code: "INVALID_POLICY" });
    await expect(store.save(extractedPolicy({ characterCount: 1 })))
      .rejects.toMatchObject({ code: "INVALID_POLICY" });
    await expect(store.save(extractedPolicy({ text: "x".repeat(2_000_001) })))
      .rejects.toMatchObject({ code: "INVALID_POLICY" });
    await expect(store.get("../policies.json"))
      .rejects.toMatchObject({ code: "INVALID_POLICY" });
    await expect(store.get("a".repeat(64)))
      .rejects.toMatchObject({ code: "POLICY_NOT_FOUND" });
  });

  it("returns a controlled storage error for filesystem failures", async () => {
    const directory = await mkdtemp(join(tmpdir(), "privacy-policy-store-failure-"));
    temporaryDirectories.push(directory);
    const blockedParent = join(directory, "not-a-directory");
    await writeFile(blockedParent, "file");
    await expect(new PolicyStore(join(blockedParent, "policies.json")).save(extractedPolicy()))
      .rejects.toBeInstanceOf(PolicyStorageError);
    await expect(new PolicyStore(join(blockedParent, "policies.json")).save(extractedPolicy()))
      .rejects.toMatchObject({ code: "STORAGE_FAILURE" });
  });
});
