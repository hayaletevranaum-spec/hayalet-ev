import test from "node:test";
import assert from "node:assert/strict";
import { createLaboratoryProjectLifecycleRuntime } from "../../rooms/laboratory/shared/host/project-lifecycle.ts";
import { createMediaExportActionRuntime } from "../../rooms/laboratory/features/media-analysis/host/action-handlers-export.ts";
import { createMediaLocalSourceIntakeRuntime } from "../../rooms/laboratory/features/media-analysis/host/source-intake-local.ts";
import { createLaboratoryJobStateRuntime } from "../../rooms/laboratory/shared/host/job-state.ts";
import { syncSourceLabAssetForProject } from "../../rooms/laboratory/shared/host/lab-assets.ts";
import { createLaboratoryReportExportRuntime } from "../../rooms/laboratory/shared/host/reporting-export.ts";

void test("laboratory frame export settings drive burst and preview filter arguments", async () => {
  let activeProject: Record<string, unknown> = {
    id: "project-frame-settings",
    source: {
      kind: "video",
      storedPath: "/tmp/lab-demo.mp4",
      metadata: {
        durationSeconds: 4,
        height: 360,
        width: 640,
      },
    },
    process: {
      records: {
        "media-analysis": {
          runId: "run-frame-settings",
        },
      },
    },
    workbench: {},
    assets: [],
  };
  const cancelledJobIds: string[] = [];
  const toolRuns: Array<Record<string, unknown>> = [];
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

  await exportRuntime.exportFrameGrab(
    {},
    {
      jobs: {},
      roomId: "laboratory",
    },
    "req-frame-burst",
    {
      endMs: 2000,
      operationSettings: {
        burstCount: 3,
        frameMode: "burst",
        format: "jpg",
        timestampLabel: true,
      },
      seekMs: 1000,
      startMs: 1000,
    }
  );

  assert.equal(toolRuns.length, 3);
  assert.deepEqual(
    toolRuns.map(function (run) {
      const args = run["args"] as string[];
      return args[args.indexOf("-ss") + 1];
    }),
    ["1", "1.5", "2"]
  );
  assert.equal(
    toolRuns.every(function (run) {
      return (run["args"] as string[]).some(function (arg) {
        return arg.includes("drawtext=");
      });
    }),
    true
  );
  const burstAssets = (activeProject["assets"] as Array<Record<string, unknown>>).filter(
    function (asset) {
      return asset["type"] === "frame";
    }
  );
  assert.equal(burstAssets.length, 3);

  toolRuns.length = 0;
  await exportRuntime.exportEnhancedFrame(
    {},
    {
      jobs: {
        "old-enhanced-frame-job": {
          action: "export-enhanced-frame",
          featureStage: "edit",
          jobId: "old-enhanced-frame-job",
          projectId: "project-frame-settings",
          requestId: "req-old-enhanced-frame",
          stage: "queued",
          toolId: "ffmpeg",
        },
      },
      roomId: "laboratory",
    },
    "req-enhanced-preview",
    {
      allowParallelWorkspaceOperation: true,
      operationSettings: {
        applyPreviewSettings: true,
        preset: "clarity",
      },
      previewSettings: {
        brightness: 130,
        channelB: false,
        channelG: true,
        channelR: true,
        contrast: 120,
        edgeHighlight: true,
        gamma: 1.2,
        hueRotate: 15,
        invert: true,
        saturation: 90,
        sharpness: 130,
      },
      seekMs: 1200,
      workspaceOperationBatchId: "enhanced-frame-batch",
      workspaceOperationBatchSize: 2,
      workspaceResultMode: "replace-workspace-media",
      workspaceResultTargetSide: "reference",
    }
  );

  assert.deepEqual(cancelledJobIds, []);
  const enhancedArgs = toolRuns[0]?.["args"] as string[];
  const filterGraph = enhancedArgs[enhancedArgs.indexOf("-filter:v") + 1] ?? "";
  assert.match(filterGraph, /colorchannelmixer/);
  assert.match(filterGraph, /edgedetect/);
  assert.match(filterGraph, /negate/);
  const enhancedAsset = (activeProject["assets"] as Array<Record<string, unknown>>).find(
    function (asset) {
      return (
        asset["type"] === "frame" &&
        (typeof asset["name"] === "string" ? asset["name"] : "").includes("enhanced-frame-reference")
      );
    }
  );
  const enhancedMetadata = (enhancedAsset?.["metadata"] ?? {}) as Record<string, unknown>;
  assert.equal(
    (enhancedMetadata["settingsUsed"] as Record<string, unknown>)["applyPreviewSettings"],
    true
  );
  assert.equal(enhancedMetadata["workspaceResultMode"], "replace-workspace-media");
  assert.equal(enhancedMetadata["workspaceResultTargetSide"], "reference");
  assert.equal(enhancedMetadata["workspaceOperationBatchId"], "enhanced-frame-batch");
  assert.equal(enhancedMetadata["workspaceOperationBatchSize"], 2);
});

