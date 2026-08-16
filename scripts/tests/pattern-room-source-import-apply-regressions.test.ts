import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
  createUserTextProducer,
  produceAndImportSource,
} from "../../rooms/pattern-room/shared/source-producers/index.ts";
import type { SourceImportResult } from "../../rooms/pattern-room/shared/source-workbench/index.ts";

function createSourceImportResult(
  partial: Partial<Omit<SourceImportResult, "stats">> = {}
): SourceImportResult {
  const result = {
    sources: [],
    evidence: [],
    nodes: [],
    edges: [],
    notes: [],
    warnings: [],
    ...partial,
  } satisfies Omit<SourceImportResult, "stats">;

  return {
    ...result,
    stats: {
      sourcesCreated: result.sources.length,
      evidenceCreated: result.evidence.length,
      nodesCreated: result.nodes.length,
      edgesCreated: result.edges.length,
      notesCreated: result.notes.length,
      duplicatesSkipped: 0,
      itemsDropped: 0,
    },
  };
}

function createRichImportResult(): SourceImportResult {
  return createSourceImportResult({
    sources: [
      {
        draftId: "import-source-abc",
        label: "Imported notebook",
        origin: "manual:imported-notebook",
        note: "Imported source note.",
        sourceKind: "user_text",
        patternSourceType: "personal_note",
      },
    ],
    evidence: [
      {
        draftId: "import-evidence-q1",
        label: "Imported quote",
        excerpt: "The imported quote text.",
        interpretation: "A cautious reading of the quote.",
        layer: "evidence",
        sourceQuoteId: "quote-1",
        sourceItemId: "source-item-1",
        page: "42",
        timecode: "00:12:43",
        speaker: "Speaker X",
        context: "Local source context.",
      },
    ],
    nodes: [
      {
        draftId: "import-node-motif-m1",
        nodeType: "inspiration",
        label: "Imported motif",
        content: "Imported motif content.",
        originKind: "motif",
      },
    ],
    edges: [
      {
        draftId: "import-edge-x",
        edgeType: "derived_from",
        sourceDraftId: "import-node-motif-m1",
        targetDraftId: "import-evidence-q1",
        note: "Imported edge note.",
      },
    ],
    notes: [
      {
        draftId: "import-note-summary",
        text: "Imported summary note.",
      },
    ],
  });
}

void test("pattern-room phase 11C applies SourceImportResult drafts to local overlay", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  let notificationCount = 0;
  const unsubscribe = localState.subscribe(() => {
    notificationCount += 1;
  });

  const summary = localState.applySourceImportResult(createRichImportResult());
  unsubscribe();

  assert.deepEqual(summary, {
    sourcesAdded: 1,
    evidenceAdded: 1,
    nodesAdded: 1,
    edgesAdded: 1,
    notesAdded: 1,
    edgesDropped: 0,
    duplicatesSkipped: 0,
    warnings: [],
  });
  assert.equal(notificationCount, 1);

  const overlay = localState.getOverlay();
  assert.deepEqual(overlay.localAuthoredSources, [
    {
      id: "local-source-001",
      label: "Imported notebook",
      origin: "manual:imported-notebook",
      note: "Imported source note.",
      createdAt: overlay.localAuthoredSources[0]?.createdAt,
    },
  ]);
  assert.deepEqual(overlay.localAuthoredNodes, [
    {
      id: "local-node-001",
      nodeType: "inspiration",
      label: "Imported motif",
      content: "Imported motif content.",
      createdAt: overlay.localAuthoredNodes[0]?.createdAt,
    },
  ]);
  assert.equal(overlay.localAuthoredEvidence[0]?.id, "local-evidence-001");
  assert.equal(overlay.localAuthoredEvidence[0].label, "Imported quote");
  assert.equal(overlay.localAuthoredEvidence[0].excerpt, "The imported quote text.");
  assert.match(
    overlay.localAuthoredEvidence[0].interpretation ?? "",
    /Kaynak bağlamı: Zaman: 00:12:43 · Sayfa: 42 · Konuşmacı: Speaker X/
  );
  assert.deepEqual(overlay.localAuthoredEdges, [
    {
      id: "local-edge-001",
      edgeType: "derived_from",
      sourceId: "local-node-001",
      targetId: "local-evidence-001",
      note: "Imported edge note.",
      createdAt: overlay.localAuthoredEdges[0]?.createdAt,
    },
  ]);
  assert.deepEqual(overlay.localNotes, [
    {
      id: "local-note-001",
      text: "Imported summary note.",
      createdAt: overlay.localNotes[0]?.createdAt,
    },
  ]);
  assert.equal("importBatchId" in (overlay.localAuthoredSources[0] ?? {}), false);
  assert.equal("importBatchId" in overlay.localAuthoredEvidence[0], false);
  assert.equal("importBatchId" in (overlay.localAuthoredNodes[0] ?? {}), false);
  assert.equal("importBatchId" in (overlay.localAuthoredEdges[0] ?? {}), false);
  assert.equal("importBatchId" in (overlay.localNotes[0] ?? {}), false);
});

