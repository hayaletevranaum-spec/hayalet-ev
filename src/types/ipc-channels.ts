import type { ProviderScenarioResult, ProviderTestSuite } from "./provider.js";
import type { TranslationParams } from "./i18n.js";
import type {
  RoomToolCallRequest,
  RoomToolCallResult,
  RoomToolCancelRequest,
  RoomToolCancelResult,
} from "./room-tools.js";

type IpcErrorMeta = {
  errorKey?: string;
  errorParams?: TranslationParams;
};

export interface DbInitAccountParams {
  accountId: string;
}

export interface DbInitAccountResult {
  success: boolean;
  error?: string;
}

export interface DbGetConversationsParams {
  accountId: string;
}

export interface DbConversation {
  id: string;
  value: string;
  webUrl: string;
  title: string;
  summary: string;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  folder: string;
  label: string;
}

export interface DbGetConversationsResult {
  success: boolean;
  data?: DbConversation[];
  error?: string;
}

export interface DbGetMessagesParams {
  accountId: string;
  conversationId: string;
  afterSeq?: number;
}

export interface DbMessage {
  id: string;
  brokerMessageId?: string | null;
  clientRequestId?: string | null;
  eventSeq?: number | null;
  index: number;
  role: string;
  author: string;
  text: string;
  contentHash: string;
  domIndex: number | null;
  domId: string | null;
  providerMessageId?: string | null;
  createdAt: number;
}

export interface DbGetMessagesResult {
  success: boolean;
  data?: DbMessage[];
  error?: string;
}

export interface DbSyncMessagesParams {
  accountId: string;
  clientRequestId?: string;
  provider?: string;
  webUrl: string;
  messages: Array<{
    role: string;
    author?: string;
    brokerMessageId?: string;
    content: string;
    eventSeq?: number;
    domIndex?: number;
    domId?: string;
    providerMessageId?: string;
  }>;
}

export interface DbSyncMessagesResult {
  success: boolean;
  conversationId?: string;
  droppedDuplicates?: number;
  lastEventSeq?: number;
  syncedCount?: number;
  error?: string;
}

export interface DbDeleteConversationParams {
  accountId: string;
  conversationId: string;
}

export interface DbDeleteConversationResult {
  success: boolean;
  error?: string;
}

export interface DbUpdateConversationParams {
  accountId: string;
  conversationId: string;
  title?: string;
  summary?: string;
}

export interface DbUpdateConversationResult {
  success: boolean;
  error?: string;
}

export interface DbSaveAttachmentParams {
  accountId: string;
  conversationId: string;
  messageId: string;
  filePath: string;
  originalName: string;
  mimeType?: string;
}

export interface DbSaveAttachmentResult {
  success: boolean;
  attachmentId?: string;
  storedPath?: string;
  error?: string;
}

export interface DbSaveAttachmentContentParams {
  accountId: string;
  conversationId: string;
  messageId: string;
  base64: string;
  originalName: string;
  mimeType?: string;
}

export interface DbSaveAttachmentContentResult {
  success: boolean;
  attachmentId?: string;
  storedPath?: string;
  error?: string;
}

export interface DbGetAttachmentsParams {
  accountId: string;
  conversationId: string;
}

export interface DbAttachment {
  id: string;
  messageId: string;
  originalName: string;
  storedName: string;
  storedPath: string;
  mimeType: string | null;
  size: number;
  createdAt: number;
}

export interface DbGetAttachmentsResult {
  success: boolean;
  data?: DbAttachment[];
  error?: string;
}

export interface DbSearchMessagesParams {
  accountId: string;
  query: string;
  limit?: number;
}

export interface DbSearchMessageResult {
  id: string;
  conversationId: string;
  conversationTitle: string;
  webUrl: string;
  role: string;
  author: string;
  content: string;
  snippet: string;
  createdAt: number;
}

export interface DbSearchMessagesResult {
  success: boolean;
  data?: DbSearchMessageResult[];
  error?: string;
}

export interface DbSearchAttachmentsParams {
  accountId: string;
  query: string;
  limit?: number;
}

export interface DbSearchAttachmentResult {
  id: string;
  messageId: string;
  conversationId: string;
  conversationTitle: string;
  webUrl: string;
  originalName: string;
  storedPath: string;
  mimeType: string | null;
  size: number;
  createdAt: number;
}

