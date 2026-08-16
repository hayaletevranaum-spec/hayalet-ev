import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PATTERN_ROOM_DOMAIN_TEST_FIXTURE } from "../../rooms/pattern-room/shared/data/testing/pattern-room-domain.fixture.ts";
import {
  createLocalState,
  type CleanupSummary,
  type DebateLocalTurn,
} from "../../rooms/pattern-room/shared/state/pattern-room-local-state.ts";
import {
  createSnapshot,
  restoreFromSnapshot,
} from "../../rooms/pattern-room/shared/state/pattern-room-snapshot.ts";
import { PATTERN_ROOM_SNAPSHOT_VERSION } from "../../rooms/pattern-room/shared/types/pattern-room-snapshot.ts";

function createCleanupSummary(overrides: Partial<CleanupSummary> = {}): CleanupSummary {
  return {
    sourcesRemoved: 0,
    evidenceRemoved: 0,
    nodesRemoved: 0,
    edgesRemoved: 0,
    notesRemoved: 0,
    pinsRemoved: 0,
    refsRemoved: 0,
    turnRefsRemoved: 0,
    batchesRemoved: 0,
    resetPerformed: false,
    warnings: [],
    ...overrides,
  };
}

function createPopulatedLocalState(): ReturnType<typeof createLocalState> {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  localState.sendToDesk("node-navigation-source");
  localState.pinSource("source-shadow-comparison", "analysis");
  localState.addAuthoredClaim("Local cleanup claim", "Local cleanup claim content.");
  localState.addAuthoredSource("Local cleanup source", "Local notebook", "Source note.");
  localState.addAuthoredEvidence("Local cleanup evidence", "Local cleanup excerpt.");
  localState.addAuthoredEdge("supports", "local-source-001", "local-node-001", "Cleanup edge.");
  localState.addLocalNote("Cleanup note.");
  localState.addToDebate("local-source-001");
  localState.prepareDebate();
  localState.assignDebateRoles();
  localState.startDebate();

  return localState;
}

function createReferencedTurn(referencedIds: readonly string[]): DebateLocalTurn {
  return {
    id: "turn-local-cleanup-001",
    actorId: "AI0",
    role: "researcher",
    content: "Local cleanup turn.",
    stance: "neutral",
    phaseKey: "opening",
    turnIndex: 0,
    referencedIds,
  };
}

void test("pattern-room phase 12F-A resetOverlayToEmpty clears local overlay without mutating domain mock", () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const localState = createPopulatedLocalState();
  let notificationCount = 0;
  const unsubscribe = localState.subscribe(() => {
    notificationCount += 1;
  });

  const summary = localState.resetOverlayToEmpty();
  unsubscribe();

  assert.deepEqual(summary, {
    sourcesRemoved: 1,
    evidenceRemoved: 1,
    nodesRemoved: 1,
    edgesRemoved: 1,
    notesRemoved: 1,
    pinsRemoved: 1,
    refsRemoved: 1,
    turnRefsRemoved: 0,
    batchesRemoved: 0,
    resetPerformed: true,
    warnings: [],
  });
  assert.equal(notificationCount, 1);
  assert.deepEqual(localState.getOverlay(), {
    deskNodeIds: [],
    pinnedSourceIds: [],
    sourcePinnedLayerById: {},
    debateReferenceIds: [],
    debatePhase: "idle",
    debateLocalTurns: [],
    debateRolesConnected: {
      AI0: false,
      AI1: false,
      AI2: false,
      US1: false,
    },
    debateLocalVerdict: null,
    localNotes: [],
    localAuthoredNodes: [],
    localAuthoredSources: [],
    localAuthoredEvidence: [],
    localEvidenceCandidates: [],
    localAuthoredEdges: [],
  });
  assert.deepEqual(localState.getGuards(), {
    debateReportReflected: false,
    noteIndex: 0,
  });
  assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
});

