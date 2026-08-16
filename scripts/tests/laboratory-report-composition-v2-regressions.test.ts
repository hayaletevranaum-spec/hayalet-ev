import test from "node:test";
import assert from "node:assert/strict";

import type { LabRun } from "../../rooms/laboratory/domain/lab-types.ts";
import { createAudioAnalysisParserRuntime } from "../../rooms/laboratory/features/audio-analysis/host/analysis-parsers.ts";
import { buildForensicSignatureMapping } from "../../rooms/laboratory/services/forensic-signature-mapper.ts";
import { buildAiReport, buildUserReport } from "../../rooms/laboratory/services/report-builder.ts";
import { createLaboratoryReportExportRuntime } from "../../rooms/laboratory/shared/host/reporting-export.ts";

function createReportExportHarness(
  options: {
    getElectronApi?: () => {
      showOpenDialog?: (dialogOptions: Record<string, unknown>) => Promise<{
        canceled?: boolean;
        filePaths?: string[];
      }>;
    } | null;
  } = {}
) {
  const writes: Array<{ path: string; value: string }> = [];
  let persistedExports: Array<Record<string, unknown>> = [];
  const project = {
    id: "project-1",
    slug: "lab-project",
    report: {
      records: {
        "media-analysis": {
          exports: [],
        },
      },
    },
  };
  const deps: Parameters<typeof createLaboratoryReportExportRuntime>[0] = {
    buildReportMarkdown() {
      return "# Laboratory Report";
    },
    clearJob() {},
    composeFeatureReport() {
      return {
        status: "ready",
        aiReport: { version: 2 },
        userReport: { summary: "User report", audience: "user" },
        artifacts: [
          {
            kind: "legacy-ai-payload",
            path: "/tmp/legacy-ai-payload.json",
            fileName: "legacy-ai-payload.json",
          },
          {
            kind: "legacy-channel-batch",
            path: "/tmp/legacy-channel-batch.json",
            fileName: "legacy-channel-batch.json",
          },
        ],
        exports: [],
      };
    },
    async ensureProjectDirectories() {
      await Promise.resolve();
    },
    ensureReportJobSlotAvailable() {},
    getActiveProject() {
      return project;
    },
    getFeatureReportDir() {
      return "/tmp/reports";
    },
    getFeatureReportExportAction() {
      return "report-export";
    },
    getFeatureReportRecord(nextProject: Record<string, unknown>, featureId: string) {
      const records = (nextProject["report"] as Record<string, unknown>)["records"] as Record<string, unknown>;
      const value = records[featureId];
      return (value ?? {}) as Record<string, unknown>;
    },
    normalizeReportExport(value: unknown) {
      const source = value as Record<string, unknown>;
      return {
        id: String((source["fileName"] as string | undefined) ?? (source["path"] as string | undefined) ?? "export"),
        format: String((source["format"] as string | undefined) ?? "md"),
        path: (source["path"]) ?? null,
        fileName: (source["fileName"]) ?? null,
        reportView: (source["reportView"]) ?? null,
        createdAt: "2026-04-20T10:00:00.000Z",
        status: String((source["status"] as string | undefined) ?? "ready"),
      };
    },
    async patchActiveProject(_runtime, patcher) {
      patcher(project);
      await Promise.resolve();
    },
    pushJobState() {},
    registerJob() {
      return {};
    },
    sanitizeFileSegment(value: unknown, fallback: string) {
      return typeof value === "string" && value.trim() !== "" ? value : fallback;
    },
    setFeatureReportRecord(nextProject: Record<string, unknown>, featureId: string, record) {
      ((nextProject["report"] as Record<string, unknown>)["records"] as Record<string, unknown>)[
        featureId
      ] = record;
      persistedExports = Array.isArray((record as Record<string, unknown>)["exports"])
        ? ((record as Record<string, unknown>)["exports"] as Array<Record<string, unknown>>)
        : [];
    },
    async writeTextFile(path: string, value: string) {
      writes.push({ path, value });
      await Promise.resolve();
    },
  };
  if (options.getElectronApi !== undefined) {
    deps.getElectronApi = options.getElectronApi;
  }
  const runtime = createLaboratoryReportExportRuntime(deps);

  return {
    get persistedExports() {
      return persistedExports;
    },
    runtime,
    writes,
  };
}

