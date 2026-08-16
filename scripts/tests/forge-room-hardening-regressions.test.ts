import assert from "node:assert/strict";
import test from "node:test";

import { buildContextDigest } from "../../rooms/forge-room/host/forge-context-digest.ts";
import { createForgeHandoffExport } from "../../rooms/forge-room/host/forge-handoff-export.ts";
import { readForgePreflightInvalidationReason } from "../../rooms/forge-room/host/forge-preflight-invalidation.ts";
import {
  assertFreshPreflight,
  classifyFreshPreflightError,
  getPreflightForRun,
} from "../../rooms/forge-room/host/forge-preflight-runtime.ts";
import {
  createEmptyForgeRunArtifactStore,
  createForgeRunArtifacts,
  readForgeRunArtifacts,
  readForgeSynthesisSnapshot,
  upsertForgeRunArtifacts,
  withForgeRunPreflight,
  withForgeSynthesisSnapshot,
} from "../../rooms/forge-room/host/forge-run-artifact-store.ts";
import {
  serializeForAI0,
  serializeForAI1,
  serializeForExport,
} from "../../rooms/forge-room/host/forge-stage-serializers.ts";
import {
  createSynthesisSnapshot,
  exportFromSynthesisSnapshot,
} from "../../rooms/forge-room/host/forge-synthesis-snapshot.ts";
import { buildForgeSelectedOperatorProfile } from "../../rooms/forge-room/host/forge-preflight-metadata.ts";
import { FORGE_LOCAL_OWNER_SCOPE_ID } from "../../rooms/forge-room/shared/forge-constants.ts";
import {
  createDefaultForgeOperatorProfile,
  createEmptyForgePreflightState,
  createEmptyForgeSelectedOperatorProfile,
  createEmptyForgeSessionContextSelection,
  type ForgeGoal,
  type ForgeOperatorProfile,
  type ForgeTask,
  type ForgeTaskAssignment,
  type ForgeConflict,
  type ForgeSynthesis,
} from "../../rooms/forge-room/shared/types/index.ts";

function createGoal(overrides: Partial<ForgeGoal> = {}): ForgeGoal {
  return {
    id: "forge-goal-hardening",
    summary: "Harden the Forge pipeline",
    brief: "Keep revisions explicit and exports immutable.",
    constraints: ["No hidden context"],
    acceptanceCriteria: ["Exports stay stable"],
    status: "draft-ready",
    targetRoomId: "laboratory",
    createdAt: "2026-04-19T00:00:00.000Z",
    updatedAt: "2026-04-19T00:00:00.000Z",
    ...overrides,
  };
}

function createOperatorProfile(): ForgeOperatorProfile {
  return {
    ...createDefaultForgeOperatorProfile("2026-04-19T00:00:00.000Z"),
    skills: [
      {
        skillKey: "typescript",
        label: "TypeScript",
        level: "advanced",
        notes: "Sensitive skill note",
      },
      {
        skillKey: "rust",
        label: "Rust",
        level: "intermediate",
        notes: "Unselected skill note",
      },
    ],
    equipment: [
      {
        equipmentKey: "laptop",
        label: "Laptop",
        status: "available",
        brandModel: "Sensitive Model",
        notes: "Sensitive equipment note",
      },
      {
        equipmentKey: "tablet",
        label: "Tablet",
        status: "planned",
        brandModel: "Unselected Tablet",
        notes: "Unselected equipment note",
      },
    ],
    preferences: {
      mode: "learn_first",
      riskTolerance: "low",
    },
  };
}

function createAppArchitectureSummary() {
  return {
    exportBoundary: "snapshot-only",
    relevantModules: ["forge/runtime"],
    storageBoundary: "room-local",
    summary: "Architecture summary",
  };
}