void test("pattern-room phase 12F-A removeLocalSource deletes only local source references", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addAuthoredSource("Removable source", "Local notebook", "");
  localState.addAuthoredClaim("Linked claim", "Linked claim content.");
  localState.addAuthoredEdge("references", "local-source-001", "local-node-001");
  localState.addToDebate("local-source-001");
  localState.restoreOverlay(
    {
      ...localState.getOverlay(),
      pinnedSourceIds: ["local-source-001"],
      sourcePinnedLayerById: {
        "local-source-001": "analysis",
      },
    },
    localState.getGuards()
  );
  let notificationCount = 0;
  const unsubscribe = localState.subscribe(() => {
    notificationCount += 1;
  });

  const summary = localState.removeLocalSource("local-source-001");
  unsubscribe();

  assert.deepEqual(
    summary,
    createCleanupSummary({
      sourcesRemoved: 1,
      edgesRemoved: 1,
      pinsRemoved: 1,
      refsRemoved: 1,
    })
  );
  assert.equal(notificationCount, 1);
  assert.equal(localState.resolveEntityExists("local-source-001"), false);
  assert.equal(localState.resolveEntityExists("local-node-001"), true);
  assert.deepEqual(localState.getOverlay().localAuthoredSources, []);
  assert.deepEqual(localState.getOverlay().localAuthoredEdges, []);
  assert.deepEqual(localState.getOverlay().pinnedSourceIds, []);
  assert.deepEqual(localState.getOverlay().sourcePinnedLayerById, {});
  assert.deepEqual(localState.getOverlay().debateReferenceIds, []);
});

void test("pattern-room phase 13F removeLocalSource deletes source-linked local evidence", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addAuthoredSource("Removable source", "Local notebook", "Source note.");
  localState.addAuthoredEvidence(
    "Linked evidence",
    "Linked evidence excerpt.",
    "Linked evidence context.",
    "evidence",
    {
      sourceId: "local-source-001",
      sourceLabel: "Removable source",
    }
  );
  localState.addAuthoredClaim("Surviving claim", "Surviving claim content.");
  localState.addAuthoredEdge("supports", "local-evidence-001", "local-node-001");
  localState.addToDebate("local-source-001");
  localState.addToDebate("local-evidence-001");
  localState.restoreOverlay(
    {
      ...localState.getOverlay(),
      debateLocalTurns: [
        createReferencedTurn(["local-source-001", "local-evidence-001", "local-node-001"]),
      ],
    },
    localState.getGuards()
  );

  const summary = localState.removeLocalSource("local-source-001");

  assert.deepEqual(
    summary,
    createCleanupSummary({
      sourcesRemoved: 1,
      evidenceRemoved: 1,
      edgesRemoved: 1,
      refsRemoved: 2,
      turnRefsRemoved: 2,
    })
  );
  assert.equal(localState.resolveEntityExists("local-source-001"), false);
  assert.equal(localState.resolveEntityExists("local-evidence-001"), false);
  assert.equal(localState.resolveEntityExists("local-node-001"), true);
  assert.deepEqual(localState.getOverlay().localAuthoredSources, []);
  assert.deepEqual(localState.getOverlay().localAuthoredEvidence, []);
  assert.deepEqual(localState.getOverlay().localAuthoredEdges, []);
  assert.deepEqual(localState.getOverlay().debateReferenceIds, []);
  assert.deepEqual(localState.getOverlay().debateLocalTurns[0]?.referencedIds, ["local-node-001"]);
});