function createInsightRun(overrides: Partial<LabRun> = {}): LabRun {
  const baseRun: LabRun = {
    id: "run-insight",
    state: "ready",
    startedAt: 1_000,
    endedAt: 4_000,
    modules: {
      audio: { id: "audio", status: "ready" },
      motion: { id: "motion", status: "ready" },
      "visual-signal": { id: "visual-signal", status: "ready" },
    },
    moduleOrder: ["motion", "audio", "visual-signal"],
    events: [],
    rawLog: [],
    artifacts: [],
    findings: [],
    liveFindings: [],
    warnings: [],
    error: null,
    targetLabel: "clip.mp4",
    progress: 100,
    emptyReason: null,
    analysisScope: null,
    previewArtifacts: [],
    confidence: "medium",
    moduleTrace: [],
    comparisonVariants: [],
    hypothesisSummary: null,
  };

  return {
    ...baseRun,
    ...overrides,
    artifacts: overrides.artifacts ?? baseRun.artifacts,
    findings: overrides.findings ?? baseRun.findings,
    moduleOrder: overrides.moduleOrder ?? baseRun.moduleOrder,
    modules: overrides.modules ?? baseRun.modules,
  };
}

void test("laboratory report export persists only canonical user and AI report files", async () => {
  const harness = createReportExportHarness();

  await harness.runtime.exportFeatureReport({}, {}, "req-1", "media-analysis");

  assert.equal(harness.writes.length, 2);
  assert.equal(harness.persistedExports.length, 2);
  assert.equal(
    harness.persistedExports.some((entry) => entry["fileName"] === "legacy-ai-payload.json"),
    false
  );
  assert.equal(
    harness.persistedExports.some((entry) => entry["fileName"] === "legacy-channel-batch.json"),
    false
  );
});

void test("laboratory report JSON overlay export writes one selected-folder JSON file", async () => {
  const harness = createReportExportHarness();

  await harness.runtime.exportFeatureReport({}, {}, "req-json", "media-analysis", {
    format: "json",
    targetDirectory: "/selected/reports",
  });

  assert.equal(harness.writes.length, 1);
  assert.match(harness.writes[0]?.path ?? "", /^\/selected\/reports\/lab-project-media-analysis-/);
  assert.match(harness.writes[0]?.path ?? "", /-ai\.json$/);
  assert.deepEqual(JSON.parse(harness.writes[0]?.value ?? "{}"), { version: 2 });
  assert.equal(harness.persistedExports.length, 1);
  assert.equal(harness.persistedExports[0]?.["format"], "json");
});

void test("laboratory report JSON overlay export opens a host folder picker", async () => {
  const dialogOptions: Array<Record<string, unknown>> = [];
  const harness = createReportExportHarness({
    getElectronApi() {
      return {
        async showOpenDialog(options) {
          dialogOptions.push(options);
          return { canceled: false, filePaths: ["/picked/reports"] };
        },
      };
    },
  });

  await harness.runtime.exportFeatureReport({}, {}, "req-json-picker", "media-analysis", {
    format: "json",
  });

  assert.equal(dialogOptions.length, 1);
  assert.deepEqual(dialogOptions[0]?.["properties"], ["openDirectory", "createDirectory"]);
  assert.match(harness.writes[0]?.path ?? "", /^\/picked\/reports\/lab-project-media-analysis-/);
  assert.match(harness.writes[0]?.path ?? "", /-ai\.json$/);
});

void test("laboratory report overlay export cancels cleanly when folder picking is cancelled", async () => {
  const harness = createReportExportHarness({
    getElectronApi() {
      return {
        async showOpenDialog() {
          return { canceled: true, filePaths: [] };
        },
      };
    },
  });

  const result = await harness.runtime.exportFeatureReport(
    {},
    {},
    "req-json-cancel",
    "media-analysis",
    {
      format: "json",
    }
  );

  assert.deepEqual(result, { cancelled: true });
  assert.equal(harness.writes.length, 0);
  assert.equal(harness.persistedExports.length, 0);
});

void test("laboratory report PDF overlay export writes one selected-folder PDF file", async () => {
  const harness = createReportExportHarness();

  await harness.runtime.exportFeatureReport({}, {}, "req-pdf", "media-analysis", {
    format: "pdf",
    targetDirectory: "/selected/reports",
  });

  assert.equal(harness.writes.length, 1);
  assert.match(harness.writes[0]?.path ?? "", /^\/selected\/reports\/lab-project-media-analysis-/);
  assert.match(harness.writes[0]?.path ?? "", /-user\.pdf$/);
  assert.equal(harness.writes[0]?.value.startsWith("%PDF-1.4"), true);
  assert.equal(harness.persistedExports.length, 1);
  assert.equal(harness.persistedExports[0]?.["format"], "pdf");
});

