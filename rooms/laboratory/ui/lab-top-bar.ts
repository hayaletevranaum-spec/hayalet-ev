import { asLabRecord, asNonEmptyString, escapeHtml } from "../domain/lab-types.js";
import type { LabDrawerMode, LabStoreState } from "../domain/lab-types.js";
import {
  getDrawerCollapsed,
  getHypothesis,
  getSourceProbeStatus,
  getSourceReady,
  getWorkspaceLockState,
  isLabWorkspaceSurfaceReady,
  resolveDrawerMode,
} from "../runtime/lab-selectors.js";
import { LAB_FALLBACK_I18N } from "./lab-i18n.js";
import type { LabI18n } from "./lab-i18n.js";

const ICON_SETTINGS = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
const ICON_CLOSE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`;
const ICON_PANEL_LEFT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`;
const ICON_PANEL_RIGHT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`;
const ICON_RAIL_SOURCE = `<svg class="labx-topbar-pill__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><polyline points="14 2 14 8 20 8"/></svg>`;
const ICON_RAIL_ANALYZE = `<svg class="labx-topbar-pill__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`;
const ICON_RAIL_RESULTS = `<svg class="labx-topbar-pill__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
const ICON_SOURCE_PANEL = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`;
const ICON_SELECTION = `<svg class="labx-topbar-pill__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg>`;

function renderBrand(copy: LabI18n) {
  const brand = copy.t("mediaAnalysis.topBar.brand", "Laboratory");
  return `
    <div class="labx-top-bar__brand">
      <span class="labx-top-bar__brand-name">${escapeHtml(brand)}</span>
    </div>
  `;
}

function renderSourceMetaStrip(state: LabStoreState) {
  const source = asLabRecord(state.source);
  const storedFileName = asNonEmptyString(source["storedFileName"]);
  const metadata = asLabRecord(source["metadata"]);
  const width = metadata["width"];
  const height = metadata["height"];
  const duration = metadata["duration"];

  if (storedFileName === null && width === undefined && duration === undefined) {
    return `<div class="labx-top-bar__center labx-top-bar__center--empty" aria-hidden="true"></div>`;
  }

  const parts: string[] = [];
  if (storedFileName !== null) {
    parts.push(`<span class="labx-top-bar__meta-file">${escapeHtml(storedFileName)}</span>`);
  }
  if (typeof width === "number" && typeof height === "number" && width > 0 && height > 0) {
    parts.push(
      `<span class="labx-top-bar__meta-res">${String(width)}\u00D7${String(height)}</span>`
    );
  }
  if (typeof duration === "number" && duration > 0) {
    const mins = Math.floor(duration / 60);
    const secs = Math.floor(duration % 60);
    parts.push(
      `<span class="labx-top-bar__meta-dur">${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}</span>`
    );
  }

  if (parts.length === 0) {
    return `<div class="labx-top-bar__center labx-top-bar__center--empty" aria-hidden="true"></div>`;
  }

  return `<div class="labx-top-bar__center labx-top-bar__meta-strip">${parts.join('<span class="labx-top-bar__meta-sep" aria-hidden="true">\u00B7</span>')}</div>`;
}

function getPillState(
  pill: "selection" | "source" | "analyze" | "results",
  drawerMode: LabDrawerMode,
  selectionTabActive: boolean
): "active" | "inactive" {
  if (pill === "selection") {
    return selectionTabActive ? "active" : "inactive";
  }
  if (selectionTabActive) {
    return "inactive";
  }
  switch (pill) {
    case "source":
      return drawerMode === "setup" ? "active" : "inactive";
    case "analyze":
      return drawerMode === "running" ? "active" : "inactive";
    case "results":
      return drawerMode === "result" || drawerMode === "explore" ? "active" : "inactive";
    default:
      return "inactive";
  }
}

export function getSelectionTabActive(state: LabStoreState) {
  return (
    state.ui.workspace.selectionTabActive === true ||
    (isLabWorkspaceSurfaceReady(state) === true &&
      resolveDrawerMode(state) === "setup" &&
      getSourceProbeStatus(state) === "idle" &&
      getSourceReady(state) !== true)
  );
}

