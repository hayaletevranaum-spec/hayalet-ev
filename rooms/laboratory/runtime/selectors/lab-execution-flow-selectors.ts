import { asLabRecord, asNonEmptyString } from "../../domain/lab-types.js";
import type {
  LabActionSuggestion,
  LabActiveExecutionResult,
  LabCapabilityFlowKind,
  LabExecutionAlternatives,
  LabExecutionCandidate,
  LabExecutionCommitment,
  LabExecutionDispatchCandidate,
  LabExecutionGoalEvaluation,
  LabExecutionPayloadPreview,
  LabExecutionPlan,
  LabExecutionReadiness,
  LabExecutionReflection,
  LabExecutionSelectionSnapshot,
  LabExecutionSimulation,
  LabExecutionStaging,
  LabInspectionMode,
  LabInterpretationItem,
  LabSelection,
  LabStoreState,
  LabSuggestionPreview,
} from "../../domain/lab-types.js";
import { buildExecutionAlternativesFromResolved } from "../lab-execution-alternatives.js";
import { buildExecutionPayloadPreviewFromResolved } from "../lab-execution-payload-preview.js";
import { buildExecutionCandidateFromResolved } from "../lab-execution-candidate.js";
import { buildExecutionPlan } from "../lab-execution-planner.js";
import { buildExecutionReadiness } from "../lab-execution-readiness.js";
import { buildExecutionReflectionFromResolved } from "../lab-execution-reflection.js";
import { buildExecutionSimulation } from "../lab-execution-simulator.js";
import { buildExecutionStagingFromResolved } from "../lab-execution-staging.js";
import { buildInterpretationItems } from "../lab-interpretation-engine.js";
import {
  buildSelectionSuggestionPreview,
  getSelectionSuggestionsForContext,
} from "../lab-selection-suggestion-logic.js";
import { resolveEffectiveWorkspaceSelection } from "../lab-workspace-selection.js";
import {
  appendReflectionFeedback,
  buildExecutionDispatchId,
  buildExecutionResultInterpretation,
  getCachedExecutionGoalEvaluation,
} from "./lab-execution-result-selectors.js";
import { isAnalysisPreparationSuggestion } from "../store/lab-store-execution-state.js";
import type {
  ActiveExecutionRuntimeContext,
  LabExecutionResultInterpretation,
} from "./lab-execution-result-selectors.js";
import { getSourceKind, getSourceMetadata } from "./lab-source-selectors.js";
import { getEffectivePreviewAudioFocusSettings } from "./lab-workspace-media-selectors.js";
import type { LabI18nLocale } from "../lab-i18n.js";
import { inferLabAssetContentKind } from "../../shared/lab-asset-kind.js";

function getRuntimeLocale(state: LabStoreState): LabI18nLocale {
  return state.context["locale"] === "tr" ? "tr" : "en";
}

function getActiveWorkspaceAsset(state: LabStoreState) {
  const assetId = asNonEmptyString(state.ui.activeWorkspaceAssetId);
  if (assetId === null) {
    return null;
  }
  return (
    state.assets.find(function (asset) {
      return asset.id === assetId;
    }) || null
  );
}

function getAssetSelectionSourceKind(
  asset: NonNullable<ReturnType<typeof getActiveWorkspaceAsset>>
) {
  const contentKind = inferLabAssetContentKind(asset);
  return contentKind === "unsupported" ? "asset" : contentKind;
}

function getAssetDurationMs(
  asset: NonNullable<ReturnType<typeof getActiveWorkspaceAsset>>
): number {
  const metadata = asLabRecord(asset.metadata);
  const durationMs = metadata["durationMs"];
  if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
    return Math.max(0, Math.round(durationMs));
  }
  const durationSeconds = metadata["durationSeconds"];
  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds)) {
    return Math.max(0, Math.round(durationSeconds * 1000));
  }
  return 0;
}

