import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pageInfo = {
  title: "Example Domain",
  url: "https://example.com/",
  hostname: "example.com",
  hasReadableText: true
};

beforeEach(() => {
  vi.stubGlobal("__BACKEND_BASE_URL__", "http://127.0.0.1:3000");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("backend API client", () => {
  it("posts only page metadata and accepts a valid backend response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: "ok", hostname: "example.com", message: "Page information received."
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { sendPageInfo } = await import("../src/api-client.js");

    await expect(sendPageInfo(pageInfo)).resolves.toEqual({
      ok: true, status: "ok", hostname: "example.com", message: "Page information received."
    });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3000/api/v1/page-info", expect.objectContaining({
      method: "POST",
      body: JSON.stringify(pageInfo)
    }));
  });

  it("returns controlled errors for HTTP and invalid responses", async () => {
    const { sendPageInfo } = await import("../src/api-client.js");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Unavailable", { status: 503 })));
    await expect(sendPageInfo(pageInfo)).resolves.toMatchObject({ ok: false, code: "BACKEND_HTTP_ERROR" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));
    await expect(sendPageInfo(pageInfo)).resolves.toMatchObject({ ok: false, code: "INVALID_BACKEND_RESPONSE" });
  });
});
