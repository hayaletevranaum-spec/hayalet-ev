import type { AnalysisReference, AnalysisScope } from "../shared/types/analysis-scope.js";
import { asNonEmptyString } from "./lab-primitives.js";
import type {
  CapabilityFamilyId,
  LabAssetType,
  LabCapabilityFlowKind,
  LabIconRailSlotId,
  LabOperationCapabilityId,
  LabOperationOutputKind,
} from "./lab-capabilities.js";
import type {
  LabExecutionCommitment,
  LabExecutionResult,
  LabExecutionRuntime,
} from "./lab-execution-types.js";
import type {
  LabMode,
  LabProjectImportKind,
  LabProjectImportMethod,
  LabProjectImportReviewFocus,
  LabProjectImportUiState,
  LabYoutubeImportFormat,
  LabYoutubeImportPreview,
  LabYoutubeImportState,
} from "./lab-import-types.js";
export * from "./lab-capabilities.js";
export * from "./lab-execution-types.js";
export * from "./lab-import-types.js";
export {
  asLabRecord,
  asNonEmptyString,
  asNumber,
  asString,
  asStringArray,
  clampPercent,
  createLabEventId,
  escapeHtml,
  formatBytes,
  formatDateTime,
  formatDurationSeconds,
  toTimestamp,
} from "./lab-primitives.js";

export type LabRecord = Record<string, unknown>;

export type LabFocusLayer = "preview" | "timeline" | "inspector";

export interface LabAsset {
  id: string;
  type: LabAssetType;
  name: string;
  url?: string;
  localPath?: string;
  createdAt: number;
  sourceId?: string;
  derivedFromAssetId?: string;
  derivedFromSourceId?: string;
  runId?: string;
  metadata?: LabRecord;
}

/** V2.3 workspace mode — replaces stage navigation */
export type WorkspaceMode = "loading" | "workspace" | "analyzing" | "complete";
export type LabFeatureStage = "source" | "edit" | "process" | "report";
export type LabMediaViewportState = "empty" | "loading" | "active" | "error";
export type LabSourceRetryBlockReason =
  | "active-run"
  | "not-failed"
  | "missing-url"
  | "missing-youtube-url"
  | "missing-yt-dlp"
  | "local-reselect-required";

/** V2.4 report freshness — condition-driven, never gates UI */
export type ReportFreshnessState = "current" | "stale" | "previous-run";
export interface ReportFreshness {
  state: ReportFreshnessState;
  workspaceDirty: boolean;
}

/** V2.5 preflight severity — shared contract between UI + controller */
export type PreflightSeverity = "clear" | "warning" | "will-fail";

/** V3 drawer mode — derived from system state, never manually toggled */
export type LabDrawerMode = "setup" | "running" | "result" | "explore";
export type LabDrawerModeOverride = "setup" | "result";
export type LabDecisionIntent =
  | "idle"
  | "preparing-analysis"
  | "ready-to-run"
  | "running-analysis"
  | "reviewing-results"
  | "exploring-alternatives";
export type LabDecisionSignal = "has-selection" | "has-source" | "is-running" | "has-result";
export type LabDecisionState = "idle" | "ready" | "running" | "done";
export type LabDecisionSnapshot = {
  mode: LabDrawerMode;
  intent: LabDecisionIntent;
  triggers: LabDecisionSignal[];
  activeBlocks: string[];
  state: LabDecisionState;
  timestamp: number;
};
export type LabPipelineBlock = {
  id: string;
  type: "section" | "action" | "status" | "output";
  render: () => string;
  visible?: () => boolean;
};

export interface LabWorkspaceLockState {
  source: boolean;
  timeline: boolean;
  roi: boolean;
  analysis: boolean;
  hypothesis: boolean;
  focusControls: boolean;
}

export interface LabBookmark {
  id: string;
  timeMs: number;
  frameIndex: number | null;
  note: string;
  createdAt: number;
  projectId?: string | null;
  sourceKey?: string | null;
}

export interface LabROIRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  active: boolean;
}

export type LabSelectionType = "clip" | "focus" | "inspect" | "unknown";
export type LabInspectionMode = "none" | "visual" | "audio" | "motion";

