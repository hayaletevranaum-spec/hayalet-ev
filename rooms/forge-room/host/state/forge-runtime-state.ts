import {
  FORGE_LOCAL_OWNER_SCOPE_ID,
  FORGE_PREFLIGHT_SCHEMA_VERSION,
  FORGE_ROOM_ID,
  FORGE_SESSION_SCHEMA_VERSION,
} from "../../shared/forge-constants.js";
import {
  filterForgeActiveEquipmentKeys,
  filterForgeActivePreferenceKeys,
  filterForgeActiveSkillKeys,
} from "../../shared/data/operator-context-catalog.js";
import type {
  ForgeRunArtifactStore,
  ForgeGoal,
  ForgeSession,
  ForgeTask,
  ForgeTaskAssignment,
  ForgeAgentResponse,
  ForgeConflict,
  ForgeSynthesis,
  ForgeCoordinatorState,
  ForgeHandoffExportRecord,
  ForgeOperatorProfile,
  ForgePreflightState,
  ForgeRunOverride,
  ForgeRunSignature,
  ForgeSessionContextSelection,
} from "../../shared/types/index.js";
import {
  createDefaultForgeOperatorProfile,
  createEmptyForgePreflightState,
  createEmptyForgeSessionContextSelection,
  isForgeArchitectSeatId,
  isForgePreflightStepId,
  normalizeForgeLegacySelectionKeys,
  normalizeForgeSessionContextSelectionKeys,
  reconcileForgeSessionContextSelection,
} from "../../shared/types/index.js";
import { createEmptyForgeRunArtifactStore } from "../forge-run-artifact-store.js";

export interface ForgeRuntimeState {
  activeSessionId: string | null;
  approvedTasks: ForgeTask[];
  assignments: ForgeTaskAssignment[];
  artifactStore: ForgeRunArtifactStore;
  conflicts: ForgeConflict[];
  coordinatorState: ForgeCoordinatorState;
  contextDigest: string | null;
  currentGoal: ForgeGoal | null;
  draftTasks: ForgeTask[];
  draftSourceText: string | null;
  validationMessages: string[];
  decisionTrace: string[];
  exports: ForgeHandoffExportRecord[];
  ownerScopeId: string;
  operatorProfile: ForgeOperatorProfile;
  preflight: ForgePreflightState;
  responses: ForgeAgentResponse[];
  runId: string | null;
  sessionContextSelection: ForgeSessionContextSelection;
  sessionRevision: number;
  runOverride: ForgeRunOverride | null;
  runSignature: ForgeRunSignature | null;
  selectedSynthesisId: string | null;
  syntheses: ForgeSynthesis[];
}

export interface ForgeSessionListItem {
  id: string;
  updatedAt: string;
  title: string;
}

function normalizeForgeTask(task: ForgeTask): ForgeTask {
  return {
    ...task,
    contextCapsule:
      task.contextCapsule &&
      typeof task.contextCapsule === "object" &&
      Array.isArray(task.contextCapsule) === false
        ? {
            summary:
              typeof task.contextCapsule.summary === "string" ? task.contextCapsule.summary : "",
            relevantModules: Array.isArray(task.contextCapsule.relevantModules)
              ? task.contextCapsule.relevantModules.filter(
                  (entry): entry is string => typeof entry === "string"
                )
              : [],
            constraints: Array.isArray(task.contextCapsule.constraints)
              ? task.contextCapsule.constraints.filter(
                  (entry): entry is string => typeof entry === "string"
                )
              : [],
          }
        : null,
  };
}

function normalizeForgeTasks(tasks: ForgeTask[]): ForgeTask[] {
  return tasks.map((task) => normalizeForgeTask(task));
}

