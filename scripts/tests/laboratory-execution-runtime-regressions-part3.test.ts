import {
  assert,
  buildExecutionAlternatives,
  buildExecutionAlternativesFromResolved,
  buildExecutionCandidateFromResolved,
  buildExecutionPayloadPreview,
  buildExecutionPlan,
  buildExecutionReadiness,
  buildExecutionReflection,
  buildExecutionSimulation,
  createLabStore,
  createTestAudioFocusSettings,
  getActiveExecutionAlternatives,
  getActiveExecutionCandidate,
  getActiveExecutionCommitment,
  getActiveExecutionPlan,
  resolveLabI18n,
  test
} from "./laboratory-runtime-truth.helpers.ts";

import type {
  LabActionSuggestion,
  LabAudioFocusSettings,
  LabExecutionCommitment,
  LabExecutionPayloadPreview,
  LabSelection
} from "./laboratory-runtime-truth.helpers.ts";

const DESCRIPTOR_EXECUTION_VERB_PATTERN =
  /\b(auto|commit|dispatch|execute|run|apply|switch|select|activate|choose|trigger|invoke)\b/i;

const ADVISORY_MARKERS = [
  "Descriptor view:",
  "Readiness view:",
  "Execution bridge:",
  "Coherence view:",
] as const;

function createExecutionAlternativesChain(params: {
  actionType: LabActionSuggestion["actionType"];
  audioFocus?: LabAudioFocusSettings;
  inspectionMode: "none" | "visual" | "audio" | "motion";
  selection: LabSelection;
  sourceKind: string;
  suggestionId: string;
}) {
  const plan = buildExecutionPlan({
    suggestion: {
      id: params.suggestionId,
      label: params.suggestionId,
      actionType: params.actionType,
      confidence: 0.86,
    },
    activeSelection: params.selection,
    inspectionMode: params.inspectionMode,
    sourceKind: params.sourceKind,
  });
  const simulation = buildExecutionSimulation({
    executionPlan: plan,
    activeSelection: params.selection,
    inspectionMode: params.inspectionMode,
    sourceKind: params.sourceKind,
    audioFocus: params.audioFocus ?? createTestAudioFocusSettings(),
  });
  const readiness = buildExecutionReadiness({
    executionPlan: plan,
    executionSimulation: simulation,
    activeSelection: params.selection,
    inspectionMode: params.inspectionMode,
    sourceKind: params.sourceKind,
    audioFocus: params.audioFocus ?? createTestAudioFocusSettings(),
  });
  const payload = buildExecutionPayloadPreview({
    executionPlan: plan,
    executionSimulation: simulation,
    executionReadiness: readiness,
    activeSelection: params.selection,
    inspectionMode: params.inspectionMode,
    sourceKind: params.sourceKind,
  });
  const reflection = buildExecutionReflection({
    executionPlan: plan,
    executionSimulation: simulation,
    executionReadiness: readiness,
    executionPayloadPreview: payload,
    activeSelection: params.selection,
    inspectionMode: params.inspectionMode,
    sourceKind: params.sourceKind,
  });
  const alternatives = buildExecutionAlternatives({
    executionPlan: plan,
    executionSimulation: simulation,
    executionReadiness: readiness,
    executionReflection: reflection,
    activeSelection: params.selection,
    inspectionMode: params.inspectionMode,
    sourceKind: params.sourceKind,
  });
  return {
    alternatives,
    payload,
    plan,
    readiness,
    reflection,
    selection: params.selection,
    simulation,
  };
}

function extractDescriptorAdvisoryText(summary: string) {
  return sliceAdvisoryText(summary, "Descriptor view:");
}

function extractReadinessSignalAdvisoryText(summary: string) {
  return sliceAdvisoryText(summary, "Readiness view:");
}

function extractExecutionBridgeAdvisoryText(summary: string) {
  return sliceAdvisoryText(summary, "Execution bridge:");
}

function extractDecisionCoherenceAdvisoryText(summary: string) {
  return sliceAdvisoryText(summary, "Coherence view:");
}

function countOccurrences(value: string, needle: string) {
  if (needle === "") {
    return 0;
  }
  return value.split(needle).length - 1;
}

function assertLocalizedAdvisoryOrder(summary: string, locale: "en" | "tr") {
  assertSummaryOrder(summary, getLocalizedAdvisoryMarkers(locale));
}

function countLocalizedAdvisories(summary: string, locale: "en" | "tr") {
  return getLocalizedAdvisoryMarkers(locale).reduce(function (total, marker) {
    return total + countOccurrences(summary, marker);
  }, 0);
}

function hasObjectKey(value: unknown, keyName: string): boolean {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(function (entry) {
      return hasObjectKey(entry, keyName);
    });
  }
  return Object.entries(value as Record<string, unknown>).some(function ([key, entry]) {
    return key === keyName || hasObjectKey(entry, keyName);
  });
}

function getLocalizedAdvisoryMarkers(locale: "en" | "tr") {
  return [
    `${resolveLabI18n("descriptor.view", locale)}:`,
    `${resolveLabI18n("readiness.view", locale)}:`,
    `${resolveLabI18n("bridge.view", locale)}:`,
    `${resolveLabI18n("coherence.view", locale)}:`,
  ];
}

function sliceAdvisoryText(summary: string, marker: (typeof ADVISORY_MARKERS)[number]) {
  const index = summary.indexOf(marker);
  if (index === -1) {
    return "";
  }
  const searchStart = index + marker.length;
  const stopIndex = ADVISORY_MARKERS.reduce<number | null>(function (current, stopMarker) {
    if (stopMarker === marker) {
      return current;
    }
    const markerIndex = summary.indexOf(` ${stopMarker}`, searchStart);
    if (markerIndex === -1) {
      return current;
    }
    return current === null ? markerIndex : Math.min(current, markerIndex);
  }, null);
  return stopIndex === null ? summary.slice(index) : summary.slice(index, stopIndex);
}

