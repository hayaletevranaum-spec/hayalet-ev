import {
  assert,
  buildExecutionPayloadPreview,
  buildExecutionPlan,
  buildExecutionReadiness,
  buildExecutionSimulation,
  createLabStore,
  createTestAudioFocusSettings,
  getActiveExecutionAlternatives,
  getActiveExecutionCandidate,
  getActiveExecutionCommitment,
  getActiveExecutionIntent,
  getActiveExecutionPayloadPreview,
  getActiveExecutionPlan,
  getActiveExecutionReadiness,
  getActiveExecutionSimulation,
  getActiveSuggestionPreviewId,
  getLaboratoryProcessSummary,
  getLaboratoryRightPanelContext,
  test
} from "./laboratory-runtime-truth.helpers.ts";

import type { LabActionSuggestion, LabSelection } from "./laboratory-runtime-truth.helpers.ts";

void test("laboratory process summary derives a single deterministic state", () => {
  const store = createLabStore();

  assert.equal(getLaboratoryProcessSummary(store.getState()).state, "idle");

  store.dispatch({
    type: "source-probe-started",
    action: "probe",
  });
  const processingSummary = getLaboratoryProcessSummary(store.getState());
  assert.equal(processingSummary.state, "processing");
  assert.equal(processingSummary.activeTaskKey, "sourcePreparation");
  assert.equal(processingSummary.progressKey, "oneActiveTask");

  store.dispatch({
    type: "source-probe-completed",
    action: "probe",
  });
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
  const activeCandidate = getActiveExecutionCandidate(store.getState());
  assert.ok(activeCandidate);
  const activeAlternatives = getActiveExecutionAlternatives(store.getState());
  assert.ok(activeAlternatives);
  assert.match(activeCandidate.summary, /Descriptor view:/);
  assert.match(activeAlternatives.summary, /Descriptor view:/);
  assert.doesNotMatch(activeCandidate.summary, /Tanımlayıcı görünümü:/);
  assert.doesNotMatch(activeAlternatives.summary, /Tanımlayıcı görünümü:/);
  store.dispatch({
    type: "workspace-execution-commitment-set",
    planId: activeCandidate.planId,
  });

  const stagingSummary = getLaboratoryProcessSummary(store.getState());
  assert.equal(stagingSummary.state, "idle");
  assert.equal(
    (getLaboratoryRightPanelContext(store.getState()) as unknown as Record<string, unknown>)[
      "stagingStatus"
    ],
    undefined
  );

  store.dispatch({
    type: "run-started",
    action: "analysis",
  });
  store.dispatch({
    type: "module-started",
    action: "analysis",
    moduleId: "audio",
  });
  const analyzingSummary = getLaboratoryProcessSummary(store.getState());
  assert.equal(analyzingSummary.state, "analyzing");
  assert.equal(analyzingSummary.totalCount, 1);
  assert.equal(analyzingSummary.activeTaskLabel, "audio");
});

