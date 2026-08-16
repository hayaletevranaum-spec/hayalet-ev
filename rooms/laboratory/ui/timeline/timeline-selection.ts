import { escapeHtml } from "../../domain/lab-types.js";
import type {
  LabActionSuggestion,
  LabInspectionMode,
  LabInspectionSnapshot,
  LabSelection,
  LabSuggestionPreview,
} from "../../domain/lab-types.js";
import type { LabI18n } from "../lab-i18n.js";
import type { LabWaveformTimelineModel } from "../lab-waveform-timeline-types.js";

function formatTimePrecise(ms: number) {
  const totalMs = Math.round(ms);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function formatSelectionType(type: LabSelection["type"] | undefined, copy: LabI18n) {
  const normalizedType = type ?? "unknown";
  const fallback = (
    {
      clip: "Clip",
      focus: "Focus",
      inspect: "Inspect",
      unknown: "Unknown",
    } as const
  )[normalizedType];
  return copy.t(`mediaAnalysis.timeline.selectionTypes.${normalizedType}`, fallback);
}

export function supportsInspectionMode(mode: LabInspectionMode, sourceKind: string | undefined) {
  switch (mode) {
    case "none":
      return true;
    case "audio":
      return sourceKind === "audio" || sourceKind === "video";
    case "motion":
      return sourceKind === "video";
    case "visual":
      return sourceKind === "image" || sourceKind === "video";
    default:
      return false;
  }
}

export const INSPECTION_MODE_OPTIONS = [
  "none",
  "visual",
  "audio",
  "motion",
] as const satisfies ReadonlyArray<LabInspectionMode>;

export function formatInspectionMode(mode: LabInspectionMode, copy: LabI18n) {
  const fallback = (
    {
      audio: "Audio",
      motion: "Motion",
      none: "None",
      visual: "Visual",
    } as const
  )[mode];
  return copy.t(`mediaAnalysis.timeline.inspectionModes.${mode}`, fallback);
}

function getSuggestionPriorityClass(suggestion: LabActionSuggestion) {
  return suggestion.confidence >= 0.8 ? "is-primary" : "is-secondary";
}

export function renderSelectionSuggestions(
  suggestions: LabActionSuggestion[],
  copy: LabI18n,
  options: { titleFallback?: string; titleKey?: string } = {}
) {
  if (suggestions.length === 0) {
    return "";
  }
  const title = copy.t(
    options.titleKey || "mediaAnalysis.timeline.suggestedActions",
    options.titleFallback || "Suggested actions"
  );
  return `
    <div class="lab-selection-panel__suggestions">
      <div class="lab-selection-panel__suggestions-title">${escapeHtml(title)}</div>
      <div class="lab-selection-panel__suggestions-list">
        ${suggestions
          .map(function (suggestion) {
            return `<button
              class="lab-selection-panel__suggestion ${getSuggestionPriorityClass(suggestion)}"
              type="button"
              data-lab-selection-suggestion="${escapeHtml(suggestion.id)}"
              data-suggestion-priority="${suggestion.confidence >= 0.8 ? "primary" : "secondary"}"
            >
              <span class="lab-selection-panel__suggestion-label">${escapeHtml(suggestion.label)}</span>
              ${
                typeof suggestion.description === "string" && suggestion.description.trim() !== ""
                  ? `<span class="lab-selection-panel__suggestion-description">${escapeHtml(suggestion.description)}</span>`
                  : ""
              }
            </button>`;
          })
          .join("")}
      </div>
    </div>
  `;
}

function getToolHintGlyph(suggestion: LabActionSuggestion) {
  switch (suggestion.actionType) {
    case "analyze-segment":
    case "clean-audio":
    case "crop-region":
    case "detect-objects":
    case "extract-clip":
    case "focus-region":
    case "inspect-audio":
    case "ocr-region":
    case "separate-stems":
      return "+";
    case "detect-scenes":
    case "inspect-motion":
      return ">";
    case "enhance-frame":
    case "enhance-visual":
      return "*";
    case "metadata-audit":
    case "stabilize-segment":
      return "=";
    default:
      return "·";
  }
}

export function renderInspectionToolHints(suggestions: LabActionSuggestion[], copy: LabI18n) {
  const toolHintSuggestions = suggestions.filter(function (suggestion) {
    return typeof suggestion.toolHint === "string" && suggestion.toolHint.trim() !== "";
  });
  if (toolHintSuggestions.length === 0) {
    return "";
  }
  return `
    <div class="lab-selection-panel__tools">
      <div class="lab-selection-panel__tools-title">${escapeHtml(copy.t("mediaAnalysis.timeline.inspectionTools", "Inspection tools"))}</div>
      <div class="lab-selection-panel__tools-list">
        ${toolHintSuggestions
          .map(function (suggestion) {
            return `<button
              class="lab-selection-panel__tool-hint"
              type="button"
              data-lab-selection-suggestion="${escapeHtml(suggestion.id)}"
            >
              <span class="lab-selection-panel__tool-hint-icon" aria-hidden="true">${escapeHtml(getToolHintGlyph(suggestion))}</span>
              <span class="lab-selection-panel__tool-hint-label">${escapeHtml(suggestion.toolHint || suggestion.label)}</span>
            </button>`;
          })
          .join("")}
      </div>
    </div>
  `;
}

function formatEstimatedCost(cost: LabSuggestionPreview["estimatedCost"], copy: LabI18n) {
  const normalizedCost = cost ?? "low";
  const fallback = (
    {
      high: "High",
      low: "Low",
      medium: "Medium",
    } as const
  )[normalizedCost];
  return copy.t(`mediaAnalysis.timeline.cost.${normalizedCost}`, fallback);
}

export function renderExecutionIntentStrip(
  activeExecutionIntent: LabActionSuggestion | null,
  copy: LabI18n
) {
  if (activeExecutionIntent === null) {
    return "";
  }
  return `
    <div class="lab-selection-panel__execution-intent">
      <div class="lab-selection-panel__execution-intent-copy">
        <span class="lab-selection-panel__execution-intent-eyebrow">${escapeHtml(copy.t("mediaAnalysis.timeline.selectedAction", "Selected action"))}</span>
        <strong class="lab-selection-panel__execution-intent-label">${escapeHtml(activeExecutionIntent.label)}</strong>
      </div>
      <button
        class="lab-selection-panel__execution-intent-clear"
        type="button"
        data-lab-execution-intent-clear="true"
      >${escapeHtml(copy.t("mediaAnalysis.timeline.clear", "Clear"))}</button>
    </div>
  `;
}

export function renderSuggestionPreview(
  preview: LabSuggestionPreview | null,
  activeExecutionIntent: LabActionSuggestion | null,
  copy: LabI18n
) {
  if (preview === null) {
    return "";
  }
  const actionSelected = activeExecutionIntent?.id === preview.suggestionId;
  return `
    <div class="lab-selection-preview" data-lab-selection-preview="true">
      <div class="lab-selection-preview__eyebrow">${escapeHtml(copy.t("mediaAnalysis.timeline.preview", "Preview"))}</div>
      <div class="lab-selection-preview__title">${escapeHtml(preview.title)}</div>
      <div class="lab-selection-preview__section">
        <div class="lab-selection-preview__section-title">${escapeHtml(copy.t("mediaAnalysis.timeline.steps", "Steps"))}</div>
        <ul class="lab-selection-preview__list lab-selection-preview__list--steps">
          ${preview.steps
            .map(function (step) {
              return `<li>${escapeHtml(step)}</li>`;
            })
            .join("")}
        </ul>
      </div>
      ${
        preview.expectedOutputs.length > 0
          ? `
        <div class="lab-selection-preview__section">
          <div class="lab-selection-preview__section-title">${escapeHtml(copy.t("mediaAnalysis.timeline.outputs", "Outputs"))}</div>
          <ul class="lab-selection-preview__list lab-selection-preview__list--outputs">
            ${preview.expectedOutputs
              .map(function (output) {
                return `<li>${escapeHtml(output)}</li>`;
              })
              .join("")}
          </ul>
        </div>
      `
          : ""
      }
      ${
        preview.estimatedCost
          ? `<div class="lab-selection-preview__cost">${escapeHtml(copy.t("mediaAnalysis.timeline.estimatedCost", "Estimated cost"))}: ${escapeHtml(formatEstimatedCost(preview.estimatedCost, copy))}</div>`
          : ""
      }
      <div class="lab-selection-preview__actions">
        <button
	          class="lab-selection-preview__action lab-selection-preview__action--primary${actionSelected ? " is-active" : ""}"
	          type="button"
	          data-lab-execution-intent-accept="${escapeHtml(preview.suggestionId)}"
	          aria-pressed="${String(actionSelected)}"
	        >${escapeHtml(actionSelected ? copy.t("mediaAnalysis.timeline.actionSelected", "Action selected") : copy.t("mediaAnalysis.timeline.wantThis", "I want this"))}</button>
        <button
          class="lab-selection-preview__action"
          type="button"
          data-lab-execution-intent-dismiss="${escapeHtml(preview.suggestionId)}"
        >${escapeHtml(copy.t("mediaAnalysis.timeline.notNow", "Not now"))}</button>
        <button
          class="lab-selection-preview__action lab-selection-preview__action--subtle"
          type="button"
          data-lab-execution-intent-queue="${escapeHtml(preview.suggestionId)}"
        >${escapeHtml(copy.t("mediaAnalysis.timeline.queueForLater", "Queue for later"))}</button>
      </div>
    </div>
  `;
}

export function renderSelectionRegionTools(options: {
  copy: LabI18n;
  roiFocusActive: boolean;
  selectionRoi: LabSelection["roi"] | undefined;
  snapshot: LabInspectionSnapshot | null;
  sourceKind: string | undefined;
}) {
  if (options.selectionRoi === undefined && options.snapshot === null) {
    return "";
  }
  return `
    <div class="lab-selection-panel__region-tools">
      ${
        options.selectionRoi
          ? `
            <button
              class="lab-selection-panel__region-tool"
              type="button"
              ${options.roiFocusActive ? `data-lab-selection-roi-focus-reset="true"` : `data-lab-selection-roi-focus-toggle="true"`}
            >${escapeHtml(options.roiFocusActive ? options.copy.t("mediaAnalysis.timeline.resetFocus", "Reset focus") : options.copy.t("mediaAnalysis.timeline.focusRegion", "Focus region"))}</button>
            <button
              class="lab-selection-panel__region-tool"
              type="button"
              data-lab-selection-roi-capture="true"
            >${escapeHtml(options.copy.t("mediaAnalysis.timeline.captureRegion", "Capture region"))}</button>
            ${
              options.sourceKind === "video"
                ? `
                  <button class="lab-selection-panel__region-tool" type="button" data-lab-selection-roi-frame-step="-1">${escapeHtml(options.copy.t("mediaAnalysis.timeline.frameBack", "Frame -1"))}</button>
                  <button class="lab-selection-panel__region-tool" type="button" data-lab-selection-roi-frame-step="1">${escapeHtml(options.copy.t("mediaAnalysis.timeline.frameForward", "Frame +1"))}</button>
                `
                : ""
            }
          `
          : ""
      }
      ${
        options.snapshot !== null
          ? `<button class="lab-selection-panel__region-tool is-secondary" type="button" data-lab-selection-roi-snapshot-clear="true">${escapeHtml(options.copy.t("mediaAnalysis.timeline.dismissSnapshot", "Dismiss snapshot"))}</button>`
          : ""
      }
    </div>
  `;
}

export function renderInspectionSnapshot(snapshot: LabInspectionSnapshot | null, copy: LabI18n) {
  if (snapshot === null) {
    return "";
  }
  const timeLabel =
    snapshot.timeMs !== null
      ? formatTimePrecise(snapshot.timeMs)
      : copy.t("mediaAnalysis.timeline.staticFrame", "Static frame");
  return `
    <div class="lab-selection-snapshot" data-lab-selection-snapshot="true">
      <div class="lab-selection-snapshot__head">
        <div class="lab-selection-snapshot__eyebrow">${escapeHtml(copy.t("mediaAnalysis.timeline.regionSnapshot", "Region snapshot"))}</div>
        <div class="lab-selection-snapshot__meta">${escapeHtml(timeLabel)} · ${escapeHtml(String(snapshot.width))}×${escapeHtml(String(snapshot.height))}</div>
      </div>
      <div class="lab-selection-snapshot__image-wrap">
        <img class="lab-selection-snapshot__image" src="${escapeHtml(snapshot.objectUrl)}" alt="${escapeHtml(copy.t("mediaAnalysis.timeline.snapshotAlt", "Temporary inspection snapshot"))}" />
      </div>
    </div>
  `;
}

export function renderWaveformInspectionLens(model: LabWaveformTimelineModel, copy: LabI18n) {
  const lens = model.waveformInspectionLens;
  if (!lens || lens.enabled !== true || model.selectionMicroZoomOpen !== true) {
    return "";
  }
  return `
    <div class="labx-timeline__inspection-lens" data-lab-timeline-inspection-lens="true">
      <div class="labx-timeline__inspection-lens-head">
        <div class="labx-timeline__inspection-lens-title">${escapeHtml(copy.t("mediaAnalysis.timeline.microZoom", "Selection micro zoom"))}</div>
        <div class="labx-timeline__inspection-lens-meta">${escapeHtml(lens.sourceLabel)}</div>
      </div>
      <div class="labx-timeline__inspection-lens-window">
        <canvas
          id="lab-audio-viz-inspection"
          class="labx-audio-viz labx-audio-viz--inspection lab-audio-viz-canvas"
          width="960"
          height="92"
          data-lab-viz="audio-waveform-inspection"
          data-lab-viz-mode="waveform"
          data-waveform-inspection-crop-start="${String(lens.cropStartRatio)}"
          data-waveform-inspection-crop-end="${String(lens.cropEndRatio)}"
        ></canvas>
      </div>
    </div>
  `;
}
