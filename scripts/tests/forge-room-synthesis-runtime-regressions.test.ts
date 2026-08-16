import test from "node:test";
import assert from "node:assert/strict";

import {
  buildForgeSynthesisPrompt,
  parseForgeSynthesisResponse,
} from "../../rooms/forge-room/host/forge-synthesis-runtime.ts";

const synthesisGoal = {
  id: "forge-goal-1",
  summary: "Repair Room integration",
  brief: "Prepare the first real handoff.",
  constraints: ["Keep the flow room-local."],
  acceptanceCriteria: ["Repair Room can import the handoff JSON."],
  status: "synthesis-ready" as const,
  targetRoomId: "repair-room",
  createdAt: "2026-04-15T00:00:00.000Z",
  updatedAt: "2026-04-15T00:00:00.000Z",
};

const synthesisTasks = [
  {
    id: "forge-task-1",
    parentTaskId: null,
    level: 1 as const,
    title: "Frame boundary",
    summary: "Define the seam.",
    contextCapsule: null,
    executionKind: "task" as const,
    dependsOnTaskIds: [],
    assignable: true,
    dispatchMode: "compare" as const,
    seatId: "ai1" as const,
    roleId: "architect" as const,
    compareSeatIds: ["ai2" as const],
    personaPresetId: null,
    status: "answered" as const,
  },
];

const synthesisResponses = [
  {
    id: "forge-response-1",
    assignmentId: "forge-assignment-1",
    contextDigest: null,
    taskId: "forge-task-1",
    seatId: "ai1" as const,
    roleId: "architect" as const,
    personaPresetId: null,
    runId: null,
    sessionRevision: null,
    summary: "Local export first.",
    body: "Use room-local export with a narrow intake boundary.",
    rawText: "",
    archiveRef: null,
    artifacts: [],
    status: "captured" as const,
    createdAt: "2026-04-15T00:00:00.000Z",
  },
  {
    id: "forge-response-2",
    assignmentId: "forge-assignment-2",
    contextDigest: null,
    taskId: "forge-task-1",
    seatId: "ai2" as const,
    roleId: "challenger" as const,
    personaPresetId: "rovo" as const,
    runId: null,
    sessionRevision: null,
    summary: "Risk-first guardrails.",
    body: "Keep the export minimal, but call out regression risk explicitly.",
    rawText: "",
    archiveRef: null,
    artifacts: [],
    status: "captured" as const,
    createdAt: "2026-04-15T00:00:01.000Z",
  },
];

const synthesisConflicts = [
  {
    id: "forge-conflict-1",
    taskId: "forge-task-1",
    kind: "risk" as const,
    status: "open" as const,
    summary: "The responses disagree on how much risk framing belongs in the handoff.",
    responseIds: ["forge-response-1", "forge-response-2"],
    preferredResponseId: null,
    resolutionNote: null,
    createdAt: "2026-04-15T00:00:02.000Z",
  },
];

void test("forge-room synthesis runtime builds a prompt with response ids and parses a valid AI synthesis", () => {
  const prompt = buildForgeSynthesisPrompt({
    conflicts: synthesisConflicts,
    goal: synthesisGoal,
    locale: "tr",
    responses: synthesisResponses,
    tasks: synthesisTasks,
  });
  assert.match(prompt, /forge-response-1/);
  assert.match(prompt, /forge-conflict-1/);
  assert.match(prompt, /Use Turkish for every human-readable JSON string value\./);

  const parsed = parseForgeSynthesisResponse({
    conflicts: synthesisConflicts,
    goal: synthesisGoal,
    responses: synthesisResponses,
    tasks: synthesisTasks,
    rawText: JSON.stringify({
      summary: "Chosen synthesis",
      body: "Blend the local export shape with explicit risk notes.",
      selectedResponseIds: ["forge-response-1", "forge-response-2"],
      unresolvedConflictIds: ["forge-conflict-1"],
      decisionTrace: ["Compare lane kept explicit risk framing."],
      acceptanceCriteria: ["Repair Room can import the handoff JSON."],
      openQuestions: ["Should Repair Room keep manual import in v1?"],
    }),
  });

  assert.deepEqual(parsed.validationMessages, []);
  assert.equal(parsed.synthesis?.selectedResponseIds.length, 2);
  assert.deepEqual(parsed.synthesis.unresolvedConflictIds, ["forge-conflict-1"]);
  assert.deepEqual(parsed.synthesis.decisionTrace, ["Compare lane kept explicit risk framing."]);
  assert.equal(parsed.synthesis.provenance, null);
});

void test("forge-room synthesis runtime falls back to captured responses when the AI omits ids", () => {
  const parsed = parseForgeSynthesisResponse({
    conflicts: synthesisConflicts,
    goal: synthesisGoal,
    responses: synthesisResponses,
    tasks: synthesisTasks,
    rawText: JSON.stringify({
      summary: "Fallback synthesis",
      body: "Keep the export local and note the risk delta.",
      acceptanceCriteria: [],
      openQuestions: [],
    }),
  });

  assert.deepEqual(parsed.validationMessages, []);
  assert.equal(parsed.synthesis?.selectedResponseIds.length, 1);
  assert.deepEqual(parsed.synthesis.acceptanceCriteria, ["Repair Room can import the handoff JSON."]);
  assert.equal(parsed.synthesis.provenance, null);
});
