import type { LogEntry } from "@shared/index.js";

export interface SessionStats {
  totalLogs: number;
  byLevel: Record<string, number>;
  byCategory: Record<string, number>;
  errorCount: number;
  warningCount: number;
}

export function buildSessionStats(
  entries: Array<Pick<LogEntry, "level" | "category">>
): SessionStats {
  const byLevel: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  let errorCount = 0;
  let warningCount = 0;

  for (const entry of entries) {
    const level = String(entry.level);
    const category = String(entry.category);

    byLevel[level] = (byLevel[level] ?? 0) + 1;
    byCategory[category] = (byCategory[category] ?? 0) + 1;

    if (level === "error") {
      errorCount += 1;
    }

    if (level === "warning" || level === "warn") {
      warningCount += 1;
    }
  }

  return {
    totalLogs: entries.length,
    byLevel,
    byCategory,
    errorCount,
    warningCount,
  };
}