void test("laboratory report JSON overlay export writes the selected user report", async () => {
  const harness = createReportExportHarness();

  await harness.runtime.exportFeatureReport({}, {}, "req-user-json", "media-analysis", {
    format: "json",
    reportView: "user",
    targetDirectory: "/selected/reports",
  });

  assert.equal(harness.writes.length, 1);
  assert.match(harness.writes[0]?.path ?? "", /-user\.json$/);
  assert.deepEqual(JSON.parse(harness.writes[0]?.value ?? "{}"), {
    audience: "user",
    summary: "User report",
  });
  assert.equal(harness.persistedExports[0]?.["reportView"], "user");
});

void test("laboratory report PDF overlay export writes the selected technical report", async () => {
  const harness = createReportExportHarness();

  await harness.runtime.exportFeatureReport({}, {}, "req-ai-pdf", "media-analysis", {
    format: "pdf",
    reportView: "ai",
    targetDirectory: "/selected/reports",
  });

  assert.equal(harness.writes.length, 1);
  assert.match(harness.writes[0]?.path ?? "", /-ai\.pdf$/);
  assert.equal(harness.writes[0]?.value.startsWith("%PDF-1.4"), true);
  assert.match(harness.writes[0].value, /Technical Payload/);
  assert.equal(harness.persistedExports[0]?.["reportView"], "ai");
});

void test("laboratory reports surface temporal correlation, narrative cues, and forensic notes", () => {
  const run: LabRun = {
    id: "run-correlated",
    state: "ready",
    startedAt: 1_000,
    endedAt: 4_000,
    modules: {
      audio: { id: "audio", status: "ready" },
      motion: { id: "motion", status: "ready" },
      "visual-signal": { id: "visual-signal", status: "ready" },
    },
    moduleOrder: ["motion", "audio", "visual-signal"],
    events: [],
    rawLog: [],
    artifacts: [
      {
        id: "frame-preview",
        moduleId: "motion",
        kind: "frame-preview",
        path: "/tmp/frame.png",
        fileName: "frame.png",
        previewUrl: null,
        createdAt: "2026-05-20T10:00:00.000Z",
      },
    ],
    findings: [
      {
        id: "freeze-finding",
        moduleId: "motion",
        sourceModule: "frame-consistency",
        title: "Frame consistency anomaly detected",
        detail: "The active video target contains one freeze interval.",
        level: "medium",
        confidence: "medium",
        kind: "measured",
        evidenceCount: 1,
        artifactIds: ["frame-preview"],
        metadata: {
          correlation: { signalType: "freeze", label: "freeze", window: { startSeconds: 12 } },
          probeSummary: {
            freeze: {
              count: 1,
              maxDurationSeconds: 0.7,
              totalDurationSeconds: 0.7,
            },
          },
          temporalSegments: [{ startSeconds: 12, endSeconds: 12.7, durationSeconds: 0.7 }],
        },
      },
      {
        id: "audio-finding",
        moduleId: "audio",
        title: "Silence pockets detected",
        detail: "Silence detection found one pocket.",
        level: "medium",
        confidence: "medium",
        kind: "measured",
        evidenceCount: 1,
        artifactIds: [],
        metadata: {
          correlation: {
            signalType: "audio-discontinuity",
            label: "audio silence",
            window: { startSeconds: 12.35 },
          },
          temporalSegments: [{ startSeconds: 12.35, endSeconds: 12.9, durationSeconds: 0.55 }],
        },
      },
      {
        id: "visual-finding",
        moduleId: "motion",
        sourceModule: "temporal-noise-pattern",
        title: "Temporal noise pattern detected",
        detail: "Black interval analysis found one transition.",
        level: "medium",
        confidence: "low",
        kind: "derived",
        evidenceCount: 1,
        artifactIds: [],
        metadata: {
          correlation: {
            signalType: "luminance-collapse",
            label: "black frame",
            window: { startSeconds: 12.5 },
          },
          temporalSegments: [{ startSeconds: 12.5, endSeconds: 12.9, durationSeconds: 0.4 }],
        },
      },
    ],
    liveFindings: [],
    warnings: [],
    error: null,
    targetLabel: "clip.mp4",
    progress: 100,
    emptyReason: null,
    analysisScope: {
      focus: "visual",
      hypothesis: "tam o anda kayboldu",
      timeRange: { startMs: 12_000, endMs: 14_000 },
    },
    previewArtifacts: [],
    confidence: "medium",
    moduleTrace: [],
    comparisonVariants: [],
    hypothesisSummary: "tam o anda kayboldu",
  };

  const userReport = buildUserReport(run, { findings: run.findings });
  const aiReport = buildAiReport(run, {
    featureId: "media-analysis",
    findings: run.findings,
    generatedAt: "2026-05-20T10:00:00.000Z",
    status: "ready",
  });

  assert.match(userReport?.summary ?? "", /Composite anomaly cluster/);
  assert.equal(aiReport?.correlationClusters?.[0]?.signalTypes.includes("freeze"), true);
  assert.equal(
    aiReport.correlationClusters[0].signalTypes.includes("audio-discontinuity"),
    true
  );
  assert.equal(
    aiReport.correlationClusters[0].signalTypes.includes("luminance-collapse"),
    true
  );
  assert.equal(
    aiReport.narrativeCues?.some((cue) => cue.phrase === "kaybol"),
    true
  );
  assert.match(aiReport.forensicNotes?.[0]?.detail ?? "", /duplicate-frame ratio/);
});

