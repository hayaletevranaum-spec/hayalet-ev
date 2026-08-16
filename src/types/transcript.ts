export type TranscriptRoomTargetId = `room:${string}`;
export type TranscriptTargetId =
  "analyze-compose" | "assistant-opencode-native" | TranscriptRoomTargetId;
export type TranscriptDictationBackend = "whisper.cpp" | "vosk";
export type TranscriptModelArchiveFormat = "file" | "zip-directory";
export type TranscriptModelVariant = "light" | "full";
export type TranscriptSupportedLanguage = "tr" | "en";
export type TranscriptManagedModelId =
  "tiny" | "base" | "tiny.en" | "base.en" | "vosk-small-tr" | "vosk-small-en" | "vosk-full-en";

export type TranscriptIngressSource = "pc-mic" | "android-bridge" | "synthetic-test";
export type TranscriptIngressMetadata = Record<string, unknown>;

export type TranscriptRuntimeState = "ready" | "preparing" | "missing-runtime" | "error";

export interface TranscriptManagedModelDescriptor {
  modelId: TranscriptManagedModelId;
  backend: TranscriptDictationBackend;
  variant: TranscriptModelVariant;
  label: string;
  family: "multilingual" | "english";
  locale: TranscriptSupportedLanguage;
  englishOnly: boolean;
  fileName: string;
  downloadUrl: string;
  expectedSha1: string;
  expectedBytes: number | null;
  archiveFormat: TranscriptModelArchiveFormat;
  directoryName?: string | null;
}

export interface TranscriptManagedModelStatus extends TranscriptManagedModelDescriptor {
  installed: boolean;
  ready: boolean;
  path: string | null;
  sizeBytes: number | null;
  checksumValid: boolean;
  lastError: string | null;
}

export interface TranscriptRuntimeStatus {
  state: TranscriptRuntimeState;
  ready: boolean;
  backend: TranscriptDictationBackend;
  binaryPath: string | null;
  modelPath: string | null;
  modelId: string;
  modelLanguage: string;
  appLanguage: string;
  activeLanguage: TranscriptSupportedLanguage;
  activeVariant: TranscriptModelVariant;
  message: string | null;
}

export interface TranscriptTranscriptionRequest {
  requestId?: string | null;
  audioBase64: string;
  language?: string | null;
  modelId?: TranscriptManagedModelId | null;
  variant?: TranscriptModelVariant | null;
  source?: TranscriptIngressSource | null;
  metadata?: TranscriptIngressMetadata | null;
}

export interface TranscriptTranscriptionResult {
  success: boolean;
  text?: string;
  status: TranscriptRuntimeStatus;
  backend?: TranscriptDictationBackend;
  transcriptionMs?: number;
  error?: string;
}

export interface TranscriptFileTranscriptionRequest {
  audioPath: string;
  outputBasePath?: string | null;
  roomId?: string | null;
  language?: string | null;
  modelId?: TranscriptManagedModelId | null;
  variant?: TranscriptModelVariant | null;
  source?: TranscriptIngressSource | null;
  metadata?: TranscriptIngressMetadata | null;
}

export interface TranscriptFileTranscriptionResult {
  success: boolean;
  text?: string;
  transcriptPath?: string | null;
  status: TranscriptRuntimeStatus;
  backend?: TranscriptDictationBackend;
  transcriptionMs?: number;
  error?: string;
}

export interface TranscriptIngressPayload {
  requestId: string;
  createdAt: string;
  text: string;
  source: TranscriptIngressSource;
  target: TranscriptTargetId | null;
  isFinal: boolean;
  metadata: TranscriptIngressMetadata | null;
}

export interface TranscriptSubmitIngressRequest {
  requestId?: string | null;
  text: string;
  source?: TranscriptIngressSource | null;
  target?: TranscriptTargetId | null;
  isFinal?: boolean | null;
  metadata?: TranscriptIngressMetadata | null;
}

export interface TranscriptSubmitIngressResult {
  success: boolean;
  payload?: TranscriptIngressPayload;
  error?: string;
}

export interface TranscriptModelMutationResult {
  success: boolean;
  model?: TranscriptManagedModelStatus;
  error?: string;
}
