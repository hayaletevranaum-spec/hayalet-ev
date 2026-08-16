import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createLabStore } from "../../rooms/laboratory/runtime/lab-store.ts";
import {
  getToolLifecycleStage,
  getActiveModule,
  getSourceActionBlockReason,
  getEditActionBlockReason,
  getAnalysisActionBlockReason,
  getAvailableCapabilities,
  getCurrentPreflight,
  getReportActionBlockReason,
  hasReportPayload,
  isRunActive,
  isRunComplete,
  getToolRelevanceFilter,
} from "../../rooms/laboratory/runtime/lab-selectors.ts";
import type { LabEventFeedItem } from "../../rooms/laboratory/domain/lab-types.ts";

function createProcessRunEvent(overrides: Partial<LabEventFeedItem> = {}): LabEventFeedItem {
  return {
    id: "evt-process-run",
    kind: "activity",
    severity: "info",
    message: "Process event",
    detail: null,
    timestamp: Date.now(),
    source: "host",
    action: "process-run",
    stage: "running",
    scope: "run",
    moduleId: null,
    rawLine: null,
    ...overrides,
  };
}

void test("getToolLifecycleStage returns 'source' when no source is loaded", () => {
  const store = createLabStore();
  const state = store.getState();
  assert.equal(getToolLifecycleStage(state), "source");
});

void test("getToolLifecycleStage returns 'edit' when source probe is completed", () => {
  const store = createLabStore();
  store.dispatch({
    type: "source-config-patched",
    patch: { kind: "video", mode: "local", storedPath: "/tmp/test.mp4" },
  });
  store.dispatch({ type: "source-probe-completed", action: "source-pick-local" });
  const state = store.getState();
  assert.equal(getToolLifecycleStage(state), "edit");
});

void test("getToolLifecycleStage returns 'process' when a run is active", () => {
  const store = createLabStore();
  store.dispatch({
    type: "source-config-patched",
    patch: { kind: "video", mode: "local", storedPath: "/tmp/test.mp4" },
  });
  store.dispatch({ type: "source-probe-completed", action: "source-pick-local" });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-run",
      kind: "activity",
      severity: "info",
      message: "Analiz basladi",
      detail: null,
      timestamp: Date.now(),
      source: "host",
      action: "process-run",
      stage: "running",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  });
  const state = store.getState();
  assert.equal(getToolLifecycleStage(state), "process");
  assert.equal(isRunActive(state), true);
});

void test("laboratory store keeps process runs active while individual modules finish", () => {
  const store = createLabStore();
  const timestamp = Date.now();

  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-audio-run",
      kind: "activity",
      severity: "info",
      message: "Audio analysis started",
      detail: null,
      timestamp,
      source: "host",
      action: "audio-process-run",
      stage: "running",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-audio-module-complete",
      kind: "module-progress",
      severity: "info",
      message: "signal-health completed",
      detail: null,
      timestamp: timestamp + 1,
      source: "host",
      action: "audio-process-run",
      stage: "completed",
      scope: "run",
      moduleId: "signal-health",
      rawLine: null,
    },
  });

  assert.equal(store.getState().run?.state, "running");
  assert.equal(store.getState().run?.modules["signal-health"]?.status, "completed");
  assert.equal(isRunActive(store.getState()), true);
  assert.equal(isRunComplete(store.getState()), false);

  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-audio-run-complete",
      kind: "activity",
      severity: "success",
      message: "Audio analysis completed",
      detail: null,
      timestamp: timestamp + 2,
      source: "host",
      action: "audio-process-run",
      stage: "completed",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  });

  assert.equal(isRunActive(store.getState()), false);
  assert.equal(isRunComplete(store.getState()), true);
});

void test("laboratory store keeps host-context adjustments out of pending runs", () => {
  const store = createLabStore();
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-host-context-adjustment",
      kind: "interactive-adjustment-applied",
      severity: "info",
      message: "Analysis controls updated",
      detail: "Module controls changed",
      timestamp: Date.now(),
      source: "host",
      action: "host-context",
      stage: "updated",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  });

  const state = store.getState();
  assert.equal(state.run, null);
  assert.equal(isRunActive(state), false);
  assert.equal(state.activityFeed[0]?.scope, "global");
});

