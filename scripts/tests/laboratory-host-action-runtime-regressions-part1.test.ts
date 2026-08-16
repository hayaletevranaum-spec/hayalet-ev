import test from "node:test";
import assert from "node:assert/strict";
import { createLaboratoryHostActivation } from "../../rooms/laboratory/shared/host/activation.ts";
import { createAudioAnalysisProbeRuntime } from "../../rooms/laboratory/features/audio-analysis/host/analysis-probes.ts";
import { createLaboratoryProcessRuntime } from "../../rooms/laboratory/shared/host/process-runtime.ts";
import {
  createLaboratoryHostUtils,
  sanitizeLaboratoryFileSegment,
  toLaboratoryFfmpegTimestamp,
} from "../../rooms/laboratory/shared/host/host-utils.ts";

void test("laboratory host utility helpers preserve file, timestamp, and clamp golden cases", () => {
  const hostUtils = createLaboratoryHostUtils({
    audioFeatureId: "audio-analysis",
    getDefaultSourceType() {
      return "media";
    },
    toRecord(value) {
      return value !== null && typeof value === "object" && Array.isArray(value) === false
        ? (value as Record<string, unknown>)
        : {};
    },
  });

  assert.equal(
    sanitizeLaboratoryFileSegment(" Clip 01 / Final!.mp4 ", "artifact"),
    "clip-01-final-mp4"
  );
  assert.equal(sanitizeLaboratoryFileSegment("", "fallback-name"), "fallback-name");
  assert.equal(toLaboratoryFfmpegTimestamp(1.23456, null), "1.235");
  assert.equal(toLaboratoryFfmpegTimestamp(-1, null), "0");
  assert.equal(toLaboratoryFfmpegTimestamp("bad", "2.000"), "2.000");
  assert.equal(hostUtils.clampNumber("3.5", 0, 2, 1), 2);
  assert.equal(hostUtils.clampNumber("bad", 0, 2, 1), 1);
});

void test("laboratory structure probes honor analysis time range and scale full-media timeout", async () => {
  const toolRuns: Array<Record<string, unknown>> = [];
  const probeRuntime = createAudioAnalysisProbeRuntime({
    asNonEmptyString(value: unknown) {
      return typeof value === "string" && value.trim() !== "" ? value : null;
    },
    asNumber(value: unknown) {
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    },
    buildProsodySummaryFromCsv() {
      return {};
    },
    parseBlackDetectLog() {
      return { count: 0, segments: [] };
    },
    parseFreezeDetectLog() {
      return {
        count: 1,
        maxDurationSeconds: 1,
        segments: [{ durationSeconds: 1, endSeconds: 1, startSeconds: 0 }],
        totalDurationSeconds: 1,
      };
    },
    parseSilenceDetectLog() {
      return { count: 0, segments: [] };
    },
    parseVolumeDetectLog() {
      return {};
    },
    readTextFile: async () => null,
    runProfileTool: async function (_runtime, options) {
      toolRuns.push(options);
      return { stderr: "probe output" };
    },
    toRecord(value: unknown) {
      return value !== null && typeof value === "object" && Array.isArray(value) === false
        ? (value as Record<string, unknown>)
        : {};
    },
  });
  const runtime = { paths: { projectsDir: "/tmp/laboratory-projects" } };
  const project = { slug: "scope-probe" };
  const target = {
    metadata: { durationSeconds: 967.85415 },
    path: "/tmp/source.mp4",
  };
  function readStructureProbeRun(requestId: string) {
    const run = toolRuns.find(function (entry) {
      if (entry["requestId"] !== requestId) {
        return false;
      }
      const args = Array.isArray(entry["args"]) ? (entry["args"] as unknown[]) : [];
      return args.some(function (arg) {
        return typeof arg === "string" && arg.includes("blackdetect");
      });
    });
    assert.ok(run, `Expected structure probe run for ${requestId}.`);
    return run;
  }

  const scopedProbe = await probeRuntime.runVideoStructureProbe(
    runtime,
    project,
    "req-scoped",
    "job-scoped",
    target,
    {
      analysisScope: {
        timeRange: {
          endMs: 93_000,
          startMs: 89_000,
        },
      },
    }
  );
  const scopedRun = readStructureProbeRun("req-scoped");
  const scopedArgs = (scopedRun["args"] ?? []) as string[];
  const scopedFreeze = scopedProbe.freeze as Record<string, unknown>;
  const scopedSegments = scopedFreeze["segments"] as Array<Record<string, unknown>>;
  assert.deepEqual(scopedArgs.slice(0, 6), ["-hide_banner", "-ss", "89", "-t", "4", "-i"]);
  assert.equal(scopedRun["timeoutMs"], 120_000);
  assert.equal(scopedSegments[0]?.["startSeconds"], 89);
  assert.equal(scopedSegments[0]["endSeconds"], 90);

  await probeRuntime.runVideoStructureProbe(runtime, project, "req-full", "job-full", target);
  const fullRun = readStructureProbeRun("req-full");
  const fullArgs = (fullRun["args"] ?? []) as string[];
  assert.equal(fullArgs.includes("-ss"), false);
  assert.ok(Number(fullRun["timeoutMs"]) > 120_000);

  await probeRuntime.runVideoStructureProbe(runtime, project, "req-sample", "job-sample", target, {
    fallbackWindowSeconds: 45,
  });
  const sampleRun = readStructureProbeRun("req-sample");
  const sampleArgs = (sampleRun["args"] ?? []) as string[];
  assert.deepEqual(sampleArgs.slice(0, 6), ["-hide_banner", "-ss", "0", "-t", "45", "-i"]);
});