function assertSummaryOrder(summary: string, orderedParts: string[]) {
  let previousIndex = -1;
  for (const part of orderedParts) {
    const index = summary.indexOf(part);
    assert.notEqual(index, -1);
    assert.equal(index > previousIndex, true);
    previousIndex = index;
  }
}

void test("passive descriptor and bridge advisories are summary-only and avoid execution verbs", () => {
  const selection: LabSelection = {
    id: "selection-peb-summary-advisory",
    startMs: 1000,
    endMs: 3600,
    type: "inspect",
    createdAt: 1,
  };
  const chain = createExecutionAlternativesChain({
    actionType: "inspect-audio",
    inspectionMode: "audio",
    selection,
    sourceKind: "audio",
    suggestionId: "audio-inspect",
  });
  const candidate = buildExecutionCandidateFromResolved({
    executionPlan: chain.plan,
    executionSimulation: chain.simulation,
    executionReadiness: chain.readiness,
    executionPayloadPreview: chain.payload,
    executionReflection: chain.reflection,
    executionAlternatives: chain.alternatives,
    activeSelection: chain.selection,
    inspectionMode: "audio",
    sourceKind: "audio",
  });
  const alternatives = buildExecutionAlternatives({
    executionPlan: chain.plan,
    executionSimulation: chain.simulation,
    executionReadiness: chain.readiness,
    executionReflection: chain.reflection,
    activeSelection: chain.selection,
    inspectionMode: "audio",
    sourceKind: "audio",
  });
  const candidateAdvisory = extractDescriptorAdvisoryText(candidate?.summary ?? "");
  const alternativesAdvisory = extractDescriptorAdvisoryText(alternatives.summary);
  const candidateReadinessAdvisory = extractReadinessSignalAdvisoryText(candidate?.summary ?? "");
  const alternativesReadinessAdvisory = extractReadinessSignalAdvisoryText(alternatives.summary);
  const candidateBridgeAdvisory = extractExecutionBridgeAdvisoryText(candidate?.summary ?? "");
  const alternativesBridgeAdvisory = extractExecutionBridgeAdvisoryText(alternatives.summary);
  const candidateCoherenceAdvisory = extractDecisionCoherenceAdvisoryText(candidate?.summary ?? "");
  const alternativesCoherenceAdvisory = extractDecisionCoherenceAdvisoryText(alternatives.summary);

  assert.ok(candidate);
  assert.match(candidate.summary, /This path is structurally ready for execution\./);
  assert.match(alternatives.summary, /selected path appears stable/i);
  assert.equal(
    candidateAdvisory,
    "Descriptor view: aligns with audio-analysis (spectral-window shape)."
  );
  assert.equal(
    alternativesAdvisory,
    "Descriptor view: describes a media-segmentation pattern with temporal-window shape."
  );
  assert.equal(
    candidateReadinessAdvisory,
    "Readiness view: steady signal from low pressure, neutral pattern, unmeasured alignment, high alternative confidence, and neutral projection."
  );
  assert.equal(
    alternativesReadinessAdvisory,
    "Readiness view: steady signal from low pressure, neutral pattern, unmeasured alignment, high alternative confidence, and neutral projection."
  );
  assert.equal(
    candidateBridgeAdvisory,
    "Execution bridge: This path maps to librosa using spectral_features_analysis, with a spectral-window shaped input and time-series output."
  );
  assert.equal(
    alternativesBridgeAdvisory,
    "Execution bridge: This path maps to ffmpeg using temporal_window_scan, with a temporal-window shaped input and segment output."
  );
  assert.equal(
    candidateCoherenceAdvisory,
    "Coherence view: Signals are mixed, with trade-offs between stability and coverage."
  );
  assert.equal(
    alternativesCoherenceAdvisory,
    "Coherence view: Signals are mixed, with trade-offs between stability and coverage."
  );
  assert.equal(countOccurrences(candidate.summary , "Readiness view:"), 1);
  assert.equal(countOccurrences(alternatives.summary, "Readiness view:"), 1);
  assert.equal(countOccurrences(candidate.summary , "Execution bridge:"), 1);
  assert.equal(countOccurrences(alternatives.summary, "Execution bridge:"), 1);
  assert.equal(countOccurrences(candidate.summary , "Coherence view:"), 1);
  assert.equal(countOccurrences(alternatives.summary, "Coherence view:"), 1);
  assert.equal(
    (candidate.summary ).indexOf(candidateAdvisory) <
      (candidate.summary ).indexOf(candidateReadinessAdvisory),
    true
  );
  assert.equal(
    (candidate.summary ).indexOf(candidateReadinessAdvisory) <
      (candidate.summary ).indexOf(candidateBridgeAdvisory),
    true
  );
  assert.equal(
    (candidate.summary ).indexOf(candidateBridgeAdvisory) <
      (candidate.summary ).indexOf(candidateCoherenceAdvisory),
    true
  );
  assert.equal(
    alternatives.summary.indexOf(alternativesAdvisory) <
      alternatives.summary.indexOf(alternativesReadinessAdvisory),
    true
  );
  assert.equal(
    alternatives.summary.indexOf(alternativesReadinessAdvisory) <
      alternatives.summary.indexOf(alternativesBridgeAdvisory),
    true
  );
  assert.equal(
    alternatives.summary.indexOf(alternativesBridgeAdvisory) <
      alternatives.summary.indexOf(alternativesCoherenceAdvisory),
    true
  );

  const localizedCandidate = buildExecutionCandidateFromResolved({
    executionPlan: chain.plan,
    executionSimulation: chain.simulation,
    executionReadiness: chain.readiness,
    executionPayloadPreview: chain.payload,
    executionReflection: chain.reflection,
    executionAlternatives: chain.alternatives,
    activeSelection: chain.selection,
    inspectionMode: "audio",
    locale: "tr",
    sourceKind: "audio",
  });
  const localizedAlternatives = buildExecutionAlternatives({
    executionPlan: chain.plan,
    executionSimulation: chain.simulation,
    executionReadiness: chain.readiness,
    executionReflection: chain.reflection,
    activeSelection: chain.selection,
    inspectionMode: "audio",
    locale: "tr",
    sourceKind: "audio",
  });

  assert.ok(localizedCandidate);
  assert.notEqual(localizedCandidate.summary, candidate.summary);
  assert.notEqual(localizedAlternatives.summary, alternatives.summary);
  assert.equal(localizedCandidate.status, candidate.status);
  assert.equal(localizedCandidate.confidence, candidate.confidence);
  assert.notDeepEqual(localizedAlternatives.alternatives, alternatives.alternatives);
  assert.doesNotMatch(
    [
      localizedCandidate.summary,
      ...(localizedCandidate.notes ?? []),
      localizedAlternatives.summary,
      ...localizedAlternatives.alternatives.flatMap(function (alternative) {
        return [alternative.label, alternative.summary, alternative.tradeoff];
      }),
      localizedAlternatives.comparisonNote ?? "",
    ].join(" "),
    /This path may require|Readiness status is|Payload preview asks|Broader segment review|An alternative approach|The selected path still needs review/
  );
  assert.equal(countLocalizedAdvisories(candidate.summary, "en"), 4);
  assert.equal(countLocalizedAdvisories(localizedCandidate.summary, "tr"), 4);
  assert.equal(countLocalizedAdvisories(alternatives.summary, "en"), 4);
  assert.equal(countLocalizedAdvisories(localizedAlternatives.summary, "tr"), 4);
  assertLocalizedAdvisoryOrder(candidate.summary, "en");
  assertLocalizedAdvisoryOrder(localizedCandidate.summary, "tr");
  assertLocalizedAdvisoryOrder(alternatives.summary, "en");
  assertLocalizedAdvisoryOrder(localizedAlternatives.summary, "tr");
  assert.doesNotMatch(
    `${localizedCandidate.summary} ${localizedAlternatives.summary}`,
    /descriptor\.view|readiness\.view|bridge\.view|coherence\.(view|aligned|mixed|conflicted)/
  );
  assert.doesNotMatch(candidateAdvisory, DESCRIPTOR_EXECUTION_VERB_PATTERN);
  assert.doesNotMatch(alternativesAdvisory, DESCRIPTOR_EXECUTION_VERB_PATTERN);
  assert.doesNotMatch(candidateReadinessAdvisory, DESCRIPTOR_EXECUTION_VERB_PATTERN);
  assert.doesNotMatch(alternativesReadinessAdvisory, DESCRIPTOR_EXECUTION_VERB_PATTERN);
  assert.doesNotMatch(candidateBridgeAdvisory, DESCRIPTOR_EXECUTION_VERB_PATTERN);
  assert.doesNotMatch(alternativesBridgeAdvisory, DESCRIPTOR_EXECUTION_VERB_PATTERN);
  assert.doesNotMatch(candidateCoherenceAdvisory, DESCRIPTOR_EXECUTION_VERB_PATTERN);
  assert.doesNotMatch(alternativesCoherenceAdvisory, DESCRIPTOR_EXECUTION_VERB_PATTERN);
  assert.equal(hasObjectKey(candidate, "descriptor"), false);
  assert.equal(hasObjectKey(candidate, "readinessSignal"), false);
  assert.equal(hasObjectKey(candidate, "signal"), false);
  assert.equal(hasObjectKey(candidate, "adapter"), false);
  assert.equal(hasObjectKey(candidate, "operation"), false);
  assert.equal(hasObjectKey(candidate, "inputContract"), false);
  assert.equal(hasObjectKey(candidate, "outputContract"), false);
  assert.equal(hasObjectKey(candidate, "tool"), false);
  assert.equal(hasObjectKey(candidate, "intent"), false);
  assert.equal(hasObjectKey(candidate, "paramShape"), false);
  assert.equal(hasObjectKey(candidate, "level"), false);
  assert.equal(hasObjectKey(candidate, "reasons"), false);
  assert.equal(hasObjectKey(candidate, "coherence"), false);
  assert.equal(hasObjectKey(candidate, "dominantAxis"), false);
  assert.equal(hasObjectKey(candidate, "coherenceState"), false);
  assert.equal(hasObjectKey(candidate, "coherenceConfidence"), false);
  assert.equal(hasObjectKey(alternatives, "descriptor"), false);
  assert.equal(hasObjectKey(alternatives, "readinessSignal"), false);
  assert.equal(hasObjectKey(alternatives, "signal"), false);
  assert.equal(hasObjectKey(alternatives, "adapter"), false);
  assert.equal(hasObjectKey(alternatives, "operation"), false);
  assert.equal(hasObjectKey(alternatives, "inputContract"), false);
  assert.equal(hasObjectKey(alternatives, "outputContract"), false);
  assert.equal(hasObjectKey(alternatives, "tool"), false);
  assert.equal(hasObjectKey(alternatives, "intent"), false);
  assert.equal(hasObjectKey(alternatives, "paramShape"), false);
  assert.equal(hasObjectKey(alternatives, "level"), false);
  assert.equal(hasObjectKey(alternatives, "reasons"), false);
  assert.equal(hasObjectKey(alternatives, "coherence"), false);
  assert.equal(hasObjectKey(alternatives, "dominantAxis"), false);
  assert.equal(hasObjectKey(alternatives, "coherenceState"), false);
  assert.equal(hasObjectKey(alternatives, "coherenceConfidence"), false);
});

