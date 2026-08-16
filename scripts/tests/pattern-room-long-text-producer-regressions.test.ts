import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createLongTextProducer,
  produceAndImportSource,
  segmentLongText,
  type LongTextInput,
} from "../../rooms/pattern-room/shared/source-producers/index.ts";
import {
  importSourcePackage,
  parseSourcePackage,
} from "../../rooms/pattern-room/shared/source-workbench/index.ts";

const FIXED_NOW = "2026-01-01T00:00:00.000Z";

function createLongTextInput(partial: Partial<LongTextInput> = {}): LongTextInput {
  return {
    inputKind: "long_text",
    text: "First paragraph has a clear idea.\n\nSecond paragraph keeps it as source text.",
    title: "Archive Chapter",
    sourceKind: "article",
    origin: "archive:chapter-1",
    language: "en",
    chapter: "Chapter 1",
    page: "12",
    ...partial,
  };
}

void test("pattern-room long text segmenter returns no segments for blank text", () => {
  assert.deepEqual(segmentLongText(" \n\t "), []);
});

void test("pattern-room long text segmenter creates one segment for one paragraph", () => {
  const segments = segmentLongText("  One paragraph only.  ");

  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.segmentId, "segment-001");
  assert.equal(segments[0].sourceItemId, "source-item-001");
  assert.equal(segments[0].text, "One paragraph only.");
  assert.equal(segments[0].order, 0);
  assert.equal(segments[0].page, null);
  assert.equal(segments[0].speaker, null);
});

void test("pattern-room long text segmenter splits multiple paragraphs into multiple segments", () => {
  const segments = segmentLongText("First paragraph.\n\nSecond paragraph.\n\nThird paragraph.");

  assert.equal(segments.length, 3);
  assert.deepEqual(
    segments.map((segment) => segment.text),
    ["First paragraph.", "Second paragraph.", "Third paragraph."]
  );
});

void test("pattern-room long text segmenter splits long paragraphs within the limit", () => {
  const segments = segmentLongText("abcdefghij".repeat(4), { maxSegmentLength: 12 });

  assert.equal(segments.length > 1, true);
  assert.equal(
    segments.every((segment) => segment.text.length <= 12),
    true
  );
});

void test("pattern-room long text segmenter prefers sentence boundaries when possible", () => {
  const segments = segmentLongText("First sentence. Second sentence continues.", {
    maxSegmentLength: 20,
  });

  assert.equal(segments[0]?.text, "First sentence.");
  assert.equal(segments[1]?.text.startsWith("Second sentence"), true);
});

void test("pattern-room long text segmenter keeps deterministic ids, order, and labels", () => {
  const labelSource = `${"A".repeat(90)}\n\nSecond paragraph.`;
  const segments = segmentLongText(labelSource);

  assert.deepEqual(
    segments.map((segment) => segment.segmentId),
    ["segment-001", "segment-002"]
  );
  assert.deepEqual(
    segments.map((segment) => segment.order),
    [0, 1]
  );
  assert.equal(segments[0]?.label, "A".repeat(80));
});

void test("pattern-room long text producer rejects empty required fields", () => {
  const producer = createLongTextProducer({ now: () => FIXED_NOW });
  const validation = producer.validateInput(
    createLongTextInput({
      text: " ",
      title: " ",
      origin: " ",
    })
  );

  assert.equal(validation.valid, false);
  assert.equal(
    validation.errors.some((error) => error.code === "blank-text"),
    true
  );
  assert.equal(
    validation.errors.some((error) => error.code === "blank-title"),
    true
  );
  assert.equal(
    validation.errors.some((error) => error.code === "blank-origin"),
    true
  );
});