void test("laboratory source intake no longer exposes asset source promotion", () => {
  const sourceRuntime = createMediaLocalSourceIntakeRuntime({
    asNonEmptyString(value: unknown) {
      return typeof value === "string" && value.trim() !== "" ? value : null;
    },
    getActiveProject() {
      return {
        id: "project-asset-source",
        source: { kind: "video", status: "ready", storedPath: "/tmp/source.mp4" },
        assets: [],
      };
    },
    getElectronApi() {
      return null;
    },
    getProjectSourceDir() {
      return "/tmp/project/sources";
    },
    getSourceConfig() {
      return {};
    },
    normalizeMimeType(_fileName: unknown, kind: string) {
      return kind === "audio" ? "audio/wav" : kind === "image" ? "image/png" : "video/mp4";
    },
    async patchActiveProject() {},
    resetEditForCurrentSource() {},
    resetProfileForCurrentSource() {},
    resolvePreparedSource() {
      throw new Error("not used");
    },
  });

  assert.equal("handleAssetAsSource" in sourceRuntime, false);
});

void test("laboratory local source picker uses requested import kind filters", async () => {
  let activeProject = {
    id: "project-local-source",
    source: {
      kind: "video",
      status: "idle",
    },
  } as Record<string, unknown> & { source: Record<string, unknown> };
  const requestedKinds: unknown[] = [];
  const dialogFilters: unknown[] = [];
  const selectedPaths = ["/tmp/sound.wav", "/tmp/frame.png"];

  const sourceRuntime = createMediaLocalSourceIntakeRuntime({
    asNonEmptyString(value: unknown) {
      return typeof value === "string" && value.trim() !== "" ? value : null;
    },
    getActiveProject() {
      return activeProject;
    },
    getElectronApi(): any {
      return {
        copyFileTo(sourcePath: string, destinationDir: string) {
          const fileName = sourcePath.split(/[\\/]/).pop() ?? "source.bin";
          return {
            success: true,
            path: `${destinationDir}/${fileName}`,
            name: fileName,
          };
        },
        showOpenDialog(options: Record<string, unknown>) {
          dialogFilters.push(options["filters"]);
          return {
            canceled: false,
            filePaths: [selectedPaths[dialogFilters.length - 1]],
          };
        },
      };
    },
    getProjectSourceDir() {
      return "/tmp/project/sources";
    },
    getSourceConfig(_sourcePresets, sourceKind) {
      requestedKinds.push(sourceKind);
      if (sourceKind === "audio") {
        return { fileDialogFilters: [{ name: "Audio", extensions: ["wav"] }] };
      }
      if (sourceKind === "image") {
        return { fileDialogFilters: [{ name: "Images", extensions: ["png"] }] };
      }
      return { fileDialogFilters: [{ name: "Video", extensions: ["mp4"] }] };
    },
    normalizeMimeType(_fileName: unknown, kind: string) {
      return kind === "audio" ? "audio/wav" : kind === "image" ? "image/png" : "video/mp4";
    },
    async patchActiveProject(_runtime, updater) {
      activeProject = updater(activeProject);
    },
    resetEditForCurrentSource() {},
    resetProfileForCurrentSource() {},
    async resolvePreparedSource(_runtime, _project, options) {
      return {
        metadata: null,
        metadataError: null,
        mimeType: options["mimeType"] as string,
        storedFileName: options["storedFileName"] as string,
        storedPath: options["storedPath"] as string,
      };
    },
  });

  await sourceRuntime.handleLocalPick({}, {}, "req-audio", { kind: "audio" });
  await sourceRuntime.handleLocalPick({}, {}, "req-image", { kind: "image" });

  assert.deepEqual(requestedKinds, ["audio", "image"]);
  assert.deepEqual(dialogFilters, [
    [{ name: "Audio", extensions: ["wav"] }],
    [{ name: "Images", extensions: ["png"] }],
  ]);
  assert.equal(activeProject.source["kind"], "image");
  assert.equal(activeProject.source["storedFileName"], "frame.png");
  assert.equal(activeProject.source["mimeType"], "image/png");
});