void test("laboratory forensic notes surface optical-flow motion split", () => {
  const findings: LabRun["findings"] = [
    {
      id: "flow-finding",
      moduleId: "motion",
      sourceModule: "motion-anomaly",
      title: "Localized motion track detected",
      detail: "Motion analysis separated subject movement from the background sample.",
      level: "medium",
      confidence: "medium",
      kind: "measured",
      evidenceCount: 2,
      artifactIds: [],
      metadata: {
        correlation: {
          signalType: "motion-discontinuity",
          label: "motion split",
          window: { startSeconds: 12 },
        },
        probeSummary: {
          freezeAttribution: {
            classification: "localized_motion_during_background_freeze",
            confidence: "medium",
            gopBoundaryOverlapCount: 0,
          },
          opticalFlow: {
            backgroundMotionEnergy: 0.005,
            confidence: "medium",
            movementClass: "localized_subject_motion",
            sampledFrameCount: 8,
            status: "measured",
            subjectBackgroundMotionRatio: 6,
            subjectMotionEnergy: 0.03,
          },
        },
        temporalSegments: [{ startSeconds: 12, endSeconds: 12.6, durationSeconds: 0.6 }],
      },
    },
  ];
  const run = createInsightRun({ findings });

  const aiReport = buildAiReport(run, {
    featureId: "media-analysis",
    findings,
    generatedAt: "2026-05-20T10:00:00.000Z",
    status: "ready",
  });
  const opticalNote = aiReport?.forensicNotes?.find((note) => note.label === "optical-flow proxy");
  const attributionNote = aiReport?.forensicNotes?.find(
    (note) => note.label === "freeze attribution"
  );

  assert.match(opticalNote?.detail ?? "", /localized_subject_motion/);
  assert.equal(opticalNote?.measuredFields?.includes("subject/background motion ratio"), true);
  assert.match(attributionNote?.detail ?? "", /Motion split localized_subject_motion/);
});

void test("laboratory forensic signature mapper classifies low-light compression starvation", () => {
  const mapping = buildForensicSignatureMapping({
    black: { count: 1, totalDurationSeconds: 0.8 },
    compressionSignature: {
      estimatedBitsPerPixelFrame: 0.045,
      lowPacketFrameRatio: 0.26,
      packetSpikeRatio: 0.01,
      pictTypeCounts: { B: 0, P: 18 },
      riskFactors: ["low bits-per-pixel-frame", "many low-packet frames"],
      riskLevel: "high",
      riskScore: 0.72,
      sampledFrameCount: 18,
      status: "measured",
    },
    duplicateFrame: {
      exactDuplicateFrameCount: 0,
      exactDuplicateFrameRatio: 0,
      sampledFrameCount: 18,
      status: "measured",
    },
    frameCadence: {
      cadenceDriftRatio: 0.02,
      sampledFrameCount: 18,
      status: "measured",
    },
    opticalFlow: {
      movementClass: "low_motion_baseline",
      sampledFrameCount: 8,
      status: "measured",
    },
  });

  assert.equal(mapping["artifactFamily"], "low_light_compression_starvation");
  assert.equal(mapping["confidence"], "high");
  assert.match(String(mapping["learningFingerprint"]), /bpp:starved/);
});

