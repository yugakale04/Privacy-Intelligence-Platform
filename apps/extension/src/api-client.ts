import { BACKEND_BASE_URL } from "./config.js";

const API_TIMEOUT_MS = 5_000;
const POLICY_EXTRACTION_TIMEOUT_MS = 15_000;

export interface PageInfoSubmission {
  title: string;
  url: string;
  hostname: string;
  hasReadableText: boolean;
}

export interface BackendPageInfoSuccess {
  ok: true;
  status: "ok";
  hostname: string;
  message: string;
}

export interface BackendPageInfoFailure {
  ok: false;
  code: "BACKEND_UNAVAILABLE" | "BACKEND_TIMEOUT" | "BACKEND_HTTP_ERROR" | "INVALID_BACKEND_RESPONSE";
  message: string;
}

export type BackendPageInfoResponse = BackendPageInfoSuccess | BackendPageInfoFailure;

export interface ExtractedPolicy {
  url: string;
  finalUrl: string;
  title: string;
  text: string;
  wordCount: number;
  characterCount: number;
}

export interface StructuredPolicySummary {
  totalWordCount: number;
  sections: Array<{ heading: string }>;
  chunks: unknown[];
}

export interface BackendPolicyExtractionSuccess { ok: true; policy: ExtractedPolicy; structuredPolicy: StructuredPolicySummary; }
export interface BackendPolicyExtractionFailure { ok: false; code: "BACKEND_UNAVAILABLE" | "BACKEND_TIMEOUT" | "BACKEND_HTTP_ERROR" | "INVALID_BACKEND_RESPONSE"; message: string; }
export type BackendPolicyExtractionResponse = BackendPolicyExtractionSuccess | BackendPolicyExtractionFailure;

function isBackendSuccess(value: unknown): value is Omit<BackendPageInfoSuccess, "ok"> {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return response.status === "ok" && typeof response.hostname === "string" && typeof response.message === "string";
}

export async function sendPageInfo(pageInfo: PageInfoSubmission): Promise<BackendPageInfoResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(`${BACKEND_BASE_URL}/api/v1/page-info`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(pageInfo),
      signal: controller.signal
    });

    if (!response.ok) {
      return { ok: false, code: "BACKEND_HTTP_ERROR", message: `Backend request failed with HTTP ${response.status}.` };
    }

    const body: unknown = await response.json().catch(() => null);
    if (!isBackendSuccess(body)) {
      return { ok: false, code: "INVALID_BACKEND_RESPONSE", message: "The backend returned an invalid response." };
    }

    return { ok: true, ...body };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, code: "BACKEND_TIMEOUT", message: "The backend did not respond in time." };
    }
    return { ok: false, code: "BACKEND_UNAVAILABLE", message: "Unable to connect to the backend." };
  } finally {
    clearTimeout(timer);
  }
}

function isExtractedPolicy(value: unknown): value is ExtractedPolicy {
  if (!value || typeof value !== "object") return false;
  const policy = value as Record<string, unknown>;
  return ["url", "finalUrl", "title", "text"].every((key) => typeof policy[key] === "string")
    && typeof policy.wordCount === "number" && typeof policy.characterCount === "number";
}

function isStructuredPolicySummary(value: unknown): value is StructuredPolicySummary {
  if (!value || typeof value !== "object") return false;
  const document = value as Record<string, unknown>;
  return typeof document.totalWordCount === "number" && Array.isArray(document.sections) && Array.isArray(document.chunks)
    && document.sections.every((section) => section && typeof section === "object" && typeof (section as { heading?: unknown }).heading === "string");
}

export async function extractPolicy(policyUrl: string): Promise<BackendPolicyExtractionResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POLICY_EXTRACTION_TIMEOUT_MS);
  try {
    const response = await fetch(`${BACKEND_BASE_URL}/api/v1/policy/extract`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ policyUrl }), signal: controller.signal
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && typeof body === "object" && "error" in body && typeof (body as { error?: { message?: unknown } }).error?.message === "string"
        ? (body as { error: { message: string } }).error.message : `Backend request failed with HTTP ${response.status}.`;
      return { ok: false, code: "BACKEND_HTTP_ERROR", message };
    }
    if (!body || typeof body !== "object" || (body as { success?: unknown }).success !== true || !isExtractedPolicy((body as { policy?: unknown }).policy) || !isStructuredPolicySummary((body as { structuredPolicy?: unknown }).structuredPolicy)) {
      return { ok: false, code: "INVALID_BACKEND_RESPONSE", message: "The backend returned an invalid extraction response." };
    }
    return { ok: true, policy: (body as { policy: ExtractedPolicy }).policy, structuredPolicy: (body as { structuredPolicy: StructuredPolicySummary }).structuredPolicy };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return { ok: false, code: "BACKEND_TIMEOUT", message: "The backend did not respond in time." };
    return { ok: false, code: "BACKEND_UNAVAILABLE", message: "Unable to connect to the backend." };
  } finally { clearTimeout(timer); }
}
