import { FORGE_BREAKDOWN_MAX_TASKS, FORGE_BREAKDOWN_MIN_TASKS } from "../shared/forge-constants.js";
import { FORGE_ROLE_CATALOG } from "../shared/data/role-catalog.js";
import type {
  ForgeGoal,
  ForgePersonaPresetId,
  ForgeRoleId,
  ForgeSeatId,
  ForgeTask,
  ForgeTaskDispatchMode,
} from "../shared/types/index.js";
import { isForgePersonaPresetId, isForgeRoleId, isForgeSeatId } from "../shared/types/index.js";
import {
  asNonEmptyString,
  buildForgeOutputLanguageRule,
  asStringArray,
  createForgeId,
  extractJsonValue,
  toJsonText,
  toRecord,
  uniqueStrings,
} from "./forge-runtime-support.js";
import { serializeForAI1 } from "./forge-stage-serializers.js";

export interface ForgeBreakdownTaskSpec {
  title: string;
  summary: string;
  dispatchMode: ForgeTaskDispatchMode;
  seatId: ForgeSeatId;
  roleId: ForgeRoleId;
  personaPresetId: ForgePersonaPresetId | null;
  compareSeatIds: ForgeSeatId[];
  dependsOnTaskTitles: string[];
  checklist: string[];
}

export interface ForgeBreakdownDraftPayload {
  acceptanceCriteria: string[];
  tasks: ForgeBreakdownTaskSpec[];
}

function readDefaultRoleForSeat(seatId: ForgeSeatId): ForgeRoleId {
  const roleEntry = Object.values(FORGE_ROLE_CATALOG).find(
    (entry) => entry.defaultSeatId === seatId && entry.localActor === false
  );
  return (
    roleEntry?.id ??
    (seatId === "ai2" ? "challenger" : seatId === "us1" ? "external-perspective" : "architect")
  );
}

function readDefaultSeatForRole(roleId: ForgeRoleId): ForgeSeatId {
  const roleEntry = FORGE_ROLE_CATALOG[roleId];
  return roleEntry?.defaultSeatId ?? "ai1";
}

function readCompareSeats(primarySeatId: ForgeSeatId, rawValue: unknown): ForgeSeatId[] {
  const explicit = uniqueStrings(asStringArray(rawValue)).filter((entry): entry is ForgeSeatId =>
    isForgeSeatId(entry)
  );
  const filteredExplicit = explicit.filter((entry) => entry !== primarySeatId);
  if (filteredExplicit.length > 0) {
    return filteredExplicit;
  }
  if (primarySeatId === "ai1") {
    return ["ai2"];
  }
  if (primarySeatId === "ai2") {
    return ["ai1"];
  }
  return ["ai1"];
}

function normalizeTaskSpec(candidate: unknown): ForgeBreakdownTaskSpec {
  const record = toRecord(candidate);
  const roleId = isForgeRoleId(record["roleId"]) ? record["roleId"] : "architect";
  const seatId = isForgeSeatId(record["seatId"])
    ? record["seatId"]
    : readDefaultSeatForRole(roleId);
  return {
    title: asNonEmptyString(record["title"]) ?? "",
    summary: asNonEmptyString(record["summary"]) ?? "",
    dispatchMode: record["dispatchMode"] === "compare" ? "compare" : "single-owner",
    seatId,
    roleId: isForgeRoleId(record["roleId"]) ? record["roleId"] : readDefaultRoleForSeat(seatId),
    personaPresetId: isForgePersonaPresetId(record["personaPresetId"])
      ? record["personaPresetId"]
      : null,
    compareSeatIds: readCompareSeats(seatId, record["compareSeatIds"]),
    dependsOnTaskTitles: uniqueStrings(asStringArray(record["dependsOnTaskTitles"])),
    checklist: uniqueStrings(asStringArray(record["checklist"])),
  };
}

