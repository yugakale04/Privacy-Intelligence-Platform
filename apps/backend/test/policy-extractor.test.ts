import { describe, expect, it } from "vitest";
import { extractHtmlPolicy, extractPolicy, PolicyExtractionError } from "../src/services/policy-extractor.js";

const policyHtml = `<!doctype html><html><head><title>Example Privacy Policy</title><style>.x{}</style></head><body><header>Site navigation</header><nav>Navigation</nav><main><h1>Privacy Policy</h1><p>We collect personal information to provide and improve our services for all users.</p><p>We collect personal information to provide and improve our services for all users.</p><h2>Your choices</h2><p>You may contact us to access, update, or delete your personal information at any time.</p></main><footer>Footer links</footer><script>bad()</script></body></html>`;

function htmlResponse(html: string, options: { status?: number; url?: string; headers?: Record<string, string> } = {}): Response {
  const response = new Response(html, { status: options.status || 200, headers: { "content-type": "text/html", ...options.headers } });
  Object.defineProperty(response, "url", { value: options.url || "https://example.com/privacy" });
  return response;
}

async function expectCode(operation: Promise<unknown>, code: PolicyExtractionError["code"]): Promise<void> {
  await expect(operation).rejects.toMatchObject({ code });
}

describe("policy extraction service", () => {
  it("extracts and cleans a valid HTML policy with title and counts", async () => {
    const policy = await extractPolicy("https://example.com/privacy", { fetchImpl: async () => htmlResponse(policyHtml) });
    expect(policy).toMatchObject({ url: "https://example.com/privacy", finalUrl: "https://example.com/privacy", title: "Example Privacy Policy" });
    expect(policy.text).toContain("Privacy Policy");
    expect(policy.text).not.toContain("Navigation");
    expect(policy.text.match(/We collect personal information/g)).toHaveLength(1);
    expect(policy.wordCount).toBe(policy.text.split(/\s+/).length);
    expect(policy.characterCount).toBe(policy.text.length);
  });

  it("follows a relative redirect and retains original and final URLs", async () => {
    let calls = 0;
    const policy = await extractPolicy("https://example.com/privacy", { fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response(null, { status: 302, headers: { location: "/legal/privacy" } })
        : htmlResponse(policyHtml, { url: "https://example.com/legal/privacy" });
    } });
    expect(policy).toMatchObject({ url: "https://example.com/privacy", finalUrl: "https://example.com/legal/privacy" });
  });

  it("rejects invalid URLs", async () => {
    await expectCode(extractPolicy("javascript:alert(1)"), "INVALID_URL");
    await expectCode(extractPolicy("http://127.0.0.1/private"), "INVALID_URL");
  });

  it("handles connection failures, HTTP errors, and timeouts", async () => {
    await expectCode(extractPolicy("https://example.com/privacy", { fetchImpl: async () => { throw new Error("offline"); } }), "CONNECTION_FAILURE");
    await expectCode(extractPolicy("https://example.com/privacy", { fetchImpl: async () => htmlResponse("missing", { status: 404 }) }), "HTTP_ERROR");
    await expectCode(extractPolicy("https://example.com/privacy", { fetchImpl: async () => htmlResponse("failure", { status: 500 }) }), "HTTP_ERROR");
    await expectCode(extractPolicy("https://example.com/privacy", { timeoutMs: 1, fetchImpl: async () => { throw new DOMException("aborted", "AbortError"); } }), "TIMEOUT");
  });

  it("rejects unsupported, oversized, and empty content", async () => {
    await expectCode(extractPolicy("https://example.com/privacy", { fetchImpl: async () => new Response("PDF", { headers: { "content-type": "application/pdf" } }) }), "UNSUPPORTED_CONTENT_TYPE");
    await expectCode(extractPolicy("https://example.com/privacy", { maxResponseBytes: 10, fetchImpl: async () => htmlResponse(policyHtml) }), "RESPONSE_TOO_LARGE");
    await expectCode(extractPolicy("https://example.com/privacy", { fetchImpl: async () => htmlResponse("<html><body></body></html>") }), "INSUFFICIENT_CONTENT");
  });

  it("keeps meaningful headings and paragraphs when cleaning HTML", () => {
    const policy = extractHtmlPolicy(policyHtml, "https://example.com/privacy", "https://example.com/privacy");
    expect(policy.text).toContain("Your choices");
    expect(policy.text).toContain("access, update, or delete");
  });
});
