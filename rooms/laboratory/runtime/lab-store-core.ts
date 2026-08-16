import { asLabRecord, asNonEmptyString, normalizeLabFeatureId } from "../domain/lab-types.js";
import type { LabStoreEvent, LabStoreState } from "../domain/lab-types.js";
import { normalizeStoreAsset, upsertStoreAsset } from "./store/lab-store-assets.js";
import { getActiveExecutionCandidate, getExecutionDispatchCandidate } from "./lab-selectors.js";
import { normalizeAudioFocusPatch } from "./lab-audio-focus-normalization.js";
import {
  createFullSourceWorkspaceSelectionForRoi,
  getWorkspaceSourceSelectionResetKey,
  isFullSourceWorkspaceSelection,
  normalizeLabSelectionRoi,
  normalizeWorkspaceTimelineRange,
  syncWorkspaceSelectionWithRange,
} from "./lab-workspace-selection.js";
import { createInitialState } from "./store/lab-store-defaults.js";
import {
  canAcceptSelectionExecutionIntent,
  canStoreSelectionSuggestionPreview,
  clampExecutionProgress,
  clearExecutionCommitment,
  clearExecutionIntent,
  clearExecutionRuntime,
  clearSuggestionPreview,
  createExecutionCommitmentFromCandidate,
  getAnalysisPreparationCapabilityIdsForSuggestion,
  getSelectionSuggestionById,
  getWorkspaceSelectionSuggestionSourceKind,
  isMatchingExecutionRuntime,
  isOperationResultSuggestion,
  normalizeExecutionPlanId,
  normalizeSelectionSuggestionId,
} from "./store/lab-store-execution-state.js";
import { filterReadyAnalysisCapabilityIds } from "./selectors/lab-capability-selectors.js";
import { normalizeUserActionResultAssetIds } from "./store/lab-store-host-records.js";
import { normalizeSourceDraftPatch } from "./store/lab-store-import-state.js";
import { reduceLabImportUiEvent } from "./store/lab-store-import-reducer.js";
import { reduceLabHydrationEvent } from "./store/lab-store-hydration-reducer.js";
import { reduceLabProcessEvent } from "./store/lab-store-process-reducer.js";
import {
  clearInspectionDepth,
  clearInspectionSnapshot,
  clearRoiFocus,
  createImageInspectionSelection,
  createSnapshotEvent,
  getAnalysisModuleIdsForCapabilityId,
  isLabFocusLayer,
  normalizeInspectionMode,
  normalizeLabCapabilityIds,
  normalizeWorkspaceCapabilityIds,
  patchAnalysisPreparationCapabilityModuleToggles,
  replaceAnalysisPreparationModuleToggles,
  scopeWorkspaceBookmark,
} from "./store/lab-store-workspace-state.js";
import {
  clampPreviewVolume,
  patchUserAction,
  pushUserAction,
  syncCanonicalStateFromHostEvent,
  syncCanonicalStateFromSnapshot,
} from "./store/lab-store-sync.js";
import {
  isRunMutationLocked,
  routeFeedEvent,
  syncActivePreviewArtifact,
  syncRunAugmentationsFromHostEvent,
} from "./store/lab-store-run-sync.js";
import { resetWorkspaceForSourceActivation } from "./store/lab-store-source-reset.js";
import {
  createLabComparisonInteractiveSettings,
  normalizeLabInteractiveSettings,
} from "./lab-workspace-defaults.js";

function normalizeComparisonSide(value: unknown) {
  return value === "primary" || value === "reference" ? value : null;
}

function getWorkspacePrimaryAssetId(state: LabStoreState): string | null {
  const activeWorkspaceAssetId = asNonEmptyString(state.ui.activeWorkspaceAssetId);
  if (activeWorkspaceAssetId !== null) {
    return activeWorkspaceAssetId;
  }
  const source = asLabRecord(state.source);
  const sourceMetadata = asLabRecord(source["metadata"]);
  return (
    asNonEmptyString(sourceMetadata["originAssetId"]) ??
    asNonEmptyString(sourceMetadata["derivedFromAssetId"]) ??
    asNonEmptyString(source["assetId"])
  );
}

function activateWorkspaceComparisonSide(state: LabStoreState, side: "primary" | "reference") {
  state.ui.workspace.comparisonRois = {
    ...state.ui.workspace.comparisonRois,
    activeSide: side,
  };
  if (getWorkspaceSelectionSuggestionSourceKind(state) === "image") {
    const sideRoi = state.ui.workspace.comparisonRois[side];
    state.ui.workspace.activeSelection =
      sideRoi === null ? null : createImageInspectionSelection(sideRoi);
  }
}

