import type { AppState, SessionMeta, SessionSummary } from "@electron/types";

export const SESSION_META_FILENAME = "session-metadata.json";
export const LEGACY_SESSION_META_FILENAME = "meta.json";
export const SESSION_SUMMARY_FILENAME = "summary.json";

const SESSION_RANDOM_LENGTH = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeCountMap(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const entries: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const count = asNumber(raw);
    if (count !== undefined) {
      entries[key] = count;
    }
  }
  return entries;
}

export function createSessionId(now: Date = new Date()): string {
  const iso = now.toISOString();
  const date = iso.slice(0, 10).replace(/-/g, "");
  const time = iso.slice(11, 19).replace(/:/g, "");
  const random = Math.random()
    .toString(36)
    .slice(2, 2 + SESSION_RANDOM_LENGTH);
  return `${date}-${time}-${random}`;
}

export function buildSessionMeta(args: {
  sessionId: string;
  startTime: string;
  appVersion?: string;
  pid?: number;
}): SessionMeta {
  return {
    sessionId: args.sessionId,
    startTime: args.startTime,
    platform: process.platform,
    nodeVersion: process.version,
    electronVersion: process.versions.electron,
    ...(args.appVersion !== undefined ? { appVersion: args.appVersion } : {}),
    ...(args.pid !== undefined ? { pid: args.pid } : {}),
  };
}

export function buildSessionSummary(args: {
  sessionId: string;
  startTime: string;
  endTime?: string;
  endReason?: SessionSummary["endReason"];
  duration?: number;
  stats: SessionSummary["stats"];
  performance?: SessionSummary["performance"];
  lastState?: AppState;
}): SessionSummary {
  const resolvedEndTime = args.endTime ?? new Date().toISOString();
  const derivedDuration =
    args.duration ??
    ((): number | undefined => {
      const startMs = Date.parse(args.startTime);
      const endMs = Date.parse(resolvedEndTime);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
        return undefined;
      }
      return Math.max(0, endMs - startMs);
    })();

  return {
    sessionId: args.sessionId,
    startTime: args.startTime,
    ...(resolvedEndTime.length > 0 ? { endTime: resolvedEndTime } : {}),
    ...(args.endReason !== undefined ? { endReason: args.endReason } : {}),
    ...(derivedDuration !== undefined ? { duration: derivedDuration } : {}),
    stats: args.stats,
    ...(args.performance ? { performance: args.performance } : {}),
    ...(args.lastState ? { lastState: args.lastState } : {}),
  };
}

export function normalizeSessionMeta(raw: Record<string, unknown> | null): SessionMeta | null {
  if (!isRecord(raw)) return null;

  const sessionId = asString(raw["sessionId"]);
  if (sessionId == null || sessionId.length === 0) {
    return null;
  }

  const startTime = asString(raw["startTime"]) ?? "";

  const meta: SessionMeta = {
    sessionId,
    startTime,
  };

  const platform = asString(raw["platform"]);
  if (platform != null) meta.platform = platform;

  const nodeVersion = asString(raw["nodeVersion"]);
  if (nodeVersion != null) meta.nodeVersion = nodeVersion;

  const electronVersion = asString(raw["electronVersion"]);
  if (electronVersion != null) meta.electronVersion = electronVersion;

  const appVersion = asString(raw["appVersion"]);
  if (appVersion != null) meta.appVersion = appVersion;

  const pid = asNumber(raw["pid"]);
  if (pid != null) meta.pid = pid;

  return meta;
}

export function normalizeSessionSummary(
  raw: Record<string, unknown> | null
): SessionSummary | null {
  if (!isRecord(raw)) return null;

  const sessionId = asString(raw["sessionId"]);
  if (sessionId == null || sessionId.length === 0) {
    return null;
  }

  const startTime = asString(raw["startTime"]) ?? "";
  const endTime = asString(raw["endTime"]);
  const endReason = asString(raw["endReason"]) as SessionSummary["endReason"] | undefined;
  const duration = asNumber(raw["duration"]);

  const statsRaw = isRecord(raw["stats"]) ? raw["stats"] : {};
  const totalLogs = asNumber(statsRaw["totalLogs"]) ?? 0;
  const errorCount = asNumber(statsRaw["errorCount"]) ?? asNumber(statsRaw["errors"]) ?? 0;
  const warningCount = asNumber(statsRaw["warningCount"]) ?? asNumber(statsRaw["warnings"]) ?? 0;
  const chunks = asNumber(statsRaw["chunks"]);

  const stats: SessionSummary["stats"] = {
    totalLogs,
    byLevel: normalizeCountMap(statsRaw["byLevel"]),
    byCategory: normalizeCountMap(statsRaw["byCategory"]),
    errorCount,
    warningCount,
    ...(chunks !== undefined ? { chunks } : {}),
  };

  const performanceRaw = isRecord(raw["performance"]) ? raw["performance"] : null;
  const averageLogRate = performanceRaw ? asNumber(performanceRaw["averageLogRate"]) : undefined;
  const peakMemoryUsage = performanceRaw ? asNumber(performanceRaw["peakMemoryUsage"]) : undefined;

  const resolvedDuration =
    duration ??
    ((): number | undefined => {
      if (startTime.length === 0 || endTime == null) return undefined;
      const startMs = Date.parse(startTime);
      const endMs = Date.parse(endTime);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return undefined;
      return Math.max(0, endMs - startMs);
    })();

  const derivedAverageRate =
    averageLogRate ??
    (resolvedDuration != null && resolvedDuration > 0
      ? totalLogs / (resolvedDuration / 1000)
      : undefined);

  const performance =
    derivedAverageRate != null || peakMemoryUsage != null
      ? {
          averageLogRate: derivedAverageRate ?? 0,
          ...(peakMemoryUsage != null ? { peakMemoryUsage } : {}),
        }
      : undefined;

  const lastState = isRecord(raw["lastState"]) ? (raw["lastState"] as AppState) : undefined;

  return {
    sessionId,
    startTime,
    ...(endTime !== undefined && endTime.length > 0 ? { endTime } : {}),
    ...(endReason !== undefined ? { endReason } : {}),
    ...(resolvedDuration !== undefined ? { duration: resolvedDuration } : {}),
    stats,
    ...(performance ? { performance } : {}),
    ...(lastState ? { lastState } : {}),
  };
}