void test("laboratory store keeps cancel pending until the process run reaches a terminal state", () => {
  const store = createLabStore();
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-run",
      kind: "activity",
      severity: "info",
      message: "Analiz basladi",
      detail: null,
      timestamp: Date.now(),
      source: "host",
      action: "process-run",
      stage: "running",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  });
  store.dispatch({ type: "analysis-cancel-requested" });
  assert.equal(store.getState().ui.analysisCancelPending, true);

  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-cancel-accepted",
      kind: "request-result",
      severity: "success",
      message: "Analiz iptal istegi kabul edildi",
      detail: null,
      timestamp: Date.now() + 1,
      source: "host",
      action: "process-cancel",
      stage: "completed",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  });

  assert.equal(store.getState().ui.analysisCancelPending, true);

  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-run-cancelled",
      kind: "activity",
      severity: "warning",
      message: "Analiz iptal edildi",
      detail: null,
      timestamp: Date.now() + 2,
      source: "host",
      action: "process-run",
      stage: "cancelled",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  });

  assert.equal(store.getState().ui.analysisCancelPending, false);
});

void test("laboratory store ignores stale correlated run events from an older process", () => {
  const store = createLabStore();
  store.dispatch({
    type: "run-started",
    action: "process-run",
    jobId: "job-new",
    projectId: "project-1",
    requestId: "req-new",
  });

  store.dispatch({
    type: "host-event-received",
    event: createProcessRunEvent({
      id: "evt-old-terminal",
      jobId: "job-old",
      projectId: "project-1",
      requestId: "req-old",
      severity: "success",
      stage: "completed",
    }),
  });
  store.dispatch({
    type: "host-event-received",
    event: createProcessRunEvent({
      id: "evt-old-module",
      jobId: "job-old",
      kind: "module-progress",
      moduleId: "stale-module",
      projectId: "project-1",
      requestId: "req-old",
    }),
  });
  store.dispatch({
    type: "host-event-received",
    event: createProcessRunEvent({
      id: "evt-old-finding",
      finding: {
        id: "finding-old",
        title: "Old finding",
      },
      jobId: "job-old",
      kind: "live-finding",
      moduleId: "stale-module",
      projectId: "project-1",
      requestId: "req-old",
    }),
  });
  store.dispatch({
    type: "host-event-received",
    event: createProcessRunEvent({
      id: "evt-old-custom-warning",
      action: "module-custom",
      detail: "stale warning",
      jobId: "job-old",
      kind: "module-warning",
      moduleId: "stale-module",
      projectId: "project-1",
      requestId: "req-old",
    }),
  });

  const state = store.getState();
  assert.equal(state.run?.state, "running");
  assert.equal(state.run.requestId, "req-new");
  assert.equal(state.run.jobId, "job-new");
  assert.equal(state.run.modules["stale-module"], undefined);
  assert.equal(state.run.liveFindings.length, 0);
  assert.deepEqual(state.run.warnings, []);
  assert.equal(
    state.run.events.some(function (entry) {
      return (
        entry.id === "evt-old-terminal" ||
        entry.id === "evt-old-module" ||
        entry.id === "evt-old-custom-warning"
      );
    }),
    false
  );
});

void test("laboratory store clears cancel pending only for matching correlated run terminal events", () => {
  const store = createLabStore();
  store.dispatch({
    type: "run-started",
    action: "process-run",
    projectId: "project-1",
    requestId: "req-new",
  });
  store.dispatch({ type: "analysis-cancel-requested" });

  store.dispatch({
    type: "host-event-received",
    event: createProcessRunEvent({
      id: "evt-old-run-cancelled",
      projectId: "project-1",
      requestId: "req-old",
      severity: "warning",
      stage: "cancelled",
    }),
  });

  assert.equal(store.getState().run?.state, "running");
  assert.equal(store.getState().ui.analysisCancelPending, true);

  store.dispatch({
    type: "host-event-received",
    event: createProcessRunEvent({
      id: "evt-new-run-cancelled",
      projectId: "project-1",
      requestId: "req-new",
      severity: "warning",
      stage: "cancelled",
    }),
  });

  assert.equal(store.getState().run?.state, "cancelled");
  assert.equal(store.getState().ui.analysisCancelPending, false);
});