export function getSelectionContextSourceKind(state: LabStoreState): string {
  const activeAsset = getActiveWorkspaceAsset(state);
  return activeAsset === null ? getSourceKind(state) : getAssetSelectionSourceKind(activeAsset);
}

export function getSelectionContextDurationMs(state: LabStoreState): number {
  const activeAsset = getActiveWorkspaceAsset(state);
  return activeAsset === null ? getSourceDurationMs(state) : getAssetDurationMs(activeAsset);
}

function createExecutionSelectionSnapshot(
  state: LabStoreState,
  selection: LabSelection
): LabExecutionSelectionSnapshot {
  const roi = selection.roi;
  return {
    endMs: selection.endMs,
    inspectionMode: getInspectionMode(state),
    sourceKind: getSelectionContextSourceKind(state) || "unknown",
    startMs: selection.startMs,
    type: selection.type,
    ...(roi
      ? {
          roi: {
            height: Number(roi.height.toFixed(4)),
            width: Number(roi.width.toFixed(4)),
            x: Number(roi.x.toFixed(4)),
            y: Number(roi.y.toFixed(4)),
          },
        }
      : {}),
  };
}

export function getActiveSelection(state: LabStoreState): LabSelection | null {
  return state.ui.workspace.activeSelection;
}

function getSourceDurationMs(state: LabStoreState): number {
  const metadata = getSourceMetadata(state);
  const durationMs = metadata["durationMs"];
  if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
    return Math.max(0, Math.round(durationMs));
  }
  const durationSeconds = metadata["durationSeconds"];
  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds)) {
    return Math.max(0, Math.round(durationSeconds * 1000));
  }
  return 0;
}

export function getEffectiveActiveSelection(state: LabStoreState): LabSelection | null {
  return resolveEffectiveWorkspaceSelection(getActiveSelection(state), {
    durationMs: getSelectionContextDurationMs(state),
    sourceKind: getSelectionContextSourceKind(state),
  });
}

export function isSelectionValid(state: LabStoreState): boolean {
  const selection = getActiveSelection(state);
  return selection !== null && selection.endMs > selection.startMs;
}

export function getSelectionDuration(state: LabStoreState): number {
  const selection = getActiveSelection(state);
  if (selection === null || selection.endMs <= selection.startMs) {
    return 0;
  }
  return selection.endMs - selection.startMs;
}

export function getInspectionMode(state: LabStoreState): LabInspectionMode {
  return state.ui.inspectionMode;
}

export function getRoiFocusActive(state: LabStoreState): boolean {
  return state.ui.roiFocusActive === true;
}

export function getActiveInspectionSnapshot(state: LabStoreState) {
  return state.ui.activeInspectionSnapshot;
}

export function getActiveSuggestionPreviewId(state: LabStoreState): string | null {
  return state.ui.activeSuggestionPreviewId;
}

export function getActiveExecutionIntentId(state: LabStoreState): string | null {
  return state.ui.activeExecutionIntentId;
}

export function getSelectionSuggestions(state: LabStoreState): LabActionSuggestion[] {
  return getSelectionSuggestionsForContext(getEffectiveActiveSelection(state), {
    inspectionMode: getInspectionMode(state),
    sourceKind: getSelectionContextSourceKind(state),
  });
}

function getWorkspaceSurfaceSuggestionFlowKind(
  suggestion: LabActionSuggestion
): LabCapabilityFlowKind {
  if (suggestion.flowKind !== undefined) {
    return suggestion.flowKind;
  }
  switch (suggestion.actionType) {
    case "extract-clip":
    case "enhance-visual":
    case "enhance-frame":
    case "crop-region":
    case "clean-audio":
    case "separate-stems":
    case "stabilize-segment":
      return "operation-result";
    default:
      return "analysis-report";
  }
}

