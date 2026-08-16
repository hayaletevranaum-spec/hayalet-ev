import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRoomBuiltArtifact, createRoomInstalledCopy } from "./helpers/room-installed-copy.ts";
import { createMediaExportActionRuntime } from "../../rooms/laboratory/features/media-analysis/host/action-handlers-export.ts";
import { createLaboratoryJobStateRuntime } from "../../rooms/laboratory/shared/host/job-state.ts";
import { syncSourceLabAssetForProject } from "../../rooms/laboratory/shared/host/lab-assets.ts";

void test("laboratory host action composition is extracted into a shared host boundary", async () => {
  const workspaceHostSource = readFileSync("rooms/laboratory/host/index.ts", "utf8");
  const workspaceHostRuntimeSource = readFileSync("rooms/laboratory/host/runtime.ts", "utf8");
  const workspaceHostFoundationSource = readFileSync(
    "rooms/laboratory/host/foundation-runtimes.ts",
    "utf8"
  );
  const workspaceHostProjectSource = readFileSync(
    "rooms/laboratory/host/project-runtimes.ts",
    "utf8"
  );
  const workspaceHostFeatureSource = readFileSync(
    "rooms/laboratory/host/feature-runtimes.ts",
    "utf8"
  );
  const workspaceActionCompositionSource = readFileSync(
    "rooms/laboratory/shared/host/action-composition.ts",
    "utf8"
  );
  const workspaceActionRuntimeSource = readFileSync(
    "rooms/laboratory/shared/host/action-runtime.ts",
    "utf8"
  );
  const workspaceActionRouterSource = readFileSync(
    "rooms/laboratory/shared/host/action-router.ts",
    "utf8"
  );
  const workspaceFeatureAdaptersSource = readFileSync(
    "rooms/laboratory/host/feature-adapters.ts",
    "utf8"
  );

  assert.equal(existsSync("rooms/laboratory/shared/host/action-composition.ts"), true);
  assert.equal(existsSync("rooms/laboratory/shared/host/action-runtime.ts"), true);
  assert.equal(existsSync("rooms/laboratory/host/foundation-runtimes.ts"), true);
  assert.equal(existsSync("rooms/laboratory/host/project-runtimes.ts"), true);
  assert.equal(existsSync("rooms/laboratory/host/feature-runtimes.ts"), true);
  assert.equal(existsSync("rooms/laboratory/host/feature-adapters.ts"), true);
  assert.equal(existsSync("rooms/laboratory/host/runtime.ts"), true);
  assert.match(workspaceHostSource, /\.\/runtime\.js/);
  assert.match(workspaceHostRuntimeSource, /from "\.\/foundation-runtimes\.js"/);
  assert.match(workspaceHostRuntimeSource, /from "\.\/project-runtimes\.js"/);
  assert.match(workspaceHostRuntimeSource, /from "\.\/feature-runtimes\.js"/);
  assert.match(
    workspaceHostFoundationSource,
    /export function createLaboratoryHostFoundation\(\s*deps(?::[\s\S]+?)?\s*\)/
  );
  assert.match(
    workspaceHostProjectSource,
    /export function createLaboratoryHostProjectRuntimes\(\s*deps(?::[\s\S]+?)?\s*\)/
  );
  assert.match(
    workspaceHostFeatureSource,
    /export function createLaboratoryHostFeatureRuntimes\(\s*deps(?::[\s\S]+?)?\s*\)/
  );
  assert.doesNotMatch(workspaceHostSource, /shared\/host\/action-composition\.js/);
  assert.match(
    workspaceActionRuntimeSource,
    /export function createLaboratoryHostActionRuntime\(\s*deps(?::[\s\S]+?)?\s*\)/
  );
  assert.match(workspaceActionRuntimeSource, /function getActionRouter\(\)/);
  assert.match(
    workspaceActionRuntimeSource,
    /function handleToolMutation\(\s*api\??(?::[\s\S]+?)?,\s*runtime\??(?::[\s\S]+?)?,\s*requestId\??(?::[\s\S]+?)?,\s*action\??(?::[\s\S]+?)?,\s*toolId\??(?::[\s\S]+?)?,\s*featureStage\??(?::[\s\S]+?)?\s*\)(?::[\s\S]+?)?/
  );
  assert.match(
    workspaceActionRuntimeSource,
    /function handleMediaAction\(\s*api\??(?::[\s\S]+?)?,\s*runtime\??(?::[\s\S]+?)?,\s*payload\??(?::[\s\S]+?)?\s*\)(?::[\s\S]+?)?/
  );
  assert.match(workspaceActionRuntimeSource, /from "\.\/action-router\.js"/);
  assert.match(
    workspaceActionCompositionSource,
    /export function createLaboratoryActionCompositionRuntime\(\s*deps(?::[\s\S]+?)?\s*\)/
  );
  assert.match(workspaceActionCompositionSource, /from "\.\/action-runtime\.js"/);
  assert.match(workspaceActionCompositionSource, /from "\.\/tool-mutations\.js"/);
  assert.match(
    workspaceActionCompositionSource,
    /from "\.\.\/\.\.\/features\/media-analysis\/host\/action-handlers\.js"/
  );
  assert.match(
    workspaceActionRouterSource,
    /export function createLaboratoryActionRouter\(\s*deps(?::[\s\S]+?)?\s*\)/
  );
  assert.match(
    workspaceFeatureAdaptersSource,
    /export function createLaboratoryFeatureAdapters\(\s*deps(?::[\s\S]+?)?\s*\)/
  );
  assert.match(
    workspaceHostFeatureSource,
    /deleteProject:\s*projectRuntimes\.lifecycle\.deleteProject,/
  );
  assert.match(workspaceFeatureAdaptersSource, /from "\.\.\/shared\/host\/action-composition\.js"/);
  assert.doesNotMatch(workspaceFeatureAdaptersSource, /features\/[^"]+\/host\/runtime\.js/);
  assert.match(workspaceHostFeatureSource, /from "\.\/feature-adapters\.js"/);
  assert.doesNotMatch(
    workspaceHostRuntimeSource,
    /from "\.\.\/shared\/host\/action-composition\.js"/
  );
  assert.doesNotMatch(workspaceHostRuntimeSource, /from "\.\.\/shared\/host\/action-runtime\.js"/);

  const installedCopy = await createRoomInstalledCopy("laboratory");
  const buildArtifact = await createRoomBuiltArtifact("laboratory");

  try {
    const builtHostSource = readFileSync(`${buildArtifact.rootDir}/host/index.js`, "utf8");
    const builtHostRuntimeSource = readFileSync(`${buildArtifact.rootDir}/host/runtime.js`, "utf8");
    const builtHostFoundationSource = readFileSync(
      `${buildArtifact.rootDir}/host/foundation-runtimes.js`,
      "utf8"
    );
    const builtHostProjectSource = readFileSync(
      `${buildArtifact.rootDir}/host/project-runtimes.js`,
      "utf8"
    );
    const builtHostFeatureSource = readFileSync(
      `${buildArtifact.rootDir}/host/feature-runtimes.js`,
      "utf8"
    );
    const builtActionCompositionSource = readFileSync(
      `${buildArtifact.rootDir}/shared/host/action-composition.js`,
      "utf8"
    );
    const builtActionRuntimeSource = readFileSync(
      `${buildArtifact.rootDir}/shared/host/action-runtime.js`,
      "utf8"
    );
    const builtFeatureAdaptersSource = readFileSync(
      `${buildArtifact.rootDir}/host/feature-adapters.js`,
      "utf8"
    );
    const installedHostSource = readFileSync(`${installedCopy.rootDir}/host/index.js`, "utf8");
    const installedHostRuntimeSource = readFileSync(
      `${installedCopy.rootDir}/host/runtime.js`,
      "utf8"
    );
    const installedHostFoundationSource = readFileSync(
      `${installedCopy.rootDir}/host/foundation-runtimes.js`,
      "utf8"
    );
    const installedHostProjectSource = readFileSync(
      `${installedCopy.rootDir}/host/project-runtimes.js`,
      "utf8"
    );
    const installedHostFeatureSource = readFileSync(
      `${installedCopy.rootDir}/host/feature-runtimes.js`,
      "utf8"
    );
    const installedActionCompositionSource = readFileSync(
      `${installedCopy.rootDir}/shared/host/action-composition.js`,
      "utf8"
    );
    const installedActionRuntimeSource = readFileSync(
      `${installedCopy.rootDir}/shared/host/action-runtime.js`,
      "utf8"
    );
    const installedFeatureAdaptersSource = readFileSync(
      `${installedCopy.rootDir}/host/feature-adapters.js`,
      "utf8"
    );

    assert.equal(existsSync(`${installedCopy.rootDir}/shared/host/action-composition.js`), true);
    assert.equal(existsSync(`${installedCopy.rootDir}/shared/host/action-runtime.js`), true);
    assert.equal(existsSync(`${installedCopy.rootDir}/host/foundation-runtimes.js`), true);
    assert.equal(existsSync(`${installedCopy.rootDir}/host/project-runtimes.js`), true);
    assert.equal(existsSync(`${installedCopy.rootDir}/host/feature-runtimes.js`), true);
    assert.equal(existsSync(`${installedCopy.rootDir}/host/feature-adapters.js`), true);
    assert.equal(existsSync(`${installedCopy.rootDir}/host/runtime.js`), true);
    assert.equal(installedHostSource, builtHostSource);
    assert.equal(installedHostRuntimeSource, builtHostRuntimeSource);
    assert.equal(installedHostFoundationSource, builtHostFoundationSource);
    assert.equal(installedHostProjectSource, builtHostProjectSource);
    assert.equal(installedHostFeatureSource, builtHostFeatureSource);
    assert.equal(installedActionCompositionSource, builtActionCompositionSource);
    assert.equal(installedActionRuntimeSource, builtActionRuntimeSource);
    assert.equal(installedFeatureAdaptersSource, builtFeatureAdaptersSource);
  } finally {
    await buildArtifact.cleanup();
    await installedCopy.cleanup();
  }
});

void test("laboratory media export runtime cancels only prior export jobs for every export handler", async () => {
  async function runExportCase(
    expectedAssetType: string,
    runExport: (
      exportRuntime: ReturnType<typeof createMediaExportActionRuntime>,
      runtime: { roomId: string; jobs: Record<string, Record<string, unknown>> }
    ) => Promise<unknown>
  ) {
    const cancelledJobIds: string[] = [];
    const pushedJobStates: Array<Record<string, unknown>> = [];
    let activeProject: Record<string, unknown> = {
      id: "project-1",
      source: {
        kind: "video",
        storedPath: "/tmp/lab-demo.mp4",
        metadata: {
          durationSeconds: 1.4,
        },
      },
      process: {
        records: {
          "media-analysis": {
            runId: "run-1",
          },
        },
      },
      workbench: {},
      assets: [],
    };
    const jobState = createLaboratoryJobStateRuntime({
      roomId: "laboratory",
      cancelRoomTool: async function (_roomId, jobId, _requestId) {
        cancelledJobIds.push(jobId);
      },
    });

    const exportRuntime = createMediaExportActionRuntime({
      asNonEmptyString(value: unknown) {
        return typeof value === "string" && value.trim() !== "" ? value : null;
      },
      asNumber(value: unknown) {
        return typeof value === "number" && Number.isFinite(value) ? value : null;
      },
      callRoomTools: async (_payload) => ({
        run: {
          exitCode: 0,
        },
      }),
      getActiveProject() {
        return activeProject;
      },
      getProjectEditOutputDir() {
        return "/tmp";
      },
      async patchActiveProject(_runtime, patcher) {
        const nextProject = patcher(activeProject);
        activeProject = {
          ...nextProject,
          assets: syncSourceLabAssetForProject(nextProject, nextProject["assets"]),
        };
      },
      pushJobState(_api, payload) {
        pushedJobStates.push({ ...payload });
      },
      registerJob: jobState.registerJob as unknown as (runtime: Record<string, unknown>, job: Record<string, unknown>) => void,
      clearJob: jobState.clearJob as unknown as (runtime: Record<string, unknown>, jobId: string) => void,
      cancelJobsForProject: jobState.cancelJobsForProject as unknown as (runtime: Record<string, unknown>, projectId: string, requestId: string, options?: {actionIds?: string[]}) => Promise<unknown>,
      toRecord(value: unknown) {
        return value !== null && typeof value === "object" && Array.isArray(value) === false
          ? (value as Record<string, unknown>)
          : {};
      },
    });

    const runtime = {
      roomId: "laboratory",
      jobs: {
        "process-job": {
          requestId: "req-process-1",
          action: "process-run",
          projectId: "project-1",
          toolId: "ffmpeg",
          featureStage: "process",
          operation: "tool-run",
          stage: "queued",
          percent: null,
          bytesReceived: null,
          bytesTotal: null,
          message: null,
        },
        "old-roi-job": {
          requestId: "req-export-roi-old",
          action: "export-roi-image",
          projectId: "project-1",
          toolId: "ffmpeg",
          featureStage: "edit",
          operation: "tool-run",
          stage: "queued",
          percent: null,
          bytesReceived: null,
          bytesTotal: null,
          message: null,
        },
        "old-frame-job": {
          requestId: "req-export-frame-old",
          action: "export-frame-grab",
          projectId: "project-1",
          toolId: "ffmpeg",
          featureStage: "edit",
          operation: "tool-run",
          stage: "queued",
          percent: null,
          bytesReceived: null,
          bytesTotal: null,
          message: null,
        },
        "old-clip-job": {
          requestId: "req-export-clip-old",
          action: "export-timeline-clip",
          projectId: "project-1",
          toolId: "ffmpeg",
          featureStage: "edit",
          operation: "tool-run",
          stage: "queued",
          percent: null,
          bytesReceived: null,
          bytesTotal: null,
          message: null,
        },
        "old-audio-job": {
          requestId: "req-export-audio-old",
          action: "export-audio-track",
          projectId: "project-1",
          toolId: "ffmpeg",
          featureStage: "edit",
          operation: "tool-run",
          stage: "queued",
          percent: null,
          bytesReceived: null,
          bytesTotal: null,
          message: null,
        },
        "old-clean-audio-job": {
          requestId: "req-export-clean-audio-old",
          action: "export-clean-audio",
          projectId: "project-1",
          toolId: "ffmpeg",
          featureStage: "edit",
          operation: "tool-run",
          stage: "queued",
          percent: null,
          bytesReceived: null,
          bytesTotal: null,
          message: null,
        },
        "old-band-pass-job": {
          requestId: "req-export-band-pass-old",
          action: "export-band-pass-voice",
          projectId: "project-1",
          toolId: "ffmpeg",
          featureStage: "edit",
          operation: "tool-run",
          stage: "queued",
          percent: null,
          bytesReceived: null,
          bytesTotal: null,
          message: null,
        },
      } as Record<string, Record<string, unknown>>,
    };

    await runExport(exportRuntime, runtime);

    assert.deepEqual(cancelledJobIds, [
      "old-roi-job",
      "old-frame-job",
      "old-clip-job",
      "old-audio-job",
      "old-clean-audio-job",
      "old-band-pass-job",
    ]);
    assert.equal(Boolean(runtime.jobs["process-job"]), true);
    assert.deepEqual(Object.keys(runtime.jobs), ["process-job"]);

    const assets = activeProject["assets"] as Array<Record<string, unknown>>;
    assert.equal(assets.length, 2);
    assert.equal(
      assets.some((asset) => asset["type"] === "source"),
      true
    );
    const outputAsset = assets.find(function (asset) {
      return asset["type"] === expectedAssetType;
    });
    const metadata = (outputAsset?.["metadata"] ?? {}) as Record<string, unknown>;
    assert.equal(outputAsset?.["runId"], "run-1");
    assert.equal(typeof outputAsset["sourceId"], "string");
    assert.equal(outputAsset["derivedFromAssetId"], outputAsset["sourceId"]);
    assert.equal(outputAsset["derivedFromSourceId"], outputAsset["sourceId"]);
    assert.equal(metadata["flowKind"], "operation-result");
    assert.equal(metadata["evidenceRole"], "derived");
    if (expectedAssetType === "audio") {
      assert.equal(metadata["operationId"], "audio-extract");
      assert.equal(metadata["filterPreset"], "audio-extract");
      assert.equal(metadata["durationMs"], 1400);
      assert.deepEqual(metadata["sourceRange"], { endMs: 1400, startMs: 0 });
      assert.equal(metadata["startOffsetMs"], 0);
    } else if (expectedAssetType === "clip") {
      assert.equal(metadata["operationId"], "clip-export");
      assert.equal(metadata["filterPreset"], "clip-export");
      assert.deepEqual(metadata["sourceRange"], { endMs: 2400, startMs: 1000 });
    } else if (expectedAssetType === "frame") {
      assert.equal(metadata["operationId"], "frame-grab");
      assert.equal(metadata["filterPreset"], "frame-grab");
      assert.deepEqual(metadata["sourceRange"], { endMs: 1200, startMs: 1200 });
    } else {
      assert.equal(metadata["operationId"], "roi-crop");
      assert.equal(metadata["filterPreset"], "roi-crop");
    }
    const completedPayload =
      pushedJobStates.find(function (payload) {
        return payload["stage"] === "completed";
      }) ?? null;
    assert.deepEqual((completedPayload as NonNullable<typeof completedPayload>)["resultAssetIds"], [outputAsset["id"]]);
  }

  await runExportCase("image", async function (exportRuntime, runtime) {
    return await exportRuntime.exportROIImage({}, runtime, "req-export-roi-new", {
      regionId: "face",
      x: 8,
      y: 12,
      width: 120,
      height: 80,
      seekMs: 1200,
    });
  });
  await runExportCase("frame", async function (exportRuntime, runtime) {
    return await exportRuntime.exportFrameGrab({}, runtime, "req-export-frame-new", {
      seekMs: 1200,
    });
  });
  await runExportCase("clip", async function (exportRuntime, runtime) {
    return await exportRuntime.exportTimelineClip({}, runtime, "req-export-clip-new", {
      startMs: 1000,
      endMs: 2400,
    });
  });
  await runExportCase("audio", async function (exportRuntime, runtime) {
    return await exportRuntime.exportAudioTrack({}, runtime, "req-export-audio-new", {});
  });
});

void test("laboratory media export runtime reports cancelled tool runs without leaking ffmpeg output", async () => {
  const pushedJobStates: Array<Record<string, unknown>> = [];
  let activeProject: Record<string, unknown> = {
    id: "project-1",
    source: {
      kind: "video",
      storedPath: "/tmp/lab-demo.mp4",
      metadata: {
        durationSeconds: 8,
        height: 360,
        width: 640,
      },
    },
    process: {
      records: {},
    },
    workbench: {
      analysisScope: {},
    },
    assets: [],
  };
  const jobState = createLaboratoryJobStateRuntime({
    roomId: "laboratory",
    cancelRoomTool: async function (_roomId, _jobId, _requestId) {},
  });
  const exportRuntime = createMediaExportActionRuntime({
    asNonEmptyString(value: unknown) {
      return typeof value === "string" && value.trim() !== "" ? value : null;
    },
    asNumber(value: unknown) {
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    },
      callRoomTools: async (_payload) => ({
        run: {
          cancelled: true,
          stderr: "ffmpeg version n6.1 -i /tmp/lab-demo.mp4 leaked command output",
        },
      }),
      getActiveProject() {
        return activeProject;
      },
      getProjectEditOutputDir() {
        return "/tmp";
      },
      async patchActiveProject(_runtime, patcher) {
        activeProject = patcher(activeProject);
      },
      pushJobState(_api, payload) {
        pushedJobStates.push({ ...payload });
      },
      registerJob: jobState.registerJob as unknown as (runtime: Record<string, unknown>, job: Record<string, unknown>) => void,
      clearJob: jobState.clearJob as unknown as (runtime: Record<string, unknown>, jobId: string) => void,
      cancelJobsForProject: jobState.cancelJobsForProject as unknown as (runtime: Record<string, unknown>, projectId: string, requestId: string, options?: {actionIds?: string[]}) => Promise<unknown>,
    toRecord(value: unknown) {
      return value !== null && typeof value === "object" && Array.isArray(value) === false
        ? (value as Record<string, unknown>)
        : {};
    },
  });
  const runtime = {
    roomId: "laboratory",
    jobs: {},
  };

  const result = (await exportRuntime.exportTimelineClip({}, runtime, "req-export-cancel", {
    endMs: 1200,
    startMs: 0,
  })) as Record<string, unknown>;

  assert.equal(result["cancelled"], true);
  const cancelledPayload =
    pushedJobStates.find(function (payload) {
      return payload["stage"] === "cancelled";
    }) ?? null;
  assert.equal(cancelledPayload?.["message"], "İşlem iptal edildi.");
  assert.doesNotMatch(String(cancelledPayload["message"] ), /ffmpeg|-i/);
  assert.equal(
    pushedJobStates.some(function (payload) {
      return payload["stage"] === "failed";
    }),
    false
  );
  assert.deepEqual(Object.keys(runtime.jobs), []);
});

void test("laboratory audio variant exports preserve filter and lineage metadata", async () => {
  async function runAudioVariant(action: "clean" | "voice"): Promise<{
    args: string[];
    completedPayload: Record<string, unknown> | null;
    metadata: Record<string, unknown>;
    outputAssetId: unknown;
  }> {
    const sourceKind = action === "voice" ? "audio" : "video";
    let activeProject: Record<string, unknown> = {
      id: `project-audio-${action}`,
      source: {
        kind: sourceKind,
        storedPath: "/tmp/lab-demo.mp4",
        metadata: {
          audioCodec: "aac",
          durationSeconds: 2.5,
        },
      },
      process: {
        records: {
          "media-analysis": {
            runId: "run-audio-variant",
          },
        },
      },
      workbench: {},
      assets: [],
    };
    const pushedJobStates: Array<Record<string, unknown>> = [];
    const toolRuns: Array<Record<string, unknown>> = [];
    const jobState = createLaboratoryJobStateRuntime({
      roomId: "laboratory",
      cancelRoomTool: async function (_roomId, _jobId, _requestId) {},
    });
    const exportRuntime = createMediaExportActionRuntime({
      asNonEmptyString(value: unknown) {
        return typeof value === "string" && value.trim() !== "" ? value : null;
      },
      asNumber(value: unknown) {
        return typeof value === "number" && Number.isFinite(value) ? value : null;
      },
      callRoomTools: async (payload) => {
        toolRuns.push({ ...payload });
        return {
          run: {
            exitCode: 0,
          },
        };
      },
      getActiveProject() {
        return activeProject;
      },
      getProjectEditOutputDir() {
        return "/tmp";
      },
      async patchActiveProject(_runtime, patcher) {
        const nextProject = patcher(activeProject);
        activeProject = {
          ...nextProject,
          assets: syncSourceLabAssetForProject(nextProject, nextProject["assets"]),
        };
      },
      pushJobState(_api, payload) {
        pushedJobStates.push({ ...payload });
      },
      registerJob: jobState.registerJob as unknown as (runtime: Record<string, unknown>, job: Record<string, unknown>) => void,
      clearJob: jobState.clearJob as unknown as (runtime: Record<string, unknown>, jobId: string) => void,
      cancelJobsForProject: jobState.cancelJobsForProject as unknown as (runtime: Record<string, unknown>, projectId: string, requestId: string, options?: {actionIds?: string[]}) => Promise<unknown>,
      toRecord(value: unknown) {
        return value !== null && typeof value === "object" && Array.isArray(value) === false
          ? (value as Record<string, unknown>)
          : {};
      },
    });

    if (action === "clean") {
      await exportRuntime.exportCleanAudio({}, { roomId: "laboratory", jobs: {} }, "req-clean", {});
    } else {
      await exportRuntime.exportBandPassVoice(
        {},
        { roomId: "laboratory", jobs: {} },
        "req-voice",
        {}
      );
    }

    const outputAsset = (activeProject["assets"] as Array<Record<string, unknown>>).find(
      function (asset) {
        return asset["type"] === "audio";
      }
    );
    return {
      args: toolRuns[0]?.["args"] as string[],
      completedPayload:
        pushedJobStates.find(function (payload) {
          return payload["stage"] === "completed";
        }) ?? null,
      metadata: (outputAsset?.["metadata"] ?? {}) as Record<string, unknown>,
      outputAssetId: outputAsset?.["id"],
    };
  }

  const clean = await runAudioVariant("clean");
  assert.equal(clean.metadata["operationId"], "audio-cleanup");
  assert.equal(clean.metadata["filterPreset"], "cleanup-basic");
  assert.deepEqual(clean.metadata["sourceRange"], { endMs: 2500, startMs: 0 });
  assert.deepEqual(clean.completedPayload?.["resultAssetIds"], [clean.outputAssetId]);
  assert.equal(
    clean.args.some((arg) => arg.includes("afftdn=nf=-25")),
    true
  );

  const voice = await runAudioVariant("voice");
  assert.equal(voice.metadata["operationId"], "band-pass-voice");
  assert.equal(voice.metadata["filterPreset"], "voice-band-pass");
  assert.deepEqual(voice.completedPayload?.["resultAssetIds"], [voice.outputAssetId]);
  assert.equal(
    voice.args.some(function (arg) {
      return (
        arg.includes("highpass=f=120,lowpass=f=3800") &&
        arg.includes("equalizer=f=1960:t=q:w=1:g=6") &&
        arg.includes("dynaudnorm=f=150:g=12")
      );
    }),
    true
  );
  assert.equal(voice.args[voice.args.indexOf("-ac") + 1], "1");
});

void test("laboratory ROI exports normalize crop pixels and preserve operation lineage metadata", async () => {
  let activeProject: Record<string, unknown> = {
    id: "project-roi-lineage",
    source: {
      kind: "video",
      storedPath: "/tmp/lab-demo.mp4",
      metadata: {
        durationSeconds: 8,
        height: 360,
        width: 640,
      },
    },
    process: {
      records: {
        "media-analysis": {
          runId: "run-roi-lineage",
        },
      },
    },
    workbench: {},
    assets: [],
  };
  const toolRuns: Array<Record<string, unknown>> = [];
  const jobState = createLaboratoryJobStateRuntime({
    roomId: "laboratory",
    cancelRoomTool: async function (_roomId, _jobId, _requestId) {},
  });
  const exportRuntime = createMediaExportActionRuntime({
    asNonEmptyString(value: unknown) {
      return typeof value === "string" && value.trim() !== "" ? value : null;
    },
    asNumber(value: unknown) {
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    },
    callRoomTools: async (payload) => {
      toolRuns.push({ ...payload });
      return {
        run: {
          exitCode: 0,
        },
      };
    },
    getActiveProject() {
      return activeProject;
    },
    getProjectEditOutputDir() {
      return "/tmp";
    },
    async patchActiveProject(_runtime, patcher) {
      const nextProject = patcher(activeProject);
      activeProject = {
        ...nextProject,
        assets: syncSourceLabAssetForProject(nextProject, nextProject["assets"]),
      };
    },
    pushJobState() {},
    registerJob: jobState.registerJob as unknown as (runtime: Record<string, unknown>, job: Record<string, unknown>) => void,
    clearJob: jobState.clearJob as unknown as (runtime: Record<string, unknown>, jobId: string) => void,
    cancelJobsForProject: jobState.cancelJobsForProject as unknown as (runtime: Record<string, unknown>, projectId: string, requestId: string, options?: {actionIds?: string[]}) => Promise<unknown>,
    toRecord(value: unknown) {
      return value !== null && typeof value === "object" && Array.isArray(value) === false
        ? (value as Record<string, unknown>)
        : {};
    },
  });

  await exportRuntime.exportROIImage(
    {},
    {
      roomId: "laboratory",
      jobs: {},
    },
    "req-roi-lineage",
    {
      normalizedRoi: {
        height: 0.5,
        width: 0.5,
        x: 0.1,
        y: 0.1,
      },
      regionId: "selection",
      seekMs: 1500,
    }
  );

  const args = toolRuns[0]?.["args"] as string[];
  assert.equal(args.includes("crop=320:180:64:36"), true);
  const assets = activeProject["assets"] as Array<Record<string, unknown>>;
  const outputAsset = assets.find(function (asset) {
    return asset["type"] === "image";
  });
  const metadata = (outputAsset?.["metadata"] ?? {}) as Record<string, unknown>;
  assert.equal(outputAsset?.["runId"], "run-roi-lineage");
  assert.equal(outputAsset["derivedFromAssetId"], outputAsset["sourceId"]);
  assert.equal(metadata["operationId"], "roi-crop");
  assert.equal(metadata["flowKind"], "operation-result");
  assert.equal(metadata["evidenceRole"], "derived");
  assert.equal(metadata["filterPreset"], "roi-crop");
  assert.deepEqual(metadata["cropPixels"], { height: 180, width: 320, x: 64, y: 36 });
  assert.deepEqual(metadata["sourceDimensions"], { height: 360, width: 640 });
  assert.deepEqual(metadata["sourceRange"], { endMs: 1500, startMs: 1500 });

  activeProject = {
    ...activeProject,
    assets: [
      ...(activeProject["assets"] as Array<Record<string, unknown>>),
      {
        id: "asset-image-target",
        type: "image",
        name: "target.png",
        localPath: "/tmp/target.png",
        createdAt: 10,
        derivedFromAssetId: "asset-analysis-artifact",
        metadata: {
          height: 240,
          kind: "image",
          width: 320,
        },
      },
    ],
  };

  await exportRuntime.exportROIImage(
    {},
    {
      roomId: "laboratory",
      jobs: {},
    },
    "req-roi-selected-asset",
    {
      normalizedRoi: {
        height: 0.5,
        width: 0.5,
        x: 0.1,
        y: 0.1,
      },
      regionId: "selected-asset",
      workspaceTargetAssetId: "asset-image-target",
    }
  );

  const selectedArgs = toolRuns[1]?.["args"] as string[];
  assert.equal(selectedArgs.includes("/tmp/target.png"), true);
  assert.equal(selectedArgs.includes("-ss"), false);
  const selectedOutputAsset = (activeProject["assets"] as Array<Record<string, unknown>>).find(
    function (asset) {
      return (
        asset["type"] === "image" &&
        (asset["metadata"] as Record<string, unknown> | undefined)?.["requestId"] ===
          "req-roi-selected-asset"
      );
    }
  );
  const selectedMetadata = (selectedOutputAsset?.["metadata"] ?? {}) as Record<string, unknown>;
  assert.equal(selectedOutputAsset?.["derivedFromAssetId"], "asset-image-target");
  assert.notEqual(selectedOutputAsset["sourceId"], "asset-analysis-artifact");
  assert.equal(selectedOutputAsset["derivedFromSourceId"], undefined);
  assert.deepEqual(selectedMetadata["sourceDimensions"], { height: 240, width: 320 });

  activeProject = {
    ...activeProject,
    assets: [
      ...(activeProject["assets"] as Array<Record<string, unknown>>),
      {
        id: "asset-remote-target",
        type: "clip",
        name: "remote.mp4",
        url: "https://example.test/remote.mp4",
        createdAt: 11,
      },
    ],
  };

  await assert.rejects(
    exportRuntime.exportROIImage(
      {},
      {
        roomId: "laboratory",
        jobs: {},
      },
      "req-roi-remote-target",
      {
        height: 10,
        regionId: "remote-target",
        width: 10,
        workspaceTargetAssetId: "asset-remote-target",
        x: 0,
        y: 0,
      }
    ),
    /not available as a local operation target/
  );
});

void test("laboratory comparison finding saves independent primary and reference ROI context", async () => {
  const primaryRoi = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
  const referenceRoi = { x: 0.2, y: 0.1, width: 0.25, height: 0.35 };
  let activeProject: Record<string, unknown> = {
    id: "project-comparison-roi",
    source: {
      kind: "image",
      storedPath: "/tmp/current-source.png",
      metadata: {
        kind: "image",
      },
    },
    process: {
      records: {
        "media-analysis": {
          runId: "run-comparison-roi",
        },
      },
    },
    workbench: {},
    assets: [
      {
        id: "asset-primary",
        type: "image",
        name: "primary.png",
        localPath: "/tmp/primary.png",
        createdAt: 10,
        metadata: { kind: "image" },
      },
      {
        id: "asset-reference",
        type: "image",
        name: "reference.png",
        localPath: "/tmp/reference.png",
        createdAt: 11,
        metadata: { kind: "image" },
      },
    ],
  };
  const toolRuns: Array<Record<string, unknown>> = [];
  const writes: Array<{ data: string; path: string }> = [];
  const jobState = createLaboratoryJobStateRuntime({
    roomId: "laboratory",
    cancelRoomTool: async function (_roomId, _jobId, _requestId) {},
  });
  const exportRuntime = createMediaExportActionRuntime({
    asNonEmptyString(value: unknown) {
      return typeof value === "string" && value.trim() !== "" ? value : null;
    },
    asNumber(value: unknown) {
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    },
    callRoomTools: async (payload) => {
      toolRuns.push({ ...payload });
      return {
        run: {
          exitCode: 0,
        },
      };
    },
    getActiveProject() {
      return activeProject;
    },
    getProjectEditOutputDir() {
      return "/tmp";
    },
    async patchActiveProject(_runtime, patcher) {
      const nextProject = patcher(activeProject);
      activeProject = {
        ...nextProject,
        assets: syncSourceLabAssetForProject(nextProject, nextProject["assets"]),
      };
    },
    pushJobState() {},
    registerJob: jobState.registerJob as unknown as (runtime: Record<string, unknown>, job: Record<string, unknown>) => void,
    clearJob: jobState.clearJob as unknown as (runtime: Record<string, unknown>, jobId: string) => void,
    cancelJobsForProject: jobState.cancelJobsForProject as unknown as (runtime: Record<string, unknown>, projectId: string, requestId: string, options?: {actionIds?: string[]}) => Promise<unknown>,
    toRecord(value: unknown) {
      return value !== null && typeof value === "object" && Array.isArray(value) === false
        ? (value as Record<string, unknown>)
        : {};
    },
  });
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      electronAPI: {
        fmWriteFileAtomic(payload: { data: string; path: string }) {
          writes.push(payload);
          return { path: payload.path, success: true };
        },
        openPath() {
          return { success: true };
        },
        readDirectoryFiles() {
          return [];
        },
        readFile() {
          return null;
        },
        roomToolsCall() {
          return { success: true };
        },
        roomToolsCancel() {
          return { success: true };
        },
      },
    },
  });

  try {
    await exportRuntime.saveComparisonFinding(
      {},
      {
        roomId: "laboratory",
        jobs: {},
      },
      "req-comparison-roi",
      {
        captureKind: "finding",
        comparisonReferenceAssetId: "asset-reference",
        comparisonRoiActiveSide: "reference",
        comparisonRois: {
          activeSide: "reference",
          primary: primaryRoi,
          reference: referenceRoi,
        },
        comparisonViewMode: "roi-detail",
        findingNote: "Reference glow shifted",
        normalizedRoi: referenceRoi,
        operationSettings: {
          format: "png",
          includeRoiDetail: true,
          layout: "side-by-side",
        },
        primaryNormalizedRoi: primaryRoi,
        referenceNormalizedRoi: referenceRoi,
        workspaceTargetAssetId: "asset-primary",
      }
    );
  } finally {
    if (originalWindowDescriptor) {
      Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    } else {
      delete (globalThis as Record<string, unknown>)["window"];
    }
  }

  const renderRun = toolRuns.find(function (run) {
    return run["operation"] === "tool-run";
  });
  const args = (renderRun?.["args"] ?? []) as string[];
  const filterGraph = args[args.indexOf("-filter_complex") + 1] ?? "";
  assert.match(filterGraph, /\[0:v\]crop=iw\*0\.3:ih\*0\.4:iw\*0\.1:ih\*0\.2\[r0src\]/);
  assert.match(filterGraph, /\[1:v\]crop=iw\*0\.25:ih\*0\.35:iw\*0\.2:ih\*0\.1\[r1src\]/);

  const outputAsset = (activeProject["assets"] as Array<Record<string, unknown>>).find(
    function (asset) {
      return (
        asset["type"] === "image" &&
        (asset["metadata"] as Record<string, unknown> | undefined)?.["requestId"] ===
          "req-comparison-roi"
      );
    }
  );
  const metadata = (outputAsset?.["metadata"] ?? {}) as Record<string, unknown>;
  const captureContext = (metadata["captureContext"] ?? {}) as Record<string, unknown>;
  assert.equal(outputAsset?.["derivedFromAssetId"], "asset-primary");
  assert.equal(captureContext["comparisonRoiActiveSide"], "reference");
  assert.deepEqual(captureContext["primaryNormalizedRoi"], primaryRoi);
  assert.deepEqual(captureContext["referenceNormalizedRoi"], referenceRoi);
  assert.deepEqual(captureContext["comparisonRois"], {
    activeSide: "reference",
    primary: primaryRoi,
    reference: referenceRoi,
  });
  assert.equal(writes.length, 1);
  const manifestPayload = JSON.parse(writes[0]?.data ?? "{}") as Record<string, unknown>;
  assert.deepEqual(manifestPayload["comparisonRois"], {
    activeSide: "reference",
    primary: primaryRoi,
    reference: referenceRoi,
  });
  assert.equal(
    manifestPayload["roiSummary"],
    "Primary ROI x=10%, y=20%, w=30%, h=40%; Reference ROI x=20%, y=10%, w=25%, h=35%; active=reference"
  );
  const manifestAsset = (activeProject["assets"] as Array<Record<string, unknown>>).find(
    function (asset) {
      return asset["type"] === "artifact";
    }
  );
  const manifestMetadata = (manifestAsset?.["metadata"] ?? {}) as Record<string, unknown>;
  assert.equal(manifestMetadata["roiSummary"], manifestPayload["roiSummary"]);
  assert.deepEqual(manifestMetadata["comparisonRois"], manifestPayload["comparisonRois"]);
});
