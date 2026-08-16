import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import createPatternRoomHostRuntime from "../../rooms/pattern-room/host/runtime.ts";
import { PATTERN_ROOM_DOMAIN_TEST_FIXTURE } from "../../rooms/pattern-room/shared/data/testing/pattern-room-domain.fixture.ts";
import { createLocalState } from "../../rooms/pattern-room/shared/state/pattern-room-local-state.ts";
import {
  createSnapshot,
  restoreFromSnapshot,
} from "../../rooms/pattern-room/shared/state/pattern-room-snapshot.ts";
import {
  PATTERN_ROOM_SNAPSHOT_VERSION,
  type PatternRoomSessionSnapshot,
} from "../../rooms/pattern-room/shared/types/pattern-room-snapshot.ts";
import {
  PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND,
} from "../../rooms/pattern-room/shared/types/pattern-room-case-review-dispatch.ts";
import {
  PATTERN_ROOM_LOAD_COMMAND,
  PATTERN_ROOM_SAVE_COMMAND,
} from "../../rooms/pattern-room/shared/types/pattern-room-persistence.ts";
import {
  createLongTextProducer,
  createUserTextProducer,
  produceAndImportSource,
} from "../../rooms/pattern-room/shared/source-producers/index.ts";

function createSnapshotReadyLocalState(): ReturnType<typeof createLocalState> {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  localState.updateCaseIdentity(
    "Kuzey Koridoru Sensör Olayı",
    "Elektrik kesintisi sırasında koridorda fiziksel hareket oldu mu?"
  );
  localState.sendToDesk("node-navigation-source");
  localState.pinSource("source-shadow-comparison", "analysis");
  localState.addToDebate("node-shadow-analysis");
  localState.addToDebate("source-shadow-comparison");
  localState.addLocalNote("Snapshot smoke note");
  localState.prepareDebate();
  localState.assignDebateRoles();
  localState.startDebate();
  localState.advanceDebatePhase();
  localState.advanceDebatePhase();
  localState.advanceDebatePhase();
  localState.advanceDebatePhase();
  localState.completeDebate();
  localState.reflectDebateToReport();

  return localState;
}

function assertRestoredSnapshotStateMatches(
  left: {
    overlay: unknown;
    activeView: unknown;
    presentation?: unknown;
    guards: unknown;
  },
  right: {
    overlay: unknown;
    activeView: unknown;
    presentation?: unknown;
    guards: unknown;
  }
): void {
  assert.deepEqual(left.overlay, right.overlay);
  assert.equal(left.activeView, right.activeView);
  assert.deepEqual(left.presentation, right.presentation);
  assert.deepEqual(left.guards, right.guards);
}

