import { createRequire } from "node:module";
import type { BrowserWindow as ElectronBrowserWindow, IpcMainInvokeEvent } from "electron";
import type { LogEntry, LogLevel, LogCategory, TranslationParams } from "@shared/index.js";

import type {
  LogBatchPayload,
  LogOperationResult,
  LogWriterConfig,
} from "@electron/types/logging.js";

import { LogLevel as LL, LogCategory as LC } from "@shared/index.js";
import { SessionManager } from "./SessionManager.js";
import { StructuredWriter } from "../writers/StructuredWriter.js";
import { ConsoleWriter } from "../writers/ConsoleWriter.js";
import { ErrorWriter } from "../writers/ErrorWriter.js";
import { PerformanceWriter } from "../writers/PerformanceWriter.js";
import { matchErrorPattern } from "../../error-patterns.js";
import { buildSessionStats } from "./session-stats.js";
import {
  createElectronTranslator,
  readElectronAppLanguageSync,
} from "../../i18n/language-service.ts";

const electronRequire = createRequire(import.meta.url);

function getElectronWindows(): ElectronBrowserWindow[] {
  try {
    const electronModule: unknown = electronRequire("electron");
    if (electronModule === null || typeof electronModule !== "object") {
      return [];
    }

    const browserWindow = (
      electronModule as {
        BrowserWindow?: { getAllWindows?: () => ElectronBrowserWindow[] };
      }
    ).BrowserWindow;
    return typeof browserWindow?.getAllWindows === "function" ? browserWindow.getAllWindows() : [];
  } catch {
    return [];
  }
}

export class LoggerCore {
  private static instance: LoggerCore | null = null;

  private sessionManager: SessionManager;
  private structuredWriter: StructuredWriter;
  private consoleWriter: ConsoleWriter;
  private errorWriter: ErrorWriter;
  private performanceWriter: PerformanceWriter;

  private isInitialized = false;
  private writerConfig: LogWriterConfig;
  private uiBroadcastQueue: LogEntry[] = [];
  private uiBroadcastTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly UI_BROADCAST_INTERVAL = 120;
  private readonly UI_BROADCAST_MAX_BATCH = 200;
  private sessionEntries: Array<Pick<LogEntry, "level" | "category">> = [];

  private constructor() {
    this.sessionManager = new SessionManager();

    this.writerConfig = {
      sessionDir: "",
      enableStructuredLog: true,
      enableConsoleLog: true,
      enableErrorLog: true,
      enablePerformanceLog: true,
      compressionEnabled: false,
      maxFileSize: 10,
    };

    this.structuredWriter = new StructuredWriter(this.writerConfig);
    this.consoleWriter = new ConsoleWriter(this.writerConfig);
    this.errorWriter = new ErrorWriter(this.writerConfig);
    this.performanceWriter = new PerformanceWriter(this.writerConfig);
  }

  public static getInstance(): LoggerCore {
    LoggerCore.instance ??= new LoggerCore();
    return LoggerCore.instance;
  }

  private async translateLoggerMessage(key: string, params?: TranslationParams): Promise<string> {
    const translator = await createElectronTranslator();
    return translator.t(key, params);
  }

  public async init(logDir?: string): Promise<void> {
    if (this.isInitialized) {
      console.warn(await this.translateLoggerMessage("electron.logger.logs.alreadyInitialized"));
      return;
    }

    await this.sessionManager.init(logDir);
    const sessionDir = this.sessionManager.getSessionDir();

    this.writerConfig.sessionDir = sessionDir;

    this.structuredWriter.updateConfig(this.writerConfig);
    this.consoleWriter.updateConfig(this.writerConfig);
    this.errorWriter.updateConfig(this.writerConfig);
    this.performanceWriter.updateConfig(this.writerConfig);

    this.isInitialized = true;

    await this.logInternalT(LC.SYSTEM, LL.INFO, "electron.logger.initialized", undefined, {
      sessionId: this.sessionManager.getSessionId(),
      sessionDir,
    });

    // eslint-disable-next-line no-console
    console.log("[LoggerCore] Initialized", {
      sessionId: this.sessionManager.getSessionId(),
      sessionDir,
    });
  }

  public async handleBatch(
    _event: IpcMainInvokeEvent,
    payload: LogBatchPayload
  ): Promise<LogOperationResult> {
    try {
      if (!this.isInitialized) {
        return {
          success: false,
          message: await this.translateLoggerMessage("electron.logger.notInitialized"),
        };
      }

      const { entries } = payload;

      if (entries.length === 0) {
        return { success: true, entriesWritten: 0 };
      }

      await entries.reduce<Promise<void>>(async (chain, entry) => {
        await chain;
        await this.processEntry(entry);
      }, Promise.resolve());

      return {
        success: true,
        entriesWritten: entries.length,
      };
    } catch (error) {
      console.error(
        await this.translateLoggerMessage("electron.logger.logs.batchProcessingFailed", {
          message: error instanceof Error ? error.message : String(error),
        })
      );
      return {
        success: false,
        message: (error as Error).message,
      };
    }
  }