void test("laboratory forensic signature mapper accepts normalized visual-forensics probe aliases", () => {
  const mapping = buildForensicSignatureMapping({
    compressionSignature: {
      estimatedBitsPerPixelFrame: 0.15,
      packetSpikeRatio: 0.2,
      pictTypeCounts: { B: 10, P: 10 },
      riskLevel: "high",
      sampledFrameCount: 20,
      status: "measured",
    },
    metadataProvenance: {
      mismatchCount: 0,
      sampledFrameCount: 1,
      status: "measured",
    },
    nearDuplicateFrame: {
      exactDuplicateFrameCount: 0,
      sampledFrameCount: 20,
      status: "measured",
    },
    opticalFlowTracking: {
      movementClass: "global_motion_or_camera_shift",
      sampledFrameCount: 8,
      status: "measured",
      subjectMotionEnergy: 0.03,
    },
    referenceQuality: {
      minDelta: 0.02,
      sampledFrameCount: 1,
      status: "measured",
    },
  });

  assert.equal(mapping["artifactFamily"], "fast_motion_encoder_smear");
  assert.equal(
    (mapping["measuredFields"] as string[]).includes("metadata provenance cross-check"),
    true
  );
  assert.match(String(mapping["learningFingerprint"]), /metadata:measured/);
});

void test("laboratory forensic signature mapper classifies remaining artifact families", () => {
  const cases = [
    {
      expectedFamily: "transport_duplicate_stream_stall",
      input: {
        compressionSignature: {
          riskLevel: "low",
          sampledFrameCount: 20,
          status: "measured",
        },
        duplicateFrame: {
          exactDuplicateFrameCount: 9,
          exactDuplicateFrameRatio: 0.47,
          longestDuplicateRunFrames: 5,
          sampledFrameCount: 20,
          status: "measured",
        },
        frameCadence: {
          cadenceDriftRatio: 0.2,
          sampledFrameCount: 20,
          status: "measured",
        },
        freeze: { count: 2 },
        freezeAttribution: {
          classification: "transport_duplicate",
          gopBoundaryOverlapCount: 0,
        },
        opticalFlow: {
          movementClass: "low_motion_baseline",
          sampledFrameCount: 8,
          status: "measured",
        },
      },
      signaturePattern: /duplicate:high/,
    },
    {
      expectedFamily: "fast_motion_encoder_smear",
      input: {
        compressionSignature: {
          estimatedBitsPerPixelFrame: 0.14,
          packetSpikeRatio: 0.18,
          pictTypeCounts: { B: 12, P: 12 },
          riskLevel: "high",
          sampledFrameCount: 24,
          status: "measured",
        },
        frameCadence: {
          cadenceDriftRatio: 0.21,
          sampledFrameCount: 24,
          status: "measured",
        },
        opticalFlow: {
          movementClass: "global_motion_or_camera_shift",
          sampledFrameCount: 8,
          status: "measured",
          subjectMotionEnergy: 0.026,
        },
      },
      signaturePattern: /packet-spike:high/,
    },
    {
      expectedFamily: "thin_edge_ringing_risk",
      input: {
        compressionSignature: {
          estimatedBitsPerPixelFrame: 0.07,
          packetSpikeRatio: 0.04,
          pictTypeCounts: { B: 10, P: 10 },
          riskLevel: "medium",
          sampledFrameCount: 20,
          status: "measured",
        },
        opticalFlow: {
          movementClass: "low_motion_baseline",
          sampledFrameCount: 8,
          status: "measured",
        },
      },
      signaturePattern: /bpp:thin/,
    },
    {
      expectedFamily: "cadence_gop_discontinuity",
      input: {
        frameCadence: {
          cadenceDriftRatio: 0.24,
          sampledFrameCount: 20,
          status: "measured",
          timestampRegressionCount: 1,
        },
        freezeAttribution: {
          classification: "cadence_drift",
          gopBoundaryOverlapCount: 2,
        },
        gopStructure: {
          keyFrameCount: 4,
          sampledFrameCount: 20,
          status: "measured",
        },
      },
      signaturePattern: /cadence:high/,
    },
  ];

  cases.forEach(function (entry) {
    const mapping = buildForensicSignatureMapping(entry.input);

    assert.equal(mapping["artifactFamily"], entry.expectedFamily);
    assert.notEqual(mapping["confidence"], "low");
    assert.match(String(mapping["learningFingerprint"]), entry.signaturePattern);
  });
});

