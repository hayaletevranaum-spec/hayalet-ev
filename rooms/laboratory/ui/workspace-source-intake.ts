import { asNonEmptyString, escapeHtml } from "../domain/lab-types.js";
import type {
  LabInteractiveSettings,
  LabSourceRetryBlockReason,
  LabStoreState,
} from "../domain/lab-types.js";
import {
  getProjectSource,
  getSourceKind,
  getSourceMode,
  getWorkspaceLockState,
  isLoadedSourceMatchingMode,
} from "../runtime/lab-selectors.js";
import { getSourceKindOptions, getSourceModeOptions } from "../runtime/lab-source-presets.js";
import { renderStatusChip } from "./components/status-chip.js";
import { LAB_FALLBACK_I18N } from "./lab-i18n.js";
import type { LabI18n } from "./lab-i18n.js";
import { formatSourceRetryBlockReason } from "./lab-source-retry-copy.js";

function getSourceKindLabel(kind: string, copy: LabI18n = LAB_FALLBACK_I18N) {
  switch (kind) {
    case "audio":
      return copy.t("mediaAnalysis.source.kinds.audio", "Audio");
    case "image":
      return copy.t("mediaAnalysis.source.kinds.image", "Image");
    case "video":
      return copy.t("mediaAnalysis.source.kinds.video", "Video");
    default:
      return kind;
  }
}

function getSourceModeLabel(mode: string, copy: LabI18n = LAB_FALLBACK_I18N) {
  switch (mode) {
    case "url":
      return copy.t("mediaAnalysis.source.modes.url", "Direct URL");
    case "youtube":
      return copy.t("mediaAnalysis.source.modes.youtube", "YouTube");
    case "local":
      return copy.t("mediaAnalysis.source.modes.localCopy", "Local Copy");
    default:
      return mode;
  }
}

export function getEffectiveSourceMode(state: LabStoreState, kind: string) {
  const sourceMode = getSourceMode(state);
  const availableModes = getSourceModeOptions(state, kind);
  if (availableModes.includes(sourceMode)) {
    return sourceMode;
  }
  return availableModes[0] || "local";
}

function getLoadSourceActionLabel(
  mode: string,
  hasSource: boolean,
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  if (mode === "url") {
    return hasSource
      ? copy.t("mediaAnalysis.source.actions.replaceUrl", "Replace URL Source")
      : copy.t("mediaAnalysis.source.actions.downloadUrl", "Download URL Source");
  }
  return hasSource
    ? copy.t("mediaAnalysis.source.actions.replaceLocal", "Replace Local Source")
    : copy.t("mediaAnalysis.source.actions.pickLocal", "Copy Local Source");
}

function getLoadSourceDisabled(state: LabStoreState, mode: string) {
  const drafts = state.ui.sourceDrafts;
  if (mode === "url") {
    return drafts.urlInput.trim() === "";
  }
  return false;
}

function renderSourceActionPanel(
  state: LabStoreState,
  mode: string,
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  if (mode === "youtube") {
    return "";
  }
  const source = getProjectSource(state);
  const hasSource =
    asNonEmptyString(source["storedFileName"]) !== null ||
    asNonEmptyString(source["storedPath"]) !== null;
  const hasSourceForMode = hasSource && isLoadedSourceMatchingMode(source, mode);
  const sourceLocked = getWorkspaceLockState(state).source === true;
  const disabledAttr = sourceLocked || getLoadSourceDisabled(state, mode) ? "disabled" : "";
  const lockHint = sourceLocked
    ? copy.t("mediaAnalysis.source.lockedHint", "Source locked during analysis")
    : "";
  return `
    <div class="labx-source-intake__action">
      <button class="labx-inline-action labx-source-intake__action-button" type="button" data-lab-action="load-source" ${disabledAttr} ${lockHint ? `title="${escapeHtml(lockHint)}"` : ""}>
        ${escapeHtml(getLoadSourceActionLabel(mode, hasSourceForMode, copy))}
      </button>
      ${sourceLocked ? `<span class="labx-source-locked-hint">${escapeHtml(lockHint)}</span>` : ""}
    </div>
  `;
}

function buildSvgChannelFilter(settings: LabInteractiveSettings, filterId = "labx-ch-isolate") {
  const r = settings.channelR ? 1 : 0;
  const g = settings.channelG ? 1 : 0;
  const b = settings.channelB ? 1 : 0;
  const needsChannelFilter = !settings.channelR || !settings.channelG || !settings.channelB;
  if (!needsChannelFilter) {
    return "";
  }
  return `
    <svg class="labx-channel-filter" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        <filter id="${escapeHtml(filterId)}">
          <feColorMatrix type="matrix" values="${String(r)} 0 0 0 0  0 ${String(g)} 0 0 0  0 0 ${String(b)} 0 0  0 0 0 1 0"/>
        </filter>
      </defs>
    </svg>
  `;
}

