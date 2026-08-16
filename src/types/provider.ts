import type { AllProviderId } from "./common.js";

export interface BaseSelectors {
  sendButton: string;
  sendButtonDisabled?: string;
  stopButton: string;
  inputField: string;
  messageContainer: string;
  voiceButton?: string;
  microphoneButton?: string;
  generatedImage?: string;
  filePreview?: string | string[];
  attachButton?: string;
}

export interface ScrapeSelectors {
  preferred: string;
  fallback: string;
  messageWrapper?: string;
  userWrapper?: string;
  assistantWrapper?: string;
  messageId?: string;
  userMessage?: string;
  assistantMessage?: string;
}

export interface GeneratedImageAsset {
  id?: string;
  stableKey?: string;
  src?: string;
  currentSrc?: string;
  alt?: string;
  mimeType?: string;
  originalName?: string;
  imageIndex?: number;
  width?: number;
  height?: number;
}

export interface RoleSelectors {
  user: string;
  assistant: string;
  text?: string;
}

export interface FilterConfig {
  selectors: string[];
  hosts: string[];
  blockResourceTypes: string[];
  dragOverlaySelectors?: string[];
  dragTextMatchers?: string[];
}

export interface TelemetryConfig {
  endpoints: string[];
  tokenPaths: string[];
}

export interface LocalizedSelectorEntry {
  tr?: string;
  en?: string;
  fallbacks?: string[];
  [locale: string]: string | string[] | undefined;
}

export interface ProviderSelectorMatrix {
  selectors?: Record<string, LocalizedSelectorEntry>;
}

export type ProviderScenarioFailureMode = "abort" | "continue" | "warn";

export type ProviderScenarioCommandActionId =
  | "navigate-default"
  | "assert-sidebar-open"
  | "assert-session-list"
  | "assert-sidebar-close"
  | "prepare-input"
  | "assert-disabled-send"
  | "assert-drag-drop-surface"
  | "inject-prompt"
  | "assert-enabled-send"
  | "assert-attach-flow"
  | "send-and-wait-thinking"
  | "assert-final-bubbles"
  | "assert-generated-image"
  | "assert-generated-image-archive"
  | "assert-scroll-behavior"
  | "assert-provider-capabilities"
  | "click"
  | "wait"
  | "check"
  | "navigate"
  | "collect-session-urls"
  | "sync-session"
  | "refresh-conversation-list"
  | (string & {});

export interface ProviderScenarioCommandDefinition {
  id: string;
  label: string;
  action: ProviderScenarioCommandActionId;
  target?: string;
  params?: Record<string, unknown>;
  saveAs?: string;
  forEach?: string;
  loading?: boolean;
  onFail?: ProviderScenarioFailureMode;
  whenSyncModes?: ProviderWebviewSyncMode[];
}

export interface ProviderScenarioDefinition {
  id: ProviderScenarioId;
  title: string;
  description?: string;
  commands: ProviderScenarioCommandDefinition[];
}

export type ProviderWebviewSyncReadiness = "verified" | "estimated";

export type ProviderWebviewSyncMode = "soft" | "full" | "clean";

export interface ProviderWebviewSyncSidebarSelectors {
  openButtonSelectors: string[];
  closeButtonSelectors: string[];
}

export interface ProviderWebviewSyncHistorySelectors {
  containerSelectors: string[];
  itemSelectors: string[];
  titleSelectors: string[];
}

export interface ProviderWebviewSyncConfig {
  readiness: ProviderWebviewSyncReadiness;
  sidebar: ProviderWebviewSyncSidebarSelectors;
  history: ProviderWebviewSyncHistorySelectors;
}

export type MessageIdStrategy = "content-hash" | "dom-id";

export type InputType = "direct" | "character-by-character" | "contenteditable";

export interface BaseProviderConfig {
  id: AllProviderId;
  name: string;
  baseUrl: string;
  loginUrl: string | null;
  lastVerified: string;

  selectors: BaseSelectors;
  selectorMatrix?: ProviderSelectorMatrix;
  inputType: InputType;
  scrollerSelectors: string[];
  scrapeSelectors: ScrapeSelectors;
  fileInputSelectors: string[];
  uploadTargetSelectors: string[];
  dragDropCriticalSelectors?: string[];
  criticalSelectors: string[];
  contentContainers: string[];
  excludedUrls: string[];

  filters: FilterConfig;
  telemetry: TelemetryConfig;

  messageIdStrategy?: MessageIdStrategy;
  roleSelectors?: RoleSelectors;
  defaultPaths?: string[];
  syncOnDefaultPage?: boolean;
  preserveSyncUrlQuery?: boolean;
  scenarios?: Record<string, ProviderScenarioDefinition>;
  webviewSync?: ProviderWebviewSyncConfig;
}

export interface ChatGPTConfig extends BaseProviderConfig {
  id: "chatgpt";
}

