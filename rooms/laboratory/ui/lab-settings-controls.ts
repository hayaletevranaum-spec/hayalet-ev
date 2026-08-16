import { escapeHtml } from "../domain/lab-types.js";
import type { LabSettingsFieldMeta, LabSettingsRecord } from "../domain/lab-types.js";
import { ensureAdvancedAudioAnalysisSettingsRegistered } from "../domain/lab-advanced-audio-settings.js";
import { ensureLabImageComparisonMouseToolsBound } from "./lab-image-comparison-mouse-tools.js";
import { ensureLabImageComparisonToolbarBound } from "./lab-image-comparison-toolbar.js";

ensureAdvancedAudioAnalysisSettingsRegistered();
ensureLabImageComparisonToolbarBound();

type LabSettingsTranslate = (
  key: string,
  fallback: string,
  params?: Record<string, string | number>
) => string;

type RenderLabSettingsFieldsParams = {
  fields: LabSettingsFieldMeta[];
  prefix: string;
  resetAction: string;
  resetLabel?: string;
  resetValue: string;
  settings: LabSettingsRecord;
  title: string;
  toggleLabel?: string;
  translate?: LabSettingsTranslate;
  variant?: "collapsible" | "inline";
};

const IMAGE_COMPARISON_MOVE_FIELD_IDS = new Set([
  "primaryOffsetX",
  "primaryOffsetY",
  "referenceOffsetX",
  "referenceOffsetY",
]);

const IMAGE_COMPARISON_RESIZE_FIELD_IDS = new Set([
  "primaryAspectLock",
  "primaryScaleX",
  "primaryScaleY",
  "primaryRotation",
  "referenceAspectLock",
  "referenceScaleX",
  "referenceScaleY",
  "referenceRotation",
]);

const IMAGE_COMPARISON_ZOOM_FIELD_IDS = new Set(["primaryZoom", "referenceZoom"]);

const IMAGE_COMPARISON_MARKER_FIELD_IDS = new Set([
  "marker1Enabled",
  "marker1Side",
  "marker1X",
  "marker1Y",
  "marker2Enabled",
  "marker2Side",
  "marker2X",
  "marker2Y",
  "marker3Enabled",
  "marker3Side",
  "marker3X",
  "marker3Y",
]);

function isImageComparisonTransformField(fieldId: string) {
  return (
    IMAGE_COMPARISON_MOVE_FIELD_IDS.has(fieldId) ||
    IMAGE_COMPARISON_RESIZE_FIELD_IDS.has(fieldId) ||
    IMAGE_COMPARISON_ZOOM_FIELD_IDS.has(fieldId)
  );
}

function getFieldValue(settings: LabSettingsRecord, field: LabSettingsFieldMeta) {
  const value = settings[field.id];
  return value === undefined || value === null ? "" : String(value);
}

function translateSettingField(
  translate: LabSettingsTranslate | undefined,
  field: LabSettingsFieldMeta
) {
  return translate
    ? translate(`mediaAnalysis.settings.fields.${field.id}`, field.label)
    : field.label;
}

function translateSettingOption(
  translate: LabSettingsTranslate | undefined,
  value: string,
  fallback: string
) {
  return translate ? translate(`mediaAnalysis.settings.options.${value}`, fallback) : fallback;
}

function renderSelect(
  field: LabSettingsFieldMeta,
  value: string,
  fieldPath: string,
  translate: LabSettingsTranslate | undefined
) {
  const options = field.options || [];
  return `
    <select class="labx-settings-field__control" data-lab-field="${escapeHtml(fieldPath)}">
      ${options
        .map(function (option) {
          return `<option value="${escapeHtml(option.value)}" ${
            value === option.value ? "selected" : ""
          }>${escapeHtml(translateSettingOption(translate, option.value, option.label))}</option>`;
        })
        .join("")}
    </select>
  `;
}

function renderToggle(value: string, fieldPath: string) {
  return `
    <input
      class="labx-settings-field__control"
      type="checkbox"
      data-lab-field="${escapeHtml(fieldPath)}"
      ${value === "true" ? "checked" : ""}
    />
  `;
}

