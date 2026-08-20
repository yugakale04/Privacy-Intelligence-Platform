import {
  failure,
  isExtractPrivacyPolicyMessage,
  isExtensionMessage,
  isPageInfoResponse,
  isPrivacyPolicyDetectionResponse,
  MESSAGE_TYPES,
  type ActiveTabResponse,
  type AnalyzePageResponse,
  type PageInfoResponse,
  type PolicyExtractionResponse,
  type PrivacyPolicyDetectionResponse
} from "./messages.js";
import { extractPolicy, sendPageInfo } from "./api-client.js";
import { isSupportedPage, toTabInfo, type TabInfo } from "./tab-info.js";

const MESSAGE_TIMEOUT_MS = 5_000;

class MessageTimeoutError extends Error {
  constructor() {
    super("The content script did not respond in time.");
  }
}

function withTimeout<T>(operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new MessageTimeoutError()), MESSAGE_TIMEOUT_MS);
    operation.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); }
    );
  });
}

function isFailure(value: TabInfo | PageInfoResponse | PrivacyPolicyDetectionResponse | ReturnType<typeof failure>): value is ReturnType<typeof failure> {
  return "ok" in value && value.ok === false;
}

async function getCurrentTab(): Promise<TabInfo | ReturnType<typeof failure>> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const tabInfo = tab ? toTabInfo(tab) : null;
    if (!tabInfo) {
      return failure("NO_ACTIVE_TAB", "No accessible active tab information is available.");
    }
    if (!isSupportedPage(tabInfo.url)) {
      return failure("INACCESSIBLE_PAGE", "This page cannot be accessed. Open a regular HTTP or HTTPS webpage.");
    }
    return tabInfo;
  } catch (error) {
    console.error("Unable to read the active tab.", error);
    return failure("NO_ACTIVE_TAB", "Unable to read the active tab.");
  }
}

async function injectContentScript(tabId: number): Promise<ReturnType<typeof failure> | null> {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return null;
  } catch (error) {
    console.warn("Content script injection failed.", error);
    return failure("INACCESSIBLE_PAGE", "The page is not accessible to the extension.");
  }
}

async function getActiveTabResponse(): Promise<ActiveTabResponse> {
  const tab = await getCurrentTab();
  if (isFailure(tab)) {
    return tab;
  }
  const injectionFailure = await injectContentScript(tab.id);
  if (injectionFailure) {
    return injectionFailure;
  }
  return { ok: true, tab, contentScriptLoaded: true, message: "Extension is ready." };
}

function messageFailure(error: unknown): ReturnType<typeof failure> {
  if (error instanceof MessageTimeoutError) {
    return failure("MESSAGE_TIMEOUT", "The page did not respond in time. Try again.");
  }
  return failure("CONTENT_SCRIPT_UNAVAILABLE", "The page information service is unavailable. Try reopening the popup.");
}

async function requestPageInfo(tabId: number): Promise<PageInfoResponse> {
  try {
    const response: unknown = await withTimeout(chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.getPageInfo }));
    return isPageInfoResponse(response)
      ? response
      : failure("MESSAGE_FAILURE", "The page returned an invalid information response.");
  } catch {
    const injectionFailure = await injectContentScript(tabId);
    if (injectionFailure) {
      return injectionFailure;
    }
    try {
      const response: unknown = await withTimeout(chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.getPageInfo }));
      return isPageInfoResponse(response)
        ? response
        : failure("MESSAGE_FAILURE", "The page returned an invalid information response.");
    } catch (error) {
      return messageFailure(error);
    }
  }
}

async function requestPrivacyPolicyDetection(tabId: number): Promise<PrivacyPolicyDetectionResponse> {
  try {
    const response: unknown = await withTimeout(chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.findPrivacyPolicy }));
    return isPrivacyPolicyDetectionResponse(response)
      ? response
      : failure("MESSAGE_FAILURE", "The page returned an invalid policy-detection response.");
  } catch {
    const injectionFailure = await injectContentScript(tabId);
    if (injectionFailure) return injectionFailure;
    try {
      const response: unknown = await withTimeout(chrome.tabs.sendMessage(tabId, { type: MESSAGE_TYPES.findPrivacyPolicy }));
      return isPrivacyPolicyDetectionResponse(response)
        ? response
        : failure("MESSAGE_FAILURE", "The page returned an invalid policy-detection response.");
    } catch (error) {
      return messageFailure(error);
    }
  }
}

async function analyzePage(): Promise<AnalyzePageResponse> {
  const tab = await getCurrentTab();
  if (isFailure(tab)) {
    return tab;
  }
  const pageInfo = await requestPageInfo(tab.id);
  if (isFailure(pageInfo)) {
    return pageInfo;
  }
  const backend = await sendPageInfo({
    title: pageInfo.title,
    url: pageInfo.url,
    hostname: pageInfo.hostname,
    hasReadableText: pageInfo.hasMeaningfulReadableText
  });
  return { ok: true, pageInfo, backend, message: "Page information received." };
}

async function findPrivacyPolicy(): Promise<PrivacyPolicyDetectionResponse> {
  const tab = await getCurrentTab();
  if (isFailure(tab)) return tab;
  return requestPrivacyPolicyDetection(tab.id);
}

async function extractPrivacyPolicy(policyUrl: string): Promise<PolicyExtractionResponse> {
  try {
    new URL(policyUrl);
  } catch {
    return failure("INVALID_MESSAGE", "A valid privacy-policy URL is required.");
  }
  return extractPolicy(policyUrl);
}

chrome.runtime.onInstalled.addListener(() => {
  console.info("Privacy Intelligence Platform service worker initialized.");
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isExtensionMessage(message)) {
    sendResponse(failure("INVALID_MESSAGE", "The extension received an invalid message."));
    return false;
  }
  if (message.type === MESSAGE_TYPES.getActiveTab) {
    void getActiveTabResponse().then(sendResponse);
    return true;
  }
  if (message.type === MESSAGE_TYPES.analyzePage) {
    void analyzePage().then(sendResponse).catch((error: unknown) => {
      console.error("Page information request failed.", error);
      sendResponse(failure("MESSAGE_FAILURE", "Unable to retrieve page information."));
    });
    return true;
  }
  if (message.type === MESSAGE_TYPES.findPrivacyPolicy) {
    void findPrivacyPolicy().then(sendResponse).catch((error: unknown) => {
      console.error("Privacy-policy detection request failed.", error);
      sendResponse(failure("MESSAGE_FAILURE", "Unable to detect a privacy policy."));
    });
    return true;
  }
  if (message.type === MESSAGE_TYPES.extractPrivacyPolicy) {
    if (!isExtractPrivacyPolicyMessage(message)) {
      sendResponse(failure("INVALID_MESSAGE", "A valid privacy-policy URL is required."));
      return false;
    }
    void extractPrivacyPolicy(message.policyUrl).then(sendResponse).catch((error: unknown) => {
      console.error("Privacy-policy extraction request failed.", error);
      sendResponse(failure("MESSAGE_FAILURE", "Unable to extract the privacy policy."));
    });
    return true;
  }
  if (message.type === MESSAGE_TYPES.contentScriptReady) {
    console.info("Privacy Intelligence content script loaded.");
    return false;
  }
  sendResponse(failure("INVALID_MESSAGE", "This message is not valid for the service worker."));
  return false;
});
