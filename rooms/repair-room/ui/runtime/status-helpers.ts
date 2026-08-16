import type { RepairUiState } from "../../shared/ui/state.js";

type TextFn = (path: string[], fallback: string) => string;

export function getCameraStatusChipState(
  state: RepairUiState,
  cameraActive: boolean
): "live" | "ready" | "manual" | "unavailable" {
  if (!state.operationsAvailable) return "unavailable";
  if (cameraActive) return "live";
  if (state.workbench.liveSource.connected || state.workbench.liveSource.available) return "ready";
  return "manual";
}

function getCameraSourceLabel(state: RepairUiState, text: TextFn): string {
  const sourceType = state.workbench.liveSource.sourceType;
  if (sourceType === "android-camera")
    return text(["status", "cameraSourceAndroid"], "Android camera");
  if (sourceType === "snapshot") return text(["status", "cameraSourceSnapshot"], "Snapshot");
  if (sourceType === "image") return text(["status", "cameraSourceImage"], "Board image");
  return state.layout.interactionSettings.cameraFeedPreference === "android-feed"
    ? text(["status", "cameraSourceAndroid"], "Android camera")
    : text(["status", "cameraSourceManual"], "Manual image");
}

export function getCameraStatusChipText(
  state: RepairUiState,
  cameraActive: boolean,
  text: TextFn
): string {
  const cameraSource = getCameraSourceLabel(state, text);
  if (!state.operationsAvailable)
    return text(["status", "cameraNotConnected"], "Camera not connected");
  if (cameraActive) return `${cameraSource} ${text(["status", "cameraLive"], "live")}`;
  if (state.workbench.liveSource.connected)
    return `${cameraSource} ${text(["status", "cameraConnected"], "connected")}`;
  if (state.workbench.liveSource.available)
    return `${cameraSource} ${text(["status", "cameraReady"], "ready")}`;
  return text(["status", "manualBoardImage"], "Manual board image");
}

export function getCameraStatusChipTitle(
  state: RepairUiState,
  cameraActive: boolean,
  text: TextFn
): string {
  if (!state.operationsAvailable) {
    return text(
      ["status", "cameraTitleNotConnected"],
      "Camera feed is optional. Open repair controls if you need companion access."
    );
  }
  if (cameraActive)
    return text(
      ["status", "cameraTitleLive"],
      "Camera feed is live. Freeze the frame before probing tight areas."
    );
  if (state.workbench.liveSource.connected)
    return text(["status", "cameraTitleConnected"], "Camera is connected but not marked live.");
  if (state.workbench.liveSource.available)
    return text(["status", "cameraTitleReady"], "Camera source is ready when needed.");
  return text(
    ["status", "cameraTitleManual"],
    "Use a manual board image or start the Android camera when needed."
  );
}

export function getRouteLabel(route: "local" | "android", text: TextFn): string {
  return route === "android"
    ? text(["status", "routeAndroid"], "Android")
    : text(["status", "routeLocal"], "Local");
}

export function getAssistanceProfileLabel(maxAiInterruptions: number, text: TextFn): string {
  if (maxAiInterruptions <= 1) return text(["status", "profileQuiet"], "Quiet");
  if (maxAiInterruptions === 2) return text(["status", "profileBalanced"], "Balanced");
  return text(["status", "profileProactive"], "Proactive");
}

export function uniqueRepairCapabilities(capabilities: string[]): string[] {
  return Array.from(new Set(capabilities));
}
