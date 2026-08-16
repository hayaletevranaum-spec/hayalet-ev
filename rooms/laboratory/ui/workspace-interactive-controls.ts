import { escapeHtml } from "../domain/lab-types.js";
import type { LabInteractiveSettings } from "../domain/lab-types.js";
import { LAB_FALLBACK_I18N } from "./lab-i18n.js";
import type { LabI18n } from "./lab-i18n.js";

function renderSlider(
  label: string,
  field: string,
  value: number,
  min: number,
  max: number,
  step: number,
  unit: string,
  resetValue: number
) {
  const fullField = `workspace.interactive.${field}`;
  const escapedLabel = escapeHtml(label);
  return `
    <div class="labx-control-row">
      <span class="labx-control-row__label">${escapedLabel}</span>
      <input
        class="labx-range"
        type="range"
        min="${String(min)}"
        max="${String(max)}"
        step="${String(step)}"
        value="${String(value)}"
        data-lab-field="${escapeHtml(fullField)}"
      />
      <span class="labx-control-row__value">${String(value)}${unit}</span>
      <div class="labx-control-stepper" aria-label="${escapedLabel}">
        <button class="labx-control-stepper__btn" type="button" data-lab-action="workspace-setting-adjust" data-lab-field="${escapeHtml(fullField)}" data-lab-delta="-${String(step)}" data-lab-min="${String(min)}" data-lab-max="${String(max)}" data-lab-step="${String(step)}" data-lab-reset-value="${String(resetValue)}" title="Decrease ${escapedLabel}">-</button>
        <button class="labx-control-stepper__btn" type="button" data-lab-action="workspace-setting-adjust" data-lab-field="${escapeHtml(fullField)}" data-lab-reset="true" data-lab-min="${String(min)}" data-lab-max="${String(max)}" data-lab-step="${String(step)}" data-lab-reset-value="${String(resetValue)}" title="Reset ${escapedLabel}">R</button>
        <button class="labx-control-stepper__btn" type="button" data-lab-action="workspace-setting-adjust" data-lab-field="${escapeHtml(fullField)}" data-lab-delta="${String(step)}" data-lab-min="${String(min)}" data-lab-max="${String(max)}" data-lab-step="${String(step)}" data-lab-reset-value="${String(resetValue)}" title="Increase ${escapedLabel}">+</button>
      </div>
    </div>
  `;
}

function renderToggle(label: string, field: string, active: boolean) {
  return `
    <label class="labx-control-toggle">
      <input
        type="checkbox"
        ${active ? "checked" : ""}
        data-lab-field="workspace.interactive.${field}"
      />
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

export function renderWorkspaceInteractiveControls(
  settings: LabInteractiveSettings,
  copy: LabI18n = LAB_FALLBACK_I18N
) {
  return `
    <section class="labx-card labx-controls-card labx-workspace-focus-row__panel" data-tone="accent">
      <div class="labx-card__body">
        <div class="labx-controls-stack">
          ${renderSlider(copy.t("mediaAnalysis.interactiveControls.fields.brightness", "Brightness"), "brightness", settings.brightness, 0, 200, 1, "%", 100)}
          ${renderSlider(copy.t("mediaAnalysis.interactiveControls.fields.contrast", "Contrast"), "contrast", settings.contrast, 0, 200, 1, "%", 100)}
          ${renderSlider(copy.t("mediaAnalysis.interactiveControls.fields.gamma", "Gamma"), "gamma", settings.gamma, 0.1, 5.0, 0.1, "", 1)}
          ${renderSlider(copy.t("mediaAnalysis.interactiveControls.fields.saturation", "Saturation"), "saturation", settings.saturation, 0, 200, 1, "%", 100)}
          ${renderSlider(copy.t("mediaAnalysis.interactiveControls.fields.hueRotate", "Hue Rotate"), "hueRotate", settings.hueRotate, 0, 360, 1, "°", 0)}
          ${renderSlider(copy.t("mediaAnalysis.interactiveControls.fields.sharpness", "Sharpness"), "sharpness", settings.sharpness, 0, 200, 1, "%", 100)}
        </div>
        <div class="labx-controls-toggles">
          <p class="labx-card__eyebrow">${escapeHtml(copy.t("mediaAnalysis.interactiveControls.channelTitle", "CHANNEL ISOLATE"))}</p>
          <div class="labx-toggle-row">
            ${renderToggle("R", "channelR", settings.channelR)}
            ${renderToggle("G", "channelG", settings.channelG)}
            ${renderToggle("B", "channelB", settings.channelB)}
          </div>
          ${renderToggle(copy.t("mediaAnalysis.interactiveControls.fields.edgeHighlight", "Edge Highlight"), "edgeHighlight", settings.edgeHighlight)}
          ${renderToggle(copy.t("mediaAnalysis.interactiveControls.fields.invert", "Invert"), "invert", settings.invert)}
        </div>
        <div class="labx-controls-actions">
          <button class="labx-inline-action" type="button" data-lab-action="workspace-reset-controls">${escapeHtml(copy.t("mediaAnalysis.interactiveControls.resetAction", "Reset All"))}</button>
        </div>
      </div>
    </section>
  `;
}
