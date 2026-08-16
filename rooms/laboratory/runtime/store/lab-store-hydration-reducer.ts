import { asLabRecord, normalizeLabFeatureId } from "../../domain/lab-types.js";
import type {
  LabEventFeedItem,
  LabPersistedState,
  LabStoreEvent,
  LabStoreState,
  LabWorkspaceUiState,
} from "../../domain/lab-types.js";
import { normalizeStoreAssets } from "./lab-store-assets.js";
import { normalizeAudioFocusPatch } from "../lab-audio-focus-normalization.js";
import {
  createLabComparisonInteractiveSettings,
  normalizeLabInteractiveSettings,
} from "../lab-workspace-defaults.js";
import {
  normalizeWorkspaceTimelineRange,
  syncWorkspaceSelectionWithRange,
} from "../lab-workspace-selection.js";
import { createIdlePreflight, createIdleYoutubeImportState } from "./lab-store-defaults.js";
import {
  clearExecutionIntent,
  clearExecutionRuntime,
  clearSuggestionPreview,
} from "./lab-store-execution-state.js";
import { toEventFeedItem } from "./lab-store-host-records.js";
import { normalizeProjectImportState } from "./lab-store-import-state.js";
import {
  clearInspectionDepth,
  normalizeWorkspaceCapabilityIds,
  replaceAnalysisPreparationModuleToggles,
  resetInspectionMode,
} from "./lab-store-workspace-state.js";
import { clampPreviewVolume, syncProjectImportDraftFromSourceDrafts } from "./lab-store-sync.js";
import { sanitizeHydratedRun } from "./lab-store-run-sync.js";

export function reduceLabHydrationEvent(state: LabStoreState, event: LabStoreEvent): boolean {
  if (event.type !== "hydrate") {
    return false;
  }

  state.ui.labFocusLayer = "preview";
  state.ui.labMode = "normal";
  state.ui.youtubeImport = createIdleYoutubeImportState();
  clearExecutionRuntime(state);
  if (!event.payload) {
    return true;
  }

  clearExecutionIntent(state);
  clearSuggestionPreview(state);
  resetInspectionMode(state);
  clearInspectionDepth(state);
  const { youtubeImport: _youtubeImport, ...persistedPayload } =
    event.payload as Partial<LabPersistedState> & {
      youtubeImport?: unknown;
    };
  state.persisted = persistedPayload as LabPersistedState;
  state.featureId = normalizeLabFeatureId(event.payload.featureId, state.featureId);
  state.selectedCapabilities = normalizeWorkspaceCapabilityIds(event.payload.selectedCapabilities);
  if (event.payload.projectIndex) {
    state.projectIndex = event.payload.projectIndex;
    state.ui.lastHydratedProjectId = event.payload.projectIndex.activeProjectId;
  }
  state.workbench = asLabRecord(event.payload.workbench);
  state.source = event.payload.source || null;
  state.sourceProbeStatus = event.payload.sourceProbeStatus || state.sourceProbeStatus;
  state.editConfig = event.payload.editConfig || null;
  state.profileConfig = event.payload.profileConfig || null;
  state.preflight = event.payload.preflight || createIdlePreflight();
  state.run = sanitizeHydratedRun(event.payload.lastRun);
  state.reports = event.payload.reports || state.reports;
  state.reportExports = Array.isArray(event.payload.reportExports)
    ? event.payload.reportExports
    : [];
  state.assets = normalizeStoreAssets(event.payload.assets);
  state.profileModels = Array.isArray(event.payload.profileModels)
    ? event.payload.profileModels
    : [];
  state.toolState = asLabRecord(event.payload.toolState);
  state.activityFeed = Array.isArray(event.payload.activityFeed)
    ? event.payload.activityFeed
        .map(function (entry) {
          return toEventFeedItem(entry, "global");
        })
        .filter((entry): entry is LabEventFeedItem => entry !== null)
    : [];
  state.ui.sourceDrafts = {
    ...state.ui.sourceDrafts,
    ...(event.payload.sourceDrafts || {}),
  };
  state.ui.projectImport = normalizeProjectImportState(
    event.payload.projectImport,
    state.ui.projectImport
  );
  if (event.payload.projectImport === undefined || event.payload.projectImport === null) {
    syncProjectImportDraftFromSourceDrafts(state, asLabRecord(state.source)["kind"], {
      force: true,
    });
  }
  state.ui.editDrafts = {
    ...state.ui.editDrafts,
    ...(event.payload.editDrafts || {}),
  };
  state.ui.profileDrafts = {
    ...state.ui.profileDrafts,
    ...(event.payload.profileDrafts || {}),
  };
  state.ui.reportView = event.payload.reportView || state.ui.reportView;
  state.ui.eventFeedExpanded = event.payload.eventFeedExpanded === true;
  state.ui.eventFeedCursor = Math.max(0, Math.round(event.payload.eventFeedCursor || 0));
  state.ui.artifactListExpanded = event.payload.artifactListExpanded === true;
  state.ui.artifactRenderCount = Math.max(
    12,
    Math.round(event.payload.artifactRenderCount || state.ui.artifactRenderCount)
  );
  state.ui.activeWorkspaceAssetId = null;
  state.ui.activePreviewArtifactId = event.payload.activePreviewArtifactId || null;
  state.ui.activeDocumentOverlayAssetId = null;
  state.ui.liveFindingsExpanded = event.payload.liveFindingsExpanded !== false;
  state.ui.analysisControlsCollapsed = event.payload.analysisControlsCollapsed === true;
  state.ui.editSidePanelCollapsed = event.payload.editSidePanelCollapsed === true;
  state.ui.rawLogCollapsed = event.payload.rawLogCollapsed !== false;
  hydrateWorkspaceUi(state, event.payload.workspace);
  state.bootReady =
    state.bootReady ||
    state.source !== null ||
    state.run !== null ||
    state.reports.user !== null ||
    state.reports.ai !== null;
  return true;
}

