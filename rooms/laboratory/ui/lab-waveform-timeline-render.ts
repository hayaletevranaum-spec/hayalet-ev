import { escapeHtml } from "../domain/lab-types.js";
import { LAB_FALLBACK_I18N } from "./lab-i18n.js";
import type { LabI18n } from "./lab-i18n.js";
import type { LabWaveformTimelineModel } from "./lab-waveform-timeline-types.js";
import {
  formatDuration,
  formatTimePrecise,
  isOperationSuggestion,
  renderInterpretationPanel,
} from "./lab-waveform-timeline-panels.js";
import {
  INSPECTION_MODE_OPTIONS,
  formatInspectionMode,
  formatSelectionType,
  renderExecutionIntentStrip,
  renderInspectionSnapshot,
  renderInspectionToolHints,
  renderSelectionRegionTools,
  renderSelectionSuggestions,
  renderSuggestionPreview,
  renderWaveformInspectionLens,
  supportsInspectionMode,
} from "./timeline/timeline-selection.js";

function renderFineTuneButtons(prefix: string, msValue: number, locked = false) {
  const disabledAttr = locked ? 'disabled aria-disabled="true"' : "";
  return `
    <div class="labx-timeline__finetune">
      <button class="labx-timeline__finetune-btn" type="button" data-lab-action="timeline-finetune" data-lab-value="${prefix}:-1000" title="-1s" ${disabledAttr}>&blacktriangleleft;&blacktriangleleft;</button>
      <button class="labx-timeline__finetune-btn" type="button" data-lab-action="timeline-finetune" data-lab-value="${prefix}:-100" title="-100ms" ${disabledAttr}>&blacktriangleleft;</button>
      <button class="labx-timeline__finetune-btn" type="button" data-lab-action="timeline-finetune" data-lab-value="${prefix}:-10" title="-10ms" ${disabledAttr}>&lsaquo;</button>
      <span class="labx-timeline__finetune-value">${formatTimePrecise(msValue)}</span>
      <button class="labx-timeline__finetune-btn" type="button" data-lab-action="timeline-finetune" data-lab-value="${prefix}:+10" title="+10ms" ${disabledAttr}>&rsaquo;</button>
      <button class="labx-timeline__finetune-btn" type="button" data-lab-action="timeline-finetune" data-lab-value="${prefix}:+100" title="+100ms" ${disabledAttr}>&blacktriangleright;</button>
      <button class="labx-timeline__finetune-btn" type="button" data-lab-action="timeline-finetune" data-lab-value="${prefix}:+1000" title="+1s" ${disabledAttr}>&blacktriangleright;&blacktriangleright;</button>
    </div>
  `;
}

function formatPlaybackRateValue(value: number) {
  return `${String(Number(value.toFixed(2)))}x`;
}

function renderTimelineSettingStepper(
  label: string,
  fullField: string,
  min: number,
  max: number,
  step: number,
  resetValue: number,
  disabled = false
) {
  const escapedField = escapeHtml(fullField);
  const escapedLabel = escapeHtml(label);
  const disabledAttr = disabled ? " disabled" : "";
  return `
    <div class="labx-control-stepper labx-timeline__speed-stepper" aria-label="${escapedLabel}">
      <button class="labx-control-stepper__btn" type="button" data-lab-action="workspace-setting-adjust" data-lab-field="${escapedField}" data-lab-delta="-${String(step)}" data-lab-min="${String(min)}" data-lab-max="${String(max)}" data-lab-step="${String(step)}" data-lab-reset-value="${String(resetValue)}" title="Decrease ${escapedLabel}"${disabledAttr}>-</button>
      <button class="labx-control-stepper__btn" type="button" data-lab-action="workspace-setting-adjust" data-lab-field="${escapedField}" data-lab-reset="true" data-lab-min="${String(min)}" data-lab-max="${String(max)}" data-lab-step="${String(step)}" data-lab-reset-value="${String(resetValue)}" title="Reset ${escapedLabel}"${disabledAttr}>R</button>
      <button class="labx-control-stepper__btn" type="button" data-lab-action="workspace-setting-adjust" data-lab-field="${escapedField}" data-lab-delta="${String(step)}" data-lab-min="${String(min)}" data-lab-max="${String(max)}" data-lab-step="${String(step)}" data-lab-reset-value="${String(resetValue)}" title="Increase ${escapedLabel}"${disabledAttr}>+</button>
    </div>
  `;
}

