import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve, posix as pathPosix } from "node:path";

import type { ToolResult } from "../types/index-mcp.js";
import { PROJECT_ROOT } from "../utils/project-root.js";

interface CommandResult {
  exitCode: number;
  stdout: Buffer;
  stderr: string;
  timedOut: boolean;
}

type CommandRunner = (
  command: string,
  args: string[],
  options: { timeoutMs: number; cwd?: string }
) => Promise<CommandResult>;

type FileWriter = (filePath: string, data: Buffer) => Promise<void>;
type FileReader = (filePath: string) => Promise<Buffer>;
type DirectoryCreator = (directoryPath: string) => Promise<void>;
type FileRemover = (filePath: string) => Promise<void>;
type AdbResolver = (adbPath?: string, projectRoot?: string) => Promise<string | null>;

interface AndroidScreenshotArgs {
  adbPath?: string;
  deviceId?: string;
  savePath?: string;
  timeoutMs?: number;
  strategy?: "auto" | "exec-out" | "file-pull";
  _projectRoot?: string;
  _runCommand?: CommandRunner;
  _resolveAdbPath?: AdbResolver;
  _writeFile?: FileWriter;
  _readFile?: FileReader;
  _mkdir?: DirectoryCreator;
  _unlink?: FileRemover;
  _timestamp?: number;
}

interface AndroidDeviceRecord {
  id: string;
  state: string;
  label: string;
}

interface ScreenshotCaptureResult {
  buffer: Buffer;
  strategy: "exec-out" | "file-pull";
  fallbackReason: string | null;
}

const DEFAULT_SCREENSHOT_TIMEOUT_MS = 15_000;
const MAX_SCREENSHOT_TIMEOUT_MS = 120_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function normalizeOptionalText(value: unknown): string | null {
  return isNonEmptyString(value) ? value.trim() : null;
}

function normalizeTimeout(value: unknown): number {
  if (typeof value !== "number" || Number.isFinite(value) !== true) {
    return DEFAULT_SCREENSHOT_TIMEOUT_MS;
  }

  return Math.max(1_000, Math.min(MAX_SCREENSHOT_TIMEOUT_MS, Math.round(value)));
}

function normalizeStrategy(value: unknown): "auto" | "exec-out" | "file-pull" {
  return value === "exec-out" || value === "file-pull" || value === "auto" ? value : "auto";
}

function resolveOutputPath(
  projectRoot: string,
  savePath: string | null,
  timestamp: number
): string {
  if (savePath !== null) {
    if (isAbsolute(savePath)) {
      return savePath;
    }

    // If caller passed a POSIX-style projectRoot (tests use "/repo"), preserve
    // POSIX formatting for returned paths so string assertions remain stable on Windows.
    if (projectRoot.startsWith("/")) {
      return pathPosix.resolve(projectRoot, savePath);
    }

    return resolve(projectRoot, savePath);
  }

  if (projectRoot.startsWith("/")) {
    return pathPosix.join(
      projectRoot,
      "data",
      "android-screenshots",
      `android-screenshot-${String(timestamp)}.png`
    );
  }

  return join(
    projectRoot,
    "data",
    "android-screenshots",
    `android-screenshot-${String(timestamp)}.png`
  );
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    if (process.platform !== "win32") {
      return false;
    }

    try {
      await access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

function buildAdbCandidates(explicitPath: string | null, projectRoot: string): string[] {
  const executableName = process.platform === "win32" ? "adb.exe" : "adb";
  const candidates: string[] = [];

  if (explicitPath !== null) {
    candidates.push(explicitPath);
  }

  const sdkRoots = [
    process.env["ANDROID_HOME"],
    process.env["ANDROID_SDK_ROOT"],
    join(projectRoot, "dist", "android-toolchain", "android-sdk"),
  ]
    .map((entry) => normalizeOptionalText(entry))
    .filter((entry): entry is string => entry !== null);

  sdkRoots.forEach((root) => {
    candidates.push(join(root, "platform-tools", executableName));
  });

  const pathEntries = (process.env["PATH"] ?? "")
    .split(process.platform === "win32" ? ";" : ":")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  const extensions = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  pathEntries.forEach((entry) => {
    extensions.forEach((extension) => {
      candidates.push(join(entry, `adb${extension}`));
    });
  });

  return [...new Set(candidates)];
}

export async function resolveAdbPath(
  adbPath?: string,
  projectRoot = PROJECT_ROOT
): Promise<string | null> {
  const explicitPath = normalizeOptionalText(adbPath);
  const candidates = buildAdbCandidates(explicitPath, projectRoot);
  const executableChecks = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      executable: await isExecutable(candidate),
    }))
  );

  return executableChecks.find((result) => result.executable === true)?.candidate ?? null;
}