function renderNumber(field: LabSettingsFieldMeta, value: string, fieldPath: string) {
  return `
    <input
      class="labx-settings-field__control"
      type="number"
      data-lab-field="${escapeHtml(fieldPath)}"
      value="${escapeHtml(value)}"
      ${typeof field.min === "number" ? `min="${String(field.min)}"` : ""}
      ${typeof field.max === "number" ? `max="${String(field.max)}"` : ""}
      ${typeof field.step === "number" ? `step="${String(field.step)}"` : ""}
    />
    ${field.unit ? `<span class="labx-settings-field__unit">${escapeHtml(field.unit)}</span>` : ""}
  `;
}

function renderField(
  field: LabSettingsFieldMeta,
  settings: LabSettingsRecord,
  prefix: string,
  translate: LabSettingsTranslate | undefined
) {
  const fieldPath = `${prefix}.${field.id}`;
  const value = getFieldValue(settings, field);
  const control =
    field.kind === "select"
      ? renderSelect(field, value, fieldPath, translate)
      : field.kind === "toggle"
        ? renderToggle(value, fieldPath)
        : renderNumber(field, value, fieldPath);
  return `
    <label class="labx-settings-field" data-setting-kind="${escapeHtml(field.kind)}">
      <span class="labx-settings-field__label">${escapeHtml(translateSettingField(translate, field))}</span>
      <span class="labx-settings-field__input">${control}</span>
    </label>
  `;
}

function formatSettingValue(
  field: LabSettingsFieldMeta,
  value: string,
  translate: LabSettingsTranslate | undefined
) {
  if (field.kind === "toggle") {
    return value === "true"
      ? translateSettingOption(translate, "enabled", "On")
      : translateSettingOption(translate, "disabled", "Off");
  }
  if (field.kind === "select") {
    const option = (field.options || []).find(function (entry) {
      return entry.value === value;
    });
    return translateSettingOption(translate, value, option?.label || value);
  }
  return `${value}${field.unit ? ` ${field.unit}` : ""}`.trim();
}

function renderSettingsSummary(
  fields: LabSettingsFieldMeta[],
  settings: LabSettingsRecord,
  translate: LabSettingsTranslate | undefined
) {
  const summary = fields
    .slice(0, 3)
    .map(function (field) {
      const value = getFieldValue(settings, field);
      if (value === "") {
        return null;
      }
      return `${translateSettingField(translate, field)}: ${formatSettingValue(field, value, translate)}`;
    })
    .filter((entry): entry is string => entry !== null)
    .join(" · ");
  return summary === ""
    ? ""
    : `<span class="labx-settings-block__state">${escapeHtml(summary)}</span>`;
}

function renderFieldsGrid(
  fields: LabSettingsFieldMeta[],
  params: RenderLabSettingsFieldsParams,
  className = ""
) {
  if (fields.length === 0) {
    return "";
  }
  return `<div class="labx-settings-grid${className ? ` ${className}` : ""}">${fields
    .map(function (field) {
      return renderField(field, params.settings, params.prefix, params.translate);
    })
    .join("")}</div>`;
}

function renderComparisonMouseToolPanel(
  mode: "move" | "resize" | "zoom",
  fields: LabSettingsFieldMeta[],
  params: RenderLabSettingsFieldsParams
) {
  const hint =
    mode === "move"
      ? "A veya B resmini mouse ile sürükleyerek taşıyın. X/Y alanları hassas konum ayarı içindir."
      : mode === "resize"
        ? "Mouse ile sürükleyerek resmi boyutlandırın. Oran kilidi açıkken X ve Y birlikte değişir."
        : "Mouse ile yukarı/sağa sürükleyerek veya tekerleği yukarı çevirerek yakınlaştırın; ters yönde uzaklaştırın.";
  return `
    <section
      class="labx-comparison-toolbox"
      data-lab-image-comparison-toolbox="true"
      data-comparison-tool-panel="${mode}"
    >
      <p class="labx-comparison-toolbox__hint">${escapeHtml(hint)}</p>
      ${renderFieldsGrid(fields, params, "labx-settings-grid--comparison-precision")}
    </section>
  `;
}

