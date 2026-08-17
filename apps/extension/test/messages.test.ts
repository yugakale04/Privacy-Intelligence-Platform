import { describe, expect, it } from "vitest";
import { isExtensionMessage, isGetPageInfoMessage, isPageInfoResponse, MESSAGE_TYPES } from "../src/messages.js";

describe("extension message contract", () => {
  it("accepts only known extension message types", () => {
    expect(isExtensionMessage({ type: MESSAGE_TYPES.analyzePage })).toBe(true);
    expect(isExtensionMessage({ type: "UNKNOWN" })).toBe(false);
    expect(isExtensionMessage(null)).toBe(false);
  });

  it("recognizes content-script page-info requests", () => {
    expect(isGetPageInfoMessage({ type: MESSAGE_TYPES.getPageInfo })).toBe(true);
    expect(isGetPageInfoMessage({ type: MESSAGE_TYPES.analyzePage })).toBe(false);
  });

  it("accepts only structured page-info responses", () => {
    expect(isPageInfoResponse({ title: "Example", url: "https://example.com", hostname: "example.com", hasMeaningfulReadableText: true })).toBe(true);
    expect(isPageInfoResponse({ title: "Example" })).toBe(false);
  });
});
