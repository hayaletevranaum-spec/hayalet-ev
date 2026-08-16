import {
  __testOnlyResetExecutionPatternRegistry,
  assert,
  buildSuggestionPreview,
  createMockExecutionResult,
  createLabStore,
  getActiveExecutionAlternatives,
  getActiveExecutionCandidate,
  getActiveExecutionCommitment,
  getActiveExecutionGoalEvaluation,
  getActiveExecutionIntent,
  getActiveExecutionResult,
  getActiveExecutionPayloadPreview,
  getActiveExecutionPlan,
  getActiveExecutionReadiness,
  getActiveExecutionReflection,
  getActiveExecutionResultInterpretation,
  getActiveExecutionStaging,
  getActiveSuggestionPreview,
  getExecutionDispatchCandidate,
  getEffectiveActiveSelection,
  getSelectionSuggestions,
  getWaveformTimelineModel,
  renderWorkspaceSurface,
  importLabRootModuleWithDomStub,
  test,
} from "./laboratory-runtime-truth.helpers.ts";

import type { LabActionSuggestion, LabSelection } from "./laboratory-runtime-truth.helpers.ts";

function collectPersistedKeys(value: unknown, keys: string[] = []) {
  if (value === null || typeof value !== "object") {
    return keys;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectPersistedKeys(item, keys);
    }
    return keys;
  }
  for (const [key, child] of Object.entries(value)) {
    keys.push(key);
    collectPersistedKeys(child, keys);
  }
  return keys;
}

function hydrateReadySource(
  store: ReturnType<typeof createLabStore>,
  source: {
    kind: "audio" | "video" | "image";
    metadata?: Record<string, unknown>;
    path: string;
  }
) {
  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      projectIndex: {
        activeProjectId: `project-default-${source.kind}`,
        projects: [],
      },
      workbench: {},
      source: {
        status: "ready",
        kind: source.kind,
        mode: "local",
        routeLabel: "Local Copy",
        storedPath: source.path,
        metadata: source.metadata ?? {},
      },
      sourceProbeStatus: "completed",
      workspace: {},
      reports: {
        user: null,
        ai: null,
        emptyReason: null,
      },
      activityFeed: [],
      lastRun: null,
    },
  });
}

void test("selection suggestion selector returns an empty list without a valid selection", () => {
  const store = createLabStore();

  assert.deepEqual(getSelectionSuggestions(store.getState()), []);
  assert.deepEqual(getWaveformTimelineModel(store.getState()).selectionSuggestions , []);
});

