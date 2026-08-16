import type { RepairEvent, RepairWorkbenchTool } from "../../shared/types/index.js";
import type { RepairInvestigationPhase, RepairUiState } from "../../shared/ui/state.js";
import { REPAIR_OVERLAY_TOOLS } from "../overlay/overlay-tools.js";
import { resolveRepairAssetUrl } from "../repair-asset-url.js";
import { localizeRepairGuidanceLine } from "../runtime/guidance-text.js";
import { getEventKindLabel } from "../runtime/timeline-helpers.js";
import { createRepairPanel } from "./panel-shell.js";

type TextFn = (
  path: string[],
  fallback: string,
  params?: Record<string, string | number>
) => string;

function getFocusedForensicEvent(state: RepairUiState): RepairEvent | null {
  const focusedId = state.workbench.selection.inspectorEventId ?? state.workbench.focusedEventId;
  if (focusedId === null) return null;
  return state.sessions.detail?.events.find((event) => event.id === focusedId) ?? null;
}

function getForensicEventDetail(event: RepairEvent): string {
  switch (event.kind) {
    case "annotation":
      return event.meta?.label ?? event.label;
    case "measurement":
      return `${event.reference ?? event.channel} ${event.rawDisplay}${event.unit}`;
    case "ai-mark":
      return event.rationale;
    case "risk-flag":
      return event.message;
    case "snapshot":
      return event.caption;
    case "freeze-frame":
      return event.reason;
    case "note":
      return event.text;
    case "session-start":
      return event.title;
    case "ai-mark-lifecycle":
      return event.reason;
    case "investigation-region-created":
      return event.label;
    case "investigation-region-updated":
      return event.label ?? event.regionId;
    default: {
      const exhaustiveEvent: never = event;
      return exhaustiveEvent;
    }
  }
}

function getForensicEventMeta(event: RepairEvent, text: TextFn): string {
  const time = new Date(event.occurredAt).toLocaleTimeString("en-GB");
  if (event.kind === "annotation") {
    return `${time} • ${(event.meta?.author ?? event.source).toUpperCase()} • ${(
      event.meta?.tool ?? event.tool
    ).toUpperCase()}`;
  }
  if (event.kind === "ai-mark") {
    return `${time} • Asistan AI • ${(event.lifecycleState ?? "detected").toUpperCase()}`;
  }
  if (event.kind === "measurement") {
    const group =
      event.group?.rail ?? event.group?.component ?? event.group?.powerDomain ?? "ungrouped";
    return `${time} • ${group.toUpperCase()}`;
  }
  if (event.kind === "investigation-region-created") {
    return `${time} • ${event.status.toUpperCase()} • ${event.regionId}`;
  }
  if (event.kind === "investigation-region-updated") {
    const status = event.status ?? "updated";
    return `${time} • ${status.toUpperCase()} • ${event.regionId}`;
  }
  return `${time} • ${event.linkedEventIds.length} ${text(["workbench", "guidance", "linkedEvents"], "bağlı olaylar")}`;
}

