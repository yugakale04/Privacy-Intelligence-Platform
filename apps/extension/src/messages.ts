import type { TabInfo } from "./tab-info.js";
import type { BackendPageInfoResponse } from "./api-client.js";

export const MESSAGE_TYPES = {
  getActiveTab: "GET_ACTIVE_TAB",
  analyzePage: "ANALYZE_PAGE",
  getPageInfo: "GET_PAGE_INFO",
  contentScriptReady: "CONTENT_SCRIPT_READY"
} as const;

export type ExtensionErrorCode =
  | "NO_ACTIVE_TAB"
  | "INACCESSIBLE_PAGE"
  | "CONTENT_SCRIPT_UNAVAILABLE"
  | "MESSAGE_TIMEOUT"
  | "MESSAGE_FAILURE"
  | "INVALID_MESSAGE";

export interface ExtensionError {
  code: ExtensionErrorCode;
  message: string;
}

export interface PageInfo {
  title: string;
  url: string;
  hostname: string;
  hasMeaningfulReadableText: boolean;
}

export interface GetActiveTabMessage { type: typeof MESSAGE_TYPES.getActiveTab; }
export interface AnalyzePageMessage { type: typeof MESSAGE_TYPES.analyzePage; }
export interface GetPageInfoMessage { type: typeof MESSAGE_TYPES.getPageInfo; }
export interface ContentScriptReadyMessage { type: typeof MESSAGE_TYPES.contentScriptReady; }

export type ExtensionMessage = GetActiveTabMessage | AnalyzePageMessage | GetPageInfoMessage | ContentScriptReadyMessage;

export interface ActiveTabSuccessResponse {
  ok: true;
  tab: TabInfo;
  contentScriptLoaded: boolean;
  message: string;
}

export interface AnalyzePageSuccessResponse {
  ok: true;
  pageInfo: PageInfo;
  backend: BackendPageInfoResponse;
  message: string;
}

export interface FailureResponse {
  ok: false;
  error: ExtensionError;
}

export type ActiveTabResponse = ActiveTabSuccessResponse | FailureResponse;
export type AnalyzePageResponse = AnalyzePageSuccessResponse | FailureResponse;
export type PageInfoResponse = PageInfo | FailureResponse;

export function failure(code: ExtensionErrorCode, message: string): FailureResponse {
  return { ok: false, error: { code, message } };
}

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
  if (!value || typeof value !== "object" || !("type" in value)) {
    return false;
  }

  return Object.values(MESSAGE_TYPES).includes((value as { type: string }).type as ExtensionMessage["type"]);
}

export function isGetPageInfoMessage(value: unknown): value is GetPageInfoMessage {
  return Boolean(value && typeof value === "object" && (value as { type?: string }).type === MESSAGE_TYPES.getPageInfo);
}

export function isPageInfoResponse(value: unknown): value is PageInfoResponse {
  if (!value || typeof value !== "object") {
    return false;
  }
  if ("ok" in value && (value as { ok?: unknown }).ok === false) {
    return true;
  }
  const pageInfo = value as Partial<PageInfo>;
  return typeof pageInfo.title === "string"
    && typeof pageInfo.url === "string"
    && typeof pageInfo.hostname === "string"
    && typeof pageInfo.hasMeaningfulReadableText === "boolean";
}
