// NOTE: Per-account SQLite archive at data/{email}_{provider}/archive.db.

import Database, { type BetterSqlite3Database } from "../native/better-sqlite3.js";
import { join } from "path";
import { mkdirSync } from "fs";
import { getLoggerCore } from "../logger/index.js";
import { Paths } from "../paths.ts";
import { LogCategory, LogLevel } from "@shared/index.js";

const logger = getLoggerCore();

type AccountKey = string;

interface DatabaseInstance {
  db: BetterSqlite3Database;
  accountId: string;
  accountFolder: string;
  lastAccessed: number;
}

const databasePool = new Map<AccountKey, DatabaseInstance>();

function hasColumn(db: BetterSqlite3Database, tableName: string, columnName: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function ensureConversationSchema(db: BetterSqlite3Database): void {
  const addedTitleSource = !hasColumn(db, "conversations", "title_source");
  if (addedTitleSource) {
    db.exec("ALTER TABLE conversations ADD COLUMN title_source TEXT NOT NULL DEFAULT 'system'");
  }

  if (addedTitleSource) {
    db.exec(`
      UPDATE conversations
      SET title_source = CASE
        WHEN title IS NULL OR trim(title) = '' THEN 'system'
        WHEN title GLOB 'Sohbet [0-9][0-9][0-9]*' THEN 'system'
        ELSE 'user'
      END
    `);
    return;
  }

  db.exec(`
    UPDATE conversations
    SET title_source = CASE
      WHEN title IS NULL OR trim(title) = '' THEN 'system'
      WHEN title GLOB 'Sohbet [0-9][0-9][0-9]*' THEN 'system'
      ELSE 'user'
    END
    WHERE title_source IS NULL OR trim(title_source) = ''
  `);
}

function ensureMessageSchema(db: BetterSqlite3Database): void {
  if (!hasColumn(db, "messages", "broker_message_id")) {
    db.exec("ALTER TABLE messages ADD COLUMN broker_message_id TEXT");
  }
  if (!hasColumn(db, "messages", "provider_message_id")) {
    db.exec("ALTER TABLE messages ADD COLUMN provider_message_id TEXT");
  }
  if (!hasColumn(db, "messages", "client_request_id")) {
    db.exec("ALTER TABLE messages ADD COLUMN client_request_id TEXT");
  }
  if (!hasColumn(db, "messages", "event_seq")) {
    db.exec("ALTER TABLE messages ADD COLUMN event_seq INTEGER");
  }
  if (!hasColumn(db, "messages", "projection_event_seq")) {
    db.exec("ALTER TABLE messages ADD COLUMN projection_event_seq INTEGER");
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_msg_event_seq ON messages(conversation_id, event_seq);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_broker_identity
    ON messages(conversation_id, broker_message_id)
    WHERE broker_message_id IS NOT NULL AND broker_message_id != '';
    CREATE INDEX IF NOT EXISTS idx_msg_provider_identity
    ON messages(conversation_id, provider_message_id);
  `);
}

function ensureMessageEventSchema(db: BetterSqlite3Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_events (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      broker_message_id TEXT,
      provider_message_id TEXT,
      client_request_id TEXT,
      event_seq INTEGER NOT NULL,
      role TEXT,
      author TEXT,
      content TEXT,
      dom_index INTEGER,
      dom_id TEXT,
      content_hash TEXT,
      projection_event_seq INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_msg_events_conversation_seq
    ON message_events(conversation_id, event_seq ASC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_msg_events_broker_identity
    ON message_events(conversation_id, broker_message_id)
    WHERE broker_message_id IS NOT NULL AND broker_message_id != '';
    CREATE INDEX IF NOT EXISTS idx_msg_events_provider_identity
    ON message_events(conversation_id, provider_message_id);
  `);
}

function initializeSchema(db: BetterSqlite3Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      web_url TEXT NOT NULL,
      provider TEXT,
      title TEXT,
      title_source TEXT NOT NULL DEFAULT 'system',
      summary TEXT,
      message_count INTEGER DEFAULT 0,
      last_message_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_conv_account ON conversations(account_id);
    CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC);
  `);

  ensureConversationSchema(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      role TEXT,
      author TEXT,
      content TEXT,
      dom_index INTEGER,
      dom_id TEXT,
      content_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_msg_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_msg_account ON messages(account_id);
    CREATE INDEX IF NOT EXISTS idx_msg_content ON messages(content);
    CREATE INDEX IF NOT EXISTS idx_msg_dom ON messages(conversation_id, dom_index);
  `);

  ensureMessageSchema(db);
  ensureMessageEventSchema(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      original_name TEXT,
      stored_name TEXT,
      stored_path TEXT,
      mime_type TEXT,
      size INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_attach_message ON attachments(message_id);
    CREATE INDEX IF NOT EXISTS idx_attach_conversation ON attachments(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_attach_account ON attachments(account_id);
  `);

  db.exec("PRAGMA foreign_keys = ON");
}

export function getDatabaseForAccount(accountId: string): BetterSqlite3Database {
  const existing = databasePool.get(accountId);
  if (existing !== undefined) {
    existing.lastAccessed = Date.now();
    return existing.db;
  }

  const accountPath = Paths.getAccountDir(accountId);
  const dbPath = Paths.getAccountDbPath(accountId);

  mkdirSync(accountPath, { recursive: true });

  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL");

  initializeSchema(db);

  databasePool.set(accountId, {
    db,
    accountId,
    accountFolder: accountPath,
    lastAccessed: Date.now(),
  });

  return db;
}

export function getAccountFolder(accountId: string): string {
  return Paths.getAccountDir(accountId);
}

export function closeDatabaseForAccount(accountId: string): void {
  const instance = databasePool.get(accountId);
  if (instance !== undefined) {
    try {
      instance.db.close();
    } catch (err) {
      void logger.logInternal(
        LogCategory.DATABASE,
        LogLevel.ERROR,
        `Failed to close database for ${accountId}`,
        { error: err }
      );
    }
    databasePool.delete(accountId);
  }
}

export function closeAllDatabases(): void {
  for (const [accountId, instance] of databasePool) {
    try {
      instance.db.close();
    } catch (err) {
      void logger.logInternal(
        LogCategory.DATABASE,
        LogLevel.ERROR,
        `Failed to close database for ${accountId}`,
        { error: err }
      );
    }
  }
  databasePool.clear();
}

export function getAttachmentPath(
  accountId: string,
  conversationId: string,
  messageId: string,
  filename: string
): string {
  const accountPath = getAccountFolder(accountId);
  return join(accountPath, conversationId, messageId, filename);
}

export function ensureAttachmentDir(
  accountId: string,
  conversationId: string,
  messageId: string
): string {
  const accountPath = getAccountFolder(accountId);
  const dir = join(accountPath, conversationId, messageId);
  mkdirSync(dir, { recursive: true });
  return dir;
}