function createPreflightBundle(params: {
  contextDigest: string;
  runId: string;
  selectedOperatorProfile: ReturnType<typeof buildForgeSelectedOperatorProfile>;
  sessionContextSelection: ReturnType<typeof createEmptyForgeSessionContextSelection>;
}) {
  return {
    appArchitectureSummary: createAppArchitectureSummary(),
    capabilityContext: null,
    contextDigest: params.contextDigest,
    constraints: [],
    coreSystemMetadata: {
      featureId: "forge-workbench",
      mode: "guided" as const,
      roomId: "forge-room",
      schemaVersion: 1,
      sessionId: "forge-session-hardening",
    },
    createdAt: "2026-04-19T00:00:00.000Z",
    preflightId: "forge-preflight-a",
    runId: params.runId,
    sessionRevision: 1,
    selectedOperatorProfile: params.selectedOperatorProfile,
    rovoPreAnalysis: null,
    runOverride: null,
    schemaVersion: "v3" as const,
    sessionContextSelection: params.sessionContextSelection,
    targetRoomContext: null,
  };
}

function createApprovedTask(): ForgeTask {
  return {
    id: "forge-task-hardening",
    parentTaskId: null,
    level: 1,
    title: "Stabilize revisions",
    summary: "Bind downstream work to the active run revision.",
    contextCapsule: null,
    executionKind: "task",
    dependsOnTaskIds: [],
    assignable: true,
    dispatchMode: "single-owner",
    seatId: "ai1",
    roleId: "architect",
    compareSeatIds: [],
    personaPresetId: null,
    status: "approved",
  };
}

function createAssignment(runId: string, contextDigest: string): ForgeTaskAssignment {
  return {
    contextDigest,
    id: "forge-assignment-hardening",
    taskId: "forge-task-hardening",
    mode: "single-owner",
    seatId: "ai1",
    roleId: "architect",
    personaPresetId: null,
    requestId: "forge-request-hardening",
    runId,
    sessionRevision: 4,
    startedAt: null,
    status: "queued",
    queuedAt: "2026-04-19T00:00:00.000Z",
    responseId: null,
    errorMessage: null,
    archiveRef: null,
    completedAt: null,
  };
}

function createConflict(): ForgeConflict {
  return {
    id: "forge-conflict-hardening",
    taskId: "forge-task-hardening",
    kind: "risk",
    status: "resolved",
    summary: "No remaining conflict.",
    responseIds: [],
    preferredResponseId: null,
    resolutionNote: "Resolved during review.",
    createdAt: "2026-04-19T00:00:00.000Z",
  };
}

function createSynthesis(runId: string, contextDigest: string): ForgeSynthesis {
  return {
    contextDigest,
    id: "forge-synthesis-hardening",
    preflightId: "forge-preflight-hardening",
    runId,
    sessionRevision: 4,
    snapshotHash: null,
    summary: "Stable export summary",
    body: "Stable export body",
    decisionTrace: ["Digest verified", "Snapshot frozen"],
    provenance: {
      contextDigest,
      operatorProfileSummary: ["Selected skills: TypeScript (advanced)."],
      preflightId: "forge-preflight-hardening",
      preflightWarnings: [],
      runId,
      runSignature: "forge-run-signature",
      sessionRevision: 4,
    },
    sourceTaskIds: ["forge-task-hardening"],
    selectedResponseIds: [],
    unresolvedConflictIds: [],
    acceptanceCriteria: ["Exports stay stable"],
    openQuestions: ["Should logs include broker ids?"],
    status: "selected",
    createdAt: "2026-04-19T00:00:00.000Z",
  };
}

void test("forge-room rejects draft when preflight digest mismatches", () => {
  const preflight = {
    ...createEmptyForgePreflightState(),
    status: "fresh" as const,
    contextDigest: "digest-a",
    expectedContextDigest: "digest-a",
    runId: "run-a",
    sessionRevision: 1,
  };

  assert.throws(
    () =>
      assertFreshPreflight({
        contextDigest: "digest-b",
        preflight,
        runId: "run-a",
      }),
    /Preflight/
  );
});

void test("forge-room classifies run-context mismatches as digest mismatch events", () => {
  const preflight = {
    ...createEmptyForgePreflightState(),
    status: "fresh" as const,
    contextDigest: "digest-a",
    expectedContextDigest: "digest-a",
    runId: "run-a",
    sessionRevision: 1,
  };

  const eventCode = classifyFreshPreflightError({
    contextDigest: "digest-a",
    preflight,
    runId: "run-b",
  });

  assert.equal(eventCode, "forge.context.digest_mismatch");
});

