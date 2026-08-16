import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import {
  createUserTextProducer,
  type PastedTextInput,
} from "../../rooms/pattern-room/shared/source-producers/index.ts";
import {
  importSourcePackage,
  parseSourcePackage,
} from "../../rooms/pattern-room/shared/source-workbench/index.ts";

const FIXED_NOW = "2026-01-01T00:00:00.000Z";

function createPastedTextInput(partial: Partial<PastedTextInput> = {}): PastedTextInput {
  return {
    inputKind: "pasted_text",
    text: "Bir iz tekrar ediyorsa, onu tek olay gibi okumamak gerekir.",
    title: "Tekrarlayan iz notu",
    language: "tr",
    ...partial,
  };
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

void test("pattern-room user text producer rejects empty text", () => {
  const producer = createUserTextProducer({ now: () => FIXED_NOW });
  const validation = producer.validateInput(createPastedTextInput({ text: "" }));

  assert.equal(validation.valid, false);
  assert.equal(validation.errors[0]?.code, "empty-text");
});

void test("pattern-room user text producer rejects whitespace-only text", () => {
  const producer = createUserTextProducer({ now: () => FIXED_NOW });
  const validation = producer.validateInput(createPastedTextInput({ text: " \n\t " }));

  assert.equal(validation.valid, false);
  assert.equal(validation.errors[0]?.code, "blank-text");
});

void test("pattern-room user text producer rejects oversized text", () => {
  const producer = createUserTextProducer({ now: () => FIXED_NOW });
  const oversizedText = "x".repeat(producer.capabilities.maxInputSizeHint + 1);
  const input = createPastedTextInput({ text: oversizedText });

  const validation = producer.validateInput(input);
  const result = producer.produce(input);

  assert.equal(validation.valid, false);
  assert.equal(
    validation.errors.some((error) => error.code === "input-too-large"),
    true
  );
  assert.deepEqual(result.packages, []);
  assert.equal(
    result.errors.some((error) => error.code === "input-too-large"),
    true
  );
});

void test("pattern-room user text producer accepts valid pasted text", () => {
  const producer = createUserTextProducer({ now: () => FIXED_NOW });
  const validation = producer.validateInput(createPastedTextInput());

  assert.equal(validation.valid, true);
  assert.deepEqual(validation.errors, []);
  assert.deepEqual(validation.warnings, []);
});

void test("pattern-room user text producer previews one package for valid text", () => {
  const producer = createUserTextProducer({ now: () => FIXED_NOW });
  const preview = producer.getPreview(createPastedTextInput());

  assert.ok(preview);
  assert.equal(preview.estimatedPackageCount, 1);
  assert.equal(preview.estimatedItemCount, 1);
  assert.equal(preview.sampleTitle, "Tekrarlayan iz notu");
  assert.deepEqual(preview.warnings, []);
});

void test("pattern-room user text producer produces one raw SourcePackage", () => {
  const producer = createUserTextProducer({ now: () => FIXED_NOW });
  const input = createPastedTextInput({
    text: "  Ham metin ilk satır.\nİkinci satır.  ",
  });
  delete input.title;
  delete input.language;
  const result = producer.produce(input);

  assert.deepEqual(result.errors, []);
  assert.equal(result.packages.length, 1);

  const pkg = result.packages[0];
  assert.ok(pkg);
  assert.match(pkg.sourcePackageId, /^source-package-user-text-/);
  assert.equal(pkg.sourceKind, "user_text");
  assert.equal(pkg.title, "Ham metin ilk satır.");
  assert.equal(pkg.origin, "Kullanıcı metni");
  assert.equal(pkg.language, "tr");
  assert.equal(pkg.createdAt, FIXED_NOW);
  assert.equal(pkg.cleanedText, "Ham metin ilk satır.\nİkinci satır.");
  assert.deepEqual(pkg.segments, []);
  assert.deepEqual(pkg.quotes, []);
  assert.deepEqual(pkg.observations, []);
  assert.deepEqual(pkg.motifs, []);
  assert.deepEqual(pkg.uncertainties, []);
  assert.deepEqual(pkg.numericPatterns, []);
  assert.deepEqual(pkg.references, []);
  assert.deepEqual(pkg.metadata, {
    producerId: "user_text_producer",
    inputKind: "pasted_text",
    generatedBy: "source-producer",
  });

  assert.equal(pkg.sourceItems.length, 1);
  assert.equal(pkg.sourceItems[0]?.content, "Ham metin ilk satır.\nİkinci satır.");
  assert.equal(pkg.sourceItems[0].order, 0);
  assert.equal(pkg.sourceItems[0].timecodeStart, null);
  assert.equal(pkg.sourceItems[0].timecodeEnd, null);
  assert.deepEqual(pkg.sourceItems[0].metadata, {
    producerId: "user_text_producer",
  });
});

void test("pattern-room user text producer returns errors without packages for invalid input", () => {
  const producer = createUserTextProducer({ now: () => FIXED_NOW });
  const result = producer.produce(createPastedTextInput({ text: "   " }));

  assert.deepEqual(result.packages, []);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0]?.code, "blank-text");
});