void test("store accepts execution intents only from the exact active suggestion preview", () => {
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
    mode: "audio",
  });

  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });
  assert.equal(store.getState().ui.activeExecutionIntentId, null);
  assert.equal(getActiveExecutionIntent(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "extract-clip",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });
  assert.equal(store.getState().ui.activeExecutionIntentId, null);
  assert.equal(getActiveExecutionIntent(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "missing-suggestion",
  });
  assert.equal(store.getState().ui.activeExecutionIntentId, null);
  assert.equal(getActiveExecutionIntent(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });
  assert.equal(store.getState().ui.activeExecutionIntentId, "audio-inspect");
  assert.equal(getActiveExecutionIntent(store.getState())?.id, "audio-inspect");

  store.dispatch({
    type: "workspace-selection-suggestion-dismissed",
    suggestionId: " audio-inspect ",
  });
  assert.equal(store.getState().ui.activeExecutionIntentId, null);
  assert.equal(getActiveExecutionIntent(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: " audio-inspect ",
  });
  assert.equal(getActiveSuggestionPreviewId(store.getState()), "audio-inspect");

  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: " audio-inspect ",
  });
  assert.equal(store.getState().ui.activeExecutionIntentId, "audio-inspect");
  assert.equal(getActiveExecutionIntent(store.getState())?.id, "audio-inspect");

  const activeCandidate = getActiveExecutionCandidate(store.getState());
  assert.ok(activeCandidate);
  store.dispatch({
    type: "workspace-execution-commitment-set",
    planId: activeCandidate.planId,
  });
  assert.equal(getActiveExecutionCommitment(store.getState())?.planId, activeCandidate.planId);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "extract-clip",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "extract-clip",
  });
  assert.equal(store.getState().ui.activeExecutionIntentId, "audio-inspect");
  assert.equal(store.getState().ui.activeExecutionCommitment?.planId, activeCandidate.planId);
  assert.equal(getActiveExecutionCommitment(store.getState())?.planId, activeCandidate.planId);

  store.dispatch({
    type: "selection-roi-updated",
    roi: {
      x: 0.2,
      y: 0.2,
      width: 0.24,
      height: 0.24,
    },
  });
  assert.equal(store.getState().ui.activeSuggestionPreviewId, null);
  assert.equal(store.getState().ui.activeExecutionIntentId, null);
  assert.equal(getActiveExecutionIntent(store.getState()), null);
});

void test("execution plan is derived only from accepted intents and survives preview clear", () => {
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

  assert.equal(getActiveExecutionPlan(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-queued",
    suggestionId: "audio-inspect",
  });
  assert.equal(getActiveExecutionPlan(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });

  assert.equal(getActiveExecutionPlan(store.getState())?.suggestionId, "audio-inspect");
  assert.equal(getActiveExecutionPlan(store.getState())?.title, "Audio inspection plan");

  store.dispatch({
    type: "workspace-selection-suggestion-preview-cleared",
  });
  assert.equal(store.getState().ui.activeSuggestionPreviewId, null);
  assert.equal(getActiveExecutionPlan(store.getState())?.suggestionId, "audio-inspect");

  store.dispatch({
    type: "workspace-selection-suggestion-dismissed",
    suggestionId: "audio-inspect",
  });
  assert.equal(getActiveExecutionPlan(store.getState()), null);
});

void test("execution plan lifecycle ignores passive inspection changes and clears on structural changes", () => {
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

  assert.equal(getActiveExecutionPlan(store.getState())?.suggestionId, "audio-inspect");

  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });
  assert.equal(store.getState().ui.activeExecutionIntentId, "audio-inspect");
  assert.equal(getActiveExecutionPlan(store.getState())?.suggestionId, "audio-inspect");

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });
  assert.equal(getActiveExecutionPlan(store.getState())?.suggestionId, "audio-inspect");

  store.dispatch({
    type: "selection-roi-updated",
    roi: {
      x: 0.2,
      y: 0.2,
      width: 0.3,
      height: 0.3,
    },
  });
  assert.equal(store.getState().ui.activeExecutionIntentId, null);
  assert.equal(getActiveExecutionPlan(store.getState()), null);
});

void test("execution planner is deterministic and resolves ROI tool-hint intents", () => {
  const baseSelection: LabSelection = {
    id: "selection-1",
    startMs: 1200,
    endMs: 4800,
    type: "inspect",
    roi: {
      x: 0.18,
      y: 0.22,
      width: 0.24,
      height: 0.28,
    },
    createdAt: 1,
  };

  const inspectRegionPlan = buildExecutionPlan({
    suggestion: {
      id: "inspect-region",
      label: "Secili bolgeyi incele",
      toolHint: "Focus region",
      actionType: "focus-region",
      confidence: 0.82,
    },
    activeSelection: baseSelection,
    inspectionMode: "motion",
    sourceKind: "video",
  });
  const inspectRegionPlanRepeat = buildExecutionPlan({
    suggestion: {
      id: "inspect-region",
      label: "Secili bolgeyi incele",
      toolHint: "Focus region",
      actionType: "focus-region",
      confidence: 0.82,
    },
    activeSelection: baseSelection,
    inspectionMode: "motion",
    sourceKind: "video",
  });

  assert.deepEqual(inspectRegionPlan, inspectRegionPlanRepeat);
  assert.equal(
    inspectRegionPlan.id,
    "plan:inspect-region:focus-region:video:motion:inspect:1200:4800:180-220-240-280"
  );
  assert.equal(inspectRegionPlan.suggestionId, "inspect-region");
  assert.match(inspectRegionPlan.title, /Region focus plan/);

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
    startMs: 1200,
    endMs: 4800,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "motion",
  });
  store.dispatch({
    type: "selection-roi-updated",
    roi: {
      x: 0.18,
      y: 0.22,
      width: 0.24,
      height: 0.28,
    },
  });
  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "inspect-region",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "inspect-region",
  });

  assert.equal(getActiveExecutionPlan(store.getState())?.suggestionId, "inspect-region");
  assert.match(getActiveExecutionPlan(store.getState())?.title ?? "", /Region focus plan/);
});