export function parseForgeBreakdownDraft(rawText: string): {
  draftSourceText: string;
  payload: ForgeBreakdownDraftPayload | null;
  validationMessages: string[];
} {
  const parsed = extractJsonValue(rawText);
  if (parsed === null) {
    return {
      draftSourceText: rawText.trim(),
      payload: null,
      validationMessages: ["Draft breakdown response did not contain valid JSON."],
    };
  }

  const record = toRecord(parsed);
  const tasks = Array.isArray(record["tasks"])
    ? record["tasks"].map((entry) => normalizeTaskSpec(entry))
    : [];
  const payload: ForgeBreakdownDraftPayload = {
    acceptanceCriteria: uniqueStrings(asStringArray(record["acceptanceCriteria"])),
    tasks,
  };
  const validationMessages = validateForgeBreakdownDraft(payload);
  return {
    draftSourceText: toJsonText(serializeForgeBreakdownDraft(payload)),
    payload,
    validationMessages,
  };
}

export function validateForgeBreakdownDraft(payload: ForgeBreakdownDraftPayload): string[] {
  const messages: string[] = [];
  if (
    payload.tasks.length < FORGE_BREAKDOWN_MIN_TASKS ||
    payload.tasks.length > FORGE_BREAKDOWN_MAX_TASKS
  ) {
    messages.push(
      `Draft breakdown must contain ${String(FORGE_BREAKDOWN_MIN_TASKS)} to ${String(
        FORGE_BREAKDOWN_MAX_TASKS
      )} top-level tasks.`
    );
  }

  const seenTitles = new Set<string>();
  payload.tasks.forEach((task, index) => {
    if (task.title.trim() === "") {
      messages.push(`Task ${String(index + 1)} is missing a title.`);
    }
    if (task.summary.trim() === "") {
      messages.push(`Task ${String(index + 1)} is missing a summary.`);
    }
    if (seenTitles.has(task.title.trim().toLowerCase())) {
      messages.push(`Task title "${task.title}" is duplicated.`);
    }
    seenTitles.add(task.title.trim().toLowerCase());
    if (task.dispatchMode === "compare" && task.compareSeatIds.length === 0) {
      messages.push(`Compare task "${task.title}" must define at least one comparison seat.`);
    }
  });

  const knownTitles = new Set(payload.tasks.map((task) => task.title.trim()));
  payload.tasks.forEach((task) => {
    task.dependsOnTaskTitles.forEach((dependency) => {
      if (knownTitles.has(dependency) !== true) {
        messages.push(`Task "${task.title}" depends on unknown task "${dependency}".`);
      }
      if (dependency === task.title.trim()) {
        messages.push(`Task "${task.title}" cannot depend on itself.`);
      }
    });
  });

  return messages;
}

export function normalizeForgeBreakdownDraft(payload: ForgeBreakdownDraftPayload): {
  acceptanceCriteria: string[];
  draftSourceText: string;
  draftTasks: ForgeTask[];
} {
  const topLevelTasks: ForgeTask[] = payload.tasks.map((task) => ({
    id: createForgeId("forge-task"),
    parentTaskId: null,
    level: 1 as const,
    title: task.title.trim(),
    summary: task.summary.trim(),
    contextCapsule: null,
    executionKind: "task" as const,
    dependsOnTaskIds: [],
    assignable: true,
    dispatchMode: task.dispatchMode,
    seatId: task.seatId,
    roleId: task.roleId,
    compareSeatIds: task.dispatchMode === "compare" ? task.compareSeatIds : [],
    personaPresetId: task.personaPresetId,
    status: "draft" as const,
  }));

  const titleToId = new Map(topLevelTasks.map((task) => [task.title, task.id]));
  const draftTasks: ForgeTask[] = [];
  payload.tasks.forEach((spec, index) => {
    const topLevelTask = topLevelTasks[index];
    if (!topLevelTask) {
      return;
    }
    topLevelTask.dependsOnTaskIds = spec.dependsOnTaskTitles
      .map((dependency) => titleToId.get(dependency) ?? null)
      .filter((dependency): dependency is string => dependency !== null);
    draftTasks.push(topLevelTask);
    spec.checklist.forEach((entry) => {
      draftTasks.push({
        id: createForgeId("forge-task"),
        parentTaskId: topLevelTask.id,
        level: 2,
        title: entry,
        summary: `Checklist item for ${topLevelTask.title}.`,
        contextCapsule: null,
        executionKind: "checklist",
        dependsOnTaskIds: [],
        assignable: false,
        dispatchMode: "single-owner",
        seatId: null,
        roleId: null,
        compareSeatIds: [],
        personaPresetId: null,
        status: "draft",
      });
    });
  });

  return {
    acceptanceCriteria: payload.acceptanceCriteria,
    draftSourceText: toJsonText(serializeForgeBreakdownDraft(payload)),
    draftTasks,
  };
}