void test("pattern-room long text producer rejects unsupported source kinds", () => {
  const producer = createLongTextProducer({ now: () => FIXED_NOW });

  const subtitleValidation = producer.validateInput(
    createLongTextInput({ sourceKind: "youtube_channel_subtitles" as LongTextInput["sourceKind"] })
  );
  const invalidValidation = producer.validateInput(
    createLongTextInput({ sourceKind: "not-a-kind" as LongTextInput["sourceKind"] })
  );

  assert.equal(subtitleValidation.valid, false);
  assert.equal(subtitleValidation.errors[0]?.code, "invalid-source-kind");
  assert.equal(invalidValidation.valid, false);
  assert.equal(invalidValidation.errors[0]?.code, "invalid-source-kind");
});

void test("pattern-room long text producer previews one package with segment estimate", () => {
  const producer = createLongTextProducer({
    now: () => FIXED_NOW,
    maxSegmentLength: 50,
  });
  const preview = producer.getPreview(createLongTextInput());

  assert.ok(preview);
  assert.equal(preview.estimatedPackageCount, 1);
  assert.equal(preview.estimatedItemCount, 1);
  assert.equal(preview.estimatedSegmentCount, 2);
  assert.equal(preview.sampleTitle, "Archive Chapter");
  assert.deepEqual(preview.warnings, []);
});

void test("pattern-room long text producer emits one valid SourcePackage", () => {
  const producer = createLongTextProducer({
    now: () => FIXED_NOW,
    maxSegmentLength: 50,
  });
  const result = producer.produce(createLongTextInput());

  assert.deepEqual(result.errors, []);
  assert.equal(result.packages.length, 1);

  const pkg = result.packages[0];
  assert.ok(pkg);
  assert.equal(pkg.sourcePackageId, "source-package-long-text-archive-chapter");
  assert.equal(pkg.sourceKind, "article");
  assert.equal(pkg.title, "Archive Chapter");
  assert.equal(pkg.origin, "archive:chapter-1");
  assert.equal(pkg.language, "en");
  assert.equal(pkg.createdAt, FIXED_NOW);
  assert.equal(
    pkg.cleanedText,
    "First paragraph has a clear idea.\n\nSecond paragraph keeps it as source text."
  );
  assert.equal(pkg.sourceItems.length, 1);
  assert.equal(pkg.sourceItems[0]?.sourceItemId, "source-item-001");
  assert.equal(pkg.sourceItems[0].label, "Archive Chapter");
  assert.equal(pkg.sourceItems[0].origin, "archive:chapter-1");
  assert.equal(pkg.sourceItems[0].content, pkg.cleanedText);
  assert.deepEqual(pkg.sourceItems[0].metadata, {
    producerId: "long_text_producer",
    chapter: "Chapter 1",
    page: "12",
  });
  assert.equal(pkg.segments.length, 2);
  assert.deepEqual(pkg.quotes, []);
  assert.deepEqual(pkg.observations, []);
  assert.deepEqual(pkg.motifs, []);
  assert.deepEqual(pkg.uncertainties, []);
  assert.deepEqual(pkg.numericPatterns, []);
  assert.deepEqual(pkg.references, []);
  assert.deepEqual(pkg.metadata, {
    producerId: "long_text_producer",
    inputKind: "long_text",
    generatedBy: "source-producer",
    wordCount: 13,
    charCount: pkg.cleanedText.length,
    segmentCount: 2,
    chapter: "Chapter 1",
    page: "12",
  });

  const parsed = parseSourcePackage(pkg);
  assert.ok(parsed);
  assert.equal(parsed.sourceKind, "article");
});

void test("pattern-room long text producer defaults optional language to Turkish", () => {
  const producer = createLongTextProducer({ now: () => FIXED_NOW });
  const input = createLongTextInput({});
  delete input.language;
  const pkg = producer.produce(input).packages[0];

  assert.ok(pkg);
  assert.equal(pkg.language, "tr");
});

