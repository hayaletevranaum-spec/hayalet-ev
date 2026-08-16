import type {
  PatternSource,
  PatternLongTextSourceImportInput,
  PatternLongTextSourceImportStatus,
  PatternPanelActions,
  PatternRoomWorkspaceModel,
  PatternSampleSourceImportStatus,
  PatternSourceSegment,
  PatternUserTextSourceImportStatus,
} from "../../shared/types/pattern-room.js";
import {
  createPatternWorkspaceTranslator,
  type PatternWorkspaceTranslator,
} from "../pattern-room-workspace-i18n.js";
import { createActionButton, createElement, createPanelShell } from "./pattern-panel-utils.js";

const REMOVE_LOCAL_SOURCE_CONFIRMATION = "Bu yerel kaynak odadan kaldırılacak. Devam edilsin mi?";
const RESET_LOCAL_SESSION_CONFIRMATION =
  "Tüm yerel kaynaklar, notlar ve geçici tartışma izleri temizlenecek. Hazır konu verileri korunur. Devam edilsin mi?";
const SOURCE_SEGMENT_PREVIEW_LENGTH = 120;
const SOURCE_FULL_TEXT_SEARCH_CONTEXT_LENGTH = 160;

type PatternArchivePanelSelection = {
  selectedSourceId: string | null;
  onSelectSource: (sourceId: string | null) => void;
  evidenceCaptureStatus: string | null;
  onEvidenceCaptureStatusChange: (message: string | null) => void;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  sourceTypeFilter?: string;
  onSourceTypeFilterChange?: (sourceType: string) => void;
};

type SourceEvidenceCaptureForm = {
  element: HTMLElement;
  prepareFromSegment: (segment: PatternSourceSegment) => void;
};

type SourceSegmentsNavigator = {
  element: HTMLElement;
  selectSegmentById: (segmentId: string) => void;
};

const DEFAULT_ARCHIVE_PANEL_SELECTION: PatternArchivePanelSelection = {
  selectedSourceId: null,
  onSelectSource: () => {},
  evidenceCaptureStatus: null,
  onEvidenceCaptureStatusChange: () => {},
  searchQuery: "",
  onSearchQueryChange: () => {},
  sourceTypeFilter: "all",
  onSourceTypeFilterChange: () => {},
};

const LONG_TEXT_SOURCE_KIND_OPTIONS = [
  { label: "Kitap", value: "book" },
  { label: "Makale", value: "article" },
  { label: "Gazete", value: "newspaper" },
  { label: "Dini metin", value: "religious_text" },
  { label: "Arşiv metni", value: "archive_text" },
  { label: "Kişisel uzun not", value: "personal_note" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: PatternLongTextSourceImportInput["sourceKind"];
}>;

function createTextInput(name: string, placeholder: string): HTMLInputElement {
  const input = createElement("input", "pattern-room-inline-input");
  input.name = name;
  input.placeholder = placeholder;
  return input;
}

function createTextArea(name: string, placeholder: string): HTMLTextAreaElement {
  const textarea = createElement("textarea", "pattern-room-inline-input");
  textarea.name = name;
  textarea.placeholder = placeholder;
  return textarea;
}

function createSourceKindSelect(): HTMLSelectElement {
  const select = createElement("select", "pattern-room-inline-input");
  select.name = "sourceKind";
  LONG_TEXT_SOURCE_KIND_OPTIONS.forEach((sourceKind) => {
    const option = createElement("option", undefined, sourceKind.label);
    option.value = sourceKind.value;
    select.append(option);
  });
  select.value = "book";
  return select;
}

function createSubmitButton(label: string): HTMLButtonElement {
  const button = createElement("button", "pattern-room-action-button", label);
  button.type = "submit";
  return button;
}

function createAuthoringDisclosure(label: string, form: HTMLFormElement): HTMLElement {
  const disclosure = createElement("details", "pattern-room-inline-disclosure");
  disclosure.dataset["patternAuthoringDisclosure"] = label;
  disclosure.append(createElement("summary", "pattern-room-inline-summary", label), form);
  return disclosure;
}

function createSourceAuthoringForm(actions: PatternPanelActions): HTMLElement {
  const form = createElement("form", "pattern-room-inline-form");
  form.dataset["patternAuthorSourceForm"] = "true";

  const label = createTextInput("label", "Başlık");
  label.dataset["patternAuthorSourceLabel"] = "true";
  const origin = createTextInput("origin", "Köken");
  origin.dataset["patternAuthorSourceOrigin"] = "true";
  const note = createTextArea("note", "Not");
  note.dataset["patternAuthorSourceNote"] = "true";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (label.value.trim() === "" || origin.value.trim() === "") {
      return;
    }

    actions.addAuthoredSource(label.value, origin.value, note.value);
    form.reset();
  });

  form.append(label, origin, note, createSubmitButton("Ekle"));
  return createAuthoringDisclosure("Kaynak Ekle", form);
}

