import {
  REPAIR_MAIN_LAYOUT_PANEL_IDS,
  normalizeRepairPanelSizes,
  type RepairImageRect,
  type RepairMainLayoutPanelId,
  type RepairMultimeterMode,
  type RepairPanelId,
  type RepairPanelSizeState,
  type RepairSettingsOverlayTabId,
  type RepairWizardDraft,
  type RepairWorkbenchViewport,
} from "../shared/types/index.js";
import type {
  RepairAiTargetSlot,
  RepairUiState,
  RepairUiSnapshotMeta,
} from "../shared/ui/state.js";
import {
  createRepairDefaultContinuityProjection,
  createRepairDefaultGuidanceProjection,
  createRepairDefaultOperationsProjection,
  createRepairDefaultVoiceReadinessProjection,
} from "../shared/ui/state.js";
import { normalizeRepairHostMessage } from "../shared/ui/host-messages.js";
import { REPAIR_ROOM_ID } from "../shared/repair-constants.js";
import { createRepairUiRequestRuntime } from "../shared/ui/request-runtime.js";

import { renderSessionRailPanel } from "./panels/session-rail-panel.js";
import {
  REPAIR_WIZARD_STEP_ORDER,
  canEnterRepairWizardStep,
  getBoardCodeSuggestions,
  getManufacturerSuggestions,
  getModelSuggestions,
  isRepairWizardStepComplete,
  isRepairWizardStepIncomplete,
} from "./panels/session-wizard-panel.js";
import { renderWorkbenchStagePanel } from "./panels/workbench-stage-panel.js";
import { renderTacticalFeedPanel } from "./panels/tactical-feed-panel.js";
import { renderKnowledgePackPanel } from "./panels/knowledge-pack-panel.js";
import { renderVisualTimelinePanel } from "./panels/visual-timeline-panel.js";
import { renderOperatorProfilePanel } from "./panels/operator-profile-panel.js";
import {
  createRepairOperatorProfileId,
  normalizeRepairSkillLevel,
} from "./panels/operator-profile-panel.js";

import { renderMeasurementEntrySurface } from "./panels/measurement-panel.js";
import { getContainedImageFrame } from "./overlay/overlay-coords.js";
import { getRepairFocusFrame } from "./overlay/overlay-geometry.js";
import { resolveRepairAssetUrl } from "./repair-asset-url.js";
import { getRepairMainGridTemplateColumns } from "./runtime/dock-layout.js";
import { getGuidanceSurfaceForPanel } from "./runtime/guidance-helpers.js";
import {
  setClassNameIfChanged,
  setDatasetIfChanged,
  setStyleIfChanged,
  setTextIfChanged,
} from "./runtime/dom-utils.js";
import { createInitialRepairUiState } from "./runtime/state.js";
import { createSpatialFocusTween, type RepairSpatialFocusTween } from "./runtime/spatial-focus.js";
// Spatial focus animation remains requestAnimationFrame/cancelAnimationFrame-backed in runtime/spatial-focus.ts.
// Keyboard navigation keeps case "Home" and case "End" handling in runtime/keyboard.ts.
import { createRepairKeyboardController } from "./runtime/keyboard.js";
import { createRepairMeasurementDomRuntime } from "./runtime/measurement-dom.js";
import { createRepairDictationComposer } from "./runtime/dictation-composer.js";
import { createRepairCaptureStatusHandlers } from "./runtime/capture-status-handlers.js";
import { createRepairVisualTimelineDomRuntime } from "./runtime/visual-timeline-dom.js";
import { createRepairTacticalFeedDomRuntime } from "./runtime/tactical-feed-dom.js";
import { buildRepairPanelSignature } from "./runtime/panel-signatures.js";
import { createRepairOverlayRuntime } from "./runtime/overlay-runtime.js";

type RepairOpenDialogResult = { canceled?: boolean; filePaths?: string[] };

type RepairOpenDialogOptions = {
  properties?: string[];
  filters?: Array<{ name: string; extensions: string[] }>;
};

interface RepairUiWindow {
  electronAPI?: {
    openPath?: (path: string) => Promise<unknown> | unknown;
    showOpenDialog?: (
      options?: RepairOpenDialogOptions
    ) => Promise<RepairOpenDialogResult> | RepairOpenDialogResult;
  };
  roomAPI?: {
    close?: () => boolean;
    ready: (payload?: Record<string, unknown>) => boolean;
    sendCommand: (command: string, payload?: Record<string, unknown>) => boolean;
    onHostMessage: (callback: (payload: unknown) => void) => () => void;
    offHostMessage: (callback: (payload: unknown) => void) => void;
  };
}

interface RepairUiContext {
  roomId: string;
  locale: string;
  translations: Record<string, unknown>;
}

type RepairPanelRenderer = () => HTMLElement;

interface RepairPanelLifecycle {
  panelId: RepairPanelId;
  signature: string;
  mount: (parent: HTMLElement) => HTMLElement;
  update: (element: HTMLElement) => HTMLElement;
  dispose: (element: HTMLElement) => void;
}

interface RepairPersistentShell {
  root: HTMLElement;
  clock: HTMLElement;
  workspace: HTMLElement;
  rightStack: HTMLElement;
  bottomCluster: HTMLElement;
  bottomClusterHeader: HTMLElement;
  bottomClusterBody: HTMLElement;
  settingsOverlay: HTMLElement;
  settingsOverlayBody: HTMLElement;
  settingsOverlaySignature: string;
  panelElements: Map<RepairPanelId, HTMLElement>;
  panelSignatures: Map<RepairPanelId, string>;
}

interface RepairColumnResizeDragBase {
  pointerId: number;
  startX: number;
  startBeforeWidthPx: number;
  startAfterWidthPx: number;
  startBeforeWeight: number;
  startAfterWeight: number;
  minPanelWidthPx: number;
}

interface RepairMainColumnResizeDrag extends RepairColumnResizeDragBase {
  group: "main-columns";
  beforeId: RepairMainLayoutPanelId;
  afterId: RepairMainLayoutPanelId;
}

type RepairLayoutResizeDrag = RepairMainColumnResizeDrag;

interface RepairPanelChipConfig {
  panelId: RepairPanelId;
  label: string;
  title: string;
}

type RepairTextFn = (
  path: string[],
  fallback: string,
  params?: Record<string, string | number>
) => string;

type RepairThemeMode = "dark" | "light";

const REPAIR_THEME_STORAGE_KEY = "repair-room-theme";

function isRepairThemeMode(value: unknown): value is RepairThemeMode {
  return value === "dark" || value === "light";
}

const REPAIR_TOP_PANEL_CHIPS = [
  { panelId: "session-rail", label: "", title: "" },
  { panelId: "tactical-feed", label: "", title: "" },
  { panelId: "knowledge-pack", label: "", title: "" },
] as const satisfies readonly RepairPanelChipConfig[];

const REPAIR_WORKBENCH_LEFT_PANEL_CHIPS = [
  REPAIR_TOP_PANEL_CHIPS[0],
] as const satisfies readonly RepairPanelChipConfig[];

const REPAIR_WORKBENCH_RIGHT_PANEL_CHIPS = [
  REPAIR_TOP_PANEL_CHIPS[1],
  REPAIR_TOP_PANEL_CHIPS[2],
] as const satisfies readonly RepairPanelChipConfig[];

const REPAIR_BOTTOM_PANEL_CHIPS = [
  { panelId: "visual-timeline", label: "", title: "" },
] as const satisfies readonly RepairPanelChipConfig[];

const REPAIR_CHIP_CONTROLLED_PANEL_IDS = [
  ...REPAIR_TOP_PANEL_CHIPS.map((chip) => chip.panelId),
  ...REPAIR_BOTTOM_PANEL_CHIPS.map((chip) => chip.panelId),
] as const satisfies readonly RepairPanelId[];
const REPAIR_SESSION_REQUIRED_PANEL_IDS: ReadonlySet<RepairPanelId> = new Set([
  "workbench-stage",
  "tactical-feed",
  "knowledge-pack",
  "visual-timeline",
]);
const REPAIR_HISTORY_REVIEW_SAFE_TOOL_IDS: ReadonlySet<string> = new Set([
  "select",
  "pan",
  "zoom-in",
  "zoom-out",
]);
const REPAIR_MULTIMETER_MODES: ReadonlySet<string> = new Set([
  "dc-voltage",
  "ac-voltage",
  "resistance",
  "continuity",
  "diode",
  "capacitance",
  "frequency",
]);

type ManualMeasurementInput = HTMLInputElement | HTMLSelectElement;

function isRepairMultimeterMode(value: unknown): value is RepairMultimeterMode {
  return typeof value === "string" && REPAIR_MULTIMETER_MODES.has(value);
}

function readRepairMultimeterMode(value: unknown): RepairMultimeterMode {
  return isRepairMultimeterMode(value) ? value : "dc-voltage";
}

function getDefaultMeasurementRange(mode: RepairMultimeterMode): string {
  if (mode === "resistance") return "Auto Ohm";
  if (mode === "continuity") return "Continuity";
  if (mode === "diode") return "Diode";
  if (mode === "capacitance") return "Auto F";
  if (mode === "frequency") return "Auto Hz";
  return "Auto V";
}

function getManualMeasurementInput(root: HTMLElement, name: string): ManualMeasurementInput | null {
  return root.querySelector<ManualMeasurementInput>(`[data-repair-input='${name}']`);
}

function getManualMeasurementValue(root: HTMLElement, name: string): string {
  return getManualMeasurementInput(root, name)?.value.trim() ?? "";
}

function parseManualMeasurementValue(rawDisplay: string): number | null {
  const normalized = rawDisplay.replace(",", ".");
  if (normalized.toUpperCase() === "OL") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function collectManualMeasurementPayload(
  root: HTMLElement,
  state: RepairUiState
): Record<string, unknown> | null {
  const rawDisplayInput = getManualMeasurementInput(root, "measurement-raw-display");
  const rawDisplay = rawDisplayInput?.value.trim() ?? "";
  if (rawDisplay === "") {
    if (rawDisplayInput !== null) {
      rawDisplayInput.dataset["invalid"] = "true";
      rawDisplayInput.focus();
    }
    return null;
  }
  if (rawDisplayInput !== null) delete rawDisplayInput.dataset["invalid"];

  const mode = readRepairMultimeterMode(getManualMeasurementValue(root, "measurement-mode"));
  const reference = getManualMeasurementValue(root, "measurement-reference");
  const range =
    getManualMeasurementValue(root, "measurement-range") || getDefaultMeasurementRange(mode);
  const channel = getManualMeasurementValue(root, "measurement-channel") || "COM/V";
  const unit = getManualMeasurementValue(root, "measurement-unit") || "V";

  return {
    rawDisplay,
    value: parseManualMeasurementValue(rawDisplay),
    unit,
    mode,
    range,
    channel,
    reference: reference === "" ? null : reference,
    instrumentId: state.measurement.activeInstrumentKind,
  };
}

function clearManualMeasurementDraft(root: HTMLElement): void {
  const rawDisplayInput = getManualMeasurementInput(root, "measurement-raw-display");
  const referenceInput = getManualMeasurementInput(root, "measurement-reference");
  if (rawDisplayInput !== null) rawDisplayInput.value = "";
  if (referenceInput !== null) referenceInput.value = "";
}

const WIZARD_DEVICE_CASCADE_FIELDS = ["deviceType", "manufacturer", "model", "boardCode"] as const;

type WizardDeviceCascadeField = (typeof WIZARD_DEVICE_CASCADE_FIELDS)[number];
type WizardDeviceCascadePatch = Partial<Pick<RepairWizardDraft, WizardDeviceCascadeField>>;

function isWizardDeviceCascadeField(field: string): field is WizardDeviceCascadeField {
  return WIZARD_DEVICE_CASCADE_FIELDS.includes(field as WizardDeviceCascadeField);
}

function createWizardDeviceCascadePatch(
  field: WizardDeviceCascadeField,
  value: string
): WizardDeviceCascadePatch {
  if (field === "deviceType") {
    return { deviceType: value, manufacturer: "", model: "", boardCode: "" };
  }
  if (field === "manufacturer") {
    return { manufacturer: value, model: "", boardCode: "" };
  }
  if (field === "model") {
    return { model: value, boardCode: "" };
  }
  return { boardCode: value };
}

function getWizardFieldElement(
  root: HTMLElement,
  field: WizardDeviceCascadeField
): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
  return root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    `[data-repair-action='wizard-field'][data-wizard-field='${field}']`
  );
}

function getWizardFieldDomValue(root: HTMLElement, field: WizardDeviceCascadeField): string {
  return getWizardFieldElement(root, field)?.value ?? "";
}

function setWizardFieldDomValue(
  root: HTMLElement,
  field: WizardDeviceCascadeField,
  value: string
): void {
  const fieldElement = getWizardFieldElement(root, field);
  if (fieldElement !== null) fieldElement.value = value;
}

function isRepairChipControlledPanel(panelId: RepairPanelId): boolean {
  return (REPAIR_CHIP_CONTROLLED_PANEL_IDS as readonly RepairPanelId[]).includes(panelId);
}

function createRepairPanelChip(
  documentRef: Document,
  config: RepairPanelChipConfig,
  text: RepairTextFn,
  extraClassName = ""
): HTMLButtonElement {
  const chip = documentRef.createElement("button");
  chip.className = `repair-panel-chip${extraClassName === "" ? "" : ` ${extraClassName}`}`;
  chip.type = "button";
  const labelKey =
    config.panelId === "session-rail"
      ? "session"
      : config.panelId === "tactical-feed"
        ? "feed"
        : config.panelId === "knowledge-pack"
          ? "aio"
          : config.panelId === "visual-timeline"
            ? "timeline"
            : "state";
  const titleKey = `${labelKey}Title`;
  chip.textContent = text(["panelChips", labelKey], config.label || labelKey);
  chip.title = text(["panelChips", titleKey], config.title || `${labelKey} panel`);
  chip.dataset["repairAction"] = "toggle-panel-chip";
  chip.dataset["panelId"] = config.panelId;
  chip.dataset["active"] = "true";
  chip.setAttribute("aria-pressed", "true");
  return chip;
}

