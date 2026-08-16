import type {
  ForgeContextCapsule,
  ForgePersonaPresetId,
  ForgeRoleId,
  ForgeSeatId,
  ForgeTask,
  ForgeTaskDispatchMode,
} from "../shared/types/index.js";
import { isForgePersonaPresetId, isForgeRoleId, isForgeSeatId } from "../shared/types/index.js";
import {
  normalizeForgeBreakdownDraft,
  parseForgeBreakdownDraft,
  serializeForgeBreakdownDraft,
  type ForgeBreakdownDraftPayload,
  type ForgeBreakdownTaskSpec,
} from "./forge-breakdown-runtime.js";
import { createAssignmentsForApprovedTasks } from "./forge-task-runtime.js";
import { asNonEmptyString, asStringArray, uniqueStrings } from "./forge-runtime-support.js";

function readDefaultRoleForSeat(seatId: ForgeSeatId): ForgeRoleId {
  if (seatId === "ai2") {
    return "challenger";
  }
  if (seatId === "us1") {
    return "external-perspective";
  }
  return "architect";
}

function normalizeSeatId(value: unknown): ForgeSeatId {
  return isForgeSeatId(value) ? value : "ai1";
}

function normalizeRoleId(value: unknown, seatId: ForgeSeatId): ForgeRoleId {
  return isForgeRoleId(value) ? value : readDefaultRoleForSeat(seatId);
}

function normalizeDispatchMode(value: unknown): ForgeTaskDispatchMode {
  return value === "compare" ? "compare" : "single-owner";
}

function normalizePersonaPresetId(value: unknown): ForgePersonaPresetId | null {
  return isForgePersonaPresetId(value) ? value : null;
}

function normalizeCompareSeatIds(
  primarySeatId: ForgeSeatId,
  mode: ForgeTaskDispatchMode,
  value: unknown
): ForgeSeatId[] {
  if (mode !== "compare") {
    return [];
  }
  const explicit = uniqueStrings(asStringArray(value)).filter((entry): entry is ForgeSeatId =>
    isForgeSeatId(entry)
  );
  const filtered = explicit.filter((entry) => entry !== primarySeatId);
  if (filtered.length > 0) {
    return filtered;
  }
  if (primarySeatId === "ai1") {
    return ["ai2"];
  }
  if (primarySeatId === "ai2") {
    return ["ai1"];
  }
  return ["ai1"];
}

function materializeDraft(payload: ForgeBreakdownDraftPayload): {
  draftSourceText: string;
  draftTasks: ForgeTask[];
  validationMessages: string[];
} {
  const sourceText = JSON.stringify(payload, null, 2);
  const parsed = parseForgeBreakdownDraft(sourceText);
  if (parsed.payload === null) {
    return {
      draftSourceText: sourceText,
      draftTasks: [],
      validationMessages: parsed.validationMessages,
    };
  }
  const normalized = normalizeForgeBreakdownDraft(parsed.payload);
  return {
    draftSourceText: normalized.draftSourceText,
    draftTasks: normalized.draftTasks,
    validationMessages: parsed.validationMessages,
  };
}

function readDraftPayload(
  acceptanceCriteria: string[],
  draftTasks: ForgeTask[]
): ForgeBreakdownDraftPayload {
  return serializeForgeBreakdownDraft({
    acceptanceCriteria,
    tasks: draftTasks,
  });
}

function createTaskSpecFromPayload(payload: Record<string, unknown>): ForgeBreakdownTaskSpec {
  const seatId = normalizeSeatId(payload["seatId"]);
  const dispatchMode = normalizeDispatchMode(payload["dispatchMode"]);
  return {
    title: asNonEmptyString(payload["title"]) ?? "",
    summary: asNonEmptyString(payload["summary"]) ?? "",
    dispatchMode,
    seatId,
    roleId: normalizeRoleId(payload["roleId"], seatId),
    personaPresetId: normalizePersonaPresetId(payload["personaPresetId"]),
    compareSeatIds: normalizeCompareSeatIds(seatId, dispatchMode, payload["compareSeatIds"]),
    dependsOnTaskTitles: [],
    checklist: uniqueStrings(asStringArray(payload["checklist"])),
  };
}

function normalizeContextCapsule(value: Record<string, unknown>): ForgeContextCapsule | null {
  const summary = asNonEmptyString(value["summary"]) ?? "";
  const relevantModules = uniqueStrings(asStringArray(value["relevantModules"]));
  const constraints = uniqueStrings(asStringArray(value["constraints"]));
  if (summary === "" && relevantModules.length === 0 && constraints.length === 0) {
    return null;
  }
  return {
    summary,
    relevantModules,
    constraints,
  };
}

