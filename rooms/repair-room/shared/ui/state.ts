import type {
  RepairAiAdaptationHints,
  RepairAmbientListeningState,
  RepairChatState,
  RepairEvent,
  RepairImageRect,
  RepairInvestigationRegion,
  RepairKnowledgePack,
  RepairMeasurementEvidenceState,
  RepairLayoutState,
  RepairMeasurementState,
  RepairOperationalProfile,
  RepairOperatorProfile,
  RepairOperationalMode,
  RepairOverlayEntityRef,
  RepairPanelId,
  RepairSession,
  RepairSessionListItem,
  RepairSpokenGuidanceMode,
  RepairWizardState,
  RepairWorkbenchState,
} from "../types/index.js";

export type RepairUiPhase =
  "initializing" | "idle" | "wizard-active" | "session-active" | "session-paused";

export interface RepairTacticalFeedItem {
  eventId: string;
  occurredAt: string;
  relativeLabel: string;
  severity: "info" | "suggestion" | "action" | "risk";
  badge: string;
  body: string;
}

export interface RepairKnowledgePackPanelState {
  pack: RepairKnowledgePack | null;
  attachedToSessionId: string | null;
  previewTabId: "schematic-preview" | "board-view" | "notes";
  focusedSpatialRefId: string | null;
}

export interface RepairKnowledgeRegionProjection {
  id: string;
  label: string;
  region: RepairImageRect;
  source: "common-failure" | "test-point" | "resource";
  linkedEventIds: string[];
  relatedMeasurementIds: string[];
  relatedAiMarkIds: string[];
}

export interface RepairTemporarySpatialRegion {
  id: string;
  label: string;
  region: RepairImageRect;
  source: "knowledge-spatial-ref" | "focus-preview";
  sourceRef: RepairOverlayEntityRef;
  knowledgeSpatialRefId: string | null;
  linkedEventIds: string[];
  relatedMeasurementIds: string[];
  relatedAiMarkIds: string[];
}

export type RepairMeasurementRelationshipKind =
  "rail" | "previous-event" | "investigation-group" | "linked-annotation" | "linked-ai-mark";

export interface RepairMeasurementRelationship {
  id: string;
  kind: RepairMeasurementRelationshipKind;
  from: RepairOverlayEntityRef;
  to: RepairOverlayEntityRef;
  label: string;
  strength: number;
  eventIds: string[];
}

export interface RepairTimelineDensityBucket {
  bucketStartMs: number;
  bucketEndMs: number;
  eventCount: number;
  spatialEventCount: number;
  measurementCount: number;
  aiMarkCount: number;
  regionCount: number;
  density: number;
}

export interface RepairSpatialFocusState {
  ref: RepairOverlayEntityRef;
  label: string;
  region: RepairImageRect | null;
  linkedEventIds: string[];
  relatedMeasurementIds: string[];
  relatedAiMarkIds: string[];
}

export type RepairInvestigationPhase =
  "observe" | "inspect" | "measure" | "compare" | "verify" | "conclude";

export type RepairGuidanceSurface =
  | "workbench"
  | "tactical-feed"
  | "session-wizard"
  | "knowledge-pack"
  | "measurement"
  | "visual-timeline"
  | "chat"
  | "room-sync"
  | "none";

export type RepairPanelVisibilityMode = "hidden" | "compact" | "contextual" | "expanded";

export type RepairTacticalFeedDensity = "minimal" | "compact" | "expanded";

export type RepairAiConfidence = "low" | "medium" | "high";

export type RepairAiUrgency = "low" | "medium" | "high";

export type RepairEvidenceDepth = "thin" | "supported" | "strong";

export type RepairAiDispatchStatus = "idle" | "pending" | "succeeded" | "failed";

export type RepairAiDispatchActivity =
  "idle" | "chat-reply" | "evidence-research" | "measurement-observation" | "risk-scan";

export type RepairAiTargetSlot = "ai0" | "ai1" | "ai2";

export type RepairStorageMode = "standalone" | "room-storage";

export type RepairStorageStatus = "unavailable" | "hydrating" | "ready" | "fallback" | "error";

export interface RepairStorageState {
  mode: RepairStorageMode;
  status: RepairStorageStatus;
  storageDir: string | null;
  sessionCount: number;
  message: string | null;
}

