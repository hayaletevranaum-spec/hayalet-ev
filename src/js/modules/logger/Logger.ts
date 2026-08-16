import type {
  LogEntry,
  LogLevel,
  LogCategory,
  LogVisibility,
  LogOperation,
} from "@shared/index.js";
import type { TranslationParams } from "@shared/i18n.js";

import { LogLevel as LL, LogVisibility as LV, LogCategory as LC } from "@shared/index.js";
import { AppI18n } from "../i18n/index.js";

interface LoggerConfig {
  sessionId: string;
  maxMemoryLogs: number;
  batchSize: number;
  batchInterval: number;
  enableConsoleOverride: boolean;
  enableToastIntegration: boolean;
}

interface LogMetadata {
  locale?: string;
  messageKey?: string;
}

function loggerT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.logs.logger.${key}`, params);
}

function isNodeTestRuntime(): boolean {
  const processLike = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process;
  return typeof processLike?.env?.["NODE_TEST_CONTEXT"] === "string";
}

class Logger {
  private static instance: Logger | null = null;

  private config: LoggerConfig = {
    sessionId: "",
    maxMemoryLogs: 500,
    batchSize: 50,
    batchInterval: 100,
    enableConsoleOverride: true,
    enableToastIntegration: true,
  };

  private entries: LogEntry[] = [];
  private batchQueue: LogEntry[] = [];
  private activeOperations = new Map<string, LogOperation>();
  private listeners: Array<(entry: LogEntry) => void> = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private isInitialized = false;
  private hasWarnedBatchBridgeUnavailable = false;

  private constructor() {}

  public static getInstance(): Logger {
    Logger.instance ??= new Logger();
    return Logger.instance;
  }

  public static init(sessionId: string, config?: Partial<LoggerConfig>): void {
    const logger = Logger.getInstance();

    if (logger.isInitialized) {
      console.warn(loggerT("alreadyInitialized"));
      return;
    }

    logger.config = { ...logger.config, sessionId, ...config };
    logger.isInitialized = true;

    if (logger.config.enableConsoleOverride) {
      Logger.interceptConsole();
    }

    logger.startBatchTimer();

    // NOTE: Use debug to avoid toast triggers during init.
    Logger.debugT(LC.SYSTEM, "app.logs.logger.initialized", undefined, {
      sessionId,
      config: logger.config,
    });
  }

  public static getSessionId(): string {
    return Logger.getInstance().config.sessionId;
  }

  public static toast(
    category: LogCategory | string,
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): void {
    Logger.getInstance().log(category, level, message, LV.TOAST, context);
  }

  public static toastT(
    category: LogCategory | string,
    level: LogLevel,
    key: string,
    params?: TranslationParams,
    context?: Record<string, unknown>
  ): void {
    Logger.getInstance().logLocalized(category, level, key, LV.TOAST, params, context);
  }

  public static panel(
    category: LogCategory | string,
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): void {
    Logger.getInstance().log(category, level, message, LV.PANEL, context);
  }

  public static panelT(
    category: LogCategory | string,
    level: LogLevel,
    key: string,
    params?: TranslationParams,
    context?: Record<string, unknown>
  ): void {
    Logger.getInstance().logLocalized(category, level, key, LV.PANEL, params, context);
  }

  public static debug(
    category: LogCategory | string,
    message: string,
    context?: Record<string, unknown>
  ): void {
    Logger.getInstance().log(category, LL.DEBUG, message, LV.VERBOSE, context);
  }

  public static debugT(
    category: LogCategory | string,
    key: string,
    params?: TranslationParams,
    context?: Record<string, unknown>
  ): void {
    Logger.getInstance().logLocalized(category, LL.DEBUG, key, LV.VERBOSE, params, context);
  }

  public static success(
    category: LogCategory | string,
    message: string,
    context?: Record<string, unknown>
  ): void {
    Logger.toast(category, LL.SUCCESS, message, context);
  }

  public static successT(
    category: LogCategory | string,
    key: string,
    params?: TranslationParams,
    context?: Record<string, unknown>
  ): void {
    Logger.toastT(category, LL.SUCCESS, key, params, context);
  }

  public static error(
    category: LogCategory | string,
    error: Error | string,
    context?: Record<string, unknown>
  ): void {
    const message = error instanceof Error ? error.message : error;
    const errorContext =
      error instanceof Error
        ? {
            ...context,
            error: {
              name: error.name,
              message: error.message,
              stack: error.stack,
              cause: (error as Error & { cause?: unknown }).cause,
            },
          }
        : context;

    Logger.toast(category, LL.ERROR, message, errorContext);
  }

  public static errorT(
    category: LogCategory | string,
    key: string,
    params?: TranslationParams,
    context?: Record<string, unknown>
  ): void {
    Logger.toastT(category, LL.ERROR, key, params, context);
  }

  public static warn(
    category: LogCategory | string,
    message: string,
    context?: Record<string, unknown>
  ): void {
    Logger.panel(category, LL.WARNING, message, context);
  }

  public static warnT(
    category: LogCategory | string,
    key: string,
    params?: TranslationParams,
    context?: Record<string, unknown>
  ): void {
    Logger.panelT(category, LL.WARNING, key, params, context);
  }

  public static info(
    category: LogCategory | string,
    message: string,
    context?: Record<string, unknown>
  ): void {
    Logger.panel(category, LL.INFO, message, context);
  }

  public static infoT(
    category: LogCategory | string,
    key: string,
    params?: TranslationParams,
    context?: Record<string, unknown>
  ): void {
    Logger.panelT(category, LL.INFO, key, params, context);
  }

  public static startOperation(
    name: string,
    category: LogCategory | string,
    context?: Record<string, unknown>
  ): string {
    const logger = Logger.getInstance();
    const correlationId = Logger.generateCorrelationId();

    const operation: LogOperation = {
      id: correlationId,
      name,
      category,
      startTime: performance.now(),
      ...(context ? { context } : {}),
    };

    logger.activeOperations.set(correlationId, operation);

    Logger.debugT(
      category,
      "app.logs.logger.operationStart",
      { name },
      {
        correlationId,
        operationName: name,
        ...context,
      }
    );

    return correlationId;
  }

  public static endOperation(
    correlationId: string,
    success: boolean,
    result?: string,
    context?: Record<string, unknown>
  ): void {
    const logger = Logger.getInstance();
    const operation = logger.activeOperations.get(correlationId);

    if (!operation) {
      Logger.warnT(LC.SYSTEM, "app.logs.logger.operationNotFound", { correlationId });
      return;
    }

    const endTime = performance.now();
    const duration = endTime - operation.startTime;

    operation.endTime = endTime;
    operation.status = success ? "success" : "failed";
    if (typeof result === "string") {
      operation.result = result;
    } else {
      delete operation.result;
    }

    const resultText = typeof result === "string" && result.trim() !== "" ? result : undefined;

    Logger.debugT(
      operation.category,
      success ? "app.logs.logger.operationSuccess" : "app.logs.logger.operationFailed",
      {
        name: operation.name,
        ...(resultText !== undefined ? { result: resultText } : {}),
      },
      {
        correlationId,
        operationName: operation.name,
        duration,
        status: operation.status,
        result,
        ...context,
      }
    );

    logger.activeOperations.delete(correlationId);
  }

  public static withCorrelation(
    correlationId: string,
    category: LogCategory | string,
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): void {
    Logger.getInstance().log(category, level, message, LV.VERBOSE, {
      correlationId,
      ...context,
    });
  }

  public static withCorrelationT(
    correlationId: string,
    category: LogCategory | string,
    level: LogLevel,
    key: string,
    params?: TranslationParams,
    context?: Record<string, unknown>
  ): void {
    Logger.getInstance().logLocalized(category, level, key, LV.VERBOSE, params, {
      correlationId,
      ...context,
    });
  }

  private log(
    category: LogCategory | string,
    level: LogLevel,
    message: string,
    visibility: LogVisibility,
    context?: Record<string, unknown>,
    metadata?: LogMetadata
  ): void {
    if (!this.isInitialized) {
      if (!isNodeTestRuntime()) {
        console.warn(loggerT("notInitialized"));
      }
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      locale: metadata?.locale ?? AppI18n.getLocale(),
      ...(metadata?.messageKey !== undefined ? { messageKey: metadata.messageKey } : {}),
      visibility,
      sessionId: this.config.sessionId,
      source: "renderer",
      ...(context ? { context } : {}),
    };

    this.entries.push(entry);
    if (this.entries.length > this.config.maxMemoryLogs) {
      this.entries.shift();
    }

    this.queueForIPC(entry);

    if (visibility === LV.TOAST && level !== LL.DEBUG && this.config.enableToastIntegration) {
      void this.showToast(entry);
    }

    this.notifyListeners(entry);
  }

  private logLocalized(
    category: LogCategory | string,
    level: LogLevel,
    key: string,
    visibility: LogVisibility,
    params?: TranslationParams,
    context?: Record<string, unknown>
  ): void {
    const message = AppI18n.t(key, params);
    this.log(category, level, message, visibility, context, {
      locale: AppI18n.getLocale(),
      messageKey: key,
    });
  }

  private queueForIPC(entry: LogEntry): void {
    this.batchQueue.push(entry);
    if (this.batchQueue.length > this.config.maxMemoryLogs) {
      this.batchQueue = this.batchQueue.slice(-this.config.maxMemoryLogs);
    }

    if (this.batchQueue.length >= this.config.batchSize) {
      this.flushBatch();
    }
  }

  private requeueBatch(batch: LogEntry[]): void {
    if (batch.length === 0) return;

    this.batchQueue = [...batch, ...this.batchQueue].slice(-this.config.maxMemoryLogs);
  }

  private flushBatch(): void {
    if (this.batchQueue.length === 0) return;

    const loggerApi = window.electronAPI?.["logger"] as
      | { appendBatch: (entries: unknown[]) => Promise<{ success?: boolean; error?: string }> }
      | undefined;
    const appendBatch = loggerApi?.appendBatch;
    if (typeof appendBatch !== "function") {
      if (!this.hasWarnedBatchBridgeUnavailable) {
        this.hasWarnedBatchBridgeUnavailable = true;
        console.warn(loggerT("batchBridgeUnavailable"));
      }
      return;
    }
    this.hasWarnedBatchBridgeUnavailable = false;

    const batch = [...this.batchQueue];
    this.batchQueue = [];

    appendBatch(batch)
      .then((result: { success?: boolean; error?: string }) => {
        if (result.success === false) {
          this.requeueBatch(batch);
        }
      })
      .catch((error: Error) => {
        this.requeueBatch(batch);
        console.error(loggerT("batchSendFailed", { message: error.message }), error);
      });
  }

  private startBatchTimer(): void {
    this.batchTimer = setInterval(() => {
      this.flushBatch();
    }, this.config.batchInterval);
  }

  private async showToast(entry: LogEntry): Promise<void> {
    try {
      const { ToastManager: toastManager } = await import("../../ui/toast-manager.js");

      const typeMap: Record<LogLevel, string> = {
        [LL.DEBUG]: "info",
        [LL.INFO]: "info",
        [LL.SUCCESS]: "success",
        [LL.WARNING]: "warning",
        [LL.ERROR]: "error",
      };

      toastManager.show({
        type: typeMap[entry.level] as "success" | "error" | "warning" | "info",
        title: entry.message,
      });
    } catch (error: unknown) {
      console.error(
        loggerT("toastIntegrationFailed", {
          message: error instanceof Error ? error.message : String(error),
        }),
        error
      );
    }
  }

  private notifyListeners(entry: LogEntry): void {
    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (error: unknown) {
        console.error(
          loggerT("listenerError", {
            message: error instanceof Error ? error.message : String(error),
          }),
          error
        );
      }
    }
  }

  private static interceptConsole(): void {
    const consoleRef = globalThis.console;
    const original = {
      log: consoleRef.log,
      info: consoleRef.info,
      warn: consoleRef.warn,
      error: consoleRef.error,
      debug: consoleRef.debug,
    };

    consoleRef.log = (...args: unknown[]): void => {
      original.log(...args);
      Logger.debug(LC.LEGACY, Logger.formatArgs(args));
    };

    consoleRef.info = (...args: unknown[]): void => {
      original.info(...args);
      Logger.info(LC.LEGACY, Logger.formatArgs(args));
    };

    consoleRef.warn = (...args: unknown[]): void => {
      original.warn(...args);
      Logger.warn(LC.LEGACY, Logger.formatArgs(args));
    };

    consoleRef.error = (...args: unknown[]): void => {
      original.error(...args);
      const formatted = Logger.formatArgs(args);
      const errorObj = args.find((arg): arg is Error => arg instanceof Error);
      if (errorObj !== undefined) {
        Logger.error(LC.LEGACY, errorObj);
      } else {
        Logger.error(LC.LEGACY, formatted);
      }
    };

    consoleRef.debug = (...args: unknown[]): void => {
      original.debug(...args);
      Logger.debug(LC.LEGACY, Logger.formatArgs(args));
    };
  }

  private static formatArgs(args: unknown[]): string {
    return args
      .map((arg) => {
        if (typeof arg === "string") {
          return arg;
        }
        if (typeof arg === "number" || typeof arg === "boolean" || typeof arg === "bigint") {
          return String(arg);
        }
        if (arg === null || arg === undefined) {
          return "";
        }
        if (typeof arg === "object") {
          try {
            return JSON.stringify(arg);
          } catch {
            return "[unserializable object]";
          }
        }
        return "";
      })
      .join(" ");
  }

  private static generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  public static subscribe(listener: (entry: LogEntry) => void): () => void {
    const logger = Logger.getInstance();
    logger.listeners.push(listener);

    return () => {
      const index = logger.listeners.indexOf(listener);
      if (index > -1) {
        logger.listeners.splice(index, 1);
      }
    };
  }

  public static getRecentLogs(count = 100): LogEntry[] {
    return Logger.getInstance().entries.slice(-count);
  }

  public static clear(): void {
    Logger.getInstance().entries = [];
  }

  public static getActiveOperations(): LogOperation[] {
    return Array.from(Logger.getInstance().activeOperations.values());
  }

  public static shutdown(): void {
    const logger = Logger.getInstance();

    logger.flushBatch();

    if (logger.batchTimer) {
      clearInterval(logger.batchTimer);
    }

    Logger.infoT(LC.SYSTEM, "app.logs.logger.shutdownComplete");
  }
}

export { Logger };
export default Logger;
