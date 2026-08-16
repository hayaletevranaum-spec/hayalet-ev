import { createReadStream } from "fs";
import { access } from "fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import { extname, join, normalize } from "path";
import { Paths } from "./paths.ts";
import { getLoggerCore } from "./logger/index.js";
import { LogCategory, LogLevel } from "@shared/index.js";

const logger = getLoggerCore();
const DEFAULT_LLM_PORT = 9876;
const LLM_HOST = "127.0.0.1";
const ALLOWED_LLM_SLOTS = new Set(["ai1", "ai2"]);

export interface LlmServerInfo {
  running: boolean;
  port?: number;
  url?: string;
  activeSlots?: string[];
  source?: "managed" | "external";
}

function normalizeSlotId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return ALLOWED_LLM_SLOTS.has(normalized) ? normalized : null;
}

function getContentType(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export class LlmServerManager {
  private server: Server | null = null;
  private currentPort: number | null = null;
  private readonly activeSlots = new Set<string>();
  private usingExternalServer = false;

  private get publicDir(): string {
    return join(
      Paths.getProjectRoot(),
      "src",
      "js",
      "modules",
      "webview",
      "providers",
      "llm",
      "public"
    );
  }

  private getUrl(port = this.currentPort ?? DEFAULT_LLM_PORT): string {
    return `http://${LLM_HOST}:${String(port)}`;
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return await new Promise((resolve) => {
      const probe = createServer();
      probe.once("error", () => {
        resolve(false);
      });
      probe.once("listening", () => {
        probe.close(() => {
          resolve(true);
        });
      });
      probe.listen(port, LLM_HOST);
    });
  }

  private async looksLikeExternalLlmServer(port: number): Promise<boolean> {
    try {
      const response = await fetch(`${this.getUrl(port)}/`);
      if (!response.ok) {
        return false;
      }
      const body = await response.text();
      return body.includes("Hayalet Ev LLM");
    } catch {
      return false;
    }
  }

  private resolveRequestPath(request: IncomingMessage): string | null {
    const rawUrl = request.url ?? "/";
    const parsed = new URL(rawUrl, this.getUrl());

    if (parsed.pathname === "/__hayalet-llm-health") {
      return "__health__";
    }

    const relativePath = parsed.pathname === "/" ? "index.html" : parsed.pathname.slice(1);
    const safePath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
    const resolvedPath = join(this.publicDir, safePath);
    if (!resolvedPath.startsWith(this.publicDir)) {
      return null;
    }
    return resolvedPath;
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method Not Allowed");
      return;
    }

    const requestPath = this.resolveRequestPath(request);
    if (requestPath === "__health__") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ ok: true, provider: "llm" }));
      return;
    }

    if (requestPath === null || (await pathExists(requestPath)) !== true) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }

    response.writeHead(200, { "Content-Type": getContentType(requestPath) });
    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(requestPath).pipe(response);
  }

  async start(slot: unknown, port = DEFAULT_LLM_PORT): Promise<LlmServerInfo> {
    const slotId = normalizeSlotId(slot);
    if (slotId === null) {
      throw new Error("LLM server can only be started for AI1 or AI2 slots.");
    }

    this.activeSlots.add(slotId);

    if (this.server !== null || this.usingExternalServer) {
      return this.getStatus();
    }

    try {
      const publicIndexPath = join(this.publicDir, "index.html");
      if ((await pathExists(publicIndexPath)) !== true) {
        throw new Error(`LLM provider UI is missing: ${publicIndexPath}`);
      }

      if ((await this.isPortAvailable(port)) !== true) {
        if (await this.looksLikeExternalLlmServer(port)) {
          this.currentPort = port;
          this.usingExternalServer = true;
          return this.getStatus();
        }
        throw new Error(`LLM server port is already in use: ${String(port)}`);
      }

      this.server = createServer((request, response) => {
        void this.handleRequest(request, response).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          response.end(message);
        });
      });

      await new Promise<void>((resolve, reject) => {
        const server = this.server;
        if (server === null) {
          reject(new Error("LLM server was not initialized."));
          return;
        }
        server.once("error", reject);
        server.listen(port, LLM_HOST, () => {
          server.off("error", reject);
          resolve();
        });
      });

      this.currentPort = port;
      this.usingExternalServer = false;
      await logger.logInternal(LogCategory.MAIN, LogLevel.INFO, "LLM server started.", {
        port,
        activeSlots: Array.from(this.activeSlots),
      });

      return this.getStatus();
    } catch (error) {
      this.activeSlots.delete(slotId);
      this.server = null;
      this.currentPort = null;
      this.usingExternalServer = false;
      throw error;
    }
  }

  async stop(slot?: unknown, options: { force?: boolean } = {}): Promise<LlmServerInfo> {
    const slotId = normalizeSlotId(slot);
    if (options.force === true) {
      this.activeSlots.clear();
    } else if (slotId !== null) {
      this.activeSlots.delete(slotId);
    }

    if (this.activeSlots.size > 0) {
      return this.getStatus();
    }

    if (this.usingExternalServer) {
      this.currentPort = null;
      this.usingExternalServer = false;
      return this.getStatus();
    }

    const server = this.server;
    if (server === null) {
      this.currentPort = null;
      return this.getStatus();
    }

    this.server = null;
    const stoppedPort = this.currentPort;
    this.currentPort = null;
    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    await logger.logInternal(LogCategory.MAIN, LogLevel.INFO, "LLM server stopped.", {
      port: stoppedPort,
    });

    return this.getStatus();
  }

  getStatus(): LlmServerInfo {
    const running = this.server !== null || this.usingExternalServer;
    return {
      running,
      ...(this.currentPort !== null ? { port: this.currentPort, url: this.getUrl() } : {}),
      activeSlots: Array.from(this.activeSlots),
      ...(running ? { source: this.usingExternalServer ? "external" : "managed" } : {}),
    };
  }
}

export const llmServerManager = new LlmServerManager();
