import { randomUUID } from "crypto";
import { spawn } from "child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import { createReadStream } from "fs";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { BrowserWindow } from "electron";
import { loadSettings } from "./settings-manager.ts";
import { transcriptService } from "./transcript-service.ts";
import {
  ScrcpySessionManager,
  type ScrcpyChildProcess,
  type ScrcpySessionStartResult,
  type ScrcpyUnexpectedCloseEvent,
} from "./scrcpy-session-manager.ts";
import {
  resolveAdbPath,
  resolveScrcpyPath,
  inspectFfmpegDependency,
  inspectV4l2LoopbackDependency,
  installManagedFfmpeg,
  getManagedFfmpegPath,
  getManagedAdbPath,
  getManagedAndroidSdkRoot,
  getManagedJdkHome,
} from "./host-dependency-service.ts";
import {
  CompanionLiveFeedHub,
  type CompanionLiveFramePayload,
} from "./capture/companion-live-feed.ts";
import { normalizeAppLanguage } from "../shared/i18n/locale.js";
import { normalizeTranscriptModelVariant } from "../shared/transcript/model-catalog.js";
import { getTtsModelDescriptor } from "../shared/tts/model-catalog.js";
import { operationsService } from "./operations-service.ts";

import type {
  CaptureActionOutcome,
  CaptureAmbientListenerOptions,
  CaptureAmbientStatusPayload,
  CaptureAndroidArtifactStatus,
  CaptureAndroidHostState,
  CaptureAndroidStatus,
  CaptureAndroidPermissionStatus,
  CaptureAnalyzeSessionState,
  CaptureCompanionTtsPayload,
  CaptureDictationStatusPayload,
  CaptureHostDependenciesStatus,
  CaptureImportedAsset,
  CaptureMediaIngressPayload,
  CaptureServiceStatus,
  CaptureTorchOptions,
} from "../src/types/capture.ts";

import type { TranscriptTargetId } from "../src/types/transcript.ts";
import type {
  TtsLanguage,
  TtsManagedModelId,
  TtsStatusState,
  TtsTargetId,
} from "../src/types/tts.ts";

import {
  isRecord,
  normalizeText,
  normalizeTranscriptTarget,
  normalizeAmbientStatusState,
  resolveCaptureSettings,
  resolveAmbientCommandProfile,
  buildCompanionCommandProfile,
  resolveCompanionTranscriptModelProfile,
  resolveCaptureActionFromCommand,
  isMediaCaptureCommand,
  getCommandRequestId,
  CAPTURE_SCRCPY_STARTUP_GRACE_MS,
  CAPTURE_SCRCPY_STOP_TIMEOUT_MS,
  CAPTURE_SCRCPY_CAMERA_SIZE,
  CAPTURE_SCRCPY_LOG_LIMIT,
  CAPTURE_SCRCPY_V4L2_BUFFER_MS,
  CAPTURE_SESSION_STALE_MS,
  CAPTURE_DICTATION_STATUS_CHANNEL,
  findTranscriptDescriptorByFileName,
  type CompanionBridgeSessionRecord,
  type PendingBridgeCommand,
  type CompanionBuildScriptEvent,
  type CaptureCompanionCommandKind,
} from "./capture/types-and-defaults.ts";

import {
  fileExists,
  resolveScrcpyV4l2Sink,
  runCommand,
  shutdownAdbServerIfTouched,
  runStreamingCommand,
  parseAdbDeviceList,
  determineHostState,
  selectReadyDevice,
  buildHostMessage,
  inspectReverseState,
  inspectReadyDeviceDetails,
  buildScrcpyV4l2SetupHint,
  createUnknownPermissions,
  CAPTURE_ADB_TIMEOUT_MS,
  CAPTURE_SCRCPY_CAMERA_FPS,
} from "./capture/adb-helper.ts";

import {
  getCaptureProjectRoot,
  getCompanionApkPath,
  getCompanionBuildScriptPath,
  ensureDirectCompanionModelArchive,
  readCompanionManifest,
  summarizeCompanionBuildFailure,
  CAPTURE_ANDROID_COMPANION_PACKAGE,
  CAPTURE_BRIDGE_PORT,
} from "./capture/companion-manager.ts";

import {
  ensureCaptureIngressPaths,
  moveAnalyzeAssetToStaging,
  readAnalyzeIngressSnapshot,
  writeAnalyzeAsset,
  writeTargetCaptureAsset,
  CAPTURE_ANALYZE_TARGET,
} from "./capture/ingress-manager.ts";

import {
  normalizeCompanionDiagnosticsShadowSnapshot,
  writeCompanionDiagnosticsShadowSnapshot,
} from "./capture/diagnostics-helper.ts";
import { companionSessionManager } from "./capture/companion-session-manager.ts";

export const CAPTURE_MEDIA_INGRESS_CHANNEL = "capture:media-ingress";
export const CAPTURE_AMBIENT_STATUS_CHANNEL = "capture:ambient-status";
export const CAPTURE_SCRCPY_V4L2_LABEL = "Hayalet Ev Camera Feed";

function createDefaultAnalyzeState(): CaptureServiceStatus["analyze"] {
  return {
    state: "idle",
    target: CAPTURE_ANALYZE_TARGET,
    deviceId: null,
    previewMode: "scrcpy-camera",
    previewVideo: null,
    pendingCommand: null,
    pendingInboxCount: 0,
    lastCaptureAt: null,
    latestAsset: null,
    message: "Analyze phone capture session is idle.",
  };
}

function createDefaultOperationState(): CaptureServiceStatus["operation"] {
  return {
    state: "idle",
    action: null,
    message: null,
    progress: null,
    details: [],
    updatedAt: null,
  };
}

function parseCaptureSize(value: string): { width: number; height: number } {
  const match = value.match(/^(\d+)x(\d+)$/);
  return {
    width: match?.[1] !== undefined ? Number(match[1]) : 640,
    height: match?.[2] !== undefined ? Number(match[2]) : 480,
  };
}

function createCompanionBuildScriptEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
  };
}

function shouldUseCompanionLiveFeed(target: TranscriptTargetId | null): boolean {
  return target === CAPTURE_ANALYZE_TARGET || target?.startsWith("room:") === true;
}

class CaptureService {
  private lastStatus: CaptureServiceStatus | null = null;
  private bridgeServer: Server | null = null;
  private bridgeState: CaptureServiceStatus["bridge"] = {
    state: "starting",
    port: CAPTURE_BRIDGE_PORT,
    registeredDeviceId: null,
    lastSeenAt: null,
    lastError: null,
  };
  private readonly bridgeSessions = new Map<string, CompanionBridgeSessionRecord>();
  private readonly pendingCommands = new Map<string, PendingBridgeCommand[]>();
  private readonly activeAnalyzeMediaRequestIds = new Set<string>();
  private readonly scrcpyHub: ScrcpySessionManager;
  private readonly companionLiveFeed = new CompanionLiveFeedHub();
  private analyzeState = createDefaultAnalyzeState();
  private operationState = createDefaultOperationState();

  constructor() {
    this.scrcpyHub = new ScrcpySessionManager({
      onUnexpectedClose: (event): void => {
        this.handleScrcpyUnexpectedClose(event);
      },
      resolveScrcpyPath: async (): Promise<string | null> => await resolveScrcpyPath(),
      inspectScrcpyVersion: async (scrcpyPath): Promise<string | null> => {
        const versionResult = await runCommand(scrcpyPath, ["--version"], 5_000).catch(() => null);
        const rawVersion =
          normalizeText(versionResult?.stdout) ?? normalizeText(versionResult?.stderr);
        return (
          rawVersion
            ?.split(/\r?\n/)
            .map((line) => line.trim())
            .find((line) => line !== "") ?? null
        );
      },
      resolveV4l2Sink: async (): ReturnType<typeof resolveScrcpyV4l2Sink> =>
        await resolveScrcpyV4l2Sink(),
      spawnProcess: (scrcpyPath, args, options): ScrcpyChildProcess =>
        spawn(scrcpyPath, args, options) as unknown as ScrcpyChildProcess,
      getProjectRoot: getCaptureProjectRoot,
      getSetupHint: (): string | null =>
        process.platform === "linux" ? buildScrcpyV4l2SetupHint() : null,
      startupGraceMs: CAPTURE_SCRCPY_STARTUP_GRACE_MS,
      stopTimeoutMs: CAPTURE_SCRCPY_STOP_TIMEOUT_MS,
      logLimit: CAPTURE_SCRCPY_LOG_LIMIT,
      cameraSize: CAPTURE_SCRCPY_CAMERA_SIZE,
      cameraFps: CAPTURE_SCRCPY_CAMERA_FPS,
      v4l2BufferMs: CAPTURE_SCRCPY_V4L2_BUFFER_MS,
    });
  }

  async getStatus(): Promise<CaptureServiceStatus> {
    return this.lastStatus ?? (await this.refreshStatus());
  }

  async shutdown(): Promise<void> {
    await companionSessionManager.shutdownAll();
    await this.scrcpyHub.stopSession();
    await this.closeBridgeServer();
    this.bridgeSessions.clear();
    this.pendingCommands.clear();
    this.activeAnalyzeMediaRequestIds.clear();
    operationsService.release("android-torch", {
      id: "android-companion-torch",
      label: "Android torch",
    });
    this.lastStatus = null;
    await shutdownAdbServerIfTouched(resolveAdbPath);
  }

