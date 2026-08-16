import type {
  TranscriptManagedModelId,
  TranscriptModelVariant,
  TranscriptRuntimeStatus,
  TranscriptSupportedLanguage,
  TranscriptTargetId,
} from "./transcript.js";
import type { TtsLanguage, TtsManagedModelId } from "./tts.js";

export type CaptureAndroidHostState =
  | "checking"
  | "missing-adb"
  | "no-devices"
  | "ready"
  | "multiple-devices"
  | "unauthorized"
  | "offline"
  | "reverse-conflict"
  | "package-query-failed"
  | "error";

export type CaptureAndroidDeviceConnectionState = "device" | "unauthorized" | "offline" | "unknown";

export type CaptureAndroidTransportKind = "usb" | "wireless" | "unknown";

export type CaptureAndroidCompanionState = "unknown" | "not-installed" | "installed" | "outdated";

export type CaptureAndroidPermissionState = "granted" | "denied" | "unknown";

export interface CaptureAndroidPermissionStatus {
  camera: CaptureAndroidPermissionState;
  microphone: CaptureAndroidPermissionState;
}

export type CaptureAndroidBridgeDeviceState = "waiting" | "connected";

export interface CaptureAndroidDeviceStatus {
  deviceId: string;
  label: string;
  model: string | null;
  transport: CaptureAndroidTransportKind;
  connectionState: CaptureAndroidDeviceConnectionState;
  selected: boolean;
  companionState: CaptureAndroidCompanionState;
  companionVersion: string | null;
  bridgeState: CaptureAndroidBridgeDeviceState;
  permissions: CaptureAndroidPermissionStatus;
}

export type CaptureAndroidArtifactBuildState =
  "missing" | "build-blocked" | "source-ready" | "artifact-ready";

export interface CaptureAndroidArtifactStatus {
  buildState: CaptureAndroidArtifactBuildState;
  applicationId: string;
  mainActivity: string;
  versionName: string | null;
  versionCode: number | null;
  apkPath: string | null;
  builtAt: string | null;
  sourceManifestPath: string;
  bridgePort: number;
}

export interface CaptureAndroidStatus {
  hostState: CaptureAndroidHostState;
  adbPath: string | null;
  selectedDeviceId: string | null;
  companionPackage: string;
  previewMode: "scrcpy-camera";
  reverseState: "not-configured" | "ready" | "conflict" | "error";
  pairingHint: string | null;
  message: string | null;
  devices: CaptureAndroidDeviceStatus[];
  artifact: CaptureAndroidArtifactStatus;
}

export interface CaptureTranscriptStatusSnapshot {
  appLanguage: string;
  variant: TranscriptModelVariant;
  runtime: TranscriptRuntimeStatus | null;
}

export interface CaptureImportedAsset {
  name: string;
  originalName: string;
  path: string;
  importedAt: number;
}

export interface CaptureMediaIngressPayload {
  requestId: string;
  createdAt: string;
  source: "android-bridge";
  target: TranscriptTargetId;
  asset: CaptureImportedAsset;
  metadata: Record<string, unknown> | null;
}

export interface CaptureDictationStatusPayload {
  requestId: string;
  createdAt: string;
  source: "android-bridge";
  target: TranscriptTargetId;
  deviceId: string | null;
  status: "started" | "transcribing" | "done" | "failed";
  message: string;
}

export type CaptureAmbientStatusState =
  "started" | "wake-detected" | "capturing" | "transcribing" | "done" | "stopped" | "failed";

export interface CaptureAmbientStatusPayload {
  requestId: string;
  createdAt: string;
  source: "android-bridge";
  target: TranscriptTargetId;
  deviceId: string | null;
  status: CaptureAmbientStatusState;
  message: string;
  transcript?: string | null;
  metadata?: Record<string, unknown> | null;
}