void test("laboratory store clears cancel pending when the cancel request fails", () => {
  const store = createLabStore();
  store.dispatch({ type: "run-started", action: "process-run" });
  store.dispatch({ type: "analysis-cancel-requested", requestId: "cancel-new" });
  assert.equal(store.getState().ui.analysisCancelPending, true);
  assert.equal(store.getState().ui.analysisCancelRequestId, "cancel-new");

  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-stale-cancel-failed",
      kind: "request-result",
      severity: "error",
      message: "Analiz iptal edilemedi",
      detail: "cancel failed",
      timestamp: Date.now(),
      source: "host",
      action: "process-cancel",
      requestId: "cancel-old",
      stage: "failed",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  });

  assert.equal(store.getState().ui.analysisCancelPending, true);
  assert.equal(store.getState().ui.analysisCancelRequestId, "cancel-new");

  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-cancel-failed",
      kind: "request-result",
      severity: "error",
      message: "Analiz iptal edilemedi",
      detail: "cancel failed",
      timestamp: Date.now() + 1,
      source: "host",
      action: "process-cancel",
      requestId: "cancel-new",
      stage: "failed",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  });

  assert.equal(store.getState().ui.analysisCancelPending, false);
  assert.equal(store.getState().ui.analysisCancelRequestId, null);
});

void test("laboratory store keeps optimistic running state through stale terminal snapshots", () => {
  const store = createLabStore();
  store.dispatch({ type: "run-started", action: "process-run" });
  const pendingRunId = store.getState().run?.id;

  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      featureId: "media-analysis",
      activeProjectId: "project-stale-run",
      projects: [],
      workbench: {},
      activeProject: {
        id: "project-stale-run",
        source: { kind: "video", status: "ready", storedPath: "/tmp/test.mp4" },
        edit: {},
        profile: {},
        process: {
          records: {
            "media-analysis": {
              runId: "previous-run",
              status: "cancelled",
              startedAt: "2026-04-30T23:00:00.000Z",
              completedAt: "2026-04-30T23:00:01.000Z",
            },
          },
        },
        report: { records: {} },
        assets: [],
      },
    },
  });

  assert.equal(store.getState().run?.id, pendingRunId);
  assert.equal(isRunActive(store.getState()), true);
});

void test("laboratory store accepts cancelled snapshots after a cancel request", () => {
  const store = createLabStore();
  store.dispatch({ type: "run-started", action: "process-run" });
  store.dispatch({ type: "analysis-cancel-requested" });

  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      featureId: "media-analysis",
      activeProjectId: "project-cancelled-run",
      projects: [],
      workbench: {},
      activeProject: {
        id: "project-cancelled-run",
        source: { kind: "video", status: "ready", storedPath: "/tmp/test.mp4" },
        edit: {},
        profile: {},
        process: {
          records: {
            "media-analysis": {
              runId: "cancelled-run",
              status: "cancelled",
              startedAt: "2026-04-30T23:00:00.000Z",
              completedAt: "2026-04-30T23:00:01.000Z",
            },
          },
        },
        report: { records: {} },
        assets: [],
      },
    },
  });

  assert.equal(store.getState().run?.id, "cancelled-run");
  assert.equal(store.getState().run?.state, "cancelled");
  assert.equal(store.getState().ui.analysisCancelPending, false);
});

