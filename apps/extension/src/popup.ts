import {
  MESSAGE_TYPES,
  type ActiveTabResponse,
  type AnalyzePageResponse,
  type FailureResponse
} from "./messages.js";

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing popup element: ${id}`);
  return element as T;
}

function setStatus(message: string, isError = false): void {
  const status = byId<HTMLParagraphElement>("status");
  status.textContent = message;
  status.dataset.state = isError ? "error" : "ready";
}

function displayError(response: FailureResponse): void {
  setStatus(response.error.message, true);
  byId<HTMLParagraphElement>("result").textContent = `Error: ${response.error.code}`;
}

function displayTab(response: ActiveTabResponse): void {
  if (!response.ok) return displayError(response);
  byId<HTMLElement>("page-title").textContent = response.tab.title;
  byId<HTMLElement>("hostname").textContent = response.tab.hostname;
  byId<HTMLElement>("url").textContent = response.tab.url;
  setStatus(response.message);
}

function displayPageInfo(response: AnalyzePageResponse): void {
  if (!response.ok) return displayError(response);
  byId<HTMLElement>("page-title").textContent = response.pageInfo.title;
  byId<HTMLElement>("hostname").textContent = response.pageInfo.hostname;
  byId<HTMLElement>("url").textContent = response.pageInfo.url;
  byId<HTMLParagraphElement>("result").textContent = response.pageInfo.hasMeaningfulReadableText
    ? "Readable page text is available."
    : "Meaningful readable page text is not available.";
  const backendResult = byId<HTMLParagraphElement>("backend-result");
  backendResult.textContent = response.backend.ok
    ? `Backend: ${response.backend.message} (${response.backend.hostname})`
    : `Backend error: ${response.backend.message}`;
  backendResult.dataset.state = response.backend.ok ? "ready" : "error";
  setStatus(response.message);
}

async function initializePopup(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.getActiveTab }) as ActiveTabResponse;
    displayTab(response);
  } catch (error) {
    console.error("Unable to initialize popup.", error);
    displayError({ ok: false, error: { code: "MESSAGE_FAILURE", message: "Unable to communicate with the extension service worker." } });
  }
}

async function analyzePage(): Promise<void> {
  setStatus("Requesting page information…");
  try {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.analyzePage }) as AnalyzePageResponse;
    displayPageInfo(response);
  } catch (error) {
    console.error("Unable to request page information.", error);
    displayError({ ok: false, error: { code: "MESSAGE_FAILURE", message: "Unable to retrieve page information." } });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  byId<HTMLButtonElement>("analyze-button").addEventListener("click", () => void analyzePage());
  void initializePopup();
});
