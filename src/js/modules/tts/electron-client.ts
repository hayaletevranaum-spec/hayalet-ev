import type { OperationCapability, OperationOwner } from "../../../types/operations.js";
import type {
  TtsInstallModelResult,
  TtsManagedModelId,
  TtsMode,
  TtsRequest,
  TtsRuntimeStatus,
  TtsSpeakResult,
  TtsStatus,
  TtsStopResult,
} from "../../../types/tts.js";
import {
  acquireOperationCapability,
  releaseOperationCapability,
} from "../operations/electron-client.js";

const FALLBACK_RUNTIME_STATUS: TtsRuntimeStatus = {
  mode: "local",
  language: "tr",
  active: null,
  local: {
    ready: false,
    runtimeAvailable: false,
    runtimePath: null,
    modelPath: null,
    modelId: "tr_TR-dfki-medium",
    message: "Electron TTS bridge is unavailable.",
  },
  android: {
    ready: false,
    deviceId: null,
    message: "Electron TTS bridge is unavailable.",
  },
  models: [],
};

let activeAudioContext: AudioContext | null = null;
let activeAudioSource: AudioBufferSourceNode | null = null;
let ttsOperationStatusSubscriptionReady = false;
const activeTtsOperationLocks = new Map<
  string,
  {
    capability: OperationCapability;
    owner: OperationOwner;
  }
>();

function getElectronApi(): typeof window.electronAPI | undefined {
  return window.electronAPI;
}

function normalizeTtsStatus(value: unknown): TtsStatus | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "requestId" in value &&
    "target" in value &&
    "status" in value
  ) {
    return value as TtsStatus;
  }

  return null;
}

function normalizeRuntimeStatus(value: unknown): TtsRuntimeStatus {
  if (
    typeof value === "object" &&
    value !== null &&
    "mode" in value &&
    "language" in value &&
    "local" in value &&
    "android" in value
  ) {
    return value as TtsRuntimeStatus;
  }

  return FALLBACK_RUNTIME_STATUS;
}

function normalizeSpeakResult(value: unknown, requestId: string): TtsSpeakResult {
  if (
    typeof value === "object" &&
    value !== null &&
    "requestId" in value &&
    "status" in value &&
    "runtime" in value
  ) {
    const result = value as TtsSpeakResult;
    return {
      requestId: result.requestId,
      status: normalizeTtsStatus(result.status) ?? createFallbackStatus(requestId),
      runtime: normalizeRuntimeStatus(result.runtime),
    };
  }

  return {
    requestId,
    status: createFallbackStatus(requestId),
    runtime: FALLBACK_RUNTIME_STATUS,
  };
}

function normalizeStopResult(value: unknown, requestId: string): TtsStopResult {
  if (
    typeof value === "object" &&
    value !== null &&
    "requestId" in value &&
    "status" in value &&
    "runtime" in value
  ) {
    const result = value as TtsStopResult;
    return {
      requestId: result.requestId,
      status: normalizeTtsStatus(result.status) ?? createFallbackStatus(requestId),
      runtime: normalizeRuntimeStatus(result.runtime),
    };
  }

  return {
    requestId,
    status: createFallbackStatus(requestId),
    runtime: FALLBACK_RUNTIME_STATUS,
  };
}

