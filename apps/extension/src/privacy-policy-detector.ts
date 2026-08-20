export interface PolicyLinkInput {
  text: string;
  href: string;
}

export interface PolicyCandidate {
  text: string;
  url: string;
  confidence: number;
  reason: string;
}

export interface PrivacyPolicyDetection {
  found: boolean;
  currentPageIsPolicy: boolean;
  confidence: number;
  candidates: PolicyCandidate[];
}

export interface PrivacyPolicyDetectionInput {
  pageUrl: string;
  pageTitle: string;
  pageText: string;
  links: PolicyLinkInput[];
}

const STRONG_LABELS: Record<string, number> = {
  "privacy policy": 100,
  "privacy notice": 95,
  "data privacy": 88,
  "data policy": 86,
  "your privacy": 82,
  privacy: 71
};

const POLICY_PATH_PATTERN = /(?:privacy[-_ ]?(?:policy|notice)?|data[-_ ]?(?:privacy|policy))/i;
const ARTICLE_PATTERN = /(?:blog|article|news|tips|guide|marketing)/i;
const COOKIE_ONLY_PATTERN = /cookie/i;
const POLICY_TEXT_PATTERN = /(?:privacy policy|privacy notice|how we collect|personal data|personal information)/i;
const FOUND_THRESHOLD = 60;

function normalized(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function isInvalidHref(href: string): boolean {
  const value = href.trim().toLowerCase();
  return !value || value.startsWith("javascript:") || value.startsWith("mailto:") || value.startsWith("tel:") || value.startsWith("#");
}

function resolveUrl(href: string, pageUrl: string): string | null {
  if (isInvalidHref(href)) return null;
  try {
    const url = new URL(href, pageUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function scoreCurrentPage(pageUrl: string, pageTitle: string, pageText: string): PolicyCandidate | null {
  const title = normalized(pageTitle);
  const url = normalized(pageUrl);
  const text = pageText.slice(0, 8_000);
  if (COOKIE_ONLY_PATTERN.test(`${title} ${url}`) && !/privacy/.test(`${title} ${url}`)) return null;

  let confidence = 0;
  const reasons: string[] = [];
  if (POLICY_PATH_PATTERN.test(url)) { confidence += 45; reasons.push("privacy-oriented URL"); }
  if (STRONG_LABELS[title]) { confidence += 50; reasons.push("privacy-policy page title"); }
  else if (/privacy/.test(title)) { confidence += 30; reasons.push("privacy-related page title"); }
  if (POLICY_TEXT_PATTERN.test(text)) { confidence += 30; reasons.push("policy-related page text"); }
  if (ARTICLE_PATTERN.test(url) && !STRONG_LABELS[title]) confidence -= 35;
  if (confidence < FOUND_THRESHOLD) return null;

  return {
    text: pageTitle.trim() || "Current page",
    url: pageUrl,
    confidence: Math.min(100, confidence),
    reason: `Current page: ${reasons.join(", ")}`
  };
}

function scoreLink(link: PolicyLinkInput, pageUrl: string): PolicyCandidate | null {
  const url = resolveUrl(link.href, pageUrl);
  if (!url) return null;
  const text = normalized(link.text);
  const urlText = normalized(url);
  if (COOKIE_ONLY_PATTERN.test(`${text} ${urlText}`) && !/privacy/.test(`${text} ${urlText}`)) return null;
  if (ARTICLE_PATTERN.test(urlText) && !["privacy policy", "privacy notice"].includes(text)) return null;

  let confidence = 0;
  const reasons: string[] = [];
  if (STRONG_LABELS[text]) { confidence += STRONG_LABELS[text]; reasons.push(`link text \"${link.text.trim()}\"`); }
  else if (/privacy/.test(text)) { confidence += 45; reasons.push("privacy-related link text"); }
  if (POLICY_PATH_PATTERN.test(urlText)) {
    confidence += STRONG_LABELS[text] ? 25 : /privacy/.test(text) ? 40 : 80;
    reasons.push("privacy-oriented URL");
  }
  if (ARTICLE_PATTERN.test(`${text} ${urlText}`)) confidence -= 40;
  if (confidence < FOUND_THRESHOLD) return null;

  return {
    text: link.text.trim() || "Privacy link",
    url,
    confidence: Math.min(100, confidence),
    reason: reasons.join("; ")
  };
}

export function detectPrivacyPolicy(input: PrivacyPolicyDetectionInput): PrivacyPolicyDetection {
  const currentPageCandidate = scoreCurrentPage(input.pageUrl, input.pageTitle, input.pageText);
  if (currentPageCandidate) {
    return { found: true, currentPageIsPolicy: true, confidence: currentPageCandidate.confidence, candidates: [currentPageCandidate] };
  }

  const candidatesByUrl = new Map<string, PolicyCandidate>();
  for (const link of input.links) {
    const candidate = scoreLink(link, input.pageUrl);
    if (candidate && (!candidatesByUrl.has(candidate.url) || candidatesByUrl.get(candidate.url)!.confidence < candidate.confidence)) {
      candidatesByUrl.set(candidate.url, candidate);
    }
  }

  const candidates = [...candidatesByUrl.values()].sort((left, right) => right.confidence - left.confidence || left.url.localeCompare(right.url));
  return { found: candidates.length > 0, currentPageIsPolicy: false, confidence: candidates[0]?.confidence || 0, candidates };
}
