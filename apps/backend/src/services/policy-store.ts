import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtractedPolicy } from "./policy-extractor.js";
import { validatePolicyUrl } from "./policy-extractor.js";

const MAX_POLICY_TEXT_CHARACTERS = 2_000_000;
const MAX_POLICY_TITLE_CHARACTERS = 1_000;
const MAX_POLICY_URL_CHARACTERS = 2_048;
const DEFAULT_STORE_PATH = fileURLToPath(new URL("../../data/policies.json", import.meta.url));

export interface StoredPolicyRecord {
  policyId: string;
  requestedUrl: string;
  finalUrl: string;
  title: string;
  text: string;
  contentHash: string;
  extractedAt: string;
  version: number;
  wordCount: number;
  characterCount: number;
}

interface PolicyStoreFile {
  schemaVersion: 1;
  policies: Record<string, StoredPolicyRecord>;
}

export type PolicyStorageErrorCode = "INVALID_POLICY" | "STORAGE_FAILURE" | "POLICY_NOT_FOUND";

export class PolicyStorageError extends Error {
  constructor(public readonly code: PolicyStorageErrorCode, message: string) {
    super(message);
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateExtractedPolicy(policy: ExtractedPolicy): void {
  if (!isRecord(policy)
    || typeof policy.url !== "string"
    || typeof policy.finalUrl !== "string"
    || typeof policy.title !== "string"
    || typeof policy.text !== "string"
    || typeof policy.wordCount !== "number"
    || typeof policy.characterCount !== "number") {
    throw new PolicyStorageError("INVALID_POLICY", "Extracted policy data is invalid.");
  }
  if (policy.url.length > MAX_POLICY_URL_CHARACTERS || policy.finalUrl.length > MAX_POLICY_URL_CHARACTERS
    || policy.title.trim().length === 0 || policy.title.length > MAX_POLICY_TITLE_CHARACTERS
    || policy.text.trim().length === 0 || policy.text.length > MAX_POLICY_TEXT_CHARACTERS
    || !Number.isSafeInteger(policy.wordCount)
    || policy.wordCount !== policy.text.trim().split(/\s+/).length
    || !Number.isSafeInteger(policy.characterCount) || policy.characterCount !== policy.text.length) {
    throw new PolicyStorageError("INVALID_POLICY", "Extracted policy data exceeds storage limits or has invalid metadata.");
  }
  try {
    validatePolicyUrl(policy.url);
    validatePolicyUrl(policy.finalUrl);
  } catch {
    throw new PolicyStorageError("INVALID_POLICY", "Extracted policy URLs are invalid.");
  }
}

function isStoredPolicyRecord(value: unknown): value is StoredPolicyRecord {
  if (!isRecord(value)) return false;
  if (!(typeof value.policyId === "string"
    && /^[a-f0-9]{64}$/.test(value.policyId)
    && typeof value.requestedUrl === "string"
    && typeof value.finalUrl === "string"
    && typeof value.title === "string"
    && value.title.trim().length > 0
    && value.title.length <= MAX_POLICY_TITLE_CHARACTERS
    && typeof value.text === "string"
    && value.text.trim().length > 0
    && value.text.length <= MAX_POLICY_TEXT_CHARACTERS
    && typeof value.contentHash === "string"
    && /^[a-f0-9]{64}$/.test(value.contentHash)
    && typeof value.extractedAt === "string"
    && Number.isFinite(Date.parse(value.extractedAt))
    && Number.isSafeInteger(value.version)
    && (value.version as number) > 0
    && Number.isSafeInteger(value.wordCount)
    && (value.wordCount as number) >= 0
    && value.characterCount === value.text.length
    && value.wordCount === value.text.trim().split(/\s+/).length
    && value.contentHash === hash(value.text)
    && value.policyId === hash(value.requestedUrl))) {
    return false;
  }
  try {
    return new URL(value.requestedUrl).href === value.requestedUrl
      && new URL(value.finalUrl).href === value.finalUrl
      && Boolean(validatePolicyUrl(value.requestedUrl))
      && Boolean(validatePolicyUrl(value.finalUrl));
  } catch {
    return false;
  }
}

function decodeStoreFile(serialized: string): PolicyStoreFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new PolicyStorageError("STORAGE_FAILURE", "Policy storage contains invalid data.");
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isRecord(parsed.policies)) {
    throw new PolicyStorageError("STORAGE_FAILURE", "Policy storage has an unsupported format.");
  }
  const policies: Record<string, StoredPolicyRecord> = {};
  for (const [policyId, record] of Object.entries(parsed.policies)) {
    if (!isStoredPolicyRecord(record) || record.policyId !== policyId) {
      throw new PolicyStorageError("STORAGE_FAILURE", "Policy storage contains an invalid record.");
    }
    policies[policyId] = record;
  }
  return { schemaVersion: 1, policies };
}

export class PolicyStore {
  private readonly filePath: string;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(filePath = process.env.POLICY_STORAGE_PATH || DEFAULT_STORE_PATH) {
    this.filePath = resolve(filePath);
  }

  async save(policy: ExtractedPolicy): Promise<StoredPolicyRecord> {
    validateExtractedPolicy(policy);
    const requestedUrl = new URL(policy.url).href;
    const policyId = hash(requestedUrl);
    const contentHash = hash(policy.text);
    return this.runExclusive(async () => {
      const store = await this.readStore();
      const existing = store.policies[policyId];
      if (existing?.contentHash === contentHash) return existing;

      const record: StoredPolicyRecord = {
        policyId,
        requestedUrl,
        finalUrl: new URL(policy.finalUrl).href,
        title: policy.title,
        text: policy.text,
        contentHash,
        extractedAt: new Date().toISOString(),
        version: (existing?.version || 0) + 1,
        wordCount: policy.wordCount,
        characterCount: policy.characterCount
      };
      store.policies[policyId] = record;
      await this.writeStore(store);
      return record;
    });
  }

  async get(policyId: string): Promise<StoredPolicyRecord> {
    if (!/^[a-f0-9]{64}$/.test(policyId)) {
      throw new PolicyStorageError("INVALID_POLICY", "Policy identifier is invalid.");
    }
    return this.runExclusive(async () => {
      const record = (await this.readStore()).policies[policyId];
      if (!record) throw new PolicyStorageError("POLICY_NOT_FOUND", "Stored policy was not found.");
      return record;
    });
  }

  private async runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async readStore(): Promise<PolicyStoreFile> {
    try {
      return decodeStoreFile(await readFile(this.filePath, "utf8"));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        return { schemaVersion: 1, policies: {} };
      }
      if (error instanceof PolicyStorageError) throw error;
      throw new PolicyStorageError("STORAGE_FAILURE", "Unable to read policy storage.");
    }
  }

  private async writeStore(store: PolicyStoreFile): Promise<void> {
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
      await writeFile(temporaryPath, JSON.stringify(store), { encoding: "utf8", flag: "wx", mode: 0o600 });
      await rename(temporaryPath, this.filePath);
    } catch {
      await unlink(temporaryPath).catch(() => undefined);
      throw new PolicyStorageError("STORAGE_FAILURE", "Unable to save policy storage.");
    }
  }
}
