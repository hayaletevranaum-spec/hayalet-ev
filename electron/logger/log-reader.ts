import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { getSessionDir, getLogDir, getSessionId } from "./session-manager.ts";
import { getErrorLogPath } from "./log-writer.ts";
import {
  LEGACY_SESSION_META_FILENAME,
  normalizeSessionMeta,
  normalizeSessionSummary,
  SESSION_META_FILENAME,
  SESSION_SUMMARY_FILENAME,
} from "./session-context.ts";
import { LogLevel } from "@shared/index.js";
import { Paths } from "../paths.ts";
import type {
  LogQueryParams,
  SessionMeta,
  SessionSummary,
  StructuredLogEntry,
} from "@electron/types";
import { translateElectronMessage } from "../i18n/language-service.ts";

async function loggerT(key: string, params?: Record<string, string | number>): Promise<string> {
  return await translateElectronMessage(`electron.logger.${key}`, params);
}

function getMainAppLogDirCandidates(): string[] {
  const logDir = getLogDir();
  let pathCandidates: string[];

  try {
    pathCandidates = [Paths.getMainAppLogsDir()];
  } catch {
    pathCandidates = [];
  }

  return Array.from(
    new Set(
      [logDir, ...pathCandidates].filter((value): value is string => value != null && value !== "")
    )
  );
}

function resolveSessionDir(targetSessionId: string): string | null {
  for (const logDir of getMainAppLogDirCandidates()) {
    const sessionDir = join(logDir, targetSessionId);
    if (existsSync(sessionDir)) {
      return sessionDir;
    }
  }

  return null;
}