function getForensicLinkedText(state: RepairUiState, event: RepairEvent, text: TextFn): string {
  const brief = (eventId: string): string => {
    const linked = state.sessions.detail?.events.find((candidate) => candidate.id === eventId);
    if (linked === undefined) return eventId;
    return `${linked.kind.toUpperCase()} ${new Date(linked.occurredAt).toLocaleTimeString("en-GB")}`;
  };
  const measurementIds =
    event.kind === "annotation"
      ? (event.meta?.linkedMeasurementIds ?? [])
      : event.kind === "ai-mark" || event.kind === "risk-flag"
        ? (event.linkedMeasurementIds ?? [])
        : event.kind === "measurement"
          ? (event.linkedAnnotationIds ?? [])
          : [];
  const aiIds =
    event.kind === "annotation"
      ? (event.meta?.linkedEventIds ?? []).filter((eventId) => {
          const linked = state.sessions.detail?.events.find(
            (candidate) => candidate.id === eventId
          );
          return linked?.kind === "ai-mark" || linked?.kind === "risk-flag";
        })
      : event.kind === "measurement"
        ? (event.linkedAiMarkIds ?? [])
        : event.linkedEventIds;
  const parts = [
    measurementIds.length > 0 ? `MEASURE ${measurementIds.map(brief).join(", ")}` : null,
    aiIds.length > 0 ? `Asistan AI ${aiIds.map(brief).join(", ")}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0
    ? parts.join(" • ")
    : text(["workbench", "guidance", "noLinked"], "Bağlı kayıt yok");
}

type GuidanceBadgeTone = "neutral" | "calm" | "risk" | "pending" | "focus";

interface GuidanceBadge {
  label: string;
  tone: GuidanceBadgeTone;
}

function getGuidanceMetaText(state: RepairUiState, text: TextFn): string {
  const unresolved = state.guidance.unresolvedCriticalItems;
  const pending = state.guidance.pendingMeasurements.length;
  const parts = [
    getGuidanceProgressText(state, text).toUpperCase(),
    unresolved > 0
      ? `${unresolved} ${text(["workbench", "guidance", "critical"], "kritik")}`
      : text(["workbench", "guidance", "calm"], "sakin"),
    pending > 0 ? `${pending} ${text(["workbench", "guidance", "pending"], "bekleyen")}` : null,
    state.guidance.focusCorridor.active
      ? text(["workbench", "guidance", "focusCorridor"], "odak koridoru")
      : text(["workbench", "guidance", "fullBoard"], "tam kart"),
  ].filter((part): part is string => part !== null);
  return parts.join(" / ");
}

function getGuidanceMetaBadges(state: RepairUiState, text: TextFn): GuidanceBadge[] {
  const unresolved = state.guidance.unresolvedCriticalItems;
  const pending = state.guidance.pendingMeasurements.length;
  const badges: GuidanceBadge[] = [
    { label: getGuidanceProgressText(state, text), tone: "neutral" },
    {
      label:
        unresolved > 0
          ? `${unresolved} ${text(["workbench", "guidance", "critical"], "kritik")}`
          : text(["workbench", "guidance", "calm"], "sakin"),
      tone: unresolved > 0 ? "risk" : "calm",
    },
  ];

  if (pending > 0) {
    badges.push({
      label: `${pending} ${text(["workbench", "guidance", "pending"], "bekleyen")}`,
      tone: "pending",
    });
  }

  badges.push({
    label: state.guidance.focusCorridor.active
      ? text(["workbench", "guidance", "focusCorridor"], "odak koridoru")
      : text(["workbench", "guidance", "fullBoard"], "tam kart"),
    tone: state.guidance.focusCorridor.active ? "focus" : "neutral",
  });

  return badges;
}

function getGuidancePhaseLabel(phase: RepairInvestigationPhase, text: TextFn): string {
  return text(["workbench", "guidance", "phase", phase], phase);
}

function getGuidanceProgressText(state: RepairUiState, text: TextFn): string {
  const rhythm = state.guidance.rhythm;
  const phase = rhythm.lifecycle[rhythm.currentIndex] ?? state.guidance.investigationPhase;
  return text(["workbench", "guidance", "progress"], "{phase} {current}/{total}", {
    current: rhythm.currentIndex + 1,
    phase: getGuidancePhaseLabel(phase, text),
    total: rhythm.lifecycle.length,
  });
}

function getViewportMode(state: RepairUiState): "live" | "replay" | "freeze" | "investigation" {
  if (
    state.workbench.investigationModeEnabled ||
    state.workbench.operationalMode === "investigation"
  ) {
    return "investigation";
  }
  if (state.workbench.isFrozen || state.workbench.operationalMode === "freeze") return "freeze";
  if (
    state.workbench.timeline.replayMode === "replay" ||
    state.workbench.operationalMode === "replay"
  ) {
    return "replay";
  }
  return "live";
}

function getRepairCommandHints(state: RepairUiState, text: TextFn): string {
  const hints = state.workbench.isFrozen
    ? [
        text(["workbench", "guidance", "hintResume"], "canlıya dön"),
        text(["workbench", "guidance", "hintReadAgain"], "tekrar oku"),
        text(["workbench", "guidance", "hintSaveNote"], "not kaydet"),
      ]
    : [
        text(["workbench", "guidance", "hintFreeze"], "kamerayı dondur"),
        text(["workbench", "guidance", "hintRepeat"], "rehberi tekrarla"),
        text(["workbench", "guidance", "hintMeasure"], "ölçüm kaydet"),
      ];
  if (state.guidance.unresolvedCriticalItems > 0)
    hints.unshift(text(["workbench", "guidance", "hintShowRisks"], "riskleri göster"));
  return hints.slice(0, 3).join(" / ");
}

function shouldShowAiGuidanceCell(state: RepairUiState): boolean {
  const interruption = state.guidance.aiInterruption;
  return (
    interruption.shouldSpeak ||
    interruption.urgency === "high" ||
    interruption.confidence === "high" ||
    state.guidance.unresolvedCriticalItems > 0
  );
}

const REPAIR_TOOL_ICON_PATHS: Record<RepairWorkbenchTool, string> = {
  select: '<path d="M5 4 18 12 12.5 13.5 10 19z" /><path d="M12.5 13.5 17 19" />',
  pan: '<path d="M12 3v18M3 12h18" /><path d="M8 7l4-4 4 4M16 17l-4 4-4-4M7 8l-4 4 4 4M17 16l4-4-4-4" />',
  "zoom-in": '<circle cx="10.5" cy="10.5" r="6.5" /><path d="M16 16l5 5M10.5 7.5v6M7.5 10.5h6" />',
  "zoom-out": '<circle cx="10.5" cy="10.5" r="6.5" /><path d="M16 16l5 5M7.5 10.5h6" />',
  rect: '<rect x="5" y="5" width="14" height="14" rx="2" /><path d="M9 5v14M15 5v14" />',
  circle: '<circle cx="12" cy="12" r="7" />',
  freehand: '<path d="M4 16c3-8 5 5 8-2s4-8 8-2" />',
  text: '<path d="M5 6h14M12 6v12M9 18h6" />',
  "measurement-link": '<path d="M8 12h8" /><path d="M7 8a4 4 0 0 0 0 8h3M17 8a4 4 0 0 1 0 8h-3" />',
  "measurement-pin":
    '<path d="M12 21s6-5 6-11a6 6 0 0 0-12 0c0 6 6 11 6 11z" /><circle cx="12" cy="10" r="2" />',
  arrow: '<path d="M5 19 19 5M11 5h8v8" />',
  ruler: '<path d="M4 17 17 4l3 3L7 20z" /><path d="M14 7l3 3M11 10l2 2M8 13l3 3" />',
  "freeze-frame": '<rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 8v8M15 8v8" />',
  snapshot: '<path d="M4 8h4l2-2h4l2 2h4v11H4z" /><circle cx="12" cy="13" r="3" />',
};

function getRepairToolIconSvg(tool: RepairWorkbenchTool): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${REPAIR_TOOL_ICON_PATHS[tool]}</svg>`;
}

const REPAIR_HISTORY_REVIEW_SAFE_TOOLS = new Set<RepairWorkbenchTool>([
  "select",
  "pan",
  "zoom-in",
  "zoom-out",
]);

const REPAIR_TOOLBAR_LAYER_BUTTONS: Array<{
  id: keyof RepairUiState["workbench"]["visibleLayers"];
  labelKey: string;
  labelFallback: string;
  titleKey: string;
  titleFallback: string;
}> = [
  {
    id: "grid",
    labelKey: "grid",
    labelFallback: "Izgara",
    titleKey: "gridTitle",
    titleFallback: "Izgara katmanını aç/kapat",
  },
  {
    id: "ai-marks",
    labelKey: "aiMarks",
    labelFallback: "Asistan AI İşaretleri",
    titleKey: "aiMarksTitle",
    titleFallback: "Asistan AI işaret katmanını aç/kapat",
  },
  {
    id: "operator-annotations",
    labelKey: "operatorNotes",
    labelFallback: "Operatör Notları",
    titleKey: "operatorNotesTitle",
    titleFallback: "Operatör notlarını aç/kapat",
  },
  {
    id: "ai-annotations",
    labelKey: "aiNotes",
    labelFallback: "Asistan AI Notları",
    titleKey: "aiNotesTitle",
    titleFallback: "Asistan AI notlarını aç/kapat",
  },
  {
    id: "measurements",
    labelKey: "measure",
    labelFallback: "Ölçüm",
    titleKey: "measureTitle",
    titleFallback: "Ölçüm katmanını aç/kapat",
  },
  {
    id: "risks",
    labelKey: "risks",
    labelFallback: "Riskler",
    titleKey: "risksTitle",
    titleFallback: "Risk katmanını aç/kapat",
  },
  {
    id: "notes",
    labelKey: "notes",
    labelFallback: "Notlar",
    titleKey: "notesTitle",
    titleFallback: "Onarım notlarını aç/kapat",
  },
  {
    id: "knowledge",
    labelKey: "evidence",
    labelFallback: "Kanıt",
    titleKey: "evidenceTitle",
    titleFallback: "Bilgi kanıtını aç/kapat",
  },
];

type RepairWorkbenchQuickActionId =
  | "camera-feed"
  | "capture-photo"
  | "camera-torch"
  | "measurement-overlay"
  | "dictation"
  | "tts"
  | "ambient";

const REPAIR_WORKBENCH_QUICK_ACTIONS: Array<{
  id: RepairWorkbenchQuickActionId;
  action: string;
  icon: string;
  labelKey: string;
  labelFallback: string;
  titleKey: string;
  titleFallback: string;
}> = [
  {
    id: "camera-feed",
    action: "toggle-camera-feed",
    icon: "C",
    labelKey: "camera",
    labelFallback: "Kamera",
    titleKey: "cameraTitle",
    titleFallback: "Kamera feed'ini başlat veya durdur",
  },
  {
    id: "capture-photo",
    action: "capture-photo",
    icon: "K",
    labelKey: "capturePhoto",
    labelFallback: "Kare al",
    titleKey: "capturePhotoTitle",
    titleFallback: "Aktif kamera feed'inden fotoğraf çek ve kart görseli olarak kullan",
  },
  {
    id: "camera-torch",
    action: "toggle-camera-torch",
    icon: "F",
    labelKey: "torch",
    labelFallback: "Fener",
    titleKey: "torchTitle",
    titleFallback: "Telefon fenerini aç veya kapat",
  },
  {
    id: "measurement-overlay",
    action: "toggle-measurement-overlay",
    icon: "M",
    labelKey: "measurement",
    labelFallback: "Ölçüm",
    titleKey: "measurementTitle",
    titleFallback: "Ölçüm girişini aç",
  },
  {
    id: "dictation",
    action: "toggle-dictation",
    icon: "D",
    labelKey: "dictate",
    labelFallback: "Dikte",
    titleKey: "dictateTitle",
    titleFallback: "Dikteyi başlat veya durdur",
  },
  {
    id: "tts",
    action: "toggle-tts",
    icon: "T",
    labelKey: "tts",
    labelFallback: "TTS",
    titleKey: "ttsTitle",
    titleFallback: "Sesli okumayı başlat veya durdur",
  },
  {
    id: "ambient",
    action: "toggle-ambient-listener",
    icon: "A",
    labelKey: "ambient",
    labelFallback: "Ortam",
    titleKey: "ambientTitle",
    titleFallback: "Ortam dinlemeyi başlat veya durdur",
  },
];

function appendButtonLabel(
  documentRef: Document,
  button: HTMLElement,
  iconMarkup: string,
  label: string
): void {
  const iconEl = documentRef.createElement("span");
  iconEl.className = "repair-toolbar__icon";
  iconEl.innerHTML = iconMarkup;
  button.append(iconEl);

  const labelEl = documentRef.createElement("span");
  labelEl.className = "repair-toolbar__label";
  labelEl.textContent = label;
  button.append(labelEl);
}

function isHistoryReviewMode(state: RepairUiState): boolean {
  return (
    state.workbench.focusedEventId !== null ||
    state.workbench.timeline.replayMode === "replay" ||
    state.workbench.timeline.replayMode === "paused"
  );
}

function isWorkbenchToolDisabled(state: RepairUiState, tool: RepairWorkbenchTool): boolean {
  return isHistoryReviewMode(state) && !REPAIR_HISTORY_REVIEW_SAFE_TOOLS.has(tool);
}
function hasActiveRepairSession(state: RepairUiState): boolean {
  return state.sessions.activeId !== null && state.sessions.detail !== null;
}

function createToolButton(
  documentRef: Document,
  state: RepairUiState,
  tool: (typeof REPAIR_OVERLAY_TOOLS)[number],
  text: TextFn
): HTMLElement {
  const hasSession = hasActiveRepairSession(state);
  const disabled = isWorkbenchToolDisabled(state, tool.id);
  const btn = documentRef.createElement("button");
  btn.type = "button";
  btn.className = `repair-toolbar__btn repair-toolbar__btn--tool repair-toolbar__btn--text${
    hasSession && state.workbench.activeTool === tool.id ? " repair-toolbar__btn--active" : ""
  }${disabled ? " repair-toolbar__btn--disabled" : ""}`;
  btn.disabled = disabled;
  btn.title = text(["workbench", "tools", tool.id, "title"], tool.title);
  btn.dataset["repairAction"] = "set-tool";
  btn.dataset["tool"] = tool.id;
  btn.dataset["historyLocked"] = String(disabled);
  appendButtonLabel(
    documentRef,
    btn,
    getRepairToolIconSvg(tool.id),
    text(["workbench", "tools", tool.id, "label"], tool.label)
  );
  return btn;
}

function createLayerButton(
  documentRef: Document,
  state: RepairUiState,
  layer: (typeof REPAIR_TOOLBAR_LAYER_BUTTONS)[number],
  text: TextFn
): HTMLElement {
  const btn = documentRef.createElement("button");
  const hasSession = hasActiveRepairSession(state);
  const isVisible = state.workbench.visibleLayers[layer.id];
  btn.type = "button";
  btn.className = `repair-toolbar__btn repair-toolbar__btn--layer repair-toolbar__btn--text${
    hasSession && isVisible ? " repair-toolbar__btn--active" : ""
  }`;
  btn.title = text(["workbench", "toolbar", layer.titleKey], layer.titleFallback);
  btn.dataset["repairAction"] = "toggle-overlay-layer";
  btn.dataset["layerId"] = layer.id;
  btn.dataset["visible"] = String(!isVisible);

  const check = documentRef.createElement("span");
  check.className = "repair-toolbar__check";
  btn.append(check);

  const label = documentRef.createElement("span");
  label.className = "repair-toolbar__label";
  label.textContent = text(["workbench", "toolbar", layer.labelKey], layer.labelFallback);
  btn.append(label);
  return btn;
}

function hasActiveWorkbenchCameraFeed(state: RepairUiState): boolean {
  const livePreview = state.workbench.liveSource.preview;
  const hasVisibleStream =
    livePreview?.source === "mjpeg-stream" &&
    typeof livePreview.streamUrl === "string" &&
    livePreview.streamUrl.trim() !== "";
  return (
    state.operations.cameraActive ||
    state.operations.liveFeedActive ||
    state.workbench.liveSource.connected ||
    hasVisibleStream
  );
}

function isQuickActionActive(state: RepairUiState, id: RepairWorkbenchQuickActionId): boolean {
  if (!hasActiveRepairSession(state)) return false;
  switch (id) {
    case "camera-feed":
      return hasActiveWorkbenchCameraFeed(state);
    case "capture-photo":
      return false;
    case "camera-torch":
      return state.operations.activeCapabilities.includes("android-torch");
    case "measurement-overlay":
      return false;
    case "dictation":
      return (
        state.operations.localMicActive ||
        (state.operations.androidMicActive && !state.operations.ambientActive)
      );
    case "tts":
      return state.operations.ttsActive;
    case "ambient":
      return (
        state.operations.ambientActive ||
        state.layout.voiceGuidance.ambientListeningState === "listening"
      );
    default: {
      const exhaustiveId: never = id;
      return exhaustiveId;
    }
  }
}

function isQuickActionDisabled(state: RepairUiState, id: RepairWorkbenchQuickActionId): boolean {
  if (isHistoryReviewMode(state)) return true;
  if (id === "measurement-overlay") return !hasActiveRepairSession(state);
  if (id !== "capture-photo") return false;
  return !hasActiveWorkbenchCameraFeed(state);
}

function createQuickActionButton(
  documentRef: Document,
  state: RepairUiState,
  action: (typeof REPAIR_WORKBENCH_QUICK_ACTIONS)[number],
  text: TextFn
): HTMLElement {
  const active = isQuickActionActive(state, action.id);
  const disabled = isQuickActionDisabled(state, action.id);
  const btn = documentRef.createElement("button");
  btn.type = "button";
  btn.className = `repair-workbench-actionbar__button${
    active ? " repair-workbench-actionbar__button--active" : ""
  }${disabled ? " repair-workbench-actionbar__button--disabled" : ""}`;
  btn.disabled = disabled;
  btn.title = text(["workbench", "quickActions", action.titleKey], action.titleFallback);
  btn.dataset["repairAction"] = action.action;
  btn.dataset["repairQuickAction"] = action.id;
  btn.dataset["active"] = String(active);
  btn.dataset["disabled"] = String(disabled);

  const icon = documentRef.createElement("span");
  icon.className = "repair-workbench-actionbar__icon";
  icon.textContent = action.icon;
  btn.append(icon);

  const label = documentRef.createElement("span");
  label.className = "repair-workbench-actionbar__label";
  label.textContent = text(["workbench", "quickActions", action.labelKey], action.labelFallback);
  btn.append(label);
  return btn;
}

function appendCopilotCell(
  documentRef: Document,
  parent: HTMLElement,
  className: string,
  label: string,
  value: string
): void {
  const cell = documentRef.createElement("span");
  cell.className = className;

  const labelEl = documentRef.createElement("span");
  labelEl.className = "repair-guidance-strip__label";
  labelEl.textContent = label;
  cell.append(labelEl);

  const valueEl = documentRef.createElement("span");
  valueEl.className = "repair-guidance-strip__value";
  valueEl.textContent = value;
  cell.append(valueEl);

  parent.append(cell);
}

function appendGuidanceBadgeCell(
  documentRef: Document,
  parent: HTMLElement,
  state: RepairUiState,
  text: TextFn
): void {
  const cell = documentRef.createElement("span");
  cell.className = "repair-guidance-strip__meta repair-guidance-strip__meta--badges";

  const summary = getGuidanceMetaText(state, text);
  cell.title = summary;
  cell.ariaLabel = `${text(["workbench", "guidance", "risk"], "Risk")}: ${summary}`;

  getGuidanceMetaBadges(state, text).forEach((badge) => {
    const badgeEl = documentRef.createElement("span");
    badgeEl.className = `repair-guidance-badge repair-guidance-badge--${badge.tone}`;
    badgeEl.textContent = badge.label;
    cell.append(badgeEl);
  });

  parent.append(cell);
}

export function renderWorkbenchStagePanel(
  documentRef: Document,
  state: RepairUiState,
  text: TextFn
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "repair-panel__body repair-panel__body--no-padding";

  const quickbar = documentRef.createElement("div");
  quickbar.className = "repair-workbench-actionbar";
  quickbar.dataset["repairWorkbenchActionbar"] = "media";
  for (const action of REPAIR_WORKBENCH_QUICK_ACTIONS) {
    quickbar.append(createQuickActionButton(documentRef, state, action, text));
  }
  body.append(quickbar);

  const showAiGuidance = shouldShowAiGuidanceCell(state);
  const guidance = documentRef.createElement("div");
  guidance.className = "repair-guidance-strip";
  guidance.dataset["confidence"] = state.guidance.nextBestAction.confidence;
  guidance.dataset["urgency"] = state.guidance.nextBestAction.urgency;
  guidance.dataset["hasAi"] = String(showAiGuidance);
  // Command hints stay hidden unless a room action toggles them.
  guidance.dataset["showSay"] = "false";

  if (showAiGuidance) {
    appendCopilotCell(
      documentRef,
      guidance,
      "repair-guidance-strip__phase",
      text(["workbench", "guidance", "ai"], "Asistan AI"),
      localizeRepairGuidanceLine(state.guidance.aiInterruption.toneLine, text)
    );
  }

  appendCopilotCell(
    documentRef,
    guidance,
    "repair-guidance-strip__action",
    text(["workbench", "guidance", "next"], "Sıradaki"),
    localizeRepairGuidanceLine(state.guidance.nextBestAction.text, text)
  );
  appendCopilotCell(
    documentRef,
    guidance,
    "repair-guidance-strip__recovery",
    text(["workbench", "guidance", "say"], "Söyle"),
    getRepairCommandHints(state, text)
  );
  appendGuidanceBadgeCell(documentRef, guidance, state, text);

  body.append(guidance);

  // -- Viewport
  const viewport = documentRef.createElement("div");
  viewport.className = `repair-viewport${state.workbench.isFrozen ? " repair-viewport--frozen" : ""}`;
  viewport.dataset["mode"] = getViewportMode(state);
  viewport.dataset["cursor"] = state.workbench.contextualCursor;
  viewport.dataset["liveSource"] = state.workbench.liveSource.sourceType ?? "image";

  const session = state.sessions.detail;
  const livePreview = state.workbench.liveSource.preview;
  const liveStreamUrl =
    livePreview?.source === "mjpeg-stream" &&
    livePreview.streamUrl !== null &&
    livePreview.streamUrl !== undefined
      ? livePreview.streamUrl.trim()
      : "";

  if (liveStreamUrl !== "") {
    const liveFrame = documentRef.createElement("img");
    liveFrame.className = "repair-viewport__live-frame";
    liveFrame.src = liveStreamUrl;
    liveFrame.alt = livePreview?.label ?? text(["status", "cameraSourceAndroid"], "Android kamera");
    liveFrame.draggable = false;
    viewport.append(liveFrame);
  } else if (session !== null && session.pcbImage !== null) {
    const img = documentRef.createElement("img");
    img.className = "repair-viewport__image";
    img.src = resolveRepairAssetUrl(session.pcbImage.src) ?? session.pcbImage.src;
    img.alt = session.pcbImage.label;
    img.draggable = false;
    img.style.transform = `translate(${state.workbench.viewport.panXPx}px, ${state.workbench.viewport.panYPx}px) scale(${state.workbench.viewport.zoom})`;
    img.style.transformOrigin = "top left";
    viewport.append(img);
  } else {
    const placeholder = documentRef.createElement("div");
    placeholder.className = "repair-empty-state";
    const placeholderTitle = documentRef.createElement("div");
    placeholderTitle.className = "repair-empty-state__title";
    placeholderTitle.textContent = text(["workbench", "noImage"], "Kart görseli gerekli");
    placeholder.append(placeholderTitle);

    const placeholderCopy = documentRef.createElement("div");
    placeholderCopy.className = "repair-empty-state__copy";
    placeholderCopy.textContent = text(
      ["workbench", "noImageHelp"],
      "Overlay, ölçüm ve rehberli onarım adımlarını kullanmak için Android kamerayı başlat veya bir kart görseli ekle."
    );
    placeholder.append(placeholderCopy);

    const placeholderSteps = documentRef.createElement("div");
    placeholderSteps.className = "repair-empty-state__steps";
    [
      text(["workbench", "emptyStateStep1"], "Kamerayı başlat"),
      text(["workbench", "emptyStateStep2"], "Kartı çerçevele"),
      text(["workbench", "emptyStateStep3"], "Hazır olunca dondur"),
    ].forEach((step) => {
      const item = documentRef.createElement("span");
      item.textContent = step;
      placeholderSteps.append(item);
    });
    placeholder.append(placeholderSteps);
    viewport.append(placeholder);
  }

  const overlayHost = documentRef.createElement("div");
  overlayHost.className = "repair-overlay-stage";
  overlayHost.dataset["repairOverlayStage"] = "workbench";
  viewport.append(overlayHost);

  // -- Coordinate HUD
  const hud = documentRef.createElement("div");
  hud.className = "repair-coord-hud";

  const cursor = state.workbench.cursor;
  const xLabel = cursor !== null ? cursor.xPx.toString() : "—";
  const yLabel = cursor !== null ? cursor.yPx.toString() : "—";
  const gridLabel = cursor !== null ? `${cursor.gridX}x${cursor.gridY}` : "—";
  const xKey = text(["workbench", "coordX"], "X");
  const yKey = text(["workbench", "coordY"], "Y");
  const gridKey = text(["workbench", "coordGrid"], "GRID");
  hud.innerHTML = `<span>${xKey} ${xLabel}</span><span>${yKey} ${yLabel}</span><span>${gridKey} ${gridLabel}</span>`;
  viewport.append(hud);

  const inspectorEvent = getFocusedForensicEvent(state);
  if (inspectorEvent !== null) {
    const inspector = documentRef.createElement("div");
    inspector.className = "repair-annotation-inspector";
    inspector.dataset["eventId"] = inspectorEvent.id;

    const title = documentRef.createElement("div");
    title.className = "repair-annotation-inspector__title";
    title.textContent = getEventKindLabel(inspectorEvent, text).toUpperCase();
    inspector.append(title);

    const detail = documentRef.createElement("div");
    detail.className = "repair-annotation-inspector__detail";
    detail.textContent = getForensicEventDetail(inspectorEvent);
    inspector.append(detail);

    const meta = documentRef.createElement("div");
    meta.className = "repair-annotation-inspector__meta";
    meta.textContent = getForensicEventMeta(inspectorEvent, text);
    inspector.append(meta);

    const links = documentRef.createElement("div");
    links.className = "repair-annotation-inspector__links";
    links.textContent = getForensicLinkedText(state, inspectorEvent, text);
    inspector.append(links);

    const selection = documentRef.createElement("div");
    selection.className = "repair-annotation-inspector__selection";
    selection.textContent = `${state.workbench.selection.selectedEventIds.length} ${text(["workbench", "guidance", "selected"], "seçili")}`;
    inspector.append(selection);
    viewport.append(inspector);
  }

  // -- Toolbar: viewport chrome
  const toolbar = documentRef.createElement("div");
  toolbar.className = "repair-toolbar";
  toolbar.dataset["repairWorkbenchToolbar"] = "viewport";

  const toolsGroup = documentRef.createElement("div");
  toolsGroup.className = "repair-toolbar-group repair-toolbar-group--tools";
  toolsGroup.dataset["toolbarGroup"] = "tools";

  for (const tool of REPAIR_OVERLAY_TOOLS) {
    if (tool.id === "zoom-in" || tool.id === "zoom-out") continue;
    toolsGroup.append(createToolButton(documentRef, state, tool, text));

    if (tool.id === "pan" || tool.id === "text" || tool.id === "arrow") {
      const sep = documentRef.createElement("span");
      sep.className = "repair-toolbar__sep";
      toolsGroup.append(sep);
    }
  }

  toolbar.append(toolsGroup);

  const layersGroup = documentRef.createElement("div");
  layersGroup.className = "repair-toolbar-group repair-toolbar-group--layers";
  layersGroup.dataset["toolbarGroup"] = "layers";

  for (const layer of REPAIR_TOOLBAR_LAYER_BUTTONS) {
    layersGroup.append(createLayerButton(documentRef, state, layer, text));
  }

  const investigation = documentRef.createElement("button");
  const hasSession = hasActiveRepairSession(state);
  investigation.type = "button";
  investigation.className = `repair-toolbar__btn repair-toolbar__btn--layer repair-toolbar__btn--text${
    hasSession && state.workbench.investigationModeEnabled ? " repair-toolbar__btn--active" : ""
  }`;
  investigation.title = text(["workbench", "toolbar", "inspectTitle"], "İnceleme modunu aç/kapat");
  investigation.dataset["repairAction"] = "toggle-investigation-mode";
  appendButtonLabel(
    documentRef,
    investigation,
    "i",
    text(["workbench", "toolbar", "inspect"], "İncele")
  );
  layersGroup.append(investigation);

  toolbar.append(layersGroup);

  const zoomGroup = documentRef.createElement("div");
  zoomGroup.className = "repair-toolbar-group repair-toolbar-group--zoom";
  zoomGroup.dataset["toolbarGroup"] = "zoom";
  const zoomOut = REPAIR_OVERLAY_TOOLS.find((tool) => tool.id === "zoom-out");
  const zoomIn = REPAIR_OVERLAY_TOOLS.find((tool) => tool.id === "zoom-in");
  if (zoomOut !== undefined) zoomGroup.append(createToolButton(documentRef, state, zoomOut, text));
  const zoomValue = documentRef.createElement("span");
  zoomValue.className = "repair-toolbar__zoom-value";
  zoomValue.textContent = `${Math.round(state.workbench.viewport.zoom * 100)}%`;
  zoomGroup.append(zoomValue);
  if (zoomIn !== undefined) zoomGroup.append(createToolButton(documentRef, state, zoomIn, text));
  toolbar.append(zoomGroup);

  viewport.append(toolbar);
  body.append(viewport);

  return createRepairPanel(documentRef, {
    panelId: "workbench-stage",
    title: text(["workbench", "title"], "Onarım Tezgâhı"),
    statusDot: state.workbench.isFrozen ? "amber" : "live",
    collapsed: state.layout.collapsedPanels["workbench-stage"],
    noPanelControls: true,
    body,
    text,
  });
}
