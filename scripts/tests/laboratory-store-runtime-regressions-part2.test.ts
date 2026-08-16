import {
  assert,
  createLabStore,
  getActionOutputs,
  getAssetById,
  getAssets,
  getAssetsByRun,
  getAssetsBySource,
  getAssetsByType,
  getCurrentSourceAsset,
  getDualPreviewVolume,
  getLinkedAudioAssets,
  getParentSourceForAsset,
  getSelectedDualPreviewAudioAsset,
  isDualPreviewActive,
  isDualPreviewAvailable,
  test,
} from "./laboratory-runtime-truth.helpers.ts";

void test("laboratory store derives run state from canonical events without inventing modules", () => {
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

  const state = store.getState();
  assert.equal(state.run?.state, "running");
  assert.deepEqual(state.run.moduleOrder, []);
});

void test("laboratory store keeps export user actions separate from analysis run state", () => {
  const store = createLabStore();

  store.dispatch({
    type: "user-action-added",
    actionEvent: {
      id: "user-action-1",
      type: "export-clip",
      label: "Klip çıkarılıyor",
      status: "running",
      startedAt: Date.now() - 1000,
      projectId: "project-1",
      requestId: "req-export-1",
      sourceAction: "export-timeline-clip",
    },
  });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-export",
      kind: "activity",
      severity: "success",
      message: "Klip çıkarılıyor tamamlandı",
      detail: null,
      timestamp: Date.now(),
      source: "host",
      action: "export-timeline-clip",
      stage: "completed",
      scope: "global",
      moduleId: null,
      rawLine: null,
      requestId: "req-export-1",
      jobId: "job-export-1",
      projectId: "project-1",
      resultAssetIds: ["asset-clip-export-1"],
    },
  });
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
  assert.equal(state.userActions[0]?.status, "success");
  assert.equal(state.userActions[0].message, "Klip hazır");
  assert.deepEqual(state.userActions[0].resultAssetIds, ["asset-clip-export-1"]);
  assert.equal(state.run?.state, "running");
  assert.equal(state.run.events.length, 1);
  assert.equal(state.run.events[0]?.action, "process-run");
});

void test("laboratory store keeps tracked export failures and cancellations UI-safe", () => {
  const store = createLabStore();

  store.dispatch({
    type: "user-action-added",
    actionEvent: {
      id: "user-action-failed",
      type: "export-clip",
      label: "Klip çıkarılıyor",
      status: "running",
      startedAt: Date.now() - 1000,
      requestId: "req-export-failed",
      sourceAction: "export-timeline-clip",
    },
  });
  store.dispatch({
    type: "user-action-added",
    actionEvent: {
      id: "user-action-cancelled",
      type: "export-clip",
      label: "Klip çıkarılıyor",
      status: "running",
      startedAt: Date.now() - 1000,
      requestId: "req-export-cancelled",
      sourceAction: "export-timeline-clip",
    },
  });

  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-export-failed",
      kind: "activity",
      severity: "error",
      message: "Klip çıkarılıyor hata verdi",
      detail: "ffmpeg version n6.1 -i /tmp/source.mp4 leaked command output",
      timestamp: Date.now(),
      source: "host",
      action: "export-timeline-clip",
      stage: "failed",
      scope: "global",
      moduleId: null,
      rawLine: null,
      requestId: "req-export-failed",
      jobId: "job-export-failed",
    },
  });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-export-cancelled",
      kind: "activity",
      severity: "warning",
      message: "Klip çıkarılıyor iptal edildi",
      detail: "ffmpeg version n6.1 -i /tmp/source.mp4 leaked command output",
      timestamp: Date.now(),
      source: "host",
      action: "export-timeline-clip",
      stage: "cancelled",
      scope: "global",
      moduleId: null,
      rawLine: null,
      requestId: "req-export-cancelled",
      jobId: "job-export-cancelled",
    },
  });

  const failedAction = store.getState().userActions.find(function (entry) {
    return entry.id === "user-action-failed";
  });
  const cancelledAction = store.getState().userActions.find(function (entry) {
    return entry.id === "user-action-cancelled";
  });
  assert.equal(failedAction?.status, "error");
  assert.equal(failedAction.message, "Klip çıkarılamadı");
  assert.equal(cancelledAction?.status, "idle");
  assert.equal(cancelledAction.message, "İşlem iptal edildi.");
});