void test("laboratory local source picker validates auto-detected image sources as images", async () => {
  let activeProject = {
    id: "project-auto-image-source",
    source: {
      kind: "video",
      status: "idle",
    },
  } as Record<string, unknown> & { source: Record<string, unknown> };
  const preparedKinds: unknown[] = [];

  const sourceRuntime = createMediaLocalSourceIntakeRuntime({
    asNonEmptyString(value: unknown) {
      return typeof value === "string" && value.trim() !== "" ? value : null;
    },
    getActiveProject() {
      return activeProject;
    },
    getElectronApi(): any {
      return {
        copyFileTo() {
          return {
            success: true,
            path: "/tmp/project/sources/frame.png",
            name: "frame.png",
          };
        },
        showOpenDialog() {
          return {
            canceled: false,
            filePaths: ["/tmp/frame.png"],
          };
        },
      };
    },
    getProjectSourceDir() {
      return "/tmp/project/sources";
    },
    getSourceConfig(_sourcePresets, sourceKind) {
      if (sourceKind === "image") {
        return { fileDialogFilters: [{ name: "Images", extensions: ["png"] }] };
      }
      if (sourceKind === "audio") {
        return { fileDialogFilters: [{ name: "Audio", extensions: ["wav"] }] };
      }
      return { fileDialogFilters: [{ name: "Video", extensions: ["mp4"] }] };
    },
    normalizeMimeType(_fileName: unknown, kind: string) {
      return kind === "image" ? "image/png" : "video/mp4";
    },
    async patchActiveProject(_runtime, updater) {
      activeProject = updater(activeProject);
    },
    resetEditForCurrentSource() {},
    resetProfileForCurrentSource() {},
    async resolvePreparedSource(_runtime, project, options) {
      preparedKinds.push(project.source["kind"]);
      return {
        metadata: null,
        metadataError: null,
        mimeType: options["mimeType"] as string,
        storedFileName: options["storedFileName"] as string,
        storedPath: options["storedPath"] as string,
      };
    },
  });

  await sourceRuntime.handleLocalPick({}, {}, "req-auto-image", { kind: "auto" });

  assert.deepEqual(preparedKinds, ["image"]);
  assert.equal(activeProject.source["kind"], "image");
  assert.equal(activeProject.source["mimeType"], "image/png");
});

