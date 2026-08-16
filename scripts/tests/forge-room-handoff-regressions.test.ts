import test from "node:test";
import assert from "node:assert/strict";

import type { ForgeSynthesis, ForgeTaskAssignment } from "../../rooms/forge-room/shared/types/forge-workflow.ts";
import type { ForgePreflightState, ForgeSynthesisProvenance } from "../../rooms/forge-room/shared/types/forge-preflight.ts";
import { createForgeHandoffExport } from "../../rooms/forge-room/host/forge-handoff-export.ts";
import { createEmptyForgeSession } from "../../rooms/forge-room/host/state/forge-runtime-state.ts";

void test("forge-room handoff export blocks exports until a selected synthesis exists", () => {
  const handoffExport = createForgeHandoffExport();
  const session = createEmptyForgeSession("forge-session-1");
  session.goal = {
    id: "forge-goal-1",
    summary: "Repair Room integration",
    brief: "Prepare the first handoff package.",
    constraints: ["Keep the export boundary local."],
    acceptanceCriteria: ["Repair Room can load the exported handoff package."],
    status: "draft-ready",
    targetRoomId: "repair-room",
    createdAt: "2026-04-15T00:00:00.000Z",
    updatedAt: "2026-04-15T00:00:00.000Z",
  };

  assert.throws(() => handoffExport.buildHandoffPackage(session), /select a synthesis/i);
});

void test("forge-room handoff export requires a target room before export", () => {
  const handoffExport = createForgeHandoffExport();
  const session = createEmptyForgeSession("forge-session-target-missing");
  session.goal = {
    id: "forge-goal-target-missing",
    summary: "Generic handoff integration",
    brief: "Prepare the first handoff package.",
    constraints: ["Keep the export boundary local."],
    acceptanceCriteria: ["Downstream room can load the exported handoff package."],
    status: "draft-ready",
    targetRoomId: "",
    createdAt: "2026-04-15T00:00:00.000Z",
    updatedAt: "2026-04-15T00:00:00.000Z",
  };
  session.syntheses = [
    {
      id: "forge-synthesis-target-missing",
      summary: "Selected synthesis",
      body: "Keep the first handoff narrow and file-backed.",
      decisionTrace: ["Local export path selected for the first handoff."],
      provenance: null,
      sourceTaskIds: [],
      selectedResponseIds: [],
      unresolvedConflictIds: [],
      acceptanceCriteria: ["Downstream room can load the exported handoff package."],
      openQuestions: [],
      status: "selected",
      createdAt: "2026-04-15T00:00:00.000Z",
    } as unknown as ForgeSynthesis,
  ];
  session.selectedSynthesisId = "forge-synthesis-target-missing";

  const summary = handoffExport.buildExportReadySummary(session);

  assert.equal(summary.exportReady, false);
  assert.equal(summary.missingRequirements[0], "Select a target room");
  assert.throws(() => handoffExport.buildHandoffPackage(session), /target room/i);
});