export function getWorkspaceSurfaceSuggestions(state: LabStoreState): LabActionSuggestion[] {
  return getSelectionSuggestionsForContext(getEffectiveActiveSelection(state), {
    expandedTaxonomy: true,
    inspectionMode: getInspectionMode(state),
    sourceKind: getSelectionContextSourceKind(state),
  })
    .map(function (suggestion) {
      return {
        ...suggestion,
        flowKind: getWorkspaceSurfaceSuggestionFlowKind(suggestion),
      };
    })
    .filter(isAnalysisPreparationSuggestion);
}

function getExecutionSelectionSuggestions(state: LabStoreState): LabActionSuggestion[] {
  const activeSelection = getEffectiveActiveSelection(state);
  return getSelectionSuggestionsForContext(activeSelection, {
    expandedTaxonomy: true,
    inspectionMode: getInspectionMode(state),
    sourceKind: getSelectionContextSourceKind(state),
  });
}

export function getInterpretationItems(state: LabStoreState): LabInterpretationItem[] {
  return buildInterpretationItems({
    activeSelection: getEffectiveActiveSelection(state),
    audioFocus: getEffectivePreviewAudioFocusSettings(state),
    inspectionMode: getInspectionMode(state),
    sourceKind: getSelectionContextSourceKind(state),
  });
}

export function buildSuggestionPreview(
  suggestion: LabActionSuggestion,
  selection: LabSelection
): LabSuggestionPreview {
  return buildSelectionSuggestionPreview(suggestion, selection);
}

export function getActiveSuggestionPreview(state: LabStoreState): LabSuggestionPreview | null {
  const previewId = getActiveSuggestionPreviewId(state);
  const activeSelection = getEffectiveActiveSelection(state);
  if (
    previewId === null ||
    activeSelection === null ||
    activeSelection.endMs <= activeSelection.startMs
  ) {
    return null;
  }
  const suggestion =
    getSelectionSuggestions(state).find(function (entry) {
      return entry.id === previewId;
    }) ||
    getExecutionSelectionSuggestions(state).find(function (entry) {
      return entry.id === previewId;
    });
  if (!suggestion) {
    return null;
  }
  return buildSuggestionPreview(suggestion, activeSelection);
}

export function getActiveExecutionIntent(state: LabStoreState): LabActionSuggestion | null {
  const activeExecutionIntentId = getActiveExecutionIntentId(state);
  if (activeExecutionIntentId === null) {
    return null;
  }
  return (
    getSelectionSuggestions(state).find(function (entry) {
      return entry.id === activeExecutionIntentId;
    }) ||
    getExecutionSelectionSuggestions(state).find(function (entry) {
      return entry.id === activeExecutionIntentId;
    }) ||
    null
  );
}

export function getActiveExecutionPlan(state: LabStoreState): LabExecutionPlan | null {
  const activeExecutionIntent = getActiveExecutionIntent(state);
  const activeSelection = getEffectiveActiveSelection(state);
  if (
    activeExecutionIntent === null ||
    activeSelection === null ||
    activeSelection.endMs <= activeSelection.startMs
  ) {
    return null;
  }
  return buildExecutionPlan({
    suggestion: activeExecutionIntent,
    activeSelection,
    inspectionMode: getInspectionMode(state),
    sourceKind: getSelectionContextSourceKind(state),
  });
}

export function getActiveExecutionSimulation(state: LabStoreState): LabExecutionSimulation | null {
  const activeExecutionPlan = getActiveExecutionPlan(state);
  const activeSelection = getEffectiveActiveSelection(state);
  if (
    activeExecutionPlan === null ||
    activeSelection === null ||
    activeSelection.endMs <= activeSelection.startMs
  ) {
    return null;
  }
  return buildExecutionSimulation({
    executionPlan: activeExecutionPlan,
    activeSelection,
    inspectionMode: getInspectionMode(state),
    sourceKind: getSelectionContextSourceKind(state),
    audioFocus: getEffectivePreviewAudioFocusSettings(state),
  });
}

