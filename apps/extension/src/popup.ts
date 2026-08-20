import {
  MESSAGE_TYPES,
  type ActiveTabResponse,
  type AnalyzePageResponse,
  type FailureResponse,
  type PrivacyPolicyDetectionResponse,
  type PolicyExtractionResponse
} from "./messages.js";

let selectedPolicyUrl: string | null = null;

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

function displayPolicyDetection(response: PrivacyPolicyDetectionResponse): void {
  const result = byId<HTMLParagraphElement>("policy-result");
  if ("error" in response) {
    result.textContent = `Policy detection error: ${response.error.message}`;
    result.dataset.state = "error";
    return;
  }
  if (!response.found) {
    selectedPolicyUrl = null;
    result.textContent = "No likely privacy policy was found on this page.";
    result.dataset.state = "ready";
    return;
  }
  const bestCandidate = response.candidates[0];
  selectedPolicyUrl = bestCandidate.url;
  result.textContent = `${response.currentPageIsPolicy ? "Current page is the policy" : "Policy found"}: ${bestCandidate.text} (${response.confidence}%). ${bestCandidate.reason} URL: ${bestCandidate.url}`;
  result.dataset.state = "ready";
}

function displayExtraction(response: PolicyExtractionResponse): void {
  const result = byId<HTMLParagraphElement>("extraction-result");
  if ("error" in response) {
    result.textContent = `Extraction error: ${response.error.message}`;
    result.dataset.state = "error";
    return;
  }
  if (!response.ok) {
    result.textContent = `Extraction error: ${response.message}`;
    result.dataset.state = "error";
    return;
  }
  const preview = response.policy.text.slice(0, 300);
  const headings = response.structuredPolicy.sections.map((section) => section.heading).join(", ");
  result.textContent = `Extracted: ${response.policy.title}; ${response.structuredPolicy.totalWordCount} words; ${response.structuredPolicy.sections.length} sections; ${response.structuredPolicy.chunks.length} chunks; headings: ${headings}; URL: ${response.policy.finalUrl}; Preview: ${preview}${response.policy.text.length > preview.length ? "…" : ""}`;
  result.dataset.state = "ready";
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

async function findPrivacyPolicy(): Promise<void> {
  const result = byId<HTMLParagraphElement>("policy-result");
  result.textContent = "Searching page links for a privacy policy…";
  result.dataset.state = "ready";
  try {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.findPrivacyPolicy }) as PrivacyPolicyDetectionResponse;
    displayPolicyDetection(response);
  } catch (error) {
    console.error("Unable to detect a privacy policy.", error);
    result.textContent = "Policy detection error: Unable to communicate with the extension service worker.";
    result.dataset.state = "error";
  }
}

async function extractSelectedPolicy(): Promise<void> {
  const result = byId<HTMLParagraphElement>("extraction-result");
  if (!selectedPolicyUrl) {
    result.textContent = "Find a privacy policy before requesting extraction.";
    result.dataset.state = "error";
    return;
  }
  result.textContent = "Extracting selected privacy policy…";
  result.dataset.state = "ready";
  try {
    const response = await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.extractPrivacyPolicy, policyUrl: selectedPolicyUrl }) as PolicyExtractionResponse;
    displayExtraction(response);
  } catch (error) {
    console.error("Unable to extract privacy policy.", error);
    result.textContent = "Extraction error: Unable to communicate with the extension service worker.";
    result.dataset.state = "error";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  byId<HTMLButtonElement>("analyze-button").addEventListener("click", () => void analyzePage());
  byId<HTMLButtonElement>("find-policy-button").addEventListener("click", () => void findPrivacyPolicy());
  byId<HTMLButtonElement>("extract-policy-button").addEventListener("click", () => void extractSelectedPolicy());
  void initializePopup();
});
