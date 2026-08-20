import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const app = buildApp();

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("POST /api/v1/page-info", () => {
  it("accepts the minimum page metadata and returns a structured response", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/page-info",
      payload: {
        title: "Example Domain",
        url: "https://example.com/",
        hostname: "example.com",
        hasReadableText: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      hostname: "example.com",
      message: "Page information received."
    });
  });

  it("rejects invalid and unexpected request fields", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/page-info",
      payload: { hostname: "example.com", unexpected: "data" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "validation_error",
      message: "Invalid API request."
    });
  });
});
