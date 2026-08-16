import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database, { type BetterSqlite3Database } from "./native/better-sqlite3.js";
import {
  aggregateUsage,
  extractChangedFiles,
  extractLatestTodos,
  parseMessages,
} from "./opencode-ui-session/parser.ts";
import {
  asNullableTimestamp,
  asNumber,
  asString,
  normalizeSlug,
} from "./opencode-ui-session/shared.ts";
import type {
  MessageRow,
  OpencodeUiArchiveSessionResult,
  OpencodeUiEnsureSessionResult,
  OpencodeUiListSessionsResult,
  OpencodeUiReadSessionResult,
  OpencodeUiSessionSummary,
  OpencodeUiStoreOptions,
  PartRow,
  SessionRow,
} from "./opencode-ui-session/types.ts";
import { readElectronAppLanguageSync } from "./i18n/language-service.ts";
import { getBuiltInLanguagePack } from "../shared/i18n/bundled-languages.ts";
import { translateCatalog } from "../shared/i18n/catalog.ts";
import { DEFAULT_APP_LANGUAGE } from "../src/types/i18n.ts";
export type {
  OpencodeUiArchiveSessionResult,
  OpencodeUiEnsureSessionResult,
  OpencodeUiListSessionsResult,
  OpencodeUiReadSessionResult,
  OpencodeUiSessionDetail,
  OpencodeUiSessionMessage,
  OpencodeUiSessionSummary,
  OpencodeUiStoreOptions,
  OpencodeUiTodoItem,
  OpencodeUiToolCall,
} from "./opencode-ui-session/types.ts";

function getDefaultOpencodeDbPath(): string {
  if (process.platform === "win32") {
    const localAppData = process.env["LOCALAPPDATA"]?.trim();
    return localAppData !== undefined && localAppData !== ""
      ? join(localAppData, "opencode", "opencode.db")
      : join(homedir(), "AppData", "Local", "opencode", "opencode.db");
  }

  return join(homedir(), ".local", "share", "opencode", "opencode.db");
}

const DEFAULT_OPENCODE_DB_PATH = getDefaultOpencodeDbPath();

function opencodeUiSessionStoreT(key: string, params?: Record<string, string | number>): string {
  const locale = readElectronAppLanguageSync();
  const activeCatalog =
    getBuiltInLanguagePack(locale)?.catalog ??
    getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE)?.catalog;
  const fallbackCatalog = getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE)?.catalog;

  return translateCatalog(
    activeCatalog ?? fallbackCatalog ?? {},
    `electron.opencodeUiSessionStore.${key}`,
    params,
    fallbackCatalog
  );
}

export function resolveOpencodeUiDbPath(options?: OpencodeUiStoreOptions): string {
  const candidate = options?.dbPath;
  if (typeof candidate === "string" && candidate.trim() !== "") {
    const trimmed = candidate.trim();
    if (trimmed === "~") {
      return homedir();
    }
    if (trimmed.startsWith("~/")) {
      return join(homedir(), trimmed.slice(2));
    }
    return trimmed;
  }
  return DEFAULT_OPENCODE_DB_PATH;
}

function sessionTableHasWorkspaceId(db: BetterSqlite3Database): boolean {
  try {
    const rows = db.prepare("PRAGMA table_info(session)").all() as Array<{ name?: unknown }>;
    return rows.some((row) => asString(row.name) === "workspace_id");
  } catch {
    return false;
  }
}

export function listOpencodeUiSessions(
  options?: OpencodeUiStoreOptions
): OpencodeUiListSessionsResult {
  const dbPath = resolveOpencodeUiDbPath(options);
  if (!existsSync(dbPath)) {
    return { success: false, error: opencodeUiSessionStoreT("dbNotFound", { dbPath }) };
  }

  const db = new Database(dbPath);

  try {
    const rows = db
      .prepare(
        `SELECT id, title, directory, time_created, time_updated, time_archived, project_id, version, workspace_id
         FROM session
         ORDER BY time_updated DESC`
      )
      .all() as unknown as SessionRow[];

    const sessions: OpencodeUiSessionSummary[] = [];
    for (const row of rows) {
      if (typeof row.id !== "string" || row.id.trim() === "") {
        continue;
      }

      sessions.push({
        id: row.id,
        title: asString(row.title, "Untitled"),
        workspace_path: asString(row.directory),
        updated_at: asNumber(row.time_updated),
        created_at: asNumber(row.time_created),
        archived_at: asNullableTimestamp(row.time_archived),
      });
    }

    return { success: true, sessions };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  } finally {
    db.close();
  }
}

export function archiveOpencodeUiSession(
  sessionId: string,
  archived = true,
  options?: OpencodeUiStoreOptions
): OpencodeUiArchiveSessionResult {
  const normalizedSessionId = sessionId.trim();
  if (normalizedSessionId === "") {
    return { success: false, error: opencodeUiSessionStoreT("sessionIdRequired") };
  }

  const dbPath = resolveOpencodeUiDbPath(options);
  if (!existsSync(dbPath)) {
    return { success: false, error: opencodeUiSessionStoreT("dbNotFound", { dbPath }) };
  }

  const db = new Database(dbPath);

  try {
    const now = options?.now?.() ?? Date.now();
    const result = db
      .prepare(
        `UPDATE session
         SET time_archived = ?, time_updated = ?
         WHERE id = ?`
      )
      .run(archived ? now : null, now, normalizedSessionId);

    if (Number(result.changes) < 1) {
      return {
        success: false,
        error: opencodeUiSessionStoreT("sessionNotFound", { sessionId: normalizedSessionId }),
      };
    }

    return { success: true, archived };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  } finally {
    db.close();
  }
}

