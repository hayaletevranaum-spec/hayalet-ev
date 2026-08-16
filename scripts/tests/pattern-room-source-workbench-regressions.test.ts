import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import {
  importSourcePackage,
  mapSourceKindToPatternSourceType,
  parseSourcePackage,
  SAMPLE_NEWSPAPER_SOURCE_PACKAGE,
  SAMPLE_SUBTITLE_SOURCE_PACKAGE,
  SAMPLE_USER_TEXT_SOURCE_PACKAGE,
  SOURCE_KIND_TO_PATTERN_SOURCE_TYPE,
  SOURCE_KINDS,
  type SourceImportResult,
  type SourceKind,
  type SourcePackage,
} from "../../rooms/pattern-room/shared/source-workbench/index.ts";

const EXPECTED_SOURCE_KINDS = [
  "user_text",
  "book",
  "article",
  "religious_text",
  "newspaper",
  "archive_text",
  "youtube_channel_subtitles",
  "video_subtitles",
  "subtitle_archive",
  "web_archive",
  "laboratory_result",
  "number_analysis",
  "personal_note",
] as const satisfies readonly SourceKind[];

const EXPECTED_SOURCE_KIND_MAPPING = {
  user_text: "personal_note",
  book: "book",
  article: "unknown",
  religious_text: "religious_text",
  newspaper: "newspaper",
  archive_text: "unknown",
  youtube_channel_subtitles: "subtitle_archive",
  video_subtitles: "subtitle_archive",
  subtitle_archive: "subtitle_archive",
  web_archive: "web_archive",
  laboratory_result: "laboratory_result",
  number_analysis: "number_analysis",
  personal_note: "personal_note",
} as const;

function createMinimalSourcePackage(partial: Partial<SourcePackage> = {}): SourcePackage {
  return {
    sourcePackageId: "minimal-package",
    sourceKind: "user_text",
    title: "Minimal package",
    origin: "manual:minimal-package",
    language: "en",
    createdAt: "2026-05-21T11:00:00.000Z",
    sourceItems: [],
    cleanedText: null,
    segments: [],
    quotes: [],
    observations: [],
    motifs: [],
    uncertainties: [],
    numericPatterns: [],
    references: [],
    metadata: {},
    ...partial,
  };
}

function collectImportDraftIds(result: SourceImportResult): Set<string> {
  return new Set([
    ...result.sources.map((source) => source.draftId),
    ...result.evidence.map((evidence) => evidence.draftId),
    ...result.nodes.map((node) => node.draftId),
    ...result.notes.map((note) => note.draftId),
  ]);
}

function assertEdgesResolveToImportDrafts(result: SourceImportResult): void {
  const draftIds = collectImportDraftIds(result);

  for (const edge of result.edges) {
    assert.equal(draftIds.has(edge.sourceDraftId), true, edge.draftId);
    assert.equal(draftIds.has(edge.targetDraftId), true, edge.draftId);
  }
}

