import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { selectForgeCapabilityContext } from "../../rooms/forge-room/host/forge-capability-selector.ts";
import { createForgeHandoffExport } from "../../rooms/forge-room/host/forge-handoff-export.ts";
import {
  createForgeOperatorProfileStorage,
  normalizeForgeOperatorProfile,
} from "../../rooms/forge-room/host/forge-operator-profile-storage.ts";
import {
  buildForgeAppArchitectureSummary,
  buildForgeSelectedOperatorProfile,
  buildForgeCoreSystemMetadata,
  buildForgeTargetRoomContext,
  listForgeCapabilityDescriptors,
} from "../../rooms/forge-room/host/forge-preflight-metadata.ts";
import {
  buildForgePreflightState,
  buildForgeSynthesisProvenance,
  renderForgePromptContext,
} from "../../rooms/forge-room/host/forge-preflight-runtime.ts";
import { buildForgeRunSignature } from "../../rooms/forge-room/host/forge-run-signature.ts";
import {
  createEmptyForgeSession,
  createForgeCoordinatorState,
  createForgeRuntimeStateFromSession,
} from "../../rooms/forge-room/host/state/forge-runtime-state.ts";
import {
  createDefaultForgeOperatorProfile,
  createEmptyForgePreflightState,
  createEmptyForgeSessionContextSelection,
  type ForgeGoal,
  type ForgeSession,
} from "../../rooms/forge-room/shared/types/index.ts";

function createGoal(overrides: Partial<ForgeGoal> = {}): ForgeGoal {
  return {
    id: "forge-goal-v2",
    summary: "Repair Room export planning",
    brief: "Keep the handoff narrow and file-backed.",
    constraints: ["Keep storage local."],
    acceptanceCriteria: ["Repair Room can read the handoff package."],
    status: "draft-ready",
    targetRoomId: "repair-room",
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
    ...overrides,
  };
}

