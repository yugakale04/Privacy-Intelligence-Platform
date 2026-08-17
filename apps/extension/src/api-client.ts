import { BACKEND_BASE_URL } from "./config.js";

const API_TIMEOUT_MS = 5_000;

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
