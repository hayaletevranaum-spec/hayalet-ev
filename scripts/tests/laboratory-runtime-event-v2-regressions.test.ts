import test from "node:test";
import assert from "node:assert/strict";

import { createLaboratoryRuntimeEvents } from "../../rooms/laboratory/shared/host/runtime-events.ts";
import { createLaboratoryRoomSnapshotRuntime } from "../../rooms/laboratory/shared/host/room-snapshot.ts";

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && Array.isArray(value) === false
    ? (value as Record<string, unknown>)
    : {};
}

void test("laboratory runtime events throttle high-frequency custom module updates", () => {
  const notifications: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const runtimeEvents = createLaboratoryRuntimeEvents({
    asNonEmptyString,
    defaultFeatureId: "media-analysis",
    getFeatureIdFromContext() {
      return "media-analysis";
    },
    loadContext() {
      return {
        featureId: "media-analysis",
      };
    },
    roomSnapshotRuntime: {
      buildMediaSnapshot() {
        return {};
      },
    },
  });

  const api = {
    notifyRoom(type: string, payload: Record<string, unknown>) {
      notifications.push({ type, payload });
    },
  };

  runtimeEvents.pushJobState(api, {
    kind: "module-progress",
    moduleId: "visual-signal",
    message: "visual-signal module started",
    stage: "running",
    featureStage: "process",
    throttleWindow: "visual-signal-module-batch",
    timestamp: 1000,
  });
  runtimeEvents.pushJobState(api, {
    kind: "module-progress",
    moduleId: "visual-signal",
    message: "visual-signal module update",
    stage: "running",
    featureStage: "process",
    throttleWindow: "visual-signal-module-batch",
    timestamp: 1200,
  });
  runtimeEvents.pushJobState(api, {
    kind: "module-progress",
    moduleId: "visual-signal",
    message: "visual-signal module completed",
    stage: "completed",
    featureStage: "process",
    throttleWindow: "visual-signal-module-batch",
    timestamp: 1700,
  });

  assert.equal(notifications.length, 2);
  assert.equal(notifications[0]?.type, "lab-event");
  assert.equal(notifications[1]?.type, "lab-event");
  assert.equal(notifications[1].payload["batchedCount"], 2);
  assert.match((notifications[1].payload["detail"] as string | undefined) ?? "", /updates batched/);
});

void test("laboratory runtime events emit terminal custom module updates inside throttle windows", () => {
  const notifications: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const runtimeEvents = createLaboratoryRuntimeEvents({
    asNonEmptyString,
    defaultFeatureId: "media-analysis",
    getFeatureIdFromContext() {
      return "media-analysis";
    },
    loadContext() {
      return {
        featureId: "media-analysis",
      };
    },
    roomSnapshotRuntime: {
      buildMediaSnapshot() {
        return {};
      },
    },
  });

  const api = {
    notifyRoom(type: string, payload: Record<string, unknown>) {
      notifications.push({ type, payload });
    },
  };

  runtimeEvents.pushJobState(api, {
    kind: "module-progress",
    moduleId: "visual-signal",
    message: "visual-signal module started",
    stage: "running",
    throttleWindow: "visual-signal-module-batch",
    timestamp: 1000,
  });
  runtimeEvents.pushJobState(api, {
    kind: "module-progress",
    moduleId: "visual-signal",
    message: "visual-signal module update",
    stage: "running",
    throttleWindow: "visual-signal-module-batch",
    timestamp: 1100,
  });
  runtimeEvents.pushJobState(api, {
    kind: "module-progress",
    moduleId: "visual-signal",
    message: "visual-signal module completed",
    stage: "completed",
    throttleWindow: "visual-signal-module-batch",
    timestamp: 1200,
  });

  assert.equal(notifications.length, 2);
  assert.equal(notifications[1]?.payload["stage"], "completed");
  assert.equal(notifications[1].payload["batchedCount"], 2);
  assert.match((notifications[1].payload["detail"] as string | undefined) ?? "", /updates batched/);
});

