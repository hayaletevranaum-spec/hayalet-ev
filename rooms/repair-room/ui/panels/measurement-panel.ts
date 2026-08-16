import type { RepairUiState } from "../../shared/ui/state.js";
import {
  getMeasurementDisplayLabel,
  getMeasurementModeOptions,
  getMeasurementModeRangeText,
} from "../runtime/measurement-labels.js";

type TextFn = (path: string[], fallback: string) => string;

interface RepairMeasurementEntryOptions {
  className?: string;
  showReadings?: boolean;
}

const MEASUREMENT_UNIT_OPTIONS = [
  "V",
  "mV",
  "A",
  "mA",
  "Ohm",
  "kOhm",
  "MOhm",
  "F",
  "uF",
  "nF",
  "Hz",
];

function createFieldShell(documentRef: Document, labelText: string): HTMLLabelElement {
  const field = documentRef.createElement("label");
  field.className = "repair-measurement-field";

  const label = documentRef.createElement("span");
  label.className = "repair-measurement-field__label";
  label.textContent = labelText;
  field.append(label);

  return field;
}

function appendTextInput(
  documentRef: Document,
  parent: HTMLElement,
  options: {
    label: string;
    inputName: string;
    placeholder: string;
    value?: string;
    inputMode?: "decimal" | "text";
    required?: boolean;
  }
): HTMLInputElement {
  const field = createFieldShell(documentRef, options.label);
  const input = documentRef.createElement("input");
  input.className = "repair-measurement-field__control";
  input.type = "text";
  input.placeholder = options.placeholder;
  input.value = options.value ?? "";
  input.dataset["repairInput"] = options.inputName;
  if (options.inputMode !== undefined) input.inputMode = options.inputMode;
  if (options.required === true) input.required = true;
  field.append(input);
  parent.append(field);
  return input;
}

function appendSelectInput(
  documentRef: Document,
  parent: HTMLElement,
  options: {
    label: string;
    inputName: string;
    selected: string;
    items: Array<{ value: string; label: string }>;
  }
): HTMLSelectElement {
  const field = createFieldShell(documentRef, options.label);
  const select = documentRef.createElement("select");
  select.className = "repair-measurement-field__control";
  select.dataset["repairInput"] = options.inputName;

  options.items.forEach((item) => {
    const option = documentRef.createElement("option");
    option.value = item.value;
    option.textContent = item.label;
    option.selected = item.value === options.selected;
    select.append(option);
  });

  field.append(select);
  parent.append(field);
  return select;
}

function appendReadingsEmptyState(documentRef: Document, list: HTMLElement, text: TextFn): void {
  const empty = documentRef.createElement("div");
  empty.className = "repair-readings-empty";
  empty.textContent = text(["measurement", "labels", "noPreviousReadings"], "Önceki ölçüm yok");
  list.append(empty);
}

