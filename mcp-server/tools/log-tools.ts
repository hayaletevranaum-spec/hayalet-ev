import { readFile, readdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import {
  findLatestSession,
  readSessionLogs,
  filterLogs,
  readSessionInfo,
  resolveExistingLogDir,
  type LogAppId,
} from "../utils/log-utils.js";
import { createMcpTranslator } from "../utils/i18n/index.js";
import { logToolError } from "../utils/mcp-logger.js";
import type { ToolResult } from "../types/index-mcp.js";
import type { TranslationParams } from "../../src/types/i18n.js";

interface StructuredLine {
  source?: string;
  type?: string;
  level?: string;
  visibility?: string | number;
  timestamp?: string;
  message?: string;
}

type McpTranslator = (key: string, params?: TranslationParams) => string;

function logToolsT(t: McpTranslator, key: string, params?: TranslationParams): string {
  return t(`mcpServer.logTools.${key}`, params);
}

function buildFilterInfo(
  t: McpTranslator,
  args: {
    source?: string | undefined;
    level?: string | undefined;
    contains?: string | undefined;
    correlationId?: string | undefined;
  }
): string {
  return [
    args.source != null ? logToolsT(t, "filters.source", { value: args.source }) : null,
    args.level != null ? logToolsT(t, "filters.level", { value: args.level }) : null,
    args.contains != null ? logToolsT(t, "filters.contains", { value: args.contains }) : null,
    args.correlationId != null
      ? logToolsT(t, "filters.correlationId", { value: args.correlationId })
      : null,
  ]
    .filter((value): value is string => value !== null)
    .join(", ");
}

function formatSummaryStatus(t: McpTranslator, isActive: boolean, endReason?: string): string {
  if (isActive) {
    return logToolsT(t, "summaryStatusActive");
  }

  switch (endReason) {
    case undefined:
    case "":
      return logToolsT(t, "summaryStatusCompleted");
    case "incomplete":
      return logToolsT(t, "summaryStatusIncomplete");
    case "from-structured":
      return logToolsT(t, "summaryStatusRecovered");
    default:
      return endReason;
  }
}

function parseStructuredLine(line: string): StructuredLine | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return typeof parsed === "object" && parsed !== null ? (parsed) : null;
  } catch {
    return null;
  }
}

interface LogReadArgs {
  app?: LogAppId;
  type?: "all" | "console" | "error" | "structured";
  tail?: number;
  source?: string;
  level?: string;
  contains?: string;
  correlationId?: string;
  sessionId?: string;
}

export async function readElectronLogs(logDir: string, args?: LogReadArgs): Promise<ToolResult> {
  const t = await createMcpTranslator();
  const {
    app = "app",
    type = "console",
    tail = 50,
    source,
    level,
    contains,
    correlationId,
    sessionId: requestedSessionId,
  } = args ?? {};

  const targetLogDir = resolveExistingLogDir(logDir, app);

  const sessionId = requestedSessionId ?? (await findLatestSession(targetLogDir));

  if (sessionId == null) {
    return {
      content: [{ type: "text", text: logToolsT(t, "sessionMissing") }],
      isError: true,
    };
  }

  if (type === "error") {
    const content = await readSessionLogs(targetLogDir, sessionId, "error");
    const filtered = filterLogs(content, { tail });
    const errorOutput = filtered.length > 0 ? filtered.join("\n") : logToolsT(t, "noErrors");
    return {
      content: [
        {
          type: "text",
          text: `${logToolsT(t, "errorLogsTitle", { sessionId })}\n\n${errorOutput}`,
        },
      ],
    };
  }

  if (type === "structured") {
    const content = await readSessionLogs(targetLogDir, sessionId, "structured");
    let lines = content.split("\n").filter((l) => l.trim() !== "");

    if (source != null) {
      lines = lines.filter((l) => {
        const json = parseStructuredLine(l);
        return (
          typeof json?.source === "string" &&
          json.source.toLowerCase().includes(source.toLowerCase())
        );
      });
    }
    if (level != null) {
      lines = lines.filter((l) => {
        const json = parseStructuredLine(l);
        const entryLevel =
          typeof json?.level === "string"
            ? json.level
            : typeof json?.type === "string"
              ? json.type
              : "";
        return entryLevel.toLowerCase() === level.toLowerCase();
      });
    }
    if (contains != null) {
      lines = lines.filter((l) => l.toLowerCase().includes(contains.toLowerCase()));
    }
    if (correlationId != null) {
      lines = lines.filter((l) => l.includes(correlationId));
    }

    lines = lines.slice(-tail);

    const formatted = lines.map((l) => {
      const json = parseStructuredLine(l);
      if (!json) return l;
      const vis = json.visibility != null ? `[L${String(json.visibility)}]` : "";
      return `[${json.timestamp ?? ""}] ${vis} [${json.source ?? ""}] ${json.message ?? ""}`;
    });

    const filterInfo = buildFilterInfo(t, { source, level, contains, correlationId });
    const filterText =
      filterInfo.length > 0 ? `\n${logToolsT(t, "filterLine", { filters: filterInfo })}` : "";
    const structuredOutput =
      formatted.length > 0 ? formatted.join("\n") : logToolsT(t, "noLogsFound");

    return {
      content: [
        {
          type: "text",
          text: `${logToolsT(t, "structuredLogsTitle", { sessionId })}${filterText}\n\n${structuredOutput}`,
        },
      ],
    };
  }

  const content = await readSessionLogs(targetLogDir, sessionId, "console");
  let lines = content.split("\n").filter((l) => l.trim() !== "");

  if (source != null) {
    lines = lines.filter((l) => l.toLowerCase().includes(`[${source.toLowerCase()}]`));
  }
  if (level != null) {
    lines = lines.filter((l) => l.toLowerCase().includes(`[${level.toLowerCase()}]`));
  }
  if (contains != null) {
    lines = lines.filter((l) => l.toLowerCase().includes(contains.toLowerCase()));
  }
  if (correlationId != null) {
    lines = lines.filter((l) => l.includes(correlationId));
  }

  lines = lines.slice(-tail);

  const filterInfo = buildFilterInfo(t, { source, level, contains, correlationId });
  const filterText =
    filterInfo.length > 0 ? `\n${logToolsT(t, "filterLine", { filters: filterInfo })}` : "";
  const consoleOutput = lines.length > 0 ? lines.join("\n") : logToolsT(t, "noLogsFound");

  return {
    content: [
      {
        type: "text",
        text: `${logToolsT(t, "consoleLogsTitle", { sessionId })}${filterText}\n\n${consoleOutput}`,
      },
    ],
  };
}