function sourceTypeClass(sourceTypeLabel: string): string {
  if (sourceTypeLabel === "Kitap / Metin") {
    return "text-source";
  }
  if (sourceTypeLabel === "Görsel kaynak") {
    return "visual-source";
  }
  if (sourceTypeLabel === "Masa çıktısı") {
    return "table-output";
  }
  return "uncertain-source";
}

function createSourceWorkbenchDemo(
  actions: PatternPanelActions,
  userTextStatus: PatternUserTextSourceImportStatus | null,
  longTextStatus: PatternLongTextSourceImportStatus | null,
  status: PatternSampleSourceImportStatus | null
): HTMLElement {
  const demo = createElement("section", "pattern-room-source-workbench-demo");
  demo.dataset["patternSourceWorkbenchDemo"] = "true";
  const title = createTextInput("title", "Başlık");
  title.dataset["patternUserTextSourceTitle"] = "true";
  const text = createTextArea("text", "Metni buraya yapıştır");
  text.dataset["patternUserTextSourceText"] = "true";
  const form = createElement("form", "pattern-room-inline-form pattern-room-source-workbench-form");
  form.dataset["patternUserTextSourceForm"] = "true";
  const userTextStatusLine = createElement(
    "p",
    "pattern-room-source-workbench-status",
    userTextStatus?.message ?? "Henüz kullanıcı metni kaynak olarak eklenmedi."
  );
  userTextStatusLine.dataset["patternUserTextSourceStatus"] = "true";

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (text.value.trim() === "") {
      userTextStatusLine.textContent = "Metin boş olamaz.";
      return;
    }

    const result = actions.importUserTextSource({
      title: title.value,
      text: text.value,
      language: "tr",
    });
    userTextStatusLine.textContent = result.message;
    if (result.success && !result.duplicate && typeof form.reset === "function") {
      form.reset();
    }
  });

  const submitButton = createSubmitButton("Metni Odaya Aktar");
  submitButton.dataset["patternImportUserTextSource"] = "true";
  form.append(title, text, submitButton);

  const longTextForm = createElement(
    "form",
    "pattern-room-inline-form pattern-room-source-workbench-form"
  );
  longTextForm.dataset["patternLongTextSourceForm"] = "true";
  const longTextTitle = createTextInput("title", "Başlık");
  longTextTitle.dataset["patternLongTextSourceTitle"] = "true";
  const longTextOrigin = createTextInput("origin", "Kaynak / Köken");
  longTextOrigin.dataset["patternLongTextSourceOrigin"] = "true";
  const longTextKind = createSourceKindSelect();
  longTextKind.dataset["patternLongTextSourceKind"] = "true";
  const longTextChapter = createTextInput("chapter", "Bölüm / başlık notu (opsiyonel)");
  longTextChapter.dataset["patternLongTextSourceChapter"] = "true";
  const longTextPage = createTextInput("page", "Sayfa / referans (opsiyonel)");
  longTextPage.dataset["patternLongTextSourcePage"] = "true";
  const longText = createTextArea("text", "Metin");
  longText.dataset["patternLongTextSourceText"] = "true";
  const longTextStatusLine = createElement(
    "p",
    "pattern-room-source-workbench-status",
    longTextStatus?.message ?? "Henüz uzun metin kaynak olarak eklenmedi."
  );
  longTextStatusLine.dataset["patternLongTextSourceStatus"] = "true";
  const longTextSubmitButton = createSubmitButton("Uzun Metni Odaya Aktar");
  longTextSubmitButton.dataset["patternImportLongTextSource"] = "true";

  longTextForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (longTextTitle.value.trim() === "") {
      longTextStatusLine.textContent = "Başlık boş olamaz.";
      return;
    }
    if (longTextOrigin.value.trim() === "") {
      longTextStatusLine.textContent = "Kaynak bilgisi boş olamaz.";
      return;
    }
    if (longText.value.trim() === "") {
      longTextStatusLine.textContent = "Metin boş olamaz.";
      return;
    }

    const result = actions.importLongTextSource({
      title: longTextTitle.value,
      origin: longTextOrigin.value,
      sourceKind: longTextKind.value as PatternLongTextSourceImportInput["sourceKind"],
      chapter: longTextChapter.value,
      page: longTextPage.value,
      text: longText.value,
      language: "tr",
    });
    longTextStatusLine.textContent = result.message;
    if (result.success && !result.duplicate && typeof longTextForm.reset === "function") {
      longTextForm.reset();
    }
  });

  longTextForm.append(
    createElement(
      "p",
      "pattern-room-inline-note",
      "Bu aşamada metin yalnızca kaynak olarak eklenir; alıntı ve örüntü çıkarımı daha sonra yapılır."
    ),
    longTextTitle,
    longTextOrigin,
    longTextKind,
    longTextChapter,
    longTextPage,
    longText,
    longTextSubmitButton,
    longTextStatusLine
  );
  const longTextDisclosure = createAuthoringDisclosure(
    "Uzun Metin / Kitap / Arşiv Ekle",
    longTextForm
  );
  longTextDisclosure.dataset["patternLongTextSourceDisclosure"] = "true";

  const sampleWrap = createElement("div", "pattern-room-source-workbench-example");
  const importButton = createActionButton("Örnek Kaynak Paketini İçe Aktar", () => {
    actions.importSampleSourcePackage();
  });
  importButton.dataset["patternImportSampleSourcePackage"] = "true";
  const statusLine = createElement(
    "p",
    "pattern-room-source-workbench-status",
    status?.message ?? "Henüz örnek kaynak paketi içe aktarılmadı."
  );
  statusLine.dataset["patternSourceImportStatus"] = "true";
  sampleWrap.append(importButton, statusLine);

  demo.append(
    createElement("h3", undefined, "Kaynak Atölyesi"),
    createElement(
      "p",
      "pattern-room-inline-note",
      "Bu ilk sürüm metni kaynak olarak ekler; alıntı ve örüntü çıkarımı daha sonra eklenecek."
    ),
    form,
    userTextStatusLine,
    longTextDisclosure,
    sampleWrap
  );
  return demo;
}

