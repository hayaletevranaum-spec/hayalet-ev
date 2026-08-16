import type { SpawnOptions } from "child_process";
import type { EventEmitter } from "events";
import type {
  CaptureHostAction,
  CaptureScrcpyActiveSessionStatus,
  CaptureScrcpyPreviewVideoStatus,
  CaptureScrcpySessionMode,
  CaptureScrcpyStatus,
} from "../src/types/capture.ts";
import type { TranscriptTargetId } from "../src/types/transcript.ts";

type ScrcpyV4l2SinkResult =
  { ok: true; previewVideo: CaptureScrcpyPreviewVideoStatus } | { ok: false; message: string };

export interface ScrcpyChildProcess {
  stdout: Pick<EventEmitter, "on">;
  stderr: Pick<EventEmitter, "on">;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill: (signal?: NodeJS.Signals) => boolean;
  once: {
    (
      event: "close",
      listener: (exitCode: number | null, signal: NodeJS.Signals | null) => void
    ): ScrcpyChildProcess;
    (event: "error", listener: (error: Error) => void): ScrcpyChildProcess;
  };
}

export interface ScrcpyUnexpectedCloseEvent {
  session: CaptureScrcpyActiveSessionStatus;
  action: CaptureHostAction;
  message: string;
  logs: string[];
}

export type ScrcpySessionStartResult =
  | {
      ok: true;
      message: string;
      session: CaptureScrcpyActiveSessionStatus;
      reused: boolean;
    }
  | { ok: false; message: string };

export interface ScrcpySessionManagerOptions {
  onUnexpectedClose: (event: ScrcpyUnexpectedCloseEvent) => void;
  resolveScrcpyPath: () => Promise<string | null>;
  inspectScrcpyVersion: (scrcpyPath: string) => Promise<string | null>;
  resolveV4l2Sink: () => Promise<ScrcpyV4l2SinkResult>;
  spawnProcess: (scrcpyPath: string, args: string[], options: SpawnOptions) => ScrcpyChildProcess;
  getProjectRoot: () => string;
  getSetupHint: () => string | null;
  startupGraceMs: number;
  stopTimeoutMs: number;
  logLimit: number;
  cameraSize: string;
  cameraFps: number;
  v4l2BufferMs: number;
}

interface ScrcpyManagedSession {
  process: ScrcpyChildProcess;
  mode: CaptureScrcpySessionMode;
  deviceId: string;
  target: TranscriptTargetId | null;
  requestId: string | null;
  previewVideo: CaptureScrcpyPreviewVideoStatus | null;
  startedAt: number;
  startedByAction: CaptureHostAction;
  stopping: boolean;
  logs: string[];
}

