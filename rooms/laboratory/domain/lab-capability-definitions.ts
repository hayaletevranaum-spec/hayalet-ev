export type LabAssetType = "source" | "clip" | "frame" | "audio" | "image" | "report" | "artifact";

export type CapabilityFamilyId =
  | "visual-structure"
  | "visual-forensics"
  | "audio-signal"
  | "audio-recovery"
  | "transcription"
  | "speaker-analysis"
  | "prosody-emotion"
  | "sound-classification"
  | "source-separation"
  | "music-analysis";

export type CapabilityReadiness = "ready" | "optional" | "blocked";
export type LabCapabilityFlowKind = "operation-result" | "analysis-report";
export type LabOperationOutputKind = LabAssetType | "variant" | "stem";

export type LabOperationCapabilityId =
  | "clip-export"
  | "frame-grab"
  | "roi-crop"
  | "enhanced-frame"
  | "before-after-variant"
  | "image-comparison"
  | "audio-extract"
  | "audio-cleanup"
  | "band-pass-voice"
  | "stem-separation"
  | "segment-stabilization";

export type LabIconRailSlotId =
  | "roi-select"
  | "audio-focus"
  | "frame-export"
  | "denoise"
  | "stabilize"
  | "visual-adjust"
  | "clip-export"
  | "enhanced-frame"
  | "image-comparison"
  | "before-after"
  | "audio-extract"
  | "band-pass"
  | "stem-separate";

export type LabIconRailGroup = "realtime" | "post-process";

export type LabIconRailSlotContent = "operation" | "audio-focus" | "visual-adjust";

export interface LabIconRailSlot {
  id: LabIconRailSlotId;
  group: LabIconRailGroup;
  capabilityId: LabOperationCapabilityId | null;
  content: LabIconRailSlotContent;
  draft: boolean;
}

export const ICON_RAIL_SLOTS: readonly LabIconRailSlot[] = [
  {
    id: "roi-select",
    group: "realtime",
    capabilityId: "roi-crop",
    content: "operation",
    draft: false,
  },
  {
    id: "audio-focus",
    group: "realtime",
    capabilityId: null,
    content: "audio-focus",
    draft: false,
  },
  {
    id: "frame-export",
    group: "realtime",
    capabilityId: "frame-grab",
    content: "operation",
    draft: false,
  },
  {
    id: "clip-export",
    group: "post-process",
    capabilityId: "clip-export",
    content: "operation",
    draft: false,
  },
  {
    id: "enhanced-frame",
    group: "post-process",
    capabilityId: "enhanced-frame",
    content: "operation",
    draft: false,
  },
  {
    id: "image-comparison",
    group: "post-process",
    capabilityId: "image-comparison",
    content: "operation",
    draft: false,
  },
  {
    id: "audio-extract",
    group: "post-process",
    capabilityId: "audio-extract",
    content: "operation",
    draft: false,
  },
  {
    id: "band-pass",
    group: "post-process",
    capabilityId: "band-pass-voice",
    content: "operation",
    draft: false,
  },
  {
    id: "denoise",
    group: "post-process",
    capabilityId: "audio-cleanup",
    content: "operation",
    draft: false,
  },
  {
    id: "visual-adjust",
    group: "post-process",
    capabilityId: null,
    content: "visual-adjust",
    draft: false,
  },
];

export type LabSettingsValue = string | number | boolean | null;
export type LabSettingsRecord = Record<string, LabSettingsValue>;

export interface LabSettingsFieldOption {
  label: string;
  value: string;
}