async function walkTypeScriptFiles(baseDir: string): Promise<string[]> {
  const entries = await readdir(baseDir, { withFileTypes: true });
  const files: string[] = [];

  const dirResults = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => await walkTypeScriptFiles(join(baseDir, entry.name)))
  );
  for (const dirResult of dirResults) {
    files.push(...dirResult);
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(join(baseDir, entry.name));
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

void test("pattern-room source workbench exposes source kinds and pattern source mapping", () => {
  assert.deepEqual(SOURCE_KINDS, EXPECTED_SOURCE_KINDS);
  assert.deepEqual(SOURCE_KIND_TO_PATTERN_SOURCE_TYPE, EXPECTED_SOURCE_KIND_MAPPING);

  for (const sourceKind of SOURCE_KINDS) {
    assert.equal(
      mapSourceKindToPatternSourceType(sourceKind),
      EXPECTED_SOURCE_KIND_MAPPING[sourceKind]
    );
  }
});

void test("pattern-room source workbench parses valid packages and defaults optional arrays", () => {
  const parsed = parseSourcePackage({
    sourcePackageId: "parse-valid",
    sourceKind: "book",
    title: "Valid parse package",
    origin: "book:valid",
    language: "en",
    createdAt: "2026-05-21T11:05:00.000Z",
  });

  assert.ok(parsed);
  assert.equal(parsed.sourcePackageId, "parse-valid");
  assert.equal(parsed.cleanedText, null);
  assert.deepEqual(parsed.sourceItems, []);
  assert.deepEqual(parsed.segments, []);
  assert.deepEqual(parsed.quotes, []);
  assert.deepEqual(parsed.observations, []);
  assert.deepEqual(parsed.motifs, []);
  assert.deepEqual(parsed.uncertainties, []);
  assert.deepEqual(parsed.numericPatterns, []);
  assert.deepEqual(parsed.references, []);
  assert.deepEqual(parsed.metadata, {});
});

void test("pattern-room source workbench rejects invalid package shapes defensively", () => {
  assert.equal(parseSourcePackage(null), null);
  assert.equal(parseSourcePackage({}), null);
  assert.equal(
    parseSourcePackage({
      sourcePackageId: "parse-invalid-kind",
      sourceKind: "not-a-kind",
      title: "Invalid kind",
      origin: "manual:invalid-kind",
      language: "en",
      createdAt: "2026-05-21T11:10:00.000Z",
    }),
    null
  );
  assert.equal(
    parseSourcePackage({
      sourcePackageId: "parse-missing-title",
      sourceKind: "book",
      origin: "manual:missing-title",
      language: "en",
      createdAt: "2026-05-21T11:10:00.000Z",
    }),
    null
  );
});

void test("pattern-room source workbench imports a minimal package as a source draft only", () => {
  const result = importSourcePackage(createMinimalSourcePackage());

  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0]?.draftId, "import-source-minimal-package");
  assert.equal(result.sources[0].patternSourceType, "personal_note");
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.nodes, []);
  assert.deepEqual(result.edges, []);
  assert.deepEqual(result.notes, []);
  assert.deepEqual(result.stats, {
    sourcesCreated: 1,
    evidenceCreated: 0,
    nodesCreated: 0,
    edgesCreated: 0,
    notesCreated: 0,
    duplicatesSkipped: 0,
    itemsDropped: 0,
  });
});

void test("pattern-room source workbench preserves source package segments on the source draft", () => {
  const result = importSourcePackage(
    createMinimalSourcePackage({
      sourcePackageId: "segmented-package",
      segments: [
        {
          segmentId: "segment-001",
          sourceItemId: "source-item-001",
          label: "Segment one",
          text: "First source segment text.",
          order: 0,
          page: null,
          timecode: null,
          speaker: null,
          metadata: {},
        },
        {
          segmentId: "segment-002",
          sourceItemId: "source-item-001",
          label: "Segment two",
          text: "Second source segment text.",
          order: null,
          page: null,
          timecode: null,
          speaker: null,
          metadata: {},
        },
      ],
    })
  );

  assert.deepEqual(result.sources[0]?.segments, [
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
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.nodes, []);
  assert.deepEqual(result.edges, []);
});

void test("pattern-room source workbench maps quotes and motifs into evidence, nodes, and derived edges", () => {
  const result = importSourcePackage(
    createMinimalSourcePackage({
      sourcePackageId: "quote-motif-package",
      quotes: [
        {
          quoteId: "quote-1",
          sourceItemId: "item-1",
          segmentId: null,
          label: "Quote 1",
          excerpt: "First quote.",
          context: null,
          page: null,
          timecode: null,
          speaker: null,
          metadata: {},
        },
        {
          quoteId: "quote-2",
          sourceItemId: "item-1",
          segmentId: null,
          label: "Quote 2",
          excerpt: "Second quote.",
          context: null,
          page: null,
          timecode: null,
          speaker: null,
          metadata: {},
        },
        {
          quoteId: "quote-3",
          sourceItemId: "item-1",
          segmentId: null,
          label: "Quote 3",
          excerpt: "Third quote.",
          context: null,
          page: null,
          timecode: null,
          speaker: null,
          metadata: {},
        },
      ],
      motifs: [
        {
          motifId: "motif-1",
          label: "Motif 1",
          content: "First motif.",
          relatedQuoteIds: ["quote-1", "quote-2"],
          metadata: {},
        },
        {
          motifId: "motif-2",
          label: "Motif 2",
          content: "Second motif.",
          relatedQuoteIds: ["quote-3"],
          metadata: {},
        },
      ],
    })
  );

  assert.equal(result.evidence.length, 3);
  assert.equal(result.nodes.length, 2);
  assert.equal(
    result.nodes.every((node) => node.nodeType === "inspiration"),
    true
  );
  assert.equal(result.edges.length, 3);
  assert.equal(
    result.edges.every((edge) => edge.edgeType === "derived_from"),
    true
  );
  assertEdgesResolveToImportDrafts(result);
});

void test("pattern-room source workbench preserves quote timecodes in evidence drafts", () => {
  const result = importSourcePackage(SAMPLE_SUBTITLE_SOURCE_PACKAGE);

  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0]?.timecode, "00:01:12");
  assert.equal(result.evidence[0].speaker, "Narrator");
});

