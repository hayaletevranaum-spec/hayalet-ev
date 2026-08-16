import type { CaptureDictationStatusPayload } from "../../../types/capture.js";
import type { OperationCapability, OperationOwner } from "../../../types/operations.js";
import type {
  TranscriptDictationBackend,
  TranscriptIngressPayload,
  TranscriptTargetId,
} from "../../../types/transcript.js";
import {
  acquireOperationCapability,
  releaseOperationCapability,
} from "../operations/electron-client.js";
import {
  getTranscriptStatus,
  submitTranscriptIngress,
  transcribeLocalAudio,
} from "./electron-client.js";
import { startMicrophoneCapture, type MicrophoneCaptureSession } from "./microphone-capture.js";
import { insertTranscriptIntoTextarea } from "./textarea-insertion.js";

type DictationState = "idle" | "listening" | "transcribing";
type DictationNoticeKind = "info" | "success" | "error";
export type DictationMode = "local" | "android";
type AndroidDictationAction = "start" | "stop";
type AndroidDictationRequestState = "starting" | "ready";
const ANDROID_TRANSCRIPTION_TIMEOUT_MS = 35_000;

interface AndroidDictationRequest {
  action: AndroidDictationAction;
  requestId: string;
  targetId: TranscriptTargetId;
}

export interface DictationLabels {
  idleTitle: string;
  listeningTitle: string;
  transcribingTitle: string;
  listeningMessage: string;
  preparingMessage: string;
  emptyResultMessage: string;
  insertedMessage: string;
  transcribedMessage: (backend: string, durationMs: number) => string;
  captureError: (message: string) => string;
  transcriptionError: (message: string) => string;
  androidIdleTitle: string;
  androidPreparingMessage: string;
  androidListeningMessage: string;
  androidTimeoutMessage: string;
  androidError: (message: string) => string;
}

export interface DictationBinding {
  dispose: () => void;
  refresh: () => void;
}

interface BindDictationTriggerOptions {
  button: HTMLButtonElement | null;
  textarea: HTMLTextAreaElement | null;
  targetId: TranscriptTargetId;
  getLabels: () => DictationLabels;
  showNotice: (message: string, kind?: DictationNoticeKind) => void;
  isTargetActive?: () => boolean;
  subscribeIngress?: (callback: (payload: TranscriptIngressPayload) => void) => () => void;
  subscribeAndroidDictationStatus?: (
    callback: (payload: CaptureDictationStatusPayload) => void
  ) => () => void;
  onFinalTranscript?: (payload: TranscriptIngressPayload) => boolean | Promise<boolean>;
  getMode?: () => DictationMode;
  getLanguage?: () => string | null;
  requestAndroidDictation?: (
    request: AndroidDictationRequest
  ) => Promise<AndroidDictationRequestState>;
  cancelAndroidDictation?: (request: AndroidDictationRequest) => Promise<void>;
  operationOwner?: OperationOwner;
}

const MICROPHONE_ICON = `
  <svg class="dictation-trigger__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      fill="currentColor"
      d="M12 15a4 4 0 0 0 4-4V7a4 4 0 1 0-8 0v4a4 4 0 0 0 4 4Zm6-4a1 1 0 1 1 2 0 8 8 0 0 1-7 7.94V22h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-3.06A8 8 0 0 1 4 11a1 1 0 1 1 2 0 6 6 0 1 0 12 0Z"
    />
  </svg>
`;

const STOP_ICON = `
  <svg class="dictation-trigger__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"></rect>
  </svg>
`;

const SPINNER_ICON = `
  <svg class="dictation-trigger__icon dictation-trigger__icon--spinner" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="32 14"></circle>
  </svg>
`;

function setButtonState(
  button: HTMLButtonElement,
  state: DictationState,
  labels: DictationLabels,
  mode: DictationMode
): void {
  button.dataset["dictationState"] = state;
  button.dataset["dictationMode"] = mode;
  button.classList.toggle("is-listening", state === "listening");
  button.classList.toggle("is-transcribing", state === "transcribing");
  button.classList.toggle("is-android", mode === "android");
  button.disabled = state === "transcribing" && mode !== "android";
  button.setAttribute("aria-pressed", state === "listening" ? "true" : "false");

  switch (state) {
    case "idle":
      button.title = mode === "android" ? labels.androidIdleTitle : labels.idleTitle;
      button.setAttribute(
        "aria-label",
        mode === "android" ? labels.androidIdleTitle : labels.idleTitle
      );
      button.innerHTML = MICROPHONE_ICON;
      return;
    case "listening":
      button.title = labels.listeningTitle;
      button.setAttribute("aria-label", labels.listeningTitle);
      button.innerHTML = STOP_ICON;
      return;
    case "transcribing":
      button.title = labels.transcribingTitle;
      button.setAttribute("aria-label", labels.transcribingTitle);
      button.innerHTML = SPINNER_ICON;
      return;
  }
}