void test("laboratory visual forensics probes run real tool paths before degrading", async () => {
  const toolRuns: Array<Record<string, unknown>> = [];
  const probeRuntime = createAudioAnalysisProbeRuntime({
    asNonEmptyString(value: unknown) {
      return typeof value === "string" && value.trim() !== "" ? value : null;
    },
    asNumber(value: unknown) {
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    },
    buildProsodySummaryFromCsv() {
      return {};
    },
    parseBlackDetectLog() {
      return { count: 0, segments: [] };
    },
    parseFreezeDetectLog() {
      return { count: 0, segments: [] };
    },
    parseSilenceDetectLog() {
      return { count: 0, segments: [] };
    },
    parseVolumeDetectLog() {
      return {};
    },
    readTextFile: async () => null,
    runProfileTool: async function (_runtime, options) {
      toolRuns.push(options);
      const args = Array.isArray(options["args"]) ? (options["args"] as string[]) : [];
      if (options["toolId"] === "visual-forensics-py" && args[2] === "duplicate") {
        return {
          stdout: JSON.stringify({
            averageHashSimilarity: 0.97,
            averageSsim: 0.96,
            method: "opencv-phash-ssim",
            nearDuplicateFrameCount: 3,
            nearDuplicateFrameRatio: 0.3,
            sampledFrameCount: 12,
            status: "measured",
          }),
        };
      }
      if (options["toolId"] === "visual-forensics-py" && args[2] === "flow") {
        return {
          stdout: JSON.stringify({
            backgroundMotionEnergy: 0.04,
            confidence: "medium",
            method: "opencv-farneback",
            movementClass: "localized_subject_motion",
            sampledFrameCount: 8,
            status: "measured",
            subjectBackgroundMotionRatio: 3.2,
            subjectMotionEnergy: 0.13,
          }),
        };
      }
      if (options["toolId"] === "visual-forensics-py" && args[2] === "reference") {
        return {
          stdout: JSON.stringify({
            method: "opencv-skimage-ssim",
            qualityDelta: 0.08,
            sampledFrameCount: 1,
            ssim: 0.92,
            status: "measured",
          }),
        };
      }
      if (options["toolId"] === "exiftool") {
        return {
          stdout: JSON.stringify([
            {
              CreateDate: "2026:05:23 10:00:00",
              FileType: "MP4",
              ImageHeight: 1080,
              ImageWidth: 1920,
            },
          ]),
        };
      }
      if (options["toolId"] === "mediainfo") {
        return {
          stdout: JSON.stringify({
            media: {
              track: [
                { "@type": "General", Duration: "4.000", Format: "MPEG-4" },
                { "@type": "Video", Format: "h264", FrameRate: "25", Height: "1080", Width: "1920" },
              ],
            },
          }),
        };
      }
      if (args.includes("-show_format")) {
        return {
          stdout: JSON.stringify({
            format: { duration: "4.000", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
            streams: [
              {
                avg_frame_rate: "25/1",
                codec_name: "h264",
                codec_type: "video",
                height: 1080,
                width: 1920,
              },
            ],
          }),
        };
      }
      if (args.includes("-show_entries")) {
        return {
          stdout: JSON.stringify({
            frames: [
              { best_effort_timestamp_time: "0", key_frame: 1, pict_type: "I", pkt_size: "1200" },
              { best_effort_timestamp_time: "0.04", key_frame: 0, pict_type: "P", pkt_size: "900" },
            ],
          }),
        };
      }
      if (args.includes("framehash")) {
        return {
          stdout: [
            "#tb 0: 1/25",
            "0, 0, 0, 1, 900, abc",
            "0, 0, 1, 1, 900, abc",
            "0, 0, 2, 1, 901, def",
          ].join("\n"),
        };
      }
      return { stderr: "probe output" };
    },
    toRecord(value: unknown) {
      return value !== null && typeof value === "object" && Array.isArray(value) === false
        ? (value as Record<string, unknown>)
        : {};
    },
  });
  const runtime = { paths: { projectsDir: "/tmp/laboratory-projects" } };
  const project = { slug: "forensics-probe" };
  const videoProbe = await probeRuntime.runVideoStructureProbe(
    runtime,
    project,
    "req-forensics",
    "job-forensics",
    { metadata: { durationSeconds: 4 }, path: "/tmp/source.mp4" },
    {
      moduleSettings: {
        "compression-signature-mapping": { artifactProfile: "edge", bppThreshold: 0.12 },
        "metadata-provenance-audit": { metadataDepth: "forensic" },
        "optical-flow-tracking": {
          cameraCompensation: "strong",
          flowEngine: "farneback",
          motionThreshold: 0.12,
        },
        "perceptual-duplicate-frame": {
          frameStep: 5,
          hashMode: "hybrid",
          minRunFrames: 2,
          similarityThreshold: 0.94,
        },
        "reference-quality-check": { metricSet: "ssim", minDelta: 0.04 },
      },
      referenceTarget: { path: "/tmp/reference.mp4" },
      sourceKind: "video",
    }
  );

  assert.equal((videoProbe.nearDuplicateFrame as Record<string, unknown>)["method"], "ffmpeg-framehash+opencv-phash-ssim");
  assert.equal((videoProbe.nearDuplicateFrame as Record<string, unknown>)["nearDuplicateFrameCount"], 3);
  assert.equal((videoProbe.opticalFlowTracking)["method"], "opencv-farneback");
  assert.equal((videoProbe.metadataProvenance)["coverage"], "cross-checked");
  assert.equal((videoProbe.referenceQuality)["status"], "measured");
  assert.equal((videoProbe.compressionSignature as Record<string, unknown>)["artifactProfile"], "edge");

  const duplicateRun = toolRuns.find(function (entry) {
    const args = Array.isArray(entry["args"]) ? (entry["args"] as string[]) : [];
    return entry["toolId"] === "visual-forensics-py" && args[2] === "duplicate";
  });
  assert.ok(duplicateRun);
  const duplicateOptions = JSON.parse((duplicateRun["args"] as string[])[4] as string) as Record<string, unknown>;
  assert.equal(duplicateOptions["frameStep"], 5);
  assert.equal(duplicateOptions["similarityThreshold"], 0.94);
  assert.equal(
    toolRuns.some(function (entry) {
      return entry["toolId"] === "exiftool";
    }),
    true
  );
  assert.equal(
    toolRuns.some(function (entry) {
      return entry["toolId"] === "mediainfo";
    }),
    true
  );

  const imageProbe = await probeRuntime.runVideoStructureProbe(
    runtime,
    project,
    "req-image-forensics",
    "job-image-forensics",
    { metadata: { kind: "image" }, path: "/tmp/source.png" },
    {
      moduleSettings: {
        "reference-quality-check": { metricSet: "ssim", minDelta: 0.02 },
      },
      referenceTarget: { path: "/tmp/reference.png" },
      sourceKind: "image",
    }
  );
  assert.equal((imageProbe.metadataProvenance)["status"], "measured");
  assert.equal((imageProbe.referenceQuality)["status"], "measured");
  assert.equal((imageProbe.nearDuplicateFrame as Record<string, unknown>)["status"], "unavailable");
  assert.equal(
    toolRuns.some(function (entry) {
      const args = Array.isArray(entry["args"]) ? (entry["args"] as string[]) : [];
      return entry["requestId"] === "req-image-forensics" && args.includes("blackdetect=d=0.25:pix_th=0.10,freezedetect=n=-40dB:d=0.4");
    }),
    false
  );
});

void test("laboratory host activation unwraps host-context room-event payloads before saving context", () => {
  const savedContexts: Array<Record<string, unknown>> = [];
  const emittedEvents: Array<Record<string, unknown>> = [];
  const pushCalls: Array<string | null> = [];

  let currentContext: Record<string, unknown> = {};

  const activation = createLaboratoryHostActivation({
    createRuntimeState() {
      return {};
    },
    emitEvent(_api, payload) {
      emittedEvents.push(payload);
    },
    ensureHydrated: async function () {},
    ensureRoomToolsSubscription: function () {},
    handleMediaAction: async function () {},
    loadContext() {
      return currentContext;
    },
    pushMediaState(_api, _runtime, requestId) {
      pushCalls.push(requestId);
    },
    saveContext(_api, payload) {
      savedContexts.push(payload);
      currentContext = payload;
      return payload;
    },
    tearDownRoomToolsSubscription: function () {},
    toRecord(value) {
      return value !== null && typeof value === "object" && Array.isArray(value) === false
        ? (value as Record<string, unknown>)
        : {};
    },
  });

  const runtime = activation.activate({
    log() {},
  });

  const nestedContext = {
    roomId: "laboratory",
    featureId: "audio-analysis",
    workbench: {
      activeModuleId: "audio-analysis",
      selectedModuleIds: ["audio-analysis"],
      moduleToggles: {
        "audio-analysis": true,
      },
    },
  };
  runtime.onRoomEvent({
    type: "host-context",
    payload: nestedContext,
  });

  assert.deepEqual(savedContexts.at(-1), nestedContext);
  assert.deepEqual(pushCalls, [null]);
  assert.equal(emittedEvents.at(-1)?.["action"], "host-context");
  assert.equal(emittedEvents.at(-1)?.["scope"], "global");

  const directContext = {
    type: "host-context",
    roomId: "laboratory",
    featureId: "media-analysis",
    workbench: {
      activeModuleId: "media-analysis",
      selectedModuleIds: ["media-analysis"],
      moduleToggles: {
        "media-analysis": true,
      },
    },
  };
  runtime.onRoomEvent(directContext);

  assert.deepEqual(savedContexts.at(-1), directContext);
  assert.deepEqual(pushCalls, [null, null]);
  assert.equal(emittedEvents.at(-1)?.["action"], "host-context");
  assert.equal(emittedEvents.at(-1)?.["scope"], "global");
});

void test("laboratory process runtime keeps cancelled runs cancelled after the active module resolves", async () => {
  function toRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && Array.isArray(value) === false
      ? (value as Record<string, unknown>)
      : {};
  }

  function asNonEmptyString(value: unknown) {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  }

  function updateProcessModule(
    processRecord: Record<string, unknown>,
    moduleId: string,
    patch: Record<string, unknown>
  ) {
    const modules = Array.isArray(processRecord["modules"])
      ? (processRecord["modules"] as Array<Record<string, unknown>>)
      : [];
    const moduleIndex = modules.findIndex(function (entry) {
      return entry["id"] === moduleId;
    });
    const nextModule = {
      ...(moduleIndex >= 0 ? modules[moduleIndex] : { id: moduleId }),
      ...patch,
    };
    if (moduleIndex >= 0) {
      modules[moduleIndex] = nextModule;
    } else {
      modules.push(nextModule);
    }
    processRecord["modules"] = modules;
    return nextModule;
  }

  let activeProject: Record<string, unknown> = {
    id: "project-cancel-process",
    slug: "project-cancel-process",
    source: {
      kind: "audio",
      status: "ready",
      storedPath: "/tmp/lab-audio.wav",
    },
    edit: {},
    process: {
      records: {},
    },
    report: {
      records: {},
    },
    workbench: {
      analysisScope: {
        focus: "audio",
      },
    },
    assets: [],
  };
  const runtime: Record<string, unknown> = {
    jobs: {},
  };
  const pushedJobStates: Array<Record<string, unknown>> = [];
  let resolveRunner: ((value: unknown) => void) | null = null;
  let resolveRunnerStarted: (() => void) | null = null;
  const runnerOutput = new Promise<unknown>(function (resolve) {
    resolveRunner = resolve;
  });
  const runnerStarted = new Promise<void>(function (resolve) {
    resolveRunnerStarted = resolve;
  });
  let releaseCancelJobs: (() => void) | null = null;
  const cancelJobsBlocked = new Promise<void>(function (resolve) {
    releaseCancelJobs = resolve;
  });

  const processRuntime = createLaboratoryProcessRuntime({
    appendProcessEvent(record, event) {
      record["events"] = (Array.isArray(record["events"]) ? record["events"] : []).concat(event);
      return record;
    },
    asNonEmptyString,
    buildAudioAnalysisModules() {
      return [{ id: "audio-core", title: "Audio Core", status: "queued" }];
    },
    buildMediaProcessModules() {
      return [];
    },
    async cancelProcessJobsForProject(_api, runtimeRecord, projectId, requestId) {
      await cancelJobsBlocked;
      const jobs = toRecord(runtimeRecord["jobs"]);
      Object.keys(jobs).forEach(function (jobId) {
        const job = toRecord(jobs[jobId]);
        if (job["projectId"] !== projectId) {
          return;
        }
        pushedJobStates.push({
          requestId,
          jobId,
          action: job["action"],
          projectId,
          featureStage: "process",
          stage: "cancelled",
        });
        delete jobs[jobId];
      });
    },
    clearJob(runtimeRecord, jobId) {
      delete toRecord(runtimeRecord["jobs"])[jobId];
    },
    clone<T>(value: T): T {
      return structuredClone(value);
    },
    composeFeatureReport() {
      return { summary: "report skipped" };
    },
    createEmptyFeatureProcessRecord(featureId) {
      return { featureId, status: "idle", events: [], modules: [] };
    },
    createEmptyProcessRun(featureId) {
      return { featureId, status: "idle", events: [], modules: [] };
    },
    ensureEditToolReady() {},
    ensureProcessJobSlotAvailable() {},
    async ensureProjectDirectories() {},
    getActiveProject() {
      return activeProject;
    },
    getFeatureProcessDir() {
      return "/tmp";
    },
    getFeatureProcessJobAction(featureId) {
      return featureId === "audio-analysis" ? "audio-process-run" : "process-run";
    },
    getFeatureProcessRecord(project, featureId) {
      return toRecord(toRecord(toRecord(project["process"])["records"])[featureId]);
    },
    async patchActiveProject(_runtime, patcher) {
      activeProject = patcher(activeProject);
    },
    pushJobState(_api, payload) {
      pushedJobStates.push({ ...payload });
    },
    registerJob(runtimeRecord, job) {
      toRecord(runtimeRecord["jobs"])[String(job["jobId"])] = job;
    },
    resolveProcessRunFeatureIds() {
      return ["audio-analysis"];
    },
    resolveProcessWorkbench(project) {
      return toRecord(project["workbench"]);
    },
    resolveProcessTarget() {
      return {
        requestedMode: "original",
        mode: "original",
        outputId: null,
        signature: "audio-signature",
        label: "Audio source",
        fileName: "lab-audio.wav",
        mimeType: "audio/wav",
        path: "/tmp/lab-audio.wav",
        entries: [],
      };
    },
    sanitizeFileSegment(value, fallbackValue) {
      return asNonEmptyString(value.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()) ?? fallbackValue;
    },
    setFeatureProcessRecord(project, featureId, record) {
      const processState = toRecord(project["process"]);
      const records = toRecord(processState["records"]);
      records[featureId] = record;
      project["process"] = {
        ...processState,
        records,
      };
    },
    setFeatureReportRecord(project, featureId, report) {
      const reportState = toRecord(project["report"]);
      const records = toRecord(reportState["records"]);
      records[featureId] = report;
      project["report"] = {
        ...reportState,
        records,
      };
    },
    toRecord,
    updateProcessRecordPercent() {},
    markFeatureReportStale() {},
    audioFeatureId: "audio-analysis",
    buildProcessSpeechAvailability() {
      return {};
    },
    clampProfileTranscriptSampleSeconds() {
      return 30;
    },
    createProcessArtifact(moduleId: unknown, kind: unknown, path: unknown, title: unknown, metadata: unknown) {
      return { id: `${String(moduleId)}-${String(kind)}`, moduleId, kind, path, title, metadata };
    },
    createProcessFinding(
      moduleId: unknown,
      kind: unknown,
      level: unknown,
      confidence: unknown,
      title: unknown,
      detail: unknown,
      evidenceCount: unknown,
      artifactIds: unknown) {
      return {
        id: `${String(moduleId)}-${String(kind)}`,
        moduleId,
        kind,
        level,
        confidence,
        title,
        detail,
        evidenceCount,
        artifactIds,
      };
    },
    generateProcessFramePreviewArtifact() {
      return null;
    },
    generateProcessImageComparisonArtifact() {
      return null;
    },
    generateProcessMetadataArtifact() {
      return null;
    },
    generateProcessSpectrogram() {
      return null;
    },
    generateProcessVisualTransformArtifact() {
      return null;
    },
    getAudioAnalysisModuleProcessDir() {
      return "/tmp";
    },
    getAudioAnalysisModuleRunner() {
      return async function () {
        resolveRunnerStarted?.();
        return await runnerOutput;
      };
    },
    maybeRunTranscriptProfileSample() {
      return null;
    },
    normalizeProcessArtifact(rawValue: unknown)  {
      return toRecord(rawValue);
    },
    normalizeProcessFinding(rawValue: unknown)  {
      return toRecord(rawValue);
    },
    partitionVisualAnalysisModuleIds() {
      return {};
    },
    resolveEnabledVisualAnalysisModuleIds() {
      return [];
    },
    runAudioStructureProbe() {
      return null;
    },
    runVideoStructureProbe() {
      return null;
    },
    updateProcessModule,
    async writeJsonFile() {},
    async writeTextFile() {},
  });

  const runPromise = processRuntime.runFeatureProcess(
    {},
    runtime,
    "req-process-run",
    "audio-analysis",
    activeProject["workbench"]
  );
  await runnerStarted;

  const cancelPromise = processRuntime.cancelFeatureProcess(
    {},
    runtime,
    "req-process-cancel",
    "audio-analysis",
    activeProject["workbench"]
  );
  const immediateCancelResult = await Promise.race([
    cancelPromise,
    new Promise<string>(function (resolve) {
      setTimeout(function () {
        resolve("blocked");
      }, 0);
    }),
  ]);
  assert.deepEqual(immediateCancelResult, { cancelled: true });
  assert.equal(
    toRecord(toRecord(toRecord(activeProject["process"])["records"])["audio-analysis"])["status"],
    "cancelled"
  );
  (releaseCancelJobs as unknown as () => void)();
  await cancelJobsBlocked;
  await Promise.resolve();
  (resolveRunner as unknown as (value: unknown) => void)({ status: "ready", summary: "late success", findings: [], artifacts: [] });
  const result = await runPromise;

  const processRecord = toRecord(
    toRecord(toRecord(activeProject["process"])["records"])["audio-analysis"]
  );
  assert.deepEqual(result, { cancelled: true });
  assert.equal(processRecord["status"], "cancelled");
  assert.equal(processRecord["jobId"], null);
  assert.equal(processRecord["requestId"], null);
  assert.equal(
    pushedJobStates.some(function (entry) {
      return entry["stage"] === "completed";
    }),
    false
  );
  assert.equal(
    pushedJobStates.some(function (entry) {
      return entry["stage"] === "cancelled" && entry["action"] === "audio-process-run";
    }),
    true
  );
});

