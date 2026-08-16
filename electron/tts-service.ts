import { BrowserWindow } from "electron";
import { spawn } from "child_process";
import { randomUUID, createHash } from "crypto";
import { createRequire } from "module";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "fs/promises";
import { join } from "path";
import { Paths } from "./paths.ts";
import { loadSettings } from "./settings-manager.ts";
import {
  getTtsModelDescriptor,
  listTtsModelCatalog,
  normalizeTtsLanguage,
  normalizeTtsManagedModelId,
  normalizeTtsMode,
  resolveTtsLanguageFromLocale,
  resolveTtsModelId,
} from "../shared/tts/model-catalog.js";
import type {
  TtsAndroidStatusPayload,
  TtsLanguage,
  TtsManagedModelId,
  TtsManagedModelStatus,
  TtsMode,
  TtsModelDescriptor,
  TtsRequest,
  TtsRuntimeStatus,
  TtsSpeakResult,
  TtsStatus,
  TtsStatusState,
  TtsStopResult,
  TtsTargetId,
  TtsInstallModelResult,
} from "../src/types/tts.ts";

export const TTS_STATUS_CHANNEL = "tts:status";

const require = createRequire(import.meta.url);

interface TtsRuntimePaths {
  rootDir: string;
  modelDir: string;
  tempDir: string;
}

interface ResolvedTtsSelection {
  mode: TtsMode;
  language: TtsLanguage;
  descriptor: TtsModelDescriptor;
}

interface SherpaRuntimeRef {
  moduleName: string;
  modulePath: string;
}

interface CommandRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface SherpaAudio {
  samples: { length: number } | ArrayLike<number>;
  sampleRate: number;
}

interface AndroidTtsCompatibility {
  ok: boolean;
  message: string | null;
}

interface TtsAndroidBridgeDeviceStatus {
  selected?: boolean;
  connectionState?: string;
  deviceId?: string | null;
  label?: string | null;
}

interface TtsAndroidBridgeStatus {
  android?: {
    devices: TtsAndroidBridgeDeviceStatus[];
    selectedDeviceId?: string | null;
    message?: string | null;
    adbPath?: string | null;
  };
}

interface TtsAndroidBridgeOutcome {
  ok: boolean;
  message: string;
}

export interface TtsAndroidBridge {
  getStatus(): Promise<TtsAndroidBridgeStatus>;
  startTts(options: {
    target: TtsTargetId;
    requestId: string;
    text: string;
    language: TtsLanguage;
    modelId: TtsManagedModelId;
  }): Promise<TtsAndroidBridgeOutcome>;
  stopTts(options: { target: TtsTargetId; requestId: string }): Promise<TtsAndroidBridgeOutcome>;
}

interface SherpaOfflineTts {
  generate?: (request: {
    text: string;
    generationConfig: unknown;
    enableExternalBuffer?: boolean;
  }) => SherpaAudio;
  generateWithConfig?: (text: string, config: unknown) => SherpaAudio;
  save?: (filePath: string, audio: SherpaAudio) => void;
  free?: () => void;
}