void test("execution planner falls back safely for unknown action types", () => {
  const plan = buildExecutionPlan({
    suggestion: {
      id: "custom-unknown",
      label: "Unknown",
      actionType: "unknown-action" as unknown as LabActionSuggestion["actionType"],
      confidence: 0.41,
    },
    activeSelection: {
      id: "selection-x",
      startMs: 400,
      endMs: 1200,
      type: "clip",
      createdAt: 1,
    },
    inspectionMode: "none",
    sourceKind: "audio",
  });

  assert.equal(plan.title, "Generic execution plan");
  assert.equal(plan.expectedOutputs[0], "Review notes");
  assert.equal(plan.steps.length, 3);
});

void test("execution simulation is derived only from active plans and survives preview clear", () => {
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

  assert.equal(getActiveExecutionSimulation(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-queued",
    suggestionId: "audio-inspect",
  });
  assert.equal(getActiveExecutionSimulation(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });

  const activePlan = getActiveExecutionPlan(store.getState());
  const activeSimulation = getActiveExecutionSimulation(store.getState());
  assert.equal(activePlan?.suggestionId, "audio-inspect");
  assert.equal(activeSimulation?.planId, activePlan.id);
  assert.equal(activeSimulation.id, `simulation:${activePlan.id}`);
  assert.equal((activeSimulation.predictedEffects.length ) > 0, true);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-cleared",
  });
  assert.equal(store.getState().ui.activeSuggestionPreviewId, null);
  assert.equal(getActiveExecutionSimulation(store.getState())?.planId, activePlan.id);

  store.dispatch({
    type: "workspace-selection-suggestion-dismissed",
    suggestionId: "audio-inspect",
  });
  assert.equal(getActiveExecutionSimulation(store.getState()), null);
});

void test("execution simulation is deterministic and stays stable across audio-focus-only updates", () => {
  const selection: LabSelection = {
    id: "selection-audio-sim",
    startMs: 1000,
    endMs: 3000,
    type: "clip",
    createdAt: 1,
  };
  const plan = buildExecutionPlan({
    suggestion: {
      id: "audio-inspect",
      label: "Ses detaylarini incele",
      actionType: "inspect-audio",
      confidence: 0.9,
    },
    activeSelection: selection,
    inspectionMode: "audio",
    sourceKind: "audio",
  });
  const baselineFocus = createTestAudioFocusSettings({
    gain: 1,
    playbackRate: 1,
  });
  const boostedFocus = createTestAudioFocusSettings({
    gain: 2.2,
    playbackRate: 0.4,
    preservePitch: false,
    filterType: "lowpass",
    filterFrequency: 320,
  });

  const simulationA = buildExecutionSimulation({
    executionPlan: plan,
    activeSelection: selection,
    inspectionMode: "audio",
    sourceKind: "audio",
    audioFocus: baselineFocus,
  });
  const simulationARepeat = buildExecutionSimulation({
    executionPlan: plan,
    activeSelection: selection,
    inspectionMode: "audio",
    sourceKind: "audio",
    audioFocus: baselineFocus,
  });
  const simulationB = buildExecutionSimulation({
    executionPlan: plan,
    activeSelection: selection,
    inspectionMode: "audio",
    sourceKind: "audio",
    audioFocus: boostedFocus,
  });

  assert.deepEqual(simulationA, simulationARepeat);
  assert.equal(simulationA.id, `simulation:${plan.id}`);
  assert.equal(simulationB.id, simulationA.id);
  assert.notDeepEqual(simulationB, simulationA);
  assert.equal(
    simulationB.warnings?.some(function (warning) {
      return warning.includes("High preview gain");
    }),
    true
  );

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

  const initialSimulation = getActiveExecutionSimulation(store.getState());
  store.dispatch({
    type: "workspace-audio-updated",
    patch: {
      gain: 2.2,
      playbackRate: 0.4,
      preservePitch: false,
      filterType: "lowpass",
      filterFrequency: 320,
    },
  });
  const updatedSimulation = getActiveExecutionSimulation(store.getState());

  assert.equal(updatedSimulation?.id, initialSimulation?.id);
  assert.notDeepEqual(updatedSimulation, initialSimulation);
  assert.equal(
    updatedSimulation?.warnings?.some(function (warning) {
      return warning.includes("High preview gain");
    }),
    true
  );
});

