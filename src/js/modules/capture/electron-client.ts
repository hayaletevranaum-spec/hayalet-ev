import type {
  CaptureActionOutcome,
  CaptureAmbientListenerOptions,
  CaptureAmbientStatusPayload,
  CaptureAndroidDeviceStatus,
  CaptureAndroidStatus,
  CaptureDictationStatusPayload,
  CaptureHostAction,
  CaptureImportedAsset,
  CaptureMediaIngressPayload,
  CaptureScrcpyStatus,
  CaptureServiceStatus,
  CaptureTargetActionOptions,
  CaptureTorchOptions,
  CaptureTranscriptStatusSnapshot,
} from "../../../types/capture.js";

const FALLBACK_CAPTURE_STATUS: CaptureServiceStatus = {
  checkedAt: 0,
  transcript: {
    appLanguage: "tr",
    variant: "full",
    runtime: null,
  },
  hostDependencies: {
    adb: {
      state: "missing",
      path: null,
      version: null,
      message: "Electron capture bridge is unavailable.",
      installable: false,
      managedPath: null,
    },
    scrcpy: {
      state: "missing",
      path: null,
      version: null,
      message: "Electron capture bridge is unavailable.",
      installable: false,
      managedPath: null,
    },
    v4l2Loopback: {
      state: "missing",
      path: null,
      version: null,
      message: "Electron capture bridge is unavailable.",
      installable: false,
      managedPath: null,
      required: false,
      moduleLoaded: false,
      modulePath: null,
      controlPath: null,
      devicePath: null,
      setupCommand: null,
    },
    ffmpeg: {
      state: "missing",
      path: null,
      version: null,
      message: "Electron capture bridge is unavailable.",
      installable: false,
      managedPath: null,
      ffprobePath: null,
      managedDir: null,
    },
    androidBuild: {
      state: "missing",
      javaHome: null,
      androidSdkRoot: null,
      needsConfirmation: false,
      message: "Electron capture bridge is unavailable.",
      details: [],
      installable: false,
    },
  },
  android: {
    hostState: "missing-adb",
    adbPath: null,
    selectedDeviceId: null,
    companionPackage: "com.hayaletev.androidcompanion",
    previewMode: "scrcpy-camera",
    reverseState: "not-configured",
    pairingHint: "Electron capture bridge is unavailable.",
    message: "Electron capture bridge is unavailable.",
    devices: [],
    artifact: {
      buildState: "missing",
      applicationId: "com.hayaletev.androidcompanion",
      mainActivity: "com.hayaletev.androidcompanion/.MainActivity",
      versionName: null,
      versionCode: null,
      apkPath: null,
      builtAt: null,
      sourceManifestPath: "",
      bridgePort: 48561,
    },
  },
  scrcpy: {
    available: false,
    version: null,
    activeSession: null,
    mode: null,
    deviceId: null,
    target: null,
    startedAt: null,
    previewVideo: null,
    lastLogs: [],
    lastError: "Electron capture bridge is unavailable.",
    setupHint: null,
  },
  bridge: {
    state: "error",
    port: 48561,
    registeredDeviceId: null,
    lastSeenAt: null,
    lastError: "Electron capture bridge is unavailable.",
  },
  analyze: {
    state: "idle",
    target: "analyze-compose",
    deviceId: null,
    previewMode: "scrcpy-camera",
    previewVideo: null,
    pendingCommand: null,
    pendingInboxCount: 0,
    lastCaptureAt: null,
    latestAsset: null,
    message: "Analyze phone capture session is unavailable.",
  },
  operation: {
    state: "idle",
    action: null,
    message: null,
    progress: null,
    details: [],
    updatedAt: null,
  },
};

function getElectronApi(): typeof window.electronAPI | undefined {
  return window.electronAPI;
}

function normalizeTranscriptSnapshot(value: unknown): CaptureTranscriptStatusSnapshot {
  if (
    typeof value === "object" &&
    value !== null &&
    "appLanguage" in value &&
    "variant" in value &&
    "runtime" in value
  ) {
    return value as CaptureTranscriptStatusSnapshot;
  }

  return FALLBACK_CAPTURE_STATUS.transcript;
}