void test("pattern-room phase 6B creates a local session snapshot from local mutations", () => {
  const localState = createSnapshotReadyLocalState();
  const snapshot = createSnapshot(localState, "tenth-man");

  assert.match(snapshot.snapshotId, /^pattern-room-snapshot-topic-earth-shape-mock-/);
  assert.equal(snapshot.roomId, "pattern-room");
  assert.equal(snapshot.topicId, PATTERN_ROOM_DOMAIN_TEST_FIXTURE.topic.id);
  assert.equal(snapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
  assert.equal(snapshot.activeView, "tenth-man");
  assert.equal(snapshot.createdAt, snapshot.updatedAt);
  assert.equal(snapshot.overlay.caseLabel, "Kuzey Koridoru Sensör Olayı");
  assert.equal(
    snapshot.overlay.researchQuestion,
    "Elektrik kesintisi sırasında koridorda fiziksel hareket oldu mu?"
  );
  assert.deepEqual(snapshot.overlay.deskNodeIds, ["node-navigation-source"]);
  assert.deepEqual(snapshot.overlay.pinnedSourceIds, ["source-shadow-comparison"]);
  assert.deepEqual(snapshot.overlay.debateReferenceIds, [
    "node-shadow-analysis",
    "source-shadow-comparison",
  ]);
  assert.equal(snapshot.overlay.debatePhase, "completed");
  assert.equal(snapshot.overlay.debateLocalTurns.length, 5);
  assert.equal(snapshot.overlay.localNotes.length, 2);
  assert.deepEqual(snapshot.guards, {
    debateReportReflected: true,
    noteIndex: 2,
  });
});

void test("pattern-room presentation state round-trips separately from case truth", () => {
  const localState = createSnapshotReadyLocalState();
  const presentation = {
    canvasMode: "graph" as const,
    selectedBoardItemId: "node-shadow-analysis",
    selectedConnectionId: "edge-navigation-supports-horizon",
  };
  const snapshot = createSnapshot(localState, "desk", presentation);
  const restored = restoreFromSnapshot(snapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  assert.equal(snapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
  assert.deepEqual(snapshot.presentation, presentation);
  assert.ok(restored);
  assert.deepEqual(restored.presentation, presentation);
  assert.deepEqual(restored.overlay, snapshot.overlay);

  const legacySnapshot: PatternRoomSessionSnapshot = { ...snapshot };
  delete legacySnapshot.presentation;
  const restoredLegacy = restoreFromSnapshot(legacySnapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  assert.ok(restoredLegacy);
  assert.equal(restoredLegacy.presentation, undefined);
});

void test("pattern-room phase 6B restores valid snapshot pieces and applies them to local state", () => {
  const snapshot = createSnapshot(createSnapshotReadyLocalState(), "report");
  const restored = restoreFromSnapshot(snapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  assert.ok(restored);
  assertRestoredSnapshotStateMatches(restored, snapshot);

  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  let notificationCount = 0;
  const unsubscribe = localState.subscribe(() => {
    notificationCount += 1;
  });

  localState.restoreOverlay(restored.overlay, restored.guards);
  unsubscribe();

  assert.equal(notificationCount, 1);
  assert.deepEqual(localState.getOverlay(), restored.overlay);
  assert.deepEqual(localState.getGuards(), restored.guards);

  localState.reflectDebateToReport();
  assert.equal(localState.getOverlay().localNotes.length, restored.overlay.localNotes.length);
});

void test("pattern-room phase 6B round-trips snapshot state excluding metadata", () => {
  const snapshot = createSnapshot(createSnapshotReadyLocalState(), "board");
  const restored = restoreFromSnapshot(snapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  assert.ok(restored);

  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.restoreOverlay(restored.overlay, restored.guards);
  const roundTripSnapshot = createSnapshot(localState, restored.activeView);

  assertRestoredSnapshotStateMatches(roundTripSnapshot, snapshot);
});

void test("pattern-room phase 7B round-trips local authored overlay entries", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  localState.addAuthoredClaim("Snapshot iddia", "Snapshot içinde kalacak local iddia.");
  localState.addAuthoredSource("Snapshot kaynak", "Local defter", "Snapshot source note.");
  localState.addAuthoredEvidence("Snapshot kanıt", "Snapshot excerpt", "Snapshot interpretation");
  localState.addAuthoredEdge(
    "supports",
    "local-node-001",
    "local-source-001",
    "Snapshot connection note."
  );
  localState.addToDebate("local-node-001");
  localState.addToDebate("local-source-001");
  localState.addToDebate("local-evidence-001");

  const snapshot = createSnapshot(localState, "board");
  const restored = restoreFromSnapshot(snapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  assert.ok(restored);

  assert.deepEqual(
    restored.overlay.localAuthoredNodes.map((node) => node.id),
    ["local-node-001"]
  );
  assert.deepEqual(
    restored.overlay.localAuthoredSources.map((source) => source.id),
    ["local-source-001"]
  );
  assert.deepEqual(
    restored.overlay.localAuthoredEvidence.map((evidence) => evidence.id),
    ["local-evidence-001"]
  );
  assert.deepEqual(
    restored.overlay.localAuthoredEdges.map((edge) => edge.id),
    ["local-edge-001"]
  );
  assert.deepEqual(restored.overlay.localAuthoredEdges[0], {
    id: "local-edge-001",
    edgeType: "supports",
    sourceId: "local-node-001",
    targetId: "local-source-001",
    note: "Snapshot connection note.",
    createdAt: restored.overlay.localAuthoredEdges[0]?.createdAt,
  });
  assert.deepEqual(restored.overlay.debateReferenceIds, [
    "local-node-001",
    "local-source-001",
    "local-evidence-001",
  ]);

  const roundTripState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  roundTripState.restoreOverlay(restored.overlay, restored.guards);
  const roundTripSnapshot = createSnapshot(roundTripState, restored.activeView);
  assertRestoredSnapshotStateMatches(roundTripSnapshot, snapshot);
});

void test("pattern-room phase 13F round-trips source-linked local evidence without schema bump", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addAuthoredSource("Snapshot source", "Archive shelf", "Snapshot source note.");
  localState.addAuthoredEvidence(
    "Snapshot linked evidence",
    "Snapshot linked excerpt.",
    "Snapshot linked context.",
    "evidence",
    {
      sourceId: "local-source-001",
      sourceLabel: "Snapshot source",
    }
  );

  const snapshot = createSnapshot(localState, "archive");
  const restored = restoreFromSnapshot(snapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  assert.equal(snapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
  assert.equal(snapshot.overlay.localAuthoredEvidence[0]?.sourceId, "local-source-001");
  assert.equal(snapshot.overlay.localAuthoredEvidence[0].sourceLabel, "Snapshot source");
  assert.ok(restored);
  assert.equal(restored.overlay.localAuthoredEvidence[0]?.sourceId, "local-source-001");
  assert.equal(restored.overlay.localAuthoredEvidence[0].sourceLabel, "Snapshot source");

  const roundTripState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  roundTripState.restoreOverlay(restored.overlay, restored.guards);
  const roundTripSnapshot = createSnapshot(roundTripState, restored.activeView);
  assertRestoredSnapshotStateMatches(roundTripSnapshot, snapshot);
});

void test("pattern-room phase 12D round-trips user text producer sources", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const producer = createUserTextProducer({ now: () => "2026-05-21T10:00:00.000Z" });
  const orchestrationResult = produceAndImportSource(producer, {
    inputKind: "pasted_text",
    text: "Başlıksız kullanıcı metni snapshot içinde kalmalı.",
    language: "tr",
  });
  const importResult = orchestrationResult.importResults[0]?.importResult;
  assert.ok(importResult);
  localState.applySourceImportResult(importResult);

  const snapshot = createSnapshot(localState, "archive");
  const restored = restoreFromSnapshot(snapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  assert.ok(restored);

  assert.equal(snapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
  assert.deepEqual(restored.overlay.localAuthoredSources, [
    {
      id: "local-source-001",
      label: "Başlıksız kullanıcı metni snapshot içinde kalmalı.",
      origin: "Kullanıcı metni",
      note: "Başlıksız kullanıcı metni snapshot içinde kalmalı.",
      createdAt: restored.overlay.localAuthoredSources[0]?.createdAt,
    },
  ]);

  const roundTripState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  roundTripState.restoreOverlay(restored.overlay, restored.guards);
  const roundTripSnapshot = createSnapshot(roundTripState, restored.activeView);
  assertRestoredSnapshotStateMatches(roundTripSnapshot, snapshot);
});

void test("pattern-room phase 12F-B round-trips optional import batch ids without schema bump", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const producer = createUserTextProducer({ now: () => "2026-05-21T10:00:00.000Z" });
  const orchestrationResult = produceAndImportSource(producer, {
    inputKind: "pasted_text",
    text: "Batch tracked kullanıcı metni snapshot içinde kalmalı.",
    title: "Batch tracked source",
    language: "tr",
  });
  const importResult = orchestrationResult.importResults[0]?.importResult;
  assert.ok(importResult);
  localState.applySourceImportResult(importResult, {
    importBatchId: "source-package-snapshot-001",
  });

  const snapshot = createSnapshot(localState, "archive");
  const restored = restoreFromSnapshot(snapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  assert.ok(restored);

  assert.equal(snapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
  assert.equal(PATTERN_ROOM_SNAPSHOT_VERSION, 1);
  assert.deepEqual(
    restored.overlay.localAuthoredSources.map((source) => source.importBatchId),
    ["source-package-snapshot-001"]
  );

  const roundTripState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  roundTripState.restoreOverlay(restored.overlay, restored.guards);
  const roundTripSnapshot = createSnapshot(roundTripState, restored.activeView);
  assertRestoredSnapshotStateMatches(roundTripSnapshot, snapshot);
});

void test("pattern-room phase 13C round-trips long text producer sources without schema bump", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const producer = createLongTextProducer({ now: () => "2026-05-21T10:00:00.000Z" });
  const text =
    "Birinci uzun metin parçası snapshot içinde kaynak notu olarak kalmalı.\n\n" +
    "İkinci uzun metin parçası segment sayısını üretir ama pano kanıtı üretmez.";
  const orchestrationResult = produceAndImportSource(producer, {
    inputKind: "long_text",
    title: "Snapshot uzun metin",
    origin: "Arşiv defteri",
    sourceKind: "archive_text",
    chapter: "Defter I",
    page: "42",
    text,
    language: "tr",
  });
  const importResult = orchestrationResult.importResults[0]?.importResult;
  assert.ok(importResult);
  const producedSegments = orchestrationResult.packagesProduced[0]?.segments ?? [];
  assert.equal(producedSegments.length, 2);
  localState.applySourceImportResult(importResult);

  const snapshot = createSnapshot(localState, "archive");
  const restored = restoreFromSnapshot(snapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  assert.ok(restored);

  assert.equal(snapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
  assert.equal(PATTERN_ROOM_SNAPSHOT_VERSION, 1);
  const restoredSource = restored.overlay.localAuthoredSources[0];
  assert.equal(restoredSource?.id, "local-source-001");
  assert.equal(restoredSource.label, "Snapshot uzun metin");
  assert.equal(restoredSource.origin, "Arşiv defteri");
  assert.equal(restoredSource.note, text);
  assert.deepEqual(
    restoredSource.segments,
    producedSegments.map((segment, index) => {
      return {
        id: segment.segmentId,
        label: segment.label,
        text: segment.text,
        order: segment.order ?? index,
      };
    })
  );
  assert.deepEqual(restored.overlay.localAuthoredEvidence, []);
  assert.deepEqual(restored.overlay.localAuthoredNodes, []);
  assert.deepEqual(restored.overlay.pinnedSourceIds, []);
  assert.deepEqual(restored.overlay.sourcePinnedLayerById, {});

  const roundTripState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  roundTripState.restoreOverlay(restored.overlay, restored.guards);
  const roundTripSnapshot = createSnapshot(roundTripState, restored.activeView);
  assertRestoredSnapshotStateMatches(roundTripSnapshot, snapshot);
});

void test("pattern-room phase 8B local edge authoring validates endpoints and stays overlay-only", () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  let notificationCount = 0;
  const unsubscribe = localState.subscribe(() => {
    notificationCount += 1;
  });

  localState.addAuthoredClaim("Local claim", "Local claim content.");
  localState.addAuthoredSource("Local source", "Local notebook", "");
  localState.addAuthoredEvidence("Local evidence", "Local excerpt", "");

  assert.equal(localState.resolveEntityExists("node-navigation-source"), true);
  assert.equal(localState.resolveEntityExists("source-shadow-comparison"), true);
  assert.equal(localState.resolveEntityExists("local-node-001"), true);
  assert.equal(localState.resolveEntityExists("local-source-001"), true);
  assert.equal(localState.resolveEntityExists("local-evidence-001"), true);
  assert.equal(localState.resolveEntityLabel("local-evidence-001"), "Local evidence");

  const notificationsBeforeEdge = notificationCount;
  localState.addAuthoredEdge(
    "supports",
    "local-node-001",
    "local-evidence-001",
    "  Local edge note.  "
  );
  assert.equal(notificationCount, notificationsBeforeEdge + 1);
  assert.deepEqual(localState.getOverlay().localAuthoredEdges, [
    {
      id: "local-edge-001",
      edgeType: "supports",
      sourceId: "local-node-001",
      targetId: "local-evidence-001",
      note: "Local edge note.",
      createdAt: localState.getOverlay().localAuthoredEdges[0]?.createdAt,
    },
  ]);

  localState.addAuthoredEdge("supports", "local-node-001", "local-node-001");
  localState.addAuthoredEdge("supports", "", "local-evidence-001");
  localState.addAuthoredEdge("supports", "missing-node", "local-evidence-001");
  localState.addAuthoredEdge(
    "not-an-edge" as Parameters<typeof localState.addAuthoredEdge>[0],
    "local-node-001",
    "local-evidence-001"
  );
  unsubscribe();

  assert.equal(localState.getOverlay().localAuthoredEdges.length, 1);
  assert.equal(notificationCount, notificationsBeforeEdge + 1);
  assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
});

void test("pattern-room phase 7B restores legacy snapshots with missing authored fields", () => {
  const snapshot = createSnapshot(createSnapshotReadyLocalState(), "archive");
  const overlay = { ...snapshot.overlay } as Record<string, unknown>;
  delete overlay["localAuthoredNodes"];
  delete overlay["localAuthoredSources"];
  delete overlay["localAuthoredEvidence"];
  delete overlay["localAuthoredEdges"];

  const restored = restoreFromSnapshot({ ...snapshot, overlay }, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  assert.ok(restored);
  assert.deepEqual(restored.overlay.localAuthoredNodes, []);
  assert.deepEqual(restored.overlay.localAuthoredSources, []);
  assert.deepEqual(restored.overlay.localAuthoredEvidence, []);
  assert.deepEqual(restored.overlay.localAuthoredEdges, []);
});

void test("pattern-room phase 7B silently skips invalid restored authored entries", () => {
  const snapshot = createSnapshot(createSnapshotReadyLocalState(), "board");
  const pollutedSnapshot = {
    ...snapshot,
    overlay: {
      ...snapshot.overlay,
      localAuthoredNodes: [
        {
          id: "local-node-001",
          nodeType: "claim",
          label: "Valid local claim",
          content: "Valid local content",
          createdAt: "2026-05-20T12:00:00.000Z",
        },
        {
          id: "node-bad",
          nodeType: "claim",
          label: "Invalid id",
          content: "Should be skipped",
          createdAt: "2026-05-20T12:00:00.000Z",
        },
        {
          id: "local-node-002",
          nodeType: "claim",
          label: " ",
          content: "Empty label should be skipped",
          createdAt: "2026-05-20T12:00:00.000Z",
        },
      ],
      localAuthoredSources: [
        {
          id: "local-source-001",
          label: "Valid local source",
          origin: "Local notebook",
          note: "",
          createdAt: "2026-05-20T12:00:00.000Z",
        },
        {
          id: "local-source-x",
          label: "Invalid local source",
          origin: "Local notebook",
          note: "",
          createdAt: "2026-05-20T12:00:00.000Z",
        },
      ],
      localAuthoredEvidence: [
        {
          id: "local-evidence-001",
          label: "Valid local evidence",
          excerpt: "Valid excerpt",
          interpretation: null,
          layer: "evidence",
          createdAt: "2026-05-20T12:00:00.000Z",
        },
        {
          id: "local-evidence-002",
          label: "Invalid local evidence",
          excerpt: "",
          interpretation: null,
          layer: "evidence",
          createdAt: "2026-05-20T12:00:00.000Z",
        },
      ],
      localAuthoredEdges: [
        {
          id: "local-edge-001",
          edgeType: "supports",
          sourceId: "local-node-001",
          targetId: "local-source-001",
          note: null,
          createdAt: "2026-05-20T12:00:00.000Z",
        },
        {
          id: "edge-002",
          edgeType: "supports",
          sourceId: "local-node-001",
          targetId: "local-source-001",
          note: null,
          createdAt: "2026-05-20T12:00:00.000Z",
        },
        {
          id: "local-edge-003",
          edgeType: "not-valid",
          sourceId: "local-node-001",
          targetId: "local-source-001",
          note: null,
          createdAt: "2026-05-20T12:00:00.000Z",
        },
        {
          id: "local-edge-004",
          edgeType: "supports",
          sourceId: "local-node-001",
          targetId: "local-node-001",
          note: null,
          createdAt: "2026-05-20T12:00:00.000Z",
        },
        {
          id: "local-edge-005",
          edgeType: "supports",
          sourceId: "local-node-001",
          targetId: "missing-target",
          note: null,
          createdAt: "2026-05-20T12:00:00.000Z",
        },
      ],
      debateReferenceIds: [
        "local-node-001",
        "local-source-001",
        "local-evidence-001",
        "local-node-002",
        "local-evidence-002",
      ],
    },
  };

  const restored = restoreFromSnapshot(pollutedSnapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  assert.ok(restored);
  assert.deepEqual(
    restored.overlay.localAuthoredNodes.map((node) => node.id),
    ["local-node-001"]
  );
  assert.deepEqual(
    restored.overlay.localAuthoredSources.map((source) => source.id),
    ["local-source-001"]
  );
  assert.deepEqual(
    restored.overlay.localAuthoredEvidence.map((evidence) => evidence.id),
    ["local-evidence-001"]
  );
  assert.deepEqual(
    restored.overlay.localAuthoredEdges.map((edge) => edge.id),
    ["local-edge-001"]
  );
  assert.deepEqual(restored.overlay.debateReferenceIds, [
    "local-node-001",
    "local-source-001",
    "local-evidence-001",
  ]);
});

void test("pattern-room phase 6B rejects incompatible snapshot schema or topic", () => {
  const snapshot = createSnapshot(createSnapshotReadyLocalState(), "archive");
  const wrongSchemaSnapshot = {
    ...snapshot,
    schemaVersion: 2,
  } as unknown as PatternRoomSessionSnapshot;
  const wrongTopicSnapshot: PatternRoomSessionSnapshot = {
    ...snapshot,
    topicId: "topic-other",
  };

  assert.equal(restoreFromSnapshot(wrongSchemaSnapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE), null);
  assert.equal(restoreFromSnapshot(wrongTopicSnapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE), null);
});

void test("pattern-room phase 6B rejects malformed runtime snapshot input", () => {
  const snapshot = createSnapshot(createSnapshotReadyLocalState(), "archive");
  const firstTurn = snapshot.overlay.debateLocalTurns[0];
  assert.ok(firstTurn);
  const malformedSnapshots: unknown[] = [
    null,
    {},
    [],
    { ...snapshot, activeView: "missing-view" },
    { ...snapshot, overlay: { ...snapshot.overlay, deskNodeIds: [42] } },
    { ...snapshot, overlay: { ...snapshot.overlay, debatePhase: "future-phase" } },
    {
      ...snapshot,
      overlay: {
        ...snapshot.overlay,
        debateLocalTurns: [{ ...firstTurn, turnIndex: "0" }],
      },
    },
    { ...snapshot, guards: { ...snapshot.guards, noteIndex: Number.NaN } },
  ];

  malformedSnapshots.forEach((malformedSnapshot) => {
    assert.equal(restoreFromSnapshot(malformedSnapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE), null);
  });
});

void test("pattern-room phase 6B defensively filters stale snapshot ids without mutating domain mock", () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const snapshot = createSnapshot(createSnapshotReadyLocalState(), "tenth-man");
  const firstTurn = snapshot.overlay.debateLocalTurns[0];
  assert.ok(firstTurn);

  const pollutedSnapshot: PatternRoomSessionSnapshot = {
    ...snapshot,
    overlay: {
      ...snapshot.overlay,
      deskNodeIds: ["node-navigation-source", "missing-node", "node-navigation-source"],
      pinnedSourceIds: ["source-shadow-comparison", "missing-source"],
      sourcePinnedLayerById: {
        "source-shadow-comparison": "uncertainty",
        "missing-source": "analysis",
      },
      debateReferenceIds: ["node-shadow-analysis", "missing-reference", "source-shadow-comparison"],
      debateLocalTurns: [
        {
          ...firstTurn,
          referencedIds: ["node-shadow-analysis", "missing-reference", "source-shadow-comparison"],
        },
      ],
    },
    guards: {
      debateReportReflected: true,
      noteIndex: 0,
    },
  };
  const restored = restoreFromSnapshot(pollutedSnapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  assert.ok(restored);
  assert.deepEqual(restored.overlay.deskNodeIds, ["node-navigation-source"]);
  assert.deepEqual(restored.overlay.pinnedSourceIds, ["source-shadow-comparison"]);
  assert.deepEqual(restored.overlay.sourcePinnedLayerById, {
    "source-shadow-comparison": "uncertainty",
  });
  assert.deepEqual(restored.overlay.debateReferenceIds, [
    "node-shadow-analysis",
    "source-shadow-comparison",
  ]);
  assert.equal(restored.overlay.debatePhase, "completed");
  assert.deepEqual(restored.overlay.debateLocalTurns[0]?.referencedIds, [
    "node-shadow-analysis",
    "source-shadow-comparison",
  ]);
  assert.equal(
    ["AI0", "AI1", "AI2", "US1"].every((roleId) => {
      return restored.overlay.debateRolesConnected[roleId] === true;
    }),
    true
  );
  assert.equal(restored.guards.noteIndex, restored.overlay.localNotes.length);
  assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
});

void test("pattern-room phase 6B self-heals advanced debate phase with no turns", () => {
  const snapshot = createSnapshot(createSnapshotReadyLocalState(), "tenth-man");
  const inconsistentSnapshot: PatternRoomSessionSnapshot = {
    ...snapshot,
    overlay: {
      ...snapshot.overlay,
      debatePhase: "judge_mapping",
      debateLocalTurns: [],
      debateRolesConnected: {
        AI0: true,
        AI1: true,
        AI2: true,
        US1: true,
      },
      debateLocalVerdict: "stale local verdict",
    },
    guards: {
      debateReportReflected: false,
      noteIndex: 0,
    },
  };
  const restored = restoreFromSnapshot(inconsistentSnapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  assert.ok(restored);
  assert.equal(restored.overlay.debatePhase, "preparation");
  assert.deepEqual(restored.overlay.debateRolesConnected, {
    AI0: false,
    AI1: false,
    AI2: false,
    US1: false,
  });
  assert.equal(restored.overlay.debateLocalVerdict, null);
  assert.equal(restored.guards.noteIndex, restored.overlay.localNotes.length);
});

void test("pattern-room phase 6B snapshot and UI layer stay free of storage and IPC wiring", async () => {
  const sourcePaths = [
    "rooms/pattern-room/shared/types/pattern-room-snapshot.ts",
    "rooms/pattern-room/shared/state/pattern-room-snapshot.ts",
    "rooms/pattern-room/shared/state/pattern-room-local-state.ts",
    "rooms/pattern-room/shared/adapters/pattern-room-view-adapters.ts",
    "rooms/pattern-room/ui/pattern-room-ui-runtime.ts",
    "rooms/pattern-room/ui/panels/pattern-board-panel.ts",
    "rooms/pattern-room/ui/panels/pattern-archive-panel.ts",
  ];
  const forbiddenRuntimeApis = [
    "localStorage",
    "sessionStorage",
    "IndexedDB",
    "indexedDB",
    "ipcRenderer",
    "ipcMain",
    "fetch(",
    "XMLHttpRequest",
    "WebSocket",
    "better-sqlite3",
  ];

  const sourceContents = await Promise.all(
    sourcePaths.map(async (sourcePath) => {
      const source = await readFile(resolve(sourcePath), "utf8");
      return { sourcePath, source };
    })
  );
  for (const { sourcePath, source } of sourceContents) {
    forbiddenRuntimeApis.forEach((runtimeApi) => {
      assert.equal(source.includes(runtimeApi), false, `${sourcePath} includes ${runtimeApi}`);
    });
  }

  const activation = createPatternRoomHostRuntime().activate({});
  assert.deepEqual(Object.keys(activation.commands).sort(), [
    PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND,
    PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND,
    PATTERN_ROOM_LOAD_COMMAND,
    PATTERN_ROOM_SAVE_COMMAND,
  ]);
});
