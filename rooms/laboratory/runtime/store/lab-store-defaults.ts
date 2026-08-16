import { asLabRecord } from "../../domain/lab-types.js";
import type {
  LabPreflightResult,
  LabProjectImportUiState,
  LabSourceDrafts,
  LabStoreState,
  LabWorkspaceUiState,
} from "../../domain/lab-types.js";
import {
  DEFAULT_AUDIO_FOCUS_SETTINGS,
  normalizeAudioFocusSettings,
} from "../lab-audio-focus-normalization.js";
import {
  DEFAULT_LAB_INTERACTIVE_SETTINGS,
  createLabComparisonInteractiveSettings,
} from "../lab-workspace-defaults.js";

export function createDefaultSourceDrafts(): LabSourceDrafts {
  return {
    urlInput: "",
    youtubeUrl: "",
    youtubePreset: null,
    youtubeCustom: {},
    youtubeCaptureMode: "video+audio",
  };
}

export function cloneSourceDrafts(drafts: LabSourceDrafts): LabSourceDrafts {
  return {
    urlInput: drafts.urlInput,
    youtubeUrl: drafts.youtubeUrl,
    youtubePreset: drafts.youtubePreset,
    youtubeCustom: { ...asLabRecord(drafts.youtubeCustom) },
    youtubeCaptureMode: drafts.youtubeCaptureMode,
  };
}

export function createIdleProjectImportUrlCheckState(): LabProjectImportUiState["urlCheck"] {
  return {
    status: "idle",
    url: null,
    isYoutube: null,
    kind: null,
    error: null,
  };
}

export function createDefaultProjectImportState(): LabProjectImportUiState {
  const videoDrafts = createDefaultSourceDrafts();
  const audioDrafts = createDefaultSourceDrafts();
  const imageDrafts = createDefaultSourceDrafts();
  return {
    activeKind: "video",
    methods: {
      video: "local",
      audio: "local",
      image: "local",
    },
    drafts: {
      video: videoDrafts,
      audio: audioDrafts,
      image: imageDrafts,
    },
    urlCheck: createIdleProjectImportUrlCheckState(),
    reviewFocus: "idle",
    lastAction: null,
    lastRequestId: null,
  };
}

export function createEmptyReports(): LabStoreState["reports"] {
  return {
    user: null,
    ai: null,
    emptyReason: "Rapor henüz üretilmedi.",
  };
}

export function createIdlePreflight(
  reason: string | null = "Ön kontrol henüz çalıştırılmadı."
): LabPreflightResult {
  return {
    status: "idle",
    missingDependencies: [],
    warnings: [],
    estimatedRuntime: null,
    enabledModules: [],
    stageReady: false,
    rawStatus: null,
    reason,
  };
}

export function createIdleExecutionRuntime(): LabStoreState["ui"]["executionRuntime"] {
  return {
    status: "idle",
  };
}

export function createIdleYoutubeImportState(): LabStoreState["ui"]["youtubeImport"] {
  return {
    url: null,
    status: "idle",
    preview: null,
    formats: [],
    selectedVideoFormatId: null,
    selectedAudioFormatId: null,
  };
}

export function createDefaultWorkspaceUiState(): LabWorkspaceUiState {
  return {
    timelineStartMs: null,
    timelineEndMs: null,
    activeSelection: null,
    comparisonReferenceAssetId: null,
    comparisonViewMode: "side-by-side",
    comparisonSplitPercent: 50,
    comparisonFindingNote: "",
    comparisonRois: {
      activeSide: "primary",
      primary: null,
      reference: null,
    },
    roiRegions: [],
    interactiveSettings: { ...DEFAULT_LAB_INTERACTIVE_SETTINGS },
    comparisonInteractiveSettings: createLabComparisonInteractiveSettings(),
    audioFocus: normalizeAudioFocusSettings(DEFAULT_AUDIO_FOCUS_SETTINGS),
    previewVolume: 1.0,
    hypothesis: "",
    bookmarks: [],
    analysisPrepExpandedCapabilityIds: [],
    sourceIntakeCollapsed: false,
    selectionLoopEnabled: false,
    selectionMicroZoomOpen: false,
    controlsDrawerOpen: true,
    controlsDrawerTab: "audio",
    processViewActive: false,
    reportOverlayOpen: false,
    selectionTabActive: false,
    preflightAutoRunEnabled: true,
    userExploreToggle: false,
    drawerModeOverride: null,
    drawerCollapsed: false,
    inspectorPinned: false,
    activeIconRailSlot: null,
  };
}

export function createInitialState(): LabStoreState {
  return {
    featureId: "media-analysis",
    selectedCapabilities: [],
    bootReady: false,
    roomReadySent: false,
    context: {},
    snapshot: null,
    projectIndex: {
      activeProjectId: null,
      projects: [],
    },
    workbench: {},
    source: null,
    sourceProbeStatus: "idle",
    editConfig: null,
    profileConfig: null,
    preflight: null,
    run: null,
    reports: createEmptyReports(),
    reportExports: [],
    assets: [],
    profileModels: [],
    toolState: {},
    activityFeed: [],
    userActions: [],
    persisted: null,
    ui: {
      labFocusLayer: "preview",
      labMode: "normal",
      youtubeImport: createIdleYoutubeImportState(),
      projectImport: createDefaultProjectImportState(),
      sourceDrafts: createDefaultSourceDrafts(),
      editDrafts: {
        outputNameHint: "",
        notes: "",
        activeSourceRef: "original",
        advancedOpen: false,
      },
      profileDrafts: {
        sensitivity: null,
        transcriptSampleSeconds: null,
        depth: "balanced",
        frameSampleDensity: "balanced",
      },
      sourceDraftDirty: false,
      editDraftDirty: false,
      profileDraftDirty: false,
      toolManagerOpen: false,
      toolInstallReviewToolId: null,
      eventFeedExpanded: false,
      eventFeedCursor: 0,
      artifactListExpanded: false,
      artifactRenderCount: 12,
      reportView: "user",
      lastHydratedProjectId: null,
      activeExecutionCommitment: null,
      executionRuntime: createIdleExecutionRuntime(),
      activeExecutionIntentId: null,
      activeSuggestionPreviewId: null,
      activeInspectionSnapshot: null,
      activeWorkspaceAssetId: null,
      activePreviewArtifactId: null,
      activeDocumentOverlayAssetId: null,
      inspectionMode: "none",
      roiFocusActive: false,
      liveFindingsExpanded: true,
      analysisControlsCollapsed: true,
      analysisCancelPending: false,
      analysisCancelRequestId: null,
      editSidePanelCollapsed: false,
      rawLogCollapsed: true,
      workspace: createDefaultWorkspaceUiState(),
      sourcePanelCollapsed: false,
    },
  };
}
