import { join } from "path";
import { appendFile, mkdir } from "fs/promises";
import type { LogEntry } from "@shared/index.js";
import type { LogWriterConfig } from "@electron/types/logging.js";
import { LogLevel } from "@shared/index.js";
import { loggerWriterT } from "./i18n.ts";

export class ErrorWriter {
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
    this.filePath = sessionDir === "" ? "" : join(sessionDir, "error.log");
    this.dirReady = false;
  }

  public async write(entry: LogEntry): Promise<void> {
    if (!this.config.enableErrorLog) return;
    if (entry.level !== LogLevel.ERROR) return;
    const sessionDir = this.config.sessionDir.trim();
    if (sessionDir === "" || this.filePath === "") return;

    try {
      if (!this.dirReady) {
        await mkdir(sessionDir, { recursive: true });
        this.dirReady = true;
      }
      const line = this.formatError(entry);
      await appendFile(this.filePath, line + "\n\n", "utf-8");
    } catch (error) {
      console.error(
        await loggerWriterT("writerWriteFailed", {
          writer: "ErrorWriter",
          message: error instanceof Error ? error.message : String(error),
        })
      );
      throw error;
    }
  }

  private formatError(entry: LogEntry): string {
    const lines: string[] = [];

    lines.push(`[${entry.timestamp}] ERROR in ${entry.category}`);
    lines.push(`Message: ${entry.message}`);

    if (entry.context != null) {
      lines.push(`Context: ${JSON.stringify(entry.context, null, 2)}`);
    }

    if (entry.error != null) {
      lines.push(`Error Type: ${entry.error.name}`);
      if (entry.error.code != null && entry.error.code !== "") {
        lines.push(`Error Code: ${entry.error.code}`);
      }
      if (entry.error.stack != null && entry.error.stack !== "") {
        lines.push(`Stack Trace:\n${entry.error.stack}`);
      }
    }

    if (entry.aiHint != null) {
      lines.push(`\n🤖 AI Hint: ${entry.aiHint.category}`);
      lines.push(`   Suggestion: ${entry.aiHint.suggestion}`);
      if (entry.aiHint.fixCommand != null && entry.aiHint.fixCommand !== "") {
        lines.push(`   Fix Command: ${entry.aiHint.fixCommand}`);
      }
    }

    if (entry.correlationId != null && entry.correlationId !== "") {
      lines.push(`Correlation ID: ${entry.correlationId}`);
    }

    return lines.join("\n");
  }

  public async flush(): Promise<void> {}
}