void test("pattern-room phase 14B-1 applies source segments to local source records only", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  const summary = localState.applySourceImportResult(
    createSourceImportResult({
      sources: [
        {
          draftId: "import-source-segmented",
          label: "Segmented source",
          origin: "manual:segmented-source",
          note: "Full segmented source text.",
          sourceKind: "archive_text",
          patternSourceType: "unknown",
          segments: [
            {
              id: "segment-001",
              label: "Segment one",
              text: "First source segment text.",
              order: 0,
            },
            {
              id: "segment-002",
              label: "Segment two",
              text: "Second source segment text.",
              order: 1,
            },
          ],
        },
      ],
    })
  );

  const overlay = localState.getOverlay();
  assert.equal(summary.sourcesAdded, 1);
  assert.deepEqual(overlay.localAuthoredSources[0]?.segments, [
    {
      id: "segment-001",
      label: "Segment one",
      text: "First source segment text.",
      order: 0,
    },
    {
      id: "segment-002",
      label: "Segment two",
      text: "Second source segment text.",
      order: 1,
    },
  ]);
  assert.deepEqual(overlay.localAuthoredEvidence, []);
  assert.deepEqual(overlay.localAuthoredNodes, []);
  assert.deepEqual(overlay.localAuthoredEdges, []);
  assert.deepEqual(overlay.pinnedSourceIds, []);
});

void test("pattern-room phase 12F-B applies optional importBatchId to imported overlay entries", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);

  const summary = localState.applySourceImportResult(createRichImportResult(), {
    importBatchId: "source-package-123",
  });
  const overlay = localState.getOverlay();

  assert.deepEqual(summary, {
    sourcesAdded: 1,
    evidenceAdded: 1,
    nodesAdded: 1,
    edgesAdded: 1,
    notesAdded: 1,
    edgesDropped: 0,
    duplicatesSkipped: 0,
    warnings: [],
  });
  assert.deepEqual(
    overlay.localAuthoredSources.map((source) => source.importBatchId),
    ["source-package-123"]
  );
  assert.deepEqual(
    overlay.localAuthoredEvidence.map((evidence) => evidence.importBatchId),
    ["source-package-123"]
  );
  assert.deepEqual(
    overlay.localAuthoredNodes.map((node) => node.importBatchId),
    ["source-package-123"]
  );
  assert.deepEqual(
    overlay.localAuthoredEdges.map((edge) => edge.importBatchId),
    ["source-package-123"]
  );
  assert.deepEqual(
    overlay.localNotes.map((note) => note.importBatchId),
    ["source-package-123"]
  );
});