void test("laboratory process runtime registers generated artifacts as project assets", async () => {
  function toRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && Array.isArray(value) === false
      ? (value as Record<string, unknown>)
      : {};
  }

  function asNonEmptyString(value: unknown) {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  }

  function updateProcessModule(
    processRecord: Record<string, unknown>,
    moduleId: string,
    patch: Record<string, unknown>
  ) {
    const modules = Array.isArray(processRecord["modules"])
      ? (processRecord["modules"] as Array<Record<string, unknown>>)
      : [];
    const moduleIndex = modules.findIndex(function (entry) {
      return entry["id"] === moduleId;
    });
    const nextModule = {
      ...(moduleIndex >= 0 ? modules[moduleIndex] : { id: moduleId }),
      ...patch,
    };
    if (moduleIndex >= 0) {
      modules[moduleIndex] = nextModule;
    } else {
      modules.push(nextModule);
    }
    processRecord["modules"] = modules;
    return nextModule;
  }

  let activeProject: Record<string, unknown> = {
    id: "project-artifact-process",
    slug: "project-artifact-process",
    name: "Artifact Process Project",
    source: {
      kind: "video",
      mode: "local",
      status: "ready",
      storedPath: "/tmp/source.mp4",
      metadata: {},
    },
    edit: {},
    process: { records: {} },
    report: { records: {} },
    workbench: {
      analysisScope: {
        hypothesis: "check motion",
      },
    },
    assets: [],
  };
  const runtime: Record<string, unknown> = {
    jobs: {},
  };

  const processRuntime = createLaboratoryProcessRuntime({
    appendProcessEvent(record, event) {
      record["events"] = (Array.isArray(record["events"]) ? record["events"] : []).concat(event);
      return record;
    },
    asNonEmptyString,
    buildAudioAnalysisModules() {
      return [];
    },
    buildMediaProcessModules() {
      return [];
    },
    async cancelProcessJobsForProject() {},
    clearJob(runtimeRecord, jobId) {
      delete toRecord(runtimeRecord["jobs"])[jobId];
    },
    clone<T>(value: T): T {
      return structuredClone(value);
    },
    composeFeatureReport() {
      return { status: "ready" };
    },
    createEmptyFeatureProcessRecord(featureId) {
      return { featureId, status: "idle", events: [], modules: [] };
    },
    createEmptyProcessRun(featureId) {
      return { featureId, status: "idle", events: [], modules: [] };
    },
    ensureEditToolReady() {},
    ensureProcessJobSlotAvailable() {},
    async ensureProjectDirectories() {},
    getActiveProject() {
      return activeProject;
    },
    getFeatureProcessDir() {
      return "/tmp/process";
    },
    getFeatureProcessJobAction() {
      return "process-run";
    },
    getFeatureProcessRecord(project, featureId) {
      return toRecord(toRecord(toRecord(project["process"])["records"])[featureId]);
    },
    async patchActiveProject(_runtime, patcher) {
      activeProject = patcher(activeProject);
    },
    pushJobState() {},
    registerJob(runtimeRecord, job) {
      toRecord(runtimeRecord["jobs"])[String(job["jobId"])] = job;
    },
    resolveProcessRunFeatureIds() {
      return ["media-analysis"];
    },
    resolveProcessWorkbench(project) {
      return toRecord(project["workbench"]);
    },
    resolveProcessTarget() {
      return {
        requestedMode: "original",
        mode: "original",
        outputId: null,
        signature: "video-signature",
        label: "Video source",
        fileName: "source.mp4",
        mimeType: "video/mp4",
        path: "/tmp/source.mp4",
        entries: [],
      };
    },
    sanitizeFileSegment(value, fallbackValue) {
      return asNonEmptyString(value.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()) ?? fallbackValue;
    },
    setFeatureProcessRecord(project, featureId, record) {
      const processState = toRecord(project["process"]);
      const records = toRecord(processState["records"]);
      records[featureId] = record;
      project["process"] = { ...processState, records };
    },
    setFeatureReportRecord(project, featureId, report) {
      const reportState = toRecord(project["report"]);
      const records = toRecord(reportState["records"]);
      records[featureId] = report;
      project["report"] = { ...reportState, records };
    },
    toRecord,
    updateProcessRecordPercent() {},
    markFeatureReportStale() {},
    audioFeatureId: "audio-analysis",
    buildProcessSpeechAvailability() {
      return {};
    },
    clampProfileTranscriptSampleSeconds() {
      return 30;
    },
    createProcessArtifact(moduleId: unknown, kind: unknown, path: unknown, title: unknown, metadata: unknown) {
      return {
        id: `${String(moduleId)}-${String(kind)}`,
        moduleId,
        kind,
        path,
        fileName: "metadata.json",
        title,
        metadata,
      };
    },
    createProcessFinding(
      moduleId: unknown,
      kind: unknown,
      level: unknown,
      confidence: unknown,
      title: unknown,
      detail: unknown,
      evidenceCount: unknown,
      artifactIds: unknown) {
      return {
        id: `${String(moduleId)}-${String(kind)}`,
        moduleId,
        kind,
        level,
        confidence,
        title,
        detail,
        evidenceCount,
        artifactIds,
      };
    },
    generateProcessFramePreviewArtifact() {
      return null;
    },
    generateProcessImageComparisonArtifact() {
      return null;
    },
    generateProcessMetadataArtifact() {
      return {
        id: "artifact-metadata-1",
        moduleId: "intake",
        kind: "metadata",
        label: "Metadata Snapshot",
        fileName: "source-metadata.json",
        path: "/tmp/process/source-metadata.json",
        status: "ready",
        metadata: { format: "json" },
      };
    },
    generateProcessSpectrogram() {
      return null;
    },
    generateProcessVisualTransformArtifact() {
      return null;
    },
    getAudioAnalysisModuleProcessDir() {
      return "/tmp";
    },
    getAudioAnalysisModuleRunner() {
      return function () {
        return { findings: [], artifacts: [], warnings: [] };
      };
    },
    maybeRunTranscriptProfileSample() {
      return null;
    },
    normalizeProcessArtifact(rawValue: unknown)  {
      return toRecord(rawValue);
    },
    normalizeProcessFinding(rawValue: unknown)  {
      return toRecord(rawValue);
    },
    partitionVisualAnalysisModuleIds() {
      return {};
    },
    resolveEnabledVisualAnalysisModuleIds() {
      return [];
    },
    runAudioStructureProbe() {
      return null;
    },
    runVideoStructureProbe() {
      return null;
    },
    updateProcessModule,
    async writeJsonFile() {},
    async writeTextFile() {},
  });

  await processRuntime.runFeatureProcess(
    {},
    runtime,
    "req-process-artifact",
    "media-analysis",
    activeProject["workbench"]
  );

  const assets = Array.isArray(activeProject["assets"])
    ? (activeProject["assets"] as Array<Record<string, unknown>>)
    : [];
  const artifactAsset = assets.find(function (asset) {
    return asset["id"] === "process-artifact-artifact-metadata-1";
  });

  assert.equal(artifactAsset?.["type"], "artifact");
  assert.equal(artifactAsset["name"], "source-metadata.json");
  assert.equal(artifactAsset["localPath"], "/tmp/process/source-metadata.json");
  assert.equal(toRecord(artifactAsset["metadata"])["processArtifactId"], "artifact-metadata-1");
  assert.equal(toRecord(artifactAsset["metadata"])["featureId"], "media-analysis");

  const reportAssets = assets.filter(function (asset) {
    return asset["type"] === "report";
  });
  assert.equal(reportAssets.length, 2);
  assert.deepEqual(
    reportAssets.map(function (asset) {
      return asset["name"];
    }),
    ["Media Analysis User Report", "Media Analysis AI Report"]
  );
  assert.equal(toRecord(reportAssets[0]?.["metadata"])["format"], "inline");
  assert.equal(toRecord(reportAssets[0]?.["metadata"])["reportView"], "user");
});

