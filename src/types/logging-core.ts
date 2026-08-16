export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  SUCCESS = "success",
  WARNING = "warning",
  ERROR = "error",
}

export enum LogVisibility {
  TOAST = 1,
  PANEL = 2,
  VERBOSE = 3,
}

export enum LogCategory {
  SYSTEM = "system",
  RENDERER = "renderer",
  MAIN = "main",
  MCP = "mcp",

  UI = "ui",
  UI_TOAST = "ui:toast",
  UI_MODAL = "ui:modal",
  UI_THEME = "ui:theme",
  UI_SPLASH = "ui:splash",
  UI_ANIMATION = "ui:animation",
  UI_AUDIO = "ui:audio",
  UI_CANVAS = "ui:canvas",

  WEBVIEW = "webview",
  SLOT = "slot",
  TRAFFIC = "traffic",
  RELAY = "relay",
  COMMAND = "command",
  SERVER_COMMANDS = "server-commands",
  CATCH_MANAGER = "catch-manager",

  PROVIDER_CHATGPT = "provider:chatgpt",
  PROVIDER_GEMINI = "provider:gemini",
  PROVIDER_GROK = "provider:grok",
  PROVIDER_OPENCODE = "provider:opencode",
  PROVIDER_GENERIC = "provider:generic",

  ASSISTANT_CORE = "assistant:core",
  ASSISTANT_STORE = "assistant:store",
  ASSISTANT_MESSAGE = "assistant:message",
  ASSISTANT_SESSION = "assistant:session",
  ASSISTANT_UI = "assistant:ui",
  ASSISTANT_SSE = "assistant:sse",
  ASSISTANT_TOOL = "assistant:tool",
  ASSISTANT_PROVIDER = "assistant:provider",

  IPC = "ipc",
  DATABASE = "database",
  FILE_MANAGER = "file-manager",
  SCREENSHOT = "screenshot",
  WHISPER = "whisper",
  SETTINGS = "settings",
  WORKSPACE = "workspace",

  ENTRANCE = "entrance",
  ANALYZE = "analyze",
  ARCHIVES = "archives",

  LEGACY = "legacy",
  MIGRATION = "migration",
  TEST = "test",
  UNKNOWN = "unknown",
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory | string;
  message: string;
  locale?: string;
  messageKey?: string;

  visibility?: LogVisibility;
  correlationId?: string;
  sessionId?: string;

  context?: {
    provider?: string;
    slotId?: string;
    userId?: string;
    url?: string;
    selector?: string;

    webviewId?: string;
    loadState?: string;

    operationName?: string;
    operationStep?: string;

    duration?: number;
    memoryUsage?: number;

    [key: string]: unknown;
  };

  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    cause?: unknown;
  };

  aiHint?: {
    category: string;
    suggestion: string;
    documentationLink?: string;
    fixCommand?: string;
    confidence?: number;
  };

  isoTimestamp?: string;
  source?: string;
  type?: string;
  meta?: Record<string, unknown>;
}

export interface LogOperation {
  id: string;
  name: string;
  category: LogCategory | string;
  startTime: number;
  context?: Record<string, unknown>;

  endTime?: number;
  status?: "success" | "failed" | "timeout" | "cancelled";
  result?: string;
}

export interface LogQueryFilter {
  timeRange?: {
    from: string;
    to: string;
  };

  levels?: LogLevel[];
  categories?: (LogCategory | string)[];
  visibility?: LogVisibility[];

  contains?: string;
  regex?: string;

  correlationId?: string;
  sessionId?: string;
  provider?: string;
  slotId?: string;

  limit?: number;
  offset?: number;

  sortBy?: "timestamp" | "level" | "category";
  sortOrder?: "asc" | "desc";
}

export interface LogStats {
  totalCount: number;
  timeRange: { from: string; to: string };

  byLevel: Record<LogLevel, number>;

  byCategory: Array<{ category: string; count: number }>;

  errorClusters?: Array<{
    pattern: string;
    count: number;
    examples: LogEntry[];
  }>;

  averageDuration?: number;
  peakMemoryUsage?: number;
}

export interface LogBatch {
  entries: LogEntry[];
  sessionId: string;
  batchTimestamp: string;
  processSource: "renderer" | "main";
}

export type LogExportFormat = "json" | "jsonl" | "csv" | "txt";

export interface LogExportResult {
  format: LogExportFormat;
  outputPath: string;
  totalExported: number;
  fileSize: number;
  duration: number;
}