void test("pattern-room phase 12F-B preserves importBatchId through snapshot round-trip", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.applySourceImportResult(createRichImportResult(), {
    importBatchId: "source-package-round-trip",
  });

  const snapshot = createSnapshot(localState, "board");
  const restored = restoreFromSnapshot(snapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  assert.ok(restored);

  assert.equal(snapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
  assert.deepEqual(
    restored.overlay.localAuthoredSources.map((source) => source.importBatchId),
    ["source-package-round-trip"]
  );
  assert.deepEqual(
    restored.overlay.localAuthoredEvidence.map((evidence) => evidence.importBatchId),
    ["source-package-round-trip"]
  );
  assert.deepEqual(
    restored.overlay.localAuthoredNodes.map((node) => node.importBatchId),
    ["source-package-round-trip"]
  );
  assert.deepEqual(
    restored.overlay.localAuthoredEdges.map((edge) => edge.importBatchId),
    ["source-package-round-trip"]
  );
  assert.deepEqual(
    restored.overlay.localNotes.map((note) => note.importBatchId),
    ["source-package-round-trip"]
  );
});

void test("pattern-room phase 12D applies user text producer import results through local state", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  let notificationCount = 0;
  const unsubscribe = localState.subscribe(() => {
    notificationCount += 1;
  });

  const producer = createUserTextProducer({ now: () => "2026-05-21T10:00:00.000Z" });
  const orchestrationResult = produceAndImportSource(producer, {
    inputKind: "pasted_text",
    text: "Kullanıcı metni source producer hattından gelir.",
    title: "Üretici kaynak notu",
    language: "tr",
  });
  const importResult = orchestrationResult.importResults[0]?.importResult;
  assert.ok(importResult);

  const summary = localState.applySourceImportResult(importResult);
  unsubscribe();

  assert.equal(orchestrationResult.importResults[0]?.sourceKind, "user_text");
  assert.deepEqual(summary, {
    sourcesAdded: 1,
    evidenceAdded: 0,
    nodesAdded: 0,
    edgesAdded: 0,
    notesAdded: 0,
    edgesDropped: 0,
    duplicatesSkipped: 0,
    warnings: [],
  });
  assert.equal(notificationCount, 1);
  assert.deepEqual(localState.getOverlay().localAuthoredSources, [
    {
      id: "local-source-001",
      label: "Üretici kaynak notu",
      origin: "Kullanıcı metni",
      note: "Kullanıcı metni source producer hattından gelir.",
      createdAt: localState.getOverlay().localAuthoredSources[0]?.createdAt,
    },
  ]);
});

void test("pattern-room phase 11C continues local ids from restored max indexes", () => {
  const seedState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const restoredSnapshot = restoreFromSnapshot(
    {
      ...createSnapshot(seedState, "board"),
      overlay: {
        ...seedState.getOverlay(),
        localNotes: [
          {
            id: "local-note-007",
            text: "Existing note.",
            createdAt: "2026-05-21T10:00:00.000Z",
          },
        ],
        localAuthoredNodes: [
          {
            id: "local-node-009",
            nodeType: "claim",
            label: "Existing claim",
            content: "Existing claim content.",
            createdAt: "2026-05-21T10:00:00.000Z",
          },
        ],
        localAuthoredSources: [
          {
            id: "local-source-004",
            label: "Existing source",
            origin: "manual:existing",
            note: "",
            createdAt: "2026-05-21T10:00:00.000Z",
          },
        ],
        localAuthoredEvidence: [
          {
            id: "local-evidence-003",
            label: "Existing evidence",
            excerpt: "Existing excerpt.",
            interpretation: null,
            layer: "evidence",
            createdAt: "2026-05-21T10:00:00.000Z",
          },
        ],
        localAuthoredEdges: [
          {
            id: "local-edge-002",
            edgeType: "supports",
            sourceId: "local-node-009",
            targetId: "local-source-004",
            note: null,
            createdAt: "2026-05-21T10:00:00.000Z",
          },
        ],
      },
      guards: {
        debateReportReflected: false,
        noteIndex: 0,
      },
    },
    PATTERN_ROOM_DOMAIN_TEST_FIXTURE
  );
  assert.ok(restoredSnapshot);
  assert.equal(restoredSnapshot.guards.noteIndex, 7);

  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.restoreOverlay(restoredSnapshot.overlay, restoredSnapshot.guards);

  const summary = localState.applySourceImportResult(createRichImportResult());
  const overlay = localState.getOverlay();

  assert.equal(summary.edgesDropped, 0);
  assert.equal(overlay.localAuthoredSources.at(-1)?.id, "local-source-005");
  assert.equal(overlay.localAuthoredEvidence.at(-1)?.id, "local-evidence-004");
  assert.equal(overlay.localAuthoredNodes.at(-1)?.id, "local-node-010");
  assert.equal(overlay.localAuthoredEdges.at(-1)?.id, "local-edge-003");
  assert.equal(overlay.localNotes.at(-1)?.id, "local-note-008");
  assert.equal(overlay.localAuthoredEdges.at(-1)?.sourceId, "local-node-010");
  assert.equal(overlay.localAuthoredEdges.at(-1)?.targetId, "local-evidence-004");
});

