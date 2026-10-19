import { describe, expect, it } from "vitest";
import type { LookupAddress } from "node:dns";
import { extractHtmlPolicy, extractPolicy, PolicyExtractionError, type PolicyExtractorOptions, validatePolicyUrl } from "../src/services/policy-extractor.js";

const policyHtml = `<!doctype html><html><head><title>Example Privacy Policy</title><style>.x{}</style></head><body><header>Site navigation</header><nav>Navigation</nav><div class="cookie-consent-banner">Accept cookies now</div><main><h1>Privacy Policy</h1><p>We collect personal information to provide and improve our services for all users.</p><p>We collect personal information to provide and improve our services for all users.</p><h2>Your choices</h2><p>You may contact us to access, update, or delete your personal information at any time.</p></main><footer>Footer links</footer><script>bad()</script></body></html>`;
const publicAddresses: LookupAddress[] = [{ address: "93.184.216.34", family: 4 }];
const lookupPublic: NonNullable<PolicyExtractorOptions["lookupImpl"]> = async () => publicAddresses;

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
    const policy = await extractPolicy("https://example.com/privacy", { lookupImpl: lookupPublic, fetchImpl: async () => htmlResponse(policyHtml) });
    expect(policy).toMatchObject({ url: "https://example.com/privacy", finalUrl: "https://example.com/privacy", title: "Example Privacy Policy" });
    expect(policy.text).toContain("Privacy Policy");
    expect(policy.text).not.toContain("Navigation");
    expect(policy.text).not.toContain("Accept cookies now");
    expect(policy.text.match(/We collect personal information/g)).toHaveLength(2);
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
    }, lookupImpl: lookupPublic });
    expect(policy).toMatchObject({ url: "https://example.com/privacy", finalUrl: "https://example.com/legal/privacy" });
  });

  it("rejects invalid URLs", async () => {
    for (const url of [
      "not a URL",
      "javascript:alert(1)",
      "ftp://example.com/privacy",
      "http://127.0.0.1/private",
      "http://100.64.0.1/private",
      "http://[::1]/private",
      "http://[fd00::1]/private",
      "https://user:pass@example.com/privacy"
    ]) {
      expect(() => validatePolicyUrl(url)).toThrowError(PolicyExtractionError);
    }
  });

  it("handles connection failures, HTTP errors, and timeouts", async () => {
    await expectCode(extractPolicy("https://example.com/privacy", { lookupImpl: lookupPublic, fetchImpl: async () => { throw new Error("offline"); } }), "CONNECTION_FAILURE");
    await expectCode(extractPolicy("https://example.com/privacy", { lookupImpl: lookupPublic, fetchImpl: async () => htmlResponse("missing", { status: 404 }) }), "HTTP_ERROR");
    await expectCode(extractPolicy("https://example.com/privacy", { lookupImpl: lookupPublic, fetchImpl: async () => htmlResponse("failure", { status: 500 }) }), "HTTP_ERROR");
    await expectCode(extractPolicy("https://example.com/privacy", { lookupImpl: lookupPublic, timeoutMs: 5, fetchImpl: async () => new Promise<Response>(() => {}) }), "TIMEOUT");
    await expectCode(extractPolicy("https://example.com/privacy", {
      lookupImpl: lookupPublic,
      timeoutMs: 5,
      fetchImpl: async () => new Response(new ReadableStream({ start() {} }), { headers: { "content-type": "text/html" } })
    }), "TIMEOUT");
    await expectCode(extractPolicy("https://example.com/privacy", {
      lookupImpl: async () => new Promise<LookupAddress[]>(() => {}),
      timeoutMs: 5,
      fetchImpl: async () => htmlResponse(policyHtml)
    }), "TIMEOUT");
  });

  it("rejects unsupported, oversized, and empty content", async () => {
    await expectCode(extractPolicy("https://example.com/privacy", { lookupImpl: lookupPublic, fetchImpl: async () => new Response("PDF", { headers: { "content-type": "application/pdf" } }) }), "UNSUPPORTED_CONTENT_TYPE");
    await expectCode(extractPolicy("https://example.com/privacy", { lookupImpl: lookupPublic, maxResponseBytes: 10, fetchImpl: async () => htmlResponse(policyHtml) }), "RESPONSE_TOO_LARGE");
    await expectCode(extractPolicy("https://example.com/privacy", {
      lookupImpl: lookupPublic,
      maxResponseBytes: 10,
      fetchImpl: async () => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(11));
          controller.close();
        }
      }), { headers: { "content-type": "text/html" } })
    }), "RESPONSE_TOO_LARGE");
    await expectCode(extractPolicy("https://example.com/privacy", { lookupImpl: lookupPublic, fetchImpl: async () => htmlResponse("<html><body></body></html>") }), "INSUFFICIENT_CONTENT");
  });

  it("rejects non-public resolved addresses before connecting", async () => {
    const fetchImpl = async () => htmlResponse(policyHtml);
    for (const address of ["10.0.0.2", "100.64.0.1", "192.168.1.5", "::1", "fd00::1", "fe80::1"]) {
      await expectCode(extractPolicy("https://example.com/privacy", {
        lookupImpl: async () => [{ address, family: address.includes(":") ? 6 : 4 }],
        fetchImpl
      }), "INVALID_URL");
    }
  });

  it("rejects unsafe redirect destinations before a second request", async () => {
    let requests = 0;
    await expectCode(extractPolicy("https://example.com/privacy", {
      lookupImpl: async (hostname) => hostname === "example.com" ? publicAddresses : [{ address: "10.0.0.7", family: 4 }],
      fetchImpl: async () => {
        requests += 1;
        return new Response(null, { status: 302, headers: { location: "https://internal.example/private" } });
      }
    }), "INVALID_URL");
    expect(requests).toBe(1);

    await expectCode(extractPolicy("https://example.com/privacy", {
      lookupImpl: lookupPublic,
      fetchImpl: async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } })
    }), "INVALID_URL");
  });

  it("keeps meaningful headings and paragraphs when cleaning HTML", () => {
    const policy = extractHtmlPolicy(policyHtml, "https://example.com/privacy", "https://example.com/privacy");
    expect(policy.text).toContain("Your choices");
    expect(policy.text).toContain("access, update, or delete");
    expect(policy.text).not.toContain("Footer links");
    expect(policy.text).not.toContain("Accept cookies now");
  });
});
