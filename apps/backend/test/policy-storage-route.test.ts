import { createHash } from "node:crypto";
import Fastify from "fastify";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { registerPolicyExtractRoute } from "../src/routes/policy-extract.js";
import type { ExtractedPolicy } from "../src/services/policy-extractor.js";
import { PolicyStore } from "../src/services/policy-store.js";

const policyText = "We collect personal information to provide our services. We retain information only for as long as necessary.";
const policy: ExtractedPolicy = {
  url: "https://example.com/privacy",
  finalUrl: "https://example.com/privacy",
  title: "Privacy Policy",
  text: policyText,
  wordCount: policyText.split(/\s+/).length,
  characterCount: policyText.length,
  blocks: [
    { kind: "heading", text: "Privacy Policy" },
    { kind: "paragraph", text: policyText }
  ]
};

const applications: Array<ReturnType<typeof Fastify>> = [];
const temporaryDirectories: string[] = [];

async function createApp(storePath: string) {
  const app = Fastify({ logger: false });
  applications.push(app);
  await registerPolicyExtractRoute(app, {
    policyStore: new PolicyStore(storePath),
    extractPolicyImpl: async () => policy
  });
  await app.ready();
  return app;
}

afterEach(async () => {
  await Promise.all(applications.map((app) => app.close()));
  applications.length = 0;
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
  temporaryDirectories.length = 0;
});

describe("policy storage API integration", () => {
  it("stores a successful extraction and retrieves it without changing the extraction contract", async () => {
    const directory = await mkdtemp(join(tmpdir(), "privacy-policy-route-"));
    temporaryDirectories.push(directory);
    const app = await createApp(join(directory, "policies.json"));
    const extraction = await app.inject({
      method: "POST",
      url: "/api/v1/policy/extract",
      payload: { policyUrl: policy.url }
    });
    const extractionBody = extraction.json();
    const policyId = createHash("sha256").update(policy.url).digest("hex");

    expect(extraction.statusCode).toBe(200);
    expect(Object.keys(extractionBody).sort()).toEqual(["policy", "structuredPolicy", "success"]);
    expect(extractionBody.success).toBe(true);

    const retrieval = await app.inject({ method: "GET", url: `/api/v1/policy/${policyId}` });
    expect(retrieval.statusCode).toBe(200);
    expect(retrieval.json()).toMatchObject({
      success: true,
      storedPolicy: {
        policyId,
        requestedUrl: policy.url,
        finalUrl: policy.finalUrl,
        title: policy.title,
        text: policy.text,
        version: 1
      }
    });
  });

  it("returns a controlled failure if extracted content cannot be persisted", async () => {
    const directory = await mkdtemp(join(tmpdir(), "privacy-policy-route-failure-"));
    temporaryDirectories.push(directory);
    const blockedParent = join(directory, "not-a-directory");
    await writeFile(blockedParent, "file");
    const app = await createApp(join(blockedParent, "policies.json"));
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/policy/extract",
      payload: { policyUrl: policy.url }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ success: false, error: { code: "STORAGE_FAILURE" } });
  });
});
