import type {
  ForgeAgentResponse,
  ForgeConflict,
  ForgeGoal,
  ForgeSynthesis,
  ForgeTask,
} from "../shared/types/index.js";
import { FORGE_MAX_DECISION_TRACE_LINES } from "../shared/forge-constants.js";
import {
  asNonEmptyString,
  asStringArray,
  buildForgeOutputLanguageRule,
  createForgeId,
  extractJsonValue,
  nowIso,
  toJsonText,
  toRecord,
  uniqueStrings,
} from "./forge-runtime-support.js";
import { createForgeSynthesisCandidate } from "./forge-task-runtime.js";
import { serializeForAI1 } from "./forge-stage-serializers.js";

const RESPONSE_SUMMARY_PROMPT_LIMIT = 180;
const RESPONSE_BODY_PROMPT_LIMIT = 480;
const SYNTHESIS_BODY_PROMPT_LIMIT = 720;

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncateForPrompt(value: string, limit: number): string {
  const normalized = compactWhitespace(value);
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function formatResponsesForPrompt(
  responses: ForgeAgentResponse[],
  taskTitles: Map<string, string>
): string {
  return responses
    .map((response) => {
      const taskTitle = taskTitles.get(response.taskId) ?? response.taskId;
      return [
        `- responseId: ${response.id}`,
        `  task: ${taskTitle}`,
        `  seat: ${response.seatId}`,
        `  role: ${response.roleId}`,
        `  summary: ${truncateForPrompt(response.summary, RESPONSE_SUMMARY_PROMPT_LIMIT)}`,
        `  bodyExcerpt: ${truncateForPrompt(response.body, RESPONSE_BODY_PROMPT_LIMIT)}`,
      ].join("\n");
    })
    .join("\n");
}

function formatConflictsForPrompt(conflicts: ForgeConflict[]): string {
  if (conflicts.length === 0) {
    return "- none";
  }
  return conflicts
    .map((conflict) =>
      [
        `- conflictId: ${conflict.id}`,
        `  kind: ${conflict.kind}`,
        `  status: ${conflict.status}`,
        `  summary: ${conflict.summary}`,
        `  responseIds: ${conflict.responseIds.join(", ") || "none"}`,
      ].join("\n")
    )
    .join("\n");
}

export function buildForgeSynthesisPrompt(params: {
  conflicts: ForgeConflict[];
  goal: ForgeGoal;
  locale?: string | null;
  promptContext?: string | null;
  responses: ForgeAgentResponse[];
  tasks: ForgeTask[];
}): string {
  const { conflicts, goal, responses, tasks } = params;
  const taskTitles = new Map(tasks.map((task) => [task.id, task.title]));
  const baseline = createForgeSynthesisCandidate(params);
  const allowedPayload = serializeForAI1({
    bundle: null,
    decisionTrace: [],
    goal,
  });
  return [
    "Return JSON only using this exact schema:",
    toJsonText({
      summary: "Short synthesis title",
      body: "Full downstream synthesis body",
      selectedResponseIds: ["forge-response-1"],
      unresolvedConflictIds: ["forge-conflict-1"],
      acceptanceCriteria: ["At least one acceptance criterion"],
      openQuestions: ["Optional open question"],
      decisionTrace: ["One short decision note"],
    }),
    `Allowed payload:\n${toJsonText(allowedPayload)}`,
    "Responses:",
    formatResponsesForPrompt(responses, taskTitles),
    "Conflicts:",
    formatConflictsForPrompt(conflicts),
    baseline
      ? `Baseline candidate for reference:\n${toJsonText({
          summary: truncateForPrompt(baseline.summary, RESPONSE_SUMMARY_PROMPT_LIMIT),
          bodyExcerpt: truncateForPrompt(baseline.body, SYNTHESIS_BODY_PROMPT_LIMIT),
          selectedResponseIds: baseline.selectedResponseIds,
          unresolvedConflictIds: baseline.unresolvedConflictIds,
          acceptanceCriteria: baseline.acceptanceCriteria,
          openQuestions: baseline.openQuestions,
        })}`
      : "Baseline candidate: none",
    buildForgeOutputLanguageRule(params.locale),
    "This run is a smoke test. Keep the final JSON short and compact while still usable for export review.",
    "Keep the output to one final JSON object and synthesize from the response summaries/body excerpts above.",
    "Keep the JSON compact: summary short, body concise, and no prose outside the final JSON object.",
    "Pick the response ids that create the strongest downstream handoff and keep the synthesis practical.",
    params.promptContext?.trim() ? `Preflight context:\n${params.promptContext.trim()}` : "",
  ].join("\n");
}

export function parseForgeSynthesisResponse(params: {
  conflicts: ForgeConflict[];
  goal: ForgeGoal;
  responses: ForgeAgentResponse[];
  tasks: ForgeTask[];
  rawText: string;
}): { synthesis: ForgeSynthesis | null; validationMessages: string[] } {
  const { conflicts, goal, responses, tasks, rawText } = params;
  const parsed = extractJsonValue(rawText);
  if (parsed === null) {
    return {
      synthesis: null,
      validationMessages: ["Synthesis response did not contain valid JSON."],
    };
  }

  const record = toRecord(parsed);
  const validationMessages: string[] = [];
  const summary = asNonEmptyString(record["summary"]);
  const body = asNonEmptyString(record["body"]);
  if (summary === null) {
    validationMessages.push("Synthesis summary is required.");
  }
  if (body === null) {
    validationMessages.push("Synthesis body is required.");
  }

  const fallback = createForgeSynthesisCandidate({
    conflicts,
    goal,
    responses,
    tasks,
  });
  const responseIndex = new Map(responses.map((response) => [response.id, response]));
  const validSelectedResponseIds = uniqueStrings(
    asStringArray(record["selectedResponseIds"])
  ).filter((responseId) => responseIndex.has(responseId));
  const selectedResponseIds =
    validSelectedResponseIds.length > 0
      ? validSelectedResponseIds
      : (fallback?.selectedResponseIds ?? responses.slice(0, 1).map((response) => response.id));
  if (selectedResponseIds.length === 0) {
    validationMessages.push("Synthesis must reference at least one captured response.");
  }

  const conflictIds = new Set(conflicts.map((conflict) => conflict.id));
  const unresolvedConflictIds = uniqueStrings(
    asStringArray(record["unresolvedConflictIds"])
  ).filter((conflictId) => conflictIds.has(conflictId));
  const acceptanceCriteria = uniqueStrings(asStringArray(record["acceptanceCriteria"]));
  const nextAcceptanceCriteria =
    acceptanceCriteria.length > 0
      ? acceptanceCriteria
      : fallback?.acceptanceCriteria.length
        ? fallback.acceptanceCriteria
        : goal.acceptanceCriteria;
  const openQuestions = uniqueStrings(asStringArray(record["openQuestions"]));
  const nextOpenQuestions =
    openQuestions.length > 0 ? openQuestions : (fallback?.openQuestions ?? []);
  const decisionTrace = uniqueStrings(asStringArray(record["decisionTrace"])).slice(
    0,
    FORGE_MAX_DECISION_TRACE_LINES
  );
  const nextDecisionTrace =
    decisionTrace.length > 0 ? decisionTrace : (fallback?.decisionTrace ?? []);
  const taskIds = new Set(tasks.map((task) => task.id));
  const sourceTaskIds = uniqueStrings(
    selectedResponseIds
      .map((responseId) => responseIndex.get(responseId)?.taskId ?? null)
      .filter((taskId): taskId is string => taskId !== null && taskIds.has(taskId))
  );

  if (validationMessages.length > 0 || summary === null || body === null) {
    return {
      synthesis: null,
      validationMessages,
    };
  }

  return {
    synthesis: {
      contextDigest: null,
      id: createForgeId("forge-synthesis"),
      preflightId: null,
      runId: null,
      sessionRevision: null,
      snapshotHash: null,
      summary,
      body,
      sourceTaskIds,
      selectedResponseIds,
      unresolvedConflictIds,
      decisionTrace: nextDecisionTrace,
      provenance: null,
      acceptanceCriteria: nextAcceptanceCriteria,
      openQuestions: nextOpenQuestions,
      status: "draft",
      createdAt: nowIso(),
    },
    validationMessages: [],
  };
}
