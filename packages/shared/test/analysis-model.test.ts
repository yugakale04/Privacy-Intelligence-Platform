import { describe, expect, it } from "vitest";
import { AnalysisModelValidationError, createAnalysisResult, deserializeAnalysisResult, serializeAnalysisResult, validateFinding, type EvidenceReferenceDocument } from "../src/index.js";

const document: EvidenceReferenceDocument = { title: "Example Privacy Policy", sourceUrl: "https://example.com/privacy", finalUrl: "https://example.com/privacy", totalWordCount: 100, totalCharacterCount: 600, sections: [{ id: "s001" }, { id: "s002" }], chunks: [{ id: "s001-c001", sectionId: "s001" }, { id: "s002-c001", sectionId: "s002" }] };
const finding = { id: "finding-001", category: "data_collection", type: "personal_information_collection", severity: "medium", confidence: 0.8, statement: "The policy states that personal information is collected.", evidence: [{ text: "We collect personal information.", sectionId: "s001", chunkId: "s001-c001" }] };

describe("privacy finding and evidence contract", () => {
  it("validates a finding with evidence against a structured policy document", () => expect(validateFinding(finding, document)).toEqual(finding));
  it("rejects invalid severity and out-of-range confidence", () => {
    expect(() => validateFinding({ ...finding, severity: "urgent" }, document)).toThrow(AnalysisModelValidationError);
    expect(() => validateFinding({ ...finding, confidence: -0.01 }, document)).toThrow(AnalysisModelValidationError);
    expect(() => validateFinding({ ...finding, confidence: 1.01 }, document)).toThrow(AnalysisModelValidationError);
  });
  it("rejects missing required fields and missing evidence", () => {
    expect(() => validateFinding({ ...finding, statement: "" }, document)).toThrow(AnalysisModelValidationError);
    expect(() => validateFinding({ ...finding, evidence: [] }, document)).toThrow(AnalysisModelValidationError);
  });
  it("rejects evidence with invalid or mismatched section/chunk references", () => {
    expect(() => validateFinding({ ...finding, evidence: [{ ...finding.evidence[0], sectionId: "s999" }] }, document)).toThrow(AnalysisModelValidationError);
    expect(() => validateFinding({ ...finding, evidence: [{ ...finding.evidence[0], sectionId: "s002" }] }, document)).toThrow(AnalysisModelValidationError);
  });
  it("supports multiple findings from controlled categories", () => {
    const result = createAnalysisResult(document, [finding, { ...finding, id: "finding-002", category: "user_rights", evidence: [{ text: "You may request access.", sectionId: "s002", chunkId: "s002-c001" }] }]);
    expect(result.findings.map((item) => item.category)).toEqual(["data_collection", "user_rights"]);
  });
  it("serializes and deserializes a multi-finding analysis result", () => {
    const result = createAnalysisResult(document, [finding]);
    expect(deserializeAnalysisResult(serializeAnalysisResult(result), document)).toEqual(result);
  });
});
