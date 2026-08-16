import { spawn } from "child_process";
import { constants as fsConstants } from "fs";
import { access } from "fs/promises";
import { basename, join } from "path";
import { normalizeModelLabel, normalizeText } from "./types-and-defaults.ts";
import type {
  CaptureAndroidDeviceStatus,
  CaptureAndroidDeviceConnectionState,
  CaptureAndroidHostState,
  CaptureAndroidPermissionState,
  CaptureAndroidPermissionStatus,
  CaptureAndroidCompanionState,
  CaptureAndroidStatus,
  CaptureAnalyzePreviewVideoStatus,
} from "../../src/types/capture.ts";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export const CAPTURE_ADB_TIMEOUT_MS = 300_000;
export const CAPTURE_ADB_SHUTDOWN_TIMEOUT_MS = 5_000;
export const CAPTURE_SCRCPY_CAMERA_FPS = 30;
export const CAPTURE_SCRCPY_V4L2_LABEL = "Hayalet Ev Camera Feed";
export const CAPTURE_SCRCPY_V4L2_DEFAULT_DEVICE = "/dev/video42";
export const CAPTURE_SCRCPY_V4L2_ENV_DEVICE = "HAYALET_SCRCPY_V4L2_DEVICE";

export let adbServerTouchedByCaptureService = false;

export function resetAdbServerTouched(): void {
  adbServerTouchedByCaptureService = false;
}

export function setAdbServerTouched(): void {
  adbServerTouchedByCaptureService = true;
}

function normalizeCommandChunk(chunk: Buffer | string): string {
  return typeof chunk === "string" ? chunk : chunk.toString("utf8");
}

export async function isExecutable(filePath: string | null): Promise<boolean> {
  if (filePath === null) {
    return false;
  }

  try {
    await access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function hasReadWriteAccess(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.R_OK | fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function parseV4l2DeviceForLabel(output: string, label: string): string | null {
  const lines = output.split(/\r?\n/);
  const normalizedLabel = label.toLowerCase();
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.toLowerCase().includes(normalizedLabel) !== true) {
      continue;
    }

    for (let deviceIndex = index + 1; deviceIndex < lines.length; deviceIndex += 1) {
      const line = lines[deviceIndex] ?? "";
      if (line.trim() === "") {
        break;
      }

      const match = line.match(/\/dev\/video\d+/);
      if (match !== null) {
        return match[0];
      }
    }
  }

  return null;
}

export function buildScrcpyV4l2SetupHint(): string {
  return "npm run capture:v4l2:setup";
}

export async function resolveScrcpyV4l2Sink(): Promise<
  { ok: true; previewVideo: CaptureAnalyzePreviewVideoStatus } | { ok: false; message: string }
> {
  if (process.platform !== "linux") {
    return {
      ok: false,
      message: "Embedded Scrcpy camera feed requires Linux v4l2loopback.",
    };
  }

  const configuredDevice = normalizeText(process.env[CAPTURE_SCRCPY_V4L2_ENV_DEVICE]);
  const candidates: string[] = [];
  if (configuredDevice !== null) {
    candidates.push(configuredDevice);
  }

  const v4l2CtlPath = await resolveExecutableOnPath("v4l2-ctl");
  if (v4l2CtlPath !== null) {
    const result = await runCommand(v4l2CtlPath, ["--list-devices"], 5_000).catch(() => null);
    const listedDevice =
      result !== null && result.exitCode === 0
        ? parseV4l2DeviceForLabel(result.stdout, CAPTURE_SCRCPY_V4L2_LABEL)
        : null;
    if (listedDevice !== null) {
      candidates.push(listedDevice);
    }
  }
  candidates.push(CAPTURE_SCRCPY_V4L2_DEFAULT_DEVICE);

  const accessibleCandidates = await Promise.all(
    [...new Set(candidates)].map(async (candidate) => ({
      candidate,
      accessible: await hasReadWriteAccess(candidate),
    }))
  );
  const selectedCandidate =
    accessibleCandidates.find((candidate) => candidate.accessible === true)?.candidate ?? null;
  if (selectedCandidate !== null) {
    return {
      ok: true,
      previewVideo: {
        source: "v4l2",
        devicePath: selectedCandidate,
        label: CAPTURE_SCRCPY_V4L2_LABEL,
        width: 640,
        height: 480,
        fps: CAPTURE_SCRCPY_CAMERA_FPS,
      },
    };
  }

  const expectedDevice = configuredDevice ?? CAPTURE_SCRCPY_V4L2_DEFAULT_DEVICE;
  return {
    ok: false,
    message: `Scrcpy v4l2 camera device is not ready at ${expectedDevice}. Run: ${buildScrcpyV4l2SetupHint()}`,
  };
}

export async function resolveExecutableOnPath(executableName: string): Promise<string | null> {
  const direct = normalizeText(executableName);
  if (direct === null) {
    return null;
  }

  if (direct.includes("/") || direct.includes("\\")) {
    return (await isExecutable(direct)) ? direct : null;
  }

  const pathEntries = (process.env["PATH"] ?? "")
    .split(process.platform === "win32" ? ";" : ":")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");

  const extensions = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
  const candidates = pathEntries.flatMap((entry) =>
    extensions.map((extension) => join(entry, `${direct}${extension}`))
  );
  const executableChecks = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      executable: await isExecutable(candidate),
    }))
  );

  return executableChecks.find((result) => result.executable)?.candidate ?? null;
}