function normalizeForgeDecisionTrace(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function toRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && Array.isArray(value) === false
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeForgeSessionContextSelection(value: unknown): ForgeSessionContextSelection {
  const record = toRecord(value);
  if (
    Array.isArray(record["skillKeys"]) ||
    Array.isArray(record["equipmentKeys"]) ||
    Array.isArray(record["preferenceKeys"])
  ) {
    return normalizeForgeSessionContextSelectionKeys(record);
  }

  const skill = toRecord(record["skill"]);
  const tools = toRecord(record["tools"]);
  const preferences = toRecord(record["preferences"]);
  return normalizeForgeSessionContextSelectionKeys({
    skillKeys: normalizeForgeLegacySelectionKeys(skill),
    equipmentKeys: normalizeForgeLegacySelectionKeys(tools),
    preferenceKeys: normalizeForgeLegacySelectionKeys(preferences).filter(
      (entry): entry is "mode" | "riskTolerance" => entry === "mode" || entry === "riskTolerance"
    ),
  });
}

function normalizeForgeRunOverride(value: unknown): ForgeRunOverride | null {
  const record = toRecord(value);
  const notes = typeof record["notes"] === "string" ? record["notes"].trim() : "";
  const temporaryConditions = Array.isArray(record["temporaryConditions"])
    ? Array.from(
        new Set(
          record["temporaryConditions"]
            .filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
            .map((entry) => entry.trim())
        )
      )
    : [];
  const architectSeatId = isForgeArchitectSeatId(record["architectSeatId"])
    ? record["architectSeatId"]
    : null;

  if (
    architectSeatId === "ai2" ||
    temporaryConditions.length > 0 ||
    notes !== "" ||
    record["enableRovoPreAnalysis"] === true ||
    record["mode"] === "learn_first" ||
    record["mode"] === "result_first" ||
    record["riskTolerance"] === "low" ||
    record["riskTolerance"] === "medium" ||
    record["riskTolerance"] === "high"
  ) {
    const mode =
      record["mode"] === "learn_first" || record["mode"] === "result_first" ? record["mode"] : null;
    const riskTolerance =
      record["riskTolerance"] === "low" ||
      record["riskTolerance"] === "medium" ||
      record["riskTolerance"] === "high"
        ? record["riskTolerance"]
        : null;
    return {
      enableRovoPreAnalysis: record["enableRovoPreAnalysis"] === true,
      notes,
      temporaryConditions: temporaryConditions.sort((left, right) => left.localeCompare(right)),
      ...(architectSeatId === "ai2" ? { architectSeatId } : {}),
      ...(mode ? { mode } : {}),
      ...(riskTolerance ? { riskTolerance } : {}),
    };
  }

  if (record["enableRovoPreAnalysis"] !== true) {
    return null;
  }

  return {
    enableRovoPreAnalysis: true,
    notes,
    temporaryConditions: [],
  };
}

function normalizeForgePreflightState(value: unknown): ForgePreflightState {
  const record = toRecord(value);
  const bundle = toRecord(record["bundle"]);
  const fallback = createEmptyForgePreflightState();
  const status =
    record["status"] === "idle" ||
    record["status"] === "running" ||
    record["status"] === "fresh" ||
    record["status"] === "stale" ||
    record["status"] === "warning"
      ? record["status"]
      : fallback.status;
  const warnings = Array.isArray(record["warnings"])
    ? record["warnings"].filter((entry): entry is string => typeof entry === "string")
    : fallback.warnings;
  const normalized = {
    activeStepId: isForgePreflightStepId(record["activeStepId"]) ? record["activeStepId"] : null,
    bundle:
      record["bundle"] !== null &&
      typeof record["bundle"] === "object" &&
      Array.isArray(record["bundle"]) === false
        ? (record["bundle"] as ForgePreflightState["bundle"])
        : fallback.bundle,
    contextDigest:
      typeof record["contextDigest"] === "string" && record["contextDigest"].trim() !== ""
        ? record["contextDigest"]
        : fallback.contextDigest,
    errorMessage:
      typeof record["errorMessage"] === "string" && record["errorMessage"].trim() !== ""
        ? record["errorMessage"]
        : null,
    expectedContextDigest:
      typeof record["expectedContextDigest"] === "string" &&
      record["expectedContextDigest"].trim() !== ""
        ? record["expectedContextDigest"]
        : fallback.expectedContextDigest,
    preflightId:
      typeof record["preflightId"] === "string" && record["preflightId"].trim() !== ""
        ? record["preflightId"]
        : fallback.preflightId,
    promptCharCount:
      typeof record["promptCharCount"] === "number" && Number.isFinite(record["promptCharCount"])
        ? record["promptCharCount"]
        : fallback.promptCharCount,
    ranAt:
      typeof record["ranAt"] === "string" && record["ranAt"].trim() !== "" ? record["ranAt"] : null,
    runId:
      typeof record["runId"] === "string" && record["runId"].trim() !== ""
        ? record["runId"]
        : fallback.runId,
    sessionRevision:
      typeof record["sessionRevision"] === "number" && Number.isFinite(record["sessionRevision"])
        ? Math.max(0, Math.trunc(record["sessionRevision"]))
        : fallback.sessionRevision,
    staleReason:
      typeof record["staleReason"] === "string" && record["staleReason"].trim() !== ""
        ? record["staleReason"]
        : null,
    status,
    warnings,
  } satisfies ForgePreflightState;

  if (bundle["schemaVersion"] === FORGE_PREFLIGHT_SCHEMA_VERSION) {
    return normalized;
  }

  if (record["bundle"] !== undefined && record["bundle"] !== null) {
    return {
      ...fallback,
      status: "stale",
      staleReason: "Legacy preflight bundle requires a rerun with the new operator context model.",
      warnings: ["Legacy preflight bundle was invalidated during session hydration."],
    };
  }

  return normalized;
}

export function createForgeCoordinatorState(
  overrides: Partial<ForgeCoordinatorState> = {}
): ForgeCoordinatorState {
  return {
    actorId: "coordinator",
    planStatus: "idle",
    assignmentQueueTotal: 0,
    pendingAssignmentCount: 0,
    completedResponseCount: 0,
    pendingConflictCount: 0,
    synthesisStatus: "idle",
    exportReady: false,
    lastExportPath: null,
    note: "Coordinator is idle.",
    lastUpdatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createEmptyForgeRuntimeState(): ForgeRuntimeState {
  return {
    activeSessionId: null,
    currentGoal: null,
    draftTasks: [],
    draftSourceText: null,
    validationMessages: [],
    decisionTrace: [],
    approvedTasks: [],
    assignments: [],
    artifactStore: createEmptyForgeRunArtifactStore(),
    exports: [],
    ownerScopeId: FORGE_LOCAL_OWNER_SCOPE_ID,
    operatorProfile: createDefaultForgeOperatorProfile(),
    preflight: createEmptyForgePreflightState(),
    responses: [],
    contextDigest: null,
    runId: null,
    sessionContextSelection: createEmptyForgeSessionContextSelection(),
    sessionRevision: 0,
    runOverride: null,
    runSignature: null,
    conflicts: [],
    syntheses: [],
    selectedSynthesisId: null,
    coordinatorState: createForgeCoordinatorState(),
  };
}

export function createEmptyForgeSession(sessionId: string): ForgeSession {
  const now = new Date().toISOString();
  return {
    schemaVersion: FORGE_SESSION_SCHEMA_VERSION,
    id: sessionId,
    roomId: FORGE_ROOM_ID,
    artifactStore: createEmptyForgeRunArtifactStore(),
    contextDigest: null,
    ownerScopeId: FORGE_LOCAL_OWNER_SCOPE_ID,
    goal: null,
    draftTasks: [],
    draftSourceText: null,
    validationMessages: [],
    approvedTasks: [],
    assignments: [],
    responses: [],
    conflicts: [],
    syntheses: [],
    selectedSynthesisId: null,
    decisionTrace: [],
    preflight: createEmptyForgePreflightState(),
    sessionContextSelection: createEmptyForgeSessionContextSelection(),
    sessionRevision: 0,
    runOverride: null,
    runId: null,
    runSignature: null,
    exports: [],
    coordinatorState: createForgeCoordinatorState({
      note: "Session created. Waiting for the first goal draft.",
    }),
    eventLog: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createForgeRuntimeStateFromSession(
  session: ForgeSession,
  overrides: {
    operatorProfile?: ForgeOperatorProfile;
  } = {}
): ForgeRuntimeState {
  const sessionRecord = session as Partial<ForgeSession>;
  const coordinatorState = createForgeCoordinatorState(sessionRecord.coordinatorState);
  const operatorProfile = overrides.operatorProfile ?? createDefaultForgeOperatorProfile();
  const preflight = normalizeForgePreflightState(sessionRecord.preflight);
  const sessionRevision =
    typeof sessionRecord.sessionRevision === "number" &&
    Number.isFinite(sessionRecord.sessionRevision)
      ? Math.max(0, Math.trunc(sessionRecord.sessionRevision))
      : 0;
  const runId =
    typeof sessionRecord.runId === "string" && sessionRecord.runId.trim() !== ""
      ? sessionRecord.runId
      : preflight.runId;
  const contextDigest =
    typeof sessionRecord.contextDigest === "string" && sessionRecord.contextDigest.trim() !== ""
      ? sessionRecord.contextDigest
      : preflight.contextDigest;
  const ownerScopeId =
    typeof sessionRecord.ownerScopeId === "string" && sessionRecord.ownerScopeId.trim() !== ""
      ? sessionRecord.ownerScopeId
      : FORGE_LOCAL_OWNER_SCOPE_ID;
  const sessionContextSelection = reconcileForgeSessionContextSelection({
    selection: normalizeForgeSessionContextSelection(sessionRecord.sessionContextSelection),
    allowedSkillKeys: filterForgeActiveSkillKeys(
      operatorProfile.skills.map((entry) => entry.skillKey)
    ),
    allowedEquipmentKeys: filterForgeActiveEquipmentKeys(
      operatorProfile.equipment.map((entry) => entry.equipmentKey)
    ),
    allowedPreferenceKeys: filterForgeActivePreferenceKeys(
      Object.keys(operatorProfile.preferences)
    ),
  });
  return {
    activeSessionId: session.id,
    currentGoal: session.goal,
    draftTasks: Array.isArray(session.draftTasks) ? normalizeForgeTasks(session.draftTasks) : [],
    draftSourceText: typeof session.draftSourceText === "string" ? session.draftSourceText : null,
    validationMessages: Array.isArray(session.validationMessages) ? session.validationMessages : [],
    decisionTrace: normalizeForgeDecisionTrace(sessionRecord.decisionTrace),
    approvedTasks: Array.isArray(session.approvedTasks)
      ? normalizeForgeTasks(session.approvedTasks)
      : [],
    assignments: Array.isArray(session.assignments)
      ? session.assignments.map((assignment) => ({
          ...assignment,
          contextDigest:
            typeof assignment.contextDigest === "string" && assignment.contextDigest.trim() !== ""
              ? assignment.contextDigest
              : contextDigest,
          runId:
            typeof assignment.runId === "string" && assignment.runId.trim() !== ""
              ? assignment.runId
              : runId,
          sessionRevision:
            typeof assignment.sessionRevision === "number" &&
            Number.isFinite(assignment.sessionRevision)
              ? Math.max(0, Math.trunc(assignment.sessionRevision))
              : sessionRevision,
        }))
      : [],
    artifactStore:
      sessionRecord.artifactStore &&
      typeof sessionRecord.artifactStore === "object" &&
      Array.isArray((sessionRecord.artifactStore as { entries?: unknown }).entries)
        ? (() => {
            const artifactStore = sessionRecord.artifactStore;
            return {
              activeRunId:
                typeof artifactStore.activeRunId === "string" ? artifactStore.activeRunId : null,
              entries: artifactStore.entries.map((entry) => ({
                ...entry,
                ownerScopeId:
                  typeof entry.ownerScopeId === "string" && entry.ownerScopeId.trim() !== ""
                    ? entry.ownerScopeId
                    : ownerScopeId,
                exportSnapshots: Array.isArray(entry.exportSnapshots)
                  ? entry.exportSnapshots.map((snapshot) => ({
                      ...snapshot,
                      ownerScopeId:
                        typeof snapshot.ownerScopeId === "string" &&
                        snapshot.ownerScopeId.trim() !== ""
                          ? snapshot.ownerScopeId
                          : ownerScopeId,
                    }))
                  : [],
                synthesisSnapshots: Array.isArray(entry.synthesisSnapshots)
                  ? entry.synthesisSnapshots.map((snapshot) => ({
                      ...snapshot,
                      ownerScopeId:
                        typeof snapshot.ownerScopeId === "string" &&
                        snapshot.ownerScopeId.trim() !== ""
                          ? snapshot.ownerScopeId
                          : ownerScopeId,
                    }))
                  : [],
              })),
            };
          })()
        : createEmptyForgeRunArtifactStore(),
    exports: Array.isArray(session.exports)
      ? session.exports.map((entry) => ({
          ...entry,
          contextDigest:
            typeof entry.contextDigest === "string" && entry.contextDigest.trim() !== ""
              ? entry.contextDigest
              : contextDigest,
          ownerScopeId:
            typeof entry.ownerScopeId === "string" && entry.ownerScopeId.trim() !== ""
              ? entry.ownerScopeId
              : ownerScopeId,
          runId: typeof entry.runId === "string" && entry.runId.trim() !== "" ? entry.runId : runId,
          sessionRevision:
            typeof entry.sessionRevision === "number" && Number.isFinite(entry.sessionRevision)
              ? Math.max(0, Math.trunc(entry.sessionRevision))
              : sessionRevision,
          snapshotHash:
            typeof entry.snapshotHash === "string" && entry.snapshotHash.trim() !== ""
              ? entry.snapshotHash
              : null,
        }))
      : [],
    operatorProfile,
    preflight,
    responses: Array.isArray(session.responses)
      ? session.responses.map((response) => ({
          ...response,
          contextDigest:
            typeof response.contextDigest === "string" && response.contextDigest.trim() !== ""
              ? response.contextDigest
              : contextDigest,
          runId:
            typeof response.runId === "string" && response.runId.trim() !== ""
              ? response.runId
              : runId,
          sessionRevision:
            typeof response.sessionRevision === "number" &&
            Number.isFinite(response.sessionRevision)
              ? Math.max(0, Math.trunc(response.sessionRevision))
              : sessionRevision,
        }))
      : [],
    contextDigest,
    runId,
    ownerScopeId,
    sessionContextSelection,
    sessionRevision,
    runOverride: normalizeForgeRunOverride(sessionRecord.runOverride),
    runSignature:
      sessionRecord.runSignature && typeof sessionRecord.runSignature === "object"
        ? sessionRecord.runSignature
        : null,
    conflicts: Array.isArray(session.conflicts) ? session.conflicts : [],
    syntheses: Array.isArray(session.syntheses)
      ? session.syntheses.map((synthesis) => ({
          ...synthesis,
          contextDigest:
            typeof synthesis.contextDigest === "string" && synthesis.contextDigest.trim() !== ""
              ? synthesis.contextDigest
              : contextDigest,
          decisionTrace: normalizeForgeDecisionTrace(synthesis.decisionTrace),
          preflightId:
            typeof synthesis.preflightId === "string" && synthesis.preflightId.trim() !== ""
              ? synthesis.preflightId
              : preflight.preflightId,
          provenance:
            synthesis.provenance &&
            typeof synthesis.provenance === "object" &&
            Array.isArray(synthesis.provenance) === false
              ? {
                  contextDigest:
                    typeof synthesis.provenance.contextDigest === "string" &&
                    synthesis.provenance.contextDigest.trim() !== ""
                      ? synthesis.provenance.contextDigest
                      : null,
                  runSignature:
                    typeof synthesis.provenance.runSignature === "string" &&
                    synthesis.provenance.runSignature.trim() !== ""
                      ? synthesis.provenance.runSignature
                      : null,
                  operatorProfileSummary: Array.isArray(synthesis.provenance.operatorProfileSummary)
                    ? synthesis.provenance.operatorProfileSummary.filter(
                        (entry): entry is string => typeof entry === "string" && entry.trim() !== ""
                      )
                    : [],
                  preflightId:
                    typeof synthesis.provenance.preflightId === "string" &&
                    synthesis.provenance.preflightId.trim() !== ""
                      ? synthesis.provenance.preflightId
                      : null,
                  preflightWarnings: Array.isArray(synthesis.provenance.preflightWarnings)
                    ? synthesis.provenance.preflightWarnings.filter(
                        (entry): entry is string => typeof entry === "string" && entry.trim() !== ""
                      )
                    : [],
                  runId:
                    typeof synthesis.provenance.runId === "string" &&
                    synthesis.provenance.runId.trim() !== ""
                      ? synthesis.provenance.runId
                      : null,
                  sessionRevision:
                    typeof synthesis.provenance.sessionRevision === "number" &&
                    Number.isFinite(synthesis.provenance.sessionRevision)
                      ? Math.max(0, Math.trunc(synthesis.provenance.sessionRevision))
                      : null,
                }
              : null,
          runId:
            typeof synthesis.runId === "string" && synthesis.runId.trim() !== ""
              ? synthesis.runId
              : runId,
          sessionRevision:
            typeof synthesis.sessionRevision === "number" &&
            Number.isFinite(synthesis.sessionRevision)
              ? Math.max(0, Math.trunc(synthesis.sessionRevision))
              : sessionRevision,
          snapshotHash:
            typeof synthesis.snapshotHash === "string" && synthesis.snapshotHash.trim() !== ""
              ? synthesis.snapshotHash
              : null,
        }))
      : [],
    selectedSynthesisId: session.selectedSynthesisId,
    coordinatorState,
  };
}

export function createForgeSessionFromRuntimeState(
  state: ForgeRuntimeState,
  previous: ForgeSession | null
): ForgeSession {
  const createdAt = previous?.createdAt ?? new Date().toISOString();
  return {
    schemaVersion: FORGE_SESSION_SCHEMA_VERSION,
    id: state.activeSessionId ?? previous?.id ?? "",
    roomId: FORGE_ROOM_ID,
    artifactStore: state.artifactStore,
    contextDigest: state.contextDigest,
    ownerScopeId: state.ownerScopeId,
    goal: state.currentGoal,
    draftTasks: state.draftTasks,
    draftSourceText: state.draftSourceText,
    validationMessages: state.validationMessages,
    decisionTrace: state.decisionTrace,
    approvedTasks: state.approvedTasks,
    assignments: state.assignments,
    responses: state.responses,
    conflicts: state.conflicts,
    syntheses: state.syntheses,
    selectedSynthesisId: state.selectedSynthesisId,
    preflight: state.preflight,
    sessionContextSelection: state.sessionContextSelection,
    sessionRevision: state.sessionRevision,
    runOverride: state.runOverride,
    runId: state.runId,
    runSignature: state.runSignature,
    exports: state.exports,
    coordinatorState: state.coordinatorState,
    eventLog: previous?.eventLog ?? [],
    createdAt,
    updatedAt: new Date().toISOString(),
  };
}
