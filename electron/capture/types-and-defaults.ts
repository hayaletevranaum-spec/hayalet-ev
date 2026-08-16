import { normalizeAppLanguage } from "../../shared/i18n/locale.js";
import {
  DEFAULT_AMBIENT_ACTIVE_WINDOW_MS,
  DEFAULT_AMBIENT_SILENCE_TIMEOUT_MS,
  DEFAULT_AMBIENT_WAKE_PHRASES,
  normalizeAmbientDurationMs,
  normalizeAmbientWakePhrases,
} from "../../shared/capture/ambient-defaults.js";
import {
  getTranscriptModelDescriptor,
  normalizeTranscriptModelVariant,
  resolveTranscriptModelId,
  resolveTranscriptSupportedLanguage,
} from "../../shared/transcript/model-catalog.js";
import type {
  CaptureAmbientListenerOptions,
  CaptureAmbientStatusPayload,
  CaptureActionOutcome,
  CaptureCompanionAmbientProfile,
  CaptureCompanionCommandProfile,
  CaptureCompanionTtsPayload,
  CaptureCompanionTorchPayload,
  CaptureCompanionTranscriptModelProfile,
  CaptureCompanionCommandEnvelope,
  CaptureCompanionCommandKind,
  CaptureAndroidPermissionStatus,
} from "../../src/types/capture.ts";
import type {
  TranscriptManagedModelId,
  TranscriptSupportedLanguage,
  TranscriptTargetId,
} from "../../src/types/transcript.ts";

export const CAPTURE_COMPANION_DIAGNOSTICS_MAX_LOG_ENTRIES = 400;

export const CAPTURE_SCRCPY_STARTUP_GRACE_MS = 1_200;
export const CAPTURE_SCRCPY_STOP_TIMEOUT_MS = 2_500;
export const CAPTURE_SCRCPY_LOG_LIMIT = 24;
export const CAPTURE_SCRCPY_CAMERA_SIZE = "640x480";
export const CAPTURE_SCRCPY_V4L2_BUFFER_MS = 0;
export const CAPTURE_SESSION_STALE_MS = 20_000;
export const CAPTURE_MEDIA_INGRESS_CHANNEL = "capture:media-ingress";
export const CAPTURE_DICTATION_STATUS_CHANNEL = "capture:dictation-status";
export const CAPTURE_AMBIENT_STATUS_CHANNEL = "capture:ambient-status";

export interface CompanionDiagnosticsStateEntry {
  key: string;
  value: string;
}

export interface CompanionDiagnosticsLogEntry {
  timestampMs: number | null;
  level: string;
  category: string;
  message: string;
  details: string | null;
}

export interface CompanionDiagnosticsShadowSnapshot {
  deviceId: string;
  generatedAtMs: number | null;
  receivedAtMs: number;
  stateEntries: CompanionDiagnosticsStateEntry[];
  logEntries: CompanionDiagnosticsLogEntry[];
  text: string;
}

export interface ResolvedCaptureSettings {
  preferredDeviceId: string | null;
  defaultLens: "back" | "front";
  photoQuality: "high" | "balanced";
  photoFlashMode: "off" | "auto" | "on";
  attachMode: "manual-sync" | "auto-stage";
  commandConfirmation: "toast" | "none";
  dictationLanguage: TranscriptSupportedLanguage;
  androidDictationBackend: CaptureCompanionTranscriptModelProfile["backend"];
  androidCompanionEnabled: boolean;
  androidTorchEnabled: boolean;
  ambientWakePhrases: string[];
  ambientActiveWindowMs: number;
  ambientSilenceTimeoutMs: number;
}

export type WhisperCompanionModelDescriptor = CaptureCompanionTranscriptModelProfile & {
  downloadUrl: string;
  installSource: "transcript-service";
  modelId: TranscriptManagedModelId;
};

export type DirectCompanionModelDescriptor = CaptureCompanionTranscriptModelProfile & {
  downloadUrl: string;
  installSource: "direct-download";
};

export type CompanionTranscriptModelDownloadDescriptor =
  WhisperCompanionModelDescriptor | DirectCompanionModelDescriptor;

export interface CompanionManifestRecord {
  applicationId?: unknown;
  mainActivity?: unknown;
  foregroundService?: unknown;
  versionName?: unknown;
  versionCode?: unknown;
  bridgePort?: unknown;
  commandPollIntervalMs?: unknown;
  previewMode?: unknown;
}