export interface RepairAiDispatchState {
  status: RepairAiDispatchStatus;
  targetSlot: RepairAiTargetSlot;
  startedAt: string | null;
  completedAt: string | null;
  message: string | null;
  contextRefs: string[];
  activity: RepairAiDispatchActivity;
}

export interface RepairSuggestedActionProjection {
  text: string;
  confidence: RepairAiConfidence;
  urgency: RepairAiUrgency;
  evidenceDepth: RepairEvidenceDepth;
  source: "measurement" | "ai" | "knowledge" | "operator" | "system";
}

export interface RepairSuspiciousRegionProjection {
  ref: RepairOverlayEntityRef;
  label: string;
  confidence: RepairAiConfidence;
  urgency: RepairAiUrgency;
}

export interface RepairPanelVisibilityProjection {
  primarySurface: RepairGuidanceSurface;
  panels: Record<RepairPanelId, RepairPanelVisibilityMode>;
  tacticalFeedDensity: RepairTacticalFeedDensity;
  subduedPanelIds: RepairPanelId[];
  dimSecondaryControls: boolean;
}

export interface RepairAttentionBudgetProjection {
  windowMs: number;
  maxAiInterruptions: number;
  usedAiInterruptions: number;
  remainingAiInterruptions: number;
  collapsedByBudgetCount: number;
}

export interface RepairAiInterruptionProjection {
  confidence: RepairAiConfidence;
  urgency: RepairAiUrgency;
  evidenceDepth: RepairEvidenceDepth;
  shouldSpeak: boolean;
  silenceReason: string | null;
  duplicateInsightsMerged: number;
  suppressedObservationCount: number;
  toneLine: string;
  attentionBudget: RepairAttentionBudgetProjection;
}

export interface RepairConfusionRecoveryProjection {
  currentFocus: string;
  lastVerifiedStep: string;
  pendingAction: string;
  whyThisRegionMatters: string;
}

export interface RepairOverlaySaturationProjection {
  maxVisibleRelationships: number;
  maxVisibleRegions: number;
  maxSimultaneousHighlights: number;
  maxActiveAiMarks: number;
  clutterScore: number;
  visibleEventIds: string[];
  visibleRelationshipIds: string[];
  visibleRegionRefs: RepairOverlayEntityRef[];
  activeAttentionRefs: RepairOverlayEntityRef[];
  fadedSecondaryRefs: RepairOverlayEntityRef[];
  labelMode: "simplified" | "full";
}

export interface RepairFocusCorridorProjection {
  active: boolean;
  targetRef: RepairOverlayEntityRef | null;
  allowedSurfaces: RepairGuidanceSurface[];
  activeRegionLabel: string;
  entryReason: string;
  exitHint: string;
  dimmedRefCount: number;
}

export interface RepairOperationalRhythmProjection {
  lifecycle: RepairInvestigationPhase[];
  currentIndex: number;
  previousPhase: RepairInvestigationPhase | null;
  nextPhase: RepairInvestigationPhase | null;
  progressLabel: string;
  steady: boolean;
}

export interface RepairVoiceGuidanceProjection {
  ambientListeningState: RepairAmbientListeningState;
  voiceFocusTarget: RepairOverlayEntityRef | null;
  spokenGuidanceMode: RepairSpokenGuidanceMode;
  handsBusyMode: boolean;
  spokenLine: string | null;
}

export interface RepairOperationsOwnerProjection {
  id: string;
  label: string;
  roomId?: string;
}

export interface RepairOperationsRecordProjection {
  capability: string;
  owner: RepairOperationsOwnerProjection;
  startedAt: number;
}

export interface RepairOperationsSnapshot {
  records: RepairOperationsRecordProjection[];
  updatedAt: number;
}

export interface RepairOperationsProjection {
  localMicActive: boolean;
  androidMicActive: boolean;
  cameraActive: boolean;
  liveFeedActive: boolean;
  ambientActive: boolean;
  ttsActive: boolean;
  activeOwner?: string;
  activeCapabilities: string[];
}

export interface RepairVoiceReadinessProjection {
  available: boolean;
  listening: boolean;
  handsBusyMode: boolean;
  ambientMode: boolean;
}