void test("pattern-room source workbench imports numeric patterns as inspiration nodes", () => {
  const result = importSourcePackage(
    createMinimalSourcePackage({
      sourcePackageId: "numeric-package",
      numericPatterns: [
        {
          patternId: "number-1",
          label: "Seven-count cadence",
          content: "A repeated count appears.",
          value: "7",
          relatedQuoteIds: [],
          metadata: {},
        },
      ],
    })
  );

  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0]?.draftId, "import-node-number-number-1");
  assert.equal(result.nodes[0].nodeType, "inspiration");
  assert.equal(result.nodes[0].originKind, "numeric_pattern");
});

void test("pattern-room source workbench imports uncertainties with questions edges", () => {
  const result = importSourcePackage(
    createMinimalSourcePackage({
      sourcePackageId: "uncertainty-package",
      quotes: [
        {
          quoteId: "uncertainty-quote-1",
          sourceItemId: null,
          segmentId: null,
          label: "Uncertainty quote",
          excerpt: "The sampled archive might be incomplete.",
          context: null,
          page: null,
          timecode: null,
          speaker: null,
          metadata: {},
        },
      ],
      uncertainties: [
        {
          uncertaintyId: "uncertainty-1",
          label: "Archive gap",
          content: "The archive gap needs review.",
          relatedQuoteIds: ["uncertainty-quote-1"],
          metadata: {},
        },
      ],
    })
  );

  assert.equal(result.nodes.length, 1);
  assert.equal(result.nodes[0]?.nodeType, "uncertainty");
  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0]?.edgeType, "questions");
});

void test("pattern-room source workbench imports references as reference edges", () => {
  const result = importSourcePackage(
    createMinimalSourcePackage({
      sourcePackageId: "reference-package",
      quotes: [
        {
          quoteId: "reference-quote-1",
          sourceItemId: null,
          segmentId: null,
          label: "Reference quote",
          excerpt: "Reference edge targets should stay explicit.",
          context: null,
          page: null,
          timecode: null,
          speaker: null,
          metadata: {},
        },
      ],
      motifs: [
        {
          motifId: "reference-motif-1",
          label: "Reference motif",
          content: "Reference motif content.",
          relatedQuoteIds: [],
          metadata: {},
        },
      ],
      references: [
        {
          referenceId: "reference-edge-1",
          sourceId: "reference-motif-1",
          targetId: "reference-quote-1",
          edgeType: "supports",
          note: "Producer edgeType is intentionally ignored for Source Workbench references.",
          metadata: {},
        },
      ],
    })
  );

  assert.equal(result.edges.length, 1);
  assert.equal(result.edges[0]?.edgeType, "references");
  assert.equal(result.edges[0].sourceDraftId, "import-node-motif-reference-motif-1");
  assert.equal(result.edges[0].targetDraftId, "import-evidence-reference-quote-1");
  assertEdgesResolveToImportDrafts(result);
});

void test("pattern-room source workbench skips unresolved references without dangling edges", () => {
  const result = importSourcePackage(
    createMinimalSourcePackage({
      sourcePackageId: "unresolved-reference-package",
      motifs: [
        {
          motifId: "unresolved-reference-motif-1",
          label: "Unresolved reference motif",
          content: "Reference source exists but target does not.",
          relatedQuoteIds: [],
          metadata: {},
        },
      ],
      references: [
        {
          referenceId: "unresolved-reference-edge-1",
          sourceId: "unresolved-reference-motif-1",
          targetId: "missing-quote",
          edgeType: "references",
          note: null,
          metadata: {},
        },
      ],
    })
  );

  assert.equal(result.edges.length, 0);
  assert.equal(
    result.warnings.some((warning) => warning.code === "unresolved-reference"),
    true
  );
  assert.equal(result.stats.itemsDropped, 1);
  assertEdgesResolveToImportDrafts(result);
});