void test("pattern-room phase 12F-B removeLocalNode deletes local node references and edges", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addAuthoredClaim("Removable node", "Removable node content.");
  localState.addAuthoredEvidence("Linked evidence", "Linked evidence excerpt.");
  localState.addAuthoredEdge("supports", "local-node-001", "local-evidence-001");
  localState.addToDebate("local-node-001");
  localState.restoreOverlay(
    {
      ...localState.getOverlay(),
      deskNodeIds: ["node-navigation-source", "local-node-001"],
      debateLocalTurns: [
        createReferencedTurn(["local-node-001", "local-evidence-001", "node-shadow-analysis"]),
      ],
    },
    localState.getGuards()
  );
  let notificationCount = 0;
  const unsubscribe = localState.subscribe(() => {
    notificationCount += 1;
  });

  const summary = localState.removeLocalNode("local-node-001");
  unsubscribe();

  assert.deepEqual(
    summary,
    createCleanupSummary({
      nodesRemoved: 1,
      edgesRemoved: 1,
      refsRemoved: 1,
      turnRefsRemoved: 1,
    })
  );
  assert.equal(notificationCount, 1);
  assert.equal(localState.resolveEntityExists("local-node-001"), false);
  assert.equal(localState.resolveEntityExists("local-evidence-001"), true);
  assert.deepEqual(localState.getOverlay().deskNodeIds, ["node-navigation-source"]);
  assert.deepEqual(localState.getOverlay().debateReferenceIds, []);
  assert.deepEqual(localState.getOverlay().debateLocalTurns[0]?.referencedIds, [
    "local-evidence-001",
    "node-shadow-analysis",
  ]);
  assert.deepEqual(localState.getOverlay().localAuthoredEdges, []);
});

void test("pattern-room phase 12F-B removeLocalNode leaves domain node ids as safe no-ops", () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.sendToDesk("node-navigation-source");
  const beforeOverlay = localState.getOverlay();
  let notificationCount = 0;
  const unsubscribe = localState.subscribe(() => {
    notificationCount += 1;
  });

  assert.deepEqual(localState.removeLocalNode("node-navigation-source"), createCleanupSummary());
  unsubscribe();

  assert.equal(notificationCount, 0);
  assert.deepEqual(localState.getOverlay(), beforeOverlay);
  assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
});

void test("pattern-room phase 12F-B removeLocalEvidence deletes local evidence references and edges", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addAuthoredClaim("Linked node", "Linked node content.");
  localState.addAuthoredEvidence("Removable evidence", "Removable evidence excerpt.");
  localState.addAuthoredEdge("supports", "local-node-001", "local-evidence-001");
  localState.addToDebate("local-evidence-001");
  localState.restoreOverlay(
    {
      ...localState.getOverlay(),
      debateLocalTurns: [createReferencedTurn(["local-evidence-001", "local-node-001"])],
    },
    localState.getGuards()
  );
  let notificationCount = 0;
  const unsubscribe = localState.subscribe(() => {
    notificationCount += 1;
  });

  const summary = localState.removeLocalEvidence("local-evidence-001");
  unsubscribe();

  assert.deepEqual(
    summary,
    createCleanupSummary({
      evidenceRemoved: 1,
      edgesRemoved: 1,
      refsRemoved: 1,
      turnRefsRemoved: 1,
    })
  );
  assert.equal(notificationCount, 1);
  assert.equal(localState.resolveEntityExists("local-evidence-001"), false);
  assert.equal(localState.resolveEntityExists("local-node-001"), true);
  assert.deepEqual(localState.getOverlay().debateReferenceIds, []);
  assert.deepEqual(localState.getOverlay().debateLocalTurns[0]?.referencedIds, ["local-node-001"]);
  assert.deepEqual(localState.getOverlay().localAuthoredEdges, []);
});

void test("pattern-room phase 12F-A removeLocalSource leaves domain source ids as safe no-ops", () => {
  const beforeDomain = JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.pinSource("source-shadow-comparison", "analysis");
  const beforeOverlay = localState.getOverlay();
  let notificationCount = 0;
  const unsubscribe = localState.subscribe(() => {
    notificationCount += 1;
  });

  assert.deepEqual(
    localState.removeLocalSource("source-shadow-comparison"),
    createCleanupSummary()
  );
  unsubscribe();

  assert.equal(notificationCount, 0);
  assert.deepEqual(localState.getOverlay(), beforeOverlay);
  assert.equal(JSON.stringify(PATTERN_ROOM_DOMAIN_TEST_FIXTURE), beforeDomain);
});