void test("selection suggestion selector falls back to the full source scope without a manual selection", () => {
  const audioStore = createLabStore();
  hydrateReadySource(audioStore, {
    kind: "audio",
    path: "/tmp/source.wav",
    metadata: { durationSeconds: 4 },
  });

  assert.equal(audioStore.getState().ui.workspace.activeSelection, null);
  assert.deepEqual(getSelectionSuggestions(audioStore.getState()), [
    {
      id: "analyze-anomaly",
      label: "Anomaliyi analiz et",
      actionType: "analyze-segment",
      confidence: 0.9,
    },
    {
      id: "audio-inspect",
      label: "Ses detaylarini incele",
      actionType: "inspect-audio",
      confidence: 0.9,
    },
  ]);
  assert.deepEqual(getEffectiveActiveSelection(audioStore.getState()), {
    id: "selection-default:full-audio",
    startMs: 0,
    endMs: 4000,
    type: "clip",
    createdAt: 0,
  });
  assert.equal(
    getWaveformTimelineModel(audioStore.getState()).selectionSuggestions.some(function (
      suggestion
    ) {
      return suggestion.id === "clean-audio";
    }),
    false
  );
  assert.equal(
    getWaveformTimelineModel(audioStore.getState()).selectionSuggestions.some(function (
      suggestion
    ) {
      return suggestion.id === "metadata-audit";
    }),
    true
  );

  const videoStore = createLabStore();
  hydrateReadySource(videoStore, {
    kind: "video",
    path: "/tmp/source.mp4",
    metadata: { durationSeconds: 9 },
  });

  assert.deepEqual(getSelectionSuggestions(videoStore.getState()), [
    {
      id: "analyze-anomaly",
      label: "Anomaliyi analiz et",
      actionType: "analyze-segment",
      confidence: 0.9,
    },
    {
      id: "motion-check",
      label: "Hareket tutarliligini incele",
      actionType: "analyze-segment",
      confidence: 0.85,
    },
    {
      id: "audio-inspect",
      label: "Ses detaylarini incele",
      actionType: "inspect-audio",
      confidence: 0.9,
    },
    {
      id: "enhance-visual",
      label: "Goruntuyu iyilestir",
      actionType: "enhance-visual",
      confidence: 0.8,
    },
    {
      id: "extract-clip",
      label: "Bu bolumu kes",
      actionType: "extract-clip",
      confidence: 0.6,
    },
  ]);
  assert.equal(getEffectiveActiveSelection(videoStore.getState())?.endMs, 9000);
  assert.equal(
    getWaveformTimelineModel(videoStore.getState()).selectionSuggestions.some(function (
      suggestion
    ) {
      return suggestion.id === "detect-scenes";
    }),
    true
  );

  const imageStore = createLabStore();
  hydrateReadySource(imageStore, {
    kind: "image",
    path: "/tmp/source.png",
  });

  assert.deepEqual(getEffectiveActiveSelection(imageStore.getState())?.roi, {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  assert.deepEqual(getSelectionSuggestions(imageStore.getState()), [
    {
      id: "analyze-anomaly",
      label: "Anomaliyi analiz et",
      actionType: "analyze-segment",
      confidence: 0.94,
    },
    {
      id: "enhance-visual",
      label: "Goruntuyu iyilestir",
      toolHint: "Enhance clarity",
      actionType: "enhance-visual",
      confidence: 0.86,
    },
    {
      id: "inspect-region",
      label: "Secili bolgeyi incele",
      toolHint: "Focus region",
      actionType: "focus-region",
      confidence: 0.82,
    },
  ]);
  assert.equal(
    getWaveformTimelineModel(imageStore.getState()).selectionSuggestions.some(function (
      suggestion
    ) {
      return suggestion.id === "crop-region";
    }),
    false
  );
});

void test("selection tab renders default full-source suggestions without mutating active selection", () => {
  const store = createLabStore();
  hydrateReadySource(store, {
    kind: "audio",
    path: "/tmp/source.wav",
    metadata: { durationSeconds: 5 },
  });

  const surface = renderWorkspaceSurface(store.getState());

  assert.equal(store.getState().ui.workspace.activeSelection, null);
  assert.match(surface.side, /class="lab-selection-panel/);
  assert.match(surface.side, /00:00\.000/);
  assert.match(surface.side, /00:05\.000/);
  assert.match(surface.side, /data-lab-selection-suggestion="audio-inspect"/);
  assert.match(surface.side, /data-lab-selection-suggestion="metadata-audit"/);
  assert.doesNotMatch(surface.side, /data-lab-selection-suggestion="clean-audio"/);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "metadata-audit",
  });

  assert.equal(store.getState().ui.activeSuggestionPreviewId, "metadata-audit");
  assert.equal(
    getActiveSuggestionPreview(store.getState())?.title,
    "Metadata kontrolu hazirlanacak"
  );
});

void test("selection suggestion selector provides a general fallback for timeline media", () => {
  const store = createLabStore();

  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "audio",
      mode: "local",
      storedPath: "/tmp/source.wav",
    },
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1000,
    endMs: 3000,
  });

  assert.deepEqual(getSelectionSuggestions(store.getState()), [
    {
      id: "analyze-anomaly",
      label: "Anomaliyi analiz et",
      actionType: "analyze-segment",
      confidence: 0.9,
    },
    {
      id: "audio-inspect",
      label: "Ses detaylarini incele",
      actionType: "inspect-audio",
      confidence: 0.9,
    },
  ]);
});