function hydrateWorkspaceUi(state: LabStoreState, workspace: unknown) {
  if (!workspace || typeof workspace !== "object") {
    return;
  }

  const ws = workspace as Partial<LabWorkspaceUiState>;
  const hydratedTimelineRange = normalizeWorkspaceTimelineRange(
    typeof ws.timelineStartMs === "number"
      ? ws.timelineStartMs
      : state.ui.workspace.timelineStartMs,
    typeof ws.timelineEndMs === "number" ? ws.timelineEndMs : state.ui.workspace.timelineEndMs
  );
  const interactiveSettings = ws.interactiveSettings
    ? normalizeLabInteractiveSettings(
        ws.interactiveSettings,
        state.ui.workspace.interactiveSettings
      )
    : state.ui.workspace.interactiveSettings;
  const comparisonInteractiveSettings = ws.comparisonInteractiveSettings
    ? {
        primary: normalizeLabInteractiveSettings(
          ws.comparisonInteractiveSettings.primary,
          interactiveSettings
        ),
        reference: normalizeLabInteractiveSettings(
          ws.comparisonInteractiveSettings.reference,
          interactiveSettings
        ),
      }
    : createLabComparisonInteractiveSettings(interactiveSettings);
  state.ui.workspace = syncWorkspaceSelectionWithRange(
    {
      ...state.ui.workspace,
      activeSelection: null,
      comparisonReferenceAssetId:
        typeof ws.comparisonReferenceAssetId === "string" &&
        ws.comparisonReferenceAssetId.trim() !== ""
          ? ws.comparisonReferenceAssetId
          : null,
      roiRegions: Array.isArray(ws.roiRegions) ? ws.roiRegions : state.ui.workspace.roiRegions,
      interactiveSettings,
      comparisonInteractiveSettings,
      audioFocus: normalizeAudioFocusPatch(state.ui.workspace.audioFocus, ws.audioFocus),
      previewVolume:
        typeof ws.previewVolume === "number"
          ? clampPreviewVolume(ws.previewVolume)
          : state.ui.workspace.previewVolume,
      hypothesis: typeof ws.hypothesis === "string" ? ws.hypothesis : state.ui.workspace.hypothesis,
      bookmarks: Array.isArray(ws.bookmarks) ? ws.bookmarks : state.ui.workspace.bookmarks,
      analysisPrepExpandedCapabilityIds: [],
      sourceIntakeCollapsed: ws.sourceIntakeCollapsed === true,
      selectionLoopEnabled: ws.selectionLoopEnabled === true,
      selectionMicroZoomOpen: ws.selectionMicroZoomOpen === true,
      controlsDrawerOpen: ws.controlsDrawerOpen !== false,
      controlsDrawerTab:
        ws.controlsDrawerTab === "visual" ||
        ws.controlsDrawerTab === "audio" ||
        ws.controlsDrawerTab === "operations"
          ? ws.controlsDrawerTab
          : state.ui.workspace.controlsDrawerTab,
      processViewActive: ws.processViewActive === true,
      reportOverlayOpen: ws.reportOverlayOpen === true,
      preflightAutoRunEnabled: ws.preflightAutoRunEnabled !== false,
      userExploreToggle: ws.userExploreToggle === true,
      drawerModeOverride:
        ws.drawerModeOverride === "setup" || ws.drawerModeOverride === "result"
          ? ws.drawerModeOverride
          : null,
      drawerCollapsed: ws.drawerCollapsed === true,
    },
    hydratedTimelineRange,
    {
      persistedSelection: ws.activeSelection,
    }
  );
  if (state.selectedCapabilities.length > 0) {
    if (Object.keys(asLabRecord(state.workbench["moduleToggles"])).length === 0) {
      state.workbench = replaceAnalysisPreparationModuleToggles(
        state.workbench,
        state.selectedCapabilities
      );
    }
  }
}