export function renderModePills(state: LabStoreState, copy: LabI18n) {
  const drawerMode = resolveDrawerMode(state);
  const selectionTabActive = getSelectionTabActive(state);
  const pills = [
    {
      id: "selection" as const,
      icon: ICON_SELECTION,
      label: copy.t("mediaAnalysis.topBar.selection", "Yardım"),
      action: "topbar-pill-selection",
    },
    {
      id: "source" as const,
      icon: ICON_RAIL_SOURCE,
      label: copy.t("mediaAnalysis.topBar.source", "Analiz"),
      action: "topbar-pill-source",
    },
    {
      id: "analyze" as const,
      icon: ICON_RAIL_ANALYZE,
      label: copy.t("mediaAnalysis.topBar.analyze", "İşlem"),
      action: "topbar-pill-analyze",
    },
    {
      id: "results" as const,
      icon: ICON_RAIL_RESULTS,
      label: copy.t("mediaAnalysis.topBar.results", "Sonuc"),
      action: "topbar-pill-results",
    },
  ];

  return `<div class="labx-rail-segment">${pills
    .map(function (pill) {
      const pillState = getPillState(pill.id, drawerMode, selectionTabActive);
      const pulsing = pill.id === "analyze" && drawerMode === "running";
      return `
        <button
          class="labx-topbar-pill"
          type="button"
          aria-label="${escapeHtml(pill.label)}"
          title="${escapeHtml(pill.label)}"
          data-lab-action="${escapeHtml(pill.action)}"
          data-pill-state="${pillState}"
          data-pill-pulsing="${pulsing ? "true" : "false"}"
        >
          ${pill.icon}
          <span class="labx-topbar-pill__dot" aria-hidden="true"></span>
          <span class="labx-topbar-pill__label">${escapeHtml(pill.label)}</span>
        </button>
      `;
    })
    .join("")}</div>`;
}

export function renderLabLeftRail(_state: LabStoreState, _copy: LabI18n = LAB_FALLBACK_I18N) {
  return "";
}

function renderHypothesisInput(state: LabStoreState, copy: LabI18n): string {
  const hypothesis = getHypothesis(state);
  const locked = getWorkspaceLockState(state).hypothesis;
  const placeholder = copy.t("mediaAnalysis.hypothesis.placeholder", "Hipotez...");
  return `
    <div class="labx-top-bar__hypothesis">
      <input
        class="labx-top-bar__hypothesis-input"
        type="text"
        data-lab-field="workspace.hypothesis"
        value="${escapeHtml(hypothesis)}"
        placeholder="${escapeHtml(placeholder)}"
        ${locked ? 'disabled aria-disabled="true"' : ""}
        aria-label="${escapeHtml(copy.t("mediaAnalysis.hypothesis.label", "Hipotez"))}"
      />
    </div>
  `;
}

export function renderLabTopBar(state: LabStoreState, copy: LabI18n = LAB_FALLBACK_I18N) {
  const drawerMode = resolveDrawerMode(state);
  const drawerCollapsed = getDrawerCollapsed(state);
  const sourcePanelCollapsed = state.ui.sourcePanelCollapsed === true;
  const drawerToggleLabel = drawerCollapsed
    ? copy.t("mediaAnalysis.topBar.drawerExpand", "Open panel")
    : copy.t("mediaAnalysis.topBar.drawerCollapse", "Close panel");
  const sourcePanelLabel = sourcePanelCollapsed
    ? copy.t("mediaAnalysis.topBar.sourcePanelExpand", "Show sources")
    : copy.t("mediaAnalysis.topBar.sourcePanelCollapse", "Hide sources");
  const closeLabel = copy.t("mediaAnalysis.topBar.closeRoom", "Ana sayfaya dön");

  return `
    <header class="labx-top-bar" data-lab-region="topbar" data-drawer-mode="${escapeHtml(drawerMode)}">
      <div class="labx-top-bar__left">
        ${renderBrand(copy)}
        <button
          class="labx-top-bar__tool-btn labx-top-bar__source-panel-toggle"
          type="button"
          data-lab-action="source-panel-toggle"
          title="${escapeHtml(sourcePanelLabel)}"
          aria-label="${escapeHtml(sourcePanelLabel)}"
          aria-pressed="${sourcePanelCollapsed ? "false" : "true"}"
          data-active="${sourcePanelCollapsed ? "false" : "true"}"
        >
          ${ICON_SOURCE_PANEL}
        </button>
      </div>
      <div class="labx-top-bar__center-group">
        ${renderHypothesisInput(state, copy)}
        ${renderSourceMetaStrip(state)}
      </div>
      <div class="labx-top-bar__right">
        <button
          class="labx-top-bar__tool-btn labx-top-bar__room-close"
          type="button"
          data-lab-action="room-close"
          title="${escapeHtml(closeLabel)}"
          aria-label="${escapeHtml(closeLabel)}"
        >
          ${ICON_CLOSE}
        </button>
        <button
          class="labx-top-bar__tool-btn"
          type="button"
          data-lab-action="toggle-tool-manager"
          title="${escapeHtml(copy.t("mediaAnalysis.topBar.toolMgmt", "Tool Management"))}"
          aria-label="${escapeHtml(copy.t("mediaAnalysis.topBar.toolMgmt", "Tool Management"))}"
        >
          ${ICON_SETTINGS}
        </button>
        <button
          class="labx-top-bar__tool-btn labx-top-bar__drawer-toggle"
          type="button"
          data-lab-action="drawer-collapsed-toggled"
          title="${escapeHtml(drawerToggleLabel)}"
          aria-label="${escapeHtml(drawerToggleLabel)}"
          aria-pressed="${drawerCollapsed ? "true" : "false"}"
        >
          ${drawerCollapsed ? ICON_PANEL_LEFT : ICON_PANEL_RIGHT}
        </button>
      </div>
    </header>
  `;
}
