import assert from "node:assert/strict";
import test from "node:test";

import { createAdvancedAudioForensicsRunners } from "../../rooms/laboratory/features/audio-analysis/host/process-advanced-forensics-runners.ts";

type TestRecord = Record<string, unknown>;

type FilteredAudioCall = {
  artifactBase: string;
  filterGraph: string;
  label: string;
  metadata: TestRecord;
  outputExtension: string | undefined;
};

type ProfileToolCall = {
  args: string[];
  cwd: string;
  jobId: string;
  requestId: string;
  timeoutMs: number;
  toolId: string;
};

function createHarness() {
  const filteredAudioCalls: FilteredAudioCall[] = [];
  const profileToolCalls: ProfileToolCall[] = [];
  let artifactCounter = 0;
  const runners = createAdvancedAudioForensicsRunners({
    createProcessArtifact(moduleId, artifactKind, filePath, label, metadata) {
      artifactCounter += 1;
      return {
        id: `artifact-${artifactCounter}`,
        moduleId,
        kind: artifactKind,
        path: filePath,
        label,
        metadata,
      };
    },
    createProcessFinding(
      moduleId,
      findingKind,
      level,
      confidence,
      title,
      detail,
      evidenceCount,
      artifactIds
    ) {
      return {
        moduleId,
        kind: findingKind,
        level,
        confidence,
        title,
        detail,
        evidenceCount,
        artifactIds,
      };
    },
    async ensureProcessRuntimeDirectories() {
      await Promise.resolve();
    },
    async generateFilteredAudioArtifact(
      _runtime,
      _project,
      _requestId,
      _jobId,
      _target,
      artifactBase,
      _outputDir,
      moduleId,
      filterGraph,
      label,
      metadata,
      outputExtension
    ) {
      filteredAudioCalls.push({
        artifactBase,
        filterGraph,
        label,
        metadata,
        outputExtension,
      });
      artifactCounter += 1;
      return {
        id: `artifact-${artifactCounter}`,
        moduleId,
        kind: "audio-variant",
        path: `/tmp/${artifactBase}.${outputExtension ?? "wav"}`,
        label,
        metadata,
      };
    },
    async runProfileTool(_runtime, request) {
      profileToolCalls.push({
        args: request.args.slice(),
        cwd: request.cwd,
        jobId: request.jobId,
        requestId: request.requestId,
        timeoutMs: request.timeoutMs,
        toolId: request.toolId,
      });
      await Promise.resolve();
    },
    toRecord(value) {
      return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as TestRecord)
        : {};
    },
  });

  async function baseRunner() {
    return await Promise.resolve({
      artifacts: [
        {
          id: "base-artifact",
          kind: "base",
          path: "/tmp/base.dat",
        },
      ],
      findings: [],
      status: "ready",
      summary: "Base analysis complete.",
      warnings: [],
    });
  }

  const args = [
    {},
    {},
    "request-advanced-audio",
    "job-advanced-audio",
    { path: "/tmp/source.wav" },
    "advanced-audio",
    "/tmp/advanced-audio",
  ] as const;

  return {
    args,
    baseRunner,
    filteredAudioCalls,
    profileToolCalls,
    runners,
  };
}

void test("advanced spectral artifacts add 0-20 Hz and inverse-spectrum maps", async () => {
  const harness = createHarness();
  const runner = harness.runners.augmentSpectralArtifacts(harness.baseRunner);

  const result = await runner(...harness.args, "spectral-artifacts");

  assert.equal(harness.profileToolCalls.length, 2);
  const filterGraphs = harness.profileToolCalls.map(function (call) {
    const filterIndex = call.args.indexOf("-lavfi");
    return filterIndex >= 0 ? call.args[filterIndex + 1] ?? "" : "";
  });
  assert.equal(
    filterGraphs.some((filterGraph) => filterGraph.includes("start=0:stop=20")),
    true
  );
  assert.equal(filterGraphs.some((filterGraph) => filterGraph.endsWith(",vflip")), true);
  assert.deepEqual(
    result.artifacts.slice(1).map((artifact) => artifact["kind"]),
    ["subsonic-energy-map", "inverse-spectrum-map"]
  );
  assert.equal(
    result.warnings.some((warning) => warning.includes("visualization transform only")),
    true
  );
});

void test("spectrogram-guided recovery adds pitch-preserving 0.1x 0.25x and 0.5x variants", async () => {
  const harness = createHarness();
  const runner = harness.runners.augmentSpectrogramGuidedRecovery(harness.baseRunner);

  const result = await runner(...harness.args, "spectrogram-guided-recovery");

  assert.equal(harness.filteredAudioCalls.length, 3);
  assert.deepEqual(
    harness.filteredAudioCalls.map((call) => call.filterGraph),
    [
      "atempo=0.5,atempo=0.5,atempo=0.5,atempo=0.8",
      "atempo=0.5,atempo=0.5",
      "atempo=0.5",
    ]
  );
  assert.deepEqual(
    harness.filteredAudioCalls.map((call) => call.metadata["tempoScale"]),
    [0.1, 0.25, 0.5]
  );
  assert.equal(
    harness.filteredAudioCalls.every((call) => call.metadata["pitchPreserved"] === true),
    true
  );
  assert.equal(result.artifacts.length, 4);
});

void test("frequency-shift reversal adds tempo-compensated pitch exploration variants", async () => {
  const harness = createHarness();
  const runner = harness.runners.augmentFrequencyShiftReversal(harness.baseRunner);

  const result = await runner(...harness.args, "frequency-shift-reversal");

  assert.equal(harness.filteredAudioCalls.length, 4);
  assert.deepEqual(
    harness.filteredAudioCalls.map((call) => call.metadata["semitones"]),
    [-12, -6, 6, 12]
  );
  const minusOctave = harness.filteredAudioCalls[0]?.filterGraph ?? "";
  const plusOctave = harness.filteredAudioCalls[3]?.filterGraph ?? "";
  assert.match(minusOctave, /asetrate=24000/);
  assert.match(minusOctave, /atempo=2(?:,|$)/);
  assert.match(plusOctave, /asetrate=96000/);
  assert.match(plusOctave, /atempo=0\.5(?:,|$)/);
  assert.equal(
    harness.filteredAudioCalls.every((call) => call.metadata["tempoCompensated"] === true),
    true
  );
  assert.equal(result.artifacts.length, 5);
});