export function getActiveExecutionReadiness(state: LabStoreState): LabExecutionReadiness | null {
  const activeExecutionPlan = getActiveExecutionPlan(state);
  const activeExecutionSimulation = getActiveExecutionSimulation(state);
  const activeSelection = getEffectiveActiveSelection(state);
  if (
    activeExecutionPlan === null ||
    activeExecutionSimulation === null ||
    activeSelection === null ||
    activeSelection.endMs <= activeSelection.startMs
  ) {
    return null;
  }
  return buildExecutionReadiness({
    executionPlan: activeExecutionPlan,
    executionSimulation: activeExecutionSimulation,
    activeSelection,
    inspectionMode: getInspectionMode(state),
    sourceKind: getSelectionContextSourceKind(state),
    audioFocus: getEffectivePreviewAudioFocusSettings(state),
  });
}

export function getActiveExecutionPayloadPreview(
  state: LabStoreState
): LabExecutionPayloadPreview | null {
  return buildExecutionPayloadPreviewFromResolved({
    executionPlan: getActiveExecutionPlan(state),
    executionSimulation: getActiveExecutionSimulation(state),
    executionReadiness: getActiveExecutionReadiness(state),
    activeSelection: getEffectiveActiveSelection(state),
    inspectionMode: getInspectionMode(state),
    sourceKind: getSelectionContextSourceKind(state),
  });
}

function getBaseActiveExecutionReflection(state: LabStoreState): LabExecutionReflection | null {
  return buildExecutionReflectionFromResolved({
    executionPlan: getActiveExecutionPlan(state),
    executionSimulation: getActiveExecutionSimulation(state),
    executionReadiness: getActiveExecutionReadiness(state),
    executionPayloadPreview: getActiveExecutionPayloadPreview(state),
    activeSelection: getEffectiveActiveSelection(state),
    inspectionMode: getInspectionMode(state),
    locale: getRuntimeLocale(state),
    sourceKind: getSelectionContextSourceKind(state),
  });
}

export function getActiveExecutionReflection(state: LabStoreState): LabExecutionReflection | null {
  const reflection = getBaseActiveExecutionReflection(state);
  if (reflection === null) {
    return null;
  }
  return appendReflectionFeedback(
    reflection,
    getActiveExecutionResultInterpretation(state),
    getActiveExecutionGoalEvaluation(state)
  );
}

function getBaseActiveExecutionAlternatives(state: LabStoreState): LabExecutionAlternatives | null {
  return buildExecutionAlternativesFromResolved({
    executionPlan: getActiveExecutionPlan(state),
    executionSimulation: getActiveExecutionSimulation(state),
    executionReadiness: getActiveExecutionReadiness(state),
    executionReflection: getBaseActiveExecutionReflection(state),
    activeSelection: getEffectiveActiveSelection(state),
    inspectionMode: getInspectionMode(state),
    locale: getRuntimeLocale(state),
    sourceKind: getSelectionContextSourceKind(state),
  });
}

export function getActiveExecutionAlternatives(
  state: LabStoreState
): LabExecutionAlternatives | null {
  return buildExecutionAlternativesFromResolved({
    executionPlan: getActiveExecutionPlan(state),
    executionSimulation: getActiveExecutionSimulation(state),
    executionReadiness: getActiveExecutionReadiness(state),
    executionReflection: getActiveExecutionReflection(state),
    executionResult: getActiveExecutionResult(state),
    executionGoalEvaluation: getActiveExecutionGoalEvaluation(state),
    executionResultInterpretation: getActiveExecutionResultInterpretation(state),
    activeSelection: getEffectiveActiveSelection(state),
    inspectionMode: getInspectionMode(state),
    locale: getRuntimeLocale(state),
    sourceKind: getSelectionContextSourceKind(state),
  });
}