async function runCommand(
  command: string,
  args: string[],
  options: { timeoutMs: number; cwd?: string }
): Promise<CommandResult> {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;
    let timedOut = false;

    const timeoutId =
      options.timeoutMs > 0
        ? globalThis.setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, options.timeoutMs)
        : null;

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.on("error", (error) => {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      if (settled === true) {
        return;
      }
      settled = true;
      rejectPromise(error);
    });

    child.on("close", (exitCode) => {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      if (settled === true) {
        return;
      }
      settled = true;
      resolvePromise({
        exitCode: typeof exitCode === "number" ? exitCode : -1,
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks).toString("utf8").trim(),
        timedOut,
      });
    });
  });
}

function parseAdbDevices(output: string): AndroidDeviceRecord[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && /^List of devices attached/i.test(line) !== true)
    .map((line) => {
      const [id = "", state = "unknown", ...rest] = line.split(/\s+/);
      return {
        id,
        state,
        label: rest.join(" "),
      };
    })
    .filter((device) => device.id !== "");
}

async function resolveTargetDevice(
  adbPath: string,
  requestedDeviceId: string | null,
  run: CommandRunner,
  timeoutMs: number,
  projectRoot: string
): Promise<{ deviceId: string; devices: AndroidDeviceRecord[] } | { error: ToolResult }> {
  const deviceResult = await run(adbPath, ["devices", "-l"], { timeoutMs, cwd: projectRoot });
  if (deviceResult.exitCode !== 0) {
    const stdoutText = deviceResult.stdout.toString("utf8").trim();
    const message =
      deviceResult.stderr !== ""
        ? deviceResult.stderr
        : stdoutText !== ""
          ? stdoutText
          : "ADB device list failed.";
    return {
      error: {
        content: [
          {
            type: "text",
            text: message,
          },
        ],
        isError: true,
      },
    };
  }

  const devices = parseAdbDevices(deviceResult.stdout.toString("utf8"));
  const readyDevices = devices.filter((device) => device.state === "device");

  if (requestedDeviceId !== null) {
    const requested = devices.find((device) => device.id === requestedDeviceId) ?? null;
    if (requested !== null && requested.state !== "device") {
      return {
        error: {
          content: [
            {
              type: "text",
              text: `Android device "${requestedDeviceId}" is ${requested.state}. Unlock/authorize it, then retry.`,
            },
          ],
          isError: true,
        },
      };
    }

    return { deviceId: requestedDeviceId, devices };
  }

  if (readyDevices.length === 1) {
    const [readyDevice] = readyDevices;
    if (readyDevice !== undefined) {
      return { deviceId: readyDevice.id, devices };
    }
  }

  if (readyDevices.length > 1) {
    return {
      error: {
        content: [
          {
            type: "text",
            text: `Multiple Android devices are ready. Pass deviceId. Ready devices: ${readyDevices
              .map((device) => device.id)
              .join(", ")}`,
          },
        ],
        isError: true,
      },
    };
  }

  const blocked = devices.length > 0 ? devices.map((device) => `${device.id}:${device.state}`) : [];
  return {
    error: {
      content: [
        {
          type: "text",
          text:
            blocked.length > 0
              ? `No ready Android device found. Current devices: ${blocked.join(", ")}`
              : "No Android device found. Connect a device with USB debugging or adb connect.",
        },
      ],
      isError: true,
    },
  };
}