function createLocalSessionResetSection(actions: PatternPanelActions): HTMLElement {
  const section = createElement("section", "pattern-room-local-session-reset");
  section.dataset["patternLocalSessionReset"] = "true";
  const resetButton = createActionButton("Yerel Oturumu Sıfırla", () => {
    if (!window.confirm(RESET_LOCAL_SESSION_CONFIRMATION)) {
      return;
    }
    actions.resetLocalSession();
  });
  resetButton.dataset["patternResetLocalSession"] = "true";

  section.append(
    createElement("span", "pattern-room-kicker", "Oda Temizliği"),
    createElement("h3", undefined, "Yerel Oturum"),
    createElement(
      "p",
      "pattern-room-inline-note",
      "Bu işlem yalnızca bu odada eklenen yerel kaynakları, notları, bağlantıları ve 10. Adam oturum izlerini temizler. Hazır konu verileri korunur."
    ),
    resetButton
  );
  return section;
}

function createSourceDetailMeta(label: string, value: string): HTMLElement {
  const item = createElement("span", "pattern-room-source-detail-meta-item", `${label}: ${value}`);
  return item;
}

function createSourceSegmentPreview(text: string): string {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (normalizedText.length <= SOURCE_SEGMENT_PREVIEW_LENGTH) {
    return normalizedText;
  }
  return `${normalizedText.slice(0, SOURCE_SEGMENT_PREVIEW_LENGTH).trimEnd()}…`;
}

function createOrderedSourceSegments(source: PatternSource): PatternSourceSegment[] {
  return [...(source.segments ?? [])].sort((left, right) => {
    return left.order - right.order;
  });
}

function normalizeSourceSearchText(value: string): string {
  return value.toLocaleLowerCase("tr");
}

function normalizeSourceSearchQuery(value: string): string {
  return normalizeSourceSearchText(value.trim());
}

function countSourceSearchMatches(text: string, normalizedQuery: string): number {
  if (normalizedQuery === "") {
    return 0;
  }

  const normalizedText = normalizeSourceSearchText(text);
  let matchCount = 0;
  let index = normalizedText.indexOf(normalizedQuery);
  while (index !== -1) {
    matchCount += 1;
    index = normalizedText.indexOf(normalizedQuery, index + normalizedQuery.length);
  }
  return matchCount;
}

