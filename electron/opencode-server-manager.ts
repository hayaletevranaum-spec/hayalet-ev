import type { ChildProcess } from "child_process";
import { execFile, spawn } from "child_process";
import { existsSync } from "fs";
import * as net from "net";
import { dirname, extname, join } from "path";
import { getLoggerCore } from "./logger/index.js";
import { Paths } from "./paths.ts";
import { LogCategory, LogLevel } from "../src/types/logging-core.js";
import type { ServerOptions, ServerInfo, ServerBinaryInfo } from "./types/server.ts";
import { SERVER_TIMEOUTS } from "@timeouts";
import { translateElectronMessage } from "./i18n/language-service.ts";

const logger = getLoggerCore();
const OPENCODE_COMMAND = "opencode";
const WINDOWS_PATH_PATTERN = /^[A-Za-z]:[\\/]/;
const WINDOWS_CMD_EXTENSIONS = new Set([".cmd", ".bat"]);
const WINDOWS_POWERSHELL_EXTENSIONS = new Set([".ps1"]);

interface SpawnCommandSpec {
  command: string;
  args: string[];
  shell: boolean;
}

function chunkToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf-8");
  return String(data);
}

function quoteWindowsCommandArg(value: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '\\"')}"`;
}

export class OpenCodeServerManager {
  private process: ChildProcess | null = null;
  private currentPort: number | null = null;
  private startTime: number | null = null;
  private usingExternalServer = false;

  private getWorkspacePath(): string | undefined {
    const workspacePath = Paths.getProjectRoot().trim();
    return workspacePath !== "" ? workspacePath : undefined;
  }

  private parseVersion(raw: string): string | undefined {
    const output = raw.trim();
    if (output === "") return undefined;
    const match = output.match(/\b(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/);
    return match?.[1];
  }

  private parseBinaryLocatorOutput(raw: string): string | undefined {
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== "");

    const candidates = lines.filter(
      (line) => line.startsWith("/") || line.startsWith("\\\\") || WINDOWS_PATH_PATTERN.test(line)
    );

    if (process.platform !== "win32") {
      return candidates[0];
    }

    const resolvedCandidates = candidates.map((candidate) =>
      this.resolveWindowsShimExecutable(candidate)
    );

    return (
      resolvedCandidates.find((line) => extname(line).toLowerCase() === ".exe") ??
      resolvedCandidates.find((line) =>
        [".cmd", ".bat", ".ps1"].includes(extname(line).toLowerCase())
      ) ??
      candidates[0]
    );
  }

  private resolveWindowsShimExecutable(candidate: string): string {
    if (process.platform !== "win32") return candidate;
    const extension = extname(candidate).toLowerCase();
    if (
      extension !== "" &&
      !WINDOWS_CMD_EXTENSIONS.has(extension) &&
      !WINDOWS_POWERSHELL_EXTENSIONS.has(extension)
    ) {
      return candidate;
    }

    const npmGlobalPackageExecutable = join(
      dirname(candidate),
      "node_modules",
      "opencode-ai",
      "bin",
      "opencode.exe"
    );
    return existsSync(npmGlobalPackageExecutable) ? npmGlobalPackageExecutable : candidate;
  }

  private isMissingCommandProbe(result: {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    error?: string;
  }): boolean {
    const combinedOutput = `${result.stdout}\n${result.stderr}`.trim();
    if (typeof result.error === "string" && /ENOENT|not found/i.test(result.error)) {
      return true;
    }
    if (result.exitCode === 127) {
      return true;
    }
    return /\b(command not found|not found)\b/i.test(combinedOutput);
  }