void test("laboratory store keeps cancel-pending runs through stale correlated snapshots", () => {
  const store = createLabStore();
  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      featureId: "media-analysis",
      activeProjectId: "project-snapshot-cancel",
      projects: [],
      workbench: {},
      activeProject: {
        id: "project-snapshot-cancel",
        source: { kind: "video", status: "ready", storedPath: "/tmp/test.mp4" },
        edit: {},
        profile: {},
        process: { records: {} },
        report: { records: {} },
        assets: [],
      },
    },
  });
  store.dispatch({
    type: "run-started",
    action: "process-run",
    projectId: "project-snapshot-cancel",
    requestId: "req-new",
  });
  const pendingRunId = store.getState().run?.id;
  store.dispatch({ type: "analysis-cancel-requested" });

  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      featureId: "media-analysis",
      activeProjectId: "project-snapshot-cancel",
      projects: [],
      workbench: {},
      activeProject: {
        id: "project-snapshot-cancel",
        source: { kind: "video", status: "ready", storedPath: "/tmp/test.mp4" },
        edit: {},
        profile: {},
        process: {
          records: {
            "media-analysis": {
              runId: "old-cancelled-run",
              status: "cancelled",
              requestId: "req-old",
              projectId: "project-snapshot-cancel",
              startedAt: "2026-04-30T23:00:00.000Z",
              completedAt: "2026-04-30T23:00:01.000Z",
            },
          },
        },
        report: { records: {} },
        assets: [],
      },
    },
  });

  assert.equal(store.getState().run?.id, pendingRunId);
  assert.equal(store.getState().run?.state, "running");
  assert.equal(store.getState().ui.analysisCancelPending, true);

  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      featureId: "media-analysis",
      activeProjectId: "project-snapshot-cancel",
      projects: [],
      workbench: {},
      activeProject: {
        id: "project-snapshot-cancel",
        source: { kind: "video", status: "ready", storedPath: "/tmp/test.mp4" },
        edit: {},
        profile: {},
        process: {
          records: {
            "media-analysis": {
              runId: "new-cancelled-run",
              status: "cancelled",
              requestId: "req-new",
              projectId: "project-snapshot-cancel",
              startedAt: "2026-04-30T23:00:00.000Z",
              completedAt: "2026-04-30T23:00:01.000Z",
            },
          },
        },
        report: { records: {} },
        assets: [],
      },
    },
  });

  assert.equal(store.getState().run?.id, "new-cancelled-run");
  assert.equal(store.getState().run?.state, "cancelled");
  assert.equal(store.getState().ui.analysisCancelPending, false);
});

void test("getActiveModule returns the first running module and clears when none are running", () => {
  const store = createLabStore();
  store.dispatch({
    type: "source-config-patched",
    patch: { kind: "video", mode: "local", storedPath: "/tmp/test.mp4" },
  });
  store.dispatch({ type: "source-probe-completed", action: "source-pick-local" });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-run",
      kind: "activity",
      severity: "info",
      message: "Analiz basladi",
      detail: null,
      timestamp: Date.now(),
      source: "host",
      action: "process-run",
      stage: "running",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-motion",
      kind: "activity",
      severity: "info",
      message: "motion running",
      detail: "motion running",
      timestamp: Date.now() + 1,
      source: "host",
      action: "process-run",
      stage: "running",
      scope: "run",
      moduleId: "motion",
      rawLine: null,
    },
  });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-audio",
      kind: "activity",
      severity: "info",
      message: "audio queued",
      detail: "audio queued",
      timestamp: Date.now() + 2,
      source: "host",
      action: "process-run",
      stage: "queued",
      scope: "run",
      moduleId: "audio",
      rawLine: null,
    },
  });

  let state = store.getState();
  assert.equal(getActiveModule(state)?.id, "motion");

  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-motion-done",
      kind: "activity",
      severity: "success",
      message: "motion done",
      detail: "motion done",
      timestamp: Date.now() + 3,
      source: "host",
      action: "process-run",
      stage: "completed",
      scope: "run",
      moduleId: "motion",
      rawLine: null,
    },
  });

  state = store.getState();
  assert.equal(getActiveModule(state), null);
});

void test("getToolLifecycleStage returns 'report' when run is complete and reports exist", () => {
  const store = createLabStore();
  store.dispatch({
    type: "source-config-patched",
    patch: { kind: "video", mode: "local", storedPath: "/tmp/test.mp4" },
  });
  store.dispatch({ type: "source-probe-completed", action: "source-pick-local" });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-run",
      kind: "activity",
      severity: "info",
      message: "Analiz tamamlandi",
      detail: null,
      timestamp: Date.now(),
      source: "host",
      action: "process-run",
      stage: "completed",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  });
  // Inject a user report into the store via snapshot
  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      featureId: "media-analysis",
      activeProjectId: "project-1",
      projects: [],
      workbench: {},
      toolState: {},
      activeProject: {
        id: "project-1",
        source: { kind: "video", mode: "local", storedPath: "/tmp/test.mp4", status: "ready" },
        edit: {},
        profile: {},
        process: {
          records: {
            "media-analysis": {
              runId: "run-1",
              status: "ready",
              startedAt: Date.now() - 1000,
            },
          },
        },
        report: {
          records: {
            "media-analysis": {
              status: "ready",
              userReport: { summary: "Test raporu" },
            },
          },
        },
      },
    },
  });
  const state = store.getState();
  assert.equal(hasReportPayload(state), true);
  assert.equal(isRunComplete(state), true);
  assert.equal(getToolLifecycleStage(state), "report");
});

