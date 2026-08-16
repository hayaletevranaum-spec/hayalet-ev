import {
  FORGE_PROTOCOL_KEYS,
  FORGE_PROTOCOL_SCENARIOS,
  FORGE_ROOM_ID,
  FORGE_UI_COMMANDS,
} from "../shared/forge-constants.js";
import { FORGE_PERSONA_PRESETS } from "../shared/data/persona-presets.js";
import {
  filterForgeActiveEquipmentKeys,
  filterForgeActivePreferenceKeys,
  filterForgeActiveSkillKeys,
} from "../shared/data/operator-context-catalog.js";
import { FORGE_ROLE_CATALOG } from "../shared/data/role-catalog.js";
import type {
  ForgeArchitectSeatId,
  ForgeContextCapsule,
  ForgeGoal,
  ForgeTask,
  ForgeTaskAssignment,
  ForgeEventLog,
  ForgeSession,
  ForgeConflict,
  ForgeSynthesis,
  ForgeAgentResponse,
  ForgeOperatorProfile,
  ForgePreflightState,
  ForgeRunOverride,
  ForgeRunSignature,
  ForgeSessionContextSelection,
} from "../shared/types/index.js";
import {
  createEmptyForgePreflightState,
  createEmptyForgeRunOverride,
  isForgeArchitectSeatId,
  normalizeForgeLegacyIdentifier,
  normalizeForgeSessionContextSelectionKeys,
  resolveForgeArchitectSeatId,
  reconcileForgeSessionContextSelection,
} from "../shared/types/index.js";
import { createForgeHostIoRuntime } from "../shared/host/io-runtime.js";
import { createForgeStoragePaths } from "../shared/host/forge-paths.js";
import {
  buildForgeBreakdownPrompt,
  normalizeForgeBreakdownDraft,
  parseForgeBreakdownDraft,
} from "./forge-breakdown-runtime.js";
import { createForgeHandoffExport } from "./forge-handoff-export.js";
import { buildContextDigest } from "./forge-context-digest.js";
import { createForgeOperatorProfileStorage } from "./forge-operator-profile-storage.js";
import {
  describeForgePreflightStageImpact,
  readForgePreflightInvalidationReason,
  readForgePreflightStage,
} from "./forge-preflight-invalidation.js";
import { buildForgeSelectedOperatorProfile } from "./forge-preflight-metadata.js";
import {
  assertFreshPreflight,
  buildForgeFallbackPreflightState,
  buildForgePreflightState,
  buildForgeSynthesisProvenance,
  classifyFreshPreflightError,
  getPreflightForRun,
  renderForgePromptContext,
} from "./forge-preflight-runtime.js";
import { buildForgeRunSignature } from "./forge-run-signature.js";
import {
  createForgeRunArtifacts,
  readForgeRunArtifacts,
  readForgeSynthesisSnapshot,
  upsertForgeRunArtifacts,
  withForgeExportSnapshot,
  withForgeRunDecisionTrace,
  withForgeRunDraftArtifacts,
  withForgeRunPreflight,
  withForgeRunReviewArtifacts,
  withForgeRunSelectedContextCapsule,
  withForgeSynthesisSnapshot,
} from "./forge-run-artifact-store.js";
import { createForgeSessionStorage } from "./forge-session-storage.js";
import {
  createSynthesisSnapshot,
  exportFromSynthesisSnapshot,
} from "./forge-synthesis-snapshot.js";
import {
  buildForgeSynthesisPrompt,
  parseForgeSynthesisResponse,
} from "./forge-synthesis-runtime.js";
import {
  rebuildQueuedAssignments,
  removeForgeDraftTask,
  updateForgeApprovedTask,
  updateForgeTaskContextCapsule,
  upsertForgeDraftTask,
} from "./forge-task-editor-runtime.js";
import {
  createAssignmentsForApprovedTasks,
  createForgeTaskResponse,
  createForgeArchiveRef,
  createForgeExportRecord,
  createForgeSynthesisCandidate,
  groupForgeConflicts,
  markForgeSynthesisExported,
  parseForgeTaskResponsePayload,
  selectForgeSynthesis,
  syncApprovedTaskStatuses,
  buildForgeTaskPrompt,
} from "./forge-task-runtime.js";
import { createForgeRuntimeSnapshot } from "./state/forge-selectors.js";
import {
  createEmptyForgeRuntimeState,
  createForgeCoordinatorState,
  createForgeRuntimeStateFromSession,
  createForgeSessionFromRuntimeState,
  type ForgeRuntimeState,
  type ForgeSessionListItem,
} from "./state/forge-runtime-state.js";
import { createForgeRuntimeStore } from "./state/forge-runtime-store.js";
import {
  asNonEmptyString,
  asStringArray,
  createForgeId,
  nowIso,
  resolveForgePromptLocale,
  toRecord,
} from "./forge-runtime-support.js";

type ForgeRoomApi = {
  dispatchBridge?: (payload: Record<string, unknown>) => Promise<unknown>;
  getLocale?: () => string;
  getState: (key: string) => unknown;
  log: (level: string, message: string) => void;
  notifyRoom: (type: string, payload?: Record<string, unknown>) => void;
  setState: (key: string, value: unknown) => unknown;
};

type ForgeBridgeReply = {
  attachments?: unknown;
  conversationId?: unknown;
  messageId?: unknown;
  provider?: unknown;
  slot?: unknown;
  text?: unknown;
};

type ForgeBridgeSession = {
  conversationId?: unknown;
  id?: unknown;
};

type ForgeBridgeResult = {
  artifacts?: unknown;
  code?: unknown;
  message?: unknown;
  reply?: unknown;
  session?: unknown;
  success?: unknown;
};

type ForgeRuntime = {
  activeSession: ForgeSession | null;
  hydrated: boolean;
  hydrating: Promise<void> | null;
  paths: unknown;
  sessionList: ForgeSessionListItem[];
  store: ReturnType<typeof createForgeRuntimeStore>;
};