void test("execution alternatives re-weight summary tone without changing structure", () => {
  const selection: LabSelection = {
    id: "selection-alternatives-feedback",
    startMs: 1000,
    endMs: 3600,
    type: "inspect",
    createdAt: 1,
  };
  const chain = createExecutionAlternativesChain({
    actionType: "inspect-audio",
    inspectionMode: "audio",
    selection,
    sourceKind: "audio",
    suggestionId: "audio-inspect",
  });
  const stableFeedback = buildExecutionAlternatives({
    executionPlan: chain.plan,
    executionSimulation: chain.simulation,
    executionReadiness: chain.readiness,
    executionReflection: chain.reflection,
    executionResultInterpretation: {
      alignment: "matches-simulation",
      anomalyLevel: "moderate",
      coverageLevel: "high",
    },
    activeSelection: chain.selection,
    inspectionMode: "audio",
    sourceKind: "audio",
  });
  const divergentFeedback = buildExecutionAlternatives({
    executionPlan: chain.plan,
    executionSimulation: chain.simulation,
    executionReadiness: chain.readiness,
    executionReflection: chain.reflection,
    executionResultInterpretation: {
      alignment: "deviates",
      anomalyLevel: "high",
      coverageLevel: "high",
    },
    activeSelection: chain.selection,
    inspectionMode: "audio",
    sourceKind: "audio",
  });

  assert.deepEqual(stableFeedback.alternatives, chain.alternatives.alternatives);
  assert.deepEqual(divergentFeedback.alternatives, chain.alternatives.alternatives);
  assert.match(stableFeedback.summary, /current path stability/i);
  assert.match(stableFeedback.comparisonNote ?? "", /backup routes/i);
  assert.match(divergentFeedback.summary, /alternative paths may yield better outcomes/i);
  assert.match(divergentFeedback.comparisonNote ?? "", /improve coverage or reduce divergence/i);
});