void test("source action block reason checks draft fields", () => {
  const store = createLabStore();
  store.dispatch({
    type: "source-config-patched",
    patch: { kind: "video", mode: "url" },
  });
  const state = store.getState();
  assert.equal(getSourceActionBlockReason(state), "Kaynak URL gerekli");

  store.dispatch({
    type: "source-drafts-updated",
    patch: { urlInput: "https://example.com/video.mp4" },
  });
  const state2 = store.getState();
  assert.equal(getSourceActionBlockReason(state2), null);
});

void test("edit action block reason checks probe status", () => {
  const store = createLabStore();
  const state = store.getState();
  assert.equal(getEditActionBlockReason(state), "Önce kaynak seçilmelidir.");

  store.dispatch({
    type: "source-config-patched",
    patch: { kind: "video", mode: "local", storedPath: "/tmp/test.mp4" },
  });
  store.dispatch({ type: "source-probe-completed", action: "source-pick-local" });
  const state2 = store.getState();
  assert.equal(getEditActionBlockReason(state2), null);
});

void test("tool relevance filter includes tools from selected analysis capabilities", () => {
  const store = createLabStore();
  store.dispatch({
    type: "source-config-patched",
    patch: { kind: "video", mode: "local", storedPath: "/tmp/test.mp4" },
  });
  store.dispatch({ type: "source-probe-completed", action: "source-pick-local" });
  store.dispatch({ type: "capability-set", capabilities: ["visual-structure", "visual-forensics"] });
  const state = store.getState();
  const relevance = getToolRelevanceFilter(state);
  assert.equal(relevance.selectedCapabilities.includes("visual-structure"), true);
  assert.equal(relevance.selectedCapabilities.includes("visual-forensics"), true);
  assert.equal(relevance.requiredToolIds.includes("ffmpeg"), true);
  assert.equal(relevance.optionalToolIds.includes("visual-forensics-py"), true);
  assert.equal(relevance.optionalToolIds.includes("exiftool"), true);
  assert.equal(relevance.optionalToolIds.includes("mediainfo"), true);
  assert.equal(relevance.optionalToolIds.includes("ffmpeg-libvmaf"), true);
  assert.equal(relevance.optionalToolIds.includes("raft-optical-flow"), true);
});

void test("report action block reason checks report availability", () => {
  const store = createLabStore();
  const state = store.getState();
  assert.equal(getReportActionBlockReason(state), "Rapor henüz üretilmedi.");
});

void test("featureStage in tool payloads uses projected lifecycle stage", () => {
  const store = createLabStore();
  store.dispatch({
    type: "source-config-patched",
    patch: { kind: "video", mode: "local", storedPath: "/tmp/test.mp4" },
  });
  store.dispatch({ type: "source-probe-completed", action: "source-pick-local" });
  const state = store.getState();
  assert.equal(getToolLifecycleStage(state), "edit");
});

// ---------------------------------------------------------------------------
// Overlay grouping: pure relevance, no stageSupport fallback
// ---------------------------------------------------------------------------

void test("tool relevance filter with no selected capabilities produces empty requiredToolIds", () => {
  const store = createLabStore();
  const state = store.getState();
  const relevance = getToolRelevanceFilter(state);
  assert.deepEqual(relevance.requiredToolIds, []);
  assert.deepEqual(relevance.optionalToolIds, []);
  assert.deepEqual(relevance.selectedCapabilities, []);
});