function createSourceFullTextSearchSnippet(text: string, normalizedQuery: string): string {
  const normalizedText = normalizeSourceSearchText(text);
  const matchIndex = normalizedText.indexOf(normalizedQuery);
  if (matchIndex === -1) {
    return "";
  }

  const contextOffset = Math.floor(SOURCE_FULL_TEXT_SEARCH_CONTEXT_LENGTH / 2);
  const start = Math.max(0, matchIndex - contextOffset);
  const end = Math.min(text.length, start + SOURCE_FULL_TEXT_SEARCH_CONTEXT_LENGTH);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

function createSourceSegmentButton(
  segment: PatternSourceSegment,
  segmentNumber: number,
  onSelect: (segment: PatternSourceSegment) => void
): HTMLButtonElement {
  const button = createElement("button", "pattern-room-source-segment-button");
  button.type = "button";
  button.dataset["patternArchiveSourceSegment"] = segment.id;
  button.dataset["patternArchiveSourceSegmentSelected"] = "false";
  button.append(
    createElement("span", "pattern-room-source-segment-number", String(segmentNumber)),
    createElement("strong", undefined, segment.label),
    createElement("p", undefined, createSourceSegmentPreview(segment.text))
  );
  button.addEventListener("click", () => {
    onSelect(segment);
  });
  return button;
}

function createSourceSearchResultButton(
  segment: PatternSourceSegment,
  segmentNumber: number,
  matchCount: number,
  onSelect: (segmentId: string) => void
): HTMLButtonElement {
  const button = createElement("button", "pattern-room-source-search-result");
  button.type = "button";
  button.dataset["patternArchiveSourceSearchResult"] = segment.id;
  button.dataset["patternArchiveSourceSearchMatchCount"] = String(matchCount);
  button.append(
    createElement("span", "pattern-room-source-segment-number", String(segmentNumber)),
    createElement("strong", undefined, segment.label),
    createElement("p", undefined, createSourceSegmentPreview(segment.text)),
    createElement("small", "pattern-room-source-search-count", `${String(matchCount)} eşleşme`)
  );
  button.addEventListener("click", () => {
    onSelect(segment.id);
  });
  return button;
}

function createSourceSegmentsNavigator(
  source: PatternSource,
  orderedSegments: readonly PatternSourceSegment[],
  onPrepareEvidence: (segment: PatternSourceSegment) => void
): SourceSegmentsNavigator | null {
  if (orderedSegments.length === 0) {
    return null;
  }

  const section = createElement("section", "pattern-room-source-segments");
  section.dataset["patternArchiveSourceSegments"] = source.id;
  const list = createElement("div", "pattern-room-source-segment-list");
  const selectedSegmentText = createElement(
    "pre",
    "pattern-room-source-segment-text",
    "Bir segment seç."
  );
  selectedSegmentText.dataset["patternArchiveSourceSegmentText"] = source.id;
  const selectedSegmentDetail = createElement("div", "pattern-room-source-segment-detail");
  selectedSegmentDetail.dataset["patternArchiveSourceSegmentDetail"] = source.id;
  let selectedSegment: PatternSourceSegment | null = null;
  const selectedSegmentHint = createElement(
    "p",
    "pattern-room-inline-note",
    "Seçili segmenti kanıt formuna aktarır; otomatik analiz yapmaz."
  );
  const prepareEvidenceButton = createActionButton("Bu Segmentten Kanıt Hazırla", () => {
    if (selectedSegment === null) {
      return;
    }

    onPrepareEvidence(selectedSegment);
  });
  prepareEvidenceButton.disabled = true;
  prepareEvidenceButton.dataset["patternArchivePrepareSegmentEvidence"] = source.id;
  selectedSegmentDetail.append(
    createElement("h4", undefined, "Seçili segment"),
    selectedSegmentText,
    selectedSegmentHint,
    prepareEvidenceButton
  );

  const buttons: HTMLButtonElement[] = [];
  const selectSegment = (nextSegment: PatternSourceSegment): void => {
    selectedSegment = nextSegment;
    buttons.forEach((button) => {
      const isSelected = button.dataset["patternArchiveSourceSegment"] === nextSegment.id;
      button.dataset["patternArchiveSourceSegmentSelected"] = isSelected ? "true" : "false";
      if (isSelected) {
        button.classList.add("selected-segment");
        return;
      }
      button.classList.remove("selected-segment");
    });
    selectedSegmentDetail.dataset["patternArchiveSelectedSegment"] = nextSegment.id;
    selectedSegmentText.textContent = nextSegment.text;
    prepareEvidenceButton.disabled = false;
  };

  orderedSegments.forEach((segment, index) => {
    const button = createSourceSegmentButton(segment, index + 1, selectSegment);
    buttons.push(button);
    list.append(button);
  });

  section.append(createElement("h3", undefined, "Segmentler"), list, selectedSegmentDetail);
  return {
    element: section,
    selectSegmentById(segmentId: string): void {
      const segment = orderedSegments.find((candidate) => {
        return candidate.id === segmentId;
      });
      if (segment !== undefined) {
        selectSegment(segment);
      }
    },
  };
}

function createSourceSearchSection(
  source: PatternSource,
  orderedSegments: readonly PatternSourceSegment[],
  onSelectSegment: ((segmentId: string) => void) | null
): HTMLElement {
  const section = createElement("section", "pattern-room-source-search");
  section.dataset["patternArchiveSourceSearch"] = source.id;
  section.dataset["patternArchiveSourceSearchState"] = "empty";
  const input = createTextInput("sourceSearch", "Kelime veya ifade ara");
  input.dataset["patternArchiveSourceSearchInput"] = source.id;
  const status = createElement("p", "pattern-room-source-search-status");
  status.dataset["patternArchiveSourceSearchStatus"] = source.id;
  const results = createElement("div", "pattern-room-source-search-results");
  results.dataset["patternArchiveSourceSearchResults"] = source.id;

  const renderEmptySearch = (): void => {
    section.dataset["patternArchiveSourceSearchState"] = "empty";
    status.textContent = "";
    results.replaceChildren();
  };

  const renderNoMatches = (): void => {
    section.dataset["patternArchiveSourceSearchState"] = "none";
    status.textContent = "Eşleşme bulunamadı.";
    results.replaceChildren();
  };

  const renderSegmentMatches = (normalizedQuery: string): void => {
    const matches = orderedSegments
      .map((segment, index) => {
        const matchCount = countSourceSearchMatches(
          `${segment.label} ${segment.text}`,
          normalizedQuery
        );
        return {
          matchCount,
          segment,
          segmentNumber: index + 1,
        };
      })
      .filter((match) => {
        return match.matchCount > 0;
      });

    if (matches.length === 0 || onSelectSegment === null) {
      renderNoMatches();
      return;
    }

    section.dataset["patternArchiveSourceSearchState"] = "matches";
    status.textContent = `${String(matches.length)} segmentte eşleşme.`;
    results.replaceChildren(
      ...matches.map((match) => {
        return createSourceSearchResultButton(
          match.segment,
          match.segmentNumber,
          match.matchCount,
          onSelectSegment
        );
      })
    );
  };

  const renderFullTextMatch = (normalizedQuery: string): void => {
    const matchCount = countSourceSearchMatches(source.note, normalizedQuery);
    if (matchCount === 0) {
      renderNoMatches();
      return;
    }

    const fullTextResult = createElement("div", "pattern-room-source-search-full-text-result");
    fullTextResult.dataset["patternArchiveSourceSearchFullTextResult"] = source.id;
    fullTextResult.append(
      createElement("strong", undefined, "Tam metinde eşleşme bulundu."),
      createElement("p", undefined, createSourceFullTextSearchSnippet(source.note, normalizedQuery))
    );
    section.dataset["patternArchiveSourceSearchState"] = "matches";
    status.textContent = `${String(matchCount)} eşleşme.`;
    results.replaceChildren(fullTextResult);
  };

  input.addEventListener("input", () => {
    const normalizedQuery = normalizeSourceSearchQuery(input.value);
    if (normalizedQuery === "") {
      renderEmptySearch();
      return;
    }

    if (orderedSegments.length > 0) {
      renderSegmentMatches(normalizedQuery);
      return;
    }

    renderFullTextMatch(normalizedQuery);
  });

  section.append(createElement("h3", undefined, "Kaynak içinde ara"), input, status, results);
  return section;
}

function createSourceEvidenceCaptureForm(
  source: PatternSource,
  actions: PatternPanelActions,
  selection: PatternArchivePanelSelection
): SourceEvidenceCaptureForm {
  const section = createElement("section", "pattern-room-source-evidence-capture");
  section.dataset["patternArchiveEvidenceCapture"] = source.id;
  const form = createElement("form", "pattern-room-inline-form");
  form.dataset["patternArchiveEvidenceForm"] = source.id;
  const label = createTextInput("label", "Kanıt başlığı");
  label.dataset["patternArchiveEvidenceLabel"] = source.id;
  const excerpt = createTextArea("excerpt", "Alıntı / pasaj");
  excerpt.dataset["patternArchiveEvidenceExcerpt"] = source.id;
  const interpretation = createTextArea("interpretation", "Yorum / bağlam (opsiyonel)");
  interpretation.dataset["patternArchiveEvidenceInterpretation"] = source.id;
  const submit = createSubmitButton("Kanıt Notu Oluştur");
  submit.dataset["patternCreateSourceEvidence"] = source.id;
  const status = createElement(
    "p",
    "pattern-room-source-evidence-status",
    selection.evidenceCaptureStatus ?? ""
  );
  status.dataset["patternArchiveEvidenceStatus"] = source.id;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (label.value.trim() === "") {
      status.textContent = "Kanıt başlığı boş olamaz.";
      selection.onEvidenceCaptureStatusChange(status.textContent);
      return;
    }
    if (excerpt.value.trim() === "") {
      status.textContent = "Alıntı boş olamaz.";
      selection.onEvidenceCaptureStatusChange(status.textContent);
      return;
    }

    selection.onEvidenceCaptureStatusChange("Kanıt notu panoya eklendi.");
    actions.addAuthoredEvidence(label.value, excerpt.value, interpretation.value, "evidence", {
      sourceId: source.id,
      sourceLabel: source.label,
    });
    if (typeof form.reset === "function") {
      form.reset();
    }
  });

  form.append(label, excerpt, interpretation, submit, status);
  section.append(
    createElement("h3", undefined, "Bu kaynaktan kanıt notu oluştur"),
    createElement(
      "p",
      "pattern-room-inline-note",
      "Bu işlem otomatik analiz yapmaz; seçtiğin pasajı yerel kanıt notu olarak panoya ekler."
    ),
    form
  );
  return {
    element: section,
    prepareFromSegment(segment: PatternSourceSegment): void {
      label.value = segment.label;
      excerpt.value = segment.text;
      interpretation.value = "";
    },
  };
}