export type CaptureCompanionCommandKind =
  | "open-camera"
  | "capture-photo"
  | "retake-photo"
  | "close-camera"
  | "start-dictation"
  | "stop-dictation"
  | "start-ambient-listener"
  | "stop-ambient-listener"
  | "set-torch"
  | "start-tts"
  | "stop-tts";

export interface CaptureCompanionTorchPayload {
  enabled: boolean;
}

export interface CaptureCompanionTtsProfile {
  engine: "sherpa-onnx";
  modelId: TtsManagedModelId;
  language: TtsLanguage;
  voice: string;
  sampleRate: number | null;
}

export interface CaptureCompanionTtsPayload {
  text: string;
  language: TtsLanguage;
  modelId: TtsManagedModelId;
  profile: CaptureCompanionTtsProfile;
}

export interface CaptureCompanionAmbientProfile {
  wakePhrases: string[];
  activeWindowMs: number;
  silenceTimeoutMs: number;
}

export interface CaptureCompanionTranscriptModelProfile {
  backend: "whisper.cpp" | "vosk";
  modelId: TranscriptManagedModelId | "vosk-model-small-tr-0.3" | "vosk-model-small-en-us-0.15";
  fileName: string;
  expectedSha1: string;
  expectedBytes: number | null;
  language: TranscriptSupportedLanguage;
  variant: TranscriptModelVariant;
  archiveFormat: "file" | "zip-directory";
}

export interface CaptureCompanionCommandProfile {
  defaultLens: "back" | "front";
  photoQuality: "balanced" | "high";
  photoFlashMode?: "off" | "auto" | "on" | null;
  attachMode: "manual-sync" | "auto-stage";
  commandConfirmation: "none" | "toast";
  androidDictationBackend: "whisper.cpp" | "vosk";
  transcriptModel: CaptureCompanionTranscriptModelProfile | null;
  torchEnabled?: boolean | null;
  livePreview?: boolean | null;
}

export interface CaptureCompanionCommandEnvelope {
  id: string;
  kind: CaptureCompanionCommandKind;
  target: TranscriptTargetId;
  requestId?: string | null;
  createdAt: number;
  profile: CaptureCompanionCommandProfile | null;
  ambient?: CaptureCompanionAmbientProfile | null;
  torch?: CaptureCompanionTorchPayload | null;
  tts?: CaptureCompanionTtsPayload | null;
}

export interface CaptureTargetActionOptions {
  target?: TranscriptTargetId | null;
  requestId?: string | null;
  deviceId?: string | null;
  activeTab?: "image" | "dictate" | "ambient" | "tts" | "logs" | null;
}

export interface CaptureAmbientListenerOptions extends CaptureTargetActionOptions {
  wakePhrases?: string[] | null;
  activeWindowMs?: number | null;
  silenceTimeoutMs?: number | null;
}

export interface CaptureTorchOptions extends CaptureTargetActionOptions {
  enabled?: boolean | null;
}

export type CaptureAnalyzeSessionState =
  "idle" | "pending-launch" | "ready" | "capture-requested" | "result-ready" | "error";

export type CaptureScrcpySessionMode = "camera-feed" | "interactive-mirror";

export interface CaptureScrcpyPreviewVideoStatus {
  source: "v4l2" | "mjpeg-stream";
  devicePath: string;
  streamUrl?: string | null;
  contentType?: string | null;
  label: string;
  width: number;
  height: number;
  fps: number;
}

export type CaptureAnalyzePreviewVideoStatus = CaptureScrcpyPreviewVideoStatus;

export interface CaptureScrcpyActiveSessionStatus {
  mode: CaptureScrcpySessionMode;
  deviceId: string;
  target: TranscriptTargetId | null;
  requestId: string | null;
  startedAt: number;
  previewVideo: CaptureScrcpyPreviewVideoStatus | null;
}