void test("laboratory report export registers user and ai report assets", async () => {
  let activeProject = {
    id: "project-report-1",
    slug: "project-report",
    source: {
      kind: "video",
      storedPath: "/tmp/source.mp4",
    },
    report: {
      records: {
        "media-analysis": {
          status: "ready",
          sourceRunId: "run-report-1",
          exports: [],
          aiReport: {
            manifest: {},
          },
          userReport: {
            summary: "Ready",
          },
        },
      },
    },
    assets: [],
  } as Record<string, unknown>;
  const writtenPaths: string[] = [];
  const jobStages: string[] = [];
  const pushedJobStates: Array<Record<string, unknown>> = [];

  function getReportRecord(project: Record<string, unknown>, featureId: string) {
    return (((project["report"] as Record<string, unknown>)["records"] as Record<string, unknown>)[
      featureId
    ] ?? {}) as Record<string, unknown>;
  }

  const reportRuntime = createLaboratoryReportExportRuntime({
    buildReportMarkdown() {
      return "# Report";
    },
    clearJob() {},
    composeFeatureReport(_runtime, project, featureId) {
      return getReportRecord(project, featureId);
    },
    async ensureProjectDirectories() {},
    ensureReportJobSlotAvailable() {},
    getActiveProject() {
      return activeProject as Record<string, unknown> & { id: string; slug: string };
    },
    getFeatureReportDir() {
      return "/tmp/project/report";
    },
    getFeatureReportExportAction() {
      return "report-export";
    },
    getFeatureReportRecord: getReportRecord,
    normalizeReportExport(value) {
      return value !== null && typeof value === "object" && Array.isArray(value) === false
        ? (value as Record<string, unknown>)
        : {};
    },
    async patchActiveProject(_runtime, patcher) {
      activeProject = patcher(
        activeProject as Record<string, unknown> & { id: string; slug: string }
      );
    },
    pushJobState(_api, payload) {
      pushedJobStates.push({ ...payload });
      if (typeof payload["stage"] === "string") {
        jobStages.push(payload["stage"]);
      }
    },
    registerJob() {},
    sanitizeFileSegment(value, fallback) {
      return typeof value === "string" && value.trim() !== "" ? value : fallback;
    },
    setFeatureReportRecord(project, featureId, record) {
      const report = project["report"] as Record<string, unknown>;
      const records = report["records"] as Record<string, unknown>;
      records[featureId] = record;
    },
    async writeTextFile(filePath, _value) {
      writtenPaths.push(filePath);
    },
  });

  await reportRuntime.exportFeatureReport({}, {}, "req-report", "media-analysis");

  assert.deepEqual(jobStages, ["queued", "completed"]);
  assert.equal(writtenPaths.length, 2);
  const assets = activeProject["assets"] as Array<Record<string, unknown>>;
  assert.equal(assets.length, 2);
  assert.deepEqual(
    assets.map((asset) => asset["type"]),
    ["report", "report"]
  );
  assert.deepEqual(
    assets.map((asset) => asset["runId"]),
    ["run-report-1", "run-report-1"]
  );
  assert.deepEqual(
    assets.map((asset) => (asset["metadata"] as Record<string, unknown>)["format"]).sort(),
    ["json", "md"]
  );
  const completedPayload =
    pushedJobStates.find(function (payload) {
      return payload["stage"] === "completed";
    }) ?? null;
  assert.deepEqual(
    completedPayload?.["resultAssetIds"],
    assets.map(function (asset) {
      return asset["id"];
    })
  );
});