void test("pattern-room source workbench skips unresolved related quote edges with warnings", () => {
  const result = importSourcePackage(
    createMinimalSourcePackage({
      sourcePackageId: "unresolved-related-quote-package",
      motifs: [
        {
          motifId: "unresolved-related-motif-1",
          label: "Unresolved related motif",
          content: "A motif references a quote that was not imported.",
          relatedQuoteIds: ["missing-quote"],
          metadata: {},
        },
      ],
    })
  );

  assert.equal(result.nodes.length, 1);
  assert.equal(result.edges.length, 0);
  assert.equal(
    result.warnings.some((warning) => warning.code === "unresolved-related-quote"),
    true
  );
  assert.equal(result.stats.itemsDropped, 1);
  assertEdgesResolveToImportDrafts(result);
});

void test("pattern-room source workbench keeps every generated edge linked to import drafts", () => {
  const result = importSourcePackage(
    createMinimalSourcePackage({
      sourcePackageId: "edge-integrity-package",
      quotes: [
        {
          quoteId: "edge-integrity-quote-1",
          sourceItemId: null,
          segmentId: null,
          label: "Edge integrity quote",
          excerpt: "All generated edges must point at emitted drafts.",
          context: null,
          page: null,
          timecode: null,
          speaker: null,
          metadata: {},
        },
      ],
      motifs: [
        {
          motifId: "edge-integrity-motif-1",
          label: "Edge integrity motif",
          content: "Motif with a valid related quote.",
          relatedQuoteIds: ["edge-integrity-quote-1"],
          metadata: {},
        },
      ],
      observations: [
        {
          observationId: "edge-integrity-observation-1",
          observationType: "pattern",
          label: "Edge integrity observation",
          content: "Observation with a valid related quote.",
          relatedQuoteIds: ["edge-integrity-quote-1"],
          metadata: {},
        },
      ],
      uncertainties: [
        {
          uncertaintyId: "edge-integrity-uncertainty-1",
          label: "Edge integrity uncertainty",
          content: "Uncertainty with a valid related quote.",
          relatedQuoteIds: ["edge-integrity-quote-1"],
          metadata: {},
        },
      ],
      references: [
        {
          referenceId: "edge-integrity-reference-1",
          sourceId: "edge-integrity-motif-1",
          targetId: "edge-integrity-observation-1",
          edgeType: "supports",
          note: null,
          metadata: {},
        },
      ],
    })
  );

  assert.equal(result.edges.length, 4);
  assertEdgesResolveToImportDrafts(result);
});

void test("pattern-room source workbench skips duplicate packages with a warning", () => {
  const result = importSourcePackage(createMinimalSourcePackage(), {
    existingPackageIds: ["minimal-package"],
  });

  assert.deepEqual(result.sources, []);
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.nodes, []);
  assert.deepEqual(result.edges, []);
  assert.equal(result.warnings[0]?.code, "duplicate-package");
  assert.equal(result.stats.duplicatesSkipped, 1);
});

void test("pattern-room source workbench applies quote limits without throwing", () => {
  const quotes = Array.from({ length: 101 }, (_, index) => {
    const quoteIndex = index + 1;
    return {
      quoteId: `bulk-quote-${String(quoteIndex)}`,
      sourceItemId: null,
      segmentId: null,
      label: `Bulk quote ${String(quoteIndex)}`,
      excerpt: `Bulk quote excerpt ${String(quoteIndex)}.`,
      context: null,
      page: null,
      timecode: null,
      speaker: null,
      metadata: {},
    };
  });

  const result = importSourcePackage(
    createMinimalSourcePackage({
      sourcePackageId: "bulk-quote-package",
      quotes,
    })
  );

  assert.equal(result.evidence.length, 100);
  assert.equal(result.stats.itemsDropped, 1);
  assert.equal(
    result.warnings.some((warning) => warning.code === "limit-exceeded"),
    true
  );
});

void test("pattern-room source workbench import adapter does not mutate input packages", () => {
  const pkg = createMinimalSourcePackage({
    sourcePackageId: "purity-package",
    quotes: SAMPLE_USER_TEXT_SOURCE_PACKAGE.quotes,
    motifs: SAMPLE_USER_TEXT_SOURCE_PACKAGE.motifs,
    metadata: { summary: "A package summary note." },
  });
  const before = JSON.stringify(pkg);

  const result = importSourcePackage(pkg);

  assert.equal(result.notes.length, 1);
  assert.equal(JSON.stringify(pkg), before);
});

