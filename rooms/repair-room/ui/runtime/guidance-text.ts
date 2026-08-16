type TextFn = (
  path: string[],
  fallback: string,
  params?: Record<string, string | number>
) => string;

const GUIDANCE_TEXT_KEYS: Record<string, { path: string[]; fallback: string }> = {
  "the bench is ready.": {
    path: ["workbench", "guidance", "benchReady"],
    fallback: "Tezgah hazır.",
  },
  "open a repair session.": {
    path: ["workbench", "guidance", "openRepairSession"],
    fallback: "Bir tamir oturumu aç.",
  },
  "add the symptoms, then start research.": {
    path: ["workbench", "guidance", "addSymptomsStartAssistant"],
    fallback: "Semptomları ekle, sonra Asistan AI ile kanıt araştırmasını başlat.",
  },
  "measurement verification is waiting.": {
    path: ["workbench", "guidance", "measurementVerificationWaiting"],
    fallback: "Ölçüm doğrulaması bekliyor.",
  },
  "focused behavior matches a failure pattern.": {
    path: ["workbench", "guidance", "focusedBehaviorMatchesFailure"],
    fallback: "Odaklanan davranış arıza deseniyle eşleşiyor.",
  },
  "observe the board and keep the next check narrow.": {
    path: ["workbench", "guidance", "observeBoardNarrowCheck"],
    fallback: "Kartı gözlemle ve sıradaki kontrolü dar tut.",
  },
  "primary rail behavior matches the failure pattern.": {
    path: ["workbench", "guidance", "primaryRailMatchesFailure"],
    fallback: "Ana hat davranışı arıza deseniyle eşleşiyor.",
  },
  "this region has enough evidence to inspect calmly.": {
    path: ["workbench", "guidance", "regionEvidenceInspectCalmly"],
    fallback: "Bu bölgede sakin inceleme için yeterli kanıt var.",
  },
  "this region may match an earlier pattern.": {
    path: ["workbench", "guidance", "regionMayMatchEarlierPattern"],
    fallback: "Bu bölge önceki bir desenle eşleşebilir.",
  },
};

export function localizeRepairGuidanceLine(value: string, text: TextFn): string {
  const normalized = value.trim().toLowerCase();
  const entry = GUIDANCE_TEXT_KEYS[normalized];
  return entry === undefined ? value : text(entry.path, entry.fallback);
}
