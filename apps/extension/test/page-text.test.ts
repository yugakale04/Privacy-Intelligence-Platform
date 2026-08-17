import { describe, expect, it } from "vitest";
import { hasMeaningfulReadableText } from "../src/page-text.js";

describe("readable page text check", () => {
  it("requires at least 100 non-whitespace characters", () => {
    expect(hasMeaningfulReadableText("short text")).toBe(false);
    expect(hasMeaningfulReadableText("a ".repeat(50))).toBe(false);
    expect(hasMeaningfulReadableText("a".repeat(100))).toBe(true);
  });
});