export function buildPreviewFilterState(
  settings: LabInteractiveSettings,
  options: { filterId?: string } = {}
) {
  const filterId = options.filterId || "labx-ch-isolate";
  const filterParts: string[] = [];
  if (settings.brightness !== 100) {
    filterParts.push(`brightness(${String(settings.brightness / 100)})`);
  }
  if (settings.contrast !== 100) {
    filterParts.push(`contrast(${String(settings.contrast / 100)})`);
  }
  if (settings.gamma !== 1.0) {
    const gammaVal = Math.pow(settings.gamma, 0.45);
    filterParts.push(`brightness(${String(gammaVal.toFixed(2))})`);
  }
  if (settings.saturation !== 100) {
    filterParts.push(`saturate(${String(settings.saturation / 100)})`);
  }
  if (settings.hueRotate !== 0) {
    filterParts.push(`hue-rotate(${String(settings.hueRotate)}deg)`);
  }
  if (settings.sharpness !== 100) {
    const sharpVal = (settings.sharpness - 100) / 100;
    if (sharpVal > 0) {
      filterParts.push(`contrast(${String((1 + sharpVal * 0.3).toFixed(2))})`);
    } else if (sharpVal < 0) {
      filterParts.push(`blur(${String(Math.abs(sharpVal * 0.5).toFixed(2))}px)`);
    }
  }
  if (settings.invert) {
    filterParts.push("invert(1)");
  }
  if (!settings.channelR || !settings.channelG || !settings.channelB) {
    filterParts.push(`url(#${filterId})`);
  }
  if (settings.edgeHighlight) {
    filterParts.push("contrast(1.8)");
  }
  const svgFilter = buildSvgChannelFilter(settings, filterId);
  const filterCss = filterParts.length > 0 ? `filter: ${filterParts.join(" ")};` : "";
  return {
    svgFilter,
    filterCss,
  };
}

function renderVideoPreviewMedia(
  previewUrl: string,
  settings: LabInteractiveSettings,
  options: {
    controls?: boolean;
    muted?: boolean;
    preserveKey?: string;
    role?: string;
    className?: string;
    selectionRoiStage?: boolean;
  } = {}
) {
  const { svgFilter, filterCss } = buildPreviewFilterState(settings);
  const controls = options.controls === true ? "controls" : "";
  const muted = options.muted === true ? "muted" : "";
  const preserveKey = options.preserveKey || "workspace-preview";
  const roleAttr = options.role ? `data-lab-role="${escapeHtml(options.role)}"` : "";
  const className = options.className || "labx-preview-media--workspace-video";
  const selectionRoiStageAttr =
    options.selectionRoiStage === true
      ? `data-lab-selection-roi-stage="true" data-lab-selection-roi-controls-reserve="${controls ? "56" : "0"}"`
      : "";
  return `
    ${svgFilter}
    <div class="labx-preview-filter-wrap" style="${filterCss}" ${selectionRoiStageAttr}>
      <video class="labx-preview-media ${escapeHtml(className)}" data-lab-preserve-media="${escapeHtml(preserveKey)}" ${roleAttr} src="${escapeHtml(previewUrl)}" ${controls} ${muted} preload="metadata" playsinline></video>
    </div>
  `;
}

function renderAudioPreviewMedia(
  previewUrl: string,
  options: {
    controls?: boolean;
    preserveKey?: string;
    role?: string;
    className?: string;
  } = {}
) {
  const controls = options.controls === true ? "controls" : "";
  const preserveKey = options.preserveKey || "workspace-preview";
  const roleAttr = options.role ? `data-lab-role="${escapeHtml(options.role)}"` : "";
  const className = options.className || "labx-preview-media--audio";
  return `
    <audio class="labx-preview-media ${escapeHtml(className)}" data-lab-preserve-media="${escapeHtml(preserveKey)}" ${roleAttr} src="${escapeHtml(previewUrl)}" ${controls} preload="metadata" aria-hidden="${controls ? "false" : "true"}"></audio>
  `;
}