export interface RepairContinuityTargetProjection {
  ref: RepairOverlayEntityRef;
  label: string;
}

export interface RepairContinuityMeasurementProjection {
  eventId: string;
  reference: string;
  display: string;
}

export interface RepairContinuityProjection {
  lastFocusTarget?: RepairContinuityTargetProjection;
  lastMeasurement?: RepairContinuityMeasurementProjection;
  lastVerifiedRegion?: RepairContinuityTargetProjection;
  currentInvestigationPhase?: RepairInvestigationPhase;
}

export interface RepairGuidanceProjection {
  operationalProfile: RepairOperationalProfile;
  investigationPhase: RepairInvestigationPhase;
  nextBestAction: RepairSuggestedActionProjection;
  unresolvedCriticalItems: number;
  pendingMeasurements: string[];
  suspiciousRegions: RepairSuspiciousRegionProjection[];
  panelVisibility: RepairPanelVisibilityProjection;
  aiInterruption: RepairAiInterruptionProjection;
  recovery: RepairConfusionRecoveryProjection;
  overlaySaturation: RepairOverlaySaturationProjection;
  focusCorridor: RepairFocusCorridorProjection;
  rhythm: RepairOperationalRhythmProjection;
  voice: RepairVoiceGuidanceProjection;
}

export const REPAIR_INVESTIGATION_LIFECYCLE: RepairInvestigationPhase[] = [
  "observe",
  "inspect",
  "measure",
  "compare",
  "verify",
  "conclude",
];

function createRepairGuidancePanelMap(
  mode: RepairPanelVisibilityMode
): Record<RepairPanelId, RepairPanelVisibilityMode> {
  return {
    "session-rail": mode,
    "workbench-stage": mode,
    "tactical-feed": mode,
    "session-wizard": mode,
    "knowledge-pack": mode,
    "visual-timeline": mode,
    "operator-profile": mode,
  };
}

export function createRepairDefaultGuidanceProjection(
  operationalProfile: RepairOperationalProfile = "novice"
): RepairGuidanceProjection {
  const panels = createRepairGuidancePanelMap("compact");
  panels["workbench-stage"] = "expanded";
  panels["session-wizard"] = "contextual";
  panels["knowledge-pack"] = "compact";

  const lifecycle = [...REPAIR_INVESTIGATION_LIFECYCLE];
  return {
    operationalProfile,
    investigationPhase: "observe",
    nextBestAction: {
      text: "Open a repair session.",
      confidence: "medium",
      urgency: "low",
      evidenceDepth: "thin",
      source: "system",
    },
    unresolvedCriticalItems: 0,
    pendingMeasurements: [],
    suspiciousRegions: [],
    panelVisibility: {
      primarySurface: "workbench",
      panels,
      tacticalFeedDensity: "compact",
      subduedPanelIds: [],
      dimSecondaryControls: false,
    },
    aiInterruption: {
      confidence: "medium",
      urgency: "low",
      evidenceDepth: "thin",
      shouldSpeak: false,
      silenceReason: "No high-value change needs interruption.",
      duplicateInsightsMerged: 0,
      suppressedObservationCount: 0,
      toneLine: "The bench is ready.",
      attentionBudget: {
        windowMs: 180000,
        maxAiInterruptions: 2,
        usedAiInterruptions: 0,
        remainingAiInterruptions: 2,
        collapsedByBudgetCount: 0,
      },
    },
    recovery: {
      currentFocus: "Live workbench",
      lastVerifiedStep: "No verified step yet",
      pendingAction: "Open a repair session.",
      whyThisRegionMatters: "No region is selected.",
    },
    overlaySaturation: {
      maxVisibleRelationships: operationalProfile === "advanced" ? 12 : 4,
      maxVisibleRegions: operationalProfile === "advanced" ? 12 : 5,
      maxSimultaneousHighlights: operationalProfile === "advanced" ? 10 : 5,
      maxActiveAiMarks: operationalProfile === "advanced" ? 6 : 2,
      clutterScore: 0,
      visibleEventIds: [],
      visibleRelationshipIds: [],
      visibleRegionRefs: [],
      activeAttentionRefs: [],
      fadedSecondaryRefs: [],
      labelMode: operationalProfile === "advanced" ? "full" : "simplified",
    },
    focusCorridor: {
      active: false,
      targetRef: null,
      allowedSurfaces: ["workbench"],
      activeRegionLabel: "Live workbench",
      entryReason: "No focused investigation region.",
      exitHint: "Select a region to narrow the repair context.",
      dimmedRefCount: 0,
    },
    rhythm: {
      lifecycle,
      currentIndex: 0,
      previousPhase: null,
      nextPhase: "inspect",
      progressLabel: "observe 1/6",
      steady: true,
    },
    voice: {
      ambientListeningState: "idle",
      voiceFocusTarget: null,
      spokenGuidanceMode: "silent",
      handsBusyMode: false,
      spokenLine: null,
    },
  };
}