export function buildForgeBreakdownPrompt(
  goal: ForgeGoal,
  options: {
    locale?: string | null;
    promptContext?: string | null;
  } = {}
): string {
  const allowedPayload = serializeForAI1({
    bundle: null,
    decisionTrace: [],
    goal,
  });
  return [
    "Return JSON only using this exact schema:",
    toJsonText({
      acceptanceCriteria: ["One clear acceptance criterion"],
      tasks: [
        {
          title: "Task title",
          summary: "Short task summary",
          dispatchMode: "single-owner",
          seatId: "ai1",
          roleId: "architect",
          personaPresetId: "gok",
          compareSeatIds: [],
          dependsOnTaskTitles: [],
          checklist: ["Optional child checklist item"],
        },
      ],
    }),
    `Allowed payload:\n${toJsonText(allowedPayload)}`,
    "Requirements:",
    `- ${buildForgeOutputLanguageRule(options.locale)}`,
    "- This run is a smoke test; keep acceptance criteria, summaries, and checklist items as short as possible.",
    "- Produce 3 to 7 top-level tasks.",
    "- Use compare mode only when two seats should answer the same task.",
    "- Use checklist only for non-assignable child steps.",
    "- Keep the plan narrow enough for a downstream handoff package.",
    options.promptContext?.trim() ? `Preflight context:\n${options.promptContext.trim()}` : "",
  ].join("\n");
}

export function serializeForgeBreakdownDraft(payload: {
  acceptanceCriteria?: string[];
  tasks: ForgeTask[] | ForgeBreakdownTaskSpec[];
}): ForgeBreakdownDraftPayload {
  const topLevelTasks = payload.tasks.filter(
    (task): task is ForgeTask & { level: 1 } => "level" in task && task.level === 1
  );
  if (topLevelTasks.length > 0) {
    return {
      acceptanceCriteria: uniqueStrings(payload.acceptanceCriteria ?? []),
      tasks: topLevelTasks.map((task) => ({
        title: task.title,
        summary: task.summary,
        dispatchMode: task.dispatchMode,
        seatId: task.seatId ?? "ai1",
        roleId: task.roleId ?? "architect",
        personaPresetId: task.personaPresetId,
        compareSeatIds: task.compareSeatIds,
        dependsOnTaskTitles: topLevelTasks
          .filter((candidate) => task.dependsOnTaskIds.includes(candidate.id))
          .map((candidate) => candidate.title),
        checklist: payload.tasks
          .filter(
            (candidate): candidate is ForgeTask & { level: 2 } =>
              "level" in candidate && candidate.level === 2 && candidate.parentTaskId === task.id
          )
          .map((candidate) => candidate.title),
      })),
    };
  }

  return {
    acceptanceCriteria: uniqueStrings(payload.acceptanceCriteria ?? []),
    tasks: (payload.tasks as ForgeBreakdownTaskSpec[]).map((task) => ({
      title: task.title,
      summary: task.summary,
      dispatchMode: task.dispatchMode,
      seatId: task.seatId,
      roleId: task.roleId,
      personaPresetId: task.personaPresetId,
      compareSeatIds: task.compareSeatIds,
      dependsOnTaskTitles: uniqueStrings(task.dependsOnTaskTitles),
      checklist: uniqueStrings(task.checklist),
    })),
  };
}