void test("pattern-room source package parser keeps old and new item shapes compatible", () => {
  const oldShape = parseSourcePackage({
    sourcePackageId: "old-item-shape-package",
    sourceKind: "user_text",
    title: "Old item shape",
    origin: "manual:old-item-shape",
    language: "tr",
    createdAt: FIXED_NOW,
    sourceItems: [
      {
        sourceItemId: "old-item-1",
        label: "Old item",
        origin: "manual:old-item-1",
        metadata: {},
      },
    ],
  });
  assert.ok(oldShape);
  assert.equal(oldShape.sourceItems[0]?.sourceItemId, "old-item-1");
  assert.equal(oldShape.sourceItems[0].content, null);
  assert.equal(oldShape.sourceItems[0].order, null);
  assert.equal(oldShape.sourceItems[0].timecodeStart, null);
  assert.equal(oldShape.sourceItems[0].timecodeEnd, null);

  const newShape = parseSourcePackage({
    sourcePackageId: "new-item-shape-package",
    sourceKind: "user_text",
    title: "New item shape",
    origin: "manual:new-item-shape",
    language: "tr",
    createdAt: FIXED_NOW,
    sourceItems: [
      {
        sourceItemId: "new-item-1",
        label: "New item",
        content: "New item content.",
        order: 0,
        timecodeStart: null,
        timecodeEnd: null,
        origin: "manual:new-item-1",
        metadata: {},
      },
    ],
  });
  assert.ok(newShape);
  assert.equal(newShape.sourceItems[0]?.content, "New item content.");
  assert.equal(newShape.sourceItems[0].order, 0);
  assert.equal(newShape.sourceItems[0].timecodeStart, null);
  assert.equal(newShape.sourceItems[0].timecodeEnd, null);
});

void test("pattern-room user text producer output parses and imports through Source Workbench", () => {
  const producer = createUserTextProducer({ now: () => FIXED_NOW });
  const produced = producer.produce(createPastedTextInput()).packages[0];

  assert.ok(produced);
  const parsed = parseSourcePackage(produced);
  assert.ok(parsed);
  assert.equal(parsed.sourceItems[0]?.content, createPastedTextInput().text);

  const importResult = importSourcePackage(parsed);
  assert.equal(importResult.sources.length, 1);
  assert.equal(importResult.sources[0]?.sourceKind, "user_text");
  assert.equal(importResult.sources[0].note, createPastedTextInput().text);
  assert.deepEqual(importResult.evidence, []);
  assert.deepEqual(importResult.nodes, []);
  assert.deepEqual(importResult.edges, []);
});

void test("pattern-room user text producer does not mutate input", () => {
  const producer = createUserTextProducer({ now: () => FIXED_NOW });
  const input = createPastedTextInput();
  const before = JSON.stringify(input);

  producer.produce(input);

  assert.equal(JSON.stringify(input), before);
});

void test("pattern-room source producers stay pure and disconnected from runtime surfaces", async () => {
  const producerFiles = await walkTypeScriptFiles(
    resolve("rooms/pattern-room/shared/source-producers")
  );
  const prohibitedProducerPatterns = [
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
    /applySourceImportResult\s*\(/,
  ];
  const producerCoreFiles = producerFiles.filter(
    (filePath) => filePath.includes(`${join("source-producers", "orchestration")}`) === false
  );
  const prohibitedCoreProducerPatterns = [/importSourcePackage\s*\(/];

  const producerFileSources = await Promise.all(
    producerFiles.map(async (filePath) => {
      const source = await readFile(filePath, "utf8");
      return { filePath, source };
    })
  );
  for (const { filePath, source } of producerFileSources) {
    const relativePath = relative(process.cwd(), filePath);
    for (const pattern of prohibitedProducerPatterns) {
      assert.equal(pattern.test(source), false, `${relativePath} matched ${String(pattern)}`);
    }
  }

  const producerCoreSources = await Promise.all(
    producerCoreFiles.map(async (filePath) => {
      const source = await readFile(filePath, "utf8");
      return { filePath, source };
    })
  );
  for (const { filePath, source } of producerCoreSources) {
    const relativePath = relative(process.cwd(), filePath);
    for (const pattern of prohibitedCoreProducerPatterns) {
      assert.equal(pattern.test(source), false, `${relativePath} matched ${String(pattern)}`);
    }
  }

  const uiRuntimeSource = await readFile(
    resolve("rooms/pattern-room/ui/pattern-room-ui-runtime.ts"),
    "utf8"
  );
  assert.match(uiRuntimeSource, /createUserTextProducer/);
  assert.match(uiRuntimeSource, /produceAndImportSource/);
  assert.match(uiRuntimeSource, /applySourceImportResult/);

  const protectedFiles = [
    "rooms/pattern-room/ui/pattern-source-import-demo.ts",
    "rooms/pattern-room/host/runtime.ts",
    "rooms/pattern-room/shared/state/pattern-room-local-state.ts",
    "rooms/pattern-room/shared/types/pattern-room-snapshot.ts",
  ];

  const protectedSources = await Promise.all(
    protectedFiles.map(async (filePath) => {
      const source = await readFile(resolve(filePath), "utf8");
      return { filePath, source };
    })
  );
  for (const { filePath, source } of protectedSources) {
    assert.equal(source.includes("source-producers"), false, filePath);
    assert.equal(source.includes("createUserTextProducer"), false, filePath);
  }
});