function isPngBuffer(buffer: Buffer): boolean {
  return buffer.length > PNG_SIGNATURE.length && PNG_SIGNATURE.equals(buffer.subarray(0, 8));
}

function summarizeCommandFailure(result: CommandResult, fallback: string): string {
  if (result.timedOut === true) {
    return "command timed out";
  }

  const stdoutText = result.stdout.toString("utf8").trim();
  if (result.stderr !== "") {
    return result.stderr;
  }
  if (stdoutText !== "") {
    return stdoutText;
  }

  return fallback;
}

async function captureWithExecOut(
  adbPath: string,
  deviceId: string,
  run: CommandRunner,
  timeoutMs: number,
  projectRoot: string
): Promise<{ buffer: Buffer } | { error: string }> {
  const result = await run(adbPath, ["-s", deviceId, "exec-out", "screencap", "-p"], {
    timeoutMs,
    cwd: projectRoot,
  });
  if (result.exitCode !== 0) {
    return { error: summarizeCommandFailure(result, "adb exec-out screencap failed.") };
  }
  if (isPngBuffer(result.stdout) !== true) {
    return { error: "adb exec-out screencap did not return PNG data." };
  }

  return { buffer: result.stdout };
}

async function captureWithFilePull(
  adbPath: string,
  deviceId: string,
  outputPath: string,
  run: CommandRunner,
  readLocalFile: FileReader,
  timeoutMs: number,
  projectRoot: string,
  timestamp: number
): Promise<{ buffer: Buffer } | { error: string }> {
  const remotePath = `/sdcard/hayalet-ev-debug-screenshot-${String(timestamp)}.png`;
  const captureResult = await run(adbPath, ["-s", deviceId, "shell", "screencap", remotePath], {
    timeoutMs,
    cwd: projectRoot,
  });
  if (captureResult.exitCode !== 0) {
    return {
      error: summarizeCommandFailure(captureResult, "adb shell screencap fallback failed."),
    };
  }

  const pullResult = await run(adbPath, ["-s", deviceId, "pull", remotePath, outputPath], {
    timeoutMs,
    cwd: projectRoot,
  });
  await run(adbPath, ["-s", deviceId, "shell", "rm", remotePath], {
    timeoutMs: Math.min(timeoutMs, 5_000),
    cwd: projectRoot,
  }).catch(() => undefined);
  if (pullResult.exitCode !== 0) {
    return { error: summarizeCommandFailure(pullResult, "adb pull screenshot fallback failed.") };
  }

  const buffer = await readLocalFile(outputPath);
  if (isPngBuffer(buffer) !== true) {
    return { error: "adb shell screencap fallback did not produce PNG data." };
  }

  return { buffer };
}

async function captureScreenshot(
  adbPath: string,
  deviceId: string,
  outputPath: string,
  strategy: "auto" | "exec-out" | "file-pull",
  run: CommandRunner,
  readLocalFile: FileReader,
  timeoutMs: number,
  projectRoot: string,
  timestamp: number
): Promise<ScreenshotCaptureResult | { error: ToolResult }> {
  if (strategy !== "file-pull") {
    const execOut = await captureWithExecOut(adbPath, deviceId, run, timeoutMs, projectRoot);
    if ("buffer" in execOut) {
      return {
        buffer: execOut.buffer,
        strategy: "exec-out",
        fallbackReason: null,
      };
    }

    if (strategy === "exec-out") {
      return {
        error: {
          content: [{ type: "text", text: execOut.error }],
          isError: true,
        },
      };
    }

    const fallback = await captureWithFilePull(
      adbPath,
      deviceId,
      outputPath,
      run,
      readLocalFile,
      timeoutMs,
      projectRoot,
      timestamp
    );
    if ("buffer" in fallback) {
      return {
        buffer: fallback.buffer,
        strategy: "file-pull",
        fallbackReason: execOut.error,
      };
    }

    return {
      error: {
        content: [{ type: "text", text: `${execOut.error}\nFallback failed: ${fallback.error}` }],
        isError: true,
      },
    };
  }

  const fallback = await captureWithFilePull(
    adbPath,
    deviceId,
    outputPath,
    run,
    readLocalFile,
    timeoutMs,
    projectRoot,
    timestamp
  );
  if ("buffer" in fallback) {
    return {
      buffer: fallback.buffer,
      strategy: "file-pull",
      fallbackReason: null,
    };
  }

  return {
    error: {
      content: [{ type: "text", text: fallback.error }],
      isError: true,
    },
  };
}