export interface LabSelectionROI {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LabComparisonSide = "primary" | "reference";

export interface LabComparisonRoiState {
  activeSide: LabComparisonSide;
  primary: LabSelectionROI | null;
  reference: LabSelectionROI | null;
}

export interface LabSelection {
  id: string;
  startMs: number;
  endMs: number;
  type: LabSelectionType;
  label?: string;
  roi?: LabSelectionROI;
  createdAt: number;
}

export interface LabActionSuggestion {
  id: string;
  label: string;
  description?: string;
  toolHint?: string;
  flowKind?: LabCapabilityFlowKind;
  operationCapabilityId?: LabOperationCapabilityId;
  analysisCapabilityId?: CapabilityFamilyId;
  toolIds?: string[];
  outputKind?: LabOperationOutputKind;
  actionType:
    | "analyze-segment"
    | "extract-clip"
    | "focus-region"
    | "inspect-motion"
    | "inspect-audio"
    | "enhance-visual"
    | "enhance-frame"
    | "crop-region"
    | "clean-audio"
    | "separate-stems"
    | "stabilize-segment"
    | "ocr-region"
    | "metadata-audit"
    | "detect-scenes"
    | "detect-objects";
  confidence: number;
}

export interface LabSuggestionPreview {
  suggestionId: string;
  title: string;
  steps: string[];
  expectedOutputs: string[];
  estimatedCost?: "low" | "medium" | "high";
}

export interface LabInspectionSnapshot {
  id: string;
  objectUrl: string;
  width: number;
  height: number;
  sourceKind: "image" | "video";
  roi: LabSelectionROI;
  createdAt: number;
  timeMs: number | null;
}

export interface LabInterpretationItem {
  id: string;
  type: "info" | "warning" | "hint";
  message: string;
  confidence: number;
  recommendation?: string;
  severity?: "low" | "medium" | "high";
  relatedAction?: string;
}

export interface LabInteractiveSettings {
  brightness: number;
  contrast: number;
  gamma: number;
  saturation: number;
  hueRotate: number;
  sharpness: number;
  channelR: boolean;
  channelG: boolean;
  channelB: boolean;
  edgeHighlight: boolean;
  invert: boolean;
}

export interface LabComparisonInteractiveSettings {
  primary: LabInteractiveSettings;
  reference: LabInteractiveSettings;
}

export type AudioVisualizationMode = "none" | "waveform" | "spectrum";
export type LabWorkspaceControlTab = "audio" | "visual" | "operations";
export type LabComparisonViewMode =
  "side-by-side" | "stacked" | "split" | "difference" | "roi-detail";

export interface LabParametricEQBand {
  frequency: number;
  gain: number;
  Q: number;
  type: "peaking" | "lowshelf" | "highshelf";
}

export interface LabAudioFocusSettings {
  gain: number;
  filterType: "none" | "lowpass" | "highpass" | "bandpass";
  filterFrequency: number;
  filterQ: number;
  playbackRate: number;
  preservePitch: boolean;
  visualizationMode: AudioVisualizationMode;
  eqBands: LabParametricEQBand[];
}

export interface LabWorkspaceUiState {
  timelineStartMs: number | null;
  timelineEndMs: number | null;
  activeSelection: LabSelection | null;
  comparisonReferenceAssetId: string | null;
  comparisonViewMode: LabComparisonViewMode;
  comparisonSplitPercent: number;
  comparisonFindingNote: string;
  comparisonRois: LabComparisonRoiState;
  roiRegions: LabROIRegion[];
  interactiveSettings: LabInteractiveSettings;
  comparisonInteractiveSettings: LabComparisonInteractiveSettings;
  audioFocus: LabAudioFocusSettings;
  previewVolume: number;
  hypothesis: string;
  bookmarks: LabBookmark[];
  analysisPrepExpandedCapabilityIds: CapabilityFamilyId[];
  sourceIntakeCollapsed: boolean;
  selectionLoopEnabled: boolean;
  selectionMicroZoomOpen: boolean;
  controlsDrawerOpen: boolean;
  controlsDrawerTab: LabWorkspaceControlTab;
  processViewActive: boolean;
  reportOverlayOpen: boolean;
  selectionTabActive: boolean;
  preflightAutoRunEnabled: boolean;
  /** V3 explore toggle — user manually switches Result ↔ Explore */
  userExploreToggle: boolean;
  /** V3 top-bar requested mode, constrained by derived drawer mode rules */
  drawerModeOverride: LabDrawerModeOverride | null;
  /** V3 drawer collapsed state */
  drawerCollapsed: boolean;
  /** V4B inspector pinned state — push vs popover */
  inspectorPinned: boolean;
  /** V4B active icon rail slot */
  activeIconRailSlot: LabIconRailSlotId | null;
}

export type LabFeatureId = "media-analysis" | "audio-analysis";
export type LabEventSeverity = "info" | "success" | "warning" | "error";
export type LabEventScope = "global" | "run";
export type LabModuleStatus =
  | "idle"
  | "queued"
  | "running"
  | "ready"
  | "completed"
  | "failed"
  | "cancelled"
  | "skipped"
  | "stale";
export type LabSourceProbeStatus = "idle" | "running" | "completed" | "failed";
export type LabPreflightStatus = "idle" | "ready" | "warning" | "blocked";

export const LAB_FEATURES: Array<{
  id: LabFeatureId;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: "media-analysis",
    label: "Medya Analizi",
    shortLabel: "Medya",
    description: "Kaynak hazırlama, önizleme, profil ve final iş akışı.",
  },
  {
    id: "audio-analysis",
    label: "Ses Analizi",
    shortLabel: "Ses",
    description: "Ses odaklı analiz modülleri ve çıktı takibi.",
  },
];

