export type PatternCaseReviewTextKey =
  | "kicker"
  | "title"
  | "intro"
  | "previewEmpty"
  | "roleLabel"
  | "targetLabel"
  | "protocolLabel"
  | "roles.AI0"
  | "roles.AI1"
  | "roles.AI2"
  | "roles.US1"
  | "actions.prepare"
  | "actions.send"
  | "actions.cancel"
  | "actions.retry"
  | "actions.resend"
  | "actions.applyAll"
  | "actions.applyOpenQuestions"
  | "actions.applyEvidenceSuggestions"
  | "apply.reviewPrefix"
  | "apply.evidenceSuggestionLabel"
  | "apply.openQuestionLabel"
  | "apply.userAppliedSuggestion"
  | "candidates.title"
  | "candidates.intro"
  | "candidates.empty"
  | "candidates.badge"
  | "candidates.provenance"
  | "candidates.sourceLabel"
  | "candidates.sourcePlaceholder"
  | "candidates.excerptLabel"
  | "candidates.excerptPlaceholder"
  | "candidates.promote"
  | "candidates.discard"
  | "candidates.promoted"
  | "candidates.promotionFailed"
  | "candidates.discarded"
  | "candidates.discardFailed"
  | "statuses.idle"
  | "statuses.running"
  | "statuses.waiting"
  | "statuses.ready"
  | "statuses.error"
  | "statuses.cancelled"
  | "statuses.timeout"
  | "statuses.applied"
  | "messages.confirmDispatch"
  | "messages.dispatched"
  | "messages.dispatchFailed"
  | "messages.controlFailed"
  | "messages.applyFailed"
  | "messages.applied"
  | "messages.noResult"
  | "messages.historyEmpty"
  | "messages.resultEmpty"
  | "messages.fallbackWarning"
  | "sections.observation"
  | "sections.evidence"
  | "sections.analysis"
  | "sections.counterArgument"
  | "sections.missingInformation"
  | "sections.openQuestions"
  | "sections.confidenceNotes"
  | "result.title"
  | "result.summary"
  | "result.warnings"
  | "result.confidence"
  | "result.missingEvidence"
  | "result.suggestedConnections"
  | "result.openQuestions"
  | "workspace.request"
  | "workspace.response"
  | "workspace.parsed"
  | "workspace.applyPreview"
  | "workspace.applyResult"
  | "workspace.history"
  | "workspace.responseEmpty"
  | "workspace.applyEmpty"
  | "workspace.boardNotes"
  | "workspace.evidenceCandidates"
  | "workspace.skipped"
  | "history.title"
  | "history.timestamp"
  | "history.role"
  | "history.packetHash"
  | "history.responseHash"
  | "history.state";

export type PatternCaseReviewTranslator = (
  key: PatternCaseReviewTextKey,
  replacements?: Readonly<Record<string, string>>
) => string;