interface SessionListItem {
  id: string;
  hasErrors: boolean;
  hasSummary: boolean;
}

export async function listLogSessions(
  logDir: string,
  args?: { app?: LogAppId; limit?: number }
): Promise<ToolResult> {
  const t = await createMcpTranslator();
  const app = args?.app ?? "app";
  const targetLogDir = resolveExistingLogDir(logDir, app);
  const limit = args?.limit ?? 10;

  if (!existsSync(targetLogDir)) {
    return {
      content: [{ type: "text", text: logToolsT(t, "logDirMissing") }],
      isError: true,
    };
  }

  try {
    const entries = await readdir(targetLogDir, { withFileTypes: true });
    const sessions: SessionListItem[] = entries
      .filter((e) => e.isDirectory())
      .map((e) => ({
        id: e.name,
        hasErrors: existsSync(join(targetLogDir, e.name, "error.log")),
        hasSummary: existsSync(join(targetLogDir, e.name, "summary.json")),
      }))
      .sort((a, b) => b.id.localeCompare(a.id))
      .slice(0, limit);

    const output = sessions
      .map((s) => {
        const status = s.hasErrors ? "⚠️" : "✅";
        const state = s.hasSummary
          ? logToolsT(t, "sessionStateCompleted")
          : logToolsT(t, "sessionStateActiveIncomplete");
        return `${status} ${s.id} (${state})`;
      })
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: `${logToolsT(t, "sessionListTitle", { app, limit })}\n\n${output}`,
        },
      ],
    };
  } catch (err) {
    const error = err as Error;
    logToolError("hev_list_log_sessions", error, { limit });
    return {
      content: [
        {
          type: "text",
          text: `❌ ${logToolsT(t, "sessionListReadError", { message: error.message })}`,
        },
      ],
      isError: true,
    };
  }
}

