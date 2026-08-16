import type {
  LabActionSuggestion,
  LabArtifactProjection,
  LabAudioFocusSettings,
  LabBookmark,
  LabInspectionSnapshot,
  LabInspectionMode,
  LabInterpretationItem,
  LabPreviewArtifactProjection,
  LabSelection,
  LabSuggestionPreview,
  LabWorkspaceLockState,
} from "../domain/lab-types.js";
import type { LabI18n } from "./lab-i18n.js";

export type LabWaveformInspectionLensModel = {
  cropEndRatio: number;
  cropStartRatio: number;
  durationMs: number;
  enabled: boolean;
  sourceLabel: string;
  windowDurationMs: number;
  windowStartMs: number;
};

export type LabWaveformTimelineHighlightModel = {
  assetId: string;
  endMs: number;
  label?: string;
  startMs: number;
};

export type LabWaveformTimelineModel = {
  activeExecutionIntent?: LabActionSuggestion | null;
  activeSelection?: LabSelection | null;
  activeInspectionSnapshot?: LabInspectionSnapshot | null;
  activeSuggestionPreview?: LabSuggestionPreview | null;
  audioFocus?: LabAudioFocusSettings;
  bookmarks: LabBookmark[];
  copy?: LabI18n;
  durationMs: number;
  endMs: number | null;
  focusClassName?: string;
  inspectionMode?: LabInspectionMode;
  interpretationItems?: LabInterpretationItem[];
  lockState?: LabWorkspaceLockState;
  roiFocusActive?: boolean;
  selectionLoopEnabled?: boolean;
  selectionMicroZoomOpen?: boolean;
  selectionPanelPlacement?: "side" | "timeline";
  selectionSuggestions?: LabActionSuggestion[];
  sourceKind?: string;
  startMs: number | null;
  timelineHighlight?: LabWaveformTimelineHighlightModel | null;
  transportVolume?: number;
  visualizationArtifact?: LabArtifactProjection | LabPreviewArtifactProjection | null;
  visualizationMode?: LabAudioFocusSettings["visualizationMode"];
  waveformInspectionLens?: LabWaveformInspectionLensModel;
  waveformContentDurationMs?: number;
  waveformCropEndRatio?: number;
  waveformCropStartRatio?: number;
  waveformOffsetMs?: number;
  waveformSourceLabel: string;
  waveformSyncLabel: string;
  waveformWindowDurationMs: number;
  waveformWindowStartMs: number;
};

export type LabWaveformTimelineVisualizerDeps = {
  documentRef: Document;
  getTimelineModel?: () => LabWaveformTimelineModel;
  getVisualizationArtifact?: () => LabArtifactProjection | LabPreviewArtifactProjection | null;
  getVisualizationMode?: () => LabAudioFocusSettings["visualizationMode"];
  windowRef: Window & {
    AudioContext?: typeof AudioContext;
    Image?: typeof Image;
    fetch?: typeof fetch;
    webkitAudioContext?: typeof AudioContext;
  };
};