function normalizeAndroidDevice(value: unknown): CaptureAndroidDeviceStatus | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "deviceId" in value &&
    "label" in value &&
    "connectionState" in value
  ) {
    return value as CaptureAndroidDeviceStatus;
  }

  return null;
}

function normalizeAndroidStatus(value: unknown): CaptureAndroidStatus {
  if (
    typeof value === "object" &&
    value !== null &&
    "hostState" in value &&
    "devices" in value &&
    Array.isArray((value as CaptureAndroidStatus).devices)
  ) {
    return {
      ...(value as CaptureAndroidStatus),
      devices: (value as CaptureAndroidStatus).devices
        .map((entry) => normalizeAndroidDevice(entry))
        .filter((entry): entry is CaptureAndroidDeviceStatus => entry !== null),
    };
  }

  return FALLBACK_CAPTURE_STATUS.android;
}

function normalizeScrcpyStatus(value: unknown): CaptureScrcpyStatus {
  if (typeof value === "object" && value !== null && "available" in value) {
    const rawStatus = value as CaptureScrcpyStatus;
    return {
      ...FALLBACK_CAPTURE_STATUS.scrcpy,
      ...rawStatus,
      lastLogs: Array.isArray(rawStatus.lastLogs)
        ? rawStatus.lastLogs.filter(
            (entry): entry is string => typeof entry === "string" && entry.trim() !== ""
          )
        : FALLBACK_CAPTURE_STATUS.scrcpy.lastLogs,
    };
  }

  return FALLBACK_CAPTURE_STATUS.scrcpy;
}

function normalizeCaptureStatus(value: unknown): CaptureServiceStatus {
  if (
    typeof value === "object" &&
    value !== null &&
    "checkedAt" in value &&
    "transcript" in value &&
    "android" in value
  ) {
    const checkedAt = Number((value as CaptureServiceStatus).checkedAt);
    const rawOperation =
      typeof (value as CaptureServiceStatus).operation === "object"
        ? (value as CaptureServiceStatus).operation
        : null;
    return {
      ...FALLBACK_CAPTURE_STATUS,
      ...(value as CaptureServiceStatus),
      checkedAt: Number.isFinite(checkedAt) ? checkedAt : 0,
      transcript: normalizeTranscriptSnapshot((value as CaptureServiceStatus).transcript),
      android: normalizeAndroidStatus((value as CaptureServiceStatus).android),
      scrcpy: normalizeScrcpyStatus((value as CaptureServiceStatus).scrcpy),
      hostDependencies:
        "hostDependencies" in value
          ? (value as CaptureServiceStatus).hostDependencies
          : FALLBACK_CAPTURE_STATUS.hostDependencies,
      operation:
        rawOperation !== null
          ? {
              ...FALLBACK_CAPTURE_STATUS.operation,
              ...rawOperation,
              details: Array.isArray(rawOperation.details)
                ? rawOperation.details.filter(
                    (entry): entry is string => typeof entry === "string" && entry.trim() !== ""
                  )
                : FALLBACK_CAPTURE_STATUS.operation.details,
            }
          : FALLBACK_CAPTURE_STATUS.operation,
    };
  }

  return FALLBACK_CAPTURE_STATUS;
}

function normalizeImportedAsset(value: unknown): CaptureImportedAsset | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "originalName" in value &&
    "path" in value
  ) {
    return value as CaptureImportedAsset;
  }

  return null;
}

function normalizeActionOutcome(value: unknown, action: CaptureHostAction): CaptureActionOutcome {
  if (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    "message" in value &&
    "status" in value
  ) {
    const outcome = value as CaptureActionOutcome;
    return {
      action: outcome.action,
      ok: outcome.ok,
      message: outcome.message,
      status: normalizeCaptureStatus(outcome.status),
    };
  }

  if (typeof value === "object" && value !== null && "error" in value) {
    const rawError = (value as { error?: unknown }).error;
    const errorMessage =
      typeof rawError === "string" && rawError.trim() !== ""
        ? rawError.trim()
        : "Capture action is unavailable.";
    return {
      action,
      ok: false,
      message: errorMessage,
      status: FALLBACK_CAPTURE_STATUS,
    };
  }

  return {
    action,
    ok: false,
    message: "Capture action is unavailable.",
    status: FALLBACK_CAPTURE_STATUS,
  };
}