function normalizeCommandChunk(chunk: Buffer | string): string {
  return typeof chunk === "string" ? chunk : chunk.toString("utf8");
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export class ScrcpySessionManager {
  private activeSession: ScrcpyManagedSession | null = null;
  private scrcpyPath: string | null | undefined;
  private scrcpyVersion: string | null = null;
  private lastLogs: string[] = [];
  private lastError: string | null = null;

  constructor(private readonly options: ScrcpySessionManagerOptions) {}

  getActiveSessionStatus(): CaptureScrcpyActiveSessionStatus | null {
    const session = this.activeSession;
    if (session === null) {
      return null;
    }

    return {
      mode: session.mode,
      deviceId: session.deviceId,
      target: session.target,
      requestId: session.requestId,
      startedAt: session.startedAt,
      previewVideo: session.previewVideo,
    };
  }

  async getStatus(): Promise<CaptureScrcpyStatus> {
    const availability = await this.inspectScrcpy();
    const activeSession = this.getActiveSessionStatus();
    return {
      available: availability.available,
      version: availability.version,
      activeSession,
      mode: activeSession?.mode ?? null,
      deviceId: activeSession?.deviceId ?? null,
      target: activeSession?.target ?? null,
      startedAt: activeSession?.startedAt ?? null,
      previewVideo: activeSession?.previewVideo ?? null,
      lastLogs: [...(this.activeSession?.logs ?? this.lastLogs)],
      lastError: this.lastError,
      setupHint: this.options.getSetupHint(),
    };
  }

  async startCameraFeed(options: {
    deviceId: string;
    target: TranscriptTargetId | null;
    requestId: string | null;
    cameraFacing: "back" | "front";
    action: CaptureHostAction;
  }): Promise<ScrcpySessionStartResult> {
    const existing = this.activeSession;
    if (
      existing !== null &&
      existing.mode === "camera-feed" &&
      existing.deviceId === options.deviceId
    ) {
      return {
        ok: true,
        message: "Scrcpy camera feed is already active.",
        session: this.toSessionStatus(existing),
        reused: true,
      };
    }

    const availability = await this.inspectScrcpy();
    if (availability.available !== true || availability.path === null) {
      this.lastError = "scrcpy is not available on PATH.";
      return {
        ok: false,
        message: this.lastError,
      };
    }

    const sink = await this.options.resolveV4l2Sink();
    if (sink.ok !== true) {
      this.lastError = sink.message;
      return sink;
    }

    await this.stopSession();
    const args = [
      "--serial",
      options.deviceId,
      "--video-source=camera",
      `--camera-facing=${options.cameraFacing}`,
      `--camera-size=${this.options.cameraSize}`,
      `--camera-fps=${String(this.options.cameraFps)}`,
      "--no-audio",
      "--no-window",
      `--v4l2-sink=${sink.previewVideo.devicePath}`,
      `--v4l2-buffer=${String(this.options.v4l2BufferMs)}`,
    ];

    return await this.startProcess({
      mode: "camera-feed",
      scrcpyPath: availability.path,
      args,
      deviceId: options.deviceId,
      target: options.target,
      requestId: options.requestId,
      previewVideo: sink.previewVideo,
      action: options.action,
      successMessage: "Scrcpy camera feed was started.",
    });
  }

  async startInteractiveMirror(options: {
    deviceId: string;
    target: TranscriptTargetId | null;
    requestId: string | null;
    action: CaptureHostAction;
  }): Promise<ScrcpySessionStartResult> {
    const existing = this.activeSession;
    if (
      existing !== null &&
      existing.mode === "interactive-mirror" &&
      existing.deviceId === options.deviceId
    ) {
      return {
        ok: true,
        message: "Scrcpy interactive mirror is already active.",
        session: this.toSessionStatus(existing),
        reused: true,
      };
    }

    const availability = await this.inspectScrcpy();
    if (availability.available !== true || availability.path === null) {
      this.lastError = "scrcpy is not available on PATH.";
      return {
        ok: false,
        message: this.lastError,
      };
    }

    await this.stopSession();
    return await this.startProcess({
      mode: "interactive-mirror",
      scrcpyPath: availability.path,
      args: ["--serial", options.deviceId],
      deviceId: options.deviceId,
      target: options.target,
      requestId: options.requestId,
      previewVideo: null,
      action: options.action,
      successMessage: "Scrcpy interactive mirror was started.",
    });
  }

  async stopSession(mode?: CaptureScrcpySessionMode): Promise<boolean> {
    const session = this.activeSession;
    if (session === null || (mode !== undefined && session.mode !== mode)) {
      return false;
    }

    session.stopping = true;
    const child = session.process;
    if (child.exitCode !== null || child.signalCode !== null) {
      this.lastLogs = [...session.logs];
      this.activeSession = null;
      return true;
    }

    await new Promise<void>((resolve) => {
      const timeoutId = globalThis.setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, this.options.stopTimeoutMs);
      child.once("close", () => {
        globalThis.clearTimeout(timeoutId);
        resolve();
      });
      child.kill("SIGTERM");
    });
    if (this.activeSession === session) {
      this.activeSession = null;
    }
    this.lastLogs = [...session.logs];
    return true;
  }

  private async startProcess(options: {
    mode: CaptureScrcpySessionMode;
    process?: ScrcpyChildProcess | undefined;
    scrcpyPath?: string | undefined;
    args?: string[] | undefined;
    deviceId: string;
    target: TranscriptTargetId | null;
    requestId: string | null;
    previewVideo: CaptureScrcpyPreviewVideoStatus | null;
    action: CaptureHostAction;
    successMessage: string;
  }): Promise<ScrcpySessionStartResult> {
    const child =
      options.process ??
      this.options.spawnProcess(options.scrcpyPath ?? "", options.args ?? [], {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
        cwd: this.options.getProjectRoot(),
      });
    const session: ScrcpyManagedSession = {
      process: child,
      mode: options.mode,
      deviceId: options.deviceId,
      target: options.target,
      requestId: options.requestId,
      previewVideo: options.previewVideo,
      startedAt: Date.now(),
      startedByAction: options.action,
      stopping: false,
      logs: [],
    };
    this.activeSession = session;
    this.lastError = null;

    const appendOutput = (chunk: Buffer | string): void => {
      const lines = normalizeCommandChunk(chunk)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== "");
      session.logs.push(...lines);
      if (session.logs.length > this.options.logLimit) {
        session.logs.splice(0, session.logs.length - this.options.logLimit);
      }
      this.lastLogs = [...session.logs];
    };
    child.stdout.on("data", appendOutput);
    child.stderr.on("data", appendOutput);
    child.once("close", (exitCode, signal) => {
      if (this.activeSession !== session) {
        return;
      }

      this.activeSession = null;
      this.lastLogs = [...session.logs];
      void exitCode;
      void signal;
      if (session.stopping !== true) {
        this.lastError = this.summarizeFailure(session);
        this.options.onUnexpectedClose({
          session: this.toSessionStatus(session),
          action: session.startedByAction,
          message: this.lastError,
          logs: [...session.logs],
        });
      }
    });

    return await new Promise((resolve) => {
      let settled = false;
      const settle = (result: ScrcpySessionStartResult): void => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(result);
      };
      const startupTimer = globalThis.setTimeout(() => {
        settle({
          ok: true,
          message: options.successMessage,
          session: this.toSessionStatus(session),
          reused: false,
        });
      }, this.options.startupGraceMs);
      child.once("error", (error) => {
        globalThis.clearTimeout(startupTimer);
        if (this.activeSession === session) {
          this.activeSession = null;
        }
        this.lastError = error.message;
        settle({
          ok: false,
          message: error.message,
        });
      });
      child.once("close", () => {
        globalThis.clearTimeout(startupTimer);
        if (settled) {
          return;
        }

        if (this.activeSession === session) {
          this.activeSession = null;
        }
        this.lastError = this.summarizeFailure(session);
        settle({
          ok: false,
          message: this.lastError,
        });
      });
    });
  }

  private async inspectScrcpy(): Promise<{
    available: boolean;
    version: string | null;
    path: string | null;
  }> {
    const scrcpyPath = await this.options.resolveScrcpyPath();
    this.scrcpyPath = scrcpyPath;
    if (scrcpyPath === null) {
      this.scrcpyVersion = null;
      return {
        available: false,
        version: null,
        path: null,
      };
    }

    this.scrcpyVersion ??= await this.options.inspectScrcpyVersion(scrcpyPath);

    return {
      available: true,
      version: this.scrcpyVersion,
      path: this.scrcpyPath,
    };
  }

  private toSessionStatus(session: ScrcpyManagedSession): CaptureScrcpyActiveSessionStatus {
    return {
      mode: session.mode,
      deviceId: session.deviceId,
      target: session.target,
      requestId: session.requestId,
      startedAt: session.startedAt,
      previewVideo: session.previewVideo,
    };
  }

  private summarizeFailure(session: ScrcpyManagedSession): string {
    const latestErrorLog =
      [...session.logs]
        .reverse()
        .find((entry) => /\b(error|cannot|failed|denied|busy)\b/i.test(entry)) ?? null;
    const latestLog =
      latestErrorLog ?? [...session.logs].reverse().find((entry) => normalizeText(entry) !== null);
    return latestLog ?? `scrcpy ${session.mode} failed.`;
  }
}
