import { execFile, spawn } from "child_process";
import { existsSync } from "fs";
import { delimiter, extname, join } from "path";
import { logToolError as _logToolError } from "../../utils/mcp-logger.js";
import { FS_TIMEOUTS } from "@timeouts";
import { checkGitLock, removeStaleLock } from "../../utils/git-utils.js";
import { createMcpTranslator, createMcpTranslatorSync } from "../../utils/i18n/index.js";
import type { TranslationParams } from "../../../src/types/i18n.js";

interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  pid?: number;
  timedOut?: boolean;
  success?: boolean;
}

interface BashExecutionOptions {
  detachLongRunning?: boolean;
  foregroundWaitMs?: number;
}

type McpTranslator = (key: string, params?: TranslationParams) => string;

const bashToolDefinitionTranslator = createMcpTranslatorSync();
const MCP_TRANSPORT_TIMEOUT_GUARD_MS = 5_000;
const MCP_TOOL_FOREGROUND_TIMEOUT_CEILING_MS = 300_000 - MCP_TRANSPORT_TIMEOUT_GUARD_MS;
const TIMEOUT_FORCE_KILL_GRACE_MS = 2_000;
const DEFAULT_FOREGROUND_COMMAND_PREFIXES = [
  "npm run scripts:typecheck",
  "npm run typecheck",
  "npm run check-types",
  "npm run mcp:build",
  "npm run mcp:check",
  "npm run mcp:test",
  "npm run rooms:typecheck",
  "npm run rooms:check",
  "npm run rooms:test",
  "npx tsc",
  "tsc",
] as const;

function bashT(t: McpTranslator, key: string, params?: TranslationParams): string {
  return t(`mcpServer.fs.bash.${key}`, params);
}

function bashToolDefinitionT(key: string): string {
  return bashToolDefinitionTranslator(`mcpServer.fs.toolDefinitions.${key}`);
}

function chunkToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf-8");
  return String(data);
}