export interface CompanionBridgeSessionRecord {
  deviceId: string;
  appVersion: string | null;
  permissions: CaptureAndroidPermissionStatus;
  previewActive: boolean;
  target: string | null;
  transport: string | null;
  lastSeenAt: number;
}

export type PendingBridgeCommand = CaptureCompanionCommandEnvelope;
export type PendingBridgeTtsPayload = CaptureCompanionTtsPayload;
export type PendingBridgeTorchPayload = CaptureCompanionTorchPayload;

export interface CompanionBuildScriptEvent {
  type: "progress" | "plan" | "result" | "error";
  ok?: boolean;
  needsConfirmation?: boolean;
  message?: string;
  progress?: number;
  details?: string[];
}

export const CAPTURE_VOSK_MODEL_DESCRIPTORS: Record<
  TranscriptSupportedLanguage,
  DirectCompanionModelDescriptor
> = {
  tr: {
    backend: "vosk",
    modelId: "vosk-model-small-tr-0.3",
    fileName: "vosk-model-small-tr-0.3.zip",
    downloadUrl: "https://alphacephei.com/vosk/models/vosk-model-small-tr-0.3.zip",
    expectedSha1: "1bc2391ea03d6091c39c4ff42b627c811501d41f",
    expectedBytes: 36_855_784,
    language: "tr",
    variant: "light",
    archiveFormat: "zip-directory",
    installSource: "direct-download",
  },
  en: {
    backend: "vosk",
    modelId: "vosk-model-small-en-us-0.15",
    fileName: "vosk-model-small-en-us-0.15.zip",
    downloadUrl: "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip",
    expectedSha1: "4b5523d1db7688e31e44608cf96cdad92e4603e7",
    expectedBytes: 41_205_931,
    language: "en",
    variant: "light",
    archiveFormat: "zip-directory",
    installSource: "direct-download",
  },
};

export function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

export function normalizeAndroidDictationBackend(
  value: unknown
): CaptureCompanionTranscriptModelProfile["backend"] {
  void value;
  return "vosk";
}

export function normalizePhotoFlashMode(value: unknown): ResolvedCaptureSettings["photoFlashMode"] {
  return value === "auto" || value === "on" ? value : "off";
}

export function normalizeTranscriptTarget(value: unknown): TranscriptTargetId | null {
  const normalized = normalizeText(value);
  if (normalized === null) {
    return null;
  }

  if (normalized === "analyze-compose" || normalized === "assistant-opencode-native") {
    return normalized;
  }

  if (normalized.startsWith("room:")) {
    const roomId = normalizeText(normalized.slice("room:".length));
    return roomId === null ? null : `room:${roomId}`;
  }

  return null;
}

export function normalizeAmbientStatusState(
  value: unknown
): CaptureAmbientStatusPayload["status"] | null {
  const normalized = normalizeText(value);
  if (normalized === null) {
    return null;
  }

  switch (normalized) {
    case "started":
    case "wake-detected":
    case "capturing":
    case "transcribing":
    case "done":
    case "stopped":
    case "failed":
      return normalized;
    default:
      return null;
  }
}

export function normalizeModelLabel(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  return value.replaceAll("_", " ");
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

export function normalizeFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || Number.isFinite(value) === false) {
    return null;
  }

  return value;
}

export function normalizeFreeformText(value: unknown, maxChars: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const truncated = value.slice(0, maxChars).trimEnd();
  return truncated.trim() === "" ? null : truncated;
}

export function sanitizeCompanionDiagnosticsPathSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 96);
  return normalized === "" ? "android-companion" : normalized;
}

export function normalizeCompanionDiagnosticsStateEntries(
  value: unknown
): CompanionDiagnosticsStateEntry[] {
  if (Array.isArray(value) === false) {
    return [];
  }

  return value.flatMap((item): CompanionDiagnosticsStateEntry[] => {
    if (isRecord(item) === false) {
      return [];
    }

    const key = normalizeText(item["key"]);
    const entryValue = normalizeFreeformText(item["value"], 8_000);
    return key === null || entryValue === null ? [] : [{ key, value: entryValue }];
  });
}