export async function getSessionSummary(
  logDir: string,
  args?: { app?: LogAppId; sessionId?: string }
): Promise<ToolResult> {
  const t = await createMcpTranslator();
  const app = args?.app ?? "app";
  const targetLogDir = resolveExistingLogDir(logDir, app);
  const sessionId = args?.sessionId ?? (await findLatestSession(targetLogDir));

  if (sessionId == null) {
    return {
      content: [{ type: "text", text: logToolsT(t, "sessionNotFound") }],
      isError: true,
    };
  }

  const { meta, summary } = await readSessionInfo(targetLogDir, sessionId);

  let fallbackSummary: Record<string, unknown> | null = null;

  if (!meta && !summary) {
    const sessionDir = join(targetLogDir, sessionId);
    const structuredPath = join(targetLogDir, sessionId, "structured.jsonl");

    if (!existsSync(structuredPath)) {
      if (!existsSync(sessionDir)) {
        return {
          content: [
            { type: "text", text: `❌ ${logToolsT(t, "sessionFilesReadError", { sessionId })}` },
          ],
          isError: true,
        };
      }

      fallbackSummary = {
        startTime: "unknown",
        endTime: "N/A",
        endReason: "incomplete",
        duration: 0,
        stats: {
          totalLogs: 0,
          errorCount: 0,
          warningCount: 0,
          byLevel: {},
        },
      };
    } else {
      try {
        const structured = await readFile(structuredPath, "utf-8");
        const entries = structured
          .split("\n")
          .map((line) => parseStructuredLine(line))
          .filter((line): line is StructuredLine => line !== null);

        const byLevel: Record<string, number> = {};
        let errorCount = 0;
        let warningCount = 0;

        entries.forEach((entry) => {
          const levelRaw =
            typeof entry.level === "string"
              ? entry.level
              : typeof entry.type === "string"
                ? entry.type
                : "unknown";
          const normalized = levelRaw.toLowerCase();
          byLevel[normalized] = (byLevel[normalized] ?? 0) + 1;
          if (normalized === "error") errorCount += 1;
          if (normalized === "warning" || normalized === "warn") warningCount += 1;
        });

        const firstEntry = entries[0];
        const lastEntry = entries.length > 0 ? entries[entries.length - 1] : undefined;

        const firstTs =
          typeof firstEntry?.timestamp === "string" ? firstEntry.timestamp : undefined;
        const lastTs = typeof lastEntry?.timestamp === "string" ? lastEntry.timestamp : undefined;

        const duration =
          firstTs !== undefined && lastTs !== undefined
            ? Math.max(0, new Date(lastTs).getTime() - new Date(firstTs).getTime())
            : undefined;

        fallbackSummary = {
          startTime: firstTs,
          endTime: lastTs,
          endReason: "from-structured",
          ...(duration !== undefined ? { duration } : {}),
          stats: {
            totalLogs: entries.length,
            errorCount,
            warningCount,
            byLevel,
          },
        };
      } catch {
        return {
          content: [
            { type: "text", text: `❌ ${logToolsT(t, "sessionFilesReadError", { sessionId })}` },
          ],
          isError: true,
        };
      }
    }
  }

  const resolvedSummary = summary ?? fallbackSummary ?? {};

  const stats =
    (resolvedSummary["stats"] as
      | {
          totalLogs?: number;
          errorCount?: number;
          errors?: number;
          warningCount?: number;
          warnings?: number;
        }
      | undefined) ?? {};
  const startTime =
    (meta?.["startTime"] as string | undefined) ??
    (resolvedSummary["startTime"] as string | undefined) ??
    logToolsT(t, "unknown");
  const endTime = resolvedSummary["endTime"] as string | undefined;
  const endReason = resolvedSummary["endReason"] as string | undefined;
  const duration =
    typeof resolvedSummary["duration"] === "number"
      ? Math.round(resolvedSummary["duration"] / 1000)
      : undefined;
  const isActive = endTime == null;
  const endLabel = isActive ? logToolsT(t, "summaryEndActive") : endTime;

  const output = [
    logToolsT(t, "sessionSummaryTitle", { sessionId }),
    "",
    logToolsT(t, "summaryStart", { value: startTime }),
    logToolsT(t, "summaryEnd", {
      value: endLabel,
    }),
    logToolsT(t, "summaryStatus", { value: formatSummaryStatus(t, isActive, endReason) }),
    logToolsT(t, "summaryDuration", {
      value:
        duration != null
          ? `${duration}s`
          : isActive
            ? logToolsT(t, "summaryDurationOngoing")
            : logToolsT(t, "notAvailable"),
    }),
    "",
    logToolsT(t, "summaryPlatform", {
      value: (meta?.["platform"] as string | undefined) ?? logToolsT(t, "unknown"),
    }),
    logToolsT(t, "summaryElectron", {
      value: (meta?.["electronVersion"] as string | undefined) ?? logToolsT(t, "unknown"),
    }),
    logToolsT(t, "summaryNode", {
      value: (meta?.["nodeVersion"] as string | undefined) ?? logToolsT(t, "unknown"),
    }),
    logToolsT(t, "summaryPid", {
      value: (meta?.["pid"] as number | undefined) ?? logToolsT(t, "unknown"),
    }),
    "",
    logToolsT(t, "summaryStatsTitle"),
    logToolsT(t, "summaryTotalLogs", { value: stats.totalLogs ?? logToolsT(t, "notAvailable") }),
    logToolsT(t, "summaryErrors", { value: stats.errorCount ?? stats.errors ?? 0 }),
    logToolsT(t, "summaryWarnings", { value: stats.warningCount ?? stats.warnings ?? 0 }),
  ].join("\n");

  return {
    content: [{ type: "text", text: output }],
  };
}