function renderTimelinePlaybackSpeedControl(copy: LabI18n, playbackRate: number, locked = false) {
  const field = "workspace.audioFocus.playbackRate";
  const label = copy.t("mediaAnalysis.timeline.playbackSpeed", "Playback Speed");
  const disabledAttr = locked ? " disabled" : "";
  return `
    <label class="labx-timeline__speed" title="${escapeHtml(label)}">
      <span>${escapeHtml(label)}</span>
      <input
        class="labx-range"
        type="range"
        min="0.1"
        max="2"
        step="0.05"
        value="${String(playbackRate)}"
        data-lab-field="${field}"${disabledAttr}
      />
      <span class="labx-timeline__speed-value">${escapeHtml(formatPlaybackRateValue(playbackRate))}</span>
      ${renderTimelineSettingStepper(label, field, 0.1, 2, 0.05, 1, locked)}
    </label>
  `;
}

function renderPlaybackStepControls(
  copy: LabI18n,
  durationMs: number,
  locked = false,
  sourceKind?: string
) {
  const disabledAttr = locked ? 'disabled aria-disabled="true"' : "";
  const frameDisabledAttr = locked || sourceKind !== "video" ? 'disabled aria-disabled="true"' : "";
  return `
    <div
      class="labx-timeline__playhead-tools"
      aria-label="${escapeHtml(copy.t("mediaAnalysis.timeline.playheadTools", "Playback timing"))}"
    >
      <div class="labx-timeline__time-readout">
        <span data-lab-role="timeline-current-time-label">00:00.000</span>
        <span class="labx-timeline__time-separator">/</span>
        <span data-lab-role="timeline-total-duration-label">${formatTimePrecise(durationMs)}</span>
      </div>
      <div class="labx-timeline__step-controls">
        <button class="labx-timeline__step-btn" type="button" data-lab-action="timeline-shift-playhead" data-lab-value="-1000" title="${escapeHtml(copy.t("mediaAnalysis.timeline.jumpBackOneSecond", "Back 1 second"))}" ${disabledAttr}>-1s</button>
        <button class="labx-timeline__step-btn" type="button" data-lab-action="timeline-shift-playhead" data-lab-value="-frame" title="${escapeHtml(copy.t("mediaAnalysis.timeline.frameBack", "Frame -1"))}" ${frameDisabledAttr}>-1f</button>
        <button class="labx-timeline__step-btn" type="button" data-lab-action="timeline-shift-playhead" data-lab-value="+frame" title="${escapeHtml(copy.t("mediaAnalysis.timeline.frameForward", "Frame +1"))}" ${frameDisabledAttr}>+1f</button>
        <button class="labx-timeline__step-btn" type="button" data-lab-action="timeline-shift-playhead" data-lab-value="+1000" title="${escapeHtml(copy.t("mediaAnalysis.timeline.jumpForwardOneSecond", "Forward 1 second"))}" ${disabledAttr}>+1s</button>
      </div>
    </div>
  `;
}

