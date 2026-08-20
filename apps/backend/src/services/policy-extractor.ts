import * as cheerio from "cheerio";
import { isIP } from "node:net";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;
const MIN_TEXT_LENGTH = 80;

export type PolicyExtractionErrorCode =
  | "INVALID_URL"
  | "TIMEOUT"
  | "CONNECTION_FAILURE"
  | "HTTP_ERROR"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "RESPONSE_TOO_LARGE"
  | "INSUFFICIENT_CONTENT";

export class PolicyExtractionError extends Error {
  constructor(public readonly code: PolicyExtractionErrorCode, message: string) {
    super(message);
  }
}

export interface ExtractedPolicy {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  wordCount: number;
  characterCount: number;
  blocks: PolicyContentBlock[];
}

export interface PolicyContentBlock {
  kind: "heading" | "paragraph";
  text: string;
}

export interface PolicyExtractorOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

function isUnsafeHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (isIP(host) === 4) {
    const [first, second] = host.split(".").map(Number);
    return first === 10 || first === 127 || first === 0 || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
  }
  return isIP(host) === 6 && (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd"));
}

export function validatePolicyUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PolicyExtractionError("INVALID_URL", "Policy URL must be a valid HTTP or HTTPS URL.");
  }
  if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || isUnsafeHost(url.hostname)) {
    throw new PolicyExtractionError("INVALID_URL", "Policy URL is not an allowed public HTTP or HTTPS URL.");
  }
  return url;
}

async function readResponse(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new PolicyExtractionError("RESPONSE_TOO_LARGE", "Policy response exceeds the allowed size.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new PolicyExtractionError("RESPONSE_TOO_LARGE", "Policy response exceeds the allowed size.");
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(combined);
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function extractHtmlPolicy(html: string, url: string, finalUrl: string): ExtractedPolicy {
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, footer, header, form, aside, svg, iframe, [aria-hidden='true']").remove();
  const title = normalizeText($("title").first().text()) || normalizeText($("h1").first().text()) || "Privacy Policy";
  const root = $("main, article, [role='main']").first().length ? $("main, article, [role='main']").first() : $("body");
  const blocks: PolicyContentBlock[] = [];
  const seen = new Set<string>();
  root.find("h1, h2, h3, h4, p, li").each((_index, element) => {
    const text = normalizeText($(element).text());
    if (text && !seen.has(text)) {
      seen.add(text);
      blocks.push({ kind: /^h[1-4]$/i.test(element.tagName) ? "heading" : "paragraph", text });
    }
  });
  const text = blocks.map((block) => block.text).join("\n\n");
  if (text.length < MIN_TEXT_LENGTH) {
    throw new PolicyExtractionError("INSUFFICIENT_CONTENT", "The policy page did not contain enough readable content.");
  }
  return { url, finalUrl, title, text, wordCount: text.split(/\s+/).length, characterCount: text.length, blocks };
}

export async function extractPolicy(policyUrl: string, options: PolicyExtractorOptions = {}): Promise<ExtractedPolicy> {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes || MAX_RESPONSE_BYTES;
  const originalUrl = validatePolicyUrl(policyUrl);
  let currentUrl = originalUrl;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, { redirect: "manual", signal: controller.signal, headers: { accept: "text/html,application/xhtml+xml" } });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new PolicyExtractionError("TIMEOUT", "Policy request timed out.");
      throw new PolicyExtractionError("CONNECTION_FAILURE", "Unable to connect to the policy URL.");
    } finally {
      clearTimeout(timer);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new PolicyExtractionError("HTTP_ERROR", "Policy URL redirected without a destination.");
      currentUrl = validatePolicyUrl(new URL(location, currentUrl).href);
      continue;
    }
    if (!response.ok) throw new PolicyExtractionError("HTTP_ERROR", `Policy URL returned HTTP ${response.status}.`);
    if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
      throw new PolicyExtractionError("UNSUPPORTED_CONTENT_TYPE", "Policy URL did not return HTML content.");
    }
    const html = await readResponse(response, maxResponseBytes);
    return extractHtmlPolicy(html, originalUrl.href, response.url || currentUrl.href);
  }
  throw new PolicyExtractionError("HTTP_ERROR", "Policy URL exceeded the redirect limit.");
}
