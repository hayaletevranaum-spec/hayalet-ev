import type { RepairMultimeterMode } from "../../shared/types/index.js";

export type RepairMeasurementTextFn = (path: string[], fallback: string) => string;

export function getMeasurementModeLabel(
  mode: RepairMultimeterMode,
  text: RepairMeasurementTextFn
): string {
  switch (mode) {
    case "dc-voltage":
      return text(["measurement", "labels", "dcVoltage"], "DC Voltaj");
    case "ac-voltage":
      return text(["measurement", "labels", "acVoltage"], "AC Voltaj");
    case "resistance":
      return text(["measurement", "labels", "resistance"], "Direnç");
    case "continuity":
      return text(["measurement", "labels", "continuity"], "Süreklilik");
    case "diode":
      return text(["measurement", "labels", "diode"], "Diyot");
    case "capacitance":
      return text(["measurement", "labels", "capacitance"], "Kapasitans");
    case "frequency":
      return text(["measurement", "labels", "frequency"], "Frekans");
    default: {
      const exhaustiveMode: never = mode;
      return exhaustiveMode;
    }
  }
}

export function getMeasurementModeOptions(
  text: RepairMeasurementTextFn
): Array<{ value: RepairMultimeterMode; label: string }> {
  return [
    { value: "dc-voltage", label: getMeasurementModeLabel("dc-voltage", text) },
    { value: "ac-voltage", label: getMeasurementModeLabel("ac-voltage", text) },
    { value: "resistance", label: getMeasurementModeLabel("resistance", text) },
    { value: "continuity", label: getMeasurementModeLabel("continuity", text) },
    { value: "diode", label: getMeasurementModeLabel("diode", text) },
    { value: "capacitance", label: getMeasurementModeLabel("capacitance", text) },
    { value: "frequency", label: getMeasurementModeLabel("frequency", text) },
  ];
}

export function getMeasurementDisplayLabel(label: string, text: RepairMeasurementTextFn): string {
  if (label.trim().toLowerCase() === "manual entry") {
    return text(["measurement", "manualEntry"], "Manuel Okuma");
  }
  return label;
}

export function getMeasurementModeRangeText(
  mode: RepairMultimeterMode,
  range: string,
  text: RepairMeasurementTextFn
): string {
  return `${getMeasurementModeLabel(mode, text)} / ${range}`;
}