void test("pattern-room phase 11C direct overlay restore continues note ids from max index", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.restoreOverlay(
    {
      ...localState.getOverlay(),
      localNotes: [
        {
          id: "local-note-007",
          text: "Existing note.",
          createdAt: "2026-05-21T10:00:00.000Z",
        },
      ],
      localAuthoredNodes: [
        {
          id: "local-node-009",
          nodeType: "claim",
          label: "Existing claim",
          content: "Existing claim content.",
          createdAt: "2026-05-21T10:00:00.000Z",
        },
      ],
      localAuthoredSources: [
        {
          id: "local-source-004",
          label: "Existing source",
          origin: "manual:existing",
          note: "",
          createdAt: "2026-05-21T10:00:00.000Z",
        },
      ],
      localAuthoredEvidence: [
        {
          id: "local-evidence-003",
          label: "Existing evidence",
          excerpt: "Existing excerpt.",
          interpretation: null,
          layer: "evidence",
          createdAt: "2026-05-21T10:00:00.000Z",
        },
      ],
      localAuthoredEdges: [
        {
          id: "local-edge-002",
          edgeType: "supports",
          sourceId: "local-node-009",
          targetId: "local-source-004",
          note: null,
          createdAt: "2026-05-21T10:00:00.000Z",
        },
      ],
    },
    {
      debateReportReflected: false,
      noteIndex: 0,
    }
  );

  localState.addLocalNote("New local note after stale guard restore.");
  const overlay = localState.getOverlay();

  assert.equal(overlay.localNotes.at(-1)?.id, "local-note-008");
});

void test("pattern-room phase 11C drops unmapped import edges without throwing", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  const result = createSourceImportResult({
    nodes: [
      {
        draftId: "import-node-1",
        nodeType: "claim",
        label: "Mapped node",
        content: "Mapped node content.",
        originKind: "observation",
      },
    ],
    edges: [
      {
        draftId: "import-edge-missing",
        edgeType: "references",
        sourceDraftId: "import-node-1",
        targetDraftId: "missing-draft",
        note: null,
      },
    ],
  });

  const summary = localState.applySourceImportResult(result);

  assert.equal(summary.nodesAdded, 1);
  assert.equal(summary.edgesAdded, 0);
  assert.equal(summary.edgesDropped, 1);
  assert.match(summary.warnings.join("\n"), /import-edge-missing/);
  assert.deepEqual(localState.getOverlay().localAuthoredEdges, []);
});