  private async closeBridgeServer(): Promise<void> {
    const server = this.bridgeServer;
    if (server === null) {
      return;
    }

    this.bridgeServer = null;
    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.close((error?: Error) => {
        const closeError = error as NodeJS.ErrnoException | undefined;
        if (closeError !== undefined && closeError.code !== "ERR_SERVER_NOT_RUNNING") {
          rejectPromise(closeError);
          return;
        }
        resolvePromise();
      });
    });
    this.bridgeState = {
      ...this.bridgeState,
      state: "starting",
      registeredDeviceId: null,
      lastSeenAt: null,
      lastError: null,
    };
  }

  async refreshStatus(): Promise<CaptureServiceStatus> {
    const settings = await loadSettings();
    const captureSettings = resolveCaptureSettings(settings);
    const appLanguage = normalizeAppLanguage(settings?.general?.language);
    const variant = normalizeTranscriptModelVariant(
      settings?.general?.transcriptModelVariant,
      "full"
    );
    const transcriptRuntime = await transcriptService.getStatus().catch(() => null);
    await this.ensureBridgeServer();
    this.cleanupStaleBridgeSessions();
    const android = await this.inspectAndroid(captureSettings.preferredDeviceId);
    const scrcpy = await this.scrcpyHub.getStatus();
    const hostDependencies = await this.inspectHostDependencies(android, scrcpy);
    const ingress = await readAnalyzeIngressSnapshot();
    const activeSession =
      android.selectedDeviceId !== null
        ? (this.bridgeSessions.get(android.selectedDeviceId) ?? null)
        : null;
    const scrcpyPreviewVideo =
      scrcpy.activeSession?.mode === "camera-feed" &&
      scrcpy.activeSession.target === CAPTURE_ANALYZE_TARGET
        ? scrcpy.activeSession.previewVideo
        : null;
    const analyzePreviewVideo =
      scrcpyPreviewVideo ??
      this.companionLiveFeed.getActivePreviewVideo({
        deviceId: android.selectedDeviceId,
        target: CAPTURE_ANALYZE_TARGET,
      });

    this.analyzeState = {
      ...this.analyzeState,
      deviceId: android.selectedDeviceId,
      previewVideo: analyzePreviewVideo,
      pendingInboxCount: ingress.pendingInboxCount,
      latestAsset: ingress.latestStagedAsset ?? this.analyzeState.latestAsset,
      message: this.resolveAnalyzeMessage(activeSession, ingress.pendingInboxCount),
      state: this.resolveAnalyzeState(activeSession, ingress.pendingInboxCount),
    };

    const status: CaptureServiceStatus = {
      checkedAt: Date.now(),
      transcript: {
        appLanguage,
        variant,
        runtime: transcriptRuntime,
      },
      hostDependencies,
      android,
      scrcpy,
      bridge: {
        ...this.bridgeState,
      },
      analyze: {
        ...this.analyzeState,
      },
      operation: {
        ...this.operationState,
      },
    };
    this.lastStatus = status;
    return status;
  }

  async prepareHostDependencies(): Promise<CaptureActionOutcome> {
    this.setOperationState({
      state: "running",
      action: "prepare-host-dependencies",
      message: "Preparing shared capture dependencies.",
      progress: 0.02,
      details: ["Shared FFmpeg and Android companion prerequisites will be prepared."],
    });

    try {
      const ffmpegStatus = await inspectFfmpegDependency();
      if (ffmpegStatus.installed !== true) {
        await installManagedFfmpeg((event) => {
          this.setOperationState({
            state: "running",
            action: "prepare-host-dependencies",
            message: event.message,
            progress: 0.04 + event.progress * 0.34,
            details: event.details,
          });
        });
      } else {
        this.setOperationState({
          state: "running",
          action: "prepare-host-dependencies",
          message: "Using the existing shared FFmpeg runtime.",
          progress: 0.38,
          details: [`FFmpeg: ${ffmpegStatus.ffmpegPath ?? getManagedFfmpegPath()}`],
        });
      }

      await this.ensureCompanionArtifact({
        allowBootstrap: true,
        action: "prepare-host-dependencies",
      });

      return await this.buildActionOutcome(
        "prepare-host-dependencies",
        true,
        "Shared capture dependencies are ready."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return await this.buildActionOutcome("prepare-host-dependencies", false, message);
    }
  }

  private setOperationState(
    nextState: Partial<CaptureServiceStatus["operation"]> &
      Pick<CaptureServiceStatus["operation"], "state">
  ): void {
    const details = Array.isArray(nextState.details)
      ? nextState.details
          .map((entry) => normalizeText(entry))
          .filter((entry): entry is string => entry !== null)
          .slice(-18)
      : this.operationState.details;
    this.operationState = {
      ...this.operationState,
      ...nextState,
      details,
      updatedAt: Date.now(),
    };
    this.lastStatus = null;
  }

  async dismissOperation(): Promise<CaptureServiceStatus> {
    this.setOperationState(createDefaultOperationState());
    return await this.refreshStatus();
  }

  async installCompanion(options?: { allowBootstrap?: boolean }): Promise<CaptureActionOutcome> {
    const status = await this.refreshStatus();
    const adbPath = status.android.adbPath;
    const deviceId = status.android.selectedDeviceId;
    if (adbPath === null || deviceId === null) {
      return await this.buildActionOutcome(
        "install-companion",
        false,
        status.android.message ?? "No ready Android device is available."
      );
    }

    this.setOperationState({
      state: "running",
      action: "install-companion",
      message: `Preparing the Android companion for ${deviceId}.`,
      progress: 0.08,
      details: [`Selected device: ${deviceId}`],
    });
    const artifact = await this.ensureCompanionArtifact({
      allowBootstrap: options?.allowBootstrap === true,
    }).catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return await this.buildActionOutcome("install-companion", false, message);
    });
    if ("ok" in artifact) {
      return artifact;
    }

    const apkPath = artifact.apkPath ?? getCompanionApkPath();
    this.setOperationState({
      state: "running",
      action: "install-companion",
      message: `Installing the Android companion on ${deviceId}.`,
      progress: 0.82,
      details: [...this.operationState.details, `Installing the APK on ${deviceId} through ADB.`],
    });
    const installResult = await runCommand(adbPath, [
      "-s",
      deviceId,
      "install",
      "-r",
      apkPath,
    ]).catch((error) => {
      throw new Error(error instanceof Error ? error.message : String(error));
    });
    if (installResult.exitCode !== 0) {
      const installMessage =
        normalizeText(installResult.stderr) ??
        normalizeText(installResult.stdout) ??
        "ADB install failed.";
      if (installMessage.includes("INSTALL_FAILED_UPDATE_INCOMPATIBLE")) {
        this.setOperationState({
          state: "running",
          action: "install-companion",
          message: "Existing Android companion signature differs; reinstalling cleanly.",
          progress: 0.88,
          details: [
            ...this.operationState.details,
            "Removing the existing companion package before a clean install.",
          ],
        });
        const uninstallResult = await runCommand(adbPath, [
          "-s",
          deviceId,
          "uninstall",
          CAPTURE_ANDROID_COMPANION_PACKAGE,
        ]).catch((error) => {
          throw new Error(error instanceof Error ? error.message : String(error));
        });
        if (uninstallResult.exitCode !== 0) {
          return await this.buildActionOutcome(
            "install-companion",
            false,
            normalizeText(uninstallResult.stderr) ??
              normalizeText(uninstallResult.stdout) ??
              "ADB uninstall failed before clean companion install."
          );
        }

        this.setOperationState({
          state: "running",
          action: "install-companion",
          message: `Installing the Android companion cleanly on ${deviceId}.`,
          progress: 0.92,
          details: [...this.operationState.details, `Clean installing the APK on ${deviceId}.`],
        });
        const cleanInstallResult = await runCommand(adbPath, [
          "-s",
          deviceId,
          "install",
          apkPath,
        ]).catch((error) => {
          throw new Error(error instanceof Error ? error.message : String(error));
        });
        if (cleanInstallResult.exitCode !== 0) {
          return await this.buildActionOutcome(
            "install-companion",
            false,
            normalizeText(cleanInstallResult.stderr) ??
              normalizeText(cleanInstallResult.stdout) ??
              "ADB clean install failed."
          );
        }
      } else {
        return await this.buildActionOutcome("install-companion", false, installMessage);
      }
    }

    return await this.buildActionOutcome(
      "install-companion",
      true,
      `Android companion ${artifact.versionName ?? ""} is installed on ${deviceId}.`.trim()
    );
  }

  async connectDevice(address: string): Promise<CaptureActionOutcome> {
    const normalizedAddress = normalizeText(address);
    const status = await this.refreshStatus();
    const adbPath = status.android.adbPath;
    if (adbPath === null) {
      return await this.buildActionOutcome(
        "connect-device",
        false,
        status.android.message ?? "ADB is not available yet."
      );
    }
    if (normalizedAddress === null) {
      return await this.buildActionOutcome(
        "connect-device",
        false,
        "Provide a host:port address for wireless ADB."
      );
    }

    const connectResult = await runCommand(adbPath, ["connect", normalizedAddress]).catch(
      (error) => {
        throw new Error(error instanceof Error ? error.message : String(error));
      }
    );
    if (connectResult.exitCode !== 0) {
      return await this.buildActionOutcome(
        "connect-device",
        false,
        normalizeText(connectResult.stderr) ??
          normalizeText(connectResult.stdout) ??
          "ADB connect failed."
      );
    }

    return await this.buildActionOutcome(
      "connect-device",
      true,
      normalizeText(connectResult.stdout) ?? `Connected to ${normalizedAddress}.`
    );
  }

  async disconnectDevice(deviceId: string): Promise<CaptureActionOutcome> {
    const normalizedDeviceId = normalizeText(deviceId);
    const status = await this.refreshStatus();
    const adbPath = status.android.adbPath;
    if (adbPath === null) {
      return await this.buildActionOutcome(
        "disconnect-device",
        false,
        status.android.message ?? "ADB is not available yet."
      );
    }
    if (normalizedDeviceId === null) {
      return await this.buildActionOutcome(
        "disconnect-device",
        false,
        "A device id is required before disconnecting."
      );
    }

    const disconnectResult = await runCommand(adbPath, ["disconnect", normalizedDeviceId]).catch(
      (error) => {
        throw new Error(error instanceof Error ? error.message : String(error));
      }
    );
    if (disconnectResult.exitCode !== 0) {
      return await this.buildActionOutcome(
        "disconnect-device",
        false,
        normalizeText(disconnectResult.stderr) ??
          normalizeText(disconnectResult.stdout) ??
          "ADB disconnect failed."
      );
    }

    this.bridgeSessions.delete(normalizedDeviceId);
    operationsService.release("android-torch", {
      id: "android-companion-torch",
      label: "Android torch",
    });
    this.clearPendingAnalyzeCommands(normalizedDeviceId);
    if (this.analyzeState.deviceId === normalizedDeviceId) {
      this.resetAnalyzeSessionState("Analyze capture session was disconnected.");
    }

    return await this.buildActionOutcome(
      "disconnect-device",
      true,
      normalizeText(disconnectResult.stdout) ?? `Disconnected ${normalizedDeviceId}.`
    );
  }

  async launchCompanion(
    options: { target?: TranscriptTargetId | null; activeTab?: string | null } = {}
  ): Promise<CaptureActionOutcome> {
    const status = await this.refreshStatus();
    const settings = await loadSettings();
    const captureSettings = resolveCaptureSettings(settings);
    const target = options.target ?? CAPTURE_ANALYZE_TARGET;
    const adbPath = status.android.adbPath;
    const deviceId = status.android.selectedDeviceId;
    if (captureSettings.androidCompanionEnabled !== true) {
      return await this.buildActionOutcome(
        "launch-companion",
        false,
        "Android companion is disabled in Settings > Capture."
      );
    }
    if (adbPath === null || deviceId === null) {
      return await this.buildActionOutcome(
        "launch-companion",
        false,
        status.android.message ?? "No ready Android device is available."
      );
    }

    const reverseState = await this.ensureReverseTunnel(
      adbPath,
      deviceId,
      status.android.artifact.bridgePort
    );
    if (reverseState.ok !== true) {
      return await this.buildActionOutcome("launch-companion", false, reverseState.message);
    }

    const launchArgs = [
      "-s",
      deviceId,
      "shell",
      "am",
      "start",
      "-n",
      status.android.artifact.mainActivity,
      "--es",
      "deviceId",
      deviceId,
      "--es",
      "target",
      target,
      "--es",
      "defaultLens",
      captureSettings.defaultLens,
      "--es",
      "photoQuality",
      captureSettings.photoQuality,
      "--es",
      "photoFlashMode",
      captureSettings.photoFlashMode,
    ];
    const activeTab = normalizeText(options.activeTab);
    if (activeTab !== null) {
      launchArgs.push("--es", "activeTab", activeTab);
    }

    const launchResult = await runCommand(adbPath, launchArgs).catch((error) => {
      throw new Error(error instanceof Error ? error.message : String(error));
    });
    if (launchResult.exitCode !== 0) {
      return await this.buildActionOutcome(
        "launch-companion",
        false,
        normalizeText(launchResult.stderr) ??
          normalizeText(launchResult.stdout) ??
          "Companion app could not be launched."
      );
    }

    if (target === CAPTURE_ANALYZE_TARGET) {
      this.analyzeState = {
        ...this.analyzeState,
        deviceId,
        state: "pending-launch",
        message: "Companion launch requested. Use the phone to capture and add images to Analyze.",
      };
    }
    return await this.buildActionOutcome(
      "launch-companion",
      true,
      "Companion app launch was requested on the phone."
    );
  }

  async startTts(options: {
    target: TranscriptTargetId;
    requestId: string;
    text: string;
    language: TtsLanguage;
    modelId: TtsManagedModelId;
  }): Promise<CaptureActionOutcome> {
    const normalizedText = normalizeText(options.text);
    const requestId = normalizeText(options.requestId);
    const descriptor = getTtsModelDescriptor(options.modelId);
    if (normalizedText === null || requestId === null || descriptor === null) {
      return await this.buildActionOutcome(
        "start-tts",
        false,
        "TTS text, requestId, and model are required."
      );
    }

    const launchOutcome = await this.launchCompanion({ target: options.target, activeTab: "tts" });
    if (launchOutcome.ok !== true) {
      return launchOutcome;
    }

    const ttsPayload: CaptureCompanionTtsPayload = {
      text: normalizedText,
      language: options.language,
      modelId: options.modelId,
      profile: {
        engine: "sherpa-onnx",
        modelId: options.modelId,
        language: options.language,
        voice: descriptor.voice,
        sampleRate: descriptor.sampleRate,
      },
    };

    return await this.enqueueAnalyzeCommand("start-tts", "Android TTS requested.", {
      target: options.target,
      requestId,
      replaceExistingKinds: ["start-tts", "stop-tts"],
      tts: ttsPayload,
    });
  }

  async stopTts(options: {
    target: TranscriptTargetId;
    requestId: string;
  }): Promise<CaptureActionOutcome> {
    const requestId = normalizeText(options.requestId);
    if (requestId === null) {
      return await this.buildActionOutcome("stop-tts", false, "TTS requestId is required.");
    }

    return await this.enqueueAnalyzeCommand("stop-tts", "Android TTS stop requested.", {
      target: options.target,
      requestId,
      replaceExistingKinds: ["stop-tts"],
    });
  }

  async requestAnalyzeSession(
    options: { target?: TranscriptTargetId | null; requestId?: string | null } = {}
  ): Promise<CaptureActionOutcome> {
    const target = options.target ?? CAPTURE_ANALYZE_TARGET;
    const requestId = normalizeText(options.requestId);
    const launchOutcome = await this.launchCompanion({ target });
    if (launchOutcome.ok !== true) {
      return launchOutcome;
    }

    return await this.enqueueAnalyzeCommand("open-camera", "Analyze capture session requested.", {
      target,
      requestId,
      replaceExisting: true,
    });
  }

  async startAnalyzePreviewStream(
    options: {
      target?: TranscriptTargetId | null;
      requestId?: string | null;
      deviceId?: string | null;
    } = {}
  ): Promise<CaptureActionOutcome> {
    const target = options.target ?? CAPTURE_ANALYZE_TARGET;
    if (target !== CAPTURE_ANALYZE_TARGET) {
      return await this.buildActionOutcome(
        "start-analyze-preview",
        false,
        "Analyze preview wrapper requires the Analyze target."
      );
    }

    return await this.startCameraFeedForAction(options, "start-analyze-preview");
  }

  async startCameraFeed(
    options: {
      target?: TranscriptTargetId | null;
      requestId?: string | null;
      deviceId?: string | null;
    } = {}
  ): Promise<CaptureActionOutcome> {
    return await this.startCameraFeedForAction(options, "start-camera-feed");
  }

  async stopAnalyzePreviewStream(
    options: { target?: TranscriptTargetId | null; requestId?: string | null } = {}
  ): Promise<CaptureActionOutcome> {
    return await this.stopCameraFeedForAction(options, "stop-analyze-preview");
  }

  async stopCameraFeed(
    options: { target?: TranscriptTargetId | null; requestId?: string | null } = {}
  ): Promise<CaptureActionOutcome> {
    return await this.stopCameraFeedForAction(options, "stop-camera-feed");
  }

  async startInteractiveMirror(
    options: {
      target?: TranscriptTargetId | null;
      requestId?: string | null;
      deviceId?: string | null;
    } = {}
  ): Promise<CaptureActionOutcome> {
    const target = options.target ?? CAPTURE_ANALYZE_TARGET;
    const requestId = normalizeText(options.requestId) ?? randomUUID();
    const status = await this.refreshStatus();
    const deviceId = options.deviceId ?? status.android.selectedDeviceId;
    if (deviceId === null) {
      return await this.buildActionOutcome(
        "start-interactive-mirror",
        false,
        status.android.message ?? "No ready Android device is available."
      );
    }

    const started = await this.scrcpyHub.startInteractiveMirror({
      deviceId,
      target,
      requestId,
      action: "start-interactive-mirror",
    });
    if (started.ok !== true) {
      return await this.buildActionOutcome("start-interactive-mirror", false, started.message);
    }
    this.lastStatus = null;
    return await this.buildActionOutcome("start-interactive-mirror", true, started.message);
  }

  async stopInteractiveMirror(): Promise<CaptureActionOutcome> {
    const stopped = await this.scrcpyHub.stopSession("interactive-mirror");
    this.lastStatus = null;
    if (stopped !== true) {
      return await this.buildPassiveActionOutcome(
        "stop-interactive-mirror",
        true,
        "Scrcpy interactive mirror is already stopped."
      );
    }

    return await this.buildActionOutcome(
      "stop-interactive-mirror",
      true,
      "Scrcpy interactive mirror was stopped."
    );
  }

  private async startCameraFeedForAction(
    options: {
      target?: TranscriptTargetId | null;
      requestId?: string | null;
      deviceId?: string | null;
    },
    action: "start-camera-feed" | "start-analyze-preview"
  ): Promise<CaptureActionOutcome> {
    const target = options.target ?? CAPTURE_ANALYZE_TARGET;
    const requestId = normalizeText(options.requestId) ?? randomUUID();
    const settings = await loadSettings();
    const captureSettings = resolveCaptureSettings(settings);
    if (target === CAPTURE_ANALYZE_TARGET && captureSettings.androidCompanionEnabled !== true) {
      return await this.buildActionOutcome(
        action,
        false,
        "Android capture is disabled in Settings > Capture."
      );
    }

    const status = await this.refreshStatus();
    const deviceId = options.deviceId ?? status.android.selectedDeviceId;
    if (deviceId === null) {
      return await this.buildActionOutcome(
        action,
        false,
        status.android.message ?? "No ready Android device is available."
      );
    }

    const useCompanionLiveFeed = shouldUseCompanionLiveFeed(target);
    if (useCompanionLiveFeed) {
      const existingBridgeSession = this.getBridgeSessionForTarget(deviceId, target, {
        requirePreviewActive: false,
      });
      if (existingBridgeSession === null) {
        const launchOutcome = await this.launchCompanion({ target, activeTab: "image" });
        if (launchOutcome.ok !== true) {
          return await this.buildActionOutcome(action, false, launchOutcome.message);
        }
      }
      const transcriptModel = resolveCompanionTranscriptModelProfile(settings, captureSettings);
      this.queuePendingBridgeCommand(
        deviceId,
        {
          id: randomUUID(),
          kind: "open-camera",
          target,
          requestId,
          createdAt: Date.now(),
          profile: buildCompanionCommandProfile(captureSettings, transcriptModel, {
            livePreview: useCompanionLiveFeed,
          }),
          ambient: null,
          torch: null,
          tts: null,
        },
        { replaceExistingKinds: ["open-camera"] }
      );

      const { width, height } = parseCaptureSize(CAPTURE_SCRCPY_CAMERA_SIZE);
      const liveFeed = this.companionLiveFeed.start({
        bridgePort: this.bridgeState.port,
        deviceId,
        target,
        requestId,
        width,
        height,
        fps: Math.min(CAPTURE_SCRCPY_CAMERA_FPS, 10),
      });
      const statusWithLivePreview: CaptureServiceStatus = {
        ...status,
        scrcpy: {
          ...status.scrcpy,
          activeSession: {
            mode: "camera-feed",
            deviceId,
            target,
            requestId,
            startedAt: liveFeed.startedAt,
            previewVideo: liveFeed.previewVideo,
          },
          mode: "camera-feed",
          deviceId,
          target,
          startedAt: liveFeed.startedAt,
          previewVideo: liveFeed.previewVideo,
        },
      };
      if (target === CAPTURE_ANALYZE_TARGET) {
        this.analyzeState = {
          ...this.analyzeState,
          state: "ready",
          target,
          deviceId,
          previewVideo: liveFeed.previewVideo,
          pendingCommand: null,
          message: "Android companion live camera feed was started.",
        };
      }
      this.lastStatus = null;
      return this.buildImmediateActionOutcome(
        action,
        true,
        "Android companion live camera feed was started.",
        statusWithLivePreview
      );
    }

    const started = await this.startScrcpyCameraFeed({
      deviceId,
      target,
      requestId,
      cameraFacing: captureSettings.defaultLens,
      action,
    });
    if (started.ok !== true) {
      return await this.buildActionOutcome(action, false, started.message);
    }

    if (target === CAPTURE_ANALYZE_TARGET) {
      this.analyzeState = {
        ...this.analyzeState,
        state: "ready",
        target,
        deviceId,
        previewVideo: started.session.previewVideo,
        pendingCommand: null,
        message: started.message,
      };
    }
    this.lastStatus = null;
    return await this.buildActionOutcome(action, true, started.message);
  }

  private async stopCameraFeedForAction(
    options: { target?: TranscriptTargetId | null; requestId?: string | null },
    action: "stop-camera-feed" | "stop-analyze-preview"
  ): Promise<CaptureActionOutcome> {
    const target = options.target ?? CAPTURE_ANALYZE_TARGET;
    const requestId = normalizeText(options.requestId);
    const activeSession = this.scrcpyHub.getActiveSessionStatus();
    const stoppedLiveFeed = this.companionLiveFeed.stop({ target, requestId });
    const stoppedScrcpyFeed = await this.stopScrcpyCameraFeed();
    const stopped = stoppedLiveFeed || stoppedScrcpyFeed;
    if (
      stoppedLiveFeed === true ||
      (target === CAPTURE_ANALYZE_TARGET && action === "stop-analyze-preview")
    ) {
      const status = await this.refreshStatus();
      const deviceId = this.resolveAnalyzeCommandDeviceId(status, false);
      if (deviceId !== null) {
        this.markBridgePreviewInactive(deviceId, target);
        await this.enqueueAnalyzeCommand("close-camera", "Phone live camera feed was stopped.", {
          deviceId,
          target,
          requestId,
          replaceExistingKinds: ["open-camera", "close-camera"],
          requireSession: false,
        }).catch(() => null);
      }
    }
    if (
      target === CAPTURE_ANALYZE_TARGET &&
      (activeSession?.target === CAPTURE_ANALYZE_TARGET ||
        stoppedLiveFeed === true ||
        action === "stop-analyze-preview")
    ) {
      this.analyzeState = {
        ...this.analyzeState,
        state: "idle",
        previewVideo: null,
        pendingCommand: null,
        message: stopped
          ? "Android camera feed was stopped."
          : "Android camera feed is already stopped.",
      };
    }
    this.lastStatus = null;
    if (stopped !== true) {
      return await this.buildPassiveActionOutcome(
        action,
        true,
        "Android camera feed is already stopped."
      );
    }

    return await this.buildActionOutcome(action, true, "Android camera feed was stopped.");
  }

  private async startScrcpyCameraFeed(options: {
    deviceId: string;
    target: TranscriptTargetId | null;
    requestId: string | null;
    cameraFacing: "back" | "front";
    action: "start-camera-feed" | "start-analyze-preview";
  }): Promise<ScrcpySessionStartResult> {
    return await this.scrcpyHub.startCameraFeed(options);
  }

  private async stopScrcpyCameraFeed(): Promise<boolean> {
    return await this.scrcpyHub.stopSession("camera-feed");
  }

  private handleScrcpyUnexpectedClose(event: ScrcpyUnexpectedCloseEvent): void {
    if (event.session.mode === "camera-feed" && event.session.target === CAPTURE_ANALYZE_TARGET) {
      this.analyzeState = {
        ...this.analyzeState,
        state: "idle",
        previewVideo: null,
        pendingCommand: null,
        message: event.message,
      };
    }
    this.lastStatus = null;
    this.setOperationState({
      state: "error",
      action: event.action,
      message: event.message,
      progress: null,
      details: event.logs,
    });
  }

  async requestAnalyzeDictation(
    action: "start" | "stop",
    options: { requestId?: string | null; target?: TranscriptTargetId | null } = {}
  ): Promise<CaptureActionOutcome> {
    const target = options.target ?? CAPTURE_ANALYZE_TARGET;
    const requestId = normalizeText(options.requestId);
    if (action === "start") {
      if (requestId === null) {
        return await this.buildActionOutcome(
          "start-analyze-dictation",
          false,
          "Android dictation requestId is required."
        );
      }

      const launchOutcome = await this.launchCompanion({ target });
      if (launchOutcome.ok !== true) {
        return launchOutcome;
      }

      return await this.enqueueAnalyzeCommand(
        "start-dictation",
        "Android dictation recording was requested.",
        {
          target,
          requestId,
          replaceExistingKinds: ["start-dictation", "stop-dictation"],
        }
      );
    }

    if (requestId === null) {
      return await this.buildActionOutcome(
        "stop-analyze-dictation",
        false,
        "Android dictation requestId is required."
      );
    }

    const status = await this.refreshStatus();
    const deviceId = this.resolveAnalyzeCommandDeviceId(status, false);
    if (deviceId === null) {
      return await this.buildActionOutcome(
        "stop-analyze-dictation",
        false,
        status.android.message ?? "No ready Android device is available."
      );
    }

    return await this.enqueueAnalyzeCommand(
      "stop-dictation",
      "Android dictation recording was stopped.",
      {
        target,
        requestId,
        deviceId,
        replaceExistingKinds: ["stop-dictation"],
      }
    );
  }

  async cancelAnalyzeDictation(
    options: { requestId?: string | null; target?: TranscriptTargetId | null } = {}
  ): Promise<CaptureActionOutcome> {
    const target = options.target ?? CAPTURE_ANALYZE_TARGET;
    const requestId = normalizeText(options.requestId);
    const status = await this.refreshStatus();
    const adbPath = status.android.adbPath;
    const deviceId = this.resolveAnalyzeCommandDeviceId(status, false);
    if (adbPath === null || deviceId === null) {
      return await this.buildActionOutcome(
        "cancel-analyze-dictation",
        false,
        status.android.message ?? "No ready Android device is available."
      );
    }

    this.clearPendingTargetCommands(deviceId, target);
    const forceStopResult = await runCommand(
      adbPath,
      ["-s", deviceId, "shell", "am", "force-stop", CAPTURE_ANDROID_COMPANION_PACKAGE],
      CAPTURE_ADB_TIMEOUT_MS
    ).catch((error) => ({
      exitCode: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      timedOut: false,
    }));
    await runCommand(
      adbPath,
      ["-s", deviceId, "reverse", "--remove", `tcp:${status.android.artifact.bridgePort}`],
      CAPTURE_ADB_TIMEOUT_MS
    ).catch(() => null);

    this.bridgeSessions.delete(deviceId);
    this.bridgeState = {
      ...this.bridgeState,
      registeredDeviceId: null,
      lastSeenAt: null,
      lastError: null,
    };
    if (target === CAPTURE_ANALYZE_TARGET) {
      this.resetAnalyzeSessionState("Android dictation was cancelled.");
    }
    if (requestId !== null) {
      this.emitCaptureDictationStatus({
        requestId,
        createdAt: new Date().toISOString(),
        source: "android-bridge",
        target,
        deviceId,
        status: "failed",
        message: "Android dictation was cancelled.",
      });
    }

    if (forceStopResult.exitCode !== 0) {
      return await this.buildActionOutcome(
        "cancel-analyze-dictation",
        false,
        normalizeText(forceStopResult.stderr) ??
          normalizeText(forceStopResult.stdout) ??
          "Android dictation could not be cancelled."
      );
    }

    return await this.buildActionOutcome(
      "cancel-analyze-dictation",
      true,
      "Android dictation was cancelled."
    );
  }

  async startAmbientListener(
    options: CaptureAmbientListenerOptions = {}
  ): Promise<CaptureActionOutcome> {
    const target = options.target ?? CAPTURE_ANALYZE_TARGET;
    const requestId = normalizeText(options.requestId);
    if (requestId === null) {
      return await this.buildActionOutcome(
        "start-ambient-listener",
        false,
        "Ambient listener requestId is required."
      );
    }

    const launchOutcome = await this.launchCompanion({ target });
    if (launchOutcome.ok !== true) {
      return launchOutcome;
    }

    return await this.enqueueAnalyzeCommand(
      "start-ambient-listener",
      "Android ambient listener was started.",
      {
        target,
        requestId,
        replaceExistingKinds: ["start-ambient-listener", "stop-ambient-listener"],
        ambient: options,
      }
    );
  }

  async stopAmbientListener(
    options: Pick<CaptureAmbientListenerOptions, "requestId" | "target"> = {}
  ): Promise<CaptureActionOutcome> {
    const target = options.target ?? CAPTURE_ANALYZE_TARGET;
    const requestId = normalizeText(options.requestId);
    if (requestId === null) {
      return await this.buildActionOutcome(
        "stop-ambient-listener",
        false,
        "Ambient listener requestId is required."
      );
    }

    const status = await this.refreshStatus();
    const deviceId = this.resolveAnalyzeCommandDeviceId(status, false);
    if (deviceId === null) {
      return await this.buildActionOutcome(
        "stop-ambient-listener",
        false,
        status.android.message ?? "No ready Android device is available."
      );
    }

    return await this.enqueueAnalyzeCommand(
      "stop-ambient-listener",
      "Android ambient listener was stopped.",
      {
        target,
        requestId,
        deviceId,
        replaceExistingKinds: ["stop-ambient-listener"],
      }
    );
  }

  async setTorch(options: CaptureTorchOptions = {}): Promise<CaptureActionOutcome> {
    const target = options.target ?? CAPTURE_ANALYZE_TARGET;
    const enabled = options.enabled === true;
    const settings = await loadSettings();
    const captureSettings = resolveCaptureSettings(settings);
    if (captureSettings.androidCompanionEnabled !== true) {
      return await this.buildActionOutcome(
        "set-torch",
        false,
        "Android companion is disabled in Settings > Capture."
      );
    }

    const status = await this.refreshStatus();
    const deviceId = options.deviceId ?? this.resolveAnalyzeCommandDeviceId(status, false);
    if (deviceId === null) {
      return await this.buildActionOutcome(
        "set-torch",
        false,
        status.android.message ?? "No ready Android device is available."
      );
    }

    const existingBridgeSession = this.getBridgeSessionForTarget(deviceId, target, {
      requirePreviewActive: false,
    });
    if (existingBridgeSession === null) {
      const launchOutcome = await this.launchCompanion({ target, activeTab: "image" });
      if (launchOutcome.ok !== true) {
        return await this.buildActionOutcome("set-torch", false, launchOutcome.message);
      }
    }

    const transcriptModel = resolveCompanionTranscriptModelProfile(settings, captureSettings);
    this.queuePendingBridgeCommand(
      deviceId,
      {
        id: randomUUID(),
        kind: "set-torch",
        target,
        requestId: normalizeText(options.requestId),
        createdAt: Date.now(),
        profile: buildCompanionCommandProfile(captureSettings, transcriptModel),
        ambient: null,
        torch: { enabled },
        tts: null,
      },
      { replaceExistingKinds: ["set-torch"] }
    );

    const torchOwner = { id: "android-companion-torch", label: "Android torch" };
    if (enabled) {
      operationsService.acquire("android-torch", torchOwner);
    } else {
      operationsService.release("android-torch", torchOwner);
    }

    return await this.buildActionOutcome(
      "set-torch",
      true,
      enabled
        ? "Android companion torch was requested."
        : "Android companion torch off was requested."
    );
  }

  async stopAnalyzeSession(
    options: { target?: TranscriptTargetId | null; requestId?: string | null } = {}
  ): Promise<CaptureActionOutcome> {
    const target = options.target ?? CAPTURE_ANALYZE_TARGET;
    const requestId = normalizeText(options.requestId);
    if (target === CAPTURE_ANALYZE_TARGET) {
      await this.stopScrcpyCameraFeed();
    }
    const status = await this.refreshStatus();
    const deviceId = this.resolveAnalyzeCommandDeviceId(status, false);
    if (deviceId === null) {
      if (target === CAPTURE_ANALYZE_TARGET) {
        this.resetAnalyzeSessionState("Analyze capture session is already idle.");
      }
      return await this.buildActionOutcome(
        "stop-analyze-session",
        true,
        "Analyze capture session is already idle."
      );
    }

    this.clearPendingTargetCommands(deviceId, target);
    const bridgeSession = this.getBridgeSessionForTarget(deviceId, target, {
      requirePreviewActive: false,
    });
    if (bridgeSession === null) {
      if (target === CAPTURE_ANALYZE_TARGET) {
        this.resetAnalyzeSessionState("Analyze capture session is idle.");
      }
      return await this.buildActionOutcome(
        "stop-analyze-session",
        true,
        "Analyze capture session was closed."
      );
    }

    return await this.enqueueAnalyzeCommand("close-camera", "Analyze capture session was closed.", {
      deviceId,
      target,
      requestId,
      replaceExisting: true,
      requireSession: false,
    });
  }

  async requestAnalyzeCapture(
    kind: "capture-photo" | "retake-photo",
    options: { target?: TranscriptTargetId | null; requestId?: string | null } = {}
  ): Promise<CaptureActionOutcome> {
    const target = options.target ?? CAPTURE_ANALYZE_TARGET;
    const requestId = normalizeText(options.requestId);
    const status = await this.refreshStatus();
    const commandDeviceId = this.resolveAnalyzeCommandDeviceId(status, false);
    const hasAnalyzeCaptureSession =
      target !== CAPTURE_ANALYZE_TARGET || this.getAnalyzeBridgeSession(commandDeviceId) !== null;
    const readyState =
      target !== CAPTURE_ANALYZE_TARGET ||
      (hasAnalyzeCaptureSession === true &&
        (this.analyzeState.state === "ready" || this.analyzeState.state === "result-ready"));
    if (readyState !== true) {
      return await this.buildActionOutcome(
        kind === "capture-photo" ? "capture-analyze-photo" : "retake-analyze-photo",
        false,
        "Open the Android companion capture session before taking a still photo."
      );
    }

    return await this.enqueueAnalyzeCommand(
      kind,
      kind === "capture-photo" ? "Phone photo capture requested." : "Phone retake requested.",
      {
        target,
        requestId,
        deviceId:
          target === CAPTURE_ANALYZE_TARGET
            ? commandDeviceId
            : this.resolveAnalyzeCommandDeviceId(status, false),
        requireSession: target === CAPTURE_ANALYZE_TARGET,
      }
    );
  }

  async consumeAnalyzeInboxAssets(): Promise<CaptureImportedAsset[]> {
    const { analyzeInboxDir, analyzeStagedDir } = await ensureCaptureIngressPaths();
    const entries = await readdir(analyzeInboxDir, { withFileTypes: true });
    const fileEntries = entries.filter((entry) => entry.isFile());
    const imported = await fileEntries.reduce<Promise<CaptureImportedAsset[]>>(
      async (pendingImported, entry) => {
        const accumulated = await pendingImported;
        accumulated.push(
          await moveAnalyzeAssetToStaging(join(analyzeInboxDir, entry.name), analyzeStagedDir)
        );
        return accumulated;
      },
      Promise.resolve([])
    );

    if (imported.length > 0) {
      const latestAsset = imported[imported.length - 1] ?? null;
      this.analyzeState = {
        ...this.analyzeState,
        latestAsset,
        pendingInboxCount: 0,
        pendingCommand: null,
        state: "result-ready",
        lastCaptureAt: latestAsset?.importedAt ?? Date.now(),
        message: "The latest phone capture was added to Analyze staged attachments.",
      };
      this.lastStatus = null;
    }

    return imported;
  }

  private resolveAnalyzeCommandDeviceId(
    status: CaptureServiceStatus,
    requireSession: boolean
  ): string | null {
    const preferredCandidates = [
      this.analyzeState.deviceId,
      status.android.selectedDeviceId,
      this.bridgeState.registeredDeviceId,
    ].filter(
      (value, index, list): value is string => value !== null && list.indexOf(value) === index
    );

    if (requireSession !== true) {
      return preferredCandidates[0] ?? null;
    }

    return (
      preferredCandidates.find((deviceId) => this.getAnalyzeBridgeSession(deviceId) !== null) ??
      null
    );
  }

  private getAnalyzeBridgeSession(deviceId: string | null): CompanionBridgeSessionRecord | null {
    return this.getBridgeSessionForTarget(deviceId, CAPTURE_ANALYZE_TARGET);
  }

  private getBridgeSessionForTarget(
    deviceId: string | null,
    target: TranscriptTargetId,
    options: { requirePreviewActive?: boolean } = {}
  ): CompanionBridgeSessionRecord | null {
    if (deviceId === null) {
      return null;
    }

    const session = this.bridgeSessions.get(deviceId) ?? null;
    if (session?.target !== target) {
      return null;
    }

    return options.requirePreviewActive === false || session.previewActive === true
      ? session
      : null;
  }

  private markBridgePreviewInactive(deviceId: string, target: TranscriptTargetId): void {
    const session = this.getBridgeSessionForTarget(deviceId, target, {
      requirePreviewActive: false,
    });
    if (session === null) {
      return;
    }

    session.previewActive = false;
    session.lastSeenAt = Date.now();
    this.bridgeSessions.set(deviceId, session);
  }

  private clearPendingAnalyzeCommands(deviceId: string): void {
    this.clearPendingTargetCommands(deviceId, CAPTURE_ANALYZE_TARGET);
  }

  private clearPendingTargetCommands(deviceId: string, target: TranscriptTargetId): void {
    const queue = this.pendingCommands.get(deviceId) ?? [];
    queue
      .filter((command) => command.target === target)
      .forEach((command) => {
        if (target === CAPTURE_ANALYZE_TARGET && isMediaCaptureCommand(command.kind)) {
          this.activeAnalyzeMediaRequestIds.delete(getCommandRequestId(command));
        }
      });
    const filtered = queue.filter((command) => command.target !== target);
    if (filtered.length === 0) {
      this.pendingCommands.delete(deviceId);
      return;
    }

    this.pendingCommands.set(deviceId, filtered);
  }

  private resetAnalyzeSessionState(message: string): void {
    this.activeAnalyzeMediaRequestIds.clear();
    const nextState = createDefaultAnalyzeState();
    this.analyzeState = {
      ...nextState,
      latestAsset: this.analyzeState.latestAsset,
      lastCaptureAt: this.analyzeState.lastCaptureAt,
      message,
    };
  }

  private resolveAnalyzeMessage(
    activeSession: CompanionBridgeSessionRecord | null,
    pendingInboxCount: number
  ): string {
    const activeScrcpy = this.scrcpyHub.getActiveSessionStatus();
    if (activeScrcpy?.mode === "camera-feed" && activeScrcpy.target === CAPTURE_ANALYZE_TARGET) {
      return "Live camera feed is active for Analyze.";
    }
    if (pendingInboxCount > 0) {
      return `${String(pendingInboxCount)} phone capture(s) are waiting in the Analyze inbox.`;
    }
    if (this.analyzeState.state === "capture-requested") {
      return "A capture command was sent to the phone. Use the companion to add the image to Analyze.";
    }
    if (this.analyzeState.state === "idle") {
      return this.analyzeState.message ?? "Analyze phone capture session is idle.";
    }
    if (
      activeSession !== null &&
      activeSession.target === CAPTURE_ANALYZE_TARGET &&
      activeSession.previewActive === true
    ) {
      return "Phone preview is active for Analyze. Capture commands will run on the phone.";
    }
    return this.analyzeState.message ?? "Analyze phone capture session is idle.";
  }

  private resolveAnalyzeState(
    activeSession: CompanionBridgeSessionRecord | null,
    pendingInboxCount: number
  ): CaptureAnalyzeSessionState {
    const activeScrcpy = this.scrcpyHub.getActiveSessionStatus();
    if (activeScrcpy?.mode === "camera-feed" && activeScrcpy.target === CAPTURE_ANALYZE_TARGET) {
      return "ready";
    }
    if (pendingInboxCount > 0) {
      return "result-ready";
    }
    if (this.analyzeState.state === "result-ready" && this.analyzeState.latestAsset !== null) {
      return "result-ready";
    }
    if (this.analyzeState.state === "capture-requested") {
      return "capture-requested";
    }
    if (this.analyzeState.state === "idle") {
      return "idle";
    }
    if (
      activeSession !== null &&
      activeSession.target === CAPTURE_ANALYZE_TARGET &&
      activeSession.previewActive === true
    ) {
      return "ready";
    }
    return this.analyzeState.state === "pending-launch" ? "pending-launch" : "idle";
  }

  private cleanupStaleBridgeSessions(): void {
    const now = Date.now();
    for (const [deviceId, session] of this.bridgeSessions.entries()) {
      if (now - session.lastSeenAt > CAPTURE_SESSION_STALE_MS) {
        this.bridgeSessions.delete(deviceId);
        operationsService.release("android-torch", {
          id: "android-companion-torch",
          label: "Android torch",
        });
      }
    }

    const activeSession =
      [...this.bridgeSessions.values()].sort(
        (left, right) => right.lastSeenAt - left.lastSeenAt
      )[0] ?? null;
    this.bridgeState = {
      ...this.bridgeState,
      registeredDeviceId: activeSession?.deviceId ?? null,
      lastSeenAt: activeSession?.lastSeenAt ?? null,
    };
  }

  private async ensureBridgeServer(): Promise<void> {
    if (this.bridgeServer !== null) {
      return;
    }

    const artifact = await readCompanionManifest();
    this.bridgeState = {
      ...this.bridgeState,
      state: "starting",
      port: artifact.bridgePort,
      lastError: null,
    };

    this.bridgeServer = createServer((request, response) => {
      void this.handleBridgeRequest(request, response);
    });

    await new Promise<void>((resolvePromise) => {
      this.bridgeServer?.once("error", (error: NodeJS.ErrnoException) => {
        this.bridgeState = {
          ...this.bridgeState,
          state: "error",
          lastError: error.message,
        };
        resolvePromise();
      });

      this.bridgeServer?.listen(artifact.bridgePort, "127.0.0.1", () => {
        this.bridgeState = {
          ...this.bridgeState,
          state: "ready",
          port: artifact.bridgePort,
          lastError: null,
        };
        companionSessionManager.startTimeoutChecker();
        resolvePromise();
      });
    });
  }

  private async handleBridgeRequest(
    request: IncomingMessage,
    response: ServerResponse
  ): Promise<void> {
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    const method = request.method ?? "GET";

    try {
      if (method === "GET" && requestUrl.pathname === "/health") {
        this.sendJson(response, 200, {
          ok: true,
          bridge: this.bridgeState,
        });
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/api/v1/operations/status") {
        this.sendJson(response, 200, {
          ok: true,
          ...operationsService.getStatus(),
        });
        return;
      }

      if (method === "POST" && requestUrl.pathname === "/api/v1/session/register") {
        const body = await this.readJsonBody(request);
        const deviceId = normalizeText(body["deviceId"]);
        if (deviceId === null) {
          this.sendJson(response, 400, { ok: false, error: "deviceId is required." });
          return;
        }

        const permissions = this.normalizePermissions(body["permissions"]);
        const session: CompanionBridgeSessionRecord = {
          deviceId,
          appVersion: normalizeText(body["appVersion"]),
          permissions,
          previewActive: body["previewActive"] === true,
          target: normalizeText(body["target"]),
          transport: normalizeText(body["transport"]),
          lastSeenAt: Date.now(),
        };
        this.bridgeSessions.set(deviceId, session);
        this.bridgeState = {
          ...this.bridgeState,
          state: "ready",
          registeredDeviceId: deviceId,
          lastSeenAt: session.lastSeenAt,
          lastError: null,
        };
        if (
          this.analyzeState.deviceId === deviceId &&
          session.target === CAPTURE_ANALYZE_TARGET &&
          session.previewActive === true
        ) {
          this.analyzeState = {
            ...this.analyzeState,
            state: "ready",
            message: "Analyze phone preview is active on the Android companion.",
          };
        }

        this.sendJson(response, 200, {
          ok: true,
          commandPollAfterMs: 1500,
          pendingCommands: this.pendingCommands.get(deviceId) ?? [],
        });
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/api/v1/session/commands") {
        const deviceId = normalizeText(requestUrl.searchParams.get("deviceId"));
        if (deviceId === null) {
          this.sendJson(response, 400, { ok: false, error: "deviceId is required." });
          return;
        }

        const session = this.bridgeSessions.get(deviceId);
        if (session !== undefined) {
          session.lastSeenAt = Date.now();
          this.bridgeSessions.set(deviceId, session);
          this.bridgeState = {
            ...this.bridgeState,
            registeredDeviceId: deviceId,
            lastSeenAt: session.lastSeenAt,
            lastError: null,
          };
        }

        this.sendJson(response, 200, {
          ok: true,
          commands: this.pendingCommands.get(deviceId) ?? [],
        });
        return;
      }

      if (method === "POST" && requestUrl.pathname === "/api/v1/session/ack") {
        const body = await this.readJsonBody(request);
        const deviceId = normalizeText(body["deviceId"]);
        const commandId = normalizeText(body["commandId"]);
        if (deviceId === null || commandId === null) {
          this.sendJson(response, 400, {
            ok: false,
            error: "deviceId and commandId are required.",
          });
          return;
        }

        const commands = this.pendingCommands.get(deviceId) ?? [];
        const acknowledgedCommand = commands.find((command) => command.id === commandId) ?? null;
        this.pendingCommands.set(
          deviceId,
          commands.filter((command) => command.id !== commandId)
        );
        const commandKind = normalizeText(body["kind"]) ?? acknowledgedCommand?.kind ?? null;
        const requestId =
          normalizeText(body["requestId"]) ?? acknowledgedCommand?.requestId ?? null;
        const target =
          normalizeTranscriptTarget(body["target"]) ?? acknowledgedCommand?.target ?? null;
        const statusText = normalizeText(body["status"]);
        const fallbackMessage =
          commandKind === "capture-photo"
            ? "The phone is capturing a photo."
            : commandKind === "close-camera"
              ? "The phone capture session is idle."
              : commandKind === "start-dictation"
                ? "Android dictation is recording on the phone."
                : commandKind === "stop-dictation"
                  ? "Android dictation is transcribing on the phone."
                  : commandKind === "start-tts"
                    ? "Android TTS is preparing on the phone."
                    : commandKind === "stop-tts"
                      ? "Android TTS stop was acknowledged by the phone."
                      : "The phone acknowledged the latest command.";
        const message = normalizeText(body["message"]) ?? fallbackMessage;
        if (
          requestId !== null &&
          target !== null &&
          (commandKind === "start-dictation" || commandKind === "stop-dictation")
        ) {
          this.emitCaptureDictationStatus({
            requestId,
            createdAt: new Date().toISOString(),
            source: "android-bridge",
            target,
            deviceId,
            status:
              statusText === "failed"
                ? "failed"
                : statusText === "done"
                  ? "done"
                  : commandKind === "start-dictation"
                    ? "started"
                    : "transcribing",
            message,
          });
        }
        if (
          requestId !== null &&
          target !== null &&
          (commandKind === "start-ambient-listener" || commandKind === "stop-ambient-listener")
        ) {
          this.emitCaptureAmbientStatus({
            requestId,
            createdAt: new Date().toISOString(),
            source: "android-bridge",
            target,
            deviceId,
            status:
              statusText === "failed"
                ? "failed"
                : commandKind === "stop-ambient-listener" || statusText === "done"
                  ? "stopped"
                  : "started",
            message,
            metadata: {
              acknowledgedCommandId: commandId,
              commandKind,
            },
          });
        }
        const acknowledgedTtsTarget: TtsTargetId | null =
          target === "analyze-compose" || target?.startsWith("room:") === true
            ? (target as TtsTargetId)
            : null;
        if (
          requestId !== null &&
          acknowledgedTtsTarget !== null &&
          (commandKind === "start-tts" || commandKind === "stop-tts")
        ) {
          const { ttsService } = await import("./tts-service.ts");
          ttsService.acceptAndroidStatus({
            requestId,
            target: acknowledgedTtsTarget,
            deviceId,
            status:
              statusText === "failed"
                ? "failed"
                : commandKind === "stop-tts" || statusText === "done"
                  ? "stopped"
                  : "preparing",
            message,
            progress: statusText === "done" ? 1 : 0.2,
          });
        }
        if (commandKind === "set-torch" && statusText === "failed") {
          operationsService.release("android-torch", {
            id: "android-companion-torch",
            label: "Android torch",
          });
        }
        if (
          requestId !== null &&
          target === CAPTURE_ANALYZE_TARGET &&
          (commandKind === "capture-photo" || commandKind === "retake-photo") &&
          (statusText === "done" || statusText === "failed")
        ) {
          this.activeAnalyzeMediaRequestIds.delete(requestId);
        }
        if (
          this.analyzeState.deviceId === deviceId &&
          (body["status"] === "accepted" ||
            body["status"] === "done" ||
            body["status"] === "failed")
        ) {
          const session = this.bridgeSessions.get(deviceId) ?? null;
          const previewActive =
            typeof body["previewActive"] === "boolean"
              ? body["previewActive"] === true
              : session?.previewActive === true;
          if (session !== null && typeof body["previewActive"] === "boolean") {
            session.previewActive = previewActive;
            session.lastSeenAt = Date.now();
            this.bridgeSessions.set(deviceId, session);
          }
          this.analyzeState = {
            ...this.analyzeState,
            state:
              statusText === "failed"
                ? "ready"
                : commandKind === "capture-photo"
                  ? this.analyzeState.state === "result-ready"
                    ? "result-ready"
                    : "capture-requested"
                  : commandKind === "close-camera"
                    ? "idle"
                    : commandKind === "start-dictation" || commandKind === "stop-dictation"
                      ? this.analyzeState.state === "idle"
                        ? "pending-launch"
                        : this.analyzeState.state
                      : commandKind === "start-tts" || commandKind === "stop-tts"
                        ? this.analyzeState.state
                        : previewActive === true
                          ? "ready"
                          : "pending-launch",
            pendingCommand:
              statusText === "failed" || statusText === "done"
                ? null
                : commandKind === "capture-photo"
                  ? "capture-photo"
                  : commandKind === "start-dictation"
                    ? "start-dictation"
                    : commandKind === "start-tts"
                      ? "start-tts"
                      : null,
            message,
          };
        }

        this.sendJson(response, 200, { ok: true });
        return;
      }

      const isLiveCameraStreamRequest =
        requestUrl.pathname === "/api/v1/live/camera/stream" ||
        requestUrl.pathname === "/api/v1/live/analyze/stream";
      if (method === "GET" && isLiveCameraStreamRequest) {
        const attached = this.companionLiveFeed.attachClient({
          response,
          deviceId: normalizeText(requestUrl.searchParams.get("deviceId")),
          target:
            normalizeTranscriptTarget(requestUrl.searchParams.get("target")) ??
            CAPTURE_ANALYZE_TARGET,
          requestId: normalizeText(requestUrl.searchParams.get("requestId")),
        });
        if (attached !== true) {
          this.sendJson(response, 404, { ok: false, error: "Live camera feed is not active." });
        }
        return;
      }

      const isLiveCameraFrameRequest =
        requestUrl.pathname === "/api/v1/live/camera/frame" ||
        requestUrl.pathname === "/api/v1/live/analyze/frame";
      if (method === "POST" && isLiveCameraFrameRequest) {
        const body = await this.readJsonBody(request);
        const payload = this.normalizeCompanionLiveFramePayload(body);
        if (payload === null) {
          this.sendJson(response, 400, {
            ok: false,
            error: "deviceId, target, requestId, and contentBase64 are required.",
          });
          return;
        }

        const accepted = this.companionLiveFeed.acceptFrame(payload);
        if (accepted.ok !== true) {
          this.sendJson(response, 200, { ok: true, dropped: true, message: accepted.message });
          return;
        }

        this.lastStatus = null;
        this.sendJson(response, 200, { ok: true });
        return;
      }

      if (method === "POST" && requestUrl.pathname === "/api/v1/diagnostics/snapshot") {
        const body = await this.readJsonBody(request);
        const snapshot = normalizeCompanionDiagnosticsShadowSnapshot(body);
        if (snapshot === null) {
          this.sendJson(response, 400, { ok: false, error: "deviceId is required." });
          return;
        }

        const written = await writeCompanionDiagnosticsShadowSnapshot(snapshot);
        void companionSessionManager.handleSnapshot(snapshot);
        this.sendJson(response, 200, {
          ok: true,
          shadowPath: written.textPath,
          shadowJsonPath: written.jsonPath,
        });
        return;
      }

      if (method === "GET" && requestUrl.pathname === "/api/v1/transcript/model") {
        await this.handleTranscriptModelDownload(requestUrl, response);
        return;
      }

      if (method === "POST" && requestUrl.pathname === "/api/v1/transcript/ingress") {
        const body = await this.readJsonBody(request);
        const text = normalizeText(body["text"]);
        if (text === null) {
          this.sendJson(response, 400, { ok: false, error: "text is required." });
          return;
        }

        const requestId = normalizeText(body["requestId"]);
        const target = normalizeTranscriptTarget(body["target"]);
        if (requestId === null || target === null) {
          this.sendJson(response, 400, {
            ok: false,
            error: "requestId and target are required.",
          });
          return;
        }

        const requestMetadata = this.normalizeMetadata(body["metadata"]) ?? {};
        const ingress = transcriptService.submitIngress({
          requestId,
          text,
          source: "android-bridge",
          target,
          isFinal: body["isFinal"] !== false,
          metadata: {
            ...requestMetadata,
            deviceId: normalizeText(body["deviceId"]),
            transport: "adb-reverse",
          },
        });
        this.sendJson(response, ingress.success === true ? 200 : 400, ingress);
        return;
      }

      if (method === "POST" && requestUrl.pathname === "/api/v1/ambient/status") {
        const body = await this.readJsonBody(request);
        const requestId = normalizeText(body["requestId"]);
        const target = normalizeTranscriptTarget(body["target"]);
        const status = normalizeAmbientStatusState(body["status"]);
        if (requestId === null || target === null || status === null) {
          this.sendJson(response, 400, {
            ok: false,
            error: "requestId, target, and status are required.",
          });
          return;
        }

        this.emitCaptureAmbientStatus({
          requestId,
          createdAt: new Date().toISOString(),
          source: "android-bridge",
          target,
          deviceId: normalizeText(body["deviceId"]),
          status,
          message: normalizeText(body["message"]) ?? `Ambient listener status: ${status}`,
          transcript: normalizeText(body["transcript"]),
          metadata: this.normalizeMetadata(body["metadata"]),
        });
        this.sendJson(response, 200, { ok: true });
        return;
      }

      if (method === "POST" && requestUrl.pathname === "/api/v1/tts/status") {
        const body = await this.readJsonBody(request);
        const requestId = normalizeText(body["requestId"]);
        const target = normalizeTranscriptTarget(body["target"]);
        const rawStatus = normalizeText(body["status"]);
        const status: TtsStatusState | null =
          rawStatus === "queued" ||
          rawStatus === "preparing" ||
          rawStatus === "playing" ||
          rawStatus === "done" ||
          rawStatus === "stopped" ||
          rawStatus === "failed"
            ? rawStatus
            : null;
        const ttsTarget: TtsTargetId | null =
          target === "analyze-compose" || target?.startsWith("room:") === true
            ? (target as TtsTargetId)
            : null;
        if (requestId === null || ttsTarget === null || status === null) {
          this.sendJson(response, 400, {
            ok: false,
            error: "requestId, target, and status are required.",
          });
          return;
        }

        const progress =
          typeof body["progress"] === "number" && Number.isFinite(body["progress"])
            ? body["progress"]
            : null;
        const language = body["language"];
        const modelId = body["modelId"];
        const { ttsService } = await import("./tts-service.ts");
        ttsService.acceptAndroidStatus({
          requestId,
          target: ttsTarget,
          deviceId: normalizeText(body["deviceId"]),
          status,
          message: normalizeText(body["message"]) ?? `Android TTS status: ${status}`,
          progress,
          language: language === "tr" || language === "en" ? language : null,
          modelId:
            modelId === "tr_TR-dfki-medium" || modelId === "en_US-lessac-medium" ? modelId : null,
          error: normalizeText(body["error"]),
        });
        this.sendJson(response, 200, { ok: true });
        return;
      }

      if (method === "POST" && requestUrl.pathname === "/api/v1/media/analyze") {
        const body = await this.readJsonBody(request);
        const contentBase64 = normalizeText(body["contentBase64"]);
        if (contentBase64 === null) {
          this.sendJson(response, 400, { ok: false, error: "contentBase64 is required." });
          return;
        }

        const requestId = normalizeText(body["requestId"]);
        const target = normalizeTranscriptTarget(body["target"]);
        if (requestId === null || target === null) {
          this.sendJson(response, 400, {
            ok: false,
            error: "requestId and target are required.",
          });
          return;
        }

        const fileName = normalizeText(body["fileName"]) ?? `capture-${Date.now()}.jpg`;
        const deviceId = normalizeText(body["deviceId"]);
        if (target !== CAPTURE_ANALYZE_TARGET) {
          const storedAsset = await writeTargetCaptureAsset(target, fileName, contentBase64);
          this.emitCaptureMediaIngress({
            requestId,
            createdAt: new Date().toISOString(),
            source: "android-bridge",
            target,
            asset: storedAsset,
            metadata: {
              deviceId,
              transport: "adb-reverse",
            },
          });
          this.sendJson(response, 200, {
            ok: true,
            storedPath: storedAsset.path,
          });
          return;
        }

        const stageForAnalyze = body["stageForAnalyze"] === true;
        const hasActiveRequest = this.activeAnalyzeMediaRequestIds.has(requestId);
        const activeSession =
          deviceId !== null
            ? this.getBridgeSessionForTarget(deviceId, target, { requirePreviewActive: false })
            : null;
        if (hasActiveRequest !== true && (stageForAnalyze !== true || activeSession === null)) {
          this.sendJson(response, 409, {
            ok: false,
            error: "Analyze capture request is not active.",
          });
          return;
        }

        const captureSettings = resolveCaptureSettings(await loadSettings());
        const shouldStageForAnalyze =
          stageForAnalyze === true || captureSettings.attachMode === "auto-stage";
        const storedAsset = await writeAnalyzeAsset(
          fileName,
          contentBase64,
          shouldStageForAnalyze ? "staged" : "inbox"
        );
        if (hasActiveRequest === true) {
          this.activeAnalyzeMediaRequestIds.delete(requestId);
        }
        this.analyzeState = {
          ...this.analyzeState,
          state: "result-ready",
          pendingCommand: null,
          lastCaptureAt: Date.now(),
          latestAsset: shouldStageForAnalyze ? storedAsset : this.analyzeState.latestAsset,
          pendingInboxCount: shouldStageForAnalyze
            ? this.analyzeState.pendingInboxCount
            : this.analyzeState.pendingInboxCount + 1,
          message: shouldStageForAnalyze
            ? "A new phone capture was staged for Analyze."
            : "A new phone capture is waiting in the Analyze inbox.",
        };
        this.lastStatus = null;
        if (shouldStageForAnalyze) {
          this.emitCaptureMediaIngress({
            requestId,
            createdAt: new Date().toISOString(),
            source: "android-bridge",
            target,
            asset: storedAsset,
            metadata: {
              deviceId,
              transport: "adb-reverse",
              stageForAnalyze,
            },
          });
        }
        this.sendJson(response, 200, {
          ok: true,
          storedPath: storedAsset.path,
        });
        return;
      }

      this.sendJson(response, 404, { ok: false, error: "Not found." });
    } catch (error) {
      this.sendJson(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleTranscriptModelDownload(
    requestUrl: URL,
    response: ServerResponse
  ): Promise<void> {
    const fileName = normalizeText(requestUrl.searchParams.get("fileName"));
    if (fileName === null) {
      this.sendJson(response, 400, { ok: false, error: "fileName is required." });
      return;
    }

    const descriptor = findTranscriptDescriptorByFileName(fileName);
    if (descriptor === null) {
      this.sendJson(response, 404, { ok: false, error: "Transcript model is unknown." });
      return;
    }

    let modelPath: string;
    if (descriptor.installSource === "transcript-service") {
      const model = await transcriptService.installModel(descriptor.modelId);
      if (model.ready !== true || model.path === null) {
        this.sendJson(response, 500, {
          ok: false,
          error: model.lastError ?? "Transcript model could not be prepared.",
        });
        return;
      }
      modelPath = model.path;
    } else {
      modelPath = await ensureDirectCompanionModelArchive(descriptor);
    }

    const fileStat = await stat(modelPath);
    response.statusCode = 200;
    response.setHeader("content-type", "application/octet-stream");
    response.setHeader("content-length", String(fileStat.size));
    response.setHeader("x-transcript-model-id", descriptor.modelId);
    response.setHeader("x-transcript-model-sha1", descriptor.expectedSha1);
    response.setHeader("x-transcript-model-file", descriptor.fileName);
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const stream = createReadStream(modelPath);
      stream.once("error", rejectPromise);
      response.once("error", rejectPromise);
      response.once("finish", resolvePromise);
      stream.pipe(response);
    });
  }

  private sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
    response.statusCode = statusCode;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(`${JSON.stringify(payload)}\n`);
  }

  private emitCaptureMediaIngress(payload: CaptureMediaIngressPayload): void {
    for (const window of BrowserWindow.getAllWindows()) {
      try {
        window.webContents.send(CAPTURE_MEDIA_INGRESS_CHANNEL, payload);
      } catch {
        // NOTE: Capture fan-out is best-effort so one detached window cannot abort the bridge upload.
      }
    }
  }

  private emitCaptureDictationStatus(payload: CaptureDictationStatusPayload): void {
    for (const window of BrowserWindow.getAllWindows()) {
      try {
        window.webContents.send(CAPTURE_DICTATION_STATUS_CHANNEL, payload);
      } catch {
        // NOTE: Dictation status fan-out is best-effort for detached renderer windows.
      }
    }
  }

  private emitCaptureAmbientStatus(payload: CaptureAmbientStatusPayload): void {
    for (const window of BrowserWindow.getAllWindows()) {
      try {
        window.webContents.send(CAPTURE_AMBIENT_STATUS_CHANNEL, payload);
      } catch {
        // NOTE: Ambient status fan-out is best-effort for detached renderer windows.
      }
    }
  }

  private async readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    for await (const chunk of request as AsyncIterable<Buffer | string>) {
      const normalizedChunk = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      chunks.push(normalizedChunk);
    }

    if (chunks.length === 0) {
      return {};
    }

    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  }

  private normalizePermissions(value: unknown): CaptureAndroidPermissionStatus {
    if (typeof value !== "object" || value === null) {
      return createUnknownPermissions();
    }

    const record = value as Record<string, unknown>;
    return {
      camera:
        record["camera"] === "granted"
          ? "granted"
          : record["camera"] === "denied"
            ? "denied"
            : "unknown",
      microphone:
        record["microphone"] === "granted"
          ? "granted"
          : record["microphone"] === "denied"
            ? "denied"
            : "unknown",
    };
  }

  private normalizeMetadata(value: unknown): Record<string, unknown> | null {
    return isRecord(value) ? { ...value } : null;
  }

  private normalizeCompanionLiveFramePayload(
    value: Record<string, unknown>
  ): CompanionLiveFramePayload | null {
    const deviceId = normalizeText(value["deviceId"]);
    const target = normalizeTranscriptTarget(value["target"]);
    const requestId = normalizeText(value["requestId"]);
    const contentBase64 = normalizeText(value["contentBase64"]);
    if (deviceId === null || target === null || requestId === null || contentBase64 === null) {
      return null;
    }

    return {
      deviceId,
      target,
      requestId,
      contentBase64,
      width: typeof value["width"] === "number" ? value["width"] : 640,
      height: typeof value["height"] === "number" ? value["height"] : 480,
      capturedAt: typeof value["capturedAt"] === "number" ? value["capturedAt"] : Date.now(),
    };
  }

  private async inspectAndroid(preferredDeviceId: string | null): Promise<CaptureAndroidStatus> {
    const artifact = await readCompanionManifest();
    const adbPath = await resolveAdbPath();
    if (adbPath === null) {
      return {
        hostState: "missing-adb",
        adbPath: null,
        selectedDeviceId: null,
        companionPackage: artifact.applicationId,
        previewMode: "scrcpy-camera",
        reverseState: "not-configured",
        pairingHint: "Install Android platform-tools so Hayalet Ev can manage the companion app.",
        message: buildHostMessage("missing-adb"),
        devices: [],
        artifact,
      };
    }

    const deviceListResult = await runCommand(adbPath, ["devices", "-l"]).catch(() => null);
    if (
      deviceListResult === null ||
      deviceListResult.timedOut === true ||
      deviceListResult.exitCode !== 0
    ) {
      return {
        hostState: "error",
        adbPath,
        selectedDeviceId: null,
        companionPackage: artifact.applicationId,
        previewMode: "scrcpy-camera",
        reverseState: "error",
        pairingHint: null,
        message:
          normalizeText(deviceListResult?.stderr) ??
          normalizeText(deviceListResult?.stdout) ??
          buildHostMessage("error"),
        devices: [],
        artifact,
      };
    }

    const devices = parseAdbDeviceList(deviceListResult.stdout);
    let hostState = determineHostState(devices);
    const selectedReadyDevice = selectReadyDevice(devices, preferredDeviceId);
    let reverseState: CaptureAndroidStatus["reverseState"] =
      selectedReadyDevice === null ? "not-configured" : "error";

    const detailedDevices = await Promise.all(
      devices.map(async (device) => {
        if (device.connectionState !== "device") {
          return { device, packageQueryFailed: false };
        }

        return await inspectReadyDeviceDetails(
          adbPath,
          device,
          artifact.versionName,
          artifact.applicationId,
          this.bridgeSessions.get(device.deviceId) ?? null
        );
      })
    );
    const nextDevices = detailedDevices.map((entry) => entry.device);
    const selectedDevice =
      nextDevices.find((device) => device.deviceId === selectedReadyDevice?.deviceId) ?? null;

    if (selectedDevice !== null) {
      selectedDevice.selected = true;
      reverseState = await inspectReverseState(
        adbPath,
        selectedDevice.deviceId,
        artifact.bridgePort
      );
      if (
        detailedDevices.find((entry) => entry.device.deviceId === selectedDevice.deviceId)
          ?.packageQueryFailed === true
      ) {
        hostState = "package-query-failed";
      } else if (reverseState === "conflict") {
        hostState = "reverse-conflict";
      }
    }

    return {
      hostState,
      adbPath,
      selectedDeviceId: selectedDevice?.deviceId ?? null,
      companionPackage: artifact.applicationId,
      previewMode: "scrcpy-camera",
      reverseState,
      pairingHint: this.buildPairingHint(hostState, artifact.bridgePort),
      message: buildHostMessage(hostState),
      devices: nextDevices,
      artifact,
    };
  }

  private async inspectHostDependencies(
    android: CaptureAndroidStatus,
    scrcpy: CaptureServiceStatus["scrcpy"]
  ): Promise<CaptureHostDependenciesStatus> {
    const [discoveredAdbPath, scrcpyPath, v4l2LoopbackStatus, ffmpegStatus, androidPlan] =
      await Promise.all([
        resolveAdbPath(),
        resolveScrcpyPath(),
        inspectV4l2LoopbackDependency().catch((error: unknown) => ({
          required: process.platform === "linux",
          available: false,
          deviceReady: false,
          moduleLoaded: false,
          modulePath: null,
          controlPath: null,
          devicePath: null,
          version: null,
          setupCommand: null,
          message: error instanceof Error ? error.message : String(error),
        })),
        inspectFfmpegDependency().catch((error: unknown) => ({
          installed: false,
          ffmpegPath: null,
          ffprobePath: null,
          version: null,
          managedDir: null,
          message: error instanceof Error ? error.message : String(error),
        })),
        this.readCompanionBootstrapPlan().catch((error: unknown) => ({
          type: "plan-error" as const,
          needsConfirmation: true,
          message: error instanceof Error ? error.message : String(error),
          details: [],
        })),
      ]);

    const adbPath = android.adbPath ?? discoveredAdbPath;
    const androidPlanMessage =
      androidPlan !== null && "message" in androidPlan ? normalizeText(androidPlan.message) : null;
    const androidPlanDetails =
      androidPlan !== null && Array.isArray(androidPlan.details) ? androidPlan.details : [];
    const androidPlanBlocked = androidPlan?.type === "plan-error";
    const androidPlanReady = androidPlan?.type === "plan" && androidPlan.needsConfirmation !== true;
    const androidBuildReady =
      android.artifact.buildState === "artifact-ready" ||
      (androidPlanReady === true && android.artifact.buildState !== "build-blocked");
    const androidBuildBlocked =
      androidPlanBlocked === true || android.artifact.buildState === "build-blocked";
    const androidBuildPartial =
      androidBuildReady !== true &&
      androidBuildBlocked !== true &&
      android.artifact.buildState === "source-ready";
    const androidBuildState = androidBuildReady
      ? "ready"
      : androidBuildBlocked
        ? "blocked"
        : androidBuildPartial
          ? "partial"
          : "missing";
    const androidBuildMessage =
      androidBuildReady === true
        ? "Android companion build prerequisites are ready."
        : androidBuildPartial === true
          ? "Android build source is available; artifact publish or runtime cache preparation is still needed."
          : (androidPlanMessage ?? "Android companion build prerequisites need preparation.");
    const v4l2LoopbackReady =
      v4l2LoopbackStatus.required !== true ||
      (v4l2LoopbackStatus.available === true && v4l2LoopbackStatus.deviceReady === true);
    const v4l2LoopbackPartial = v4l2LoopbackReady !== true && v4l2LoopbackStatus.available === true;

    return {
      adb: {
        state: adbPath !== null ? "ready" : "missing",
        path: adbPath,
        version: null,
        message: adbPath !== null ? "ADB is available." : "ADB is not available on PATH.",
        installable: true,
        managedPath: getManagedAdbPath(),
      },
      scrcpy: {
        state: scrcpy.available === true ? "ready" : "missing",
        path: scrcpyPath,
        version: scrcpy.version,
        message:
          scrcpy.available === true
            ? "scrcpy is available."
            : (scrcpy.lastError ?? "scrcpy is not available on PATH."),
        installable: false,
        managedPath: null,
      },
      v4l2Loopback: {
        state: v4l2LoopbackReady ? "ready" : v4l2LoopbackPartial ? "partial" : "missing",
        path: v4l2LoopbackStatus.modulePath,
        version: v4l2LoopbackStatus.version,
        message: v4l2LoopbackStatus.message,
        installable: v4l2LoopbackStatus.required === true,
        managedPath: null,
        required: v4l2LoopbackStatus.required,
        moduleLoaded: v4l2LoopbackStatus.moduleLoaded,
        modulePath: v4l2LoopbackStatus.modulePath,
        controlPath: v4l2LoopbackStatus.controlPath,
        devicePath: v4l2LoopbackStatus.devicePath,
        setupCommand: v4l2LoopbackStatus.setupCommand,
      },
      ffmpeg: {
        state: ffmpegStatus.installed === true ? "ready" : "missing",
        path: ffmpegStatus.ffmpegPath,
        version: ffmpegStatus.version,
        message: ffmpegStatus.message,
        installable: true,
        managedPath: getManagedFfmpegPath(),
        ffprobePath: ffmpegStatus.ffprobePath,
        managedDir: ffmpegStatus.managedDir,
      },
      androidBuild: {
        state: androidBuildState,
        javaHome: getManagedJdkHome(),
        androidSdkRoot: getManagedAndroidSdkRoot(),
        needsConfirmation: androidPlan?.needsConfirmation === true,
        message: androidBuildMessage,
        details: androidPlanDetails,
        installable: true,
      },
    };
  }

  private buildPairingHint(hostState: CaptureAndroidHostState, bridgePort: number): string | null {
    switch (hostState) {
      case "checking":
        return "Hayalet Ev is verifying the host bridge and Android device state.";
      case "missing-adb":
        return "Install Android platform-tools so Settings can manage USB and wireless debug devices.";
      case "no-devices":
        return "Connect a phone with USB debugging or attach it with `adb connect <host>:<port>`.";
      case "ready":
        return "Use Live Camera for live feed, or the phone companion for still captures.";
      case "multiple-devices":
        return "Pick the active phone in Settings > Capture. Extra phones stay visible for diagnostics.";
      case "unauthorized":
        return "Approve the USB debugging dialog on the phone, then refresh Settings > Capture.";
      case "offline":
        return "Reconnect the device or re-establish wireless debugging before relaunching the companion app.";
      case "reverse-conflict":
        return `Reconnect ADB reverse for tcp:${String(bridgePort)} before launching the companion app again.`;
      case "package-query-failed":
        return "Reinstall or reopen the companion app so package inspection and permissions can refresh.";
      case "error":
        return "Use Live Camera for live feed, or the phone companion for still captures.";
      default:
        return null;
    }
  }

  private parseBuildScriptEvent(line: string): CompanionBuildScriptEvent | null {
    const normalized = normalizeText(line);
    if (normalized?.startsWith("{") !== true) {
      return null;
    }

    try {
      const parsed = JSON.parse(normalized) as CompanionBuildScriptEvent;
      return typeof parsed.type === "string" ? parsed : null;
    } catch {
      return null;
    }
  }

  private async readCompanionBootstrapPlan(): Promise<CompanionBuildScriptEvent | null> {
    const result = await runCommand(
      process.execPath,
      [getCompanionBuildScriptPath(), "--plan-only", "--json-progress"],
      0,
      {
        cwd: getCaptureProjectRoot(),
        env: createCompanionBuildScriptEnv(),
        stdio: "pipe",
      }
    ).catch((error) => {
      throw new Error(error instanceof Error ? error.message : String(error));
    });
    const candidateLines = `${result.stdout}\n${result.stderr}`
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "");
    const planEvent =
      candidateLines
        .map((line) => this.parseBuildScriptEvent(line))
        .find((event) => event?.type === "plan") ?? null;
    if (result.exitCode !== 0) {
      throw new Error(
        summarizeCompanionBuildFailure(
          `${result.stderr}\n${result.stdout}\nexitCode=${String(result.exitCode)}`
        )
      );
    }
    return planEvent;
  }

  private async buildCompanionArtifactWithBootstrap(
    action: CaptureActionOutcome["action"] = "install-companion"
  ): Promise<CaptureAndroidArtifactStatus> {
    let structuredErrorMessage: string | null = null;
    let latestErrorMessage: string | null = null;
    const mapProgress = (progress: number | null | undefined): number | null => {
      if (typeof progress !== "number" || !Number.isFinite(progress)) {
        return this.operationState.progress;
      }
      return action === "prepare-host-dependencies" ? 0.42 + progress * 0.54 : progress;
    };
    const buildResult = await runStreamingCommand(
      process.execPath,
      [getCompanionBuildScriptPath(), "--bootstrap", "--json-progress"],
      {
        cwd: getCaptureProjectRoot(),
        env: createCompanionBuildScriptEnv(),
        timeoutMs: 0,
        onStdoutLine: (line) => {
          const event = this.parseBuildScriptEvent(line);
          if (event === null) {
            return;
          }
          if (event.type === "error") {
            structuredErrorMessage = normalizeText(event.message) ?? structuredErrorMessage;
            latestErrorMessage = structuredErrorMessage ?? latestErrorMessage;
            return;
          }
          if (event.type === "progress" || event.type === "result") {
            this.setOperationState({
              state: "running",
              action,
              message: normalizeText(event.message) ?? this.operationState.message,
              progress: mapProgress(event.progress),
              details: Array.isArray(event.details) ? event.details : this.operationState.details,
            });
          }
        },
        onStderrLine: (line) => {
          const event = this.parseBuildScriptEvent(line);
          if (event?.type === "error") {
            structuredErrorMessage = normalizeText(event.message) ?? structuredErrorMessage;
            latestErrorMessage = structuredErrorMessage ?? latestErrorMessage;
            if (Array.isArray(event.details)) {
              this.setOperationState({
                state: "running",
                action,
                message: structuredErrorMessage,
                progress: this.operationState.progress,
                details: event.details,
              });
            }
            return;
          }
          const normalized = normalizeText(line);
          if (normalized === null) {
            return;
          }
          latestErrorMessage = normalized;
        },
      }
    ).catch((error) => {
      throw new Error(error instanceof Error ? error.message : String(error));
    });

    if (buildResult.exitCode !== 0) {
      const buildFailureMessage =
        normalizeText(structuredErrorMessage) ??
        normalizeText(latestErrorMessage) ??
        summarizeCompanionBuildFailure(
          `${buildResult.stderr}\n${buildResult.stdout}\nexitCode=${String(buildResult.exitCode)}`
        );
      throw new Error(buildFailureMessage);
    }

    const artifact = await readCompanionManifest();
    if (artifact.apkPath === null || (await fileExists(artifact.apkPath)) !== true) {
      throw new Error("The debug APK was not produced by the Android build.");
    }
    return artifact;
  }

  private async ensureCompanionArtifact(options?: {
    allowBootstrap?: boolean;
    action?: CaptureActionOutcome["action"];
  }): Promise<CaptureAndroidArtifactStatus | CaptureActionOutcome> {
    const action = options?.action ?? "install-companion";
    const artifact = await readCompanionManifest();
    if (artifact.apkPath !== null && (await fileExists(artifact.apkPath)) === true) {
      this.setOperationState({
        state: "running",
        action,
        message: "Using the existing companion APK artifact.",
        progress: action === "prepare-host-dependencies" ? 0.62 : 0.22,
        details: ["The cached APK artifact is already ready and will be reused."],
      });
      return artifact;
    }

    const buildScriptPath = getCompanionBuildScriptPath();
    if ((await fileExists(buildScriptPath)) !== true) {
      throw new Error("Android companion build script is missing in the repo.");
    }

    const plan = await this.readCompanionBootstrapPlan();
    if (plan?.needsConfirmation === true && options?.allowBootstrap !== true) {
      this.setOperationState({
        state: "needs-confirmation",
        action,
        message:
          normalizeText(plan.message) ??
          "Android companion setup requires a local toolchain bootstrap.",
        progress: 0,
        details:
          Array.isArray(plan.details) && plan.details.length > 0
            ? plan.details
            : ["A repo-local JDK 21 and Android SDK will be prepared before the APK build starts."],
      });
      return await this.buildPassiveActionOutcome(
        action,
        false,
        normalizeText(plan.message) ??
          "Android companion setup requires confirmation before the bootstrap starts."
      );
    }

    return await this.buildCompanionArtifactWithBootstrap(action);
  }

  private async ensureReverseTunnel(
    adbPath: string,
    deviceId: string,
    bridgePort: number
  ): Promise<{ ok: boolean; message: string }> {
    const reverseResult = await runCommand(adbPath, [
      "-s",
      deviceId,
      "reverse",
      `tcp:${String(bridgePort)}`,
      `tcp:${String(bridgePort)}`,
    ]).catch((error) => {
      throw new Error(error instanceof Error ? error.message : String(error));
    });
    if (reverseResult.exitCode !== 0) {
      return {
        ok: false,
        message:
          normalizeText(reverseResult.stderr) ??
          normalizeText(reverseResult.stdout) ??
          "ADB reverse could not be configured.",
      };
    }

    return {
      ok: true,
      message: "ADB reverse is ready.",
    };
  }

  private async enqueueAnalyzeCommand(
    kind: CaptureCompanionCommandKind,
    successMessage: string,
    options?: {
      deviceId?: string | null;
      target?: TranscriptTargetId | null;
      requestId?: string | null;
      replaceExisting?: boolean;
      replaceExistingKinds?: CaptureCompanionCommandKind[];
      requireSession?: boolean;
      livePreview?: boolean;
      ambient?: CaptureAmbientListenerOptions;
      tts?: CaptureCompanionTtsPayload | null;
    }
  ): Promise<CaptureActionOutcome> {
    const status = await this.refreshStatus();
    const settings = await loadSettings();
    const captureSettings = resolveCaptureSettings(settings);
    if (captureSettings.androidCompanionEnabled !== true) {
      return await this.buildActionOutcome(
        resolveCaptureActionFromCommand(kind),
        false,
        "Android companion is disabled in Settings > Capture."
      );
    }
    const deviceId =
      options?.deviceId ??
      this.resolveAnalyzeCommandDeviceId(status, options?.requireSession === true);
    if (deviceId === null) {
      return await this.buildActionOutcome(
        resolveCaptureActionFromCommand(kind),
        false,
        status.android.message ?? "No ready Android device is available."
      );
    }

    const target = options?.target ?? CAPTURE_ANALYZE_TARGET;
    if (
      options?.requireSession === true &&
      this.getBridgeSessionForTarget(deviceId, target) === null
    ) {
      return await this.buildActionOutcome(
        resolveCaptureActionFromCommand(kind),
        false,
        "Wait for the phone preview to become ready before sending capture commands."
      );
    }

    const transcriptModel = resolveCompanionTranscriptModelProfile(settings, captureSettings);
    const command: PendingBridgeCommand = {
      id: randomUUID(),
      kind,
      target,
      requestId: normalizeText(options?.requestId),
      createdAt: Date.now(),
      profile: buildCompanionCommandProfile(captureSettings, transcriptModel, {
        livePreview: options?.livePreview === true,
      }),
      ambient:
        kind === "start-ambient-listener"
          ? resolveAmbientCommandProfile(captureSettings, options?.ambient)
          : null,
      torch: null,
      tts: options?.tts ?? null,
    };
    if (target === CAPTURE_ANALYZE_TARGET && isMediaCaptureCommand(kind)) {
      this.activeAnalyzeMediaRequestIds.add(getCommandRequestId(command));
    }
    this.queuePendingBridgeCommand(deviceId, command, {
      replaceExisting: options?.replaceExisting,
      replaceExistingKinds: options?.replaceExistingKinds,
    });
    if (target === CAPTURE_ANALYZE_TARGET) {
      this.analyzeState = {
        ...this.analyzeState,
        state:
          kind === "open-camera"
            ? "pending-launch"
            : kind === "close-camera"
              ? "idle"
              : kind === "start-dictation" ||
                  kind === "stop-dictation" ||
                  kind === "start-ambient-listener" ||
                  kind === "stop-ambient-listener" ||
                  kind === "start-tts" ||
                  kind === "stop-tts"
                ? this.analyzeState.state
                : "capture-requested",
        deviceId,
        pendingCommand:
          kind === "close-camera" ||
          kind === "stop-dictation" ||
          kind === "stop-ambient-listener" ||
          kind === "stop-tts"
            ? null
            : kind,
        message: successMessage,
      };
    }

    return await this.buildActionOutcome(
      resolveCaptureActionFromCommand(kind),
      true,
      successMessage
    );
  }

  private queuePendingBridgeCommand(
    deviceId: string,
    command: PendingBridgeCommand,
    options: {
      replaceExisting?: boolean | undefined;
      replaceExistingKinds?: CaptureCompanionCommandKind[] | undefined;
    } = {}
  ): void {
    const target = command.target;
    const replaceExistingKinds = options.replaceExistingKinds ?? [];
    const currentQueue = this.pendingCommands.get(deviceId) ?? [];
    const queue =
      options.replaceExisting === true
        ? currentQueue.filter((entry) => entry.target !== target)
        : replaceExistingKinds.length > 0
          ? currentQueue.filter(
              (entry) =>
                entry.target !== target || replaceExistingKinds.includes(entry.kind) !== true
            )
          : currentQueue;
    currentQueue
      .filter((entry) => queue.includes(entry) !== true)
      .forEach((entry) => {
        if (entry.target === CAPTURE_ANALYZE_TARGET && isMediaCaptureCommand(entry.kind)) {
          this.activeAnalyzeMediaRequestIds.delete(getCommandRequestId(entry));
        }
      });
    queue.push(command);
    this.pendingCommands.set(deviceId, queue);
  }

  private buildImmediateActionOutcome(
    action: CaptureActionOutcome["action"],
    ok: boolean,
    message: string,
    baseStatus: CaptureServiceStatus
  ): CaptureActionOutcome {
    this.setOperationState({
      state: ok ? "success" : "error",
      action,
      message,
      progress: ok ? 1 : null,
    });
    const status: CaptureServiceStatus = {
      ...baseStatus,
      analyze: this.analyzeState,
      bridge: this.bridgeState,
      operation: this.operationState,
    };
    this.lastStatus = status;
    return {
      action,
      ok,
      message,
      status,
    };
  }

  private async buildActionOutcome(
    action: CaptureActionOutcome["action"],
    ok: boolean,
    message: string
  ): Promise<CaptureActionOutcome> {
    this.setOperationState({
      state: ok ? "success" : "error",
      action,
      message,
      progress: ok ? 1 : null,
    });
    return {
      action,
      ok,
      message,
      status: await this.refreshStatus(),
    };
  }

  private async buildPassiveActionOutcome(
    action: CaptureActionOutcome["action"],
    ok: boolean,
    message: string
  ): Promise<CaptureActionOutcome> {
    return {
      action,
      ok,
      message,
      status: await this.refreshStatus(),
    };
  }
}

export const captureService = new CaptureService();
