import type {
  RepairAiMarkLifecycleState,
  RepairImagePoint,
  RepairOverlayEntityRef,
  RepairWorkbenchDrawTool,
} from "./repair-event.js";

export type RepairWorkbenchTool =
  | "select"
  | "pan"
  | "zoom-in"
  | "zoom-out"
  | RepairWorkbenchDrawTool
  | "freeze-frame"
  | "snapshot"
  | "ruler";

export type RepairOverlayLayerId =
  | "grid"
  | "ai-marks"
  | "annotations"
  | "measurement-pins"
  | "focus"
  | "operator-annotations"
  | "ai-annotations"
  | "measurements"
  | "risks"
  | "notes"
  | "knowledge";

export type RepairReplayMode = "live" | "replay" | "paused" | "freeze";

export type RepairOperationalMode = "live" | "replay" | "freeze" | "investigation";

export type RepairKnownLiveSourceType = "android-camera" | "image" | "snapshot";

export type RepairLiveSourceType = RepairKnownLiveSourceType | (string & {});

export interface RepairLivePreviewState {
  source: "v4l2" | "mjpeg-stream";
  devicePath: string;
  streamUrl?: string | null;
  contentType?: string | null;
  label: string;
  width: number;
  height: number;
  fps: number;
}

export interface RepairLiveSourceState {
  available: boolean;
  connected: boolean;
  sourceType?: RepairLiveSourceType;
  preview?: RepairLivePreviewState | null;
}

export type RepairContextualCursor =
  "inspect" | "annotate" | "measurement" | "pan" | "ai-focus" | "replay-scrub-lock";

export interface RepairWorkbenchViewport {
  zoom: number;
  panXPx: number;
  panYPx: number;
}

export interface RepairWorkbenchCursor {
  xPx: number;
  yPx: number;
  gridX: number;
  gridY: number;
}

export interface RepairTimelineState {
  playheadMs: number;
  zoom: number;
  rangeStartMs: number | null;
  rangeEndMs: number | null;
  autoFollowLive: boolean;
  replayMode: RepairReplayMode;
  replaySpeed: number;
  isPlaying: boolean;
  liveEdgeMs: number;
}

export interface RepairOverlaySelectionState {
  hoveredEventId: string | null;
  hoveredEntityRef: RepairOverlayEntityRef | null;
  selectedEventIds: string[];
  selectedEntityRefs: RepairOverlayEntityRef[];
  inspectorEventId: string | null;
  inspectorEntityRef: RepairOverlayEntityRef | null;
  focusJumpEventId: string | null;
  focusJumpEntityRef: RepairOverlayEntityRef | null;
}

export interface RepairAiMarkRuntimeState {
  eventId: string;
  lifecycleState: RepairAiMarkLifecycleState;
  priority: number;
  clusteredWith: string[];
}

export interface RepairMeasurementEvidenceState {
  eventId: string;
  reference: string;
  groupLabel: string;
  history: string[];
  previousDisplay: string | null;
  currentDisplay: string;
  pinAt: RepairImagePoint | null;
}

export interface RepairWorkbenchState {
  activeTool: RepairWorkbenchTool;
  isFrozen: boolean;
  frozenAt: string | null;
  viewport: RepairWorkbenchViewport;
  timeline: RepairTimelineState;
  cursor: RepairWorkbenchCursor | null;
  liveSource: RepairLiveSourceState;
  visibleLayers: Record<RepairOverlayLayerId, boolean>;
  hoveredEventId: string | null;
  focusedEventId: string | null;
  selection: RepairOverlaySelectionState;
  contextualCursor: RepairContextualCursor;
  operationalMode: RepairOperationalMode;
  aiMarks: RepairAiMarkRuntimeState[];
  measurementEvidence: RepairMeasurementEvidenceState[];
  focusMode: boolean;
  investigationModeEnabled: boolean;
}
