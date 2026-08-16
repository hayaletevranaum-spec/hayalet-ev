import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import type { LogEntry } from "@shared/index.js";
import type { LogReaderOptions } from "@electron/types/logging.js";

export class LogReader {
  private sessionDir: string;

  constructor(sessionDir: string) {
    this.sessionDir = sessionDir;
  }

  public async read(options: LogReaderOptions = {}): Promise<LogEntry[]> {
    const structuredPath = join(this.sessionDir, "structured.jsonl");

    if (!existsSync(structuredPath)) {
      return [];
    }

    const content = await readFile(structuredPath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim().length > 0);

    let entries: LogEntry[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as LogEntry;
        entries.push(entry);
      } catch {}
    }

    if (options.filter != null) {
      entries = this.applyFilters(entries, options.filter);
    }

    if (options.tail != null && options.tail > 0) {
      entries = entries.slice(-options.tail);
    }

    return entries;
  }

  private applyFilters(entries: LogEntry[], filter: LogReaderOptions["filter"]): LogEntry[] {
    let filtered = entries;

    const levelFilter = filter?.level;
    if (levelFilter != null && levelFilter.length > 0) {
      filtered = filtered.filter((e) => levelFilter.includes(e.level));
    }

    const categoryFilter = filter?.category;
    if (categoryFilter != null && categoryFilter.length > 0) {
      filtered = filtered.filter((e) => categoryFilter.includes(String(e.category)));
    }

    const containsFilter = filter?.contains;
    if (containsFilter != null && containsFilter.length > 0) {
      const search = containsFilter.toLowerCase();
      filtered = filtered.filter((e) => e.message.toLowerCase().includes(search));
    }

    const correlationIdFilter = filter?.correlationId;
    if (correlationIdFilter != null && correlationIdFilter.length > 0) {
      filtered = filtered.filter((e) => e.correlationId === correlationIdFilter);
    }

    return filtered;
  }

  public async readErrors(): Promise<LogEntry[]> {
    return await this.read({
      filter: { level: ["error"] },
    });
  }

  public async readByCorrelation(correlationId: string): Promise<LogEntry[]> {
    return await this.read({
      filter: { correlationId },
    });
  }
}
