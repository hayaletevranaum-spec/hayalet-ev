// NOTE: Mirror tool lifecycle events into per-tool and unified session logs.

import { existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { appendFile } from "fs/promises";
import { join } from "path";
import { createMcpTranslatorSync, readMcpAppLanguageSync } from "./i18n/index.js";
import { PROJECT_ROOT } from "./project-root.js";

const LOG_BASE_DIR = join(PROJECT_ROOT, "logs", "mcp-server");

export type LogLevel = "debug" | "info" | "warn" | "error";

interface MCPLogEntry {
  timestamp: string;
  level: LogLevel;
  category: "mcp-tool" | "mcp-server";
  message: string;
  toolName?: string;
  operation: "start" | "success" | "error";
  duration?: number;
  args?: unknown;
  result?: unknown;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  agentContext?:
    | {
        conversationId?: string;
        requestId?: string;
      }
    | undefined;
}

interface UnifiedLogEntry {
  timestamp: string;
  level: LogLevel;
  category: "mcp";
  source: "mcp-server";
  message: string;
  context?: {
    toolName?: string;
    operation?: string;
    duration?: number;
    agentContext?: unknown;
  };
  error?:
    | {
        name: string;
        message: string;
        stack?: string;
      }
    | undefined;
}

class MCPLogger {
  private logDir: string;
  private currentSessionId: string | null = null;

  constructor() {
    this.logDir = LOG_BASE_DIR;
  }

  private getCurrentSessionId(): string {
    try {
      if (this.currentSessionId != null && this.currentSessionId !== "") {
        return this.currentSessionId;
      }

      const sessions = readdirSync(this.logDir)
        .filter((f) => {
          try {
            return statSync(join(this.logDir, f)).isDirectory();
          } catch {
            return false;
          }
        })
        .sort()
        .reverse();

      this.currentSessionId = sessions[0] ?? "default";
      return this.currentSessionId;
    } catch {
      return "default";
    }
  }

  private getTranslator(): {
    t: ReturnType<typeof createMcpTranslatorSync>;
  } {
    const locale = readMcpAppLanguageSync();
    return {
      t: createMcpTranslatorSync(locale),
    };
  }

  private buildLifecycleMessage(
    operation: MCPLogEntry["operation"],
    toolName?: string,
    duration?: number,
    errorMessage?: string
  ): { message: string } {
    const { t } = this.getTranslator();
    const resolvedToolName = toolName?.trim() !== "" ? toolName : t("mcpServer.logs.unknownTool");

    if (operation === "start") {
      return {
        message: t("mcpServer.logs.toolStart", { toolName: resolvedToolName }),
      };
    }

    if (operation === "success") {
      return {
        message: t("mcpServer.logs.toolSuccess", {
          toolName: resolvedToolName,
          ...(duration !== undefined ? { duration } : {}),
        }),
      };
    }

    if (resolvedToolName === "general") {
      return {
        message: t("mcpServer.logs.generalError", {
          message: errorMessage ?? "",
        }),
      };
    }

    return {
      message: t("mcpServer.logs.toolError", {
        toolName: resolvedToolName,
        message: errorMessage ?? "",
      }),
    };
  }

  async logToolStart(toolName: string, args: unknown, agentContext?: unknown): Promise<void> {
    const lifecycle = this.buildLifecycleMessage("start", toolName);
    const entry: MCPLogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      category: "mcp-tool",
      message: lifecycle.message,
      toolName,
      operation: "start",
      args: this.sanitizeArgs(args),
      ...(agentContext !== undefined
        ? { agentContext: agentContext as MCPLogEntry["agentContext"] }
        : {}),
    };

    await this.writeToLog(entry);
  }

  async logToolSuccess(
    toolName: string,
    result: unknown,
    duration: number,
    agentContext?: unknown
  ): Promise<void> {
    const lifecycle = this.buildLifecycleMessage("success", toolName, duration);
    const entry: MCPLogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      category: "mcp-tool",
      message: lifecycle.message,
      toolName,
      operation: "success",
      duration,
      result: this.sanitizeResult(result),
      ...(agentContext !== undefined
        ? { agentContext: agentContext as MCPLogEntry["agentContext"] }
        : {}),
    };

    await this.writeToLog(entry);
  }

  async logToolError(
    toolName: string,
    error: Error,
    args?: unknown,
    duration?: number,
    agentContext?: unknown
  ): Promise<void> {
    const lifecycle = this.buildLifecycleMessage("error", toolName, duration, error.message);
    const entry: MCPLogEntry = {
      timestamp: new Date().toISOString(),
      level: "error",
      category: "mcp-tool",
      message: lifecycle.message,
      toolName,
      operation: "error",
      ...(duration !== undefined ? { duration } : {}),
      ...(args !== undefined ? { args: this.sanitizeArgs(args) } : {}),
      error: {
        name: error.name,
        message: error.message,
        ...(error.stack !== undefined ? { stack: error.stack } : {}),
      },
      ...(agentContext !== undefined
        ? { agentContext: agentContext as MCPLogEntry["agentContext"] }
        : {}),
    };

    await this.writeToLog(entry);
    // WARNING: stderr is safe here; stdout must remain valid JSON-RPC output.
    process.stderr.write(`${entry.message}\n`);
  }

  private async writeToLog(entry: MCPLogEntry): Promise<void> {
    try {
      const sessionId = this.getCurrentSessionId();
      const sessionDir = join(this.logDir, sessionId);

      if (!existsSync(sessionDir)) {
        mkdirSync(sessionDir, { recursive: true });
      }

      const mcpLogPath = join(sessionDir, "mcp-tools.jsonl");
      const structuredPath = join(sessionDir, "structured.jsonl");
      const unifiedEntry: UnifiedLogEntry = {
        timestamp: entry.timestamp,
        level: entry.level,
        category: "mcp",
        source: "mcp-server",
        message: entry.message,
        context: {
          ...(entry.toolName != null ? { toolName: entry.toolName } : {}),
          operation: entry.operation,
          ...(entry.duration !== undefined ? { duration: entry.duration } : {}),
          ...(entry.agentContext !== undefined ? { agentContext: entry.agentContext } : {}),
        },
      };

      if (entry.error !== undefined) {
        unifiedEntry.error = entry.error;
      }

      const [mcpResult, structuredResult] = await Promise.allSettled([
        appendFile(mcpLogPath, JSON.stringify(entry) + "\n", "utf-8"),
        appendFile(structuredPath, JSON.stringify(unifiedEntry) + "\n", "utf-8"),
      ]);

      if (mcpResult.status === "rejected") {
        const { t } = this.getTranslator();
        process.stderr.write(
          `${t("mcpServer.logs.writeMcpToolsFailed", { message: String(mcpResult.reason) })}\n`
        );
      }

      if (structuredResult.status === "rejected") {
        const { t } = this.getTranslator();
        process.stderr.write(
          `${t("mcpServer.logs.writeStructuredFailed", {
            message: String(structuredResult.reason),
          })}\n`
        );
      }
    } catch (error) {
      const { t } = this.getTranslator();
      process.stderr.write(`${t("mcpServer.logs.writeFailed", { message: String(error) })}\n`);
    }
  }

  // NOTE: Sanitize arguments by truncating large payloads.
  private sanitizeArgs(args: unknown): unknown {
    if (args === null || args === undefined) return args;

    const str = JSON.stringify(args);
    if (str.length > 5000) {
      return { truncated: true, preview: str.substring(0, 500) + "..." };
    }
    return args;
  }

  // NOTE: Sanitize results by truncating large payloads.
  private sanitizeResult(result: unknown): unknown {
    if (result === null || result === undefined) return result;

    const str = JSON.stringify(result);
    if (str.length > 10000) {
      return { truncated: true, preview: str.substring(0, 1000) + "..." };
    }
    return result;
  }
}