export function upsertForgeDraftTask(params: {
  acceptanceCriteria: string[];
  draftTasks: ForgeTask[];
  payload: Record<string, unknown>;
}): { draftSourceText: string; draftTasks: ForgeTask[]; validationMessages: string[] } {
  const currentPayload = readDraftPayload(params.acceptanceCriteria, params.draftTasks);
  const topLevelTasks = params.draftTasks.filter((task) => task.level === 1);
  const taskId = asNonEmptyString(params.payload["taskId"]);
  const taskIndex = taskId ? topLevelTasks.findIndex((task) => task.id === taskId) : -1;
  const nextTaskSpec = createTaskSpecFromPayload(params.payload);
  const oldTitle = taskIndex >= 0 ? (currentPayload.tasks[taskIndex]?.title ?? null) : null;
  const nextTitle = nextTaskSpec.title.trim();
  const titleByTaskId = new Map(topLevelTasks.map((task) => [task.id, task.title]));

  nextTaskSpec.dependsOnTaskTitles = uniqueStrings(
    asStringArray(params.payload["dependsOnTaskIds"])
      .map((dependencyId) => titleByTaskId.get(dependencyId) ?? null)
      .filter((dependencyTitle): dependencyTitle is string => dependencyTitle !== null)
      .filter((dependencyTitle) => dependencyTitle !== nextTitle)
  );

  const nextPayload: ForgeBreakdownDraftPayload = {
    acceptanceCriteria: [...currentPayload.acceptanceCriteria],
    tasks:
      taskIndex >= 0
        ? currentPayload.tasks.map((task, index) =>
            index === taskIndex ? nextTaskSpec : { ...task }
          )
        : [...currentPayload.tasks, nextTaskSpec],
  };

  if (oldTitle !== null && oldTitle !== nextTitle && nextTitle !== "") {
    nextPayload.tasks = nextPayload.tasks.map((task, index) => {
      if (index === taskIndex) {
        return task;
      }
      return {
        ...task,
        dependsOnTaskTitles: task.dependsOnTaskTitles.map((dependencyTitle) =>
          dependencyTitle === oldTitle ? nextTitle : dependencyTitle
        ),
      };
    });
  }

  return materializeDraft(nextPayload);
}

export function removeForgeDraftTask(params: {
  acceptanceCriteria: string[];
  draftTasks: ForgeTask[];
  taskId: string;
}): { draftSourceText: string; draftTasks: ForgeTask[]; validationMessages: string[] } {
  const currentPayload = readDraftPayload(params.acceptanceCriteria, params.draftTasks);
  const topLevelTasks = params.draftTasks.filter((task) => task.level === 1);
  const taskIndex = topLevelTasks.findIndex((task) => task.id === params.taskId);
  if (taskIndex < 0) {
    return materializeDraft(currentPayload);
  }

  const removedTitle = currentPayload.tasks[taskIndex]?.title ?? null;
  const nextPayload: ForgeBreakdownDraftPayload = {
    acceptanceCriteria: [...currentPayload.acceptanceCriteria],
    tasks: currentPayload.tasks
      .filter((_, index) => index !== taskIndex)
      .map((task) => ({
        ...task,
        dependsOnTaskTitles:
          removedTitle === null
            ? [...task.dependsOnTaskTitles]
            : task.dependsOnTaskTitles.filter(
                (dependencyTitle) => dependencyTitle !== removedTitle
              ),
      })),
  };

  return materializeDraft(nextPayload);
}

export function updateForgeApprovedTask(params: {
  approvedTasks: ForgeTask[];
  payload: Record<string, unknown>;
}): { approvedTasks: ForgeTask[]; validationMessage: string | null } {
  const taskId = asNonEmptyString(params.payload["taskId"]);
  if (taskId === null) {
    return {
      approvedTasks: params.approvedTasks,
      validationMessage: "Approved task id is required.",
    };
  }

  const taskIndex = params.approvedTasks.findIndex(
    (task) => task.id === taskId && task.level === 1
  );
  if (taskIndex < 0) {
    return {
      approvedTasks: params.approvedTasks,
      validationMessage: "Approved task was not found.",
    };
  }

  const currentTask = params.approvedTasks[taskIndex];
  if (!currentTask) {
    return {
      approvedTasks: params.approvedTasks,
      validationMessage: "Approved task was not found.",
    };
  }

  const seatId = normalizeSeatId(params.payload["seatId"] ?? currentTask.seatId);
  const dispatchMode = normalizeDispatchMode(
    params.payload["dispatchMode"] ?? currentTask.dispatchMode
  );
  const roleId = normalizeRoleId(params.payload["roleId"] ?? currentTask.roleId, seatId);
  const compareSeatIds = normalizeCompareSeatIds(
    seatId,
    dispatchMode,
    params.payload["compareSeatIds"] ?? currentTask.compareSeatIds
  );
  const nextTask: ForgeTask = {
    ...currentTask,
    seatId,
    roleId,
    dispatchMode,
    compareSeatIds,
    personaPresetId: normalizePersonaPresetId(
      params.payload["personaPresetId"] ?? currentTask.personaPresetId
    ),
    contextCapsule: currentTask.contextCapsule ?? null,
    status: "approved",
  };

  return {
    approvedTasks: params.approvedTasks.map((task, index) =>
      index === taskIndex ? nextTask : task
    ),
    validationMessage: null,
  };
}

export function rebuildQueuedAssignments(
  approvedTasks: ForgeTask[],
  runContext: {
    contextDigest: string | null;
    runId: string | null;
    sessionRevision: number | null;
  }
) {
  return createAssignmentsForApprovedTasks(approvedTasks, runContext);
}

export function updateForgeTaskContextCapsule(params: {
  approvedTasks: ForgeTask[];
  payload: Record<string, unknown>;
}): { approvedTasks: ForgeTask[]; validationMessage: string | null } {
  const taskId = asNonEmptyString(params.payload["taskId"]);
  if (taskId === null) {
    return {
      approvedTasks: params.approvedTasks,
      validationMessage: "Approved task id is required.",
    };
  }

  const taskIndex = params.approvedTasks.findIndex(
    (task) => task.id === taskId && task.level === 1
  );
  if (taskIndex < 0) {
    return {
      approvedTasks: params.approvedTasks,
      validationMessage: "Approved task was not found.",
    };
  }

  return {
    approvedTasks: params.approvedTasks.map((task, index) =>
      index === taskIndex
        ? {
            ...task,
            contextCapsule: normalizeContextCapsule(params.payload),
          }
        : task
    ),
    validationMessage: null,
  };
}