function resolveExecutableOnPath(executableName: string): string | null {
  const extensions =
    process.platform === "win32" && extname(executableName) === ""
      ? ["", ".exe", ".cmd", ".bat"]
      : [""];
  const pathEntries = (process.env["PATH"] ?? "")
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");

  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = join(entry, `${executableName}${extension}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function resolveShellInvocation(command: string): { command: string; args: string[] } {
  if (process.platform !== "win32") {
    return { command: "bash", args: ["-c", command] };
  }

  const bashPath = resolveExecutableOnPath("bash");
  if (bashPath !== null) {
    return { command: bashPath, args: ["-c", command] };
  }

  const powershellPath =
    resolveExecutableOnPath("powershell.exe") ?? resolveExecutableOnPath("pwsh");
  if (powershellPath !== null) {
    return {
      command: powershellPath,
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    };
  }

  return { command: process.env["ComSpec"] ?? "cmd.exe", args: ["/d", "/s", "/c", command] };
}

function normalizeTimeout(timeout: number): number {
  if (Number.isFinite(timeout) === false || timeout <= 0) {
    return FS_TIMEOUTS.BASH_DEFAULT;
  }
  return Math.floor(timeout);
}

export function shouldKeepCommandForegroundByDefault(command: string): boolean {
  const normalizedCommand = command.trim().replace(/\s+/g, " ");
  return DEFAULT_FOREGROUND_COMMAND_PREFIXES.some(
    (prefix) => normalizedCommand === prefix || normalizedCommand.startsWith(`${prefix} `)
  );
}

function resolveEffectiveTimeout(timeout: number, detachLongRunning: boolean): number {
  const normalizedTimeout = normalizeTimeout(timeout);
  if (detachLongRunning) {
    return normalizedTimeout;
  }
  return Math.min(normalizedTimeout, MCP_TOOL_FOREGROUND_TIMEOUT_CEILING_MS);
}

function terminateProcessTree(pid: number | undefined, signal: NodeJS.Signals): void {
  if (typeof pid !== "number") return;

  if (process.platform === "win32") {
    const args = ["/PID", String(pid), "/T"];
    if (signal === "SIGKILL") {
      args.push("/F");
    }
    execFile("taskkill.exe", args, { windowsHide: true }, () => undefined);
    return;
  }

  try {
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Process already exited.
    }
  }
}

export async function executeBash(
  command: string | number,
  workspacePath: string,
  timeout?: number,
  options: BashExecutionOptions = {}
): Promise<BashResult> {
  const t = await createMcpTranslator();
  return await new Promise((resolve) => {
    if (typeof command === "number") {
      resolve({
        stdout: "",
        stderr: bashT(t, "pidLogsUnsupported"),
        exitCode: 1,
      });
      return;
    }

    const isBackground = command.trim().endsWith("&");
    const actualCommand = isBackground ? command.slice(0, -1).trim() : command;

    const isGitCommand = actualCommand.trim().startsWith("git ");
    if (isGitCommand) {
      try {
        const lockCheck = checkGitLock(workspacePath);
        if (lockCheck.hasLock && lockCheck.isStale) {
          process.stderr.write(
            `[BASH] ${bashT(t, "staleGitLockDetected", { ageMinutes: lockCheck.ageMinutes ?? 0 })}\n`
          );
          removeStaleLock(workspacePath);
        }
      } catch (lockError: unknown) {
        interface ErrorWithMessage {
          message?: string;
        }
        process.stderr.write(
          `[BASH] ${bashT(t, "gitLockCheckFailed", {
            message: (lockError as ErrorWithMessage).message ?? bashT(t, "unknown"),
          })}\n`
        );
      }
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const maxOutput = 50000;
    const keepForegroundByDefault = shouldKeepCommandForegroundByDefault(actualCommand);
    const detachLongRunning = options.detachLongRunning ?? !keepForegroundByDefault;
    const requestedTimeout =
      timeout ?? (detachLongRunning ? FS_TIMEOUTS.BASH_DEFAULT : MCP_TOOL_FOREGROUND_TIMEOUT_CEILING_MS);
    const effectiveTimeout = resolveEffectiveTimeout(requestedTimeout, detachLongRunning);
    const foregroundWaitMs =
      options.foregroundWaitMs ?? Math.min(Math.max(effectiveTimeout - 1_000, 1_000), 8_000);
    let forceKillTimeoutId: NodeJS.Timeout | null = null;

    const shellInvocation = resolveShellInvocation(actualCommand);
    const child = spawn(shellInvocation.command, shellInvocation.args, {
      cwd: workspacePath,
      detached: process.platform !== "win32",
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    function appendOutput(current: string, data: unknown): string {
      const next = current + chunkToString(data);
      return next.length > maxOutput ? next.slice(0, maxOutput) : next;
    }

    function resolveOnce(result: BashResult): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (forceKillTimeoutId !== null) clearTimeout(forceKillTimeoutId);
      if (foregroundWaitId !== null) clearTimeout(foregroundWaitId);
      resolve(result);
    }

    const timeoutId = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child.pid, "SIGTERM");
      forceKillTimeoutId = setTimeout(() => {
        terminateProcessTree(child.pid, "SIGKILL");
      }, TIMEOUT_FORCE_KILL_GRACE_MS);
    }, effectiveTimeout);

    const foregroundWaitId =
      detachLongRunning === true
        ? setTimeout(() => {
            if (isBackground) return;
            child.stdout.pause();
            child.stderr.pause();
            child.unref();
            resolveOnce({
              stdout:
                `${bashT(t, "backgroundStarted")}\n` +
                `PID: ${child.pid ?? "unknown"}\n` +
                "Command is still running; use a normal terminal for long foreground output.",
              stderr,
              exitCode: 0,
              ...(typeof child.pid === "number" ? { pid: child.pid } : {}),
              success: true,
            });
          }, foregroundWaitMs)
        : null;

    child.stdout.on("data", (data: unknown) => {
      stdout = appendOutput(stdout, data);
    });

    child.stderr.on("data", (data: unknown) => {
      stderr = appendOutput(stderr, data);
    });

    child.on("close", (code) => {
      const truncatedStdout =
        stdout.length >= maxOutput
          ? `${stdout}\n... ${bashT(t, "truncated", { count: "unknown" })}`
          : stdout;
      const truncatedStderr =
        stderr.length >= maxOutput
          ? `${stderr}\n... ${bashT(t, "truncated", { count: "unknown" })}`
          : stderr;

      resolveOnce({
        stdout: truncatedStdout,
        stderr: truncatedStderr,
        exitCode: timedOut ? 124 : (code ?? 1),
        ...(typeof child.pid === "number" ? { pid: child.pid } : {}),
        timedOut,
      });
    });

    child.on("error", (err) => {
      resolveOnce({
        stdout,
        stderr: err.message,
        exitCode: 1,
      });
    });

    if (isBackground) {
      setTimeout(() => {
        child.stdout.pause();
        child.stderr.pause();
        child.unref();
        resolveOnce({
          stdout: bashT(t, "backgroundStarted"),
          stderr: "",
          exitCode: 0,
          ...(typeof child.pid === "number" ? { pid: child.pid } : {}),
        });
      }, 100);
    }
  });
}

export const BASH_EXECUTOR_TOOL = {
  name: "hev_fs_bash",
  description: bashToolDefinitionT("bash.description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      command: { type: "string", description: bashToolDefinitionT("bash.command") },
      timeout: { type: "integer", description: bashToolDefinitionT("bash.timeout") },
    },
    required: ["command"],
  },
  metadata: {
    category: "filesystem",
    subcategory: "bash",
  },
};
