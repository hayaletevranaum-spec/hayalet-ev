import { escapeHtml } from "../domain/lab-types.js";
import type { LabActionSuggestion, LabInterpretationItem } from "../domain/lab-types.js";
import type { LabI18n } from "./lab-i18n.js";

export function isOperationSuggestion(suggestion: LabActionSuggestion) {
  if (suggestion.flowKind === "operation-result") {
    return true;
  }
  if (suggestion.flowKind === "analysis-report") {
    return false;
  }
  return (
    suggestion.actionType === "extract-clip" ||
    suggestion.actionType === "enhance-visual" ||
    suggestion.actionType === "enhance-frame" ||
    suggestion.actionType === "crop-region" ||
    suggestion.actionType === "clean-audio" ||
    suggestion.actionType === "separate-stems" ||
    suggestion.actionType === "stabilize-segment"
  );
}

export function formatTimePrecise(ms: number) {
  const totalMs = Math.round(ms);
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const millis = totalMs % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function formatDuration(ms: number) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

function formatInterpretationType(type: LabInterpretationItem["type"], copy: LabI18n) {
  const fallback = (
    {
      hint: "Hint",
      info: "Info",
      warning: "Warning",
    } as const
  )[type];
  return copy.t(`mediaAnalysis.timeline.interpretationTypes.${type}`, fallback);
}

function formatInterpretationSeverity(severity: LabInterpretationItem["severity"], copy: LabI18n) {
  if (severity === undefined) {
    return "";
  }
  const fallback = (
    {
      high: "High",
      low: "Low",
      medium: "Medium",
    } as const
  )[severity];
  return copy.t(`mediaAnalysis.timeline.severity.${severity}`, fallback);
}

function getInterpretationIcon(type: LabInterpretationItem["type"]) {
  return (
    {
      info: "i",
      warning: "!",
      hint: "~",
    } as const
  )[type];
}

export function renderInterpretationPanel(
  items: LabInterpretationItem[],
  variant: "embedded" | "standalone",
  copy: LabI18n
) {
  if (items.length === 0) {
    return "";
  }
  return `
    <details class="lab-interpretation-panel lab-interpretation-panel--${variant}" data-lab-interpretation-panel="true" open>
      <summary class="lab-interpretation-panel__summary">
        <span class="lab-interpretation-panel__eyebrow">${escapeHtml(copy.t("mediaAnalysis.timeline.interpretation", "Interpretation"))}</span>
        <span class="lab-interpretation-panel__count">${String(items.length)}</span>
      </summary>
      <div class="lab-interpretation-panel__list">
        ${items
          .map(function (item) {
            const severityLabel = formatInterpretationSeverity(item.severity, copy);
            return `<div class="lab-interpretation-panel__item" data-tone="${escapeHtml(item.type)}"${item.severity ? ` data-severity="${escapeHtml(item.severity)}"` : ""}>
              <span class="lab-interpretation-panel__icon" aria-hidden="true">${escapeHtml(getInterpretationIcon(item.type))}</span>
              <div class="lab-interpretation-panel__copy">
                <div class="lab-interpretation-panel__meta">${escapeHtml(formatInterpretationType(item.type, copy))}${severityLabel ? `<span class="lab-interpretation-panel__severity">${escapeHtml(severityLabel)}</span>` : ""}</div>
                <div class="lab-interpretation-panel__message">${escapeHtml(item.message)}</div>
                ${
                  item.recommendation
                    ? `<div class="lab-interpretation-panel__recommendation">&rarr; ${escapeHtml(item.recommendation)}</div>`
                    : ""
                }
              </div>
            </div>`;
          })
          .join("")}
      </div>
    </details>
  `;
}
