export type SlotId = "ai0" | "ai1" | "ai2";

export type UserSlotId = "ai1" | "ai2";

export type AssistantSlotId = "ai0";

export type ProviderId = "chatgpt" | "gemini" | "grok" | "llm" | "opencode";

export type AssistantProviderId = "opencode" | "opencode-ui";

// NOTE: Dedicated list for runtime guard checks.
export const ASSISTANT_PROVIDER_IDS = ["opencode", "opencode-ui"] as const;

export function isAssistantProviderId(value: unknown): value is AssistantProviderId {
  return typeof value === "string" && (ASSISTANT_PROVIDER_IDS as readonly string[]).includes(value);
}

export type AllProviderId = ProviderId | AssistantProviderId;

export type SpecialPage = "settings" | "webview" | "assistant";

export type Nullable<T> = T | null;

export type Optional<T> = T | undefined;

export type Callback<T = void> = () => T;

export type AsyncCallback<T = void> = () => Promise<T>;

export type EventListener<T = unknown> = (payload: T) => void;

export type Unsubscribe = () => void;

export interface BaseResult {
  success: boolean;
  message?: string;
  error?: string;
}

export interface DataResult<T> extends BaseResult {
  data?: T;
}

export interface ListResult<T> extends BaseResult {
  items?: T[];
  total?: number;
}

export interface FileInfo {
  path: string;
  name: string;
  size?: number;
  mimeType?: string;
  data?: string; // NOTE: Base64-encoded payload.
}

export interface UploadedFile extends FileInfo {
  url?: string;
  uploadedAt?: number;
}

export interface Attachment {
  id?: string;
  name: string;
  path?: string;
  url?: string;
  mimeType?: string;
  size?: number;
  data?: string; // NOTE: Base64-encoded payload.
}

export type LogLevel = "debug" | "info" | "warning" | "error";

export type LogSource = string;

export interface LogEntry {
  timestamp: number;
  source: LogSource;
  level: LogLevel;
  message: string;
  data?: unknown;
}

export interface ErrorLike {
  message?: string;
  name?: string;
  stack?: string;
}

// NOTE: This helper exists because catch-block errors are typed as unknown.
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error !== null && error !== undefined && typeof error === "object" && "message" in error) {
    return String((error as ErrorLike).message);
  }
  return String(error);
}