export function normalizeCompanionDiagnosticsLogEntries(
  value: unknown
): CompanionDiagnosticsLogEntry[] {
  if (Array.isArray(value) === false) {
    return [];
  }

  return value
    .slice(-CAPTURE_COMPANION_DIAGNOSTICS_MAX_LOG_ENTRIES)
    .flatMap((item): CompanionDiagnosticsLogEntry[] => {
      if (isRecord(item) === false) {
        return [];
      }

      const message = normalizeFreeformText(item["message"], 16_000);
      if (message === null) {
        return [];
      }

      return [
        {
          timestampMs: normalizeFiniteNumber(item["timestampMs"]),
          level: normalizeText(item["level"]) ?? "INFO",
          category: normalizeText(item["category"]) ?? "general",
          message,
          details: normalizeFreeformText(item["details"], 32_000),
        },
      ];
    });
}

export function resolveCaptureSettings(settings: unknown): ResolvedCaptureSettings {
  const capture = isRecord(settings) && isRecord(settings["capture"]) ? settings["capture"] : null;
  const defaults = capture && isRecord(capture["defaults"]) ? capture["defaults"] : null;
  const providers = capture && isRecord(capture["providers"]) ? capture["providers"] : null;
  const general = isRecord(settings) && isRecord(settings["general"]) ? settings["general"] : null;
  const appLanguage = normalizeAppLanguage(general?.["language"]);
  const voiceCommands =
    isRecord(settings) && isRecord(settings["voiceCommands"]) ? settings["voiceCommands"] : null;
  const ambient =
    voiceCommands && isRecord(voiceCommands["ambient"]) ? voiceCommands["ambient"] : null;

  return {
    preferredDeviceId: normalizeText(defaults?.["preferredDeviceId"]),
    defaultLens: defaults?.["defaultLens"] === "front" ? "front" : "back",
    photoQuality: defaults?.["photoQuality"] === "balanced" ? "balanced" : "high",
    photoFlashMode: normalizePhotoFlashMode(
      defaults?.["photoFlashMode"] ?? (defaults?.["photoFlashEnabled"] === true ? "on" : "off")
    ),
    attachMode: defaults?.["attachMode"] === "auto-stage" ? "auto-stage" : "manual-sync",
    commandConfirmation: defaults?.["commandConfirmation"] === "none" ? "none" : "toast",
    dictationLanguage: resolveTranscriptSupportedLanguage(
      defaults?.["dictationLanguage"] ?? appLanguage
    ),
    androidDictationBackend: normalizeAndroidDictationBackend(
      defaults?.["androidDictationBackend"]
    ),
    androidCompanionEnabled: providers?.["androidCompanionEnabled"] !== false,
    androidTorchEnabled: providers?.["androidTorchEnabled"] === true,
    ambientWakePhrases: normalizeAmbientWakePhrases(
      ambient?.["wakePhrases"],
      DEFAULT_AMBIENT_WAKE_PHRASES
    ),
    ambientActiveWindowMs: normalizeAmbientDurationMs(
      ambient?.["activeWindowMs"],
      DEFAULT_AMBIENT_ACTIVE_WINDOW_MS,
      { min: 1_000, max: 30_000 }
    ),
    ambientSilenceTimeoutMs: normalizeAmbientDurationMs(
      ambient?.["silenceTimeoutMs"],
      DEFAULT_AMBIENT_SILENCE_TIMEOUT_MS,
      { min: 300, max: 10_000 }
    ),
  };
}

export function resolveAmbientCommandProfile(
  settings: ResolvedCaptureSettings,
  options: CaptureAmbientListenerOptions | undefined
): CaptureCompanionAmbientProfile {
  return {
    wakePhrases: normalizeAmbientWakePhrases(options?.wakePhrases, settings.ambientWakePhrases),
    activeWindowMs: normalizeAmbientDurationMs(
      options?.activeWindowMs,
      settings.ambientActiveWindowMs,
      { min: 1_000, max: 30_000 }
    ),
    silenceTimeoutMs: normalizeAmbientDurationMs(
      options?.silenceTimeoutMs,
      settings.ambientSilenceTimeoutMs,
      { min: 300, max: 10_000 }
    ),
  };
}

export function buildCompanionCommandProfile(
  settings: ResolvedCaptureSettings,
  transcriptModel: CaptureCompanionTranscriptModelProfile | null,
  options: { livePreview?: boolean } = {}
): CaptureCompanionCommandProfile {
  return {
    defaultLens: settings.defaultLens,
    photoQuality: settings.photoQuality,
    photoFlashMode: settings.photoFlashMode,
    attachMode: settings.attachMode,
    commandConfirmation: settings.commandConfirmation,
    androidDictationBackend: settings.androidDictationBackend,
    transcriptModel,
    torchEnabled: settings.androidTorchEnabled,
    livePreview: options.livePreview === true,
  };
}

