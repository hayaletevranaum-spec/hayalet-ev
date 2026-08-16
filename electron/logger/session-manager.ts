import { mkdir, writeFile, readFile, readdir, rm, stat } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { Paths } from "../paths.ts";
import type {
  AppState,
  LogSessionAppId,
  LogSessionCleanupAppResult,
  LogSessionCleanupResult,
  SessionListItem,
  SessionMeta,
  SessionSummary,
} from "@electron/types";
import { translateElectronMessage } from "../i18n/language-service.ts";
import {
  buildSessionMeta,
  buildSessionSummary,
  createSessionId,
  LEGACY_SESSION_META_FILENAME,
  normalizeSessionMeta,
  normalizeSessionSummary,
  SESSION_META_FILENAME,
  SESSION_SUMMARY_FILENAME,
} from "./session-context.ts";

let LOG_DIR: string | null = null;
let SESSION_ID: string | null = null;
let SESSION_DIR: string | null = null;
let SESSION_START_TIME: string | null = null;

let appStateSnapshot: AppState = {};

const LOG_SESSION_APP_IDS: LogSessionAppId[] = [
  "app",
  "mcp-server",
  "ghost-agent",
  "android-companion",
];
// NOTE: Some log producers do not emit summary.json, so a recent write window is treated as potentially active.
const RECENT_ACTIVE_SESSION_WINDOW_MS = 10 * 60 * 1000;

async function loggerT(key: string, params?: Record<string, string | number>): Promise<string> {
  return await translateElectronMessage(`electron.logger.${key}`, params);
}