function formatDeviceSummary(devices: AndroidDeviceRecord[]): string {
  if (devices.length === 0) {
    return "none";
  }

  return devices
    .map((device) => `${device.id}:${device.state}${device.label !== "" ? ` ${device.label}` : ""}`)
    .join(", ");
}

export async function takeAndroidScreenshot(
  projectRoot: string,
  args: Record<string, unknown> = {}
): Promise<ToolResult> {
  const options = args as AndroidScreenshotArgs;
  const timeoutMs = normalizeTimeout(options.timeoutMs);
  const timestamp = typeof options._timestamp === "number" ? options._timestamp : Date.now();
  const effectiveProjectRoot = normalizeOptionalText(options._projectRoot) ?? projectRoot;
  const outputPath = resolveOutputPath(
    effectiveProjectRoot,
    normalizeOptionalText(options.savePath),
    timestamp
  );
  const run = options._runCommand ?? runCommand;
  const resolveAdb = options._resolveAdbPath ?? resolveAdbPath;
  const createDirectory =
    options._mkdir ??
    (async (directoryPath): Promise<void> => {
      await mkdir(directoryPath, { recursive: true });
    });
  const writeLocalFile = options._writeFile ?? writeFile;
  const readLocalFile = options._readFile ?? readFile;
  const removeLocalFile = options._unlink ?? unlink;
  const adbPath = await resolveAdb(options.adbPath, effectiveProjectRoot);

  if (adbPath === null) {
    return {
      content: [
        {
          type: "text",
          text: "ADB executable was not found. Install Android platform-tools, set ANDROID_HOME/ANDROID_SDK_ROOT, or pass adbPath.",
        },
      ],
      isError: true,
    };
  }

  await createDirectory(dirname(outputPath));

  const deviceResult = await resolveTargetDevice(
    adbPath,
    normalizeOptionalText(options.deviceId),
    run,
    timeoutMs,
    effectiveProjectRoot
  );
  if ("error" in deviceResult) {
    return deviceResult.error;
  }

  const capture = await captureScreenshot(
    adbPath,
    deviceResult.deviceId,
    outputPath,
    normalizeStrategy(options.strategy),
    run,
    readLocalFile,
    timeoutMs,
    effectiveProjectRoot,
    timestamp
  );
  if ("error" in capture) {
    await removeLocalFile(outputPath).catch(() => undefined);
    return capture.error;
  }

  if (capture.strategy === "exec-out") {
    await writeLocalFile(outputPath, capture.buffer);
  }

  const lines = [
    "✅ Android screenshot captured.",
    `Device: ${deviceResult.deviceId}`,
    `Strategy: ${capture.strategy}`,
    `Path: ${outputPath}`,
    `Bytes: ${String(capture.buffer.length)}`,
    `ADB: ${basename(adbPath)}`,
    `Devices: ${formatDeviceSummary(deviceResult.devices)}`,
  ];
  if (capture.fallbackReason !== null) {
    lines.push(`Fallback reason: ${capture.fallbackReason}`);
  }

  return {
    content: [
      {
        type: "text",
        text: lines.join("\n"),
      },
    ],
  };
}
