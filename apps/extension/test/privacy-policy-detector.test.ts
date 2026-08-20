import { describe, expect, it } from "vitest";
import { detectPrivacyPolicy } from "../src/privacy-policy-detector.js";

function detect(links: Array<{ text: string; href: string }>, overrides: Partial<Parameters<typeof detectPrivacyPolicy>[0]> = {}) {
  return detectPrivacyPolicy({
    pageUrl: "https://example.com/products",
    pageTitle: "Products",
    pageText: "Welcome to Example.",
    links,
    ...overrides
  });
}

describe("privacy-policy detector", () => {
  it("detects an exact Privacy Policy link", () => {
    const result = detect([{ text: "Privacy Policy", href: "/privacy-policy" }]);
    expect(result).toMatchObject({ found: true, confidence: 100 });
    expect(result.candidates[0].url).toBe("https://example.com/privacy-policy");
  });

  it("detects a Privacy Notice link", () => {
    expect(detect([{ text: "Privacy Notice", href: "/privacy-notice" }]).candidates[0].confidence).toBe(100);
  });

  it("detects a privacy-policy URL with weak link text", () => {
    const result = detect([{ text: "Learn more", href: "/legal/privacy-policy" }]);
    expect(result).toMatchObject({ found: true, confidence: 80 });
  });

  it("resolves relative privacy-policy URLs", () => {
    expect(detect([{ text: "Privacy", href: "privacy" }]).candidates[0].url).toBe("https://example.com/privacy");
  });

  it("identifies the current page as a privacy policy", () => {
    const result = detect([], {
      pageUrl: "https://example.com/privacy-policy",
      pageTitle: "Privacy Policy",
      pageText: "Our privacy policy explains how we collect personal data."
    });
    expect(result).toMatchObject({ found: true, currentPageIsPolicy: true, confidence: 100 });
  });

  it("returns no policy when no matching links exist", () => {
    expect(detect([{ text: "About us", href: "/about" }])).toMatchObject({ found: false, confidence: 0, candidates: [] });
  });

  it("does not treat Cookie Policy as a privacy policy", () => {
    expect(detect([{ text: "Cookie Policy", href: "/cookie-policy" }])).toMatchObject({ found: false });
  });

  it("excludes privacy blog articles", () => {
    expect(detect([{ text: "Privacy tips", href: "/blog/privacy-tips" }])).toMatchObject({ found: false });
  });

  it("removes duplicate candidate URLs", () => {
    const result = detect([
      { text: "Privacy", href: "/privacy" },
      { text: "Privacy Policy", href: "https://example.com/privacy" }
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].text).toBe("Privacy Policy");
  });

  it("ignores invalid href values", () => {
    const result = detect([
      { text: "Privacy Policy", href: "javascript:void(0)" },
      { text: "Privacy Policy", href: "mailto:privacy@example.com" },
      { text: "Privacy Policy", href: "" }
    ]);
    expect(result).toMatchObject({ found: false });
  });

  it("ranks multiple candidates by deterministic confidence", () => {
    const result = detect([
      { text: "Privacy Notice", href: "/notice" },
      { text: "Privacy Policy", href: "/privacy-policy" },
      { text: "Privacy", href: "/privacy" }
    ]);
    expect(result.candidates.map((candidate) => candidate.text)).toEqual(["Privacy Policy", "Privacy", "Privacy Notice"]);
    expect(result.candidates.map((candidate) => candidate.confidence)).toEqual([100, 96, 95]);
  });
});