export function renderLabWaveformSelectionPanel(
  model: LabWaveformTimelineModel,
  options: {
    placement?: "drawer" | "timeline";
    selectionCenterPct?: number;
  } = {}
) {
  const copy = model.copy ?? LAB_FALLBACK_I18N;
  const durationMs = Math.max(1, model.durationMs);
  const modelSelection = model.activeSelection ?? null;
  const rawStartMs = modelSelection?.startMs ?? model.startMs ?? 0;
  const rawEndMs = modelSelection?.endMs ?? model.endMs ?? durationMs;
  const hasSelection =
    (model.startMs !== null && model.endMs !== null && model.endMs > model.startMs) ||
    (modelSelection !== null && modelSelection.endMs > modelSelection.startMs);

  if (hasSelection !== true) {
    return "";
  }

  const activeSelection = modelSelection ?? {
    id: "selection-preview",
    startMs: rawStartMs,
    endMs: rawEndMs,
    type: "clip",
    createdAt: 0,
  };
  const hasSemanticSelection =
    modelSelection !== null && modelSelection.endMs > modelSelection.startMs;
  const selectionSuggestions = hasSemanticSelection
    ? (model.selectionSuggestions ?? []).filter(function (suggestion) {
        return !isOperationSuggestion(suggestion);
      })
    : [];
  const rawActiveExecutionIntent = hasSemanticSelection
    ? (model.activeExecutionIntent ?? null)
    : null;
  const activeExecutionIntent =
    rawActiveExecutionIntent !== null && !isOperationSuggestion(rawActiveExecutionIntent)
      ? rawActiveExecutionIntent
      : null;
  const hasFlowTaggedSuggestions = selectionSuggestions.some(function (suggestion) {
    return suggestion.flowKind === "operation-result" || suggestion.flowKind === "analysis-report";
  });
  const actionSuggestions = hasFlowTaggedSuggestions
    ? selectionSuggestions
    : selectionSuggestions.filter(function (suggestion) {
        return typeof suggestion.toolHint !== "string" || suggestion.toolHint.trim() === "";
      });
  const operationSuggestions = hasFlowTaggedSuggestions
    ? actionSuggestions.filter(isOperationSuggestion)
    : [];
  const analysisSuggestions = hasFlowTaggedSuggestions
    ? actionSuggestions.filter(function (suggestion) {
        return !isOperationSuggestion(suggestion);
      })
    : [];
  const rawSuggestionPreview = hasSemanticSelection
    ? (model.activeSuggestionPreview ?? null)
    : null;
  const suggestionPreview =
    rawSuggestionPreview !== null &&
    selectionSuggestions.some(function (suggestion) {
      return suggestion.id === rawSuggestionPreview.suggestionId;
    })
      ? rawSuggestionPreview
      : null;
  const activeInspectionSnapshot = model.activeInspectionSnapshot ?? null;
  const interpretationItems = model.interpretationItems ?? [];
  const inspectionMode = model.inspectionMode ?? "none";
  const roiFocusActive = model.roiFocusActive === true;
  const startMs = rawStartMs;
  const endMs = rawEndMs;
  const selectionDurationMs = Math.max(0, endMs - startMs);
  const selectionRoi = activeSelection.roi;
  const selectionRoiLabel = selectionRoi
    ? copy.t(
        roiFocusActive
          ? "mediaAnalysis.timeline.regionActiveFocused"
          : "mediaAnalysis.timeline.regionActive",
        roiFocusActive
          ? "Region active · Focused · {width}% × {height}%"
          : "Region active · {width}% × {height}%",
        {
          width: String(Math.round(selectionRoi.width * 100)),
          height: String(Math.round(selectionRoi.height * 100)),
        }
      )
    : copy.t("mediaAnalysis.timeline.regionInactive", "Region inactive");
  const placement = options.placement ?? "drawer";
  const className =
    placement === "timeline"
      ? "lab-selection-panel"
      : "lab-selection-panel lab-selection-panel--drawer";
  const styleAttr =
    placement === "timeline" ? `style="left: ${String(options.selectionCenterPct ?? 0)}%"` : "";

  return `
	    <div
	      class="${className}"
	      ${styleAttr}
	      data-lab-selection-panel="true"
	    >
      <div class="lab-selection-panel__eyebrow">${escapeHtml(copy.t("mediaAnalysis.timeline.selection", "Selection"))}</div>
      <div class="lab-selection-panel__range">
        ${formatTimePrecise(startMs)} &rarr; ${formatTimePrecise(endMs)}
        <span class="lab-selection-panel__duration">(${formatDuration(selectionDurationMs)})</span>
      </div>
	      <div class="lab-selection-panel__meta">${escapeHtml(copy.t("mediaAnalysis.timeline.type", "Type"))}: ${escapeHtml(formatSelectionType(activeSelection.type, copy))}</div>
	      ${
          typeof activeSelection.label === "string" && activeSelection.label.trim() !== ""
            ? `<div class="lab-selection-panel__label">${escapeHtml(activeSelection.label)}</div>`
            : ""
        }
      <div class="lab-selection-panel__region-row">
        <span class="lab-selection-panel__region-state${selectionRoi ? " is-active" : ""}">${escapeHtml(selectionRoiLabel)}</span>
        ${
          selectionRoi
            ? `<button class="lab-selection-panel__region-clear" type="button" data-lab-selection-roi-clear="true">${escapeHtml(copy.t("mediaAnalysis.timeline.clearRegion", "Clear region"))}</button>`
            : ""
        }
      </div>
      ${renderSelectionRegionTools({
        copy,
        roiFocusActive,
        selectionRoi,
        snapshot: activeInspectionSnapshot,
        sourceKind: model.sourceKind,
      })}
      <div class="lab-selection-panel__inspection">
        <div class="lab-selection-panel__inspection-title">${escapeHtml(copy.t("mediaAnalysis.timeline.inspectionMode", "Inspection mode"))}</div>
        <div class="lab-selection-panel__inspection-modes">
          ${INSPECTION_MODE_OPTIONS.map(function (mode) {
            const isActive = inspectionMode === mode;
            const isSupported = supportsInspectionMode(mode, model.sourceKind);
            return `<button
              class="lab-selection-panel__inspection-pill${isActive ? " is-active" : ""}"
              type="button"
              aria-pressed="${String(isActive)}"
              ${isSupported ? `data-lab-selection-inspection-mode="${mode}"` : "disabled"}
            >${escapeHtml(formatInspectionMode(mode, copy))}</button>`;
          }).join("")}
        </div>
      </div>
	      <div class="lab-selection-panel__hint">${escapeHtml(copy.t("mediaAnalysis.timeline.selectionHint", "This selection will guide future analysis"))}</div>
      ${renderExecutionIntentStrip(activeExecutionIntent, copy)}
      ${renderInspectionToolHints(selectionSuggestions, copy)}
      ${renderInspectionSnapshot(activeInspectionSnapshot, copy)}
      ${
        hasFlowTaggedSuggestions
          ? `${renderSelectionSuggestions(operationSuggestions, copy, {
              titleFallback: "Önerilen İşlemler",
              titleKey: "mediaAnalysis.timeline.suggestedOperations",
            })}${renderSelectionSuggestions(analysisSuggestions, copy, {
              titleFallback: "Önerilen Analizler",
              titleKey: "mediaAnalysis.timeline.suggestedAnalyses",
            })}`
          : renderSelectionSuggestions(actionSuggestions, copy)
      }
      ${renderSuggestionPreview(suggestionPreview, activeExecutionIntent, copy)}
      ${renderInterpretationPanel(interpretationItems, "embedded", copy)}
    </div>
  `;
}