function formatTranscriptBackend(backend: TranscriptDictationBackend | undefined): string {
  return backend === "vosk" ? "Vosk" : "whisper.cpp";
}

function resolveDefaultOperationOwner(targetId: TranscriptTargetId): OperationOwner {
  if (targetId === "analyze-compose") {
    return {
      id: "analyze-room",
      label: "Analyze Room",
    };
  }

  if (targetId.startsWith("room:")) {
    const roomId = targetId.slice("room:".length).trim();
    return {
      id: targetId,
      label: roomId === "" ? "Room" : `Room ${roomId}`,
      ...(roomId !== "" ? { roomId } : {}),
    };
  }

  return {
    id: `dictation:${targetId}`,
    label: "Dictation",
  };
}

export function bindDictationTrigger(options: BindDictationTriggerOptions): DictationBinding {
  const { button, textarea } = options;

  if (button == null || textarea == null) {
    return {
      dispose: (): void => {},
      refresh: (): void => {},
    };
  }

  let captureSession: MicrophoneCaptureSession | null = null;
  let currentState: DictationState = "idle";
  let activeAndroidRequestId: string | null = null;
  let activeOperationCapability: OperationCapability | null = null;
  let androidTranscriptionTimeout: number | null = null;
  let disposed = false;
  const operationOwner = options.operationOwner ?? resolveDefaultOperationOwner(options.targetId);

  const refresh = (): void => {
    setButtonState(button, currentState, options.getLabels(), options.getMode?.() ?? "local");
  };

  const insertTranscript = (text: string, showInsertedNotice: boolean): void => {
    insertTranscriptIntoTextarea(textarea, text);
    if (showInsertedNotice) {
      options.showNotice(options.getLabels().insertedMessage, "success");
    }
  };

  const clearAndroidTranscriptionTimeout = (): void => {
    if (androidTranscriptionTimeout === null) {
      return;
    }
    window.clearTimeout(androidTranscriptionTimeout);
    androidTranscriptionTimeout = null;
  };

  const releaseActiveOperationCapability = async (): Promise<void> => {
    const capability = activeOperationCapability;
    if (capability === null) {
      return;
    }

    activeOperationCapability = null;
    await releaseOperationCapability(capability, operationOwner);
  };

  const acquireOperationCapabilityForMode = async (
    capability: OperationCapability
  ): Promise<string | null> => {
    const outcome = await acquireOperationCapability(capability, operationOwner);
    if (outcome.success !== true) {
      return outcome.error;
    }

    activeOperationCapability = capability;
    return null;
  };

  const cancelAndroidTranscription = (requestId: string, message: string | null): void => {
    clearAndroidTranscriptionTimeout();
    if (activeAndroidRequestId === requestId) {
      activeAndroidRequestId = null;
    }
    currentState = "idle";
    refresh();
    if (message !== null && disposed !== true) {
      options.showNotice(options.getLabels().androidError(message), "error");
    }
    void releaseActiveOperationCapability();
    void options
      .cancelAndroidDictation?.({
        action: "stop",
        requestId,
        targetId: options.targetId,
      })
      .catch((error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        options.showNotice(options.getLabels().androidError(errorMessage), "error");
      });
  };

  const scheduleAndroidTranscriptionTimeout = (requestId: string): void => {
    clearAndroidTranscriptionTimeout();
    androidTranscriptionTimeout = window.setTimeout(() => {
      if (disposed || activeAndroidRequestId !== requestId || currentState !== "transcribing") {
        return;
      }
      cancelAndroidTranscription(requestId, options.getLabels().androidTimeoutMessage);
    }, ANDROID_TRANSCRIPTION_TIMEOUT_MS);
  };

  const dispatchTranscript = async (payload: TranscriptIngressPayload): Promise<void> => {
    const ingressResult = await submitTranscriptIngress({
      requestId: payload.requestId,
      text: payload.text,
      source: payload.source,
      target: payload.target,
      isFinal: payload.isFinal,
      metadata: {
        ...(payload.metadata ?? {}),
        capturedSource: payload.source,
      },
    });

    if (ingressResult.success !== true) {
      void handleIngress(payload);
    }
  };

  const handleIngress = async (payload: TranscriptIngressPayload): Promise<void> => {
    if (options.isTargetActive?.() === false) {
      return;
    }
    const mode = options.getMode?.() ?? "local";
    if (payload.source === "android-bridge" && mode !== "android") {
      return;
    }
    if (payload.source !== "android-bridge" && mode === "android") {
      return;
    }
    if (payload.source === "android-bridge" && payload.requestId !== activeAndroidRequestId) {
      return;
    }
    if (payload.target !== null && payload.target !== options.targetId) {
      return;
    }
    if (payload.text.trim() === "") {
      return;
    }
    const consumed =
      payload.isFinal === true ? (await options.onFinalTranscript?.(payload)) === true : false;
    if (consumed !== true) {
      insertTranscript(payload.text, true);
    }
    if (payload.isFinal === true) {
      activeAndroidRequestId = null;
      clearAndroidTranscriptionTimeout();
      void releaseActiveOperationCapability();
    }
    if (mode === "android" && (currentState === "listening" || currentState === "transcribing")) {
      currentState = "idle";
      refresh();
    }
  };

  const handleAndroidDictationStatus = (payload: CaptureDictationStatusPayload): void => {
    if (payload.requestId !== activeAndroidRequestId || payload.target !== options.targetId) {
      return;
    }

    if (payload.status === "started") {
      clearAndroidTranscriptionTimeout();
      currentState = "listening";
      refresh();
      options.showNotice(options.getLabels().androidListeningMessage, "info");
      return;
    }

    if (payload.status === "transcribing") {
      currentState = "transcribing";
      refresh();
      scheduleAndroidTranscriptionTimeout(payload.requestId);
      return;
    }

    if (payload.status === "failed") {
      activeAndroidRequestId = null;
      clearAndroidTranscriptionTimeout();
      currentState = "idle";
      refresh();
      void releaseActiveOperationCapability();
      options.showNotice(options.getLabels().androidError(payload.message), "error");
      return;
    }

    activeAndroidRequestId = null;
    clearAndroidTranscriptionTimeout();
    void releaseActiveOperationCapability();
    if (currentState === "transcribing") {
      currentState = "idle";
      refresh();
    }
  };

  const stopCaptureAndTranscribe = async (): Promise<void> => {
    const labels = options.getLabels();
    const activeCapture = captureSession;
    captureSession = null;
    currentState = "transcribing";
    refresh();

    try {
      if (activeCapture == null) {
        throw new Error("Microphone capture session is not active.");
      }

      const requestId = crypto.randomUUID();
      const capture = await activeCapture.stop();
      const transcription = await transcribeLocalAudio({
        requestId,
        audioBase64: capture.audioBase64,
        language: options.getLanguage?.() ?? null,
        source: "pc-mic",
      });

      if (transcription.success !== true || transcription.text == null) {
        throw new Error(transcription.error ?? labels.emptyResultMessage);
      }
      if (typeof transcription.transcriptionMs === "number") {
        options.showNotice(
          labels.transcribedMessage(
            formatTranscriptBackend(transcription.backend),
            transcription.transcriptionMs
          ),
          "info"
        );
      }

      await dispatchTranscript({
        requestId,
        createdAt: new Date().toISOString(),
        text: transcription.text,
        source: "pc-mic",
        target: options.targetId,
        isFinal: true,
        metadata: {
          durationMs: capture.durationMs,
          sourceSampleRate: capture.sourceSampleRate,
          targetSampleRate: capture.targetSampleRate,
          frameCount: capture.frameCount,
          transcriptionBackend: transcription.backend ?? transcription.status.backend,
          transcriptionMs: transcription.transcriptionMs ?? null,
          modelId: transcription.status.modelId,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.showNotice(labels.transcriptionError(message), "error");
    } finally {
      await releaseActiveOperationCapability();
      currentState = "idle";
      refresh();
    }
  };

  const handleClick = (): void => {
    const mode = options.getMode?.() ?? "local";
    if (currentState === "transcribing") {
      if (
        mode === "android" &&
        activeAndroidRequestId !== null &&
        typeof options.cancelAndroidDictation === "function"
      ) {
        cancelAndroidTranscription(activeAndroidRequestId, null);
      }
      return;
    }

    if (mode === "android") {
      void (async (): Promise<void> => {
        const labels = options.getLabels();
        let requestId: string | null = null;
        try {
          if (currentState === "listening") {
            requestId = activeAndroidRequestId;
            if (requestId === null) {
              throw new Error("Android dictation request is not active.");
            }
            currentState = "transcribing";
            refresh();
            scheduleAndroidTranscriptionTimeout(requestId);
            await options.requestAndroidDictation?.({
              action: "stop",
              requestId,
              targetId: options.targetId,
            });
            options.showNotice(labels.transcribingTitle, "info");
            return;
          }

          const operationError = await acquireOperationCapabilityForMode("android-microphone");
          if (operationError !== null) {
            options.showNotice(labels.androidError(operationError), "error");
            return;
          }

          requestId = crypto.randomUUID();
          activeAndroidRequestId = requestId;
          currentState = "transcribing";
          refresh();
          const result = await options.requestAndroidDictation?.({
            action: "start",
            requestId,
            targetId: options.targetId,
          });
          if (disposed || activeAndroidRequestId !== requestId) {
            void releaseActiveOperationCapability();
            void options.requestAndroidDictation?.({
              action: "stop",
              requestId,
              targetId: options.targetId,
            });
            return;
          }
          if (result === "ready") {
            currentState = "listening";
            refresh();
            options.showNotice(labels.androidListeningMessage, "info");
            return;
          }

          currentState = "listening";
          refresh();
          options.showNotice(labels.androidPreparingMessage, "info");
        } catch (error) {
          if (requestId === null || activeAndroidRequestId === requestId) {
            activeAndroidRequestId = null;
          }
          clearAndroidTranscriptionTimeout();
          void releaseActiveOperationCapability();
          currentState = "idle";
          refresh();
          if (disposed) {
            return;
          }
          const message = error instanceof Error ? error.message : String(error);
          options.showNotice(labels.androidError(message), "error");
        }
      })();
      return;
    }

    if (currentState === "listening") {
      void stopCaptureAndTranscribe();
      return;
    }

    void (async (): Promise<void> => {
      const labels = options.getLabels();

      try {
        const operationError = await acquireOperationCapabilityForMode("local-microphone");
        if (operationError !== null) {
          options.showNotice(labels.captureError(operationError), "error");
          return;
        }

        const status = await getTranscriptStatus();
        if (status.ready !== true) {
          options.showNotice(labels.preparingMessage, "info");
        }

        captureSession = await startMicrophoneCapture();
        currentState = "listening";
        refresh();
        options.showNotice(labels.listeningMessage, "info");
      } catch (error) {
        captureSession = null;
        void releaseActiveOperationCapability();
        currentState = "idle";
        refresh();
        const message = error instanceof Error ? error.message : String(error);
        options.showNotice(labels.captureError(message), "error");
      }
    })();
  };

  button.addEventListener("click", handleClick);
  const unsubscribeIngress: () => void =
    options.subscribeIngress?.((payload) => {
      void handleIngress(payload);
    }) ?? ((): void => {});
  const unsubscribeAndroidDictationStatus: () => void =
    options.subscribeAndroidDictationStatus?.(handleAndroidDictationStatus) ?? ((): void => {});
  refresh();

  return {
    dispose: (): void => {
      disposed = true;
      button.removeEventListener("click", handleClick);
      unsubscribeIngress();
      unsubscribeAndroidDictationStatus();
      clearAndroidTranscriptionTimeout();
      if (
        activeAndroidRequestId !== null &&
        (currentState === "listening" || currentState === "transcribing")
      ) {
        void options.requestAndroidDictation?.({
          action: "stop",
          requestId: activeAndroidRequestId,
          targetId: options.targetId,
        });
      }
      if (captureSession !== null) {
        void captureSession.abort();
        captureSession = null;
      }
      void releaseActiveOperationCapability();
      activeAndroidRequestId = null;
      currentState = "idle";
    },
    refresh,
  };
}
