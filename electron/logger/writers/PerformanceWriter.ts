import { join } from "path";
import { appendFile, mkdir } from "fs/promises";
import type { LogEntry } from "@shared/index.js";
import type { LogWriterConfig } from "@electron/types/logging.js";
import { loggerWriterT } from "./i18n.ts";

interface PerformanceEntry {
  timestamp: string;
  category: string;
  operation?: string;
  correlationId?: string;
  duration?: number;
  memoryUsage?: number;
  context?: Record<string, unknown>;
}

export class PerformanceWriter {
  private config: LogWriterConfig;
  private filePath: string = "";
  private dirReady: boolean = false;

  constructor(config: LogWriterConfig) {
    this.config = config;
    this.updateFilePath();
  }

  public updateConfig(config: LogWriterConfig): void {
    this.config = config;
    this.updateFilePath();
  }

  private updateFilePath(): void {
    const sessionDir = this.config.sessionDir.trim();
    this.filePath = sessionDir === "" ? "" : join(sessionDir, "performance.jsonl");
    this.dirReady = false;
  }

  public async write(entry: LogEntry): Promise<void> {
    if (!this.config.enablePerformanceLog) return;
    const hasDuration = typeof entry.context?.duration === "number";
    const hasMemoryUsage = typeof entry.context?.memoryUsage === "number";
    if (!hasDuration && !hasMemoryUsage) return;
    const sessionDir = this.config.sessionDir.trim();
    if (sessionDir === "" || this.filePath === "") return;

    try {
      if (!this.dirReady) {
        await mkdir(sessionDir, { recursive: true });
        this.dirReady = true;
      }
      const perfEntry: PerformanceEntry = {
        timestamp: entry.timestamp,
        category: String(entry.category),
        ...(typeof entry.context?.operationName === "string"
          ? { operation: entry.context.operationName }
          : {}),
        ...(typeof entry.correlationId === "string" ? { correlationId: entry.correlationId } : {}),
        ...(typeof entry.context?.duration === "number"
          ? { duration: entry.context.duration }
          : {}),
        ...(typeof entry.context?.memoryUsage === "number"
          ? { memoryUsage: entry.context.memoryUsage }
          : {}),
        ...(entry.context != null ? { context: entry.context } : {}),
      };

      const line = JSON.stringify(perfEntry) + "\n";
      await appendFile(this.filePath, line, "utf-8");
    } catch (error) {
      console.error(
        await loggerWriterT("writerWriteFailed", {
          writer: "PerformanceWriter",
          message: error instanceof Error ? error.message : String(error),
        })
      );
      throw error;
    }
  }

  public async flush(): Promise<void> {}
}