void test("selection suggestion selector fences recommendations by inspection mode and media kind", () => {
  const audioStore = createLabStore();
  audioStore.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "audio",
      mode: "local",
      storedPath: "/tmp/source.wav",
    },
  });
  audioStore.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1000,
    endMs: 3000,
  });
  audioStore.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });

  assert.deepEqual(getSelectionSuggestions(audioStore.getState()), [
    {
      id: "analyze-anomaly",
      label: "Anomaliyi analiz et",
      actionType: "analyze-segment",
      confidence: 0.9,
    },
    {
      id: "audio-inspect",
      label: "Ses detaylarini incele",
      actionType: "inspect-audio",
      confidence: 0.93,
    },
  ]);

  const imageStore = createLabStore();
  imageStore.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "image",
      mode: "local",
      storedPath: "/tmp/source.png",
    },
  });
  imageStore.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1000,
    endMs: 3000,
  });
  imageStore.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });

  assert.deepEqual(getSelectionSuggestions(imageStore.getState()), [
    {
      id: "analyze-anomaly",
      label: "Anomaliyi analiz et",
      actionType: "analyze-segment",
      confidence: 0.9,
    },
    {
      id: "enhance-visual",
      label: "Goruntuyu iyilestir",
      actionType: "enhance-visual",
      confidence: 0.8,
    },
    {
      id: "focus-region",
      label: "Bolgeye odaklan",
      actionType: "focus-region",
      confidence: 0.58,
    },
  ]);

  imageStore.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "none",
  });

  assert.deepEqual(getSelectionSuggestions(imageStore.getState()), [
    {
      id: "analyze-anomaly",
      label: "Anomaliyi analiz et",
      actionType: "analyze-segment",
      confidence: 0.9,
    },
    {
      id: "enhance-visual",
      label: "Goruntuyu iyilestir",
      actionType: "enhance-visual",
      confidence: 0.8,
    },
    {
      id: "focus-region",
      label: "Bolgeye odaklan",
      actionType: "focus-region",
      confidence: 0.58,
    },
  ]);

  imageStore.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "none",
  });

  assert.deepEqual(getSelectionSuggestions(imageStore.getState()), [
    {
      id: "analyze-anomaly",
      label: "Anomaliyi analiz et",
      actionType: "analyze-segment",
      confidence: 0.9,
    },
    {
      id: "enhance-visual",
      label: "Goruntuyu iyilestir",
      actionType: "enhance-visual",
      confidence: 0.8,
    },
    {
      id: "focus-region",
      label: "Bolgeye odaklan",
      actionType: "focus-region",
      confidence: 0.58,
    },
  ]);

  imageStore.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "visual",
  });

  assert.deepEqual(getSelectionSuggestions(imageStore.getState()), [
    {
      id: "analyze-anomaly",
      label: "Anomaliyi analiz et",
      actionType: "analyze-segment",
      confidence: 0.9,
    },
    {
      id: "enhance-visual",
      label: "Goruntuyu iyilestir",
      actionType: "enhance-visual",
      confidence: 0.86,
    },
    {
      id: "focus-region",
      label: "Bolgeye odaklan",
      actionType: "focus-region",
      confidence: 0.58,
    },
  ]);
});