void test("execution alternatives cover known action mappings and fallback", () => {
  const videoSelection: LabSelection = {
    id: "selection-alternatives-video",
    startMs: 2000,
    endMs: 5200,
    type: "inspect",
    roi: {
      x: 0.18,
      y: 0.18,
      width: 0.24,
      height: 0.28,
    },
    createdAt: 1,
  };
  const extractChain = createExecutionAlternativesChain({
    actionType: "extract-clip",
    inspectionMode: "visual",
    selection: videoSelection,
    sourceKind: "video",
    suggestionId: "extract-clip",
  });
  const motionChain = createExecutionAlternativesChain({
    actionType: "inspect-motion",
    inspectionMode: "motion",
    selection: videoSelection,
    sourceKind: "video",
    suggestionId: "inspect-motion",
  });
  const visualChain = createExecutionAlternativesChain({
    actionType: "enhance-visual",
    inspectionMode: "visual",
    selection: videoSelection,
    sourceKind: "video",
    suggestionId: "enhance-visual",
  });
  const stabilizeChain = createExecutionAlternativesChain({
    actionType: "stabilize-segment",
    inspectionMode: "motion",
    selection: videoSelection,
    sourceKind: "video",
    suggestionId: "stabilize-segment",
  });
  const fallbackChain = createExecutionAlternativesChain({
    actionType: "unknown-action" as unknown as LabActionSuggestion["actionType"],
    inspectionMode: "none",
    selection: videoSelection,
    sourceKind: "video",
    suggestionId: "unknown-action",
  });

  assert.equal(extractChain.alternatives.alternatives[0]?.actionType, "analyze-segment");
  assert.equal(
    extractChain.alternatives.alternatives.some(function (alternative) {
      return alternative.relativeAdvantage === "lower-risk";
    }),
    true
  );
  assert.equal(
    motionChain.alternatives.alternatives.some(function (alternative) {
      return alternative.actionType === "slow-playback-inspection";
    }),
    true
  );
  assert.equal(
    visualChain.alternatives.alternatives.some(function (alternative) {
      return alternative.actionType === "stabilize-segment";
    }),
    true
  );
  assert.equal(
    stabilizeChain.alternatives.alternatives.some(function (alternative) {
      return alternative.actionType === "inspect-motion";
    }),
    true
  );
  assert.deepEqual(
    fallbackChain.alternatives.alternatives.map(function (alternative) {
      return alternative.actionType;
    }),
    ["analyze-segment", "generic-narrowed-inspection"]
  );
});

void test("execution alternatives are derived only from the complete active reflection chain", () => {
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

  assert.equal(getActiveExecutionAlternatives(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-queued",
    suggestionId: "audio-inspect",
  });
  assert.equal(getActiveExecutionAlternatives(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });

  const activePlan = getActiveExecutionPlan(store.getState());
  const activeAlternatives = getActiveExecutionAlternatives(store.getState());
  assert.equal(activeAlternatives?.id, `alternatives:${activePlan?.id ?? ""}`);
  assert.equal(activeAlternatives.planId, activePlan?.id);
  assert.equal((activeAlternatives.alternatives.length ) > 0, true);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-cleared",
  });
  assert.equal(getActiveExecutionAlternatives(store.getState())?.id, activeAlternatives.id);

  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1500,
    endMs: 2800,
  });
  assert.equal(getActiveExecutionAlternatives(store.getState()), null);
});