void test("execution readiness is deterministic across ready, needs-review, and blocked states", () => {
  const readySelection: LabSelection = {
    id: "selection-ready",
    startMs: 1000,
    endMs: 3200,
    type: "clip",
    createdAt: 1,
  };
  const readyPlan = buildExecutionPlan({
    suggestion: {
      id: "extract-clip",
      label: "Clip",
      actionType: "extract-clip",
      confidence: 0.78,
    },
    activeSelection: readySelection,
    inspectionMode: "none",
    sourceKind: "video",
  });
  const readySimulation = buildExecutionSimulation({
    executionPlan: readyPlan,
    activeSelection: readySelection,
    inspectionMode: "none",
    sourceKind: "video",
    audioFocus: createTestAudioFocusSettings(),
  });
  const readyReadiness = buildExecutionReadiness({
    executionPlan: readyPlan,
    executionSimulation: readySimulation,
    activeSelection: readySelection,
    inspectionMode: "none",
    sourceKind: "video",
    audioFocus: createTestAudioFocusSettings(),
  });
  const readyReadinessRepeat = buildExecutionReadiness({
    executionPlan: readyPlan,
    executionSimulation: readySimulation,
    activeSelection: readySelection,
    inspectionMode: "none",
    sourceKind: "video",
    audioFocus: createTestAudioFocusSettings(),
  });

  assert.deepEqual(readyReadiness, readyReadinessRepeat);
  assert.equal(readyReadiness.id, `readiness:${readyPlan.id}`);
  assert.equal(readyReadiness.status, "ready");

  const reviewSelection: LabSelection = {
    id: "selection-review",
    startMs: 100,
    endMs: 450,
    type: "clip",
    createdAt: 1,
  };
  const reviewPlan = buildExecutionPlan({
    suggestion: {
      id: "analyze-anomaly",
      label: "Analyze",
      actionType: "analyze-segment",
      confidence: 0.72,
    },
    activeSelection: reviewSelection,
    inspectionMode: "none",
    sourceKind: "video",
  });
  const reviewSimulation = buildExecutionSimulation({
    executionPlan: reviewPlan,
    activeSelection: reviewSelection,
    inspectionMode: "none",
    sourceKind: "video",
    audioFocus: createTestAudioFocusSettings(),
  });
  const reviewReadiness = buildExecutionReadiness({
    executionPlan: reviewPlan,
    executionSimulation: reviewSimulation,
    activeSelection: reviewSelection,
    inspectionMode: "none",
    sourceKind: "video",
    audioFocus: createTestAudioFocusSettings(),
  });
  assert.equal(reviewReadiness.status, "needs-review");
  assert.equal((reviewReadiness.notes?.length ?? 0) > 0, true);

  const blockedSelection: LabSelection = {
    id: "selection-blocked",
    startMs: 1200,
    endMs: 4800,
    type: "inspect",
    roi: {
      x: 0.3,
      y: 0.25,
      width: 0.05,
      height: 0.08,
    },
    createdAt: 1,
  };
  const blockedPlan = buildExecutionPlan({
    suggestion: {
      id: "inspect-region",
      label: "Region",
      actionType: "focus-region",
      confidence: 0.8,
    },
    activeSelection: blockedSelection,
    inspectionMode: "visual",
    sourceKind: "video",
  });
  const blockedSimulation = buildExecutionSimulation({
    executionPlan: blockedPlan,
    activeSelection: blockedSelection,
    inspectionMode: "visual",
    sourceKind: "video",
    audioFocus: createTestAudioFocusSettings(),
  });
  const blockedReadiness = buildExecutionReadiness({
    executionPlan: blockedPlan,
    executionSimulation: blockedSimulation,
    activeSelection: blockedSelection,
    inspectionMode: "visual",
    sourceKind: "video",
    audioFocus: createTestAudioFocusSettings(),
  });

  assert.equal(blockedReadiness.status, "blocked");
  assert.equal((blockedReadiness.blockers?.length ?? 0) > 0, true);
});

