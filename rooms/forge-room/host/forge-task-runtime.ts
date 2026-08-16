import { FORGE_ROLE_CATALOG } from "../shared/data/role-catalog.js";
import { FORGE_MAX_DECISION_TRACE_LINES } from "../shared/forge-constants.js";
import type {
  ForgeAgentResponse,
  ForgeArchiveMessageRef,
  ForgeConflict,
  ForgeConflictKind,
  ForgeGoal,
  ForgeHandoffExportRecord,
  ForgePersonaPreset,
  ForgeResponseArtifactRef,
  ForgeRoleId,
  ForgeSeatId,
  ForgeSynthesis,
  ForgeTask,
  ForgeTaskAssignment,
} from "../shared/types/index.js";
import { FORGE_PERSONA_PRESETS } from "../shared/data/persona-presets.js";
import { isForgeSeatId } from "../shared/types/index.js";
import {
  asNonEmptyString,
  buildForgeOutputLanguageRule,
  createForgeId,
  extractJsonValue,
  normalizeTextForComparison,
  nowIso,
  toRecord,
  uniqueStrings,
} from "./forge-runtime-support.js";
import { serializeForAI2 } from "./forge-stage-serializers.js";

function readRoleForSeat(seatId: ForgeSeatId): ForgeRoleId {
  const role = Object.values(FORGE_ROLE_CATALOG).find(
    (entry) => entry.defaultSeatId === seatId && entry.localActor === false
  );
  return (
    role?.id ??
    (seatId === "ai2" ? "challenger" : seatId === "us1" ? "external-perspective" : "architect")
  );
}

export function createAssignmentsForApprovedTasks(
  tasks: ForgeTask[],
  runContext: {
    contextDigest: string | null;
    runId: string | null;
    sessionRevision: number | null;
  }
): ForgeTaskAssignment[] {
  const timestamp = nowIso();
  return tasks
    .filter((task) => task.assignable === true && task.level === 1)
    .flatMap((task) => {
      const primarySeatId = task.seatId ?? "ai1";
      const primaryRoleId = task.roleId ?? readRoleForSeat(primarySeatId);
      const primaryAssignment: ForgeTaskAssignment = {
        contextDigest: runContext.contextDigest,
        id: createForgeId("forge-assignment"),
        taskId: task.id,
        mode: task.dispatchMode,
        seatId: primarySeatId,
        roleId: primaryRoleId,
        personaPresetId: task.personaPresetId,
        requestId: createForgeId("forge-request"),
        runId: runContext.runId,
        sessionRevision: runContext.sessionRevision,
        startedAt: null,
        status: "queued",
        queuedAt: timestamp,
        responseId: null,
        errorMessage: null,
        archiveRef: null,
        completedAt: null,
      };
      const compareAssignments =
        task.dispatchMode === "compare"
          ? task.compareSeatIds
              .filter((seatId) => seatId !== primarySeatId)
              .map((seatId) => ({
                contextDigest: runContext.contextDigest,
                id: createForgeId("forge-assignment"),
                taskId: task.id,
                mode: task.dispatchMode,
                seatId,
                roleId: readRoleForSeat(seatId),
                personaPresetId: task.personaPresetId,
                requestId: createForgeId("forge-request"),
                runId: runContext.runId,
                sessionRevision: runContext.sessionRevision,
                startedAt: null,
                status: "queued" as const,
                queuedAt: timestamp,
                responseId: null,
                errorMessage: null,
                archiveRef: null,
                completedAt: null,
              }))
          : [];
      return [primaryAssignment, ...compareAssignments];
    });
}