function getAppLogDirCandidates(): string[] {
  try {
    return [Paths.getMainAppLogsDir()];
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getSessionStartTime(): string {
  if (SESSION_START_TIME != null && SESSION_START_TIME.length > 0) {
    return SESSION_START_TIME;
  }

  const fallback =
    typeof appStateSnapshot.startTime === "string" && appStateSnapshot.startTime.length > 0
      ? appStateSnapshot.startTime
      : new Date().toISOString();

  SESSION_START_TIME = fallback;
  return fallback;
}

export function generateSessionId(): string {
  return createSessionId();
}

export function initLogSystem(sessionId: string | null = null): {
  sessionId: string;
  logDir: string;
  sessionDir: string;
} {
  LOG_DIR = Paths.getMainAppLogsDir();
  SESSION_ID = sessionId ?? generateSessionId();
  SESSION_START_TIME = getSessionStartTime();
  SESSION_DIR = join(LOG_DIR, SESSION_ID);

  return { sessionId: SESSION_ID, logDir: LOG_DIR, sessionDir: SESSION_DIR };
}

export async function ensureSessionDir(): Promise<void> {
  if (SESSION_DIR === null || SESSION_DIR.length === 0) initLogSystem();

  if (SESSION_DIR === null || SESSION_DIR.length === 0) {
    throw new Error(await loggerT("sessionDirNotInitialized"));
  }

  if (!existsSync(SESSION_DIR)) {
    await mkdir(SESSION_DIR, { recursive: true });

    if (SESSION_ID === null || SESSION_ID.length === 0) {
      throw new Error(await loggerT("sessionIdNotInitialized"));
    }

    const meta: SessionMeta = buildSessionMeta({
      sessionId: SESSION_ID,
      startTime: getSessionStartTime(),
      appVersion: process.env["npm_package_version"] ?? "unknown",
      pid: process.pid,
    });

    await writeFile(join(SESSION_DIR, SESSION_META_FILENAME), JSON.stringify(meta, null, 2));
  }
}

export async function writeSessionSummary(
  totalLogs: number,
  errorCount: number,
  warnCount: number,
  chunkIndex: number,
  endReason: string = "normal"
): Promise<void> {
  try {
    await ensureSessionDir();

    if (SESSION_ID === null || SESSION_ID.length === 0) {
      throw new Error(await loggerT("sessionIdNotInitialized"));
    }

    const summary: SessionSummary = buildSessionSummary({
      sessionId: SESSION_ID,
      startTime: getSessionStartTime(),
      endTime: new Date().toISOString(),
      endReason: endReason as SessionSummary["endReason"],
      stats: {
        totalLogs,
        byLevel: {},
        byCategory: {},
        errorCount,
        warningCount: warnCount,
        chunks: chunkIndex,
      },
      lastState: appStateSnapshot,
    });

    if (SESSION_DIR === null || SESSION_DIR.length === 0) {
      throw new Error(await loggerT("sessionDirNotInitialized"));
    }

    await writeFile(join(SESSION_DIR, SESSION_SUMMARY_FILENAME), JSON.stringify(summary, null, 2));
  } catch (_err) {}
}

export async function listSessions(): Promise<SessionListItem[]> {
  try {
    if (LOG_DIR === null || LOG_DIR.length === 0) initLogSystem();
    const logDirs = getAppLogDirCandidates().filter((dir) => existsSync(dir));
    if (logDirs.length === 0) return [];

    const sessionMap = new Map<string, SessionListItem>();

    for (const logDir of logDirs) {
      // eslint-disable-next-line no-await-in-loop
      const entries = await readdir(logDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || sessionMap.has(entry.name)) continue;

        const sessionMetaPath = join(logDir, entry.name, SESSION_META_FILENAME);
        const legacyMetaPath = join(logDir, entry.name, LEGACY_SESSION_META_FILENAME);
        const metaPath = existsSync(sessionMetaPath) ? sessionMetaPath : legacyMetaPath;
        const summaryPath = join(logDir, entry.name, SESSION_SUMMARY_FILENAME);

        let meta = null;
        let summary = null;

        try {
          // eslint-disable-next-line no-await-in-loop -- NOTE: keep per-entry IO sequential to cap load.
          const [metaContent, summaryContent] = await Promise.all([
            existsSync(metaPath) ? readFile(metaPath, "utf-8") : Promise.resolve(null),
            existsSync(summaryPath) ? readFile(summaryPath, "utf-8") : Promise.resolve(null),
          ]);
          meta = metaContent !== null ? normalizeSessionMeta(parseJsonObject(metaContent)) : null;
          summary =
            summaryContent !== null
              ? normalizeSessionSummary(parseJsonObject(summaryContent))
              : null;
        } catch {}

        sessionMap.set(entry.name, {
          sessionId: entry.name,
          startTime: meta?.startTime ?? null,
          endTime: summary?.endTime ?? null,
          endReason: summary?.endReason ?? (entry.name === SESSION_ID ? "active" : "unknown"),
          stats: summary?.stats ?? null,
        });
      }
    }

    const sessions = Array.from(sessionMap.values());

    sessions.sort((a, b) => {
      if (a.startTime === null || a.startTime.length === 0) return 1;
      if (b.startTime === null || b.startTime.length === 0) return -1;
      return new Date(b.startTime).getTime() - new Date(a.startTime).getTime();
    });

    return sessions;
  } catch (_err) {
    return [];
  }
}

interface LogSessionCleanupCandidate {
  sessionId: string;
  sessionDir: string;
  mtimeMs: number;
  hasSummary: boolean;
  endTime: string | null;
  endReason: string | null;
}

async function collectCleanupCandidates(logDir: string): Promise<LogSessionCleanupCandidate[]> {
  const entries = await readdir(logDir, { withFileTypes: true });

  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const sessionDir = join(logDir, entry.name);
        const summaryPath = join(sessionDir, SESSION_SUMMARY_FILENAME);
        const hasSummary = existsSync(summaryPath);

        let summary: SessionSummary | null = null;
        if (hasSummary) {
          try {
            summary = normalizeSessionSummary(
              parseJsonObject(await readFile(summaryPath, "utf-8"))
            );
          } catch {
            summary = null;
          }
        }

        const sessionStat = await stat(sessionDir);

        return {
          sessionId: entry.name,
          sessionDir,
          mtimeMs: sessionStat.mtimeMs,
          hasSummary,
          endTime: summary?.endTime ?? null,
          endReason: summary?.endReason ?? null,
        } satisfies LogSessionCleanupCandidate;
      })
  );

  return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function shouldPreserveSession(
  candidate: LogSessionCleanupCandidate,
  nowMs: number,
  latestSessionId: string | null,
  activeSessionId: string | null
): boolean {
  if (activeSessionId !== null && candidate.sessionId === activeSessionId) {
    return true;
  }

  if (latestSessionId !== null && candidate.sessionId === latestSessionId) {
    return true;
  }

  if (candidate.endReason === "active") {
    return true;
  }

  if (!candidate.hasSummary && nowMs - candidate.mtimeMs <= RECENT_ACTIVE_SESSION_WINDOW_MS) {
    return true;
  }

  return false;
}

