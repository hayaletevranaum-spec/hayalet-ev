import { existsSync, watch } from "node:fs";
import { dirname } from "node:path";
import type { WebContents } from "electron";
import Database, { type BetterSqlite3Database } from "./native/better-sqlite3.js";
import { resolveOpencodeUiDbPath } from "./opencode-ui-session-store.ts";

const SESSION_UPDATED_CHANNEL = "opencode-ui:session-updated";

type WatchEntry = {
  webContents: WebContents;
  sessionId: string;
  dbPath: string;
  lastToken: string | null;
  debounceTimer: NodeJS.Timeout | null;
  pollTimer: NodeJS.Timeout | null;
  watchers: Array<ReturnType<typeof watch>>;
};

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readSessionChangeToken(dbPath: string, sessionId: string): string | null {
  if (sessionId.trim() === "" || !existsSync(dbPath)) {
    return null;
  }

  const db: BetterSqlite3Database = new Database(dbPath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    const pragmaRow = db.prepare("PRAGMA data_version").get() as
      { data_version?: unknown } | undefined;
    const dataVersion = safeNumber(pragmaRow?.data_version);

    const sessionRow = db
      .prepare("SELECT COALESCE(time_updated, 0) AS updated FROM session WHERE id = ? LIMIT 1")
      .get(sessionId) as { updated?: unknown } | undefined;

    const sessionUpdated = safeNumber(sessionRow?.updated);

    return `${dataVersion}:${sessionUpdated}`;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

function createWatchTargets(dbPath: string): string[] {
  // NOTE: SQLite WAL mode updates can hit -wal/-shm more often than the main db.
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
}

export class OpencodeUiSessionWatcherRegistry {
  private entries = new Map<number, WatchEntry>();

  stop(webContents: WebContents): void {
    const existing = this.entries.get(webContents.id);
    if (!existing) return;

    if (existing.debounceTimer) {
      clearTimeout(existing.debounceTimer);
    }
    if (existing.pollTimer) {
      clearInterval(existing.pollTimer);
    }
    for (const watcher of existing.watchers) {
      try {
        watcher.close();
      } catch {}
    }

    this.entries.delete(webContents.id);
  }

  start(webContents: WebContents, sessionId: string, dbPathArg?: string): void {
    const normalizedSessionId = safeString(sessionId).trim();
    if (normalizedSessionId === "") {
      this.stop(webContents);
      return;
    }

    const resolvedDbPath = resolveOpencodeUiDbPath(
      typeof dbPathArg === "string" && dbPathArg.trim() !== "" ? { dbPath: dbPathArg.trim() } : {}
    );

    const existing = this.entries.get(webContents.id);
    if (existing?.sessionId === normalizedSessionId && existing.dbPath === resolvedDbPath) {
      return;
    }

    this.stop(webContents);

    const entry: WatchEntry = {
      webContents,
      sessionId: normalizedSessionId,
      dbPath: resolvedDbPath,
      lastToken: null,
      debounceTimer: null,
      pollTimer: null,
      watchers: [],
    };

    const scheduleCheck = (): void => {
      if (entry.debounceTimer) return;
      entry.debounceTimer = setTimeout(() => {
        entry.debounceTimer = null;
        this.checkAndNotify(entry);
      }, 120);
    };

    // NOTE: Best-effort watchers: file targets and parent directory.
    for (const target of createWatchTargets(entry.dbPath)) {
      try {
        if (!existsSync(target)) continue;
        const watcher = watch(target, { persistent: false }, () => {
          scheduleCheck();
        });
        entry.watchers.push(watcher);
      } catch {}
    }

    try {
      const watcher = watch(dirname(entry.dbPath), { persistent: false }, () => {
        scheduleCheck();
      });
      entry.watchers.push(watcher);
    } catch {}

    // NOTE: Fallback poll to avoid missing events on platforms where fs.watch is flaky.
    entry.pollTimer = setInterval(() => {
      scheduleCheck();
    }, 2000);

    // NOTE: Prime token and send an initial "updated" to let UI catch up without interval polling.
    scheduleCheck();

    webContents.once("destroyed", () => {
      this.stop(webContents);
    });

    this.entries.set(webContents.id, entry);
  }

  private checkAndNotify(entry: WatchEntry): void {
    const token = readSessionChangeToken(entry.dbPath, entry.sessionId);
    if (token == null) return;

    if (entry.lastToken === token) return;
    entry.lastToken = token;

    try {
      entry.webContents.send(SESSION_UPDATED_CHANNEL, { sessionId: entry.sessionId });
    } catch {}
  }
}