const logger = new MCPLogger();

function writeLoggerInternalError(key: string, params?: Record<string, string | number>): void {
  const t = createMcpTranslatorSync();
  process.stderr.write(`${t(`mcpServer.logs.${key}`, params)}\n`);
}

export function logToolCall(toolName: string, args: unknown): { startTime: number } {
  const startTime = Date.now();
  logger.logToolStart(toolName, args).catch((err) => {
    writeLoggerInternalError("startLogFailed", { message: String(err) });
  });
  return { startTime };
}

export function logToolSuccess(
  toolName: string,
  result: unknown,
  duration: number,
  agentContext?: unknown
): void {
  logger.logToolSuccess(toolName, result, duration, agentContext).catch((err) => {
    writeLoggerInternalError("successLogFailed", { message: String(err) });
  });
}

export function logToolError(
  toolName: string,
  error: Error,
  args: unknown,
  startTime?: number
): void {
  const duration = startTime != null && startTime > 0 ? Date.now() - startTime : undefined;
  logger.logToolError(toolName, error, args, duration).catch((err) => {
    writeLoggerInternalError("errorLogFailed", { message: String(err) });
  });

  // WARNING: stderr is the only safe console channel here because stdout must remain valid JSON-RPC.
  console.error(
    createMcpTranslatorSync()("mcpServer.logs.toolError", { toolName, message: error.message })
  );
}

export function logError(message: string, error?: Error): void {
  const err = error ?? new Error(message);
  logger.logToolError("general", err).catch((e) => {
    writeLoggerInternalError("generalLogFailed", { message: String(e) });
  });
}

// NOTE: Startup logging is written to mcp-tools.jsonl because stdout must stay clean for JSON-RPC.
