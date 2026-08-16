export * from "@shared/index.js";

import type { LogEntry } from "@shared/logging-core.js";

export interface LogBatchPayload {
  entries: LogEntry[];
  sessionId: string;
  batchTimestamp: string;
  processSource: "renderer" | "main";
}

export interface LogOperationResult {
  success: boolean;
  message?: string;
  entriesWritten?: number;
  hint?: {
    category: string;
    suggestion: string;
    documentationLink?: string;
    fixCommand?: string;
  } | null;
}

export interface LogWriterConfig {
  sessionDir: string;
  enableStructuredLog: boolean;
  enableConsoleLog: boolean;
  enableErrorLog: boolean;
  enablePerformanceLog: boolean;
  compressionEnabled: boolean;
  maxFileSize: number;
}

export interface LogReaderOptions {
  sessionId?: string;
  tail?: number;
  follow?: boolean;
  filter?: {
    level?: string[];
    category?: string[];
    contains?: string;
    correlationId?: string;
  };
}
export type { SessionEndReason, SessionMeta, SessionStats, SessionSummary } from "./index.js";