void test("laboratory store hydrates project assets and selectors keep registry lookups scoped", () => {
  const store = createLabStore();

  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      featureId: "media-analysis",
      activeProjectId: "project-asset-1",
      projects: [],
      activeProject: {
        id: "project-asset-1",
        source: {
          status: "ready",
          kind: "video",
          mode: "local",
          storedPath: "/tmp/source.mp4",
          drafts: {},
        },
        edit: {},
        profile: {},
        process: {
          records: {},
        },
        report: {
          records: {},
        },
        assets: [
          {
            id: "asset-source-1",
            type: "source",
            name: "source.mp4",
            localPath: "/tmp/source.mp4",
            createdAt: 100,
            sourceId: "source-1",
          },
          {
            id: "asset-clip-1",
            type: "clip",
            name: "clip_01.mp4",
            localPath: "/tmp/clip_01.mp4",
            createdAt: 200,
            sourceId: "source-1",
            runId: "run-1",
          },
          {
            id: "asset-frame-1",
            type: "frame",
            name: "frame_001.png",
            localPath: "/tmp/frame_001.png",
            createdAt: 300,
            sourceId: "source-1",
            runId: "run-2",
          },
        ],
      },
    },
  });

  const state = store.getState();
  const assets = getAssets(state);
  assert.equal(assets.length, 3);
  assets.pop();
  assert.equal(getAssets(store.getState()).length, 3);
  assert.deepEqual(
    getAssetsByType(state, "clip").map((asset) => asset.id),
    ["asset-clip-1"]
  );
  assert.deepEqual(
    getAssetsBySource(state, "source-1").map((asset) => asset.id),
    ["asset-source-1", "asset-clip-1", "asset-frame-1"]
  );
  assert.deepEqual(
    getAssetsByRun(state, "run-1").map((asset) => asset.id),
    ["asset-clip-1"]
  );

  store.dispatch({
    type: "asset-updated",
    id: "asset-clip-1",
    patch: {
      name: "clip_renamed.mp4",
    },
  });
  assert.equal(getAssetsByType(store.getState(), "clip")[0]?.name, "clip_renamed.mp4");

  store.dispatch({ type: "asset-removed", id: "asset-frame-1" });
  assert.deepEqual(
    getAssets(store.getState()).map((asset) => asset.id),
    ["asset-source-1", "asset-clip-1"]
  );
  assert.equal(getAssetById(store.getState(), "asset-clip-1")?.name, "clip_renamed.mp4");
  assert.equal(getAssetById(store.getState(), "asset-missing"), null);
});

void test("laboratory action output selector resolves linked assets and ignores stale ids", () => {
  const store = createLabStore();

  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-frame-result",
      type: "frame",
      name: "frame_01.png",
      localPath: "/tmp/frame_01.png",
      createdAt: 200,
    },
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-report-result",
      type: "report",
      name: "report.md",
      localPath: "/tmp/report.md",
      createdAt: 300,
    },
  });
  store.dispatch({
    type: "user-action-added",
    actionEvent: {
      id: "user-action-result",
      type: "grab-frame",
      label: "Frame alınıyor",
      status: "success",
      startedAt: Date.now() - 1000,
      finishedAt: Date.now(),
      message: "Frame alındı",
      requestId: "req-frame-result",
      projectId: null,
      resultAssetIds: ["asset-frame-result", "asset-missing", "asset-report-result"],
      sourceAction: "export-frame-grab",
    },
  });

  assert.deepEqual(
    getActionOutputs(store.getState(), "user-action-result").map((asset) => asset.id),
    ["asset-frame-result", "asset-report-result"]
  );
  assert.deepEqual(getActionOutputs(store.getState(), "user-action-missing"), []);
});