void test("forge-room classifies stale preflight status as stale reject events", () => {
  const preflight = {
    ...createEmptyForgePreflightState(),
    status: "stale" as const,
    contextDigest: "digest-a",
    expectedContextDigest: "digest-a",
    runId: "run-a",
    sessionRevision: 1,
  };

  const eventCode = classifyFreshPreflightError({
    contextDigest: "digest-a",
    preflight,
    runId: "run-a",
  });

  assert.equal(eventCode, "forge.preflight.stale_reject");
});

void test("forge-room marks preflight stale on selected context change", () => {
  const goal = createGoal();
  const operatorProfile = createOperatorProfile();
  const initialSelection = {
    ...createEmptyForgeSessionContextSelection(),
    skillKeys: ["typescript"],
  };
  const nextSelection = {
    ...createEmptyForgeSessionContextSelection(),
    equipmentKeys: ["laptop"],
  };
  const initialSelectedProfile = buildForgeSelectedOperatorProfile({
    operatorProfile,
    sessionContextSelection: initialSelection,
  });
  const digest = buildContextDigest({
    goal,
    runOverride: null,
    selectedOperatorProfile: initialSelectedProfile,
    sessionContextSelection: initialSelection,
    preflightInputFields: {
      enableRovoPreAnalysis: false,
    },
  });

  const reason = readForgePreflightInvalidationReason({
    goal,
    operatorProfile,
    preflight: {
      ...createEmptyForgePreflightState(),
      status: "fresh",
      contextDigest: digest,
      expectedContextDigest: digest,
      runId: "run-context-a",
      sessionRevision: 1,
      bundle: createPreflightBundle({
        contextDigest: digest,
        runId: "run-context-a",
        selectedOperatorProfile: initialSelectedProfile,
        sessionContextSelection: initialSelection,
      }),
    },
    runOverride: null,
    sessionContextSelection: nextSelection,
  });

  assert.match(reason ?? "", /context changed/i);
});

void test("forge-room does not reuse ai0 output after digest change", () => {
  const preflight = {
    ...createEmptyForgePreflightState(),
    status: "fresh" as const,
    contextDigest: "digest-before",
    expectedContextDigest: "digest-before",
    runId: "run-revision-a",
    sessionRevision: 2,
  };

  assert.equal(getPreflightForRun("run-revision-a", "digest-before", preflight), preflight);
  assert.equal(getPreflightForRun("run-revision-a", "digest-after", preflight), null);
});

void test("forge-room blank profile serializes as absent", () => {
  const payload = serializeForAI0({
    appArchitectureSummary: createAppArchitectureSummary(),
    capabilityContext: null,
    constraints: [],
    contextDigest: "digest-blank-profile",
    goal: createGoal(),
    runId: "run-blank-profile",
    runOverride: null,
    selectedOperatorProfile: createEmptyForgeSelectedOperatorProfile(),
    sessionRevision: 1,
    targetRoomContext: null,
  });

  assert.equal("selectedOperatorProfile" in payload, false);
});

void test("forge-room only sends selected context to provider serializers", () => {
  const operatorProfile = createOperatorProfile();
  const selection = {
    ...createEmptyForgeSessionContextSelection(),
    skillKeys: ["typescript"],
    equipmentKeys: ["laptop"],
  };
  const selectedOperatorProfile = buildForgeSelectedOperatorProfile({
    operatorProfile,
    sessionContextSelection: selection,
  });

  const ai0Payload = serializeForAI0({
    appArchitectureSummary: createAppArchitectureSummary(),
    capabilityContext: null,
    constraints: ["Keep exports immutable"],
    contextDigest: "digest-selected-context",
    goal: createGoal(),
    runId: "run-selected-context",
    runOverride: {
      architectSeatId: "ai1",
      enableRovoPreAnalysis: false,
      mode: "learn_first",
      notes: "Sensitive override note",
      riskTolerance: "low",
      temporaryConditions: [],
    },
    selectedOperatorProfile,
    sessionRevision: 3,
    targetRoomContext: null,
  });
  const ai1Payload = serializeForAI1({
    bundle: null,
    decisionTrace: [],
    goal: createGoal(),
    task: createApprovedTask(),
    taskContextCapsule: null,
  });
  const exportPayload = serializeForExport({
    approvedTasks: [createApprovedTask()],
    assignments: [createAssignment("run-selected-context", "digest-selected-context")],
    conflicts: [createConflict()],
    goal: createGoal(),
    synthesis: createSynthesis("run-selected-context", "digest-selected-context"),
  });

  assert.deepEqual(ai0Payload["selectedOperatorProfile"], {
    skills: [
      {
        label: "TypeScript",
        level: "advanced",
        skillKey: "typescript",
      },
    ],
    equipment: [
      {
        equipmentKey: "laptop",
        label: "Laptop",
        status: "available",
      },
    ],
  });
  assert.equal(JSON.stringify(ai0Payload).includes("Sensitive"), false);
  assert.equal(JSON.stringify(ai1Payload).includes("Sensitive"), false);
  assert.equal(JSON.stringify(exportPayload).includes("Sensitive"), false);
});