export interface CaptureScrcpyStatus {
  available: boolean;
  version: string | null;
  activeSession: CaptureScrcpyActiveSessionStatus | null;
  mode: CaptureScrcpySessionMode | null;
  deviceId: string | null;
  target: TranscriptTargetId | null;
  startedAt: number | null;
  previewVideo: CaptureScrcpyPreviewVideoStatus | null;
  lastLogs: string[];
  lastError: string | null;
  setupHint: string | null;
}

export type CaptureHostDependencyState = "ready" | "partial" | "missing" | "blocked";

export interface CaptureHostToolDependencyStatus {
  state: CaptureHostDependencyState;
  path: string | null;
  version: string | null;
  message: string | null;
  installable: boolean;
  managedPath: string | null;
}

export interface CaptureAndroidBuildDependencyStatus {
  state: CaptureHostDependencyState;
  javaHome: string | null;
  androidSdkRoot: string | null;
  needsConfirmation: boolean;
  message: string | null;
  details: string[];
  installable: boolean;
}

export interface CaptureV4l2LoopbackDependencyStatus extends CaptureHostToolDependencyStatus {
  required: boolean;
  moduleLoaded: boolean;
  modulePath: string | null;
  controlPath: string | null;
  devicePath: string | null;
  setupCommand: string | null;
}

export interface CaptureHostDependenciesStatus {
  adb: CaptureHostToolDependencyStatus;
  scrcpy: CaptureHostToolDependencyStatus;
  v4l2Loopback: CaptureV4l2LoopbackDependencyStatus;
  ffmpeg: CaptureHostToolDependencyStatus & {
    ffprobePath: string | null;
    managedDir: string | null;
  };
  androidBuild: CaptureAndroidBuildDependencyStatus;
}

export interface CaptureAnalyzeSessionStatus {
  state: CaptureAnalyzeSessionState;
  target: "analyze-compose";
  deviceId: string | null;
  previewMode: "scrcpy-camera";
  previewVideo: CaptureAnalyzePreviewVideoStatus | null;
  pendingCommand: CaptureCompanionCommandKind | null;
  pendingInboxCount: number;
  lastCaptureAt: number | null;
  latestAsset: CaptureImportedAsset | null;
  message: string | null;
}

export interface CaptureBridgeStatus {
  state: "starting" | "ready" | "error";
  port: number;
  registeredDeviceId: string | null;
  lastSeenAt: number | null;
  lastError: string | null;
}

export interface CaptureOperationStatus {
  state: "idle" | "running" | "success" | "error" | "needs-confirmation";
  action: CaptureHostAction | null;
  message: string | null;
  progress: number | null;
  details: string[];
  updatedAt: number | null;
}

export interface CaptureServiceStatus {
  checkedAt: number;
  transcript: CaptureTranscriptStatusSnapshot;
  hostDependencies: CaptureHostDependenciesStatus;
  android: CaptureAndroidStatus;
  scrcpy: CaptureScrcpyStatus;
  bridge: CaptureBridgeStatus;
  analyze: CaptureAnalyzeSessionStatus;
  operation: CaptureOperationStatus;
}

export type CaptureHostAction =
  | "prepare-host-dependencies"
  | "install-companion"
  | "connect-device"
  | "disconnect-device"
  | "launch-companion"
  | "start-analyze-session"
  | "stop-analyze-session"
  | "capture-analyze-photo"
  | "retake-analyze-photo"
  | "start-analyze-dictation"
  | "stop-analyze-dictation"
  | "cancel-analyze-dictation"
  | "start-camera-feed"
  | "stop-camera-feed"
  | "start-interactive-mirror"
  | "stop-interactive-mirror"
  | "start-analyze-preview"
  | "stop-analyze-preview"
  | "start-ambient-listener"
  | "stop-ambient-listener"
  | "set-torch"
  | "start-tts"
  | "stop-tts";

export interface CaptureActionOutcome {
  action: CaptureHostAction;
  ok: boolean;
  message: string;
  status: CaptureServiceStatus;
}
