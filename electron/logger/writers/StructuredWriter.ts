import { join } from "path";
import { appendFile, mkdir } from "fs/promises";
import type { LogEntry } from "@shared/index.js";
import type { LogWriterConfig } from "@electron/types/logging.js";
import { loggerWriterT } from "./i18n.ts";

export class StructuredWriter {
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
    this.filePath = sessionDir === "" ? "" : join(sessionDir, "structured.jsonl");
    this.dirReady = false;
  }

  public async write(entry: LogEntry): Promise<void> {
    if (!this.config.enableStructuredLog) return;
    const sessionDir = this.config.sessionDir.trim();
    if (sessionDir === "" || this.filePath === "") return;

    try {
      if (!this.dirReady) {
        await mkdir(sessionDir, { recursive: true });
        this.dirReady = true;
      }
      const line = JSON.stringify(entry) + "\n";
      await appendFile(this.filePath, line, "utf-8");
    } catch (error) {
      console.error(
        await loggerWriterT("writerWriteFailed", {
          writer: "StructuredWriter",
          message: error instanceof Error ? error.message : String(error),
        })
      );
      throw error;
    }
  }

  public async flush(): Promise<void> {}
}