void test("execution readiness is derived only from active plan and simulation", () => {
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

  assert.equal(getActiveExecutionReadiness(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-queued",
    suggestionId: "audio-inspect",
  });
  assert.equal(getActiveExecutionReadiness(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });
  const activePlan = getActiveExecutionPlan(store.getState());
  const activeReadiness = getActiveExecutionReadiness(store.getState());
  assert.equal(activeReadiness?.planId, activePlan?.id);
  assert.equal(activeReadiness?.id, `readiness:${activePlan?.id ?? ""}`);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-cleared",
  });
  assert.equal(store.getState().ui.activeSuggestionPreviewId, null);
  assert.equal(getActiveExecutionReadiness(store.getState())?.planId, activePlan?.id);

  store.dispatch({
    type: "workspace-selection-suggestion-dismissed",
    suggestionId: "audio-inspect",
  });
  assert.equal(getActiveExecutionReadiness(store.getState()), null);
});

void test("execution readiness follows upstream invalidation instead of persisting independently", () => {
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
    startMs: 1200,
    endMs: 4800,
  });
  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "motion",
  });
  store.dispatch({
    type: "selection-roi-updated",
    roi: {
      x: 0.18,
      y: 0.22,
      width: 0.24,
      height: 0.28,
    },
  });
  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "inspect-region",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "inspect-region",
  });

  assert.equal(getActiveExecutionReadiness(store.getState())?.status === "ready", true);

  store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "motion",
  });
  assert.equal(store.getState().ui.activeExecutionIntentId, "inspect-region");
  assert.notEqual(getActiveExecutionReadiness(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "inspect-region",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "inspect-region",
  });
  assert.notEqual(getActiveExecutionReadiness(store.getState()), null);

  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1400,
    endMs: 4900,
  });
  assert.equal(getActiveExecutionReadiness(store.getState()), null);
});

void test("execution payload preview is derived only from active readiness", () => {
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

  assert.equal(getActiveExecutionPayloadPreview(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-queued",
    suggestionId: "audio-inspect",
  });
  assert.equal(getActiveExecutionPayloadPreview(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });

  const activePlan = getActiveExecutionPlan(store.getState());
  const activePayload = getActiveExecutionPayloadPreview(store.getState());
  assert.equal(activePayload?.id, `payload:${activePlan?.id ?? ""}`);
  assert.equal(activePayload.planId, activePlan?.id);
  assert.equal(activePayload.actionType, "inspect-audio");
  assert.equal(
    activePayload.readinessStatus,
    getActiveExecutionReadiness(store.getState())?.status
  );
  assert.equal(typeof activePayload.readinessPassesPreview, "boolean");
  assert.equal(activePayload.dryRunShape.previewExpectedOutputs[0], "frequencyClusters");
  assert.deepEqual(Object.keys(activePayload.dryRunShape.previewInput ), ["audioWindow"]);
  assert.match(activePayload.summary , /dry-run bridge/);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-cleared",
  });
  assert.equal(store.getState().ui.activeSuggestionPreviewId, null);
  assert.equal(getActiveExecutionPayloadPreview(store.getState())?.id, activePayload.id);

  store.dispatch({
    type: "workspace-selection-suggestion-dismissed",
    suggestionId: "audio-inspect",
  });
  assert.equal(getActiveExecutionPayloadPreview(store.getState()), null);
});