export interface LabSettingsFieldMeta {
  id: string;
  label: string;
  kind: "number" | "select" | "toggle";
  options?: LabSettingsFieldOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export type LabOperationSettingsMap = Record<LabOperationCapabilityId, LabSettingsRecord>;

export interface LabAnalysisSettingsMap {
  families: Partial<Record<CapabilityFamilyId, LabSettingsRecord>>;
  modules: Record<string, LabSettingsRecord>;
}

export interface LabOperationCapabilityMeta {
  id: LabOperationCapabilityId;
  flowKind: "operation-result";
  label: string;
  description: string;
  sourceKinds: Array<"video" | "audio" | "image">;
  outputKinds: LabOperationOutputKind[];
  providerIds: string[];
  toolIds: string[];
  actionId: string | null;
  groupId: "clip" | "frame" | "audio" | "stems";
  requiresSelection?: boolean;
  requiresRoi?: boolean;
  requiresComparisonReference?: boolean;
  planned?: boolean;
}

export interface LabOperationCapabilityProjection extends LabOperationCapabilityMeta {
  readiness: CapabilityReadiness;
  blockReason: string | null;
  settings: LabSettingsRecord;
  settingsFields: LabSettingsFieldMeta[];
  actionStatus: "idle" | "running" | "success" | "error";
  activeActionLabel: string | null;
  activeActionMessage: string | null;
  activeJobId: string | null;
  activeRequestId: string | null;
  resultAssetIds?: string[];
  progress?: number | null;
}

export interface LabProcessingOverlayState {
  active: boolean;
  label: string;
  progress: number | null;
  indeterminate: boolean;
  elapsedSeconds: number;
  cancelAction: "cancel-analysis" | "operation-cancel" | null;
  cancelValue: string;
}

export interface LabAnalysisCapabilityModuleProjection {
  capabilityId: CapabilityFamilyId;
  moduleId: string;
  label: string;
  flowKind: "analysis-report";
  requiredTools: string[];
  optionalTools: string[];
  readiness: CapabilityReadiness;
  blockReason: string | null;
  enabled: boolean;
  settings: LabSettingsRecord;
  settingsFields: LabSettingsFieldMeta[];
  reportSection: string;
  sourceKinds: Array<"video" | "audio" | "image">;
  status: "implemented" | "planned" | "gated";
}

export type LabAnalysisPreparationSelectionState = "none" | "partial" | "full";

export interface LabAnalysisPreparationGroup {
  capabilityId: CapabilityFamilyId;
  label: string;
  description: string;
  selected: boolean;
  selectionState: LabAnalysisPreparationSelectionState;
  readiness: CapabilityReadiness;
  blockReason: string | null;
  modules: LabAnalysisCapabilityModuleProjection[];
}

export interface CapabilityFamilyMeta {
  id: CapabilityFamilyId;
  label: string;
  sourceKinds: Array<"video" | "audio" | "image">;
  primaryTool: string;
  requiredTools: string[];
}

export interface LabAnalysisModuleRequirementMeta {
  id: string;
  capabilityId: CapabilityFamilyId;
  optionalToolIds: string[];
  requiredToolIds: string[];
  sourceKinds: Array<"video" | "audio" | "image">;
  status: "implemented" | "planned" | "gated";
  reportSection?: string;
}

export const LAB_OPERATION_CAPABILITIES: LabOperationCapabilityMeta[] = [
  {
    id: "clip-export",
    flowKind: "operation-result",
    label: "Clip Export",
    description: "Create a standalone clip from the active timeline selection.",
    sourceKinds: ["video"],
    outputKinds: ["clip"],
    providerIds: ["ffmpeg-export"],
    toolIds: ["ffmpeg"],
    actionId: "timeline-export-clip",
    groupId: "clip",
    requiresSelection: true,
  },
  {
    id: "segment-stabilization",
    flowKind: "operation-result",
    label: "Stabilized Review Clip",
    description: "Prepare a stabilized clip variant for motion readability.",
    sourceKinds: ["video"],
    outputKinds: ["clip", "variant"],
    providerIds: ["ffmpeg-stabilization"],
    toolIds: ["ffmpeg"],
    actionId: "timeline-stabilize-segment",
    groupId: "clip",
    requiresSelection: true,
  },
  {
    id: "frame-grab",
    flowKind: "operation-result",
    label: "Frame Grab",
    description: "Capture the current video frame as a project asset.",
    sourceKinds: ["video"],
    outputKinds: ["frame"],
    providerIds: ["ffmpeg-export"],
    toolIds: ["ffmpeg"],
    actionId: "timeline-grab-frame",
    groupId: "frame",
  },
  {
    id: "roi-crop",
    flowKind: "operation-result",
    label: "Crop ROI",
    description: "Export the active inspection region as an image asset.",
    sourceKinds: ["video", "image"],
    outputKinds: ["image"],
    providerIds: ["ffmpeg-export"],
    toolIds: ["ffmpeg"],
    actionId: "workspace-selection-roi-export",
    groupId: "frame",
    requiresRoi: true,
  },
  {
    id: "enhanced-frame",
    flowKind: "operation-result",
    label: "Enhanced Frame",
    description: "Generate a clarity-focused frame or ROI variant.",
    sourceKinds: ["video", "image"],
    outputKinds: ["frame", "image", "variant"],
    providerIds: ["ffmpeg-visual-reveal"],
    toolIds: ["ffmpeg"],
    actionId: "workspace-enhanced-frame-export",
    groupId: "frame",
  },
  {
    id: "before-after-variant",
    flowKind: "operation-result",
    label: "Before/After Variant",
    description: "Prepare an original-versus-enhanced comparison asset for review.",
    sourceKinds: ["video", "image"],
    outputKinds: ["image", "variant"],
    providerIds: ["ffmpeg-visual-reveal"],
    toolIds: ["ffmpeg"],
    actionId: "workspace-before-after-export",
    groupId: "frame",
  },
  {
    id: "image-comparison",
    flowKind: "operation-result",
    label: "Image Comparison Pack",
    description: "Compare the active image with a selected reference image.",
    sourceKinds: ["image"],
    outputKinds: ["image", "artifact", "variant"],
    providerIds: ["ffmpeg-visual-compare"],
    toolIds: ["ffmpeg"],
    actionId: "workspace-image-comparison-export",
    groupId: "frame",
    requiresComparisonReference: true,
  },
  {
    id: "audio-extract",
    flowKind: "operation-result",
    label: "Extract Audio",
    description: "Export the source audio track as a WAV asset.",
    sourceKinds: ["video", "audio"],
    outputKinds: ["audio"],
    providerIds: ["ffmpeg-export"],
    toolIds: ["ffmpeg"],
    actionId: "timeline-extract-audio",
    groupId: "audio",
  },
  {
    id: "audio-cleanup",
    flowKind: "operation-result",
    label: "Clean Audio",
    description: "Create a denoised or band-pass focused audio variant.",
    sourceKinds: ["video", "audio"],
    outputKinds: ["audio", "variant"],
    providerIds: ["ffmpeg-signal-recovery"],
    toolIds: ["ffmpeg"],
    actionId: "workspace-audio-cleanup-export",
    groupId: "audio",
  },
  {
    id: "band-pass-voice",
    flowKind: "operation-result",
    label: "Band-pass Voice",
    description: "Create a voice-focused audio variant with a constrained frequency pass.",
    sourceKinds: ["video", "audio"],
    outputKinds: ["audio", "variant"],
    providerIds: ["ffmpeg-signal-recovery"],
    toolIds: ["ffmpeg"],
    actionId: "workspace-band-pass-voice-export",
    groupId: "audio",
  },
  {
    id: "stem-separation",
    flowKind: "operation-result",
    label: "Separate Sources",
    description: "Create isolated stems for speech, ambience, or music review.",
    sourceKinds: ["video", "audio"],
    outputKinds: ["audio", "stem"],
    providerIds: ["source-separation-runner"],
    toolIds: ["demucs", "ffmpeg"],
    actionId: "workspace-stem-separation-export",
    groupId: "stems",
  },
];

export const CAPABILITY_FAMILIES: CapabilityFamilyMeta[] = [
  {
    id: "visual-structure",
    label: "Visual Structure",
    sourceKinds: ["video", "image"],
    primaryTool: "ffmpeg",
    requiredTools: ["ffmpeg"],
  },
  {
    id: "visual-forensics",
    label: "Visual Forensics",
    sourceKinds: ["video", "image"],
    primaryTool: "ffmpeg",
    requiredTools: ["ffmpeg"],
  },
  {
    id: "audio-signal",
    label: "Audio Signal",
    sourceKinds: ["video", "audio"],
    primaryTool: "ffmpeg",
    requiredTools: ["ffmpeg"],
  },
  {
    id: "audio-recovery",
    label: "Audio Recovery",
    sourceKinds: ["video", "audio"],
    primaryTool: "ffmpeg",
    requiredTools: ["ffmpeg"],
  },
  {
    id: "transcription",
    label: "Transcription",
    sourceKinds: ["video", "audio"],
    primaryTool: "transcript-runtime",
    requiredTools: ["transcript-runtime"],
  },
  {
    id: "speaker-analysis",
    label: "Speaker Analysis",
    sourceKinds: ["video", "audio"],
    primaryTool: "pyaudioanalysis",
    requiredTools: ["pyaudioanalysis", "ffmpeg"],
  },
  {
    id: "prosody-emotion",
    label: "Prosody & Emotion",
    sourceKinds: ["video", "audio"],
    primaryTool: "opensmile",
    requiredTools: ["opensmile"],
  },
  {
    id: "sound-classification",
    label: "Sound Classification",
    sourceKinds: ["video", "audio"],
    primaryTool: "yamnet",
    requiredTools: ["yamnet", "ffmpeg"],
  },
  {
    id: "source-separation",
    label: "Source Separation",
    sourceKinds: ["video", "audio"],
    primaryTool: "demucs",
    requiredTools: ["demucs", "ffmpeg"],
  },
  {
    id: "music-analysis",
    label: "Music Analysis",
    sourceKinds: ["video", "audio"],
    primaryTool: "librosa",
    requiredTools: ["librosa", "ffmpeg"],
  },
];

export const CAPABILITY_MODULE_GROUPS: Array<{
  capabilityId: CapabilityFamilyId;
  moduleIds: string[];
}> = [
  {
    capabilityId: "visual-structure",
    moduleIds: [
      "frame-consistency",
      "lighting-consistency",
      "background-consistency",
      "occlusion-inconsistency",
      "object-insert-remove-anomaly",
      "temporal-noise-pattern",
      "motion-anomaly",
    ],
  },
  {
    capabilityId: "visual-forensics",
    moduleIds: [
      "perceptual-duplicate-frame",
      "optical-flow-tracking",
      "compression-signature-mapping",
      "metadata-provenance-audit",
      "reference-quality-check",
      "visual-signal-amplification",
      "color-channel-isolation",
      "gamma-scan",
      "contrast-scan",
      "edge-enhancement",
      "histogram-equalization",
      "hidden-detail-reveal",
    ],
  },
  {
    capabilityId: "audio-signal",
    moduleIds: ["signal-health", "spectral-artifacts"],
  },
  {
    capabilityId: "audio-recovery",
    moduleIds: [
      "signal-recovery",
      "band-pass-exploration",
      "spectrogram-guided-recovery",
      "hidden-pattern-extraction",
      "frequency-shift-reversal",
      "phase-recovery-experiment",
    ],
  },
  {
    capabilityId: "transcription",
    moduleIds: ["transcription", "transcript-support"],
  },
  {
    capabilityId: "speaker-analysis",
    moduleIds: ["speaker-diarization"],
  },
  {
    capabilityId: "prosody-emotion",
    moduleIds: ["prosody", "emotion"],
  },
  {
    capabilityId: "sound-classification",
    moduleIds: ["sound-events"],
  },
  {
    capabilityId: "source-separation",
    moduleIds: ["source-separation"],
  },
  {
    capabilityId: "music-analysis",
    moduleIds: ["music-rhythm-tonal"],
  },
];

export const LAB_ANALYSIS_MODULE_REQUIREMENTS: Record<string, LabAnalysisModuleRequirementMeta> = {
  "perceptual-duplicate-frame": {
    id: "perceptual-duplicate-frame",
    capabilityId: "visual-forensics",
    requiredToolIds: ["ffmpeg"],
    optionalToolIds: ["visual-forensics-py"],
    sourceKinds: ["video"],
    status: "implemented",
    reportSection: "Visual forensics",
  },
  "optical-flow-tracking": {
    id: "optical-flow-tracking",
    capabilityId: "visual-forensics",
    requiredToolIds: ["ffmpeg"],
    optionalToolIds: ["visual-forensics-py", "raft-optical-flow"],
    sourceKinds: ["video"],
    status: "implemented",
    reportSection: "Visual forensics",
  },
  "compression-signature-mapping": {
    id: "compression-signature-mapping",
    capabilityId: "visual-forensics",
    requiredToolIds: ["ffmpeg"],
    optionalToolIds: ["mediainfo"],
    sourceKinds: ["video"],
    status: "implemented",
    reportSection: "Visual forensics",
  },
  "metadata-provenance-audit": {
    id: "metadata-provenance-audit",
    capabilityId: "visual-forensics",
    requiredToolIds: ["ffmpeg"],
    optionalToolIds: ["exiftool", "mediainfo"],
    sourceKinds: ["video", "image"],
    status: "implemented",
    reportSection: "Visual forensics",
  },
  "reference-quality-check": {
    id: "reference-quality-check",
    capabilityId: "visual-forensics",
    requiredToolIds: ["ffmpeg"],
    optionalToolIds: ["visual-forensics-py", "ffmpeg-libvmaf"],
    sourceKinds: ["video", "image"],
    status: "implemented",
    reportSection: "Visual forensics",
  },
  "ai-artifact-detection": {
    id: "ai-artifact-detection",
    capabilityId: "visual-forensics",
    requiredToolIds: [],
    optionalToolIds: [],
    sourceKinds: ["video", "image"],
    status: "gated",
    reportSection: "Visual forensics",
  },
};