void test("selection suggestion selector boosts region-aware visual and motion guidance", () => {
  const videoStore = createLabStore();
  videoStore.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "video",
      mode: "local",
      storedPath: "/tmp/source.mp4",
    },
  });
  videoStore.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1000,
    endMs: 3000,
  });
  videoStore.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "motion",
  });

  assert.deepEqual(getSelectionSuggestions(videoStore.getState()), [
    {
      id: "analyze-anomaly",
      label: "Anomaliyi analiz et",
      actionType: "analyze-segment",
      confidence: 0.9,
    },
    {
      id: "motion-check",
      label: "Hareket tutarliligini incele",
      actionType: "analyze-segment",
      confidence: 0.92,
    },
    {
      id: "audio-inspect",
      label: "Ses detaylarini incele",
      actionType: "inspect-audio",
      confidence: 0.9,
    },
    {
      id: "enhance-visual",
      label: "Goruntuyu iyilestir",
      actionType: "enhance-visual",
      confidence: 0.8,
    },
    {
      id: "extract-clip",
      label: "Bu bolumu kes",
      actionType: "extract-clip",
      confidence: 0.6,
    },
  ]);

  videoStore.dispatch({
    type: "selection-roi-updated",
    roi: {
      x: 0.25,
      y: 0.2,
      width: 0.2,
      height: 0.25,
    },
  });
  videoStore.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "motion",
  });

  assert.deepEqual(getSelectionSuggestions(videoStore.getState()), [
    {
      id: "analyze-anomaly",
      label: "Anomaliyi analiz et",
      actionType: "analyze-segment",
      confidence: 0.94,
    },
    {
      id: "motion-check",
      label: "Hareket tutarliligini incele",
      toolHint: "Inspect motion",
      actionType: "analyze-segment",
      confidence: 0.92,
    },
    {
      id: "audio-inspect",
      label: "Ses detaylarini incele",
      actionType: "inspect-audio",
      confidence: 0.9,
    },
    {
      id: "enhance-visual",
      label: "Goruntuyu iyilestir",
      toolHint: "Enhance clarity",
      actionType: "enhance-visual",
      confidence: 0.86,
    },
    {
      id: "inspect-region",
      label: "Secili bolgeyi incele",
      toolHint: "Focus region",
      actionType: "focus-region",
      confidence: 0.88,
    },
    {
      id: "stabilize-region",
      label: "Segmenti stabilize et",
      toolHint: "Stabilize segment",
      actionType: "stabilize-segment",
      confidence: 0.72,
    },
    {
      id: "extract-clip",
      label: "Bu bolumu kes",
      actionType: "extract-clip",
      confidence: 0.6,
    },
  ]);
});

void test("suggestion preview builder returns a dry-run plan for supported actions", () => {
  const selection: LabSelection = {
    id: "selection-preview",
    startMs: 1200,
    endMs: 7800,
    type: "clip",
    createdAt: 1700000000000,
  };
  const fallbackSuggestion = {
    id: "custom-fallback",
    label: "Custom fallback",
    actionType: "unknown-action" as LabActionSuggestion["actionType"],
    confidence: 0.2,
  };

  assert.deepEqual(
    buildSuggestionPreview(
      {
        id: "analyze-anomaly",
        label: "Anomaliyi analiz et",
        actionType: "analyze-segment",
        confidence: 0.9,
      },
      selection
    ),
    {
      suggestionId: "analyze-anomaly",
      title: "Segment analiz edilecek",
      steps: [
        "6.6s secim hazirlanacak",
        "Gorsel ve/veya ses sinyalleri ayristirilacak",
        "Anomali veya tutarsizlik incelemesi hazirlanacak",
      ],
      expectedOutputs: [
        "Analiz raporu",
        "Tespit edilen bulgular",
        "Ilgili frame veya segment referanslari",
      ],
      estimatedCost: "medium",
    }
  );

  assert.deepEqual(
    buildSuggestionPreview(
      {
        id: "audio-inspect",
        label: "Ses detaylarini incele",
        actionType: "inspect-audio",
        confidence: 0.9,
      },
      selection
    ),
    {
      suggestionId: "audio-inspect",
      title: "Ses analizi yapilacak",
      steps: [
        "6.6s secim hazirlanacak",
        "Ses track izole edilecek",
        "Frekans ve yogunluk taramasi hazirlanacak",
        "Ani degisim noktalarina bakilacak",
      ],
      expectedOutputs: ["Ses analizi raporu", "Olasi anomali noktalari"],
      estimatedCost: "low",
    }
  );

  assert.deepEqual(
    buildSuggestionPreview(
      {
        id: "extract-clip",
        label: "Bu bolumu kes",
        actionType: "extract-clip",
        confidence: 0.68,
      },
      selection
    ),
    {
      suggestionId: "extract-clip",
      title: "Clip olusturulacak",
      steps: ["6.6s secim hazirlanacak", "Secilen segment yeni bir clip olarak hazirlanacak"],
      expectedOutputs: ["Video clip"],
      estimatedCost: "low",
    }
  );

  assert.deepEqual(
    buildSuggestionPreview(
      {
        id: "focus-region",
        label: "Bolgeye odaklan",
        actionType: "focus-region",
        confidence: 0.66,
      },
      selection
    ),
    {
      suggestionId: "focus-region",
      title: "Bolge incelemesi hazirlanacak",
      steps: [
        "6.6s secim hazirlanacak",
        "Secili goruntu bolgesi izole edilecek",
        "Bolgeye odakli gorsel inceleme hazirlanacak",
      ],
      expectedOutputs: ["Bolge odakli notlar", "Ilgili goruntu referanslari"],
      estimatedCost: "low",
    }
  );

  assert.deepEqual(
    buildSuggestionPreview(
      {
        id: "enhance-visual",
        label: "Goruntuyu iyilestir",
        actionType: "enhance-visual",
        confidence: 0.8,
      },
      selection
    ),
    {
      suggestionId: "enhance-visual",
      title: "Islem hazirlaniyor",
      steps: ["Bu islem icin detayli plan henuz tanimli degil"],
      expectedOutputs: [],
      estimatedCost: "low",
    }
  );

  assert.deepEqual(buildSuggestionPreview(fallbackSuggestion, selection), {
    suggestionId: "custom-fallback",
    title: "Islem hazirlaniyor",
    steps: ["Bu islem icin detayli plan henuz tanimli degil"],
    expectedOutputs: [],
    estimatedCost: "low",
  });
});