export function renderPreviewMedia(
  sourceKind: string,
  previewUrl: string | null,
  settings: LabInteractiveSettings,
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  if (previewUrl === null) {
    return `
      <div class="labx-empty-state labx-workspace-empty">
        <strong class="labx-empty-state__title">${escapeHtml(copy.t("mediaAnalysis.source.previewEmptyTitle", "Select a source to begin"))}</strong>
      </div>
    `;
  }

  if (sourceKind === "image") {
    const { svgFilter, filterCss } = buildPreviewFilterState(settings);
    return `
      ${svgFilter}
      <img class="labx-preview-media labx-preview-media--workspace-image" data-lab-preserve-media="workspace-preview" src="${escapeHtml(previewUrl)}" alt="${escapeHtml(copy.t("mediaAnalysis.source.workspacePreviewAlt", "Workspace preview"))}" style="${filterCss}" />
    `;
  }
  if (sourceKind === "audio") {
    return `
      <div class="labx-audio-visualizer">
        ${renderAudioPreviewMedia(previewUrl)}
      </div>
    `;
  }
  return renderVideoPreviewMedia(previewUrl, settings);
}

export function renderViewportStatePanel(
  viewportState: "empty" | "loading" | "error",
  retryBlockReason: LabSourceRetryBlockReason | null,
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  if (viewportState === "loading") {
    return `
      <div class="labx-empty-state labx-workspace-loading" data-media-viewport-state="loading">
        <div class="labx-viewport-skeleton" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <strong class="labx-empty-state__title">${escapeHtml(copy.t("mediaAnalysis.source.viewport.loadingTitle", "Source preparation in progress"))}</strong>
        <p>${escapeHtml(copy.t("mediaAnalysis.source.viewport.loadingBody", "The preview will unlock after the probe completes."))}</p>
      </div>
    `;
  }
  if (viewportState === "error") {
    const retryBlockMessage =
      retryBlockReason === null ? null : formatSourceRetryBlockReason(retryBlockReason, copy);
    return `
      <div class="labx-empty-state labx-workspace-error" data-media-viewport-state="error">
        <strong class="labx-empty-state__title">${escapeHtml(copy.t("mediaAnalysis.source.viewport.errorTitle", "Source preparation failed"))}</strong>
        <p>${escapeHtml(copy.t("mediaAnalysis.source.viewport.errorBody", "Check the source settings and retry the source probe."))}</p>
        <button
          class="labx-inline-action"
          type="button"
          data-lab-action="source-probe-retry"
          ${retryBlockReason !== null ? "disabled" : ""}
          ${retryBlockMessage !== null ? `title="${escapeHtml(retryBlockMessage)}"` : ""}
        >
          ${escapeHtml(copy.t("mediaAnalysis.source.viewport.retry", "Retry Source Probe"))}
        </button>
        ${retryBlockMessage !== null ? `<small>${escapeHtml(retryBlockMessage)}</small>` : ""}
      </div>
    `;
  }
  return `
    <div class="labx-empty-state labx-workspace-empty" data-media-viewport-state="empty">
      <strong class="labx-empty-state__title">${escapeHtml(copy.t("mediaAnalysis.source.previewEmptyTitle", "Select a source to begin"))}</strong>
    </div>
  `;
}

