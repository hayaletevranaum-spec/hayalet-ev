export type RepairInstrumentKind = "multimeter" | "power-supply" | "signal-gen";

export type RepairMultimeterMode =
  "dc-voltage" | "ac-voltage" | "resistance" | "continuity" | "diode" | "capacitance" | "frequency";

export interface RepairMultimeterReading {
  id: string;
  occurredAt: string;
  mode: RepairMultimeterMode;
  range: string;
  channel: string;
  rawDisplay: string;
  value: number | null;
  unit: string;
  reference: string | null;
}

export interface RepairMeasurementGroup {
  rail: string | null;
  component: string | null;
  powerDomain: string | null;
  investigationGroup: string | null;
}

export interface RepairMeasurementEvidence {
  eventId: string;
  reference: string;
  pinAt: { xPx: number; yPx: number } | null;
  group: RepairMeasurementGroup;
  history: RepairMultimeterReading[];
  previousReadingId: string | null;
  linkedAnnotationIds: string[];
  linkedAiMarkIds: string[];
}

export interface RepairMeasurementSnapshot {
  instrumentId: string;
  kind: RepairInstrumentKind;
  label: string;
  mode: RepairMultimeterMode;
  range: string;
  display: string;
  value: number | null;
  unit: string;
  hold: boolean;
  driftAmplitude: number;
}

export interface RepairMeasurementState {
  activeInstrumentKind: RepairInstrumentKind;
  current: RepairMeasurementSnapshot;
  recent: RepairMultimeterReading[];
  evidence: RepairMeasurementEvidence[];
  comparisonEventId: string | null;
}