export function ensureOpencodeUiSession(
  sessionId: string,
  title?: string,
  options?: OpencodeUiStoreOptions
): OpencodeUiEnsureSessionResult {
  const normalizedSessionId = sessionId.trim();
  if (normalizedSessionId === "") {
    return { success: false, error: opencodeUiSessionStoreT("sessionIdRequired") };
  }

  const dbPath = resolveOpencodeUiDbPath(options);
  if (!existsSync(dbPath)) {
    return { success: false, error: opencodeUiSessionStoreT("dbNotFound", { dbPath }) };
  }

  const db = new Database(dbPath);

  try {
    const existing = db
      .prepare("SELECT id FROM session WHERE id = ? LIMIT 1")
      .get(normalizedSessionId);
    if (existing !== undefined) {
      return { success: true, created: false };
    }

    const seedSession = db
      .prepare(
        `SELECT project_id, directory, version, workspace_id
         FROM session
         ORDER BY time_updated DESC
         LIMIT 1`
      )
      .get() as
      | {
          project_id?: unknown;
          directory?: unknown;
          version?: unknown;
          workspace_id?: unknown;
        }
      | undefined;

    const fallbackProject = db
      .prepare(
        `SELECT id, worktree
         FROM project
         ORDER BY time_updated DESC
         LIMIT 1`
      )
      .get() as
      | {
          id?: unknown;
          worktree?: unknown;
        }
      | undefined;

    const projectId = asString(seedSession?.project_id, asString(fallbackProject?.id));
    if (projectId === "") {
      return { success: false, error: opencodeUiSessionStoreT("projectInfoMissing") };
    }

    const directory = asString(
      seedSession?.directory,
      asString(fallbackProject?.worktree, homedir())
    );
    const version = asString(seedSession?.version, "1.0.0");
    const normalizedTitle =
      typeof title === "string" && title.trim() !== "" ? title.trim() : "Untitled";
    const now = options?.now?.() ?? Date.now();
    const slug = normalizeSlug(normalizedSessionId, normalizedTitle);

    if (sessionTableHasWorkspaceId(db)) {
      const workspaceId = asString(seedSession?.workspace_id, "");

      db.prepare(
        `INSERT INTO session (
          id,
          project_id,
          slug,
          directory,
          title,
          version,
          time_created,
          time_updated,
          workspace_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        normalizedSessionId,
        projectId,
        slug,
        directory,
        normalizedTitle,
        version,
        now,
        now,
        workspaceId === "" ? null : workspaceId
      );
    } else {
      db.prepare(
        `INSERT INTO session (
          id,
          project_id,
          slug,
          directory,
          title,
          version,
          time_created,
          time_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(normalizedSessionId, projectId, slug, directory, normalizedTitle, version, now, now);
    }

    return { success: true, created: true };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  } finally {
    db.close();
  }
}

export function readOpencodeUiSession(
  sessionId: string,
  options?: OpencodeUiStoreOptions
): OpencodeUiReadSessionResult {
  const normalizedSessionId = sessionId.trim();
  if (normalizedSessionId === "") {
    return { success: false, error: opencodeUiSessionStoreT("sessionIdRequired") };
  }

  const dbPath = resolveOpencodeUiDbPath(options);
  if (!existsSync(dbPath)) {
    return { success: false, error: opencodeUiSessionStoreT("dbNotFound", { dbPath }) };
  }

  const db = new Database(dbPath);

  try {
    const sessionRow = db
      .prepare(
        `SELECT id, title, directory, time_created, time_updated, time_archived, project_id, version, workspace_id
         FROM session
         WHERE id = ?
         LIMIT 1`
      )
      .get(normalizedSessionId) as SessionRow | undefined;

    if (sessionRow === undefined) {
      return {
        success: false,
        error: opencodeUiSessionStoreT("sessionNotFound", { sessionId: normalizedSessionId }),
      };
    }

    const messageRows = db
      .prepare(
        `SELECT id, data, time_created
         FROM message
         WHERE session_id = ?
         ORDER BY time_created ASC, time_updated ASC`
      )
      .all(normalizedSessionId) as unknown as MessageRow[];

    const partRows = db
      .prepare(
        `SELECT message_id, data, time_created
         FROM part
         WHERE session_id = ?
         ORDER BY time_created ASC, time_updated ASC`
      )
      .all(normalizedSessionId) as unknown as PartRow[];

    const messages = parseMessages(messageRows, partRows);

    return {
      success: true,
      session: {
        id: sessionRow.id,
        title: asString(sessionRow.title, "Untitled"),
        workspace_path: asString(sessionRow.directory),
        usage: aggregateUsage(messageRows, partRows),
        messages,
        todos: extractLatestTodos(partRows),
        changed_files: extractChangedFiles(partRows),
      },
    };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  } finally {
    db.close();
  }
}