void test("laboratory runtime events preserve correlation metadata for export jobs and request results", () => {
  const notifications: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const runtimeEvents = createLaboratoryRuntimeEvents({
    asNonEmptyString,
    defaultFeatureId: "media-analysis",
    getFeatureIdFromContext() {
      return "media-analysis";
    },
    loadContext() {
      return {
        featureId: "media-analysis",
      };
    },
    roomSnapshotRuntime: {
      buildMediaSnapshot() {
        return {};
      },
    },
  });

  const api = {
    notifyRoom(type: string, payload: Record<string, unknown>) {
      notifications.push({ type, payload });
    },
  };

  runtimeEvents.pushJobState(api, {
    action: "export-frame-grab",
    jobId: "job-export-1",
    projectId: "project-1",
    requestId: "req-export-1",
    resultAssetIds: ["asset-frame-result-1"],
    stage: "completed",
  });
  runtimeEvents.pushActionResult(api, {
    action: "export-frame-grab",
    jobId: "job-export-1",
    projectId: "project-1",
    requestId: "req-export-1",
    success: false,
    error: "frame export failed",
  });

  assert.equal(notifications.length, 2);
  assert.equal(notifications[0]?.payload["requestId"], "req-export-1");
  assert.equal(notifications[0].payload["jobId"], "job-export-1");
  assert.equal(notifications[0].payload["projectId"], "project-1");
  assert.deepEqual(notifications[0].payload["resultAssetIds"], ["asset-frame-result-1"]);
  assert.equal(notifications[1]?.payload["requestId"], "req-export-1");
  assert.equal(notifications[1].payload["jobId"], "job-export-1");
  assert.equal(notifications[1].payload["projectId"], "project-1");
});

void test("laboratory runtime events can publish cancelled process action results", () => {
  const notifications: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const runtimeEvents = createLaboratoryRuntimeEvents({
    asNonEmptyString,
    defaultFeatureId: "media-analysis",
    getFeatureIdFromContext() {
      return "media-analysis";
    },
    loadContext() {
      return {
        featureId: "media-analysis",
      };
    },
    roomSnapshotRuntime: {
      buildMediaSnapshot() {
        return {};
      },
    },
  });

  const api = {
    notifyRoom(type: string, payload: Record<string, unknown>) {
      notifications.push({ type, payload });
    },
  };

  runtimeEvents.pushActionResult(api, {
    action: "process-run",
    requestId: "req-process-run",
    success: false,
    cancelled: true,
  });

  assert.equal(notifications[0]?.payload["stage"], "cancelled");
  assert.equal(notifications[0].payload["severity"], "warning");
  assert.equal(notifications[0].payload["scope"], "run");
});