  private async runCommandCapture(
    command: string,
    args: string[],
    timeoutMs = 3000,
    env?: NodeJS.ProcessEnv
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string; error?: string }> {
    return await new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const finish = (payload: {
        exitCode: number | null;
        stdout: string;
        stderr: string;
        error?: string;
      }): void => {
        if (settled) return;
        settled = true;
        if (timer !== null) {
          clearTimeout(timer);
        }
        resolve(payload);
      };

      const commandSpec = this.buildSpawnCommand(command, args);
      const child = spawn(commandSpec.command, commandSpec.args, {
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
        shell: commandSpec.shell,
        ...(env !== undefined ? { env } : {}),
      });

      child.stdout.on("data", (data: unknown) => {
        stdout += chunkToString(data);
      });

      child.stderr.on("data", (data: unknown) => {
        stderr += chunkToString(data);
      });

      child.once("error", (error: Error) => {
        finish({
          exitCode: null,
          stdout,
          stderr,
          error: error.message,
        });
      });

      child.once("close", (code: number | null) => {
        finish({
          exitCode: code,
          stdout,
          stderr,
        });
      });

      timer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {}
        finish({
          exitCode: null,
          stdout,
          stderr,
          error: "Command timeout",
        });
      }, timeoutMs);
    });
  }

  private async runInteractiveShellCapture(
    command: string,
    timeoutMs = 3000
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string; error?: string }> {
    const shellEnv = {
      ...process.env,
      TERM: process.env["TERM"] ?? "dumb",
    };

    return await this.runCommandCapture("bash", ["-ic", command], timeoutMs, shellEnv);
  }

  private async resolveBinaryPath(command: string): Promise<string | undefined> {
    if (process.platform === "win32") {
      const whereResult = await this.runCommandCapture("where", [command], 1800);
      if (whereResult.exitCode === 0) {
        return this.parseBinaryLocatorOutput(whereResult.stdout);
      }
      return undefined;
    }

    const whichResult = await this.runCommandCapture("which", [command], 1800);
    if (whichResult.exitCode === 0) {
      const detectedPath = this.parseBinaryLocatorOutput(whichResult.stdout);
      if (detectedPath !== undefined) {
        return detectedPath;
      }
    }

    const shellResult = await this.runInteractiveShellCapture(`command -v ${command}`, 2200);
    if (shellResult.exitCode === 0) {
      return this.parseBinaryLocatorOutput(shellResult.stdout);
    }

    return undefined;
  }

  private buildSpawnCommand(command: string, args: string[]): SpawnCommandSpec {
    if (process.platform !== "win32") {
      return { command, args, shell: false };
    }

    const extension = extname(command).toLowerCase();
    if (WINDOWS_CMD_EXTENSIONS.has(extension)) {
      const commandLine = [
        quoteWindowsCommandArg(command),
        ...args.map(quoteWindowsCommandArg),
      ].join(" ");
      return {
        command: "cmd.exe",
        args: ["/d", "/s", "/c", commandLine],
        shell: false,
      };
    }

    if (WINDOWS_POWERSHELL_EXTENSIONS.has(extension)) {
      return {
        command: "powershell.exe",
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", command, ...args],
        shell: false,
      };
    }

    return { command, args, shell: false };
  }

  private async killWindowsProcessTree(pid: number): Promise<void> {
    if (process.platform !== "win32") return;
    await new Promise<void>((resolve) => {
      execFile("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => {
        resolve();
      });
    });
  }

  async diagnoseBinary(): Promise<ServerBinaryInfo> {
    const command = OPENCODE_COMMAND;
    const resolvedPath = await this.resolveBinaryPath(command);
    const probeCommand = resolvedPath ?? command;
    const versionProbe = await this.runCommandCapture(
      probeCommand,
      ["--version"],
      SERVER_TIMEOUTS.BINARY_PROBE
    );
    let probeResult = versionProbe;

    if (process.platform !== "win32" && this.isMissingCommandProbe(versionProbe)) {
      probeResult = await this.runInteractiveShellCapture(
        `exec ${OPENCODE_COMMAND} --version`,
        SERVER_TIMEOUTS.BINARY_PROBE
      );
    }

    const combinedOutput = `${probeResult.stdout}\n${probeResult.stderr}`.trim();

    if (probeResult.error !== undefined) {
      return {
        available: false,
        command,
        error: probeResult.error,
      };
    }

    if (probeResult.exitCode !== 0) {
      return {
        available: false,
        command,
        error: combinedOutput !== "" ? combinedOutput : `Exit code ${String(probeResult.exitCode)}`,
      };
    }

    const version = this.parseVersion(combinedOutput);
    return {
      available: true,
      command,
      ...(version !== undefined ? { version } : {}),
      ...(resolvedPath !== undefined ? { resolvedPath } : {}),
    };
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return await new Promise((resolve) => {
      const server = net.createServer();

      server.once("error", () => {
        resolve(false);
      });

      server.once("listening", () => {
        server.close();
        resolve(true);
      });

      server.listen(port, "127.0.0.1");
    });
  }

  async findAvailablePort(start = 4096, end = 4110): Promise<number | null> {
    const find = async (port: number): Promise<number | null> => {
      if (port > end) return null;
      return (await this.isPortAvailable(port)) ? port : await find(port + 1);
    };
    return await find(start);
  }

  // NOTE: Searches for a running OpenCode server within the port range.
  // NOTE: Verifies whether each occupied port is a real OpenCode server by running a health check.
  async findRunningServer(start = 4096, end = 4110): Promise<ServerInfo> {
    const find = async (port: number): Promise<ServerInfo> => {
      if (port > end) return { running: false };

      const portInUse = !(await this.isPortAvailable(port));
      if (!portInUse) {
        return await find(port + 1);
      }

      try {
        const healthResult = await this.checkHealth(`http://127.0.0.1:${port}/global/health`);
        if (healthResult.success) {
          const workspacePath = this.getWorkspacePath();
          await logger.logInternalT(
            LogCategory.MAIN,
            LogLevel.INFO,
            "electron.opencodeServer.logs.foundExistingServer",
            { port },
            { port }
          );
          return {
            running: true,
            port,
            url: `http://127.0.0.1:${port}`,
            ...(workspacePath !== undefined ? { workspacePath } : {}),
            source: "existing",
          };
        }
      } catch {}

      return await find(port + 1);
    };

    return await find(start);
  }

  async start(options: ServerOptions = {}): Promise<ServerInfo> {
    // NOTE: Fail when a process started by this manager is already running.
    if (this.process !== null) {
      throw new Error(
        await translateElectronMessage("electron.opencodeServer.serverAlreadyRunning")
      );
    }

    // NOTE: First, look for a running server in the port range.
    const existing = await this.findRunningServer(options.port ?? 4096, options.port ?? 4110);
    if (existing.running === true && existing.port != null) {
      await logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.INFO,
        "electron.opencodeServer.logs.reusingExistingServer",
        { port: existing.port },
        { port: existing.port }
      );
      this.currentPort = existing.port;
      this.usingExternalServer = true;
      return {
        ...existing,
        alreadyRunning: true,
        source: "existing",
      };
    }

    let port: number;
    if (options.port !== undefined) {
      const available = await this.isPortAvailable(options.port);
      if (!available) {
        throw new Error(
          await translateElectronMessage("electron.opencodeServer.portAlreadyInUse", {
            port: options.port,
          })
        );
      }
      port = options.port;
    } else {
      const foundPort = await this.findAvailablePort();
      if (foundPort === null) {
        throw new Error(
          await translateElectronMessage("electron.opencodeServer.noAvailablePortFound")
        );
      }
      port = foundPort;
    }

    const binaryCommand = OPENCODE_COMMAND;
    const binaryInfo = await this.diagnoseBinary();
    if (!binaryInfo.available) {
      throw new Error(
        await translateElectronMessage("electron.opencodeServer.binaryCheckFailed", {
          command: binaryCommand,
          message: binaryInfo.error ?? "unknown error",
        })
      );
    }
    const binaryExecutable = binaryInfo.resolvedPath ?? binaryInfo.command;

    const args = ["serve", "--port", String(port), "--hostname", "127.0.0.1"];

    const cors = options.cors ?? ["http://localhost:5174"];
    cors.forEach((origin) => {
      args.push("--cors", origin);
    });

    const workspacePath = this.getWorkspacePath();
    if (workspacePath !== undefined) {
      args.push(workspacePath);
    }

    await logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.INFO,
      "electron.opencodeServer.logs.startingServe",
      { port },
      {
        port,
        binaryCommand,
        binaryExecutable,
        workspacePath: workspacePath ?? null,
        args,
      }
    );

    const childEnv = { ...process.env };
    delete childEnv["CDP_PORT"];
    delete childEnv["NODE_OPTIONS"];
    delete childEnv["NODE_INSPECT_RESUME_ON_START"];

    const commandSpec = this.buildSpawnCommand(binaryExecutable, args);
    this.process = spawn(commandSpec.command, commandSpec.args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: childEnv,
      shell: commandSpec.shell,
      ...(workspacePath !== undefined ? { cwd: workspacePath } : {}),
    });

    this.currentPort = port;
    this.startTime = Date.now();
    this.usingExternalServer = false;

    const pid = this.process.pid;

    this.process.stdout?.on("data", (data: unknown) => {
      const output = chunkToString(data);
      void logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.DEBUG,
        "electron.opencodeServer.logs.stdout",
        undefined,
        {
          output,
        }
      );
    });

    this.process.stderr?.on("data", (data: unknown) => {
      const error = chunkToString(data);
      void logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.WARNING,
        "electron.opencodeServer.logs.stderr",
        undefined,
        {
          error,
        }
      );
    });

    this.process.on("close", (code) => {
      void logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.INFO,
        "electron.opencodeServer.logs.closed",
        { code: code ?? "null" },
        { code }
      );
      this.cleanup();
    });

    this.process.on("error", (err) => {
      void logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.ERROR,
        "electron.opencodeServer.logs.error",
        { message: err.message },
        {
          error: err.message,
        }
      );
      this.cleanup();
    });

    return {
      running: true,
      port,
      url: `http://127.0.0.1:${port}`,
      ...(workspacePath !== undefined ? { workspacePath } : {}),
      ...(typeof pid === "number" ? { pid } : {}),
      ...(typeof this.startTime === "number" ? { startTime: this.startTime } : {}),
      source: "started",
    };
  }

  async stop(): Promise<void> {
    // NOTE: If the process was started by this manager, stop it directly.
    if (this.process !== null) {
      await logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.INFO,
        "electron.opencodeServer.logs.stoppingOwnProcess",
        undefined,
        {
          pid: this.process.pid,
          port: this.currentPort,
        }
      );

      const proc = this.process;
      const pid = proc.pid;
      this.cleanup();

      if (process.platform === "win32" && typeof pid === "number") {
        await this.killWindowsProcessTree(pid);
        return;
      }

      const canKillGroup = process.platform !== "win32";
      const tryKill = (signal: NodeJS.Signals, useGroup: boolean): boolean => {
        try {
          if (useGroup && canKillGroup && typeof pid === "number") {
            process.kill(-pid, signal);
          } else {
            proc.kill(signal);
          }
          return true;
        } catch {
          return false;
        }
      };

      const termByGroup = tryKill("SIGTERM", true);
      if (!termByGroup) void tryKill("SIGTERM", false);

      await new Promise<boolean>((resolve) => {
        if (proc.exitCode !== null) {
          resolve(true);
          return;
        }
        const timeout = setTimeout(() => {
          resolve(false);
        }, 5000);
        proc.once("close", () => {
          clearTimeout(timeout);
          resolve(true);
        });
      }).then((exited) => {
        if (!exited) {
          const killByGroup = tryKill("SIGKILL", true);
          if (!killByGroup) void tryKill("SIGKILL", false);
        }
      });
      return;
    }

    if (this.usingExternalServer) {
      await logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.INFO,
        "electron.opencodeServer.logs.skippingExternalStop",
        undefined,
        {
          port: this.currentPort,
        }
      );
    }

    this.currentPort = null;
    this.startTime = null;
    this.usingExternalServer = false;
  }

  getStatus(): ServerInfo {
    if (this.currentPort === null) {
      return { running: false };
    }

    const pid = this.process?.pid ?? undefined;

    return {
      running: true,
      port: this.currentPort,
      url: `http://127.0.0.1:${this.currentPort}`,
      ...(typeof pid === "number" ? { pid } : {}),
      ...(typeof this.startTime === "number" ? { startTime: this.startTime } : {}),
      source: this.process !== null ? "started" : "existing",
    };
  }

  // NOTE: Server health check (HTTP request via Node.js - CSP bypass).
  async checkHealth(url: string): Promise<{ success: boolean; error?: string }> {
    const http = await import("http");
    return await new Promise((resolve) => {
      const parsedUrl = new URL(url);

      const req = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.pathname,
          method: "GET",
          timeout: 1000,
        },
        (res) => {
          resolve({ success: res.statusCode === 200 });
        }
      );

      req.on("error", (err: Error) => {
        resolve({ success: false, error: err.message });
      });

      req.on("timeout", () => {
        req.destroy();
        resolve({ success: false, error: "timeout" });
      });

      req.end();
    });
  }

  private cleanup(): void {
    this.process = null;
    this.currentPort = null;
    this.startTime = null;
    this.usingExternalServer = false;
  }
}

export const opencodeServerManager = new OpenCodeServerManager();