void test("pattern-room source workbench sample packages cover requested source varieties", () => {
  const userTextResult = importSourcePackage(SAMPLE_USER_TEXT_SOURCE_PACKAGE);
  const newspaperResult = importSourcePackage(SAMPLE_NEWSPAPER_SOURCE_PACKAGE);
  const subtitleResult = importSourcePackage(SAMPLE_SUBTITLE_SOURCE_PACKAGE);

  assert.equal(
    userTextResult.nodes.some((node) => node.originKind === "motif"),
    true
  );
  assert.equal(
    newspaperResult.nodes.some((node) => node.originKind === "uncertainty"),
    true
  );
  assert.equal(
    newspaperResult.nodes.some((node) => node.originKind === "numeric_pattern"),
    true
  );
  assert.equal(subtitleResult.evidence[0]?.timecode, "00:01:12");
});

void test("pattern-room source workbench stays disconnected from overlay, snapshot, UI, host, and IPC surfaces", async () => {
  const protectedFiles = [
    "rooms/pattern-room/shared/state/pattern-room-snapshot.ts",
    "rooms/pattern-room/shared/types/pattern-room-snapshot.ts",
    "rooms/pattern-room/host/runtime.ts",
  ];

  const protectedSources = await Promise.all(
    protectedFiles.map(async (filePath) => {
      const source = await readFile(resolve(filePath), "utf8");
      return { filePath, source };
    })
  );
  for (const { filePath, source } of protectedSources) {
    assert.equal(source.includes("source-workbench"), false, filePath);
    assert.equal(source.includes("SourcePackage"), false, filePath);
  }

  const uiRuntimeSource = await readFile(
    resolve("rooms/pattern-room/ui/pattern-room-ui-runtime.ts"),
    "utf8"
  );
  assert.equal(uiRuntimeSource.includes("source-workbench"), false);
  assert.equal(uiRuntimeSource.includes("importSourcePackage("), false);
  assert.match(uiRuntimeSource, /pattern-source-import-demo/);

  const localStateSource = await readFile(
    resolve("rooms/pattern-room/shared/state/pattern-room-local-state.ts"),
    "utf8"
  );
  assert.match(localStateSource, /import type\s+\{[\s\S]*SourceImportResult[\s\S]*\}/);
  const localStateWithoutTypeImports = localStateSource.replace(
    /import type\s+\{[\s\S]*?\}\s+from\s+["'][^"']*source-workbench[^"']*["'];/g,
    ""
  );
  assert.equal(localStateWithoutTypeImports.includes("source-workbench"), false);
  assert.equal(localStateSource.includes("parseSourcePackage"), false);
  assert.equal(localStateSource.includes("importSourcePackage"), false);

  const sourceImportDemoSource = await readFile(
    resolve("rooms/pattern-room/ui/pattern-source-import-demo.ts"),
    "utf8"
  );
  assert.match(sourceImportDemoSource, /SAMPLE_SOURCE_PACKAGES/);
  assert.match(sourceImportDemoSource, /importSourcePackage/);

  const prohibitedDemoActionPatterns = [
    /from\s+["']node:fs/,
    /from\s+["']fs/,
    /readFile\s*\(/,
    /writeFile\s*\(/,
    /ipcRenderer/,
    /roomAPI/,
    /registerCommand/,
    /notifyRoom/,
    /fetch\s*\(/,
    /yt-dlp/,
    /provider/i,
    /relay/i,
    /laboratory\//,
  ];

  for (const pattern of prohibitedDemoActionPatterns) {
    assert.equal(pattern.test(sourceImportDemoSource), false, String(pattern));
  }

  const sourceWorkbenchFiles = await walkTypeScriptFiles(
    resolve("rooms/pattern-room/shared/source-workbench")
  );
  const prohibitedPatterns = [
    /from\s+["']node:fs/,
    /from\s+["']fs/,
    /readFile\s*\(/,
    /writeFile\s*\(/,
    /ipcRenderer/,
    /roomAPI/,
    /registerCommand/,
    /notifyRoom/,
    /document\./,
    /window\./,
    /fetch\s*\(/,
    /yt-dlp/,
    /provider/i,
    /relay/i,
    /laboratory\//,
    /PatternRoomLocalOverlay/,
    /LocalAuthored/,
  ];

  const workbenchSources = await Promise.all(
    sourceWorkbenchFiles.map(async (filePath) => {
      const source = await readFile(filePath, "utf8");
      return { filePath, source };
    })
  );
  for (const { filePath, source } of workbenchSources) {
    const relativePath = relative(process.cwd(), filePath);
    for (const pattern of prohibitedPatterns) {
      assert.equal(pattern.test(source), false, `${relativePath} matched ${String(pattern)}`);
    }
  }
});
