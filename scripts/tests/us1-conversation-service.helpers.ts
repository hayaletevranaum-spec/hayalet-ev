import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { copyFileSync, existsSync, mkdirSync, rmSync as nativeRmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { MailSidecarStoreManager } from "../../electron/database/mail-sidecar-manager.ts";
import { closeMailSidecarDatabaseForAccount as closeMailSidecarDbForAccount } from "../../electron/database/mail-sidecar-sqlite.ts";
import { getLoggerCore } from "../../electron/logger/core/LoggerCore.ts";
import Database from "../../electron/native/better-sqlite3.ts";
import { initPaths, Paths } from "../../electron/paths.ts";
import { Us1ConversationService } from "../../electron/us1-conversation-service.ts";
import { hashString } from "../../electron/database/hash-utils.ts";
import { buildRemoteEmailAccountId } from "../../src/types/archive.ts";
import { createDefaultSettings } from "../../src/types/settings-defaults.ts";
import type { AppSettings, MailTransportAccountConfig } from "../../src/types/settings.ts";
import { normalizeSettings } from "../../src/js/modules/settings/settings-schema.ts";
import type {
  FetchInboxResult,
  MailTransportMessageAddress,
  MailTransportParsedAttachment,
  ProcessIncomingMessageResult,
  SendMailRequest,
} from "../../electron/mail-transport/index.ts";

export {
  assert,
  buildRemoteEmailAccountId,
  closeMailSidecarDbForAccount,
  copyFileSync,
  createDefaultSettings,
  Database,
  existsSync,
  getLoggerCore,
  hashString,
  initPaths,
  join,
  MailSidecarStoreManager,
  mkdirSync,
  mkdtemp,
  normalizeSettings,
  Paths,
  rm,
  statSync,
  test,
  tmpdir,
  Us1ConversationService,
  writeFile,
  writeFileSync,
};

export type {
  AppSettings,
  FetchInboxResult,
  MailTransportAccountConfig,
  SendMailRequest,
};

export const FIXED_NOW = 1700000000000;
export const MESSAGE_PROTOCOL = "hayalet-ev-us1-message";
export const MESSAGE_PAYLOAD_START = "--- HAYALET_EV_US1_MESSAGE_PAYLOAD ---";
export const MESSAGE_PAYLOAD_END = "--- /HAYALET_EV_US1_MESSAGE_PAYLOAD ---";
const archiveTestDbsByAccount = new Map<string, Set<InstanceType<typeof Database>>>();

export const electronDir = join(process.cwd(), "electron");
initPaths(electronDir);

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createSettingsStore(initial: AppSettings) {
  let current = normalizeSettings(initial);

  return {
    loadSettings(): Promise<AppSettings> {
      return Promise.resolve(clone(current));
    },
    saveSettings(next: AppSettings): Promise<boolean> {
      current = normalizeSettings(clone(next));
      return Promise.resolve(true);
    },
    snapshot(): AppSettings {
      return clone(current);
    },
  };
}

export function createAccount(accountId: string): MailTransportAccountConfig {
  return {
    id: accountId,
    providerType: "gmail",
    email: "local@example.com",
    enabled: true,
    connectionState: "connected",
    authType: "password",
    imap: {
      host: "imap.example.com",
      port: 993,
      secure: true,
    },
    smtp: {
      host: "smtp.example.com",
      port: 465,
      secure: true,
    },
    auth: {
      user: "local@example.com",
      password: "app-password",
    },
  };
}

export function createSettings(accountId: string): AppSettings {
  const settings = createDefaultSettings();
  settings.user = {
    nickname: "Local Ghost",
    avatarPath: "",
  };
  settings.integrations = {
    ...(settings.integrations ?? {}),
    mailTransport: {
      accounts: [createAccount(accountId)],
      retryBaseMs: 1,
      maxRetries: 0,
    },
  };
  settings.remoteUsers = [
    {
      remoteUserId: "remote@example.com",
      email: "remote@example.com",
      nickname: "Remote Old",
      avatar: "",
      handshakeState: "active",
      profileRevision: 1,
      linkedMailAccountId: accountId,
      threadMessageId: null,
      lastTransportMessageId: null,
      lastError: null,
    },
  ];
  settings.us1Slot = {
    selectedRemoteUserId: "remote@example.com",
    connectionState: "connected",
    catchCommands: false,
  };
  return normalizeSettings(settings);
}

export function createMultiRemoteSettings(
  selectedRemoteUserId: string,
  bindings: Array<{
    accountId: string;
    remoteUserId: string;
    nickname: string;
  }>
): AppSettings {
  const settings = createDefaultSettings();
  settings.user = {
    nickname: "Local Ghost",
    avatarPath: "",
  };
  settings.integrations = {
    ...(settings.integrations ?? {}),
    mailTransport: {
      accounts: bindings.map((binding) => createAccount(binding.accountId)),
      retryBaseMs: 1,
      maxRetries: 0,
    },
  };
  settings.remoteUsers = bindings.map((binding, index) => ({
    remoteUserId: binding.remoteUserId,
    email: binding.remoteUserId,
    nickname: binding.nickname,
    avatar: "",
    handshakeState: "active" as const,
    profileRevision: index + 1,
    linkedMailAccountId: binding.accountId,
    threadMessageId: null,
    lastTransportMessageId: null,
    lastError: null,
  }));
  settings.us1Slot = {
    selectedRemoteUserId,
    connectionState: "connected",
    catchCommands: false,
  };
  return normalizeSettings(settings);
}

export function createTransportStub() {
  const sentMessages: SendMailRequest[] = [];
  const sentAccountIds: string[] = [];
  const fetchQueue: FetchInboxResult[] = [];

  return {
    sentMessages,
    sentAccountIds,
    enqueueFetch(result: FetchInboxResult): void {
      fetchQueue.push(result);
    },
    transport: {
      sendMail(account: { id: string }, message: SendMailRequest): Promise<{
          accountId: string;
          localMessageId: string;
          transportMessageId: string;
          deliveryState: "sent";
          headersHash: string;
          accepted: string[];
          rejected: string[];
          pending: string[];
          response: string;
          remoteUserId: string | null;
          localSessionId: string | null;
          threadMessageId: string;
        }> {
        sentAccountIds.push(account.id);
        sentMessages.push(clone(message));
        const transportMessageId = message.messageId ?? `<${message.localMessageId}@example.test>`;
        return Promise.resolve({
          accountId: account.id,
          localMessageId: message.localMessageId,
          transportMessageId,
          deliveryState: "sent" as const,
          headersHash: `hash:${message.localMessageId}`,
          accepted: ["remote@example.com"],
          rejected: [] as string[],
          pending: [] as string[],
          response: "250 queued",
          remoteUserId: message.remoteUserId ?? null,
          localSessionId: message.localSessionId ?? null,
            threadMessageId: message.threadMessageId ?? transportMessageId,
          });
      },
      fetchInbox(account: { id: string }): Promise<FetchInboxResult> {
        return Promise.resolve(
          fetchQueue.shift() ?? {
            accountId: account.id,
            mailbox: "INBOX",
            cursor: null,
            fetchedCount: 0,
            processedCount: 0,
            duplicateCount: 0,
            messages: [],
          }
        );
      },
    },
  };
}

export function buildConversationPayload(
  nickname: string,
  profileRevision: number,
  text: string,
  options: {
    localSessionId?: string | null;
    mode?: "new" | "reply";
    title?: string | null;
    sentAt?: number;
    profile?: {
      remoteUserId?: string;
      email?: string;
      nickname?: string;
      avatar?: string;
      profileRevision?: number;
    };
    roomEvent?: Record<string, unknown> | null;
    roomCommand?: Record<string, unknown> | null;
  } = {}
): string {
  const localSessionId = options.localSessionId ?? null;
  const sentAt = options.sentAt ?? FIXED_NOW + 1;
  const profile = {
    remoteUserId: options.profile?.remoteUserId ?? "remote@example.com",
    email: options.profile?.email ?? options.profile?.remoteUserId ?? "remote@example.com",
    nickname: options.profile?.nickname ?? nickname,
    avatar: options.profile?.avatar ?? "https://example.com/avatar.png",
    profileRevision: options.profile?.profileRevision ?? profileRevision,
  };
  return [
    text,
    "",
    MESSAGE_PAYLOAD_START,
    JSON.stringify(
      {
        protocol: MESSAGE_PROTOCOL,
        version: 1,
        messageType: "conversation",
        sentAt,
        localSessionId,
        session:
          localSessionId !== null
            ? {
                id: localSessionId,
                mode: options.mode ?? "reply",
                title: options.title ?? null,
                createdAt: sentAt,
                openHint: options.mode === "new" ? "auto_if_idle" : "list_only",
              }
            : null,
        profile,
        ...(options.roomEvent !== undefined && options.roomEvent !== null
          ? { roomEvent: options.roomEvent }
          : {}),
        ...(options.roomCommand !== undefined && options.roomCommand !== null
          ? { roomCommand: options.roomCommand }
          : {}),
      },
      null,
      2
    ),
    MESSAGE_PAYLOAD_END,
    "",
  ].join("\n");
}

export function extractConversationEnvelope(message: SendMailRequest): Record<string, unknown> {
  const text = typeof message.text === "string" ? message.text : "";
  const match = text.match(
    /--- HAYALET_EV_US1_MESSAGE_PAYLOAD ---\s*([\s\S]+?)\s*--- \/HAYALET_EV_US1_MESSAGE_PAYLOAD ---/
  );
  const matched = match?.[1];
  assert.ok(matched != null && matched !== "");
  return JSON.parse(matched) as Record<string, unknown>;
}

export function buildFetchedConversationMessage(options: {
  accountId: string;
  uid: number;
  transportMessageId: string;
  localMessageId: string;
  remoteUserId?: string;
  nickname?: string;
  profileRevision?: number;
  localSessionId?: string | null;
  text: string;
  subject?: string;
  threadMessageId?: string | null;
  sentAt?: number;
  mode?: "new" | "reply";
  title?: string | null;
  roomEvent?: Record<string, unknown> | null;
  roomCommand?: Record<string, unknown> | null;
}) {
  const remoteUserId = options.remoteUserId ?? "remote@example.com";
  const nickname = options.nickname ?? "Remote Ghost";
  const sentAt = options.sentAt ?? FIXED_NOW + options.uid;
  const localSessionId = options.localSessionId ?? null;
  const threadMessageId = options.threadMessageId ?? options.transportMessageId;

  return {
    status: "processed" as const,
    duplicate: false,
    accountId: options.accountId,
    mailbox: "INBOX",
    uid: options.uid,
    threadId: null as string | null,
    transportMessageId: options.transportMessageId,
    localMessageId: options.localMessageId,
    fingerprint: `fingerprint-${options.uid}`,
    headersHash: `headers-${options.uid}`,
    deliveryState: "received",
    remoteUserId,
    localSessionId,
    threadMessageId,
    parsed: {
      transportMessageId: options.transportMessageId,
      inReplyTo: null as string | null,
      references: [] as string[],
      subject: options.subject ?? "Remote conversation",
      text: (() => {
        const payload: Parameters<typeof buildConversationPayload>[3] = {
          localSessionId,
          sentAt,
          profile: {
            remoteUserId,
            email: remoteUserId,
            nickname,
            profileRevision: options.profileRevision ?? 1,
          },
        };
        if (options.mode !== undefined) payload.mode = options.mode;
        if (options.title !== undefined) payload.title = options.title;
        if (options.roomEvent !== undefined) payload.roomEvent = options.roomEvent;
        if (options.roomCommand !== undefined) payload.roomCommand = options.roomCommand;
        return buildConversationPayload(nickname, options.profileRevision ?? 1, options.text, payload);
      })(),
      html: null as string | null,
      headersHash: `headers-${options.uid}`,
      headerLines: [
        `X-Hayalet-Ev-Protocol: ${MESSAGE_PROTOCOL}`,
        ...(localSessionId !== null ? [`X-Hayalet-Ev-Session-Id: ${localSessionId}`] : []),
      ],
      from: [{ name: nickname, address: remoteUserId }] as MailTransportMessageAddress[],
      to: [] as MailTransportMessageAddress[],
      cc: [] as MailTransportMessageAddress[],
      bcc: [] as MailTransportMessageAddress[],
      replyTo: [] as MailTransportMessageAddress[],
      attachments: [] as MailTransportParsedAttachment[],
      receivedAt: sentAt,
      rawSize: 256,
    },
  } satisfies ProcessIncomingMessageResult;
}

export function cleanupAccount(accountId: string): void {
  closeArchiveTestDbsForAccount(accountId);
  closeMailSidecarDbForAccount(accountId);
  rmSync(Paths.getAccountDir(accountId), { recursive: true, force: true });
}

function trackArchiveTestDb(accountId: string, db: InstanceType<typeof Database>): void {
  const existing = archiveTestDbsByAccount.get(accountId);
  if (existing !== undefined) {
    existing.add(db);
    return;
  }

  archiveTestDbsByAccount.set(accountId, new Set([db]));
}

function closeArchiveTestDbsForAccount(accountId: string): void {
  const dbs = archiveTestDbsByAccount.get(accountId);
  if (dbs === undefined) return;

  for (const db of dbs) {
    try {
      db.close();
    } catch {
      // The test cleanup should keep going even if a handle is already closed.
    }
  }
  archiveTestDbsByAccount.delete(accountId);
}

export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void {
  const maxRetries = 15;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      nativeRmSync(path, options ?? {});
      return; // Success
    } catch (err) {
      lastError = err as Error;
      // On Windows there can be transient EBUSY/EPERM errors when file handles
      // are still being released by OS-level caches. Retry with a small delay.
      if (attempt < maxRetries - 1) {
        // Progressively longer delays (exponential backoff: 10ms -> 20ms -> 40ms... up to 500ms)
        const delay = Math.min(10 * Math.pow(1.5, attempt), 500);
        const start = Date.now();
        while (Date.now() - start < delay) {
          // Busy wait to avoid async complexity in sync function
        }
        // Help GC release handles on each retry
        if (global.gc) {
          global.gc();
        }
      }
    }
  }
  
  // After all retries exhausted, log and continue (don't fail tests)
   
  console.warn("rmSync wrapper: failed to remove after retries", path, lastError);
}

