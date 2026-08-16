import type {
  TranscriptFileTranscriptionRequest,
  TranscriptFileTranscriptionResult,
  TranscriptManagedModelStatus,
  TranscriptRuntimeStatus,
} from "./transcript.js";

export type RoomToolOperationName =
  | "resolve-paths"
  | "ensure-dir"
  | "delete-path"
  | "download-file"
  | "transcript-status"
  | "transcript-list-models"
  | "transcript-transcribe-file"
  | "tool-probe"
  | "tool-check-for-updates"
  | "tool-install"
  | "tool-update"
  | "tool-run";

export interface RoomToolRuntimePaths {
  roomId: string;
  installedDir: string;
  storageDir: string;
  projectsDir: string;
  packageToolsDir: string;
  packageToolRuntimeDir: string;
  toolRuntimeDir: string;
  toolStatePath: string;
}

export interface RoomToolStatus {
  toolId: string;
  installed: boolean;
  version: string | null;
  binaryPath: string | null;
  lastError?: string | null;
  releaseTag?: string | null;
  releaseName?: string | null;
  installDir?: string | null;
  companionPaths?: Record<string, string>;
  details?: Record<string, unknown>;
}

export interface RoomToolUpdateCheck {
  toolId: string;
  installedVersion: string | null;
  latestVersion: string | null;
  latestReleaseTag: string | null;
  latestReleaseName: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
}

export interface RoomFileDownloadResult {
  url: string;
  path: string;
  fileName: string;
  bytesWritten: number;
  contentType: string | null;
}

export interface RoomToolRunResult {
  toolId: string;
  binaryPath: string;
  exitCode: number | null;
  cancelled: boolean;
  stdout: string;
  stderr: string;
}

interface RoomToolRequestBase {
  roomId: string;
  requestId?: string | null;
  jobId?: string | null;
}

export interface RoomToolResolvePathsRequest extends RoomToolRequestBase {
  operation: "resolve-paths";
}

export interface RoomToolEnsureDirRequest extends RoomToolRequestBase {
  operation: "ensure-dir";
  targetPath: string;
}

export interface RoomToolDeletePathRequest extends RoomToolRequestBase {
  operation: "delete-path";
  targetPath: string;
  recursive?: boolean;
}

export interface RoomToolDownloadFileRequest extends RoomToolRequestBase {
  operation: "download-file";
  url: string;
  destinationPath: string;
  overwrite?: boolean;
  headers?: Record<string, string>;
}

export interface RoomToolTranscriptStatusRequest extends RoomToolRequestBase {
  operation: "transcript-status";
}

export interface RoomToolTranscriptListModelsRequest extends RoomToolRequestBase {
  operation: "transcript-list-models";
}

export interface RoomToolTranscriptTranscribeFileRequest
  extends RoomToolRequestBase, Omit<TranscriptFileTranscriptionRequest, "roomId"> {
  operation: "transcript-transcribe-file";
}

export interface RoomToolToolRequestBase extends RoomToolRequestBase {
  toolId: string;
}

export interface RoomToolProbeRequest extends RoomToolToolRequestBase {
  operation: "tool-probe";
}

export interface RoomToolCheckForUpdatesRequest extends RoomToolToolRequestBase {
  operation: "tool-check-for-updates";
  installedVersion?: string | null;
  installedReleaseTag?: string | null;
  installedReleaseName?: string | null;
}

export interface RoomToolInstallRequest extends RoomToolToolRequestBase {
  operation: "tool-install";
}

export interface RoomToolUpdateRequest extends RoomToolToolRequestBase {
  operation: "tool-update";
}

export interface RoomToolRunRequest extends RoomToolToolRequestBase {
  operation: "tool-run";
  executableName?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string | null | undefined>;
  timeoutMs?: number;
}

export type RoomToolCallRequest =
  | RoomToolResolvePathsRequest
  | RoomToolEnsureDirRequest
  | RoomToolDeletePathRequest
  | RoomToolDownloadFileRequest
  | RoomToolTranscriptStatusRequest
  | RoomToolTranscriptListModelsRequest
  | RoomToolTranscriptTranscribeFileRequest
  | RoomToolProbeRequest
  | RoomToolCheckForUpdatesRequest
  | RoomToolInstallRequest
  | RoomToolUpdateRequest
  | RoomToolRunRequest;

export interface RoomToolCancelRequest {
  roomId: string;
  jobId: string;
  requestId?: string | null;
}

export interface RoomToolCallResult {
  success: boolean;
  operation: RoomToolOperationName;
  requestId?: string | null;
  jobId?: string | null;
  error?: string;
  errorKey?: string;
  paths?: RoomToolRuntimePaths;
  ensuredPath?: string;
  deletedPath?: string;
  download?: RoomFileDownloadResult;
  transcriptStatus?: TranscriptRuntimeStatus;
  transcriptModels?: TranscriptManagedModelStatus[];
  transcription?: TranscriptFileTranscriptionResult;
  tool?: RoomToolStatus;
  update?: RoomToolUpdateCheck;
  run?: RoomToolRunResult;
}

export interface RoomToolCancelResult {
  success: boolean;
  roomId: string;
  jobId: string;
  cancelled: boolean;
  requestId?: string | null;
  error?: string;
}

export type RoomToolProgressStage =
  | "queued"
  | "running"
  | "downloading"
  | "extracting"
  | "stdout"
  | "stderr"
  | "completed"
  | "failed"
  | "cancelled";

export interface RoomToolProgressEvent {
  roomId: string;
  operation: RoomToolOperationName | "tool-install" | "tool-update";
  requestId?: string | null;
  jobId: string;
  toolId?: string;
  stage: RoomToolProgressStage;
  message?: string;
  percent?: number;
  phaseLabel?: string | null;
  phasePercent?: number | null;
  phaseIndex?: number | null;
  phaseCount?: number | null;
  detailLines?: string[];
  bytesReceived?: number;
  bytesTotal?: number;
  chunk?: string;
  exitCode?: number | null;
  timestamp: number;
}