function createProfileStorageDeps() {
  return {
    ensureRuntimeDirectory: async (dirPath: string) => {
      await mkdir(dirPath, { recursive: true });
    },
    readJsonFile: async (filePath: string) => {
      try {
        return JSON.parse(await readFile(filePath, "utf8")) as unknown;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },
    writeJsonFile: async (filePath: string, value: unknown) => {
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
    },
  };
}

void test("forge-room operator profile storage allows a truly blank profile and preserves explicit null-safe fields", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "forge-room-profile-"));
  const storage = createForgeOperatorProfileStorage(createProfileStorageDeps());
  const runtimePaths = {
    storageDir: rootDir,
  };

  try {
    const loaded = await storage.loadProfile(runtimePaths);
    assert.deepEqual(loaded.skills, []);
    assert.deepEqual(loaded.equipment, []);
    assert.deepEqual(loaded.preferences, {});

    const saved = await storage.saveProfile(runtimePaths, {
      skills: [{ skillKey: "measurement", level: "basic" }],
      equipment: [
        { equipmentKey: "multimeter", status: "unavailable" },
        { equipmentKey: "hot_air", status: "available" },
      ],
      preferences: {
        mode: "learn_first",
      },
    });

    assert.deepEqual(saved.skills, [
      { skillKey: "measurement", label: "Measurement", level: "basic" },
    ]);
    assert.deepEqual(saved.equipment, [
      { equipmentKey: "hot_air", label: "Hot Air", status: "available" },
      { equipmentKey: "multimeter", label: "Multimeter", status: "unavailable" },
    ]);
    assert.equal(saved.preferences.mode, "learn_first");
    assert.equal(saved.preferences.riskTolerance, undefined);

    const persisted = JSON.parse(
      await readFile(join(rootDir, "operator-profile.json"), "utf8")
    ) as {
      schemaVersion: number;
      equipment: Array<{ equipmentKey: string; label: string; status: string }>;
    };
    assert.equal(persisted.schemaVersion, 2);
    assert.deepEqual(persisted.equipment, [
      { equipmentKey: "hot_air", label: "Hot Air", status: "available" },
      { equipmentKey: "multimeter", label: "Multimeter", status: "unavailable" },
    ]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

void test("forge-room legacy operator profile migration keeps arbitrary keys room-local and generic", () => {
  const profile = normalizeForgeOperatorProfile({
    skill: {
      level: "advanced",
      boardInspection: "good",
      cablePrep: "basic",
    },
    tools: {
      boardCamera: true,
      spareBenchLight: false,
    },
  });

  assert.deepEqual(profile.skills, [
    { skillKey: "board_inspection", label: "Board Inspection", level: "advanced" },
    { skillKey: "cable_prep", label: "Cable Prep", level: "basic" },
  ]);
  assert.deepEqual(profile.equipment, [
    { equipmentKey: "board_camera", label: "Board Camera", status: "available" },
    {
      equipmentKey: "spare_bench_light",
      label: "Spare Bench Light",
      status: "unavailable",
    },
  ]);
});

void test("forge-room capability selector keeps repair-relevant metadata and enforces the summary budget", () => {
  const context = selectForgeCapabilityContext({
    descriptors: listForgeCapabilityDescriptors(),
    goal: createGoal({
      summary: "Prepare a repair-room handoff JSON through the Forge UI",
      brief: "Keep prompt, protocol, and storage metadata compact.",
    }),
    maxItems: 3,
    sizeBudget: 240,
  });

  assert.ok(context);
  assert.equal(context.summary.length <= 240, true);
  assert.ok(context.items.some((item) => item.id === "forge-target-handoff"));
  assert.ok(context.items.some((item) => item.id === "forge-guided-ui"));
  assert.equal(
    context.items.some((item) => item.id === "laboratory-image-analysis"),
    false
  );
});

void test("forge-room prompt context rendering stays inside the downstream budget", () => {
  const operatorProfile = createDefaultForgeOperatorProfile("2026-04-16T00:00:00.000Z");
  operatorProfile.skills = [{ skillKey: "measurement", label: "Measurement", level: "basic" }];
  operatorProfile.equipment = [{ equipmentKey: "multimeter", label: "Multimeter", status: "unavailable" }];
  operatorProfile.preferences.mode = "learn_first";
  const sessionContextSelection = createEmptyForgeSessionContextSelection();
  sessionContextSelection.skillKeys = ["measurement"];
  sessionContextSelection.equipmentKeys = ["multimeter"];
  sessionContextSelection.preferenceKeys = ["mode"];
  const selectedOperatorProfile = buildForgeSelectedOperatorProfile({
    operatorProfile,
    sessionContextSelection,
  });

  const rendered = renderForgePromptContext({
    bundle: {
      schemaVersion: "v3",
      createdAt: "2026-04-16T00:00:00.000Z",
      contextDigest: "ctx-digest-v3",
      preflightId: "preflight-v3",
      runId: "run-v3",
      sessionRevision: 3,
      coreSystemMetadata: buildForgeCoreSystemMetadata("forge-session-v3"),
      appArchitectureSummary: buildForgeAppArchitectureSummary(),
      targetRoomContext: buildForgeTargetRoomContext("repair-room"),
      capabilityContext: selectForgeCapabilityContext({
        descriptors: listForgeCapabilityDescriptors(),
        goal: createGoal(),
        maxItems: 2,
        sizeBudget: 120,
      }),
      selectedOperatorProfile,
      runOverride: {
        enableRovoPreAnalysis: false,
        notes: "Bench is temporarily shared with another repair.",
        temporaryConditions: ["temporary hot air available"],
      },
      rovoPreAnalysis: null,
      sessionContextSelection,
      constraints: ["Keep steps reversible."],
    },
    contextCapsule: {
      summary: "Only discuss the export seam, not full implementation.",
      relevantModules: [
        "rooms/forge-room/host/runtime.ts",
        "rooms/forge-room/host/forge-handoff-export.ts",
      ],
      constraints: ["Avoid suggesting hot air even if the room supports it."],
    },
    decisionTrace: ["Local JSON handoff kept for v1."],
    runSignature: {
      source: ["keep-storage-local"],
      updatedAt: "2026-04-16T00:00:00.000Z",
      value: "RepairRoom-v3-keep-storage-local-a1b2c3",
    },
    budget: 260,
  });

  assert.equal(rendered.length <= 260, true);
  assert.match(rendered, /Run signature:/);
});

void test("forge-room preflight accepts wrapped AI0 observation JSON replies", async () => {
  const result = await buildForgePreflightState({
    dispatchBridge: async () => ({
      success: true,
      reply: {
        text: [
          "Here are the observations.",
          "```json",
          JSON.stringify({
            summary: "Forge should keep the handoff narrow and avoid implicit room reuse.",
            warnings: ["ADB transport details are still unspecified."],
            missingInfo: ["Exact adb wireless pairing workflow."],
            status: "completed",
          }),
          "```",
          "Kept concise.",
        ].join("\n"),
      },
    }),
    goal: createGoal(),
    operatorProfile: createDefaultForgeOperatorProfile("2026-04-16T00:00:00.000Z"),
    protocol: {
      key: "forge-room-preflight-pre-analysis-test",
      room: "forge-room",
      scenario: "forge-room-preflight-pre-analysis-test",
    },
    runOverride: null,
    sessionContextSelection: createEmptyForgeSessionContextSelection(),
    sessionId: "forge-session-preflight-json",
  });

  assert.equal(
    (result.state.bundle as NonNullable<typeof result.state.bundle>).rovoPreAnalysis?.summary,
    "Forge should keep the handoff narrow and avoid implicit room reuse."
  );
  assert.deepEqual((result.state.bundle as NonNullable<typeof result.state.bundle>).rovoPreAnalysis?.warnings, [
    "ADB transport details are still unspecified.",
  ]);
  assert.deepEqual((result.state.bundle as NonNullable<typeof result.state.bundle>).rovoPreAnalysis?.missingInfo, [
    "Exact adb wireless pairing workflow.",
  ]);
  assert.equal(result.state.warnings.includes("AI0 pre-analysis response could not be parsed."), false);
});

void test("forge-room selected synthesis provenance wins during export and strips raw fallback errors", () => {
  const handoffExport = createForgeHandoffExport();
  const session = createEmptyForgeSession("forge-session-v2-export");
  session.goal = createGoal();
  session.preflight = {
    activeStepId: null,
    bundle: null,
    contextDigest: null,
    errorMessage: "socket timeout: 500",
    expectedContextDigest: null,
    preflightId: null,
    promptCharCount: 0,
    ranAt: "2026-04-16T00:00:00.000Z",
    runId: null,
    sessionRevision: null,
    staleReason: null,
    status: "warning",
    warnings: [
      "Preflight fell back to minimal context because the full bundle could not be prepared.",
      "socket timeout: 500",
    ],
  };
  session.runSignature = {
    source: ["keep-storage-local"],
    updatedAt: "2026-04-16T00:10:00.000Z",
    value: "RepairRoom-v3-keep-storage-local-new999",
  };
  session.syntheses = [
    {
      contextDigest: null,
      id: "forge-synthesis-v2",
      preflightId: null,
      runId: null,
      sessionRevision: null,
      snapshotHash: null,
      summary: "Selected synthesis",
      body: "Keep the Repair Room handoff narrow and explicit.",
      decisionTrace: ["Selected the narrow JSON handoff."],
      provenance: {
        contextDigest: null,
        operatorProfileSummary: ["Profile remained blank, so no tools were assumed."],
        preflightId: null,
        preflightWarnings: [
          "Preflight fell back to minimal context because the full bundle could not be prepared.",
        ],
        runId: null,
        runSignature: "RepairRoom-v3-keep-storage-local-old111",
        sessionRevision: null,
      },
      sourceTaskIds: ["forge-task-1"],
      selectedResponseIds: ["forge-response-1"],
      unresolvedConflictIds: [],
      acceptanceCriteria: ["Repair Room can read the handoff package."],
      openQuestions: [],
      status: "selected",
      createdAt: "2026-04-16T00:00:00.000Z",
    },
  ];
  session.selectedSynthesisId = "forge-synthesis-v2";

  const handoff = handoffExport.buildHandoffPackage(session, {
    fallbackProvenance: buildForgeSynthesisProvenance({
      preflight: session.preflight,
      runOverride: null,
      runSignature: session.runSignature,
      selectedOperatorProfile: buildForgeSelectedOperatorProfile({
        operatorProfile: createDefaultForgeOperatorProfile(),
        sessionContextSelection: createEmptyForgeSessionContextSelection(),
      }),
      sessionContextSelection: createEmptyForgeSessionContextSelection(),
    }),
  });

  assert.equal(handoff.runSignature, "RepairRoom-v3-keep-storage-local-old111");
  assert.deepEqual(handoff.contextSummary?.decisionTrace, ["Selected the narrow JSON handoff."]);
  assert.deepEqual(handoff.contextSummary.operatorProfileSummary, [
    "Profile remained blank, so no tools were assumed.",
  ]);
  assert.deepEqual(handoff.contextSummary.preflightWarnings, [
    "Preflight fell back to minimal context because the full bundle could not be prepared.",
  ]);
});

void test("forge-room run signatures remain human-readable but differ when normalized tokens collide", () => {
  const operatorProfile = createDefaultForgeOperatorProfile();
  const sessionContextSelection = createEmptyForgeSessionContextSelection();
  const left = buildForgeRunSignature({
    goal: createGoal({
      constraints: ["TS first"],
    }),
    selectedOperatorProfile: buildForgeSelectedOperatorProfile({
      operatorProfile,
      sessionContextSelection,
    }),
    runOverride: null,
  });
  const right = buildForgeRunSignature({
    goal: createGoal({
      constraints: ["ts-first"],
    }),
    selectedOperatorProfile: buildForgeSelectedOperatorProfile({
      operatorProfile,
      sessionContextSelection,
    }),
    runOverride: null,
  });

  assert.match(left.value, /^RepairRoom-v3-ts-first-[a-f0-9]{6}$/);
  assert.match(right.value, /^RepairRoom-v3-ts-first-[a-f0-9]{6}$/);
  assert.notEqual(left.value, right.value);
});

void test("forge-room synthesis provenance stays assumption-free when no session context is selected", () => {
  const operatorProfile = createDefaultForgeOperatorProfile();
  operatorProfile.skills = [{ skillKey: "measurement", label: "Measurement", level: "advanced" }];
  operatorProfile.equipment = [{ equipmentKey: "hot_air", label: "Hot Air", status: "available" }];
  operatorProfile.preferences.mode = "result_first";
  const sessionContextSelection = createEmptyForgeSessionContextSelection();

  const provenance = buildForgeSynthesisProvenance({
    preflight: createEmptyForgePreflightState(),
    runOverride: null,
    runSignature: null,
    selectedOperatorProfile: buildForgeSelectedOperatorProfile({
      operatorProfile,
      sessionContextSelection,
    }),
    sessionContextSelection,
  });

  assert.deepEqual(provenance.operatorProfileSummary, [
    "No operator context was selected for this run; do not assume skills, equipment, or preferences beyond the goal itself.",
  ]);
});

void test("forge-room runtime hydration keeps V2 defaults safe when legacy session fields are missing", () => {
  const legacySession = {
    schemaVersion: 2,
    id: "forge-session-legacy",
    roomId: "forge-room",
    goal: createGoal(),
    draftTasks: [],
    draftSourceText: null,
    validationMessages: [],
    approvedTasks: [
      {
        id: "forge-task-legacy",
        parentTaskId: null,
        level: 1,
        title: "Legacy task",
        summary: "This task predates V2.",
        executionKind: "task",
        dependsOnTaskIds: [],
        assignable: true,
        dispatchMode: "single-owner",
        seatId: "ai1",
        roleId: "architect",
        compareSeatIds: [],
        personaPresetId: null,
        status: "approved",
      },
    ],
    assignments: [],
    responses: [],
    conflicts: [],
    syntheses: [
      {
        id: "forge-synthesis-legacy",
        summary: "Legacy synthesis",
        body: "Pre-V2 synthesis body.",
        decisionTrace: ["Legacy trace line."],
        sourceTaskIds: ["forge-task-legacy"],
        selectedResponseIds: [],
        unresolvedConflictIds: [],
        acceptanceCriteria: ["Repair Room can read the handoff package."],
        openQuestions: [],
        status: "draft",
        createdAt: "2026-04-16T00:00:00.000Z",
      },
    ],
    selectedSynthesisId: null,
    exports: [],
    coordinatorState: createForgeCoordinatorState(),
    eventLog: [],
    createdAt: "2026-04-16T00:00:00.000Z",
    updatedAt: "2026-04-16T00:00:00.000Z",
  } as unknown as ForgeSession;

  const hydrated = createForgeRuntimeStateFromSession(legacySession, {
    operatorProfile: createDefaultForgeOperatorProfile(),
  });

  assert.equal(hydrated.preflight.status, "idle");
  assert.equal(hydrated.runSignature, null);
  assert.equal(hydrated.runOverride, null);
  assert.deepEqual(hydrated.sessionContextSelection, createEmptyForgeSessionContextSelection());
  assert.equal(hydrated.approvedTasks[0]?.contextCapsule, null);
  assert.equal(hydrated.syntheses[0]?.provenance, null);
});
