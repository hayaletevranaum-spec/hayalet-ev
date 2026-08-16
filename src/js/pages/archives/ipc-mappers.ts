import type { FileResult, MessageResult } from "./types.js";

export function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is Record<string, unknown> => {
    return item !== null && typeof item === "object";
  });
}

export function toRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return "";
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

export function unwrapIpcData(value: unknown): unknown {
  const record = toRecord(value);
  if (record === null || !("data" in record)) {
    return value;
  }
  return record["data"];
}

export function mapMessageResult(record: Record<string, unknown>): MessageResult {
  const conversationId = readString(record, "conversationId", "conversation_id");
  const conversationTitle = readString(record, "conversationTitle", "conversation_title");
  const accountId = readString(record, "accountId", "account_id");
  const content = readString(record, "content");
  const snippetRaw = readString(record, "snippet");
  const snippet = snippetRaw !== "" ? snippetRaw : content;

  const mapped: MessageResult = { conversationId };
  if (conversationTitle !== "") {
    mapped.conversationTitle = conversationTitle;
  }
  if (accountId !== "") {
    mapped.accountId = accountId;
  }
  if (snippet !== "") {
    mapped.snippet = snippet;
  }
  if (content !== "") {
    mapped.content = content;
  }
  return mapped;
}

export function mapFileResult(record: Record<string, unknown>): FileResult {
  const storedPath = readString(record, "storedPath", "stored_path");
  const originalName = readString(record, "originalName", "original_name");
  const mimeType = readString(record, "mimeType", "mime_type");
  const conversationTitle = readString(record, "conversationTitle", "conversation_title");
  const accountId = readString(record, "accountId", "account_id");
  const conversationId = readString(record, "conversationId", "conversation_id");
  const size = readNumber(record, "size");

  const mapped: FileResult = {};
  if (storedPath !== "") {
    mapped.storedPath = storedPath;
  }
  if (originalName !== "") {
    mapped.originalName = originalName;
  }
  if (mimeType !== "") {
    mapped.mimeType = mimeType;
  }
  if (size !== undefined) {
    mapped.size = size;
  }
  if (conversationTitle !== "") {
    mapped.conversationTitle = conversationTitle;
  }
  if (accountId !== "") {
    mapped.accountId = accountId;
  }
  if (conversationId !== "") {
    mapped.conversationId = conversationId;
  }
  return mapped;
}