void test("laboratory reports surface forensic signature mapping notes", () => {
  const findings: LabRun["findings"] = [
    {
      id: "signature-finding",
      moduleId: "motion",
      sourceModule: "temporal-noise-pattern",
      title: "Compression artifact cluster detected",
      detail: "Packet and luminance probes suggest compression starvation.",
      level: "medium",
      confidence: "medium",
      kind: "measured",
      evidenceCount: 3,
      artifactIds: [],
      metadata: {
        correlation: {
          signalType: "luminance-collapse",
          label: "compression signature",
          window: { startSeconds: 7 },
        },
        probeSummary: {
          forensicSignature: {
            artifactFamily: "low_light_compression_starvation",
            artifactLabel: "Low-light compression starvation",
            confidence: "high",
            counterEvidence: ["no repeated decoded-frame hashes were measured"],
            evidence: [
              "compression risk high",
              "estimated bits-per-pixel-frame 0.04500",
              "low packet-frame ratio 26.0%",
            ],
            manualReviewPrompts: ["Check the same window against a pre-upload source."],
            measuredFields: ["compression packet signature", "blackdetect intervals"],
            score: 0.91,
            signatureKey: "compression:high|bpp:starved|motion:low_motion_baseline",
            status: "measured",
          },
        },
        temporalSegments: [{ startSeconds: 7, endSeconds: 7.8, durationSeconds: 0.8 }],
      },
    },
  ];
  const run = createInsightRun({ findings });

  const aiReport = buildAiReport(run, {
    featureId: "media-analysis",
    findings,
    generatedAt: "2026-05-20T10:00:00.000Z",
    status: "ready",
  });
  const signatureNote = aiReport?.forensicNotes?.find(
    (note) => note.label === "compression signature mapping"
  );

  assert.match(signatureNote?.detail ?? "", /Low-light compression starvation/);
  assert.match(signatureNote?.detail ?? "", /Learning fingerprint compression:high/);
  assert.equal(signatureNote?.measuredFields?.includes("compression packet signature"), true);
});

void test("laboratory reports surface triage decision, evidence matrix, and counter-evidence ledger", () => {
  const findings: LabRun["findings"] = [
    {
      id: "triage-finding",
      moduleId: "motion",
      sourceModule: "compression-signature-mapping",
      title: "Compression signature mapped",
      detail: "Low-light compression starvation was mapped in the sampled window.",
      level: "medium",
      confidence: "medium",
      kind: "measured",
      evidenceCount: 3,
      artifactIds: [],
      metadata: {
        probeSummary: {
          compressionSignature: {
            riskLevel: "high",
            sampledFrameCount: 18,
            status: "measured",
          },
          compressionSignatureMapping: {
            artifactFamily: "low_light_compression_starvation",
            artifactLabel: "Low-light compression starvation",
            confidence: "high",
            counterEvidence: ["no repeated decoded-frame hashes were measured"],
            evidence: ["compression risk high", "low packet-frame ratio 26.0%"],
            manualReviewPrompts: ["Check the same window against a pre-upload source."],
            measuredFields: ["compression packet signature"],
            score: 0.81,
            status: "measured",
          },
          metadataProvenance: {
            reason: "ExifTool/MediaInfo metadata provenance cross-check is not wired.",
            sampledFrameCount: 0,
            status: "unavailable",
          },
          nearDuplicateFrame: {
            exactDuplicateFrameCount: 0,
            sampledFrameCount: 18,
            status: "measured",
          },
          referenceQuality: {
            reason: "Reference/pre-upload source was not provided.",
            sampledFrameCount: 0,
            status: "unavailable",
          },
        },
      },
    },
  ];
  const run = createInsightRun({ findings });

  const userReport = buildUserReport(run, { findings });
  const aiReport = buildAiReport(run, { findings, featureId: "media-analysis" });

  assert.equal(userReport?.decisionSummary?.anomaly, "inconclusive");
  assert.equal(userReport.decisionSummary.needsFollowUp, true);
  assert.equal(
    aiReport?.evidenceStrength?.find((entry) => entry.id === "extraordinary")?.strength,
    "not-testable"
  );
  assert.equal(
    userReport.evidenceStrength?.find((entry) => entry.id === "compression-artifact")?.strength,
    "strong"
  );
  assert.equal(
    userReport.counterEvidenceLedger?.entries.some(
      (entry) => entry.id === "duplicate-not-found" && entry.status === "measured-not-found"
    ),
    true
  );
  assert.equal(
    aiReport.counterEvidenceLedger?.entries.some(
      (entry) => entry.id === "metadata-provenance-not-measured"
    ),
    true
  );
});