void test("pattern-room phase 12F-A removeLocalSource sweeps orphan local edges", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addAuthoredSource("Removable source", "Local notebook", "");
  localState.addAuthoredClaim("Linked claim", "Linked claim content.");
  localState.addAuthoredEvidence("Surviving evidence", "Surviving excerpt.");
  localState.addAuthoredEdge("references", "local-source-001", "local-node-001");
  localState.addAuthoredEdge("supports", "local-node-001", "local-evidence-001");
  const overlay = localState.getOverlay();
  localState.restoreOverlay(
    {
      ...overlay,
      localAuthoredEdges: [
        ...overlay.localAuthoredEdges,
        {
          id: "local-edge-099",
          edgeType: "supports",
          sourceId: "local-node-001",
          targetId: "missing-entity",
          note: null,
          createdAt: overlay.localAuthoredEdges[0]?.createdAt ?? "2026-05-21T00:00:00.000Z",
        },
      ],
    },
    localState.getGuards()
  );

  const summary = localState.removeLocalSource("local-source-001");

  assert.deepEqual(
    summary,
    createCleanupSummary({
      sourcesRemoved: 1,
      edgesRemoved: 2,
    })
  );
  assert.deepEqual(
    localState.getOverlay().localAuthoredEdges.map((edge) => edge.id),
    ["local-edge-002"]
  );
});

void test("pattern-room phase 12F-A removeLocalEdge is a leaf delete", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addAuthoredClaim("Linked claim", "Linked claim content.");
  localState.addAuthoredEvidence("Linked evidence", "Linked excerpt.");
  localState.addAuthoredEdge("supports", "local-node-001", "local-evidence-001");
  let notificationCount = 0;
  const unsubscribe = localState.subscribe(() => {
    notificationCount += 1;
  });

  assert.deepEqual(
    localState.removeLocalEdge("local-edge-001"),
    createCleanupSummary({ edgesRemoved: 1 })
  );
  assert.deepEqual(localState.removeLocalEdge("missing-edge"), createCleanupSummary());
  unsubscribe();

  assert.equal(notificationCount, 1);
  assert.deepEqual(localState.getOverlay().localAuthoredEdges, []);
  assert.equal(localState.resolveEntityExists("local-node-001"), true);
  assert.equal(localState.resolveEntityExists("local-evidence-001"), true);
});