void test("tool relevance filter groups by selected capabilities, not by lifecycle stage", () => {
  const store = createLabStore();
  store.dispatch({
    type: "source-config-patched",
    patch: { kind: "video", mode: "local", storedPath: "/tmp/test.mp4" },
  });
  store.dispatch({ type: "source-probe-completed", action: "source-pick-local" });
  store.dispatch({
    type: "capability-set",
    capabilities: ["audio-signal", "audio-recovery", "speaker-analysis"],
  });
  const state = store.getState();
  const relevance = getToolRelevanceFilter(state);
  assert.equal(relevance.requiredToolIds.includes("ffmpeg"), true);
  assert.equal(relevance.requiredToolIds.includes("pyaudioanalysis"), true);
  assert.equal(getToolLifecycleStage(state), "edit");
});

void test("switching selected capabilities changes tool relevance without stage change", () => {
  const store = createLabStore();
  store.dispatch({
    type: "source-config-patched",
    patch: { kind: "video", mode: "local", storedPath: "/tmp/test.mp4" },
  });
  store.dispatch({ type: "source-probe-completed", action: "source-pick-local" });
  store.dispatch({
    type: "capability-set",
    capabilities: ["transcription", "source-separation"],
  });
  const state = store.getState();
  const relevance = getToolRelevanceFilter(state);
  assert.equal(relevance.requiredToolIds.includes("transcript-runtime"), true);
  assert.equal(relevance.requiredToolIds.includes("demucs"), true);
  assert.equal(relevance.requiredToolIds.includes("ffmpeg"), true);
  assert.equal(getToolLifecycleStage(state), "edit");
});

void test("workspace hydration keeps selected capability state authoritative", () => {
  const store = createLabStore();
  const baseWorkspace = store.getState().ui.workspace;

  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      source: { kind: "video", mode: "local", storedPath: "/tmp/test.mp4" },
      sourceProbeStatus: "completed",
      toolState: { tools: { ffmpeg: { installed: true } } },
      selectedCapabilities: ["audio-signal"],
      workspace: baseWorkspace,
    },
  });

  const state = store.getState();
  const selectedCapabilityIds = getAvailableCapabilities(state)
    .filter(function (entry) {
      return entry.selected;
    })
    .map(function (entry) {
      return entry.id;
    });

  assert.deepEqual(state.selectedCapabilities, ["audio-signal"]);
  assert.deepEqual(getCurrentPreflight(state).enabledModules, ["audio-signal"]);
  assert.deepEqual(selectedCapabilityIds, ["audio-signal"]);
});

void test("workspace hydration clears selected capabilities when none remain", () => {
  const store = createLabStore();
  const baseWorkspace = store.getState().ui.workspace;

  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      source: { kind: "video", mode: "local", storedPath: "/tmp/test.mp4" },
      sourceProbeStatus: "completed",
      selectedCapabilities: [],
      workspace: baseWorkspace,
    },
  });

  const state = store.getState();

  assert.deepEqual(state.selectedCapabilities, []);
  assert.equal(getAnalysisActionBlockReason(state), "En az bir analiz modülü seçilmelidir.");
});

void test("live capability selection stays authoritative after manual capability updates", () => {
  const store = createLabStore();
  store.dispatch({
    type: "source-config-patched",
    patch: { kind: "video", mode: "local", storedPath: "/tmp/test.mp4" },
  });
  store.getState().toolState = { tools: { ffmpeg: { installed: true } } };
  store.dispatch({ type: "source-probe-completed", action: "source-pick-local" });
  store.dispatch({ type: "capability-set", capabilities: ["visual-structure", "visual-forensics"] });

  const state = store.getState();
  const selectedCapabilityIds = getAvailableCapabilities(state)
    .filter(function (entry) {
      return entry.selected;
    })
    .map(function (entry) {
      return entry.id;
    });

  assert.deepEqual(getCurrentPreflight(state).enabledModules, [
    "visual-structure",
    "visual-forensics",
  ]);
  assert.deepEqual(selectedCapabilityIds, ["visual-structure", "visual-forensics"]);
});

