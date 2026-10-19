import * as cheerio from "cheerio";
import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { isIP, type LookupFunction } from "node:net";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_REDIRECTS = 5;
const MIN_TEXT_LENGTH = 80;
const MAX_EXTRACTED_TEXT_LENGTH = 2_000_000;
const UNSAFE_IPV4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
];

export type PolicyExtractionErrorCode =
  | "INVALID_URL"
  | "TIMEOUT"
  | "CONNECTION_FAILURE"
  | "HTTP_ERROR"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "RESPONSE_TOO_LARGE"
  | "INSUFFICIENT_CONTENT"
  | "PARSING_FAILURE";

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
  lookupImpl?: typeof dnsLookup;
}

function ipv4Number(address: string): number {
  return address.split(".").reduce((value, part) => ((value << 8) | Number(part)) >>> 0, 0);
}

function ipv4InRange(address: string, network: string, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4Number(address) & mask) === (ipv4Number(network) & mask);
}

function isUnsafeAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    return UNSAFE_IPV4_RANGES.some(([network, prefix]) => ipv4InRange(address, network, prefix));
  }
  if (family !== 6) return true;

  const expanded = expandIpv6(address);
  if (!expanded) return true;
  const first = Number.parseInt(expanded.slice(0, 4), 16);
  const second = Number.parseInt(expanded.slice(4, 8), 16);
  const third = Number.parseInt(expanded.slice(8, 12), 16);
  return (first & 0xe000) !== 0x2000
    || (first === 0x2001 && second <= 0x01ff)
    || (first === 0x2001 && second === 0x0db8)
    || first === 0x2002
    || (first === 0x3fff && (second & 0xfff0) === 0);
}

function expandIpv6(address: string): string | null {
  const halves = address.toLowerCase().split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right];
  return groups.length === 8 && groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))
    ? groups.map((group) => group.padStart(4, "0")).join("")
    : null;
}

function isUnsafeHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host.endsWith(".localhost") || (isIP(host) !== 0 && isUnsafeAddress(host));
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

function resolveRedirectUrl(location: string, currentUrl: URL): URL {
  try {
    return validatePolicyUrl(new URL(location, currentUrl).href);
  } catch (error) {
    if (error instanceof PolicyExtractionError) throw error;
    throw new PolicyExtractionError("INVALID_URL", "Policy redirect destination is invalid.");
  }
}

async function resolvePublicAddresses(url: URL, lookupImpl: typeof dnsLookup): Promise<LookupAddress[]> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: LookupAddress[];
  try {
    addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await lookupImpl(hostname, { all: true, verbatim: true });
  } catch {
    throw new PolicyExtractionError("CONNECTION_FAILURE", "Unable to resolve the policy URL.");
  }
  if (!addresses.length) throw new PolicyExtractionError("CONNECTION_FAILURE", "Unable to resolve the policy URL.");
  if (addresses.some(({ address }) => isUnsafeAddress(address))) {
    throw new PolicyExtractionError("INVALID_URL", "Policy URL resolved to a non-public network address.");
  }
  return addresses;
}

function requestPinnedAddress(url: URL, addresses: LookupAddress[], signal: AbortSignal, maxBytes: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const lookup: LookupFunction = (_hostname, options, callback) => {
      const matching = options.family ? addresses.filter((entry) => entry.family === options.family) : addresses;
      const selected = matching[0];
      if (!selected) {
        callback(Object.assign(new Error("No address is available for the requested IP family."), { code: "ENOTFOUND" }), "", 0);
      } else if (options.all) {
        callback(null, matching);
      } else {
        callback(null, selected.address, selected.family);
      }
    };
    const transport = url.protocol === "https:" ? httpsGet : httpGet;
    const request = transport(url, {
      signal,
      headers: { accept: "text/html,application/xhtml+xml", "accept-encoding": "identity" },
      lookup
    }, (incoming) => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (typeof value === "string") headers.set(name, value);
        else if (Array.isArray(value)) headers.set(name, value.join(", "));
      }
      const body = incoming.statusCode === 204 || incoming.statusCode === 304 ? null : new ReadableStream<Uint8Array>({
        start(controller) {
          let totalBytes = 0;
          let ended = false;
          incoming.on("data", (chunk: Buffer | string) => {
            const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
            totalBytes += bytes.byteLength;
            if (totalBytes > maxBytes) {
              ended = true;
              incoming.destroy();
              controller.error(new PolicyExtractionError("RESPONSE_TOO_LARGE", "Policy response exceeds the allowed size."));
            } else {
              controller.enqueue(bytes);
            }
          });
          incoming.on("end", () => { if (!ended) controller.close(); });
          incoming.on("error", (error: Error) => { if (!ended) controller.error(error); });
        },
        cancel() {
          incoming.destroy();
        }
      });
      resolve(new Response(body, { status: incoming.statusCode || 502, headers }));
    });
    request.on("error", reject);
  });
}