function getWorkspaceSourceDurationMs(state: LabStoreState) {
  const metadata = asLabRecord(asLabRecord(state.source)["metadata"]);
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

function reduceEvent(state: LabStoreState, event: LabStoreEvent): LabStoreState {
  if (reduceLabImportUiEvent(state, event)) {
    return state;
  }

  if (reduceLabProcessEvent(state, event)) {
    return state;
  }

  if (reduceLabHydrationEvent(state, event)) {
    return state;
  }

  switch (event.type) {
    case "lab-focus-layer-changed":
      if (!isLabFocusLayer(event.layer) || state.ui.labFocusLayer === event.layer) {
        return state;
      }
      state.ui.labFocusLayer = event.layer;
      return state;
    case "host-event-received":
      syncCanonicalStateFromHostEvent(state, event.event);
      syncRunAugmentationsFromHostEvent(state, event.event);
      routeFeedEvent(state, event.event);
      return state;
    case "bootstrap-ready-sent":
      state.roomReadySent = true;
      return state;
    case "context-received":
      state.context = event.payload;
      state.featureId = normalizeLabFeatureId(event.payload["featureId"], state.featureId);
      return state;
    case "snapshot-received":
      syncCanonicalStateFromSnapshot(state, event.payload);
      return state;
    case "source-snapshot-received":
      syncCanonicalStateFromSnapshot(state, event.payload, { preserveFeatureId: true });
      return state;
    case "job-received":
      if (event.event) {
        routeFeedEvent(state, event.event);
      }
      return state;
    case "request-result-received":
      if (event.event) {
        routeFeedEvent(state, event.event);
      }
      state.ui.sourceDraftDirty = false;
      state.ui.editDraftDirty = false;
      state.ui.profileDraftDirty = false;
      return state;
    case "feature-changed":
      state.featureId = event.featureId;
      if (state.snapshot) {
        syncCanonicalStateFromSnapshot(state, state.snapshot, { preserveFeatureId: true });
      }
      return state;
    case "workbench-updated":
      state.workbench = asLabRecord(event.workbench);
      state.ui.activePreviewArtifactId = asNonEmptyString(
        state.workbench["activePreviewArtifactId"]
      );
      state.ui.analysisControlsCollapsed = state.workbench["controlsCollapsed"] === true;
      state.ui.liveFindingsExpanded =
        asNonEmptyString(state.workbench["activeLiveFindingsStreamId"]) !== null;
      return state;
    case "source-config-patched": {
      if (isRunMutationLocked(state)) {
        return state;
      }
      const previousSourceSelectionKey = getWorkspaceSourceSelectionResetKey(state.source);
      state.source = {
        ...(state.source || {}),
        ...asLabRecord(event.patch),
      };
      const nextSourceSelectionKey = getWorkspaceSourceSelectionResetKey(state.source);
      if (previousSourceSelectionKey !== nextSourceSelectionKey) {
        resetWorkspaceForSourceActivation(state);
      }
      if (
        event.patch["kind"] !== undefined ||
        event.patch["mode"] !== undefined ||
        event.patch["storedPath"] === null ||
        event.patch["status"] === "idle"
      ) {
        state.ui.workspace = {
          ...state.ui.workspace,
          sourceIntakeCollapsed: false,
          drawerModeOverride: null,
        };
      }
      return state;
    }
    case "source-drafts-updated":
      if (isRunMutationLocked(state)) {
        return state;
      }
      state.ui.sourceDrafts = {
        ...state.ui.sourceDrafts,
        ...event.patch,
      };
      state.ui.projectImport = {
        ...state.ui.projectImport,
        drafts: {
          ...state.ui.projectImport.drafts,
          [state.ui.projectImport.activeKind]: normalizeSourceDraftPatch(
            event.patch,
            state.ui.projectImport.drafts[state.ui.projectImport.activeKind]
          ),
        },
      };
      state.ui.sourceDraftDirty = true;
      return state;
    case "source-drafts-committed":
      state.ui.sourceDraftDirty = false;
      return state;
    case "edit-drafts-updated":
      state.ui.editDrafts = {
        ...state.ui.editDrafts,
        ...event.patch,
      };
      state.ui.editDraftDirty = true;
      return state;
    case "edit-drafts-committed":
      state.ui.editDraftDirty = false;
      return state;
    case "profile-drafts-updated":
      state.ui.profileDrafts = {
        ...state.ui.profileDrafts,
        ...event.patch,
      };
      state.ui.profileDraftDirty = true;
      return state;
    case "profile-drafts-committed":
      state.ui.profileDraftDirty = false;
      return state;
    case "tool-manager-toggled":
      state.ui.toolManagerOpen =
        typeof event.open === "boolean" ? event.open : !state.ui.toolManagerOpen;
      if (state.ui.toolManagerOpen !== true) {
        state.ui.toolInstallReviewToolId = null;
      }
      return state;
    case "tool-install-review-requested":
      state.ui.toolInstallReviewToolId = event.toolId.trim() !== "" ? event.toolId : null;
      return state;
    case "tool-install-review-dismissed":
      state.ui.toolInstallReviewToolId = null;
      return state;
    case "toggle-event-feed":
      state.ui.eventFeedExpanded =
        typeof event.force === "boolean" ? event.force : !state.ui.eventFeedExpanded;
      state.ui.eventFeedCursor = 0;
      return state;
    case "advance-event-feed":
      state.ui.eventFeedExpanded = true;
      state.ui.eventFeedCursor += 40;
      return state;
    case "reset-event-feed":
      state.ui.eventFeedCursor = 0;
      return state;
    case "toggle-artifacts":
      state.ui.artifactListExpanded =
        typeof event.force === "boolean" ? event.force : !state.ui.artifactListExpanded;
      state.ui.artifactRenderCount = state.ui.artifactListExpanded
        ? Math.max(24, state.ui.artifactRenderCount)
        : 12;
      return state;
    case "show-more-artifacts":
      state.ui.artifactListExpanded = true;
      state.ui.artifactRenderCount += 24;
      return state;
    case "report-view-changed":
      state.ui.reportView = event.view;
      return state;
    case "workspace-operation-output-applied": {
      const outputAssetId = asNonEmptyString(event.assetId);
      if (outputAssetId === null) {
        return state;
      }
      const comparisonSide = normalizeComparisonSide(event.comparisonSide);
      state.ui.activeDocumentOverlayAssetId = null;
      state.ui.workspace = {
        ...state.ui.workspace,
        reportOverlayOpen: false,
      };
      if (comparisonSide === "primary") {
        state.ui.activeWorkspaceAssetId = outputAssetId;
        state.ui.workspace.comparisonRois = {
          ...state.ui.workspace.comparisonRois,
          activeSide: "primary",
          primary: null,
        };
        state.ui.workspace.activeSelection = null;
        return state;
      }
      if (
        comparisonSide === "reference" &&
        asNonEmptyString(state.ui.workspace.comparisonReferenceAssetId) !== null
      ) {
        state.ui.workspace.comparisonReferenceAssetId = outputAssetId;
        state.ui.workspace.comparisonRois = {
          ...state.ui.workspace.comparisonRois,
          activeSide: "reference",
          reference: null,
        };
        state.ui.workspace.activeSelection = null;
        return state;
      }
      resetWorkspaceForSourceActivation(state, {
        activeWorkspaceAssetId: outputAssetId,
        comparisonReferenceAssetId: null,
        sourceIntakeCollapsed: state.ui.workspace.sourceIntakeCollapsed,
      });
      return state;
    }
    case "workspace-asset-selected":
    case "workspace-content-opened": {
      const selectedAssetId = asNonEmptyString(event.assetId);
      const comparisonReferenceAssetId = asNonEmptyString(
        state.ui.workspace.comparisonReferenceAssetId
      );
      if (comparisonReferenceAssetId !== null && selectedAssetId !== null) {
        const primaryAssetId = getWorkspacePrimaryAssetId(state);
        if (selectedAssetId === comparisonReferenceAssetId) {
          activateWorkspaceComparisonSide(state, "reference");
          return state;
        }
        if (primaryAssetId !== null && selectedAssetId === primaryAssetId) {
          activateWorkspaceComparisonSide(state, "primary");
          return state;
        }
      }
      state.ui.activeDocumentOverlayAssetId = null;
      state.ui.workspace = {
        ...state.ui.workspace,
        reportOverlayOpen: false,
      };
      resetWorkspaceForSourceActivation(state, {
        activeWorkspaceAssetId: selectedAssetId,
        comparisonReferenceAssetId: null,
        sourceIntakeCollapsed: state.ui.workspace.sourceIntakeCollapsed,
      });
      return state;
    }
    case "workspace-comparison-reference-set":
      {
        const previousReferenceAssetId = asNonEmptyString(
          state.ui.workspace.comparisonReferenceAssetId
        );
        const nextReferenceAssetId = asNonEmptyString(event.assetId);
        state.ui.workspace.comparisonReferenceAssetId = nextReferenceAssetId;
        if (previousReferenceAssetId === null && nextReferenceAssetId !== null) {
          state.ui.workspace.comparisonInteractiveSettings = createLabComparisonInteractiveSettings(
            state.ui.workspace.interactiveSettings
          );
        }
      }
      state.ui.workspace.comparisonRois = {
        ...state.ui.workspace.comparisonRois,
        activeSide:
          state.ui.workspace.comparisonReferenceAssetId === null ? "primary" : "reference",
        reference: null,
      };
      if (getWorkspaceSelectionSuggestionSourceKind(state) === "image") {
        const primaryRoi = state.ui.workspace.comparisonRois.primary;
        state.ui.workspace.activeSelection =
          event.assetId === null && primaryRoi !== null
            ? createImageInspectionSelection(primaryRoi)
            : null;
      }
      return state;
    case "workspace-comparison-side-activated": {
      const comparisonSide = normalizeComparisonSide(event.side);
      if (comparisonSide === null) {
        return state;
      }
      activateWorkspaceComparisonSide(state, comparisonSide);
      return state;
    }
    case "workspace-comparison-updated":
      state.ui.workspace = {
        ...state.ui.workspace,
        ...event.patch,
        comparisonSplitPercent:
          typeof event.patch.comparisonSplitPercent === "number"
            ? Math.max(0, Math.min(100, event.patch.comparisonSplitPercent))
            : state.ui.workspace.comparisonSplitPercent,
      };
      return state;
    case "document-overlay-opened":
      state.ui.activeDocumentOverlayAssetId = event.assetId;
      state.ui.activeWorkspaceAssetId = null;
      state.ui.workspace = {
        ...state.ui.workspace,
        reportOverlayOpen: true,
      };
      return state;
    case "document-overlay-cleared":
      state.ui.activeDocumentOverlayAssetId = null;
      return state;
    case "preview-artifact-activated":
      state.ui.activePreviewArtifactId = event.artifactId;
      state.ui.activeWorkspaceAssetId = null;
      state.ui.activeDocumentOverlayAssetId = null;
      if (state.run) {
        state.run.previewArtifacts = syncActivePreviewArtifact(
          state.run.previewArtifacts,
          event.artifactId
        );
      }
      state.workbench = {
        ...state.workbench,
        activePreviewArtifactId: event.artifactId,
      };
      return state;
    case "live-findings-expanded":
      state.ui.liveFindingsExpanded =
        typeof event.force === "boolean" ? event.force : !state.ui.liveFindingsExpanded;
      state.workbench = {
        ...state.workbench,
        activeLiveFindingsStreamId: state.ui.liveFindingsExpanded ? state.featureId : null,
      };
      return state;
    case "analysis-controls-collapsed":
      state.ui.analysisControlsCollapsed =
        typeof event.force === "boolean" ? event.force : !state.ui.analysisControlsCollapsed;
      state.workbench = {
        ...state.workbench,
        controlsCollapsed: state.ui.analysisControlsCollapsed,
      };
      return state;
    case "analysis-cancel-requested":
      if (isRunMutationLocked(state)) {
        state.ui.analysisCancelPending = true;
        state.ui.analysisCancelRequestId = asNonEmptyString(event.requestId);
      }
      return state;
    case "capability-select": {
      const nextCaps = state.selectedCapabilities.includes(event.capabilityId)
        ? state.selectedCapabilities
        : state.selectedCapabilities.concat(event.capabilityId);
      state.selectedCapabilities = nextCaps;
      return state;
    }
    case "capability-deselect": {
      state.selectedCapabilities = state.selectedCapabilities.filter(function (entry) {
        return entry !== event.capabilityId;
      });
      return state;
    }
    case "capability-set":
      state.selectedCapabilities = event.capabilities.slice();
      return state;
    case "edit-side-panel-toggled":
      state.ui.editSidePanelCollapsed =
        typeof event.force === "boolean" ? event.force : !state.ui.editSidePanelCollapsed;
      return state;
    case "raw-log-toggled":
      state.ui.rawLogCollapsed =
        typeof event.force === "boolean" ? event.force : !state.ui.rawLogCollapsed;
      return state;
    case "push-event":
      routeFeedEvent(state, event.event);
      return state;
    case "asset-added":
      state.assets = upsertStoreAsset(state.assets, event.asset);
      return state;
    case "asset-removed":
      state.assets = state.assets.filter(function (asset) {
        return asset.id !== event.id;
      });
      if (state.ui.activeWorkspaceAssetId === event.id) {
        state.ui.activeWorkspaceAssetId = null;
      }
      if (state.ui.workspace.comparisonReferenceAssetId === event.id) {
        state.ui.workspace.comparisonReferenceAssetId = null;
        state.ui.workspace.comparisonRois = {
          ...state.ui.workspace.comparisonRois,
          activeSide: "primary",
          reference: null,
        };
      }
      return state;
    case "asset-updated":
      state.assets = state.assets.map(function (asset) {
        if (asset.id !== event.id) {
          return asset;
        }
        return (
          normalizeStoreAsset({
            ...asset,
            ...event.patch,
            id: asset.id,
            type: event.patch.type || asset.type,
            name: event.patch.name || asset.name,
            createdAt: event.patch.createdAt || asset.createdAt,
          }) || asset
        );
      });
      return state;
    case "user-action-added":
      const normalizedResultAssetIds = normalizeUserActionResultAssetIds(
        event.actionEvent.resultAssetIds
      );
      pushUserAction(state, {
        ...event.actionEvent,
        dismissedFromHubAt: event.actionEvent.dismissedFromHubAt ?? null,
        jobId: event.actionEvent.jobId ?? null,
        projectId: event.actionEvent.projectId ?? null,
        requestId: event.actionEvent.requestId ?? null,
        ...(normalizedResultAssetIds === undefined
          ? {}
          : { resultAssetIds: normalizedResultAssetIds }),
        sourceAction: event.actionEvent.sourceAction ?? null,
      });
      return state;
    case "user-action-updated":
      patchUserAction(state, event.id, event.patch);
      return state;
    case "user-action-hub-dismissed":
      patchUserAction(state, event.id, {
        dismissedFromHubAt: Date.now(),
      });
      return state;
    case "clear-events":
      state.activityFeed = [createSnapshotEvent("Olay akisi temizlendi.", "info")];
      state.ui.eventFeedCursor = 0;
      return state;
    // V2.3 workspace events
    case "workspace-timeline-updated": {
      if (isRunMutationLocked(state)) {
        return state;
      }
      const nextTimelineRange = normalizeWorkspaceTimelineRange(event.startMs, event.endMs);
      if (
        nextTimelineRange.startMs !== state.ui.workspace.timelineStartMs ||
        nextTimelineRange.endMs !== state.ui.workspace.timelineEndMs
      ) {
        clearExecutionIntent(state);
        clearSuggestionPreview(state);
        clearInspectionDepth(state);
      }
      state.ui.workspace = syncWorkspaceSelectionWithRange(state.ui.workspace, nextTimelineRange);
      return state;
    }
    case "workspace-selection-suggestion-clicked":
      return state;
    case "workspace-selection-suggestion-accepted":
      if (isRunMutationLocked(state)) {
        return state;
      }
      if (!canAcceptSelectionExecutionIntent(state, event.suggestionId)) {
        return state;
      }
      {
        const nextExecutionIntentId = normalizeSelectionSuggestionId(event.suggestionId);
        if (state.ui.activeExecutionIntentId !== nextExecutionIntentId) {
          clearExecutionCommitment(state);
        }
        state.ui.activeExecutionIntentId = nextExecutionIntentId;
        const suggestion =
          nextExecutionIntentId === null
            ? null
            : getSelectionSuggestionById(state, nextExecutionIntentId);
        const suggestionBoundToAnalysis = applyAnalysisPreparationSuggestionSelection(state, {
          mode: "replace",
          selectionTabActive: false,
          suggestionId: event.suggestionId,
        });
        if (suggestion !== null && isOperationResultSuggestion(suggestion)) {
          state.ui.workspace = {
            ...state.ui.workspace,
            controlsDrawerOpen: true,
            controlsDrawerTab: "operations",
          };
        } else if (suggestionBoundToAnalysis !== true) {
          const expandedCapabilityIds =
            getAnalysisPreparationCapabilityIdsForSuggestion(suggestion);
          state.ui.workspace = {
            ...state.ui.workspace,
            drawerCollapsed: false,
            drawerModeOverride: "setup",
            analysisPrepExpandedCapabilityIds:
              expandedCapabilityIds.length > 0
                ? normalizeLabCapabilityIds(
                    state.ui.workspace.analysisPrepExpandedCapabilityIds.concat(
                      expandedCapabilityIds
                    )
                  )
                : state.ui.workspace.analysisPrepExpandedCapabilityIds,
          };
        }
      }
      return state;
    case "workspace-selection-suggestion-dismissed":
      if (state.ui.activeExecutionIntentId === normalizeSelectionSuggestionId(event.suggestionId)) {
        clearExecutionIntent(state);
      }
      if (
        state.ui.activeSuggestionPreviewId === normalizeSelectionSuggestionId(event.suggestionId)
      ) {
        clearSuggestionPreview(state);
      }
      return state;
    case "workspace-selection-suggestion-queued":
      if (isRunMutationLocked(state)) {
        return state;
      }
      applyAnalysisPreparationSuggestionSelection(state, {
        mode: "append",
        selectionTabActive: true,
        suggestionId: event.suggestionId,
      });
      if (
        state.ui.activeSuggestionPreviewId === normalizeSelectionSuggestionId(event.suggestionId)
      ) {
        clearSuggestionPreview(state);
      }
      return state;
    case "workspace-execution-intent-cleared":
      clearExecutionIntent(state);
      return state;
    case "workspace-execution-commitment-set": {
      const planId = normalizeExecutionPlanId(event.planId);
      if (planId === null) {
        return state;
      }
      const candidate = getActiveExecutionCandidate(state);
      if (candidate === null || candidate.planId !== planId || candidate.status === "not-viable") {
        return state;
      }
      clearExecutionRuntime(state);
      state.ui.activeExecutionCommitment = createExecutionCommitmentFromCandidate(candidate);
      return state;
    }
    case "workspace-execution-commitment-revoked":
      clearExecutionCommitment(state);
      return state;
    case "workspace-execution-dispatch": {
      const dispatchCandidate = getExecutionDispatchCandidate(state);
      if (
        dispatchCandidate === null ||
        dispatchCandidate.planId !== event.planId ||
        dispatchCandidate.dispatchId !== event.dispatchId
      ) {
        return state;
      }
      state.ui.executionRuntime = {
        status: "running",
        activePlanId: event.planId,
        dispatchId: event.dispatchId,
        progress: 0,
      };
      return state;
    }
    case "workspace-execution-progress":
      if (
        state.ui.executionRuntime.status !== "running" ||
        !isMatchingExecutionRuntime(state, event.planId, event.dispatchId)
      ) {
        return state;
      }
      state.ui.executionRuntime = {
        ...state.ui.executionRuntime,
        progress: clampExecutionProgress(event.progress),
      };
      return state;
    case "workspace-execution-completed":
      if (
        state.ui.executionRuntime.status !== "running" ||
        !isMatchingExecutionRuntime(state, event.planId, event.dispatchId)
      ) {
        return state;
      }
      state.ui.executionRuntime = {
        status: "completed",
        activePlanId: event.planId,
        dispatchId: event.dispatchId,
        progress: 100,
        result: event.result,
      };
      return state;
    case "workspace-execution-runtime-reset":
      if (
        event.planId !== undefined &&
        event.dispatchId !== undefined &&
        !isMatchingExecutionRuntime(state, event.planId, event.dispatchId)
      ) {
        return state;
      }
      clearExecutionRuntime(state);
      return state;
    case "workspace-selection-suggestion-preview-set":
      if (!canStoreSelectionSuggestionPreview(state, event.suggestionId)) {
        clearSuggestionPreview(state);
        return state;
      }
      state.ui.activeSuggestionPreviewId = normalizeSelectionSuggestionId(event.suggestionId);
      return state;
    case "workspace-selection-suggestion-preview-cleared":
      clearSuggestionPreview(state);
      return state;
    case "selection-roi-focus-set": {
      const activeSelection = state.ui.workspace.activeSelection;
      if (
        event.active !== true ||
        activeSelection === null ||
        activeSelection.endMs <= activeSelection.startMs ||
        activeSelection.roi === undefined
      ) {
        clearRoiFocus(state);
        return state;
      }
      state.ui.roiFocusActive = true;
      return state;
    }
    case "selection-roi-focus-cleared":
      clearRoiFocus(state);
      return state;
    case "selection-roi-updated": {
      if (isRunMutationLocked(state)) {
        return state;
      }
      const normalizedRoi = normalizeLabSelectionRoi(event.roi);
      if (!normalizedRoi) {
        return state;
      }
      clearExecutionIntent(state);
      clearSuggestionPreview(state);
      clearInspectionSnapshot(state);
      const comparisonSide = normalizeComparisonSide(event.comparisonSide);
      if (comparisonSide !== null) {
        state.ui.workspace.comparisonRois = {
          ...state.ui.workspace.comparisonRois,
          activeSide: comparisonSide,
          [comparisonSide]: normalizedRoi,
        };
      }
      const activeSelection = state.ui.workspace.activeSelection;
      const sourceKind = getWorkspaceSelectionSuggestionSourceKind(state);
      if (activeSelection === null || activeSelection.endMs <= activeSelection.startMs) {
        const fullSourceSelection = createFullSourceWorkspaceSelectionForRoi(normalizedRoi, {
          durationMs: getWorkspaceSourceDurationMs(state),
          sourceKind,
        });
        state.ui.workspace = {
          ...state.ui.workspace,
          activeSelection:
            sourceKind === "image"
              ? createImageInspectionSelection(normalizedRoi)
              : fullSourceSelection,
        };
        return state;
      }
      state.ui.workspace = {
        ...state.ui.workspace,
        activeSelection: {
          ...activeSelection,
          roi: normalizedRoi,
        },
      };
      return state;
    }
    case "selection-roi-cleared": {
      if (isRunMutationLocked(state)) {
        return state;
      }
      const comparisonSide = normalizeComparisonSide(event.comparisonSide);
      if (comparisonSide !== null) {
        state.ui.workspace.comparisonRois = {
          ...state.ui.workspace.comparisonRois,
          activeSide: comparisonSide,
          [comparisonSide]: null,
        };
      }
      const activeSelection = state.ui.workspace.activeSelection;
      if (activeSelection === null) {
        clearExecutionIntent(state);
        clearInspectionDepth(state);
        return state;
      }
      clearExecutionIntent(state);
      clearSuggestionPreview(state);
      clearInspectionDepth(state);
      const sourceKind = getWorkspaceSelectionSuggestionSourceKind(state);
      const imageOnlySelection =
        sourceKind === "image" &&
        activeSelection.startMs === 0 &&
        activeSelection.endMs === 1 &&
        state.ui.workspace.timelineStartMs === null &&
        state.ui.workspace.timelineEndMs === null;
      const fullVideoRoiSelection =
        isFullSourceWorkspaceSelection(activeSelection) &&
        state.ui.workspace.timelineStartMs === null &&
        state.ui.workspace.timelineEndMs === null;
      if (imageOnlySelection || fullVideoRoiSelection) {
        state.ui.workspace = {
          ...state.ui.workspace,
          activeSelection: null,
        };
        return state;
      }
      const { roi: _removedRoi, ...selectionWithoutRoi } = activeSelection;
      state.ui.workspace = {
        ...state.ui.workspace,
        activeSelection: selectionWithoutRoi,
      };
      return state;
    }
    case "selection-roi-snapshot-set": {
      if (isRunMutationLocked(state)) {
        return state;
      }
      const activeSelection = state.ui.workspace.activeSelection;
      if (
        activeSelection === null ||
        activeSelection.endMs <= activeSelection.startMs ||
        activeSelection.roi === undefined
      ) {
        clearInspectionSnapshot(state);
        return state;
      }
      state.ui.activeInspectionSnapshot = event.snapshot;
      return state;
    }
    case "selection-roi-snapshot-cleared":
      if (isRunMutationLocked(state)) {
        return state;
      }
      clearInspectionSnapshot(state);
      return state;
    case "selection-inspection-mode-updated": {
      const nextInspectionMode = normalizeInspectionMode(event.mode);
      if (state.ui.inspectionMode === nextInspectionMode) {
        return state;
      }
      clearExecutionIntent(state);
      clearSuggestionPreview(state);
      state.ui.inspectionMode = nextInspectionMode;
      return state;
    }
    case "workspace-roi-added":
      if (isRunMutationLocked(state)) {
        return state;
      }
      state.ui.workspace = {
        ...state.ui.workspace,
        roiRegions: state.ui.workspace.roiRegions.concat(event.region),
      };
      return state;
    case "workspace-roi-updated":
      if (isRunMutationLocked(state)) {
        return state;
      }
      state.ui.workspace = {
        ...state.ui.workspace,
        roiRegions: state.ui.workspace.roiRegions.map(function (entry) {
          return entry.id === event.region.id ? event.region : entry;
        }),
      };
      return state;
    case "workspace-roi-removed":
      if (isRunMutationLocked(state)) {
        return state;
      }
      state.ui.workspace = {
        ...state.ui.workspace,
        roiRegions: state.ui.workspace.roiRegions.filter(function (entry) {
          return entry.id !== event.regionId;
        }),
      };
      return state;
    case "workspace-roi-toggled":
      if (isRunMutationLocked(state)) {
        return state;
      }
      state.ui.workspace = {
        ...state.ui.workspace,
        roiRegions: state.ui.workspace.roiRegions.map(function (entry) {
          return entry.id === event.regionId ? { ...entry, active: !entry.active } : entry;
        }),
      };
      return state;
    case "workspace-preview-volume-updated":
      state.ui.workspace = {
        ...state.ui.workspace,
        previewVolume: clampPreviewVolume(event.volume),
      };
      return state;
    case "workspace-interactive-updated":
      {
        const comparisonSide = normalizeComparisonSide(event.comparisonSide);
        if (comparisonSide !== null) {
          const currentSettings = state.ui.workspace.comparisonInteractiveSettings[comparisonSide];
          state.ui.workspace = {
            ...state.ui.workspace,
            comparisonInteractiveSettings: {
              ...state.ui.workspace.comparisonInteractiveSettings,
              [comparisonSide]: normalizeLabInteractiveSettings(
                {
                  ...currentSettings,
                  ...event.patch,
                },
                currentSettings
              ),
            },
          };
          return state;
        }
        state.ui.workspace = {
          ...state.ui.workspace,
          interactiveSettings: normalizeLabInteractiveSettings(
            {
              ...state.ui.workspace.interactiveSettings,
              ...event.patch,
            },
            state.ui.workspace.interactiveSettings
          ),
        };
      }
      return state;
    case "workspace-hypothesis-updated":
      if (isRunMutationLocked(state)) {
        return state;
      }
      state.ui.workspace = {
        ...state.ui.workspace,
        hypothesis: event.text,
      };
      return state;
    case "workspace-bookmark-added":
      state.ui.workspace = {
        ...state.ui.workspace,
        bookmarks: state.ui.workspace.bookmarks.concat(
          scopeWorkspaceBookmark(state, event.bookmark)
        ),
      };
      return state;
    case "workspace-bookmark-removed":
      state.ui.workspace = {
        ...state.ui.workspace,
        bookmarks: state.ui.workspace.bookmarks.filter(function (entry) {
          return entry.id !== event.bookmarkId;
        }),
      };
      return state;
    case "analysis-prep-module-toggled": {
      if (isRunMutationLocked(state)) {
        return state;
      }
      const moduleId = event.moduleId.trim();
      const capabilityModuleIds = getAnalysisModuleIdsForCapabilityId(event.capabilityId);
      if (moduleId === "" || !capabilityModuleIds.includes(moduleId)) {
        return state;
      }
      const moduleToggles = {
        ...asLabRecord(asLabRecord(state.workbench)["moduleToggles"]),
      };
      moduleToggles[moduleId] = moduleToggles[moduleId] !== true;
      state.workbench = {
        ...state.workbench,
        moduleToggles,
      };
      const hasEnabledModule = capabilityModuleIds.some(function (entry) {
        return moduleToggles[entry] === true;
      });
      const capabilitySet = new Set(normalizeWorkspaceCapabilityIds(state.selectedCapabilities));
      if (hasEnabledModule) {
        capabilitySet.add(event.capabilityId);
      } else {
        capabilitySet.delete(event.capabilityId);
      }
      state.selectedCapabilities = normalizeWorkspaceCapabilityIds(Array.from(capabilitySet));
      return state;
    }
    case "analysis-prep-group-toggled": {
      const capabilityIds = normalizeWorkspaceCapabilityIds(state.selectedCapabilities);
      const capabilityModuleIds = getAnalysisModuleIdsForCapabilityId(event.capabilityId);
      const moduleToggles = asLabRecord(asLabRecord(state.workbench)["moduleToggles"]);
      const groupFullySelected =
        capabilityIds.includes(event.capabilityId) &&
        capabilityModuleIds.length > 0 &&
        capabilityModuleIds.every(function (moduleId) {
          return moduleToggles[moduleId] !== false;
        });
      const nextGroupSelected = groupFullySelected !== true;
      const nextCapabilityIds = nextGroupSelected
        ? capabilityIds.includes(event.capabilityId)
          ? capabilityIds
          : capabilityIds.concat(event.capabilityId)
        : capabilityIds.filter(function (entry) {
            return entry !== event.capabilityId;
          });
      state.selectedCapabilities = normalizeWorkspaceCapabilityIds(nextCapabilityIds);
      state.workbench = patchAnalysisPreparationCapabilityModuleToggles(
        state.workbench,
        event.capabilityId,
        state.selectedCapabilities,
        nextGroupSelected
      );
      return state;
    }
    case "analysis-prep-group-expanded": {
      const nextExpandedCapabilityIds = normalizeLabCapabilityIds(event.capabilityIds);
      state.ui.workspace = {
        ...state.ui.workspace,
        analysisPrepExpandedCapabilityIds: nextExpandedCapabilityIds,
      };
      return state;
    }
    case "workspace-source-intake-toggled":
      state.ui.workspace = {
        ...state.ui.workspace,
        sourceIntakeCollapsed:
          typeof event.force === "boolean"
            ? event.force
            : !state.ui.workspace.sourceIntakeCollapsed,
      };
      return state;
    case "workspace-selection-loop-toggled": {
      const selection = state.ui.workspace.activeSelection;
      const canLoop = selection !== null && selection.endMs > selection.startMs;
      const nextEnabled =
        typeof event.force === "boolean" ? event.force : !state.ui.workspace.selectionLoopEnabled;
      state.ui.workspace = {
        ...state.ui.workspace,
        selectionLoopEnabled: canLoop === true ? nextEnabled : false,
      };
      return state;
    }
    case "workspace-selection-micro-zoom-toggled": {
      const selection = state.ui.workspace.activeSelection;
      const canOpen = selection !== null && selection.endMs > selection.startMs;
      const nextOpen =
        typeof event.force === "boolean" ? event.force : !state.ui.workspace.selectionMicroZoomOpen;
      state.ui.workspace = {
        ...state.ui.workspace,
        selectionMicroZoomOpen: canOpen === true ? nextOpen : false,
      };
      return state;
    }
    case "workspace-controls-drawer-toggled":
      state.ui.workspace = {
        ...state.ui.workspace,
        controlsDrawerOpen:
          typeof event.force === "boolean" ? event.force : !state.ui.workspace.controlsDrawerOpen,
      };
      return state;
    case "workspace-controls-tab-selected":
      state.ui.workspace = {
        ...state.ui.workspace,
        controlsDrawerOpen: true,
        controlsDrawerTab: event.tab,
      };
      return state;
    case "workspace-audio-updated":
      state.ui.workspace = {
        ...state.ui.workspace,
        audioFocus: normalizeAudioFocusPatch(state.ui.workspace.audioFocus, event.patch),
      };
      return state;
    case "workspace-process-view-toggled":
      state.ui.workspace = {
        ...state.ui.workspace,
        processViewActive:
          typeof event.force === "boolean" ? event.force : !state.ui.workspace.processViewActive,
      };
      return state;
    case "report-overlay-toggled":
      if (event.open !== true) {
        state.ui.activeDocumentOverlayAssetId = null;
      }
      state.ui.workspace = {
        ...state.ui.workspace,
        reportOverlayOpen: event.open,
      };
      return state;
    case "selection-tab-toggled":
      state.ui.workspace = {
        ...state.ui.workspace,
        selectionTabActive: event.active,
      };
      return state;
    case "analysis-preflight-auto-run-toggled":
      state.ui.workspace = {
        ...state.ui.workspace,
        preflightAutoRunEnabled:
          typeof event.enabled === "boolean"
            ? event.enabled
            : state.ui.workspace.preflightAutoRunEnabled === false,
      };
      return state;
    case "source-panel-toggled":
      state.ui.sourcePanelCollapsed = !state.ui.sourcePanelCollapsed;
      return state;
    case "drawer-collapsed-toggled":
      state.ui.workspace = {
        ...state.ui.workspace,
        drawerCollapsed: !state.ui.workspace.drawerCollapsed,
      };
      return state;
    case "drawer-explore-toggled":
      state.ui.workspace = {
        ...state.ui.workspace,
        userExploreToggle: !state.ui.workspace.userExploreToggle,
        drawerModeOverride: null,
      };
      return state;
    case "drawer-mode-requested":
      state.ui.workspace = {
        ...state.ui.workspace,
        drawerModeOverride: event.mode,
        userExploreToggle: event.mode === "result" ? false : state.ui.workspace.userExploreToggle,
      };
      return state;
    case "inspector-pin-toggle":
      state.ui.workspace = {
        ...state.ui.workspace,
        inspectorPinned: !state.ui.workspace.inspectorPinned,
      };
      return state;
    case "icon-rail-slot-selected":
      state.ui.workspace = {
        ...state.ui.workspace,
        activeIconRailSlot:
          state.ui.workspace.activeIconRailSlot === event.slotId ? null : event.slotId,
      };
      return state;
    default:
      return state;
  }
}

function applyAnalysisPreparationSuggestionSelection(
  state: LabStoreState,
  options: {
    mode: "append" | "replace";
    selectionTabActive: boolean;
    suggestionId: string;
  }
) {
  const suggestion = getSelectionSuggestionById(state, options.suggestionId);
  const suggestionCapabilityIds = filterReadyAnalysisCapabilityIds(
    state,
    getAnalysisPreparationCapabilityIdsForSuggestion(suggestion)
  );
  if (suggestionCapabilityIds.length === 0) {
    return false;
  }
  const nextCapabilities =
    options.mode === "append"
      ? normalizeWorkspaceCapabilityIds(state.selectedCapabilities.concat(suggestionCapabilityIds))
      : normalizeWorkspaceCapabilityIds(suggestionCapabilityIds);
  state.ui.workspace = {
    ...state.ui.workspace,
    drawerCollapsed: false,
    drawerModeOverride: "setup",
    selectionTabActive: options.selectionTabActive,
    analysisPrepExpandedCapabilityIds: normalizeLabCapabilityIds(
      state.ui.workspace.analysisPrepExpandedCapabilityIds.concat(suggestionCapabilityIds)
    ),
  };
  state.workbench = replaceAnalysisPreparationModuleToggles(state.workbench, nextCapabilities);
  state.selectedCapabilities = nextCapabilities;
  return true;
}

export function createLabStore() {
  let state = createInitialState();
  const listeners = new Set<(nextState: LabStoreState) => void>();

  function getState() {
    return state;
  }

  function subscribe(listener: (nextState: LabStoreState) => void) {
    listeners.add(listener);
    return function unsubscribe() {
      listeners.delete(listener);
    };
  }

  function dispatch(event: LabStoreEvent) {
    state = reduceEvent(structuredClone(state), event);
    listeners.forEach(function (listener) {
      listener(state);
    });
  }

  return {
    dispatch,
    getState,
    subscribe,
  };
}
