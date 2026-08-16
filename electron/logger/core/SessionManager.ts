import { join } from "path";
import { mkdir, writeFile, readdir, stat, rm } from "fs/promises";
import { existsSync } from "fs";
import { Paths } from "../../paths.ts";
import type { SessionStats } from "./session-stats.js";
import { translateElectronMessage } from "../../i18n/language-service.ts";
import {
  buildSessionMeta,
  buildSessionSummary,
  createSessionId,
  SESSION_META_FILENAME,
  SESSION_SUMMARY_FILENAME,
} from "../session-context.ts";

async function loggerT(key: string, params?: Record<string, string | number>): Promise<string> {
  return await translateElectronMessage(`electron.logger.${key}`, params);
}

export class SessionManager {
  private sessionId: string = "";
  private sessionDir: string = "";
  private logDir: string = "";
  private sessionStartTime: number = 0;

  public async init(customLogDir?: string): Promise<void> {
    this.logDir = customLogDir ?? Paths.getMainAppLogsDir();
    this.sessionId = createSessionId();
    this.sessionDir = join(this.logDir, this.sessionId);
    this.sessionStartTime = Date.now();

    if (!existsSync(this.sessionDir)) {
      await mkdir(this.sessionDir, { recursive: true });
    }

    await this.writeSessionMetadata();

    this.cleanupOldSessions().catch((err) => {
      void loggerT("logs.cleanupFailed", {
        message: err instanceof Error ? err.message : String(err),
      }).then((message) => {
        console.error(message);
      });
    });
  }

  private async writeSessionMetadata(): Promise<void> {
    const metadata = buildSessionMeta({
      sessionId: this.sessionId,
      startTime: new Date(this.sessionStartTime).toISOString(),
      appVersion: process.env["npm_package_version"] ?? "unknown",
      pid: process.pid,
    });

    const metadataPath = join(this.sessionDir, SESSION_META_FILENAME);
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf-8");
  }

  public async closeSession(stats?: SessionStats): Promise<void> {
    try {
      const endTime = Date.now();
      const duration = endTime - this.sessionStartTime;
      const totalLogs = stats?.totalLogs ?? 0;
      const durationSeconds = duration > 0 ? duration / 1000 : 0;

      const summary = buildSessionSummary({
        sessionId: this.sessionId,
        startTime: new Date(this.sessionStartTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        endReason: "normal",
        duration,
        stats: {
          totalLogs,
          byLevel: stats?.byLevel ?? {},
          byCategory: stats?.byCategory ?? {},
          errorCount: stats?.errorCount ?? 0,
          warningCount: stats?.warningCount ?? 0,
        },
        performance: {
          averageLogRate: durationSeconds > 0 ? totalLogs / durationSeconds : 0,
        },
      });
      const summaryPath = join(this.sessionDir, SESSION_SUMMARY_FILENAME);
      await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
    } catch (error) {
      console.error(
        await loggerT("logs.summaryGenerateFailed", {
          message: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  private async cleanupOldSessions(): Promise<void> {
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    try {
      const entries = await readdir(this.logDir);
      const staleSessions = await Promise.all(
        entries.map(async (entry) => {
          const sessionPath = join(this.logDir, entry);
          const stats = await stat(sessionPath);
          return stats.isDirectory() && now - stats.mtimeMs > maxAge
            ? { entry, sessionPath }
            : null;
        })
      );
      await Promise.all(
        staleSessions
          .filter((item): item is { entry: string; sessionPath: string } => item !== null)
          .map(async ({ sessionPath }) => {
            await rm(sessionPath, { recursive: true, force: true });
          })
      );
    } catch (error) {
      console.error(
        await loggerT("logs.cleanupError", {
          message: error instanceof Error ? error.message : String(error),
        })
      );
    }
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public getSessionDir(): string {
    return this.sessionDir;
  }

  public getLogDir(): string {
    return this.logDir;
  }
}
