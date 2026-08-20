import {
  failure,
  isFindPrivacyPolicyMessage,
  isGetPageInfoMessage,
  MESSAGE_TYPES,
  type PageInfo,
  type PageInfoResponse
} from "./messages.js";
import { hasMeaningfulReadableText } from "./page-text.js";
import { detectPrivacyPolicy } from "./privacy-policy-detector.js";

function collectPageInfo(): PageInfo {
  return {
    title: document.title.trim() || "Untitled page",
    url: window.location.href,
    hostname: window.location.hostname || "Unavailable",
    hasMeaningfulReadableText: hasMeaningfulReadableText(document.body?.innerText)
  };
}

function findPrivacyPolicy() {
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((anchor) => ({
    text: anchor.textContent || "",
    href: anchor.getAttribute("href") || ""
  }));
  return detectPrivacyPolicy({
    pageUrl: window.location.href,
    pageTitle: document.title,
    pageText: document.body?.innerText || "",
    links
  });
}

const contentWindow = window as Window & { __privacyIntelligenceContentScriptLoaded?: boolean };

if (!contentWindow.__privacyIntelligenceContentScriptLoaded) {
  contentWindow.__privacyIntelligenceContentScriptLoaded = true;

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (isGetPageInfoMessage(message)) {
      sendResponse(collectPageInfo() satisfies PageInfoResponse);
      return false;
    }
    if (isFindPrivacyPolicyMessage(message)) {
      try {
        sendResponse(findPrivacyPolicy());
      } catch (error) {
        console.warn("Privacy-policy detection failed.", error);
        sendResponse(failure("MESSAGE_FAILURE", "Unable to inspect privacy-policy links on this page."));
      }
      return false;
    }
    sendResponse(failure("INVALID_MESSAGE", "The content script received an invalid message."));
    return false;
  });

  chrome.runtime.sendMessage({ type: MESSAGE_TYPES.contentScriptReady }).catch((error: unknown) => {
    console.debug("Content script could not notify the service worker.", error);
  });
}
