export const PRIVACY_CATEGORIES = ["data_collection", "data_usage", "data_sharing", "data_retention", "user_rights", "tracking", "security", "international_transfer", "consent"] as const;
export const FINDING_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type PrivacyCategory = typeof PRIVACY_CATEGORIES[number];
export type FindingSeverity = typeof FINDING_SEVERITIES[number];

export interface Evidence { text: string; sectionId: string; chunkId: string; }
export interface Finding { id: string; category: PrivacyCategory; type: string; severity: FindingSeverity; confidence: number; statement: string; evidence: Evidence[]; }
export interface AnalysisPolicyMetadata { title: string; sourceUrl: string; finalUrl: string; totalWordCount: number; totalCharacterCount: number; }
export interface AnalysisResult { policy: AnalysisPolicyMetadata; findings: Finding[]; summary?: undefined; risk?: undefined; }
export interface EvidenceReferenceDocument {
  title: string; sourceUrl: string; finalUrl: string; totalWordCount: number; totalCharacterCount: number;
  sections: Array<{ id: string }>; chunks: Array<{ id: string; sectionId: string }>;
}

export class AnalysisModelValidationError extends Error { constructor(message: string) { super(message); } }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new AnalysisModelValidationError(`${field} must be a non-empty string.`);
  return value;
}

function validateEvidence(value: unknown, document: EvidenceReferenceDocument): Evidence {
  if (!isRecord(value)) throw new AnalysisModelValidationError("Evidence must be an object.");
  const text = nonEmptyString(value.text, "Evidence text");
  const sectionId = nonEmptyString(value.sectionId, "Evidence sectionId");
  const chunkId = nonEmptyString(value.chunkId, "Evidence chunkId");
  if (!document.sections.some((section) => section.id === sectionId)) throw new AnalysisModelValidationError(`Evidence references unknown sectionId: ${sectionId}.`);
  if (!document.chunks.some((chunk) => chunk.id === chunkId && chunk.sectionId === sectionId)) throw new AnalysisModelValidationError(`Evidence chunkId ${chunkId} does not belong to sectionId ${sectionId}.`);
  return { text, sectionId, chunkId };
}

export function validateFinding(value: unknown, document: EvidenceReferenceDocument): Finding {
  if (!isRecord(value)) throw new AnalysisModelValidationError("Finding must be an object.");
  const category = nonEmptyString(value.category, "Finding category");
  if (!(PRIVACY_CATEGORIES as readonly string[]).includes(category)) throw new AnalysisModelValidationError(`Unsupported privacy category: ${category}.`);
  const severity = nonEmptyString(value.severity, "Finding severity");
  if (!(FINDING_SEVERITIES as readonly string[]).includes(severity)) throw new AnalysisModelValidationError(`Unsupported finding severity: ${severity}.`);
  if (typeof value.confidence !== "number" || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) throw new AnalysisModelValidationError("Finding confidence must be a number between 0 and 1.");
  if (!Array.isArray(value.evidence) || value.evidence.length === 0) throw new AnalysisModelValidationError("Every finding requires at least one evidence item.");
  return { id: nonEmptyString(value.id, "Finding id"), category: category as PrivacyCategory, type: nonEmptyString(value.type, "Finding type"), severity: severity as FindingSeverity, confidence: value.confidence, statement: nonEmptyString(value.statement, "Finding statement"), evidence: value.evidence.map((evidence) => validateEvidence(evidence, document)) };
}

export function createAnalysisResult(document: EvidenceReferenceDocument, findings: unknown[]): AnalysisResult {
  const policy: AnalysisPolicyMetadata = { title: nonEmptyString(document.title, "Policy title"), sourceUrl: nonEmptyString(document.sourceUrl, "Policy sourceUrl"), finalUrl: nonEmptyString(document.finalUrl, "Policy finalUrl"), totalWordCount: document.totalWordCount, totalCharacterCount: document.totalCharacterCount };
  if (!Number.isInteger(policy.totalWordCount) || policy.totalWordCount < 0 || !Number.isInteger(policy.totalCharacterCount) || policy.totalCharacterCount < 0) throw new AnalysisModelValidationError("Policy counts must be non-negative integers.");
  return { policy, findings: findings.map((finding) => validateFinding(finding, document)) };
}

export function serializeAnalysisResult(result: AnalysisResult): string { return JSON.stringify(result); }
export function deserializeAnalysisResult(value: string, document: EvidenceReferenceDocument): AnalysisResult {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || !Array.isArray(parsed.findings)) throw new AnalysisModelValidationError("Analysis result is invalid.");
    return createAnalysisResult(document, parsed.findings);
  } catch (error) {
    if (error instanceof AnalysisModelValidationError) throw error;
    throw new AnalysisModelValidationError("Analysis result is not valid JSON.");
  }
}