void test("laboratory counter-evidence ledger surfaces partial metadata and reference coverage", () => {
  const findings: LabRun["findings"] = [
    {
      id: "partial-cross-check",
      moduleId: "motion",
      sourceModule: "metadata-provenance-audit",
      title: "Metadata provenance audit",
      detail: "ffprobe metadata was measured with optional host tools missing.",
      level: "low",
      confidence: "medium",
      kind: "measured",
      evidenceCount: 1,
      artifactIds: [],
      metadata: {
        probeSummary: {
          metadataProvenance: {
            coverage: "ffprobe-only",
            measuredSourceIds: ["ffprobe"],
            missingToolIds: ["exiftool", "mediainfo"],
            sampledFrameCount: 1,
            status: "measured",
          },
          referenceQuality: {
            sampledFrameCount: 1,
            status: "measured",
            toolResults: {
              ssim: { sampledFrameCount: 1, status: "measured" },
              vmaf: { reason: "libvmaf filter missing", sampledFrameCount: 0, status: "unavailable" },
            },
          },
        },
      },
    },
  ];
  const userReport = buildUserReport(createInsightRun({ findings }), { findings });

  assert.equal(
    userReport?.counterEvidenceLedger?.entries.some(
      (entry) => entry.id === "metadata-provenance-partial" && entry.status === "measured-weak"
    ),
    true
  );
  assert.equal(
    userReport.counterEvidenceLedger.entries.some(
      (entry) => entry.id === "reference-quality-partial" && entry.status === "measured-weak"
    ),
    true
  );
});

void test("laboratory composite correlation requires distinct signal families", () => {
  const findings: LabRun["findings"] = [
    {
      id: "freeze-a",
      moduleId: "motion",
      sourceModule: "frame-consistency",
      title: "Frame consistency anomaly detected",
      detail: "Freeze interval detected near the reviewed frame.",
      level: "medium",
      confidence: "medium",
      kind: "measured",
      evidenceCount: 1,
      artifactIds: [],
      metadata: {
        correlation: { signalType: "freeze", label: "freeze", window: { startSeconds: 12 } },
        temporalSegments: [{ startSeconds: 12, endSeconds: 12.5, durationSeconds: 0.5 }],
      },
    },
    {
      id: "freeze-b",
      moduleId: "motion",
      sourceModule: "frame-consistency",
      title: "Freeze repetition detected",
      detail: "Another freeze interval was measured in the same review window.",
      level: "medium",
      confidence: "medium",
      kind: "measured",
      evidenceCount: 1,
      artifactIds: [],
      metadata: {
        correlation: { signalType: "freeze", label: "freeze", window: { startSeconds: 12.4 } },
        temporalSegments: [{ startSeconds: 12.4, endSeconds: 12.9, durationSeconds: 0.5 }],
      },
    },
  ];
  const run = createInsightRun({ findings });

  const userReport = buildUserReport(run, { findings });
  const aiReport = buildAiReport(run, {
    featureId: "media-analysis",
    findings,
    generatedAt: "2026-05-20T10:00:00.000Z",
    status: "ready",
  });

  assert.equal(aiReport?.correlationClusters?.length, 0);
  assert.doesNotMatch(userReport?.summary ?? "", /Composite anomaly cluster/);
});