void test("selection preview is derived from the active preview id and current suggestion set", () => {
  const store = createLabStore();

  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "audio",
      mode: "local",
      storedPath: "/tmp/source.wav",
    },
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1000,
    endMs: 3000,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });

  assert.equal(store.getState().ui.activeSuggestionPreviewId, "audio-inspect");
  assert.deepEqual(getActiveSuggestionPreview(store.getState()), {
    suggestionId: "audio-inspect",
    title: "Ses analizi yapilacak",
    steps: [
      "2.0s secim hazirlanacak",
      "Ses track izole edilecek",
      "Frekans ve yogunluk taramasi hazirlanacak",
      "Ani degisim noktalarina bakilacak",
    ],
    expectedOutputs: ["Ses analizi raporu", "Olasi anomali noktalari"],
    estimatedCost: "low",
  });
  assert.deepEqual(getWaveformTimelineModel(store.getState()).activeSuggestionPreview, {
    suggestionId: "audio-inspect",
    title: "Ses analizi yapilacak",
    steps: [
      "2.0s secim hazirlanacak",
      "Ses track izole edilecek",
      "Frekans ve yogunluk taramasi hazirlanacak",
      "Ani degisim noktalarina bakilacak",
    ],
    expectedOutputs: ["Ses analizi raporu", "Olasi anomali noktalari"],
    estimatedCost: "low",
  });
});

void test("selection preview clears on range changes, inspection mode changes, and explicit dismiss events", () => {
  const store = createLabStore();

  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "audio",
      mode: "local",
      storedPath: "/tmp/source.wav",
    },
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1000,
    endMs: 3000,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });

  assert.equal(store.getState().ui.activeSuggestionPreviewId, "audio-inspect");
  assert.equal(store.getState().ui.activeExecutionIntentId, "audio-inspect");
  assert.equal(getActiveExecutionIntent(store.getState())?.id, "audio-inspect");

  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1200,
    endMs: 3200,
  });
  assert.equal(store.getState().ui.activeSuggestionPreviewId, null);
  assert.equal(store.getState().ui.activeExecutionCommitment, null);
  assert.equal(store.getState().ui.activeExecutionIntentId, null);
  assert.equal(getActiveExecutionIntent(store.getState()), null);

  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });
  assert.equal(store.getState().ui.activeSuggestionPreviewId, "audio-inspect");
  assert.equal(store.getState().ui.activeExecutionIntentId, "audio-inspect");

  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "visual",
  });
  assert.equal(store.getState().ui.activeSuggestionPreviewId, null);
  assert.equal(store.getState().ui.activeExecutionIntentId, null);
  assert.equal(getActiveExecutionIntent(store.getState()), null);

  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-preview-cleared",
  });
  assert.equal(store.getState().ui.activeSuggestionPreviewId, null);
  assert.equal(store.getState().ui.activeExecutionIntentId, "audio-inspect");
  assert.equal(getActiveExecutionIntent(store.getState())?.id, "audio-inspect");
});