function renderImageComparisonSettings(params: RenderLabSettingsFieldsParams) {
  ensureLabImageComparisonToolbarBound();
  ensureLabImageComparisonMouseToolsBound();
  const showImageFrames = params.settings["showImageFrames"] !== false;
  const moveFields = params.fields.filter(function (field) {
    return IMAGE_COMPARISON_MOVE_FIELD_IDS.has(field.id);
  });
  const resizeFields = params.fields.filter(function (field) {
    return IMAGE_COMPARISON_RESIZE_FIELD_IDS.has(field.id);
  });
  const zoomFields = params.fields.filter(function (field) {
    return IMAGE_COMPARISON_ZOOM_FIELD_IDS.has(field.id);
  });
  const markerFields = params.fields.filter(function (field) {
    return IMAGE_COMPARISON_MARKER_FIELD_IDS.has(field.id);
  });
  const baseFields = params.fields.filter(function (field) {
    return (
      !isImageComparisonTransformField(field.id) && !IMAGE_COMPARISON_MARKER_FIELD_IDS.has(field.id)
    );
  });
  const resetLabel = params.resetLabel || "Reset";

  return `
    <div
      class="labx-settings-block labx-settings-block--inline labx-image-comparison-settings"
      data-panel-id="${escapeHtml(params.prefix)}"
    >
      <div class="labx-settings-block__toolbar labx-image-comparison-settings__general-toolbar">
        <button
          class="labx-settings-block__reset"
          type="button"
          data-lab-action="${escapeHtml(params.resetAction)}"
          data-lab-value="${escapeHtml(params.resetValue)}"
        >${escapeHtml(resetLabel)}</button>
      </div>
      ${renderFieldsGrid(baseFields, params, "labx-settings-grid--comparison-base")}
      <label class="labx-settings-field labx-image-comparison-settings__frame-toggle" data-setting-kind="toggle">
        <span class="labx-settings-field__label">Resim çerçevelerini göster</span>
        <span class="labx-settings-field__input">
          <input
            class="labx-settings-field__control"
            type="checkbox"
            data-lab-field="${escapeHtml(`${params.prefix}.showImageFrames`)}"
            ${showImageFrames ? "checked" : ""}
          />
        </span>
      </label>
      ${renderComparisonMouseToolPanel("move", moveFields, params)}
      ${renderComparisonMouseToolPanel("resize", resizeFields, params)}
      ${renderComparisonMouseToolPanel("zoom", zoomFields, params)}
      ${
        markerFields.length > 0
          ? `<details class="labx-image-comparison-settings__markers"><summary>İşaretler</summary>${renderFieldsGrid(markerFields, params, "labx-settings-grid--comparison-markers")}</details>`
          : ""
      }
    </div>
  `;
}

export function renderLabSettingsFields(params: RenderLabSettingsFieldsParams) {
  if (params.fields.length === 0) {
    return "";
  }
  if (params.prefix === "operationSettings.image-comparison") {
    return renderImageComparisonSettings(params);
  }
  const resetLabel = params.resetLabel || "Reset";
  const fieldsMarkup = params.fields
    .map(function (field) {
      return renderField(field, params.settings, params.prefix, params.translate);
    })
    .join("");
  const toolbarMarkup = `
    <div class="labx-settings-block__toolbar">
      <button
        class="labx-settings-block__reset"
        type="button"
        data-lab-action="${escapeHtml(params.resetAction)}"
        data-lab-value="${escapeHtml(params.resetValue)}"
      >${escapeHtml(resetLabel)}</button>
    </div>
  `;

  if (params.variant === "inline") {
    return `
      <div
        class="labx-settings-block labx-settings-block--inline"
        data-panel-id="${escapeHtml(params.prefix)}"
      >
        ${toolbarMarkup}
        <div class="labx-settings-grid">
          ${fieldsMarkup}
        </div>
      </div>
    `;
  }

  return `
    <details
      class="labx-settings-block"
      data-lab-collapsible-panel="true"
      data-panel-id="${escapeHtml(params.prefix)}"
    >
      <summary class="labx-settings-block__summary">
        <span class="labx-settings-block__summary-main">
          <span class="labx-settings-block__title">${escapeHtml(params.title)}</span>
          ${renderSettingsSummary(params.fields, params.settings, params.translate)}
        </span>
        <span class="labx-settings-block__action">${escapeHtml(params.toggleLabel || "Edit")}</span>
      </summary>
      ${toolbarMarkup}
      <div class="labx-settings-grid">
        ${fieldsMarkup}
      </div>
    </details>
  `;
}
