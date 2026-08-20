import type { ExtractedPolicy, PolicyContentBlock } from "./policy-extractor.js";

const MIN_POLICY_TEXT_LENGTH = 80;
const MAX_CHUNK_WORDS = 300;

export interface PolicySection {
  id: string;
  heading: string;
  content: string;
  order: number;
  wordCount: number;
}

export interface PolicyChunk {
  id: string;
  sectionId: string;
  order: number;
  text: string;
  wordCount: number;
}

export interface StructuredPolicyDocument {
  title: string;
  sourceUrl: string;
  finalUrl: string;
  totalWordCount: number;
  totalCharacterCount: number;
  sections: PolicySection[];
  chunks: PolicyChunk[];
}

export class PolicyProcessingError extends Error {
  constructor(message: string) { super(message); }
}

function normalize(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
}

function wordCount(value: string): number { return value ? value.split(/\s+/).length : 0; }

function fallbackHeading(block: PolicyContentBlock): boolean {
  const text = normalize(block.text);
  if (block.kind === "heading") return true;
  const words = wordCount(text);
  return words > 0 && words <= 10 && !/[.!?;:]$/.test(text) && /^[A-Z0-9][A-Za-z0-9 ,&/()'’-]*$/.test(text);
}

function toBlocks(policy: ExtractedPolicy): PolicyContentBlock[] {
  if (policy.blocks?.length) {
    const seen = new Set<string>();
    return policy.blocks.map((block) => ({ ...block, text: normalize(block.text) }))
      .filter((block) => block.text && !seen.has(block.text) && Boolean(seen.add(block.text)));
  }
  const seen = new Set<string>();
  return policy.text.split(/\n{2,}/).map((text) => ({ kind: "paragraph" as const, text: normalize(text) }))
    .filter((block) => block.text && !seen.has(block.text) && Boolean(seen.add(block.text)));
}

function splitParagraph(text: string, maximumWords: number): string[] {
  if (wordCount(text) <= maximumWords) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(normalize).filter(Boolean) || [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (wordCount(sentence) > maximumWords) {
      if (current) { chunks.push(current); current = ""; }
      const words = sentence.split(/\s+/);
      for (let index = 0; index < words.length; index += maximumWords) chunks.push(words.slice(index, index + maximumWords).join(" "));
    } else if (wordCount(`${current} ${sentence}`.trim()) > maximumWords) {
      if (current) chunks.push(current);
      current = sentence;
    } else current = `${current} ${sentence}`.trim();
  }
  if (current) chunks.push(current);
  return chunks;
}

function chunkSection(section: PolicySection, globalOrderStart: number): PolicyChunk[] {
  const paragraphs = section.content.split(/\n{2,}/).map(normalize).filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    for (const part of splitParagraph(paragraph, MAX_CHUNK_WORDS)) {
      if (wordCount(`${current}\n\n${part}`.trim()) > MAX_CHUNK_WORDS) {
        if (current) chunks.push(current);
        current = part;
      } else current = `${current}${current ? "\n\n" : ""}${part}`;
    }
  }
  if (current) chunks.push(current);
  return chunks.map((text, index) => ({ id: `${section.id}-c${String(index + 1).padStart(3, "0")}`, sectionId: section.id, order: globalOrderStart + index, text, wordCount: wordCount(text) }));
}

export function processPolicy(policy: ExtractedPolicy): StructuredPolicyDocument {
  const blocks = toBlocks(policy);
  if (normalize(policy.text).length < MIN_POLICY_TEXT_LENGTH || !blocks.length) throw new PolicyProcessingError("Policy text is empty or too small to process.");
  const rawSections: Array<{ heading: string; content: string[] }> = [];
  let current = { heading: "Policy content", content: [] as string[] };
  for (const block of blocks) {
    if (fallbackHeading(block) && current.content.length) {
      rawSections.push(current);
      current = { heading: block.text, content: [] };
    } else if (fallbackHeading(block) && !current.content.length && current.heading === "Policy content") current.heading = block.text;
    else current.content.push(block.text);
  }
  if (current.content.length) rawSections.push(current);
  const sections = rawSections.map((section, index) => ({
    id: `s${String(index + 1).padStart(3, "0")}`,
    heading: section.heading,
    content: section.content.join("\n\n"),
    order: index + 1,
    wordCount: wordCount(section.content.join("\n\n"))
  })).filter((section) => section.content);
  if (!sections.length) throw new PolicyProcessingError("Policy text did not contain usable section content.");
  let chunkOrder = 1;
  const chunks = sections.flatMap((section) => {
    const output = chunkSection(section, chunkOrder);
    chunkOrder += output.length;
    return output;
  });
  return { title: policy.title, sourceUrl: policy.url, finalUrl: policy.finalUrl, totalWordCount: wordCount(sections.map((section) => section.content).join(" ")), totalCharacterCount: sections.map((section) => section.content).join("\n\n").length, sections, chunks };
}