function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The policy request timed out.", "AbortError"));
      return;
    }
    signal.addEventListener("abort", () => reject(new DOMException("The policy request timed out.", "AbortError")), { once: true });
  });
}

async function discardResponse(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

async function readResponse(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await discardResponse(response);
    throw new PolicyExtractionError("RESPONSE_TOO_LARGE", "Policy response exceeds the allowed size.");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), waitForAbort(signal)]);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new PolicyExtractionError("RESPONSE_TOO_LARGE", "Policy response exceeds the allowed size.");
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
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
  $("script, style, noscript, nav, footer, header, form, aside, svg, iframe, button, [hidden], [aria-hidden='true']").remove();
  $("[id], [class]").each((_index, element) => {
    const identity = `${$(element).attr("id") || ""} ${$(element).attr("class") || ""}`;
    if (/(?:^|[\s_-])(?:cookie[-_]?(?:banner|consent|notice|popup|modal)|onetrust[-_]banner|cc-window)(?:$|[\s_-])/i.test(identity)) {
      $(element).remove();
    }
  });
  const title = normalizeText($("title").first().text()) || normalizeText($("h1").first().text()) || "Privacy Policy";
  const root = $("main, article, [role='main']").first().length ? $("main, article, [role='main']").first() : $("body");
  const blocks: PolicyContentBlock[] = [];
  root.find("h1, h2, h3, h4, p, li").each((_index, element) => {
    const text = normalizeText($(element).text());
    if (text) {
      blocks.push({ kind: /^h[1-4]$/i.test(element.tagName) ? "heading" : "paragraph", text });
    }
  });
  const text = blocks.map((block) => block.text).join("\n\n");
  if (text.length > MAX_EXTRACTED_TEXT_LENGTH) {
    throw new PolicyExtractionError("RESPONSE_TOO_LARGE", "Extracted policy text exceeds the allowed size.");
  }
  if (text.length < MIN_TEXT_LENGTH) {
    throw new PolicyExtractionError("INSUFFICIENT_CONTENT", "The policy page did not contain enough readable content.");
  }
  return { url, finalUrl, title, text, wordCount: text.split(/\s+/).length, characterCount: text.length, blocks };
}

export async function extractPolicy(policyUrl: string, options: PolicyExtractorOptions = {}): Promise<ExtractedPolicy> {
  const lookupImpl = options.lookupImpl || dnsLookup;
  const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes || MAX_RESPONSE_BYTES;
  const originalUrl = validatePolicyUrl(policyUrl);
  let currentUrl = originalUrl;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const addresses = await Promise.race([
        resolvePublicAddresses(currentUrl, lookupImpl),
        waitForAbort(controller.signal)
      ]);
      const fetchResponse = options.fetchImpl
        ? options.fetchImpl(currentUrl, { redirect: "manual", signal: controller.signal, headers: { accept: "text/html,application/xhtml+xml" } })
        : requestPinnedAddress(currentUrl, addresses, controller.signal, maxResponseBytes);
      const response = await Promise.race([fetchResponse, waitForAbort(controller.signal)]);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) {
          await discardResponse(response);
          throw new PolicyExtractionError("HTTP_ERROR", "Policy URL redirected without a destination.");
        }
        currentUrl = resolveRedirectUrl(location, currentUrl);
        await discardResponse(response);
        continue;
      }
      if (!response.ok) {
        await discardResponse(response);
        throw new PolicyExtractionError("HTTP_ERROR", `Policy URL returned HTTP ${response.status}.`);
      }
      const contentType = response.headers.get("content-type")?.toLowerCase() || "";
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
        await discardResponse(response);
        throw new PolicyExtractionError("UNSUPPORTED_CONTENT_TYPE", "Policy URL did not return HTML content.");
      }
      const html = await readResponse(response, maxResponseBytes, controller.signal);
      try {
        return extractHtmlPolicy(html, originalUrl.href, currentUrl.href);
      } catch (error) {
        if (error instanceof PolicyExtractionError) throw error;
        throw new PolicyExtractionError("PARSING_FAILURE", "Unable to parse the policy document.");
      }
    }
    throw new PolicyExtractionError("HTTP_ERROR", "Policy URL exceeded the redirect limit.");
  } catch (error) {
    if (error instanceof PolicyExtractionError) throw error;
    if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new PolicyExtractionError("TIMEOUT", "Policy request timed out.");
    }
    throw new PolicyExtractionError("CONNECTION_FAILURE", "Unable to connect to the policy URL.");
  } finally {
    clearTimeout(timer);
  }
}