export function ensureArchiveSchema(db: InstanceType<typeof Database>): void {
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      role TEXT NOT NULL,
      author TEXT,
      content TEXT NOT NULL,
      dom_index INTEGER,
      dom_id TEXT,
      content_hash TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

export function buildAttachmentPaths(
  accountId: string,
  conversationId: string,
  messageId: string,
  storedName: string
): { dirPath: string; storedPath: string } {
  const dirPath = join(Paths.getAccountDir(accountId), "attachments", conversationId, messageId);
  const storedPath = `data/${accountId}/attachments/${conversationId}/${messageId}/${storedName}`;
  return { dirPath, storedPath };
}

export function createArchiveFactory() {
  return async (accountId: string) => {
    mkdirSync(Paths.getAccountDir(accountId), { recursive: true });
    const db = new Database(Paths.getAccountDbPath(accountId));
    trackArchiveTestDb(accountId, db);
    ensureArchiveSchema(db);

    return {
      async upsertConversationMetadata(params: {
        webUrl: string;
        provider?: string;
        title?: string | null;
      }) {
        const conversationId = hashString(params.webUrl);
        const now = new Date(FIXED_NOW).toISOString();
        const normalizedTitle =
          typeof params.title === "string" && params.title.trim() !== "" ? params.title.trim() : "";
        const existing = db
          .prepare<[string], { id: string; title: string | null; title_source: string | null }>(
            "SELECT id, title, title_source FROM conversations WHERE id = ? LIMIT 1"
          )
          .get(conversationId);

        if (existing === undefined) {
          const countRow = db
            .prepare<[string], { count: number }>(
              "SELECT COUNT(*) as count FROM conversations WHERE account_id = ?"
            )
            .get(accountId);
          const nextTitle =
            normalizedTitle !== ""
              ? normalizedTitle
              : `Sohbet ${String((countRow?.count ?? 0) + 1).padStart(3, "0")}`;
          const titleSource = normalizedTitle !== "" ? "synced" : "system";
          db.prepare(
            `INSERT INTO conversations (id, account_id, web_url, provider, title, title_source, summary, message_count, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, '', 0, ?, ?)`
          ).run(
            conversationId,
            accountId,
            params.webUrl,
            params.provider ?? "us1",
            nextTitle,
            titleSource,
            now,
            now
          );
          return {
            success: true,
            data: {
              conversationId,
              created: true,
              title: nextTitle,
              titleUpdated: normalizedTitle !== "",
            },
          };
        }

        const updateParts = ["web_url = ?", "provider = ?", "updated_at = ?"];
        const updateValues: Array<string> = [params.webUrl, params.provider ?? "us1", now];
        let nextTitle = existing.title ?? "";
        let titleUpdated = false;

        if (
          normalizedTitle !== "" &&
          existing.title_source !== "user" &&
          existing.title !== normalizedTitle
        ) {
          updateParts.push("title = ?", "title_source = ?");
          updateValues.push(normalizedTitle, "synced");
          nextTitle = normalizedTitle;
          titleUpdated = true;
        }

        updateValues.push(conversationId);
        db.prepare(`UPDATE conversations SET ${updateParts.join(", ")} WHERE id = ?`).run(
          ...updateValues
        );
        return {
          success: true,
          data: {
            conversationId,
            created: false,
            title: nextTitle,
            titleUpdated,
          },
        };
      },

      async getMessages(conversationId: string) {
        const data = db
          .prepare<[string], { id: string; role: string; content: string }>(
            "SELECT id, role, content FROM messages WHERE conversation_id = ? ORDER BY dom_index ASC, created_at ASC"
          )
          .all(conversationId);
        return { success: true, data };
      },

      async syncMessages(params: {
        accountId: string;
        provider?: string;
        webUrl: string;
        messages: Array<{
          role: "user" | "assistant";
          text: string;
          author?: string;
          index?: number;
          domIndex?: number;
          domId?: string;
          contentHash?: string;
        }>;
      }) {
        const conversationId = hashString(params.webUrl);
        const now = new Date(FIXED_NOW).toISOString();
        const insertMessage = db.prepare(
          `INSERT OR REPLACE INTO messages (id, conversation_id, account_id, role, author, content, dom_index, dom_id, content_hash, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );

        for (const message of params.messages) {
          const domIndex = message.domIndex ?? message.index ?? 0;
          const contentHash = message.contentHash ?? hashString(message.text);
          const messageId =
            typeof message.domId === "string" && message.domId.trim() !== ""
              ? hashString(`${conversationId}-${message.domId}`)
              : hashString(`${conversationId}-${domIndex}-${contentHash}`);
          insertMessage.run(
            messageId,
            conversationId,
            accountId,
            message.role,
            message.author ?? null,
            message.text,
            domIndex,
            message.domId ?? null,
            contentHash,
            now
          );
        }

        const countRow = db
          .prepare<[string], { count: number }>(
            "SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?"
          )
          .get(conversationId);
        db.prepare("UPDATE conversations SET message_count = ?, updated_at = ? WHERE id = ?").run(
          countRow?.count ?? 0,
          now,
          conversationId
        );

        return {
          success: true,
          conversationId,
          total: countRow?.count ?? 0,
          added: params.messages.length,
        };
      },

      async saveAttachment(
        conversationId: string,
        messageId: string,
        filePath: string,
        originalName: string,
        mimeType?: string
      ) {
        const attachmentId = hashString(`${messageId}:${originalName}:${FIXED_NOW}`);
        const storedName = `${attachmentId}_${originalName}`;
        const { dirPath, storedPath } = buildAttachmentPaths(accountId, conversationId, messageId, storedName);
        mkdirSync(dirPath, { recursive: true });
        copyFileSync(filePath, join(dirPath, storedName));
        const size = statSync(filePath).size;
        db.prepare(
          `INSERT OR REPLACE INTO attachments (id, message_id, conversation_id, account_id, original_name, stored_name, stored_path, mime_type, size, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          attachmentId,
          messageId,
          conversationId,
          accountId,
          originalName,
          storedName,
          storedPath,
          mimeType ?? null,
          size,
          new Date(FIXED_NOW).toISOString()
        );
        return { success: true, data: { attachmentId, storedPath } };
      },

      async saveAttachmentContent(
        conversationId: string,
        messageId: string,
        content: Buffer,
        originalName: string,
        mimeType?: string
      ) {
        const attachmentId = hashString(`${messageId}:${originalName}:${FIXED_NOW}:content`);
        const storedName = `${attachmentId}_${originalName}`;
        const { dirPath, storedPath } = buildAttachmentPaths(accountId, conversationId, messageId, storedName);
        mkdirSync(dirPath, { recursive: true });
        writeFileSync(join(dirPath, storedName), content);
        db.prepare(
          `INSERT OR REPLACE INTO attachments (id, message_id, conversation_id, account_id, original_name, stored_name, stored_path, mime_type, size, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          attachmentId,
          messageId,
          conversationId,
          accountId,
          originalName,
          storedName,
          storedPath,
          mimeType ?? null,
          content.length,
          new Date(FIXED_NOW).toISOString()
        );
        return { success: true, data: { attachmentId, storedPath } };
      },
    };
  };
}
