export type PatternWorkspaceTextKey =
  | "shell.kicker"
  | "shell.title"
  | "shell.status"
  | "shell.navigationLabel"
  | "shell.inspectorLabel"
  | "shell.caseLabel"
  | "shell.sourceMetric"
  | "shell.evidenceMetric"
  | "shell.boardNoteMetric"
  | "shell.connectionMetric"
  | "shell.reviewMetric"
  | "feedback.dismiss"
  | "feedback.sentToDesk"
  | "feedback.alreadyOnDesk"
  | "feedback.addedToReview"
  | "feedback.alreadyInReview"
  | "feedback.sourcePinned"
  | "feedback.noteAdded"
  | "feedback.boardItemAdded"
  | "feedback.sourceAdded"
  | "feedback.sourceRemoved"
  | "feedback.boardItemRemoved"
  | "feedback.sessionReset"
  | "feedback.evidenceAdded"
  | "feedback.connectionAdded"
  | "feedback.connectionUpdated"
  | "feedback.connectionUnchanged"
  | "feedback.debateUpdated"
  | "feedback.importSucceeded"
  | "feedback.importFailed"
  | "feedback.caseIdentityUpdated"
  | "feedback.caseIdentityUnchanged"
  | "shell.keyboardHint"
  | "nav.overview.label"
  | "nav.overview.description"
  | "nav.board.label"
  | "nav.board.description"
  | "nav.archive.label"
  | "nav.archive.description"
  | "nav.connections.label"
  | "nav.connections.description"
  | "nav.review.label"
  | "nav.review.description"
  | "nav.report.label"
  | "nav.report.description"
  | "nav.reviewHistory.label"
  | "nav.reviewHistory.description"
  | "overview.activityLabel"
  | "overview.activityTitle"
  | "overview.activityCopy"
  | "overview.identityLabel"
  | "overview.identityTitle"
  | "overview.identityCopy"
  | "overview.caseNameLabel"
  | "overview.caseNamePlaceholder"
  | "overview.researchQuestionLabel"
  | "overview.researchQuestionPlaceholder"
  | "overview.saveIdentity"
  | "board.canvasLabel"
  | "board.inspectorLabel"
  | "board.toolsLabel"
  | "archive.browserLabel"
  | "archive.inspectorLabel"
  | "archive.toolsLabel"
  | "archive.searchLabel"
  | "archive.searchPlaceholder"
  | "archive.filterLabel"
  | "archive.allSources"
  | "archive.visibleCount"
  | "archive.empty"
  | "connections.kicker"
  | "connections.title"
  | "connections.intro"
  | "connections.entitiesLabel"
  | "connections.composerLabel"
  | "report.outlineLabel"
  | "report.documentLabel"
  | "report.jumpLabel"
  | "review.workspaceLabel"
  | "review.debateInspectorLabel";

export type PatternWorkspaceTranslator = (
  key: PatternWorkspaceTextKey,
  replacements?: Readonly<Record<string, string>>
) => string;