export interface DbSearchAttachmentsResult {
  success: boolean;
  data?: DbSearchAttachmentResult[];
  error?: string;
}

export interface DbSearchAllAccountsParams {
  query: string;
  limit?: number;
}

export interface DbSearchAllAccountsResult {
  success: boolean;
  data?: {
    messages: Array<DbSearchMessageResult & { accountId: string }>;
    attachments: Array<DbSearchAttachmentResult & { accountId: string }>;
  };
  error?: string;
}

export interface Us1SendMessageParams {
  text?: string;
  clientRequestId?: string | null;
  brokerMessageId?: string | null;
  remoteUserId?: string | null;
  localSessionId?: string | null;
  attachments?: Array<{
    path: string;
    name?: string;
    mimeType?: string;
  }>;
}

export interface Us1RoomPackageCandidate {
  remoteUserId: string;
  localSessionId: string;
  conversationId: string;
  messageId: string;
  attachmentId?: string;
  originalName: string;
  storedPath: string;
  mimeType?: string | null;
  size?: number;
}

export interface Us1SendMessageResult {
  success: boolean;
  brokerMessageId?: string;
  remoteUserId?: string;
  localSessionId?: string;
  conversationId?: string;
  transportMessageId?: string;
  archiveMessageId?: string;
  deliveryState?: string;
  attachmentCount?: number;
  error?: string;
}

export interface Us1SyncMessagesParams {
  limit?: number;
  localSessionId?: string | null;
  consumeRoomCommands?: boolean;
}

export interface Us1SyncMessagesResult {
  success: boolean;
  remoteUserId?: string;
  localSessionId?: string | null;
  conversationId?: string | null;
  fetchedCount?: number;
  processedCount?: number;
  duplicateCount?: number;
  projectedCount?: number;
  skippedCount?: number;
  unresolvedSessionCount?: number;
  roomPackages?: Us1RoomPackageCandidate[];
  error?: string;
}

export interface Us1RelayHealthCheckParams {
  baseUrl?: string | null;
}

export interface Us1RelayHealthCheckResult {
  success: boolean;
  reachable?: boolean;
  checkedAt?: number;
  error?: string;
}

export interface LoadSettingsResult {
  [key: string]: unknown;
}

export interface SaveSettingsParams {
  [key: string]: unknown;
}

export interface SaveSettingsResult {
  success: boolean;
  error?: string;
}

export interface ReadFileParams {
  filePath: string;
}

export interface ReadFileResult {
  success: boolean;
  data?: string;
  error?: string;
}

export interface WriteFileParams {
  filePath: string;
  content: string;
}

export interface WriteFileResult {
  success: boolean;
  error?: string;
}

export interface FileExistsParams {
  filePath: string;
}

export interface FileExistsResult {
  exists: boolean;
}

export interface OpenDevToolsParams {
  webviewId?: string;
}

export interface SetAlwaysOnTopParams {
  value: boolean;
}

