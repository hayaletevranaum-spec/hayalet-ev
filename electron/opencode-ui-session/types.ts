export type JsonRecord = Record<string, unknown>;

export interface OpencodeUiStoreOptions {
  dbPath?: string;
  now?: () => number;
}

export interface OpencodeUiSessionSummary {
  id: string;
  title: string;
  workspace_path: string;
  updated_at: number;
  created_at: number;
  archived_at: number | null;
}

export interface OpencodeUiToolCall {
  name: string;
  args: string;
  result: string;
  detail?: string;
  status?: "done" | "running" | "retrying" | "interrupted" | "failed" | "error";
}

export interface OpencodeUiMessageAttachment {
  name: string;
  fileName?: string;
  media_type?: string;
  size?: number;
  source?: "file-picker" | "clipboard" | "history";
  url?: string;
  data?: string;
  base64?: string;
}

export interface OpencodeUiMessageNotice {
  tone: "info" | "warning" | "error" | "success";
  title: string;
  detail?: string;
  meta?: string;
}

export type OpencodeUiMessageBlockKind = "markdown" | "reasoning" | "step" | "patch";

export interface OpencodeUiMessageBlock {
  kind: OpencodeUiMessageBlockKind;
  title?: string;
  text?: string;
  meta?: string;
  items?: string[];
}

export interface OpencodeUiSessionMessage {
  role: "user" | "assistant";
  text: string;
  files: OpencodeUiMessageAttachment[];
  notices: OpencodeUiMessageNotice[];
  blocks: OpencodeUiMessageBlock[];
  toolCalls: OpencodeUiToolCall[];
}

export interface OpencodeUiTodoItem {
  content: string;
  status: string;
  priority: string;
}

export interface OpencodeUiSessionDetail {
  id: string;
  title: string;
  workspace_path: string;
  usage: Record<string, unknown>;
  messages: OpencodeUiSessionMessage[];
  todos: OpencodeUiTodoItem[];
  changed_files: string[];
}

export interface OpencodeUiListSessionsResult {
  success: boolean;
  sessions?: OpencodeUiSessionSummary[];
  error?: string;
}

export interface OpencodeUiEnsureSessionResult {
  success: boolean;
  created?: boolean;
  error?: string;
}

export interface OpencodeUiArchiveSessionResult {
  success: boolean;
  archived?: boolean;
  error?: string;
}

export interface OpencodeUiReadSessionResult {
  success: boolean;
  session?: OpencodeUiSessionDetail;
  error?: string;
}

export interface SessionRow {
  id: string;
  title: string;
  directory: string;
  time_created: number;
  time_updated: number;
  time_archived?: number | null;
  project_id: string;
  version: string;
  workspace_id?: string | null;
}

export interface MessageRow {
  id: string;
  data: string;
  time_created: number;
}

export interface PartRow {
  message_id: string;
  data: string;
  time_created: number;
}