export function renderSourceIntake(state: LabStoreState, copy: LabI18n = LAB_FALLBACK_I18N) {
  const source = getProjectSource(state);
  const sourceKind = getSourceKind(state);
  const sourceMode = getEffectiveSourceMode(state, sourceKind);
  const sourceDrafts = state.ui.sourceDrafts;
  const kindOptions = getSourceKindOptions(state);
  const modeOptions = getSourceModeOptions(state, sourceKind);
  const sourceReadyForMode =
    asNonEmptyString(source["storedPath"]) !== null &&
    isLoadedSourceMatchingMode(source, sourceMode);
  const sourceLocked = getWorkspaceLockState(state).source;
  const sourceFieldDisabledAttr = sourceLocked ? 'disabled aria-disabled="true"' : "";
  const collapsed = state.ui.workspace.sourceIntakeCollapsed === true;
  const sourceSummaryLabel =
    asNonEmptyString(source["storedFileName"]) ||
    asNonEmptyString(source["routeLabel"]) ||
    copy.t("mediaAnalysis.source.currentSource", "current source");
  const secondaryRowContent =
    sourceMode === "url"
      ? `
        <section class="labx-source-intake__frame labx-source-intake__frame--mode">
            <div class="labx-source-intake__frame-head">
              <div>
              <strong>${escapeHtml(copy.t("mediaAnalysis.source.directUrl.title", "Direct URL Source"))}</strong>
              <p class="labx-panel-hint">${escapeHtml(copy.t("mediaAnalysis.source.directUrl.hint", "Paste a remote URL."))}</p>
            </div>
          </div>
          <div class="labx-source-intake__mode-grid">
            <label class="labx-field">
              <span>${escapeHtml(copy.t("mediaAnalysis.source.fields.urlInput", "Source URL"))}</span>
              <input class="labx-input" data-lab-field="source.urlInput" value="${escapeHtml(sourceDrafts.urlInput)}" placeholder="https://..." ${sourceFieldDisabledAttr} />
            </label>
          </div>
        </section>
      `
      : sourceMode === "local"
        ? `
          <section class="labx-source-intake__frame labx-source-intake__frame--mode">
            <div class="labx-source-intake__frame-head">
              <div>
                <strong>${escapeHtml(copy.t("mediaAnalysis.source.localCopy.title", "Local Source Copy"))}</strong>
              </div>
            </div>
          </section>
        `
        : "";

  return `
    <section
      class="labx-workspace-strip labx-source-intake"
      aria-label="${escapeHtml(copy.t("mediaAnalysis.source.intakeTitle", "Source intake"))}"
      data-collapsed="${collapsed ? "true" : "false"}"
    >
      <div class="labx-source-intake__header">
        <div class="labx-source-intake__header-copy">
          <span class="labx-card__eyebrow">${escapeHtml(copy.t("mediaAnalysis.source.intakeTitle", "Source Intake"))}</span>
          <strong class="labx-source-intake__title">${escapeHtml(copy.t("mediaAnalysis.source.intakeFrame.title", "Source setup controls"))}</strong>
          ${
            sourceReadyForMode
              ? `<p class="labx-panel-hint">${escapeHtml(copy.t("mediaAnalysis.source.intakeFrame.readyLabel", "Active"))}: ${escapeHtml(sourceSummaryLabel)}</p>`
              : ""
          }
        </div>
        <div class="labx-source-intake__header-meta">
          <div class="labx-source-intake__tags">
            ${renderStatusChip(getSourceKindLabel(sourceKind, copy), "neutral")}
            ${renderStatusChip(getSourceModeLabel(sourceMode, copy), sourceReadyForMode ? "success" : "neutral")}
            <span class="labx-source-intake__status" data-tone="${sourceReadyForMode ? "success" : "idle"}">
              ${escapeHtml(sourceReadyForMode ? copy.t("mediaAnalysis.source.intakeFrame.statusReady", "Source ready") : copy.t("mediaAnalysis.source.intakeFrame.statusPending", "Awaiting source"))}
            </span>
          </div>
          <button
            class="labx-inline-action"
            type="button"
            data-lab-action="workspace-toggle-source-intake"
          >
            ${escapeHtml(collapsed ? copy.t("mediaAnalysis.source.intakeFrame.showAction", "Show source setup") : copy.t("mediaAnalysis.source.intakeFrame.hideAction", "Hide source setup"))}
          </button>
        </div>
      </div>
      ${
        collapsed
          ? ""
          : `
            <div class="labx-source-intake__body">
              <section class="labx-source-intake__frame">
                <div class="labx-source-intake__frame-head">
                  <div>
                    <strong>${escapeHtml(copy.t("mediaAnalysis.source.importRoute", "Import Route"))}</strong>
                  </div>
                </div>
                <div class="labx-source-intake__top">
                  <label class="labx-field">
                    <span>${escapeHtml(copy.t("mediaAnalysis.source.formatLabel", "Source Type"))}</span>
                    <select class="labx-select" data-lab-field="source.kind" ${sourceFieldDisabledAttr}>
                      ${kindOptions
                        .map(function (entry) {
                          return `<option value="${escapeHtml(entry)}" ${
                            entry === sourceKind ? "selected" : ""
                          }>${escapeHtml(getSourceKindLabel(entry, copy))}</option>`;
                        })
                        .join("")}
                    </select>
                  </label>
                  <label class="labx-field">
                    <span>${escapeHtml(copy.t("mediaAnalysis.source.modeLabel", "Import Method"))}</span>
                    <select class="labx-select" data-lab-field="source.mode" ${sourceFieldDisabledAttr}>
                      ${modeOptions
                        .map(function (entry) {
                          return `<option value="${escapeHtml(entry)}" ${
                            entry === sourceMode ? "selected" : ""
                          }>${escapeHtml(getSourceModeLabel(entry, copy))}</option>`;
                        })
                        .join("")}
                    </select>
                  </label>
                  ${renderSourceActionPanel(state, sourceMode, copy)}
                </div>
              </section>
              ${secondaryRowContent}
            </div>
          `
      }
    </section>
  `;
}
