import { appendFile } from "fs/promises";
import { join } from "path";
import { ensureSessionDir, getSessionDir, getAppState } from "./session-manager.ts";
import { LogLevel } from "@shared/index.js";
import type { LogSource, LogContext, StructuredLogEntry } from "@electron/types";
import { MAX_CHUNK_LINES } from "@limits";

let currentChunkIndex = 1;
let currentChunkLines = 0;

let CONSOLE_LOG: string | null = null;
let ERROR_LOG: string | null = null;
let STRUCTURED_LOG: string | null = null;

function stringifyLogArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (typeof arg === "number" || typeof arg === "boolean" || typeof arg === "bigint") {
    return String(arg);
  }
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}`;
  }
  if (arg !== null && typeof arg === "object") {
    try {
      return JSON.stringify(arg, null, 2);
    } catch {
      return "[unserializable object]";
    }
  }
  return "";
}

export function updateLogPaths(): void {
  const sessionDir = getSessionDir();
  if (sessionDir === null || sessionDir.length === 0) return;

  CONSOLE_LOG = join(sessionDir, `console-${String(currentChunkIndex).padStart(3, "0")}.log`);
  ERROR_LOG = join(sessionDir, "error.log");
  STRUCTURED_LOG = join(sessionDir, "structured.jsonl");
}

export function formatLog(
  level: LogLevel,
  source: LogSource,
  args: unknown[],
  context: LogContext | null = null
): string {
  const timestamp = new Date().toISOString();
  const message = args.map((arg) => stringifyLogArg(arg)).join(" ");

  let logLine = `[${timestamp}] [${level}] [${source}]`;

  const correlationId = context?.correlationId;
  if (typeof correlationId === "string" && correlationId.length > 0) {
    logLine += ` [${correlationId}]`;
  }

  logLine += ` ${message}`;

  if (context !== null && Object.keys(context).length > 0) {
    const ctxWithoutCorrelation = { ...context };
    delete ctxWithoutCorrelation.correlationId;
    if (Object.keys(ctxWithoutCorrelation).length > 0) {
      logLine += ` | ctx: ${JSON.stringify(ctxWithoutCorrelation)}`;
    }
  }

  return logLine + "\n";
}

export async function writeLog(
  level: LogLevel,
  source: LogSource,
  args: unknown[],
  context: LogContext | null = null,
  isError: boolean = false
): Promise<void> {
  try {
    await ensureSessionDir();
    updateLogPaths();

    const logMessage = formatLog(level, source, args, context);

    if (CONSOLE_LOG !== null && CONSOLE_LOG.length > 0) {
      await appendFile(CONSOLE_LOG, logMessage);

      currentChunkLines++;
      if (currentChunkLines >= MAX_CHUNK_LINES) {
        currentChunkIndex++;
        currentChunkLines = 0;
        updateLogPaths();
      }
    }

    if (isError && ERROR_LOG !== null && ERROR_LOG.length > 0) {
      await appendFile(ERROR_LOG, logMessage);
    }
  } catch {
    // NOTE: Write failure is silently ignored to prevent recursive logging.
  }
}

export async function writeErrorLog(
  level: LogLevel,
  source: LogSource,
  args: unknown[],
  context: LogContext | null = null
): Promise<void> {
  try {
    await ensureSessionDir();
    updateLogPaths();

    if (ERROR_LOG === null || ERROR_LOG.length === 0) return;

    const logMessage = formatLog(level, source, args, context);
    await appendFile(ERROR_LOG, logMessage);
  } catch {
    // NOTE: Write failure is silently ignored to prevent recursive logging.
  }
}

export async function writeStructuredLog(entry: StructuredLogEntry): Promise<void> {
  try {
    await ensureSessionDir();
    updateLogPaths();

    if (STRUCTURED_LOG === null || STRUCTURED_LOG.length === 0) return;

    await appendFile(STRUCTURED_LOG, JSON.stringify(entry) + "\n");

    if (CONSOLE_LOG !== null && CONSOLE_LOG.length > 0) {
      const visibility = `[L${entry.visibility ?? 0}]`;
      const source = entry.source;
      const type = entry.type ?? LogLevel.INFO;
      const message = entry.message;
      const timestamp = entry.isoTimestamp ?? new Date().toISOString();

      let logLine = `[${timestamp}] [${type.toUpperCase()}] ${visibility} [RENDERER] [${source}] ${message}`;

      if (entry.meta != null && Object.keys(entry.meta).length > 0) {
        logLine += ` | meta: ${JSON.stringify(entry.meta)}`;
      }

      await appendFile(CONSOLE_LOG, logLine + "\n");

      currentChunkLines++;
      if (currentChunkLines >= MAX_CHUNK_LINES) {
        currentChunkIndex++;
        currentChunkLines = 0;
        updateLogPaths();
      }
    }
  } catch {
    // NOTE: Write failure is silently ignored to prevent recursive logging.
  }
}

export async function writeStateSnapshot(): Promise<void> {
  try {
    await ensureSessionDir();
    const sessionDir = getSessionDir();
    if (sessionDir === null || sessionDir.length === 0) return;

    const snapshot = {
      timestamp: new Date().toISOString(),
      state: getAppState(),
      memory: process.memoryUsage(),
    };

    const snapshotPath = join(sessionDir, "state-snapshots.jsonl");
    await appendFile(snapshotPath, JSON.stringify(snapshot) + "\n");
  } catch {
    // NOTE: Write failure is silently ignored to prevent recursive logging.
  }
}

export function getConsoleLogPath(): string | null {
  return CONSOLE_LOG;
}

export function getErrorLogPath(): string | null {
  return ERROR_LOG;
}

export function getStructuredLogPath(): string | null {
  return STRUCTURED_LOG;
}

export function getCurrentChunkIndex(): number {
  return currentChunkIndex;
}

export { CONSOLE_LOG, ERROR_LOG, STRUCTURED_LOG };
