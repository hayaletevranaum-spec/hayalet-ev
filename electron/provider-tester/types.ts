import { PROVIDER_TEST_TIMEOUTS } from "../../shared/timeouts.ts";

import type {
  ProviderConfig,
  ProviderTestProgressEvent,
  ProviderTestResult,
  ProviderTestSelectorEvidence,
  ProviderTestSlot,
  ProviderWebviewSyncMode,
  TestCategory,
} from "../../src/types/provider.ts";
import type { SelectorLanguage, TranslationParams } from "../../src/types/i18n.ts";
import type { SyncMessagesParams } from "../types/index.ts";

type UpsertConversationMetadataParams = {
  accountId: string;
  webUrl: string;
  provider?: string;
  title?: string | null;
};

type ResetConversationMessagesParams = {
  accountId: string;
  webUrl: string;
};

export const PROVIDER_TEST = {
  TEST_MESSAGE:
    "1'den 20'ye kadar numaralari yaz. Her satirda yalnizca bir sayi olsun. Baska aciklama ekleme.",
  IMAGE_MESSAGE: "3:2 oranli, beyaz fonda tek bir kirmizi elma gorseli uret. Metin ekleme.",
  TIMEOUT_DOM_TEST: PROVIDER_TEST_TIMEOUTS.DOM_TEST,
  TIMEOUT_SEND_MESSAGE: PROVIDER_TEST_TIMEOUTS.SEND_MESSAGE,
  TIMEOUT_RESPONSE_WAIT: PROVIDER_TEST_TIMEOUTS.RESPONSE_WAIT,
  TIMEOUT_STOP_BUTTON: PROVIDER_TEST_TIMEOUTS.STOP_BUTTON,
  TIMEOUT_INPUT_CLEAR: PROVIDER_TEST_TIMEOUTS.INPUT_CLEAR,
  TIMEOUT_SEND_INDICATOR: PROVIDER_TEST_TIMEOUTS.SEND_INDICATOR,
  TIMEOUT_TOTAL: PROVIDER_TEST_TIMEOUTS.TOTAL,
  RETRY_DOM_CHECK: 3,
  RETRY_DELAY: PROVIDER_TEST_TIMEOUTS.RETRY_DELAY,
} as const;

export interface ElementCheckResult {
  exists: boolean;
  visible: boolean;
  disabled?: boolean;
  enabled: boolean;
  editable?: boolean;
  tagName: string;
  textContent?: string;
  error?: string;
}

export interface SelectorCheckResult {
  selector: string;
  exists: boolean;
}

export interface MessageScrapingResult {
  found: boolean;
  text?: string;
  textContent?: string;
}

export interface WebviewTag {
  getURL(): string;
  loadURL(url: string): Promise<void>;
  executeJavaScript(script: string): Promise<unknown>;
  addEventListener(event: string, listener: () => void, options?: { once?: boolean }): void;
  getBoundingClientRect?: () => DOMRect;
  getWebContentsId?: () => number;
  capturePageRegion?: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => Promise<{ success?: boolean; dataUrl?: string } | null>;
}

export interface RendererShell {
  executeJavaScript(script: string): Promise<unknown>;
}

export interface ProviderTesterDatabaseManager {
  syncMessages: (
    event: null,
    params: SyncMessagesParams
  ) => Promise<{
    success: boolean;
    error?: string;
    conversationId?: string;
    added?: number;
    total?: number;
  }>;
  getMessages: (
    event: null,
    params: { accountId: string; conversationId: string }
  ) => Promise<{
    success: boolean;
    error?: string;
    data?: unknown[];
  }>;
  upsertConversationMetadata: (
    event: null,
    params: UpsertConversationMetadataParams
  ) => Promise<{
    success: boolean;
    error?: string;
    data?: {
      conversationId: string;
      created: boolean;
      title: string;
      titleUpdated: boolean;
    };
  }>;
  getAttachments: (
    event: null,
    params: { accountId: string; conversationId: string }
  ) => Promise<{
    success: boolean;
    error?: string;
    data?: unknown[];
  }>;
  saveAttachmentContent: (
    event: null,
    params: {
      accountId: string;
      conversationId: string;
      messageId: string;
      base64: string;
      originalName: string;
      mimeType?: string;
    }
  ) => Promise<{
    success: boolean;
    error?: string;
    data?: {
      attachmentId: string;
      storedPath: string;
    };
  }>;
  resetConversationMessages: (
    event: null,
    params: ResetConversationMessagesParams
  ) => Promise<{
    success: boolean;
    error?: string;
    data?: {
      conversationId: string;
      deletedCount: number;
    };
  }>;
}

export interface ProviderTestRunOptions {
  emitProgress: ((event: ProviderTestProgressEvent) => void) | undefined;
  appLanguage?: SelectorLanguage;
  runId?: string;
  syncMode?: ProviderWebviewSyncMode;
  defaultUrlOverride?: string;
  commandStartDelayMs?: number;
  navigationObservationDelayMs?: number;
  databaseManager?: ProviderTesterDatabaseManager;
  abortSignal?: AbortSignal;
}

export interface TestContext {
  slot: ProviderTestSlot;
  webview: WebviewTag;
  config: ProviderConfig;
  appLanguage: SelectorLanguage;
  abortSignal?: AbortSignal;
  shell?: RendererShell;
  executeScript: (script: string) => Promise<unknown>;
  executeShellScript: (script: string) => Promise<unknown>;
  clickElement: (selector: string) => Promise<boolean>;
  isElementVisible: (selector: string) => Promise<boolean>;
  waitForCondition: (
    condition: () => Promise<boolean>,
    timeout: number,
    signal?: AbortSignal
  ) => Promise<boolean>;
  t: (key: string, params?: TranslationParams) => Promise<string>;
  createSkipResult: (
    id: string,
    name: string,
    category: TestCategory,
    reason: string
  ) => ProviderTestResult;
  testSelector: (opts: SelectorTestOptions) => Promise<ProviderTestResult>;
}

export interface SelectorTestOptions {
  id: string;
  name: string;
  selector: string;
  selectorCandidates?: string[];
  category: TestCategory;
  checks: Array<"exists" | "visible" | "enabled" | "disabled" | "editable">;
  evidence?: ProviderTestSelectorEvidence;
}

export interface InteractiveTestsResult {
  results: ProviderTestResult[];
  aborted: boolean;
}