export async function readConsoleLogs(tail: number = 100): Promise<string> {
  try {
    const sessionDir = getSessionDir();
    if (sessionDir === null || sessionDir.length === 0 || !existsSync(sessionDir)) {
      return await loggerT("consoleLogsNotFound");
    }

    const files = await readdir(sessionDir);
    const consoleFiles = files.filter((f) => f.startsWith("console-") && f.endsWith(".log")).sort();

    const allContents = await Promise.all(
      consoleFiles.map(async (file) => await readFile(join(sessionDir, file), "utf-8"))
    );
    const allLines = allContents.flatMap((content) =>
      content.split("\n").filter((l) => l.trim().length > 0)
    );

    return allLines.slice(-tail).join("\n");
  } catch (err: unknown) {
    return await loggerT("consoleLogsReadFailed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function readErrorLogs(tail: number = 100): Promise<string> {
  try {
    const errorLog = getErrorLogPath();
    if (errorLog === null || errorLog.length === 0 || !existsSync(errorLog)) {
      return await loggerT("errorLogsNotFound");
    }

    const content = await readFile(errorLog, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    return lines.slice(-tail).join("\n");
  } catch (err: unknown) {
    return await loggerT("errorLogsReadFailed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

interface AllLogsResult {
  sessionId: string | null;
  console: string;
  error: string;
  structured: StructuredLogEntry[];
  meta: SessionMeta | null;
  summary: SessionSummary | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLogLevelValue(value: unknown): value is LogLevel {
  return typeof value === "string" && Object.values(LogLevel).includes(value as LogLevel);
}

function parseStructuredLine(line: string): StructuredLogEntry | null {
  try {
    const parsed: unknown = JSON.parse(line);
    if (!isRecord(parsed)) return null;

    const timestamp = typeof parsed["timestamp"] === "string" ? parsed["timestamp"] : "";
    const sourceRaw = typeof parsed["source"] === "string" ? parsed["source"] : "main";
    const message = typeof parsed["message"] === "string" ? parsed["message"] : "";
    const levelRaw = parsed["level"];
    const contextRaw = parsed["context"];
    const metaRaw = parsed["meta"];
    const aiHintRaw = parsed["aiHint"];
    const localeRaw = parsed["locale"];
    const messageKeyRaw = parsed["messageKey"];

    return {
      timestamp,
      source: sourceRaw as StructuredLogEntry["source"],
      message,
      ...(typeof localeRaw === "string" ? { locale: localeRaw } : {}),
      ...(typeof messageKeyRaw === "string" ? { messageKey: messageKeyRaw } : {}),
      ...(isLogLevelValue(levelRaw) ? { level: levelRaw } : {}),
      ...(isRecord(contextRaw) ? { context: contextRaw } : {}),
      ...(typeof parsed["isoTimestamp"] === "string"
        ? { isoTimestamp: parsed["isoTimestamp"] }
        : {}),
      ...(typeof parsed["type"] === "string" ? { type: parsed["type"] } : {}),
      ...(typeof parsed["sessionId"] === "string" ? { sessionId: parsed["sessionId"] } : {}),
      ...(typeof parsed["correlationId"] === "string" || parsed["correlationId"] === null
        ? { correlationId: parsed["correlationId"] }
        : {}),
      ...(typeof parsed["visibility"] === "number" ? { visibility: parsed["visibility"] } : {}),
      ...(isRecord(metaRaw) ? { meta: metaRaw } : {}),
      ...(isRecord(aiHintRaw) ? { aiHint: aiHintRaw } : {}),
    };
  } catch {
    return null;
  }
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function readAllLogs(targetSessionId: string | null = null): Promise<AllLogsResult> {
  const sessionId = targetSessionId ?? getSessionId();
  const hasTargetSessionId = targetSessionId !== null && targetSessionId.length > 0;
  const sessionDir = hasTargetSessionId ? resolveSessionDir(targetSessionId) : getSessionDir();

  const result: AllLogsResult = {
    sessionId,
    console: "",
    error: "",
    structured: [],
    meta: null,
    summary: null,
  };

  try {
    if (sessionDir === null || sessionDir.length === 0 || !existsSync(sessionDir)) {
      return { ...result, error: await loggerT("sessionNotFound") };
    }

    const files = await readdir(sessionDir);
    const consoleFiles = files
      .filter((f) => f === "console.log" || (f.startsWith("console-") && f.endsWith(".log")))
      .sort();

    const consoleContents = await Promise.all(
      consoleFiles.map(async (file) => await readFile(join(sessionDir, file), "utf-8"))
    );
    result.console = consoleContents.join("");

    const errorPath = join(sessionDir, "error.log");
    if (existsSync(errorPath)) {
      result.error = await readFile(errorPath, "utf-8");
    }

    const structuredPath = join(sessionDir, "structured.jsonl");
    if (existsSync(structuredPath)) {
      const content = await readFile(structuredPath, "utf-8");
      result.structured = content
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => parseStructuredLine(l))
        .filter((entry): entry is StructuredLogEntry => entry !== null);
    }

    const sessionMetaPath = join(sessionDir, SESSION_META_FILENAME);
    const legacyMetaPath = join(sessionDir, LEGACY_SESSION_META_FILENAME);
    const metaPath = existsSync(sessionMetaPath) ? sessionMetaPath : legacyMetaPath;
    if (existsSync(metaPath)) {
      result.meta = normalizeSessionMeta(parseJsonObject(await readFile(metaPath, "utf-8")));
    }

    const summaryPath = join(sessionDir, SESSION_SUMMARY_FILENAME);
    if (existsSync(summaryPath)) {
      result.summary = normalizeSessionSummary(
        parseJsonObject(await readFile(summaryPath, "utf-8"))
      );
    }
  } catch (err: unknown) {
    result.error = await loggerT("allLogsReadFailed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}

export async function queryLogs(query: LogQueryParams = {}): Promise<string[]> {
  const {
    type = "all",
    source = null,
    contains = null,
    level = null,
    since = null,
    tail = 100,
    sessionId = null,
  } = query;

  try {
    const logs = await readAllLogs(sessionId);
    let lines: string[] = [];

    if (type === "console" || type === "all") {
      lines = lines.concat(logs.console.split("\n"));
    }
    if (type === LogLevel.ERROR || type === "all") {
      lines = lines.concat(logs.error.split("\n"));
    }

    let filtered = lines.filter((l) => l.trim().length > 0);

    if (source !== null && source.length > 0) {
      const sourcePattern = source.replace(/\*/g, ".*");
      const sourceRegex = new RegExp(`\\[${sourcePattern}\\]`, "i");
      filtered = filtered.filter((l) => sourceRegex.test(l));
    }

    if (contains !== null && contains.length > 0) {
      const containsLower = contains.toLowerCase();
      filtered = filtered.filter((l) => l.toLowerCase().includes(containsLower));
    }

    if (level !== null) {
      filtered = filtered.filter((l) => l.includes(`[${level}]`));
    }

    if (since !== null && since.length > 0) {
      const sinceDate = new Date(since);
      filtered = filtered.filter((l) => {
        const match = l.match(/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\]/);
        const isoTimestamp = match?.[1];
        if (isoTimestamp !== undefined) {
          return new Date(isoTimestamp) >= sinceDate;
        }
        return true;
      });
    }

    return filtered.slice(-tail);
  } catch (err: unknown) {
    return [`Query error: ${(err as Error).message}`];
  }
}

export async function calculateLogStats(): Promise<{
  totalLogs: number;
  errorCount: number;
  warnCount: number;
}> {
  let totalLogs = 0;
  let errorCount = 0;
  let warnCount = 0;

  try {
    const sessionDir = getSessionDir();
    if (sessionDir === null || sessionDir.length === 0 || !existsSync(sessionDir)) {
      return { totalLogs, errorCount, warnCount };
    }

    const errorPath = join(sessionDir, "error.log");
    if (existsSync(errorPath)) {
      const errorContent = await readFile(errorPath, "utf-8");
      const errorLines = errorContent.split("\n").filter((l) => l.trim().length > 0);
      errorCount = errorLines.filter((l) => l.includes("[ERROR]")).length;
      warnCount = errorLines.filter((l) => l.includes("[WARN]")).length;
    }

    const files = await readdir(sessionDir);
    const consoleFiles = files.filter(
      (file) => file.startsWith("console-") && file.endsWith(".log")
    );
    const consoleContents = await Promise.all(
      consoleFiles.map(async (file) => await readFile(join(sessionDir, file), "utf-8"))
    );
    totalLogs = consoleContents.reduce(
      (sum, content) => sum + content.split("\n").filter((l) => l.trim().length > 0).length,
      0
    );
  } catch {}

  return { totalLogs, errorCount, warnCount };
}