export interface LabFeatureMeta {
  id: LabFeatureId;
  label: string;
  shortLabel: string;
  description: string;
}

export interface LabEventFeedItem {
  id: string;
  kind: string;
  severity: LabEventSeverity;
  message: string;
  detail: string | null;
  percent?: number | null;
  bytesReceived?: number | null;
  bytesTotal?: number | null;
  phaseLabel?: string | null;
  phasePercent?: number | null;
  phaseIndex?: number | null;
  phaseCount?: number | null;
  timestamp: number;
  source: "host" | "ui" | "system";
  action: string | null;
  stage: string | null;
  scope: LabEventScope;
  moduleId: string | null;
  rawLine: string | null;
  analysisScope?: AnalysisScope | null;
  finding?: LabRecord | null;
  artifact?: LabRecord | null;
  moduleTrace?: LabRecord | null;
  comparisonVariant?: LabRecord | null;
  comparisonVariants?: LabRecord[] | null;
  batchedCount?: number | null;
  throttleWindow?: string | null;
  requestId?: string | null;
  jobId?: string | null;
  projectId?: string | null;
  result?: LabRecord | null;
  resultAssetIds?: string[];
}

export type LabUserActionStatus = "idle" | "running" | "success" | "error";

export type LabUserActionType = "export-clip" | "extract-audio" | "grab-frame" | "custom";

export interface LabUserActionEvent {
  id: string;
  type: LabUserActionType;
  label: string;
  status: LabUserActionStatus;
  startedAt: number;
  finishedAt?: number;
  message?: string;
  requestId?: string | null;
  jobId?: string | null;
  projectId?: string | null;
  resultAssetIds?: string[];
  progress?: number | null;
  sourceAction?: string | null;
  dismissedFromHubAt?: number | null;
}

export type YoutubeCaptureMode = "video+audio" | "audio-only" | "video-only";

export interface LabSourceDrafts {
  urlInput: string;
  youtubeUrl: string;
  youtubePreset: string | null;
  youtubeCustom: LabRecord;
  youtubeCaptureMode: YoutubeCaptureMode;
}

export interface LabEditDrafts {
  outputNameHint: string;
  notes: string;
  activeSourceRef: "original" | "preview";
  advancedOpen: boolean;
}

export interface LabProfileDrafts {
  sensitivity: number | null;
  transcriptSampleSeconds: number | null;
  depth: string;
  frameSampleDensity: string;
}

export interface LabEditConfig extends LabRecord {
  activeOutputId?: unknown;
  handoffMode?: unknown;
  mode?: unknown;
  outputs?: unknown;
  preview?: unknown;
  recipe?: unknown;
}

export interface LabProfileConfig extends LabRecord {
  artifacts?: unknown;
  mode?: unknown;
  modelId?: unknown;
  preflight?: unknown;
  readiness?: unknown;
  targetAssetMode?: unknown;
}

export interface LabModuleState {
  id: string;
  status: LabModuleStatus;
  startedAt?: string | null;
  endedAt?: string | null;
  progress?: number | null;
  progressMode?: "measured" | "none";
  message?: string | null;
  title?: string | null;
  summary?: string | null;
  findingIds?: string[];
  artifactIds?: string[];
  metadata?: LabRecord;
}

export interface LabFindingProjection {
  id: string;
  moduleId: string | null;
  code?: string | null;
  title: string;
  detail: string;
  level: string;
  severity?: LabEventSeverity;
  confidence: string;
  kind: "measured" | "derived" | "heuristic";
  evidenceCount: number;
  artifactIds: string[];
  sourceModule?: string | null;
  reference?: AnalysisReference | null;
  hypothesis?: string | null;
  metadata?: LabRecord;
}