const FALLBACK_TR: Readonly<Record<PatternCaseReviewTextKey, string>> = {
  kicker: "AI vaka incelemesi",
  title: "Vaka İnceleme Önizlemesi",
  intro:
    "Bu önizleme AI'ya gönderilecek araştırma paketinin taslağını gösterir. Bu aşamada hiçbir mesaj gönderilmez. Hiçbir sonuç panoya otomatik uygulanmaz.",
  previewEmpty: "Önizleme henüz hazırlanmadı.",
  roleLabel: "İnceleme rolü",
  targetLabel: "Hedef",
  protocolLabel: "Protokol",
  "roles.AI0": "AI0 — Araştırmacı",
  "roles.AI1": "AI1 — Savunucu",
  "roles.AI2": "AI2 — 10. Adam",
  "roles.US1": "US1 — Hakem",
  "actions.prepare": "Önizleme Hazırla",
  "actions.send": "İncelemeyi Gönder",
  "actions.cancel": "İptal",
  "actions.retry": "Tekrar Dene",
  "actions.resend": "Yeniden Gönder",
  "actions.applyAll": "Panoya Uygula",
  "actions.applyOpenQuestions": "Yalnız Açık Soruları Ekle",
  "actions.applyEvidenceSuggestions": "Yalnız Kanıt Önerilerini Ekle",
  "apply.reviewPrefix": "AI İncelemesi",
  "apply.evidenceSuggestionLabel": "Kanıt Önerisi",
  "apply.openQuestionLabel": "Açık Soru",
  "apply.userAppliedSuggestion":
    "Kullanıcı tarafından uygulanmış AI önerisi; bağımsız olarak doğrulanmamıştır.",
  "candidates.title": "Kanıt adayları",
  "candidates.intro":
    "AI önerileri burada aday olarak kalır. Kanıta yükseltmek için gerçek bir kaynak ve kaynaktan seçilmiş alıntı gerekir.",
  "candidates.empty": "Bekleyen kanıt adayı yok.",
  "candidates.badge": "AI kanıt adayı",
  "candidates.provenance": "Oturum: %session% · Öneri: %suggestion%",
  "candidates.sourceLabel": "Gerçek kaynak",
  "candidates.sourcePlaceholder": "Kaynak seç",
  "candidates.excerptLabel": "Kaynaktan seçilmiş alıntı",
  "candidates.excerptPlaceholder": "Kaynakta gerçekten bulunan bölümü buraya aktarın.",
  "candidates.promote": "Kanıta Yükselt",
  "candidates.discard": "Adayı Sil",
  "candidates.promoted": "Kanıt adayı kaynak ve alıntıyla doğrulanarak kanıta yükseltildi.",
  "candidates.promotionFailed": "Kanıt adayı yükseltilemedi.",
  "candidates.discarded": "Kanıt adayı silindi.",
  "candidates.discardFailed": "Kanıt adayı silinemedi.",
  "statuses.idle": "İnceleme hazır değil",
  "statuses.running": "İnceleme Çalışıyor",
  "statuses.waiting": "AI Yanıtı Bekleniyor",
  "statuses.ready": "İnceleme Hazır",
  "statuses.error": "Yanıt Hatası",
  "statuses.cancelled": "İnceleme İptal Edildi",
  "statuses.timeout": "Yanıt Zaman Aşımına Uğradı",
  "statuses.applied": "İnceleme Panoya Uygulandı",
  "messages.confirmDispatch": "%role% rolü için vaka incelemesi gönderilecek. Devam edilsin mi?",
  "messages.dispatched": "%role% rolüne gönderildi.",
  "messages.dispatchFailed": "Gönderim başarısız.",
  "messages.controlFailed": "İnceleme işlemi gönderilemedi.",
  "messages.applyFailed": "İnceleme panoya uygulanamadı.",
  "messages.applied": "Seçilen inceleme öğeleri panoya eklendi.",
  "messages.noResult": "Uygulanabilecek hazır bir inceleme sonucu yok.",
  "messages.historyEmpty": "Henüz inceleme geçmişi yok.",
  "messages.resultEmpty": "AI yanıtı henüz hazır değil.",
  "messages.fallbackWarning":
    "Yanıt beklenen başlık biçimini tam olarak izlemedi; ham içerik temkinli biçimde ayrıştırıldı.",
  "sections.observation": "Gözlem",
  "sections.evidence": "Kanıt",
  "sections.analysis": "Analiz",
  "sections.counterArgument": "Karşı Argüman",
  "sections.missingInformation": "Eksik Bilgi",
  "sections.openQuestions": "Açık Sorular",
  "sections.confidenceNotes": "Güven Notları",
  "result.title": "Yapılandırılmış İnceleme",
  "result.summary": "Özet",
  "result.warnings": "Uyarılar",
  "result.confidence": "Güven",
  "result.missingEvidence": "Eksik Kanıt",
  "result.suggestedConnections": "Önerilen Bağlantılar",
  "result.openQuestions": "Açık Sorular",
  "workspace.request": "Gönderilecek istek",
  "workspace.response": "Alınan yanıt",
  "workspace.parsed": "Ayrıştırılmış bölümler",
  "workspace.applyPreview": "Uygulama önizlemesi",
  "workspace.applyResult": "Uygulama sonucu",
  "workspace.history": "İnceleme geçmişi",
  "workspace.responseEmpty": "AI yanıtı henüz alınmadı.",
  "workspace.applyEmpty": "Uygulanmış bir inceleme sonucu yok.",
  "workspace.boardNotes": "Pano notları",
  "workspace.evidenceCandidates": "Kanıt adayları",
  "workspace.skipped": "Atlanan",
  "history.title": "İnceleme Geçmişi",
  "history.timestamp": "Zaman",
  "history.role": "Rol",
  "history.packetHash": "Paket özeti",
  "history.responseHash": "Yanıt özeti",
  "history.state": "Durum",
};

