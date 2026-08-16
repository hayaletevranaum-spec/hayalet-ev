import { Logger, LogCategory, LogVisibility } from "./logger/index.js";
import { getErrorMessage } from "@shared/index.js";

interface ErrorContext {
  source: string;
  operation?: string;
  metadata?: Record<string, unknown>;
}

interface ErrorReport {
  message: string;
  stack?: string;
  source: string;
  operation?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

type ErrorCallback = (report: ErrorReport) => void;

class ErrorBoundaryClass {
  private _initialized = false;
  private _errorCallbacks: ErrorCallback[] = [];
  private _recentErrors: ErrorReport[] = [];
  private _maxRecentErrors = 50;

  init(): void {
    if (this._initialized) return;

    window.addEventListener("unhandledrejection", (event) => {
      const error = (event.reason ?? new Error("Unhandled Rejection")) as unknown;
      this._handleError(error, { source: "unhandled-rejection" });
      event.preventDefault();
    });

    window.addEventListener("error", (event) => {
      const error = (event.error ?? event.message) as unknown;
      this._handleError(error, {
        source: "global-error",
        metadata: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
      event.preventDefault();
    });

    this._initialized = true;
    Logger.infoT(LogCategory.SYSTEM, "app.logs.errorBoundary.initialized", undefined, {
      visibility: LogVisibility.PANEL,
    });
  }

  async wrap<T>(fn: () => Promise<T>, source: string, operation?: string): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      const context =
        operation !== undefined && operation !== "" ? { source, operation } : { source };
      this._handleError(error, context);
      return null;
    }
  }

  wrapSync<T>(fn: () => T, source: string, operation?: string): T | null {
    try {
      return fn();
    } catch (error) {
      const context =
        operation !== undefined && operation !== "" ? { source, operation } : { source };
      this._handleError(error, context);
      return null;
    }
  }

  safeCallback<T extends (...args: unknown[]) => unknown>(fn: T, source: string): T {
    return ((...args: unknown[]) => {
      try {
        const result = fn(...args);
        if (result instanceof Promise) {
          return result.catch((error) => {
            this._handleError(error, { source, operation: "callback-async" });
            return null;
          });
        }
        return result;
      } catch (error) {
        this._handleError(error, { source, operation: "callback-sync" });
        return null;
      }
    }) as T;
  }

  onError(callback: ErrorCallback): () => void {
    this._errorCallbacks.push(callback);
    return () => {
      this._errorCallbacks = this._errorCallbacks.filter((cb) => cb !== callback);
    };
  }

  getRecentErrors(): ErrorReport[] {
    return [...this._recentErrors];
  }

  clearErrors(): void {
    this._recentErrors = [];
  }

  private _handleError(error: unknown, context: ErrorContext): void {
    const report: ErrorReport = {
      message: getErrorMessage(error),
      source: context.source,
      timestamp: Date.now(),
      ...(error instanceof Error && error.stack !== undefined ? { stack: error.stack } : {}),
      ...(context.operation !== undefined && context.operation !== ""
        ? { operation: context.operation }
        : {}),
      ...(context.metadata !== undefined ? { metadata: context.metadata } : {}),
    };

    this._recentErrors.unshift(report);
    if (this._recentErrors.length > this._maxRecentErrors) {
      this._recentErrors.pop();
    }

    Logger.errorT(
      LogCategory.SYSTEM,
      "app.logs.errorBoundary.reported",
      {
        source: context.source,
        operationSuffix:
          context.operation !== undefined && context.operation !== ""
            ? `:${context.operation}`
            : "",
        message: report.message,
      },
      {
        error: error instanceof Error ? error : new Error(String(error)),
        context: {
          source: context.source,
          operation: context.operation,
          ...context.metadata,
        },
      }
    );

    for (const callback of this._errorCallbacks) {
      try {
        callback(report);
      } catch (_e) {}
    }
  }
}

const errorBoundary = new ErrorBoundaryClass();
export { errorBoundary as ErrorBoundary };
