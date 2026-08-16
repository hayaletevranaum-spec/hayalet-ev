import type { RepairUiState } from "../../shared/ui/state.js";
import { setTextIfChanged } from "./dom-utils.js";
import {
  getMeasurementDisplayLabel,
  getMeasurementModeRangeText,
  type RepairMeasurementTextFn,
} from "./measurement-labels.js";

export function createRepairMeasurementDomRuntime(params: {
  documentRef: Document;
  state: RepairUiState;
  text: RepairMeasurementTextFn;
}) {
  const { documentRef, state, text } = params;

  function appendMeasurementReadingRow(
    list: HTMLElement,
    reading: RepairUiState["measurement"]["recent"][number]
  ): void {
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

    list.append(row);
  }

  function appendMeasurementEmptyState(list: HTMLElement): void {
    const empty = documentRef.createElement("div");
    empty.className = "repair-readings-empty";
    empty.textContent = text(["measurement", "labels", "noPreviousReadings"], "Önceki ölçüm yok");
    list.append(empty);
  }

  function syncMeasurementInstrumentTabs(panel: HTMLElement): void {
    const hasActiveSession = state.sessions.activeId !== null && state.sessions.detail !== null;
    panel.querySelectorAll<HTMLElement>("[data-repair-action='set-instrument']").forEach((tab) => {
      const active =
        hasActiveSession &&
        tab.dataset["instrumentKind"] === state.measurement.activeInstrumentKind;
      tab.classList.toggle("repair-tab--active", active);
      tab.setAttribute("aria-pressed", String(active));
      if (tab instanceof HTMLButtonElement) tab.disabled = !hasActiveSession;
    });
  }

  function updateMeasurementLiveDom(root: Document | HTMLElement = documentRef): void {
    const current = state.measurement.current;
    const value = root.querySelector<HTMLElement>(".repair-measurement-display__value");
    if (value !== null) setTextIfChanged(value, current.display);
    const unit = root.querySelector<HTMLElement>(".repair-measurement-display__unit");
    if (unit !== null) setTextIfChanged(unit, current.unit);
    const label = root.querySelector<HTMLElement>(".repair-measurement-display__label");
    if (label !== null) setTextIfChanged(label, getMeasurementDisplayLabel(current.label, text));
    const mode = root.querySelector<HTMLElement>(".repair-measurement-display__mode");
    if (mode !== null)
      setTextIfChanged(mode, getMeasurementModeRangeText(current.mode, current.range, text));

    const readingsList = root.querySelector<HTMLElement>(".repair-readings-list");
    if (readingsList === null) return;
    const latestReading = state.measurement.recent.at(0);
    const previousReadings =
      latestReading !== undefined &&
      latestReading.rawDisplay === current.display &&
      latestReading.unit === current.unit
        ? state.measurement.recent.slice(1)
        : state.measurement.recent;
    const fingerprint = previousReadings
      .map((reading) => `${reading.id}:${reading.rawDisplay}`)
      .join("|");
    if (readingsList.dataset["fingerprint"] === fingerprint) return;
    readingsList.dataset["fingerprint"] = fingerprint;
    readingsList.replaceChildren();
    if (previousReadings.length === 0) {
      appendMeasurementEmptyState(readingsList);
      return;
    }
    previousReadings.forEach((reading) => {
      appendMeasurementReadingRow(readingsList, reading);
    });
  }

  function updateMeasurementEntryDom(root: HTMLElement): void {
    syncMeasurementInstrumentTabs(root);
    updateMeasurementLiveDom(root);
  }

  return {
    updateMeasurementEntryDom,
    updateMeasurementLiveDom,
  };
}
