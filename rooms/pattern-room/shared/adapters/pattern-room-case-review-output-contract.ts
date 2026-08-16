export const PATTERN_ROOM_CASE_REVIEW_CANONICAL_JSON_FORMAT = "pattern-room-case-review" as const;
export const PATTERN_ROOM_CASE_REVIEW_CANONICAL_JSON_VERSION = 1 as const;

const EDGE_TYPES = [
  "supports",
  "contradicts",
  "references",
  "derived_from",
  "inspired_by",
  "questions",
  "needs_review",
] as const;

export function createPatternRoomCaseReviewOutputContract(): string {
  return [
    "[Output Contract]",
    "Yanıtı yalnızca tek bir geçerli JSON nesnesi olarak üret; Markdown kod bloğu ve ek açıklama kullanma.",
    "Aşağıdaki envelope ve alan adlarını aynen koru:",
    "{",
    `  \"format\": \"${PATTERN_ROOM_CASE_REVIEW_CANONICAL_JSON_FORMAT}\",`,
    `  \"version\": ${String(PATTERN_ROOM_CASE_REVIEW_CANONICAL_JSON_VERSION)},`,
    '  "sections": {',
    '    "observation": [],',
    '    "evidence": [],',
    '    "analysis": [],',
    '    "counterArgument": [],',
    '    "missingInformation": [],',
    '    "openQuestions": [],',
    '    "confidenceNotes": []',
    "  },",
    '  "suggestedConnections": []',
    "}",
    "Her section değeri ayrı bulgular taşıyan bir string dizisidir. İçerik yoksa boş dizi bırak.",
    "Evidence öğeleri yalnız kanıt adayıdır; kaynak alıntısı yerine geçmez.",
    `suggestedConnections öğeleri sourceId, edgeType, targetId ve isteğe bağlı note alanlarını kullanır. edgeType yalnız şu değerlerden biri olabilir: ${EDGE_TYPES.join(", ")}.`,
    "Exact id bilinmiyorsa bağlantı üretme; eksikliği missingInformation altında belirt.",
    "JSON üretimi mümkün değilse yedi bölüm başlığını İngilizce veya Türkçe kullan: Observation/Gözlem, Evidence/Kanıt, Analysis/Analiz, Counter Argument/Karşı Argüman, Missing Information/Eksik Bilgi, Open Questions/Açık Sorular, Confidence Notes/Güven Notları.",
  ].join("\n");
}
