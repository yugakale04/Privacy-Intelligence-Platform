import { describe, expect, it } from "vitest";
import { isSupportedPage, toTabInfo } from "../src/tab-info.js";

describe("tab information", () => {
  it("formats an accessible HTTP tab", () => {
    expect(toTabInfo({ id: 7, title: "Example", url: "https://example.com/privacy" })).toEqual({
      id: 7,
      title: "Example",
      hostname: "example.com",
      url: "https://example.com/privacy"
    });
  });

  it("rejects missing and unsupported tab URLs", () => {
    expect(toTabInfo({ id: 7 })).toBeNull();
    expect(isSupportedPage("chrome://extensions")).toBe(false);
    expect(isSupportedPage("https://example.com")).toBe(true);
  });
});