const FALLBACK_TR: Readonly<Record<PatternWorkspaceTextKey, string>> = {
  "shell.kicker": "Soruşturma sistemi",
  "shell.title": "Pattern Room",
  "shell.status": "Yerel vaka aktif",
  "shell.navigationLabel": "Çalışma alanları",
  "shell.inspectorLabel": "Bağlam paneli",
  "shell.caseLabel": "Aktif vaka",
  "shell.sourceMetric": "%count% kaynak",
  "shell.evidenceMetric": "%count% kanıt",
  "shell.boardNoteMetric": "%count% pano notu",
  "shell.connectionMetric": "%count% bağlantı",
  "shell.reviewMetric": "%count% inceleme",
  "feedback.dismiss": "Bildirimi kapat",
  "feedback.sentToDesk": "Öğe çalışma masasına gönderildi.",
  "feedback.alreadyOnDesk": "Öğe zaten çalışma masasında.",
  "feedback.addedToReview": "Öğe 10. Adam referanslarına eklendi.",
  "feedback.alreadyInReview": "Öğe zaten 10. Adam referanslarında.",
  "feedback.sourcePinned": "Kaynak soruşturma tuvaline sabitlendi.",
  "feedback.noteAdded": "Yerel not eklendi.",
  "feedback.boardItemAdded": "Pano öğesi eklendi.",
  "feedback.sourceAdded": "Kaynak arşive eklendi.",
  "feedback.sourceRemoved": "Kaynak ve bağlı yerel izler kaldırıldı.",
  "feedback.boardItemRemoved": "Yerel pano öğesi kaldırıldı.",
  "feedback.sessionReset": "Yerel oturum temizlendi.",
  "feedback.evidenceAdded": "Kanıt notu eklendi.",
  "feedback.connectionAdded": "Bağlantı oluşturuldu.",
  "feedback.connectionUpdated": "Yerel bağlantı güncellendi.",
  "feedback.connectionUnchanged": "Bağlantıda kaydedilecek bir değişiklik yok.",
  "feedback.debateUpdated": "10. Adam oturumu güncellendi.",
  "feedback.importSucceeded": "Kaynak içe aktarıldı.",
  "feedback.importFailed": "İşlem tamamlanamadı; alanları ve uyarıları kontrol edin.",
  "feedback.caseIdentityUpdated": "Vaka kimliği güncellendi.",
  "feedback.caseIdentityUnchanged": "Vaka kimliğinde kaydedilecek bir değişiklik yok.",
  "shell.keyboardHint": "Ok tuşlarıyla çalışma alanları arasında geçiş yap.",
  "nav.overview.label": "Vaka Merkezi",
  "nav.overview.description": "Genel görünüm",
  "nav.board.label": "Soruşturma Tuvali",
  "nav.board.description": "Pano ve ilişki görünümleri",
  "nav.archive.label": "Arşiv",
  "nav.archive.description": "Kaynak araştırması",
  "nav.connections.label": "İlişki Görünümü",
  "nav.connections.description": "Soruşturma tuvalini grafik modunda aç",
  "nav.review.label": "Vaka İncelemesi",
  "nav.review.description": "10. Adam ve AI",
  "nav.report.label": "Rapor",
  "nav.report.description": "Salt okunur dosya",
  "nav.reviewHistory.label": "İnceleme Geçmişi",
  "nav.reviewHistory.description": "Önceki oturumlar",
  "overview.activityLabel": "Vaka faaliyeti",
  "overview.activityTitle": "Araştırma masası hazır",
  "overview.activityCopy": "Her ana araç soldaki navigasyondan doğrudan açılır.",
  "overview.identityLabel": "Vaka kimliği",
  "overview.identityTitle": "Araştırmayı adlandır",
  "overview.identityCopy":
    "Vaka adı ve ana araştırma sorusu tüm çalışma alanlarına, rapora ve Case Packet önizlemesine yansır.",
  "overview.caseNameLabel": "Vaka adı",
  "overview.caseNamePlaceholder": "Örn. Kuzey Koridoru Sensör Olayı",
  "overview.researchQuestionLabel": "Ana araştırma sorusu",
  "overview.researchQuestionPlaceholder": "Bu araştırma hangi soruya yanıt arıyor?",
  "overview.saveIdentity": "Vaka Kimliğini Kaydet",
  "board.canvasLabel": "Pano çalışma yüzeyi",
  "board.inspectorLabel": "Pano inspector",
  "board.toolsLabel": "Hızlı ekleme araçları",
  "archive.browserLabel": "Kaynak tarayıcı",
  "archive.inspectorLabel": "Kaynak inspector",
  "archive.toolsLabel": "Arşiv araçları",
  "archive.searchLabel": "Arşivde ara",
  "archive.searchPlaceholder": "Başlık, tür, köken veya içerik ara",
  "archive.filterLabel": "Kaynak türü",
  "archive.allSources": "Tüm kaynaklar",
  "archive.visibleCount": "%visible% / %total% kaynak",
  "archive.empty": "Bu aramayla eşleşen kaynak yok.",
  "connections.kicker": "İlişki haritası",
  "connections.title": "Bağlantılar",
  "connections.intro": "İddiaları, kaynakları ve kanıtları aynı ilişki yüzeyinde karşılaştır.",
  "connections.entitiesLabel": "Bağlanabilir öğeler",
  "connections.composerLabel": "Yeni bağlantı",
  "report.outlineLabel": "Belge içeriği",
  "report.documentLabel": "Vaka raporu",
  "report.jumpLabel": "%section% bölümüne git",
  "review.workspaceLabel": "Vaka inceleme çalışma alanı",
  "review.debateInspectorLabel": "10. Adam oturumu",
};