void test("execution alternatives helper returns null for missing upstream objects", () => {
  const selection: LabSelection = {
    id: "selection-alternatives-missing",
    startMs: 1000,
    endMs: 3000,
    type: "clip",
    createdAt: 1,
  };
  const chain = createExecutionAlternativesChain({
    actionType: "inspect-audio",
    inspectionMode: "audio",
    selection,
    sourceKind: "audio",
    suggestionId: "audio-inspect",
  });

  assert.equal(
    buildExecutionAlternativesFromResolved({
      executionPlan: null,
      executionSimulation: chain.simulation,
      executionReadiness: chain.readiness,
      executionReflection: chain.reflection,
      activeSelection: selection,
      inspectionMode: "audio",
      sourceKind: "audio",
    }),
    null
  );
  assert.equal(
    buildExecutionAlternativesFromResolved({
      executionPlan: chain.plan,
      executionSimulation: null,
      executionReadiness: chain.readiness,
      executionReflection: chain.reflection,
      activeSelection: selection,
      inspectionMode: "audio",
      sourceKind: "audio",
    }),
    null
  );
  assert.equal(
    buildExecutionAlternativesFromResolved({
      executionPlan: chain.plan,
      executionSimulation: chain.simulation,
      executionReadiness: null,
      executionReflection: chain.reflection,
      activeSelection: selection,
      inspectionMode: "audio",
      sourceKind: "audio",
    }),
    null
  );
  assert.equal(
    buildExecutionAlternativesFromResolved({
      executionPlan: chain.plan,
      executionSimulation: chain.simulation,
      executionReadiness: chain.readiness,
      executionReflection: null,
      activeSelection: selection,
      inspectionMode: "audio",
      sourceKind: "audio",
    }),
    null
  );
  assert.equal(
    buildExecutionAlternativesFromResolved({
      executionPlan: chain.plan,
      executionSimulation: chain.simulation,
      executionReadiness: chain.readiness,
      executionReflection: chain.reflection,
      activeSelection: null,
      inspectionMode: "audio",
      sourceKind: "audio",
    }),
    null
  );
});

void test("execution candidate synthesizes structural viability without downgrading stable alternatives", () => {
  const proceedSelection: LabSelection = {
    id: "selection-candidate-proceed",
    startMs: 1000,
    endMs: 3600,
    type: "inspect",
    roi: {
      x: 0.2,
      y: 0.24,
      width: 0.22,
      height: 0.24,
    },
    createdAt: 1,
  };
  const proceedChain = createExecutionAlternativesChain({
    actionType: "analyze-segment",
    inspectionMode: "audio",
    selection: proceedSelection,
    sourceKind: "video",
    suggestionId: "analyze-segment",
  });
  const proceedCandidate = buildExecutionCandidateFromResolved({
    executionPlan: proceedChain.plan,
    executionSimulation: proceedChain.simulation,
    executionReadiness: proceedChain.readiness,
    executionPayloadPreview: proceedChain.payload,
    executionReflection: proceedChain.reflection,
    executionAlternatives: proceedChain.alternatives,
    activeSelection: proceedChain.selection,
    inspectionMode: "audio",
    sourceKind: "video",
  });
  const proceedRepeat = buildExecutionCandidateFromResolved({
    executionPlan: proceedChain.plan,
    executionSimulation: proceedChain.simulation,
    executionReadiness: proceedChain.readiness,
    executionPayloadPreview: proceedChain.payload,
    executionReflection: proceedChain.reflection,
    executionAlternatives: proceedChain.alternatives,
    activeSelection: proceedChain.selection,
    inspectionMode: "audio",
    sourceKind: "video",
  });

  assert.ok(proceedCandidate);
  assert.ok(proceedRepeat);
  assert.deepEqual(proceedCandidate, proceedRepeat);
  assert.equal(proceedCandidate.id, `candidate:${proceedChain.plan.id}`);
  assert.equal(proceedCandidate.status, "viable");
  assert.equal(proceedCandidate.structuralIntegrity, "complete");
  assert.equal(proceedCandidate.readinessStatus, "ready");
  assert.equal(proceedCandidate.reflectionDecision, "proceed");
  assert.equal(proceedCandidate.uncertainties, undefined);
  assert.match(proceedCandidate.summary, /^Proceed with caution: /);
  assert.match(proceedCandidate.summary, /structurally ready/i);
  assert.equal(proceedChain.alternatives.alternatives.length > 0, true);

  const reviewSelection: LabSelection = {
    id: "selection-candidate-review",
    startMs: 1000,
    endMs: 18000,
    type: "clip",
    roi: {
      x: 0.04,
      y: 0.04,
      width: 0.82,
      height: 0.82,
    },
    createdAt: 1,
  };
  const reviewChain = createExecutionAlternativesChain({
    actionType: "focus-region",
    inspectionMode: "visual",
    selection: reviewSelection,
    sourceKind: "video",
    suggestionId: "inspect-region",
  });
  const reviewCandidate = buildExecutionCandidateFromResolved({
    executionPlan: reviewChain.plan,
    executionSimulation: reviewChain.simulation,
    executionReadiness: reviewChain.readiness,
    executionPayloadPreview: reviewChain.payload,
    executionReflection: reviewChain.reflection,
    executionAlternatives: reviewChain.alternatives,
    activeSelection: reviewChain.selection,
    inspectionMode: "visual",
    sourceKind: "video",
  });

  assert.ok(reviewCandidate);
  assert.equal(reviewCandidate.status, "unstable");
  assert.equal(reviewCandidate.structuralIntegrity, "partial");
  assert.equal(reviewCandidate.readinessStatus, "needs-review");
  assert.equal(reviewCandidate.reflectionDecision, "review");
  assert.match(reviewCandidate.uncertainties?.join(" ") ?? "", /warning|tradeoffs|risk/i);

  const avoidSelection: LabSelection = {
    id: "selection-candidate-avoid",
    startMs: 1000,
    endMs: 2600,
    type: "clip",
    createdAt: 1,
  };
  const avoidChain = createExecutionAlternativesChain({
    actionType: "inspect-audio",
    audioFocus: createTestAudioFocusSettings({ gain: 2.6 }),
    inspectionMode: "audio",
    selection: avoidSelection,
    sourceKind: "audio",
    suggestionId: "audio-inspect",
  });
  const avoidCandidate = buildExecutionCandidateFromResolved({
    executionPlan: avoidChain.plan,
    executionSimulation: avoidChain.simulation,
    executionReadiness: avoidChain.readiness,
    executionPayloadPreview: avoidChain.payload,
    executionReflection: avoidChain.reflection,
    executionAlternatives: avoidChain.alternatives,
    activeSelection: avoidChain.selection,
    inspectionMode: "audio",
    sourceKind: "audio",
  });

  assert.ok(avoidCandidate);
  assert.equal(avoidCandidate.status, "not-viable");
  assert.equal(avoidCandidate.structuralIntegrity, "insufficient");
  assert.equal(avoidCandidate.readinessStatus, "blocked");
  assert.equal(avoidCandidate.reflectionDecision, "avoid");
});

