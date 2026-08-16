// NOTE: Per-account mail metadata sidecar at data/{email}_{provider}/mail-sidecar.db.

import Database, { type BetterSqlite3Database } from "../native/better-sqlite3.js";
import { mkdirSync } from "fs";
import { Paths } from "../paths.ts";

type AccountKey = string;

interface MailSidecarDatabaseInstance {
  db: BetterSqlite3Database;
  accountId: string;
  accountFolder: string;
  lastAccessed: number;
}

const mailSidecarPool = new Map<AccountKey, MailSidecarDatabaseInstance>();

function hasColumn(db: BetterSqlite3Database, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function logCloseFailure(accountId: string, error: unknown): void {
  console.error(`Failed to close mail sidecar database for ${accountId}`, error);
}

function initializeSchema(db: BetterSqlite3Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_session_map (
      remote_user_id TEXT NOT NULL,
      local_session_id TEXT NOT NULL,
      thread_message_id TEXT,
      last_message_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (remote_user_id, local_session_id)
    );

    CREATE INDEX IF NOT EXISTS idx_mail_session_map_remote_user
      ON mail_session_map(remote_user_id);
    CREATE INDEX IF NOT EXISTS idx_mail_session_map_thread_message
      ON mail_session_map(thread_message_id);

    CREATE TABLE IF NOT EXISTS mail_message_meta (
      transport_message_id TEXT PRIMARY KEY,
      local_message_id TEXT NOT NULL,
      delivery_state TEXT NOT NULL,
      headers_hash TEXT NOT NULL,
      metadata_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mail_message_meta_local_message
      ON mail_message_meta(local_message_id);
    CREATE INDEX IF NOT EXISTS idx_mail_message_meta_delivery_state
      ON mail_message_meta(delivery_state);

    CREATE TABLE IF NOT EXISTS mail_sync_cursor (
      mail_account_id TEXT PRIMARY KEY,
      cursor TEXT,
      last_sync INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mail_receipt_ledger (
      transport_message_id TEXT PRIMARY KEY,
      processed_at INTEGER NOT NULL,
      checksum TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_mail_receipt_ledger_checksum
      ON mail_receipt_ledger(checksum);

    PRAGMA foreign_keys = ON;
  `);

  if (!hasColumn(db, "mail_message_meta", "metadata_json")) {
    db.exec("ALTER TABLE mail_message_meta ADD COLUMN metadata_json TEXT");
  }
}

export function getMailSidecarDatabaseForAccount(accountId: string): BetterSqlite3Database {
  const existing = mailSidecarPool.get(accountId);
  if (existing !== undefined) {
    existing.lastAccessed = Date.now();
    return existing.db;
  }

  const accountPath = Paths.getAccountDir(accountId);
  const dbPath = Paths.getAccountMailSidecarDbPath(accountId);

  mkdirSync(accountPath, { recursive: true });

  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL");

  initializeSchema(db);

  mailSidecarPool.set(accountId, {
    db,
    accountId,
    accountFolder: accountPath,
    lastAccessed: Date.now(),
  });

  return db;
}

export function closeMailSidecarDatabaseForAccount(accountId: string): void {
  const instance = mailSidecarPool.get(accountId);
  if (instance !== undefined) {
    try {
      instance.db.close();
    } catch (err) {
      logCloseFailure(accountId, err);
    }
    mailSidecarPool.delete(accountId);
  }
}

export function closeAllMailSidecarDatabases(): void {
  for (const [accountId, instance] of mailSidecarPool) {
    try {
      instance.db.close();
    } catch (err) {
      logCloseFailure(accountId, err);
    }
  }
  mailSidecarPool.clear();
}
