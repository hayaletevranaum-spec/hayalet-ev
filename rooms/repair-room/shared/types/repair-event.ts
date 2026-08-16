export type RepairEventSource = "operator" | "ai" | "instrument" | "system";

export type RepairAiSeverity = "info" | "suggestion" | "action" | "risk";

export type RepairAiMarkLifecycleState =
  "detected" | "acknowledged" | "investigating" | "resolved" | "dismissed" | "expired";

export type RepairAnnotationTool = "rect" | "freehand" | "arrow" | "text" | "measurement-link";

export type RepairWorkbenchDrawTool = RepairAnnotationTool | "circle" | "measurement-pin";

export interface RepairImageRect {
  xPx: number;
  yPx: number;
  widthPx: number;
  heightPx: number;
}

export interface RepairImagePoint {
  xPx: number;
  yPx: number;
}

export type RepairOverlayEntityKind =
  | "event"
  | "investigation-region"
  | "temporary-spatial-region"
  | "knowledge-region"
  | "measurement-relationship"
  | "live-edge";

export interface RepairOverlayEntityRef {
  kind: RepairOverlayEntityKind;
  id: string;
}

export type RepairInvestigationRegionStatus =
  "draft" | "active" | "watching" | "resolved" | "dismissed";

export interface RepairInvestigationRegionLinkage {
  eventIds: string[];
  measurementEventIds: string[];
  annotationEventIds: string[];
  aiMarkEventIds: string[];
}

export interface RepairInvestigationRegion {
  regionId: string;
  label: string;
  region: RepairImageRect;
  status: RepairInvestigationRegionStatus;
  color: string;
  createdAt: string;
  updatedAt: string;
  createdEventId: string;
  updatedEventId: string | null;
  source: RepairEventSource;
  sourceRef: RepairOverlayEntityRef | null;
  knowledgeSpatialRefId: string | null;
  promotedFromTemporaryRegionId: string | null;
  linkage: RepairInvestigationRegionLinkage;
}

export interface RepairAnnotationMeta {
  author: "operator" | "ai";
  tool: RepairAnnotationTool;
  label?: string;
  color?: string;
  linkedMeasurementIds?: string[];
  linkedEventIds?: string[];
}

export interface RepairEventBase {
  id: string;
  sessionId: string;
  occurredAt: string;
  source: RepairEventSource;
  linkedEventIds: string[];
}

export interface RepairSnapshotEvent extends RepairEventBase {
  kind: "snapshot";
  thumbnailSrc: string | null;
  caption: string;
}

export interface RepairAiMarkEvent extends RepairEventBase {
  kind: "ai-mark";
  severity: RepairAiSeverity;
  region: RepairImageRect | null;
  rationale: string;
  protocolKey: string | null;
  dismissed: boolean;
  lifecycleState?: RepairAiMarkLifecycleState;
  linkedMeasurementIds?: string[];
  linkedAnnotationIds?: string[];
  linkedNoteIds?: string[];
  linkedReplayEventIds?: string[];
  expiresAt?: string | null;
}

export interface RepairMeasurementEvent extends RepairEventBase {
  kind: "measurement";
  instrumentId: string;
  channel: string;
  mode: string;
  range: string;
  value: number | null;
  rawDisplay: string;
  unit: string;
  pinAt: RepairImagePoint | null;
  reference: string | null;
  group?: {
    rail?: string;
    component?: string;
    powerDomain?: string;
    investigationGroup?: string;
  };
  previousEventId?: string | null;
  linkedAnnotationIds?: string[];
  linkedAiMarkIds?: string[];
}

export interface RepairAnnotationEvent extends RepairEventBase {
  kind: "annotation";
  tool: RepairWorkbenchDrawTool;
  region: RepairImageRect | null;
  point: RepairImagePoint | null;
  label: string;
  color: string;
  meta?: RepairAnnotationMeta;
  selected?: boolean;
}

export interface RepairNoteEvent extends RepairEventBase {
  kind: "note";
  author: "operator" | "ai";
  text: string;
}

export interface RepairFreezeFrameEvent extends RepairEventBase {
  kind: "freeze-frame";
  durationMs: number;
  reason: string;
}

export interface RepairRiskFlagEvent extends RepairEventBase {
  kind: "risk-flag";
  severity: RepairAiSeverity;
  message: string;
  region: RepairImageRect | null;
  acknowledged: boolean;
  linkedMeasurementIds?: string[];
  linkedAnnotationIds?: string[];
}

export interface RepairAiMarkLifecycleEvent extends RepairEventBase {
  kind: "ai-mark-lifecycle";
  targetEventId: string;
  state: RepairAiMarkLifecycleState;
  reason: string;
}

export interface RepairInvestigationRegionCreatedEvent extends RepairEventBase {
  kind: "investigation-region-created";
  regionId: string;
  label: string;
  region: RepairImageRect;
  status: RepairInvestigationRegionStatus;
  color: string;
  sourceRef: RepairOverlayEntityRef | null;
  knowledgeSpatialRefId?: string | null;
  promotedFromTemporaryRegionId?: string | null;
  measurementEventIds?: string[];
  annotationEventIds?: string[];
  aiMarkEventIds?: string[];
}

export interface RepairInvestigationRegionUpdatedEvent extends RepairEventBase {
  kind: "investigation-region-updated";
  regionId: string;
  label?: string;
  region?: RepairImageRect;
  status?: RepairInvestigationRegionStatus;
  color?: string;
  sourceRef?: RepairOverlayEntityRef | null;
  knowledgeSpatialRefId?: string | null;
  promotedFromTemporaryRegionId?: string | null;
  measurementEventIds?: string[];
  annotationEventIds?: string[];
  aiMarkEventIds?: string[];
}

export interface RepairSessionStartEvent extends RepairEventBase {
  kind: "session-start";
  title: string;
}

export type RepairEvent =
  | RepairSnapshotEvent
  | RepairAiMarkEvent
  | RepairMeasurementEvent
  | RepairAnnotationEvent
  | RepairNoteEvent
  | RepairFreezeFrameEvent
  | RepairRiskFlagEvent
  | RepairAiMarkLifecycleEvent
  | RepairInvestigationRegionCreatedEvent
  | RepairInvestigationRegionUpdatedEvent
  | RepairSessionStartEvent;

export type RepairEventKind = RepairEvent["kind"];

export function isRepairAiEvent(
  event: RepairEvent
): event is RepairAiMarkEvent | RepairRiskFlagEvent {
  return event.kind === "ai-mark" || event.kind === "risk-flag";
}