void test("forge-room export uses immutable synthesis snapshots", () => {
  const goal = createGoal();
  const approvedTasks = [createApprovedTask()];
  const assignments = [createAssignment("run-snapshot", "digest-snapshot")];
  const conflicts = [createConflict()];
  const synthesis = createSynthesis("run-snapshot", "digest-snapshot");

  const snapshot = createSynthesisSnapshot({
    approvedTasks,
    assignments,
    conflicts,
    contextDigest: "digest-snapshot",
    decisionTrace: ["Digest verified", "Snapshot frozen"],
    goal,
    ownerScopeId: FORGE_LOCAL_OWNER_SCOPE_ID,
    preflightId: "forge-preflight-hardening",
    runId: "run-snapshot",
    sessionRevision: 4,
    synthesis,
  });
  const handoffExport = createForgeHandoffExport();
  const exported = exportFromSynthesisSnapshot({
    buildPackage: handoffExport.buildHandoffPackageFromSnapshot,
    snapshot,
  });

  if (approvedTasks[0]) approvedTasks[0].title = "mutated task";
  if (assignments[0]) assignments[0].roleId = "challenger";
  if (conflicts[0]) conflicts[0].summary = "mutated conflict";
  synthesis.summary = "mutated synthesis";
  goal.summary = "mutated goal";

  assert.equal(exported.goalSummary, "Harden the Forge pipeline");
  assert.equal(exported.taskGraph.tasks[0]?.title, "Stabilize revisions");
  assert.equal(exported.selectedSynthesis.summary, "Stable export summary");
  assert.equal(exported.snapshotHash, snapshot.snapshotHash);
});

void test("forge-room post synthesis edits do not change previous export", () => {
  const handoffExport = createForgeHandoffExport();
  const snapshot = createSynthesisSnapshot({
    approvedTasks: [createApprovedTask()],
    assignments: [createAssignment("run-export", "digest-export")],
    conflicts: [createConflict()],
    contextDigest: "digest-export",
    decisionTrace: ["Digest verified", "Export frozen"],
    goal: createGoal(),
    ownerScopeId: FORGE_LOCAL_OWNER_SCOPE_ID,
    preflightId: "forge-preflight-export",
    runId: "run-export",
    sessionRevision: 7,
    synthesis: createSynthesis("run-export", "digest-export"),
  });

  const firstExport = exportFromSynthesisSnapshot({
    buildPackage: handoffExport.buildHandoffPackageFromSnapshot,
    snapshot,
  });
  const secondExport = exportFromSynthesisSnapshot({
    buildPackage: handoffExport.buildHandoffPackageFromSnapshot,
    snapshot,
  });

  assert.deepEqual(secondExport, firstExport);
});

void test("forge-room decision trace and snapshot share the same revision", () => {
  const decisionTrace = ["Digest verified", "Snapshot frozen"];
  const snapshot = createSynthesisSnapshot({
    approvedTasks: [createApprovedTask()],
    assignments: [createAssignment("run-revision-shared", "digest-revision-shared")],
    conflicts: [createConflict()],
    contextDigest: "digest-revision-shared",
    decisionTrace,
    goal: createGoal(),
    ownerScopeId: FORGE_LOCAL_OWNER_SCOPE_ID,
    preflightId: "forge-preflight-revision-shared",
    runId: "run-revision-shared",
    sessionRevision: 9,
    synthesis: createSynthesis("run-revision-shared", "digest-revision-shared"),
  });

  assert.deepEqual(snapshot.decisionTrace, decisionTrace);
  assert.equal(snapshot.runId, "run-revision-shared");
  assert.equal(snapshot.contextDigest, "digest-revision-shared");
  assert.equal(snapshot.sessionRevision, 9);
});

