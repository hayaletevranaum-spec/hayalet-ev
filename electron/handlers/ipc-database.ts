import { registerHandler } from "./ipc-helpers.ts";
import { DatabaseManager } from "../database/index.ts";
import type { SyncMessagesParams } from "@electron/types";

export function setupDatabaseHandlers(): void {
  registerHandler(
    "db-init-account",
    async (event, params: { accountId: string }) => await DatabaseManager.initAccount(event, params)
  );

  registerHandler(
    "db-delete-account",
    async (event, params: { accountId: string }) =>
      await DatabaseManager.deleteAccount(event, params)
  );

  registerHandler(
    "db-get-conversations",
    async (event, params: { accountId: string }) =>
      await DatabaseManager.getConversations(event, params)
  );

  registerHandler(
    "db-delete-conversation",
    async (event, params: { accountId: string; conversationId: string }) =>
      await DatabaseManager.deleteConversation(event, params)
  );

  registerHandler(
    "db-update-conversation",
    async (
      event,
      params: { accountId: string; conversationId: string; title?: string; summary?: string }
    ) => await DatabaseManager.updateConversationDetails(event, params)
  );

  registerHandler(
    "db-get-messages",
    async (event, params: { accountId: string; conversationId: string }) =>
      await DatabaseManager.getMessages(event, params)
  );

  registerHandler(
    "db-sync-messages",
    async (event, params: SyncMessagesParams) => await DatabaseManager.syncMessages(event, params)
  );

  registerHandler(
    "db-save-attachment",
    async (
      event,
      params: {
        accountId: string;
        conversationId: string;
        messageId: string;
        filePath: string;
        originalName: string;
        mimeType?: string;
      }
    ) => await DatabaseManager.saveAttachment(event, params)
  );

  registerHandler(
    "db-save-attachment-content",
    async (
      event,
      params: {
        accountId: string;
        conversationId: string;
        messageId: string;
        base64: string;
        originalName: string;
        mimeType?: string;
      }
    ) => await DatabaseManager.saveAttachmentContent(event, params)
  );

  registerHandler(
    "db-get-attachments",
    async (event, params: { accountId: string; conversationId: string }) =>
      await DatabaseManager.getAttachments(event, params)
  );

  registerHandler(
    "db-search-messages",
    async (event, params: { accountId: string; query: string; limit?: number }) =>
      await DatabaseManager.searchMessages(event, params)
  );

  registerHandler(
    "db-search-attachments",
    async (event, params: { accountId: string; query: string; limit?: number }) =>
      await DatabaseManager.searchAttachments(event, params)
  );

  registerHandler(
    "db-search-all-accounts",
    async (event, params: { query: string; limit?: number }) =>
      await DatabaseManager.searchAllAccounts(event, params)
  );
}