export function buildForgeTaskPrompt(params: {
  approvedTasks: ForgeTask[];
  assignment: ForgeTaskAssignment;
  goal: ForgeGoal;
  locale?: string | null;
  promptContext?: string | null;
  task: ForgeTask;
}): string {
  const { approvedTasks, assignment, goal, task } = params;
  const persona =
    assignment.personaPresetId !== null ? FORGE_PERSONA_PRESETS[assignment.personaPresetId] : null;
  const dependencies = approvedTasks
    .filter((candidate) => task.dependsOnTaskIds.includes(candidate.id))
    .map((candidate) => candidate.title);
  const allowedPayload = serializeForAI2({
    bundle: null,
    decisionTrace: [],
    goal,
    task,
    taskContextCapsule: task.contextCapsule ?? null,
  });

  return [
    "Return JSON only using this exact schema:",
    JSON.stringify(
      {
        summary: "One short sentence summary",
        body: "Compact recommendation body under 900 chars",
        artifacts: [
          {
            kind: "file",
            label: "Optional artifact label",
            path: "optional/path",
            note: "optional note",
          },
        ],
      },
      null,
      2
    ),
    `Allowed payload:\n${JSON.stringify(allowedPayload, null, 2)}`,
    `Role: ${assignment.roleId}`,
    `Seat: ${assignment.seatId}`,
    `Task mode: ${task.dispatchMode}`,
    `Dependencies: ${dependencies.length > 0 ? dependencies.join(" | ") : "None"}`,
    `Constraints: ${goal.constraints.length > 0 ? goal.constraints.join(" | ") : "None"}`,
    `Acceptance criteria: ${
      goal.acceptanceCriteria.length > 0
        ? goal.acceptanceCriteria.join(" | ")
        : "Derive practical acceptance criteria."
    }`,
    persona ? `Persona focus: ${formatPersonaPrompt(persona)}` : "Persona focus: none",
    buildForgeOutputLanguageRule(params.locale),
    "This run is a smoke test. Keep the JSON compact and avoid unnecessary detail.",
    "Keep summary under 140 characters.",
    "Keep body under 900 characters and prefer 3 to 6 short bullet-style lines inside the JSON string when helpful.",
    "Produce exactly one final JSON response for this task.",
    "Do not provide alternatives, variants, multiple drafts, or multiple candidate answers.",
    "Keep the answer practical and directly useful for the downstream handoff.",
    params.promptContext?.trim() ? `Preflight context:\n${params.promptContext.trim()}` : "",
  ].join("\n");
}

function formatPersonaPrompt(persona: ForgePersonaPreset): string {
  return `${persona.label} | ${persona.summary} | ${persona.focus}`;
}

function toArtifactRefs(rawValue: unknown): ForgeResponseArtifactRef[] {
  return Array.isArray(rawValue)
    ? rawValue.flatMap((entry) => {
        const record = toRecord(entry);
        const label = asNonEmptyString(record["label"]);
        if (label === null) {
          return [];
        }
        const kind =
          record["kind"] === "json" ||
          record["kind"] === "image" ||
          record["kind"] === "archive-ref"
            ? record["kind"]
            : "file";
        return [
          {
            kind,
            label,
            path: asNonEmptyString(record["path"]),
            note: asNonEmptyString(record["note"]),
          } satisfies ForgeResponseArtifactRef,
        ];
      })
    : [];
}

export function createForgeArchiveRef(input: {
  conversationId?: unknown;
  localSessionId?: unknown;
  messageId?: unknown;
  provider?: unknown;
}): ForgeArchiveMessageRef {
  return {
    conversationId: asNonEmptyString(input.conversationId) ?? null,
    localSessionId: asNonEmptyString(input.localSessionId) ?? null,
    messageId: asNonEmptyString(input.messageId) ?? null,
    provider: asNonEmptyString(input.provider) ?? null,
  };
}

export interface ForgeTaskResponsePayload {
  artifacts: ForgeResponseArtifactRef[];
  body: string;
  summary: string;
}

export function parseForgeTaskResponsePayload(rawText: string): {
  payload: ForgeTaskResponsePayload | null;
  validationMessages: string[];
} {
  const parsed = extractJsonValue(rawText);
  if (parsed === null) {
    return {
      payload: null,
      validationMessages: ["Task response did not contain valid JSON."],
    };
  }

  const record = toRecord(parsed);
  const summary = asNonEmptyString(record["summary"]);
  const body = asNonEmptyString(record["body"]);
  const artifacts = toArtifactRefs(record["artifacts"]);
  const validationMessages: string[] = [];

  if (summary === null) {
    validationMessages.push("Task response summary is required.");
  }
  if (body === null) {
    validationMessages.push("Task response body is required.");
  }

  return {
    payload:
      summary !== null && body !== null
        ? {
            summary,
            body,
            artifacts,
          }
        : null,
    validationMessages,
  };
}

export function createForgeTaskResponse(params: {
  archiveRef: ForgeArchiveMessageRef | null;
  assignment: ForgeTaskAssignment;
  payload: ForgeTaskResponsePayload;
  rawText: string;
  task: ForgeTask;
}): ForgeAgentResponse {
  const { archiveRef, assignment, payload, rawText, task } = params;
  return {
    id: createForgeId("forge-response"),
    assignmentId: assignment.id,
    contextDigest: assignment.contextDigest,
    taskId: task.id,
    seatId: assignment.seatId,
    roleId: assignment.roleId,
    personaPresetId: assignment.personaPresetId,
    runId: assignment.runId,
    sessionRevision: assignment.sessionRevision,
    summary: payload.summary,
    body: payload.body,
    rawText: rawText.trim(),
    archiveRef,
    artifacts: payload.artifacts,
    status: "captured",
    createdAt: nowIso(),
  };
}

