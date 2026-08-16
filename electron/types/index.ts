import type { IpcMainInvokeEvent } from "electron";
import type { LogLevel } from "@shared/index.js";
import type { TranslationParams } from "@shared/i18n.js";

export type IpcHandler<Args extends unknown[] = unknown[], R = unknown> = (
  event: IpcMainInvokeEvent,
  ...args: Args
) => R | Promise<R>;

export interface IpcResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorKey?: string;
  errorParams?: TranslationParams;
  code?: string;
}

export interface Conversation {
  id: string;
  web_url: string;
  title: string;
  summary: string;
  message_count: number;
  last_message_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  broker_message_id?: string | null;
  client_request_id?: string | null;
  event_seq?: number | null;
  role: "user" | "assistant";
  author: string | null;
  content: string;
  dom_index: number | null;
  dom_id: string | null;
  content_hash: string | null;
  provider_message_id?: string | null;
  created_at: number;
}

export interface SyncMessagesParams {
  accountId: string;
  clientRequestId?: string;
  provider?: string;
  webUrl: string;
  messages: Array<{
    role: "user" | "assistant";
    text: string;
    // NOTE: Sender nickname preserves the real sender in relay/++cmd scenarios.
    author?: string;
    brokerMessageId?: string;
    eventSeq?: number;
    index?: number;
    domIndex?: number;
    domId?: string;
    contentHash?: string;
    providerMessageId?: string;
  }>;
  authors?: {
    user?: string;
    assistant?: string;
  };
}

export interface SyncMessagesResult {
  success: boolean;
  conversationId?: string;
  added?: number;
  droppedDuplicates?: number;
  lastEventSeq?: number;
  syncedCount?: number;
  total?: number;
  error?: string;
}

export type LogSource =
  "MAIN" | "RENDERER" | "WEBVIEW" | "WEBVIEW-AI1" | "WEBVIEW-AI2" | "IPC" | "DB";

export interface LogContext {
  correlationId?: string;
  [key: string]: unknown;
}

export interface SessionMeta {
  sessionId: string;
  startTime: string;
  platform?: string;
  nodeVersion?: string;
  electronVersion?: string;
  appVersion?: string;
  pid?: number;
}

export type SessionEndReason =
  "normal" | "crash" | "unknown" | "active" | "incomplete" | "from-structured";

export interface SessionStats {
  totalLogs: number;
  byLevel: Record<string, number>;
  byCategory: Record<string, number>;
  errorCount: number;
  warningCount: number;
  chunks?: number;
}

export interface SessionSummary {
  sessionId: string;
  startTime: string;
  endTime?: string;
  endReason?: SessionEndReason;
  duration?: number;
  stats: SessionStats;
  performance?: {
    averageLogRate: number;
    peakMemoryUsage?: number;
  };
  lastState?: AppState;
}

export interface SessionListItem {
  sessionId: string;
  startTime: string | null;
  endTime: string | null;
  endReason: string;
  stats: SessionSummary["stats"] | null;
}

export type LogSessionAppId = "app" | "mcp-server" | "ghost-agent" | "android-companion";

export interface LogSessionCleanupAppResult {
  app: LogSessionAppId;
  latestSessionId: string | null;
  activeSessionId: string | null;
  deletedSessionIds: string[];
  preservedSessionIds: string[];
}

export interface LogSessionCleanupResult {
  deletedCount: number;
  preservedCount: number;
  apps: LogSessionCleanupAppResult[];
}

export interface AppState {
  startTime?: string;
  lastUpdate?: string;
  [key: string]: unknown;
}

export interface LogQueryParams {
  type?: "all" | "console" | LogLevel.ERROR;
  source?: string;
  contains?: string;
  level?: LogLevel;
  since?: string;
  tail?: number;
  sessionId?: string;
}

export interface StructuredLogEntry {
  timestamp: string;
  isoTimestamp?: string;
  level?: LogLevel;
  type?: string;
  source: LogSource;
  message: string;
  locale?: string;
  messageKey?: string;
  context?: LogContext;
  sessionId?: string;
  correlationId?: string | null;
  visibility?: number;
  meta?: Record<string, unknown>;
  aiHint?: Record<string, unknown>;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  loginUrl?: string;
  selectors: {
    input?: string;
    submit?: string;
    messages?: string;
    userMessage?: string;
    assistantMessage?: string;
    thinking?: string;
    loading?: string;
    [key: string]: string | undefined;
  };
  scrollerSelectors?: string[];
  filters?: Record<string, unknown> | null;
  telemetry?: Record<string, unknown> | null;
}

export type { IpcMainInvokeEvent, BrowserWindow } from "electron";

export type { ServerOptions, ServerInfo } from "./server.ts";
export type { ErrorHint, MatchedHint } from "./error-patterns.ts";
export type { PathConfig, PathResolver } from "./paths.js";