function createArchiveSourceDetail(
  source: PatternSource | undefined,
  selectedSourceId: string | null,
  actions: PatternPanelActions,
  selection: PatternArchivePanelSelection
): HTMLElement {
  const detail = createElement("section", "pattern-room-source-detail");
  detail.dataset["patternArchiveSourceDetail"] = "true";
  detail.append(createElement("h2", undefined, "Kaynak Detayı"));

  if (source === undefined) {
    const placeholder = createElement(
      "p",
      "pattern-room-source-detail-placeholder",
      selectedSourceId === null ? "Bir kaynak seç" : "Seçili kaynak artık arşivde değil."
    );
    placeholder.dataset["patternArchiveSourceDetailPlaceholder"] = "true";
    detail.append(placeholder);
    return detail;
  }

  detail.dataset["patternArchiveSourceDetailId"] = source.id;
  const meta = createElement("div", "pattern-room-source-detail-meta");
  meta.append(
    createSourceDetailMeta("Tür", source.sourceTypeLabel),
    createSourceDetailMeta("Köken", source.origin),
    createSourceDetailMeta("Durum", source.status)
  );
  const fullText = createElement("pre", "pattern-room-source-detail-text", source.note);
  fullText.dataset["patternArchiveSourceFullText"] = source.id;
  const orderedSegments = createOrderedSourceSegments(source);
  const evidenceCaptureForm = createSourceEvidenceCaptureForm(source, actions, selection);
  const segmentsNavigator = createSourceSegmentsNavigator(
    source,
    orderedSegments,
    evidenceCaptureForm.prepareFromSegment
  );
  const searchSection = createSourceSearchSection(
    source,
    orderedSegments,
    segmentsNavigator?.selectSegmentById ?? null
  );

  detail.append(
    createElement("h3", undefined, source.label),
    meta,
    searchSection,
    fullText,
    ...(segmentsNavigator === null ? [] : [segmentsNavigator.element]),
    evidenceCaptureForm.element
  );
  return detail;
}