export function isAdbExecutablePath(command: string): boolean {
  const executableName = basename(command).toLowerCase();
  return executableName === "adb" || executableName === "adb.exe";
}

export async function runCommand(
  command: string,
  args: string[],
  timeoutMs = CAPTURE_ADB_TIMEOUT_MS,
  options?: { cwd?: string; env?: NodeJS.ProcessEnv; stdio?: "pipe" | "inherit" }
): Promise<CommandResult> {
  if (isAdbExecutablePath(command)) {
    adbServerTouchedByCaptureService = true;
  }

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options?.stdio === "inherit" ? "inherit" : ["ignore", "pipe", "pipe"],
      env: options?.env ?? process.env,
      cwd: options?.cwd,
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

    if (child.stdout) {
      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += normalizeCommandChunk(chunk);
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += normalizeCommandChunk(chunk);
      });
    }

    child.on("error", (error) => {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    });

    child.on("close", (exitCode) => {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      if (settled) {
        return;
      }
      settled = true;
      resolve({
        exitCode: typeof exitCode === "number" ? exitCode : -1,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}

export async function shutdownAdbServerIfTouched(
  resolveAdbPath: () => Promise<string | null> = async () => await resolveExecutableOnPath("adb")
): Promise<void> {
  if (adbServerTouchedByCaptureService !== true) {
    return;
  }

  const adbPath = await resolveAdbPath();
  if (adbPath === null) {
    adbServerTouchedByCaptureService = false;
    return;
  }

  const result = await runCommand(adbPath, ["kill-server"], CAPTURE_ADB_SHUTDOWN_TIMEOUT_MS);
  adbServerTouchedByCaptureService = false;
  if (result.exitCode !== 0) {
    throw new Error(
      normalizeText(result.stderr) ?? normalizeText(result.stdout) ?? "ADB server cleanup failed."
    );
  }
}

export async function runStreamingCommand(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    onStdoutLine?: (line: string) => void;
    onStderrLine?: (line: string) => void;
  }
): Promise<CommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: options?.env ?? process.env,
      cwd: options?.cwd,
    });
    const stdoutStream = child.stdout;
    const stderrStream = child.stderr;

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let stdoutBuffer = "";
    let stderrBuffer = "";

    const flushLines = (
      buffer: string,
      callback?: (line: string) => void
    ): { nextBuffer: string; emitted: string[] } => {
      const parts = buffer.split(/\r?\n/);
      const nextBuffer = parts.pop() ?? "";
      const emitted = parts.map((line) => line.trim()).filter((line) => line !== "");
      emitted.forEach((line) => callback?.(line));
      return { nextBuffer, emitted };
    };

    const timeoutMs = options?.timeoutMs ?? CAPTURE_ADB_TIMEOUT_MS;
    const timeoutId =
      timeoutMs > 0
        ? globalThis.setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, timeoutMs)
        : null;

    stdoutStream.on("data", (chunk: Buffer | string) => {
      const text = normalizeCommandChunk(chunk);
      stdout += text;
      stdoutBuffer += text;
      const flushed = flushLines(stdoutBuffer, options?.onStdoutLine);
      stdoutBuffer = flushed.nextBuffer;
    });

    stderrStream.on("data", (chunk: Buffer | string) => {
      const text = normalizeCommandChunk(chunk);
      stderr += text;
      stderrBuffer += text;
      const flushed = flushLines(stderrBuffer, options?.onStderrLine);
      stderrBuffer = flushed.nextBuffer;
    });

    child.on("error", (error) => {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    });

    child.on("close", (exitCode) => {
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
      if (settled) {
        return;
      }
      settled = true;
      const trailingStdout = stdoutBuffer.trim();
      const trailingStderr = stderrBuffer.trim();
      if (trailingStdout !== "") {
        options?.onStdoutLine?.(trailingStdout);
      }
      if (trailingStderr !== "") {
        options?.onStderrLine?.(trailingStderr);
      }
      resolve({
        exitCode: typeof exitCode === "number" ? exitCode : -1,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}

export function parsePermissionState(rawValue: string | null): CaptureAndroidPermissionState {
  if (rawValue === "true") {
    return "granted";
  }
  if (rawValue === "false") {
    return "denied";
  }
  return "unknown";
}

export function createUnknownPermissions(): CaptureAndroidPermissionStatus {
  return {
    camera: "unknown",
    microphone: "unknown",
  };
}

export function parseAdbDeviceList(output: string): CaptureAndroidDeviceStatus[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && line !== "List of devices attached")
    .map((line): CaptureAndroidDeviceStatus | null => {
      const [deviceIdRaw, connectionStateRaw, ...details] = line.split(/\s+/);
      const deviceId = normalizeText(deviceIdRaw);
      if (deviceId === null) {
        return null;
      }

      const modelToken = details.find((token) => token.startsWith("model:")) ?? null;
      const model = normalizeModelLabel(modelToken?.slice("model:".length) ?? null);
      const connectionStateToken = connectionStateRaw ?? "";
      const connectionState = ((): CaptureAndroidDeviceConnectionState => {
        switch (connectionStateToken) {
          case "device":
            return "device";
          case "unauthorized":
            return "unauthorized";
          case "offline":
            return "offline";
          default:
            return "unknown";
        }
      })();

      return {
        deviceId,
        label: model ?? deviceId,
        model,
        transport: deviceId.includes(":")
          ? "wireless"
          : details.some((token) => token.startsWith("usb:"))
            ? "usb"
            : "unknown",
        connectionState,
        selected: false,
        companionState: "unknown",
        companionVersion: null,
        bridgeState: "waiting",
        permissions: createUnknownPermissions(),
      };
    })
    .filter((entry): entry is CaptureAndroidDeviceStatus => entry !== null);
}

export function determineHostState(devices: CaptureAndroidDeviceStatus[]): CaptureAndroidHostState {
  if (devices.length === 0) {
    return "no-devices";
  }

  const readyDevices = devices.filter((device) => device.connectionState === "device");
  if (readyDevices.length > 1) {
    return "multiple-devices";
  }
  if (readyDevices.length === 1) {
    return "ready";
  }
  if (devices.some((device) => device.connectionState === "unauthorized")) {
    return "unauthorized";
  }
  if (devices.some((device) => device.connectionState === "offline")) {
    return "offline";
  }
  return "error";
}

export function selectReadyDevice(
  devices: CaptureAndroidDeviceStatus[],
  preferredDeviceId: string | null
): CaptureAndroidDeviceStatus | null {
  const readyDevices = devices.filter((device) => device.connectionState === "device");
  if (readyDevices.length === 0) {
    return null;
  }

  if (preferredDeviceId !== null) {
    const preferredDevice =
      readyDevices.find((device) => device.deviceId === preferredDeviceId) ?? null;
    if (preferredDevice !== null) {
      return preferredDevice;
    }
  }

  return readyDevices.length === 1 ? (readyDevices[0] ?? null) : null;
}

export function buildHostMessage(hostState: CaptureAndroidHostState): string | null {
  switch (hostState) {
    case "checking":
      return "Inspecting the Android capture bridge.";
    case "missing-adb":
      return "ADB is not available on PATH yet.";
    case "no-devices":
      return "No Android devices are connected through USB or wireless ADB.";
    case "ready":
      return "Android bridge is ready for one device.";
    case "multiple-devices":
      return "More than one ready Android device is connected. Choose the active phone in Settings > Capture.";
    case "unauthorized":
      return "At least one Android device is waiting for ADB authorization.";
    case "offline":
      return "A previously connected Android device is currently offline.";
    case "reverse-conflict":
      return "ADB reverse is not aligned with the desktop bridge port.";
    case "package-query-failed":
      return "The Android companion package could not be inspected on the selected device.";
    case "error":
      return "Android device inspection failed.";
    default:
      return null;
  }
}

export async function inspectCompanionState(
  adbPath: string,
  deviceId: string,
  expectedVersion: string | null,
  companionPackage: string
): Promise<{
  state: CaptureAndroidCompanionState;
  version: string | null;
  packageQueryFailed: boolean;
}> {
  const installCheck = await runCommand(adbPath, [
    "-s",
    deviceId,
    "shell",
    "pm",
    "path",
    companionPackage,
  ]);

  if (installCheck.exitCode !== 0) {
    return { state: "unknown", version: null, packageQueryFailed: true };
  }

  if (installCheck.stdout.includes("package:") === false) {
    return { state: "not-installed", version: null, packageQueryFailed: false };
  }

  const versionCheck = await runCommand(adbPath, [
    "-s",
    deviceId,
    "shell",
    "dumpsys",
    "package",
    companionPackage,
  ]);

  if (versionCheck.exitCode !== 0) {
    return { state: "installed", version: null, packageQueryFailed: true };
  }

  const versionMatch = versionCheck.stdout.match(/versionName=([^\s]+)/);
  const version = versionMatch?.[1] ?? null;
  const state =
    expectedVersion !== null && version !== null && version !== expectedVersion
      ? "outdated"
      : "installed";

  return {
    state,
    version,
    packageQueryFailed: false,
  };
}

export async function inspectCompanionPermissions(
  adbPath: string,
  deviceId: string,
  companionPackage: string
): Promise<CaptureAndroidPermissionStatus> {
  const packageDump = await runCommand(adbPath, [
    "-s",
    deviceId,
    "shell",
    "dumpsys",
    "package",
    companionPackage,
  ]).catch(() => null);
  if (packageDump?.exitCode !== 0) {
    return createUnknownPermissions();
  }

  const cameraMatch = packageDump.stdout.match(
    /android\.permission\.CAMERA:[\s\S]*?granted=(true|false)/
  );
  const micMatch = packageDump.stdout.match(
    /android\.permission\.RECORD_AUDIO:[\s\S]*?granted=(true|false)/
  );
  return {
    camera: parsePermissionState(cameraMatch?.[1] ?? null),
    microphone: parsePermissionState(micMatch?.[1] ?? null),
  };
}

export async function inspectReverseState(
  adbPath: string,
  deviceId: string,
  bridgePort: number
): Promise<CaptureAndroidStatus["reverseState"]> {
  const reverseResult = await runCommand(adbPath, ["-s", deviceId, "reverse", "--list"]).catch(
    () => null
  );
  if (reverseResult?.exitCode !== 0) {
    return "error";
  }

  const target = `tcp:${String(bridgePort)}`;
  const lines = reverseResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const relevantLine = lines.find((line) => line.includes(target)) ?? null;
  if (relevantLine === null) {
    return "not-configured";
  }

  if (relevantLine.endsWith(`${target} ${target}`)) {
    return "ready";
  }

  return "conflict";
}

export async function inspectReadyDeviceDetails(
  adbPath: string,
  device: CaptureAndroidDeviceStatus,
  expectedVersion: string | null,
  companionPackage: string,
  activeBridgeSession: { deviceId: string } | null
): Promise<{
  device: CaptureAndroidDeviceStatus;
  packageQueryFailed: boolean;
}> {
  const companion = await inspectCompanionState(
    adbPath,
    device.deviceId,
    expectedVersion,
    companionPackage
  ).catch(() => ({
    state: "unknown" as CaptureAndroidCompanionState,
    version: null,
    packageQueryFailed: true,
  }));

  const permissions =
    companion.state === "not-installed"
      ? createUnknownPermissions()
      : await inspectCompanionPermissions(adbPath, device.deviceId, companionPackage);

  return {
    device: {
      ...device,
      companionState: companion.state,
      companionVersion: companion.version,
      bridgeState: activeBridgeSession !== null ? "connected" : "waiting",
      permissions,
    },
    packageQueryFailed: companion.packageQueryFailed,
  };
}