void test("execution candidate adjusts confidence from interpreted result without changing status", () => {
  const selection: LabSelection = {
    id: "selection-candidate-feedback",
    startMs: 1000,
    endMs: 3600,
    type: "inspect",
    createdAt: 1,
  };
  const chain = createExecutionAlternativesChain({
    actionType: "inspect-audio",
    inspectionMode: "audio",
    selection,
    sourceKind: "audio",
    suggestionId: "audio-inspect",
  });
  const baseInput = {
    executionPlan: chain.plan,
    executionSimulation: chain.simulation,
    executionReadiness: chain.readiness,
    executionPayloadPreview: chain.payload,
    executionReflection: chain.reflection,
    executionAlternatives: chain.alternatives,
    activeSelection: chain.selection,
    inspectionMode: "audio" as const,
    sourceKind: "audio",
  };
  const baseCandidate = buildExecutionCandidateFromResolved(baseInput);
  const alignedCandidate = buildExecutionCandidateFromResolved({
    ...baseInput,
    executionResultInterpretation: {
      alignment: "matches-simulation" as const,
      anomalyLevel: "moderate" as const,
      coverageLevel: "high" as const,
    },
  });
  const partialCandidate = buildExecutionCandidateFromResolved({
    ...baseInput,
    executionResultInterpretation: {
      alignment: "partial" as const,
      anomalyLevel: "moderate" as const,
      coverageLevel: "medium" as const,
    },
  });
  const deviatingCandidate = buildExecutionCandidateFromResolved({
    ...baseInput,
    executionResultInterpretation: {
      alignment: "deviates" as const,
      anomalyLevel: "high" as const,
      coverageLevel: "high" as const,
    },
  });
  const clamp = function (value: number) {
    return Math.max(0.25, Math.min(0.98, Number(value.toFixed(2))));
  };

  assert.ok(baseCandidate);
  assert.ok(alignedCandidate);
  assert.ok(partialCandidate);
  assert.ok(deviatingCandidate);
  assert.equal(alignedCandidate.status, baseCandidate.status);
  assert.equal(partialCandidate.status, baseCandidate.status);
  assert.equal(deviatingCandidate.status, baseCandidate.status);
  assert.equal(alignedCandidate.confidence, clamp((baseCandidate.confidence ?? 0) + 0.04));
  assert.equal(partialCandidate.confidence, clamp((baseCandidate.confidence ?? 0) + 0.01));
  assert.equal(deviatingCandidate.confidence, 0.94);
  assert.equal((deviatingCandidate.confidence ?? 0) < (baseCandidate.confidence ?? 0), true);
});

void test("execution candidate validates upstream coherence and payload preview shape", () => {
  const selection: LabSelection = {
    id: "selection-candidate-payload",
    startMs: 1000,
    endMs: 3000,
    type: "clip",
    createdAt: 1,
  };
  const chain = createExecutionAlternativesChain({
    actionType: "inspect-audio",
    inspectionMode: "audio",
    selection,
    sourceKind: "audio",
    suggestionId: "audio-inspect",
  });
  const baseInput = {
    executionPlan: chain.plan,
    executionSimulation: chain.simulation,
    executionReadiness: chain.readiness,
    executionPayloadPreview: chain.payload,
    executionReflection: chain.reflection,
    executionAlternatives: chain.alternatives,
    activeSelection: selection,
    inspectionMode: "audio" as const,
    sourceKind: "audio",
  };

  assert.equal(
    buildExecutionCandidateFromResolved({
      ...baseInput,
      executionSimulation: {
        ...chain.simulation,
        planId: "plan:mismatch",
      },
    }),
    null
  );
  assert.equal(
    buildExecutionCandidateFromResolved({
      ...baseInput,
      executionReadiness: {
        ...chain.readiness,
        planId: "plan:mismatch",
      },
    }),
    null
  );
  assert.equal(
    buildExecutionCandidateFromResolved({
      ...baseInput,
      executionPayloadPreview: {
        ...chain.payload,
        planId: "plan:mismatch",
      },
    }),
    null
  );
  assert.equal(
    buildExecutionCandidateFromResolved({
      ...baseInput,
      executionReflection: {
        ...chain.reflection,
        planId: "plan:mismatch",
      },
    }),
    null
  );
  assert.equal(
    buildExecutionCandidateFromResolved({
      ...baseInput,
      executionAlternatives: {
        ...chain.alternatives,
        planId: "plan:mismatch",
      },
    }),
    null
  );

  const createPayloadVariant = (
    patch: Partial<LabExecutionPayloadPreview>
  ): LabExecutionPayloadPreview => ({
    ...chain.payload,
    ...patch,
    dryRunShape: {
      ...chain.payload.dryRunShape,
      ...(patch.dryRunShape ?? {}),
    },
  });
  const emptyInputCandidate = buildExecutionCandidateFromResolved({
    ...baseInput,
    executionPayloadPreview: createPayloadVariant({
      dryRunShape: {
        ...chain.payload.dryRunShape,
        previewInput: {},
      },
    }),
  });
  const emptyParametersCandidate = buildExecutionCandidateFromResolved({
    ...baseInput,
    executionPayloadPreview: createPayloadVariant({
      dryRunShape: {
        ...chain.payload.dryRunShape,
        previewParameters: {},
      },
    }),
  });
  const emptyOutputsCandidate = buildExecutionCandidateFromResolved({
    ...baseInput,
    executionPayloadPreview: createPayloadVariant({
      dryRunShape: {
        ...chain.payload.dryRunShape,
        previewExpectedOutputs: [],
      },
    }),
  });
  const readinessMismatchCandidate = buildExecutionCandidateFromResolved({
    ...baseInput,
    executionPayloadPreview: createPayloadVariant({
      readinessPassesPreview: false,
    }),
  });
  const actionMismatchCandidate = buildExecutionCandidateFromResolved({
    ...baseInput,
    executionPayloadPreview: createPayloadVariant({
      actionType: "focus-region",
    }),
  });

  assert.equal(emptyInputCandidate?.structuralIntegrity, "insufficient");
  assert.equal(emptyInputCandidate.status, "not-viable");
  assert.equal(emptyParametersCandidate?.structuralIntegrity, "insufficient");
  assert.equal(emptyOutputsCandidate?.structuralIntegrity, "insufficient");
  assert.equal(readinessMismatchCandidate?.structuralIntegrity, "partial");
  assert.equal(readinessMismatchCandidate.status, "unstable");
  assert.equal(actionMismatchCandidate?.structuralIntegrity, "insufficient");
  assert.equal(actionMismatchCandidate.status, "not-viable");
});