export async function getCaptureStatus(): Promise<CaptureServiceStatus> {
  const api = getElectronApi();
  if (typeof api?.["captureStatus"] !== "function") {
    return FALLBACK_CAPTURE_STATUS;
  }

  return normalizeCaptureStatus(await api["captureStatus"]());
}

export async function refreshCaptureStatus(): Promise<CaptureServiceStatus> {
  const api = getElectronApi();
  if (typeof api?.["captureRefreshStatus"] !== "function") {
    return FALLBACK_CAPTURE_STATUS;
  }

  return normalizeCaptureStatus(await api["captureRefreshStatus"]());
}

export async function consumeAnalyzeCaptureAssets(): Promise<CaptureImportedAsset[]> {
  const api = getElectronApi();
  if (typeof api?.["captureConsumeAnalyzeAssets"] !== "function") {
    return [];
  }

  const value = await api["captureConsumeAnalyzeAssets"]();
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeImportedAsset(entry))
    .filter((entry): entry is CaptureImportedAsset => entry !== null);
}

export async function runCaptureAction(
  action: CaptureHostAction,
  options: CaptureTargetActionOptions | CaptureAmbientListenerOptions | CaptureTorchOptions = {}
): Promise<CaptureActionOutcome> {
  const api = getElectronApi();
  switch (action) {
    case "prepare-host-dependencies":
      return normalizeActionOutcome(
        typeof api?.["capturePrepareHostDependencies"] === "function"
          ? await api["capturePrepareHostDependencies"]()
          : null,
        action
      );
    case "install-companion":
      return normalizeActionOutcome(
        typeof api?.["captureInstallCompanion"] === "function"
          ? await api["captureInstallCompanion"]()
          : null,
        action
      );
    case "launch-companion":
      return normalizeActionOutcome(
        typeof api?.["captureLaunchCompanion"] === "function"
          ? await api["captureLaunchCompanion"](options)
          : null,
        action
      );
    case "start-analyze-session":
      return normalizeActionOutcome(
        typeof api?.["captureStartAnalyzeSession"] === "function"
          ? await api["captureStartAnalyzeSession"](options)
          : null,
        action
      );
    case "stop-analyze-session":
      return normalizeActionOutcome(
        typeof api?.["captureStopAnalyzeSession"] === "function"
          ? await api["captureStopAnalyzeSession"](options)
          : null,
        action
      );
    case "start-analyze-preview":
      return normalizeActionOutcome(
        typeof api?.["captureStartAnalyzePreview"] === "function"
          ? await api["captureStartAnalyzePreview"](options)
          : null,
        action
      );
    case "stop-analyze-preview":
      return normalizeActionOutcome(
        typeof api?.["captureStopAnalyzePreview"] === "function"
          ? await api["captureStopAnalyzePreview"](options)
          : null,
        action
      );
    case "start-camera-feed":
      return normalizeActionOutcome(
        typeof api?.["captureStartCameraFeed"] === "function"
          ? await api["captureStartCameraFeed"](options)
          : null,
        action
      );
    case "stop-camera-feed":
      return normalizeActionOutcome(
        typeof api?.["captureStopCameraFeed"] === "function"
          ? await api["captureStopCameraFeed"](options)
          : null,
        action
      );
    case "start-interactive-mirror":
      return normalizeActionOutcome(
        typeof api?.["captureStartInteractiveMirror"] === "function"
          ? await api["captureStartInteractiveMirror"](options)
          : null,
        action
      );
    case "stop-interactive-mirror":
      return normalizeActionOutcome(
        typeof api?.["captureStopInteractiveMirror"] === "function"
          ? await api["captureStopInteractiveMirror"](options)
          : null,
        action
      );
    case "start-analyze-dictation":
      return normalizeActionOutcome(
        typeof api?.["captureStartAnalyzeDictation"] === "function"
          ? await api["captureStartAnalyzeDictation"](options)
          : null,
        action
      );
    case "stop-analyze-dictation":
      return normalizeActionOutcome(
        typeof api?.["captureStopAnalyzeDictation"] === "function"
          ? await api["captureStopAnalyzeDictation"](options)
          : null,
        action
      );
    case "cancel-analyze-dictation":
      return normalizeActionOutcome(
        typeof api?.["captureCancelAnalyzeDictation"] === "function"
          ? await api["captureCancelAnalyzeDictation"](options)
          : null,
        action
      );
    case "start-ambient-listener":
      return normalizeActionOutcome(
        typeof api?.["captureStartAmbientListener"] === "function"
          ? await api["captureStartAmbientListener"](options)
          : null,
        action
      );
    case "stop-ambient-listener":
      return normalizeActionOutcome(
        typeof api?.["captureStopAmbientListener"] === "function"
          ? await api["captureStopAmbientListener"](options)
          : null,
        action
      );
    case "set-torch":
      return normalizeActionOutcome(
        typeof api?.["captureSetTorch"] === "function"
          ? await api["captureSetTorch"](options)
          : null,
        action
      );
    case "start-tts":
      return normalizeActionOutcome(null, action);
    case "stop-tts":
      return normalizeActionOutcome(null, action);
    case "capture-analyze-photo":
      return normalizeActionOutcome(
        typeof api?.["captureRequestAnalyzePhoto"] === "function"
          ? await api["captureRequestAnalyzePhoto"](options)
          : null,
        action
      );
    case "retake-analyze-photo":
      return normalizeActionOutcome(
        typeof api?.["captureRetakeAnalyzePhoto"] === "function"
          ? await api["captureRetakeAnalyzePhoto"](options)
          : null,
        action
      );
    case "connect-device":
      return normalizeActionOutcome(null, action);
    case "disconnect-device":
      return normalizeActionOutcome(null, action);
    default:
      return normalizeActionOutcome(null, action);
  }
}