export function createRepairDefaultOperationsProjection(): RepairOperationsProjection {
  return {
    localMicActive: false,
    androidMicActive: false,
    cameraActive: false,
    liveFeedActive: false,
    ambientActive: false,
    ttsActive: false,
    activeCapabilities: [],
  };
}

export function createRepairDefaultVoiceReadinessProjection(): RepairVoiceReadinessProjection {
  return {
    available: false,
    listening: false,
    handsBusyMode: false,
    ambientMode: false,
  };
}

export function createRepairDefaultContinuityProjection(): RepairContinuityProjection {
  return {};
}

export function createRepairDefaultAiDispatchState(
  targetSlot: RepairAiTargetSlot = "ai2"
): RepairAiDispatchState {
  return {
    status: "idle",
    targetSlot,
    startedAt: null,
    completedAt: null,
    message: null,
    contextRefs: [],
    activity: "idle",
  };
}

export function createRepairDefaultStorageState(
  sessionCount = 0,
  message = "Repair history not connected"
): RepairStorageState {
  return {
    mode: "standalone",
    status: "unavailable",
    storageDir: null,
    sessionCount,
    message,
  };
}

export interface RepairReplayProjection {
  playheadMs: number;
  replayMode: RepairWorkbenchState["timeline"]["replayMode"];
  operationsAvailable: boolean;
  operations: RepairOperationsProjection;
  voiceReadiness: RepairVoiceReadinessProjection;
  continuity: RepairContinuityProjection;
  liveSource: RepairWorkbenchState["liveSource"];
  visibleEvents: RepairEvent[];
  overlayEvents: RepairEvent[];
  tacticalFeed: RepairTacticalFeedItem[];
  measurementEvidence: RepairMeasurementEvidenceState[];
  aiMarkEventIds: string[];
  activeSnapshotEventId: string | null;
  activeFreezeFrameEventId: string | null;
  focusSuggestionEventId: string | null;
  knowledgeRegions: RepairKnowledgeRegionProjection[];
  investigationRegions: RepairInvestigationRegion[];
  temporarySpatialRegions: RepairTemporarySpatialRegion[];
  measurementRelationships: RepairMeasurementRelationship[];
  timelineDensity: RepairTimelineDensityBucket[];
  activeSpatialFocus: RepairSpatialFocusState | null;
  operationalMode: RepairOperationalMode;
  guidance: RepairGuidanceProjection;
}

export interface RepairUiState {
  phase: RepairUiPhase;
  sessions: {
    activeId: string | null;
    list: RepairSessionListItem[];
    detail: RepairSession | null;
  };
  workbench: RepairWorkbenchState;
  tacticalFeed: RepairTacticalFeedItem[];
  wizard: RepairWizardState;
  knowledgePack: RepairKnowledgePackPanelState;
  operatorProfile: {
    profile: RepairOperatorProfile;
    adaptation: RepairAiAdaptationHints;
    isDirty: boolean;
  };
  measurement: RepairMeasurementState;
  chat: RepairChatState;
  layout: RepairLayoutState;
  guidance: RepairGuidanceProjection;
  operationsAvailable: boolean;
  operations: RepairOperationsProjection;
  voiceReadiness: RepairVoiceReadinessProjection;
  continuity: RepairContinuityProjection;
  aiDispatch: RepairAiDispatchState;
  storage: RepairStorageState;
  ambient: {
    nowIso: string;
    sessionDurationMs: number;
  };
}

export interface RepairUiSnapshotMeta {
  schemaVersion: number;
  generatedAt: string;
  events: RepairEvent[];
  replay: RepairReplayProjection;
}