void test("laboratory operation outputs replace the targeted workspace media", () => {
  const store = createLabStore();

  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-primary",
      type: "image",
      name: "primary.png",
      localPath: "/tmp/primary.png",
      createdAt: 100,
    },
  });
  store.dispatch({
    type: "asset-added",
    asset: {
      id: "asset-reference",
      type: "image",
      name: "reference.png",
      localPath: "/tmp/reference.png",
      createdAt: 101,
    },
  });
  store.dispatch({ type: "workspace-asset-selected", assetId: "asset-primary" });
  store.dispatch({ type: "workspace-comparison-reference-set", assetId: "asset-reference" });
  store.dispatch({
    type: "selection-roi-updated",
    comparisonSide: "primary",
    roi: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
  });
  store.dispatch({
    type: "selection-roi-updated",
    comparisonSide: "reference",
    roi: { x: 0.2, y: 0.2, width: 0.4, height: 0.4 },
  });
  store.dispatch({
    type: "workspace-operation-output-applied",
    assetId: "asset-primary-crop",
    comparisonSide: "primary",
  });
  store.dispatch({
    type: "workspace-operation-output-applied",
    assetId: "asset-reference-crop",
    comparisonSide: "reference",
  });

  assert.equal(store.getState().ui.activeWorkspaceAssetId, "asset-primary-crop");
  assert.equal(
    store.getState().ui.workspace.comparisonReferenceAssetId,
    "asset-reference-crop"
  );
  assert.equal(store.getState().ui.workspace.comparisonRois.primary, null);
  assert.equal(store.getState().ui.workspace.comparisonRois.reference, null);

  store.dispatch({
    type: "workspace-operation-output-applied",
    assetId: "asset-single-crop",
    comparisonSide: "single",
  });

  assert.equal(store.getState().ui.activeWorkspaceAssetId, "asset-single-crop");
  assert.equal(store.getState().ui.workspace.comparisonReferenceAssetId, null);
});

void test("laboratory store no longer carries retired source project ui state", () => {
  const store = createLabStore();
  const uiState = store.getState().ui as unknown as Record<string, unknown>;

  assert.equal("projectWorkspaceOpen" in uiState, false);
  assert.equal("projectWorkspaceSelectedEntityIds" in uiState, false);
  assert.equal("projectWorkspaceSort" in uiState, false);
  assert.equal("projectWorkspaceFilter" in uiState, false);
  assert.equal("projectWorkspaceGroup" in uiState, false);
  assert.equal("projectWorkspaceSearch" in uiState, false);
  assert.equal("projectWorkspaceConfirmReplace" in uiState, false);
  assert.equal("projectWorkspaceTimelineHighlight" in uiState, false);
});