export function resolveCompanionTranscriptModelProfile(
  settings: unknown,
  captureSettings: ResolvedCaptureSettings
): CaptureCompanionTranscriptModelProfile {
  const appSettings = isRecord(settings) ? settings : {};
  const capture = isRecord(appSettings["capture"]) ? appSettings["capture"] : {};
  const defaults = isRecord(capture["defaults"]) ? capture["defaults"] : {};
  const language = captureSettings.dictationLanguage;
  if (captureSettings.androidDictationBackend === "vosk") {
    const descriptor = CAPTURE_VOSK_MODEL_DESCRIPTORS[language];
    return {
      backend: descriptor.backend,
      modelId: descriptor.modelId,
      fileName: descriptor.fileName,
      expectedSha1: descriptor.expectedSha1,
      expectedBytes: descriptor.expectedBytes,
      language: descriptor.language,
      variant: descriptor.variant,
      archiveFormat: descriptor.archiveFormat,
    };
  }

  const variant = normalizeTranscriptModelVariant(
    defaults["androidTranscriptModelVariant"],
    "light"
  );
  const descriptor = getTranscriptModelDescriptor(resolveTranscriptModelId(language, variant));
  if (descriptor === null) {
    throw new Error("Android transcript model descriptor could not be resolved.");
  }

  return {
    backend: "whisper.cpp",
    modelId: descriptor.modelId,
    fileName: descriptor.fileName,
    expectedSha1: descriptor.expectedSha1,
    expectedBytes: descriptor.expectedBytes,
    language: descriptor.englishOnly === true ? "en" : language,
    variant: descriptor.variant,
    archiveFormat: "file",
  };
}

export function findTranscriptDescriptorByFileName(
  fileName: string
): CompanionTranscriptModelDownloadDescriptor | null {
  const voskDescriptor =
    Object.values(CAPTURE_VOSK_MODEL_DESCRIPTORS).find(
      (descriptor) => descriptor.fileName === fileName
    ) ?? null;
  if (voskDescriptor !== null) {
    return voskDescriptor;
  }

  const candidates = ["tiny", "base", "tiny.en", "base.en"] as const;
  const descriptor =
    candidates
      .map((modelId) => getTranscriptModelDescriptor(modelId))
      .find((candidate) => candidate?.fileName === fileName) ?? null;
  if (descriptor === null) {
    return null;
  }

  return {
    backend: "whisper.cpp",
    modelId: descriptor.modelId,
    fileName: descriptor.fileName,
    expectedSha1: descriptor.expectedSha1,
    expectedBytes: descriptor.expectedBytes,
    language: descriptor.englishOnly === true ? "en" : descriptor.locale,
    variant: descriptor.variant,
    archiveFormat: "file",
    downloadUrl: descriptor.downloadUrl,
    installSource: "transcript-service",
  };
}

export function resolveCaptureActionFromCommand(
  kind: CaptureCompanionCommandKind
): CaptureActionOutcome["action"] {
  switch (kind) {
    case "open-camera":
      return "start-analyze-session";
    case "close-camera":
      return "stop-analyze-session";
    case "capture-photo":
      return "capture-analyze-photo";
    case "retake-photo":
      return "retake-analyze-photo";
    case "start-dictation":
      return "start-analyze-dictation";
    case "stop-dictation":
      return "stop-analyze-dictation";
    case "start-ambient-listener":
      return "start-ambient-listener";
    case "stop-ambient-listener":
      return "stop-ambient-listener";
    case "set-torch":
      return "set-torch";
    case "start-tts":
      return "start-tts";
    case "stop-tts":
      return "stop-tts";
    default:
      throw new Error(`Unsupported capture companion command: ${String(kind)}`);
  }
}

export function isMediaCaptureCommand(kind: CaptureCompanionCommandKind): boolean {
  return kind === "capture-photo" || kind === "retake-photo";
}

export function getCommandRequestId(command: CaptureCompanionCommandEnvelope): string {
  return command.requestId ?? command.id;
}

export type { CaptureCompanionCommandKind };