void test("pattern-room phase 11C skips simple duplicates and drops dependent edges", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.addAuthoredSource("Duplicate source", "manual:duplicate-source", "");
  localState.addAuthoredEvidence("Duplicate evidence", "Duplicate excerpt.", "");
  localState.addAuthoredClaim("Duplicate node", "Duplicate node content.");
  let notificationCount = 0;
  const unsubscribe = localState.subscribe(() => {
    notificationCount += 1;
  });

  const summary = localState.applySourceImportResult(
    createSourceImportResult({
      sources: [
        {
          draftId: "import-source-duplicate",
          label: "Duplicate source",
          origin: "manual:duplicate-source",
          note: "",
          sourceKind: "user_text",
          patternSourceType: "personal_note",
        },
      ],
      evidence: [
        {
          draftId: "import-evidence-duplicate",
          label: "Duplicate evidence changed label",
          excerpt: "Duplicate excerpt.",
          interpretation: null,
          layer: "evidence",
          sourceQuoteId: "quote-duplicate",
          sourceItemId: null,
          page: null,
          timecode: null,
          speaker: null,
          context: null,
        },
      ],
      nodes: [
        {
          draftId: "import-node-duplicate",
          nodeType: "claim",
          label: "Duplicate node",
          content: "Duplicate node content.",
          originKind: "observation",
        },
        {
          draftId: "import-node-new",
          nodeType: "claim",
          label: "New node",
          content: "New node content.",
          originKind: "observation",
        },
      ],
      edges: [
        {
          draftId: "import-edge-dependent",
          edgeType: "supports",
          sourceDraftId: "import-source-duplicate",
          targetDraftId: "import-node-new",
          note: "Dependent edge should drop.",
        },
      ],
    })
  );
  unsubscribe();

  assert.equal(summary.sourcesAdded, 0);
  assert.equal(summary.evidenceAdded, 0);
  assert.equal(summary.nodesAdded, 1);
  assert.equal(summary.edgesAdded, 0);
  assert.equal(summary.edgesDropped, 1);
  assert.equal(summary.duplicatesSkipped, 3);
  assert.equal(notificationCount, 1);
  assert.match(summary.warnings.join("\n"), /Duplicate source draft skipped/);
  assert.match(summary.warnings.join("\n"), /Duplicate evidence draft skipped/);
  assert.match(summary.warnings.join("\n"), /Duplicate node draft skipped/);
  assert.deepEqual(
    localState.getOverlay().localAuthoredEdges.map((edge) => edge.note),
    []
  );
});

void test("pattern-room phase 11C preserves imported overlay entries through snapshot restore", () => {
  const localState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  localState.applySourceImportResult(createRichImportResult());

  const snapshot = createSnapshot(localState, "board");
  const restored = restoreFromSnapshot(snapshot, PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  assert.ok(restored);

  const roundTripState = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE);
  roundTripState.restoreOverlay(restored.overlay, restored.guards);

  assert.equal(snapshot.schemaVersion, PATTERN_ROOM_SNAPSHOT_VERSION);
  assert.deepEqual(roundTripState.getOverlay(), localState.getOverlay());
});

void test("pattern-room phase 11C keeps overlay shape, snapshot version, and import apply purity", async () => {
  const overlay = createLocalState(PATTERN_ROOM_DOMAIN_TEST_FIXTURE).getOverlay();
  assert.deepEqual(Object.keys(overlay).sort(), [
    "debateLocalTurns",
    "debateLocalVerdict",
    "debatePhase",
    "debateReferenceIds",
    "debateRolesConnected",
    "deskNodeIds",
    "localAuthoredEdges",
    "localAuthoredEvidence",
    "localAuthoredNodes",
    "localAuthoredSources",
    "localEvidenceCandidates",
    "localNotes",
    "pinnedSourceIds",
    "sourcePinnedLayerById",
  ]);
  assert.equal(PATTERN_ROOM_SNAPSHOT_VERSION, 1);

  const localStateSource = await readFile(
    resolve("rooms/pattern-room/shared/state/pattern-room-local-state.ts"),
    "utf8"
  );
  const snapshotShapeCheck: PatternRoomSessionSnapshot["schemaVersion"] =
    PATTERN_ROOM_SNAPSHOT_VERSION;
  assert.equal(snapshotShapeCheck, 1);

  const prohibitedPatterns = [
    /from\s+["']node:fs/,
    /from\s+["']fs/,
    /ipcRenderer/,
    /roomAPI/,
    /registerCommand/,
    /notifyRoom/,
    /document\./,
    /window\./,
    /fetch\s*\(/,
    /from\s+["'][^"']*(?:host|ui|runtime)/,
  ];

  for (const pattern of prohibitedPatterns) {
    assert.equal(pattern.test(localStateSource), false, String(pattern));
  }
});
