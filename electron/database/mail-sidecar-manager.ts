import type { BetterSqlite3Database } from "../native/better-sqlite3.js";
import { getMailSidecarDatabaseForAccount } from "./mail-sidecar-sqlite.js";

export interface MailSessionMapRecord {
  remoteUserId: string;
  localSessionId: string;
  threadMessageId: string | null;
  lastMessageId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface MailSessionMapWriteInput {
  remoteUserId: string;
  localSessionId: string;
  threadMessageId?: string | null;
  lastMessageId?: string | null;
}

export interface MailMessageMetaRecord {
  transportMessageId: string;
  localMessageId: string;
  deliveryState: string;
  headersHash: string;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export interface MailMessageMetaWriteInput {
  transportMessageId: string;
  localMessageId: string;
  deliveryState: string;
  headersHash: string;
  metadata?: Record<string, unknown> | null;
}

export interface MailSyncCursorRecord {
  mailAccountId: string;
  cursor: string | null;
  lastSync: number;
}

export interface MailSyncCursorUpdateInput {
  mailAccountId: string;
  cursor: string | null;
  lastSync?: number;
}

export interface MailReceiptLedgerRecord {
  transportMessageId: string;
  processedAt: number;
  checksum: string;
}

export interface MailReceiptLookupInput {
  transportMessageId?: string | null;
  checksum?: string | null;
}

export interface MailReceiptProcessedInput {
  transportMessageId: string;
  checksum: string;
  processedAt?: number;
}

interface MailSessionMapRow {
  remote_user_id: string;
  local_session_id: string;
  thread_message_id: string | null;
  last_message_id: string | null;
  created_at: number;
  updated_at: number;
}

interface MailMessageMetaRow {
  transport_message_id: string;
  local_message_id: string;
  delivery_state: string;
  headers_hash: string;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
}

interface MailSyncCursorRow {
  mail_account_id: string;
  cursor: string | null;
  last_sync: number;
}

interface MailReceiptLedgerRow {
  transport_message_id: string;
  processed_at: number;
  checksum: string;
}

function normalizeRequiredText(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (normalized === "") {
    throw new Error(`${fieldName} is required`);
  }
  return normalized;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

function normalizeTimestamp(value: number | undefined, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return fallback;
}

function parseMetadataJson(value: string | null): Record<string, unknown> | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown> | null;
    return parsed !== null && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function mapSessionRow(row: MailSessionMapRow): MailSessionMapRecord {
  return {
    remoteUserId: row.remote_user_id,
    localSessionId: row.local_session_id,
    threadMessageId: row.thread_message_id,
    lastMessageId: row.last_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessageMetaRow(row: MailMessageMetaRow): MailMessageMetaRecord {
  return {
    transportMessageId: row.transport_message_id,
    localMessageId: row.local_message_id,
    deliveryState: row.delivery_state,
    headersHash: row.headers_hash,
    metadata: parseMetadataJson(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSyncCursorRow(row: MailSyncCursorRow): MailSyncCursorRecord {
  return {
    mailAccountId: row.mail_account_id,
    cursor: row.cursor,
    lastSync: row.last_sync,
  };
}

function mapReceiptLedgerRow(row: MailReceiptLedgerRow): MailReceiptLedgerRecord {
  return {
    transportMessageId: row.transport_message_id,
    processedAt: row.processed_at,
    checksum: row.checksum,
  };
}

export class MailSidecarStoreManager {
  private accountId: string;

  constructor(accountId: string) {
    this.accountId = normalizeRequiredText(accountId, "accountId");
  }

  private getDb(): BetterSqlite3Database {
    return getMailSidecarDatabaseForAccount(this.accountId);
  }

  getSessionMapping(remoteUserId: string, localSessionId: string): MailSessionMapRecord | null {
    const row = this.getDb()
      .prepare<[string, string], MailSessionMapRow>(
        `SELECT remote_user_id, local_session_id, thread_message_id, last_message_id, created_at, updated_at
         FROM mail_session_map
         WHERE remote_user_id = ? AND local_session_id = ?`
      )
      .get(
        normalizeRequiredText(remoteUserId, "remoteUserId"),
        normalizeRequiredText(localSessionId, "localSessionId")
      );

    return row === undefined ? null : mapSessionRow(row);
  }

  getLatestSessionMapping(remoteUserId: string): MailSessionMapRecord | null {
    const row = this.getDb()
      .prepare<[string], MailSessionMapRow>(
        `SELECT remote_user_id, local_session_id, thread_message_id, last_message_id, created_at, updated_at
         FROM mail_session_map
         WHERE remote_user_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .get(normalizeRequiredText(remoteUserId, "remoteUserId"));

    return row === undefined ? null : mapSessionRow(row);
  }

  findSessionMappingByReference(
    remoteUserId: string,
    referenceMessageId: string
  ): MailSessionMapRecord | null {
    const row = this.getDb()
      .prepare<[string, string, string], MailSessionMapRow>(
        `SELECT remote_user_id, local_session_id, thread_message_id, last_message_id, created_at, updated_at
         FROM mail_session_map
         WHERE remote_user_id = ?
           AND (thread_message_id = ? OR last_message_id = ?)
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .get(
        normalizeRequiredText(remoteUserId, "remoteUserId"),
        normalizeRequiredText(referenceMessageId, "referenceMessageId"),
        normalizeRequiredText(referenceMessageId, "referenceMessageId")
      );

    return row === undefined ? null : mapSessionRow(row);
  }

  upsertSessionMapping(input: MailSessionMapWriteInput): MailSessionMapRecord {
    const remoteUserId = normalizeRequiredText(input.remoteUserId, "remoteUserId");
    const localSessionId = normalizeRequiredText(input.localSessionId, "localSessionId");
    const threadMessageId = normalizeOptionalText(input.threadMessageId);
    const lastMessageId = normalizeOptionalText(input.lastMessageId);
    const now = Date.now();

    this.getDb()
      .prepare<[string, string, string | null, string | null, number, number]>(
        `INSERT INTO mail_session_map (
           remote_user_id,
           local_session_id,
           thread_message_id,
           last_message_id,
           created_at,
           updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(remote_user_id, local_session_id) DO UPDATE SET
           thread_message_id = COALESCE(excluded.thread_message_id, mail_session_map.thread_message_id),
           last_message_id = COALESCE(excluded.last_message_id, mail_session_map.last_message_id),
           updated_at = excluded.updated_at`
      )
      .run(remoteUserId, localSessionId, threadMessageId, lastMessageId, now, now);

    const record = this.getSessionMapping(remoteUserId, localSessionId);
    if (record === null) {
      throw new Error("Failed to read mail session mapping after upsert");
    }
    return record;
  }

  getMessageMeta(transportMessageId: string): MailMessageMetaRecord | null {
    const row = this.getDb()
      .prepare<[string], MailMessageMetaRow>(
        `SELECT transport_message_id, local_message_id, delivery_state, headers_hash, metadata_json, created_at, updated_at
         FROM mail_message_meta
         WHERE transport_message_id = ?`
      )
      .get(normalizeRequiredText(transportMessageId, "transportMessageId"));

    return row === undefined ? null : mapMessageMetaRow(row);
  }

  getMessageMetaByLocalMessageId(localMessageId: string): MailMessageMetaRecord | null {
    const row = this.getDb()
      .prepare<[string], MailMessageMetaRow>(
        `SELECT transport_message_id, local_message_id, delivery_state, headers_hash, metadata_json, created_at, updated_at
         FROM mail_message_meta
         WHERE local_message_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .get(normalizeRequiredText(localMessageId, "localMessageId"));

    return row === undefined ? null : mapMessageMetaRow(row);
  }

  upsertMessageMeta(input: MailMessageMetaWriteInput): MailMessageMetaRecord {
    const transportMessageId = normalizeRequiredText(
      input.transportMessageId,
      "transportMessageId"
    );
    const localMessageId = normalizeRequiredText(input.localMessageId, "localMessageId");
    const deliveryState = normalizeRequiredText(input.deliveryState, "deliveryState");
    const headersHash = normalizeRequiredText(input.headersHash, "headersHash");
    const metadataJson =
      input.metadata !== undefined ? JSON.stringify(input.metadata ?? null) : null;
    const now = Date.now();

    this.getDb()
      .prepare<[string, string, string, string, string | null, number, number]>(
        `INSERT INTO mail_message_meta (
           transport_message_id,
           local_message_id,
           delivery_state,
           headers_hash,
           metadata_json,
           created_at,
           updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(transport_message_id) DO UPDATE SET
           local_message_id = excluded.local_message_id,
           delivery_state = excluded.delivery_state,
           headers_hash = excluded.headers_hash,
           metadata_json = COALESCE(excluded.metadata_json, mail_message_meta.metadata_json),
           updated_at = excluded.updated_at`
      )
      .run(transportMessageId, localMessageId, deliveryState, headersHash, metadataJson, now, now);

    const record = this.getMessageMeta(transportMessageId);
    if (record === null) {
      throw new Error("Failed to read mail message meta after upsert");
    }
    return record;
  }

  getSyncCursor(mailAccountId: string): MailSyncCursorRecord | null {
    const row = this.getDb()
      .prepare<[string], MailSyncCursorRow>(
        `SELECT mail_account_id, cursor, last_sync
         FROM mail_sync_cursor
         WHERE mail_account_id = ?`
      )
      .get(normalizeRequiredText(mailAccountId, "mailAccountId"));

    return row === undefined ? null : mapSyncCursorRow(row);
  }

  updateSyncCursor(input: MailSyncCursorUpdateInput): MailSyncCursorRecord {
    const mailAccountId = normalizeRequiredText(input.mailAccountId, "mailAccountId");
    const cursor = normalizeOptionalText(input.cursor);
    const lastSync = normalizeTimestamp(input.lastSync, Date.now());

    this.getDb()
      .prepare<[string, string | null, number]>(
        `INSERT INTO mail_sync_cursor (
           mail_account_id,
           cursor,
           last_sync
         )
         VALUES (?, ?, ?)
         ON CONFLICT(mail_account_id) DO UPDATE SET
           cursor = excluded.cursor,
           last_sync = excluded.last_sync`
      )
      .run(mailAccountId, cursor, lastSync);

    const record = this.getSyncCursor(mailAccountId);
    if (record === null) {
      throw new Error("Failed to read mail sync cursor after update");
    }
    return record;
  }

  hasProcessedReceipt(input: MailReceiptLookupInput): boolean {
    return this.findReceiptRecord(input) !== null;
  }

  markReceiptProcessed(input: MailReceiptProcessedInput): MailReceiptLedgerRecord {
    const transportMessageId = normalizeRequiredText(
      input.transportMessageId,
      "transportMessageId"
    );
    const checksum = normalizeRequiredText(input.checksum, "checksum");
    const existing = this.findReceiptRecord({ transportMessageId, checksum });
    if (existing !== null) {
      return existing;
    }

    const processedAt = normalizeTimestamp(input.processedAt, Date.now());

    this.getDb()
      .prepare<[string, number, string]>(
        `INSERT INTO mail_receipt_ledger (
           transport_message_id,
           processed_at,
           checksum
         )
         VALUES (?, ?, ?)`
      )
      .run(transportMessageId, processedAt, checksum);

    const record = this.findReceiptRecord({ transportMessageId, checksum });
    if (record === null) {
      throw new Error("Failed to read mail receipt ledger after insert");
    }
    return record;
  }

  private findReceiptRecord(input: MailReceiptLookupInput): MailReceiptLedgerRecord | null {
    const transportMessageId = normalizeOptionalText(input.transportMessageId);
    const checksum = normalizeOptionalText(input.checksum);

    if (transportMessageId !== null) {
      const row = this.getDb()
        .prepare<[string], MailReceiptLedgerRow>(
          `SELECT transport_message_id, processed_at, checksum
           FROM mail_receipt_ledger
           WHERE transport_message_id = ?`
        )
        .get(transportMessageId);
      if (row !== undefined) {
        return mapReceiptLedgerRow(row);
      }
    }

    if (checksum !== null) {
      const row = this.getDb()
        .prepare<[string], MailReceiptLedgerRow>(
          `SELECT transport_message_id, processed_at, checksum
           FROM mail_receipt_ledger
           WHERE checksum = ?`
        )
        .get(checksum);
      if (row !== undefined) {
        return mapReceiptLedgerRow(row);
      }
    }

    return null;
  }
}