void test("pattern-room phase 12F-B removeImportBatch removes only matching batch and cascades references", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.restoreOverlay(
    {
      ...localState.getOverlay(),
      deskNodeIds: ["node-navigation-source", "local-node-001", "local-node-002", "local-node-003"],
      pinnedSourceIds: ["source-shadow-comparison", "local-source-001", "local-source-002"],
      sourcePinnedLayerById: {
        "source-shadow-comparison": "analysis",
        "local-source-001": "evidence",
        "local-source-002": "uncertainty",
      },
      debateReferenceIds: [
        "source-shadow-comparison",
        "local-source-001",
        "local-node-001",
        "local-evidence-001",
        "local-source-002",
        "local-node-003",
      ],
      debateLocalTurns: [
        createReferencedTurn([
          "local-source-001",
          "local-node-001",
          "local-evidence-001",
          "local-source-002",
          "local-node-003",
        ]),
      ],
      localNotes: [
        {
          id: "local-note-001",
          text: "Batch A note.",
          createdAt: "2026-05-21T00:00:00.000Z",
          importBatchId: "batch-a",
        },
        {
          id: "local-note-002",
          text: "Batch B note.",
          createdAt: "2026-05-21T00:00:00.000Z",
          importBatchId: "batch-b",
        },
        {
          id: "local-note-003",
          text: "Manual note.",
          createdAt: "2026-05-21T00:00:00.000Z",
        },
      ],
      localAuthoredSources: [
        {
          id: "local-source-001",
          label: "Batch A source",
          origin: "manual:batch-a",
          note: "",
          createdAt: "2026-05-21T00:00:00.000Z",
          importBatchId: "batch-a",
        },
        {
          id: "local-source-002",
          label: "Batch B source",
          origin: "manual:batch-b",
          note: "",
          createdAt: "2026-05-21T00:00:00.000Z",
          importBatchId: "batch-b",
        },
      ],
      localAuthoredNodes: [
        {
          id: "local-node-001",
          nodeType: "claim",
          label: "Batch A node",
          content: "Batch A node content.",
          createdAt: "2026-05-21T00:00:00.000Z",
          importBatchId: "batch-a",
        },
        {
          id: "local-node-002",
          nodeType: "claim",
          label: "Batch B node",
          content: "Batch B node content.",
          createdAt: "2026-05-21T00:00:00.000Z",
          importBatchId: "batch-b",
        },
        {
          id: "local-node-003",
          nodeType: "claim",
          label: "Manual node",
          content: "Manual node content.",
          createdAt: "2026-05-21T00:00:00.000Z",
        },
      ],
      localAuthoredEvidence: [
        {
          id: "local-evidence-001",
          label: "Batch A evidence",
          excerpt: "Batch A evidence excerpt.",
          interpretation: null,
          layer: "evidence",
          createdAt: "2026-05-21T00:00:00.000Z",
          importBatchId: "batch-a",
        },
        {
          id: "local-evidence-002",
          label: "Batch B evidence",
          excerpt: "Batch B evidence excerpt.",
          interpretation: null,
          layer: "evidence",
          createdAt: "2026-05-21T00:00:00.000Z",
          importBatchId: "batch-b",
        },
        {
          id: "local-evidence-003",
          label: "Manual evidence",
          excerpt: "Manual evidence excerpt.",
          interpretation: null,
          layer: "evidence",
          createdAt: "2026-05-21T00:00:00.000Z",
        },
      ],
      localAuthoredEdges: [
        {
          id: "local-edge-001",
          edgeType: "supports",
          sourceId: "local-source-001",
          targetId: "local-node-001",
          note: null,
          createdAt: "2026-05-21T00:00:00.000Z",
          importBatchId: "batch-a",
        },
        {
          id: "local-edge-002",
          edgeType: "supports",
          sourceId: "local-node-002",
          targetId: "local-evidence-002",
          note: null,
          createdAt: "2026-05-21T00:00:00.000Z",
          importBatchId: "batch-b",
        },
        {
          id: "local-edge-003",
          edgeType: "references",
          sourceId: "local-source-001",
          targetId: "local-node-003",
          note: null,
          createdAt: "2026-05-21T00:00:00.000Z",
        },
        {
          id: "local-edge-004",
          edgeType: "references",
          sourceId: "local-node-003",
          targetId: "local-evidence-003",
          note: null,
          createdAt: "2026-05-21T00:00:00.000Z",
        },
      ],
    },
    {
      debateReportReflected: false,
      noteIndex: 3,
    }
  );
  let notificationCount = 0;
  const unsubscribe = localState.subscribe(() => {
    notificationCount += 1;
  });

  const summary = localState.removeImportBatch("batch-a");
  unsubscribe();

  assert.deepEqual(
    summary,
    createCleanupSummary({
      sourcesRemoved: 1,
      evidenceRemoved: 1,
      nodesRemoved: 1,
      edgesRemoved: 2,
      notesRemoved: 1,
      pinsRemoved: 1,
      refsRemoved: 3,
      turnRefsRemoved: 3,
      batchesRemoved: 1,
    })
  );
  assert.equal(notificationCount, 1);
  assert.deepEqual(
    localState.getOverlay().localAuthoredSources.map((source) => source.id),
    ["local-source-002"]
  );
  assert.deepEqual(
    localState.getOverlay().localAuthoredNodes.map((node) => node.id),
    ["local-node-002", "local-node-003"]
  );
  assert.deepEqual(
    localState.getOverlay().localAuthoredEvidence.map((evidence) => evidence.id),
    ["local-evidence-002", "local-evidence-003"]
  );
  assert.deepEqual(
    localState.getOverlay().localAuthoredEdges.map((edge) => edge.id),
    ["local-edge-002", "local-edge-004"]
  );
  assert.deepEqual(
    localState.getOverlay().localNotes.map((note) => note.id),
    ["local-note-002", "local-note-003"]
  );
  assert.deepEqual(localState.getOverlay().deskNodeIds, [
    "node-navigation-source",
    "local-node-002",
    "local-node-003",
  ]);
  assert.deepEqual(localState.getOverlay().pinnedSourceIds, [
    "source-shadow-comparison",
    "local-source-002",
  ]);
  assert.deepEqual(localState.getOverlay().sourcePinnedLayerById, {
    "source-shadow-comparison": "analysis",
    "local-source-002": "uncertainty",
  });
  assert.deepEqual(localState.getOverlay().debateReferenceIds, [
    "source-shadow-comparison",
    "local-source-002",
    "local-node-003",
  ]);
  assert.deepEqual(localState.getOverlay().debateLocalTurns[0]?.referencedIds, [
    "local-source-002",
    "local-node-003",
  ]);
});