void test("selection suggestion accept and queue cannot mutate source analysis while a run is active", () => {
  const store = createLabStore();

  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "video",
      mode: "local",
      storedPath: "/tmp/source.mp4",
    },
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1000,
    endMs: 3000,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "motion",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "motion-check",
  });
  store.dispatch({ type: "run-started", action: "process-run" });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "motion-check",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-queued",
    suggestionId: "motion-check",
  });

  const state = store.getState();
  assert.deepEqual(state.selectedCapabilities, []);
  assert.equal(state.ui.activeExecutionIntentId, null);
});

void test("terminal analysis events clear source selections while preserving the run analysis scope", () => {
  const store = createLabStore();

  hydrateReadySource(store, {
    kind: "audio",
    path: "/tmp/source.wav",
    metadata: { durationSeconds: 4 },
  });
  store.dispatch({ type: "analysis-prep-group-toggled", capabilityId: "audio-signal" });
  store.dispatch({
    type: "workbench-updated",
    workbench: {
      ...store.getState().workbench,
      analysisScope: {
        focus: "audio",
        timeRange: {
          startMs: 500,
          endMs: 2500,
        },
        hypothesis: "voice clue",
      },
    },
  });

  let moduleToggles = store.getState().workbench["moduleToggles"] as Record<string, unknown>;
  assert.equal(moduleToggles["signal-health"], true);

  store.dispatch({ type: "run-started", action: "audio-process-run" });
  store.dispatch({
    type: "run-failed",
    action: "audio-process-run",
    detail: "Room API bridge is not connected.",
  });

  let state = store.getState();
  moduleToggles = state.workbench["moduleToggles"] as Record<string, unknown>;
  assert.deepEqual(state.selectedCapabilities, []);
  assert.equal(moduleToggles["signal-health"], false);

  store.dispatch({ type: "analysis-prep-group-toggled", capabilityId: "audio-signal" });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-scope",
      kind: "analysis-scope-updated",
      severity: "info",
      message: "Analysis scope locked",
      detail: null,
      timestamp: Date.now(),
      source: "host",
      action: "audio-process-run",
      stage: "running",
      scope: "run",
      moduleId: null,
      rawLine: null,
      analysisScope: {
        focus: "audio",
        timeRange: {
          startMs: 500,
          endMs: 2500,
        },
        hypothesis: "voice clue",
      },
    },
  });
  store.dispatch({
    type: "host-event-received",
    event: {
      id: "evt-completed",
      kind: "activity",
      severity: "success",
      message: "Analysis completed",
      detail: null,
      timestamp: Date.now() + 1,
      source: "host",
      action: "audio-process-run",
      stage: "completed",
      scope: "run",
      moduleId: null,
      rawLine: null,
    },
  });

  state = store.getState();
  moduleToggles = state.workbench["moduleToggles"] as Record<string, unknown>;
  assert.deepEqual(state.selectedCapabilities, []);
  assert.equal(moduleToggles["signal-health"], false);
});