function buildGoal(payload: Record<string, unknown>, existing: ForgeGoal | null): ForgeGoal {
  const now = nowIso();
  return {
    id: existing?.id || createForgeId("forge-goal"),
    summary: asNonEmptyString(payload["summary"]) ?? existing?.summary ?? "Untitled goal",
    brief: asNonEmptyString(payload["brief"]) ?? existing?.brief ?? "",
    constraints:
      asStringArray(payload["constraints"]).length > 0
        ? asStringArray(payload["constraints"])
        : (existing?.constraints ?? []),
    acceptanceCriteria:
      asStringArray(payload["acceptanceCriteria"]).length > 0
        ? asStringArray(payload["acceptanceCriteria"])
        : (existing?.acceptanceCriteria ?? []),
    status: existing?.status ?? "draft",
    targetRoomId: asNonEmptyString(payload["targetRoomId"]) ?? existing?.targetRoomId ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

function createEvent(type: string, detail: Record<string, unknown> = {}): ForgeEventLog {
  return {
    id: createForgeId("forge-event"),
    sessionId: typeof detail["sessionId"] === "string" ? detail["sessionId"] : "",
    type,
    actorId: "coordinator",
    detail,
    createdAt: nowIso(),
  };
}

function readBridgeResult(value: unknown): ForgeBridgeResult {
  return toRecord(value);
}

function readBridgeReply(value: unknown): ForgeBridgeReply {
  return toRecord(value);
}

function readBridgeSession(value: unknown): ForgeBridgeSession {
  return toRecord(value);
}

function readCommandPayload(payload: Record<string, unknown>): Record<string, unknown> {
  // NOTE: Room UI commands arrive through the shared room-command registry with user fields nested
  // under roomPayload/roomArgs, so Forge handlers flatten them back into the expected shape here.
  return {
    ...toRecord(payload["roomArgs"]),
    ...toRecord(payload["roomPayload"]),
    ...payload,
  };
}

function normalizeSessionContextSelectionPayload(
  payload: Record<string, unknown>,
  existing: ForgeSessionContextSelection
): ForgeSessionContextSelection {
  if (
    Array.isArray(payload["skillKeys"]) ||
    Array.isArray(payload["equipmentKeys"]) ||
    Array.isArray(payload["preferenceKeys"])
  ) {
    return normalizeForgeSessionContextSelectionKeys(payload);
  }

  const skill = toRecord(payload["skill"]);
  const tools = toRecord(payload["tools"]);
  const preferences = toRecord(payload["preferences"]);
  const nextSkillKeys = new Set(existing.skillKeys);
  const nextEquipmentKeys = new Set(existing.equipmentKeys);
  const nextPreferenceKeys = new Set(existing.preferenceKeys);

  Object.entries(skill).forEach(([rawKey, value]) => {
    if (typeof value !== "boolean") {
      return;
    }
    const key = normalizeForgeLegacyIdentifier(rawKey);
    if (key === "") {
      return;
    }
    if (value === true) {
      nextSkillKeys.add(key);
    } else {
      nextSkillKeys.delete(key);
    }
  });

  Object.entries(tools).forEach(([rawKey, value]) => {
    if (typeof value !== "boolean") {
      return;
    }
    const key = normalizeForgeLegacyIdentifier(rawKey);
    if (key === "") {
      return;
    }
    if (value === true) {
      nextEquipmentKeys.add(key);
    } else {
      nextEquipmentKeys.delete(key);
    }
  });

  Object.entries(preferences).forEach(([rawKey, value]) => {
    if (typeof value !== "boolean") {
      return;
    }
    const key = normalizeForgeLegacyIdentifier(rawKey);
    if (key !== "mode" && key !== "risk_tolerance" && key !== "risktolerance") {
      return;
    }
    const preferenceKey = key === "mode" ? "mode" : "riskTolerance";
    if (value === true) {
      nextPreferenceKeys.add(preferenceKey);
    } else {
      nextPreferenceKeys.delete(preferenceKey);
    }
  });

  return normalizeForgeSessionContextSelectionKeys({
    skillKeys: [...nextSkillKeys],
    equipmentKeys: [...nextEquipmentKeys],
    preferenceKeys: [...nextPreferenceKeys],
  });
}

function normalizeRunOverridePayload(
  payload: Record<string, unknown>,
  existing: ForgeRunOverride | null
): ForgeRunOverride | null {
  const nextTemporaryConditions = Array.isArray(payload["temporaryConditions"])
    ? payload["temporaryConditions"].filter(
        (entry): entry is string => typeof entry === "string" && entry.trim() !== ""
      )
    : [...(existing?.temporaryConditions ?? [])];

  const hasNotesField = Object.prototype.hasOwnProperty.call(payload, "notes");
  const nextNotes =
    hasNotesField && typeof payload["notes"] === "string"
      ? payload["notes"].trim()
      : (asNonEmptyString(payload["notes"]) ?? existing?.notes ?? "");

  const nextMode =
    payload["mode"] === "learn_first" || payload["mode"] === "result_first"
      ? payload["mode"]
      : existing?.mode;
  const nextRiskTolerance =
    payload["riskTolerance"] === "low" ||
    payload["riskTolerance"] === "medium" ||
    payload["riskTolerance"] === "high"
      ? payload["riskTolerance"]
      : existing?.riskTolerance;
  const nextArchitectSeatId = isForgeArchitectSeatId(payload["architectSeatId"])
    ? payload["architectSeatId"]
    : existing?.architectSeatId;
  const nextRunOverride: ForgeRunOverride = {
    ...createEmptyForgeRunOverride(),
    ...(existing ?? {}),
    notes: nextNotes,
    enableRovoPreAnalysis:
      payload["enableRovoPreAnalysis"] === true ||
      (payload["enableRovoPreAnalysis"] !== false && existing?.enableRovoPreAnalysis === true),
    temporaryConditions: Array.from(
      new Set(nextTemporaryConditions.map((entry) => entry.trim()).filter((entry) => entry !== ""))
    ).sort((left, right) => left.localeCompare(right)),
    ...(nextArchitectSeatId === "ai2" ? { architectSeatId: nextArchitectSeatId } : {}),
    ...(nextMode ? { mode: nextMode } : {}),
    ...(nextRiskTolerance ? { riskTolerance: nextRiskTolerance } : {}),
  };

  if (
    nextRunOverride.architectSeatId !== "ai2" &&
    nextRunOverride.enableRovoPreAnalysis !== true &&
    nextRunOverride.mode === undefined &&
    nextRunOverride.notes.trim() === "" &&
    nextRunOverride.riskTolerance === undefined &&
    nextRunOverride.temporaryConditions.length === 0
  ) {
    return null;
  }

  return nextRunOverride;
}

function readBridgeReplyText(result: ForgeBridgeResult): string | null {
  const replyText = asNonEmptyString(readBridgeReply(result.reply)["text"]);
  return replyText ?? null;
}

function buildTaskRetryFeedback(
  validationMessages: string[],
  previousRawText: string | null
): string {
  const excerpt =
    previousRawText !== null && previousRawText.trim() !== ""
      ? `Previous response excerpt:\n${previousRawText.trim().slice(0, 600)}`
      : null;
  return [
    "Previous task response failed validation.",
    ...validationMessages.map((message) => `- ${message}`),
    excerpt,
    "Regenerate a corrected JSON response that satisfies the contract exactly.",
    "Keep the response short and do not leave JSON strings unfinished.",
  ]
    .filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    .join("\n");
}

function setGoalStatus(goal: ForgeGoal | null, status: ForgeGoal["status"]): ForgeGoal | null {
  return goal === null ? null : { ...goal, status, updatedAt: nowIso() };
}

export default function createForgeRoomHostRuntime() {
  return {
    activate(api: ForgeRoomApi) {
      const io = createForgeHostIoRuntime({
        roomId: FORGE_ROOM_ID,
      });
      const storage = createForgeSessionStorage({
        ensureRuntimeDirectory: io.ensureRuntimeDirectory,
        listDirectory: io.listDirectory,
        readJsonFile: io.readJsonFile,
        readTextFile: io.readTextFile,
        writeJsonFile: io.writeJsonFile,
        writeTextFile: io.writeTextFile,
      });
      const profileStorage = createForgeOperatorProfileStorage({
        ensureRuntimeDirectory: io.ensureRuntimeDirectory,
        readJsonFile: io.readJsonFile,
        writeJsonFile: io.writeJsonFile,
      });
      const handoffExport = createForgeHandoffExport();
      const runtime: ForgeRuntime = {
        activeSession: null,
        hydrated: false,
        hydrating: null,
        paths: null,
        sessionList: [],
        store: createForgeRuntimeStore(createEmptyForgeRuntimeState()),
      };

      function pushState(): void {
        const state = runtime.store.getState();
        api.notifyRoom("forge-state", {
          snapshot: createForgeRuntimeSnapshot(
            state,
            runtime.sessionList,
            buildExportReadiness(state)
          ),
          meta: {
            roleCatalog: FORGE_ROLE_CATALOG,
            personaPresets: FORGE_PERSONA_PRESETS,
          },
        });
      }

      runtime.store.subscribe(() => {
        pushState();
      });

      function readCurrentState(): ForgeRuntimeState {
        return runtime.store.getState();
      }

      function dispatchDecisionTrace(decisionTrace: string[]): void {
        runtime.store.dispatch({
          type: "decision-trace/set",
          decisionTrace,
        });
      }

      function dispatchOperatorProfile(operatorProfile: ForgeOperatorProfile): void {
        runtime.store.dispatch({
          type: "operator-profile/set",
          operatorProfile,
        });
      }

      function dispatchPreflight(preflight: ForgePreflightState): void {
        runtime.store.dispatch({
          type: "preflight/set",
          preflight,
        });
      }

      function dispatchSessionContext(sessionContextSelection: ForgeSessionContextSelection): void {
        runtime.store.dispatch({
          type: "session-context/set",
          sessionContextSelection,
        });
      }

      function dispatchArtifactStore(artifactStore: ForgeRuntimeState["artifactStore"]): void {
        runtime.store.dispatch({
          type: "artifact-store/set",
          artifactStore,
        });
      }

      function dispatchRunContext(
        contextDigest: string | null,
        runId: string | null,
        runOverride: ForgeRunOverride | null,
        runSignature: ForgeRunSignature | null,
        sessionRevision: number
      ): void {
        runtime.store.dispatch({
          type: "run-context/set",
          contextDigest,
          runId,
          runOverride,
          runSignature,
          sessionRevision,
        });
      }

      function buildSelectedOperatorContext(
        operatorProfile = readCurrentState().operatorProfile,
        sessionContextSelection = readCurrentState().sessionContextSelection
      ) {
        return buildForgeSelectedOperatorProfile({
          operatorProfile,
          sessionContextSelection,
        });
      }

      function reconcileSelectionForProfile(
        operatorProfile: ForgeOperatorProfile,
        sessionContextSelection: ForgeSessionContextSelection
      ): ForgeSessionContextSelection {
        return reconcileForgeSessionContextSelection({
          selection: sessionContextSelection,
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
      }

      function buildCurrentContextDigest(
        goal: ForgeGoal,
        overrides: {
          operatorProfile?: ForgeOperatorProfile;
          runOverride?: ForgeRunOverride | null;
          sessionContextSelection?: ForgeSessionContextSelection;
        } = {}
      ): string {
        const operatorProfile = overrides.operatorProfile ?? readCurrentState().operatorProfile;
        const sessionContextSelection =
          overrides.sessionContextSelection ?? readCurrentState().sessionContextSelection;
        const runOverride = overrides.runOverride ?? readCurrentState().runOverride;
        return buildContextDigest({
          goal,
          preflightInputFields: {
            enableRovoPreAnalysis: runOverride?.enableRovoPreAnalysis === true,
          },
          runOverride,
          selectedOperatorProfile: buildSelectedOperatorContext(
            operatorProfile,
            sessionContextSelection
          ),
          sessionContextSelection,
        });
      }

      function mutateActiveRunArtifacts(
        mutate: (
          entry: NonNullable<ReturnType<typeof readForgeRunArtifacts>>
        ) => ReturnType<typeof createForgeRunArtifacts>
      ): void {
        const state = readCurrentState();
        if (state.currentGoal === null || state.runId === null || state.contextDigest === null) {
          return;
        }
        const existing =
          readForgeRunArtifacts(state.artifactStore, state.runId, state.ownerScopeId) ??
          createForgeRunArtifacts({
            contextDigest: state.contextDigest,
            ownerScopeId: state.ownerScopeId,
            runId: state.runId,
            runSignature: state.runSignature,
            sessionRevision: state.sessionRevision,
          });
        dispatchArtifactStore(upsertForgeRunArtifacts(state.artifactStore, mutate(existing)));
      }

      function syncRunRevision(
        goal: ForgeGoal | null,
        options: {
          operatorProfile?: ForgeOperatorProfile;
          resetMutableStateOnChange?: boolean;
          runOverride?: ForgeRunOverride | null;
          sessionContextSelection?: ForgeSessionContextSelection;
        } = {}
      ): {
        changed: boolean;
        contextDigest: string | null;
        runId: string | null;
        runSignature: ForgeRunSignature | null;
        sessionRevision: number;
      } {
        const state = readCurrentState();
        if (goal === null) {
          const runOverride =
            options.runOverride !== undefined ? options.runOverride : state.runOverride;
          dispatchRunContext(null, null, runOverride, null, state.sessionRevision);
          dispatchArtifactStore({
            ...state.artifactStore,
            activeRunId: null,
          });
          return {
            changed: state.runId !== null || state.contextDigest !== null,
            contextDigest: null,
            runId: null,
            runSignature: null,
            sessionRevision: state.sessionRevision,
          };
        }

        const operatorProfile = options.operatorProfile ?? state.operatorProfile;
        const sessionContextSelection =
          options.sessionContextSelection ?? state.sessionContextSelection;
        const runOverride = options.runOverride ?? state.runOverride;
        const contextDigest = buildCurrentContextDigest(goal, {
          operatorProfile,
          runOverride,
          sessionContextSelection,
        });
        const runSignature = buildForgeRunSignature({
          goal,
          selectedOperatorProfile: buildSelectedOperatorContext(
            operatorProfile,
            sessionContextSelection
          ),
          runOverride,
        });
        const changed = state.contextDigest !== contextDigest || state.runId === null;
        const sessionRevision = changed ? state.sessionRevision + 1 : state.sessionRevision;
        const runId = changed ? createForgeId("forge-run") : state.runId;
        const nextEntry =
          runId !== null
            ? changed
              ? createForgeRunArtifacts({
                  contextDigest,
                  ownerScopeId: state.ownerScopeId,
                  runId,
                  runSignature,
                  sessionRevision,
                })
              : (() => {
                  const existing = readForgeRunArtifacts(
                    state.artifactStore,
                    runId,
                    state.ownerScopeId
                  );
                  return existing
                    ? {
                        ...existing,
                        contextDigest,
                        runSignature,
                        sessionRevision,
                      }
                    : createForgeRunArtifacts({
                        contextDigest,
                        ownerScopeId: state.ownerScopeId,
                        runId,
                        runSignature,
                        sessionRevision,
                      });
                })()
            : null;
        const nextArtifactStore =
          nextEntry === null
            ? {
                ...state.artifactStore,
                activeRunId: null,
              }
            : upsertForgeRunArtifacts(state.artifactStore, nextEntry);

        dispatchArtifactStore(nextArtifactStore);
        dispatchRunContext(contextDigest, runId, runOverride, runSignature, sessionRevision);

        if (changed && options.resetMutableStateOnChange === true) {
          dispatchDraftState([], null, []);
          clearExecutionState();
          dispatchPreflight({
            ...createEmptyForgePreflightState(),
            contextDigest,
            expectedContextDigest: contextDigest,
            runId,
            sessionRevision,
          });
        }

        return {
          changed,
          contextDigest,
          runId,
          runSignature,
          sessionRevision,
        };
      }

      function readPreflightStageMessage(reason: string): string {
        const state = readCurrentState();
        return describeForgePreflightStageImpact(
          readForgePreflightStage({
            hasDispatchStarted: state.assignments.some(
              (assignment) => assignment.status !== "queued"
            ),
            hasSelectedSynthesis: state.selectedSynthesisId !== null,
            hasTopLevelApprovedTasks: state.approvedTasks.some((task) => task.level === 1),
            hasTopLevelDraftTasks: state.draftTasks.some((task) => task.level === 1),
          }),
          reason
        );
      }

      function markPreflightStale(reason: string): void {
        const state = readCurrentState();
        dispatchPreflight({
          ...state.preflight,
          status: "stale",
          expectedContextDigest: state.contextDigest,
          runId: state.runId,
          sessionRevision: state.sessionRevision,
          staleReason: reason,
        });
      }

      function invalidatePreflight(reason: string): void {
        markPreflightStale(reason);
        syncCoordinatorState({
          note: readPreflightStageMessage(reason),
        });
      }

      function refreshPreflightValidity(goal: ForgeGoal | null): string | null {
        if (goal === null) {
          return null;
        }
        const state = readCurrentState();
        const reason = readForgePreflightInvalidationReason({
          goal,
          operatorProfile: state.operatorProfile,
          preflight: state.preflight,
          runOverride: state.runOverride,
          sessionContextSelection: state.sessionContextSelection,
        });
        if (reason === null) {
          if (state.preflight.bundle !== null && state.preflight.status === "stale") {
            dispatchPreflight({
              ...state.preflight,
              status: state.preflight.warnings.length > 0 ? "warning" : "fresh",
              staleReason: null,
            });
          }
          return null;
        }
        if (state.preflight.bundle !== null || state.preflight.status === "stale") {
          markPreflightStale(reason);
        }
        return reason;
      }

      function dispatchGoal(goal: ForgeGoal | null): void {
        runtime.store.dispatch({
          type: "goal/set",
          goal,
        });
      }

      function dispatchDraftState(
        draftTasks: ForgeTask[],
        draftSourceText: string | null,
        validationMessages: string[]
      ): void {
        runtime.store.dispatch({
          type: "draft/set",
          draftTasks,
          draftSourceText,
          validationMessages,
        });
      }

      function dispatchApprovedTasks(approvedTasks: ForgeTask[]): void {
        runtime.store.dispatch({
          type: "approved/set",
          approvedTasks,
        });
      }

      function dispatchAssignments(assignments: ForgeTaskAssignment[]): void {
        runtime.store.dispatch({
          type: "assignments/set",
          assignments,
        });
      }

      function dispatchResponses(responses: ForgeAgentResponse[]): void {
        runtime.store.dispatch({
          type: "responses/set",
          responses,
        });
      }

      function dispatchConflicts(conflicts: ForgeConflict[]): void {
        runtime.store.dispatch({
          type: "conflicts/set",
          conflicts,
        });
      }

      function dispatchSyntheses(
        syntheses: ForgeSynthesis[],
        selectedSynthesisId: string | null
      ): void {
        runtime.store.dispatch({
          type: "syntheses/set",
          syntheses,
          selectedSynthesisId,
        });
      }

      function dispatchExports(exportsList: ForgeRuntimeState["exports"]): void {
        runtime.store.dispatch({
          type: "exports/set",
          exports: exportsList,
        });
      }

      function clearExecutionState(): void {
        dispatchDecisionTrace([]);
        dispatchApprovedTasks([]);
        dispatchAssignments([]);
        dispatchResponses([]);
        dispatchConflicts([]);
        dispatchSyntheses([], null);
        dispatchExports([]);
      }

      function buildExportReadiness(
        state: ForgeRuntimeState
      ): ReturnType<typeof handoffExport.buildExportReadySummary> {
        return handoffExport.buildExportReadySummary(
          createForgeSessionFromRuntimeState(state, runtime.activeSession)
        );
      }

      function inferPlanStatus(
        state: ForgeRuntimeState
      ): ForgeRuntimeState["coordinatorState"]["planStatus"] {
        if (state.exports.length > 0) {
          return "exported";
        }
        if (
          state.responses.length > 0 &&
          state.conflicts.some((entry) => entry.status === "open")
        ) {
          return "reviewing-conflicts";
        }
        if (state.selectedSynthesisId !== null) {
          return "synthesis-ready";
        }
        if (state.responses.length > 0) {
          return "synthesis-ready";
        }
        if (state.approvedTasks.length > 0) {
          return "ready-for-assignment";
        }
        if (state.draftTasks.length > 0) {
          return "awaiting-approval";
        }
        if (state.currentGoal !== null) {
          return "drafting";
        }
        return "idle";
      }

      function syncCoordinatorState(
        overrides: Partial<ForgeRuntimeState["coordinatorState"]> = {}
      ): void {
        const state = readCurrentState();
        const exportSummary = buildExportReadiness(state);
        const nextCoordinatorState = createForgeCoordinatorState({
          planStatus: overrides.planStatus ?? inferPlanStatus(state),
          assignmentQueueTotal: state.assignments.length,
          pendingAssignmentCount:
            overrides.pendingAssignmentCount ??
            state.assignments.filter(
              (entry) => entry.status === "queued" || entry.status === "dispatched"
            ).length,
          completedResponseCount: state.responses.length,
          pendingConflictCount: state.conflicts.filter((entry) => entry.status === "open").length,
          synthesisStatus:
            overrides.synthesisStatus ??
            (state.selectedSynthesisId !== null
              ? "selected"
              : state.syntheses.length > 0
                ? "drafted"
                : state.responses.length > 0 &&
                    state.conflicts.some((entry) => entry.status === "open")
                  ? "blocked"
                  : state.responses.length > 0
                    ? "ready"
                    : "idle"),
          exportReady: overrides.exportReady ?? exportSummary.exportReady,
          lastExportPath: overrides.lastExportPath ?? state.exports[0]?.filePath ?? null,
          note: overrides.note ?? state.coordinatorState.note,
          lastUpdatedAt: nowIso(),
        });
        runtime.store.dispatch({
          type: "coordinator/set",
          coordinatorState: nextCoordinatorState,
        });
      }

      function setGoalAndResetWorkflow(goal: ForgeGoal, note: string): void {
        dispatchGoal(goal);
        dispatchDraftState([], null, []);
        clearExecutionState();
        syncRunRevision(goal, {
          resetMutableStateOnChange: false,
        });
        markPreflightStale("Goal changed after the last preflight run.");
        syncCoordinatorState({
          planStatus: "drafting",
          synthesisStatus: "idle",
          note,
        });
      }

      async function ensureHydrated(): Promise<void> {
        if (runtime.hydrated === true) {
          return;
        }
        if (runtime.hydrating !== null) {
          await runtime.hydrating;
          return;
        }

        runtime.hydrating = (async () => {
          runtime.paths = await io.resolveRuntimePaths();
          runtime.sessionList = await storage.listSessions(runtime.paths);
          dispatchOperatorProfile(await profileStorage.loadProfile(runtime.paths));
          runtime.hydrated = true;
          pushState();
        })()
          .catch((error) => {
            api.log(
              "warn",
              `Forge Room bootstrap failed: ${error instanceof Error ? error.message : String(error)}`
            );
            throw error;
          })
          .finally(() => {
            runtime.hydrating = null;
          });

        await runtime.hydrating;
      }

      async function persistCurrentSession(
        eventType?: string,
        detail: Record<string, unknown> = {}
      ): Promise<void> {
        if (runtime.paths === null) {
          return;
        }

        const state = readCurrentState();
        if (state.activeSessionId === null) {
          return;
        }

        const eventRecord = eventType ? createEvent(eventType, detail) : null;
        const nextSession = createForgeSessionFromRuntimeState(state, runtime.activeSession);
        nextSession.eventLog = eventRecord
          ? [...(runtime.activeSession?.eventLog ?? []), eventRecord]
          : (runtime.activeSession?.eventLog ?? []);
        runtime.activeSession = nextSession;
        await storage.saveSession(runtime.paths, nextSession);
        if (eventRecord !== null) {
          await storage.appendEvent(runtime.paths, nextSession.id, eventRecord);
        }
        runtime.sessionList = await storage.listSessions(runtime.paths);
        pushState();
      }

      async function createSession(
        payload: Record<string, unknown> = {}
      ): Promise<{ success: boolean; sessionId: string }> {
        await ensureHydrated();
        if (runtime.paths === null) {
          throw new Error("Forge Room paths are unavailable.");
        }

        const persistSession = payload["persist"] !== false;
        const session = await storage.createSession(runtime.paths, {
          persist: persistSession,
        });
        runtime.activeSession = session;
        runtime.store.dispatch({
          type: "runtime/hydrate",
          state: createForgeRuntimeStateFromSession(session, {
            operatorProfile: readCurrentState().operatorProfile,
          }),
        });
        syncCoordinatorState({
          planStatus: "drafting",
          note: "Session created. Define a goal and generate the first draft breakdown.",
        });
        if (persistSession) {
          runtime.sessionList = await storage.listSessions(runtime.paths);
          await persistCurrentSession("session-created", {
            sessionId: session.id,
          });
        } else {
          runtime.sessionList = await storage.listSessions(runtime.paths);
          pushState();
        }
        return {
          success: true,
          sessionId: session.id,
        };
      }

      async function ensureActiveSession(): Promise<void> {
        if (readCurrentState().activeSessionId !== null) {
          return;
        }
        await createSession();
      }

      async function requireDispatchBridge(): Promise<NonNullable<ForgeRoomApi["dispatchBridge"]>> {
        if (typeof api.dispatchBridge !== "function") {
          throw new Error("Forge Room dispatch bridge is unavailable.");
        }
        return api.dispatchBridge;
      }

      function buildPromptContext(taskContextCapsule: ForgeContextCapsule | null = null): string {
        const state = readCurrentState();
        const matchedPreflight = getPreflightForRun(
          state.runId,
          state.contextDigest,
          state.preflight
        );
        return renderForgePromptContext({
          bundle:
            matchedPreflight !== null &&
            (matchedPreflight.status === "fresh" || matchedPreflight.status === "warning")
              ? matchedPreflight.bundle
              : null,
          contextCapsule: taskContextCapsule,
          decisionTrace: state.decisionTrace,
          runSignature: state.runSignature,
        });
      }

      function readActiveLocale(): string {
        return resolveForgePromptLocale(
          typeof api.getLocale === "function" ? api.getLocale() : "tr"
        );
      }

      function buildCurrentSynthesisProvenance(state: ForgeRuntimeState) {
        return buildForgeSynthesisProvenance({
          preflight: state.preflight,
          runOverride: state.runOverride,
          runSignature: state.runSignature,
          selectedOperatorProfile: buildSelectedOperatorContext(
            state.operatorProfile,
            state.sessionContextSelection
          ),
          sessionContextSelection: state.sessionContextSelection,
        });
      }

      function logForgeRuntimeEvent(
        level: "info" | "warn",
        message: string,
        context: Record<string, unknown>
      ): void {
        try {
          api.log(
            level,
            `${message} ${JSON.stringify({
              userId: readCurrentState().ownerScopeId,
              slotId: "forge-room",
              provider: "forge-room",
              ...context,
            })}`
          );
        } catch {
          api.log(level, message);
        }
      }

      function assertFreshPreflightOrLog(
        stage: string,
        params: {
          contextDigest: string;
          preflight: ForgePreflightState;
          runId: string;
        }
      ): void {
        try {
          assertFreshPreflight(params);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logForgeRuntimeEvent("warn", "Forge Room stale preflight rejected.", {
            eventCode: classifyFreshPreflightError(params),
            stage,
            runId: params.runId,
            contextDigest: params.contextDigest,
            preflightId: params.preflight.preflightId,
            sessionRevision: params.preflight.sessionRevision,
            error: errorMessage,
          });
          throw error;
        }
      }

      function logSynthesisSnapshotFrozen(
        snapshot: ReturnType<typeof createSynthesisSnapshot>,
        reason: "fallback" | "generated"
      ): void {
        logForgeRuntimeEvent("info", "Forge Room synthesis snapshot frozen.", {
          eventCode: "forge.snapshot.created",
          reason,
          runId: snapshot.runId,
          contextDigest: snapshot.contextDigest,
          preflightId: snapshot.preflightId,
          synthesisId: snapshot.synthesisId,
          sessionRevision: snapshot.sessionRevision,
          snapshotHash: snapshot.snapshotHash,
        });
      }

      function readSynthesisSnapshotById(
        synthesisId: string | null,
        state: ForgeRuntimeState = readCurrentState()
      ) {
        return readForgeSynthesisSnapshot(state.artifactStore, synthesisId, state.ownerScopeId);
      }

      async function ensureFreshPreflight(
        goal: ForgeGoal,
        options: {
          force?: boolean;
        } = {}
      ): Promise<{
        preflight: ForgePreflightState;
        runSignature: ForgeRunSignature | null;
      }> {
        const state = readCurrentState();
        const runRevision = syncRunRevision(goal, {
          resetMutableStateOnChange: options.force === true ? false : false,
        });
        const invalidationReason = readForgePreflightInvalidationReason({
          goal,
          operatorProfile: state.operatorProfile,
          preflight: state.preflight,
          runOverride: state.runOverride,
          sessionContextSelection: state.sessionContextSelection,
        });
        const matchedPreflight = getPreflightForRun(
          runRevision.runId,
          runRevision.contextDigest,
          state.preflight
        );
        if (
          options.force !== true &&
          invalidationReason === null &&
          matchedPreflight !== null &&
          (matchedPreflight.status === "fresh" || matchedPreflight.status === "warning")
        ) {
          return {
            preflight: matchedPreflight,
            runSignature: runRevision.runSignature,
          };
        }

        const dispatchBridge =
          typeof api.dispatchBridge === "function" ? await requireDispatchBridge() : null;
        try {
          const preflight = await buildForgePreflightState({
            dispatchBridge,
            goal,
            locale: readActiveLocale(),
            onStepStart(stepId) {
              const currentPreflight = readCurrentState().preflight;
              dispatchPreflight({
                ...currentPreflight,
                activeStepId: stepId,
                contextDigest: runRevision.contextDigest,
                expectedContextDigest: runRevision.contextDigest,
                runId: runRevision.runId,
                sessionRevision: runRevision.sessionRevision,
                status: "running",
                staleReason: invalidationReason,
              });
            },
            operatorProfile: state.operatorProfile,
            protocol: {
              key: FORGE_PROTOCOL_KEYS.preflightPreAnalysis,
              room: FORGE_ROOM_ID,
              scenario: FORGE_PROTOCOL_SCENARIOS.preflightPreAnalysis,
            },
            runOverride: state.runOverride,
            sessionRevision: runRevision.sessionRevision,
            sessionContextSelection: state.sessionContextSelection,
            sessionId: state.activeSessionId,
            ...(runRevision.contextDigest ? { contextDigest: runRevision.contextDigest } : {}),
            ...(runRevision.runId ? { runId: runRevision.runId } : {}),
          });
          assertFreshPreflightOrLog("preflight-refresh", {
            contextDigest: runRevision.contextDigest ?? "",
            preflight: preflight.state,
            runId: runRevision.runId ?? "",
          });
          dispatchPreflight(preflight.state);
          mutateActiveRunArtifacts((entry) => withForgeRunPreflight(entry, preflight.state));
          return {
            preflight: preflight.state,
            runSignature: preflight.runSignature,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const fallback = buildForgeFallbackPreflightState({
            errorMessage: message,
            goal,
            operatorProfile: state.operatorProfile,
            runOverride: state.runOverride,
            sessionRevision: runRevision.sessionRevision,
            sessionContextSelection: state.sessionContextSelection,
            sessionId: state.activeSessionId,
            ...(runRevision.contextDigest ? { contextDigest: runRevision.contextDigest } : {}),
            ...(runRevision.runId ? { runId: runRevision.runId } : {}),
          });
          dispatchPreflight(fallback.state);
          mutateActiveRunArtifacts((entry) => withForgeRunPreflight(entry, fallback.state));
          logForgeRuntimeEvent("warn", "Forge Room preflight fallback engaged.", {
            eventCode: "forge.preflight.fallback",
            runId: runRevision.runId,
            contextDigest: runRevision.contextDigest,
            preflightId: fallback.state.preflightId,
            sessionRevision: runRevision.sessionRevision,
            error: message,
          });
          return {
            preflight: fallback.state,
            runSignature: fallback.runSignature,
          };
        }
      }

      async function runBreakdownAttempt(
        goal: ForgeGoal,
        extraFeedback: string | null,
        architectSeatId: ForgeArchitectSeatId
      ): Promise<string> {
        const dispatchBridge = await requireDispatchBridge();
        const promptText = [
          buildForgeBreakdownPrompt(goal, {
            locale: readActiveLocale(),
            promptContext: buildPromptContext(),
          }),
          extraFeedback ?? "",
        ]
          .filter((entry) => entry && entry.trim() !== "")
          .join("\n\n");
        const bridgeResult = readBridgeResult(
          await dispatchBridge({
            action: "message.sendWait",
            timeoutMs: 180000,
            toSlot: architectSeatId,
            payload: {
              page: "forge-room:breakdown",
              text: promptText,
              protocol: {
                room: FORGE_ROOM_ID,
                scenario: FORGE_PROTOCOL_SCENARIOS.breakdownArchitect,
                protocolKey: FORGE_PROTOCOL_KEYS.breakdownArchitect,
              },
            },
          })
        );
        if (bridgeResult.success !== true) {
          throw new Error(asNonEmptyString(bridgeResult.message) ?? "Breakdown dispatch failed.");
        }
        const replyText = readBridgeReplyText(bridgeResult);
        if (replyText === null) {
          throw new Error("Breakdown dispatch did not return readable text.");
        }
        return replyText;
      }

      async function updateGoal(
        payload: Record<string, unknown>
      ): Promise<{ success: boolean; goalId: string }> {
        await ensureHydrated();
        await ensureActiveSession();
        const nextGoal = buildGoal(payload, readCurrentState().currentGoal);
        setGoalAndResetWorkflow(
          nextGoal,
          "Goal updated. Generate a draft breakdown when you are ready."
        );
        await persistCurrentSession("goal-updated", {
          sessionId: readCurrentState().activeSessionId,
          goalId: nextGoal.id,
        });
        return {
          success: true,
          goalId: nextGoal.id,
        };
      }

      async function generateDraft(payload: Record<string, unknown>): Promise<{
        success: boolean;
        draftTaskCount?: number;
        goalId?: string;
        message?: string;
        validationMessages?: string[];
      }> {
        await ensureHydrated();
        await ensureActiveSession();
        const stateBeforeGoal = readCurrentState();
        const nextGoal = buildGoal(payload, stateBeforeGoal.currentGoal);
        const nextRunOverride = normalizeRunOverridePayload(payload, stateBeforeGoal.runOverride);
        const effectiveArchitectSeatId = resolveForgeArchitectSeatId(nextRunOverride);
        syncRunRevision(nextGoal, {
          resetMutableStateOnChange: true,
          runOverride: nextRunOverride,
        });
        if (JSON.stringify(nextRunOverride) !== JSON.stringify(stateBeforeGoal.runOverride)) {
          await persistCurrentSession("run-override-updated", {
            sessionId: readCurrentState().activeSessionId,
            source: "generate-draft",
          });
        }
        dispatchGoal(setGoalStatus(nextGoal, "draft"));
        dispatchDraftState([], null, []);
        clearExecutionState();
        syncCoordinatorState({
          planStatus: "generating-draft",
          synthesisStatus: "idle",
          note: `Generating a draft breakdown through ${effectiveArchitectSeatId.toUpperCase()}.`,
        });

        let lastParsed = {
          draftSourceText: "",
          payload: null as ReturnType<typeof parseForgeBreakdownDraft>["payload"],
          validationMessages: ["Draft breakdown did not start."],
        };

        for (let attempt = 0; attempt < 2; attempt += 1) {
          const extraFeedback =
            attempt === 0
              ? null
              : [
                  "Previous draft failed validation.",
                  ...lastParsed.validationMessages.map((message) => `- ${message}`),
                  "Regenerate a corrected JSON response that satisfies the contract exactly.",
                ].join("\n");
          // eslint-disable-next-line no-await-in-loop -- NOTE: retries must stay ordered so validator feedback applies to the latest draft.
          const rawText = await runBreakdownAttempt(
            nextGoal,
            extraFeedback,
            effectiveArchitectSeatId
          );
          lastParsed = parseForgeBreakdownDraft(rawText);
          if (lastParsed.payload !== null && lastParsed.validationMessages.length === 0) {
            const normalized = normalizeForgeBreakdownDraft(lastParsed.payload);
            const updatedGoal = {
              ...nextGoal,
              acceptanceCriteria:
                nextGoal.acceptanceCriteria.length > 0
                  ? nextGoal.acceptanceCriteria
                  : normalized.acceptanceCriteria,
              status: "draft-ready" as const,
              updatedAt: nowIso(),
            };
            dispatchGoal(updatedGoal);
            dispatchDraftState(normalized.draftTasks, normalized.draftSourceText, []);
            mutateActiveRunArtifacts((entry) =>
              withForgeRunDraftArtifacts(entry, {
                draftSourceText: normalized.draftSourceText,
                taskIds: normalized.draftTasks.map((task) => task.id),
                validationMessages: [],
              })
            );
            syncCoordinatorState({
              planStatus: "awaiting-approval",
              note: "Draft breakdown is ready for review and approval.",
            });
            // eslint-disable-next-line no-await-in-loop -- NOTE: successful draft generation should persist before leaving the retry loop.
            await persistCurrentSession("draft-generated", {
              sessionId: readCurrentState().activeSessionId,
              goalId: updatedGoal.id,
              draftTaskCount: normalized.draftTasks.filter((task) => task.level === 1).length,
            });
            return {
              success: true,
              goalId: updatedGoal.id,
              draftTaskCount: normalized.draftTasks.filter((task) => task.level === 1).length,
            };
          }
        }

        const normalizedInvalid =
          lastParsed.payload !== null ? normalizeForgeBreakdownDraft(lastParsed.payload) : null;
        dispatchGoal(setGoalStatus(nextGoal, "draft"));
        dispatchDraftState(
          normalizedInvalid?.draftTasks ?? [],
          lastParsed.draftSourceText || (normalizedInvalid?.draftSourceText ?? null),
          lastParsed.validationMessages
        );
        mutateActiveRunArtifacts((entry) =>
          withForgeRunDraftArtifacts(entry, {
            draftSourceText:
              lastParsed.draftSourceText || (normalizedInvalid?.draftSourceText ?? null),
            taskIds: normalizedInvalid?.draftTasks.map((task) => task.id) ?? [],
            validationMessages: lastParsed.validationMessages,
          })
        );
        syncCoordinatorState({
          planStatus: "blocked",
          synthesisStatus: "idle",
          note: "Draft breakdown needs manual correction before approval can continue.",
        });
        await persistCurrentSession("draft-blocked", {
          sessionId: readCurrentState().activeSessionId,
          goalId: nextGoal.id,
          validationMessages: lastParsed.validationMessages,
        });
        return {
          success: false,
          goalId: nextGoal.id,
          message: "Draft breakdown needs manual correction before approval.",
          validationMessages: lastParsed.validationMessages,
        };
      }

      async function applyDraftText(payload: Record<string, unknown>): Promise<{
        success: boolean;
        draftTaskCount?: number;
        message?: string;
        validationMessages?: string[];
      }> {
        await ensureHydrated();
        await ensureActiveSession();
        const sourceText =
          asNonEmptyString(payload["draftText"]) ?? readCurrentState().draftSourceText ?? "";
        const parsed = parseForgeBreakdownDraft(sourceText);
        if (parsed.payload === null) {
          dispatchDraftState([], sourceText, parsed.validationMessages);
          syncCoordinatorState({
            planStatus: "blocked",
            note: "Manual draft text is not valid JSON yet.",
          });
          await persistCurrentSession("draft-edited-invalid", {
            sessionId: readCurrentState().activeSessionId,
            validationMessages: parsed.validationMessages,
          });
          return {
            success: false,
            message: "Manual draft text is not valid JSON yet.",
            validationMessages: parsed.validationMessages,
          };
        }

        const normalized = normalizeForgeBreakdownDraft(parsed.payload);
        clearExecutionState();
        const nextGoal = readCurrentState().currentGoal;
        if (nextGoal !== null) {
          dispatchGoal({
            ...nextGoal,
            acceptanceCriteria:
              parsed.payload.acceptanceCriteria.length > 0
                ? parsed.payload.acceptanceCriteria
                : nextGoal.acceptanceCriteria,
            status: parsed.validationMessages.length === 0 ? "draft-ready" : "draft",
            updatedAt: nowIso(),
          });
        }
        dispatchDraftState(
          normalized.draftTasks,
          normalized.draftSourceText,
          parsed.validationMessages
        );
        mutateActiveRunArtifacts((entry) =>
          withForgeRunDraftArtifacts(entry, {
            draftSourceText: normalized.draftSourceText,
            taskIds: normalized.draftTasks.map((task) => task.id),
            validationMessages: parsed.validationMessages,
          })
        );
        syncCoordinatorState({
          planStatus: parsed.validationMessages.length === 0 ? "awaiting-approval" : "blocked",
          note:
            parsed.validationMessages.length === 0
              ? "Manual draft applied. Review and approve when ready."
              : "Manual draft still has validation issues.",
        });
        await persistCurrentSession(
          parsed.validationMessages.length === 0 ? "draft-edited" : "draft-edited-invalid",
          {
            sessionId: readCurrentState().activeSessionId,
            validationMessages: parsed.validationMessages,
          }
        );
        return {
          success: parsed.validationMessages.length === 0,
          draftTaskCount: normalized.draftTasks.filter((task) => task.level === 1).length,
          ...(parsed.validationMessages.length > 0
            ? {
                message: "Manual draft still has validation issues.",
                validationMessages: parsed.validationMessages,
              }
            : {}),
        };
      }

      async function upsertDraftTask(payload: Record<string, unknown>): Promise<{
        success: boolean;
        draftTaskCount?: number;
        message?: string;
        validationMessages?: string[];
      }> {
        await ensureHydrated();
        await ensureActiveSession();
        const state = readCurrentState();
        const result = upsertForgeDraftTask({
          acceptanceCriteria: state.currentGoal?.acceptanceCriteria ?? [],
          draftTasks: state.draftTasks,
          payload,
        });
        clearExecutionState();
        dispatchDraftState(result.draftTasks, result.draftSourceText, result.validationMessages);
        mutateActiveRunArtifacts((entry) =>
          withForgeRunDraftArtifacts(entry, {
            draftSourceText: result.draftSourceText,
            taskIds: result.draftTasks.map((task) => task.id),
            validationMessages: result.validationMessages,
          })
        );
        if (state.currentGoal !== null) {
          dispatchGoal({
            ...state.currentGoal,
            status: result.validationMessages.length === 0 ? "draft-ready" : "draft",
            updatedAt: nowIso(),
          });
        }
        syncCoordinatorState({
          planStatus: result.validationMessages.length === 0 ? "awaiting-approval" : "blocked",
          note:
            result.validationMessages.length === 0
              ? "Structured draft task changes were applied."
              : "Structured draft edits still have validation issues.",
        });
        await persistCurrentSession(
          result.validationMessages.length === 0
            ? "draft-task-upserted"
            : "draft-task-upserted-invalid",
          {
            sessionId: state.activeSessionId,
            validationMessages: result.validationMessages,
          }
        );
        return {
          success: result.validationMessages.length === 0,
          draftTaskCount: result.draftTasks.filter((task) => task.level === 1).length,
          ...(result.validationMessages.length > 0
            ? {
                message: "Structured draft edits still have validation issues.",
                validationMessages: result.validationMessages,
              }
            : {}),
        };
      }

      async function removeDraftTaskFromSession(payload: Record<string, unknown>): Promise<{
        success: boolean;
        draftTaskCount?: number;
        message?: string;
        validationMessages?: string[];
      }> {
        await ensureHydrated();
        await ensureActiveSession();
        const state = readCurrentState();
        const taskId = asNonEmptyString(payload["taskId"]);
        if (taskId === null) {
          return {
            success: false,
            message: "A draft task id is required.",
          };
        }
        const result = removeForgeDraftTask({
          acceptanceCriteria: state.currentGoal?.acceptanceCriteria ?? [],
          draftTasks: state.draftTasks,
          taskId,
        });
        clearExecutionState();
        dispatchDraftState(result.draftTasks, result.draftSourceText, result.validationMessages);
        mutateActiveRunArtifacts((entry) =>
          withForgeRunDraftArtifacts(entry, {
            draftSourceText: result.draftSourceText,
            taskIds: result.draftTasks.map((task) => task.id),
            validationMessages: result.validationMessages,
          })
        );
        if (state.currentGoal !== null) {
          dispatchGoal({
            ...state.currentGoal,
            status: result.validationMessages.length === 0 ? "draft-ready" : "draft",
            updatedAt: nowIso(),
          });
        }
        syncCoordinatorState({
          planStatus: result.validationMessages.length === 0 ? "awaiting-approval" : "blocked",
          note:
            result.validationMessages.length === 0
              ? "Draft task removed."
              : "Draft task was removed, but the draft now needs manual correction.",
        });
        await persistCurrentSession(
          result.validationMessages.length === 0
            ? "draft-task-removed"
            : "draft-task-removed-invalid",
          {
            sessionId: state.activeSessionId,
            validationMessages: result.validationMessages,
          }
        );
        return {
          success: result.validationMessages.length === 0,
          draftTaskCount: result.draftTasks.filter((task) => task.level === 1).length,
          ...(result.validationMessages.length > 0
            ? {
                message: "The remaining draft needs manual correction before approval.",
                validationMessages: result.validationMessages,
              }
            : {}),
        };
      }

      async function approveDraft(): Promise<{
        success: boolean;
        approvedTaskCount?: number;
        message?: string;
      }> {
        await ensureHydrated();
        await ensureActiveSession();
        const state = readCurrentState();
        if (state.draftTasks.length === 0) {
          return {
            success: false,
            message: "Generate or apply a draft before approval.",
          };
        }
        if (state.validationMessages.length > 0) {
          syncCoordinatorState({
            planStatus: "blocked",
            note: "Draft approval is blocked until validation issues are resolved.",
          });
          return {
            success: false,
            message: "Draft approval is blocked until validation issues are resolved.",
          };
        }

        const approvedTasks = state.draftTasks.map((task) => ({
          ...task,
          status: "approved" as const,
        }));
        const assignments = createAssignmentsForApprovedTasks(approvedTasks, {
          contextDigest: state.contextDigest,
          runId: state.runId,
          sessionRevision: state.sessionRevision,
        });
        dispatchApprovedTasks(approvedTasks);
        dispatchAssignments(assignments);
        dispatchResponses([]);
        dispatchConflicts([]);
        dispatchSyntheses([], null);
        dispatchExports([]);
        dispatchDecisionTrace([]);
        approvedTasks.forEach((task) => {
          mutateActiveRunArtifacts((entry) =>
            withForgeRunSelectedContextCapsule(entry, task.id, task.contextCapsule ?? null)
          );
        });
        dispatchGoal(setGoalStatus(state.currentGoal, "approved"));
        syncCoordinatorState({
          planStatus: "ready-for-assignment",
          synthesisStatus: "idle",
          note: "Draft approved. Dispatch the queued assignments to start response capture.",
        });
        await persistCurrentSession("draft-approved", {
          sessionId: state.activeSessionId,
          approvedTaskCount: approvedTasks.filter((task) => task.level === 1).length,
        });
        return {
          success: true,
          approvedTaskCount: approvedTasks.filter((task) => task.level === 1).length,
        };
      }

      async function updateApprovedTaskSettings(payload: Record<string, unknown>): Promise<{
        success: boolean;
        assignmentCount?: number;
        message?: string;
      }> {
        await ensureHydrated();
        await ensureActiveSession();
        const state = readCurrentState();
        const taskId = asNonEmptyString(payload["taskId"]);
        if (taskId === null) {
          return {
            success: false,
            message: "An approved task id is required.",
          };
        }
        if (state.responses.some((response) => response.taskId === taskId)) {
          return {
            success: false,
            message: "Approved task settings cannot change after responses have been captured.",
          };
        }
        if (
          state.assignments.some(
            (assignment) => assignment.taskId === taskId && assignment.status !== "queued"
          )
        ) {
          return {
            success: false,
            message: "Approved task settings cannot change after dispatch has started.",
          };
        }
        const updated = updateForgeApprovedTask({
          approvedTasks: state.approvedTasks,
          payload,
        });
        if (updated.validationMessage) {
          return {
            success: false,
            message: updated.validationMessage,
          };
        }
        const assignments = rebuildQueuedAssignments(updated.approvedTasks, {
          contextDigest: state.contextDigest,
          runId: state.runId,
          sessionRevision: state.sessionRevision,
        });
        dispatchApprovedTasks(updated.approvedTasks);
        dispatchAssignments(assignments);
        syncCoordinatorState({
          planStatus: "ready-for-assignment",
          note: "Approved task settings updated.",
        });
        await persistCurrentSession("approved-task-updated", {
          sessionId: state.activeSessionId,
          taskId,
        });
        return {
          success: true,
          assignmentCount: assignments.length,
        };
      }

      async function updateTaskContextCapsule(payload: Record<string, unknown>): Promise<{
        success: boolean;
        message?: string;
      }> {
        await ensureHydrated();
        await ensureActiveSession();
        const state = readCurrentState();
        const taskId = asNonEmptyString(payload["taskId"]);
        if (taskId === null) {
          return {
            success: false,
            message: "An approved task id is required.",
          };
        }
        if (state.responses.some((response) => response.taskId === taskId)) {
          return {
            success: false,
            message: "Context capsule cannot change after responses have been captured.",
          };
        }
        if (
          state.assignments.some(
            (assignment) => assignment.taskId === taskId && assignment.status !== "queued"
          )
        ) {
          return {
            success: false,
            message: "Context capsule cannot change after dispatch has started.",
          };
        }
        const updated = updateForgeTaskContextCapsule({
          approvedTasks: state.approvedTasks,
          payload,
        });
        if (updated.validationMessage) {
          return {
            success: false,
            message: updated.validationMessage,
          };
        }
        dispatchApprovedTasks(updated.approvedTasks);
        const updatedTask = updated.approvedTasks.find((task) => task.id === taskId) ?? null;
        mutateActiveRunArtifacts((entry) =>
          withForgeRunSelectedContextCapsule(entry, taskId, updatedTask?.contextCapsule ?? null)
        );
        await persistCurrentSession("approved-task-context-updated", {
          sessionId: state.activeSessionId,
          taskId,
        });
        return {
          success: true,
        };
      }

      async function updateOperatorProfileCommand(payload: Record<string, unknown>): Promise<{
        success: boolean;
        message?: string;
      }> {
        await ensureHydrated();
        if (runtime.paths === null) {
          throw new Error("Forge Room paths are unavailable.");
        }
        const saved = await profileStorage.saveProfile(runtime.paths, payload);
        const currentState = readCurrentState();
        const reconciledSelection = reconcileSelectionForProfile(
          saved,
          currentState.sessionContextSelection
        );
        const selectionChanged =
          JSON.stringify(reconciledSelection) !==
          JSON.stringify(currentState.sessionContextSelection);
        dispatchOperatorProfile(saved);
        if (selectionChanged) {
          dispatchSessionContext(reconciledSelection);
        }
        const goal = readCurrentState().currentGoal;
        if (goal !== null) {
          const runRevision = syncRunRevision(goal, {
            operatorProfile: saved,
            resetMutableStateOnChange: true,
            sessionContextSelection: reconciledSelection,
          });
          if (runRevision.changed) {
            invalidatePreflight("Forge run context changed after the operator profile update.");
          } else {
            const reason = selectionChanged
              ? "Session context changed after the operator profile was reconciled."
              : refreshPreflightValidity(goal);
            if (reason !== null) {
              syncCoordinatorState({
                note: readPreflightStageMessage(reason),
              });
            }
          }
        }
        if (readCurrentState().activeSessionId !== null) {
          await persistCurrentSession("operator-profile-updated", {
            sessionId: readCurrentState().activeSessionId,
          });
        }
        return {
          success: true,
        };
      }

      async function updateSessionContextCommand(payload: Record<string, unknown>): Promise<{
        success: boolean;
        message?: string;
      }> {
        await ensureHydrated();
        const state = readCurrentState();
        if (state.activeSessionId === null) {
          return {
            success: false,
            message: "Create or open a session before selecting run context.",
          };
        }
        const nextSessionContextSelection = reconcileSelectionForProfile(
          state.operatorProfile,
          normalizeSessionContextSelectionPayload(payload, state.sessionContextSelection)
        );
        const changed =
          JSON.stringify(nextSessionContextSelection) !==
          JSON.stringify(state.sessionContextSelection);
        if (!changed) {
          return {
            success: true,
          };
        }
        dispatchSessionContext(nextSessionContextSelection);
        if (state.currentGoal !== null) {
          syncRunRevision(state.currentGoal, {
            resetMutableStateOnChange: true,
            sessionContextSelection: nextSessionContextSelection,
          });
        }
        await persistCurrentSession("session-context-updated", {
          sessionId: state.activeSessionId,
        });
        return {
          success: true,
        };
      }

      async function updateRunOverrideCommand(payload: Record<string, unknown>): Promise<{
        success: boolean;
        message?: string;
      }> {
        await ensureHydrated();
        const state = readCurrentState();
        if (state.activeSessionId === null) {
          return {
            success: false,
            message: "Create or open a session before editing run settings.",
          };
        }
        const nextRunOverride = normalizeRunOverridePayload(payload, state.runOverride);
        syncRunRevision(state.currentGoal, {
          resetMutableStateOnChange: true,
          runOverride: nextRunOverride,
        });
        if (state.currentGoal !== null) {
          invalidatePreflight("Run override changed after the last preflight run.");
        }
        await persistCurrentSession("run-override-updated", {
          sessionId: state.activeSessionId,
        });
        return {
          success: true,
        };
      }

      async function runPreflightCommand(): Promise<{
        success: boolean;
        message?: string;
      }> {
        await ensureHydrated();
        const state = readCurrentState();
        if (state.activeSessionId === null) {
          return {
            success: false,
            message: "Create or open a session before running preflight.",
          };
        }
        if (state.currentGoal === null) {
          return {
            success: false,
            message: "Save a goal before running preflight.",
          };
        }
        await ensureFreshPreflight(state.currentGoal, {
          force: true,
        });
        refreshPreflightValidity(state.currentGoal);
        await persistCurrentSession("preflight-ran", {
          sessionId: state.activeSessionId,
          status: readCurrentState().preflight.status,
        });
        syncCoordinatorState({
          note:
            readCurrentState().preflight.status === "warning"
              ? "Preflight ran with warnings; Forge kept a minimal safe context."
              : "Preflight refreshed successfully.",
        });
        return {
          success: true,
        };
      }

      async function clearPreflightCommand(): Promise<{
        success: boolean;
        message?: string;
      }> {
        await ensureHydrated();
        const state = readCurrentState();
        if (state.activeSessionId === null) {
          return {
            success: false,
            message: "Create or open a session before clearing preflight.",
          };
        }
        dispatchPreflight({
          ...createEmptyForgePreflightState(),
          contextDigest: state.contextDigest,
          expectedContextDigest: state.contextDigest,
          runId: state.runId,
          sessionRevision: state.sessionRevision,
        });
        syncCoordinatorState({
          note: "Preflight cleared. Run it again before the next AI stage.",
        });
        await persistCurrentSession("preflight-cleared", {
          sessionId: state.activeSessionId,
        });
        return {
          success: true,
        };
      }

      async function resolveConflictDecision(payload: Record<string, unknown>): Promise<{
        success: boolean;
        conflictId?: string;
        message?: string;
      }> {
        await ensureHydrated();
        await ensureActiveSession();
        const state = readCurrentState();
        const conflictId = asNonEmptyString(payload["conflictId"]);
        if (conflictId === null) {
          return {
            success: false,
            message: "A conflict id is required.",
          };
        }
        const currentConflict = state.conflicts.find((entry) => entry.id === conflictId) ?? null;
        if (currentConflict === null) {
          return {
            success: false,
            message: "The requested conflict does not exist.",
          };
        }

        const requestedStatus = payload["status"] === "resolved" ? "resolved" : "open";
        const preferredResponseId = asNonEmptyString(payload["preferredResponseId"]);
        const resolutionNote = asNonEmptyString(payload["resolutionNote"]);
        const nextPreferredResponseId = preferredResponseId ?? currentConflict.preferredResponseId;
        if (
          nextPreferredResponseId !== null &&
          currentConflict.responseIds.includes(nextPreferredResponseId) !== true
        ) {
          return {
            success: false,
            message: "The preferred response does not belong to this conflict.",
          };
        }
        if (requestedStatus === "resolved" && nextPreferredResponseId === null) {
          return {
            success: false,
            message: "Select a preferred response before resolving the conflict.",
          };
        }

        const nextConflicts: ForgeConflict[] = state.conflicts.map((conflict): ForgeConflict =>
          conflict.id === conflictId
            ? {
                ...conflict,
                status: requestedStatus,
                preferredResponseId: nextPreferredResponseId,
                resolutionNote:
                  resolutionNote ?? (requestedStatus === "open" ? null : conflict.resolutionNote),
              }
            : conflict
        );
        const nextResponses: ForgeAgentResponse[] = state.responses.map(
          (response): ForgeAgentResponse => {
            if (currentConflict.responseIds.includes(response.id) !== true) {
              return response;
            }
            if (requestedStatus === "resolved") {
              return {
                ...response,
                status: response.id === nextPreferredResponseId ? "selected" : "rejected",
              };
            }
            return {
              ...response,
              status: "captured",
            };
          }
        );
        const openConflictCount = nextConflicts.filter(
          (conflict) => conflict.status === "open"
        ).length;
        dispatchResponses(nextResponses);
        dispatchConflicts(nextConflicts);
        dispatchSyntheses([], null);
        dispatchDecisionTrace([]);
        mutateActiveRunArtifacts((entry) =>
          withForgeRunReviewArtifacts(entry, {
            conflictIds: nextConflicts.map((conflict) => conflict.id),
            responseIds: nextResponses.map((response) => response.id),
          })
        );
        dispatchGoal(
          setGoalStatus(
            state.currentGoal,
            openConflictCount === 0 && state.responses.length > 0
              ? "synthesis-ready"
              : "in-progress"
          )
        );
        syncCoordinatorState({
          planStatus: openConflictCount === 0 ? "synthesis-ready" : "reviewing-conflicts",
          synthesisStatus: openConflictCount === 0 ? "ready" : "blocked",
          note:
            requestedStatus === "resolved"
              ? openConflictCount === 0
                ? "Conflict resolved. Generate synthesis when ready."
                : "Conflict resolved. Resolve the remaining open conflicts before synthesis."
              : "Conflict left open. Synthesis remains blocked until a preferred response is chosen.",
        });
        await persistCurrentSession("conflict-updated", {
          sessionId: state.activeSessionId,
          conflictId,
          preferredResponseId: nextPreferredResponseId,
          status: requestedStatus,
        });
        return {
          success: true,
          conflictId,
        };
      }

      async function dispatchAssignmentsForSession(): Promise<{
        success: boolean;
        completedAssignments?: number;
        failedAssignments?: number;
        message?: string;
      }> {
        await ensureHydrated();
        await ensureActiveSession();
        const dispatchBridge = await requireDispatchBridge();
        const state = readCurrentState();
        const queuedAssignments = state.assignments.filter(
          (assignment) =>
            assignment.status === "queued" &&
            assignment.runId === state.runId &&
            assignment.contextDigest === state.contextDigest
        );
        const goal = state.currentGoal;
        if (goal === null) {
          return {
            success: false,
            message: "A goal is required before dispatch can start.",
          };
        }
        if (queuedAssignments.length === 0) {
          return {
            success: false,
            message: "There are no queued assignments to dispatch.",
          };
        }
        const preflightResult = await ensureFreshPreflight(goal);
        assertFreshPreflightOrLog("assignment-dispatch", {
          contextDigest: state.contextDigest ?? "",
          preflight: preflightResult.preflight,
          runId: state.runId ?? "",
        });

        syncCoordinatorState({
          planStatus: "dispatching",
          note: "Dispatching queued assignments against the active preflight revision.",
        });

        const assignments = [...state.assignments];
        let responses = [...state.responses];
        let approvedTasks = [...state.approvedTasks];
        let completedAssignments = 0;
        let failedAssignments = 0;

        if (
          state.syntheses.length > 0 ||
          state.selectedSynthesisId !== null ||
          state.exports.length > 0
        ) {
          dispatchSyntheses([], null);
          dispatchExports([]);
          dispatchDecisionTrace([]);
        }

        for (const queuedAssignment of queuedAssignments) {
          const assignmentIndex = assignments.findIndex(
            (entry) => entry.id === queuedAssignment.id
          );
          const task = approvedTasks.find((entry) => entry.id === queuedAssignment.taskId) ?? null;
          if (assignmentIndex === -1 || task === null) {
            continue;
          }
          const currentAssignment = assignments[assignmentIndex];
          if (!currentAssignment) {
            continue;
          }

          assignments[assignmentIndex] = {
            ...currentAssignment,
            status: "dispatched",
            startedAt: nowIso(),
            errorMessage: null,
          };
          const dispatchedAssignment = assignments[assignmentIndex];
          dispatchAssignments(assignments);
          syncCoordinatorState({
            planStatus: "dispatching",
            note: `Waiting for ${queuedAssignment.seatId} to answer "${task.title}".`,
          });

          let response: ForgeAgentResponse | null = null;
          let archiveRef = createForgeArchiveRef({});
          let taskFailureMessages = ["Task response did not start."];
          let lastTaskReplyText: string | null = null;

          for (let attempt = 0; attempt < 2; attempt += 1) {
            const extraFeedback =
              attempt === 0 ? null : buildTaskRetryFeedback(taskFailureMessages, lastTaskReplyText);
            const bridgePayload = {
              action: "message.sendWait",
              timeoutMs: 240000,
              toSlot: queuedAssignment.seatId,
              payload: {
                page: `forge-room:task:${task.id}`,
                text: [
                  buildForgeTaskPrompt({
                    approvedTasks,
                    assignment: dispatchedAssignment,
                    goal,
                    locale: readActiveLocale(),
                    promptContext: buildPromptContext(task.contextCapsule ?? null),
                    task,
                  }),
                  extraFeedback,
                ]
                  .filter(
                    (entry): entry is string => typeof entry === "string" && entry.trim() !== ""
                  )
                  .join("\n\n"),
                protocol: {
                  room: FORGE_ROOM_ID,
                  scenario: FORGE_PROTOCOL_SCENARIOS.taskResponse,
                  protocolKey: FORGE_PROTOCOL_KEYS.taskResponse,
                },
              },
            };
            // eslint-disable-next-line no-await-in-loop -- NOTE: task retries must stay ordered so validator feedback applies to the latest reply.
            const bridgeResult = readBridgeResult(await dispatchBridge(bridgePayload));
            const replyText = readBridgeReplyText(bridgeResult);
            const bridgeMessage =
              asNonEmptyString(bridgeResult.message) ??
              (replyText === null
                ? "Assignment dispatch did not return readable text."
                : "Assignment dispatch failed.");

            if (replyText === null) {
              taskFailureMessages = [bridgeMessage];
              lastTaskReplyText = null;
              continue;
            }

            lastTaskReplyText = replyText;
            const parsedTaskResponse = parseForgeTaskResponsePayload(replyText);
            taskFailureMessages = [
              ...(bridgeResult.success !== true ? [bridgeMessage] : []),
              ...parsedTaskResponse.validationMessages,
            ];

            if (
              bridgeResult.success === true &&
              parsedTaskResponse.payload !== null &&
              parsedTaskResponse.validationMessages.length === 0
            ) {
              const bridgeReply = readBridgeReply(bridgeResult.reply);
              const bridgeSession = readBridgeSession(bridgeResult.session);
              archiveRef = createForgeArchiveRef({
                conversationId: bridgeSession["conversationId"] ?? bridgeReply["conversationId"],
                localSessionId: bridgeSession["id"],
                messageId: bridgeReply["messageId"],
                provider: bridgeReply["provider"] ?? bridgeReply["slot"],
              });
              const completedAssignment = assignments[assignmentIndex];
              response = createForgeTaskResponse({
                archiveRef,
                assignment: completedAssignment,
                payload: parsedTaskResponse.payload,
                rawText: replyText,
                task,
              });
              break;
            }
          }

          if (response === null) {
            failedAssignments += 1;
            const failedAssignment = assignments[assignmentIndex];
            assignments[assignmentIndex] = {
              ...failedAssignment,
              status: "failed",
              errorMessage: taskFailureMessages.join(" "),
              completedAt: nowIso(),
            };
            dispatchAssignments(assignments);
            continue;
          }

          responses = [...responses, response];
          completedAssignments += 1;
          assignments[assignmentIndex] = {
            ...dispatchedAssignment,
            status: "completed",
            responseId: response.id,
            archiveRef,
            completedAt: nowIso(),
          };
          approvedTasks = syncApprovedTaskStatuses({
            assignments,
            responses,
            tasks: approvedTasks,
          });
          dispatchAssignments(assignments);
          dispatchResponses(responses);
          dispatchApprovedTasks(approvedTasks);
        }

        const conflicts = groupForgeConflicts({
          assignments,
          responses,
          tasks: approvedTasks,
        });
        dispatchConflicts(conflicts);
        mutateActiveRunArtifacts((entry) =>
          withForgeRunReviewArtifacts(entry, {
            conflictIds: conflicts.map((conflict) => conflict.id),
            responseIds: responses.map((response) => response.id),
          })
        );
        dispatchGoal(setGoalStatus(goal, responses.length > 0 ? "synthesis-ready" : "in-progress"));

        syncCoordinatorState({
          planStatus:
            responses.length > 0
              ? conflicts.length > 0
                ? "reviewing-conflicts"
                : "synthesis-ready"
              : "ready-for-assignment",
          synthesisStatus: responses.length > 0 ? "blocked" : "idle",
          note:
            failedAssignments > 0
              ? `${String(completedAssignments)} assignment(s) completed, ${String(failedAssignments)} failed.`
              : `${String(completedAssignments)} assignment(s) completed and responses were captured.`,
        });
        await persistCurrentSession("assignments-dispatched", {
          sessionId: readCurrentState().activeSessionId,
          completedAssignments,
          failedAssignments,
        });
        return {
          success: completedAssignments > 0,
          completedAssignments,
          failedAssignments,
          ...(completedAssignments === 0
            ? {
                message:
                  failedAssignments > 0
                    ? "All queued assignments failed."
                    : "No assignments were processed.",
              }
            : {}),
        };
      }

      async function generateSynthesis(): Promise<{
        success: boolean;
        synthesisId?: string;
        message?: string;
      }> {
        await ensureHydrated();
        await ensureActiveSession();
        const state = readCurrentState();
        if (state.currentGoal === null || state.responses.length === 0) {
          return {
            success: false,
            message:
              "At least one captured response is required before synthesis can be generated.",
          };
        }
        if (state.conflicts.some((conflict) => conflict.status === "open")) {
          syncCoordinatorState({
            planStatus: "reviewing-conflicts",
            synthesisStatus: "blocked",
            note: "Resolve open conflicts before synthesis can be generated.",
          });
          return {
            success: false,
            message: "Resolve open conflicts before synthesis can be generated.",
          };
        }
        const currentGoal = state.currentGoal;
        const preflightResult = await ensureFreshPreflight(currentGoal);
        assertFreshPreflightOrLog("synthesis-generation", {
          contextDigest: state.contextDigest ?? "",
          preflight: preflightResult.preflight,
          runId: state.runId ?? "",
        });
        const dispatchBridge = await requireDispatchBridge();
        const generationState = readCurrentState();
        syncCoordinatorState({
          planStatus: "synthesis-ready",
          synthesisStatus: "ready",
          note: "Generating a synthesis candidate through the active preflight revision.",
        });
        const promoteFallbackSynthesis = async (
          reason: string
        ): Promise<{ success: boolean; synthesisId?: string; message?: string }> => {
          const fallbackBase = createForgeSynthesisCandidate({
            conflicts: generationState.conflicts,
            contextDigest: generationState.contextDigest,
            goal: currentGoal,
            preflightId: generationState.preflight.preflightId,
            responses: generationState.responses,
            runId: generationState.runId,
            sessionRevision: generationState.sessionRevision,
            tasks: generationState.approvedTasks,
          });
          if (fallbackBase === null) {
            syncCoordinatorState({
              note: reason,
            });
            return {
              success: false,
              message: reason,
            };
          }
          const fallback = {
            ...fallbackBase,
            provenance: buildCurrentSynthesisProvenance(readCurrentState()),
          };
          const fallbackSnapshot = createSynthesisSnapshot({
            approvedTasks: generationState.approvedTasks,
            assignments: generationState.assignments,
            conflicts: generationState.conflicts,
            contextDigest: generationState.contextDigest ?? "",
            decisionTrace: fallback.decisionTrace,
            goal: currentGoal,
            ownerScopeId: generationState.ownerScopeId,
            preflightId: generationState.preflight.preflightId,
            runId: generationState.runId ?? createForgeId("forge-run"),
            sessionRevision: generationState.sessionRevision,
            synthesis: {
              ...fallback,
              snapshotHash: null,
            },
          });
          logSynthesisSnapshotFrozen(fallbackSnapshot, "fallback");
          fallback.snapshotHash = fallbackSnapshot.snapshotHash;
          const selected = selectForgeSynthesis([...state.syntheses, fallback], fallback.id);
          dispatchSyntheses(selected.syntheses, selected.selectedSynthesisId);
          dispatchDecisionTrace(fallback.decisionTrace);
          mutateActiveRunArtifacts((entry) =>
            withForgeSynthesisSnapshot(
              withForgeRunDecisionTrace(entry, fallback.decisionTrace),
              fallbackSnapshot
            )
          );
          dispatchGoal(setGoalStatus(currentGoal, "synthesis-ready"));
          syncCoordinatorState({
            planStatus: "synthesis-ready",
            synthesisStatus: "selected",
            note: `${reason} Deterministic fallback synthesis was selected for export review.`,
          });
          await persistCurrentSession("synthesis-generated", {
            sessionId: state.activeSessionId,
            synthesisId: fallback.id,
            fallback: true,
            fallbackReason: reason,
          });
          return {
            success: true,
            synthesisId: fallback.id,
            message: reason,
          };
        };
        const bridgeResult = readBridgeResult(
          await dispatchBridge({
            action: "message.sendWait",
            timeoutMs: 180000,
            toSlot: "ai1",
            payload: {
              page: "forge-room:synthesis",
              text: buildForgeSynthesisPrompt({
                conflicts: generationState.conflicts,
                goal: currentGoal,
                locale: readActiveLocale(),
                promptContext: buildPromptContext(),
                responses: generationState.responses,
                tasks: generationState.approvedTasks,
              }),
              protocol: {
                room: FORGE_ROOM_ID,
                scenario: FORGE_PROTOCOL_SCENARIOS.synthesis,
                protocolKey: FORGE_PROTOCOL_KEYS.synthesis,
              },
            },
          })
        );
        if (bridgeResult.success !== true) {
          syncCoordinatorState({
            note: asNonEmptyString(bridgeResult.message) ?? "Synthesis generation failed.",
          });
          return {
            success: false,
            message: asNonEmptyString(bridgeResult.message) ?? "Synthesis generation failed.",
          };
        }
        const replyText = readBridgeReplyText(bridgeResult);
        if (replyText === null) {
          return await promoteFallbackSynthesis(
            "Synthesis generation did not return readable text."
          );
        }
        const parsed = parseForgeSynthesisResponse({
          conflicts: generationState.conflicts,
          goal: currentGoal,
          responses: generationState.responses,
          tasks: generationState.approvedTasks,
          rawText: replyText,
        });
        if (parsed.synthesis === null) {
          return await promoteFallbackSynthesis(parsed.validationMessages.join(" "));
        }
        const nextSynthesis = {
          ...parsed.synthesis,
          contextDigest: generationState.contextDigest,
          preflightId: generationState.preflight.preflightId,
          provenance: buildCurrentSynthesisProvenance(readCurrentState()),
          runId: generationState.runId,
          sessionRevision: generationState.sessionRevision,
        };
        const synthesisSnapshot = createSynthesisSnapshot({
          approvedTasks: generationState.approvedTasks,
          assignments: generationState.assignments,
          conflicts: generationState.conflicts,
          contextDigest: generationState.contextDigest ?? "",
          decisionTrace: nextSynthesis.decisionTrace,
          goal: currentGoal,
          ownerScopeId: generationState.ownerScopeId,
          preflightId: generationState.preflight.preflightId,
          runId: generationState.runId ?? createForgeId("forge-run"),
          sessionRevision: generationState.sessionRevision,
          synthesis: {
            ...nextSynthesis,
            snapshotHash: null,
          },
        });
        logSynthesisSnapshotFrozen(synthesisSnapshot, "generated");
        nextSynthesis.snapshotHash = synthesisSnapshot.snapshotHash;
        const selected = selectForgeSynthesis(
          [...state.syntheses, nextSynthesis],
          nextSynthesis.id
        );
        dispatchSyntheses(selected.syntheses, selected.selectedSynthesisId);
        dispatchDecisionTrace(nextSynthesis.decisionTrace);
        mutateActiveRunArtifacts((entry) =>
          withForgeSynthesisSnapshot(
            withForgeRunDecisionTrace(entry, nextSynthesis.decisionTrace),
            synthesisSnapshot
          )
        );
        dispatchGoal(setGoalStatus(currentGoal, "synthesis-ready"));
        syncCoordinatorState({
          planStatus: "synthesis-ready",
          synthesisStatus: "selected",
          note: "A synthesis candidate was generated and selected for export review.",
        });
        await persistCurrentSession("synthesis-generated", {
          sessionId: state.activeSessionId,
          synthesisId: nextSynthesis.id,
        });
        return {
          success: true,
          synthesisId: nextSynthesis.id,
        };
      }

      async function selectSynthesis(
        payload: Record<string, unknown>
      ): Promise<{ success: boolean; synthesisId?: string; message?: string }> {
        await ensureHydrated();
        await ensureActiveSession();
        const synthesisId = asNonEmptyString(payload["synthesisId"]);
        if (synthesisId === null) {
          return {
            success: false,
            message: "A synthesis id is required.",
          };
        }
        const state = readCurrentState();
        if (state.syntheses.some((entry) => entry.id === synthesisId) !== true) {
          return {
            success: false,
            message: "The requested synthesis does not exist.",
          };
        }
        const selected = selectForgeSynthesis(state.syntheses, synthesisId);
        dispatchSyntheses(selected.syntheses, selected.selectedSynthesisId);
        dispatchDecisionTrace(
          selected.syntheses.find((entry) => entry.id === selected.selectedSynthesisId)
            ?.decisionTrace ?? []
        );
        syncCoordinatorState({
          planStatus: "synthesis-ready",
          synthesisStatus: "selected",
          note: "Selected synthesis updated.",
        });
        await persistCurrentSession("synthesis-selected", {
          sessionId: state.activeSessionId,
          synthesisId,
        });
        return {
          success: true,
          synthesisId,
        };
      }

      async function saveSession(): Promise<{ success: boolean; sessionId: string | null }> {
        await ensureHydrated();
        await ensureActiveSession();
        await persistCurrentSession("session-saved", {
          sessionId: readCurrentState().activeSessionId,
        });
        return {
          success: true,
          sessionId: readCurrentState().activeSessionId,
        };
      }

      async function loadLatestSession(): Promise<{
        success: boolean;
        message?: string;
        sessionId?: string;
      }> {
        await ensureHydrated();
        if (runtime.paths === null) {
          throw new Error("Forge Room paths are unavailable.");
        }
        const latest = await storage.loadLatestSession(runtime.paths);
        if (latest === null) {
          return {
            success: false,
            message: "No saved Forge session is available yet.",
          };
        }

        runtime.activeSession = latest;
        runtime.sessionList = await storage.listSessions(runtime.paths);
        runtime.store.dispatch({
          type: "runtime/hydrate",
          state: createForgeRuntimeStateFromSession(latest, {
            operatorProfile: readCurrentState().operatorProfile,
          }),
        });
        if (latest.goal !== null && readCurrentState().runSignature === null) {
          syncRunRevision(latest.goal);
        }
        refreshPreflightValidity(latest.goal);
        syncCoordinatorState({
          note: latest.coordinatorState.note || "Loaded the latest saved Forge session.",
        });
        return {
          success: true,
          sessionId: latest.id,
        };
      }

      async function loadSessionById(payload: Record<string, unknown>): Promise<{
        success: boolean;
        message?: string;
        sessionId?: string;
      }> {
        await ensureHydrated();
        if (runtime.paths === null) {
          throw new Error("Forge Room paths are unavailable.");
        }
        const sessionId = asNonEmptyString(payload["sessionId"]);
        if (sessionId === null) {
          return {
            success: false,
            message: "A session id is required.",
          };
        }
        const loaded = await storage.loadSession(runtime.paths, sessionId);
        if (loaded === null) {
          return {
            success: false,
            message: "The requested Forge session could not be found.",
          };
        }
        runtime.activeSession = loaded;
        runtime.sessionList = await storage.listSessions(runtime.paths);
        runtime.store.dispatch({
          type: "runtime/hydrate",
          state: createForgeRuntimeStateFromSession(loaded, {
            operatorProfile: readCurrentState().operatorProfile,
          }),
        });
        if (loaded.goal !== null && readCurrentState().runSignature === null) {
          syncRunRevision(loaded.goal);
        }
        refreshPreflightValidity(loaded.goal);
        syncCoordinatorState({
          note: loaded.coordinatorState.note || "Loaded a saved Forge session.",
        });
        return {
          success: true,
          sessionId: loaded.id,
        };
      }

      async function deleteSessionById(payload: Record<string, unknown>): Promise<{
        success: boolean;
        message?: string;
        sessionId?: string;
      }> {
        await ensureHydrated();
        if (runtime.paths === null) {
          throw new Error("Forge Room paths are unavailable.");
        }
        const sessionId =
          asNonEmptyString(payload["sessionId"]) ?? readCurrentState().activeSessionId;
        if (sessionId === null) {
          return {
            success: false,
            message: "A session must be selected before it can be deleted.",
          };
        }
        const storagePaths = createForgeStoragePaths(runtime.paths, sessionId);
        await io.callRoomTools({
          operation: "delete-path",
          roomId: FORGE_ROOM_ID,
          targetPath: storagePaths.sessionDir,
          recursive: true,
        });
        if (readCurrentState().activeSessionId === sessionId) {
          const operatorProfile = readCurrentState().operatorProfile;
          runtime.activeSession = null;
          runtime.store.dispatch({
            type: "runtime/hydrate",
            state: {
              ...createEmptyForgeRuntimeState(),
              operatorProfile,
            },
          });
        }
        runtime.sessionList = await storage.listSessions(runtime.paths);
        pushState();
        return {
          success: true,
          sessionId,
        };
      }

      async function exportHandoffCheck(): Promise<Record<string, unknown>> {
        await ensureHydrated();
        await ensureActiveSession();
        const session = createForgeSessionFromRuntimeState(
          readCurrentState(),
          runtime.activeSession
        );
        runtime.activeSession = session;
        try {
          const summary = handoffExport.buildExportReadySummary(session);
          const synthesisSnapshot = readSynthesisSnapshotById(session.selectedSynthesisId);
          const handoffPackage = summary.exportReady
            ? synthesisSnapshot
              ? exportFromSynthesisSnapshot({
                  buildPackage: (snapshot) =>
                    handoffExport.buildHandoffPackageFromSnapshot(snapshot),
                  snapshot: synthesisSnapshot,
                })
              : null
            : null;
          return {
            success: summary.exportReady && handoffPackage !== null,
            ...summary,
            ...(handoffPackage
              ? {
                  goalId: handoffPackage.goalId,
                }
              : {
                  message: summary.reason,
                }),
          };
        } catch (error) {
          return {
            success: false,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }

      async function exportHandoff(): Promise<{
        success: boolean;
        filePath?: string;
        message?: string;
      }> {
        await ensureHydrated();
        await ensureActiveSession();
        if (runtime.paths === null) {
          throw new Error("Forge Room paths are unavailable.");
        }
        const state = readCurrentState();
        const session = createForgeSessionFromRuntimeState(state, runtime.activeSession);
        runtime.activeSession = session;
        try {
          const selectedSynthesisId = session.selectedSynthesisId;
          if (selectedSynthesisId === null) {
            throw new Error("A selected synthesis is required before export.");
          }
          const synthesisSnapshot = readSynthesisSnapshotById(selectedSynthesisId, state);
          if (synthesisSnapshot === null) {
            throw new Error("Selected synthesis snapshot is unavailable for export.");
          }
          const handoffPackage = exportFromSynthesisSnapshot({
            buildPackage: (snapshot) => handoffExport.buildHandoffPackageFromSnapshot(snapshot),
            snapshot: synthesisSnapshot,
          });
          const storagePaths = createForgeStoragePaths(runtime.paths, session.id);
          await io.ensureRuntimeDirectory(storagePaths.exportsDir);
          const filePath = `${storagePaths.exportsDir}/${handoffExport.buildExportFileName(session)}`;
          await io.writeJsonFile(filePath, handoffPackage);
          const exportRecord = createForgeExportRecord({
            contextDigest: synthesisSnapshot.contextDigest,
            createdBy: "coordinator",
            filePath,
            ownerScopeId: state.ownerScopeId,
            runId: synthesisSnapshot.runId,
            sessionRevision: synthesisSnapshot.sessionRevision,
            snapshotHash: synthesisSnapshot.snapshotHash,
            synthesisId: selectedSynthesisId,
            targetRoomId: session.goal?.targetRoomId ?? "",
          });
          const nextExports = [exportRecord, ...state.exports];
          dispatchExports(nextExports);
          mutateActiveRunArtifacts((entry) =>
            withForgeExportSnapshot(entry, {
              createdAt: exportRecord.createdAt,
              exportId: exportRecord.id,
              handoffPackage,
              ownerScopeId: state.ownerScopeId,
              runId: synthesisSnapshot.runId,
              sessionRevision: synthesisSnapshot.sessionRevision,
              snapshotHash: synthesisSnapshot.snapshotHash,
              synthesisId: selectedSynthesisId,
            })
          );
          logForgeRuntimeEvent("info", "Forge Room export snapshot emitted.", {
            eventCode: "forge.export.snapshot_emitted",
            runId: synthesisSnapshot.runId,
            contextDigest: synthesisSnapshot.contextDigest,
            preflightId: synthesisSnapshot.preflightId,
            synthesisId: selectedSynthesisId,
            exportId: exportRecord.id,
            sessionRevision: synthesisSnapshot.sessionRevision,
            snapshotHash: synthesisSnapshot.snapshotHash,
          });
          dispatchSyntheses(
            markForgeSynthesisExported(state.syntheses, selectedSynthesisId),
            selectedSynthesisId
          );
          dispatchGoal(setGoalStatus(state.currentGoal, "handoff-ready"));
          syncCoordinatorState({
            planStatus: "exported",
            synthesisStatus: "selected",
            exportReady: true,
            lastExportPath: filePath,
            note: "Handoff package exported successfully.",
          });
          await persistCurrentSession("handoff-exported", {
            sessionId: session.id,
            filePath,
            synthesisId: selectedSynthesisId,
          });
          return {
            success: true,
            filePath,
          };
        } catch (error) {
          syncCoordinatorState({
            note: error instanceof Error ? error.message : String(error),
          });
          return {
            success: false,
            message: error instanceof Error ? error.message : String(error),
          };
        }
      }

      async function handleCommand(
        command: string,
        payload: Record<string, unknown>
      ): Promise<Record<string, unknown>> {
        const commandPayload = readCommandPayload(payload);
        switch (command) {
          case FORGE_UI_COMMANDS.uiReady:
            await ensureHydrated();
            pushState();
            return { success: true };
          case FORGE_UI_COMMANDS.createSession:
            return await createSession(commandPayload);
          case FORGE_UI_COMMANDS.updateGoal:
            return await updateGoal(commandPayload);
          case FORGE_UI_COMMANDS.generateDraft:
            return await generateDraft(commandPayload);
          case FORGE_UI_COMMANDS.runPreflight:
            return await runPreflightCommand();
          case FORGE_UI_COMMANDS.clearPreflight:
            return await clearPreflightCommand();
          case FORGE_UI_COMMANDS.applyDraftText:
            return await applyDraftText(commandPayload);
          case FORGE_UI_COMMANDS.upsertDraftTask:
            return await upsertDraftTask(commandPayload);
          case FORGE_UI_COMMANDS.removeDraftTask:
            return await removeDraftTaskFromSession(commandPayload);
          case FORGE_UI_COMMANDS.approveDraft:
            return await approveDraft();
          case FORGE_UI_COMMANDS.updateApprovedTask:
            return await updateApprovedTaskSettings(commandPayload);
          case FORGE_UI_COMMANDS.updateContextCapsule:
            return await updateTaskContextCapsule(commandPayload);
          case FORGE_UI_COMMANDS.updateOperatorProfile:
            return await updateOperatorProfileCommand(commandPayload);
          case FORGE_UI_COMMANDS.updateSessionContext:
            return await updateSessionContextCommand(commandPayload);
          case FORGE_UI_COMMANDS.updateRunOverride:
            return await updateRunOverrideCommand(commandPayload);
          case FORGE_UI_COMMANDS.dispatchAssignments:
            return await dispatchAssignmentsForSession();
          case FORGE_UI_COMMANDS.resolveConflict:
            return await resolveConflictDecision(commandPayload);
          case FORGE_UI_COMMANDS.generateSynthesis:
            return await generateSynthesis();
          case FORGE_UI_COMMANDS.selectSynthesis:
            return await selectSynthesis(commandPayload);
          case FORGE_UI_COMMANDS.saveSession:
            return await saveSession();
          case FORGE_UI_COMMANDS.loadSession:
            return await loadSessionById(commandPayload);
          case FORGE_UI_COMMANDS.loadLatestSession:
            return await loadLatestSession();
          case FORGE_UI_COMMANDS.deleteSession:
            return await deleteSessionById(commandPayload);
          case FORGE_UI_COMMANDS.exportHandoffCheck:
            return await exportHandoffCheck();
          case FORGE_UI_COMMANDS.exportHandoff:
            return await exportHandoff();
          default:
            return {
              success: false,
              message: `Unknown Forge Room command: ${command}`,
            };
        }
      }

      const commandEntries = Object.values(FORGE_UI_COMMANDS).map((commandName) => [
        commandName,
        async (commandPayload: Record<string, unknown> = {}) =>
          await handleCommand(commandName, commandPayload),
      ]);

      api.log("info", "Forge Room host activated.");
      const commands = Object.fromEntries(commandEntries) as Record<
        string,
        (commandPayload?: Record<string, unknown>) => Promise<Record<string, unknown>>
      >;

      return {
        async onRoomReady(payload: unknown) {
          void payload;
          await ensureHydrated();
          pushState();
        },
        async onRoomEvent(payload: unknown) {
          if (
            payload !== null &&
            typeof payload === "object" &&
            (payload as { type?: unknown }).type === "host-context"
          ) {
            api.setState("context", payload);
          }
        },
        commands,
        dispose() {
          api.log("info", "Forge Room host disposed.");
        },
      };
    },
  };
}