function inferConflictKind(bodies: string[]): ForgeConflictKind {
  const joined = bodies.map((entry) => entry.toLowerCase()).join(" ");
  if (/(risk|danger|failure|break|regression|validate|guard)/.test(joined)) {
    return "risk";
  }
  if (/(sequence|order|first|then|before|after|step)/.test(joined)) {
    return "sequence";
  }
  if (/(scope|defer|exclude|out of scope|minimal|phase)/.test(joined)) {
    return "scope";
  }
  return "approach";
}

export function groupForgeConflicts(params: {
  assignments: ForgeTaskAssignment[];
  responses: ForgeAgentResponse[];
  tasks: ForgeTask[];
}): ForgeConflict[] {
  const { assignments, responses, tasks } = params;
  return tasks
    .filter((task) => task.assignable === true)
    .flatMap((task) => {
      const taskAssignments = assignments.filter((assignment) => assignment.taskId === task.id);
      const taskResponses = responses.filter((response) => response.taskId === task.id);
      if (taskResponses.length < 2) {
        return [];
      }
      const uniqueBodies = new Set(
        taskResponses.map((response) => normalizeTextForComparison(response.body))
      );
      if (uniqueBodies.size < 2) {
        return [];
      }
      return [
        {
          id: createForgeId("forge-conflict"),
          taskId: task.id,
          kind: inferConflictKind(taskResponses.map((response) => response.body)),
          status: "open",
          summary: `Responses for "${task.title}" diverged across ${String(taskAssignments.length)} assignment lane(s).`,
          responseIds: taskResponses.map((response) => response.id),
          preferredResponseId: null,
          resolutionNote: null,
          createdAt: nowIso(),
        } satisfies ForgeConflict,
      ];
    });
}

function buildAcceptanceCriteria(
  goal: ForgeGoal,
  tasks: ForgeTask[],
  responses: ForgeAgentResponse[]
): string[] {
  if (goal.acceptanceCriteria.length > 0) {
    return uniqueStrings(goal.acceptanceCriteria);
  }
  const fromResponses = responses.map((response) => response.summary);
  if (fromResponses.length > 0) {
    return uniqueStrings(fromResponses).slice(0, 3);
  }
  return tasks
    .filter((task) => task.level === 1)
    .slice(0, 3)
    .map((task) => `${task.title} is reflected in the handoff package.`);
}

function buildOpenQuestions(conflicts: ForgeConflict[], taskTitles: Map<string, string>): string[] {
  return conflicts
    .filter((conflict) => conflict.status === "open")
    .map((conflict) => {
      const taskTitle = taskTitles.get(conflict.taskId) ?? conflict.taskId;
      return `${taskTitle}: resolve the ${conflict.kind} difference before implementation starts.`;
    });
}

function buildDecisionTrace(params: {
  conflicts: ForgeConflict[];
  preferredResponses: ForgeAgentResponse[];
  tasks: ForgeTask[];
}): string[] {
  const taskTitles = new Map(params.tasks.map((task) => [task.id, task.title]));
  const lines = uniqueStrings([
    ...params.preferredResponses.map((response) => {
      const taskTitle = taskTitles.get(response.taskId) ?? response.taskId;
      return `${taskTitle} kept ${response.seatId} as the primary lane.`;
    }),
    ...params.conflicts
      .filter((conflict) => conflict.status === "resolved" && conflict.preferredResponseId !== null)
      .map((conflict) => {
        const taskTitle = taskTitles.get(conflict.taskId) ?? conflict.taskId;
        return `${taskTitle} resolved as ${conflict.kind} with an explicit preferred response.`;
      }),
  ]);

  return lines.slice(0, FORGE_MAX_DECISION_TRACE_LINES);
}

