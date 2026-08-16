export interface VoiceCommandSpec {
  id: string;
  phrases: readonly string[];
}

export interface VoiceCommandMatch {
  id: string;
  matchedPhrase: string;
}

export function normalizeVoiceCommandText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİ]/g, "i")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchVoiceCommand(
  text: string,
  specs: readonly VoiceCommandSpec[]
): VoiceCommandMatch | null {
  const normalizedText = normalizeVoiceCommandText(text);
  if (normalizedText === "") {
    return null;
  }

  for (const spec of specs) {
    for (const phrase of spec.phrases) {
      const normalizedPhrase = normalizeVoiceCommandText(phrase);
      if (normalizedPhrase !== "" && normalizedText === normalizedPhrase) {
        return {
          id: spec.id,
          matchedPhrase: normalizedPhrase,
        };
      }
    }
  }

  return null;
}
