import { asLabRecord, asNonEmptyString } from "../../domain/lab-types.js";
import type {
  LabActionSuggestion,
  CapabilityFamilyId,
  LabExecutionCandidate,
  LabExecutionCommitment,
  LabSelection,
  LabStoreState,
} from "../../domain/lab-types.js";
import { getSelectionSuggestionsForContext } from "../lab-selection-suggestion-logic.js";
import { resolveEffectiveWorkspaceSelection } from "../lab-workspace-selection.js";
import { createIdleExecutionRuntime } from "./lab-store-defaults.js";

export function clearSuggestionPreview(state: LabStoreState) {
  state.ui.activeSuggestionPreviewId = null;
}

export function clearExecutionRuntime(state: LabStoreState) {
  state.ui.executionRuntime = createIdleExecutionRuntime();
}

export function clearExecutionCommitment(state: LabStoreState) {
  state.ui.activeExecutionCommitment = null;
  clearExecutionRuntime(state);
}

export function clearExecutionIntent(state: LabStoreState) {
  state.ui.activeExecutionIntentId = null;
  clearExecutionCommitment(state);
}

export function clampExecutionProgress(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

export function isMatchingExecutionRuntime(
  state: LabStoreState,
  planId: string,
  dispatchId: string
) {
  return (
    state.ui.executionRuntime.activePlanId === planId &&
    state.ui.executionRuntime.dispatchId === dispatchId
  );
}

export function normalizeExecutionPlanId(planId: string) {
  return typeof planId === "string" && planId.trim() !== "" ? planId.trim() : null;
}

function buildExecutionCommitmentSummary(candidate: LabExecutionCandidate) {
  if (candidate.status === "viable") {
    return "This path has been consciously chosen as the current passive commitment.";
  }
  if (candidate.status === "unstable") {
    return "This path has been chosen with review notes still attached.";
  }
  return "This path is not available for commitment.";
}

export function createExecutionCommitmentFromCandidate(
  candidate: LabExecutionCandidate
): LabExecutionCommitment {
  return {
    id: `commitment:${candidate.planId}`,
    planId: candidate.planId,
    status: "committed",
    candidateStatus: candidate.status,
    summary: buildExecutionCommitmentSummary(candidate),
    committedAt: Date.now(),
    ...(Array.isArray(candidate.notes) && candidate.notes.length > 0
      ? { notes: candidate.notes.slice() }
      : {}),
    ...(Array.isArray(candidate.uncertainties) && candidate.uncertainties.length > 0
      ? { uncertainties: candidate.uncertainties.slice() }
      : {}),
    ...(typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
      ? { confidence: candidate.confidence }
      : {}),
  };
}

export function normalizeSelectionSuggestionId(suggestionId: string) {
  return typeof suggestionId === "string" && suggestionId.trim() !== ""
    ? suggestionId.trim()
    : null;
}

export function getWorkspaceSelectionSuggestionSourceKind(state: LabStoreState) {
  return asNonEmptyString(asLabRecord(state.source)["kind"]) || "video";
}

function getWorkspaceSelectionSuggestionDurationMs(state: LabStoreState) {
  const source = asLabRecord(state.source);
  const metadata = asLabRecord(source["metadata"]);
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

function getWorkspaceSelectionForSuggestion(state: LabStoreState): LabSelection | null {
  return resolveEffectiveWorkspaceSelection(state.ui.workspace.activeSelection, {
    durationMs: getWorkspaceSelectionSuggestionDurationMs(state),
    sourceKind: getWorkspaceSelectionSuggestionSourceKind(state),
  });
}

export function canStoreSelectionSuggestionPreview(state: LabStoreState, suggestionId: string) {
  const normalizedSuggestionId = normalizeSelectionSuggestionId(suggestionId);
  if (normalizedSuggestionId === null) {
    return false;
  }
  const activeSelection = getWorkspaceSelectionForSuggestion(state);
  if (activeSelection === null || activeSelection.endMs <= activeSelection.startMs) {
    return false;
  }

  return getAnalysisPreparationSuggestionsForState(state).some(
    (suggestion) => suggestion.id === normalizedSuggestionId
  );
}

function canResolveSelectionExecutionIntent(state: LabStoreState, suggestionId: string) {
  const normalizedSuggestionId = normalizeSelectionSuggestionId(suggestionId);
  if (normalizedSuggestionId === null) {
    return false;
  }
  return canStoreSelectionSuggestionPreview(state, normalizedSuggestionId);
}

export function canAcceptSelectionExecutionIntent(state: LabStoreState, suggestionId: string) {
  const normalizedSuggestionId = normalizeSelectionSuggestionId(suggestionId);
  if (normalizedSuggestionId === null) {
    return false;
  }
  if (state.ui.activeSuggestionPreviewId !== normalizedSuggestionId) {
    return false;
  }
  return canResolveSelectionExecutionIntent(state, normalizedSuggestionId);
}

export function getSelectionSuggestionById(
  state: LabStoreState,
  suggestionId: string
): LabActionSuggestion | null {
  const normalizedSuggestionId = normalizeSelectionSuggestionId(suggestionId);
  if (normalizedSuggestionId === null) {
    return null;
  }
  const activeSelection = getWorkspaceSelectionForSuggestion(state);
  if (activeSelection === null || activeSelection.endMs <= activeSelection.startMs) {
    return null;
  }
  return (
    getAnalysisPreparationSuggestionsForState(state).find(function (suggestion) {
      return suggestion.id === normalizedSuggestionId;
    }) || null
  );
}

export function isOperationResultSuggestion(suggestion: LabActionSuggestion) {
  if (suggestion.flowKind === "operation-result") {
    return true;
  }
  if (suggestion.flowKind === "analysis-report") {
    return false;
  }
  return (
    suggestion.actionType === "extract-clip" ||
    suggestion.actionType === "enhance-visual" ||
    suggestion.actionType === "enhance-frame" ||
    suggestion.actionType === "crop-region" ||
    suggestion.actionType === "clean-audio" ||
    suggestion.actionType === "separate-stems" ||
    suggestion.actionType === "stabilize-segment"
  );
}

export function getAnalysisPreparationCapabilityIdsForSuggestion(
  suggestion: LabActionSuggestion | null
): CapabilityFamilyId[] {
  if (suggestion === null || isOperationResultSuggestion(suggestion)) {
    return [];
  }
  if (suggestion.analysisCapabilityId) {
    return [suggestion.analysisCapabilityId];
  }
  switch (suggestion.actionType) {
    case "inspect-audio":
      return ["audio-signal"];
    case "inspect-motion":
    case "detect-scenes":
    case "detect-objects":
      return ["visual-structure"];
    case "focus-region":
    case "ocr-region":
      return ["visual-forensics"];
    case "metadata-audit":
      return ["visual-forensics"];
    case "analyze-segment":
      return ["visual-structure", "visual-forensics", "audio-signal"];
    default:
      return [];
  }
}

export function isAnalysisPreparationSuggestion(suggestion: LabActionSuggestion) {
  return getAnalysisPreparationCapabilityIdsForSuggestion(suggestion).length > 0;
}

function getAnalysisPreparationSuggestionsForState(state: LabStoreState) {
  const activeSelection = getWorkspaceSelectionForSuggestion(state);
  if (activeSelection === null || activeSelection.endMs <= activeSelection.startMs) {
    return [];
  }
  const sourceKind = getWorkspaceSelectionSuggestionSourceKind(state);
  return getSelectionSuggestionsForContext(activeSelection, {
    expandedTaxonomy: true,
    inspectionMode: state.ui.inspectionMode,
    sourceKind,
  }).filter(isAnalysisPreparationSuggestion);
}