function getBaseActiveExecutionCandidate(state: LabStoreState): LabExecutionCandidate | null {
  return buildExecutionCandidateFromResolved({
    executionPlan: getActiveExecutionPlan(state),
    executionSimulation: getActiveExecutionSimulation(state),
    executionReadiness: getActiveExecutionReadiness(state),
    executionPayloadPreview: getActiveExecutionPayloadPreview(state),
    executionReflection: getBaseActiveExecutionReflection(state),
    executionAlternatives: getBaseActiveExecutionAlternatives(state),
    activeSelection: getEffectiveActiveSelection(state),
    inspectionMode: getInspectionMode(state),
    locale: getRuntimeLocale(state),
    sourceKind: getSelectionContextSourceKind(state),
  });
}

export function getActiveExecutionCandidate(state: LabStoreState): LabExecutionCandidate | null {
  return buildExecutionCandidateFromResolved({
    executionPlan: getActiveExecutionPlan(state),
    executionSimulation: getActiveExecutionSimulation(state),
    executionReadiness: getActiveExecutionReadiness(state),
    executionPayloadPreview: getActiveExecutionPayloadPreview(state),
    executionReflection: getActiveExecutionReflection(state),
    executionAlternatives: getActiveExecutionAlternatives(state),
    executionResult: getActiveExecutionResult(state),
    executionGoalEvaluation: getActiveExecutionGoalEvaluation(state),
    executionResultInterpretation: getActiveExecutionResultInterpretation(state),
    activeSelection: getEffectiveActiveSelection(state),
    inspectionMode: getInspectionMode(state),
    locale: getRuntimeLocale(state),
    sourceKind: getSelectionContextSourceKind(state),
  });
}

function getBaseActiveExecutionCommitment(state: LabStoreState): LabExecutionCommitment | null {
  const commitment = state.ui.activeExecutionCommitment;
  if (commitment === null || commitment.status !== "committed") {
    return null;
  }
  const candidate = getBaseActiveExecutionCandidate(state);
  if (
    candidate === null ||
    candidate.planId !== commitment.planId ||
    candidate.status !== commitment.candidateStatus ||
    candidate.status === "not-viable"
  ) {
    return null;
  }
  return commitment;
}

export function getActiveExecutionCommitment(state: LabStoreState): LabExecutionCommitment | null {
  const commitment = state.ui.activeExecutionCommitment;
  if (commitment === null || commitment.status !== "committed") {
    return null;
  }
  const candidate = getActiveExecutionCandidate(state);
  if (
    candidate === null ||
    candidate.planId !== commitment.planId ||
    candidate.status !== commitment.candidateStatus ||
    candidate.status === "not-viable"
  ) {
    return null;
  }
  return commitment;
}

function getBaseActiveExecutionStaging(state: LabStoreState): LabExecutionStaging | null {
  return buildExecutionStagingFromResolved({
    executionPlan: getActiveExecutionPlan(state),
    executionSimulation: getActiveExecutionSimulation(state),
    executionReadiness: getActiveExecutionReadiness(state),
    executionPayloadPreview: getActiveExecutionPayloadPreview(state),
    executionReflection: getBaseActiveExecutionReflection(state),
    executionAlternatives: getBaseActiveExecutionAlternatives(state),
    executionCandidate: getBaseActiveExecutionCandidate(state),
    executionCommitment: getBaseActiveExecutionCommitment(state),
    activeSelection: getEffectiveActiveSelection(state),
  });
}

export function getActiveExecutionStaging(state: LabStoreState): LabExecutionStaging | null {
  return buildExecutionStagingFromResolved({
    executionPlan: getActiveExecutionPlan(state),
    executionSimulation: getActiveExecutionSimulation(state),
    executionReadiness: getActiveExecutionReadiness(state),
    executionPayloadPreview: getActiveExecutionPayloadPreview(state),
    executionReflection: getActiveExecutionReflection(state),
    executionAlternatives: getActiveExecutionAlternatives(state),
    executionCandidate: getActiveExecutionCandidate(state),
    executionCommitment: getActiveExecutionCommitment(state),
    activeSelection: getEffectiveActiveSelection(state),
  });
}

