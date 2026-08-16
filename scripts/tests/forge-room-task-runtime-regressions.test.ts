import test from "node:test";
import assert from "node:assert/strict";

import type { ForgeAgentResponse } from "../../rooms/forge-room/shared/types/forge-workflow.ts";
import {
  createAssignmentsForApprovedTasks,
  createForgeSynthesisCandidate,
  groupForgeConflicts,
} from "../../rooms/forge-room/host/forge-task-runtime.ts";

void test("forge-room task runtime creates compare assignments from approved tasks", () => {
  const assignments = createAssignmentsForApprovedTasks([
    {
      id: "forge-task-1",
      parentTaskId: null,
      level: 1,
      title: "Compare options",
      summary: "Collect competing answers.",
      contextCapsule: null,
      executionKind: "task",
      dependsOnTaskIds: [],
      assignable: true,
      dispatchMode: "compare",
      seatId: "ai1",
      roleId: "architect",
      compareSeatIds: ["ai2"],
      personaPresetId: "rovo",
      status: "approved",
    },
  ], { contextDigest: null, runId: null, sessionRevision: null });

  assert.equal(assignments.length, 2);
  assert.deepEqual(
    assignments.map((entry) => entry.seatId),
    ["ai1", "ai2"]
  );
});

void test("forge-room task runtime groups compare responses into conflicts and produces synthesis", () => {
  const tasks = [
    {
      id: "forge-task-1",
      parentTaskId: null,
      level: 1 as const,
      title: "Compare options",
      summary: "Collect competing answers.",
      contextCapsule: null,
      executionKind: "task" as const,
      dependsOnTaskIds: [],
      assignable: true,
      dispatchMode: "compare" as const,
      seatId: "ai1" as const,
      roleId: "architect" as const,
      compareSeatIds: ["ai2" as const],
      personaPresetId: "rovo" as const,
      status: "approved" as const,
    },
  ];
  const assignments = createAssignmentsForApprovedTasks(tasks, { contextDigest: null, runId: null, sessionRevision: null });
  const responses = [
    {
      id: "forge-response-1",
      assignmentId: (assignments[0] as (typeof assignments)[number]).id,
      taskId: "forge-task-1",
      seatId: "ai1" as const,
      roleId: "architect" as const,
      personaPresetId: "rovo" as const,
      summary: "Keep the export local.",
      body: "Use room-local JSON export first.",
      rawText: "Use room-local JSON export first.",
      archiveRef: null,
      artifacts: [],
      status: "captured" as const,
      createdAt: "2026-04-15T00:00:00.000Z",
    },
    {
      id: "forge-response-2",
      assignmentId: (assignments[1] as (typeof assignments)[number]).id,
      taskId: "forge-task-1",
      seatId: "ai2" as const,
      roleId: "challenger" as const,
      personaPresetId: "rovo" as const,
      summary: "Guard export scope hard.",
      body: "Keep scope minimal and document risk.",
      rawText: "Keep scope minimal and document risk.",
      archiveRef: null,
      artifacts: [],
      status: "captured" as const,
      createdAt: "2026-04-15T00:00:01.000Z",
    },
  ];
  const conflicts = groupForgeConflicts({
    assignments,
    responses: responses as unknown as ForgeAgentResponse[],
    tasks,
  });
  const resolvedConflicts = conflicts.map((conflict) => ({
    ...conflict,
    status: "resolved" as const,
    preferredResponseId: "forge-response-2",
  }));
  const synthesis = createForgeSynthesisCandidate({
    conflicts: resolvedConflicts,
    goal: {
      id: "forge-goal-1",
      summary: "Repair Room integration",
      brief: "Prepare the first handoff.",
      constraints: ["Keep scope local."],
      acceptanceCriteria: ["Repair Room can import the package."],
      status: "draft-ready",
      targetRoomId: "repair-room",
      createdAt: "2026-04-15T00:00:00.000Z",
      updatedAt: "2026-04-15T00:00:00.000Z",
    },
    responses: responses as unknown as ForgeAgentResponse[],
    tasks,
  });

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0]?.kind, "risk");
  assert.equal(synthesis?.selectedResponseIds.length, 1);
  assert.deepEqual(synthesis.selectedResponseIds, ["forge-response-2"]);
  assert.deepEqual(synthesis.acceptanceCriteria, ["Repair Room can import the package."]);
  assert.equal(Array.isArray(synthesis.decisionTrace), true);
});
