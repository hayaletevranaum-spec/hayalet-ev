import { REPAIR_UI_COLORS } from "../../shared/repair-constants.js";
import type {
  RepairAnnotationTool,
  RepairEvent,
  RepairImageRect,
  RepairInvestigationRegionCreatedEvent,
  RepairInvestigationRegionStatus,
  RepairInvestigationRegionUpdatedEvent,
  RepairMeasurementEvent,
  RepairMultimeterMode,
  RepairMultimeterReading,
  RepairOverlayEntityRef,
  RepairSession,
  RepairWorkbenchDrawTool,
} from "../../shared/types/index.js";
import { safeNumber, safeString } from "./guards.js";

export function createEventId(prefix: string, _iso: string): string {
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

const REPAIR_MULTIMETER_MODES: ReadonlySet<string> = new Set([
  "dc-voltage",
  "ac-voltage",
  "resistance",
  "continuity",
  "diode",
  "capacitance",
  "frequency",
]);

function getAnnotationMetaTool(tool: RepairWorkbenchDrawTool): RepairAnnotationTool {
  if (tool === "measurement-pin") return "measurement-link";
  if (tool === "circle") return "rect";
  return tool;
}

function readMeasurementMode(value: unknown): RepairMultimeterMode {
  return typeof value === "string" && REPAIR_MULTIMETER_MODES.has(value)
    ? (value as RepairMultimeterMode)
    : "dc-voltage";
}

export function createSnapshotEvent(
  sessionId: string,
  iso: string,
  caption: string,
  thumbnailSrc: string | null = null
): RepairEvent {
  return {
    kind: "snapshot",
    id: createEventId("evt-snap", iso),
    sessionId,
    occurredAt: iso,
    source: "operator",
    linkedEventIds: [],
    thumbnailSrc,
    caption,
  };
}

export function createAnnotationEvent(
  sessionId: string,
  iso: string,
  tool: RepairWorkbenchDrawTool,
  payload: Record<string, unknown>
): RepairEvent {
  const xPx = safeNumber(payload["xPx"]) ?? 520;
  const yPx = safeNumber(payload["yPx"]) ?? 320;
  const widthPx = Math.max(tool === "arrow" ? 1 : 28, safeNumber(payload["widthPx"]) ?? 112);
  const heightPx = Math.max(tool === "arrow" ? 0 : 28, safeNumber(payload["heightPx"]) ?? 84);
  const label =
    safeString(payload["label"]) ??
    (tool === "measurement-pin" ? "Measurement pin" : "Operator annotation");
  return {
    kind: "annotation",
    id: createEventId("evt-anno", iso),
    sessionId,
    occurredAt: iso,
    source: "operator",
    linkedEventIds: [],
    tool,
    region: tool === "measurement-pin" ? null : { xPx, yPx, widthPx, heightPx },
    point: tool === "measurement-pin" ? { xPx, yPx } : null,
    label,
    color: safeString(payload["color"]) ?? REPAIR_UI_COLORS.cyan,
    meta: {
      author: "operator",
      tool: getAnnotationMetaTool(tool),
      label,
      color: safeString(payload["color"]) ?? REPAIR_UI_COLORS.cyan,
      linkedMeasurementIds:
        typeof payload["linkedMeasurementId"] === "string" ? [payload["linkedMeasurementId"]] : [],
      linkedEventIds:
        typeof payload["linkedEventId"] === "string" ? [payload["linkedEventId"]] : [],
    },
  };
}

export function createMeasurementReading(
  iso: string,
  payload: Record<string, unknown>
): RepairMultimeterReading {
  const rawDisplay = safeString(payload["rawDisplay"]) ?? "0.000";
  const value = rawDisplay === "OL" ? null : (safeNumber(payload["value"]) ?? Number(rawDisplay));
  return {
    id: createEventId("reading", iso),
    occurredAt: iso,
    mode: readMeasurementMode(payload["mode"]),
    range: safeString(payload["range"]) ?? "Auto V",
    channel: safeString(payload["channel"]) ?? "COM/V",
    rawDisplay,
    value: Number.isFinite(value) ? value : null,
    unit: safeString(payload["unit"]) ?? "V",
    reference: safeString(payload["reference"]) ?? "Manual probe",
  };
}

export function createMeasurementEvent(
  sessionId: string,
  iso: string,
  reading: RepairMultimeterReading,
  payload: Record<string, unknown>
): RepairMeasurementEvent {
  return {
    kind: "measurement",
    id: createEventId("evt-meas", iso),
    sessionId,
    occurredAt: iso,
    source: "instrument",
    linkedEventIds: [],
    instrumentId: safeString(payload["instrumentId"]) ?? "manual-meter",
    channel: reading.channel,
    mode: reading.mode,
    range: reading.range,
    value: reading.value,
    rawDisplay: reading.rawDisplay,
    unit: reading.unit,
    pinAt: {
      xPx: safeNumber(payload["xPx"]) ?? 624,
      yPx: safeNumber(payload["yPx"]) ?? 320,
    },
    reference: reading.reference,
  };
}

export function createInvestigationRegionCreatedEvent(
  session: RepairSession,
  iso: string,
  payload: {
    label: string;
    region: RepairImageRect;
    status: RepairInvestigationRegionStatus;
    color: string;
    sourceRef: RepairOverlayEntityRef | null;
    knowledgeSpatialRefId: string | null;
    promotedFromTemporaryRegionId: string | null;
    linkedEventIds: string[];
    measurementEventIds: string[];
    annotationEventIds: string[];
    aiMarkEventIds: string[];
  }
): RepairInvestigationRegionCreatedEvent {
  return {
    kind: "investigation-region-created",
    id: createEventId("evt-region", iso),
    sessionId: session.id,
    occurredAt: iso,
    source: "operator",
    linkedEventIds: payload.linkedEventIds,
    regionId: createEventId("region", iso),
    label: payload.label,
    region: payload.region,
    status: payload.status,
    color: payload.color,
    sourceRef: payload.sourceRef,
    knowledgeSpatialRefId: payload.knowledgeSpatialRefId,
    promotedFromTemporaryRegionId: payload.promotedFromTemporaryRegionId,
    measurementEventIds: payload.measurementEventIds,
    annotationEventIds: payload.annotationEventIds,
    aiMarkEventIds: payload.aiMarkEventIds,
  };
}

export function createInvestigationRegionUpdatedEvent(
  session: RepairSession,
  iso: string,
  payload: {
    regionId: string;
    label?: string;
    region?: RepairImageRect;
    status?: RepairInvestigationRegionStatus;
    color?: string;
    sourceRef?: RepairOverlayEntityRef | null;
    knowledgeSpatialRefId?: string | null;
    promotedFromTemporaryRegionId?: string | null;
    linkedEventIds: string[];
    measurementEventIds?: string[];
    annotationEventIds?: string[];
    aiMarkEventIds?: string[];
  }
): RepairInvestigationRegionUpdatedEvent {
  const event: RepairInvestigationRegionUpdatedEvent = {
    kind: "investigation-region-updated",
    id: createEventId("evt-region-update", iso),
    sessionId: session.id,
    occurredAt: iso,
    source: "operator",
    linkedEventIds: payload.linkedEventIds,
    regionId: payload.regionId,
  };
  if (payload.label !== undefined) event.label = payload.label;
  if (payload.region !== undefined) event.region = payload.region;
  if (payload.status !== undefined) event.status = payload.status;
  if (payload.color !== undefined) event.color = payload.color;
  if (payload.sourceRef !== undefined) event.sourceRef = payload.sourceRef;
  if (payload.knowledgeSpatialRefId !== undefined) {
    event.knowledgeSpatialRefId = payload.knowledgeSpatialRefId;
  }
  if (payload.promotedFromTemporaryRegionId !== undefined) {
    event.promotedFromTemporaryRegionId = payload.promotedFromTemporaryRegionId;
  }
  if (payload.measurementEventIds !== undefined)
    event.measurementEventIds = payload.measurementEventIds;
  if (payload.annotationEventIds !== undefined)
    event.annotationEventIds = payload.annotationEventIds;
  if (payload.aiMarkEventIds !== undefined) event.aiMarkEventIds = payload.aiMarkEventIds;
  return event;
}