void test("laboratory lineage selectors resolve current source, linked audio, and parent assets", () => {
  const store = createLabStore();

  store.dispatch({
    type: "snapshot-received",
    payload: {
      ready: true,
      featureId: "media-analysis",
      activeProjectId: "project-lineage",
      projects: [],
      activeProject: {
        id: "project-lineage",
        source: {
          status: "ready",
          kind: "video",
          mode: "local",
          storedPath: "/tmp/source-active.mp4",
          storedFileName: "source-active.mp4",
          drafts: {},
        },
        edit: {},
        profile: {},
        process: {
          records: {},
        },
        report: {
          records: {},
        },
        assets: [
          {
            id: "source-old",
            type: "source",
            name: "source-old.mp4",
            localPath: "/tmp/source-old.mp4",
            createdAt: 100,
            sourceId: "source-old",
          },
          {
            id: "source-active",
            type: "source",
            name: "source-active.mp4",
            localPath: "/tmp/source-active.mp4",
            createdAt: 200,
            sourceId: "source-active",
            metadata: {
              storedFileName: "source-active.mp4",
            },
          },
          {
            id: "asset-audio-linked",
            type: "audio",
            name: "audio.wav",
            localPath: "/tmp/audio.wav",
            createdAt: 300,
            sourceId: "source-active",
            derivedFromAssetId: "source-active",
            derivedFromSourceId: "source-active",
            metadata: {
              durationMs: 1400,
              startOffsetMs: 0,
            },
          },
          {
            id: "asset-audio-stale",
            type: "audio",
            name: "stale.wav",
            localPath: "/tmp/stale.wav",
            createdAt: 400,
            sourceId: "source-active",
            derivedFromAssetId: "asset-missing",
            derivedFromSourceId: "source-missing",
          },
        ],
      },
    },
  });

  const state = store.getState();
  assert.equal(getCurrentSourceAsset(state)?.id, "source-active");
  assert.deepEqual(
    getLinkedAudioAssets(state, "source-active").map((asset) => asset.id),
    ["asset-audio-linked"]
  );
  assert.equal(getParentSourceForAsset(state, "asset-audio-linked")?.id, "source-active");
  assert.equal(getParentSourceForAsset(state, "asset-audio-stale"), null);
  assert.equal(isDualPreviewAvailable(state), true);
  assert.equal(isDualPreviewActive(state), false);
  assert.equal(getSelectedDualPreviewAudioAsset(state)?.id, "asset-audio-linked");
  assert.equal(getDualPreviewVolume(state), 1);

  store.dispatch({
    type: "asset-updated",
    id: "asset-audio-linked",
    patch: {
      name: "audio-linked.wav",
    },
  });
  assert.equal(
    getAssetById(store.getState(), "asset-audio-linked")?.derivedFromAssetId,
    "source-active"
  );
  assert.equal(
    getAssetById(store.getState(), "asset-audio-linked")?.derivedFromSourceId,
    "source-active"
  );
});

void test("laboratory hydrate ignores retired module manager persisted ui flags", () => {
  const store = createLabStore();
  const legacyPersistedPayload = {
    featureId: "media-analysis",
    projectIndex: {
      activeProjectId: null,
      projects: [],
    },
    workbench: {},
    sourceProbeStatus: "idle",
    reports: {
      user: null,
      ai: null,
      emptyReason: "Rapor henüz üretilmedi.",
    },
    activityFeed: [],
    moduleManagerOpen: true,
    workspace: {},
  } as unknown as NonNullable<ReturnType<typeof store.getState>["persisted"]>;

  store.dispatch({
    type: "hydrate",
    payload: legacyPersistedPayload,
  });

  assert.equal(store.getState().ui.toolManagerOpen, false);
});

void test("laboratory hydrate reconstructs an active selection from a valid persisted primitive range", () => {
  const store = createLabStore();

  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      projectIndex: {
        activeProjectId: null,
        projects: [],
      },
      workbench: {},
      sourceProbeStatus: "idle",
      reports: {
        user: null,
        ai: null,
        emptyReason: "Rapor henüz üretilmedi.",
      },
      activityFeed: [],
      workspace: {
        timelineStartMs: 2400,
        timelineEndMs: 5600,
        activeSelection: {
          id: "selection-persisted",
          startMs: 2400,
          endMs: 5600,
          type: "focus",
          label: "Door latch",
          roi: {
            x: 0.1,
            y: 0.2,
            width: 0.35,
            height: 0.4,
          },
          createdAt: 1700000000000,
        },
      },
    },
  });

  assert.deepEqual(store.getState().ui.workspace.activeSelection, {
    id: "selection-persisted",
    startMs: 2400,
    endMs: 5600,
    type: "focus",
    label: "Door latch",
    roi: {
      x: 0.1,
      y: 0.2,
      width: 0.35,
      height: 0.4,
    },
    createdAt: 1700000000000,
  });
});