export interface LabArtifactProjection {
  id: string;
  moduleId?: string | null;
  kind: string;
  label?: string | null;
  path: string | null;
  fileName: string | null;
  previewUrl: string | null;
  createdAt: string | null;
  status?: string;
  variantId?: string | null;
  active?: boolean;
  reference?: AnalysisReference | null;
  metadata?: LabRecord;
}

export interface LabLiveFindingProjection extends LabFindingProjection {
  emittedAt: number;
  windowKey: string | null;
  streamId: string | null;
}

export interface LabPreviewArtifactProjection extends LabArtifactProjection {
  status: string;
  variantId: string | null;
  active: boolean;
  reference: AnalysisReference | null;
  metadata: LabRecord;
}

export interface LabModuleTraceEntry {
  id: string;
  moduleId: string | null;
  stage: string;
  status: string;
  timestamp: string;
  message: string | null;
  detail: string | null;
  eventId: string | null;
}

export interface LabComparisonVariant {
  id: string;
  kind: string;
  label: string;
  status: string;
  summary: string | null;
  artifactIds: string[];
  artifactId?: string | null;
  artifactPath?: string | null;
  sourceModule?: string | null;
  active?: boolean;
}

export interface LabRun {
  id: string;
  state: LabModuleStatus;
  startedAt: number;
  endedAt?: number;
  requestId?: string | null;
  jobId?: string | null;
  projectId?: string | null;
  modules: Record<string, LabModuleState>;
  moduleOrder: string[];
  events: LabEventFeedItem[];
  rawLog: LabEventFeedItem[];
  artifacts: LabArtifactProjection[];
  findings: LabFindingProjection[];
  liveFindings: LabLiveFindingProjection[];
  warnings: string[];
  error: string | null;
  targetLabel: string | null;
  progress: number | null;
  emptyReason: string | null;
  analysisScope: AnalysisScope | null;
  previewArtifacts: LabPreviewArtifactProjection[];
  confidence: string | null;
  moduleTrace: LabModuleTraceEntry[];
  comparisonVariants: LabComparisonVariant[];
  hypothesisSummary: string | null;
}

export interface LabRunSnapshotSummary {
  focus: string | null;
  timelineStartMs: number | null;
  timelineEndMs: number | null;
  hypothesis: string | null;
}

export interface LabWorkspaceDiff {
  timelineChanged: boolean;
  hypothesisChanged: boolean;
  workspaceDirty: boolean;
  changedKeys: Array<"timeline" | "hypothesis">;
}

export interface LabUserReportFinding {
  id: string;
  title: string;
  detail: string;
  confidence: string;
  evidence: string[];
}

export interface LabUserReportSuspiciousFrame {
  artifactId: string;
  previewUrl: string;
  label: string;
}

export interface LabUserReportModuleSummary {
  id: string;
  title: string;
  status: string;
}

export interface LabCorrelationCluster {
  id: string;
  title: string;
  detail: string;
  score: number;
  level: string;
  confidence: string;
  startSeconds: number | null;
  endSeconds: number | null;
  signalCount: number;
  signalTypes: string[];
  findingIds: string[];
}

export interface LabNarrativeCue {
  id: string;
  phrase: string;
  source: string;
  detail: string;
  confidence?: string;
  endSeconds?: number | null;
  startSeconds?: number | null;
  temporalBasis?: "timestamp" | "narrow-scope" | "scope" | "text-only";
}

export interface LabForensicNote {
  id: string;
  label: string;
  detail: string;
  moduleId: string | null;
  followUpChecks?: string[];
  measuredFields?: string[];
  scope?: "local" | "global";
}

export type LabTriageAnomalyDecision = "yes" | "no" | "inconclusive";

export interface LabDecisionSummary {
  anomaly: LabTriageAnomalyDecision;
  likelyTechnicalExplanation: string;
  manipulationSuspicion: "low" | "medium" | "high" | "inconclusive";
  needsFollowUp: boolean;
  rationale: string;
  limitations: string[];
}

export type LabEvidenceStrengthLevel = "strong" | "moderate" | "weak" | "none" | "not-testable";

export interface LabEvidenceStrengthEntry {
  id: string;
  label: string;
  strength: LabEvidenceStrengthLevel;
  detail: string;
  evidence: string[];
  counterEvidence: string[];
}

export interface LabCounterEvidenceEntry {
  id: string;
  label: string;
  status: "measured-not-found" | "measured-weak" | "not-measured" | "follow-up";
  detail: string;
  moduleId?: string | null;
}

