import test from "node:test";
import assert from "node:assert/strict";

import {
  rebuildQueuedAssignments,
  removeForgeDraftTask,
  updateForgeApprovedTask,
  upsertForgeDraftTask,
} from "../../rooms/forge-room/host/forge-task-editor-runtime.ts";

const sampleDraftTasks = [
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
    dispatchMode: "single-owner" as const,
    seatId: "ai1" as const,
    roleId: "architect" as const,
    compareSeatIds: [],
    personaPresetId: null,
    status: "draft" as const,
  },
  {
    id: "forge-task-2",
    parentTaskId: null,
    level: 1 as const,
    title: "Prepare export",
    summary: "Shape the handoff package.",
    contextCapsule: null,
    executionKind: "task" as const,
    dependsOnTaskIds: ["forge-task-1"],
    assignable: true,
    dispatchMode: "single-owner" as const,
    seatId: "ai1" as const,
    roleId: "architect" as const,
    compareSeatIds: [],
    personaPresetId: null,
    status: "draft" as const,
  },
  {
    id: "forge-task-1-checklist",
    parentTaskId: "forge-task-1",
    level: 2 as const,
    title: "Map fields",
    summary: "Checklist item for Frame boundary.",
    contextCapsule: null,
    executionKind: "checklist" as const,
    dependsOnTaskIds: [],
    assignable: false,
    dispatchMode: "single-owner" as const,
    seatId: null,
    roleId: null,
    compareSeatIds: [],
    personaPresetId: null,
    status: "draft" as const,
  },
];

void test("forge-room task editor updates and removes structured draft tasks without leaving stale dependencies", () => {
  const updated = upsertForgeDraftTask({
    acceptanceCriteria: ["Repair Room can import the handoff JSON."],
    draftTasks: sampleDraftTasks,
    payload: {
      taskId: "forge-task-1",
      title: "Frame intake boundary",
      summary: "Define the Repair Room intake seam.",
      seatId: "ai2",
      roleId: "challenger",
      dispatchMode: "compare",
      compareSeatIds: ["ai1"],
      personaPresetId: "rovo",
      checklist: ["Map fields", "Note risk"],
    },
  });

  assert.deepEqual(updated.validationMessages, ["Draft breakdown must contain 3 to 7 top-level tasks."]);
  const updatedTopLevelTasks = updated.draftTasks.filter((task) => task.level === 1);
  assert.equal(updatedTopLevelTasks[0]?.title, "Frame intake boundary");
  assert.equal(updatedTopLevelTasks[0].dispatchMode, "compare");
  assert.equal(updated.draftTasks.filter((task) => task.level === 2).length, 2);

  const removed = removeForgeDraftTask({
    acceptanceCriteria: ["Repair Room can import the handoff JSON."],
    draftTasks: updated.draftTasks,
    taskId: updatedTopLevelTasks[0].id,
  });
  const remainingTopLevelTasks = removed.draftTasks.filter((task) => task.level === 1);
  assert.equal(remainingTopLevelTasks.length, 1);
  assert.deepEqual(remainingTopLevelTasks[0]?.dependsOnTaskIds, []);
});

void test("forge-room task editor updates approved dispatch settings and rebuilds queued assignments", () => {
  const approvedTasks = sampleDraftTasks
    .filter((task) => task.level === 1)
    .map((task) => ({
      ...task,
      status: "approved" as const,
    }));
  const updated = updateForgeApprovedTask({
    approvedTasks,
    payload: {
      taskId: "forge-task-1",
      seatId: "ai1",
      roleId: "architect",
      dispatchMode: "compare",
      compareSeatIds: ["ai2"],
      personaPresetId: "gok",
    },
  });

  assert.equal(updated.validationMessage, null);
  assert.equal(updated.approvedTasks[0]?.dispatchMode, "compare");
  assert.equal(updated.approvedTasks[0].personaPresetId, "gok");
  const assignments = rebuildQueuedAssignments(updated.approvedTasks, { contextDigest: null, runId: null, sessionRevision: null });
  assert.equal(assignments.length, 3);
  assert.deepEqual(
    assignments
      .filter((assignment) => assignment.taskId === "forge-task-1")
      .map((assignment) => assignment.seatId),
    ["ai1", "ai2"]
  );
});