export async function deleteInactiveLogSessions(): Promise<LogSessionCleanupResult> {
  const baseLogsDir = Paths.getLogsDir();
  const nowMs = Date.now();
  const results: LogSessionCleanupAppResult[] = [];
  let deletedCount = 0;
  let preservedCount = 0;

  // NOTE: Cleanup runs per-app in order so the latest-session calculation stays deterministic.
  /* eslint-disable no-await-in-loop */
  for (const appId of LOG_SESSION_APP_IDS) {
    const logDir = join(baseLogsDir, appId);
    const activeSessionId = appId === "app" ? SESSION_ID : null;
    const deletedSessionIds: string[] = [];
    const preservedSessionIds: string[] = [];

    if (!existsSync(logDir)) {
      results.push({
        app: appId,
        latestSessionId: null,
        activeSessionId,
        deletedSessionIds,
        preservedSessionIds,
      });
      continue;
    }

    const candidates = await collectCleanupCandidates(logDir);
    const latestSessionId = candidates[0]?.sessionId ?? null;

    for (const candidate of candidates) {
      if (shouldPreserveSession(candidate, nowMs, latestSessionId, activeSessionId)) {
        preservedSessionIds.push(candidate.sessionId);
        preservedCount += 1;
        continue;
      }

      await rm(candidate.sessionDir, { recursive: true, force: true });
      deletedSessionIds.push(candidate.sessionId);
      deletedCount += 1;
    }

    results.push({
      app: appId,
      latestSessionId,
      activeSessionId,
      deletedSessionIds,
      preservedSessionIds,
    });
  }
  /* eslint-enable no-await-in-loop */

  return {
    deletedCount,
    preservedCount,
    apps: results,
  };
}

export async function clearLogs(targetSessionId: string | null = null): Promise<void> {
  try {
    const hasTargetSessionId = targetSessionId !== null && targetSessionId.length > 0;
    const sessionDir = hasTargetSessionId
      ? LOG_DIR !== null && LOG_DIR.length > 0
        ? join(LOG_DIR, targetSessionId)
        : null
      : SESSION_DIR;

    if (sessionDir !== null && sessionDir.length > 0 && existsSync(sessionDir)) {
      await rm(sessionDir, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(
      await loggerT("clearLogsFailed", {
        message: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

export function updateAppState(state: Partial<AppState>): void {
  appStateSnapshot = {
    ...appStateSnapshot,
    ...state,
    lastUpdate: new Date().toISOString(),
  };
}

export function getAppState(): AppState {
  return { ...appStateSnapshot };
}

export function getSessionId(): string | null {
  return SESSION_ID;
}

export function getSessionDir(): string | null {
  return SESSION_DIR;
}

export function getLogDir(): string | null {
  return LOG_DIR;
}

export { SESSION_ID, SESSION_DIR, LOG_DIR };
