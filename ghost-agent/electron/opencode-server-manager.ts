import type { ChildProcess } from "child_process";
import { spawn, spawnSync } from "child_process";
import * as net from "net";
import type { ServerOptions, ServerInfo } from "./types/server.ts";
import { logGhost } from "./logger.ts";

function chunkToString(data: unknown): string {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf-8");
  return String(data);
}

function resolveOpencodeBinary(): string {
  if (process.platform !== "win32") {
    return "opencode";
  }

  for (const candidate of ["opencode.cmd", "opencode.exe", "opencode"]) {
    const result = spawnSync("where", [candidate], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim() !== "") {
      return result.stdout.trim().split(/\r?\n/)[0] ?? candidate;
    }
  }

  return "opencode.cmd";
}

/**
 * OpenCode serve server yonetim servisi (Ghost-Agent)
 * - Port cakisma kontrolu
 * - Otomatik port bulma (4096-4110)
 * - Process lifecycle management
 */
export class OpenCodeServerManager {
  private process: ChildProcess | null = null;
  private currentPort: number | null = null;
  private startTime: number | null = null;
  private usingExternalServer = false;

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

  /**
   * Port araliginda calisan bir OpenCode sunucusu arar.
   * Her mesgul portta health check yaparak gercek bir OpenCode sunucusu olup olmadigini dogrular.
   */
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
          void logGhost("info", "Found existing OpenCode server", { port });
          return {
            running: true,
            port,
            url: `http://127.0.0.1:${port}`,
            source: "existing",
          };
        }
      } catch {}

      return await find(port + 1);
    };

    return await find(start);
  }

  async start(options: ServerOptions = {}): Promise<ServerInfo> {
    if (this.process !== null) {
      throw new Error("OpenCode server already running");
    }

    const existing = await this.findRunningServer(options.port ?? 4096, options.port ?? 4110);
    if (existing.running === true && existing.port != null) {
      void logGhost("info", "Reusing existing OpenCode server", {
        port: existing.port,
      });
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
        throw new Error(`Port ${options.port} is already in use`);
      }
      port = options.port;
    } else {
      const foundPort = await this.findAvailablePort();
      if (foundPort === null) {
        throw new Error("No available port found (tried 4096-4110)");
      }
      port = foundPort;
    }

    const args = ["serve", "--port", String(port), "--hostname", "127.0.0.1"];

    const cors = options.cors ?? ["http://localhost:5173"];
    cors.forEach((origin) => {
      args.push("--cors", origin);
    });

    const opencodeExecutable = resolveOpencodeBinary();
    void logGhost("info", "Starting OpenCode serve", {
      port,
      args,
      executable: opencodeExecutable,
    });

    const childEnv = { ...process.env };
    delete childEnv["CDP_PORT"];
    delete childEnv["NODE_OPTIONS"];
    delete childEnv["NODE_INSPECT_RESUME_ON_START"];

    this.process = spawn(opencodeExecutable, args, {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
      env: childEnv,
      shell: process.platform === "win32",
    });

    this.currentPort = port;
    this.startTime = Date.now();
    this.usingExternalServer = false;

    const pid = this.process.pid;

    this.process.stdout?.on("data", (data: unknown) => {
      const output = chunkToString(data);
      if (output.trim() !== "") {
        void logGhost("debug", "OpenCode stdout", { output });
      }
    });

    this.process.stderr?.on("data", (data: unknown) => {
      const error = chunkToString(data);
      if (error.trim() !== "") {
        void logGhost("warn", "OpenCode stderr", { error });
      }
    });

    this.process.on("close", (code) => {
      void logGhost("info", "OpenCode serve closed", { code });
      this.cleanup();
    });

    this.process.on("error", (err) => {
      void logGhost("error", "OpenCode serve error", { error: err.message });
      this.cleanup();
    });

    return {
      running: true,
      port,
      url: `http://127.0.0.1:${port}`,
      ...(typeof pid === "number" ? { pid } : {}),
      ...(typeof this.startTime === "number" ? { startTime: this.startTime } : {}),
      source: "started",
    };
  }

  async stop(): Promise<void> {
    // Kendi baslattigimiz process varsa -> direkt durdur
    if (this.process !== null) {
      void logGhost("info", "Stopping OpenCode serve", {
        pid: this.process.pid,
        port: this.currentPort,
      });

      const proc = this.process;
      const pid = proc.pid;
      this.cleanup();

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
      if (!termByGroup) {
        void tryKill("SIGTERM", false);
      }

      const exited = await new Promise<boolean>((resolve) => {
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
      });

      if (!exited) {
        void logGhost("warn", "OpenCode serve did not exit, forcing kill", { pid });
        const killByGroup = tryKill("SIGKILL", true);
        if (!killByGroup) {
          void tryKill("SIGKILL", false);
        }
      }
      return;
    }

    if (this.usingExternalServer) {
      void logGhost("info", "Skipping stop: OpenCode server is external", {
        port: this.currentPort,
      });
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

  /**
   * Server health check (HTTP request via Node.js - CSP bypass)
   */
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