void test("execution payload bridge is deterministic and covers ROI plus fallback shapes", () => {
  const roiSelection: LabSelection = {
    id: "selection-payload-roi",
    startMs: 1200,
    endMs: 4800,
    type: "inspect",
    roi: {
      x: 0.18,
      y: 0.22,
      width: 0.24,
      height: 0.28,
    },
    createdAt: 1,
  };
  const focusPlan = buildExecutionPlan({
    suggestion: {
      id: "inspect-region",
      label: "Region",
      actionType: "focus-region",
      confidence: 0.82,
    },
    activeSelection: roiSelection,
    inspectionMode: "visual",
    sourceKind: "video",
  });
  const focusSimulation = buildExecutionSimulation({
    executionPlan: focusPlan,
    activeSelection: roiSelection,
    inspectionMode: "visual",
    sourceKind: "video",
    audioFocus: createTestAudioFocusSettings(),
  });
  const focusReadiness = buildExecutionReadiness({
    executionPlan: focusPlan,
    executionSimulation: focusSimulation,
    activeSelection: roiSelection,
    inspectionMode: "visual",
    sourceKind: "video",
    audioFocus: createTestAudioFocusSettings(),
  });
  const focusPayload = buildExecutionPayloadPreview({
    executionPlan: focusPlan,
    executionSimulation: focusSimulation,
    executionReadiness: focusReadiness,
    activeSelection: roiSelection,
    inspectionMode: "visual",
    sourceKind: "video",
  });
  const focusPayloadRepeat = buildExecutionPayloadPreview({
    executionPlan: focusPlan,
    executionSimulation: focusSimulation,
    executionReadiness: focusReadiness,
    activeSelection: roiSelection,
    inspectionMode: "visual",
    sourceKind: "video",
  });

  assert.deepEqual(focusPayload, focusPayloadRepeat);
  assert.equal(focusPayload.id, `payload:${focusPlan.id}`);
  assert.equal(focusPayload.readinessPassesPreview, focusReadiness.status === "ready");
  assert.deepEqual(
    focusPayload.dryRunShape.previewInput["roi"] ,
    {
      height: 0.28,
      width: 0.24,
      x: 0.18,
      y: 0.22,
    }
  );
  assert.equal(focusPayload.dryRunShape.previewParameters["detailPass"], "region-local");

  const fallbackPlan = buildExecutionPlan({
    suggestion: {
      id: "custom-unknown",
      label: "Unknown",
      actionType: "unknown-action" as unknown as LabActionSuggestion["actionType"],
      confidence: 0.41,
    },
    activeSelection: roiSelection,
    inspectionMode: "none",
    sourceKind: "video",
  });
  const fallbackSimulation = buildExecutionSimulation({
    executionPlan: fallbackPlan,
    activeSelection: roiSelection,
    inspectionMode: "none",
    sourceKind: "video",
    audioFocus: createTestAudioFocusSettings(),
  });
  const fallbackReadiness = buildExecutionReadiness({
    executionPlan: fallbackPlan,
    executionSimulation: fallbackSimulation,
    activeSelection: roiSelection,
    inspectionMode: "none",
    sourceKind: "video",
    audioFocus: createTestAudioFocusSettings(),
  });
  const fallbackPayload = buildExecutionPayloadPreview({
    executionPlan: fallbackPlan,
    executionSimulation: fallbackSimulation,
    executionReadiness: fallbackReadiness,
    activeSelection: roiSelection,
    inspectionMode: "none",
    sourceKind: "video",
  });

  assert.equal(fallbackPayload.dryRunShape.previewExpectedOutputs[0], "generalObservations");
  assert.equal(
    fallbackPayload.notes?.some(function (note) {
      return note.includes("not recognized");
    }),
    true
  );
});