void test("laboratory runtime events clear stale workbench context for source activation snapshots", () => {
  const notifications: Array<{ type: string; payload: Record<string, unknown> }> = [];
  const workbenchSources: unknown[] = [];
  const runtimeEvents = createLaboratoryRuntimeEvents({
    asNonEmptyString,
    defaultFeatureId: "media-analysis",
    getFeatureIdFromContext() {
      return "media-analysis";
    },
    loadContext() {
      return {
        featureId: "media-analysis",
        workbench: {
          activeModuleId: "media-analysis",
          selectedModuleIds: ["media-analysis"],
          activeLiveFindingsStreamId: "media-analysis",
          activePreviewArtifactId: "preview-1",
          analysisScope: {},
          analysisSettings: {
            modules: {
              "sound-events": {
                threshold: 0.7,
              },
            },
          },
          controlsCollapsed: false,
          moduleToggles: {
            "sound-events": true,
          },
          operationSettings: {
            "clip-export": {
              format: "webm",
            },
          },
        },
      };
    },
    roomSnapshotRuntime: {
      buildMediaSnapshot(_runtime, _featureId, workbenchSource) {
        workbenchSources.push(workbenchSource);
        return {
          workbench: workbenchSource,
        };
      },
    },
  });

  const api = {
    notifyRoom(type: string, payload: Record<string, unknown>) {
      notifications.push({ type, payload });
    },
  };

  runtimeEvents.pushMediaState(api, {}, "req-source-pick", "source-pick-local");

  const workbench = toRecord(workbenchSources[0]);
  assert.equal(workbench["activeModuleId"], "media-analysis");
  assert.equal(workbench["activeLiveFindingsStreamId"], null);
  assert.equal(workbench["activePreviewArtifactId"], null);
  assert.equal(workbench["analysisScope"], null);
  assert.equal(
    toRecord(toRecord(toRecord(workbench["analysisSettings"])["modules"])["sound-events"])[
      "threshold"
    ],
    0.15
  );
  assert.equal(workbench["controlsCollapsed"], true);
  assert.deepEqual(workbench["moduleToggles"], {});
  assert.equal(toRecord(toRecord(workbench["operationSettings"])["clip-export"])["format"], "mp4");
  assert.equal(notifications[0]?.type, "media-state");
  assert.equal(notifications[1]?.type, "source-state");
});

void test("laboratory room snapshots keep stale context workbench from overriding source reset", () => {
  const snapshotRuntime = createLaboratoryRoomSnapshotRuntime({
    asNonEmptyString,
    clone<T>(value: T): T {
      return JSON.parse(JSON.stringify(value)) as T;
    },
    defaultFeatureId: "media-analysis",
    featureIds: ["media-analysis", "audio-analysis"],
    mediaStages: ["source", "edit", "profile", "process", "report"],
    audioFeatureId: "audio-analysis",
    getFeatureProcessRecord(project: Record<string, unknown>, featureId: string) {
      return toRecord(toRecord(toRecord(project["process"])["records"])[featureId]);
    },
    getFeatureReportRecord(project: Record<string, unknown>, featureId: string) {
      return toRecord(toRecord(toRecord(project["report"])["records"])[featureId]);
    },
    getRuntimeToolIds() {
      return [];
    },
    getStageSupport() {
      return "supported";
    },
    getToolManifest() {
      return {};
    },
    mediaFeatureId: "media-analysis",
    normalizeAudioAnalysisModuleResult(rawValue: unknown) {
      return toRecord(rawValue);
    },
    normalizeAudioAnalysisState(rawValue: unknown) {
      return toRecord(rawValue);
    },
    roomId: "laboratory",
    syncProjectFeatureProjections() {},
    toFileUrl(path: unknown) {
      return typeof path === "string" ? path : "";
    },
    toRecord,
  });

  const snapshot = toRecord(
    snapshotRuntime.buildMediaSnapshot(
      {
        activeProjectId: "project-1",
        projects: [
          {
            id: "project-1",
            name: "Project",
            source: {},
            edit: {},
            profile: {},
            process: { records: {} },
            report: { records: {} },
            audioAnalysis: {},
            assets: [],
            workbench: {
              activeModuleId: "media-analysis",
              selectedModuleIds: ["media-analysis"],
              sourceActivationResetAt: "reset-1",
              analysisScope: null,
              moduleToggles: {},
              operationSettings: {},
            },
          },
        ],
      },
      "media-analysis",
      {
        activeModuleId: "media-analysis",
        selectedModuleIds: ["media-analysis"],
        analysisScope: {},
        moduleToggles: {
          "sound-events": true,
        },
        operationSettings: {
          "clip-export": {
            format: "webm",
          },
        },
      }
    )
  );

  const workbench = toRecord(snapshot["workbench"]);
  assert.equal(workbench["sourceActivationResetAt"], "reset-1");
  assert.equal(workbench["analysisScope"], null);
  assert.deepEqual(workbench["moduleToggles"], {});
  assert.equal(toRecord(toRecord(workbench["operationSettings"])["clip-export"])["format"], "mp4");
});