const FALLBACK_EN: Readonly<Record<PatternWorkspaceTextKey, string>> = {
  "shell.kicker": "Investigation system",
  "shell.title": "Pattern Room",
  "shell.status": "Local case active",
  "shell.navigationLabel": "Workspaces",
  "shell.inspectorLabel": "Context inspector",
  "shell.caseLabel": "Active case",
  "shell.sourceMetric": "%count% sources",
  "shell.evidenceMetric": "%count% evidence",
  "shell.boardNoteMetric": "%count% board notes",
  "shell.connectionMetric": "%count% connections",
  "shell.reviewMetric": "%count% reviews",
  "feedback.dismiss": "Dismiss notification",
  "feedback.sentToDesk": "Item sent to the working desk.",
  "feedback.alreadyOnDesk": "Item is already on the working desk.",
  "feedback.addedToReview": "Item added to Tenth Man references.",
  "feedback.alreadyInReview": "Item is already in Tenth Man references.",
  "feedback.sourcePinned": "Source pinned to the investigation canvas.",
  "feedback.noteAdded": "Local note added.",
  "feedback.boardItemAdded": "Board item added.",
  "feedback.sourceAdded": "Source added to the archive.",
  "feedback.sourceRemoved": "Source and linked local traces removed.",
  "feedback.boardItemRemoved": "Local board item removed.",
  "feedback.sessionReset": "Local session cleared.",
  "feedback.evidenceAdded": "Evidence note added.",
  "feedback.connectionAdded": "Connection created.",
  "feedback.connectionUpdated": "Local connection updated.",
  "feedback.connectionUnchanged": "There are no connection changes to save.",
  "feedback.debateUpdated": "Tenth Man session updated.",
  "feedback.importSucceeded": "Source imported.",
  "feedback.importFailed": "The action could not be completed; check the fields and warnings.",
  "feedback.caseIdentityUpdated": "Case identity updated.",
  "feedback.caseIdentityUnchanged": "There are no case identity changes to save.",
  "shell.keyboardHint": "Use the arrow keys to move between workspaces.",
  "nav.overview.label": "Case Hub",
  "nav.overview.description": "Case overview",
  "nav.board.label": "Investigation Canvas",
  "nav.board.description": "Board and relationship views",
  "nav.archive.label": "Archive",
  "nav.archive.description": "Source research",
  "nav.connections.label": "Graph View",
  "nav.connections.description": "Open the investigation canvas in graph mode",
  "nav.review.label": "Case Review",
  "nav.review.description": "Tenth Man and AI",
  "nav.report.label": "Report",
  "nav.report.description": "Read-only brief",
  "nav.reviewHistory.label": "Review History",
  "nav.reviewHistory.description": "Previous sessions",
  "overview.activityLabel": "Case activity",
  "overview.activityTitle": "Investigation desk ready",
  "overview.activityCopy": "Open every major tool directly from the navigation.",
  "overview.identityLabel": "Case identity",
  "overview.identityTitle": "Name the investigation",
  "overview.identityCopy":
    "The case name and primary research question flow into every workspace, the report, and the Case Packet preview.",
  "overview.caseNameLabel": "Case name",
  "overview.caseNamePlaceholder": "Example: North Corridor Sensor Incident",
  "overview.researchQuestionLabel": "Primary research question",
  "overview.researchQuestionPlaceholder": "What question is this investigation trying to answer?",
  "overview.saveIdentity": "Save Case Identity",
  "board.canvasLabel": "Board workspace",
  "board.inspectorLabel": "Board inspector",
  "board.toolsLabel": "Quick authoring tools",
  "archive.browserLabel": "Source browser",
  "archive.inspectorLabel": "Source inspector",
  "archive.toolsLabel": "Archive tools",
  "archive.searchLabel": "Search archive",
  "archive.searchPlaceholder": "Search title, type, origin, or content",
  "archive.filterLabel": "Source type",
  "archive.allSources": "All sources",
  "archive.visibleCount": "%visible% / %total% sources",
  "archive.empty": "No sources match this search.",
  "connections.kicker": "Relationship map",
  "connections.title": "Connections",
  "connections.intro": "Compare claims, sources, and evidence on one relationship surface.",
  "connections.entitiesLabel": "Connectable items",
  "connections.composerLabel": "New connection",
  "report.outlineLabel": "Document outline",
  "report.documentLabel": "Case report",
  "report.jumpLabel": "Jump to %section%",
  "review.workspaceLabel": "Case review workspace",
  "review.debateInspectorLabel": "Tenth Man session",
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

export function createPatternWorkspaceTranslator(
  locale: string,
  translations: unknown
): PatternWorkspaceTranslator {
  const fallback = locale.toLocaleLowerCase().startsWith("tr") ? FALLBACK_TR : FALLBACK_EN;

  return (key, replacements = {}): string => {
    const catalogText = readNestedText(translations, ["workspace", ...key.split(".")]);
    let value = catalogText ?? fallback[key];
    for (const [name, replacement] of Object.entries(replacements)) {
      value = value.replaceAll(`%${name}%`, replacement);
    }
    return value;
  };
}
