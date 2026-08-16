export interface MessageItem {
  id: string;
  role: string;
  content?: string;
  text?: string;
  author?: string;
  createdAt?: number;
}

export interface AttachmentData {
  messageId: string;
  originalName?: string;
  storedName?: string;
  storedPath?: string;
  mimeType?: string;
  size?: number;
}

export interface DbMessagesResult {
  data?: MessageItem[];
}

export interface DbAttachmentsResult {
  data?: AttachmentData[];
  success?: boolean;
}

export interface OpenPathResult {
  success?: boolean;
  message?: string;
}

function readStringField(value: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate.trim();
    }
  }

  return undefined;
}

function readNumberField(value: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function normalizeMessageItem(value: unknown): MessageItem | null {
  if (value === null || value === undefined || typeof value !== "object") {
    return null;
  }

  const maybe = value as Record<string, unknown>;
  const id = readStringField(maybe, "id");
  const role = readStringField(maybe, "role");
  if (id === undefined || role === undefined) {
    return null;
  }

  const content = readStringField(maybe, "content");
  const text = readStringField(maybe, "text", "content");
  const author = readStringField(maybe, "author");
  const createdAt = readNumberField(maybe, "createdAt", "created_at");

  return {
    id,
    role,
    ...(content !== undefined ? { content } : {}),
    ...(text !== undefined ? { text } : {}),
    ...(author !== undefined ? { author } : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
  };
}

export function normalizeAttachmentData(value: unknown): AttachmentData | null {
  if (value === null || value === undefined || typeof value !== "object") {
    return null;
  }

  const maybe = value as Record<string, unknown>;
  const messageId = readStringField(maybe, "messageId", "message_id");
  if (messageId === undefined) {
    return null;
  }

  const originalName = readStringField(maybe, "originalName", "original_name");
  const storedName = readStringField(maybe, "storedName", "stored_name");
  const storedPath = readStringField(maybe, "storedPath", "stored_path");
  const mimeType = readStringField(maybe, "mimeType", "mime_type");
  const size = readNumberField(maybe, "size");

  return {
    messageId,
    ...(originalName !== undefined ? { originalName } : {}),
    ...(storedName !== undefined ? { storedName } : {}),
    ...(storedPath !== undefined ? { storedPath } : {}),
    ...(mimeType !== undefined ? { mimeType } : {}),
    ...(size !== undefined ? { size } : {}),
  };
}

export function isDbMessagesResult(value: unknown): value is DbMessagesResult {
  if (value === null || value === undefined || typeof value !== "object") {
    return false;
  }
  const maybe = value as Record<string, unknown>;
  return maybe["data"] === undefined || Array.isArray(maybe["data"]);
}

export function isDbAttachmentsResult(value: unknown): value is DbAttachmentsResult {
  if (value === null || value === undefined || typeof value !== "object") {
    return false;
  }
  const maybe = value as Record<string, unknown>;
  const dataValid = maybe["data"] === undefined || Array.isArray(maybe["data"]);
  const successValid = maybe["success"] === undefined || typeof maybe["success"] === "boolean";
  return dataValid && successValid;
}

export function isOpenPathResult(value: unknown): value is OpenPathResult {
  if (value === null || value === undefined || typeof value !== "object") {
    return false;
  }
  const maybe = value as Record<string, unknown>;
  const successValid = maybe["success"] === undefined || typeof maybe["success"] === "boolean";
  const messageValid = maybe["message"] === undefined || typeof maybe["message"] === "string";
  return successValid && messageValid;
}
