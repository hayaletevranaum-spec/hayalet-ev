import { readdir, readFile, stat } from "fs/promises";
import { basename, dirname, join } from "path";
import { existsSync } from "fs";
import { createMcpTranslatorSync } from "./i18n/index.js";

const logUtilsT = createMcpTranslatorSync();
const MAIN_APP_LOG_DIR_CANDIDATES = ["app"] as const;
const KNOWN_LOG_APPS = new Set(["app", "mcp-server", "ghost-agent", "android-companion"]);

export type LogAppId = "app" | "mcp-server" | "ghost-agent" | "android-companion";

interface LogFilters {
  source?: string;
  level?: string;
  contains?: string;
  correlationId?: string;
  tail?: number;
}

interface SessionInfo {
  meta: Record<string, unknown> | null;
  summary: Record<string, unknown> | null;
  degraded?: {
    metaReadError?: string;
    summaryReadError?: string;
  };
}

function getBaseLogsDir(logDir: string): string {
  const leaf = basename(logDir);
  if (leaf === "logs") return logDir;
  if (KNOWN_LOG_APPS.has(leaf)) return dirname(logDir);
  return dirname(logDir);
}

export function getLogDirCandidates(logDir: string, app: LogAppId = "app"): string[] {
  const baseLogsDir = getBaseLogsDir(logDir);
  const dirNames = app === "app" ? [...MAIN_APP_LOG_DIR_CANDIDATES] : [app];

  return Array.from(new Set(dirNames.map((dirName) => join(baseLogsDir, dirName))));
}

export function resolveExistingLogDir(logDir: string, app: LogAppId = "app"): string {
  const candidates = getLogDirCandidates(logDir, app);
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? logDir;
}

export async function findLatestSession(logDir: string): Promise<string | null> {
  try {
    if (!existsSync(logDir)) return null;

    const entries = await readdir(logDir, { withFileTypes: true });
    const sessions = (
      await Promise.all(
        entries
          .filter((entry) => entry.isDirectory())
          .map(async (entry) => {
            try {
              const sessionPath = join(logDir, entry.name);
              const sessionStat = await stat(sessionPath);
              return { name: entry.name, mtimeMs: sessionStat.mtimeMs };
            } catch {
              return null;
            }
          })
      )
    )
      .filter((entry): entry is { name: string; mtimeMs: number } => entry !== null)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    return sessions[0]?.name ?? null;
  } catch {
    return null;
  }
}

export async function readSessionLogs(
  logDir: string,
  sessionId: string,
  type: "console" | "error" | "structured" = "console"
): Promise<string> {
  const sessionDir = join(logDir, sessionId);

  if (!existsSync(sessionDir)) {
    return logUtilsT("mcpServer.logUtils.sessionNotFound", { sessionId });
  }

  try {
    if (type === "error") {
      const errorPath = join(sessionDir, "error.log");
      if (existsSync(errorPath)) {
        return await readFile(errorPath, "utf-8");
      }
      return logUtilsT("mcpServer.logUtils.errorLogMissing");
    }

    if (type === "structured") {
      const structuredPath = join(sessionDir, "structured.jsonl");
      if (existsSync(structuredPath)) {
        return await readFile(structuredPath, "utf-8");
      }
      return logUtilsT("mcpServer.logUtils.structuredLogMissing");
    }

    const singleConsolePath = join(sessionDir, "console.log");
    if (existsSync(singleConsolePath)) {
      return await readFile(singleConsolePath, "utf-8");
    }

    const files = await readdir(sessionDir);
    const consoleFiles = files.filter((f) => f.startsWith("console-") && f.endsWith(".log")).sort();

    if (consoleFiles.length === 0) {
      return logUtilsT("mcpServer.logUtils.consoleLogMissing");
    }

    let content = "";
    for (const file of consoleFiles) {
      // eslint-disable-next-line no-await-in-loop
      content += await readFile(join(sessionDir, file), "utf-8");
    }

    return content;
  } catch (err) {
    const error = err as Error;
    return logUtilsT("mcpServer.logUtils.readError", { message: error.message });
  }
}

export function filterLogs(content: string, filters: LogFilters = {}): string[] {
  const { source, level, contains, correlationId, tail = 50 } = filters;

  let lines = content.split("\n").filter((l) => l.trim() !== "");

  if (source != null && source !== "") {
    const sourcePattern = source.replace(/\*/g, ".*");
    const sourceRegex = new RegExp(`\\[${sourcePattern}\\]`, "i");
    lines = lines.filter((l) => sourceRegex.test(l));
  }

  if (level != null && level !== "") {
    lines = lines.filter((l) => l.includes(`[${level}]`));
  }

  if (contains != null && contains !== "") {
    const containsLower = contains.toLowerCase();
    lines = lines.filter((l) => l.toLowerCase().includes(containsLower));
  }

  if (correlationId != null && correlationId !== "") {
    lines = lines.filter((l) => l.includes(correlationId));
  }

  return lines.slice(-tail);
}

export async function readSessionInfo(logDir: string, sessionId: string): Promise<SessionInfo> {
  const sessionDir = join(logDir, sessionId);
  const metaPath = join(sessionDir, "session-metadata.json");
  const legacyMetaPath = join(sessionDir, "meta.json");
  const summaryPath = join(sessionDir, "summary.json");

  let meta: Record<string, unknown> | null = null;
  let summary: Record<string, unknown> | null = null;
  const degraded: NonNullable<SessionInfo["degraded"]> = {};

  const selectedMetaPath = existsSync(metaPath)
    ? metaPath
    : existsSync(legacyMetaPath)
      ? legacyMetaPath
      : null;

  if (selectedMetaPath !== null) {
    try {
      meta = JSON.parse(await readFile(selectedMetaPath, "utf-8")) as Record<string, unknown>;
    } catch (error) {
      degraded.metaReadError = error instanceof Error ? error.message : String(error);
    }
  }

  if (existsSync(summaryPath)) {
    try {
      summary = JSON.parse(await readFile(summaryPath, "utf-8")) as Record<string, unknown>;
    } catch (error) {
      degraded.summaryReadError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    meta,
    summary,
    ...(Object.keys(degraded).length > 0 ? { degraded } : {}),
  };
}