void test("pattern-room phase 12F-B removeImportBatch missing ids are safe no-ops", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addAuthoredClaim("Manual node", "Manual node content.");
  const beforeOverlay = localState.getOverlay();
  let notificationCount = 0;
  const unsubscribe = localState.subscribe(() => {
    notificationCount += 1;
  });

  assert.doesNotThrow(() => {
    assert.deepEqual(localState.removeImportBatch(""), createCleanupSummary());
    assert.deepEqual(localState.removeImportBatch("missing-batch"), createCleanupSummary());
  });
  unsubscribe();

  assert.equal(notificationCount, 0);
  assert.deepEqual(localState.getOverlay(), beforeOverlay);
});

void test("pattern-room phase 12F-A removeLocalNote is a leaf delete", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addLocalNote("Cleanup note.");
  let notificationCount = 0;
  const unsubscribe = localState.subscribe(() => {
    notificationCount += 1;
  });

  assert.deepEqual(
    localState.removeLocalNote("local-note-001"),
    createCleanupSummary({ notesRemoved: 1 })
  );
  assert.deepEqual(localState.removeLocalNote("missing-note"), createCleanupSummary());
  unsubscribe();

  assert.equal(notificationCount, 1);
  assert.deepEqual(localState.getOverlay().localNotes, []);
});

void test("pattern-room phase 12F-A missing cleanup ids do not throw or notify", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  let notificationCount = 0;
  const unsubscribe = localState.subscribe(() => {
    notificationCount += 1;
  });

  assert.doesNotThrow(() => {
    assert.deepEqual(localState.removeLocalSource("missing-source"), createCleanupSummary());
    assert.deepEqual(localState.removeLocalNode("missing-node"), createCleanupSummary());
    assert.deepEqual(localState.removeLocalEvidence("missing-evidence"), createCleanupSummary());
    assert.deepEqual(localState.removeLocalEdge("missing-edge"), createCleanupSummary());
    assert.deepEqual(localState.removeLocalNote("missing-note"), createCleanupSummary());
    assert.deepEqual(localState.removeImportBatch("missing-batch"), createCleanupSummary());
  });
  unsubscribe();

  assert.equal(notificationCount, 0);
});