const FALLBACK_EN: Readonly<Record<PatternCaseReviewTextKey, string>> = {
  kicker: "AI case review",
  title: "Case Review Preview",
  intro:
    "Inspect the research packet before it is sent to AI. Preparing a preview or receiving a reply never writes data to the board.",
  previewEmpty: "The preview has not been prepared yet.",
  roleLabel: "Review role",
  targetLabel: "Target",
  protocolLabel: "Protocol",
  "roles.AI0": "AI0 — Researcher",
  "roles.AI1": "AI1 — Advocate",
  "roles.AI2": "AI2 — Tenth Man",
  "roles.US1": "US1 — Arbiter",
  "actions.prepare": "Prepare Preview",
  "actions.send": "Send Review",
  "actions.cancel": "Cancel",
  "actions.retry": "Retry",
  "actions.resend": "Resend",
  "actions.applyAll": "Apply to Board",
  "actions.applyOpenQuestions": "Add Open Questions Only",
  "actions.applyEvidenceSuggestions": "Add Evidence Suggestions Only",
  "apply.reviewPrefix": "AI Review",
  "apply.evidenceSuggestionLabel": "Evidence Suggestion",
  "apply.openQuestionLabel": "Open Question",
  "apply.userAppliedSuggestion": "User-applied AI suggestion; not independently verified.",
  "candidates.title": "Evidence candidates",
  "candidates.intro":
    "AI suggestions remain candidates here. Promotion requires a real source and an excerpt selected from that source.",
  "candidates.empty": "There are no pending evidence candidates.",
  "candidates.badge": "AI evidence candidate",
  "candidates.provenance": "Session: %session% · Suggestion: %suggestion%",
  "candidates.sourceLabel": "Real source",
  "candidates.sourcePlaceholder": "Select a source",
  "candidates.excerptLabel": "Excerpt selected from source",
  "candidates.excerptPlaceholder":
    "Paste the passage that actually appears in the selected source.",
  "candidates.promote": "Promote to Evidence",
  "candidates.discard": "Discard Candidate",
  "candidates.promoted": "The candidate was promoted to source-linked evidence.",
  "candidates.promotionFailed": "The evidence candidate could not be promoted.",
  "candidates.discarded": "The evidence candidate was discarded.",
  "candidates.discardFailed": "The evidence candidate could not be discarded.",
  "statuses.idle": "Review not started",
  "statuses.running": "Review Running",
  "statuses.waiting": "Waiting AI",
  "statuses.ready": "Review Ready",
  "statuses.error": "Reply Error",
  "statuses.cancelled": "Cancelled",
  "statuses.timeout": "Reply Timed Out",
  "statuses.applied": "Review Applied",
  "messages.confirmDispatch": "Send the case review for the %role% role?",
  "messages.dispatched": "Sent to the %role% role.",
  "messages.dispatchFailed": "Dispatch failed.",
  "messages.controlFailed": "The review action could not be sent.",
  "messages.applyFailed": "The review could not be applied to the board.",
  "messages.applied": "The selected review items were added to the board.",
  "messages.noResult": "There is no ready review result to apply.",
  "messages.historyEmpty": "No review history yet.",
  "messages.resultEmpty": "The AI reply is not ready yet.",
  "messages.fallbackWarning":
    "The reply did not fully follow the expected heading format; its raw content was parsed cautiously.",
  "sections.observation": "Observation",
  "sections.evidence": "Evidence",
  "sections.analysis": "Analysis",
  "sections.counterArgument": "Counter Argument",
  "sections.missingInformation": "Missing Information",
  "sections.openQuestions": "Open Questions",
  "sections.confidenceNotes": "Confidence Notes",
  "result.title": "Structured Review",
  "result.summary": "Summary",
  "result.warnings": "Warnings",
  "result.confidence": "Confidence",
  "result.missingEvidence": "Missing Evidence",
  "result.suggestedConnections": "Suggested Connections",
  "result.openQuestions": "Open Questions",
  "workspace.request": "Sent request",
  "workspace.response": "Received response",
  "workspace.parsed": "Parsed sections",
  "workspace.applyPreview": "Apply preview",
  "workspace.applyResult": "Apply result",
  "workspace.history": "Review history",
  "workspace.responseEmpty": "The AI response has not arrived yet.",
  "workspace.applyEmpty": "No review result has been applied.",
  "workspace.boardNotes": "Board notes",
  "workspace.evidenceCandidates": "Evidence candidates",
  "workspace.skipped": "Skipped",
  "history.title": "Review History",
  "history.timestamp": "Timestamp",
  "history.role": "Role",
  "history.packetHash": "Packet hash",
  "history.responseHash": "Response hash",
  "history.state": "State",
};

function readNestedText(value: unknown, path: readonly string[]): string | null {
  let current = value;
  for (const segment of path) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" && current.trim() !== "" ? current : null;
}

export function createPatternCaseReviewTranslator(
  locale: string,
  translations: unknown
): PatternCaseReviewTranslator {
  const fallback = locale.toLocaleLowerCase().startsWith("tr") ? FALLBACK_TR : FALLBACK_EN;

  return (key, replacements = {}): string => {
    const catalogText = readNestedText(translations, ["review", ...key.split(".")]);
    let value = catalogText ?? fallback[key];
    for (const [name, replacement] of Object.entries(replacements)) {
      value = value.replaceAll(`%${name}%`, replacement);
    }
    return value;
  };
}
