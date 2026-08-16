import { REPAIR_ROOM_ID } from "../../shared/repair-constants.js";
import type { RepairLivePreviewState } from "../../shared/types/index.js";
import type { RepairRuntimeStore } from "../state/repair-runtime-store.js";
import { createRepairUiSnapshot } from "../state/repair-selectors.js";
import {
  normalizeRepairLivePreview,
  normalizeRepairOperationsSnapshot,
  safeRecord,
} from "./guards.js";

export interface RepairCaptureActionOutcome {
  ok: boolean;
  message?: string;
  status?: unknown;
}

export interface RepairCaptureActionResult {
  requestId: string;
  outcome: RepairCaptureActionOutcome;
}

export interface RepairTtsActionResult {
  requestId: string;
  outcome: {
    status?: {
      status?: string;
      message?: string;
    };
  };
}

export interface RepairOperationsApi {
  log: (level: string, message: string) => void;
  operations?: {
    getStatus?: () => Promise<unknown> | unknown;
    subscribe?: (listener: (status: unknown) => void) => (() => void) | undefined;
  };
  capture?: {
    startDictation?: (requestId?: string) => Promise<RepairCaptureActionResult>;
    stopDictation?: (requestId: string) => Promise<RepairCaptureActionOutcome>;
    startAmbientListener?: (requestId?: string) => Promise<RepairCaptureActionResult>;
    stopAmbientListener?: (requestId: string) => Promise<RepairCaptureActionOutcome>;
    startCameraFeed?: (requestId?: string) => Promise<RepairCaptureActionResult>;
    stopCameraFeed?: (requestId?: string) => Promise<RepairCaptureActionResult>;
    capturePhoto?: (requestId?: string) => Promise<RepairCaptureActionOutcome>;
    setTorch?: (enabled: boolean, requestId?: string) => Promise<RepairCaptureActionResult>;
  };
  tts?: {
    speak?: (
      text: string,
      options?: { requestId?: string; mode?: "local" | "android"; language?: "tr" | "en" }
    ) => Promise<RepairTtsActionResult>;
    stop?: (requestId: string) => Promise<unknown>;
  };
  getLocale?: () => string;
}

export interface RepairOperationsController {
  startProjectionBridge: () => void;
  startDictationRequest: () => { success: boolean; message?: string };
  stopDictationRequest: () => { success: boolean; message?: string };
  startAmbientRequest: () => { success: boolean; message?: string };
  stopAmbientRequest: () => { success: boolean; message?: string };
  startCameraFeedRequest: () => { success: boolean; message?: string };
  capturePhotoRequest: () => { success: boolean; message?: string };
  setCameraTorchRequest: (enabled: boolean) => { success: boolean; message?: string };
  stopCameraFeedRequest: () => { success: boolean; message?: string };
  speakGuidanceRequest: (textOverride: string | null) => { success: boolean; message?: string };
  stopSpeechRequest: () => { success: boolean; message?: string };
  dispose: () => void;
}

function getRepairCapturePreview(
  outcome: RepairCaptureActionOutcome
): RepairLivePreviewState | null {
  const status = safeRecord(outcome.status);
  if (status === null) return null;
  const scrcpy = safeRecord(status["scrcpy"]);
  const analyze = safeRecord(status["analyze"]);
  const scrcpyActiveSession = scrcpy === null ? null : safeRecord(scrcpy["activeSession"]);
  const scrcpyPreview = scrcpy === null ? null : scrcpy["previewVideo"];
  const scrcpyActivePreview =
    scrcpyActiveSession === null ? null : scrcpyActiveSession["previewVideo"];
  const analyzePreview = analyze === null ? null : analyze["previewVideo"];
  return (
    normalizeRepairLivePreview(scrcpyPreview) ??
    normalizeRepairLivePreview(scrcpyActivePreview) ??
    normalizeRepairLivePreview(analyzePreview)
  );
}

function createOperationRequestId(kind: string): string {
  return `${REPAIR_ROOM_ID}:${kind}:${globalThis.crypto.randomUUID()}`;
}

function isTerminalTtsStatus(status: string | undefined): boolean {
  return status === "done" || status === "stopped" || status === "failed";
}

