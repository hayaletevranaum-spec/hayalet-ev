import { BrowserWindow } from "electron";
import { createWriteStream, constants as fsConstants } from "fs";
import { access, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "fs/promises";
import { spawn } from "child_process";
import { createHash, randomUUID } from "crypto";
import { createRequire } from "module";
import { dirname, join, delimiter, relative, resolve } from "path";
import { pipeline } from "stream/promises";
import * as yauzl from "yauzl";
import { Paths } from "./paths.ts";
import { resolveConfigDir } from "./path-roots.ts";
import { normalizeAppLanguage } from "../shared/i18n/locale.js";
import {
  getTranscriptModelDescriptor,
  listTranscriptModelCatalog,
  normalizeTranscriptBackend,
  normalizeTranscriptManagedModelId,
  normalizeTranscriptModelVariant,
  resolveTranscriptModelId,
  resolveTranscriptSupportedLanguage,
} from "../shared/transcript/model-catalog.js";
import type {
  TranscriptDictationBackend,
  TranscriptFileTranscriptionRequest,
  TranscriptFileTranscriptionResult,
  TranscriptIngressPayload,
  TranscriptManagedModelDescriptor,
  TranscriptManagedModelId,
  TranscriptManagedModelStatus,
  TranscriptModelVariant,
  TranscriptRuntimeStatus,
  TranscriptSubmitIngressRequest,
  TranscriptSubmitIngressResult,
  TranscriptSupportedLanguage,
  TranscriptTargetId,
  TranscriptTranscriptionRequest,
  TranscriptTranscriptionResult,
} from "../src/types/transcript.ts";
import type * as VoskKoffi from "vosk-koffi";

const TRANSCRIPT_INGRESS_CHANNEL = "transcript:ingress";
const TRANSCRIPT_WHISPER_REPO_URL = "https://github.com/ggml-org/whisper.cpp.git";
const TRANSCRIPT_WHISPER_TAG = "v1.8.4";
const TRANSCRIPT_WHISPER_BIN_ENV = "HAYALET_EV_TRANSCRIPT_WHISPER_BIN";
const TRANSCRIPT_WHISPER_MODEL_ENV = "HAYALET_EV_TRANSCRIPT_WHISPER_MODEL";
const TRANSCRIPT_VOSK_LIB_ENV = "HAYALET_EV_TRANSCRIPT_VOSK_LIB";
const TRANSCRIPT_VOSK_MODEL_ENV = "HAYALET_EV_TRANSCRIPT_VOSK_MODEL";
const TRANSCRIPT_VOSK_SAMPLE_RATE = 16_000;
const TRANSCRIPT_VOSK_MODEL_MARKER = ".hayalet-ev-vosk-model.json";
const TRANSCRIPT_SETTINGS_PATH = join(resolveConfigDir(), "settings.json");
const require = createRequire(import.meta.url);

interface TranscriptRuntimePaths {
  rootDir: string;
  sourceDir: string;
  buildDir: string;
  modelDir: string;
  tempDir: string;
}

interface CommandRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

interface TranscriptSettingsSnapshot {
  general?: {
    language?: unknown;
    transcriptBackend?: unknown;
    transcriptModelVariant?: unknown;
  };
}

interface ResolvedTranscriptSelection {
  appLanguage: string;
  backend: TranscriptDictationBackend;
  descriptor: TranscriptManagedModelDescriptor;
  language: TranscriptSupportedLanguage;
  variant: TranscriptModelVariant;
}

interface TranscriptModelInspection {
  checksumValid: boolean;
  envOverride: boolean;
  installed: boolean;
  lastError: string | null;
  path: string | null;
  ready: boolean;
  sizeBytes: number | null;
}

interface CachedVoskModel {
  model: VoskKoffi.Model;
}

interface VoskRecognitionResult {
  text?: unknown;
}

function normalizeCommandChunk(chunk: Buffer | string): string {
  return typeof chunk === "string" ? chunk : chunk.toString("utf8");
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function normalizeTarget(value: unknown): TranscriptTargetId | null {
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

function normalizeIngressSource(value: unknown): TranscriptIngressPayload["source"] {
  if (value === "pc-mic" || value === "android-bridge" || value === "synthetic-test") {
    return value;
  }

  return "synthetic-test";
}

function normalizeTranscriptLanguage(value: unknown): TranscriptSupportedLanguage | null {
  const normalized = normalizeText(value);
  if (normalized === null || normalized === "auto") {
    return null;
  }

  return resolveTranscriptSupportedLanguage(normalized);
}

function resolveTranscriptRuntimePaths(): TranscriptRuntimePaths {
  const rootDir = join(Paths.getDataDir(), "transcript");
  return {
    rootDir,
    sourceDir: join(rootDir, "whisper.cpp-src"),
    buildDir: join(rootDir, "whisper.cpp-build"),
    modelDir: join(rootDir, "models"),
    tempDir: join(rootDir, "tmp"),
  };
}

function isInsideDirectory(rootPath: string, candidatePath: string): boolean {
  const resolvedRoot = resolve(rootPath);
  const resolvedCandidate = resolve(candidatePath);
  const relativePath = relative(resolvedRoot, resolvedCandidate);
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith("../"));
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

async function isExecutable(filePath: string | null | undefined): Promise<boolean> {
  if (typeof filePath !== "string" || filePath.trim() === "") {
    return false;
  }

  try {
    await access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureRuntimeDirectories(paths: TranscriptRuntimePaths): Promise<void> {
  await Promise.all(
    [paths.rootDir, paths.modelDir, paths.tempDir].map(async (target) => {
      await mkdir(target, { recursive: true });
    })
  );
}

async function resolveExecutableOnPath(executableName: string): Promise<string | null> {
  const normalized = normalizeText(executableName);
  if (normalized === null) {
    return null;
  }

  if (normalized.includes("/") || normalized.includes("\\")) {
    return (await isExecutable(normalized)) ? normalized : null;
  }

  const pathValue = process.env["PATH"] ?? "";
  const entries = pathValue
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");

  const candidates = entries.map((entry) => join(entry, normalized));
  const checks = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      executable: await isExecutable(candidate),
    }))
  );
  const match = checks.find((entry) => entry.executable === true);
  if (match !== undefined) {
    return match.candidate;
  }

  return null;
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<CommandRunResult> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;

    const timeoutId =
      timeoutMs > 0
        ? globalThis.setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, timeoutMs)
        : null;

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += normalizeCommandChunk(chunk);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += normalizeCommandChunk(chunk);
    });

    child.on("error", (error) => {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      if (settled) {
        return;
      }
      settled = true;
      rejectPromise(error);
    });

    child.on("close", (exitCode) => {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      if (settled) {
        return;
      }
      settled = true;
      resolvePromise({
        exitCode: typeof exitCode === "number" ? exitCode : -1,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}

function sha1Hex(buffer: Buffer): string {
  return createHash("sha1").update(buffer).digest("hex");
}

async function downloadFile(url: string, destinationPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || response.body == null) {
    throw new Error(`Download failed with status ${response.status} for ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destinationPath, buffer);
}

async function readTranscriptSettingsSnapshot(): Promise<TranscriptSettingsSnapshot> {
  try {
    const raw = await readFile(TRANSCRIPT_SETTINGS_PATH, "utf8");
    return JSON.parse(raw) as TranscriptSettingsSnapshot;
  } catch {
    return {};
  }
}

function toRuntimeStatus(
  selection: ResolvedTranscriptSelection,
  state: TranscriptRuntimeStatus["state"],
  overrides: Partial<TranscriptRuntimeStatus> = {}
): TranscriptRuntimeStatus {
  return {
    state,
    ready: state === "ready",
    backend: overrides.backend ?? selection.backend,
    binaryPath: overrides.binaryPath ?? null,
    modelPath: overrides.modelPath ?? null,
    modelId: overrides.modelId ?? selection.descriptor.modelId,
    modelLanguage: overrides.modelLanguage ?? selection.language,
    appLanguage: overrides.appLanguage ?? selection.appLanguage,
    activeLanguage: overrides.activeLanguage ?? selection.language,
    activeVariant: overrides.activeVariant ?? selection.variant,
    message: overrides.message ?? null,
  };
}

export class TranscriptService {
  private activeEnsurePromises = new Map<
    TranscriptManagedModelId,
    Promise<TranscriptRuntimeStatus>
  >();
  private activeBinaryEnsurePromise: Promise<string> | null = null;
  private activeModelInstallPromises = new Map<
    TranscriptManagedModelId,
    Promise<TranscriptManagedModelStatus>
  >();
  private activeVoskModels = new Map<string, CachedVoskModel>();
  private pathsCache: TranscriptRuntimePaths | null = null;

  private getPaths(): TranscriptRuntimePaths {
    this.pathsCache ??= resolveTranscriptRuntimePaths();
    return this.pathsCache;
  }

  private async resolveSelection(
    request:
      | Pick<TranscriptTranscriptionRequest, "language" | "modelId" | "variant">
      | Pick<TranscriptFileTranscriptionRequest, "language" | "modelId" | "variant">
      | null
      | undefined
  ): Promise<ResolvedTranscriptSelection> {
    const settings = await readTranscriptSettingsSnapshot();
    const appLanguage = normalizeAppLanguage(settings.general?.language);
    const configuredBackend = normalizeTranscriptBackend(
      settings.general?.transcriptBackend,
      "whisper.cpp"
    );
    const requestedLanguage = normalizeTranscriptLanguage(request?.language);
    const requestedModelId = normalizeTranscriptManagedModelId(request?.modelId);
    const configuredVariant = normalizeTranscriptModelVariant(
      settings.general?.transcriptModelVariant,
      "full"
    );
    const requestedVariant = normalizeTranscriptModelVariant(request?.variant, configuredVariant);
    const initialLanguage = requestedLanguage ?? resolveTranscriptSupportedLanguage(appLanguage);
    const descriptor =
      (requestedModelId !== null ? getTranscriptModelDescriptor(requestedModelId) : null) ??
      getTranscriptModelDescriptor(
        resolveTranscriptModelId(initialLanguage, requestedVariant, configuredBackend)
      );

    if (descriptor === null) {
      throw new Error("Transcript model descriptor could not be resolved.");
    }

    return {
      appLanguage,
      backend: descriptor.backend,
      descriptor,
      language: descriptor.englishOnly === true ? "en" : initialLanguage,
      variant: descriptor.variant,
    };
  }

  private async getModelStatus(
    descriptor: TranscriptManagedModelDescriptor
  ): Promise<TranscriptManagedModelStatus> {
    const inspection = await this.inspectModel(descriptor);

    return {
      ...descriptor,
      installed: inspection.installed,
      ready: inspection.ready,
      path: inspection.path,
      sizeBytes: inspection.sizeBytes,
      checksumValid: inspection.checksumValid,
      lastError: inspection.lastError,
    };
  }

  private async resolveBinaryPath(backend: TranscriptDictationBackend): Promise<string | null> {
    if (backend === "vosk") {
      return await this.resolveVoskLibraryPath();
    }

    const paths = this.getPaths();
    const envBinaryPath = normalizeText(process.env[TRANSCRIPT_WHISPER_BIN_ENV]);
    if (envBinaryPath !== null && (await isExecutable(envBinaryPath))) {
      return envBinaryPath;
    }

    const bundledCandidates = [
      join(paths.buildDir, "bin", "whisper-cli"),
      join(paths.buildDir, "bin", "main"),
      join(paths.sourceDir, "build", "bin", "whisper-cli"),
      join(paths.sourceDir, "build", "bin", "main"),
    ];

    const checks = await Promise.all(
      bundledCandidates.map(async (candidate) => ({
        candidate,
        executable: await isExecutable(candidate),
      }))
    );
    const match = checks.find((entry) => entry.executable === true);
    if (match !== undefined) {
      return match.candidate;
    }

    return await resolveExecutableOnPath("whisper-cli");
  }

  private async resolveVoskLibraryPath(): Promise<string | null> {
    const envLibraryPath = normalizeText(process.env[TRANSCRIPT_VOSK_LIB_ENV]);
    if (envLibraryPath !== null && (await fileExists(envLibraryPath))) {
      return envLibraryPath;
    }

    try {
      const entryPath = require.resolve("vosk-koffi");
      const packageRoot = dirname(dirname(entryPath));
      const libraryName =
        process.platform === "win32"
          ? "libvosk.dll"
          : process.platform === "darwin"
            ? "libvosk.dylib"
            : "libvosk.so";
      const libraryPath = join(packageRoot, `bin-${process.platform}-${process.arch}`, libraryName);
      return (await fileExists(libraryPath)) ? libraryPath : null;
    } catch {
      return null;
    }
  }

  private async resolveModelPath(modelId: TranscriptManagedModelId): Promise<string | null> {
    const descriptor = getTranscriptModelDescriptor(modelId);
    if (descriptor === null) {
      return null;
    }

    const inspection = await this.inspectModel(descriptor);
    return inspection.ready === true ? inspection.path : null;
  }

  async getStatus(): Promise<TranscriptRuntimeStatus> {
    const selection = await this.resolveSelection(undefined);
    const binaryPath = await this.resolveBinaryPath(selection.backend);
    const modelStatus = await this.getModelStatus(selection.descriptor);
    const modelPath = modelStatus.ready === true ? modelStatus.path : null;

    if (binaryPath !== null && modelPath !== null && modelStatus.ready === true) {
      return toRuntimeStatus(selection, "ready", {
        binaryPath,
        modelPath,
        message: null,
      });
    }

    if (this.activeEnsurePromises.has(selection.descriptor.modelId)) {
      return toRuntimeStatus(selection, "preparing", {
        binaryPath,
        modelPath,
        message: "Preparing the local transcript runtime.",
      });
    }

    return toRuntimeStatus(selection, "missing-runtime", {
      binaryPath,
      modelPath,
      message:
        modelStatus.lastError ??
        `Local transcription needs ${selection.backend} and the ${selection.descriptor.label} model before it can run.`,
    });
  }

  async ensureRuntime(
    request:
      | Pick<TranscriptTranscriptionRequest, "language" | "modelId" | "variant">
      | null
      | undefined = undefined
  ): Promise<TranscriptRuntimeStatus> {
    const selection = await this.resolveSelection(request);
    const readyStatus = await this.getStatusForSelection(selection);
    if (readyStatus.ready === true) {
      return readyStatus;
    }

    const activePromise = this.activeEnsurePromises.get(selection.descriptor.modelId);
    if (activePromise !== undefined) {
      return await activePromise;
    }

    const ensurePromise = (async (): Promise<TranscriptRuntimeStatus> => {
      const paths = this.getPaths();

      try {
        await ensureRuntimeDirectories(paths);
        const binaryPath = await this.ensureBinary(selection.backend);
        const modelPath = await this.ensureModel(selection.descriptor.modelId);
        return toRuntimeStatus(selection, "ready", {
          binaryPath,
          modelPath,
          message: null,
        });
      } catch (error) {
        return toRuntimeStatus(selection, "error", {
          binaryPath: await this.resolveBinaryPath(selection.backend),
          modelPath: await this.resolveModelPath(selection.descriptor.modelId),
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        this.activeEnsurePromises.delete(selection.descriptor.modelId);
      }
    })();

    this.activeEnsurePromises.set(selection.descriptor.modelId, ensurePromise);
    return await ensurePromise;
  }

  async listModels(): Promise<TranscriptManagedModelStatus[]> {
    const descriptors = listTranscriptModelCatalog();
    return await Promise.all(
      descriptors.map(async (descriptor) => {
        return await this.getModelStatus(descriptor);
      })
    );
  }

  async installModel(modelId: TranscriptManagedModelId): Promise<TranscriptManagedModelStatus> {
    const descriptor = getTranscriptModelDescriptor(modelId);
    if (descriptor === null) {
      throw new Error(`Unknown transcript model: ${String(modelId)}`);
    }

    const currentStatus = await this.getModelStatus(descriptor);
    const envModelPath = normalizeText(
      process.env[
        descriptor.backend === "vosk" ? TRANSCRIPT_VOSK_MODEL_ENV : TRANSCRIPT_WHISPER_MODEL_ENV
      ]
    );
    if (currentStatus.ready === true || currentStatus.path === envModelPath) {
      return currentStatus;
    }

    const activeInstallPromise = this.activeModelInstallPromises.get(modelId);
    if (activeInstallPromise !== undefined) {
      return await activeInstallPromise;
    }

    const installPromise = (async (): Promise<TranscriptManagedModelStatus> => {
      const paths = this.getPaths();
      await ensureRuntimeDirectories(paths);
      await this.ensureBinary(descriptor.backend);

      if (
        currentStatus.installed === true &&
        currentStatus.ready !== true &&
        currentStatus.path !== null
      ) {
        await this.quarantineManagedModel(descriptor.fileName, currentStatus.path);
      }

      const destinationPath = this.resolveManagedModelPath(descriptor);
      const tempPath = join(paths.tempDir, `${descriptor.fileName}.download`);

      await rm(tempPath, { force: true });
      await this.prepareModelArchive(descriptor, tempPath);

      try {
        const modelBuffer = await readFile(tempPath);
        this.assertModelBuffer(descriptor, modelBuffer, `Downloaded ${descriptor.backend} model`);
        if (descriptor.archiveFormat === "zip-directory") {
          await this.extractZipDirectoryModel(descriptor, tempPath, destinationPath);
          await rm(tempPath, { force: true });
        } else {
          await rename(tempPath, destinationPath);
        }
      } catch (error) {
        await rm(tempPath, { force: true });
        throw error;
      }

      return await this.getModelStatus(descriptor);
    })();

    this.activeModelInstallPromises.set(modelId, installPromise);
    try {
      return await installPromise;
    } finally {
      this.activeModelInstallPromises.delete(modelId);
    }
  }

  async removeModel(modelId: TranscriptManagedModelId): Promise<TranscriptManagedModelStatus> {
    const descriptor = getTranscriptModelDescriptor(modelId);
    if (descriptor === null) {
      throw new Error(`Unknown transcript model: ${String(modelId)}`);
    }

    const modelPath = this.resolveManagedModelPath(descriptor);
    this.releaseCachedVoskModel(modelPath);
    await rm(modelPath, {
      recursive: descriptor.archiveFormat === "zip-directory",
      force: true,
    });
    return await this.getModelStatus(descriptor);
  }

  async transcribeLocal(
    request: TranscriptTranscriptionRequest
  ): Promise<TranscriptTranscriptionResult> {
    const audioBase64 = normalizeText(request.audioBase64);
    if (audioBase64 === null) {
      const status = await this.getStatus();
      return {
        success: false,
        status,
        error: "Audio payload is empty.",
      };
    }

    const status = await this.ensureRuntime(request);
    if (status.ready !== true || status.binaryPath === null || status.modelPath === null) {
      return {
        success: false,
        status,
        error: status.message ?? "Local dictation runtime is not ready.",
      };
    }

    const paths = this.getPaths();
    await ensureRuntimeDirectories(paths);

    const requestId = normalizeText(request.requestId) ?? randomUUID();
    const wavPath = join(paths.tempDir, `${requestId}.wav`);
    const outputBase = join(paths.tempDir, `${requestId}-transcript`);
    const transcriptPath = `${outputBase}.txt`;

    try {
      await writeFile(wavPath, Buffer.from(audioBase64, "base64"));
      const transcriptionStartedAt = Date.now();
      const transcript = await this.runTranscription({
        backend: status.backend,
        binaryPath: status.binaryPath,
        modelPath: status.modelPath,
        audioPath: wavPath,
        outputBase,
        language: status.activeLanguage,
        cwd: paths.tempDir,
      });
      const transcriptionMs = Date.now() - transcriptionStartedAt;

      return {
        success: true,
        text: transcript,
        status,
        backend: status.backend,
        transcriptionMs,
      };
    } catch (error) {
      return {
        success: false,
        status,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      await Promise.all(
        [wavPath, transcriptPath].map(async (target) => {
          await rm(target, { force: true });
        })
      );
    }
  }

  async transcribeFile(
    request: TranscriptFileTranscriptionRequest
  ): Promise<TranscriptFileTranscriptionResult> {
    const audioPath = normalizeText(request.audioPath);
    if (audioPath === null) {
      const status = await this.getStatus();
      return {
        success: false,
        status,
        error: "Audio file path is empty.",
      };
    }

    const roomId = normalizeText(request.roomId);
    if (roomId === null) {
      const status = await this.getStatus();
      return {
        success: false,
        status,
        error: "Managed file transcription requires a roomId.",
      };
    }

    let managedAudioPath: string;
    let outputBasePath: string;

    try {
      managedAudioPath = this.ensureManagedRoomPath(roomId, audioPath);
      outputBasePath = this.ensureManagedRoomPath(
        roomId,
        normalizeText(request.outputBasePath) ??
          `${managedAudioPath.replace(/\.[^.]+$/, "")}-transcript`
      );
    } catch (error) {
      const status = await this.getStatus();
      return {
        success: false,
        status,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    const status = await this.ensureRuntime(request);
    if (status.ready !== true || status.binaryPath === null || status.modelPath === null) {
      return {
        success: false,
        status,
        error: status.message ?? "Transcript runtime is not ready.",
      };
    }

    try {
      const transcriptionStartedAt = Date.now();
      const transcript = await this.runTranscription({
        backend: status.backend,
        binaryPath: status.binaryPath,
        modelPath: status.modelPath,
        audioPath: managedAudioPath,
        outputBase: outputBasePath,
        language: status.activeLanguage,
        cwd: this.getPaths().tempDir,
      });
      const transcriptionMs = Date.now() - transcriptionStartedAt;

      return {
        success: true,
        text: transcript,
        transcriptPath: `${outputBasePath}.txt`,
        status,
        backend: status.backend,
        transcriptionMs,
      };
    } catch (error) {
      return {
        success: false,
        status,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  submitIngress(request: TranscriptSubmitIngressRequest): TranscriptSubmitIngressResult {
    const text = normalizeText(request.text);
    if (text === null) {
      return {
        success: false,
        error: "Transcript text is empty.",
      };
    }

    const payload: TranscriptIngressPayload = {
      requestId: normalizeText(request.requestId) ?? randomUUID(),
      createdAt: new Date().toISOString(),
      text,
      source: normalizeIngressSource(request.source),
      target: normalizeTarget(request.target),
      isFinal: request.isFinal !== false,
      metadata: request.metadata ?? null,
    };

    for (const window of BrowserWindow.getAllWindows()) {
      try {
        window.webContents.send(TRANSCRIPT_INGRESS_CHANNEL, payload);
      } catch {
        // NOTE: Transcript fan-out is best-effort so one detached window cannot abort the ingress.
      }
    }

    return {
      success: true,
      payload,
    };
  }

  private async getStatusForSelection(
    selection: ResolvedTranscriptSelection
  ): Promise<TranscriptRuntimeStatus> {
    const binaryPath = await this.resolveBinaryPath(selection.backend);
    const modelStatus = await this.getModelStatus(selection.descriptor);
    const modelPath = modelStatus.ready === true ? modelStatus.path : null;

    if (binaryPath !== null && modelPath !== null && modelStatus.ready === true) {
      return toRuntimeStatus(selection, "ready", {
        binaryPath,
        modelPath,
        message: null,
      });
    }

    if (this.activeEnsurePromises.has(selection.descriptor.modelId)) {
      return toRuntimeStatus(selection, "preparing", {
        binaryPath,
        modelPath,
        message: "Preparing the local transcript runtime.",
      });
    }

    return toRuntimeStatus(selection, "missing-runtime", {
      binaryPath,
      modelPath,
      message:
        modelStatus.lastError ??
        `Local transcription needs ${selection.backend} and the ${selection.descriptor.label} model before it can run.`,
    });
  }

  private async ensureBinary(backend: TranscriptDictationBackend): Promise<string> {
    if (backend === "vosk") {
      return await this.ensureVoskRuntime();
    }

    const existingBinary = await this.resolveBinaryPath("whisper.cpp");
    if (existingBinary !== null) {
      return existingBinary;
    }

    if (this.activeBinaryEnsurePromise !== null) {
      return await this.activeBinaryEnsurePromise;
    }

    const ensurePromise = (async (): Promise<string> => {
      const paths = this.getPaths();
      const buildTools = await Promise.all(
        ["git", "cmake", "make", "g++"].map(async (toolName) => ({
          toolName,
          path: await resolveExecutableOnPath(toolName),
        }))
      );
      const missingTools = buildTools
        .filter((entry) => entry.path === null)
        .map((entry) => entry.toolName);

      if (missingTools.length > 0) {
        throw new Error(
          `whisper.cpp build prerequisites are missing: ${missingTools.join(", ")}. Install them or set ${TRANSCRIPT_WHISPER_BIN_ENV}.`
        );
      }

      if ((await fileExists(paths.sourceDir)) !== true) {
        const cloneResult = await runCommand(
          "git",
          [
            "clone",
            "--depth",
            "1",
            "--branch",
            TRANSCRIPT_WHISPER_TAG,
            TRANSCRIPT_WHISPER_REPO_URL,
            paths.sourceDir,
          ],
          Paths.getDataDir(),
          15 * 60 * 1000
        );
        if (cloneResult.exitCode !== 0) {
          throw new Error(
            normalizeText(cloneResult.stderr) ??
              normalizeText(cloneResult.stdout) ??
              "whisper.cpp clone failed."
          );
        }
      }

      const configureResult = await runCommand(
        "cmake",
        [
          "-S",
          paths.sourceDir,
          "-B",
          paths.buildDir,
          "-DCMAKE_BUILD_TYPE=Release",
          "-DWHISPER_BUILD_TESTS=OFF",
          "-DWHISPER_BUILD_SERVER=OFF",
        ],
        paths.rootDir,
        20 * 60 * 1000
      );
      if (configureResult.exitCode !== 0) {
        throw new Error(
          normalizeText(configureResult.stderr) ??
            normalizeText(configureResult.stdout) ??
            "whisper.cpp configure step failed."
        );
      }

      const buildResult = await runCommand(
        "cmake",
        ["--build", paths.buildDir, "--config", "Release", "-j2", "--target", "whisper-cli"],
        paths.rootDir,
        60 * 60 * 1000
      );
      if (buildResult.exitCode !== 0) {
        throw new Error(
          normalizeText(buildResult.stderr) ??
            normalizeText(buildResult.stdout) ??
            "whisper.cpp build failed."
        );
      }

      const binaryPath = await this.resolveBinaryPath("whisper.cpp");
      if (binaryPath === null) {
        throw new Error("whisper.cpp build finished but whisper-cli could not be resolved.");
      }

      return binaryPath;
    })();

    this.activeBinaryEnsurePromise = ensurePromise;
    try {
      return await ensurePromise;
    } finally {
      this.activeBinaryEnsurePromise = null;
    }
  }

  private async ensureVoskRuntime(): Promise<string> {
    const libraryPath = await this.resolveVoskLibraryPath();
    if (libraryPath === null) {
      throw new Error(
        `Vosk runtime library is missing. Install vosk-koffi or set ${TRANSCRIPT_VOSK_LIB_ENV}.`
      );
    }

    try {
      await import("vosk-koffi");
    } catch (error) {
      throw new Error(
        `Vosk runtime could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }

    return libraryPath;
  }

  private async ensureModel(modelId: TranscriptManagedModelId): Promise<string> {
    const descriptor = getTranscriptModelDescriptor(modelId);
    if (descriptor === null) {
      throw new Error(`Unknown transcript model: ${String(modelId)}`);
    }

    const currentStatus = await this.getModelStatus(descriptor);
    if (currentStatus.path !== null && currentStatus.ready === true) {
      return currentStatus.path;
    }
    if (
      currentStatus.installed === true &&
      currentStatus.ready !== true &&
      currentStatus.path !== null
    ) {
      await this.quarantineManagedModel(descriptor.fileName, currentStatus.path);
    }

    const installedModel = await this.installModel(modelId);
    if (installedModel.path === null || installedModel.ready !== true) {
      throw new Error(`Transcript model ${modelId} is not ready after installation.`);
    }
    return installedModel.path;
  }

  private resolveManagedModelPath(descriptor: TranscriptManagedModelDescriptor): string {
    if (descriptor.archiveFormat === "zip-directory") {
      return join(
        this.getPaths().modelDir,
        descriptor.directoryName ?? descriptor.fileName.replace(/\.zip$/i, "")
      );
    }

    return join(this.getPaths().modelDir, descriptor.fileName);
  }

  private async prepareModelArchive(
    descriptor: TranscriptManagedModelDescriptor,
    tempPath: string
  ): Promise<void> {
    const localArchive = await this.resolveLocalModelArchivePath(descriptor);
    if (localArchive !== null) {
      await copyFile(localArchive, tempPath);
      return;
    }

    await downloadFile(descriptor.downloadUrl, tempPath);
  }

  private async resolveLocalModelArchivePath(
    descriptor: TranscriptManagedModelDescriptor
  ): Promise<string | null> {
    if (descriptor.archiveFormat !== "zip-directory") {
      return null;
    }

    const candidates = [
      join(Paths.getDataDir(), "transcript", "android-models", descriptor.fileName),
      join(Paths.getProjectRoot(), "data", "transcript", "android-models", descriptor.fileName),
      join(
        Paths.getProjectRoot(),
        "android-companion",
        "app",
        "src",
        "main",
        "assets",
        "transcript-models",
        descriptor.fileName
      ),
    ];

    const checks = await Promise.all(
      candidates.map(async (candidate) => ({
        candidate,
        exists: await fileExists(candidate),
      }))
    );
    return checks.find((entry) => entry.exists)?.candidate ?? null;
  }

  private async extractZipDirectoryModel(
    descriptor: TranscriptManagedModelDescriptor,
    archivePath: string,
    destinationPath: string
  ): Promise<void> {
    const paths = this.getPaths();
    const extractRoot = join(paths.tempDir, `${randomUUID()}-${descriptor.modelId}`);
    const sourceDir = join(
      extractRoot,
      descriptor.directoryName ?? descriptor.fileName.replace(/\.zip$/i, "")
    );
    const expectedDirectoryName =
      descriptor.directoryName ?? descriptor.fileName.replace(/\.zip$/i, "");

    await rm(extractRoot, { recursive: true, force: true });
    await mkdir(extractRoot, { recursive: true });

    try {
      await this.extractZipArchive(archivePath, extractRoot);
      if ((await fileExists(sourceDir)) !== true) {
        throw new Error(`Vosk model archive did not contain ${expectedDirectoryName}.`);
      }
      await rm(destinationPath, { recursive: true, force: true });
      await rename(sourceDir, destinationPath);
      await writeFile(
        join(destinationPath, TRANSCRIPT_VOSK_MODEL_MARKER),
        `${JSON.stringify(
          {
            modelId: descriptor.modelId,
            fileName: descriptor.fileName,
            expectedSha1: descriptor.expectedSha1,
            expectedBytes: descriptor.expectedBytes,
            installedAt: new Date().toISOString(),
          },
          null,
          2
        )}\n`,
        "utf8"
      );
    } finally {
      await rm(extractRoot, { recursive: true, force: true });
    }
  }

  private async extractZipArchive(archivePath: string, destinationRoot: string): Promise<void> {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      let settled = false;
      const normalizeRejection = (error: unknown): Error =>
        error instanceof Error ? error : new Error(String(error));
      const fail = (zipFile: yauzl.ZipFile | null, error: unknown): void => {
        if (settled) {
          return;
        }
        settled = true;
        zipFile?.close();
        rejectPromise(normalizeRejection(error));
      };

      yauzl.open(archivePath, { lazyEntries: true }, (openError, zipFile) => {
        if (openError !== null) {
          fail(null, openError);
          return;
        }

        zipFile.on("entry", (entry: yauzl.Entry) => {
          const targetPath = resolve(destinationRoot, entry.fileName);
          if (
            entry.fileName.startsWith("/") ||
            entry.fileName.includes("\\") ||
            isInsideDirectory(destinationRoot, targetPath) !== true
          ) {
            fail(
              zipFile,
              new Error(`Vosk model archive contains an unsafe path: ${entry.fileName}`)
            );
            return;
          }

          if (entry.fileName.endsWith("/")) {
            mkdir(targetPath, { recursive: true })
              .then(() => {
                zipFile.readEntry();
              })
              .catch((error: unknown) => {
                fail(zipFile, error);
              });
            return;
          }

          zipFile.openReadStream(entry, (streamError, readStream) => {
            if (streamError !== null) {
              fail(zipFile, streamError);
              return;
            }

            mkdir(dirname(targetPath), { recursive: true })
              .then(async () => {
                await pipeline(readStream, createWriteStream(targetPath));
                zipFile.readEntry();
              })
              .catch((error: unknown) => {
                fail(zipFile, error);
              });
          });
        });

        zipFile.once("error", (error) => {
          fail(zipFile, error);
        });
        zipFile.once("end", () => {
          if (settled) {
            return;
          }
          settled = true;
          resolvePromise();
        });
        zipFile.readEntry();
      });
    });
  }

  private assertModelBuffer(
    descriptor: TranscriptManagedModelDescriptor,
    modelBuffer: Buffer,
    contextLabel: string
  ): void {
    const actualSha1 = sha1Hex(modelBuffer);
    if (actualSha1 !== descriptor.expectedSha1) {
      throw new Error(
        `${contextLabel} checksum mismatch. Expected ${descriptor.expectedSha1}, got ${actualSha1}.`
      );
    }

    if (descriptor.expectedBytes !== null && modelBuffer.byteLength !== descriptor.expectedBytes) {
      throw new Error(
        `${contextLabel} size mismatch. Expected ${descriptor.expectedBytes}, got ${modelBuffer.byteLength}.`
      );
    }
  }

  private async inspectModel(
    descriptor: TranscriptManagedModelDescriptor
  ): Promise<TranscriptModelInspection> {
    const envModelPath = normalizeText(
      process.env[
        descriptor.backend === "vosk" ? TRANSCRIPT_VOSK_MODEL_ENV : TRANSCRIPT_WHISPER_MODEL_ENV
      ]
    );
    if (envModelPath !== null && (await fileExists(envModelPath))) {
      const envStats = await stat(envModelPath);
      return {
        checksumValid: true,
        envOverride: true,
        installed: true,
        lastError: null,
        path: envModelPath,
        ready: true,
        sizeBytes: envStats.size,
      };
    }

    const modelPath = this.resolveManagedModelPath(descriptor);
    if ((await fileExists(modelPath)) !== true) {
      return {
        checksumValid: false,
        envOverride: false,
        installed: false,
        lastError: null,
        path: modelPath,
        ready: false,
        sizeBytes: null,
      };
    }

    if (descriptor.archiveFormat === "zip-directory") {
      const modelStats = await stat(modelPath);
      const markerPath = join(modelPath, TRANSCRIPT_VOSK_MODEL_MARKER);
      try {
        const marker = JSON.parse(await readFile(markerPath, "utf8")) as Record<string, unknown>;
        const checksumValid =
          marker["expectedSha1"] === descriptor.expectedSha1 &&
          marker["expectedBytes"] === descriptor.expectedBytes;
        return {
          checksumValid,
          envOverride: false,
          installed: true,
          lastError: checksumValid ? null : "Stored Vosk model marker did not match the catalog.",
          path: modelPath,
          ready: checksumValid,
          sizeBytes: modelStats.size,
        };
      } catch (error) {
        return {
          checksumValid: false,
          envOverride: false,
          installed: true,
          lastError: error instanceof Error ? error.message : String(error),
          path: modelPath,
          ready: false,
          sizeBytes: modelStats.size,
        };
      }
    }

    const modelBuffer = await readFile(modelPath);

    try {
      this.assertModelBuffer(descriptor, modelBuffer, `Stored ${descriptor.backend} model`);
      return {
        checksumValid: true,
        envOverride: false,
        installed: true,
        lastError: null,
        path: modelPath,
        ready: true,
        sizeBytes: modelBuffer.byteLength,
      };
    } catch (error) {
      return {
        checksumValid: false,
        envOverride: false,
        installed: true,
        lastError: error instanceof Error ? error.message : String(error),
        path: modelPath,
        ready: false,
        sizeBytes: modelBuffer.byteLength,
      };
    }
  }

  private async quarantineManagedModel(fileName: string, modelPath: string): Promise<void> {
    const paths = this.getPaths();
    if (isInsideDirectory(paths.modelDir, modelPath) !== true) {
      return;
    }

    this.releaseCachedVoskModel(modelPath);
    await ensureRuntimeDirectories(paths);
    const quarantinePath = join(paths.tempDir, `${randomUUID()}-${fileName}.corrupt`);

    try {
      await rename(modelPath, quarantinePath);
    } catch {
      await rm(modelPath, { recursive: true, force: true });
    }
  }

  private async runTranscription(options: {
    backend: TranscriptDictationBackend;
    binaryPath: string;
    modelPath: string;
    audioPath: string;
    outputBase: string;
    language: TranscriptSupportedLanguage;
    cwd: string;
  }): Promise<string> {
    if (options.backend === "vosk") {
      return await this.runVoskTranscription(options);
    }

    const runResult = await runCommand(
      options.binaryPath,
      [
        "-m",
        options.modelPath,
        "-f",
        options.audioPath,
        "-l",
        options.language,
        "-otxt",
        "-of",
        options.outputBase,
      ],
      options.cwd,
      25 * 60 * 1000
    );

    if (runResult.exitCode !== 0) {
      throw new Error(
        normalizeText(runResult.stderr) ??
          normalizeText(runResult.stdout) ??
          "whisper.cpp transcription failed."
      );
    }

    const transcript = normalizeText(await readFile(`${options.outputBase}.txt`, "utf8"));
    if (transcript === null) {
      throw new Error("whisper.cpp returned an empty transcript.");
    }

    return transcript;
  }

  private async runVoskTranscription(options: {
    modelPath: string;
    audioPath: string;
    outputBase: string;
  }): Promise<string> {
    const vosk = await import("vosk-koffi");
    vosk.setLogLevel(-1);
    const pcm = await this.readVoskPcm16(options.audioPath);
    const model = this.getCachedVoskModel(options.modelPath, vosk);
    const recognizer = new vosk.Recognizer({
      model,
      sampleRate: TRANSCRIPT_VOSK_SAMPLE_RATE,
    });

    try {
      recognizer.acceptWaveform(pcm);
      const result = recognizer.finalResult() as VoskRecognitionResult;
      const transcript = normalizeText(result.text);
      if (transcript === null) {
        throw new Error("Vosk returned an empty transcript.");
      }
      await writeFile(`${options.outputBase}.txt`, `${transcript}\n`, "utf8");
      return transcript;
    } finally {
      recognizer.free();
    }
  }

  private getCachedVoskModel(modelPath: string, vosk: typeof VoskKoffi): VoskKoffi.Model {
    const cached = this.activeVoskModels.get(modelPath);
    if (cached !== undefined) {
      return cached.model;
    }

    const model = new vosk.Model(modelPath);
    this.activeVoskModels.set(modelPath, { model });
    return model;
  }

  private releaseCachedVoskModel(modelPath: string): void {
    const cached = this.activeVoskModels.get(modelPath);
    if (cached === undefined) {
      return;
    }
    this.activeVoskModels.delete(modelPath);
    cached.model.free();
  }

  private async readVoskPcm16(audioPath: string): Promise<Buffer> {
    const wavBuffer = await readFile(audioPath);
    if (
      wavBuffer.length < 44 ||
      wavBuffer.toString("ascii", 0, 4) !== "RIFF" ||
      wavBuffer.toString("ascii", 8, 12) !== "WAVE"
    ) {
      throw new Error("Vosk transcription requires a WAV audio file.");
    }

    let offset = 12;
    let audioFormat: number | null = null;
    let channelCount: number | null = null;
    let sampleRate: number | null = null;
    let bitsPerSample: number | null = null;
    let dataStart: number | null = null;
    let dataSize: number | null = null;

    while (offset + 8 <= wavBuffer.length) {
      const chunkId = wavBuffer.toString("ascii", offset, offset + 4);
      const chunkSize = wavBuffer.readUInt32LE(offset + 4);
      const chunkStart = offset + 8;
      const chunkEnd = chunkStart + chunkSize;
      if (chunkEnd > wavBuffer.length) {
        break;
      }

      if (chunkId === "fmt ") {
        audioFormat = wavBuffer.readUInt16LE(chunkStart);
        channelCount = wavBuffer.readUInt16LE(chunkStart + 2);
        sampleRate = wavBuffer.readUInt32LE(chunkStart + 4);
        bitsPerSample = wavBuffer.readUInt16LE(chunkStart + 14);
      } else if (chunkId === "data") {
        dataStart = chunkStart;
        dataSize = chunkSize;
      }

      offset = chunkEnd + (chunkSize % 2);
    }

    if (
      audioFormat !== 1 ||
      channelCount !== 1 ||
      sampleRate !== TRANSCRIPT_VOSK_SAMPLE_RATE ||
      bitsPerSample !== 16 ||
      dataStart === null ||
      dataSize === null
    ) {
      throw new Error("Vosk transcription requires 16 kHz mono PCM16 WAV audio.");
    }

    return wavBuffer.subarray(dataStart, dataStart + dataSize);
  }

  private ensureManagedRoomPath(roomId: string, candidatePath: string): string {
    const managedRoot = Paths.getRoomStorageDir(roomId);
    const resolvedPath = resolve(candidatePath);
    if (isInsideDirectory(managedRoot, resolvedPath) !== true) {
      throw new Error(
        `Transcript file access is limited to managed room paths under ${managedRoot}.`
      );
    }
    return resolvedPath;
  }
}

export const transcriptService = new TranscriptService();
export { TRANSCRIPT_INGRESS_CHANNEL };