export function renderLabWaveformTimeline(model: LabWaveformTimelineModel) {
  const copy = model.copy ?? LAB_FALLBACK_I18N;
  const timelineLocked = model.lockState?.timeline === true;
  const lockDisabledAttr = timelineLocked ? 'disabled aria-disabled="true"' : "";
  const lockHandleAttr = timelineLocked ? 'aria-disabled="true" data-lab-locked="true"' : "";
  const durationMs = Math.max(1, model.durationMs);
  const rawStartMs = model.startMs ?? 0;
  const rawEndMs = model.endMs ?? durationMs;
  const hasSelection =
    model.startMs !== null && model.endMs !== null && model.endMs > model.startMs;
  const microZoomAvailable = model.waveformInspectionLens?.enabled === true;
  const microZoomOpen = microZoomAvailable === true && model.selectionMicroZoomOpen === true;
  const startMs = hasSelection ? rawStartMs : 0;
  const endMs = hasSelection ? rawEndMs : durationMs;
  const startPct = hasSelection ? Math.max(0, Math.min(100, (startMs / durationMs) * 100)) : 0;
  const endPct = hasSelection ? Math.max(0, Math.min(100, (endMs / durationMs) * 100)) : 100;
  const selectionCenterPct = hasSelection ? startPct + (endPct - startPct) / 2 : 0;
  const selectionDurationMs = hasSelection ? Math.max(0, endMs - startMs) : 0;
  const transportVolume = Math.max(0, Math.min(1, model.transportVolume ?? 1));
  const playbackRate = Math.max(0.1, Math.min(2, model.audioFocus?.playbackRate ?? 1));
  const selectionLoopEnabled = hasSelection === true && model.selectionLoopEnabled === true;
  const selectionDisabledAttr =
    timelineLocked || hasSelection !== true ? 'disabled aria-disabled="true"' : "";
  const startBoundaryDisabled = timelineLocked;
  const endBoundaryDisabled = timelineLocked || model.startMs === null;
  const startBoundaryDisabledAttr = startBoundaryDisabled ? 'disabled aria-disabled="true"' : "";
  const endBoundaryDisabledAttr = endBoundaryDisabled ? 'disabled aria-disabled="true"' : "";
  const timelineHighlight =
    model.timelineHighlight &&
    model.timelineHighlight.endMs > model.timelineHighlight.startMs &&
    model.timelineHighlight.endMs > 0
      ? model.timelineHighlight
      : null;
  const highlightStartPct =
    timelineHighlight !== null
      ? Math.max(0, Math.min(100, (timelineHighlight.startMs / durationMs) * 100))
      : 0;
  const highlightEndPct =
    timelineHighlight !== null
      ? Math.max(highlightStartPct, Math.min(100, (timelineHighlight.endMs / durationMs) * 100))
      : 0;
  const waveformWindowStartPct = Math.max(
    0,
    Math.min(100, (model.waveformWindowStartMs / durationMs) * 100)
  );
  const waveformWindowWidthPct = Math.max(
    0,
    Math.min(100 - waveformWindowStartPct, (model.waveformWindowDurationMs / durationMs) * 100)
  );
  const hasVisibleWaveform = waveformWindowWidthPct > 0;
  const focusClassName = model.focusClassName ? ` ${escapeHtml(model.focusClassName)}` : "";
  const bookmarkPins = model.bookmarks
    .map(function (bookmark) {
      const pct = Math.max(0, Math.min(100, (bookmark.timeMs / durationMs) * 100));
      const timeLabel = formatTimePrecise(bookmark.timeMs);
      const pinTitle = bookmark.note ? `${timeLabel} · ${bookmark.note}` : timeLabel;
      return `
        <div
          class="labx-timeline__pin"
          style="left: ${String(pct)}%"
          tabindex="0"
          role="button"
          title="${escapeHtml(pinTitle)}"
          data-lab-action="timeline-seek"
          data-lab-value="${String(bookmark.timeMs)}"
          aria-label="${escapeHtml(pinTitle)}"
        >
          <div class="labx-timeline__pin-popover">
            <span class="labx-timeline__pin-time">${escapeHtml(timeLabel)}</span>
            <span class="labx-timeline__pin-note">${escapeHtml(bookmark.note || timeLabel)}</span>
            <button
              class="labx-timeline__pin-remove"
              type="button"
              data-lab-action="timeline-remove-bookmark"
              data-lab-value="${escapeHtml(bookmark.id)}"
              title="${escapeHtml(copy.t("mediaAnalysis.timeline.removeBookmark", "Remove mark"))}"
              aria-label="${escapeHtml(copy.t("mediaAnalysis.timeline.removeBookmark", "Remove mark"))}"
            >×</button>
          </div>
        </div>
      `;
    })
    .join("");
  const hintLabel =
    hasVisibleWaveform === true
      ? model.startMs !== null && model.endMs !== null && hasSelection !== true
        ? copy.t(
            "mediaAnalysis.timeline.invalidRangeHint",
            "End must be greater than start to create a valid selection."
          )
        : copy.t(
            "mediaAnalysis.timeline.seekDragHint",
            "Click to seek, drag to create a selection."
          )
      : copy.t(
          "mediaAnalysis.timeline.outsideRangeHint",
          "Waveform falls outside the visible master range."
        );
  return `
    <div class="labx-timeline labx-timeline-area${focusClassName}" id="lab-timeline" data-lab-region="timeline-area" data-duration="${String(durationMs)}" data-waveform-mode="source-audio" data-timeline-locked="${timelineLocked ? "true" : "false"}">
      <div class="labx-timeline__track">
        <div class="labx-timeline__waveform-bed"></div>
        ${
          hasVisibleWaveform
            ? `
          <div
            class="labx-timeline__waveform-window"
            style="left: ${String(waveformWindowStartPct)}%; width: ${String(waveformWindowWidthPct)}%"
          >
            <canvas
              id="lab-audio-viz"
              class="labx-audio-viz labx-audio-viz--timeline lab-audio-viz-canvas"
              width="960"
              height="112"
              data-lab-viz="audio-waveform-timeline"
              data-lab-viz-mode="${escapeHtml(model.visualizationMode ?? "waveform")}"
              data-waveform-crop-start="${String(model.waveformCropStartRatio ?? 0)}"
              data-waveform-crop-end="${String(model.waveformCropEndRatio ?? 1)}"
            ></canvas>
          </div>
        `
            : ""
        }
        <div class="labx-timeline__playhead" data-lab-role="timeline-playhead" style="left: 0%">
          <span class="labx-timeline__playhead-label" data-lab-role="timeline-playhead-label">00:00.000</span>
        </div>
        <div class="labx-timeline__rail" data-lab-action="timeline-interact" ${lockHandleAttr}></div>
        ${
          timelineHighlight !== null && highlightEndPct > highlightStartPct
            ? `
          <div
            class="labx-timeline__highlight"
            style="left: ${String(highlightStartPct)}%; width: ${String(highlightEndPct - highlightStartPct)}%"
            data-lab-timeline-highlight="${escapeHtml(timelineHighlight.assetId)}"
            title="${escapeHtml(timelineHighlight.label || "")}"
          ></div>
        `
            : ""
        }
        ${
          hasSelection
            ? `
          ${
            model.selectionPanelPlacement === "side"
              ? ""
              : renderLabWaveformSelectionPanel(model, {
                  placement: "timeline",
                  selectionCenterPct,
                })
          }
	          <div
	            class="labx-timeline__selection lab-selection-overlay"
	            style="left: ${String(startPct)}%; width: ${String(endPct - startPct)}%"
	          >
            <div class="labx-timeline__handle labx-timeline__handle--start" data-lab-action="timeline-drag-start" ${lockHandleAttr}></div>
            <div class="labx-timeline__handle labx-timeline__handle--end" data-lab-action="timeline-drag-end" ${lockHandleAttr}></div>
            <div class="labx-timeline__selection-body" data-lab-action="timeline-drag-body" ${lockHandleAttr}></div>
            <div class="labx-timeline__selection-duration">${formatDuration(selectionDurationMs)}</div>
          </div>
        `
            : `<div class="labx-timeline__hint">${escapeHtml(hintLabel)}</div>`
        }
        ${bookmarkPins}
      </div>
      <div class="labx-timeline__controls">
        <div class="labx-timeline__controls-row labx-timeline__player-row">
          <div class="labx-timeline__transport">
            <button
              class="labx-timeline__play-btn"
              type="button"
              data-lab-action="timeline-toggle-playback"
              title="${escapeHtml(copy.t("mediaAnalysis.timeline.playPause", "Play / pause"))}"
              ${lockDisabledAttr}
            ><span data-lab-role="timeline-play-toggle-label">▶</span></button>
            <button
              class="labx-timeline__export-btn labx-timeline__selection-play-btn"
              type="button"
              data-lab-action="timeline-play-selection"
              title="${escapeHtml(copy.t("mediaAnalysis.timeline.playSelectionTitle", "Play selected range"))}"
              ${selectionDisabledAttr}
            >${escapeHtml(copy.t("mediaAnalysis.timeline.playSelection", "Play selection"))}</button>
            <button
              class="labx-timeline__export-btn labx-timeline__selection-loop-btn"
              type="button"
              data-lab-action="timeline-toggle-selection-loop"
              aria-pressed="${selectionLoopEnabled ? "true" : "false"}"
              title="${escapeHtml(copy.t("mediaAnalysis.timeline.loopSelectionTitle", "Loop selected range playback"))}"
              ${selectionDisabledAttr}
            >${escapeHtml(copy.t("mediaAnalysis.timeline.loopSelection", "Loop"))}</button>
            <label class="labx-timeline__volume" title="${escapeHtml(copy.t("mediaAnalysis.timeline.volume", "System volume"))}">
              <span>${escapeHtml(copy.t("mediaAnalysis.timeline.volume", "Volume"))}</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value="${String(transportVolume)}"
                data-lab-field="workspace.previewVolume"
                data-lab-role="timeline-volume"
                ${lockDisabledAttr}
              />
            </label>
          </div>
          ${renderPlaybackStepControls(copy, durationMs, timelineLocked, model.sourceKind)}
          ${renderTimelinePlaybackSpeedControl(copy, playbackRate, timelineLocked)}
          <div class="labx-timeline__bookmark">
            <input
              class="labx-input labx-input--compact labx-timeline__bookmark-note"
              type="text"
              maxlength="80"
              data-lab-role="timeline-bookmark-note"
              placeholder="${escapeHtml(copy.t("mediaAnalysis.timeline.bookmarkNotePlaceholder", "Short note"))}"
            />
            <button
              class="labx-timeline__export-btn"
              type="button"
              data-lab-action="timeline-add-bookmark"
              title="${escapeHtml(copy.t("mediaAnalysis.timeline.markCurrentTitle", "Mark current moment"))}"
            >${escapeHtml(copy.t("mediaAnalysis.timeline.markCurrent", "Mark"))}</button>
          </div>
        </div>
        <div class="labx-timeline__controls-row labx-timeline__selection-row">
          <div class="labx-timeline__selection-group" data-selection-boundary="start">
            <button
              class="labx-timeline__export-btn labx-timeline__selection-boundary-btn"
              type="button"
              data-lab-action="timeline-set-selection-boundary"
              data-lab-value="start"
              ${startBoundaryDisabledAttr}
            >${escapeHtml(copy.t("mediaAnalysis.timeline.selectionStartButton", "Set start"))}</button>
            <label class="labx-timeline__finetune-label">${escapeHtml(copy.t("mediaAnalysis.timeline.selectionStart", "Start"))}</label>
            ${renderFineTuneButtons("start", model.startMs ?? 0, startBoundaryDisabled || model.startMs === null)}
          </div>
          <div class="labx-timeline__selection-group" data-selection-boundary="end">
            <button
              class="labx-timeline__export-btn labx-timeline__selection-boundary-btn"
              type="button"
              data-lab-action="timeline-set-selection-boundary"
              data-lab-value="end"
              ${endBoundaryDisabledAttr}
            >${escapeHtml(copy.t("mediaAnalysis.timeline.selectionEndButton", "Set end"))}</button>
            <label class="labx-timeline__finetune-label">${escapeHtml(copy.t("mediaAnalysis.timeline.selectionEnd", "End"))}</label>
            ${renderFineTuneButtons("end", model.endMs ?? durationMs, endBoundaryDisabled || model.endMs === null)}
          </div>
          <div class="labx-timeline__actions">
            <button
              class="labx-timeline__clear-btn"
              type="button"
              data-lab-action="timeline-clear"
              ${selectionDisabledAttr}
            >${escapeHtml(copy.t("mediaAnalysis.timeline.clear", "Clear"))}</button>
            <button
              class="labx-timeline__export-btn labx-timeline__micro-zoom-toggle"
              type="button"
              data-lab-action="timeline-toggle-micro-zoom"
              aria-pressed="${microZoomOpen ? "true" : "false"}"
              title="${escapeHtml(copy.t("mediaAnalysis.timeline.microZoomToggleTitle", "Show or hide selection micro zoom"))}"
              ${timelineLocked || microZoomAvailable !== true ? 'disabled aria-disabled="true"' : ""}
            >${escapeHtml(copy.t("mediaAnalysis.timeline.microZoomToggle", "Micro Zoom"))}</button>
          </div>
        </div>
      </div>
      ${renderWaveformInspectionLens(model, copy)}
    </div>
  `;
}
