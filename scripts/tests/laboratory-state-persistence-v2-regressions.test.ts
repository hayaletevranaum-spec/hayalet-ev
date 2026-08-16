import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createLaboratoryHostActivation } from "../../rooms/laboratory/shared/host/activation.ts";
import { createLaboratoryProcessReportStateRuntime } from "../../rooms/laboratory/shared/host/process-report-state.ts";
import {
  createLaboratoryWorkbenchState,
} from "../../rooms/laboratory/shared/host/runtime-primitives.ts";
import { asNonEmptyString, asNumber } from "../../rooms/laboratory/domain/lab-types.ts";

function toRecord(value: unknown) {
  return value !== null && typeof value === "object" && Array.isArray(value) === false
    ? (value as Record<string, unknown>)
    : {};
}

const featureIds = ["media-analysis", "audio-analysis"];

void test("laboratory workbench collapses analysis controls by default", () => {
  const workbench = createLaboratoryWorkbenchState({});
  assert.equal(workbench.controlsCollapsed, true);
});

void test("laboratory activation queues a follow-up process instance when scope changes mid-run", async () => {
  let context: Record<string, unknown> = {};
  const queuedContexts: Record<string, unknown>[] = [];
  const activation = createLaboratoryHostActivation({
    createRuntimeState() {
      return {};
    },
    emitEvent() {},
    async ensureHydrated() {
      await Promise.resolve();
    },
    ensureRoomToolsSubscription() {},
    async handleMediaAction() {
      await Promise.resolve();
    },
    loadContext() {
      return context;
    },
    pushMediaState() {},
    async queueInteractiveReprocess(_api, _runtime, nextContext) {
      queuedContexts.push(nextContext);
      await Promise.resolve();
    },
    saveContext(_api, payload) {
      context = payload;
      return context;
    },
    tearDownRoomToolsSubscription() {},
    toRecord,
  });

  const runtime = activation.activate({
    log() {},
  });

  runtime.onRoomEvent({
    type: "host-context",
    payload: {
      featureId: "media-analysis",
      workbench: {
        activeModuleId: "media-analysis",
        analysisScope: {
          focus: "visual",
          timeRange: {
            startMs: 1000,
            endMs: 2400,
          },
        },
      },
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(queuedContexts.length, 1);
  assert.equal(toRecord(toRecord(queuedContexts[0])["workbench"])["activeModuleId"], "media-analysis");
});

void test("queued process instance metadata survives normalized process state", () => {
  const runtime = createLaboratoryProcessReportStateRuntime({
    asNonEmptyString,
    asNumber,
    featureIds,
    normalizeProfileArtifact(rawValue: unknown) {
      const source = toRecord(rawValue);
      return {
        id: asNonEmptyString(source["id"]) ?? "artifact-1",
        kind: asNonEmptyString(source["kind"]) ?? "artifact",
        path: asNonEmptyString(source["path"]),
        fileName: asNonEmptyString(source["fileName"]),
        label: asNonEmptyString(source["label"]),
        createdAt: asNonEmptyString(source["createdAt"]) ?? "2026-04-20T10:00:00.000Z",
        metadata: toRecord(source["metadata"]),
      };
    },
    normalizeProfileSignal(rawValue: unknown) {
      const source = toRecord(rawValue);
      return {
        id: asNonEmptyString(source["id"]) ?? "signal-1",
        laneId: asNonEmptyString(source["laneId"]) ?? "metadata-lineage",
        kind: asNonEmptyString(source["kind"]) ?? "derived",
        level: asNonEmptyString(source["level"]) ?? "low",
        confidence: asNonEmptyString(source["confidence"]) ?? "low",
        title: asNonEmptyString(source["title"]) ?? "Signal",
        detail: asNonEmptyString(source["detail"]) ?? "",
        evidenceCount: Math.max(0, Math.round(asNumber(source["evidenceCount"]) ?? 0)),
        artifactIds: [],
      };
    },
    toRecord,
  });

  const processState = runtime.normalizeProcessState({
    records: {
      "media-analysis": {
        status: "running",
        runId: "media-analysis-run-7",
        startedAt: "2026-04-20T10:00:00.000Z",
        queuedProcessInstance: {
          runId: "media-analysis-queued-8",
          requestedAt: "2026-04-20T10:01:00.000Z",
          analysisScope: {
            focus: "visual",
            frameRange: {
              startFrame: 12,
              endFrame: 48,
            },
          },
        },
      },
      "audio-analysis": {},
    },
  }) as {
    records: Record<string, Record<string, unknown>>;
  };

  const mediaRecord = processState.records["media-analysis"] ?? {};
  assert.equal(
    toRecord(toRecord(mediaRecord["queuedProcessInstance"])["analysisScope"])["focus"],
    "visual"
  );
  assert.equal(toRecord(mediaRecord["queuedProcessInstance"])["runId"], "media-analysis-queued-8");
});

void test("process runtime consumes queued process instances after the active run completes", () => {
  const source = readFileSync("rooms/laboratory/shared/host/process-runtime.ts", "utf8");

  assert.match(source, /queuedProcessInstance/);
  assert.match(source, /pendingFollowUp/);
  assert.match(source, /pendingFollowUp\.workbench = \{/);
  assert.match(source, /await runSingleFeatureProcess\([\s\S]*pendingFollowUp\.workbench/);
  assert.match(source, /await runSingleFeatureProcess\(/);
});

void test("process actions merge live project context with process payload targets", () => {
  const actionRouterSource = readFileSync("rooms/laboratory/shared/host/action-router.ts", "utf8");
  const processRuntimeSource = readFileSync("rooms/laboratory/shared/host/process-runtime.ts", "utf8");

  assert.match(actionRouterSource, /function getProcessWorkbenchSource/);
  assert.match(actionRouterSource, /loadContext\(api\)\)\["workbench"\]/);
  assert.match(actionRouterSource, /actionPayload\["workbench"\]/);
  assert.match(actionRouterSource, /actionPayload\["analysisScope"\]/);
  assert.match(actionRouterSource, /workspaceTargetAssetId/);
  assert.match(actionRouterSource, /comparisonReferenceAssetId/);
  assert.match(actionRouterSource, /getProcessWorkbenchSource\(api, actionPayload\)/);
  assert.match(processRuntimeSource, /shouldPersistProcessWorkbench/);
  assert.match(processRuntimeSource, /return true;/);
});