function createRepairPanelChipGroup(
  documentRef: Document,
  configs: readonly RepairPanelChipConfig[],
  text: RepairTextFn
): HTMLElement {
  const group = documentRef.createElement("div");
  group.className = "repair-panel-chip-group";
  configs.forEach((config) => {
    group.append(createRepairPanelChip(documentRef, config, text));
  });
  return group;
}

function createWorkbenchPanelChipGroup(
  documentRef: Document,
  position: "left" | "right",
  text: RepairTextFn
): HTMLElement {
  const group = createRepairPanelChipGroup(
    documentRef,
    position === "left" ? REPAIR_WORKBENCH_LEFT_PANEL_CHIPS : REPAIR_WORKBENCH_RIGHT_PANEL_CHIPS,
    text
  );
  group.classList.add(
    "repair-workbench-panel-toggles",
    `repair-workbench-panel-toggles--${position}`
  );
  return group;
}

function replaceWizardSuggestionMenu(
  documentRef: Document,
  root: HTMLElement,
  field: WizardDeviceCascadeField,
  options: string[]
): void {
  const fieldElement = getWizardFieldElement(root, field);
  const wrapper = fieldElement?.closest(".repair-wizard-field");
  if (!(wrapper instanceof HTMLElement)) return;

  wrapper.querySelector(".repair-wizard-suggestions")?.remove();
  if (options.length === 0) return;

  const menu = documentRef.createElement("div");
  menu.className = "repair-wizard-suggestions";
  menu.setAttribute("role", "listbox");
  options.forEach((option) => {
    const optionEl = documentRef.createElement("button");
    optionEl.className = "repair-wizard-suggestion";
    optionEl.type = "button";
    optionEl.textContent = option;
    optionEl.dataset["repairAction"] = "wizard-suggestion";
    optionEl.dataset["wizardField"] = field;
    optionEl.dataset["value"] = option;
    menu.append(optionEl);
  });
  wrapper.append(menu);
}

function getWizardDeviceCascadeValues(root: HTMLElement): Record<WizardDeviceCascadeField, string> {
  return {
    deviceType: getWizardFieldDomValue(root, "deviceType"),
    manufacturer: getWizardFieldDomValue(root, "manufacturer"),
    model: getWizardFieldDomValue(root, "model"),
    boardCode: getWizardFieldDomValue(root, "boardCode"),
  };
}

function syncWizardDeviceCascadeDom(
  documentRef: Document,
  root: HTMLElement,
  patch: WizardDeviceCascadePatch
): void {
  WIZARD_DEVICE_CASCADE_FIELDS.forEach((field) => {
    const value = patch[field];
    if (value !== undefined) setWizardFieldDomValue(root, field, value);
  });

  const values = getWizardDeviceCascadeValues(root);
  if (patch.deviceType !== undefined) {
    replaceWizardSuggestionMenu(
      documentRef,
      root,
      "manufacturer",
      getManufacturerSuggestions(values.deviceType)
    );
  }
  if (patch.deviceType !== undefined || patch.manufacturer !== undefined) {
    replaceWizardSuggestionMenu(
      documentRef,
      root,
      "model",
      getModelSuggestions(values.deviceType, values.manufacturer)
    );
  }
  if (
    patch.deviceType !== undefined ||
    patch.manufacturer !== undefined ||
    patch.model !== undefined
  ) {
    replaceWizardSuggestionMenu(
      documentRef,
      root,
      "boardCode",
      getBoardCodeSuggestions(values.deviceType, values.manufacturer, values.model)
    );
  }
}