export interface LabCounterEvidenceLedger {
  summary: string;
  entries: LabCounterEvidenceEntry[];
}

export interface LabUserReport {
  summary: string;
  confidence: string;
  topFindings: LabUserReportFinding[];
  suspiciousFrames: LabUserReportSuspiciousFrame[];
  hypothesisResult: string | null;
  elapsedSeconds: number;
  moduleSummary: LabUserReportModuleSummary[];
  correlationSummary?: string | null;
  topCorrelationClusters?: LabCorrelationCluster[];
  narrativeCues?: LabNarrativeCue[];
  forensicNotes?: LabForensicNote[];
  decisionSummary?: LabDecisionSummary;
  evidenceStrength?: LabEvidenceStrengthEntry[];
  counterEvidenceLedger?: LabCounterEvidenceLedger;
}

export interface LabAiReport {
  manifest: LabRecord;
  findings: LabFindingProjection[];
  artifacts: LabArtifactProjection[];
  warnings: string[];
  errors: string[];
  degradedConditions: string[];
  moduleTrace: LabModuleTraceEntry[];
  analysisScope: AnalysisScope | null;
  comparisonVariants: LabComparisonVariant[];
  correlationClusters?: LabCorrelationCluster[];
  narrativeCues?: LabNarrativeCue[];
  forensicNotes?: LabForensicNote[];
  decisionSummary?: LabDecisionSummary;
  evidenceStrength?: LabEvidenceStrengthEntry[];
  counterEvidenceLedger?: LabCounterEvidenceLedger;
}

export interface LabReportSet {
  user: LabUserReport | null;
  ai: LabAiReport | null;
  emptyReason: string | null;
}

export interface LabPreflightResult {
  status: LabPreflightStatus;
  missingDependencies: string[];
  warnings: string[];
  estimatedRuntime: number | null;
  enabledModules: string[];
  stageReady: boolean;
  rawStatus: string | null;
  reason: string | null;
}

export interface LabStoreUiState {
  labFocusLayer: LabFocusLayer;
  labMode: LabMode;
  youtubeImport: LabYoutubeImportState;
  projectImport: LabProjectImportUiState;
  sourceDrafts: LabSourceDrafts;
  editDrafts: LabEditDrafts;
  profileDrafts: LabProfileDrafts;
  sourceDraftDirty: boolean;
  editDraftDirty: boolean;
  profileDraftDirty: boolean;
  toolManagerOpen: boolean;
  toolInstallReviewToolId: string | null;
  eventFeedExpanded: boolean;
  eventFeedCursor: number;
  artifactListExpanded: boolean;
  artifactRenderCount: number;
  reportView: "user" | "ai";
  lastHydratedProjectId: string | null;
  activeExecutionCommitment: LabExecutionCommitment | null;
  executionRuntime: LabExecutionRuntime;
  activeExecutionIntentId: string | null;
  activeSuggestionPreviewId: string | null;
  activeInspectionSnapshot: LabInspectionSnapshot | null;
  activeWorkspaceAssetId: string | null;
  activePreviewArtifactId: string | null;
  activeDocumentOverlayAssetId: string | null;
  inspectionMode: LabInspectionMode;
  roiFocusActive: boolean;
  liveFindingsExpanded: boolean;
  analysisControlsCollapsed: boolean;
  analysisCancelPending: boolean;
  analysisCancelRequestId: string | null;
  /** Workspace side panel collapsed state (Edit stage) */
  editSidePanelCollapsed: boolean;
  /** Raw log section collapsed in Process stage */
  rawLogCollapsed: boolean;
  /** V2.3 workspace state */
  workspace: LabWorkspaceUiState;
  /** V5 source panel (left rail) */
  sourcePanelCollapsed: boolean;
}

export interface LabPersistedState {
  schemaVersion?: number;
  featureId: LabFeatureId;
  selectedCapabilities: CapabilityFamilyId[];
  projectIndex: {
    activeProjectId: string | null;
    projects: LabRecord[];
  };
  workbench: LabRecord;
  source: LabRecord | null;
  sourceProbeStatus: LabSourceProbeStatus;
  editConfig: LabEditConfig | null;
  profileConfig: LabProfileConfig | null;
  preflight: LabPreflightResult | null;
  lastRun: LabRun | null;
  reports: LabReportSet;
  reportExports: LabRecord[];
  assets: LabAsset[];
  profileModels: LabRecord[];
  toolState: LabRecord;
  activityFeed: LabEventFeedItem[];
  sourceDrafts: LabSourceDrafts;
  editDrafts: LabEditDrafts;
  profileDrafts: LabProfileDrafts;
  reportView: "user" | "ai";
  eventFeedExpanded: boolean;
  eventFeedCursor: number;
  artifactListExpanded: boolean;
  artifactRenderCount: number;
  activePreviewArtifactId: string | null;
  liveFindingsExpanded: boolean;
  analysisControlsCollapsed: boolean;
  editSidePanelCollapsed?: boolean;
  rawLogCollapsed?: boolean;
  /** V2.3 workspace state persistence */
  workspace?: Partial<LabWorkspaceUiState>;
  projectImport?: Partial<LabProjectImportUiState>;
}

