import type { RepairLivePreviewState } from "../../shared/types/index.js";
import type { RepairUiState } from "../../shared/ui/state.js";
import type { createRepairUiRequestRuntime } from "../../shared/ui/request-runtime.js";
import { uniqueRepairCapabilities } from "./status-helpers.js";

type RepairUiRequestRuntime = ReturnType<typeof createRepairUiRequestRuntime>;

export function createRepairCaptureStatusHandlers(params: {
  render: () => void;
  requestRuntime: RepairUiRequestRuntime;
  state: RepairUiState;
}) {
  const { render, requestRuntime, state } = params;

  function handleCaptureFeedStatus(msg: {
    ok: boolean;
    preview: RepairLivePreviewState | null;
  }): void {
    state.operationsAvailable = true;
    if (msg.ok === true) {
      state.operations = {
        ...state.operations,
        cameraActive: true,
        liveFeedActive: true,
        activeCapabilities: Array.from(
          new Set([...state.operations.activeCapabilities, "android-camera", "live-feed"])
        ),
      };
      state.workbench.liveSource = {
        available: true,
        connected: true,
        sourceType: "android-camera",
        preview: msg.preview,
      };
    } else {
      state.operations = {
        ...state.operations,
        cameraActive: false,
        liveFeedActive: false,
        activeCapabilities: state.operations.activeCapabilities.filter(
          (capability) => capability !== "android-camera" && capability !== "live-feed"
        ),
      };
      state.workbench.liveSource = {
        ...state.workbench.liveSource,
        connected: false,
        preview: null,
      };
    }
    render();
  }

  function setOperationsCapabilities(params: { add?: string[]; remove?: string[] }): string[] {
    const capabilities = new Set(state.operations.activeCapabilities);
    params.add?.forEach((capability) => capabilities.add(capability));
    params.remove?.forEach((capability) => capabilities.delete(capability));
    return uniqueRepairCapabilities([...capabilities]);
  }

  function handleCaptureDictationStatus(msg: {
    status: "started" | "transcribing" | "done" | "failed";
  }): void {
    state.operationsAvailable = true;
    const active = msg.status === "started" || msg.status === "transcribing";
    state.operations = {
      ...state.operations,
      androidMicActive: active || state.operations.ambientActive,
      activeCapabilities: setOperationsCapabilities({
        add: active ? ["android-microphone"] : [],
        remove: active || state.operations.ambientActive ? [] : ["android-microphone"],
      }),
    };
    render();
  }

  function handleCaptureAmbientStatus(msg: {
    status:
      "started" | "wake-detected" | "capturing" | "transcribing" | "done" | "stopped" | "failed";
  }): void {
    state.operationsAvailable = true;
    const active =
      msg.status === "started" ||
      msg.status === "wake-detected" ||
      msg.status === "capturing" ||
      msg.status === "transcribing";
    state.layout.voiceGuidance.ambientListeningState = active ? "listening" : "idle";
    state.operations = {
      ...state.operations,
      androidMicActive: active,
      ambientActive: active,
      activeCapabilities: setOperationsCapabilities({
        add: active ? ["android-microphone", "ambient-listening"] : [],
        remove: active ? [] : ["android-microphone", "ambient-listening"],
      }),
    };
    render();
  }

  function handleTtsStatus(msg: {
    mode: "local" | "android";
    status: "queued" | "preparing" | "playing" | "done" | "stopped" | "failed";
  }): void {
    state.operationsAvailable = true;
    const active =
      msg.status === "queued" || msg.status === "preparing" || msg.status === "playing";
    const capability = msg.mode === "android" ? "android-tts" : "local-tts";
    state.operations = {
      ...state.operations,
      ttsActive: active,
      activeCapabilities: setOperationsCapabilities({
        add: active ? [capability] : [],
        remove: active ? [] : ["local-tts", "android-tts"],
      }),
    };
    render();
  }

  function handleCaptureMediaIngress(msg: {
    asset: { originalName: string; path: string };
    createdAt: string;
  }): void {
    state.operationsAvailable = true;
    const preview = state.workbench.liveSource.preview;
    state.workbench.liveSource = {
      ...state.workbench.liveSource,
      available: true,
      connected: false,
      sourceType: "snapshot",
    };
    if (state.sessions.activeId !== null) {
      requestRuntime.addTimelineEvent({
        kind: "snapshot",
        caption: `Captured ${msg.asset.originalName} from Android companion.`,
        thumbnailSrc: msg.asset.path,
        assetPath: msg.asset.path,
        useAsBoardImage: true,
        boardImageLabel: msg.asset.originalName,
        widthPx: preview?.width ?? 1280,
        heightPx: preview?.height ?? 720,
        capturedAt: msg.createdAt,
      });
    }
    render();
  }

  return {
    handleCaptureAmbientStatus,
    handleCaptureDictationStatus,
    handleCaptureFeedStatus,
    handleCaptureMediaIngress,
    handleTtsStatus,
  };
}
