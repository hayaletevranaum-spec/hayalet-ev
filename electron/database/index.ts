// NOTE: Per-account SQLite archive at data/{email}_{provider}/archive.db.

import { getLoggerCore } from "../logger/index.js";
import { LogCategory, LogLevel } from "@shared/index.js";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcResult } from "@electron/types";
import { SQLiteArchiveManager } from "./sqlite-archive.js";
import { loadSettings } from "../settings-manager.ts";
import {
  getDatabaseForAccount,
  closeAllDatabases,
  closeDatabaseForAccount,
  getAccountFolder,
} from "./sqlite-manager.js";
import {
  closeAllMailSidecarDatabases,
  closeMailSidecarDatabaseForAccount,
} from "./mail-sidecar-sqlite.js";
import { collectSearchAccountIds } from "./search-account-ids.js";
import { rmSync, existsSync } from "fs";
import type { SyncMessagesParams } from "@electron/types";
import type { TranslationParams } from "../../src/types/i18n.ts";
import { translateElectronMessage } from "../i18n/language-service.ts";

const logger = getLoggerCore();

const activeManagers = new Map<string, SQLiteArchiveManager>();

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }

  return typeof error === "string" && error !== "" ? error : "unknown";
}

async function logDatabaseInfo(
  key: string,
  params?: TranslationParams,
  context?: Record<string, unknown>
): Promise<void> {
  await logger.logInternalT(
    LogCategory.DATABASE,
    LogLevel.INFO,
    `electron.database.logs.${key}`,
    params,
    context
  );
}

async function logDatabaseError(
  operation: string,
  context: Record<string, unknown>
): Promise<void> {
  await logger.logInternalT(
    LogCategory.DATABASE,
    LogLevel.ERROR,
    "electron.database.logs.operationFailed",
    {
      operation,
      message: getErrorMessage(context["error"]),
    },
    context
  );
}

function getManager(accountId: string): SQLiteArchiveManager {
  if (!activeManagers.has(accountId)) {
    getDatabaseForAccount(accountId);
    activeManagers.set(accountId, new SQLiteArchiveManager(accountId));
  }

  const manager = activeManagers.get(accountId);
  if (manager === undefined) {
    // NOTE: Extremely rare: Map set failed or raced. Use a safe fallback.
    const created = new SQLiteArchiveManager(accountId);
    activeManagers.set(accountId, created);
    return created;
  }

  return manager;
}

