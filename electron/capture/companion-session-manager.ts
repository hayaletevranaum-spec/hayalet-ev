import { appendFile, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { Paths } from "../paths.ts";
import { createSessionId } from "../logger/session-context.ts";
import type { CompanionDiagnosticsShadowSnapshot } from "./types-and-defaults.ts";

export const COMPANION_SESSION_TIMEOUT_MS = 60_000;
const COMPANION_TIMEOUT_CHECK_INTERVAL_MS = 15_000;

interface CompanionSessionRecord {
  sessionId: string;
  sessionDir: string;
  deviceId: string;
  startTime: string;
  lastReceivedAt: number;
  structuredLogPath: string;
  consoleLogPath: string;
  totalLogs: number;
  errors: number;
  warnings: number;
}

export class CompanionSessionManager {
  private sessions = new Map<string, CompanionSessionRecord>();
  private timeoutTimer: ReturnType<typeof setInterval> | null = null;

  startTimeoutChecker(): void {
    this.timeoutTimer ??= setInterval(() => {
      void this.checkTimeouts();
    }, COMPANION_TIMEOUT_CHECK_INTERVAL_MS);
  }

  stopTimeoutChecker(): void {
    if (this.timeoutTimer !== null) {
      clearInterval(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  async handleSnapshot(snapshot: CompanionDiagnosticsShadowSnapshot): Promise<void> {
    const { deviceId } = snapshot;
    let record = this.sessions.get(deviceId);

    record ??= await this.createSession(deviceId);
    record.lastReceivedAt = Date.now();

    const writes: Promise<void>[] = [];

    for (const entry of snapshot.logEntries) {
      const timestamp =
        entry.timestampMs !== null
          ? new Date(entry.timestampMs).toISOString()
          : new Date().toISOString();
      const level = entry.level.toLowerCase();
      const message = entry.details !== null ? `${entry.message}\n${entry.details}` : entry.message;

      const structuredEntry = {
        timestamp,
        level,
        source: "android-companion",
        category: entry.category.toLowerCase(),
        message,
        context: { deviceId },
      };
      writes.push(
        appendFile(record.structuredLogPath, `${JSON.stringify(structuredEntry)}\n`, "utf8").catch(
          () => {}
        )
      );

      const consoleLevel = entry.level.padEnd(5);
      const consoleLine = `[${timestamp}] [${consoleLevel}] [ANDROID-COMPANION] [${entry.category.toUpperCase()}] ${message}\n`;
      writes.push(appendFile(record.consoleLogPath, consoleLine, "utf8").catch(() => {}));

      record.totalLogs += 1;
      if (entry.level === "ERROR") record.errors += 1;
      if (entry.level === "WARN") record.warnings += 1;
    }

    if (snapshot.stateEntries.length > 0) {
      const timestamp = new Date().toISOString();
      const stateSummary = snapshot.stateEntries.map((e) => `${e.key}=${e.value}`).join(", ");
      const structuredEntry = {
        timestamp,
        level: "info",
        source: "android-companion",
        category: "companion-state",
        message: `State snapshot: ${stateSummary}`,
        context: { deviceId, stateEntryCount: snapshot.stateEntries.length },
      };
      writes.push(
        appendFile(record.structuredLogPath, `${JSON.stringify(structuredEntry)}\n`, "utf8").catch(
          () => {}
        )
      );
    }

    await Promise.all(writes);
  }

  private async createSession(deviceId: string): Promise<CompanionSessionRecord> {
    const sessionId = createSessionId();
    const baseDir = join(Paths.getLogsDir(), "android-companion");
    const sessionDir = join(baseDir, sessionId);
    const startTime = new Date().toISOString();

    await mkdir(sessionDir, { recursive: true });

    const metadata = {
      sessionId,
      startTime,
      app: "android-companion",
      deviceId,
      pid: process.pid,
      platform: process.platform,
      nodeVersion: process.version,
    };
    await writeFile(
      join(sessionDir, "session-metadata.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
      "utf8"
    );

    const record: CompanionSessionRecord = {
      sessionId,
      sessionDir,
      deviceId,
      startTime,
      lastReceivedAt: Date.now(),
      structuredLogPath: join(sessionDir, "structured.jsonl"),
      consoleLogPath: join(sessionDir, "console-001.log"),
      totalLogs: 0,
      errors: 0,
      warnings: 0,
    };

    this.sessions.set(deviceId, record);
    return record;
  }

  private async closeSession(deviceId: string): Promise<void> {
    const record = this.sessions.get(deviceId);
    if (record === undefined) return;

    this.sessions.delete(deviceId);

    const endTime = new Date().toISOString();
    const duration = Date.now() - new Date(record.startTime).getTime();
    const summary = {
      sessionId: record.sessionId,
      startTime: record.startTime,
      endTime,
      endReason: "timeout",
      duration,
      stats: {
        totalLogs: record.totalLogs,
        errorCount: record.errors,
        warningCount: record.warnings,
        byDevice: { [record.deviceId]: record.totalLogs },
      },
    };

    await writeFile(
      join(record.sessionDir, "summary.json"),
      `${JSON.stringify(summary, null, 2)}\n`,
      "utf8"
    );
  }

  private async checkTimeouts(): Promise<void> {
    const now = Date.now();
    const timeouts: string[] = [];
    for (const [deviceId, record] of this.sessions) {
      if (now - record.lastReceivedAt > COMPANION_SESSION_TIMEOUT_MS) {
        timeouts.push(deviceId);
      }
    }
    const closeTasks: Promise<void>[] = [];
    for (const id of timeouts) {
      closeTasks.push(this.closeSession(id));
    }
    await Promise.all(closeTasks);
  }

  async shutdownAll(): Promise<void> {
    this.stopTimeoutChecker();
    const devices = Array.from(this.sessions.keys());
    const closeTasks: Promise<void>[] = [];
    for (const id of devices) {
      closeTasks.push(this.closeSession(id));
    }
    await Promise.all(closeTasks);
  }

  getActiveSessions(): { deviceId: string; sessionId: string; totalLogs: number }[] {
    return Array.from(this.sessions.entries()).map(([deviceId, record]) => ({
      deviceId,
      sessionId: record.sessionId,
      totalLogs: record.totalLogs,
    }));
  }
}

export const companionSessionManager = new CompanionSessionManager();
