import { describe, expect, it } from "vitest";
import { PolicyProcessingError, processPolicy } from "../src/services/policy-processor.js";
import type { ExtractedPolicy } from "../src/services/policy-extractor.js";

function policy(overrides: Partial<ExtractedPolicy> = {}): ExtractedPolicy {
  const blocks = [
    { kind: "heading" as const, text: "Privacy Policy" },
    { kind: "paragraph" as const, text: "We collect personal information to provide services and keep accounts secure for our customers." },
    { kind: "heading" as const, text: "Your Rights" },
    { kind: "paragraph" as const, text: "You may request access, correction, or deletion of your personal information by contacting us." }
  ];
  const text = blocks.map((block) => block.text).join("\n\n");
  return { url: "https://example.com/privacy", finalUrl: "https://example.com/privacy", title: "Example Privacy", text, wordCount: text.split(/\s+/).length, characterCount: text.length, blocks, ...overrides };
}

describe("policy text processor", () => {
  it("uses structural headings to create ordered sections and source-linked chunks", () => {
    const document = processPolicy(policy());
    expect(document.sections.map((section) => section.heading)).toEqual(["Privacy Policy", "Your Rights"]);
    expect(document.sections.map((section) => section.order)).toEqual([1, 2]);
    expect(document.chunks.map((chunk) => chunk.sectionId)).toEqual(["s001", "s002"]);
    expect(document.chunks.map((chunk) => chunk.order)).toEqual([1, 2]);
    expect(document.sourceUrl).toBe("https://example.com/privacy");
  });

  it("uses a generic section when headings are unavailable", () => {
    const input = policy({ blocks: [], text: "This privacy policy explains how we collect personal information from users.\n\nWe use the information to provide services and answer user requests." });
    const document = processPolicy(input);
    expect(document.sections).toHaveLength(1);
    expect(document.sections[0].heading).toBe("Policy content");
  });

  it("removes repeated blocks and ignores empty sections", () => {
    const input = policy({ blocks: [
      { kind: "heading", text: "Privacy Policy" },
      { kind: "paragraph", text: "We collect personal information to improve services for all users over time." },
      { kind: "paragraph", text: "We collect personal information to improve services for all users over time." },
      { kind: "heading", text: "" }
    ] });
    const document = processPolicy(input);
    expect(document.sections).toHaveLength(1);
    expect(document.sections[0].content.match(/We collect/g)).toHaveLength(1);
  });

  it("chunks long sections at sentence boundaries without breaking words", () => {
    const paragraph = Array.from({ length: 130 }, () => "This sentence explains a policy practice for users.").join(" ");
    const document = processPolicy(policy({ blocks: [{ kind: "heading", text: "Long section" }, { kind: "paragraph", text: paragraph }] }));
    expect(document.chunks.length).toBeGreaterThan(1);
    expect(document.chunks.every((chunk) => chunk.wordCount <= 300)).toBe(true);
    expect(document.chunks.every((chunk) => chunk.text.endsWith("."))).toBe(true);
  });

  it("calculates deterministic document, section, and chunk word counts", () => {
    const document = processPolicy(policy());
    expect(document.totalWordCount).toBe(document.sections.reduce((total, section) => total + section.wordCount, 0));
    expect(document.chunks.every((chunk) => chunk.wordCount === chunk.text.split(/\s+/).length)).toBe(true);
  });

  it("rejects empty or unusably small policies", () => {
    expect(() => processPolicy(policy({ text: "Too short", blocks: [] }))).toThrow(PolicyProcessingError);
    expect(() => processPolicy(policy({ text: " ", blocks: [] }))).toThrow(PolicyProcessingError);
  });
});