export function createRepairOperationsController(params: {
  api: RepairOperationsApi;
  isDisposed: () => boolean;
  pushState: () => void;
  store: RepairRuntimeStore;
}): RepairOperationsController {
  const { api, isDisposed, pushState, store } = params;
  let operationsUnsubscribe: (() => void) | null = null;
  let activeDictationRequestId: string | null = null;
  let activeAmbientRequestId: string | null = null;
  let activeCameraFeedRequestId: string | null = null;
  let activeTtsRequestId: string | null = null;
  let operationsProjectionBridgeStarted = false;

  function logOperationFailure(kind: string, message: string): void {
    api.log("warn", `[${REPAIR_ROOM_ID}] ${kind} failed: ${message}`);
  }

  function getTtsLanguage(): "tr" | "en" {
    return (api.getLocale?.() ?? "tr").toLowerCase().startsWith("en") ? "en" : "tr";
  }

  function getCurrentGuidanceLine(): string {
    const state = createRepairUiSnapshot(store.getState());
    return state.guidance.voice.spokenLine ?? state.guidance.nextBestAction.text;
  }

  function applyOperationsStatus(value: unknown): void {
    const status = normalizeRepairOperationsSnapshot(value);
    if (status === null) return;
    store.dispatch({ type: "operations/status-set", status });
    const capabilities = new Set(status.records.map((record) => record.capability));
    if (!capabilities.has("android-microphone")) {
      activeDictationRequestId = null;
    }
    if (!capabilities.has("ambient-listening")) {
      activeAmbientRequestId = null;
    }
    if (!capabilities.has("android-camera") && !capabilities.has("live-feed")) {
      activeCameraFeedRequestId = null;
      store.dispatch({ type: "operations/live-preview-set", preview: null });
    }
    if (!capabilities.has("local-tts") && !capabilities.has("android-tts")) {
      activeTtsRequestId = null;
    }
  }

  function startProjectionBridge(): void {
    if (operationsProjectionBridgeStarted) return;
    operationsProjectionBridgeStarted = true;
    if (typeof api.operations?.getStatus === "function") {
      void Promise.resolve(api.operations.getStatus())
        .then((status) => {
          if (isDisposed()) return;
          applyOperationsStatus(status);
          pushState();
        })
        .catch((error: unknown) => {
          api.log(
            "debug",
            `[${REPAIR_ROOM_ID}] operations status unavailable: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        });
    }

    if (typeof api.operations?.subscribe === "function") {
      const unsubscribe = api.operations.subscribe((status) => {
        if (isDisposed()) return;
        applyOperationsStatus(status);
        pushState();
      });
      if (typeof unsubscribe === "function") {
        operationsUnsubscribe = unsubscribe;
      }
    }
  }

  function startDictationRequest(): { success: boolean; message?: string } {
    if (activeDictationRequestId !== null) {
      return { success: true, message: "dictation already active" };
    }
    if (typeof api.capture?.startDictation !== "function") {
      return { success: false, message: "capture dictation API is unavailable" };
    }
    if (store.getState().layout.interactionSettings.androidCompanionEnabled !== true) {
      return { success: false, message: "Android companion is disabled for Repair Room" };
    }
    const requestId = createOperationRequestId("dictation");
    activeDictationRequestId = requestId;
    void api.capture
      .startDictation(requestId)
      .then((result) => {
        activeDictationRequestId = result.requestId;
        if (result.outcome.ok !== true) {
          activeDictationRequestId = null;
          logOperationFailure("dictation", result.outcome.message ?? "unknown error");
        }
        pushState();
      })
      .catch((error: unknown) => {
        if (activeDictationRequestId === requestId) activeDictationRequestId = null;
        logOperationFailure("dictation", error instanceof Error ? error.message : String(error));
        pushState();
      });
    return { success: true };
  }

  function stopDictationRequest(): { success: boolean; message?: string } {
    if (activeDictationRequestId === null) {
      return { success: false, message: "Repair Room dictation is not active" };
    }
    if (typeof api.capture?.stopDictation !== "function") {
      return { success: false, message: "capture dictation API is unavailable" };
    }
    const requestId = activeDictationRequestId;
    void api.capture
      .stopDictation(requestId)
      .then((outcome) => {
        if (outcome.ok === true && activeDictationRequestId === requestId) {
          activeDictationRequestId = null;
        } else if (outcome.ok !== true) {
          logOperationFailure("stop dictation", outcome.message ?? "unknown error");
        }
        pushState();
      })
      .catch((error: unknown) => {
        logOperationFailure(
          "stop dictation",
          error instanceof Error ? error.message : String(error)
        );
        pushState();
      });
    return { success: true };
  }

  function startAmbientRequest(): { success: boolean; message?: string } {
    if (activeAmbientRequestId !== null) {
      return { success: true, message: "ambient listener already active" };
    }
    if (typeof api.capture?.startAmbientListener !== "function") {
      return { success: false, message: "capture ambient listener API is unavailable" };
    }
    if (store.getState().layout.interactionSettings.androidCompanionEnabled !== true) {
      return { success: false, message: "Android companion is disabled for Repair Room" };
    }
    const requestId = createOperationRequestId("ambient");
    activeAmbientRequestId = requestId;
    void api.capture
      .startAmbientListener(requestId)
      .then((result) => {
        activeAmbientRequestId = result.requestId;
        if (result.outcome.ok !== true) {
          activeAmbientRequestId = null;
          logOperationFailure("ambient listener", result.outcome.message ?? "unknown error");
        }
        pushState();
      })
      .catch((error: unknown) => {
        if (activeAmbientRequestId === requestId) activeAmbientRequestId = null;
        logOperationFailure(
          "ambient listener",
          error instanceof Error ? error.message : String(error)
        );
        pushState();
      });
    return { success: true };
  }

  function stopAmbientRequest(): { success: boolean; message?: string } {
    if (activeAmbientRequestId === null) {
      return { success: false, message: "Repair Room ambient listener is not active" };
    }
    if (typeof api.capture?.stopAmbientListener !== "function") {
      return { success: false, message: "capture ambient listener API is unavailable" };
    }
    const requestId = activeAmbientRequestId;
    void api.capture
      .stopAmbientListener(requestId)
      .then((outcome) => {
        if (outcome.ok === true && activeAmbientRequestId === requestId) {
          activeAmbientRequestId = null;
        } else if (outcome.ok !== true) {
          logOperationFailure("stop ambient listener", outcome.message ?? "unknown error");
        }
        pushState();
      })
      .catch((error: unknown) => {
        logOperationFailure(
          "stop ambient listener",
          error instanceof Error ? error.message : String(error)
        );
        pushState();
      });
    return { success: true };
  }

  function startCameraFeedRequest(): { success: boolean; message?: string } {
    if (activeCameraFeedRequestId !== null) {
      return { success: true, message: "camera feed already active" };
    }
    if (typeof api.capture?.startCameraFeed !== "function") {
      return { success: false, message: "capture camera feed API is unavailable" };
    }
    if (store.getState().layout.interactionSettings.androidCompanionEnabled !== true) {
      return { success: false, message: "Android companion is disabled for Repair Room" };
    }
    const requestId = createOperationRequestId("camera");
    activeCameraFeedRequestId = requestId;
    void api.capture
      .startCameraFeed(requestId)
      .then((result) => {
        activeCameraFeedRequestId = result.requestId;
        if (result.outcome.ok !== true) {
          activeCameraFeedRequestId = null;
          store.dispatch({ type: "operations/live-preview-set", preview: null });
          logOperationFailure("camera feed", result.outcome.message ?? "unknown error");
        } else {
          store.dispatch({
            type: "operations/live-preview-set",
            preview: getRepairCapturePreview(result.outcome),
          });
        }
        pushState();
      })
      .catch((error: unknown) => {
        if (activeCameraFeedRequestId === requestId) activeCameraFeedRequestId = null;
        store.dispatch({ type: "operations/live-preview-set", preview: null });
        logOperationFailure("camera feed", error instanceof Error ? error.message : String(error));
        pushState();
      });
    return { success: true };
  }

  function stopCameraFeedRequest(): { success: boolean; message?: string } {
    if (activeCameraFeedRequestId === null) {
      return { success: false, message: "Repair Room camera feed is not active" };
    }
    if (typeof api.capture?.stopCameraFeed !== "function") {
      return { success: false, message: "capture camera feed API is unavailable" };
    }
    const requestId = activeCameraFeedRequestId;
    void api.capture
      .stopCameraFeed(requestId)
      .then((result) => {
        if (result.outcome.ok === true && activeCameraFeedRequestId === requestId) {
          activeCameraFeedRequestId = null;
          store.dispatch({ type: "operations/live-preview-set", preview: null });
        } else if (result.outcome.ok !== true) {
          logOperationFailure("stop camera feed", result.outcome.message ?? "unknown error");
        }
        pushState();
      })
      .catch((error: unknown) => {
        logOperationFailure(
          "stop camera feed",
          error instanceof Error ? error.message : String(error)
        );
        pushState();
      });
    return { success: true };
  }

  function capturePhotoRequest(): { success: boolean; message?: string } {
    if (typeof api.capture?.capturePhoto !== "function") {
      return { success: false, message: "capture photo API is unavailable" };
    }
    if (store.getState().layout.interactionSettings.androidCompanionEnabled !== true) {
      return { success: false, message: "Android companion is disabled for Repair Room" };
    }
    if (store.getState().activeSessionId === null) {
      return { success: false, message: "active repair session is required" };
    }
    const requestId = createOperationRequestId("photo");
    void api.capture
      .capturePhoto(requestId)
      .then((outcome) => {
        if (outcome.ok !== true) {
          logOperationFailure("capture photo", outcome.message ?? "unknown error");
        }
        pushState();
      })
      .catch((error: unknown) => {
        logOperationFailure(
          "capture photo",
          error instanceof Error ? error.message : String(error)
        );
        pushState();
      });
    return { success: true };
  }

  function setCameraTorchRequest(enabled: boolean): { success: boolean; message?: string } {
    if (typeof api.capture?.setTorch !== "function") {
      return { success: false, message: "capture torch API is unavailable" };
    }
    if (store.getState().layout.interactionSettings.androidCompanionEnabled !== true) {
      return { success: false, message: "Android companion is disabled for Repair Room" };
    }
    void api.capture
      .setTorch(enabled)
      .then((result) => {
        if (result.outcome.ok !== true) {
          logOperationFailure("camera torch", result.outcome.message ?? "unknown error");
        }
        pushState();
      })
      .catch((error: unknown) => {
        logOperationFailure("camera torch", error instanceof Error ? error.message : String(error));
        pushState();
      });
    return { success: true };
  }

  function speakGuidanceRequest(textOverride: string | null): {
    success: boolean;
    message?: string;
  } {
    if (activeTtsRequestId !== null) {
      return { success: true, message: "TTS already active" };
    }
    if (typeof api.tts?.speak !== "function") {
      return { success: false, message: "TTS API is unavailable" };
    }
    const requestId = createOperationRequestId("tts");
    activeTtsRequestId = requestId;
    const text = textOverride ?? getCurrentGuidanceLine();
    const mode = store.getState().layout.interactionSettings.ttsRoute;
    void api.tts
      .speak(text, { requestId, mode, language: getTtsLanguage() })
      .then((result) => {
        activeTtsRequestId = result.requestId;
        const status = result.outcome.status?.status;
        if (status === "failed") {
          activeTtsRequestId = null;
          logOperationFailure("TTS", result.outcome.status?.message ?? "unknown error");
        } else if (isTerminalTtsStatus(status)) {
          activeTtsRequestId = null;
        }
        pushState();
      })
      .catch((error: unknown) => {
        if (activeTtsRequestId === requestId) activeTtsRequestId = null;
        logOperationFailure("TTS", error instanceof Error ? error.message : String(error));
        pushState();
      });
    return { success: true };
  }

  function stopSpeechRequest(): { success: boolean; message?: string } {
    if (activeTtsRequestId === null) {
      return { success: false, message: "Repair Room TTS is not active" };
    }
    if (typeof api.tts?.stop !== "function") {
      return { success: false, message: "TTS API is unavailable" };
    }
    const requestId = activeTtsRequestId;
    void api.tts
      .stop(requestId)
      .then(() => {
        if (activeTtsRequestId === requestId) activeTtsRequestId = null;
        pushState();
      })
      .catch((error: unknown) => {
        logOperationFailure("stop TTS", error instanceof Error ? error.message : String(error));
        pushState();
      });
    return { success: true };
  }

  function dispose(): void {
    if (activeDictationRequestId !== null && typeof api.capture?.stopDictation === "function") {
      void api.capture.stopDictation(activeDictationRequestId);
      activeDictationRequestId = null;
    }
    if (activeAmbientRequestId !== null && typeof api.capture?.stopAmbientListener === "function") {
      void api.capture.stopAmbientListener(activeAmbientRequestId);
      activeAmbientRequestId = null;
    }
    if (activeCameraFeedRequestId !== null && typeof api.capture?.stopCameraFeed === "function") {
      void api.capture.stopCameraFeed(activeCameraFeedRequestId);
      activeCameraFeedRequestId = null;
      store.dispatch({ type: "operations/live-preview-set", preview: null });
    }
    if (activeTtsRequestId !== null && typeof api.tts?.stop === "function") {
      void api.tts.stop(activeTtsRequestId);
      activeTtsRequestId = null;
    }
    operationsUnsubscribe?.();
    operationsUnsubscribe = null;
  }

  return {
    startProjectionBridge,
    startDictationRequest,
    stopDictationRequest,
    startAmbientRequest,
    stopAmbientRequest,
    startCameraFeedRequest,
    capturePhotoRequest,
    stopCameraFeedRequest,
    setCameraTorchRequest,
    speakGuidanceRequest,
    stopSpeechRequest,
    dispose,
  };
}
