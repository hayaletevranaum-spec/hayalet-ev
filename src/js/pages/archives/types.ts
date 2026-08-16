export interface ArchiveEntry {
  id: string;
  accountId?: string;
  title?: string;
  summary?: string;
  webUrl?: string;
  messageCount?: number;
  provider?: string;
}

export interface MessageResult {
  conversationId: string;
  conversationTitle?: string;
  accountId?: string;
  snippet?: string;
  content?: string;
}

export interface FileResult {
  storedPath?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  conversationTitle?: string;
  accountId?: string;
  conversationId?: string;
}
