export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiProxyResult {
  success: boolean;
  data?: unknown;
  error?: string;
  status?: number;
  statusText?: string;
}

export interface FetchOptions {
  method: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface CustomSelectItem {
  value: string;
  label: string;
  subtitle?: string;
  badge?: string;
  badgeClass?: string;
}

export interface CustomSelectAPI {
  setItems: (items: CustomSelectItem[], activeValue?: string) => void;
  setError: (msg?: string) => void;
}

export type CustomSelectCallback = (value: string, text: string) => void | Promise<void>;
export type RovoInteractionMode = "off" | "plan-harder-local" | "change-approval";

export type SessionTab = "active" | "archived";

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
  args?: string;
  result?: string;
  detail?: string;
  status?: "done" | "running" | "retrying" | "interrupted" | "failed" | "error";
}

export type OpencodeUiMessageAttachmentKind =
  "image" | "text" | "pdf" | "code" | "archive" | "file";

export interface OpencodeUiMessageAttachment {
  id?: string;
  name: string;
  fileName?: string;
  path?: string;
  media_type?: string;
  size?: number;
  source?: "file-picker" | "clipboard" | "history";
  url?: string;
  data?: string;
  base64?: string;
  previewUrl?: string;
  kind?: OpencodeUiMessageAttachmentKind;
}

export type OpencodeUiMessageNoticeTone = "info" | "warning" | "error" | "success";

export interface OpencodeUiMessageNotice {
  tone: OpencodeUiMessageNoticeTone;
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
  files?: OpencodeUiMessageAttachment[];
  notices?: OpencodeUiMessageNotice[];
  blocks?: OpencodeUiMessageBlock[];
  toolCalls?: OpencodeUiToolCall[];
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
  todos?: OpencodeUiTodoItem[];
  changed_files?: string[];
}

export interface OpencodeUiFsListResult {
  success: boolean;
  sessions?: OpencodeUiSessionSummary[];
  error?: string;
}

export interface OpencodeUiFsReadResult {
  success: boolean;
  session?: OpencodeUiSessionDetail;
  error?: string;
}

export interface OpencodeUiFsEnsureResult {
  success: boolean;
  created?: boolean;
  error?: string;
}

export interface OpencodeUiFsArchiveResult {
  success: boolean;
  archived?: boolean;
  error?: string;
}

export interface SelectItem {
  value: string;
  label: string;
  subtitle?: string;
  providerId?: string;
  providerName?: string;
  modelId?: string;
  modelKey?: string;
  reasoningEfforts?: string[];
  variantOptions?: ModelVariantOption[];
  isConnected?: boolean;
  isFavorite?: boolean;
  isHidden?: boolean;
  isPassive?: boolean;
}

export interface ModelVariantOption {
  key: string;
  label: string;
  subtitle?: string;
  options: Record<string, unknown>;
}

export interface ModelMeta {
  modelId: string;
  modelKey: string;
  providerId: string;
  providerName: string;
  label: string;
  subtitle: string;
  reasoningEfforts: string[];
  variantOptions: ModelVariantOption[];
}

export interface OpencodeUiModelPreferences {
  hiddenProviders: string[];
  hiddenModels: string[];
  disabledProviders: string[];
  disabledModels: string[];
  favoriteModels: string[];
  defaultModelKey: string | null;
  lastSelectedModelKey: string | null;
}

export interface ComposerAttachment {
  id: string;
  name: string;
  mimeType: string;
  base64: string;
  size: number;
  source: "file-picker" | "clipboard";
}

export interface ProviderItem {
  id: string;
  name: string;
  badge: string;
  isConnected?: boolean;
  isHidden?: boolean;
  isPassive?: boolean;
  totalModels?: number;
  visibleModels?: number;
  passiveModels?: number;
}

export interface RuntimeState {
  baseUrl: string;
  dbPath: string;
  activeSessionId: string | null;
  sessionTab: SessionTab;
  submittingSessionId: string | null;
  activeModelKey: string | null;
  activeReasoningEffort: string | null;
  activeAgentId: string | null;
  activeInteractionMode: RovoInteractionMode;
  modelMetaByKey: Record<string, ModelMeta>;
  modelItems: SelectItem[];
  providerItems: ProviderItem[];
  modelPreferences: OpencodeUiModelPreferences;
  endpointDefaultModelKeys: string[];
  isSubmitting: boolean;
  lastRenderedMessageCount: number;
  lastRenderedSnapshotKey: string;
  stagedAttachments: ComposerAttachment[];
}