function createFallbackStatus(requestId: string): TtsStatus {
  const timestamp = new Date().toISOString();
  return {
    requestId,
    target: "analyze-compose",
    mode: "local",
    language: "tr",
    modelId: "tr_TR-dfki-medium",
    status: "failed",
    progress: null,
    message: "Electron TTS bridge is unavailable.",
    error: "Electron TTS bridge is unavailable.",
    audioPath: null,
    source: "local",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function isTerminalTtsStatus(status: TtsStatus["status"]): boolean {
  return status === "done" || status === "stopped" || status === "failed";
}

function isOperationManagedRequest(request: TtsRequest): boolean {
  return request.metadata?.["operationManaged"] === true;
}

function resolveTtsOperationCapability(mode: TtsMode): OperationCapability {
  return mode === "android" ? "android-tts" : "local-tts";
}

function resolveTtsOperationOwner(request: TtsRequest): OperationOwner {
  const target = request.target ?? "analyze-compose";
  if (target === "analyze-compose") {
    return {
      id: "analyze-room",
      label: "Analyze Room",
    };
  }

  if (target.startsWith("room:")) {
    const roomId = target.slice("room:".length).trim();
    return {
      id: target,
      label: roomId === "" ? "Room" : `Room ${roomId}`,
      ...(roomId !== "" ? { roomId } : {}),
    };
  }

  return {
    id: `tts:${target}`,
    label: "TTS",
  };
}

function createOperationBlockedStatus(
  requestId: string,
  request: TtsRequest,
  runtime: TtsRuntimeStatus,
  mode: TtsMode,
  message: string
): TtsStatus {
  const timestamp = new Date().toISOString();
  return {
    requestId,
    target: request.target ?? "analyze-compose",
    mode,
    language: request.language ?? runtime.language,
    modelId: request.modelId ?? runtime.local.modelId,
    status: "failed",
    progress: null,
    message,
    error: message,
    audioPath: null,
    source: mode === "android" ? "android-bridge" : "local",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function releaseTtsOperationLock(requestId: string): Promise<void> {
  const lock = activeTtsOperationLocks.get(requestId);
  if (lock === undefined) {
    return;
  }

  activeTtsOperationLocks.delete(requestId);
  await releaseOperationCapability(lock.capability, lock.owner);
}

function ensureTtsOperationStatusSubscription(): void {
  if (ttsOperationStatusSubscriptionReady) {
    return;
  }

  const api = getElectronApi();
  if (typeof api?.["ttsOnStatus"] !== "function") {
    return;
  }

  ttsOperationStatusSubscriptionReady = true;
  api["ttsOnStatus"]((payload: unknown) => {
    const status = normalizeTtsStatus(payload);
    if (status !== null && isTerminalTtsStatus(status.status)) {
      void releaseTtsOperationLock(status.requestId);
    }
  });
}

async function acquireTtsOperationLock(
  request: TtsRequest,
  mode: TtsMode
): Promise<
  | { success: true; capability: OperationCapability; owner: OperationOwner }
  | { success: false; error: string }
> {
  const capability = resolveTtsOperationCapability(mode);
  const owner = resolveTtsOperationOwner(request);
  const outcome = await acquireOperationCapability(capability, owner);
  if (outcome.success !== true) {
    return {
      success: false,
      error: outcome.error,
    };
  }

  return {
    success: true,
    capability,
    owner,
  };
}

export async function getTtsStatus(): Promise<TtsRuntimeStatus> {
  const api = getElectronApi();
  if (typeof api?.["ttsStatus"] !== "function") {
    return FALLBACK_RUNTIME_STATUS;
  }

  return normalizeRuntimeStatus(await api["ttsStatus"]());
}

export async function speakText(request: TtsRequest): Promise<TtsSpeakResult> {
  const api = getElectronApi();
  const requestId =
    typeof request.requestId === "string" && request.requestId.trim() !== ""
      ? request.requestId.trim()
      : crypto.randomUUID();
  const normalizedRequest: TtsRequest = {
    ...request,
    requestId,
    target: request.target ?? "analyze-compose",
  };

  if (typeof api?.["ttsSpeak"] !== "function") {
    return {
      requestId,
      status: createFallbackStatus(requestId),
      runtime: FALLBACK_RUNTIME_STATUS,
    };
  }

  const runtime = await getTtsStatus();
  const requestedMode =
    normalizedRequest.mode === "android" || normalizedRequest.mode === "local"
      ? normalizedRequest.mode
      : runtime.mode;
  const operation =
    isOperationManagedRequest(normalizedRequest) === true
      ? null
      : await acquireTtsOperationLock(normalizedRequest, requestedMode);
  if (operation !== null && operation.success !== true) {
    return {
      requestId,
      status: createOperationBlockedStatus(
        requestId,
        normalizedRequest,
        runtime,
        requestedMode,
        operation.error
      ),
      runtime,
    };
  }
  if (operation !== null) {
    activeTtsOperationLocks.set(requestId, {
      capability: operation.capability,
      owner: operation.owner,
    });
    ensureTtsOperationStatusSubscription();
  }

  const result = normalizeSpeakResult(await api["ttsSpeak"](normalizedRequest), requestId);
  if (isTerminalTtsStatus(result.status.status)) {
    await releaseTtsOperationLock(requestId);
  }
  void playLocalAudio(result.status);
  return result;
}

export async function stopSpeech(requestId: string): Promise<TtsStopResult> {
  const api = getElectronApi();
  await stopLocalAudio();
  if (typeof api?.["ttsStop"] !== "function") {
    await releaseTtsOperationLock(requestId);
    return {
      requestId,
      status: createFallbackStatus(requestId),
      runtime: FALLBACK_RUNTIME_STATUS,
    };
  }

  const result = normalizeStopResult(await api["ttsStop"](requestId), requestId);
  if (isTerminalTtsStatus(result.status.status)) {
    await releaseTtsOperationLock(requestId);
  }
  return result;
}

function getAudioContextConstructor(): typeof AudioContext | null {
  const browserWindow = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return browserWindow.AudioContext ?? browserWindow.webkitAudioContext ?? null;
}

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

async function stopLocalAudio(): Promise<void> {
  const source = activeAudioSource;
  const context = activeAudioContext;
  activeAudioSource = null;
  activeAudioContext = null;

  if (source !== null) {
    runCatching(() => {
      source.stop();
      source.disconnect();
    });
  }

  if (context !== null && context.state !== "closed") {
    await context.close().catch(() => undefined);
  }
}

function runCatching(action: () => void): void {
  try {
    action();
  } catch {
    // Audio nodes can already be stopped by the time a user clicks stop again.
  }
}

async function playLocalAudio(status: TtsStatus): Promise<void> {
  if (status.status !== "playing" || status.source !== "local" || status.audioPath === null) {
    return;
  }

  const api = getElectronApi();
  if (typeof api?.["readFile"] !== "function") {
    return;
  }

  const base64 = await api["readFile"](status.audioPath);
  if (typeof base64 !== "string" || base64.trim() === "") {
    return;
  }

  const audioContextConstructor = getAudioContextConstructor();
  if (audioContextConstructor === null) {
    return;
  }

  await stopLocalAudio();

  const context = new audioContextConstructor();
  activeAudioContext = context;
  try {
    const audioBuffer = await context.decodeAudioData(decodeBase64ToArrayBuffer(base64));
    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    activeAudioSource = source;
    source.addEventListener(
      "ended",
      () => {
        if (activeAudioSource === source) {
          activeAudioSource = null;
        }
        if (activeAudioContext === context) {
          activeAudioContext = null;
          void context.close().catch(() => undefined);
        }
      },
      { once: true }
    );
    source.start();
  } catch {
    if (activeAudioContext === context) {
      activeAudioContext = null;
    }
    await context.close().catch(() => undefined);
  }
}

export async function installTtsModel(
  modelId: TtsManagedModelId
): Promise<TtsInstallModelResult | null> {
  const api = getElectronApi();
  if (typeof api?.["ttsInstallModel"] !== "function") {
    return null;
  }

  return await api["ttsInstallModel"](modelId);
}

export function onTtsStatus(callback: (payload: TtsStatus) => void): () => void {
  const api = getElectronApi();
  if (api == null) {
    return () => {};
  }

  const { ttsOnStatus, ttsOffStatus } = api;
  if (typeof ttsOnStatus !== "function" || typeof ttsOffStatus !== "function") {
    return () => {};
  }

  const guardedCallback = (payload: TtsStatus): void => {
    const normalized = normalizeTtsStatus(payload);
    if (normalized !== null) {
      callback(normalized);
    }
  };
  ttsOnStatus(guardedCallback);
  return () => {
    ttsOffStatus(guardedCallback);
  };
}