void test("forge-room run artifacts are run scoped", () => {
  const baseStore = createEmptyForgeRunArtifactStore();
  const runOne = withForgeRunPreflight(
    createForgeRunArtifacts({
      contextDigest: "digest-run-one",
      ownerScopeId: FORGE_LOCAL_OWNER_SCOPE_ID,
      runId: "run-one",
      runSignature: null,
      sessionRevision: 1,
    }),
    {
      ...createEmptyForgePreflightState(),
      status: "fresh",
      contextDigest: "digest-run-one",
      expectedContextDigest: "digest-run-one",
      runId: "run-one",
      sessionRevision: 1,
    }
  );
  const runTwo = createForgeRunArtifacts({
    contextDigest: "digest-run-two",
    ownerScopeId: FORGE_LOCAL_OWNER_SCOPE_ID,
    runId: "run-two",
    runSignature: null,
    sessionRevision: 2,
  });

  const store = upsertForgeRunArtifacts(upsertForgeRunArtifacts(baseStore, runOne), runTwo);

  assert.equal(readForgeRunArtifacts(store, "run-one")?.contextDigest, "digest-run-one");
  assert.equal(readForgeRunArtifacts(store, "run-two")?.contextDigest, "digest-run-two");
  assert.equal(store.entries.length, 2);
});

void test("forge-room artifact queries are owner scoped", () => {
  const sharedRunId = "run-owner-scoped";
  const ownerAEntry = createForgeRunArtifacts({
    contextDigest: "digest-owner-a",
    ownerScopeId: "forge-room:owner-a",
    runId: sharedRunId,
    runSignature: null,
    sessionRevision: 3,
  });
  const ownerBEntry = createForgeRunArtifacts({
    contextDigest: "digest-owner-b",
    ownerScopeId: "forge-room:owner-b",
    runId: sharedRunId,
    runSignature: null,
    sessionRevision: 4,
  });
  const store = upsertForgeRunArtifacts(
    upsertForgeRunArtifacts(createEmptyForgeRunArtifactStore(), ownerAEntry),
    ownerBEntry
  );

  assert.equal(
    readForgeRunArtifacts(store, sharedRunId, "forge-room:owner-a")?.contextDigest,
    "digest-owner-a"
  );
  assert.equal(
    readForgeRunArtifacts(store, sharedRunId, "forge-room:owner-b")?.contextDigest,
    "digest-owner-b"
  );
  assert.equal(readForgeRunArtifacts(store, sharedRunId, "forge-room:owner-c"), null);
});

void test("forge-room cannot export foreign synthesis snapshots", () => {
  const ownerScopeId = "forge-room:owner-a";
  const snapshot = createSynthesisSnapshot({
    approvedTasks: [createApprovedTask()],
    assignments: [createAssignment("run-foreign-export", "digest-foreign-export")],
    conflicts: [createConflict()],
    contextDigest: "digest-foreign-export",
    decisionTrace: ["Digest verified", "Snapshot frozen"],
    goal: createGoal(),
    ownerScopeId,
    preflightId: "forge-preflight-foreign-export",
    runId: "run-foreign-export",
    sessionRevision: 10,
    synthesis: createSynthesis("run-foreign-export", "digest-foreign-export"),
  });
  const store = upsertForgeRunArtifacts(
    createEmptyForgeRunArtifactStore(),
    withForgeSynthesisSnapshot(
      createForgeRunArtifacts({
        contextDigest: snapshot.contextDigest,
        ownerScopeId,
        runId: snapshot.runId,
        runSignature: null,
        sessionRevision: snapshot.sessionRevision,
      }),
      snapshot
    )
  );

  assert.equal(readForgeSynthesisSnapshot(store, snapshot.synthesisId, ownerScopeId)?.snapshotId, snapshot.snapshotId);
  assert.equal(readForgeSynthesisSnapshot(store, snapshot.synthesisId, "forge-room:owner-b"), null);
});