void test("controller startDeepAnalysis uses ready workspace analysis selection before stale capability state", () => {
  const source = readFileSync("rooms/laboratory/runtime/lab-run-controller.ts", "utf8");

  assert.match(source, /const selectedCapabilities = getReadySelectedAnalysisCapabilityIds\(state\);/);
  assert.match(
    source,
    /updateAnalysisScopeFromWorkspace\(state, scopeChoice\);/
  );
  assert.match(
    source,
    /const \{ activeFeatureId \} = deriveFeatureSelectionFromCapabilities\(selectedCapabilities\);/
  );
  assert.match(
    source,
    /const runAction = activeFeatureId === "audio-analysis" \? "audio-process-run" : "process-run";/
  );
  assert.match(source, /const runRequestId = createActionRequestId\(runAction\);/);
  assert.match(source, /type: "run-started",\s*action: runAction,/);
  assert.match(source, /requestId: runRequestId,/);
  assert.match(
    source,
    /const sentRunRequestId = sendMediaAction\(runAction, runPayload, \{ requestId: runRequestId \}\);/
  );
  assert.match(source, /const runPayload = getProcessRunWorkspacePayload/);
  assert.match(source, /preflightAutoRunEnabled !== false/);
});

// ---------------------------------------------------------------------------
// Host: job-runtime action-based filtering
// ---------------------------------------------------------------------------

void test("job-runtime getActiveProcessJobs uses action prefix not featureStage", async () => {
  const jobs: Record<string, unknown> = {};
  const collected: string[] = [];
  const jobRuntime = (
    await import("../../rooms/laboratory/shared/host/job-runtime.ts")
  ).createLaboratoryJobRuntime({
    roomId: "laboratory",
    toRecord(value: unknown) {
      return value != null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    },
    cancelRoomTool: async () => {},
    clearJob(_runtime, jobId) {
      delete jobs[jobId];
    },
    pushJobState(_api, payload) {
      collected.push(String(payload["action"]));
    },
  });

  // Simulate a job with action "process-run" but featureStage "edit" (wrong stage)
  jobs["job-1"] = {
    jobId: "job-1",
    action: "process-run",
    projectId: "project-1",
    toolId: "ffmpeg",
    featureStage: "edit", // intentionally wrong stage
  };

  // The runtime should still find this job by action prefix, not featureStage
  const runtime = { jobs };
  // We can't directly call getActiveProcessJobs (it's internal), but we verify
  // the behavioral proof: ensureProcessJobSlotAvailable should throw for active process jobs
  let threw = false;
  try {
    jobRuntime.ensureProcessJobSlotAvailable(runtime, "project-1", undefined);
  } catch {
    threw = true;
  }
  assert.equal(threw, true, "Process job should be found by action prefix, not featureStage");
});

// ---------------------------------------------------------------------------
// Host: runtime-events action-based scope derivation
// ---------------------------------------------------------------------------

void test("runtime-events derives scope from action name, not featureStage", async () => {
  const emitted: Array<Record<string, unknown>> = [];
  const runtimeEvents = (
    await import("../../rooms/laboratory/shared/host/runtime-events.ts")
  ).createLaboratoryRuntimeEvents({
    asNonEmptyString(value: unknown) {
      return typeof value === "string" && value.trim() !== "" ? value : null;
    },
    defaultFeatureId: "media-analysis",
    getFeatureIdFromContext() {
      return "media-analysis";
    },
    loadContext() {
      return { featureId: "media-analysis" };
    },
    roomSnapshotRuntime: {
      buildMediaSnapshot() {
        return {};
      },
    },
  });

  const fakeApi = {
    notifyRoom(_type: string, payload: Record<string, unknown>) {
      emitted.push(payload);
    },
  };

  // Emit event with process action — should get scope "run" regardless of featureStage
  runtimeEvents.emitEvent(fakeApi, {
    action: "process-run",
    stage: "running",
    featureStage: "source", // intentionally wrong
    message: "Test",
  });

  assert.equal(emitted.length, 1);
  assert.equal(
    emitted[0]?.["scope"],
    "run",
    "scope should be 'run' based on action name containing 'process'"
  );

  // Emit event with tool action — should get scope "global"
  runtimeEvents.emitEvent(fakeApi, {
    action: "tool-install",
    stage: "running",
    featureStage: "process", // intentionally set to process
    message: "Tool install",
  });

  assert.equal(emitted.length, 2);
  assert.equal(
    emitted[1]?.["scope"],
    "global",
    "scope should be 'global' for non-process actions even if featureStage says process"
  );
});