void test("forge-room handoff export builds the Repair Room contract from the approved session state", () => {
  const handoffExport = createForgeHandoffExport();
  const session = createEmptyForgeSession("forge-session-2");
  session.goal = {
    id: "forge-goal-2",
    summary: "Repair Room integration",
    brief: "Prepare the first handoff package.",
    constraints: ["Keep the export boundary local."],
    acceptanceCriteria: ["Repair Room can import the handoff package."],
    status: "draft-ready",
    targetRoomId: "repair-room",
    createdAt: "2026-04-15T00:00:00.000Z",
    updatedAt: "2026-04-15T00:00:00.000Z",
  };
  session.approvedTasks = [
    {
      id: "forge-task-1",
      parentTaskId: null,
      level: 1,
      title: "Define the persistence boundary",
      summary: "Keep session data room-local.",
      contextCapsule: null,
      executionKind: "task",
      dependsOnTaskIds: [],
      assignable: true,
      dispatchMode: "single-owner",
      seatId: "ai1",
      roleId: "architect",
      compareSeatIds: [],
      personaPresetId: "gok",
      status: "approved",
    },
  ];
  session.assignments = [
    {
      id: "forge-assignment-1",
      taskId: "forge-task-1",
      mode: "single-owner",
      seatId: "ai1",
      roleId: "architect",
      personaPresetId: "gok",
      requestId: "forge-request-1",
      startedAt: null,
      status: "queued",
      queuedAt: "2026-04-15T00:00:00.000Z",
      responseId: null,
      errorMessage: null,
      archiveRef: null,
      completedAt: null,
    } as unknown as ForgeTaskAssignment,
  ];
  session.syntheses = [
    {
      id: "forge-synthesis-1",
      summary: "Selected synthesis",
      body: "Keep the first Repair Room handoff narrow and file-backed.",
      decisionTrace: ["Local export path selected for the first handoff."],
      provenance: {
        runSignature: "RepairRoom-v2-result-first-medium-risk-a1b2c3",
        operatorProfileSummary: ["Working mode result-first.", "Risk tolerance medium."],
        preflightWarnings: [
          "Preflight fell back to minimal context because the full bundle could not be prepared.",
        ],
      } as unknown as ForgeSynthesisProvenance,
      sourceTaskIds: ["forge-task-1"],
      selectedResponseIds: ["forge-response-1"],
      unresolvedConflictIds: [],
      acceptanceCriteria: ["Repair Room can import the handoff package."],
      openQuestions: [],
      status: "selected",
      createdAt: "2026-04-15T00:00:00.000Z",
    } as unknown as ForgeSynthesis,
  ];
  session.selectedSynthesisId = "forge-synthesis-1";
  session.runSignature = {
    source: ["result-first", "medium-risk"],
    updatedAt: "2026-04-15T00:00:00.000Z",
    value: "RepairRoom-v2-result-first-medium-risk-z9y8x7",
  };
  session.decisionTrace = ["Local export path selected for the first handoff."];
  session.preflight = {
    bundle: null,
    errorMessage: "socket timeout: 500",
    promptCharCount: 0,
    ranAt: "2026-04-15T00:00:00.000Z",
    staleReason: null,
    status: "warning",
    warnings: [
      "Preflight fell back to minimal context because the full bundle could not be prepared.",
      "socket timeout: 500",
    ],
  } as unknown as ForgePreflightState;
  session.conflicts = [
    {
      id: "forge-conflict-1",
      taskId: "forge-task-1",
      kind: "approach",
      status: "resolved",
      summary: "The responses diverged.",
      responseIds: ["forge-response-1"],
      preferredResponseId: "forge-response-1",
      resolutionNote: "Prefer the local export path.",
      createdAt: "2026-04-15T00:00:00.000Z",
    },
  ];

  const handoff = handoffExport.buildHandoffPackage(session);

  assert.equal(handoff.targetRoomId, "repair-room");
  assert.equal(handoff.goalId, "forge-goal-2");
  assert.equal(handoff.selectedSynthesis.id, "forge-synthesis-1");
  assert.equal(handoff.taskGraph.tasks[0]?.assignedSeatId, "ai1");
  assert.equal(handoff.taskGraph.tasks[0].assignedRoleId, "architect");
  assert.equal(handoff.conflicts[0]?.preferredResponseId, "forge-response-1");
  assert.deepEqual(handoff.acceptanceCriteria, ["Repair Room can import the handoff package."]);
  assert.equal(handoff.runSignature, "RepairRoom-v2-result-first-medium-risk-a1b2c3");
  assert.deepEqual(handoff.contextSummary?.decisionTrace, [
    "Local export path selected for the first handoff.",
  ]);
  assert.deepEqual(handoff.contextSummary.operatorProfileSummary, [
    "Working mode result-first.",
    "Risk tolerance medium.",
  ]);
  assert.deepEqual(handoff.contextSummary.preflightWarnings, [
    "Preflight fell back to minimal context because the full bundle could not be prepared.",
  ]);
});

void test("forge-room handoff export readiness blocks exports while conflicts stay open", () => {
  const handoffExport = createForgeHandoffExport();
  const session = createEmptyForgeSession("forge-session-3");
  session.goal = {
    id: "forge-goal-3",
    summary: "Repair Room integration",
    brief: "Prepare the first handoff package.",
    constraints: ["Keep the export boundary local."],
    acceptanceCriteria: ["Repair Room can import the handoff package."],
    status: "draft-ready",
    targetRoomId: "repair-room",
    createdAt: "2026-04-15T00:00:00.000Z",
    updatedAt: "2026-04-15T00:00:00.000Z",
  };
  session.syntheses = [
    {
      id: "forge-synthesis-2",
      summary: "Selected synthesis",
      body: "Keep the handoff narrow and file-backed.",
      decisionTrace: ["Open risk conflict still blocks export."],
      provenance: null,
      sourceTaskIds: ["forge-task-1"],
      selectedResponseIds: ["forge-response-1"],
      unresolvedConflictIds: ["forge-conflict-2"],
      acceptanceCriteria: ["Repair Room can import the handoff package."],
      openQuestions: [],
      status: "selected",
      createdAt: "2026-04-15T00:00:00.000Z",
    } as unknown as ForgeSynthesis,
  ];
  session.selectedSynthesisId = "forge-synthesis-2";
  session.conflicts = [
    {
      id: "forge-conflict-2",
      taskId: "forge-task-1",
      kind: "risk",
      status: "open",
      summary: "The responses diverged.",
      responseIds: ["forge-response-1", "forge-response-2"],
      preferredResponseId: null,
      resolutionNote: null,
      createdAt: "2026-04-15T00:00:00.000Z",
    },
  ];

  const summary = handoffExport.buildExportReadySummary(session);

  assert.equal(summary.exportReady, false);
  assert.equal(summary.openConflictCount, 1);
  assert.match(summary.reason, /resolve/i);
});