export function createForgeSynthesisCandidate(params: {
  conflicts: ForgeConflict[];
  contextDigest?: string | null;
  goal: ForgeGoal;
  preflightId?: string | null;
  responses: ForgeAgentResponse[];
  runId?: string | null;
  sessionRevision?: number | null;
  tasks: ForgeTask[];
}): ForgeSynthesis | null {
  const { conflicts, goal, responses, tasks } = params;
  if (responses.length === 0) {
    return null;
  }

  const taskTitles = new Map(tasks.map((task) => [task.id, task.title]));
  const responsesByTask = new Map<string, ForgeAgentResponse[]>();
  const conflictsByTask = new Map(conflicts.map((conflict) => [conflict.taskId, conflict]));
  responses.forEach((response) => {
    const bucket = responsesByTask.get(response.taskId) ?? [];
    bucket.push(response);
    responsesByTask.set(response.taskId, bucket);
  });

  const preferredResponses = tasks
    .filter((task) => task.assignable === true)
    .flatMap((task) => {
      const taskResponses = responsesByTask.get(task.id) ?? [];
      if (taskResponses.length === 0) {
        return [];
      }
      const conflict = conflictsByTask.get(task.id) ?? null;
      if (conflict?.preferredResponseId) {
        const preferredByConflict = taskResponses.find(
          (response) => response.id === conflict.preferredResponseId
        );
        if (preferredByConflict) {
          return [preferredByConflict];
        }
      }
      const selectedByStatus = taskResponses.find((response) => response.status === "selected");
      if (selectedByStatus) {
        return [selectedByStatus];
      }
      const preferred = taskResponses.find(
        (response) => response.seatId === (task.seatId ?? "ai1")
      );
      return [preferred ?? taskResponses[0]].filter(
        (entry): entry is ForgeAgentResponse => entry !== undefined
      );
    });

  const acceptanceCriteria = buildAcceptanceCriteria(goal, tasks, preferredResponses);
  const openQuestions = buildOpenQuestions(conflicts, taskTitles);
  return {
    contextDigest: params.contextDigest ?? null,
    id: createForgeId("forge-synthesis"),
    preflightId: params.preflightId ?? null,
    runId: params.runId ?? null,
    sessionRevision: params.sessionRevision ?? null,
    snapshotHash: null,
    summary: `${goal.summary} synthesis`,
    body: preferredResponses
      .map((response) => {
        const taskTitle = taskTitles.get(response.taskId) ?? response.taskId;
        return `Task: ${taskTitle}\nSeat: ${response.seatId}\nSummary: ${response.summary}\n${response.body}`;
      })
      .join("\n\n"),
    sourceTaskIds: uniqueStrings(preferredResponses.map((response) => response.taskId)),
    selectedResponseIds: preferredResponses.map((response) => response.id),
    unresolvedConflictIds: conflicts
      .filter((conflict) => conflict.status === "open")
      .map((conflict) => conflict.id),
    decisionTrace: buildDecisionTrace({
      conflicts,
      preferredResponses,
      tasks,
    }),
    provenance: null,
    acceptanceCriteria,
    openQuestions,
    status: "draft",
    createdAt: nowIso(),
  };
}

export function selectForgeSynthesis(
  syntheses: ForgeSynthesis[],
  synthesisId: string
): { selectedSynthesisId: string | null; syntheses: ForgeSynthesis[] } {
  const nextSyntheses: ForgeSynthesis[] = syntheses.map((entry) => ({
    ...entry,
    status:
      entry.id === synthesisId ? "selected" : entry.status === "exported" ? "exported" : "draft",
  }));
  const selected = nextSyntheses.find((entry) => entry.id === synthesisId);
  return {
    selectedSynthesisId: selected ? selected.id : null,
    syntheses: nextSyntheses,
  };
}

export function markForgeSynthesisExported(
  syntheses: ForgeSynthesis[],
  synthesisId: string
): ForgeSynthesis[] {
  return syntheses.map((entry) =>
    entry.id === synthesisId ? { ...entry, status: "exported" } : entry
  );
}

export function syncApprovedTaskStatuses(params: {
  assignments: ForgeTaskAssignment[];
  responses: ForgeAgentResponse[];
  tasks: ForgeTask[];
}): ForgeTask[] {
  const { assignments, responses, tasks } = params;
  return tasks.map((task) => {
    if (task.assignable !== true) {
      return task;
    }
    const taskAssignments = assignments.filter((assignment) => assignment.taskId === task.id);
    const completedAssignments = taskAssignments.filter(
      (assignment) => assignment.status === "completed"
    );
    if (taskAssignments.length > 0 && completedAssignments.length === taskAssignments.length) {
      return {
        ...task,
        status: responses.some((response) => response.taskId === task.id) ? "answered" : "assigned",
      };
    }
    if (taskAssignments.some((assignment) => assignment.status === "dispatched")) {
      return {
        ...task,
        status: "assigned",
      };
    }
    return task;
  });
}

export function createForgeExportRecord(params: {
  contextDigest: string | null;
  createdBy: ForgeSeatId | "coordinator" | "user";
  filePath: string;
  ownerScopeId: string;
  runId: string | null;
  sessionRevision: number | null;
  snapshotHash: string | null;
  synthesisId: string;
  targetRoomId: string;
}): ForgeHandoffExportRecord {
  return {
    contextDigest: params.contextDigest,
    id: createForgeId("forge-export"),
    ownerScopeId: params.ownerScopeId,
    runId: params.runId,
    sessionRevision: params.sessionRevision,
    snapshotHash: params.snapshotHash,
    targetRoomId: params.targetRoomId,
    synthesisId: params.synthesisId,
    filePath: params.filePath,
    createdAt: nowIso(),
    createdBy: params.createdBy,
  };
}

export function resolveDispatchSeat(value: unknown, fallback: ForgeSeatId): ForgeSeatId {
  return isForgeSeatId(value) ? value : fallback;
}