interface SherpaRuntime {
  OfflineTts?: new (config: Record<string, unknown>) => SherpaOfflineTts;
  GenerationConfig?: new (config: Record<string, unknown>) => unknown;
  createOfflineTts?: (config: Record<string, unknown>) => SherpaOfflineTts;
  writeWave?: (filePath: string, audio: { samples: unknown; sampleRate: number }) => void;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function normalizeTarget(value: unknown): TtsTargetId | null {
  const normalized = normalizeText(value);
  if (normalized === null) {
    return null;
  }

  if (normalized === "analyze-compose") {
    return normalized;
  }

  if (normalized.startsWith("room:")) {
    const roomId = normalizeText(normalized.slice("room:".length));
    return roomId === null ? null : `room:${roomId}`;
  }

  return null;
}

function normalizeStatusState(value: unknown): TtsStatusState | null {
  switch (value) {
    case "queued":
    case "preparing":
    case "playing":
    case "done":
    case "stopped":
    case "failed":
      return value;
    default:
      return null;
  }
}

function clampProgress(value: unknown): number | null {
  if (typeof value !== "number" || Number.isFinite(value) !== true) {
    return null;
  }

  return Math.min(1, Math.max(0, value));
}

function isTerminalStatus(status: TtsStatusState): boolean {
  return status === "done" || status === "stopped" || status === "failed";
}

function sha1Hex(buffer: Buffer): string {
  return createHash("sha1").update(buffer).digest("hex");
}

async function fileExists(filePath: string | null | undefined): Promise<boolean> {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    return false;
  }

  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url: string, destinationPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || response.body === null) {
    throw new Error(`Download failed with status ${response.status} for ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destinationPath, buffer);
}

async function runCommand(command: string, args: string[], cwd: string): Promise<CommandRunResult> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    });
    child.on("error", rejectPromise);
    child.on("close", (exitCode) => {
      resolvePromise({
        exitCode: typeof exitCode === "number" ? exitCode : -1,
        stdout,
        stderr,
      });
    });
  });
}

function resolveTtsRuntimePaths(): TtsRuntimePaths {
  const rootDir = join(Paths.getDataDir(), "tts");
  return {
    rootDir,
    modelDir: join(rootDir, "models"),
    tempDir: join(rootDir, "tmp"),
  };
}

async function ensureTtsDirectories(paths: TtsRuntimePaths): Promise<void> {
  await Promise.all(
    [paths.rootDir, paths.modelDir, paths.tempDir].map(async (dir) => {
      await mkdir(dir, { recursive: true });
    })
  );
}

function resolveSherpaOnnxRuntime(): SherpaRuntimeRef | null {
  const candidates = ["sherpa-onnx-node", "sherpa-onnx"] as const;
  for (const moduleName of candidates) {
    try {
      return {
        moduleName,
        modulePath: require.resolve(moduleName),
      };
    } catch {
      // Continue to the next supported sherpa runtime package.
    }
  }
  return null;
}

export class TtsService {
  private pathsCache: TtsRuntimePaths | null = null;
  private activeStatus: TtsStatus | null = null;
  private lastStatus: TtsStatus | null = null;
  private activeDoneTimer: ReturnType<typeof setTimeout> | null = null;
  private activeInstallPromises = new Map<TtsManagedModelId, Promise<TtsInstallModelResult>>();
  private androidBridge: TtsAndroidBridge | null = null;

  setAndroidBridge(bridge: TtsAndroidBridge | null): void {
    this.androidBridge = bridge;
  }

  private getPaths(): TtsRuntimePaths {
    this.pathsCache ??= resolveTtsRuntimePaths();
    return this.pathsCache;
  }

  private async resolveSelection(
    request: TtsRequest | null | undefined
  ): Promise<ResolvedTtsSelection> {
    const settings = await loadSettings();
    const general = settings?.general ?? {};
    const captureDefaults = settings?.capture?.defaults ?? {};
    const fallbackLanguage = resolveTtsLanguageFromLocale(general.language);
    const language = normalizeTtsLanguage(
      request?.language ?? captureDefaults.ttsLanguage,
      fallbackLanguage
    );
    const descriptor =
      getTtsModelDescriptor(normalizeTtsManagedModelId(request?.modelId)) ??
      getTtsModelDescriptor(resolveTtsModelId(language));

    if (descriptor === null) {
      throw new Error("TTS model descriptor could not be resolved.");
    }

    return {
      mode: normalizeTtsMode(request?.mode ?? captureDefaults.ttsMode, "local"),
      language: descriptor.language,
      descriptor,
    };
  }

  private getModelFilePath(descriptor: TtsModelDescriptor): string {
    return join(this.getPaths().modelDir, descriptor.modelId, descriptor.files.model.fileName);
  }

  private getModelTokensPath(descriptor: TtsModelDescriptor): string | null {
    return descriptor.files.tokens === null
      ? null
      : join(this.getPaths().modelDir, descriptor.modelId, descriptor.files.tokens.fileName);
  }

  private getModelDataDirPath(descriptor: TtsModelDescriptor): string | null {
    return descriptor.dataDirName === null
      ? null
      : join(this.getPaths().modelDir, descriptor.modelId, descriptor.dataDirName);
  }

  private async inspectModel(descriptor: TtsModelDescriptor): Promise<TtsManagedModelStatus> {
    const modelPath = this.getModelFilePath(descriptor);
    const tokensPath = this.getModelTokensPath(descriptor);
    const dataDirPath = this.getModelDataDirPath(descriptor);
    const modelExists = await fileExists(modelPath);
    const tokensExist = tokensPath !== null ? await fileExists(tokensPath) : true;
    const dataDirExists = dataDirPath !== null ? await fileExists(dataDirPath) : true;
    const ready = modelExists === true && tokensExist === true && dataDirExists === true;
    const modelStats = modelExists ? await stat(modelPath).catch(() => null) : null;
    let lastError: string | null = null;

    if (ready !== true) {
      lastError = `${descriptor.label} model, tokens, and espeak data are not installed in data/tts.`;
    } else if (
      descriptor.files.model.expectedSha1 !== undefined &&
      descriptor.files.model.expectedSha1 !== null
    ) {
      const buffer = await readFile(modelPath);
      if (sha1Hex(buffer) !== descriptor.files.model.expectedSha1) {
        lastError = `${descriptor.label} model checksum does not match the catalog.`;
      }
    }

    return {
      ...descriptor,
      installed: modelExists === true,
      ready: ready === true && lastError === null,
      path: ready === true ? modelPath : null,
      sizeBytes: modelStats?.size ?? null,
      lastError,
    };
  }

  private makeStatus(
    requestId: string,
    request: TtsRequest,
    selection: ResolvedTtsSelection,
    status: TtsStatusState,
    message: string,
    overrides: Partial<TtsStatus> = {}
  ): TtsStatus {
    const timestamp = new Date().toISOString();
    return {
      requestId,
      target: normalizeTarget(request.target) ?? "analyze-compose",
      mode: selection.mode,
      language: selection.language,
      modelId: selection.descriptor.modelId,
      status,
      progress: overrides.progress ?? null,
      message,
      error: overrides.error ?? null,
      audioPath: overrides.audioPath ?? null,
      source: overrides.source ?? (selection.mode === "android" ? "android-bridge" : "local"),
      createdAt: overrides.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
  }

  private emitStatus(status: TtsStatus): void {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (window.isDestroyed() !== true) {
        window.webContents.send(TTS_STATUS_CHANNEL, status);
      }
    });
  }

  private setActiveStatus(status: TtsStatus): void {
    if (isTerminalStatus(status.status) && this.activeDoneTimer !== null) {
      clearTimeout(this.activeDoneTimer);
      this.activeDoneTimer = null;
    }
    this.lastStatus = status;
    this.activeStatus = status;
    this.emitStatus(status);
    if (isTerminalStatus(status.status)) {
      this.activeStatus = null;
    }
  }

  private async getAndroidRuntimeStatus(): Promise<TtsRuntimeStatus["android"]> {
    const bridge = this.androidBridge;
    if (bridge === null) {
      return {
        ready: false,
        deviceId: null,
        message: "Android capture bridge is not registered.",
      };
    }

    const status = await bridge.getStatus().catch(() => null);
    const android = status?.android;
    const devices = Array.isArray(android?.devices) ? android.devices : [];
    const selectedDevice = devices.find((device) => device.selected === true) ?? null;
    return {
      ready: selectedDevice !== null && selectedDevice.connectionState === "device",
      deviceId: selectedDevice?.deviceId ?? android?.selectedDeviceId ?? null,
      message: selectedDevice?.label ?? android?.message ?? null,
    };
  }

  async listModels(): Promise<TtsManagedModelStatus[]> {
    await ensureTtsDirectories(this.getPaths());
    return await Promise.all(
      listTtsModelCatalog().map(async (descriptor) => await this.inspectModel(descriptor))
    );
  }

  async getStatus(): Promise<TtsRuntimeStatus> {
    const selection = await this.resolveSelection(undefined);
    const models = await this.listModels();
    const activeModel =
      models.find((model) => model.modelId === selection.descriptor.modelId) ??
      (await this.inspectModel(selection.descriptor));
    const runtime = resolveSherpaOnnxRuntime();
    return {
      mode: selection.mode,
      language: selection.language,
      active: this.activeStatus,
      local: {
        ready: runtime !== null && activeModel.ready === true,
        runtimeAvailable: runtime !== null,
        runtimePath: runtime?.modulePath ?? null,
        modelPath: activeModel.ready === true ? activeModel.path : null,
        modelId: selection.descriptor.modelId,
        message:
          runtime === null
            ? "sherpa-onnx-node is not installed; no fallback TTS engine is used."
            : activeModel.lastError,
      },
      android: await this.getAndroidRuntimeStatus(),
      models,
    };
  }

  async installModel(modelId: TtsManagedModelId): Promise<TtsInstallModelResult> {
    const descriptor = getTtsModelDescriptor(modelId);
    if (descriptor === null) {
      throw new Error(`Unknown TTS model: ${String(modelId)}`);
    }

    const existing = this.activeInstallPromises.get(descriptor.modelId);
    if (existing !== undefined) {
      return await existing;
    }

    const promise = this.installModelFiles(descriptor);
    this.activeInstallPromises.set(descriptor.modelId, promise);
    try {
      return await promise;
    } finally {
      this.activeInstallPromises.delete(descriptor.modelId);
    }
  }

  private async installModelFiles(descriptor: TtsModelDescriptor): Promise<TtsInstallModelResult> {
    await ensureTtsDirectories(this.getPaths());
    const targetDir = join(this.getPaths().modelDir, descriptor.modelId);
    await mkdir(targetDir, { recursive: true });
    if (descriptor.archive !== null) {
      return await this.installArchivedModel(descriptor, targetDir);
    }

    const modelPath = join(targetDir, descriptor.files.model.fileName);
    const tokensPath =
      descriptor.files.tokens === null ? null : join(targetDir, descriptor.files.tokens.fileName);
    const modelTempPath = `${modelPath}.${process.pid}.${Date.now().toString(36)}.tmp`;
    const tokensTempPath =
      tokensPath === null ? null : `${tokensPath}.${process.pid}.${Date.now().toString(36)}.tmp`;

    try {
      await downloadFile(descriptor.files.model.downloadUrl, modelTempPath);
      if (descriptor.files.tokens !== null && tokensTempPath !== null) {
        await downloadFile(descriptor.files.tokens.downloadUrl, tokensTempPath);
      }
      await rename(modelTempPath, modelPath);
      if (tokensTempPath !== null && tokensPath !== null) {
        await rename(tokensTempPath, tokensPath);
      }
      return {
        success: true,
        model: await this.inspectModel(descriptor),
        error: null,
      };
    } catch (error) {
      return {
        success: false,
        model: await this.inspectModel(descriptor),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async installArchivedModel(
    descriptor: TtsModelDescriptor,
    targetDir: string
  ): Promise<TtsInstallModelResult> {
    const archive = descriptor.archive;
    if (archive === null) {
      throw new Error("TTS archive descriptor is missing.");
    }

    const paths = this.getPaths();
    await mkdir(paths.tempDir, { recursive: true });
    const archivePath = join(paths.tempDir, `${descriptor.modelId}-${archive.fileName}`);
    const extractedDirName = archive.fileName.replace(/\.tar\.bz2$/i, "");
    const extractedDir = join(paths.modelDir, extractedDirName);
    try {
      await downloadFile(archive.downloadUrl, archivePath);
      await rm(extractedDir, { recursive: true, force: true });
      const tarResult = await runCommand(
        "tar",
        ["xjf", archivePath, "-C", paths.modelDir],
        paths.modelDir
      );
      if (tarResult.exitCode !== 0) {
        const stderr = tarResult.stderr.trim();
        const stdout = tarResult.stdout.trim();
        throw new Error(
          stderr !== "" ? stderr : stdout !== "" ? stdout : "TTS model extraction failed."
        );
      }
      await rm(targetDir, { recursive: true, force: true });
      await rename(extractedDir, targetDir);
      return {
        success: true,
        model: await this.inspectModel(descriptor),
        error: null,
      };
    } catch (error) {
      return {
        success: false,
        model: await this.inspectModel(descriptor),
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async speak(request: TtsRequest): Promise<TtsSpeakResult> {
    const text = normalizeText(request.text);
    if (text === null) {
      throw new Error("TTS text is required.");
    }

    const requestId = normalizeText(request.requestId) ?? randomUUID();
    const selection = await this.resolveSelection(request);
    if (this.activeStatus !== null && isTerminalStatus(this.activeStatus.status) !== true) {
      this.setActiveStatus({
        ...this.activeStatus,
        status: "stopped",
        progress: null,
        message: "Speech was stopped by a newer TTS request.",
        updatedAt: new Date().toISOString(),
      });
    }

    const queued = this.makeStatus(requestId, request, selection, "queued", "TTS request queued.");
    this.setActiveStatus(queued);

    if (selection.mode === "android") {
      await this.startAndroidTts(requestId, text, request, selection);
    } else {
      await this.startLocalTts(requestId, request, selection);
    }

    return {
      requestId,
      status: this.lastStatus?.requestId === requestId ? this.lastStatus : queued,
      runtime: await this.getStatus(),
    };
  }

  private async startLocalTts(
    requestId: string,
    request: TtsRequest,
    selection: ResolvedTtsSelection
  ): Promise<void> {
    const preparing = this.makeStatus(
      requestId,
      request,
      selection,
      "preparing",
      "Preparing local sherpa-onnx TTS.",
      { progress: 0.1 }
    );
    this.setActiveStatus(preparing);

    const runtime = resolveSherpaOnnxRuntime();
    let modelStatus = await this.inspectModel(selection.descriptor);
    if (runtime !== null && modelStatus.ready !== true) {
      this.setActiveStatus(
        this.makeStatus(
          requestId,
          request,
          selection,
          "preparing",
          `Installing ${selection.descriptor.label}.`,
          {
            progress: 0.2,
            createdAt: preparing.createdAt,
          }
        )
      );
      const installResult = await this.installModel(selection.descriptor.modelId);
      modelStatus = installResult.model;
      if (installResult.success !== true || modelStatus.ready !== true) {
        const message =
          installResult.error ??
          modelStatus.lastError ??
          `${selection.descriptor.label} could not be prepared.`;
        this.setActiveStatus(
          this.makeStatus(requestId, request, selection, "failed", message, {
            error: message,
            progress: null,
            createdAt: preparing.createdAt,
          })
        );
        return;
      }
    }

    if (runtime === null || modelStatus.ready !== true) {
      const message =
        runtime === null
          ? "sherpa-onnx-node is not installed; no fallback TTS engine is used."
          : (modelStatus.lastError ?? `${selection.descriptor.label} is not ready.`);
      this.setActiveStatus(
        this.makeStatus(requestId, request, selection, "failed", message, {
          error: message,
          progress: null,
          createdAt: preparing.createdAt,
        })
      );
      return;
    }

    try {
      const audioPath = this.synthesizeLocalWave(requestId, request, selection, runtime);
      this.setActiveStatus(
        this.makeStatus(requestId, request, selection, "playing", "Speech audio is ready.", {
          progress: 0.85,
          createdAt: preparing.createdAt,
          audioPath,
        })
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setActiveStatus(
        this.makeStatus(requestId, request, selection, "failed", message, {
          error: message,
          progress: null,
          createdAt: preparing.createdAt,
        })
      );
    }
  }

  private synthesizeLocalWave(
    requestId: string,
    request: TtsRequest,
    selection: ResolvedTtsSelection,
    runtimeRef: SherpaRuntimeRef
  ): string {
    const text = normalizeText(request.text);
    const modelPath = this.getModelFilePath(selection.descriptor);
    const tokensPath = this.getModelTokensPath(selection.descriptor);
    const dataDirPath = this.getModelDataDirPath(selection.descriptor);
    if (text === null || tokensPath === null || dataDirPath === null) {
      throw new Error("TTS text, tokens, and espeak data are required.");
    }

    const runtime = require(runtimeRef.moduleName) as SherpaRuntime;
    const vitsConfig = {
      model: modelPath,
      tokens: tokensPath,
      dataDir: dataDirPath,
      noiseScale: 0.667,
      noiseScaleW: 0.8,
      lengthScale: 1.0,
    };
    const addonConfig = {
      model: {
        vits: vitsConfig,
        debug: false,
        numThreads: 1,
        provider: "cpu",
      },
      maxNumSentences: 1,
    };
    const wasmConfig = {
      offlineTtsModelConfig: {
        offlineTtsVitsModelConfig: vitsConfig,
        debug: false,
        numThreads: 1,
        provider: "cpu",
      },
      maxNumSentences: 1,
    };
    const tts =
      typeof runtime.OfflineTts === "function"
        ? new runtime.OfflineTts(addonConfig)
        : typeof runtime.createOfflineTts === "function"
          ? runtime.createOfflineTts(wasmConfig)
          : null;
    if (tts === null) {
      throw new Error("Installed sherpa-onnx package does not expose an OfflineTts API.");
    }

    const generationConfig =
      typeof runtime.GenerationConfig === "function"
        ? new runtime.GenerationConfig({ sid: 0, speed: 1.0, silenceScale: 0.2 })
        : { sid: 0, speed: 1.0, silenceScale: 0.2 };
    const audio =
      typeof tts.generate === "function"
        ? tts.generate({ text, generationConfig, enableExternalBuffer: false })
        : typeof tts.generateWithConfig === "function"
          ? tts.generateWithConfig(text, generationConfig)
          : null;
    if (audio === null || typeof audio.sampleRate !== "number") {
      tts.free?.();
      throw new Error("sherpa-onnx did not return generated audio.");
    }

    const outputPath = join(this.getPaths().tempDir, `${requestId}.wav`);
    if (typeof runtime.writeWave === "function") {
      runtime.writeWave(outputPath, { samples: audio.samples, sampleRate: audio.sampleRate });
    } else if (typeof tts.save === "function") {
      tts.save(outputPath, audio);
    } else {
      tts.free?.();
      throw new Error("sherpa-onnx runtime cannot write WAV output.");
    }
    tts.free?.();

    const durationMs =
      audio.sampleRate > 0 && typeof audio.samples.length === "number"
        ? Math.ceil((audio.samples.length / audio.sampleRate) * 1000)
        : 1_000;
    this.scheduleLocalDone(requestId, durationMs);
    return outputPath;
  }

  private scheduleLocalDone(requestId: string, durationMs: number): void {
    if (this.activeDoneTimer !== null) {
      clearTimeout(this.activeDoneTimer);
      this.activeDoneTimer = null;
    }

    this.activeDoneTimer = setTimeout(
      () => {
        const active = this.activeStatus;
        if (active?.requestId === requestId && active.status === "playing") {
          this.setActiveStatus({
            ...active,
            status: "done",
            progress: 1,
            message: "Speech playback completed.",
            updatedAt: new Date().toISOString(),
          });
        }
      },
      Math.max(500, durationMs + 250)
    );
  }

  private async startAndroidTts(
    requestId: string,
    text: string,
    request: TtsRequest,
    selection: ResolvedTtsSelection
  ): Promise<void> {
    const preparing = this.makeStatus(
      requestId,
      request,
      selection,
      "preparing",
      "Sending TTS request to Android companion.",
      { progress: 0.1 }
    );
    this.setActiveStatus(preparing);

    const bridge = this.androidBridge;
    if (bridge === null) {
      const message = "Android capture bridge is not registered.";
      this.setActiveStatus(
        this.makeStatus(requestId, request, selection, "failed", message, {
          error: message,
          createdAt: preparing.createdAt,
        })
      );
      return;
    }

    const compatibility = await this.inspectAndroidTtsCompatibility(bridge);
    if (compatibility.ok !== true) {
      const message = compatibility.message ?? "Android TTS is not compatible with this device.";
      this.setActiveStatus(
        this.makeStatus(requestId, request, selection, "failed", message, {
          error: message,
          createdAt: preparing.createdAt,
        })
      );
      return;
    }

    const outcome = await bridge.startTts({
      target: preparing.target,
      requestId,
      text,
      language: selection.language,
      modelId: selection.descriptor.modelId,
    });
    if (outcome.ok !== true) {
      this.setActiveStatus(
        this.makeStatus(requestId, request, selection, "failed", outcome.message, {
          error: outcome.message,
          createdAt: preparing.createdAt,
        })
      );
    }
  }

  private async inspectAndroidTtsCompatibility(
    bridge: TtsAndroidBridge
  ): Promise<AndroidTtsCompatibility> {
    const status = await bridge.getStatus().catch(() => null);
    const android = status?.android;
    const devices = Array.isArray(android?.devices) ? android.devices : [];
    const adbPath = normalizeText(android?.adbPath);
    const selectedDevice =
      devices.find((device) => device.selected === true) ??
      devices.find((device) => device.deviceId === android?.selectedDeviceId) ??
      null;
    const deviceId = normalizeText(selectedDevice?.deviceId ?? android?.selectedDeviceId);
    if (adbPath === null || deviceId === null || selectedDevice?.connectionState !== "device") {
      return { ok: true, message: null };
    }

    const abiList = await this.readAndroidAbiList(adbPath, deviceId);
    if (abiList.length === 0 || abiList.includes("arm64-v8a")) {
      return { ok: true, message: null };
    }

    if (abiList.includes("armeabi-v7a") || abiList.includes("armeabi")) {
      return { ok: true, message: null };
    }

    return { ok: true, message: null };
  }

  private async readAndroidAbiList(adbPath: string, deviceId: string): Promise<string[]> {
    const readProp = async (name: string): Promise<string | null> => {
      const result = await runCommand(
        adbPath,
        ["-s", deviceId, "shell", "getprop", name],
        Paths.getProjectRoot()
      ).catch(() => null);
      return normalizeText(result?.stdout);
    };
    const rawAbiList =
      (await readProp("ro.product.cpu.abilist")) ?? (await readProp("ro.product.cpu.abi"));
    if (rawAbiList === null) {
      return [];
    }

    return rawAbiList
      .split(",")
      .map((abi) => abi.trim())
      .filter((abi) => abi !== "");
  }

  async stop(requestIdValue: unknown): Promise<TtsStopResult> {
    const requestId = normalizeText(requestIdValue);
    if (requestId === null) {
      throw new Error("TTS requestId is required.");
    }

    const active = this.activeStatus;
    if (active?.requestId !== requestId) {
      const selection = await this.resolveSelection(undefined);
      const status = this.makeStatus(
        requestId,
        { text: "", target: "analyze-compose" },
        selection,
        "stopped",
        "No active TTS request matched the stop request."
      );
      return { requestId, status, runtime: await this.getStatus() };
    }

    const stopping: TtsStatus = {
      ...active,
      status: "stopped",
      progress: null,
      message: "Speech stopped.",
      updatedAt: new Date().toISOString(),
    };

    if (active.mode === "android") {
      const bridge = this.androidBridge;
      if (bridge === null) {
        const message = "Android capture bridge is not registered.";
        this.setActiveStatus({
          ...active,
          status: "failed",
          error: message,
          message,
          updatedAt: new Date().toISOString(),
        });
        return { requestId, status: this.lastStatus ?? active, runtime: await this.getStatus() };
      }

      const outcome = await bridge.stopTts({
        target: active.target,
        requestId,
      });
      if (outcome.ok !== true) {
        this.setActiveStatus({
          ...active,
          status: "failed",
          error: outcome.message,
          message: outcome.message,
          updatedAt: new Date().toISOString(),
        });
        return { requestId, status: this.lastStatus ?? active, runtime: await this.getStatus() };
      }
    }

    this.setActiveStatus(stopping);
    return { requestId, status: stopping, runtime: await this.getStatus() };
  }

  acceptAndroidStatus(payload: TtsAndroidStatusPayload): TtsStatus | null {
    const requestId = normalizeText(payload.requestId);
    const target = normalizeTarget(payload.target);
    const statusState = normalizeStatusState(payload.status);
    if (requestId === null || target === null || statusState === null) {
      return null;
    }

    const language = normalizeTtsLanguage(payload.language, "tr");
    const modelId = normalizeTtsManagedModelId(payload.modelId) ?? resolveTtsModelId(language);
    const descriptor = getTtsModelDescriptor(modelId);
    if (descriptor === null) {
      return null;
    }

    const active = this.activeStatus?.requestId === requestId ? this.activeStatus : null;
    const timestamp = new Date().toISOString();
    const status: TtsStatus = {
      requestId,
      target,
      mode: "android",
      language: descriptor.language,
      modelId: descriptor.modelId,
      status: statusState,
      progress: clampProgress(payload.progress),
      message: normalizeText(payload.message) ?? active?.message ?? "Android TTS status updated.",
      error: normalizeText(payload.error),
      audioPath: null,
      source: "android-bridge",
      createdAt: active?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    this.setActiveStatus(status);
    return status;
  }
}

export const ttsService = new TtsService();

export function registerTtsAndroidBridge(bridge: TtsAndroidBridge | null): void {
  ttsService.setAndroidBridge(bridge);
}