void test("execution candidate is derived only from the complete active alternatives chain", () => {
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

  assert.equal(getActiveExecutionCandidate(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-queued",
    suggestionId: "audio-inspect",
  });
  assert.equal(getActiveExecutionCandidate(store.getState()), null);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  store.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });

  const activePlan = getActiveExecutionPlan(store.getState());
  const activeCandidate = getActiveExecutionCandidate(store.getState());
  assert.equal(activeCandidate?.id, `candidate:${activePlan?.id ?? ""}`);
  assert.equal(activeCandidate.planId, activePlan?.id);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-cleared",
  });
  assert.equal(getActiveExecutionCandidate(store.getState())?.id, activeCandidate.id);

  store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1500,
    endMs: 2800,
  });
  assert.equal(getActiveExecutionCandidate(store.getState()), null);
});

void test("execution candidate helper returns null for missing upstream objects", () => {
  const selection: LabSelection = {
    id: "selection-candidate-missing",
    startMs: 1000,
    endMs: 3000,
    type: "clip",
    createdAt: 1,
  };
  const chain = createExecutionAlternativesChain({
    actionType: "inspect-audio",
    inspectionMode: "audio",
    selection,
    sourceKind: "audio",
    suggestionId: "audio-inspect",
  });
  const baseInput = {
    executionPlan: chain.plan,
    executionSimulation: chain.simulation,
    executionReadiness: chain.readiness,
    executionPayloadPreview: chain.payload,
    executionReflection: chain.reflection,
    executionAlternatives: chain.alternatives,
    activeSelection: selection,
    inspectionMode: "audio" as const,
    sourceKind: "audio",
  };

  assert.equal(buildExecutionCandidateFromResolved({ ...baseInput, executionPlan: null }), null);
  assert.equal(
    buildExecutionCandidateFromResolved({ ...baseInput, executionSimulation: null }),
    null
  );
  assert.equal(
    buildExecutionCandidateFromResolved({ ...baseInput, executionReadiness: null }),
    null
  );
  assert.equal(
    buildExecutionCandidateFromResolved({ ...baseInput, executionPayloadPreview: null }),
    null
  );
  assert.equal(
    buildExecutionCandidateFromResolved({ ...baseInput, executionReflection: null }),
    null
  );
  assert.equal(
    buildExecutionCandidateFromResolved({ ...baseInput, executionAlternatives: null }),
    null
  );
  assert.equal(buildExecutionCandidateFromResolved({ ...baseInput, activeSelection: null }), null);
});

function createCommittedAudioExecutionStore(
  params: {
    endMs?: number;
    roi?: LabSelection["roi"];
    startMs?: number;
  } = {}
) {
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
    startMs: params.startMs ?? 1000,
    endMs: params.endMs ?? 3000,
  });
  if (params.roi !== undefined) {
    store.dispatch({
      type: "selection-roi-updated",
      roi: params.roi,
    });
  }
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

  const candidate = getActiveExecutionCandidate(store.getState());
  if (candidate === null || candidate.status === "not-viable") {
    throw new Error("Expected a committable execution candidate");
  }

  const beforeCommit = Date.now();
  store.dispatch({
    type: "workspace-execution-commitment-set",
    planId: ` ${candidate.planId} `,
  });
  const afterCommit = Date.now();
  const commitment = store.getState().ui.activeExecutionCommitment;
  if (commitment === null) {
    throw new Error("Expected an active execution commitment");
  }

  return {
    afterCommit,
    beforeCommit,
    candidate,
    commitment,
    store,
  };
}