export function createArchivePanel(
  data: PatternRoomWorkspaceModel,
  actions: PatternPanelActions,
  onBack: () => void,
  userTextSourceImportStatus: PatternUserTextSourceImportStatus | null = null,
  longTextSourceImportStatus: PatternLongTextSourceImportStatus | null = null,
  sourceImportStatus: PatternSampleSourceImportStatus | null = null,
  selection: PatternArchivePanelSelection = DEFAULT_ARCHIVE_PANEL_SELECTION,
  text: PatternWorkspaceTranslator = createPatternWorkspaceTranslator("tr", null)
): HTMLElement {
  const shell = createPanelShell("archive", text("nav.archive.label"), onBack);
  const workspace = createElement("div", "pattern-room-archive-workspace");
  const browser = createElement("section", "pattern-room-archive-browser");
  browser.ariaLabel = text("archive.browserLabel");
  const browserHeader = createElement("header", "pattern-room-workspace-section-header");
  browserHeader.append(
    createElement("span", "pattern-room-kicker", text("archive.browserLabel")),
    createElement("strong", undefined, data.subject)
  );

  const toolbar = createElement("div", "pattern-room-archive-toolbar");
  const searchField = createElement("label", "pattern-room-archive-toolbar-field");
  const search = createTextInput("archiveSearch", text("archive.searchPlaceholder"));
  search.value = selection.searchQuery ?? "";
  search.ariaLabel = text("archive.searchLabel");
  search.dataset["patternArchiveSearch"] = "true";
  searchField.append(createElement("span", undefined, text("archive.searchLabel")), search);

  const filterField = createElement("label", "pattern-room-archive-toolbar-field");
  const filter = createElement("select", "pattern-room-inline-input");
  filter.ariaLabel = text("archive.filterLabel");
  filter.dataset["patternArchiveTypeFilter"] = "true";
  const allOption = createElement("option", undefined, text("archive.allSources"));
  allOption.value = "all";
  filter.append(allOption);
  const sourceTypes = Array.from(
    new Set(data.sources.map((source) => source.sourceTypeLabel))
  ).sort((left, right) => {
    return left.localeCompare(right, document.documentElement.lang || "tr");
  });
  sourceTypes.forEach((sourceType) => {
    const option = createElement("option", undefined, sourceType);
    option.value = sourceType;
    filter.append(option);
  });
  const requestedFilter = selection.sourceTypeFilter ?? "all";
  filter.value = sourceTypes.includes(requestedFilter) ? requestedFilter : "all";
  filterField.append(createElement("span", undefined, text("archive.filterLabel")), filter);
  toolbar.append(searchField, filterField);

  const count = createElement("p", "pattern-room-archive-result-count");
  count.dataset["patternArchiveVisibleCount"] = "true";
  count.ariaLive = "polite";
  const empty = createElement("p", "pattern-room-empty-state", text("archive.empty"));
  empty.dataset["patternArchiveEmpty"] = "true";
  const list = createElement("div", "pattern-room-archive-list");
  const selectedSource = data.sources.find((source) => {
    return source.id === selection.selectedSourceId;
  });
  const sourceCards: Array<{ readonly source: PatternSource; readonly card: HTMLElement }> = [];

  data.sources.forEach((source) => {
    const toneClass =
      source.isLocal === true ? "local-source" : sourceTypeClass(source.sourceTypeLabel);
    const isSelected = source.id === selection.selectedSourceId;
    const card = createElement(
      "article",
      `pattern-room-archive-card ${toneClass}${isSelected ? " selected-source" : ""}`
    );
    card.dataset["patternArchiveSource"] = source.id;
    card.dataset["patternArchiveSourceSelected"] = isSelected ? "true" : "false";
    card.dataset["patternArchiveSourceType"] = source.sourceTypeLabel;
    card.ariaLabel = source.label;
    const drawer = createElement("span", "pattern-room-archive-drawer", source.origin);
    const tag = createElement(
      "span",
      `pattern-room-source-tag ${toneClass}`,
      source.sourceTypeLabel
    );
    const preview = createElement(
      "p",
      "pattern-room-archive-preview",
      source.notePreview ?? source.note
    );
    preview.dataset["patternArchiveSourcePreview"] = source.id;
    const actionsRow = createElement("div", "pattern-room-action-row");
    const sourceStatus = createElement("small", "pattern-room-source-status", source.status);
    const metadata =
      source.metadataLine === undefined || source.metadataLine.trim() === ""
        ? null
        : createElement("span", "pattern-room-archive-meta", source.metadataLine);

    if (metadata !== null) {
      metadata.dataset["patternArchiveSourceMeta"] = source.id;
    }

    const inspectButton = createActionButton("İncele", () => {
      selection.onSelectSource(source.id);
    });
    inspectButton.dataset["patternInspectSource"] = source.id;
    inspectButton.ariaPressed = isSelected ? "true" : "false";
    const evidenceButton = createActionButton("Kanıt Notu Oluştur", () => {
      selection.onSelectSource(source.id);
    });
    evidenceButton.dataset["patternQuickEvidenceSource"] = source.id;
    actionsRow.append(inspectButton, evidenceButton);

    if (source.isLocal !== true) {
      const pinButton = createActionButton("Panoya İliştir", () => {
        actions.pinSourceToBoard(source.id, "evidence");
      });
      pinButton.dataset["patternPinSource"] = source.id;
      actionsRow.append(pinButton);
    }

    const debateButton = createActionButton("10. Adam’a Ekle", () => {
      actions.addSourceToDebate(source.id);
    });
    debateButton.dataset["patternAddSourceDebate"] = source.id;
    actionsRow.append(debateButton);
    if (source.isLocal === true) {
      const removeButton = createActionButton("Kaynağı kaldır", () => {
        if (!window.confirm(REMOVE_LOCAL_SOURCE_CONFIRMATION)) {
          return;
        }
        if (selection.selectedSourceId === source.id) {
          selection.onSelectSource(null);
        }
        actions.removeLocalSource(source.id);
      });
      removeButton.dataset["patternRemoveLocalSource"] = source.id;
      actionsRow.append(removeButton);
    }

    card.append(
      drawer,
      tag,
      createElement("h3", undefined, source.label),
      preview,
      ...(metadata === null ? [] : [metadata]),
      sourceStatus,
      actionsRow
    );
    sourceCards.push({ source, card });
    list.append(card);
  });

  const applyArchiveFilter = (): void => {
    const query = normalizeSourceSearchQuery(search.value);
    const selectedType = filter.value;
    let visibleCount = 0;
    sourceCards.forEach(({ source, card }) => {
      const searchable = normalizeSourceSearchText(
        [
          source.label,
          source.sourceTypeLabel,
          source.origin,
          source.note,
          source.metadataLine ?? "",
        ].join(" ")
      );
      const matchesQuery = query === "" || searchable.includes(query);
      const matchesType = selectedType === "all" || source.sourceTypeLabel === selectedType;
      const isVisible = matchesQuery && matchesType;
      card.hidden = !isVisible;
      card.ariaHidden = isVisible ? "false" : "true";
      if (isVisible) {
        visibleCount += 1;
      }
    });
    count.textContent = text("archive.visibleCount", {
      visible: String(visibleCount),
      total: String(sourceCards.length),
    });
    empty.hidden = visibleCount !== 0;
  };

  search.addEventListener("input", () => {
    selection.onSearchQueryChange?.(search.value);
    applyArchiveFilter();
  });
  filter.addEventListener("change", () => {
    selection.onSourceTypeFilterChange?.(filter.value);
    applyArchiveFilter();
  });
  applyArchiveFilter();
  browser.append(browserHeader, toolbar, count, list, empty);

  const inspector = createElement(
    "aside",
    "pattern-room-context-inspector pattern-room-archive-inspector"
  );
  inspector.ariaLabel = text("archive.inspectorLabel");
  const inspectorLabel = createElement(
    "span",
    "pattern-room-context-inspector-label",
    text("archive.inspectorLabel")
  );
  const tools = createElement("details", "pattern-room-archive-tools");
  tools.dataset["patternArchiveTools"] = "true";
  const toolsSummary = createElement(
    "summary",
    "pattern-room-inline-summary",
    text("archive.toolsLabel")
  );
  const toolsBody = createElement("div", "pattern-room-archive-tools-body");
  toolsBody.append(
    createSourceWorkbenchDemo(
      actions,
      userTextSourceImportStatus,
      longTextSourceImportStatus,
      sourceImportStatus
    ),
    createSourceAuthoringForm(actions),
    createLocalSessionResetSection(actions)
  );
  tools.append(toolsSummary, toolsBody);
  inspector.append(
    inspectorLabel,
    createArchiveSourceDetail(selectedSource, selection.selectedSourceId, actions, selection),
    tools
  );

  workspace.append(browser, inspector);
  shell.append(workspace);
  return shell;
}
