import type { LabSourceDrafts } from "./lab-types.js";

export type LabMode = "normal";
export type LabYoutubeImportStatus = "idle" | "parsing" | "ready" | "error";

export interface LabYoutubeImportPreview {
  title?: string;
  duration?: number;
  thumbnail?: string;
  uploader?: string;
  webpageUrl?: string;
}

export type LabYoutubeImportFormatKind = "video" | "audio" | "muxed" | "unknown";

export interface LabYoutubeImportFormat {
  formatId: string;
  label: string;
  kind: LabYoutubeImportFormatKind;
  extension?: string | null;
  resolution?: string | null;
  fps?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  bitrateKbps?: number | null;
  filesizeBytes?: number | null;
  filesizeApproxBytes?: number | null;
  note?: string | null;
}

export interface LabYoutubeImportState {
  url: string | null;
  status: LabYoutubeImportStatus;
  preview: LabYoutubeImportPreview | null;
  formats: LabYoutubeImportFormat[];
  selectedVideoFormatId: string | null;
  selectedAudioFormatId: string | null;
}

export type LabProjectImportKind = "video" | "audio" | "image";
export type LabProjectImportMethod = "local" | "url" | "youtube";
export type LabProjectImportReviewFocus = "idle" | "draft" | "running" | "completed";
export type LabProjectImportUrlCheckStatus = "idle" | "checking" | "ready" | "error";

export interface LabProjectImportUrlCheckState {
  status: LabProjectImportUrlCheckStatus;
  url: string | null;
  isYoutube: boolean | null;
  kind: LabProjectImportKind | null;
  error: string | null;
}

export interface LabProjectImportUiState {
  activeKind: LabProjectImportKind;
  methods: Record<LabProjectImportKind, LabProjectImportMethod>;
  drafts: Record<LabProjectImportKind, LabSourceDrafts>;
  urlCheck: LabProjectImportUrlCheckState;
  reviewFocus: LabProjectImportReviewFocus;
  lastAction: string | null;
  lastRequestId: string | null;
}
