import type {
  LabActionSuggestion,
  LabInspectionMode,
  LabSelectionROI,
  LabSelectionType,
} from "./lab-types.js";

export type LabExecutionPlan = {
  id: string;
  suggestionId: string;
  actionType: LabActionSuggestion["actionType"];
  title: string;
  steps: Array<{
    id: string;
    label: string;
    description?: string;
    tool?: string;
  }>;
  expectedOutputs: string[];
  riskNotes?: string[];
  confidence?: number;
};

export interface LabExecutionSimulation {
  id: string;
  planId: string;
  summary: string;
  predictedEffects: string[];
  warnings?: string[];
  metrics?: {
    intensity?: "low" | "medium" | "high";
    risk?: "low" | "medium" | "high";
    confidence?: number;
  };
}

export interface LabExecutionReadiness {
  id: string;
  planId: string;
  status: "ready" | "needs-review" | "blocked";
  summary: string;
  blockers?: string[];
  notes?: string[];
  confidence?: number;
}

export interface LabExecutionPayloadPreview {
  id: string;
  planId: string;
  actionType: LabActionSuggestion["actionType"] | string;
  summary: string;
  dryRunShape: {
    previewInput: Record<string, unknown>;
    previewParameters: Record<string, unknown>;
    previewExpectedOutputs: string[];
  };
  notes?: string[];
  readinessStatus: LabExecutionReadiness["status"];
  readinessPassesPreview: boolean;
}

export interface LabExecutionReflection {
  id: string;
  planId: string;
  summary: string;
  decision: "proceed" | "review" | "avoid";
  reasoning: string[];
  tradeoffs?: string[];
  alternatives?: string[];
  confidence?: number;
}

export interface LabExecutionAlternative {
  actionType: string;
  label: string;
  summary: string;
  tradeoff: string;
  relativeAdvantage?:
    "higher-precision" | "higher-coverage" | "lower-risk" | "faster" | "more-stable";
}

export interface LabExecutionAlternatives {
  id: string;
  planId: string;
  summary: string;
  alternatives: LabExecutionAlternative[];
  comparisonNote?: string;
  confidence?: number;
}

export type LabExecutionDecisionPressure = "low" | "medium" | "high";

export interface LabExecutionCandidate {
  id: string;
  planId: string;
  status: "viable" | "unstable" | "not-viable";
  summary: string;
  adaptiveDecisionHint: string;
  decisionPressure: LabExecutionDecisionPressure;
  structuralIntegrity: "complete" | "partial" | "insufficient";
  readinessStatus: LabExecutionReadiness["status"];
  reflectionDecision: LabExecutionReflection["decision"];
  notes?: string[];
  uncertainties?: string[];
  confidence?: number;
}

export type LabExecutionCommitmentStatus = "inactive" | "committed" | "revoked";

export interface LabExecutionCommitment {
  id: string;
  planId: string;
  status: LabExecutionCommitmentStatus;
  candidateStatus: LabExecutionCandidate["status"];
  summary: string;
  committedAt?: number;
  notes?: string[];
  uncertainties?: string[];
  confidence?: number;
}

export type LabExecutionStagingStatus = "staged" | "not-staged";

export interface LabExecutionStaging {
  id: string;
  planId: string;
  status: LabExecutionStagingStatus;
  summary: string;
  commitmentStatus: "committed" | "none";
  candidateStatus: LabExecutionCandidate["status"];
  readinessStatus: LabExecutionReadiness["status"];
  notes?: string[];
  warnings?: string[];
  confidence?: number;
}

export interface LabExecutionArtifactTimeRange {
  start: number;
  end: number;
}

export type LabExecutionArtifactType = "marker" | "segment" | "annotation";

export interface LabExecutionArtifact {
  type: LabExecutionArtifactType;
  label: string;
  timeRange?: LabExecutionArtifactTimeRange;
}

export interface LabExecutionResultMetrics {
  coverage?: number;
  confidence?: number;
}

export interface LabExecutionSelectionSnapshot {
  startMs: number;
  endMs: number;
  type: LabSelectionType;
  inspectionMode: LabInspectionMode;
  sourceKind: string;
  roi?: LabSelectionROI;
}

export interface LabExecutionResult {
  summary: string;
  insights: string[];
  artifacts: LabExecutionArtifact[];
  metrics: LabExecutionResultMetrics;
}

export type LabActiveExecutionResult = LabExecutionResult & {
  selectionSnapshot: LabExecutionSelectionSnapshot;
};

export type LabExecutionGoalOutcome = "successful" | "neutral" | "failed";
export type LabExecutionPatternStrength = "neutral" | "weak" | "strong";

export interface LabExecutionPatternSignal {
  executionCount: number;
  averageCoverage: number;
  successRatio: number;
  failureRatio: number;
  strength: LabExecutionPatternStrength;
  note?: string;
}

export interface LabExecutionGoalEvaluation {
  outcome: LabExecutionGoalOutcome;
  goalAlignment: number;
  summary: string;
  patternSignal?: LabExecutionPatternSignal;
}

export type LabExecutionRuntimeStatus = "idle" | "running" | "completed";

export interface LabExecutionRuntime {
  status: LabExecutionRuntimeStatus;
  activePlanId?: string;
  dispatchId?: string;
  progress?: number;
  result?: LabExecutionResult;
}

export interface LabExecutionDispatchCandidate {
  dispatchId: string;
  planId: string;
  actionType: LabExecutionPayloadPreview["actionType"];
  payloadPreview: LabExecutionPayloadPreview;
  selectionSnapshot: LabExecutionSelectionSnapshot;
  staging: LabExecutionStaging;
}

export type LabGlobalProcessState = "idle" | "processing" | "analyzing" | "staging";

export interface LabGlobalProcessSummary {
  state: LabGlobalProcessState;
  completedCount: number;
  totalCount: number;
  activeTaskKey?: "sourcePreparation" | null;
  activeTaskLabel: string | null;
  progressKey?: "oneActiveTask" | null;
  progressLabel: string | null;
  tone: "neutral" | "running" | "success" | "warning" | "error";
}

export interface LabRightPanelContext {
  activeIntentLabel: string | null;
  processSummary: LabGlobalProcessSummary;
  selectionLabel: string | null;
  selectionRangeLabel: string | null;
}