function toTimestamp(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value !== "") {
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

export const databaseManager = {
  async initAccount(
    _event: IpcMainInvokeEvent | null,
    { accountId }: { accountId: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (accountId.length === 0) {
        return {
          success: false,
          error: await translateElectronMessage("electron.database.accountIdRequired"),
        };
      }

      getDatabaseForAccount(accountId);

      await logDatabaseInfo("accountDatabaseInitialized", { accountId }, { accountId });

      return { success: true };
    } catch (err) {
      await logDatabaseError("initAccount", {
        accountId,
        error: err,
      });
      return { success: false, error: (err as Error).message };
    }
  },

  async getConversations(
    _event: IpcMainInvokeEvent | null,
    { accountId }: { accountId: string }
  ): Promise<IpcResult<unknown[]>> {
    try {
      const manager = getManager(accountId);
      return await manager.getConversations();
    } catch (err) {
      await logDatabaseError("getConversations", {
        accountId,
        error: err,
      });
      return { success: false, error: (err as Error).message, data: [] };
    }
  },

  async getMessages(
    _event: IpcMainInvokeEvent | null,
    {
      accountId,
      conversationId,
      afterSeq,
    }: { accountId: string; conversationId: string; afterSeq?: number }
  ): Promise<IpcResult<unknown[]>> {
    try {
      const manager = getManager(accountId);
      return await manager.getMessages(
        conversationId,
        afterSeq !== undefined ? { afterSeq } : undefined
      );
    } catch (err) {
      await logDatabaseError("getMessages", {
        accountId,
        conversationId,
        error: err,
      });
      return { success: false, error: (err as Error).message, data: [] };
    }
  },

  async syncMessages(
    _event: IpcMainInvokeEvent | null,
    params: SyncMessagesParams
  ): Promise<{
    success: boolean;
    conversationId?: string;
    added?: number;
    droppedDuplicates?: number;
    lastEventSeq?: number;
    syncedCount?: number;
    total?: number;
    error?: string;
  }> {
    try {
      const manager = getManager(params.accountId);
      return await manager.syncMessages(params);
    } catch (err) {
      await logDatabaseError("syncMessages", {
        accountId: params.accountId,
        webUrl: params.webUrl,
        error: err,
      });
      return { success: false, error: (err as Error).message };
    }
  },

  async updateConversation(
    _event: IpcMainInvokeEvent | null,
    params: {
      accountId: string;
      conversationId: string;
      title?: string;
      summary?: string;
    }
  ): Promise<IpcResult<void>> {
    try {
      const { accountId, conversationId, ...data } = params;
      const manager = getManager(accountId);
      return await manager.updateConversation(conversationId, data);
    } catch (err) {
      await logDatabaseError("updateConversation", {
        params,
        error: err,
      });
      return { success: false, error: (err as Error).message };
    }
  },

  async upsertConversationMetadata(
    _event: IpcMainInvokeEvent | null,
    params: {
      accountId: string;
      webUrl: string;
      provider?: string;
      title?: string | null;
    }
  ): Promise<
    IpcResult<{
      conversationId: string;
      created: boolean;
      title: string;
      titleUpdated: boolean;
    }>
  > {
    try {
      const manager = getManager(params.accountId);
      return await manager.upsertConversationMetadata(params);
    } catch (err) {
      await logDatabaseError("upsertConversationMetadata", {
        accountId: params.accountId,
        webUrl: params.webUrl,
        error: err,
      });
      return { success: false, error: (err as Error).message };
    }
  },

  async resetConversationMessages(
    _event: IpcMainInvokeEvent | null,
    params: { accountId: string; webUrl: string }
  ): Promise<IpcResult<{ conversationId: string; deletedCount: number }>> {
    try {
      const manager = getManager(params.accountId);
      return await manager.resetConversationMessages(params.webUrl);
    } catch (err) {
      await logDatabaseError("resetConversationMessages", {
        accountId: params.accountId,
        webUrl: params.webUrl,
        error: err,
      });
      return { success: false, error: (err as Error).message };
    }
  },

  async deleteConversation(
    _event: IpcMainInvokeEvent | null,
    { accountId, conversationId }: { accountId: string; conversationId: string }
  ): Promise<IpcResult<void>> {
    try {
      const manager = getManager(accountId);
      return await manager.deleteConversation(conversationId);
    } catch (err) {
      await logDatabaseError("deleteConversation", {
        accountId,
        conversationId,
        error: err,
      });
      return { success: false, error: (err as Error).message };
    }
  },

  async searchMessages(
    _event: IpcMainInvokeEvent | null,
    { accountId, query, limit = 50 }: { accountId: string; query: string; limit?: number }
  ): Promise<IpcResult<unknown[]>> {
    try {
      const manager = getManager(accountId);
      return await manager.searchMessages(query, limit);
    } catch (err) {
      await logDatabaseError("searchMessages", {
        accountId,
        query,
        error: err,
      });
      return { success: false, error: (err as Error).message, data: [] };
    }
  },

  async saveAttachment(
    _event: IpcMainInvokeEvent | null,
    params: {
      accountId: string;
      conversationId: string;
      messageId: string;
      filePath: string;
      originalName: string;
      mimeType?: string;
    }
  ): Promise<IpcResult<{ attachmentId: string; storedPath: string }>> {
    try {
      const { accountId, conversationId, messageId, filePath, originalName, mimeType } = params;
      const manager = getManager(accountId);
      return await manager.saveAttachment(
        conversationId,
        messageId,
        filePath,
        originalName,
        mimeType
      );
    } catch (err) {
      await logDatabaseError("saveAttachment", {
        params,
        error: err,
      });
      return { success: false, error: (err as Error).message };
    }
  },

  async saveAttachmentContent(
    _event: IpcMainInvokeEvent | null,
    params: {
      accountId: string;
      conversationId: string;
      messageId: string;
      base64: string;
      originalName: string;
      mimeType?: string;
    }
  ): Promise<IpcResult<{ attachmentId: string; storedPath: string }>> {
    try {
      const { accountId, conversationId, messageId, base64, originalName, mimeType } = params;
      const manager = getManager(accountId);
      return await manager.saveAttachmentContent(
        conversationId,
        messageId,
        Buffer.from(base64, "base64"),
        originalName,
        mimeType
      );
    } catch (err) {
      await logDatabaseError("saveAttachmentContent", {
        params,
        error: err,
      });
      return { success: false, error: (err as Error).message };
    }
  },

  async getAttachments(
    _event: IpcMainInvokeEvent | null,
    { accountId, conversationId }: { accountId: string; conversationId: string }
  ): Promise<IpcResult<unknown[]>> {
    try {
      const manager = getManager(accountId);
      return await manager.getAttachments(conversationId);
    } catch (err) {
      await logDatabaseError("getAttachments", {
        accountId,
        conversationId,
        error: err,
      });
      return { success: false, error: (err as Error).message, data: [] };
    }
  },

  async searchAttachments(
    _event: IpcMainInvokeEvent | null,
    { accountId, query, limit = 50 }: { accountId: string; query: string; limit?: number }
  ): Promise<IpcResult<unknown[]>> {
    try {
      const manager = getManager(accountId);
      return await manager.searchAttachments(query, limit);
    } catch (err) {
      await logDatabaseError("searchAttachments", {
        accountId,
        query,
        error: err,
      });
      return { success: false, error: (err as Error).message, data: [] };
    }
  },

  async searchAllAccounts(
    _event: IpcMainInvokeEvent | null,
    { query, limit = 50 }: { query: string; limit?: number }
  ): Promise<IpcResult<{ messages: unknown[]; attachments: unknown[] }>> {
    try {
      const trimmedQuery = String(query).trim();
      const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 50;

      if (trimmedQuery === "") {
        return { success: true, data: { messages: [], attachments: [] } };
      }

      const settings = await loadSettings();
      const accountIds = collectSearchAccountIds(settings);

      if (accountIds.length === 0) {
        return { success: true, data: { messages: [], attachments: [] } };
      }

      const searchResults = await Promise.all(
        accountIds.map(async (accountId) => {
          const manager = getManager(accountId);

          const [messagesResult, attachmentsResult] = await Promise.all([
            manager.searchMessages(trimmedQuery, normalizedLimit),
            manager.searchAttachments(trimmedQuery, normalizedLimit),
          ]);

          const messages = Array.isArray(messagesResult.data)
            ? messagesResult.data.map((row) => ({
                ...row,
                accountId,
                account_id: accountId,
              }))
            : [];
          const attachments = Array.isArray(attachmentsResult.data)
            ? attachmentsResult.data.map((row) => ({
                ...row,
                accountId,
                account_id: accountId,
              }))
            : [];

          return { messages, attachments };
        })
      );

      const messages = searchResults
        .flatMap((entry) => entry.messages)
        .sort(
          (a, b) =>
            toTimestamp((b as Record<string, unknown>)["created_at"]) -
            toTimestamp((a as Record<string, unknown>)["created_at"])
        )
        .slice(0, normalizedLimit);

      const attachments = searchResults
        .flatMap((entry) => entry.attachments)
        .sort(
          (a, b) =>
            toTimestamp((b as Record<string, unknown>)["created_at"]) -
            toTimestamp((a as Record<string, unknown>)["created_at"])
        )
        .slice(0, normalizedLimit);

      return {
        success: true,
        data: { messages, attachments },
      };
    } catch (err) {
      await logDatabaseError("searchAllAccounts", {
        query,
        limit,
        error: err,
      });
      return {
        success: false,
        error: (err as Error).message,
        data: { messages: [], attachments: [] },
      };
    }
  },

  async updateConversationDetails(
    event: IpcMainInvokeEvent | null,
    params: {
      accountId: string;
      conversationId: string;
      title?: string;
      summary?: string;
    }
  ): Promise<IpcResult<void>> {
    return await this.updateConversation(event, params);
  },

  async deleteAccount(
    _event: IpcMainInvokeEvent | null,
    { accountId }: { accountId: string }
  ): Promise<IpcResult<void>> {
    try {
      const manager = getManager(accountId);
      await manager.clearAccountData();

      activeManagers.delete(accountId);
      closeDatabaseForAccount(accountId);
      closeMailSidecarDatabaseForAccount(accountId);

      const accountFolder = getAccountFolder(accountId);
      if (existsSync(accountFolder)) {
        rmSync(accountFolder, { recursive: true, force: true });
        await logDatabaseInfo(
          "accountFolderDeleted",
          { accountId },
          {
            accountId,
            folder: accountFolder,
          }
        );
      }

      return { success: true };
    } catch (err) {
      await logDatabaseError("deleteAccount", {
        accountId,
        error: err,
      });
      return { success: false, error: (err as Error).message };
    }
  },

  async closeAll(): Promise<void> {
    await this.cleanup();
  },

  async cleanup(): Promise<void> {
    try {
      activeManagers.clear();
      closeAllDatabases();
      closeAllMailSidecarDatabases();

      await logDatabaseInfo("cleanupComplete");
    } catch (err) {
      await logDatabaseError("cleanup", {
        error: err,
      });
    }
  },
};

export { databaseManager as DatabaseManager };
export { MailSidecarStoreManager } from "./mail-sidecar-manager.js";
export type {
  MailMessageMetaRecord,
  MailMessageMetaWriteInput,
  MailReceiptLedgerRecord,
  MailReceiptLookupInput,
  MailReceiptProcessedInput,
  MailSessionMapRecord,
  MailSessionMapWriteInput,
  MailSyncCursorRecord,
  MailSyncCursorUpdateInput,
} from "./mail-sidecar-manager.js";
