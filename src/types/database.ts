export interface Conversation {
  id: string;
  accountId: string;
  title: string;
  webUrl: string;
  createdAt: number;
  updatedAt: number;
  messageCount?: number;
  lastMessage?: string;
  archived?: boolean;
  starred?: boolean;
  tags?: string[];
}

export interface ConversationUpdate {
  accountId: string;
  conversationId: string;
  title?: string;
  archived?: boolean;
  starred?: boolean;
  tags?: string[];
  [key: string]: unknown;
}

export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  conversationId: string;
  accountId: string;
  role: MessageRole;
  content: string;
  contentHash: string;
  index: number;
  createdAt: number;
  updatedAt?: number;
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  model?: string;
  tokens?: number;
  attachments?: MessageAttachment[];
  reactions?: string[];
  [key: string]: unknown;
}

export interface MessageAttachment {
  id: string;
  name: string;
  url?: string;
  mimeType?: string;
  size?: number;
}

export interface MessageSyncPayload {
  accountId: string;
  provider?: string;
  webUrl: string;
  messages: SyncMessage[];
  authors?: SyncAuthors;
}

export interface SyncMessage {
  role: MessageRole;
  text: string;
  index: number;
  contentHash?: string;
}

export interface SyncAuthors {
  user?: string;
  assistant?: string;
}

export interface SyncResult {
  success: boolean;
  conversationId?: string;
  added?: number;
  updated?: number;
  deleted?: number;
  message?: string;
}

export interface SearchParams {
  accountId?: string;
  query: string;
  limit?: number;
  offset?: number;
  filters?: SearchFilters;
}

export interface SearchFilters {
  role?: MessageRole;
  dateFrom?: number;
  dateTo?: number;
  conversationId?: string;
}

export interface SearchResult {
  messages: Message[];
  total: number;
  hasMore: boolean;
}

export interface StoredAttachment {
  id: string;
  conversationId: string;
  accountId: string;
  messageId?: string;
  name: string;
  path?: string;
  url?: string;
  mimeType?: string;
  size?: number;
  hash?: string;
  createdAt: number;
}