export interface GeminiConfig extends BaseProviderConfig {
  id: "gemini";
  defaultPaths: string[];
  roleSelectors: RoleSelectors;
}

export interface GrokConfig extends BaseProviderConfig {
  id: "grok";
}

export interface LLMConfig extends BaseProviderConfig {
  id: "llm";
  loginUrl: null;
}

export interface OpenCodeConfig extends BaseProviderConfig {
  id: "opencode";
  port: number;
  cors: string;
  command: string;
  isAssistant: true;
  loginUrl: null;
  getProjectUrl: (projectPath?: string | null, port?: number) => string;
  getServerCommand: (port?: number, cors?: string) => { command: string; args: string[] };
}

export interface OpenCodeUiConfig extends BaseProviderConfig {
  id: "opencode-ui";
  port: number;
  cors: string;
  command: string;
  isAssistant: true;
  loginUrl: null;
  getProjectUrl: (projectPath?: string | null, port?: number) => string;
  getServerCommand: (port?: number, cors?: string) => { command: string; args: string[] };
}

export type AssistantProviderConfig = OpenCodeConfig | OpenCodeUiConfig;

export type ProviderConfig =
  ChatGPTConfig | GeminiConfig | GrokConfig | LLMConfig | AssistantProviderConfig;

export interface ProviderScraper {
  scrapeMessages: (doc: Document) => ScrapedMessage[];
  getMessageRole: (el: Element) => "user" | "assistant" | null;
  getMessageText: (el: Element) => string;
}

export interface ScrapedMessage {
  role: "user" | "assistant";
  text: string;
  index: number;
  contentHash?: string;
  domId?: string;
  generatedImages?: GeneratedImageAsset[];
}

export interface ProviderInstance {
  config: ProviderConfig;
  scraper: ProviderScraper;
}

export interface RegisteredProvider {
  id: AllProviderId;
  config: ProviderConfig;
  scraper?: ProviderScraper;
}

export type ProviderRegistryMap = Map<AllProviderId, RegisteredProvider>;

export type TestStatus = "pass" | "fail" | "skip" | "warning";

export type ProviderScenarioId = "webview-test" | "webview-sync" | (string & {});

export type ProviderTestSlot = "ai0" | "ai1" | "ai2";

export type ProviderScenarioProgressEventType =
  "started" | "command-start" | "command-complete" | "completed";

export type ProviderTestProgressEventType = ProviderScenarioProgressEventType;
export type ProviderScenarioCommandStatus = TestStatus | "running";

export type TestCategory = "preflight" | "dom" | "interactive" | "scraping" | "advanced";

export interface ProviderTestSelectorEvidence {
  group: string;
  key: string;
  selector: string;
  promotable: boolean;
}

export interface ProviderSessionPreviewItem {
  title: string;
  url: string;
}

export interface ProviderSessionPreview {
  total: number;
  sessions: ProviderSessionPreviewItem[];
}

export interface ProviderTestResultDetails {
  selector?: string;
  element?: {
    tagName: string;
    visible: boolean;
    enabled: boolean;
    textContent?: string;
  };
  selectorEvidence?: ProviderTestSelectorEvidence;
  sessionPreview?: ProviderSessionPreview;
  error?: string;
}

export interface ProviderTestResult {
  id: string;
  name: string;
  category: TestCategory;
  status: TestStatus;
  message: string;
  details?: ProviderTestResultDetails;
  duration: number;
  timestamp: number;
}

export interface ProviderScenarioCommandReport {
  id: string;
  name: string;
  action: ProviderScenarioCommandActionId | (string & {});
  status: ProviderScenarioCommandStatus;
  message: string;
  duration: number;
  timestamp: number;
  startedAt?: number;
  completedAt?: number;
  input?: Record<string, unknown>;
  output?: unknown;
  details?: ProviderTestResultDetails;
}

export interface ProviderScenarioProgressEvent {
  runId: string;
  scenarioId: ProviderScenarioId;
  slot: ProviderTestSlot;
  providerId: string;
  scenarioCommandTotal?: number;
  type: ProviderScenarioProgressEventType;
  commandId?: string;
  commandName?: string;
  status?: ProviderScenarioCommandStatus;
  message?: string;
  commandReport?: ProviderScenarioCommandReport;
  timestamp: number;
}

export type ProviderTestProgressEvent = ProviderScenarioProgressEvent;

export interface ProviderScenarioResult {
  runId?: string;
  scenarioId: ProviderScenarioId;
  providerId: string;
  providerName: string;
  slot: ProviderTestSlot;
  url: string;
  timestamp: number;
  passed: number;
  failed: number;
  skipped: number;
  warnings: number;
  totalDuration: number;
  results: ProviderTestResult[];
  commands: ProviderScenarioCommandReport[];
  refreshedConfig?: ProviderConfig;
  aborted?: boolean;
  abortReason?: string;
}

export interface ProviderTestSuite extends ProviderScenarioResult {
  totalTests: number;
}
