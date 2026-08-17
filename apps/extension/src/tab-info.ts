export interface TabInfo {
  id: number;
  title: string;
  hostname: string;
  url: string;
}

export function toTabInfo(tab: chrome.tabs.Tab): TabInfo | null {
  if (tab.id === undefined || !tab.url) {
    return null;
  }

  try {
    const parsedUrl = new URL(tab.url);
    return {
      id: tab.id,
      title: tab.title || "Untitled page",
      hostname: parsedUrl.hostname || "Unavailable",
      url: tab.url
    };
  } catch {
    return null;
  }
}

export function isSupportedPage(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}