export async function connectCaptureDevice(address: string): Promise<CaptureActionOutcome> {
  const api = getElectronApi();
  return normalizeActionOutcome(
    typeof api?.["captureConnectDevice"] === "function"
      ? await api["captureConnectDevice"](address)
      : null,
    "connect-device"
  );
}

export async function disconnectCaptureDevice(deviceId: string): Promise<CaptureActionOutcome> {
  const api = getElectronApi();
  return normalizeActionOutcome(
    typeof api?.["captureDisconnectDevice"] === "function"
      ? await api["captureDisconnectDevice"](deviceId)
      : null,
    "disconnect-device"
  );
}

export async function confirmCaptureBootstrapInstall(): Promise<CaptureActionOutcome> {
  const api = getElectronApi();
  return normalizeActionOutcome(
    typeof api?.["captureInstallCompanion"] === "function"
      ? await api["captureInstallCompanion"]({ allowBootstrap: true })
      : null,
    "install-companion"
  );
}

export async function dismissCaptureOperation(): Promise<CaptureServiceStatus> {
  const api = getElectronApi();
  if (typeof api?.["captureDismissOperation"] !== "function") {
    return FALLBACK_CAPTURE_STATUS;
  }

  return normalizeCaptureStatus(await api["captureDismissOperation"]());
}

export function onCaptureMediaIngress(
  callback: (payload: CaptureMediaIngressPayload) => void
): () => void {
  const api = getElectronApi();
  if (api == null) {
    return () => {};
  }

  const onMedia = api["captureOnMediaIngress"];
  const offMedia = api["captureOffMediaIngress"];
  if (typeof onMedia !== "function" || typeof offMedia !== "function") {
    return () => {};
  }

  onMedia(callback);
  return () => {
    offMedia(callback);
  };
}

export function onCaptureDictationStatus(
  callback: (payload: CaptureDictationStatusPayload) => void
): () => void {
  const api = getElectronApi();
  if (api == null) {
    return () => {};
  }

  const onDictation = api["captureOnDictationStatus"];
  const offDictation = api["captureOffDictationStatus"];
  if (typeof onDictation !== "function" || typeof offDictation !== "function") {
    return () => {};
  }

  onDictation(callback);
  return () => {
    offDictation(callback);
  };
}

export function onCaptureAmbientStatus(
  callback: (payload: CaptureAmbientStatusPayload) => void
): () => void {
  const api = getElectronApi();
  if (api == null) {
    return () => {};
  }

  const onAmbient = api["captureOnAmbientStatus"];
  const offAmbient = api["captureOffAmbientStatus"];
  if (typeof onAmbient !== "function" || typeof offAmbient !== "function") {
    return () => {};
  }

  onAmbient(callback);
  return () => {
    offAmbient(callback);
  };
}