void test("laboratory project lifecycle serializes concurrent active project asset patches", async () => {
  function asNonEmptyString(value: unknown) {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  }

  function toRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && Array.isArray(value) === false
      ? (value as Record<string, unknown>)
      : {};
  }

  const lifecycle = createLaboratoryProjectLifecycleRuntime({
    asNonEmptyString,
    buildEditManifest() {
      return {};
    },
    buildProcessManifest() {
      return {};
    },
    buildProfileManifest() {
      return {};
    },
    buildReportManifest() {
      return {};
    },
    callRoomTools() {
      return {};
    },
    async cancelJobsForProject() {},
    clone<T>(value: T): T {
      return JSON.parse(JSON.stringify(value)) as T;
    },
    createDefaultProfileModelEntry(modelId: string) {
      return { modelId };
    },
    createDefaultToolEntry(toolId: string) {
      return { toolId };
    },
    createDefaultToolState() {
      return { schemaVersion: 1, tools: {}, updatedAt: null };
    },
    createProjectRecord() {
      return {};
    },
    defaultFeatureId: "media-analysis",
    async ensureProjectDirectories() {},
    findProject(runtime: Record<string, unknown>, projectId: unknown) {
      const projects = runtime["projects"] as Array<Record<string, unknown>>;
      return projects.find(function (project) {
        return (typeof project["id"] === "string" ? project["id"] : "") === (typeof projectId === "string" ? projectId : "");
      }) ?? null;
    },
    getActiveProject(runtime: Record<string, unknown>) {
      const projects = runtime["projects"] as Array<Record<string, unknown>>;
      return projects.find(function (project) {
        return (typeof project["id"] === "string" ? project["id"] : "") === (typeof runtime["activeProjectId"] === "string" ? runtime["activeProjectId"] : "");
      }) ?? null;
    },
    getFeatureIdFromContext() {
      return "media-analysis";
    },
    getProjectDir() {
      return "/tmp/laboratory/project-parallel";
    },
    getProjectEditManifestPath() {
      return "/tmp/laboratory/edit-manifest.json";
    },
    getProjectMetaPath() {
      return "/tmp/laboratory/project.json";
    },
    getProjectProcessManifestPath() {
      return "/tmp/laboratory/process-manifest.json";
    },
    getProjectProfileManifestPath() {
      return "/tmp/laboratory/profile-manifest.json";
    },
    getProjectReportManifestPath() {
      return "/tmp/laboratory/report-manifest.json";
    },
    getRuntimeToolIds() {
      return [];
    },
    listDirectory() {
      return [];
    },
    loadContext() {
      return {};
    },
    normalizeProject(rawValue: unknown) {
      return toRecord(rawValue);
    },
    pushBootstrapState() {},
    readJsonFile() {
      return {};
    },
    async refreshProfileModelState() {},
    roomId: "laboratory",
    syncProjectFeatureProjections() {},
    toRecord,
    updateProjectTimestamps(project: Record<string, unknown>) {
      project["updatedAt"] = "2026-05-17T02:30:00.000Z";
    },
    async writeJsonFile() {
      await Promise.resolve();
    },
  } as unknown as Parameters<typeof createLaboratoryProjectLifecycleRuntime>[0]);

  type LifecycleRuntime = Parameters<typeof lifecycle.patchActiveProject>[0];
  const runtime = {
    activeProjectId: "project-parallel",
    bootstrap: {
      active: false,
      currentStep: 0,
      currentStepId: null,
      error: null,
      message: null,
      status: "ready",
      steps: [],
      totalSteps: 0,
    },
    editPresets: {},
    hydrated: true,
    hydrating: null,
    paths: {
      projectsDir: "/tmp/laboratory/projects",
      toolStatePath: "/tmp/laboratory/tool-state.json",
    },
    profileCapabilities: {},
    profileModelState: {
      activeLanguage: null,
      activeModelId: null,
      activeVariant: null,
      models: {},
      schemaVersion: 1,
      updatedAt: null,
    },
    profileModels: {},
    profilePresets: {},
    projects: [
      {
        assets: [],
        id: "project-parallel",
        source: {
          status: "ready",
          storedPath: "/tmp/laboratory/source.png",
        },
      },
    ],
    sourcePresets: {},
    toolState: {
      schemaVersion: 1,
      tools: {},
      updatedAt: null,
    },
  } as unknown as LifecycleRuntime;

  await Promise.all([
    lifecycle.patchActiveProject(runtime, function (project) {
      return {
        ...project,
        assets: [
          ...((project.assets as Array<Record<string, unknown>> | undefined) ?? []),
          { id: "asset-primary-crop", type: "image" },
        ],
      };
    }),
    lifecycle.patchActiveProject(runtime, function (project) {
      return {
        ...project,
        assets: [
          ...((project.assets as Array<Record<string, unknown>> | undefined) ?? []),
          { id: "asset-reference-crop", type: "image" },
        ],
      };
    }),
  ]);

  const activeProject = runtime.projects[0] as Record<string, unknown>;
  const assetIds = (activeProject["assets"] as Array<Record<string, unknown>>)
    .map(function (asset) {
      return asset["id"];
    })
    .sort();
  assert.deepEqual(assetIds, ["asset-primary-crop", "asset-reference-crop"]);
});