void test("execution commitment is explicit, candidate-gated, and revocable", () => {
  const { afterCommit, beforeCommit, candidate, commitment, store } =
    createCommittedAudioExecutionStore();

  assert.equal(commitment.id, `commitment:${candidate.planId}`);
  assert.equal(commitment.planId, candidate.planId);
  assert.equal(commitment.status, "committed");
  assert.equal(commitment.candidateStatus, candidate.status);
  assert.equal(commitment.confidence, candidate.confidence);
  assert.deepEqual(commitment.notes, candidate.notes);
  assert.deepEqual(commitment.uncertainties, candidate.uncertainties);
  assert.equal(typeof commitment.committedAt, "number");
  assert.equal((commitment.committedAt ?? 0) >= beforeCommit, true);
  assert.equal((commitment.committedAt ?? 0) <= afterCommit, true);
  assert.equal(getActiveExecutionCommitment(store.getState())?.id, commitment.id);

  store.dispatch({
    type: "workspace-selection-suggestion-preview-cleared",
  });
  assert.equal(getActiveExecutionCommitment(store.getState())?.id, commitment.id);

  store.dispatch({
    type: "workspace-execution-commitment-revoked",
  });
  assert.equal(store.getState().ui.activeExecutionCommitment, null);
  assert.equal(getActiveExecutionCommitment(store.getState()), null);
  assert.equal(store.getState().ui.activeExecutionIntentId, "audio-inspect");
});

void test("execution commitment rejects missing, mismatched, stale, and not-viable candidates", () => {
  const emptyStore = createLabStore();
  emptyStore.dispatch({
    type: "workspace-execution-commitment-set",
    planId: "plan:missing",
  });
  assert.equal(emptyStore.getState().ui.activeExecutionCommitment, null);

  const { candidate, commitment, store } = createCommittedAudioExecutionStore();
  store.dispatch({
    type: "workspace-execution-commitment-revoked",
  });
  store.dispatch({
    type: "workspace-execution-commitment-set",
    planId: "plan:mismatch",
  });
  assert.equal(store.getState().ui.activeExecutionCommitment, null);

  store.getState().ui.activeExecutionCommitment = {
    ...commitment,
    status: "revoked",
  } satisfies LabExecutionCommitment;
  assert.equal(getActiveExecutionCommitment(store.getState()), null);

  store.getState().ui.activeExecutionCommitment = {
    ...commitment,
    status: "committed",
    candidateStatus: candidate.status === "viable" ? "unstable" : "viable",
  };
  assert.equal(getActiveExecutionCommitment(store.getState()), null);

  const blockedStore = createLabStore();
  blockedStore.dispatch({
    type: "source-config-patched",
    patch: {
      kind: "audio",
      mode: "local",
      storedPath: "/tmp/source.wav",
    },
  });
  blockedStore.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1000,
    endMs: 2600,
  });
  blockedStore.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });
  blockedStore.dispatch({
    type: "workspace-audio-updated",
    patch: {
      gain: 2.6,
    },
  });
  blockedStore.dispatch({
    type: "workspace-selection-suggestion-preview-set",
    suggestionId: "audio-inspect",
  });
  blockedStore.dispatch({
    type: "workspace-selection-suggestion-accepted",
    suggestionId: "audio-inspect",
  });
  const blockedCandidate = getActiveExecutionCandidate(blockedStore.getState());
  assert.equal(blockedCandidate?.status, "not-viable");
  blockedStore.dispatch({
    type: "workspace-execution-commitment-set",
    planId: blockedCandidate.planId ,
  });
  assert.equal(blockedStore.getState().ui.activeExecutionCommitment, null);
  assert.equal(getActiveExecutionCommitment(blockedStore.getState()), null);
});

void test("execution commitment clears on upstream context changes but not preview clear", () => {
  const keepStore = createCommittedAudioExecutionStore();
  keepStore.store.dispatch({
    type: "workspace-selection-suggestion-preview-cleared",
  });
  assert.equal(
    getActiveExecutionCommitment(keepStore.store.getState())?.id,
    keepStore.commitment.id
  );

  const timelineStore = createCommittedAudioExecutionStore();
  timelineStore.store.dispatch({
    type: "workspace-timeline-updated",
    startMs: 1200,
    endMs: 3200,
  });
  assert.equal(timelineStore.store.getState().ui.activeExecutionCommitment, null);
  assert.equal(getActiveExecutionCommitment(timelineStore.store.getState()), null);

  const roiStore = createCommittedAudioExecutionStore();
  roiStore.store.dispatch({
    type: "selection-roi-updated",
    roi: {
      x: 0.2,
      y: 0.2,
      width: 0.24,
      height: 0.24,
    },
  });
  assert.equal(roiStore.store.getState().ui.activeExecutionCommitment, null);
  assert.equal(getActiveExecutionCommitment(roiStore.store.getState()), null);

  const inspectionStore = createCommittedAudioExecutionStore();
  inspectionStore.store.dispatch({
    type: "selection-inspection-mode-updated",
    mode: "audio",
  });
  assert.equal(
    inspectionStore.store.getState().ui.activeExecutionCommitment?.id,
    inspectionStore.commitment.id
  );
  assert.equal(
    getActiveExecutionCommitment(inspectionStore.store.getState())?.id,
    inspectionStore.commitment.id
  );

  const sourceStore = createCommittedAudioExecutionStore();
  sourceStore.store.dispatch({
    type: "source-config-patched",
    patch: {
      storedPath: "/tmp/next-source.wav",
    },
  });
  assert.equal(sourceStore.store.getState().ui.activeExecutionCommitment, null);
  assert.equal(getActiveExecutionCommitment(sourceStore.store.getState()), null);

  const intentStore = createCommittedAudioExecutionStore();
  intentStore.store.dispatch({
    type: "workspace-execution-intent-cleared",
  });
  assert.equal(intentStore.store.getState().ui.activeExecutionCommitment, null);
  assert.equal(getActiveExecutionCommitment(intentStore.store.getState()), null);
});