void test("pattern-room phase 12F-A reset snapshots round-trip with stable schema version", () => {
  const localState = createPopulatedLocalState();
  localState.resetOverlayToEmpty();

  const snapshot = createSnapshot(localState, "board");
  const restored = restoreFromSnapshot(snapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  assert.ok(restored);

  assert.equal(snapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
  assert.equal(PATTERN_ROOM_SNAPSHOT_VERSION, 1);
  assert.deepEqual(restored.overlay, localState.getOverlay());
  assert.deepEqual(restored.guards, localState.getGuards());
  assert.equal(restored.activeView, "board");
});

void test("pattern-room phase 12G-A removed local sources stay removed after snapshot round-trip", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addAuthoredSource("Round-trip source", "Local notebook", "Deleted before save.");
  localState.addAuthoredClaim("Round-trip claim", "Round-trip claim content.");
  localState.addAuthoredEdge("references", "local-source-001", "local-node-001");
  localState.removeLocalSource("local-source-001");

  const snapshot = createSnapshot(localState, "archive");
  const restored = restoreFromSnapshot(snapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  assert.ok(restored);
  assert.equal(snapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
  assert.deepEqual(restored.overlay.localAuthoredSources, []);
  assert.deepEqual(restored.overlay.localAuthoredEdges, []);
});

void test("pattern-room phase 12G-C cleanup helpers stay scoped to approved UI actions", async () => {
  const localStateOnlyHelperNames = ["removeLocalEdge", "removeLocalNote", "removeImportBatch"];
  const integrationPaths = [
    "rooms/pattern-room/manifest.json",
    "rooms/pattern-room/host/runtime.ts",
    "rooms/pattern-room/ui/pattern-room-ui-runtime.ts",
    "rooms/pattern-room/ui/panels/pattern-archive-panel.ts",
    "rooms/pattern-room/ui/panels/pattern-board-panel.ts",
    "rooms/pattern-room/ui/panels/pattern-investigation-inspector.ts",
    "rooms/pattern-room/ui/panels/pattern-report-panel.ts",
  ];

  const integrationSources = await Promise.all(
    integrationPaths.map(async (sourcePath) => {
      const source = await readFile(resolve(sourcePath), "utf8");
      return { sourcePath, source };
    })
  );
  for (const { sourcePath, source } of integrationSources) {
    localStateOnlyHelperNames.forEach((helperName) => {
      assert.equal(source.includes(helperName), false, `${sourcePath} wires ${helperName}`);
    });
  }

  const uiRuntimeSource = await readFile(
    resolve("rooms/pattern-room/ui/pattern-room-ui-runtime.ts"),
    "utf8"
  );
  const archivePanelSource = await readFile(
    resolve("rooms/pattern-room/ui/panels/pattern-archive-panel.ts"),
    "utf8"
  );
  const investigationInspectorSource = await readFile(
    resolve("rooms/pattern-room/ui/panels/pattern-investigation-inspector.ts"),
    "utf8"
  );
  const hostRuntimeSource = await readFile(resolve("rooms/pattern-room/host/runtime.ts"), "utf8");

  assert.equal(uiRuntimeSource.includes("removeLocalSource(sourceId"), true);
  assert.equal(uiRuntimeSource.includes("removeLocalNode(nodeId"), true);
  assert.equal(uiRuntimeSource.includes("removeLocalEvidence(evidenceId"), true);
  assert.equal(uiRuntimeSource.includes("resetLocalSession(): void"), true);
  assert.equal(uiRuntimeSource.includes("localState.resetOverlayToEmpty();"), true);
  assert.equal(archivePanelSource.includes("patternRemoveLocalSource"), true);
  assert.equal(archivePanelSource.includes("patternResetLocalSession"), true);
  assert.equal(investigationInspectorSource.includes("patternRemoveBoardItem"), true);
  assert.equal(hostRuntimeSource.includes("removeLocalSource"), false);
  assert.equal(hostRuntimeSource.includes("removeLocalNode"), false);
  assert.equal(hostRuntimeSource.includes("removeLocalEvidence"), false);
  assert.equal(hostRuntimeSource.includes("resetOverlayToEmpty"), false);

  const localStateSource = await readFile(
    resolve("rooms/pattern-room/shared/state/pattern-room-local-state.ts"),
    "utf8"
  );
  const forbiddenRuntimePatterns = [
    "ipcRenderer",
    "ipcMain",
    "roomAPI",
    "registerCommand",
    "notifyRoom",
    "document.",
    "window.",
    "fetch(",
  ];

  forbiddenRuntimePatterns.forEach((pattern) => {
    assert.equal(localStateSource.includes(pattern), false, pattern);
  });
});