export interface LabStoreState {
  featureId: LabFeatureId;
  /** Selected capability families — replaces module selection in v2.2 */
  selectedCapabilities: CapabilityFamilyId[];
  bootReady: boolean;
  roomReadySent: boolean;
  context: LabRecord;
  snapshot: LabRecord | null;
  projectIndex: {
    activeProjectId: string | null;
    projects: LabRecord[];
  };
  workbench: LabRecord;
  source: LabRecord | null;
  sourceProbeStatus: LabSourceProbeStatus;
  editConfig: LabEditConfig | null;
  profileConfig: LabProfileConfig | null;
  preflight: LabPreflightResult | null;
  run: LabRun | null;
  reports: LabReportSet;
  reportExports: LabRecord[];
  assets: LabAsset[];
  profileModels: LabRecord[];
  toolState: LabRecord;
  activityFeed: LabEventFeedItem[];
  userActions: LabUserActionEvent[];
  ui: LabStoreUiState;
  persisted: LabPersistedState | null;
}

export interface LabWorkspaceSurface {
  inspector?: string;
  main: string;
  side: string;
}

export type LabStoreEvent =
  | { type: "hydrate"; payload: Partial<LabPersistedState> | null }
  | { type: "lab-focus-layer-changed"; layer: LabFocusLayer }
  | { type: "youtube-import-set-url"; url: string | null }
  | { type: "youtube-import-parse-start" }
  | {
      type: "youtube-import-parse-success";
      preview: LabYoutubeImportPreview;
      url?: string | null;
      formats?: LabYoutubeImportFormat[];
      selectedVideoFormatId?: string | null;
      selectedAudioFormatId?: string | null;
    }
  | { type: "youtube-import-parse-error"; reason?: string | null }
  | {
      type: "youtube-import-format-selected";
      audioFormatId?: string | null;
      videoFormatId?: string | null;
    }
  | { type: "youtube-import-clear" }
  | { type: "project-import-kind-changed"; kind: LabProjectImportKind }
  | {
      type: "project-import-method-changed";
      kind?: LabProjectImportKind;
      method: LabProjectImportMethod;
    }
  | {
      type: "project-import-draft-updated";
      kind?: LabProjectImportKind;
      patch: Partial<LabSourceDrafts>;
    }
  | { type: "project-import-reset" }
  | { type: "project-import-cleared"; kind?: LabProjectImportKind }
  | { type: "project-import-url-check-started"; url: string }
  | { type: "project-import-url-check-cleared" }
  | { type: "project-import-url-check-failed"; url?: string | null; error?: string | null }
  | {
      type: "project-import-review-focused";
      focus: LabProjectImportReviewFocus;
      action?: string | null;
      requestId?: string | null;
    }
  | { type: "bootstrap-ready-sent" }
  | { type: "context-received"; payload: LabRecord }
  | { type: "snapshot-received"; payload: LabRecord }
  | { type: "source-snapshot-received"; payload: LabRecord }
  | { type: "host-event-received"; event: LabEventFeedItem }
  | { type: "job-received"; payload: LabRecord; event: LabEventFeedItem | null }
  | { type: "request-result-received"; payload: LabRecord; event: LabEventFeedItem | null }
  | { type: "source-probe-started"; action: string; detail?: string | null }
  | {
      type: "source-probe-progress";
      action: string;
      detail?: string | null;
      progress?: number | null;
    }
  | { type: "source-probe-completed"; action: string; detail?: string | null }
  | { type: "source-probe-failed"; action: string; detail?: string | null }
  | { type: "preview-started"; action: string; detail?: string | null }
  | { type: "preview-progress"; action: string; detail?: string | null; progress?: number | null }
  | { type: "preview-completed"; action: string; detail?: string | null }
  | { type: "preview-failed"; action: string; detail?: string | null }
  | { type: "preflight-started"; action: string; detail?: string | null }
  | { type: "preflight-completed"; action: string; detail?: string | null }
  | { type: "preflight-failed"; action: string; detail?: string | null }
  | {
      type: "run-started";
      action: string;
      detail?: string | null;
      requestId?: string | null;
      jobId?: string | null;
      projectId?: string | null;
    }
  | { type: "run-cancelled"; action: string; detail?: string | null }
  | { type: "run-failed"; action: string; detail?: string | null }
  | { type: "module-started"; action: string; moduleId: string; detail?: string | null }
  | {
      type: "module-progress";
      action: string;
      moduleId: string;
      detail?: string | null;
      progress?: number | null;
    }
  | { type: "module-finished"; action: string; moduleId: string; detail?: string | null }
  | { type: "module-failed"; action: string; moduleId: string; detail?: string | null }
  | { type: "module-skipped"; action: string; moduleId: string; detail?: string | null }
  | { type: "feature-changed"; featureId: LabFeatureId }
  | { type: "workbench-updated"; workbench: LabRecord }
  | { type: "source-config-patched"; patch: LabRecord }
  | { type: "source-drafts-updated"; patch: Partial<LabSourceDrafts> }
  | { type: "source-drafts-committed" }
  | { type: "edit-drafts-updated"; patch: Partial<LabEditDrafts> }
  | { type: "edit-drafts-committed" }
  | { type: "profile-drafts-updated"; patch: Partial<LabProfileDrafts> }
  | { type: "profile-drafts-committed" }
  | { type: "tool-manager-toggled"; open?: boolean }
  | { type: "tool-install-review-requested"; toolId: string }
  | { type: "tool-install-review-dismissed" }
  | { type: "toggle-event-feed"; force?: boolean }
  | { type: "advance-event-feed" }
  | { type: "reset-event-feed" }
  | { type: "toggle-artifacts"; force?: boolean }
  | { type: "show-more-artifacts" }
  | { type: "report-view-changed"; view: "user" | "ai" }
  | { type: "workspace-asset-selected"; assetId: string | null }
  | {
      type: "workspace-operation-output-applied";
      assetId: string;
      comparisonSide?: LabComparisonSide | "single" | null;
    }
  | { type: "workspace-content-opened"; assetId: string | null }
  | { type: "document-overlay-opened"; assetId: string }
  | { type: "document-overlay-cleared" }
  | { type: "preview-artifact-activated"; artifactId: string | null }
  | { type: "live-findings-expanded"; force?: boolean }
  | { type: "analysis-controls-collapsed"; force?: boolean }
  | { type: "analysis-cancel-requested"; requestId?: string | null }
  | { type: "capability-select"; capabilityId: CapabilityFamilyId }
  | { type: "capability-deselect"; capabilityId: CapabilityFamilyId }
  | { type: "capability-set"; capabilities: CapabilityFamilyId[] }
  | { type: "edit-side-panel-toggled"; force?: boolean }
  | { type: "raw-log-toggled"; force?: boolean }
  | { type: "push-event"; event: LabEventFeedItem }
  | { type: "asset-added"; asset: LabAsset }
  | { type: "asset-removed"; id: string }
  | { type: "asset-updated"; id: string; patch: Partial<LabAsset> }
  | { type: "user-action-added"; actionEvent: LabUserActionEvent }
  | { type: "user-action-updated"; id: string; patch: Partial<LabUserActionEvent> }
  | { type: "user-action-hub-dismissed"; id: string }
  | { type: "clear-events" }
  // V2.3 workspace events
  | { type: "workspace-timeline-updated"; startMs: number | null; endMs: number | null }
  | { type: "workspace-comparison-reference-set"; assetId: string | null }
  | { type: "workspace-comparison-side-activated"; side: LabComparisonSide }
  | {
      type: "workspace-comparison-updated";
      patch: Partial<
        Pick<
          LabWorkspaceUiState,
          "comparisonViewMode" | "comparisonSplitPercent" | "comparisonFindingNote"
        >
      >;
    }
  | { type: "workspace-selection-suggestion-clicked"; suggestionId: string }
  | { type: "workspace-selection-suggestion-accepted"; suggestionId: string }
  | { type: "workspace-selection-suggestion-dismissed"; suggestionId: string }
  | { type: "workspace-selection-suggestion-queued"; suggestionId: string }
  | { type: "workspace-execution-intent-cleared" }
  | { type: "workspace-execution-commitment-set"; planId: string }
  | { type: "workspace-execution-commitment-revoked" }
  | { type: "workspace-execution-dispatch"; planId: string; dispatchId: string }
  | {
      type: "workspace-execution-progress";
      planId: string;
      dispatchId: string;
      progress: number;
    }
  | {
      type: "workspace-execution-completed";
      planId: string;
      dispatchId: string;
      result: LabExecutionResult;
    }
  | { type: "workspace-execution-runtime-reset"; planId?: string; dispatchId?: string }
  | { type: "workspace-selection-suggestion-preview-set"; suggestionId: string }
  | { type: "workspace-selection-suggestion-preview-cleared" }
  | { type: "selection-roi-focus-set"; active: boolean }
  | { type: "selection-roi-focus-cleared" }
  | { type: "selection-roi-updated"; roi: LabSelectionROI; comparisonSide?: LabComparisonSide }
  | { type: "selection-roi-cleared"; comparisonSide?: LabComparisonSide }
  | { type: "selection-roi-snapshot-set"; snapshot: LabInspectionSnapshot }
  | { type: "selection-roi-snapshot-cleared" }
  | { type: "selection-inspection-mode-updated"; mode: LabInspectionMode }
  | { type: "workspace-roi-added"; region: LabROIRegion }
  | { type: "workspace-roi-updated"; region: LabROIRegion }
  | { type: "workspace-roi-removed"; regionId: string }
  | { type: "workspace-roi-toggled"; regionId: string }
  | { type: "workspace-preview-volume-updated"; volume: number }
  | {
      type: "workspace-interactive-updated";
      comparisonSide?: LabComparisonSide | null;
      patch: Partial<LabInteractiveSettings>;
    }
  | { type: "workspace-hypothesis-updated"; text: string }
  | { type: "workspace-bookmark-added"; bookmark: LabBookmark }
  | { type: "workspace-image-analysis-requested" }
  | { type: "workspace-bookmark-removed"; bookmarkId: string }
  | { type: "analysis-prep-module-toggled"; capabilityId: CapabilityFamilyId; moduleId: string }
  | { type: "analysis-prep-group-toggled"; capabilityId: CapabilityFamilyId }
  | { type: "analysis-prep-group-expanded"; capabilityIds: CapabilityFamilyId[] }
  | { type: "workspace-source-intake-toggled"; force?: boolean }
  | { type: "workspace-selection-loop-toggled"; force?: boolean }
  | { type: "workspace-selection-micro-zoom-toggled"; force?: boolean }
  | { type: "workspace-controls-drawer-toggled"; force?: boolean }
  | { type: "workspace-controls-tab-selected"; tab: LabWorkspaceControlTab }
  | { type: "workspace-audio-updated"; patch: Partial<LabAudioFocusSettings> }
  | { type: "workspace-process-view-toggled"; force?: boolean }
  | { type: "report-overlay-toggled"; open: boolean }
  | { type: "selection-tab-toggled"; active: boolean }
  | { type: "analysis-preflight-auto-run-toggled"; enabled?: boolean }
  | { type: "source-panel-toggled" }
  | { type: "drawer-collapsed-toggled" }
  | { type: "drawer-explore-toggled" }
  | { type: "drawer-mode-requested"; mode: LabDrawerModeOverride | null }
  // V4B icon rail inspector events
  | { type: "inspector-pin-toggle" }
  | { type: "icon-rail-slot-selected"; slotId: LabIconRailSlotId | null };

export function createLabFeatureMeta(featureId: LabFeatureId): LabFeatureMeta {
  return (
    LAB_FEATURES.find(function (entry) {
      return entry.id === featureId;
    }) || LAB_FEATURES[0]!
  );
}

export function isLabFeatureId(value: unknown): value is LabFeatureId {
  return value === "media-analysis" || value === "audio-analysis";
}

export function normalizeLabFeatureId(value: unknown, fallback: LabFeatureId = "media-analysis") {
  return isLabFeatureId(value) ? value : fallback;
}

export function formatStatusLabel(value: unknown): string {
  const status = asNonEmptyString(value) || "idle";
  switch (status) {
    case "idle":
      return "Hazır";
    case "queued":
      return "Sırada";
    case "running":
      return "Çalışıyor";
    case "ready":
      return "Hazır";
    case "completed":
      return "Tamamlandı";
    case "failed":
      return "Hata";
    case "cancelled":
      return "İptal";
    case "skipped":
      return "Atlandı";
    case "stale":
      return "Yenile";
    default:
      return status;
  }
}

export function normalizeFindingKind(value: unknown): "measured" | "derived" | "heuristic" {
  if (value === "measured" || value === "heuristic") {
    return value;
  }
  return "derived";
}