void test("hydrate keeps selection previews and execution intents ephemeral", async () => {
  const store = createLabStore();
  const labRootModule = await importLabRootModuleWithDomStub<{
    __testOnlyLabRootPersistence: {
      readPersistableState: (state: ReturnType<typeof store.getState>) => Record<string, unknown>;
    };
  }>();
  const baseWorkspace = store.getState().ui.workspace;

  store.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "audio",
      mode: "local",
      storedPath: "/tmp/source.wav",
    },
  });
  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1000,
    endMs: 3000,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });
  assert.equal(store.getState().ui.activeSuggestionPreviewId, "audio-inspect");
  assert.equal(store.getState().ui.activeExecutionIntentId, "audio-inspect");
  assert.equal(getActiveExecutionPlan(store.getState())?.suggestionId, "audio-inspect");
  const activeHydrateCandidate = getActiveExecutionCandidate(store.getState());
  assert.ok(activeHydrateCandidate);
  store.dispatch({
    type: "workspace-execution-commitment-set",
    planId: activeHydrateCandidate.planId,
  });
  assert.equal(
    getActiveExecutionCommitment(store.getState())?.planId,
    activeHydrateCandidate.planId
  );
  const dispatchCandidate = getExecutionDispatchCandidate(store.getState());
  assert.ok(dispatchCandidate);
  store.dispatch({
    type: "workspace-execution-dispatch",
    planId: dispatchCandidate.planId,
    dispatchId: dispatchCandidate.dispatchId,
  });
  store.dispatch({
    type: "workspace-execution-completed",
    planId: dispatchCandidate.planId,
    dispatchId: dispatchCandidate.dispatchId,
    result: createMockExecutionResult(dispatchCandidate),
  });
  assert.equal(store.getState().ui.executionRuntime.status, "completed");
  assert.equal(getActiveExecutionResult(store.getState()) !== null, true);
  assert.equal(getActiveExecutionGoalEvaluation(store.getState()) !== null, true);
  assert.equal(getActiveExecutionResultInterpretation(store.getState()) !== null, true);

  const persistedState = labRootModule.__testOnlyLabRootPersistence.readPersistableState(
    store.getState()
  );
  assert.equal("adaptiveDecisionHint" in persistedState, false);
  assert.equal("activeExecutionGoalEvaluation" in persistedState, false);
  assert.equal("activeExecutionIntentId" in persistedState, false);
  assert.equal("activeExecutionAlternatives" in persistedState, false);
  assert.equal("activeExecutionCandidate" in persistedState, false);
  assert.equal("activeExecutionCommitment" in persistedState, false);
  assert.equal("activeExecutionPlan" in persistedState, false);
  assert.equal("activeExecutionPayloadPreview" in persistedState, false);
  assert.equal("activeExecutionReadiness" in persistedState, false);
  assert.equal("activeExecutionReflection" in persistedState, false);
  assert.equal("activeExecutionSimulation" in persistedState, false);
  assert.equal("activeExecutionStaging" in persistedState, false);
  assert.equal("executionGoalEvaluation" in persistedState, false);
  assert.equal("executionPatternRegistry" in persistedState, false);
  assert.equal("executionPatternSignal" in persistedState, false);
  assert.equal("executionRuntime" in persistedState, false);
  assert.equal("patternSignal" in persistedState, false);
  assert.equal("decisionPressure" in persistedState, false);
  assert.equal("decisionPosture" in persistedState, false);
  assert.equal("decisionPostureSignal" in persistedState, false);
  assert.equal("posture" in persistedState, false);
  assert.equal("shortLabel" in persistedState, false);
  assert.equal("counterfactualProjection" in persistedState, false);
  assert.equal("expectedCoverage" in persistedState, false);
  assert.equal("expectedAlignment" in persistedState, false);
  assert.equal("expectedStability" in persistedState, false);
  assert.equal("preferredAlternative" in persistedState, false);
  assert.equal("preferredAlternativeIndex" in persistedState, false);
  assert.equal("preferredAlternativeLabel" in persistedState, false);
  assert.equal(
    "adaptiveDecisionHint" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "activeExecutionGoalEvaluation" in
      ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "activeExecutionIntentId" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "activeExecutionAlternatives" in
      ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "activeExecutionCandidate" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "activeExecutionCommitment" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "activeExecutionReadiness" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "activeExecutionPlan" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "activeExecutionPayloadPreview" in
      ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "activeExecutionReflection" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "activeExecutionSimulation" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "activeExecutionStaging" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "executionGoalEvaluation" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "executionPatternRegistry" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "executionPatternSignal" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "executionRuntime" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "patternSignal" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "decisionPressure" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "decisionPosture" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "decisionPostureSignal" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "posture" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "shortLabel" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "counterfactualProjection" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "expectedCoverage" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "expectedAlignment" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "expectedStability" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "preferredAlternative" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "preferredAlternativeIndex" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  assert.equal(
    "preferredAlternativeLabel" in ((persistedState["workspace"] as Record<string, unknown>) ),
    false
  );
  const persistedKeys = collectPersistedKeys(persistedState);
  for (const key of ["decisionPosture", "decisionPostureSignal", "posture", "shortLabel"]) {
    assert.equal(persistedKeys.includes(key), false);
  }
  assert.doesNotMatch(
    JSON.stringify(persistedState),
    /\b(Proceed with caution|Proceed|Reconsider)\b/
  );

  __testOnlyResetExecutionPatternRegistry();

  store.dispatch({
    type: "hydrate",
    payload: {
      featureId: "media-analysis",
      projectIndex: {
        activeProjectId: "project-1",
        projects: [],
      },
      workbench: {},
      source: {
        kind: "audio",
        mode: "local",
        storedPath: "/tmp/source.wav",
      },
      sourceProbeStatus: "completed",
      workspace: {
        ...baseWorkspace,
        timelineStartMs: 1000,
        timelineEndMs: 3000,
      },
      reports: {
        user: null,
        ai: null,
        emptyReason: null,
      },
      activityFeed: [],
      lastRun: null,
    },
  });

  assert.equal(store.getState().ui.activeSuggestionPreviewId, null);
  assert.equal(store.getState().ui.activeExecutionIntentId, null);
  assert.equal(getActiveSuggestionPreview(store.getState()), null);
  assert.equal(getActiveExecutionIntent(store.getState()), null);
  assert.equal(getActiveExecutionPlan(store.getState()), null);
  assert.equal(getActiveExecutionAlternatives(store.getState()), null);
  assert.equal(getActiveExecutionCandidate(store.getState()), null);
  assert.equal(getActiveExecutionCommitment(store.getState()), null);
  assert.equal(getActiveExecutionPayloadPreview(store.getState()), null);
  assert.equal(getActiveExecutionReadiness(store.getState()), null);
  assert.equal(getActiveExecutionReflection(store.getState()), null);
  assert.equal(getActiveExecutionStaging(store.getState()), null);
  assert.equal(store.getState().ui.executionRuntime.status, "idle");
  assert.equal(getActiveExecutionGoalEvaluation(store.getState()), null);
  assert.equal(getActiveExecutionResult(store.getState()), null);
  assert.equal(getActiveExecutionResultInterpretation(store.getState()), null);

  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1000,
    endMs: 3000,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });
  const freshCandidate = getActiveExecutionCandidate(store.getState());
  assert.ok(freshCandidate);
  store.dispatch({
    type: "workspace-execution-commitment-set",
    planId: freshCandidate.planId,
  });
  const freshDispatchCandidate = getExecutionDispatchCandidate(store.getState());
  assert.ok(freshDispatchCandidate);
  store.dispatch({
    type: "workspace-execution-dispatch",
    planId: freshDispatchCandidate.planId,
    dispatchId: freshDispatchCandidate.dispatchId,
  });
  store.dispatch({
    type: "workspace-execution-completed",
    planId: freshDispatchCandidate.planId,
    dispatchId: freshDispatchCandidate.dispatchId,
    result: createMockExecutionResult(freshDispatchCandidate),
  });
  assert.equal(getActiveExecutionGoalEvaluation(store.getState())?.patternSignal, undefined);
});
