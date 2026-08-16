// NOTE: Progress reporting uses MCP notifications plus stderr logging.

import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createMcpTranslatorSync } from "./i18n/index.js";

const progressTranslator = createMcpTranslatorSync();

function progressT(key: string, params?: Record<string, string | number | boolean>): string {
  return progressTranslator(`mcpServer.progress.${key}`, params);
}

// NOTE: Global server reference set from index.ts.
let mcpServer: Server | null = null;
let currentProgressToken: string | number | null = null;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function setMcpServer(server: Server): void {
  mcpServer = server;
}

export function setProgressToken(token: string | number | null): void {
  currentProgressToken = token;
}

export interface ProgressOptions {
  operation: string;
  total?: number;
  interval?: number;
  quiet?: boolean;
  progressToken?: string | number;
}

export interface ProgressTracker {
  update: (current: number, message?: string) => void;
  log: (message: string) => void;
  done: (message?: string) => void;
  fail: (error: string) => void;
  stop: () => void;
}

async function sendProgressNotification(
  progress: number,
  total: number | undefined,
  message: string
): Promise<void> {
  const token = currentProgressToken;
  if (mcpServer === null || token === null) return;

  try {
    await mcpServer.notification({
      method: "notifications/progress",
      params: {
        progressToken: token,
        progress,
        total,
        message,
      } as Record<string, unknown>,
    });
  } catch {
    // NOTE: Ignore notification failures.
  }
}

export function createProgress(options: ProgressOptions): ProgressTracker {
  const { operation, total, interval = 2000, quiet = false, progressToken } = options;
  const startTime = Date.now();
  let currentStep = 0;
  let lastMessage = "";
  let heartbeatTimer: NodeJS.Timeout | null = null;
  let isRunning = true;

  if (progressToken !== undefined) {
    setProgressToken(progressToken);
  }

  const startedMessage = progressT("started", { operation });
  if (!quiet) {
    console.error(`[PROGRESS] ⏳ ${startedMessage}`);
  }

  void sendProgressNotification(0, total, startedMessage);

  heartbeatTimer = setInterval(() => {
    if (!isRunning) return;

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const progressStr =
      total !== undefined
        ? progressT("ratio", {
            current: currentStep,
            total,
            percentage: Math.round((currentStep / total) * 100),
          })
        : progressT("steps", { current: currentStep });
    const heartbeatMessage = progressT("ongoing", { operation });
    const messageSuffix = lastMessage !== "" ? ` - ${lastMessage}` : "";

    console.error(`[PROGRESS] ⏳ ${heartbeatMessage} [${elapsed}s] ${progressStr}${messageSuffix}`);

    void sendProgressNotification(
      currentStep,
      total,
      `${heartbeatMessage}${lastMessage !== "" ? ` ${lastMessage}` : ""}`.trim()
    );
  }, interval);

  return {
    update(current: number, message?: string): void {
      currentStep = current;
      if (message !== undefined && message !== "") {
        lastMessage = message;
        if (!quiet) {
          const progressStr =
            total !== undefined ? `[${Math.round((current / total) * 100)}%]` : `[${current}]`;
          console.error(`[PROGRESS] ${progressStr} ${message}`);
        }
        void sendProgressNotification(current, total, message);
      }
    },

    log(message: string): void {
      console.error(`[PROGRESS] ℹ️ ${message}`);
      void sendProgressNotification(currentStep, total, message);
    },

    done(message?: string): void {
      isRunning = false;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const finalMessage = message ?? progressT("completedDefault");
      const completedMessage = progressT("completed", {
        operation,
        message: finalMessage,
        elapsed,
      });
      console.error(`[PROGRESS] ✅ ${completedMessage}`);

      void sendProgressNotification(total ?? currentStep, total, `✅ ${completedMessage}`);
      setProgressToken(null);
    },

    fail(error: string): void {
      isRunning = false;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const failedMessage = progressT("failed", {
        operation,
        error,
        elapsed,
      });
      console.error(`[PROGRESS] ❌ ${failedMessage}`);

      void sendProgressNotification(currentStep, total, `❌ ${failedMessage}`);
      setProgressToken(null);
    },

    stop(): void {
      isRunning = false;
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      setProgressToken(null);
    },
  };
}

export async function withTimeout<T>(
  operation: string,
  fn: () => Promise<T>,
  timeoutMs: number = 5000
): Promise<T> {
  let progress: ProgressTracker | null = null;

  const timeoutId = setTimeout(() => {
    progress = createProgress({ operation, quiet: true });
  }, timeoutMs);

  return await fn()
    .then((result) => {
      clearTimeout(timeoutId);
      if (progress) {
        progress.done();
      }
      return result;
    })
    .catch((error) => {
      clearTimeout(timeoutId);
      if (progress) {
        progress.fail(getErrorMessage(error));
      }
      throw error;
    });
}
