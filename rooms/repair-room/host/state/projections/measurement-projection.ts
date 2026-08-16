import type {
  RepairEvent,
  RepairMeasurementEvidenceState,
  RepairMeasurementEvent,
  RepairMeasurementGroup,
  RepairMeasurementState,
  RepairMultimeterReading,
} from "../../../shared/types/index.js";
import { sortRepairEventsForReplay } from "./replay-events.js";

export function measurementEventToReading(event: RepairMeasurementEvent): RepairMultimeterReading {
  return {
    id: event.id,
    occurredAt: event.occurredAt,
    mode: event.mode.toLowerCase().includes("ohm") ? "resistance" : "dc-voltage",
    range: event.range,
    channel: event.channel,
    rawDisplay: event.rawDisplay,
    value: event.value,
    unit: event.unit,
    reference: event.reference,
  };
}

export function normalizeMeasurementGroup(event: RepairMeasurementEvent): RepairMeasurementGroup {
  return {
    rail: event.group?.rail ?? null,
    component: event.group?.component ?? event.reference ?? null,
    powerDomain: event.group?.powerDomain ?? null,
    investigationGroup: event.group?.investigationGroup ?? null,
  };
}

export function measurementGroupLabel(
  group: RepairMeasurementGroup,
  event: RepairMeasurementEvent
): string {
  return (
    group.investigationGroup ??
    group.powerDomain ??
    group.rail ??
    group.component ??
    event.reference ??
    event.channel
  );
}

export function buildMeasurementEvidence(events: RepairEvent[]): {
  evidence: RepairMeasurementEvidenceState[];
  measurementStateEvidence: RepairMeasurementState["evidence"];
  recent: RepairMultimeterReading[];
} {
  const measurements = events.filter(
    (event): event is RepairMeasurementEvent => event.kind === "measurement"
  );
  const grouped = new Map<string, RepairMeasurementEvent[]>();

  measurements.forEach((event) => {
    const group = normalizeMeasurementGroup(event);
    const key = measurementGroupLabel(group, event);
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  });

  const evidence: RepairMeasurementEvidenceState[] = [];
  const measurementStateEvidence: RepairMeasurementState["evidence"] = [];
  const recent = measurements.map(measurementEventToReading).reverse();

  grouped.forEach((groupEvents) => {
    const ordered = sortRepairEventsForReplay(groupEvents) as RepairMeasurementEvent[];
    const current = ordered.at(-1);
    if (current === undefined) return;
    const previous = ordered.at(-2) ?? null;
    const group = normalizeMeasurementGroup(current);
    const reference = current.reference ?? current.channel;
    const history = ordered.map((event) => `${event.rawDisplay}${event.unit}`);
    evidence.push({
      eventId: current.id,
      reference,
      groupLabel: measurementGroupLabel(group, current),
      history,
      previousDisplay: previous === null ? null : `${previous.rawDisplay}${previous.unit}`,
      currentDisplay: `${current.rawDisplay}${current.unit}`,
      pinAt: current.pinAt,
    });
    measurementStateEvidence.push({
      eventId: current.id,
      reference,
      pinAt: current.pinAt,
      group,
      history: ordered.map(measurementEventToReading),
      previousReadingId: previous?.id ?? null,
      linkedAnnotationIds: current.linkedAnnotationIds ?? [],
      linkedAiMarkIds: current.linkedAiMarkIds ?? [],
    });
  });

  return { evidence, measurementStateEvidence, recent };
}
