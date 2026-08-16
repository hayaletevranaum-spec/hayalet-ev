import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import {
  createLongTextProducer,
  createUserTextProducer,
  produceAndImportSource,
  type LongTextInput,
  type PastedTextInput,
  type SourceProducer,
} from "../../rooms/pattern-room/shared/source-producers/index.ts";
import type { SourcePackage } from "../../rooms/pattern-room/shared/source-workbench/index.ts";

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

function createLongTextInput(partial: Partial<LongTextInput> = {}): LongTextInput {
  return {
    inputKind: "long_text",
    title: "Arşiv kitabı",
    origin: "archive:book",
    sourceKind: "book",
    text:
      "Birinci uzun metin paragrafı tek kaynak paketinin ilk segmentidir.\n\n" +
      "İkinci uzun metin paragrafı aynı kaynak paketinde ikinci segment olarak kalır.",
    language: "tr",
    ...partial,
  };
}

function createMinimalSourcePackage(partial: Partial<SourcePackage> = {}): SourcePackage {
  return {
    sourcePackageId: "orchestration-package",
    sourceKind: "user_text",
    title: "Orchestration package",
    origin: "manual:orchestration-package",
    language: "tr",
    createdAt: FIXED_NOW,
    sourceItems: [],
    cleanedText: "Orchestration source text.",
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

void test("pattern-room source producer orchestration imports valid user text output", () => {
  const producer = createUserTextProducer({ now: () => FIXED_NOW });
  const result = produceAndImportSource(producer, createPastedTextInput());

  assert.equal(result.packagesProduced.length, 1);
  assert.equal(result.packagesImported, 1);
  assert.equal(result.importResults.length, 1);
  assert.deepEqual(result.errors, []);

  const packageResult = result.importResults[0];
  assert.ok(packageResult);
  assert.equal(packageResult.packageId, result.packagesProduced[0]?.sourcePackageId);
  assert.equal(packageResult.sourceKind, "user_text");
  assert.equal(packageResult.importResult.sources.length, 1);
  assert.equal(packageResult.importResult.sources[0]?.sourceKind, "user_text");
  assert.equal(packageResult.importResult.sources[0].note, createPastedTextInput().text);
  assert.equal(result.stats.packagesProduced, 1);
  assert.equal(result.stats.packagesImported, 1);
  assert.equal(result.stats.packagesFailed, 0);
  assert.equal(result.stats.totalSources, 1);
});

void test("pattern-room source producer orchestration imports long text as a source-only package", () => {
  const producer = createLongTextProducer({ now: () => FIXED_NOW });
  const result = produceAndImportSource(
    producer,
    createLongTextInput({
      sourceKind: "article",
      origin: "archive:article",
    })
  );

  assert.equal(result.packagesProduced.length, 1);
  assert.equal(result.packagesImported, 1);
  assert.equal(result.importResults.length, 1);
  assert.deepEqual(result.errors, []);

  const producedPackage = result.packagesProduced[0];
  const packageResult = result.importResults[0];
  assert.ok(producedPackage);
  assert.ok(packageResult);
  assert.equal(producedPackage.sourceKind, "article");
  assert.equal(producedPackage.segments.length, 2);
  assert.deepEqual(producedPackage.quotes, []);
  assert.deepEqual(producedPackage.observations, []);
  assert.deepEqual(producedPackage.motifs, []);
  assert.equal(packageResult.sourceKind, "article");
  assert.equal(packageResult.importResult.sources.length, 1);
  assert.equal(packageResult.importResult.sources[0]?.sourceKind, "article");
  assert.deepEqual(packageResult.importResult.evidence, []);
  assert.deepEqual(packageResult.importResult.nodes, []);
  assert.equal(result.stats.totalSources, 1);
  assert.equal(result.stats.totalEvidence, 0);
  assert.equal(result.stats.totalNodes, 0);
});

void test("pattern-room source producer orchestration rejects invalid user text without import", () => {
  const producer = createUserTextProducer({ now: () => FIXED_NOW });
  const result = produceAndImportSource(producer, createPastedTextInput({ text: " \n\t " }));

  assert.deepEqual(result.packagesProduced, []);
  assert.equal(result.packagesImported, 0);
  assert.deepEqual(result.importResults, []);
  assert.equal(result.errors[0]?.code, "blank-text");
  assert.equal(result.stats.packagesProduced, 0);
  assert.equal(result.stats.packagesImported, 0);
});

void test("pattern-room source producer orchestration keeps oversized user text invalid", () => {
  const producer = createUserTextProducer({ now: () => FIXED_NOW });
  const oversizedText = "x".repeat(producer.capabilities.maxInputSizeHint + 1);
  const result = produceAndImportSource(producer, createPastedTextInput({ text: oversizedText }));

  assert.deepEqual(result.packagesProduced, []);
  assert.deepEqual(result.importResults, []);
  assert.equal(
    result.errors.some((error) => error.code === "input-too-large"),
    true
  );
});

void test("pattern-room source producer orchestration stops on producer errors", () => {
  const packageWithError = createMinimalSourcePackage();
  const producer: SourceProducer<PastedTextInput> = {
    producerId: "mock_error_producer",
    producerType: "user_text",
    sourceKind: "user_text",
    inputKind: "pasted_text",
    capabilities: {
      supportsPreview: false,
      supportsMultiPackage: false,
      requiresHost: false,
      maxInputSizeHint: 1_000,
    },
    validateInput() {
      return {
        valid: true,
        errors: [],
        warnings: [],
      };
    },
    getPreview() {
      return null;
    },
    produce() {
      return {
        packages: [packageWithError],
        errors: [
          {
            code: "producer-failed",
            message: "Producer returned a package with an error.",
          },
        ],
        warnings: [],
      };
    },
  };

  const result = produceAndImportSource(producer, createPastedTextInput(), {
    stopOnProducerError: false,
  });

  assert.equal(result.packagesProduced.length, 1);
  assert.equal(result.packagesImported, 0);
  assert.deepEqual(result.importResults, []);
  assert.equal(result.errors[0]?.code, "producer-failed");
  assert.equal(result.stats.packagesFailed, 1);
  assert.equal(result.stats.totalSources, 0);
});

void test("pattern-room source producer orchestration rejects malformed produced packages", () => {
  const malformedPackage = {
    ...createMinimalSourcePackage(),
    sourceKind: "not-a-source-kind",
  } as unknown as SourcePackage;
  const producer: SourceProducer<PastedTextInput> = {
    producerId: "mock_malformed_package_producer",
    producerType: "user_text",
    sourceKind: "user_text",
    inputKind: "pasted_text",
    capabilities: {
      supportsPreview: false,
      supportsMultiPackage: false,
      requiresHost: false,
      maxInputSizeHint: 1_000,
    },
    validateInput() {
      return {
        valid: true,
        errors: [],
        warnings: [],
      };
    },
    getPreview() {
      return null;
    },
    produce() {
      return {
        packages: [malformedPackage],
        errors: [],
        warnings: [],
      };
    },
  };

  const result = produceAndImportSource(producer, createPastedTextInput());

  assert.equal(result.packagesProduced.length, 1);
  assert.equal(result.packagesImported, 0);
  assert.deepEqual(result.importResults, []);
  assert.equal(result.errors[0]?.code, "invalid-source-package");
  assert.equal(result.stats.packagesFailed, 1);
  assert.equal(result.stats.totalSources, 0);
});

void test("pattern-room source producer orchestration aggregates import warnings", () => {
  const producer = createUserTextProducer({ now: () => FIXED_NOW });
  const input = createPastedTextInput();
  const producedId = producer.produce(input).packages[0]?.sourcePackageId;
  assert.ok(producedId != null);

  const result = produceAndImportSource(producer, input, {
    importOptions: {
      existingPackageIds: [producedId],
    },
  });

  assert.equal(result.packagesProduced.length, 1);
  assert.equal(result.packagesImported, 1);
  assert.equal(result.importResults.length, 1);
  assert.equal(result.importResults[0]?.importResult.sources.length, 0);
  assert.equal(
    result.warnings.some((warning) => warning.code === "duplicate-package"),
    true
  );
  assert.equal(result.stats.totalWarnings, 1);
});

void test("pattern-room source producer orchestration boundaries stay pure", async () => {
  const orchestratorSource = await readFile(
    resolve(
      "rooms/pattern-room/shared/source-producers/orchestration/producer-import-orchestrator.ts"
    ),
    "utf8"
  );
  const prohibitedOrchestratorPatterns = [
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
    /localState/,
    /applySourceImportResult\s*\(/,
    /from\s+["'][^"']*(?:host|ui|runtime)/,
  ];

  for (const pattern of prohibitedOrchestratorPatterns) {
    assert.equal(pattern.test(orchestratorSource), false, String(pattern));
  }

  const sourceWorkbenchFiles = await walkTypeScriptFiles(
    resolve("rooms/pattern-room/shared/source-workbench")
  );
  const workbenchSources = await Promise.all(
    sourceWorkbenchFiles.map(async (filePath) => {
      const source = await readFile(filePath, "utf8");
      return { filePath, source };
    })
  );
  for (const { filePath, source } of workbenchSources) {
    assert.equal(
      source.includes("source-producers"),
      false,
      `${relative(process.cwd(), filePath)} imports source-producers`
    );
  }

  const uiRuntimeSource = await readFile(
    resolve("rooms/pattern-room/ui/pattern-room-ui-runtime.ts"),
    "utf8"
  );
  assert.match(uiRuntimeSource, /createUserTextProducer/);
  assert.match(uiRuntimeSource, /createLongTextProducer/);
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
    assert.equal(source.includes("produceAndImportSource"), false, filePath);
  }
});
