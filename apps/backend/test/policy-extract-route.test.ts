import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

const app = buildApp();
beforeAll(async () => app.ready());
afterAll(async () => app.close());

describe("POST /api/v1/policy/extract", () => {
  it("validates a policy URL before attempting extraction", async () => {
    const response = await app.inject({ method: "POST", url: "/api/v1/policy/extract", payload: { policyUrl: "not a url" } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "validation_error", message: "Invalid API request." });
  });
});
