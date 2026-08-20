import { describe, expect, it } from "vitest";
import { createAnalysisResult, serializeAnalysisResult, validateFinding } from "../../../packages/shared/src/index.js";
import { processPolicy } from "../src/services/policy-processor.js";

describe("M7 structured policy to M8 finding integration", () => {
  it("validates and serializes evidence linked to a processed policy section and chunk", () => {
    const text = "We collect personal information to provide our services and communicate with users about their accounts.";
    const document = processPolicy({
      url: "https://example.com/privacy",
      finalUrl: "https://example.com/privacy",
      title: "Example Privacy Policy",
      text: `Data Collection\n\n${text}`,
      wordCount: 16,
      characterCount: 110,
      blocks: [{ kind: "heading", text: "Data Collection" }, { kind: "paragraph", text }]
    });
    const finding = validateFinding({
      id: "finding-data-collection",
      category: "data_collection",
      type: "collection_statement",
      severity: "medium",
      confidence: 0.9,
      statement: "The policy states that personal information is collected.",
      evidence: [{ text, sectionId: document.sections[0].id, chunkId: document.chunks[0].id }]
    }, document);
    const result = createAnalysisResult(document, [finding]);
    expect(JSON.parse(serializeAnalysisResult(result))).toMatchObject({ findings: [{ id: "finding-data-collection" }] });
  });
});