function getBaseExecutionDispatchCandidate(
  state: LabStoreState
): LabExecutionDispatchCandidate | null {
  const commitment = getBaseActiveExecutionCommitment(state);
  const staging = getBaseActiveExecutionStaging(state);
  const payloadPreview = getActiveExecutionPayloadPreview(state);
  const activeSelection = getEffectiveActiveSelection(state);
  if (
    commitment === null ||
    staging === null ||
    payloadPreview === null ||
    activeSelection === null ||
    activeSelection.endMs <= activeSelection.startMs ||
    staging.status !== "staged" ||
    staging.planId !== commitment.planId ||
    payloadPreview.planId !== commitment.planId
  ) {
    return null;
  }
  const selectionSnapshot = createExecutionSelectionSnapshot(state, activeSelection);
  return {
    dispatchId: buildExecutionDispatchId({
      payloadPreview,
      planId: commitment.planId,
      selectionSnapshot,
      staging,
    }),
    actionType: payloadPreview.actionType,
    planId: commitment.planId,
    payloadPreview,
    selectionSnapshot,
    staging,
  };
}

export function getExecutionDispatchCandidate(
  state: LabStoreState
): LabExecutionDispatchCandidate | null {
  const commitment = getActiveExecutionCommitment(state);
  const staging = getActiveExecutionStaging(state);
  const payloadPreview = getActiveExecutionPayloadPreview(state);
  const activeSelection = getEffectiveActiveSelection(state);
  if (
    commitment === null ||
    staging === null ||
    payloadPreview === null ||
    activeSelection === null ||
    activeSelection.endMs <= activeSelection.startMs ||
    staging.status !== "staged" ||
    staging.planId !== commitment.planId ||
    payloadPreview.planId !== commitment.planId
  ) {
    return null;
  }
  const selectionSnapshot = createExecutionSelectionSnapshot(state, activeSelection);
  return {
    dispatchId: buildExecutionDispatchId({
      payloadPreview,
      planId: commitment.planId,
      selectionSnapshot,
      staging,
    }),
    actionType: payloadPreview.actionType,
    planId: commitment.planId,
    payloadPreview,
    selectionSnapshot,
    staging,
  };
}

function getActiveExecutionRuntimeContext(
  state: LabStoreState
): ActiveExecutionRuntimeContext | null {
  const executionRuntime = state.ui.executionRuntime;
  if (
    executionRuntime.status !== "completed" ||
    executionRuntime.result === undefined ||
    executionRuntime.dispatchId === undefined
  ) {
    return null;
  }
  const dispatchCandidate = getBaseExecutionDispatchCandidate(state);
  if (
    dispatchCandidate === null ||
    dispatchCandidate.dispatchId !== executionRuntime.dispatchId ||
    dispatchCandidate.planId !== executionRuntime.activePlanId
  ) {
    return null;
  }
  return {
    dispatchCandidate,
    result: executionRuntime.result,
  };
}

export function getActiveExecutionResult(state: LabStoreState): LabActiveExecutionResult | null {
  const context = getActiveExecutionRuntimeContext(state);
  if (context === null) {
    return null;
  }
  return {
    ...context.result,
    selectionSnapshot: context.dispatchCandidate.selectionSnapshot,
  };
}

export function getActiveExecutionResultInterpretation(
  state: LabStoreState
): LabExecutionResultInterpretation | null {
  const context = getActiveExecutionRuntimeContext(state);
  if (context === null) {
    return null;
  }
  return buildExecutionResultInterpretation({
    ...context.result,
    actionType: context.dispatchCandidate.actionType,
    selectionSnapshot: context.dispatchCandidate.selectionSnapshot,
  });
}

export function getActiveExecutionGoalEvaluation(
  state: LabStoreState
): LabExecutionGoalEvaluation | null {
  const context = getActiveExecutionRuntimeContext(state);
  if (context === null) {
    return null;
  }
  return getCachedExecutionGoalEvaluation(context);
}

export function getExecutionJourneyStep(state: LabStoreState): number {
  if (getEffectiveActiveSelection(state) !== null) return 0;
  return -1;
}
