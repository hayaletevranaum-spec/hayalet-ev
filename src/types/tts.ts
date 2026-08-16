export type TtsMode = "local" | "android";
export type TtsLanguage = "tr" | "en";
export type TtsTargetId = "analyze-compose" | `room:${string}`;
export type TtsManagedModelId = "tr_TR-dfki-medium" | "en_US-lessac-medium";
export type TtsEngine = "sherpa-onnx";

export type TtsStatusState = "queued" | "preparing" | "playing" | "done" | "stopped" | "failed";

export interface TtsModelFileDescriptor {
  fileName: string;
  downloadUrl: string;
  expectedBytes: number | null;
  expectedSha1?: string | null;
}

export interface TtsModelDescriptor {
  modelId: TtsManagedModelId;
  engine: TtsEngine;
  language: TtsLanguage;
  label: string;
  voice: string;
  sampleRate: number | null;
  licenseUrl: string | null;
  archive: TtsModelFileDescriptor | null;
  dataDirName: string | null;
  files: {
    model: TtsModelFileDescriptor;
    tokens: TtsModelFileDescriptor | null;
    config: TtsModelFileDescriptor | null;
  };
}

export interface TtsManagedModelStatus extends TtsModelDescriptor {
  installed: boolean;
  ready: boolean;
  path: string | null;
  sizeBytes: number | null;
  lastError: string | null;
}

export interface TtsRequest {
  requestId?: string | null;
  text: string;
  target?: TtsTargetId | null;
  mode?: TtsMode | null;
  language?: TtsLanguage | null;
  modelId?: TtsManagedModelId | null;
  metadata?: Record<string, unknown> | null;
}

export interface TtsStatus {
  requestId: string;
  target: TtsTargetId;
  mode: TtsMode;
  language: TtsLanguage;
  modelId: TtsManagedModelId;
  status: TtsStatusState;
  progress: number | null;
  message: string;
  error: string | null;
  audioPath: string | null;
  source: "local" | "android-bridge";
  createdAt: string;
  updatedAt: string;
}

export interface TtsRuntimeStatus {
  mode: TtsMode;
  language: TtsLanguage;
  active: TtsStatus | null;
  local: {
    ready: boolean;
    runtimeAvailable: boolean;
    runtimePath: string | null;
    modelPath: string | null;
    modelId: TtsManagedModelId;
    message: string | null;
  };
  android: {
    ready: boolean;
    deviceId: string | null;
    message: string | null;
  };
  models: TtsManagedModelStatus[];
}

export interface TtsSpeakResult {
  requestId: string;
  status: TtsStatus;
  runtime: TtsRuntimeStatus;
}

export interface TtsStopResult {
  requestId: string;
  status: TtsStatus;
  runtime: TtsRuntimeStatus;
}

export interface TtsInstallModelResult {
  success: boolean;
  model: TtsManagedModelStatus;
  error: string | null;
}

export interface TtsAndroidStatusPayload {
  requestId: string;
  target: TtsTargetId;
  deviceId: string | null;
  status: TtsStatusState;
  message: string;
  progress?: number | null;
  language?: TtsLanguage | null;
  modelId?: TtsManagedModelId | null;
  error?: string | null;
}