void test("laboratory process runtime materializes remote workspace image targets before analysis", async () => {
  function toRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && Array.isArray(value) === false
      ? (value as Record<string, unknown>)
      : {};
  }

  function asNonEmptyString(value: unknown) {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  }

  function updateProcessModule(
    processRecord: Record<string, unknown>,
    moduleId: string,
    patch: Record<string, unknown>
  ) {
    const modules = Array.isArray(processRecord["modules"])
      ? (processRecord["modules"] as Array<Record<string, unknown>>)
      : [];
    const moduleIndex = modules.findIndex(function (entry) {
      return entry["id"] === moduleId;
    });
    const nextModule = {
      ...(moduleIndex >= 0 ? modules[moduleIndex] : { id: moduleId }),
      ...patch,
    };
    if (moduleIndex >= 0) {
      modules[moduleIndex] = nextModule;
    } else {
      modules.push(nextModule);
    }
    processRecord["modules"] = modules;
    return nextModule;
  }

  let activeProject: Record<string, unknown> = {
    id: "project-remote-process",
    slug: "project-remote-process",
    name: "Remote Process Project",
    source: {
      kind: "video",
      mode: "local",
      status: "ready",
      storedPath: "/tmp/source.mp4",
      metadata: {},
    },
    edit: {},
    process: { records: {} },
    report: { records: {} },
    workbench: {
      workspaceTargetAssetId: "asset-remote-a",
      comparisonReferenceAssetId: "asset-remote-b",
      analysisScope: {
        comparison: {
          primary: {
            assetId: "asset-remote-a",
            sourceKind: "image",
            url: "https://example.test/a.png",
          },
          reference: {
            assetId: "asset-remote-b",
            sourceKind: "image",
            url: "https://example.test/b.png",
          },
        },
      },
    },
    assets: [
      {
        id: "asset-remote-a",
        type: "image",
        name: "a.png",
        url: "https://example.test/a.png",
        createdAt: 1,
        metadata: { sourceKind: "image" },
      },
      {
        id: "asset-remote-b",
        type: "image",
        name: "b.png",
        url: "https://example.test/b.png",
        createdAt: 2,
        metadata: { sourceKind: "image" },
      },
    ],
  };
  const runtime: Record<string, unknown> = {
    jobs: {},
  };
  const downloads: Array<Record<string, unknown>> = [];
  let resolvedTargetPath: unknown = null;

  const processRuntime = createLaboratoryProcessRuntime({
    appendProcessEvent(record, event) {
      record["events"] = (Array.isArray(record["events"]) ? record["events"] : []).concat(event);
      return record;
    },
    asNonEmptyString,
    buildAudioAnalysisModules() {
      return [];
    },
    buildMediaProcessModules() {
      return [];
    },
    callRoomTools: async (payload) => {
      downloads.push(payload);
      const url = typeof payload["url"] === "string" ? payload["url"] : "";
      const fileName = url.endsWith("b.png") ? "b.png" : "a.png";
      return {
        download: {
          fileName,
          path: `/tmp/project-remote-process/sources/${fileName}`,
        },
      };
    },
    async cancelProcessJobsForProject() {},
    clearJob(runtimeRecord, jobId) {
      delete toRecord(runtimeRecord["jobs"])[jobId];
    },
    clone<T>(value: T): T {
      return structuredClone(value);
    },
    composeFeatureReport() {
      return { status: "ready" };
    },
    createEmptyFeatureProcessRecord(featureId) {
      return { featureId, status: "idle", events: [], modules: [] };
    },
    createEmptyProcessRun(featureId) {
      return { featureId, status: "idle", events: [], modules: [] };
    },
    ensureEditToolReady() {},
    ensureProcessJobSlotAvailable() {},
    async ensureProjectDirectories() {},
    getActiveProject() {
      return activeProject;
    },
    getFeatureProcessDir() {
      return "/tmp/process";
    },
    getFeatureProcessJobAction() {
      return "process-run";
    },
    getFeatureProcessRecord(project, featureId) {
      return toRecord(toRecord(toRecord(project["process"])["records"])[featureId]);
    },
    getProjectSourceDir() {
      return "/tmp/project-remote-process/sources";
    },
    async patchActiveProject(_runtime, patcher) {
      activeProject = patcher(activeProject);
    },
    pushJobState() {},
    registerJob(runtimeRecord, job) {
      toRecord(runtimeRecord["jobs"])[String(job["jobId"])] = job;
    },
    resolveProcessRunFeatureIds() {
      return ["media-analysis"];
    },
    resolveProcessWorkbench(project) {
      return toRecord(project["workbench"]);
    },
    resolveProcessTarget(project) {
      const workbench = toRecord(project["workbench"]);
      const assetId = asNonEmptyString(workbench["workspaceTargetAssetId"]);
      const assets = Array.isArray(project["assets"])
        ? (project["assets"] as Array<Record<string, unknown>>)
        : [];
      const asset =
        assets.find(function (entry) {
          return entry["id"] === assetId;
        }) ?? {};
      resolvedTargetPath = asset["localPath"];
      return {
        requestedMode: "workspace-asset",
        mode: "workspace-asset",
        outputId: assetId,
        signature: `asset:${String(assetId)}`,
        label: asset["name"],
        fileName: asset["name"],
        mimeType: "image/png",
        path: asset["localPath"],
        sourceKind: "image",
      };
    },
    sanitizeFileSegment(value, fallbackValue) {
      return asNonEmptyString(value.replace(/[^a-z0-9-]+/gi, "-").toLowerCase()) ?? fallbackValue;
    },
    setFeatureProcessRecord(project, featureId, record) {
      const processState = toRecord(project["process"]);
      const records = toRecord(processState["records"]);
      records[featureId] = record;
      project["process"] = { ...processState, records };
    },
    setFeatureReportRecord(project, featureId, report) {
      const reportState = toRecord(project["report"]);
      const records = toRecord(reportState["records"]);
      records[featureId] = report;
      project["report"] = { ...reportState, records };
    },
    toRecord,
    updateProcessRecordPercent() {},
    markFeatureReportStale() {},
    audioFeatureId: "audio-analysis",
    buildProcessSpeechAvailability() {
      return {};
    },
    clampProfileTranscriptSampleSeconds() {
      return 30;
    },
    createProcessArtifact(moduleId: unknown, kind: unknown, path: unknown, title: unknown, metadata: unknown) {
      return { id: `${String(moduleId)}-${String(kind)}`, moduleId, kind, path, title, metadata };
    },
    createProcessFinding(
      moduleId: unknown,
      kind: unknown,
      level: unknown,
      confidence: unknown,
      title: unknown,
      detail: unknown,
      evidenceCount: unknown,
      artifactIds: unknown) {
      return { moduleId, kind, level, confidence, title, detail, evidenceCount, artifactIds };
    },
    generateProcessFramePreviewArtifact() {
      return null;
    },
    generateProcessImageComparisonArtifact() {
      return null;
    },
    generateProcessMetadataArtifact() {
      return null;
    },
    generateProcessSpectrogram() {
      return null;
    },
    generateProcessVisualTransformArtifact() {
      return null;
    },
    getAudioAnalysisModuleProcessDir() {
      return "/tmp";
    },
    getAudioAnalysisModuleRunner() {
      return function () {
        return { findings: [], artifacts: [], warnings: [] };
      };
    },
    maybeRunTranscriptProfileSample() {
      return null;
    },
    normalizeProcessArtifact(rawValue: unknown)  {
      return toRecord(rawValue);
    },
    normalizeProcessFinding(rawValue: unknown)  {
      return toRecord(rawValue);
    },
    partitionVisualAnalysisModuleIds() {
      return {};
    },
    resolveEnabledVisualAnalysisModuleIds() {
      return [];
    },
    roomId: "laboratory",
    runAudioStructureProbe() {
      return null;
    },
    runVideoStructureProbe() {
      return null;
    },
    updateProcessModule,
    async writeJsonFile() {},
    async writeTextFile() {},
  });

  await processRuntime.runFeatureProcess(
    {},
    runtime,
    "req-remote-process",
    "media-analysis",
    activeProject["workbench"]
  );

  assert.deepEqual(
    downloads.map(function (entry) {
      return entry["url"];
    }),
    ["https://example.test/a.png", "https://example.test/b.png"]
  );
  assert.equal(resolvedTargetPath, "/tmp/project-remote-process/sources/a.png");
  const assets = activeProject["assets"] as Array<Record<string, unknown>>;
  assert.equal(
    assets.some(function (asset) {
      return asset["id"] === "asset-remote-a" && asset["localPath"] === resolvedTargetPath;
    }),
    true
  );
  assert.deepEqual(toRecord(toRecord(activeProject["workbench"])["analysisScope"])["comparison"], {
    primary: {
      assetId: "asset-remote-a",
      fileName: "a.png",
      label: "a.png",
      localPath: "/tmp/project-remote-process/sources/a.png",
      metadata: {
        sourceKind: "image",
      },
      name: "a.png",
      path: "/tmp/project-remote-process/sources/a.png",
      sourceKind: "image",
      type: "image",
      url: "https://example.test/a.png",
    },
    reference: {
      assetId: "asset-remote-b",
      fileName: "b.png",
      label: "b.png",
      localPath: "/tmp/project-remote-process/sources/b.png",
      metadata: {
        sourceKind: "image",
      },
      name: "b.png",
      path: "/tmp/project-remote-process/sources/b.png",
      sourceKind: "image",
      type: "image",
      url: "https://example.test/b.png",
    },
  });
});