export function renderMeasurementEntrySurface(
  documentRef: Document,
  state: RepairUiState,
  text: TextFn,
  options: RepairMeasurementEntryOptions = {}
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = options.className ?? "repair-measurement-entry";
  const showReadings = options.showReadings === true;

  const meas = state.measurement;
  const hasActiveSession = state.sessions.activeId !== null && state.sessions.detail !== null;
  const latestReading = meas.recent.at(0);
  const previousReadings =
    latestReading !== undefined &&
    latestReading.rawDisplay === meas.current.display &&
    latestReading.unit === meas.current.unit
      ? meas.recent.slice(1)
      : meas.recent;

  // -- Tabs
  const tabs = documentRef.createElement("div");
  tabs.className = "repair-tabs";

  const tabItems = [
    { id: "multimeter", label: text(["measurement", "tabMultimeter"], "Multimetre") },
    { id: "power-supply", label: text(["measurement", "tabPsu"], "Güç Kaynağı") },
    { id: "signal-gen", label: text(["measurement", "tabSigGen"], "Sinyal Üretici") },
  ];

  for (const tab of tabItems) {
    const isActive = hasActiveSession && meas.activeInstrumentKind === tab.id;
    const tabEl = documentRef.createElement("button");
    tabEl.type = "button";
    tabEl.className = `repair-tab repair-measurement-tab${isActive ? " repair-tab--active" : ""}`;
    tabEl.textContent = tab.label;
    tabEl.disabled = !hasActiveSession;
    tabEl.setAttribute("aria-pressed", String(isActive));
    tabEl.dataset["repairAction"] = "set-instrument";
    tabEl.dataset["instrumentKind"] = tab.id;
    tabs.append(tabEl);
  }

  body.append(tabs);

  // -- Current reading display
  const display = documentRef.createElement("div");
  display.className = "repair-measurement-display";

  const primary = documentRef.createElement("div");
  primary.className = "repair-measurement-display__primary";

  const valueEl = documentRef.createElement("div");
  valueEl.className = "repair-measurement-display__value";
  valueEl.textContent = meas.current.display;
  primary.append(valueEl);

  const unitEl = documentRef.createElement("div");
  unitEl.className = "repair-measurement-display__unit";
  unitEl.textContent = meas.current.unit;
  primary.append(unitEl);
  display.append(primary);

  const meta = documentRef.createElement("div");
  meta.className = "repair-measurement-display__meta";

  const labelEl = documentRef.createElement("div");
  labelEl.className = "repair-measurement-display__label";
  labelEl.textContent = getMeasurementDisplayLabel(meas.current.label, text);
  meta.append(labelEl);

  const modeEl = documentRef.createElement("div");
  modeEl.className = "repair-measurement-display__mode";
  modeEl.textContent = getMeasurementModeRangeText(meas.current.mode, meas.current.range, text);
  meta.append(modeEl);
  display.append(meta);

  body.append(display);

  const form = documentRef.createElement("div");
  form.className = "repair-measurement-form";

  appendTextInput(documentRef, form, {
    label: text(["measurement", "reference"], "Referans"),
    inputName: "measurement-reference",
    placeholder: "TP1 / U14 VCC",
  });
  appendTextInput(documentRef, form, {
    label: text(["measurement", "value"], "Değer"),
    inputName: "measurement-raw-display",
    placeholder: "0.000 / OL",
    inputMode: "decimal",
    required: true,
  });
  appendSelectInput(documentRef, form, {
    label: text(["measurement", "mode"], "Mod"),
    inputName: "measurement-mode",
    selected: meas.current.mode,
    items: getMeasurementModeOptions(text),
  });
  appendSelectInput(documentRef, form, {
    label: text(["measurement", "unit"], "Birim"),
    inputName: "measurement-unit",
    selected: meas.current.unit || "V",
    items: MEASUREMENT_UNIT_OPTIONS.map((unit) => ({ value: unit, label: unit })),
  });
  appendTextInput(documentRef, form, {
    label: text(["measurement", "range"], "Aralık"),
    inputName: "measurement-range",
    placeholder: meas.current.range === "-" ? "20 V" : meas.current.range,
  });
  appendTextInput(documentRef, form, {
    label: text(["measurement", "channel"], "Kanal"),
    inputName: "measurement-channel",
    placeholder: "COM/V",
    value: "COM/V",
  });

  const record = documentRef.createElement("button");
  record.className = "repair-measurement-form__action";
  record.type = "button";
  record.textContent = text(["measurement", "record"], "Kaydet");
  record.dataset["repairAction"] = "add-manual-measurement";
  record.disabled = !hasActiveSession;
  record.title = hasActiveSession
    ? text(["measurement", "recordTitle"], "Manuel ölçüm kaydet")
    : text(["measurement", "recordDisabled"], "Önce bir tamir oturumu aç");
  form.append(record);
  body.append(form);

  if (!showReadings) return body;

  // -- Recent readings
  const readingsHeader = documentRef.createElement("div");
  readingsHeader.className = "repair-section-label repair-measurement-section-label";
  readingsHeader.textContent = text(["measurement", "previous"], "Önceki Okumalar");
  body.append(readingsHeader);

  const readingsList = documentRef.createElement("div");
  readingsList.className = "repair-readings-list";

  if (previousReadings.length === 0) {
    appendReadingsEmptyState(documentRef, readingsList, text);
  }

  for (const reading of previousReadings) {
    const row = documentRef.createElement("div");
    row.className = "repair-reading-row";

    const ref = documentRef.createElement("span");
    ref.className = "repair-reading-row__ref";
    ref.textContent = reading.reference ?? reading.channel;
    row.append(ref);

    const val = documentRef.createElement("span");
    val.className = "repair-reading-row__value";
    val.textContent = reading.rawDisplay;
    row.append(val);

    const unit = documentRef.createElement("span");
    unit.className = "repair-reading-row__unit";
    unit.textContent = reading.unit;
    row.append(unit);

    readingsList.append(row);
  }

  body.append(readingsList);

  return body;
}