export interface MemoryItem {
  id: string;
  namespace: string;
  content: string;
  summary: string | null;
  sourceProvider: string | null;
  memoryType: string;
  importance: number;
  pinned: boolean;
  tags: string[];
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

export interface MemoryStats {
  totalMemories: number;
  pinnedMemories: number;
  averageImportance: number;
  lastUpdatedAt: number | null;
}

export interface MemorySearchParams {
  namespace?: string;
  query?: string;
  sourceProvider?: string;
  tags?: string[];
  limit?: number;
}

export interface MemorySearchResult {
  success: boolean;
  data?: { items: MemoryItem[]; total: number };
  error?: string;
}

export interface MemoryStatsParams {
  namespace?: string;
}

export interface MemoryStatsResult {
  success: boolean;
  data?: MemoryStats;
  error?: string;
}

export interface MemoryDeleteParams {
  id: string;
}

export interface MemoryDeleteResult {
  success: boolean;
  deleted?: boolean;
  error?: string;
}

export interface MemoryUpdateParams {
  id: string;
  content?: string;
  summary?: string;
  importance?: number;
  pinned?: boolean;
  tags?: string[];
  memoryType?: string;
}

export interface MemoryUpdateResult {
  success: boolean;
  updated?: boolean;
  error?: string;
}

export interface MemoryWriteParams {
  namespace?: string;
  content: string;
  summary?: string;
  sourceProvider?: string;
  memoryType?: string;
  importance?: number;
  pinned?: boolean;
  tags?: string[];
}

export interface MemoryWriteResult {
  success: boolean;
  data?: MemoryItem;
  error?: string;
}

export interface MemoryPruneParams {
  namespace?: string;
  maxItems: number;
  olderThanDays?: number;
}

export interface MemoryPruneResult {
  success: boolean;
  deleted?: number;
  error?: string;
}

export interface MemoryDeleteAllParams {
  namespace?: string;
}

export interface MemoryDeleteAllResult {
  success: boolean;
  deleted?: number;
  error?: string;
}

export interface IPCChannelMap {
  "db-init-account": { params: DbInitAccountParams; result: DbInitAccountResult };
  "db-get-conversations": { params: DbGetConversationsParams; result: DbGetConversationsResult };
  "db-get-messages": { params: DbGetMessagesParams; result: DbGetMessagesResult };
  "db-sync-messages": { params: DbSyncMessagesParams; result: DbSyncMessagesResult };
  "db-delete-conversation": {
    params: DbDeleteConversationParams;
    result: DbDeleteConversationResult;
  };
  "db-update-conversation": {
    params: DbUpdateConversationParams;
    result: DbUpdateConversationResult;
  };
  "db-save-attachment": { params: DbSaveAttachmentParams; result: DbSaveAttachmentResult };
  "db-save-attachment-content": {
    params: DbSaveAttachmentContentParams;
    result: DbSaveAttachmentContentResult;
  };
  "db-get-attachments": { params: DbGetAttachmentsParams; result: DbGetAttachmentsResult };
  "db-search-messages": { params: DbSearchMessagesParams; result: DbSearchMessagesResult };
  "db-search-attachments": { params: DbSearchAttachmentsParams; result: DbSearchAttachmentsResult };
  "db-search-all-accounts": {
    params: DbSearchAllAccountsParams;
    result: DbSearchAllAccountsResult;
  };

  "load-settings": { params: undefined; result: LoadSettingsResult };
  "save-settings": { params: SaveSettingsParams; result: SaveSettingsResult };

  "read-file": { params: ReadFileParams; result: ReadFileResult };
  "write-file": { params: WriteFileParams; result: WriteFileResult };
  "file-exists": { params: FileExistsParams; result: FileExistsResult };

  "open-devtools": { params: OpenDevToolsParams | undefined; result: undefined };
  "set-always-on-top": { params: SetAlwaysOnTopParams; result: undefined };
  "minimize-window": { params: undefined; result: undefined };
  "maximize-window": { params: undefined; result: undefined };
  "close-window": { params: undefined; result: undefined };
  "run-provider-scenario": {
    params: {
      slot: "ai0" | "ai1" | "ai2";
      scenarioId: string;
      syncMode?: "soft" | "full" | "clean";
    };
    result: ProviderScenarioResult;
  };
  "cancel-provider-scenario": {
    params: { runId: string };
    result: { success: boolean; runId: string; cancelled: boolean };
  };
  "test-provider": {
    params: { slot: "ai0" | "ai1" | "ai2" };
    result: ProviderTestSuite;
  };
  "us1-send-message": { params: Us1SendMessageParams; result: Us1SendMessageResult };
  "us1-sync-messages": { params: Us1SyncMessagesParams; result: Us1SyncMessagesResult };
  "us1-relay-health-check": {
    params: Us1RelayHealthCheckParams;
    result: Us1RelayHealthCheckResult;
  };
  "room-tools-call": { params: RoomToolCallRequest; result: RoomToolCallResult };
  "room-tools-cancel": { params: RoomToolCancelRequest; result: RoomToolCancelResult };
}

export type IPCChannel = keyof IPCChannelMap;

export type IPCParams<T extends IPCChannel> = IPCChannelMap[T]["params"];

export type IPCResult<T extends IPCChannel> = IPCChannelMap[T]["result"] extends undefined
  ? {
      success?: boolean;
      error?: string;
      errorKey?: string;
      errorParams?: TranslationParams;
    }
  : IPCChannelMap[T]["result"] & IpcErrorMeta;