void test("laboratory hydrate drops legacy pixel-like persisted selection roi values", () => {
  const store = createLabStore();

  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      projectIndex: {
        activeProjectId: null,
        projects: [],
      },
      workbench: {},
      sourceProbeStatus: "idle",
      reports: {
        user: null,
        ai: null,
        emptyReason: "Rapor henüz üretilmedi.",
      },
      activityFeed: [],
      workspace: {
        timelineStartMs: 2400,
        timelineEndMs: 5600,
        activeSelection: {
          id: "selection-persisted",
          startMs: 2400,
          endMs: 5600,
          type: "focus",
          roi: {
            x: 10,
            y: 20,
            width: 80,
            height: 60,
          },
          createdAt: 1700000000000,
        },
      },
    },
  });

  assert.equal(store.getState().ui.workspace.activeSelection?.roi, undefined);
});

void test("laboratory hydrate rebuilds selection identity from the primitive bridge on rehydrate", () => {
  const store = createLabStore();
  const originalDateNow = Date.now;

  try {
    Date.now = () => 1700000000000;
    store.dispatch({
      type: "workspace-timeline-updated",
      startMs: 1000,
      endMs: 3000,
    });

    const initialSelection = store.getState().ui.workspace.activeSelection;
    assert.ok(initialSelection);

    Date.now = () => 1700000005000;
    store.dispatch({
      type: "hydrate",
      payload: {
        featureId: "media-analysis",
        projectIndex: {
          activeProjectId: null,
          projects: [],
        },
        workbench: {},
        sourceProbeStatus: "idle",
        reports: {
          user: null,
          ai: null,
          emptyReason: "Rapor henüz üretilmedi.",
        },
        activityFeed: [],
        workspace: {
          timelineStartMs: 2400,
          timelineEndMs: 5600,
        },
      },
    });

    const rehydratedSelection = store.getState().ui.workspace.activeSelection;
    assert.ok(rehydratedSelection);
    assert.equal(rehydratedSelection.startMs, 2400);
    assert.equal(rehydratedSelection.endMs, 5600);
    assert.equal(rehydratedSelection.type, "clip");
    assert.equal("intent" in rehydratedSelection, false);
    assert.notEqual(rehydratedSelection.id, initialSelection.id);
    assert.equal(rehydratedSelection.createdAt, 1700000005000);
  } finally {
    Date.now = originalDateNow;
  }
});

void test("laboratory hydrate drops malformed persisted selection metadata fields", () => {
  const store = createLabStore();

  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      projectIndex: {
        activeProjectId: null,
        projects: [],
      },
      workbench: {},
      sourceProbeStatus: "idle",
      reports: {
        user: null,
        ai: null,
        emptyReason: "Rapor henüz üretilmedi.",
      },
      activityFeed: [],
      workspace: {
        timelineStartMs: 1500,
        timelineEndMs: 3600,
        activeSelection: {
          id: "selection-persisted-invalid-intent",
          startMs: 1500,
          endMs: 3600,
          type: "inspect",
          createdAt: 1700000000042,
        },
      },
    },
  });

  const selection = store.getState().ui.workspace.activeSelection;
  assert.ok(selection);
  assert.equal("intent" in selection, false);
});

void test("laboratory hydrate suppresses persisted selection entities when the primitive range is invalid", () => {
  const store = createLabStore();

  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      projectIndex: {
        activeProjectId: null,
        projects: [],
      },
      workbench: {},
      sourceProbeStatus: "idle",
      reports: {
        user: null,
        ai: null,
        emptyReason: "Rapor henüz üretilmedi.",
      },
      activityFeed: [],
      workspace: {
        timelineStartMs: 5600,
        timelineEndMs: 2400,
        activeSelection: {
          id: "selection-invalid",
          startMs: 5600,
          endMs: 2400,
          type: "inspect",
          createdAt: 1700000000001,
        },
      },
    },
  });

  assert.equal(store.getState().ui.workspace.timelineStartMs, 5600);
  assert.equal(store.getState().ui.workspace.timelineEndMs, null);
  assert.equal(store.getState().ui.workspace.activeSelection, null);
});