  private async processEntry(entry: LogEntry): Promise<void> {
    const enriched = this.enrichEntry(entry);

    if (enriched.level === LL.ERROR && enriched.message !== "") {
      const hint = matchErrorPattern(enriched.message);
      if (hint != null) {
        enriched.aiHint = hint;
      }
    }

    if (this.writerConfig.enableStructuredLog) {
      await this.structuredWriter.write(enriched);
    }

    if (this.writerConfig.enableConsoleLog) {
      await this.consoleWriter.write(enriched);
    }

    if (this.writerConfig.enableErrorLog && enriched.level === LL.ERROR) {
      await this.errorWriter.write(enriched);
    }

    if (this.writerConfig.enablePerformanceLog && typeof enriched.context?.duration === "number") {
      await this.performanceWriter.write(enriched);
    }

    this.sessionEntries.push({
      level: enriched.level,
      category: enriched.category,
    });

    this.enqueueUIBroadcast(enriched);
  }

  // NOTE: Queue log broadcasts to UI (renderer process).
  // NOTE: Uses short interval batching to avoid UI spam without dropping events.
  private enqueueUIBroadcast(entry: LogEntry): void {
    this.uiBroadcastQueue.push(entry);

    const maxQueueSize = this.UI_BROADCAST_MAX_BATCH * 20;
    if (this.uiBroadcastQueue.length > maxQueueSize) {
      this.uiBroadcastQueue.splice(0, this.uiBroadcastQueue.length - maxQueueSize);
    }

    if (this.uiBroadcastTimer !== null) {
      return;
    }

    this.uiBroadcastTimer = setTimeout(() => {
      this.flushUIBroadcastQueue();
    }, this.UI_BROADCAST_INTERVAL);
  }

  private flushUIBroadcastQueue(): void {
    if (this.uiBroadcastTimer !== null) {
      clearTimeout(this.uiBroadcastTimer);
      this.uiBroadcastTimer = null;
    }

    if (this.uiBroadcastQueue.length === 0) {
      return;
    }

    const batch = this.uiBroadcastQueue.splice(0, this.UI_BROADCAST_MAX_BATCH);
    const payload = batch.map((entry) => {
      const visibility = entry.visibility ?? 3;
      return {
        app: "app",
        level: entry.level,
        category: entry.category,
        message: entry.message,
        locale: entry.locale,
        messageKey: entry.messageKey,
        timestamp: entry.timestamp,
        visibility,
        source: entry.source ?? "main",
        context: entry.context,
        correlationId: entry.correlationId,
        sessionId: entry.sessionId ?? this.sessionManager.getSessionId(),
      };
    });

    const allWindows = getElectronWindows();
    for (const window of allWindows) {
      if (!window.isDestroyed()) {
        try {
          window.webContents.send("log:ui-notify-batch", payload);
        } catch (err) {
          // Swallow send errors to avoid crashing the main process if a
          // renderer IPC channel is broken or the window is in a bad state.
          console.warn("LoggerCore: failed to send log batch to window", err);
        }
      }
    }

    if (this.uiBroadcastQueue.length > 0) {
      this.uiBroadcastTimer = setTimeout(() => {
        this.flushUIBroadcastQueue();
      }, this.UI_BROADCAST_INTERVAL);
    }
  }

  private enrichEntry(entry: LogEntry): LogEntry {
    return {
      ...entry,
      locale: entry.locale ?? readElectronAppLanguageSync(),
      sessionId: entry.sessionId ?? this.sessionManager.getSessionId(),
      // NOTE: Alias for backward compat.
      isoTimestamp: entry.timestamp,
    };
  }

  public async logInternal(
    category: LogCategory | string,
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    metadata?: { locale?: string; messageKey?: string }
  ): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      ...(metadata?.locale !== undefined ? { locale: metadata.locale } : {}),
      ...(metadata?.messageKey !== undefined ? { messageKey: metadata.messageKey } : {}),
      sessionId: this.sessionManager.getSessionId(),
      source: "main",
      ...(context !== undefined ? { context } : {}),
    };

    await this.processEntry(entry);
  }

  public async logInternalT(
    category: LogCategory | string,
    level: LogLevel,
    key: string,
    params?: TranslationParams,
    context?: Record<string, unknown>
  ): Promise<void> {
    const translator = await createElectronTranslator();
    await this.logInternal(category, level, translator.t(key, params), context, {
      locale: translator.locale,
      messageKey: key,
    });
  }

  public getSessionId(): string {
    return this.sessionManager.getSessionId();
  }

  public getSessionDir(): string {
    return this.sessionManager.getSessionDir();
  }

  public getLogDir(): string {
    return this.sessionManager.getLogDir();
  }

  public async shutdown(): Promise<void> {
    if (!this.isInitialized) return;

    await this.logInternalT(LC.SYSTEM, LL.INFO, "electron.logger.shuttingDown");
    this.flushUIBroadcastQueue();

    await Promise.all([
      this.structuredWriter.flush(),
      this.consoleWriter.flush(),
      this.errorWriter.flush(),
      this.performanceWriter.flush(),
    ]);

    const stats = buildSessionStats(this.sessionEntries);
    await this.sessionManager.closeSession(stats);

    this.sessionEntries = [];
    this.isInitialized = false;
    // eslint-disable-next-line no-console
    console.log(await this.translateLoggerMessage("electron.logger.logs.shutdownComplete"));
  }
}

export const getLoggerCore = (): LoggerCore => LoggerCore.getInstance();
