import type {
  ForgeActorId,
  ForgePersonaPresetId,
  ForgeRoleId,
  ForgeSeatId,
} from "./forge-identities.js";
import type {
  ForgeContextCapsule,
  ForgePreflightState,
  ForgeRovoPreAnalysis,
  ForgeRunSignature,
  ForgeSynthesisProvenance,
} from "./forge-preflight.js";
import type { ForgeGoal } from "./forge-goal.js";
import type { ForgeHandoffPackage } from "./forge-handoff.js";

export type ForgeTaskStatus = "draft" | "approved" | "assigned" | "answered" | "complete";
export type ForgeTaskExecutionKind = "task" | "checklist";
export type ForgeTaskDispatchMode = "single-owner" | "compare";
export type ForgeAssignmentStatus = "queued" | "dispatched" | "completed" | "failed" | "cancelled";
export type ForgeResponseStatus = "captured" | "selected" | "rejected";
export type ForgeConflictKind = "approach" | "scope" | "risk" | "sequence";
export type ForgeConflictStatus = "open" | "resolved";
export type ForgeSynthesisStatus = "draft" | "selected" | "exported";
export type ForgeExportReadinessStatus = "ready" | "blocked" | "missing-criteria";

export interface ForgeArchiveMessageRef {
  conversationId: string | null;
  localSessionId: string | null;
  messageId: string | null;
  provider: string | null;
}

export interface ForgeResponseArtifactRef {
  kind: "file" | "json" | "image" | "archive-ref";
  label: string;
  path?: string | null;
  note?: string | null;
}

export interface ForgeTask {
  id: string;
  parentTaskId: string | null;
  level: 1 | 2;
  title: string;
  summary: string;
  contextCapsule: ForgeContextCapsule | null;
  executionKind: ForgeTaskExecutionKind;
  dependsOnTaskIds: string[];
  assignable: boolean;
  dispatchMode: ForgeTaskDispatchMode;
  seatId: ForgeSeatId | null;
  roleId: ForgeRoleId | null;
  compareSeatIds: ForgeSeatId[];
  personaPresetId: ForgePersonaPresetId | null;
  status: ForgeTaskStatus;
}

export interface ForgeTaskAssignment {
  contextDigest: string | null;
  id: string;
  taskId: string;
  mode: ForgeTaskDispatchMode;
  seatId: ForgeSeatId;
  roleId: ForgeRoleId;
  personaPresetId: ForgePersonaPresetId | null;
  requestId: string;
  runId: string | null;
  sessionRevision: number | null;
  startedAt: string | null;
  status: ForgeAssignmentStatus;
  queuedAt: string;
  responseId: string | null;
  errorMessage: string | null;
  archiveRef: ForgeArchiveMessageRef | null;
  completedAt: string | null;
}

export interface ForgeAgentResponse {
  id: string;
  assignmentId: string;
  contextDigest: string | null;
  taskId: string;
  seatId: ForgeSeatId;
  roleId: ForgeRoleId;
  personaPresetId: ForgePersonaPresetId | null;
  runId: string | null;
  sessionRevision: number | null;
  summary: string;
  body: string;
  rawText: string;
  archiveRef: ForgeArchiveMessageRef | null;
  artifacts: ForgeResponseArtifactRef[];
  status: ForgeResponseStatus;
  createdAt: string;
}

export interface ForgeConflict {
  id: string;
  taskId: string;
  kind: ForgeConflictKind;
  status: ForgeConflictStatus;
  summary: string;
  responseIds: string[];
  preferredResponseId: string | null;
  resolutionNote: string | null;
  createdAt: string;
}

export interface ForgeSynthesis {
  contextDigest: string | null;
  id: string;
  preflightId: string | null;
  runId: string | null;
  sessionRevision: number | null;
  snapshotHash: string | null;
  summary: string;
  body: string;
  decisionTrace: string[];
  provenance: ForgeSynthesisProvenance | null;
  sourceTaskIds: string[];
  selectedResponseIds: string[];
  unresolvedConflictIds: string[];
  acceptanceCriteria: string[];
  openQuestions: string[];
  status: ForgeSynthesisStatus;
  createdAt: string;
}

export interface ForgeHandoffExportRecord {
  contextDigest: string | null;
  id: string;
  ownerScopeId: string;
  runId: string | null;
  sessionRevision: number | null;
  snapshotHash: string | null;
  targetRoomId: string;
  synthesisId: string;
  filePath: string;
  createdAt: string;
  createdBy: ForgeActorId;
}

export interface ForgeDraftArtifacts {
  draftSourceText: string | null;
  taskIds: string[];
  validationMessages: string[];
}

export interface ForgeReviewArtifacts {
  conflictIds: string[];
  responseIds: string[];
}

export interface ForgeSynthesisSnapshot {
  approvedTasks: ForgeTask[];
  assignments: ForgeTaskAssignment[];
  conflicts: ForgeConflict[];
  createdAt: string;
  contextDigest: string;
  decisionTrace: string[];
  goal: ForgeGoal;
  ownerScopeId: string;
  preflightId: string | null;
  runId: string;
  sessionRevision: number;
  snapshotHash: string;
  snapshotId: string;
  synthesis: ForgeSynthesis;
  synthesisId: string;
}

export interface ForgeExportSourceSnapshot {
  createdAt: string;
  exportId: string;
  handoffPackage: ForgeHandoffPackage;
  ownerScopeId: string;
  runId: string;
  sessionRevision: number;
  snapshotHash: string;
  synthesisId: string;
}

export interface ForgeRunArtifacts {
  ai0PreAnalysis: ForgeRovoPreAnalysis | null;
  contextDigest: string;
  createdAt: string;
  decisionTrace: string[];
  draftArtifacts: ForgeDraftArtifacts | null;
  exportSnapshots: ForgeExportSourceSnapshot[];
  ownerScopeId: string;
  preflight: ForgePreflightState | null;
  preflightId: string | null;
  reviewArtifacts: ForgeReviewArtifacts | null;
  runId: string;
  runSignature: ForgeRunSignature | null;
  selectedContextCapsules: Record<string, ForgeContextCapsule | null>;
  sessionRevision: number;
  synthesisId: string | null;
  synthesisSnapshots: ForgeSynthesisSnapshot[];
  updatedAt: string;
}

export interface ForgeRunArtifactStore {
  activeRunId: string | null;
  entries: ForgeRunArtifacts[];
}

export interface ForgeCoordinatorState {
  actorId: "coordinator";
  planStatus:
    | "idle"
    | "drafting"
    | "generating-draft"
    | "awaiting-approval"
    | "ready-for-assignment"
    | "dispatching"
    | "reviewing-conflicts"
    | "synthesis-ready"
    | "blocked"
    | "exported";
  assignmentQueueTotal: number;
  pendingAssignmentCount: number;
  completedResponseCount: number;
  pendingConflictCount: number;
  synthesisStatus: "idle" | "blocked" | "ready" | "drafted" | "selected";
  exportReady: boolean;
  lastExportPath: string | null;
  note: string | null;
  lastUpdatedAt: string;
}

export interface ForgeExportReadinessSummary {
  acceptanceCriteriaCount: number;
  exportReady: boolean;
  missingRequirements: string[];
  openConflictCount: number;
  reason: string;
  selectedSynthesisId: string | null;
  status: ForgeExportReadinessStatus;
  targetRoomId: string | null;
}

export interface ForgeEventLog {
  id: string;
  sessionId: string;
  type: string;
  actorId: ForgeActorId;
  detail: Record<string, unknown>;
  createdAt: string;
}