void test("pattern-room long text producer returns errors without packages for invalid input", () => {
  const producer = createLongTextProducer({ now: () => FIXED_NOW });
  const result = producer.produce(createLongTextInput({ text: "" }));

  assert.deepEqual(result.packages, []);
  assert.equal(result.errors[0]?.code, "empty-text");
});

void test("pattern-room long text output imports as a source draft without board-ready evidence", () => {
  const producer = createLongTextProducer({
    now: () => FIXED_NOW,
    maxSegmentLength: 50,
  });
  const produced = producer.produce(createLongTextInput()).packages[0];
  assert.ok(produced);

  const parsed = parseSourcePackage(produced);
  assert.ok(parsed);

  const importResult = importSourcePackage(parsed);
  assert.equal(importResult.sources.length, 1);
  assert.equal(importResult.sources[0]?.sourceKind, "article");
  assert.equal(importResult.sources[0].patternSourceType, "unknown");
  assert.equal(importResult.sources[0].note, parsed.cleanedText);
  assert.deepEqual(
    importResult.sources[0].segments?.map((segment) => segment.id),
    parsed.segments.map((segment) => segment.segmentId)
  );
  assert.deepEqual(importResult.evidence, []);
  assert.deepEqual(importResult.nodes, []);
  assert.deepEqual(importResult.edges, []);
  assert.deepEqual(importResult.notes, []);
  assert.equal(importResult.stats.sourcesCreated, 1);
  assert.equal(importResult.stats.evidenceCreated, 0);
  assert.equal(importResult.stats.nodesCreated, 0);
  assert.equal(importResult.stats.edgesCreated, 0);
});

void test("pattern-room long text producer works with producer orchestration", () => {
  const producer = createLongTextProducer({
    now: () => FIXED_NOW,
    maxSegmentLength: 50,
  });
  const result = produceAndImportSource(producer, createLongTextInput());

  assert.equal(result.packagesProduced.length, 1);
  assert.equal(result.packagesImported, 1);
  assert.deepEqual(result.errors, []);
  assert.equal(result.importResults[0]?.sourceKind, "article");
  assert.equal(result.stats.totalSources, 1);
  assert.equal(result.stats.totalEvidence, 0);
  assert.equal(result.stats.totalNodes, 0);
});

void test("pattern-room long text producer rejects oversized text", () => {
  const producer = createLongTextProducer({
    now: () => FIXED_NOW,
    maxInputSizeHint: 5,
  });
  const validation = producer.validateInput(createLongTextInput({ text: "123456" }));

  assert.equal(validation.valid, false);
  assert.equal(
    validation.errors.some((error) => error.code === "input-too-large"),
    true
  );
});

void test("pattern-room long text producer does not mutate input", () => {
  const producer = createLongTextProducer({ now: () => FIXED_NOW });
  const input = createLongTextInput();
  const before = JSON.stringify(input);

  producer.produce(input);

  assert.equal(JSON.stringify(input), before);
});

void test("pattern-room long text producer stays pure and disconnected from runtime surfaces", async () => {
  const files = [
    "rooms/pattern-room/shared/source-producers/producers/long-text-segmenter.ts",
    "rooms/pattern-room/shared/source-producers/producers/long-text-producer.ts",
    "rooms/pattern-room/shared/source-producers/types/producer-input.ts",
  ];
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
    /from\s+["'][^"']*(?:host|ui|runtime|electron|laboratory)/,
    /from\s+["'][^"']*(?:ai|provider|relay|youtube|subtitle)/i,
    /pdf/i,
    /ocr/i,
    /PatternRoomLocalOverlay/,
    /applySourceImportResult\s*\(/,
  ];

  const fileSources = await Promise.all(
    files.map(async (file) => {
      const source = await readFile(resolve(file), "utf8");
      return { file, source };
    })
  );
  for (const { file, source } of fileSources) {
    for (const pattern of prohibitedPatterns) {
      assert.equal(pattern.test(source), false, `${file} matched ${String(pattern)}`);
    }
  }
});
