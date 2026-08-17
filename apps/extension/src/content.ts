import {
  failure,
  isGetPageInfoMessage,
  MESSAGE_TYPES,
  type PageInfo,
  type PageInfoResponse
} from "./messages.js";
import { hasMeaningfulReadableText } from "./page-text.js";

function collectPageInfo(): PageInfo {
  return {
    title: document.title.trim() || "Untitled page",
    url: window.location.href,
    hostname: window.location.hostname || "Unavailable",
    hasMeaningfulReadableText: hasMeaningfulReadableText(document.body?.innerText)
  };
}

const contentWindow = window as Window & { __privacyIntelligenceContentScriptLoaded?: boolean };

if (!contentWindow.__privacyIntelligenceContentScriptLoaded) {
  contentWindow.__privacyIntelligenceContentScriptLoaded = true;

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isGetPageInfoMessage(message)) {
      sendResponse(failure("INVALID_MESSAGE", "The content script received an invalid message."));
      return false;
    }
    sendResponse(collectPageInfo() satisfies PageInfoResponse);
    return false;
  });

  chrome.runtime.sendMessage({ type: MESSAGE_TYPES.contentScriptReady }).catch((error: unknown) => {
    console.debug("Content script could not notify the service worker.", error);
  });
}