void test("forge-room handoff export blocks while preflight provenance is stale", () => {
  const handoffExport = createForgeHandoffExport();
  const session = createEmptyForgeSession("forge-session-4");
  session.goal = {
    id: "forge-goal-4",
    summary: "Repair Room integration",
    brief: "Prepare the first handoff package.",
    constraints: ["Keep the export boundary local."],
    acceptanceCriteria: ["Repair Room can import the handoff package."],
    status: "draft-ready",
    targetRoomId: "repair-room",
    createdAt: "2026-04-15T00:00:00.000Z",
    updatedAt: "2026-04-15T00:00:00.000Z",
  };
  session.syntheses = [
    {
      id: "forge-synthesis-4",
      summary: "Selected synthesis",
      body: "Keep the handoff narrow and file-backed.",
      decisionTrace: ["Export should wait for a fresh provenance snapshot."],
      provenance: {
        runSignature: "RepairRoom-v3-old-context-a1b2c3",
        operatorProfileSummary: ["Selected skills: Measurement (basic)."],
        preflightWarnings: [],
      },
      sourceTaskIds: ["forge-task-1"],
      selectedResponseIds: ["forge-response-1"],
      unresolvedConflictIds: [],
      acceptanceCriteria: ["Repair Room can import the handoff package."],
      openQuestions: [],
      status: "selected",
      createdAt: "2026-04-15T00:00:00.000Z",
    } as unknown as ForgeSynthesis,
  ];
  session.selectedSynthesisId = "forge-synthesis-4";
  session.preflight = {
    bundle: null,
    errorMessage: null,
    promptCharCount: 0,
    ranAt: "2026-04-15T00:00:00.000Z",
    staleReason: "Session context changed after the last preflight run.",
    status: "stale",
    warnings: [],
  } as unknown as ForgePreflightState;

  const summary = handoffExport.buildExportReadySummary(session);

  assert.equal(summary.exportReady, false);
  assert.match(summary.reason, /preflight/i);
  assert.throws(
    () =>
      handoffExport.buildHandoffPackage(session, {
        fallbackProvenance: {
          runSignature: "RepairRoom-v3-new-context-z9y8x7",
          operatorProfileSummary: ["Selected skills: Measurement (advanced)."],
          preflightWarnings: [],
        } as unknown as ForgeSynthesisProvenance,
      }),
    /preflight/i
  );
});

void test("forge-room handoff export prefers current provenance when the selected synthesis snapshot is stale", () => {
  const handoffExport = createForgeHandoffExport();
  const session = createEmptyForgeSession("forge-session-5");
  session.goal = {
    id: "forge-goal-5",
    summary: "Repair Room integration",
    brief: "Prepare the first handoff package.",
    constraints: ["Keep the export boundary local."],
    acceptanceCriteria: ["Repair Room can import the handoff package."],
    status: "draft-ready",
    targetRoomId: "repair-room",
    createdAt: "2026-04-15T00:00:00.000Z",
    updatedAt: "2026-04-15T00:00:00.000Z",
  };
  session.syntheses = [
    {
      id: "forge-synthesis-5",
      summary: "Selected synthesis",
      body: "Keep the handoff narrow and file-backed.",
      decisionTrace: ["Prefer the fresh runtime provenance when snapshots drift."],
      provenance: {
        runSignature: "RepairRoom-v3-old-context-a1b2c3",
        operatorProfileSummary: ["Selected skills: Measurement (basic)."],
        preflightWarnings: ["Old warning"],
      } as unknown as ForgeSynthesisProvenance,
      sourceTaskIds: ["forge-task-1"],
      selectedResponseIds: ["forge-response-1"],
      unresolvedConflictIds: [],
      acceptanceCriteria: ["Repair Room can import the handoff package."],
      openQuestions: [],
      status: "selected",
      createdAt: "2026-04-15T00:00:00.000Z",
    } as unknown as ForgeSynthesis,
  ];
  session.selectedSynthesisId = "forge-synthesis-5";
  session.preflight = {
    bundle: null,
    errorMessage: null,
    promptCharCount: 0,
    ranAt: "2026-04-15T00:00:00.000Z",
    staleReason: null,
    status: "warning",
    warnings: ["Fallback context used during export prep."],
  } as unknown as ForgePreflightState;

  const handoff = handoffExport.buildHandoffPackage(session, {
    fallbackProvenance: {
      runSignature: "RepairRoom-v3-new-context-z9y8x7",
      operatorProfileSummary: [
        "Selected skills: Measurement (advanced).",
        "Preferences: Mode learn first.",
      ],
      preflightWarnings: ["Fallback context used during export prep."],
    } as unknown as ForgeSynthesisProvenance,
  });

  assert.equal(handoff.runSignature, "RepairRoom-v3-new-context-z9y8x7");
  assert.deepEqual(handoff.contextSummary?.operatorProfileSummary, [
    "Selected skills: Measurement (advanced).",
    "Preferences: Mode learn first.",
  ]);
  assert.deepEqual(handoff.contextSummary.preflightWarnings, [
    "Fallback context used during export prep.",
  ]);
});