function getRepairWizardStepClassName(params: {
  isActive: boolean;
  isAvailable: boolean;
  isDone: boolean;
  isIncomplete: boolean;
}): string {
  return [
    "repair-wizard-step",
    params.isActive ? "repair-wizard-step--active" : "",
    params.isDone && !params.isActive ? "repair-wizard-step--done" : "",
    params.isAvailable ? "repair-wizard-step--clickable" : "repair-wizard-step--disabled",
    params.isIncomplete ? "repair-wizard-step--incomplete" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function syncSessionWizardStepperDom(panel: HTMLElement, state: RepairUiState): void {
  const currentIdx = REPAIR_WIZARD_STEP_ORDER.indexOf(state.wizard.currentStep);
  panel
    .querySelectorAll<HTMLButtonElement>(".repair-wizard-stepper .repair-wizard-step")
    .forEach((step, index) => {
      const stepId = REPAIR_WIZARD_STEP_ORDER[index];
      if (stepId === undefined) return;
      const isDone = isRepairWizardStepComplete(state, stepId);
      const isActive = index === currentIdx;
      const isAvailable = canEnterRepairWizardStep(state, stepId);
      const isIncomplete = isRepairWizardStepIncomplete(state, stepId);
      setClassNameIfChanged(
        step,
        getRepairWizardStepClassName({ isActive, isAvailable, isDone, isIncomplete })
      );
      if (step.disabled === isAvailable) step.disabled = !isAvailable;
      if (isAvailable) {
        setDatasetIfChanged(step, "repairAction", "advance-wizard");
        setDatasetIfChanged(step, "step", stepId);
      } else {
        delete step.dataset["repairAction"];
        delete step.dataset["step"];
      }
    });
}

export function createRepairRoomUiRuntime() {
  const state: RepairUiState = createInitialRepairUiState();
  const meta: RepairUiSnapshotMeta = {
    schemaVersion: 1,
    generatedAt: "",
    events: [],
    replay: {
      playheadMs: 0,
      replayMode: "live",
      operationsAvailable: false,
      operations: createRepairDefaultOperationsProjection(),
      voiceReadiness: createRepairDefaultVoiceReadinessProjection(),
      continuity: createRepairDefaultContinuityProjection(),
      liveSource: { available: false, connected: false },
      visibleEvents: [],
      overlayEvents: [],
      tacticalFeed: [],
      measurementEvidence: [],
      aiMarkEventIds: [],
      activeSnapshotEventId: null,
      activeFreezeFrameEventId: null,
      focusSuggestionEventId: null,
      knowledgeRegions: [],
      investigationRegions: [],
      temporarySpatialRegions: [],
      measurementRelationships: [],
      timelineDensity: [],
      activeSpatialFocus: null,
      operationalMode: "live",
      guidance: createRepairDefaultGuidanceProjection(),
    },
  };
  const context: RepairUiContext = { roomId: REPAIR_ROOM_ID, locale: "en", translations: {} };
  const requestRuntime = createRepairUiRequestRuntime();
  const windowRef = window as unknown as RepairUiWindow;
  const documentRef = document;
  let pendingSessionRailDraftEcho = false;
  let pendingSessionRailDraftEchoTimer: ReturnType<typeof setTimeout> | null = null;

  let repairTheme: RepairThemeMode = readStoredRepairTheme();
  let shell: RepairPersistentShell | null = null;
  let clockInterval: ReturnType<typeof setInterval> | null = null;
  let spatialFocusTween: RepairSpatialFocusTween | null = null;
  let spatialFocusTweenToken = 0;
  let lastSpatialFocusKey: string | null = null;
  let layoutResizeDrag: RepairLayoutResizeDrag | null = null;
  let measurementOverlayOpen = false;

  let translationRevision = 0;
  const keyboardController = createRepairKeyboardController({
    cancelSpatialFocusTween,
    meta,
    requestRuntime,
    state,
  });

  // -- i18n helper
  function text(
    path: string[],
    fallback: string,
    params?: Record<string, string | number>
  ): string {
    let node: unknown = context.translations;
    let found = true;
    for (const key of path) {
      if (typeof node === "object" && node !== null && key in (node as Record<string, unknown>)) {
        node = (node as Record<string, unknown>)[key];
      } else {
        found = false;
        break;
      }
    }
    let result = found && typeof node === "string" ? node : fallback;
    if (params !== undefined) {
      for (const [key, value] of Object.entries(params)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
      }
    }
    return result;
  }

  function readStoredRepairTheme(): RepairThemeMode {
    try {
      const stored = window.localStorage.getItem(REPAIR_THEME_STORAGE_KEY);
      return isRepairThemeMode(stored) ? stored : "dark";
    } catch {
      return "dark";
    }
  }

  function persistRepairTheme(theme: RepairThemeMode): void {
    try {
      window.localStorage.setItem(REPAIR_THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage failures; the current room session still updates immediately.
    }
  }

  function applyRepairTheme(theme: RepairThemeMode): void {
    documentRef.documentElement.dataset["repairTheme"] = theme;
  }

  function syncRepairThemeButton(root: HTMLElement): void {
    const button = root.querySelector<HTMLElement>("[data-repair-action='toggle-theme']");
    if (button === null) return;

    const nextTheme: RepairThemeMode = repairTheme === "dark" ? "light" : "dark";
    const label =
      nextTheme === "light"
        ? text(["statusbar", "themeLight"], "Acik")
        : text(["statusbar", "themeDark"], "Koyu");
    const title =
      nextTheme === "light"
        ? text(["statusbar", "themeLightTitle"], "Acik temaya gec")
        : text(["statusbar", "themeDarkTitle"], "Koyu temaya gec");

    setTextIfChanged(button, label);
    button.title = title;
    button.setAttribute("aria-label", title);
    button.dataset["repairThemeMode"] = repairTheme;
  }

  function setRepairTheme(theme: RepairThemeMode): void {
    repairTheme = theme;
    persistRepairTheme(theme);
    applyRepairTheme(theme);
    if (shell !== null) syncRepairThemeButton(shell.root);
  }

  function getManualEvidenceInput(
    root: HTMLElement,
    name: string,
    resourceKind?: string
  ): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
    const scope = resourceKind === undefined ? "" : `[data-resource-kind='${resourceKind}']`;
    return root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      `[data-repair-input='${name}']${scope}`
    );
  }

  function getManualEvidenceValue(root: HTMLElement, name: string, resourceKind?: string): string {
    return getManualEvidenceInput(root, name, resourceKind)?.value.trim() ?? "";
  }

  function clearManualEvidenceValues(
    root: HTMLElement,
    names: string[],
    resourceKind?: string
  ): void {
    names.forEach((name) => {
      const input = getManualEvidenceInput(root, name, resourceKind);
      if (input !== null) input.value = "";
    });
  }

  function getFileNameFromPath(path: string): string {
    const normalized = path.replace(/\\/g, "/");
    return normalized.split("/").filter(Boolean).at(-1) ?? path;
  }

  function getSystemOpenTarget(source: string): string {
    const resolved = resolveRepairAssetUrl(source) ?? source;
    if (!resolved.startsWith("file:")) return resolved;
    try {
      return decodeURIComponent(new URL(resolved).pathname);
    } catch {
      return source;
    }
  }

  function getBrowserOpenHref(source: string): string {
    const resolved = resolveRepairAssetUrl(source) ?? source;
    if (/^[a-zA-Z]:[\\/]/.test(resolved)) return `file:///${resolved.replace(/\\/g, "/")}`;
    if (resolved.startsWith("/")) return `file://${resolved}`;
    return resolved;
  }

  async function openEvidenceSource(source: string): Promise<void> {
    const target = getSystemOpenTarget(source).trim();
    if (target === "") return;
    const openPath = windowRef.electronAPI?.openPath;
    if (typeof openPath === "function") {
      await openPath(target);
      return;
    }
    window.open(getBrowserOpenHref(target), "_blank", "noopener");
  }

  async function pickManualResourceFile(root: HTMLElement, resourceKind: string): Promise<void> {
    const showOpenDialog = windowRef.electronAPI?.showOpenDialog;
    if (typeof showOpenDialog !== "function") return;
    const result = await showOpenDialog({ properties: ["openFile"] });
    const filePath = result.canceled === true ? "" : (result.filePaths?.[0]?.trim() ?? "");
    if (filePath === "") return;
    const urlInput = getManualEvidenceInput(root, "manual-resource-url", resourceKind);
    const labelInput = getManualEvidenceInput(root, "manual-resource-label", resourceKind);
    if (urlInput !== null) urlInput.value = filePath;
    if (labelInput !== null && labelInput.value.trim() === "") {
      labelInput.value = getFileNameFromPath(filePath);
    }
  }

  function createWorkbenchEmptyState(): HTMLElement {
    const placeholder = documentRef.createElement("div");
    placeholder.className = "repair-empty-state";

    const title = documentRef.createElement("div");
    title.className = "repair-empty-state__title";
    title.textContent = text(["workbench", "noImage"], "Kart görseli gerekli");
    placeholder.append(title);

    const copy = documentRef.createElement("div");
    copy.className = "repair-empty-state__copy";
    copy.textContent = text(
      ["workbench", "noImageHelp"],
      "Overlay, ölçüm ve rehberli onarım adımlarını kullanmak için Android kamerayı başlat veya bir kart görseli ekle."
    );
    placeholder.append(copy);

    const steps = documentRef.createElement("div");
    steps.className = "repair-empty-state__steps";
    [
      text(["workbench", "emptyStateStep1"], "Kamerayı başlat"),
      text(["workbench", "emptyStateStep2"], "Kartı çerçevele"),
      text(["workbench", "emptyStateStep3"], "Hazır olunca dondur"),
    ].forEach((step) => {
      const item = documentRef.createElement("span");
      item.textContent = step;
      steps.append(item);
    });
    placeholder.append(steps);

    return placeholder;
  }

  function buildPanelSignature(panelId: RepairPanelId): string {
    return `${context.locale}:${translationRevision}:${buildRepairPanelSignature({ meta, panelId, state })}`;
  }

  function applyLiveSnapshotUpdates(): void {
    visualTimelineDom.updateTimelineLiveDom();
    measurementDom.updateMeasurementLiveDom();
  }

  function updateCursorHud(point: { xPx: number; yPx: number }): void {
    const gridX = Math.max(0, Math.round(point.xPx / 80));
    const gridY = Math.max(0, Math.round(point.yPx / 80));
    state.workbench.cursor = { xPx: point.xPx, yPx: point.yPx, gridX, gridY };
    const hud = documentRef.querySelector<HTMLElement>(".repair-coord-hud");
    if (hud !== null) {
      syncCoordHudLabels(hud, [`X ${point.xPx}`, `Y ${point.yPx}`, `GRID ${gridX}x${gridY}`]);
    }
  }

  function cancelSpatialFocusTween(): void {
    spatialFocusTweenToken += 1;
    spatialFocusTween?.cancel();
    spatialFocusTween = null;
  }

  function getSpatialFocusKey(): string | null {
    const focus = meta.replay.activeSpatialFocus;
    if (focus === null || focus.region === null) return null;
    return JSON.stringify({ ref: focus.ref, region: focus.region });
  }

  function clampUiViewportPan(
    viewport: RepairWorkbenchViewport,
    imageWidthPx: number,
    imageHeightPx: number
  ): RepairWorkbenchViewport {
    const maxX = Math.max(0, imageWidthPx * Math.max(0, viewport.zoom - 1));
    const maxY = Math.max(0, imageHeightPx * Math.max(0, viewport.zoom - 1));
    return {
      zoom: viewport.zoom,
      panXPx: Math.max(-maxX, Math.min(maxX, viewport.panXPx)),
      panYPx: Math.max(-maxY, Math.min(maxY, viewport.panYPx)),
    };
  }

  function getSpatialFocusViewportTarget(
    viewport: HTMLElement,
    region: RepairImageRect
  ): RepairWorkbenchViewport | null {
    const session = state.sessions.detail;
    const image = session?.pcbImage ?? null;
    if (image === null) return null;
    const bounds = viewport.getBoundingClientRect();
    const width = Math.max(1, bounds.width || viewport.clientWidth || 1);
    const height = Math.max(1, bounds.height || viewport.clientHeight || 1);
    const frame = getContainedImageFrame(width, height, image.widthPx, image.heightPx);
    const focusFrame = getRepairFocusFrame(region, image.widthPx, image.heightPx, 54);
    const zoomForWidth = (width * 0.62) / Math.max(1, focusFrame.widthPx * frame.scale);
    const zoomForHeight = (height * 0.62) / Math.max(1, focusFrame.heightPx * frame.scale);
    const zoom = Math.min(3.2, Math.max(1.05, Math.min(zoomForWidth, zoomForHeight)));
    const center = {
      xPx: focusFrame.xPx + focusFrame.widthPx / 2,
      yPx: focusFrame.yPx + focusFrame.heightPx / 2,
    };
    return clampUiViewportPan(
      {
        zoom,
        panXPx: width / 2 - frame.leftPx - center.xPx * frame.scale * zoom,
        panYPx: height / 2 - frame.topPx - center.yPx * frame.scale * zoom,
      },
      image.widthPx,
      image.heightPx
    );
  }

  function applyLocalWorkbenchViewport(viewport: RepairWorkbenchViewport): void {
    state.workbench.viewport = viewport;
    const workbenchPanel = shell?.panelElements.get("workbench-stage") ?? null;
    if (workbenchPanel !== null) {
      updateWorkbenchPanelDom(workbenchPanel);
    }
    if (shell !== null) {
      void overlayRuntime.syncOverlay(shell.root);
    }
  }

  function syncSpatialFocusTween(): void {
    const focusKey = getSpatialFocusKey();
    if (focusKey === null) {
      lastSpatialFocusKey = null;
      cancelSpatialFocusTween();
      return;
    }
    if (focusKey === lastSpatialFocusKey) return;
    const viewport = documentRef.querySelector<HTMLElement>(".repair-viewport");
    const focusRegion = meta.replay.activeSpatialFocus?.region ?? null;
    if (viewport === null || focusRegion === null) return;
    const target = getSpatialFocusViewportTarget(viewport, focusRegion);
    if (target === null) return;

    cancelSpatialFocusTween();
    lastSpatialFocusKey = focusKey;
    const token = spatialFocusTweenToken;
    spatialFocusTween = createSpatialFocusTween({
      durationMs: 420,
      from: state.workbench.viewport,
      to: target,
      onUpdate: (viewport) => {
        if (token !== spatialFocusTweenToken) return;
        applyLocalWorkbenchViewport(viewport);
      },
      onComplete: () => {
        if (token !== spatialFocusTweenToken) return;
        spatialFocusTween = null;
        applyLocalWorkbenchViewport(target);
        requestRuntime.updateViewport({
          viewportZoom: target.zoom,
          panXPx: target.panXPx,
          panYPx: target.panYPx,
        });
      },
    });
  }

  function applyPanelGuidanceChrome(panel: HTMLElement, panelId: RepairPanelId): void {
    const primarySurface = state.guidance.panelVisibility.primarySurface;
    const panelSurface = getGuidanceSurfaceForPanel(panelId);
    const active =
      (panelSurface !== "none" && primarySurface === panelSurface) ||
      (panelId === "session-rail" && primarySurface === "session-wizard");
    setDatasetIfChanged(panel, "primarySurface", primarySurface);
    setDatasetIfChanged(panel, "operationalProfile", state.guidance.operationalProfile);
    panel.classList.toggle("repair-panel--active", active);
  }

  function isPanelVisible(panelId: RepairPanelId): boolean {
    return state.layout.collapsedPanels[panelId] !== true;
  }

  function isDesktopRepairResizableLayout(): boolean {
    return window.matchMedia("(max-width: 980px)").matches === false;
  }

  function ensureRepairPanelSizes(): RepairPanelSizeState {
    const current = (state.layout as { panelSizes?: RepairPanelSizeState }).panelSizes;
    const panelSizes = normalizeRepairPanelSizes(current ?? {});
    state.layout.panelSizes = panelSizes;
    return panelSizes;
  }

  function syncWorkspaceGridSizing(persistentShell: RepairPersistentShell): void {
    if (!isDesktopRepairResizableLayout()) {
      setStyleIfChanged(persistentShell.workspace, "gridTemplateColumns", "");
      return;
    }

    const panelSizes = ensureRepairPanelSizes();
    setStyleIfChanged(
      persistentShell.workspace,
      "gridTemplateColumns",
      getRepairMainGridTemplateColumns(state.layout.collapsedPanels, panelSizes.mainColumns)
    );
  }

  function setResizerPxStyle(
    element: HTMLElement,
    property: "left" | "top" | "width" | "height",
    value: number
  ): void {
    const nextValue = `${Math.round(value)}px`;
    if (element.style[property] !== nextValue) element.style[property] = nextValue;
  }

  function isRepairMainLayoutPanelId(value: string | undefined): value is RepairMainLayoutPanelId {
    return (
      value !== undefined && (REPAIR_MAIN_LAYOUT_PANEL_IDS as readonly string[]).includes(value)
    );
  }

  function getLayoutResizerId(group: string, beforeId: string, afterId: string): string {
    return `${group}:${beforeId}:${afterId}`;
  }

  function ensureLayoutResizer(params: {
    afterId: string;
    beforeId: string;
    group: string;
    orientation: "horizontal" | "vertical";
    workspace: HTMLElement;
  }): HTMLElement {
    const resizerId = getLayoutResizerId(params.group, params.beforeId, params.afterId);
    const selector = `[data-repair-layout-resizer-id='${resizerId}']`;
    const existing = params.workspace.querySelector<HTMLElement>(selector);
    if (existing !== null) return existing;

    const resizer = documentRef.createElement("div");
    resizer.className = `repair-layout-resizer repair-layout-resizer--${params.orientation}`;
    resizer.dataset["repairLayoutResizer"] = "true";
    resizer.dataset["repairLayoutResizerId"] = resizerId;
    resizer.dataset["resizeGroup"] = params.group;
    resizer.dataset["beforePanelId"] = params.beforeId;
    resizer.dataset["afterPanelId"] = params.afterId;
    resizer.setAttribute("role", "separator");
    resizer.setAttribute("aria-orientation", params.orientation);
    resizer.tabIndex = 0;
    params.workspace.append(resizer);
    return resizer;
  }

  function positionVerticalLayoutResizer(
    resizer: HTMLElement,
    workspaceRect: DOMRect,
    beforeRect: DOMRect,
    afterRect: DOMRect
  ): void {
    const top = Math.min(beforeRect.top, afterRect.top) - workspaceRect.top;
    const bottom = Math.max(beforeRect.bottom, afterRect.bottom) - workspaceRect.top;
    setResizerPxStyle(resizer, "left", beforeRect.right - workspaceRect.left);
    setResizerPxStyle(resizer, "top", top);
    setResizerPxStyle(resizer, "height", Math.max(0, bottom - top));
    resizer.hidden = false;
  }

  function syncLayoutResizers(persistentShell: RepairPersistentShell): void {
    const resizers = persistentShell.workspace.querySelectorAll<HTMLElement>(
      "[data-repair-layout-resizer='true']"
    );
    if (!isDesktopRepairResizableLayout()) {
      resizers.forEach((resizer) => resizer.remove());
      return;
    }

    const workspaceRect = persistentShell.workspace.getBoundingClientRect();
    const activeResizerIds = new Set<string>();
    const visibleMainPanelIds = REPAIR_MAIN_LAYOUT_PANEL_IDS.filter((panelId) =>
      isPanelVisible(panelId)
    );
    for (let index = 0; index < visibleMainPanelIds.length - 1; index += 1) {
      const beforeId = visibleMainPanelIds[index];
      const afterId = visibleMainPanelIds[index + 1];
      if (beforeId === undefined || afterId === undefined) continue;
      const beforeElement = persistentShell.panelElements.get(beforeId);
      const afterElement = persistentShell.panelElements.get(afterId);
      if (beforeElement === undefined || afterElement === undefined) continue;
      const resizer = ensureLayoutResizer({
        afterId,
        beforeId,
        group: "main-columns",
        orientation: "vertical",
        workspace: persistentShell.workspace,
      });
      activeResizerIds.add(resizer.dataset["repairLayoutResizerId"] ?? "");
      positionVerticalLayoutResizer(
        resizer,
        workspaceRect,
        beforeElement.getBoundingClientRect(),
        afterElement.getBoundingClientRect()
      );
    }

    resizers.forEach((resizer) => {
      if (!activeResizerIds.has(resizer.dataset["repairLayoutResizerId"] ?? "")) {
        resizer.remove();
      }
    });
  }

  function syncLayoutResizersSoon(persistentShell: RepairPersistentShell): void {
    syncLayoutResizers(persistentShell);
    window.requestAnimationFrame(() => {
      if (shell === persistentShell) syncLayoutResizers(persistentShell);
    });
  }

  function clampLayoutNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  function applyColumnResizeDrag(drag: RepairMainColumnResizeDrag, clientX: number): void {
    const totalWidthPx = drag.startBeforeWidthPx + drag.startAfterWidthPx;
    if (totalWidthPx <= 0) return;
    const minPanelWidthPx = Math.min(drag.minPanelWidthPx, Math.max(48, (totalWidthPx - 48) / 2));
    const nextBeforeWidthPx = clampLayoutNumber(
      drag.startBeforeWidthPx + clientX - drag.startX,
      minPanelWidthPx,
      totalWidthPx - minPanelWidthPx
    );
    const totalWeight = drag.startBeforeWeight + drag.startAfterWeight;
    const nextBeforeWeight = (nextBeforeWidthPx / totalWidthPx) * totalWeight;
    const nextAfterWeight = totalWeight - nextBeforeWeight;
    const panelSizes = ensureRepairPanelSizes();
    state.layout.panelSizes = normalizeRepairPanelSizes({
      ...panelSizes,
      mainColumns: {
        ...panelSizes.mainColumns,
        [drag.beforeId]: nextBeforeWeight,
        [drag.afterId]: nextAfterWeight,
      },
    });
    if (shell !== null) {
      syncWorkspaceGridSizing(shell);
      syncLayoutResizers(shell);
    }
  }

  function handleLayoutResizePointerMove(event: PointerEvent): void {
    if (layoutResizeDrag === null || event.pointerId !== layoutResizeDrag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    applyColumnResizeDrag(layoutResizeDrag, event.clientX);
  }

  function finishLayoutResize(event: PointerEvent): void {
    if (layoutResizeDrag === null || event.pointerId !== layoutResizeDrag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    documentRef.removeEventListener("pointermove", handleLayoutResizePointerMove, true);
    documentRef.removeEventListener("pointerup", finishLayoutResize, true);
    documentRef.removeEventListener("pointercancel", finishLayoutResize, true);
    shell?.root.classList.remove("repair-shell--resizing", "repair-shell--resizing-vertical");
    requestRuntime.updatePanelLayout({ panelSizes: ensureRepairPanelSizes() });
    layoutResizeDrag = null;
  }

  function createColumnResizeDrag(params: {
    afterId: RepairMainLayoutPanelId;
    beforeId: RepairMainLayoutPanelId;
    group: "main-columns";
    minPanelWidthPx: number;
    pointerId: number;
    startX: number;
  }): RepairMainColumnResizeDrag | null {
    const beforeElement = shell?.panelElements.get(params.beforeId);
    const afterElement = shell?.panelElements.get(params.afterId);
    if (beforeElement === undefined || afterElement === undefined) return null;
    const beforeRect = beforeElement.getBoundingClientRect();
    const afterRect = afterElement.getBoundingClientRect();
    if (beforeRect.width <= 0 || afterRect.width <= 0) return null;
    const panelSizes = ensureRepairPanelSizes();
    return {
      ...params,
      startAfterWeight: panelSizes.mainColumns[params.afterId],
      startAfterWidthPx: afterRect.width,
      startBeforeWeight: panelSizes.mainColumns[params.beforeId],
      startBeforeWidthPx: beforeRect.width,
    };
  }

  function startLayoutResize(event: PointerEvent, resizer: HTMLElement): void {
    if (shell === null || !isDesktopRepairResizableLayout()) return;
    const group = resizer.dataset["resizeGroup"];
    const beforeId = resizer.dataset["beforePanelId"];
    const afterId = resizer.dataset["afterPanelId"];
    event.preventDefault();
    cancelSpatialFocusTween();

    if (
      group === "main-columns" &&
      isRepairMainLayoutPanelId(beforeId) &&
      isRepairMainLayoutPanelId(afterId)
    ) {
      layoutResizeDrag = createColumnResizeDrag({
        afterId,
        beforeId,
        group: "main-columns",
        minPanelWidthPx: 160,
        pointerId: event.pointerId,
        startX: event.clientX,
      });
    }

    if (layoutResizeDrag === null) return;
    shell.root.classList.add("repair-shell--resizing", "repair-shell--resizing-vertical");
    documentRef.addEventListener("pointermove", handleLayoutResizePointerMove, true);
    documentRef.addEventListener("pointerup", finishLayoutResize, true);
    documentRef.addEventListener("pointercancel", finishLayoutResize, true);
  }

  function findLayoutResizerElement(target: EventTarget | null): HTMLElement | null {
    return target instanceof Element
      ? target.closest<HTMLElement>("[data-repair-layout-resizer='true']")
      : null;
  }

  function updatePanelChrome(panel: HTMLElement, panelId: RepairPanelId): void {
    applyPanelGuidanceChrome(panel, panelId);
    const collapsed = state.layout.collapsedPanels[panelId];
    panel.classList.toggle("repair-panel--collapsed", collapsed);
    if (isRepairChipControlledPanel(panelId)) {
      panel.hidden = collapsed;
      setDatasetIfChanged(panel, "chipVisible", String(!collapsed));
    }

    const collapse = panel.querySelector<HTMLElement>(
      "[data-repair-action='toggle-panel-collapse']"
    );
    if (collapse !== null) {
      const nextTitle = collapsed
        ? text(["panelControls", "expand"], "Paneli aç")
        : text(["panelControls", "collapse"], "Paneli kapat");
      const nextText = collapsed
        ? text(["panelControls", "show"], "Göster")
        : text(["panelControls", "hide"], "Gizle");
      if (collapse.title !== nextTitle) collapse.title = nextTitle;
      setTextIfChanged(collapse, nextText);
      setDatasetIfChanged(collapse, "collapsed", String(!collapsed));
    }
  }

  const measurementDom = createRepairMeasurementDomRuntime({
    documentRef,
    state,
    text,
  });
  const visualTimelineDom = createRepairVisualTimelineDomRuntime({
    applyLiveSnapshotUpdates,
    documentRef,
    meta,
    state,
    text,
    updatePanelChrome,
  });
  const tacticalFeedDom = createRepairTacticalFeedDomRuntime({
    documentRef,
    state,
    text,
    updatePanelChrome,
  });
  const overlayRuntime = createRepairOverlayRuntime({
    cancelSpatialFocusTween,
    meta,
    onCursor: updateCursorHud,
    requestRuntime,
    state,
  });
  const dictationComposer = createRepairDictationComposer({
    documentRef,
    requestRuntime,
    state,
  });
  const captureStatusHandlers = createRepairCaptureStatusHandlers({
    render,
    requestRuntime,
    state,
  });

  function syncPanelChip(root: HTMLElement, config: RepairPanelChipConfig): void {
    const chip = root.querySelector<HTMLElement>(
      `[data-repair-action='toggle-panel-chip'][data-panel-id='${config.panelId}']`
    );
    if (chip === null) return;
    const visible = isPanelVisible(config.panelId);
    setClassNameIfChanged(chip, `repair-panel-chip${visible ? " repair-panel-chip--active" : ""}`);
    setDatasetIfChanged(chip, "active", String(visible));
    setDatasetIfChanged(chip, "collapsed", String(!visible));
    chip.setAttribute("aria-pressed", String(visible));
    const labelKey =
      config.panelId === "session-rail"
        ? "session"
        : config.panelId === "tactical-feed"
          ? "feed"
          : config.panelId === "knowledge-pack"
            ? "aio"
            : config.panelId === "visual-timeline"
              ? "timeline"
              : "state";
    const titleKey = `${labelKey}Title`;
    setTextIfChanged(chip, text(["panelChips", labelKey], config.label || labelKey));
    const prefix = visible
      ? text(["panelControls", "hide"], "Gizle")
      : text(["panelControls", "show"], "Göster");
    const chipTitle = text(["panelChips", titleKey], config.title || `${labelKey} panel`);
    const nextTitle = `${prefix} ${chipTitle}`;
    if (chip.title !== nextTitle) chip.title = nextTitle;
  }

  function syncPanelChipGroup(root: HTMLElement, configs: readonly RepairPanelChipConfig[]): void {
    configs.forEach((config) => {
      syncPanelChip(root, config);
    });
  }

  function syncWorkbenchHeaderPanelChips(panel: HTMLElement): void {
    const header = panel.querySelector<HTMLElement>(".repair-panel__header");
    if (header === null) return;

    if (header.querySelector(".repair-workbench-panel-toggles--left") === null) {
      header.prepend(createWorkbenchPanelChipGroup(documentRef, "left", text));
    }
    if (header.querySelector(".repair-workbench-panel-toggles--right") === null) {
      header.append(createWorkbenchPanelChipGroup(documentRef, "right", text));
    }
    syncPanelChipGroup(header, REPAIR_TOP_PANEL_CHIPS);
  }

  function syncWorkspacePanelVisibility(persistentShell: RepairPersistentShell): void {
    const sessionVisible = isPanelVisible("session-rail");
    const feedVisible = isPanelVisible("tactical-feed");
    const knowledgeVisible = isPanelVisible("knowledge-pack");
    setDatasetIfChanged(persistentShell.workspace, "sessionVisible", String(sessionVisible));
    setDatasetIfChanged(persistentShell.workspace, "feedVisible", String(feedVisible));
    setDatasetIfChanged(persistentShell.workspace, "knowledgeVisible", String(knowledgeVisible));
    persistentShell.rightStack.hidden = !knowledgeVisible;
    syncWorkspaceGridSizing(persistentShell);
  }

  function syncBottomCluster(persistentShell: RepairPersistentShell): void {
    const timelineVisible = isPanelVisible("visual-timeline");
    persistentShell.bottomClusterBody.hidden = !timelineVisible;
    setDatasetIfChanged(persistentShell.bottomCluster, "timelineVisible", String(timelineVisible));
    setDatasetIfChanged(
      persistentShell.bottomCluster,
      "visiblePanelCount",
      timelineVisible ? "1" : "0"
    );
    syncPanelChipGroup(persistentShell.bottomClusterHeader, REPAIR_BOTTOM_PANEL_CHIPS);
  }

  function syncCoordHudLabels(hud: HTMLElement, labels: string[]): void {
    labels.forEach((labelText, index) => {
      const item = hud.children.item(index);
      const labelElement = item instanceof HTMLElement ? item : documentRef.createElement("span");
      if (item === null) {
        hud.append(labelElement);
      }
      setTextIfChanged(labelElement, labelText);
    });

    while (hud.children.length > labels.length) {
      hud.children.item(hud.children.length - 1)?.remove();
    }
  }

  function hasActiveRepairSession(): boolean {
    return state.sessions.activeId !== null && state.sessions.detail !== null;
  }

  function isHistoryReviewMode(): boolean {
    return (
      state.workbench.focusedEventId !== null ||
      state.workbench.timeline.replayMode === "replay" ||
      state.workbench.timeline.replayMode === "paused"
    );
  }

  function isWorkbenchToolHistoryLocked(tool: string): boolean {
    return isHistoryReviewMode() && !REPAIR_HISTORY_REVIEW_SAFE_TOOL_IDS.has(tool);
  }

  function hasActiveWorkbenchCameraFeed(): boolean {
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

  function isWorkbenchQuickActionActive(actionId: string): boolean {
    if (!hasActiveRepairSession()) return false;
    switch (actionId) {
      case "camera-feed":
        return hasActiveWorkbenchCameraFeed();
      case "camera-torch":
        return state.operations.activeCapabilities.includes("android-torch");
      case "measurement-overlay":
        return measurementOverlayOpen;
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
      default:
        return false;
    }
  }

  function isWorkbenchQuickActionDisabled(actionId: string): boolean {
    if (isHistoryReviewMode()) return true;
    if (actionId === "measurement-overlay") return !hasActiveRepairSession();
    if (actionId !== "capture-photo") return false;
    return !hasActiveWorkbenchCameraFeed();
  }

  function isNativeSessionLockControl(
    element: HTMLElement
  ): element is HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
    return (
      element instanceof HTMLButtonElement ||
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    );
  }

  function syncSessionLockedControl(element: HTMLElement, locked: boolean): void {
    if (isNativeSessionLockControl(element)) {
      if (locked) {
        if (element.dataset["sessionLockWasDisabled"] === undefined) {
          setDatasetIfChanged(element, "sessionLockWasDisabled", String(element.disabled));
        }
        element.disabled = true;
      } else {
        const previousDisabled = element.dataset["sessionLockWasDisabled"];
        if (previousDisabled !== undefined) {
          element.disabled = previousDisabled === "true";
          delete element.dataset["sessionLockWasDisabled"];
        }
      }
    }
    setDatasetIfChanged(element, "sessionLocked", String(locked));
  }

  function syncPanelSessionLock(panel: HTMLElement, panelId: RepairPanelId): void {
    const locked = REPAIR_SESSION_REQUIRED_PANEL_IDS.has(panelId) && !hasActiveRepairSession();
    setDatasetIfChanged(panel, "sessionLocked", String(locked));
    const body = panel.querySelector<HTMLElement>(".repair-panel__body");
    if (body === null) return;

    setDatasetIfChanged(body, "sessionLocked", String(locked));
    body.classList.toggle("repair-panel__body--session-locked", locked);
    body.setAttribute("aria-disabled", String(locked));
    (body as HTMLElement & { inert: boolean }).inert = locked;

    body.querySelectorAll<HTMLElement>("button, input, select, textarea").forEach((control) => {
      syncSessionLockedControl(control, locked);
    });
    body.querySelectorAll<HTMLElement>("[data-repair-action]").forEach((actionElement) => {
      if (!isNativeSessionLockControl(actionElement)) {
        setDatasetIfChanged(actionElement, "sessionLocked", String(locked));
      }
    });
  }

  function isSessionLockedActionElement(element: HTMLElement): boolean {
    if (element.closest<HTMLElement>(".repair-panel__body[data-session-locked='true']") !== null) {
      return true;
    }
    if (element.dataset["sessionLocked"] === "true") return true;
    return isNativeSessionLockControl(element) && element.disabled;
  }

  function syncWorkbenchQuickActions(panel: HTMLElement): void {
    panel.querySelectorAll<HTMLButtonElement>("[data-repair-quick-action]").forEach((button) => {
      const actionId = button.dataset["repairQuickAction"] ?? "";
      const active = isWorkbenchQuickActionActive(actionId);
      const disabled = isWorkbenchQuickActionDisabled(actionId);
      setClassNameIfChanged(
        button,
        `repair-workbench-actionbar__button${
          active ? " repair-workbench-actionbar__button--active" : ""
        }${disabled ? " repair-workbench-actionbar__button--disabled" : ""}`
      );
      button.disabled = disabled;
      setDatasetIfChanged(button, "active", String(active));
      setDatasetIfChanged(button, "disabled", String(disabled));
    });
  }

  function renderWorkbenchMeasurementOverlay(): HTMLElement {
    const overlay = documentRef.createElement("section");
    overlay.className = "repair-measurement-overlay";
    overlay.dataset["repairMeasurementOverlay"] = "true";
    overlay.setAttribute("aria-label", text(["measurement", "overlayTitle"], "Ölçüm girişi"));

    const header = documentRef.createElement("header");
    header.className = "repair-measurement-overlay__header";

    const title = documentRef.createElement("div");
    title.className = "repair-measurement-overlay__title";
    title.textContent = text(["measurement", "overlayTitle"], "Ölçüm girişi");
    header.append(title);

    const close = documentRef.createElement("button");
    close.type = "button";
    close.className = "repair-measurement-overlay__close";
    close.textContent = "×";
    close.dataset["repairAction"] = "close-measurement-overlay";
    close.title = text(["measurement", "closeOverlay"], "Ölçüm girişini kapat");
    close.setAttribute("aria-label", text(["measurement", "closeOverlay"], "Ölçüm girişini kapat"));
    header.append(close);

    overlay.append(
      header,
      renderMeasurementEntrySurface(documentRef, state, text, {
        className: "repair-measurement-entry repair-measurement-entry--workbench",
      })
    );
    return overlay;
  }

  function syncWorkbenchMeasurementOverlay(panel: HTMLElement): void {
    const viewport = panel.querySelector<HTMLElement>(".repair-viewport");
    const existing = panel.querySelector<HTMLElement>("[data-repair-measurement-overlay='true']");
    if (!hasActiveRepairSession()) measurementOverlayOpen = false;
    if (viewport === null || !measurementOverlayOpen) {
      existing?.remove();
      return;
    }
    if (existing === null) {
      viewport.append(renderWorkbenchMeasurementOverlay());
      return;
    }
    measurementDom.updateMeasurementEntryDom(existing);
  }

  function updateWorkbenchPanelDom(panel: HTMLElement): void {
    updatePanelChrome(panel, "workbench-stage");
    syncWorkbenchHeaderPanelChips(panel);
    syncWorkbenchQuickActions(panel);

    const dot = panel.querySelector<HTMLElement>(".repair-panel__status-dot");
    if (dot !== null) {
      setClassNameIfChanged(
        dot,
        `repair-panel__status-dot repair-panel__status-dot--${
          state.workbench.isFrozen ? "amber" : "live"
        }`
      );
    }

    const viewport = panel.querySelector<HTMLElement>(".repair-viewport");
    if (viewport !== null) {
      viewport.classList.toggle("repair-viewport--frozen", state.workbench.isFrozen);
      setDatasetIfChanged(viewport, "cursor", state.workbench.contextualCursor);
      setDatasetIfChanged(viewport, "mode", getWorkbenchViewportMode());
      setDatasetIfChanged(viewport, "liveSource", state.workbench.liveSource.sourceType ?? "image");
      const overlayHost = viewport.querySelector<HTMLElement>(
        "[data-repair-overlay-stage='workbench']"
      );
      const existingLiveFrame = viewport.querySelector<HTMLImageElement>(
        ".repair-viewport__live-frame"
      );
      const existingImage = viewport.querySelector<HTMLImageElement>(".repair-viewport__image");
      const existingPlaceholder = viewport.querySelector<HTMLElement>(".repair-empty-state");
      const session = state.sessions.detail;
      const livePreview = state.workbench.liveSource.preview;
      const liveStreamUrl =
        livePreview?.source === "mjpeg-stream" &&
        livePreview.streamUrl !== null &&
        livePreview.streamUrl !== undefined
          ? livePreview.streamUrl.trim()
          : "";

      if (liveStreamUrl !== "") {
        const liveFrame = existingLiveFrame ?? documentRef.createElement("img");
        setClassNameIfChanged(liveFrame, "repair-viewport__live-frame");
        if (liveFrame.getAttribute("src") !== liveStreamUrl) liveFrame.src = liveStreamUrl;
        liveFrame.alt =
          livePreview?.label ?? text(["status", "cameraSourceAndroid"], "Android kamera");
        if (liveFrame.draggable) liveFrame.draggable = false;
        existingImage?.remove();
        existingPlaceholder?.remove();
        if (existingLiveFrame === null) {
          viewport.insertBefore(liveFrame, overlayHost ?? viewport.firstChild);
        }
      } else if (session !== null && session.pcbImage !== null) {
        existingLiveFrame?.remove();
        const resolvedSrc = resolveRepairAssetUrl(session.pcbImage.src) ?? session.pcbImage.src;
        const image = existingImage ?? documentRef.createElement("img");
        setClassNameIfChanged(image, "repair-viewport__image");
        if (image.getAttribute("src") !== resolvedSrc) image.src = resolvedSrc;
        if (image.alt !== session.pcbImage.label) image.alt = session.pcbImage.label;
        if (image.draggable) image.draggable = false;
        setStyleIfChanged(
          image,
          "transform",
          `translate(${state.workbench.viewport.panXPx}px, ${state.workbench.viewport.panYPx}px) scale(${state.workbench.viewport.zoom})`
        );
        setStyleIfChanged(image, "transformOrigin", "top left");
        existingPlaceholder?.remove();
        if (existingImage === null) {
          viewport.insertBefore(image, overlayHost ?? viewport.firstChild);
        }
      } else {
        existingLiveFrame?.remove();
        existingImage?.remove();
        if (existingPlaceholder === null) {
          const placeholder = createWorkbenchEmptyState();
          viewport.insertBefore(placeholder, overlayHost ?? viewport.firstChild);
        }
      }
    }

    const cursor = state.workbench.cursor;
    if (cursor !== null) {
      updateCursorHud(cursor);
    } else {
      const hud = panel.querySelector<HTMLElement>(".repair-coord-hud");
      if (hud !== null) {
        syncCoordHudLabels(hud, [
          `${text(["workbench", "coordX"], "X")} —`,
          `${text(["workbench", "coordY"], "Y")} —`,
          `${text(["workbench", "coordGrid"], "IZGARA")} —`,
        ]);
      }
    }

    const hasSession = hasActiveRepairSession();
    panel.querySelectorAll<HTMLElement>("[data-repair-action='set-tool']").forEach((button) => {
      const tool = button.dataset["tool"] ?? "";
      const historyLocked = isWorkbenchToolHistoryLocked(tool);
      button.classList.toggle(
        "repair-toolbar__btn--active",
        hasSession && tool === state.workbench.activeTool
      );
      button.classList.toggle("repair-toolbar__btn--disabled", historyLocked);
      if (button instanceof HTMLButtonElement) button.disabled = historyLocked;
      setDatasetIfChanged(button, "historyLocked", String(historyLocked));
    });

    const zoomValue = panel.querySelector<HTMLElement>(".repair-toolbar__zoom-value");
    if (zoomValue !== null) {
      setTextIfChanged(zoomValue, `${Math.round(state.workbench.viewport.zoom * 100)}%`);
    }

    panel
      .querySelectorAll<HTMLElement>("[data-repair-action='toggle-overlay-layer']")
      .forEach((button) => {
        const layerId = button.dataset["layerId"];
        const visible =
          layerId !== undefined &&
          state.workbench.visibleLayers[layerId as keyof typeof state.workbench.visibleLayers];
        button.classList.toggle("repair-toolbar__btn--active", hasSession && visible === true);
        setDatasetIfChanged(button, "visible", String(visible !== true));
      });
    panel
      .querySelectorAll<HTMLElement>("[data-repair-action='toggle-investigation-mode']")
      .forEach((button) => {
        button.classList.toggle(
          "repair-toolbar__btn--active",
          hasSession && state.workbench.investigationModeEnabled
        );
      });
    syncWorkbenchMeasurementOverlay(panel);
  }

  function replacePanelElement(current: HTMLElement, next: HTMLElement): HTMLElement {
    const bodyScrollTop = current.querySelector<HTMLElement>(".repair-panel__body")?.scrollTop ?? 0;
    const timelineScrollLeft =
      current.querySelector<HTMLElement>(".repair-timeline__scroller")?.scrollLeft ?? 0;
    const feedScrollTop = current.querySelector<HTMLElement>(".repair-feed-list")?.scrollTop ?? 0;
    current.replaceWith(next);
    const nextBody = next.querySelector<HTMLElement>(".repair-panel__body");
    if (nextBody !== null) nextBody.scrollTop = bodyScrollTop;
    const nextTimeline = next.querySelector<HTMLElement>(".repair-timeline__scroller");
    if (nextTimeline !== null) nextTimeline.scrollLeft = timelineScrollLeft;
    const nextFeed = next.querySelector<HTMLElement>(".repair-feed-list");
    if (nextFeed !== null) nextFeed.scrollTop = feedScrollTop;
    return next;
  }

  function createPanelLifecycle(
    panelId: RepairPanelId,
    renderer: RepairPanelRenderer
  ): RepairPanelLifecycle {
    return {
      panelId,
      signature: buildPanelSignature(panelId),
      mount: (parent) => {
        const element = renderer();
        parent.append(element);
        return element;
      },
      update: (element) => {
        if (panelId === "workbench-stage") {
          updateWorkbenchPanelDom(element);
          return element;
        }
        if (panelId === "visual-timeline") {
          visualTimelineDom.updateVisualTimelinePanelDom(element);
          return element;
        }
        if (panelId === "tactical-feed") {
          tacticalFeedDom.updateTacticalFeedPanelDom(element);
          return element;
        }
        return replacePanelElement(element, renderer());
      },
      dispose: (element) => {
        element.remove();
      },
    };
  }

  function shouldKeepSessionRailDomForActiveInteraction(
    panelId: RepairPanelId,
    panel: HTMLElement
  ): boolean {
    if (panelId !== "session-rail") return false;

    const activeElement = documentRef.activeElement;
    if (!(activeElement instanceof HTMLElement) || !panel.contains(activeElement)) return false;

    const action = activeElement.dataset["repairAction"];
    return action === "wizard-field" || action === "wizard-suggestion";
  }

  function armSessionRailDraftEchoGuard(): void {
    pendingSessionRailDraftEcho = true;
    if (pendingSessionRailDraftEchoTimer !== null) {
      clearTimeout(pendingSessionRailDraftEchoTimer);
    }
    pendingSessionRailDraftEchoTimer = setTimeout(() => {
      pendingSessionRailDraftEcho = false;
      pendingSessionRailDraftEchoTimer = null;
    }, 1000);
  }

  function consumeSessionRailDraftEchoGuard(panelId: RepairPanelId): boolean {
    if (panelId !== "session-rail" || pendingSessionRailDraftEcho === false) return false;
    pendingSessionRailDraftEcho = false;
    if (pendingSessionRailDraftEchoTimer !== null) {
      clearTimeout(pendingSessionRailDraftEchoTimer);
      pendingSessionRailDraftEchoTimer = null;
    }
    return true;
  }

  function isPanelSignatureOnCurrentLocale(signature: string | undefined): boolean {
    return signature?.startsWith(`${context.locale}:${translationRevision}:`) === true;
  }

  function syncPanel(
    persistentShell: RepairPersistentShell,
    parent: HTMLElement,
    lifecycle: RepairPanelLifecycle
  ): void {
    const current = persistentShell.panelElements.get(lifecycle.panelId);
    if (current === undefined) {
      const mounted = lifecycle.mount(parent);
      updatePanelChrome(mounted, lifecycle.panelId);
      if (lifecycle.panelId === "workbench-stage") {
        lifecycle.update(mounted);
      }
      syncPanelSessionLock(mounted, lifecycle.panelId);
      persistentShell.panelElements.set(lifecycle.panelId, mounted);
      persistentShell.panelSignatures.set(lifecycle.panelId, lifecycle.signature);
      return;
    }

    const previousSignature = persistentShell.panelSignatures.get(lifecycle.panelId);
    if (previousSignature === lifecycle.signature) {
      if (lifecycle.panelId === "workbench-stage" || lifecycle.panelId === "tactical-feed") {
        lifecycle.update(current);
      }
      updatePanelChrome(current, lifecycle.panelId);
      syncPanelSessionLock(current, lifecycle.panelId);
      return;
    }

    if (
      isPanelSignatureOnCurrentLocale(previousSignature) &&
      (consumeSessionRailDraftEchoGuard(lifecycle.panelId) ||
        shouldKeepSessionRailDomForActiveInteraction(lifecycle.panelId, current))
    ) {
      // Host echoes draft updates on every keystroke; remounting here drops focus and selection.
      if (lifecycle.panelId === "session-rail") syncSessionWizardStepperDom(current, state);
      updatePanelChrome(current, lifecycle.panelId);
      syncPanelSessionLock(current, lifecycle.panelId);
      persistentShell.panelSignatures.set(lifecycle.panelId, lifecycle.signature);
      return;
    }

    const updated = lifecycle.update(current);
    updatePanelChrome(updated, lifecycle.panelId);
    syncPanelSessionLock(updated, lifecycle.panelId);
    persistentShell.panelElements.set(lifecycle.panelId, updated);
    persistentShell.panelSignatures.set(lifecycle.panelId, lifecycle.signature);
  }

  function createLegendBar(): HTMLElement {
    const legendBar = documentRef.createElement("div");
    legendBar.className = "repair-legendbar";

    legendBar.dataset["repairLegendbar"] = "true";

    const legends: Array<[string, string]> = [
      [text(["legend", "snapshot"], "Kare"), "var(--repair-cyan)"],
      [text(["legend", "aiMark"], "AI İşareti"), "var(--repair-amber)"],
      [text(["legend", "measurement"], "Ölçüm"), "var(--repair-text)"],
      [text(["legend", "note"], "Not"), "var(--repair-info)"],
      [text(["legend", "risk"], "Risk"), "var(--repair-risk)"],
    ];

    for (const [lbl, color] of legends) {
      const item = documentRef.createElement("span");
      item.className = "repair-legend-item";

      const swatch = documentRef.createElement("span");
      swatch.className = "repair-legend-swatch";
      swatch.style.background = color;
      item.append(swatch);

      const ltxt = documentRef.createElement("span");
      ltxt.textContent = lbl;
      item.append(ltxt);

      legendBar.append(item);
    }

    return legendBar;
  }

  function syncPersistentShellText(persistentShell: RepairPersistentShell): void {
    const statusVersion = persistentShell.root.querySelector<HTMLElement>(
      "[data-repair-statusbar-version='true']"
    );
    if (statusVersion !== null) {
      setTextIfChanged(statusVersion, text(["statusbar", "version"], "Tamir Odası v0.1.0"));
    }

    const setupButton = persistentShell.root.querySelector<HTMLElement>(".repair-statusbar__setup");
    if (setupButton !== null) {
      setTextIfChanged(setupButton, text(["statusbar", "setup"], "Kurulum"));
      setupButton.title = text(["statusbar", "setupTitle"], "Tezgah kurulumunu aç");
    }

    syncRepairThemeButton(persistentShell.root);

    const closeButton = persistentShell.root.querySelector<HTMLElement>(".repair-statusbar__close");
    if (closeButton !== null) {
      const returnHome = text(["statusbar", "returnHome"], "Ana sayfaya dön");
      closeButton.title = returnHome;
      closeButton.setAttribute("aria-label", returnHome);
    }

    const legend = persistentShell.root.querySelector<HTMLElement>(
      "[data-repair-legendbar='true']"
    );
    if (legend !== null) {
      legend.replaceWith(createLegendBar());
    }
  }

  function getSettingsOverlayTitle(_tabId: RepairSettingsOverlayTabId): string {
    return text(["settings", "operatorOverlayTitle"], "setup");
  }

  function createSettingsOverlayShell(): { overlay: HTMLElement; body: HTMLElement } {
    const overlay = documentRef.createElement("div");
    overlay.className = "repair-settings-overlay";
    overlay.hidden = true;
    overlay.dataset["settingsOverlay"] = "closed";

    const backdrop = documentRef.createElement("button");
    backdrop.type = "button";
    backdrop.className = "repair-settings-overlay__backdrop";
    backdrop.title = text(["settings", "close"], "Close settings");
    backdrop.dataset["repairAction"] = "set-settings-overlay";
    backdrop.dataset["open"] = "false";

    const dialog = documentRef.createElement("section");
    dialog.className = "repair-settings-overlay__dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const header = documentRef.createElement("header");
    header.className = "repair-settings-overlay__header";

    const title = documentRef.createElement("h2");
    title.className = "repair-settings-overlay__title";
    title.dataset["settingsOverlayTitle"] = "true";
    title.textContent = getSettingsOverlayTitle(state.layout.settingsOverlayTabId);
    header.append(title);

    const body = documentRef.createElement("div");
    body.className = "repair-settings-overlay__body";
    const content = documentRef.createElement("div");
    content.className = "repair-settings-overlay__content";
    body.append(content);

    const close = documentRef.createElement("button");
    close.type = "button";
    close.className = "repair-settings-overlay__close";
    close.title = text(["settings", "close"], "Close settings");
    close.textContent = text(["settings", "close"], "CLOSE");
    close.dataset["repairAction"] = "set-settings-overlay";
    close.dataset["open"] = "false";
    header.append(close);

    dialog.append(header, body);
    overlay.append(backdrop, dialog);
    return { overlay, body };
  }

  function syncSettingsOverlay(overlay: HTMLElement, body: HTMLElement): void {
    const open = state.layout.settingsOverlayOpen;
    const tabId = state.layout.settingsOverlayTabId;
    if (overlay.hidden === open) overlay.hidden = !open;
    setDatasetIfChanged(overlay, "settingsOverlay", open ? "open" : "closed");
    setDatasetIfChanged(overlay, "tabId", tabId);

    const title = overlay.querySelector<HTMLElement>("[data-settings-overlay-title='true']");
    if (title !== null) setTextIfChanged(title, getSettingsOverlayTitle(tabId));

    overlay.querySelectorAll<HTMLElement>(".repair-settings-overlay__tab").forEach((tab) => {
      const active = tab.dataset["tabId"] === tabId;
      tab.classList.toggle("repair-settings-overlay__tab--active", active);
    });

    if (!open) {
      const content = body.querySelector<HTMLElement>(".repair-settings-overlay__content");
      if (content !== null && content.children.length > 0) content.replaceChildren();
      shell?.panelSignatures.delete("operator-profile");
      shell?.panelElements.delete("operator-profile");
      if (shell !== null) shell.settingsOverlaySignature = "";
      return;
    }

    const panelId: RepairPanelId = "operator-profile";
    const signature = `${tabId}:${buildPanelSignature(panelId)}`;
    const content = body.querySelector<HTMLElement>(".repair-settings-overlay__content");
    if (content === null) return;

    if (shell?.settingsOverlaySignature === signature && content.children.length > 0) {
      const current = content.firstElementChild;
      if (current instanceof HTMLElement) applyPanelGuidanceChrome(current, panelId);
      return;
    }

    const panel = renderOperatorProfilePanel(documentRef, state, text);
    applyPanelGuidanceChrome(panel, panelId);
    content.replaceChildren(panel);
    if (shell !== null) shell.settingsOverlaySignature = signature;
  }

  function createBottomClusterShell(): {
    cluster: HTMLElement;
    header: HTMLElement;
    body: HTMLElement;
  } {
    const cluster = documentRef.createElement("div");
    cluster.className = "repair-bottom-cluster";

    const header = documentRef.createElement("header");
    header.className = "repair-bottom-cluster__header";

    header.append(createRepairPanelChipGroup(documentRef, REPAIR_BOTTOM_PANEL_CHIPS, text));

    const body = documentRef.createElement("div");
    body.className = "repair-bottom-cluster__body";

    cluster.append(header, body);

    return { cluster, header, body };
  }

  function updateWizardField(root: HTMLElement, field: string, value: string): void {
    if (isWizardDeviceCascadeField(field)) {
      const patch = createWizardDeviceCascadePatch(field, value);
      syncWizardDeviceCascadeDom(documentRef, root, patch);
      armSessionRailDraftEchoGuard();
      requestRuntime.updateSession({ wizardDraft: patch });
      return;
    }

    requestRuntime.updateSession({ wizardField: field, value });
  }

  function flushWizardFields(root: HTMLElement): void {
    root
      .querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        "[data-repair-action='wizard-field']"
      )
      .forEach((fieldElement) => {
        const field = fieldElement.dataset["wizardField"];
        if (field === undefined || field.trim() === "") return;
        requestRuntime.updateSession({ wizardField: field, value: fieldElement.value });
      });
  }

  function collectEvidenceSelection(root: HTMLElement): {
    selectedEvidenceResourceIds: string[];
    selectedFailureIds: string[];
    selectedTestPointIds: string[];
  } {
    const readCheckedIds = (kind: string) =>
      Array.from(
        root.querySelectorAll<HTMLInputElement>(
          `[data-repair-action='evidence-selection'][data-evidence-kind='${kind}']`
        )
      )
        .filter((input) => input.checked)
        .map((input) => input.dataset["evidenceId"])
        .filter((value): value is string => typeof value === "string" && value.trim() !== "");
    return {
      selectedEvidenceResourceIds: readCheckedIds("resource"),
      selectedFailureIds: readCheckedIds("failure"),
      selectedTestPointIds: readCheckedIds("test-point"),
    };
  }

  function ensurePersistentShell(mount: HTMLElement): RepairPersistentShell {
    if (shell !== null && mount.contains(shell.root)) return shell;

    const root = documentRef.createElement("div");
    root.className = "repair-shell";

    const statusBar = documentRef.createElement("div");
    statusBar.className = "repair-statusbar";

    const label = documentRef.createElement("span");
    label.className = "repair-statusbar__label";
    const labelText = documentRef.createElement("span");
    labelText.dataset["repairStatusbarVersion"] = "true";
    labelText.textContent = text(["statusbar", "version"], "Tamir Odası v0.1.0");
    label.append(labelText);

    const setupButton = documentRef.createElement("button");
    setupButton.className = "repair-statusbar__setup";
    setupButton.type = "button";
    setupButton.textContent = text(["statusbar", "setup"], "Kurulum");
    setupButton.title = text(["statusbar", "setupTitle"], "Tezgah kurulumunu aç");
    setupButton.dataset["repairAction"] = "set-settings-overlay";
    setupButton.dataset["open"] = "true";
    setupButton.dataset["tabId"] = "bench-operator";
    label.append(setupButton);
    statusBar.append(label);

    const statusActions = documentRef.createElement("div");
    statusActions.className = "repair-statusbar__actions";

    const themeButton = documentRef.createElement("button");
    themeButton.className = "repair-statusbar__theme";
    themeButton.type = "button";
    themeButton.dataset["repairAction"] = "toggle-theme";

    const closeButton = documentRef.createElement("button");
    closeButton.className = "repair-statusbar__close";
    closeButton.type = "button";
    closeButton.dataset["repairAction"] = "room-close";
    closeButton.title = text(["statusbar", "returnHome"], "Ana sayfaya dön");
    closeButton.setAttribute("aria-label", text(["statusbar", "returnHome"], "Ana sayfaya dön"));
    closeButton.textContent = "×";

    const clock = documentRef.createElement("span");
    clock.className = "repair-statusbar__clock";
    clock.textContent = "--:--:--";
    statusActions.append(themeButton, closeButton, clock);
    statusBar.append(statusActions);
    root.append(statusBar);

    const workspace = documentRef.createElement("div");
    workspace.className = "repair-workspace";
    const rightStack = documentRef.createElement("div");
    rightStack.className = "repair-panel--wizard-pack-stack";
    const bottomClusterShell = createBottomClusterShell();
    const settingsOverlayShell = createSettingsOverlayShell();
    root.append(workspace, createLegendBar(), settingsOverlayShell.overlay);

    shell = {
      root,
      clock,
      workspace,
      rightStack,
      bottomCluster: bottomClusterShell.cluster,
      bottomClusterHeader: bottomClusterShell.header,
      bottomClusterBody: bottomClusterShell.body,
      settingsOverlay: settingsOverlayShell.overlay,
      settingsOverlayBody: settingsOverlayShell.body,
      settingsOverlaySignature: "",
      panelElements: new Map(),
      panelSignatures: new Map(),
    };
    mount.replaceChildren(root);
    bindActions(root);
    return shell;
  }

  // -- Render
  function render(): void {
    const mount = documentRef.getElementById("app");
    if (mount === null) return;
    const persistentShell = ensurePersistentShell(mount);
    syncPersistentShellText(persistentShell);
    const primarySurfaceClass = state.guidance.panelVisibility.primarySurface.replace(
      /[^a-z-]/g,
      "-"
    );
    const rhythmPhaseClass = state.guidance.rhythm.progressLabel.replace(/[^a-z0-9]+/g, "-");
    setClassNameIfChanged(
      persistentShell.root,
      `repair-shell repair-shell--profile-${state.guidance.operationalProfile} repair-shell--calm-${primarySurfaceClass}${
        state.guidance.focusCorridor.active ? " repair-shell--corridor-active" : ""
      } repair-shell--rhythm-${rhythmPhaseClass}${
        layoutResizeDrag !== null ? " repair-shell--resizing repair-shell--resizing-vertical" : ""
      }`
    );
    setTextIfChanged(
      persistentShell.clock,
      state.ambient.nowIso
        ? new Date(state.ambient.nowIso).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : "--:--:--"
    );
    syncWorkspacePanelVisibility(persistentShell);

    syncPanel(
      persistentShell,
      persistentShell.workspace,
      createPanelLifecycle("session-rail", () => renderSessionRailPanel(documentRef, state, text))
    );
    syncPanel(
      persistentShell,
      persistentShell.workspace,
      createPanelLifecycle("workbench-stage", () =>
        renderWorkbenchStagePanel(documentRef, state, text)
      )
    );
    syncPanel(
      persistentShell,
      persistentShell.workspace,
      createPanelLifecycle("tactical-feed", () => renderTacticalFeedPanel(documentRef, state, text))
    );

    persistentShell.rightStack.hidden = !isPanelVisible("knowledge-pack");
    if (!persistentShell.workspace.contains(persistentShell.rightStack)) {
      persistentShell.workspace.append(persistentShell.rightStack);
    }
    syncPanel(
      persistentShell,
      persistentShell.rightStack,
      createPanelLifecycle("knowledge-pack", () =>
        renderKnowledgePackPanel(documentRef, state, text)
      )
    );

    if (!persistentShell.workspace.contains(persistentShell.bottomCluster)) {
      persistentShell.workspace.append(persistentShell.bottomCluster);
    }
    syncPanel(
      persistentShell,
      persistentShell.bottomClusterBody,
      createPanelLifecycle("visual-timeline", () =>
        renderVisualTimelinePanel(documentRef, state, meta, text)
      )
    );

    syncBottomCluster(persistentShell);
    syncLayoutResizersSoon(persistentShell);

    syncSettingsOverlay(persistentShell.settingsOverlay, persistentShell.settingsOverlayBody);
    applyLiveSnapshotUpdates();
    void overlayRuntime.syncOverlay(persistentShell.root);
  }

  // -- Action binding
  function bindActions(root: HTMLElement): void {
    if (root.dataset["actionsBound"] === "true") return;
    root.dataset["actionsBound"] = "true";

    function findActionElement(target: EventTarget | null): HTMLElement | null {
      return target instanceof Element ? target.closest<HTMLElement>("[data-repair-action]") : null;
    }

    function readAiTargetSlot(value: unknown): RepairAiTargetSlot | null {
      return value === "ai0" || value === "ai1" || value === "ai2" ? value : null;
    }

    root.addEventListener("pointerdown", (event) => {
      const resizer = findLayoutResizerElement(event.target);
      if (resizer !== null) startLayoutResize(event, resizer);
    });
    root.addEventListener("pointermove", handleLayoutResizePointerMove, true);
    root.addEventListener("pointerup", finishLayoutResize, true);
    root.addEventListener("pointercancel", finishLayoutResize, true);
    window.addEventListener("pointermove", handleLayoutResizePointerMove, true);
    window.addEventListener("pointerup", finishLayoutResize, true);
    window.addEventListener("pointercancel", finishLayoutResize, true);

    root.addEventListener("click", (event) => {
      const el = findActionElement(event.target);
      if (el === null) return;
      const action = el.dataset["repairAction"];
      if (action === undefined) return;
      if (isSessionLockedActionElement(el)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (
        [
          "activate-session",
          "set-tool",
          "jump-to-event",
          "knowledge-spatial-focus",
          "knowledge-spatial-promote",
          "timeline-page",
          "timeline-clean-snapshot",
          "timeline-zoom",
          "timeline-range",
          "timeline-play",
          "timeline-pause",
          "timeline-live",
          "timeline-speed",
        ].includes(action)
      ) {
        cancelSpatialFocusTween();
      }
      switch (action) {
        case "room-close":
          windowRef.roomAPI?.close?.();
          break;
        case "toggle-theme":
          setRepairTheme(repairTheme === "dark" ? "light" : "dark");
          break;
        case "activate-session": {
          const sessionId = el.dataset["sessionId"];
          if (sessionId) requestRuntime.activateSession({ sessionId });
          break;
        }
        case "delete-session": {
          const sessionId = el.dataset["sessionId"];
          if (!sessionId) break;
          const sessionTitle = el.dataset["sessionTitle"] ?? "this session";
          const confirmed = window.confirm(
            `Delete saved repair session "${sessionTitle}" and all stored data?`
          );
          if (confirmed) requestRuntime.deleteSession({ sessionId });
          break;
        }
        case "set-tool": {
          const tool = el.dataset["tool"];
          if (tool) requestRuntime.setActiveTool({ tool });
          break;
        }
        case "toggle-measurement-overlay": {
          if (!hasActiveRepairSession()) break;
          measurementOverlayOpen = !measurementOverlayOpen;
          render();
          break;
        }
        case "close-measurement-overlay": {
          measurementOverlayOpen = false;
          render();
          break;
        }
        case "set-operational-profile": {
          const profile = el.dataset["profile"];
          if (profile === "novice" || profile === "advanced") {
            requestRuntime.setOperationalProfile({ profile });
          }
          break;
        }
        case "set-voice-guidance": {
          const ambientListeningState = el.dataset["ambientListeningState"];
          const spokenGuidanceMode = el.dataset["spokenGuidanceMode"];
          const handsBusyMode = el.dataset["handsBusyMode"];
          requestRuntime.setVoiceGuidance({
            ...(ambientListeningState === "idle" ||
            ambientListeningState === "listening" ||
            ambientListeningState === "muted"
              ? { ambientListeningState }
              : {}),
            ...(spokenGuidanceMode === "silent" ||
            spokenGuidanceMode === "brief" ||
            spokenGuidanceMode === "step-by-step"
              ? { spokenGuidanceMode }
              : {}),
            ...(handsBusyMode === undefined ? {} : { handsBusyMode: handsBusyMode === "true" }),
          });
          break;
        }
        case "set-hands-free-mode": {
          const enabled = el.dataset["enabled"] === "true";
          requestRuntime.setVoiceGuidance({
            handsBusyMode: enabled,
            ambientListeningState: enabled ? "listening" : "idle",
            spokenGuidanceMode: enabled
              ? "step-by-step"
              : state.layout.voiceGuidance.spokenGuidanceMode,
          });
          if (enabled) {
            requestRuntime.startAmbientListener();
          } else {
            requestRuntime.stopAmbientListener();
          }
          break;
        }
        case "toggle-ambient-listener": {
          const active = el.dataset["active"] === "true";
          requestRuntime.setVoiceGuidance({
            ambientListeningState: active ? "idle" : "listening",
            spokenGuidanceMode: state.layout.voiceGuidance.spokenGuidanceMode,
            handsBusyMode: state.layout.voiceGuidance.handsBusyMode,
          });
          if (active) {
            requestRuntime.stopAmbientListener();
          } else {
            requestRuntime.startAmbientListener();
          }
          break;
        }
        case "toggle-dictation": {
          if (el.dataset["active"] === "true") {
            requestRuntime.stopDictation();
          } else {
            requestRuntime.startDictation();
          }
          break;
        }
        case "toggle-camera-feed": {
          if (el.dataset["active"] === "true") {
            requestRuntime.stopCameraFeed();
          } else {
            requestRuntime.setInteractionSettings({ cameraFeedPreference: "android-feed" });
            requestRuntime.startCameraFeed();
          }
          break;
        }
        case "capture-photo": {
          requestRuntime.capturePhoto();
          break;
        }
        case "toggle-camera-torch": {
          requestRuntime.setCameraTorch({ enabled: el.dataset["active"] !== "true" });
          break;
        }
        case "toggle-tts": {
          if (el.dataset["active"] === "true") {
            requestRuntime.stopSpeech();
          } else {
            requestRuntime.speakGuidance();
          }
          break;
        }
        case "set-interaction-settings": {
          const dictationRoute = el.dataset["dictationRoute"];
          const ttsRoute = el.dataset["ttsRoute"];
          const cameraFeedPreference = el.dataset["cameraFeedPreference"];
          const dictationSubmitMode = el.dataset["dictationSubmitMode"];
          const androidCompanionEnabled = el.dataset["androidCompanionEnabled"];
          const autoReadAiReplies = el.dataset["autoReadAiReplies"];
          requestRuntime.setInteractionSettings({
            ...(androidCompanionEnabled === undefined
              ? {}
              : { androidCompanionEnabled: androidCompanionEnabled === "true" }),
            ...(dictationRoute === "local" || dictationRoute === "android"
              ? { dictationRoute }
              : {}),
            ...(ttsRoute === "local" || ttsRoute === "android" ? { ttsRoute } : {}),
            ...(cameraFeedPreference === "manual" || cameraFeedPreference === "android-feed"
              ? { cameraFeedPreference }
              : {}),
            ...(dictationSubmitMode === "composer" || dictationSubmitMode === "send"
              ? { dictationSubmitMode }
              : {}),
            ...(autoReadAiReplies === undefined
              ? {}
              : { autoReadAiReplies: autoReadAiReplies === "true" }),
          });
          break;
        }
        case "set-settings-overlay": {
          const open = el.dataset["open"];
          const tabId = el.dataset["tabId"];
          requestRuntime.setSettingsOverlay({
            ...(open === undefined ? {} : { open: open === "true" }),
            ...(tabId === "repair-controls" || tabId === "bench-operator" ? { tabId } : {}),
          });
          break;
        }
        case "set-attention-budget": {
          const maxAiInterruptions = Number(el.dataset["maxAiInterruptions"]);
          const windowMs = Number(el.dataset["windowMs"]);
          requestRuntime.setAttentionBudget({
            ...(Number.isFinite(maxAiInterruptions) ? { maxAiInterruptions } : {}),
            ...(Number.isFinite(windowMs) ? { windowMs } : {}),
          });
          break;
        }
        case "toggle-overlay-layer": {
          const layerId = el.dataset["layerId"];
          const visible = el.dataset["visible"] === "true";
          if (layerId) requestRuntime.toggleOverlayLayer({ layerId, visible });
          break;
        }
        case "toggle-investigation-mode":
          requestRuntime.toggleInvestigationMode({
            enabled: !state.workbench.investigationModeEnabled,
          });
          break;
        case "jump-to-event": {
          const eventId = el.dataset["eventId"];
          if (eventId) requestRuntime.jumpToEvent({ eventId });
          break;
        }
        case "timeline-page": {
          const direction = el.dataset["direction"];
          if (direction === "previous" || direction === "next" || direction === "latest") {
            visualTimelineDom.setTimelinePage(direction);
          }
          break;
        }
        case "timeline-clean-snapshot": {
          requestRuntime.addTimelineEvent({
            kind: "snapshot",
            caption: "Clean repair moment snapshot captured.",
          });
          break;
        }
        case "attach-knowledge-pack": {
          const packId = el.dataset["packId"];
          if (packId) requestRuntime.attachKnowledgePack({ packId });
          break;
        }
        case "knowledge-pack-tab": {
          const previewTabId = el.dataset["tabId"];
          if (previewTabId) requestRuntime.updatePanelTab({ previewTabId });
          break;
        }
        case "knowledge-spatial-focus": {
          const spatialRefId = el.dataset["spatialRefId"];
          if (spatialRefId) requestRuntime.focusKnowledgeSpatialRef({ spatialRefId });
          break;
        }
        case "knowledge-spatial-promote": {
          const spatialRefId = el.dataset["spatialRefId"];
          if (spatialRefId) requestRuntime.promoteKnowledgeRegion({ spatialRefId });
          break;
        }
        case "ai-mark-state": {
          const eventId = el.dataset["eventId"];
          const aiState = el.dataset["aiState"];
          if (eventId && aiState) {
            requestRuntime.dismissAiMark({
              eventId,
              state: aiState,
              reason: `Repair observation marked ${aiState}.`,
            });
          }
          break;
        }
        case "add-manual-measurement": {
          if (!hasActiveRepairSession()) break;
          const payload = collectManualMeasurementPayload(root, state);
          if (payload !== null) {
            const accepted = requestRuntime.addMeasurement(payload);
            clearManualMeasurementDraft(root);
            if (accepted) measurementOverlayOpen = false;
            render();
          }
          break;
        }
        case "set-instrument": {
          if (!hasActiveRepairSession()) break;
          const instrumentKind = el.dataset["instrumentKind"];
          if (instrumentKind) requestRuntime.updatePanelTab({ instrumentKind });
          break;
        }
        case "operator-profile-tab": {
          const operatorProfileTabId = el.dataset["tabId"];
          if (operatorProfileTabId) requestRuntime.updatePanelTab({ operatorProfileTabId });
          break;
        }
        case "operator-profile-update": {
          const profileKind = el.dataset["profileKind"];
          if (profileKind === "tool") {
            const id = el.dataset["toolId"];
            if (id) {
              requestRuntime.updateOperatorProfile({
                tools: [
                  {
                    id,
                    ...(el.dataset["remove"] === "true" ? { remove: true } : {}),
                    ...(el.dataset["available"] === undefined
                      ? {}
                      : { available: el.dataset["available"] === "true" }),
                  },
                ],
              });
            }
          }
          if (profileKind === "skill") {
            const id = el.dataset["skillId"];
            const proficiency = Number(el.dataset["proficiency"]);
            if (id) {
              requestRuntime.updateOperatorProfile({
                skills: [
                  {
                    id,
                    ...(el.dataset["remove"] === "true" ? { remove: true } : {}),
                    ...(Number.isFinite(proficiency) ? { proficiency } : {}),
                  },
                ],
              });
            }
          }
          if (profileKind === "preference") {
            const key = el.dataset["preferenceKey"];
            const rawValue = el.dataset["preferenceValue"];
            if (key && rawValue !== undefined) {
              requestRuntime.updateOperatorProfile({
                preferences: {
                  [key]: key === "annotationDefaultStrokeWidth" ? Number(rawValue) : rawValue,
                },
              });
            }
          }
          break;
        }
        case "operator-profile-add-tool": {
          const labelInput = root.querySelector<HTMLInputElement>(
            "[data-repair-input='operator-tool-label']"
          );
          const categoryInput = root.querySelector<HTMLSelectElement>(
            "[data-repair-input='operator-tool-category']"
          );
          const modelInput = root.querySelector<HTMLInputElement>(
            "[data-repair-input='operator-tool-model']"
          );
          const label = labelInput?.value.trim() ?? "";
          if (label === "") break;
          requestRuntime.updateOperatorProfile({
            tools: [
              {
                id: createRepairOperatorProfileId(label),
                label,
                category: categoryInput?.value ?? "measurement",
                model: modelInput?.value.trim() || null,
                notes: null,
                available: true,
                capabilities: [],
              },
            ],
          });
          if (labelInput) labelInput.value = "";
          if (modelInput) modelInput.value = "";
          break;
        }
        case "operator-profile-add-skill": {
          const labelInput = root.querySelector<HTMLInputElement>(
            "[data-repair-input='operator-skill-label']"
          );
          const proficiencyInput = root.querySelector<HTMLSelectElement>(
            "[data-repair-input='operator-skill-proficiency']"
          );
          const label = labelInput?.value.trim() ?? "";
          if (label === "") break;
          requestRuntime.updateOperatorProfile({
            skills: [
              {
                id: createRepairOperatorProfileId(label),
                label,
                proficiency: normalizeRepairSkillLevel(Number(proficiencyInput?.value ?? 3)),
              },
            ],
          });
          if (labelInput) labelInput.value = "";
          break;
        }
        case "toggle-panel-collapse": {
          const panelId = el.dataset["panelId"];
          const collapsed = el.dataset["collapsed"] === "true";
          if (panelId) requestRuntime.updatePanelLayout({ panelId, collapsed });
          break;
        }
        case "toggle-panel-chip": {
          const panelId = el.dataset["panelId"] as RepairPanelId | undefined;
          if (panelId && isRepairChipControlledPanel(panelId)) {
            requestRuntime.updatePanelLayout({ panelId, collapsed: isPanelVisible(panelId) });
          }
          break;
        }
        case "toggle-bottom-cluster": {
          const collapse = isPanelVisible("visual-timeline");
          REPAIR_BOTTOM_PANEL_CHIPS.forEach((chip) => {
            requestRuntime.updatePanelLayout({ panelId: chip.panelId, collapsed: collapse });
          });
          break;
        }
        case "toggle-say-column": {
          // Pure DOM toggle — no state round-trip needed
          const strip = root.querySelector<HTMLElement>(".repair-guidance-strip");
          if (strip) {
            const current = strip.dataset["showSay"] === "true";
            strip.dataset["showSay"] = String(!current);
          }
          break;
        }
        case "send-chat": {
          if (!hasActiveRepairSession()) break;
          const input = root.querySelector<HTMLInputElement>("[data-repair-input='feed-composer']");
          if (input && input.value.trim() !== "") {
            requestRuntime.sendChatTurn({ text: input.value.trim() });
            requestRuntime.setChatComposer({ draft: "" });
            input.value = "";
          }
          break;
        }
        case "clear-chat-composer": {
          dictationComposer.setChatComposerDraft("");
          break;
        }
        case "wizard-symptom": {
          const symptom = el.dataset["symptom"];
          if (!symptom) return;
          const primarySymptoms = new Set(state.wizard.draft.primarySymptoms);
          const customSymptoms = new Set(state.wizard.draft.customSymptoms);
          const isSelected = primarySymptoms.has(symptom) || customSymptoms.has(symptom);
          if (isSelected) {
            primarySymptoms.delete(symptom);
            customSymptoms.delete(symptom);
          } else {
            primarySymptoms.add(symptom);
          }
          requestRuntime.updateSession({
            wizardDraft: {
              primarySymptoms: Array.from(primarySymptoms),
              customSymptoms: Array.from(customSymptoms),
            },
          });
          break;
        }
        case "wizard-suggestion": {
          const field = el.dataset["wizardField"];
          const value = el.dataset["value"];
          if (field === undefined || value === undefined) break;
          const wrapper = el.closest(".repair-wizard-field");
          const input = wrapper?.querySelector<HTMLInputElement>(
            `[data-repair-action='wizard-field'][data-wizard-field='${field}']`
          );
          if (input !== undefined && input !== null) {
            input.value = value;
          }
          updateWizardField(root, field, value);
          el.blur();
          break;
        }
        case "add-custom-symptom": {
          const input = root.querySelector<HTMLInputElement>(
            "[data-repair-input='wizard-custom-symptom']"
          );
          const symptom = input?.value.trim() ?? "";
          if (symptom === "") break;
          const primarySymptoms = Array.from(
            new Set([...state.wizard.draft.primarySymptoms, symptom])
          );
          const customSymptoms = Array.from(
            new Set([...state.wizard.draft.customSymptoms, symptom])
          );
          requestRuntime.updateSession({
            wizardDraft: {
              primarySymptoms,
              customSymptoms,
            },
          });
          if (input) input.value = "";
          break;
        }
        case "remove-wizard-symptom": {
          const symptom = el.dataset["symptom"];
          if (!symptom) break;
          requestRuntime.updateSession({
            wizardDraft: {
              primarySymptoms: state.wizard.draft.primarySymptoms.filter(
                (item) => item !== symptom
              ),
              customSymptoms: state.wizard.draft.customSymptoms.filter((item) => item !== symptom),
            },
          });
          break;
        }
        case "start-wizard-research": {
          flushWizardFields(root);
          const select = root.querySelector<HTMLSelectElement>(
            "[data-repair-action='set-ai-target-slot']"
          );
          const targetSlot = readAiTargetSlot(select?.value);
          requestRuntime.startKnowledgeResearch(targetSlot === null ? {} : { targetSlot });
          break;
        }
        case "skip-wizard-research": {
          flushWizardFields(root);
          requestRuntime.skipKnowledgeResearch();
          break;
        }
        case "advance-wizard": {
          flushWizardFields(root);
          const step = el.dataset["step"];
          requestRuntime.advanceWizard(step ? { step } : undefined);
          break;
        }
        case "create-session":
          flushWizardFields(root);
          requestRuntime.createSession();
          break;
        case "open-evidence-source": {
          const sourceUrl = el.dataset["sourceUrl"];
          if (sourceUrl !== undefined) void openEvidenceSource(sourceUrl);
          break;
        }
        case "pick-manual-resource-file": {
          const resourceKind = el.dataset["resourceKind"];
          if (resourceKind !== undefined) void pickManualResourceFile(root, resourceKind);
          break;
        }
        case "add-manual-knowledge-resource": {
          const resourceKind = el.dataset["resourceKind"] ?? "schematic";
          const resourceLabel = getManualEvidenceValue(root, "manual-resource-label", resourceKind);
          const resourceUrl = getManualEvidenceValue(root, "manual-resource-url", resourceKind);
          if (resourceLabel === "" || resourceUrl === "") break;
          requestRuntime.addKnowledgeResource({
            kind: resourceKind,
            label: resourceLabel,
            url: resourceUrl,
          });
          clearManualEvidenceValues(
            root,
            ["manual-resource-label", "manual-resource-url"],
            resourceKind
          );
          break;
        }
        case "add-manual-knowledge-failure": {
          const label = getManualEvidenceValue(root, "manual-failure-label");
          if (label === "") break;
          const affectedPart = getManualEvidenceValue(root, "manual-failure-part");
          const recommendedAction = getManualEvidenceValue(root, "manual-failure-action");
          const rationale = getManualEvidenceValue(root, "manual-failure-rationale");
          requestRuntime.addKnowledgeFailure({
            label,
            ...(affectedPart === "" ? {} : { affectedPart }),
            ...(recommendedAction === "" ? {} : { recommendedAction }),
            ...(rationale === "" ? {} : { rationale }),
          });
          clearManualEvidenceValues(root, [
            "manual-failure-label",
            "manual-failure-part",
            "manual-failure-action",
            "manual-failure-rationale",
          ]);
          break;
        }
        case "add-manual-knowledge-test-point": {
          const label = getManualEvidenceValue(root, "manual-test-label");
          const rail = getManualEvidenceValue(root, "manual-test-rail");
          if (label === "" || rail === "") break;
          const expectedValue = getManualEvidenceValue(root, "manual-test-expected");
          const unit = getManualEvidenceValue(root, "manual-test-unit");
          const tolerance = getManualEvidenceValue(root, "manual-test-tolerance");
          requestRuntime.addKnowledgeTestPoint({
            label,
            rail,
            ...(expectedValue === "" ? {} : { expectedValue }),
            ...(unit === "" ? {} : { unit }),
            ...(tolerance === "" ? {} : { tolerance }),
          });
          clearManualEvidenceValues(root, [
            "manual-test-label",
            "manual-test-rail",
            "manual-test-expected",
            "manual-test-unit",
            "manual-test-tolerance",
          ]);
          break;
        }
        case "add-manual-knowledge-note": {
          const note = getManualEvidenceValue(root, "manual-note-text");
          if (note === "") break;
          const source = getManualEvidenceValue(root, "manual-note-source");
          requestRuntime.addKnowledgeNote({ text: note, ...(source === "" ? {} : { source }) });
          clearManualEvidenceValues(root, ["manual-note-text", "manual-note-source"]);
          break;
        }
        case "remove-knowledge-evidence": {
          const kind = el.dataset["evidenceKind"];
          const id = el.dataset["evidenceId"];
          if (kind !== undefined && id !== undefined) {
            requestRuntime.removeKnowledgeEvidence({ kind, id });
          }
          break;
        }
        case "timeline-zoom": {
          const direction = el.dataset["direction"] === "out" ? -1 : 1;
          requestRuntime.updateTimeline({
            timelineZoom: Math.min(
              4,
              Math.max(0.25, state.workbench.timeline.zoom + direction * 0.25)
            ),
          });
          break;
        }
        case "timeline-range": {
          const playhead = state.workbench.timeline.playheadMs;
          requestRuntime.updateTimeline({
            timelineRangeStartMs: Math.max(0, playhead - 15000),
            timelineRangeEndMs: playhead + 15000,
          });
          break;
        }
        case "timeline-play":
          requestRuntime.updateTimeline({ replayAction: "play" });
          break;
        case "timeline-pause":
          requestRuntime.updateTimeline({ replayAction: "pause" });
          break;
        case "timeline-live":
          requestRuntime.focusLiveEdge();
          break;
        case "timeline-speed": {
          const nextSpeed =
            state.workbench.timeline.replaySpeed >= 4
              ? 0.5
              : state.workbench.timeline.replaySpeed * 2;
          requestRuntime.updateTimeline({ replaySpeed: nextSpeed });
          break;
        }
      }
    });

    root.addEventListener("pointerover", (event) => {
      visualTimelineDom.hydrateTimelineDetailImage(event.target);
    });

    root.addEventListener("focusin", (event) => {
      visualTimelineDom.hydrateTimelineDetailImage(event.target);
    });

    root.addEventListener("input", (event) => {
      const el = findActionElement(event.target);
      if (el === null || isSessionLockedActionElement(el)) return;
      if (el.dataset["repairAction"] === "timeline-scrub" && el instanceof HTMLInputElement) {
        cancelSpatialFocusTween();
        requestRuntime.scrubTimeline({ positionMs: Number(el.value) });
      }
      if (
        el.dataset["repairAction"] === "wizard-field" &&
        (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
      ) {
        const field = el.dataset["wizardField"];
        if (field) updateWizardField(root, field, el.value);
      }
    });

    root.addEventListener("change", (event) => {
      const el = findActionElement(event.target);
      if (
        !(
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          el instanceof HTMLSelectElement
        ) ||
        isSessionLockedActionElement(el)
      ) {
        return;
      }
      if (el.dataset["repairAction"] === "wizard-field" && el instanceof HTMLSelectElement) {
        const field = el.dataset["wizardField"];
        if (field) updateWizardField(root, field, el.value);
      }
      if (el.dataset["repairAction"] === "evidence-selection") {
        requestRuntime.updateEvidenceSelection(collectEvidenceSelection(root));
      }
      if (el.dataset["repairAction"] === "set-ai-target-slot") {
        const targetSlot = readAiTargetSlot(el.value);
        if (targetSlot !== null) {
          state.aiDispatch.targetSlot = targetSlot;
          requestRuntime.setAiTargetSlot({ targetSlot });
        }
      }
      if (el.dataset["repairAction"] === "operator-profile-field") {
        const profileKind = el.dataset["profileKind"];
        const field = el.dataset["field"];
        if (profileKind === "tool") {
          const id = el.dataset["toolId"];
          if (id && field) {
            requestRuntime.updateOperatorProfile({ tools: [{ id, [field]: el.value }] });
          }
        }
        if (profileKind === "skill") {
          const id = el.dataset["skillId"];
          if (id && field) {
            requestRuntime.updateOperatorProfile({ skills: [{ id, [field]: el.value }] });
          }
        }
        if (profileKind === "preference") {
          const key = el.dataset["preferenceKey"];
          if (key) requestRuntime.updateOperatorProfile({ preferences: { [key]: el.value } });
        }
      }
    });
  }

  function getWorkbenchViewportMode(): string {
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

  // -- Host message handler
  function handleHostMessage(message: unknown): void {
    const msg = normalizeRepairHostMessage(message);
    if (msg === null) return;

    switch (msg.type) {
      case "host-context": {
        const localeChanged = context.locale !== msg.locale;
        const translationsChanged = context.translations !== msg.translations;
        context.locale = msg.locale;
        context.translations = msg.translations;
        if (localeChanged || translationsChanged) {
          translationRevision += 1;
          shell?.panelElements.forEach((element) => {
            element.remove();
          });
          shell?.panelElements.clear();
          shell?.panelSignatures.clear();
        }
        documentRef.documentElement.lang = context.locale;
        render();
        break;
      }
      case "repair-state": {
        const nextMeta: RepairUiSnapshotMeta = msg.meta;
        const activeLayoutPanelSizes = layoutResizeDrag === null ? null : ensureRepairPanelSizes();
        Object.assign(state, msg.snapshot);
        if (activeLayoutPanelSizes !== null) state.layout.panelSizes = activeLayoutPanelSizes;
        meta.schemaVersion = nextMeta.schemaVersion;
        meta.generatedAt = nextMeta.generatedAt;
        meta.events = nextMeta.events;
        meta.replay = nextMeta.replay;
        render();
        syncSpatialFocusTween();
        applyLiveSnapshotUpdates();
        break;
      }
      case "repair-feed-event": {
        if (meta.events.some((event) => event.id === msg.event.id) === false) {
          meta.events = [...meta.events, msg.event];
        }
        const session = state.sessions.detail;
        if (
          session !== null &&
          session.events.some((event) => event.id === msg.event.id) === false
        ) {
          session.events = [...session.events, msg.event];
        }
        state.tacticalFeed.push({
          eventId: msg.event.id,
          occurredAt: msg.event.occurredAt,
          relativeLabel: "",
          severity: msg.event.severity,
          badge: msg.event.severity.toUpperCase(),
          body: msg.event.rationale,
        });
        render();
        break;
      }
      case "repair-chat-reply": {
        state.chat.turns.push({
          id: msg.turnId,
          role: "ai",
          text: msg.text,
          occurredAt: msg.occurredAt,
          contextRefs: msg.contextRefs,
        });
        state.chat.pendingReplyId = null;
        render();
        break;
      }
      case "repair-measurement-reading": {
        const mode = readRepairMultimeterMode(msg.reading.mode);
        const label = msg.reading.reference ?? msg.reading.channel;
        state.measurement.recent = [
          {
            id: msg.reading.id,
            occurredAt: msg.reading.occurredAt,
            mode,
            range: msg.reading.range,
            channel: msg.reading.channel,
            rawDisplay: msg.reading.rawDisplay,
            value: msg.reading.value,
            unit: msg.reading.unit,
            reference: msg.reading.reference,
          },
          ...state.measurement.recent,
        ].slice(0, 32);
        state.measurement.current.display = msg.reading.rawDisplay;
        state.measurement.current.value = msg.reading.value;
        state.measurement.current.unit = msg.reading.unit;
        state.measurement.current.range = msg.reading.range;
        state.measurement.current.mode = mode;
        state.measurement.current.label = label;
        render();
        break;
      }
      case "repair-research-progress": {
        state.wizard.researchProgress = state.wizard.researchProgress.map((item) =>
          item.step === msg.step ? { ...item, completed: msg.completed } : item
        );
        render();
        break;
      }
      case "capture-feed-status": {
        captureStatusHandlers.handleCaptureFeedStatus(msg);
        break;
      }

      case "capture-dictation-status": {
        captureStatusHandlers.handleCaptureDictationStatus(msg);
        break;
      }

      case "capture-ambient-status": {
        captureStatusHandlers.handleCaptureAmbientStatus(msg);
        break;
      }

      case "tts-status": {
        captureStatusHandlers.handleTtsStatus(msg);
        break;
      }

      case "capture-media-ingress": {
        captureStatusHandlers.handleCaptureMediaIngress(msg);
        break;
      }

      case "command-result": {
        render();
        break;
      }

      case "transcript-ingress": {
        dictationComposer.handleTranscriptIngress(msg);
        break;
      }
    }
  }

  // -- Ambient clock tick
  function startClock(): void {
    if (clockInterval !== null) return;
    clockInterval = setInterval(() => {
      state.ambient.nowIso = new Date().toISOString();
      const clock = documentRef.querySelector<HTMLElement>(".repair-statusbar__clock");
      if (clock !== null) {
        setTextIfChanged(
          clock,
          new Date(state.ambient.nowIso).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        );
      }
    }, 1000);
  }

  function handleViewportResize(): void {
    visualTimelineDom.refreshTimelinePageSize();
    if (shell !== null) {
      syncWorkspaceGridSizing(shell);
      syncLayoutResizersSoon(shell);
    }
  }

  // -- Start
  function start(): void {
    if (windowRef.roomAPI && typeof windowRef.roomAPI.onHostMessage === "function") {
      windowRef.roomAPI.onHostMessage(handleHostMessage);
    }

    documentRef.documentElement.lang = context.locale;
    applyRepairTheme(repairTheme);
    documentRef.addEventListener("keydown", keyboardController.handleKeydown);
    window.addEventListener("resize", handleViewportResize);
    startClock();
    render();
    visualTimelineDom.refreshTimelinePageSize();
    requestRuntime.notifyUiReady();

    if (windowRef.roomAPI && typeof windowRef.roomAPI.ready === "function") {
      windowRef.roomAPI.ready({
        room: REPAIR_ROOM_ID,
        feature: "repair-workbench",
        stage: "ui-ready",
      });
    }
  }

  return { start };
}
