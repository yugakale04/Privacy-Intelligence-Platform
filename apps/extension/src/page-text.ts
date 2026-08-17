export function hasMeaningfulReadableText(text: string | undefined): boolean {
  const normalizedText = text?.replace(/\s+/g, " ").trim() || "";
  return normalizedText.length >= 100;
}