void test("laboratory narrative cues normalize Turkish diacritics without broad-scope over-correlation", () => {
  const findings: LabRun["findings"] = [
    {
      id: "freeze-finding",
      moduleId: "motion",
      sourceModule: "frame-consistency",
      title: "Frame consistency anomaly detected",
      detail: "Freeze interval detected.",
      level: "medium",
      confidence: "medium",
      kind: "measured",
      evidenceCount: 1,
      artifactIds: [],
      metadata: {
        correlation: { signalType: "freeze", label: "freeze", window: { startSeconds: 12 } },
        temporalSegments: [{ startSeconds: 12, endSeconds: 12.5, durationSeconds: 0.5 }],
      },
    },
    {
      id: "audio-finding",
      moduleId: "audio",
      title: "Silence pockets detected",
      detail: "Silence detection found one pocket.",
      level: "medium",
      confidence: "medium",
      kind: "measured",
      evidenceCount: 1,
      artifactIds: [],
      metadata: {
        correlation: {
          signalType: "audio-discontinuity",
          label: "audio silence",
          window: { startSeconds: 12.2 },
        },
        temporalSegments: [{ startSeconds: 12.2, endSeconds: 12.7, durationSeconds: 0.5 }],
      },
    },
  ];
  const run = createInsightRun({
    analysisScope: {
      focus: "visual",
      hypothesis: "şimdi kayboldu ve çığlık duyuldu",
      timeRange: { startMs: 0, endMs: 120_000 },
    },
    findings,
    hypothesisSummary: "şimdi kayboldu ve çığlık duyuldu",
  });

  const aiReport = buildAiReport(run, {
    featureId: "media-analysis",
    findings,
    generatedAt: "2026-05-20T10:00:00.000Z",
    status: "ready",
  });
  const phrases = aiReport?.narrativeCues?.map((cue) => cue.phrase) ?? [];

  assert.equal(phrases.includes("simdi"), true);
  assert.equal(phrases.includes("kaybol"), true);
  assert.equal(phrases.includes("ciglik"), true);
  assert.equal(
    aiReport?.correlationClusters?.[0]?.signalTypes.includes("narrative-trigger"),
    false
  );
});

void test("laboratory baseline language does not create correlation signals", () => {
  const findings: LabRun["findings"] = [
    {
      id: "no-freeze",
      moduleId: "motion",
      sourceModule: "frame-consistency",
      title: "No freeze anomaly detected",
      detail: "No freeze or frame anomaly was found in the inspected window.",
      level: "medium",
      confidence: "medium",
      kind: "heuristic",
      evidenceCount: 1,
      artifactIds: [],
      reference: { timeRange: { startMs: 12_000, endMs: 13_000 } },
    },
    {
      id: "no-audio",
      moduleId: "audio",
      title: "No audio anomaly found",
      detail: "No silence trigger or spike was detected in the same window.",
      level: "medium",
      confidence: "medium",
      kind: "heuristic",
      evidenceCount: 1,
      artifactIds: [],
      reference: { timeRange: { startMs: 12_000, endMs: 13_000 } },
    },
  ];
  const run = createInsightRun({ findings });

  const aiReport = buildAiReport(run, {
    featureId: "media-analysis",
    findings,
    generatedAt: "2026-05-20T10:00:00.000Z",
    status: "ready",
  });

  assert.equal(aiReport?.correlationClusters?.length, 0);
});

void test("laboratory report keeps text-only transcript triggers as narrative cues", () => {
  const findings: LabRun["findings"] = [
    {
      id: "transcript-trigger",
      moduleId: "audio",
      title: "Narrative trigger phrase detected",
      detail: "Transcript sampling surfaced trigger phrases.",
      level: "medium",
      confidence: "low",
      kind: "heuristic",
      evidenceCount: 2,
      artifactIds: [],
      metadata: {
        narrativeCues: ["şimdi kayboldu"],
        narrativeTemporalBasis: "text-only",
      },
    },
  ];
  const run = createInsightRun({ findings });

  const aiReport = buildAiReport(run, {
    featureId: "media-analysis",
    findings,
    generatedAt: "2026-05-20T10:00:00.000Z",
    status: "ready",
  });
  const phrases = aiReport?.narrativeCues?.map((cue) => cue.phrase) ?? [];

  assert.equal(phrases.includes("simdi"), true);
  assert.equal(phrases.includes("kaybol"), true);
  assert.equal(aiReport?.correlationClusters?.length, 0);
});

void test("laboratory detection parser preserves temporal segments without double-counting close lines", () => {
  const parserRuntime = createAudioAnalysisParserRuntime();
  const freeze = parserRuntime.parseFreezeDetectLog(
    "[freezedetect] freeze_start: 12.000\n[freezedetect] freeze_duration: 0.700\n[freezedetect] freeze_end: 12.700"
  ) as Record<string, unknown>;
  const black = parserRuntime.parseBlackDetectLog(
    "[blackdetect] black_start:13 black_end:13.4 black_duration:0.4"
  ) as Record<string, unknown>;

  assert.equal(freeze["count"], 1);
  assert.equal(black["count"], 1);
  assert.deepEqual((freeze["segments"] as Array<Record<string, unknown>>)[0], {
    durationSeconds: 0.7,
    endSeconds: 12.7,
    startSeconds: 12,
  });
  assert.equal(freeze["maxDurationSeconds"], 0.7);
});
