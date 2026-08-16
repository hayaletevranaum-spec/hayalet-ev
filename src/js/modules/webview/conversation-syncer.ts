import { LogCategory } from "@shared/logging-core";
import { ASSISTANT_TIMEOUTS } from "@timeouts";
import { Logger } from "../logger/index.js";
import { waitForDomReady } from "./methods/shared/file-utils.js";
import { getErrorMessage } from "@shared/index.js";
import { formatErrorWithDetail } from "../../../../shared/i18n/error-detail.js";
import { TrafficManager } from "../traffic-manager.js";
import { CatchManager } from "../catch-manager.js";
import { AppState } from "../app-state.js";
import { ConversationListManager } from "../conversation-list-manager.js";
import { AppI18n } from "../i18n/index.js";
import { getProvider } from "./provider-factory.js";
import { ProviderRegistry } from "./provider-registry.js";
import { isProviderScenarioActive } from "./provider-scenario-lock.js";
import { normalizeUrl, isSlotUrlExcluded, isDefaultPage } from "./methods/shared/url-utils.js";
import { PendingArchiveHandler } from "./pending-archive-handler.js";
import { applyPendingOutboundBridgeMetadata } from "./outbound-bridge-metadata.js";
import { hashString } from "./providers/shared/scraper-helpers.js";
import { dispatchExpectedCommandCaptureFailure } from "../rooms/expected-command-capture-events.js";
import {
  buildGeneratedImageExtractionScript,
  parseGeneratedImageDataUrl,
  type GeneratedImageExtractionResult,
} from "./providers/shared/generated-image-extractor.js";
import type { AppSettings } from "@shared/settings.js";

function syncLogKey(key: string): string {
  return `app.logs.webviewSync.${key}`;
}

function syncT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.logs.webviewSync.${key}`, params);
}

function syncError(
  key: string,
  detail?: unknown,
  params?: Record<string, string | number>
): string {
  return formatErrorWithDetail(syncT(key, params), detail);
}

interface WebviewElement {
  getURL?: () => string;
  executeJavaScript: (script: string) => Promise<unknown>;
  getBoundingClientRect?: () => DOMRect;
  getWebContentsId?: () => number;
}

interface SyncResult {
  success: boolean;
  message?: string;
  conversationId?: string | undefined;
  commands?: { command: string; [key: string]: unknown }[] | undefined;
  transient?: boolean;
  [key: string]: unknown;
}

interface CoreEngine {
  handleCaughtCommand: (command: string, payload: Record<string, unknown>) => Promise<unknown>;
}

interface ScrapedMessage {
  role?: string;
  text?: string;
  content?: string;
  index?: number;
  domIndex?: number;
  domId?: string | null;
  contentHash?: string;
  generatedImages?: unknown;
  [key: string]: unknown;
}

interface DbSyncResult {
  success: boolean;
  error?: string | undefined;
  added?: number | undefined;
  droppedDuplicates?: number | undefined;
  lastEventSeq?: number | undefined;
  syncedCount?: number | undefined;
  total?: number | undefined;
  conversationId?: string | undefined;
}

interface DbMessagesResult {
  data?: ScrapedMessage[];
}

interface DbAttachmentsResult {
  data?: unknown[];
  success?: boolean;
}

interface GeneratedImageAsset {
  id?: string;
  stableKey?: string;
  src?: string;
  currentSrc?: string;
  alt?: string;
  mimeType?: string;
  originalName?: string;
  imageIndex?: number;
}

interface ImageCaptureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type ImageExtractionResult = GeneratedImageExtractionResult;

interface GeneratedImagePersistResult {
  savedCount: number;
  pendingCount: number;
}

interface ConversationItem {
  webUrl?: string;
  messageCount?: number;
}

type ResolveWebviewFn = (slot: string) => WebviewElement | null;
type StableCallback = (err: Error | null, result: SyncResult | null) => void;

function readStringField(value: unknown, ...keys: string[]): string {
  if (typeof value !== "object" || value === null) {
    return "";
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim() !== "") {
      return candidate.trim();
    }
  }

  return "";
}

function readNumberField(value: unknown, ...keys: string[]): number | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

function buildSyncClientRequestId(
  provider: string,
  webUrl: string,
  messages: ScrapedMessage[]
): string {
  const signature = messages
    .map((message, index) => {
      const role = typeof message.role === "string" ? message.role.trim() : "";
      const text =
        typeof message.text === "string"
          ? message.text
          : typeof message.content === "string"
            ? message.content
            : "";
      const domId = typeof message.domId === "string" ? message.domId.trim() : "";
      const domIndex =
        typeof message.domIndex === "number" && Number.isFinite(message.domIndex)
          ? Math.trunc(message.domIndex)
          : typeof message.index === "number" && Number.isFinite(message.index)
            ? Math.trunc(message.index)
            : index;
      const contentHash =
        typeof message.contentHash === "string" && message.contentHash.trim() !== ""
          ? message.contentHash.trim()
          : hashString(text.trim());
      return `${role}:${domId}:${String(domIndex)}:${contentHash}`;
    })
    .join("|");

  return `sync:${hashString(`${provider}|${webUrl}|${signature}`)}`;
}

function normalizeGeneratedImageAssets(value: unknown): GeneratedImageAsset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const id = readStringField(item, "id");
    const src = readStringField(item, "src");
    const currentSrc = readStringField(item, "currentSrc", "current_src");
    const stableKey = readStringField(item, "stableKey", "stable_key");
    const alt = readStringField(item, "alt");
    const mimeType = readStringField(item, "mimeType", "mime_type");
    const originalName = readStringField(item, "originalName", "original_name");
    const imageIndex = readNumberField(item, "imageIndex", "image_index") ?? index;

    if (
      id === "" &&
      src === "" &&
      currentSrc === "" &&
      stableKey === "" &&
      alt === "" &&
      originalName === "" &&
      mimeType === ""
    ) {
      return [];
    }

    return [
      {
        ...(id !== "" ? { id } : {}),
        ...(stableKey !== "" ? { stableKey } : {}),
        ...(src !== "" ? { src } : {}),
        ...(currentSrc !== "" ? { currentSrc } : {}),
        ...(alt !== "" ? { alt } : {}),
        ...(mimeType !== "" ? { mimeType } : {}),
        ...(originalName !== "" ? { originalName } : {}),
        imageIndex,
      },
    ];
  });
}

function buildGeneratedImageLookupKey(domIndex: number | undefined, contentHash: string): string {
  return `${domIndex ?? -1}:${contentHash}`;
}

function buildAttachmentDedupeKey(messageId: string, originalName: string): string {
  return `${messageId}::${originalName}`;
}

function hasGeneratedImageSupport(providerId: string | null): boolean {
  return providerId === "chatgpt" || providerId === "gemini" || providerId === "grok";
}

function getProviderConfig(providerId: string | null): Record<string, unknown> | null {
  return providerId !== null && providerId !== "" ? ProviderRegistry.get(providerId) : null;
}

function providerAllowsDefaultPageSync(providerId: string | null): boolean {
  return getProviderConfig(providerId)?.["syncOnDefaultPage"] === true;
}

function providerPreservesSyncUrlQuery(providerId: string | null): boolean {
  return getProviderConfig(providerId)?.["preserveSyncUrlQuery"] === true;
}

function normalizeSyncWebUrl(providerId: string | null, rawUrl: string): string {
  if (!providerPreservesSyncUrlQuery(providerId)) {
    return normalizeUrl(rawUrl);
  }

  try {
    const parsed = new URL(rawUrl);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return rawUrl.split("#")[0] ?? rawUrl;
  }
}

class ConversationSyncerClass {
  _settings: AppSettings | null;
  _syncInProgress: Record<string, boolean>;
  _lastThinkingState: Record<string, string>;
  _lastThinkingEndedAt: Record<string, number>;
  _lastLoadingEnded: Record<string, number>;
  _syncRetryTimers: Record<string, ReturnType<typeof setTimeout>>;
  _syncRetryCounts: Record<string, number>;
  _stableListeners: Record<string, StableCallback[]>;
  _lastSyncResult: Record<string, SyncResult>;
  _trafficUnsubscribe: (() => void) | null;
  _coreEngine: CoreEngine | null;
  _resolveWebviewFn: ResolveWebviewFn | null;
  syncRetryLimit: number;
  syncRetryDelayMs: number;
  postThinkingProbeWindowMs: number;
  postThinkingProbePollMs: number;
  postThinkingProbeMaxPolls: number;

  constructor() {
    this._settings = null;
    this._syncInProgress = {};
    this._lastThinkingState = { ai1: "idle", ai2: "idle" };
    this._lastThinkingEndedAt = { ai1: 0, ai2: 0 };
    this._lastLoadingEnded = { ai1: 0, ai2: 0 };
    this._syncRetryTimers = {};
    this._syncRetryCounts = {};
    this._stableListeners = {};
    this._lastSyncResult = {};
    this._trafficUnsubscribe = null;
    this._coreEngine = null;
    this._resolveWebviewFn = null;
    this.syncRetryLimit = 5;
    this.syncRetryDelayMs = 3000;
    this.postThinkingProbeWindowMs = 2500;
    this.postThinkingProbePollMs = 300;
    this.postThinkingProbeMaxPolls = 4;
  }

  _hasReadableAssistant(messages: ScrapedMessage[] | undefined): boolean {
    if (messages === undefined || messages.length === 0) return false;
    const last = messages[messages.length - 1];
    const text = (last?.text ?? last?.content ?? "").trim();
    const generatedImages = normalizeGeneratedImageAssets(last?.generatedImages);
    return last?.role === "assistant" && (text !== "" || generatedImages.length > 0);
  }

  _isTransientSyncError(detail: unknown): boolean {
    const message = getErrorMessage(detail).toLowerCase();
    return [
      "guest_view_manager_call",
      "script failed to execute",
      "webcontents",
      "frame was removed",
      "object has been destroyed",
      "target closed",
    ].some((pattern) => message.includes(pattern));
  }

  setSettings(settings: AppSettings | null): void {
    this._settings = settings;
  }

  init(coreEngine: CoreEngine, resolveWebviewFn: ResolveWebviewFn): void {
    this._coreEngine = coreEngine;
    this._resolveWebviewFn = resolveWebviewFn;

    if (this._trafficUnsubscribe) {
      this._trafficUnsubscribe();
    }

    this._trafficUnsubscribe = TrafficManager.onUpdate((snapshot) => {
      const provider = snapshot.provider;
      void (async (): Promise<void> => {
        try {
          const state = (snapshot.state ?? {}) as {
            thinkingState?: string;
            loadingJustEnded?: boolean;
            loadingEndedAt?: number;
          };
          if (provider === "") return;

          if (provider !== "ai1" && provider !== "ai2") {
            return;
          }

          if (isProviderScenarioActive(provider)) {
            return;
          }

          const currentThinking = state.thinkingState ?? "idle";
          const prevThinking = this._lastThinkingState[provider] ?? "idle";
          this._lastThinkingState[provider] = currentThinking;

          if (prevThinking !== "idle" && currentThinking === "idle") {
            this._lastThinkingEndedAt[provider] = Date.now();
            await this.syncProvider(provider, { from: "auto" });
          }

          if (
            state.loadingJustEnded === true &&
            state.loadingEndedAt !== undefined &&
            this._lastLoadingEnded[provider] !== undefined &&
            state.loadingEndedAt > this._lastLoadingEnded[provider]
          ) {
            this._lastLoadingEnded[provider] = state.loadingEndedAt;
            await new Promise((resolve) =>
              setTimeout(resolve, ASSISTANT_TIMEOUTS.CONVERSATION_SYNC)
            );
            await this.syncProvider(provider, { from: "auto" });
          }
        } catch (_err: unknown) {
          const errorMessage = _err instanceof Error ? _err.message : String(_err);
          Logger.warnT(
            LogCategory.WEBVIEW,
            syncLogKey("loadingStateCheckFailed"),
            { provider, message: errorMessage },
            {
              provider,
              error: errorMessage,
            }
          );
        }
      })();
    });

    Logger.infoT(LogCategory.WEBVIEW, syncLogKey("initialized"));
  }

  isUrlExcluded(providerSlot: string, url: string): boolean {
    return isSlotUrlExcluded(providerSlot, url);
  }

  async _scrapeMessages(
    webview: Electron.WebviewTag | WebviewElement,
    scrapeMessagesFn: unknown
  ): Promise<ScrapedMessage[]> {
    if (typeof scrapeMessagesFn !== "function") {
      return [];
    }

    const messages = (await webview.executeJavaScript(`(${scrapeMessagesFn.toString()})();`)) as
      ScrapedMessage[] | null | undefined;
    return Array.isArray(messages) ? messages : [];
  }

  _shouldProbePostThinkingImages(
    provider: string,
    providerId: string | null,
    source: string | undefined,
    messages: ScrapedMessage[]
  ): boolean {
    if (!hasGeneratedImageSupport(providerId)) {
      return false;
    }

    if (source !== "auto" && source !== "retry") {
      return false;
    }

    const lastThinkingEndedAt = this._lastThinkingEndedAt[provider] ?? 0;
    if (
      lastThinkingEndedAt <= 0 ||
      Date.now() - lastThinkingEndedAt > this.postThinkingProbeWindowMs
    ) {
      return false;
    }

    const generatedImageCount = messages.reduce((count, message) => {
      return count + normalizeGeneratedImageAssets(message.generatedImages).length;
    }, 0);
    if (generatedImageCount > 0) {
      return false;
    }

    const lastMessage = messages[messages.length - 1];
    const text = (lastMessage?.text ?? lastMessage?.content ?? "").trim();
    return (
      lastMessage?.role !== "assistant" ||
      text === "" ||
      text === "[image]" ||
      this._hasReadableAssistant(messages) === false
    );
  }

  async _probeGeneratedImagesAfterThinking(
    provider: string,
    providerId: string | null,
    source: string | undefined,
    webview: Electron.WebviewTag | WebviewElement,
    scrapeMessagesFn: unknown,
    initialMessages: ScrapedMessage[]
  ): Promise<ScrapedMessage[]> {
    if (
      this._shouldProbePostThinkingImages(provider, providerId, source, initialMessages) === false
    ) {
      return initialMessages;
    }

    let latestMessages = initialMessages;
    for (let poll = 0; poll < this.postThinkingProbeMaxPolls; poll += 1) {
      // NOTE: The post-thinking probe is intentionally sequential because each rescrape depends on DOM settle time.
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, this.postThinkingProbePollMs));
      // NOTE: Each scrape must observe the DOM after the prior settle window, not in parallel.
      // eslint-disable-next-line no-await-in-loop
      const nextMessages = await this._scrapeMessages(webview, scrapeMessagesFn);
      if (nextMessages.length > 0) {
        latestMessages = nextMessages;
      }

      const generatedImageCount = latestMessages.reduce((count, message) => {
        return count + normalizeGeneratedImageAssets(message.generatedImages).length;
      }, 0);
      if (generatedImageCount > 0) {
        break;
      }
    }

    return latestMessages;
  }

  async syncConversation(
    provider: string,
    webview: Electron.WebviewTag | WebviewElement | null | undefined,
    options: { catchEnabled?: boolean; source?: string } = {}
  ): Promise<SyncResult> {
    if (provider === "ai0") {
      return await this.syncLatestMessage(provider, webview);
    }

    if (webview === null || webview === undefined) {
      Logger.errorT(LogCategory.WEBVIEW, syncLogKey("webviewNotFound"), { provider }, { provider });
      return { success: false, message: syncT("webviewNotFound", { provider }) };
    }

    const currentUrl = webview.getURL?.() ?? "";
    if (this.isUrlExcluded(provider, currentUrl)) {
      Logger.warnT(
        LogCategory.WEBVIEW,
        syncLogKey("urlExcludedSync"),
        { provider, currentUrl },
        {
          provider,
          currentUrl,
        }
      );
      return { success: false, message: syncT("urlExcluded", { provider, currentUrl }) };
    }

    const providerId = AppState.getProviderIdForSlot(provider);
    if (
      providerId !== null &&
      isDefaultPage(currentUrl, providerId) &&
      !providerAllowsDefaultPageSync(providerId)
    ) {
      return { success: false, message: syncT("defaultPage", { provider }) };
    }

    if (this._syncInProgress[provider] === true) {
      Logger.debugT(
        LogCategory.WEBVIEW,
        syncLogKey("syncAlreadyInProgress"),
        { provider },
        { provider }
      );
      return { success: false, message: syncT("syncAlreadyInProgress", { provider }) };
    }
    this._syncInProgress[provider] = true;

    try {
      await waitForDomReady(webview as never);

      const providerId = AppState.getProviderIdForSlot(provider);
      const providerModule = providerId !== null ? getProvider(providerId) : null;

      if (
        providerModule === null ||
        providerModule === undefined ||
        typeof providerModule["scrapeMessages"] !== "function"
      ) {
        throw new Error(syncT("scrapeMessagesMissing", { provider }));
      }

      const source = options.source ?? "manual";
      const messages = await this._probeGeneratedImagesAfterThinking(
        provider,
        providerId,
        source,
        webview,
        providerModule["scrapeMessages"],
        await this._scrapeMessages(webview, providerModule["scrapeMessages"])
      );

      const rawUrl = webview.getURL?.() ?? "";
      const webUrl = normalizeSyncWebUrl(providerId, rawUrl);

      const { existing, prevCount, newEntry } = await this._getArchiveStatus(provider, webUrl);

      if (messages.length === 0) {
        this._syncInProgress[provider] = false;
        return {
          success: true,
          count: 0,
          messages: [],
          commands: [],
          webUrl,
          newEntry: false,
        };
      }

      // NOTE: In relay mode the user-side author actually comes from the peer AI.
      const relayState = AppState.getAssistantRelay();
      const isRelayActive = relayState.active === true;
      const relaySource =
        isRelayActive && relayState.sourceSlot !== null ? relayState.sourceSlot : undefined;

      const authors = {
        user:
          isRelayActive && relaySource !== undefined && relaySource !== ""
            ? AppState.getNickname(relaySource)
            : AppState.getNickname("user"),
        ai: AppState.getNickname(provider),
      };

      let normalized: ScrapedMessage[] = messages.map((m: ScrapedMessage) => {
        // NOTE: If the message contains a hev-sender tag (++cmd delivery), override the author.
        const textContent =
          typeof m.text === "string" ? m.text : typeof m.content === "string" ? m.content : "";
        const senderMatch = /<!--\s*hev-sender:([^-]+?)\s*-->/.exec(textContent);
        const senderOverride = senderMatch?.[1]?.trim();
        const generatedImages = normalizeGeneratedImageAssets(m.generatedImages);
        return {
          ...m,
          text:
            senderMatch !== null
              ? textContent.replace(/\s*<!--\s*hev-sender:[^-]+?\s*-->\s*/, "").trim()
              : (m.text ?? m.content ?? ""),
          author:
            senderOverride !== undefined && senderOverride !== ""
              ? senderOverride
              : m.role === "assistant"
                ? authors.ai
                : authors.user,
          ts: Date.now(),
          ...(generatedImages.length > 0 ? { generatedImages } : {}),
        };
      });
      normalized = applyPendingOutboundBridgeMetadata(provider, normalized);

      const slots = this._settings?.slots as
        Record<string, { catchCommands?: boolean }> | undefined;
      const catchEnabled = options.catchEnabled ?? slots?.[provider]?.catchCommands ?? true;

      const commands = catchEnabled
        ? CatchManager.catchCommands({
            provider,
            webUrl,
            messages: normalized,
            prevCount,
            hasExisting: existing !== null,
          })
        : [];

      const accountInfo = AppState.getAccountForSlot(provider);

      if (accountInfo?.id === undefined || accountInfo.id === "") {
        Logger.warnT(
          LogCategory.WEBVIEW,
          syncLogKey("noAccountAssigned"),
          { provider },
          { provider }
        );
        this._syncInProgress[provider] = false;
        return { success: false, message: syncT("noAccountAssigned", { provider }) };
      }

      const dbSyncMessages = window.electronAPI?.["dbSyncMessages"] as
        ((payload: Record<string, unknown>) => Promise<DbSyncResult>) | undefined;
      const syncResult = await dbSyncMessages?.({
        accountId: accountInfo.id,
        clientRequestId: buildSyncClientRequestId(provider, webUrl, normalized),
        webUrl,
        messages: normalized,
        authors,
      });

      if (syncResult?.success !== true) {
        throw new Error(syncError("databaseSyncFailed", syncResult?.error, { provider }));
      }

      const dbGetMessages = window.electronAPI?.["dbGetMessages"] as
        ((payload: Record<string, unknown>) => Promise<DbMessagesResult>) | undefined;
      const dbMessagesResult = await dbGetMessages?.({
        accountId: accountInfo.id,
        conversationId: syncResult.conversationId,
      });

      const finalMessages: ScrapedMessage[] = dbMessagesResult?.data ?? normalized;
      const generatedImageResult = await this._persistGeneratedImages(
        provider,
        webview,
        accountInfo.id,
        syncResult.conversationId,
        normalized,
        finalMessages
      );

      const lastMsg = finalMessages[finalMessages.length - 1];
      if (lastMsg !== undefined && lastMsg.role !== "user") {
        if (catchEnabled && commands.length === 0) {
          dispatchExpectedCommandCaptureFailure({
            webUrl,
            text:
              typeof lastMsg.text === "string"
                ? lastMsg.text
                : typeof lastMsg.content === "string"
                  ? lastMsg.content
                  : "",
            provider,
          });
        }

        const result: SyncResult = {
          success: true,
          count: normalized.length,
          messages: finalMessages,
          commands,
          webUrl,
          newEntry,
          added: syncResult.added,
          total: syncResult.total,
          generatedImageSavedCount: generatedImageResult.savedCount,
          generatedImagePendingCount: generatedImageResult.pendingCount,
          ...(syncResult.conversationId !== undefined && {
            conversationId: syncResult.conversationId,
          }),
        };

        try {
          PendingArchiveHandler.processPending(provider, result);
        } catch (err) {
          const errorMessage = getErrorMessage(err);
          Logger.warnT(
            LogCategory.WEBVIEW,
            syncLogKey("pendingProcessingFailedDuringSync"),
            { provider, message: errorMessage },
            {
              provider,
              error: errorMessage,
            }
          );
        }

        return result;
      }

      const result: SyncResult = {
        success: true,
        count: normalized.length,
        messages: finalMessages,
        commands,
        webUrl,
        newEntry,
        added: syncResult.added,
        total: syncResult.total,
        generatedImageSavedCount: generatedImageResult.savedCount,
        generatedImagePendingCount: generatedImageResult.pendingCount,
        ...(syncResult.conversationId !== undefined && {
          conversationId: syncResult.conversationId,
        }),
      };
      return result;
    } catch (error) {
      const errorMessage = syncError("syncFailed", error, { provider });
      const transient = this._isTransientSyncError(error);
      if (transient) {
        Logger.warnT(
          LogCategory.WEBVIEW,
          syncLogKey("syncFailed"),
          { provider, message: errorMessage },
          { provider, error: errorMessage, source: options.source ?? "manual", transient: true }
        );
      } else {
        Logger.errorT(
          LogCategory.WEBVIEW,
          syncLogKey("syncFailed"),
          { provider, message: errorMessage },
          { provider, error: errorMessage, source: options.source ?? "manual" }
        );
      }
      return { success: false, message: errorMessage, transient };
    } finally {
      this._syncInProgress[provider] = false;
    }
  }

  async syncLatestMessage(
    provider: string,
    webview: Electron.WebviewTag | WebviewElement | null | undefined
  ): Promise<SyncResult> {
    if (webview === null || webview === undefined) {
      Logger.errorT(LogCategory.WEBVIEW, syncLogKey("webviewNotFound"), { provider }, { provider });
      return { success: false, message: syncT("webviewNotFound", { provider }) };
    }

    const currentUrl = webview.getURL?.() ?? "";
    if (this.isUrlExcluded(provider, currentUrl)) {
      Logger.warnT(
        LogCategory.WEBVIEW,
        syncLogKey("urlExcludedLatestMessage"),
        { provider, currentUrl },
        {
          provider,
          currentUrl,
        }
      );
      return { success: false, message: syncT("urlExcluded", { provider, currentUrl }) };
    }

    const providerId = AppState.getProviderIdForSlot(provider);
    if (
      providerId !== null &&
      isDefaultPage(currentUrl, providerId) &&
      !providerAllowsDefaultPageSync(providerId)
    ) {
      return { success: false, message: syncT("defaultPage", { provider }) };
    }

    try {
      await waitForDomReady(webview as never);

      const providerModule = providerId !== null ? getProvider(providerId) : null;
      if (
        providerModule === null ||
        providerModule === undefined ||
        typeof providerModule["scrapeMessages"] !== "function"
      ) {
        throw new Error(syncT("scrapeMessagesMissing", { provider }));
      }

      const messages = (await webview.executeJavaScript(
        `(${providerModule["scrapeMessages"].toString()})();`
      )) as ScrapedMessage[] | null | undefined;

      const webUrl = normalizeSyncWebUrl(providerId, currentUrl);

      if (!Array.isArray(messages) || messages.length === 0) {
        return {
          success: true,
          count: 0,
          messages: [],
          commands: [],
          webUrl,
          newEntry: false,
        };
      }

      const lastAssistant = [...messages]
        .reverse()
        .find(
          (msg) => (msg.role ?? "") === "assistant" && (msg.text ?? msg.content ?? "").trim() !== ""
        );

      const finalMessages = lastAssistant !== undefined ? [lastAssistant] : [];

      return {
        success: true,
        count: finalMessages.length,
        messages: finalMessages,
        commands: [],
        webUrl,
        newEntry: false,
      };
    } catch (error) {
      const errorMessage = syncError("latestMessageSyncFailed", error, { provider });
      Logger.errorT(
        LogCategory.WEBVIEW,
        syncLogKey("latestMessageSyncFailed"),
        { provider, message: errorMessage },
        {
          provider,
          error: errorMessage,
        }
      );
      return { success: false, message: errorMessage };
    }
  }

  async syncProvider(provider: string, opts: { from?: string } = {}): Promise<SyncResult> {
    if (provider === "") return { success: false, message: syncT("providerMissing") };

    if (provider !== "ai0" && isProviderScenarioActive(provider)) {
      if (this._syncRetryTimers[provider] !== undefined) {
        clearTimeout(this._syncRetryTimers[provider]);
      }
      this._syncRetryCounts[provider] = 0;
      return { success: false, message: "provider scenario active", transient: true };
    }

    if (opts.from === "manual") {
      if (this._syncRetryTimers[provider] !== undefined) {
        clearTimeout(this._syncRetryTimers[provider]);
      }
      this._syncRetryCounts[provider] = 0;
    }

    this._setSyncStatus(provider, "syncing");

    try {
      Logger.infoT(
        LogCategory.WEBVIEW,
        syncLogKey("syncProviderCalled"),
        { provider, source: opts.from ?? "manual" },
        {
          provider,
          source: opts.from ?? "manual",
        }
      );

      const webview = this._resolveWebviewFn?.(provider);
      const from = opts.from ?? "manual";
      const res = await this.syncConversation(provider, webview, { source: from });
      const messages = res["messages"] as ScrapedMessage[] | undefined;
      const stableAfter = this._hasReadableAssistant(messages);
      const pendingGeneratedImages =
        typeof res["generatedImagePendingCount"] === "number"
          ? Math.max(0, Math.trunc(res["generatedImagePendingCount"]))
          : 0;
      const shouldRetryByReadiness =
        (from === "auto" || from === "retry" || from === "manual") &&
        ((res.success === true && (stableAfter === false || pendingGeneratedImages > 0)) ||
          res.transient === true);
      const tried = this._syncRetryCounts[provider] ?? 0;
      const willRetry = shouldRetryByReadiness && tried < this.syncRetryLimit;

      this._setSyncStatus(
        provider,
        willRetry ? "syncing" : res.success ? "success" : "error",
        willRetry ? undefined : res.message
      );

      this._lastSyncResult[provider] = res;

      window.dispatchEvent(
        new CustomEvent("sync-complete", {
          detail: { provider, result: res, source: from },
        })
      );

      if (stableAfter) {
        this._notifyStable(provider, res);
      }

      if (willRetry) {
        Logger.debugT(
          LogCategory.WEBVIEW,
          syncLogKey("assistantRetryScheduled"),
          {
            provider,
            tried,
            messageCount: messages?.length ?? 0,
          },
          {
            provider,
            tried,
            messageCount: messages?.length ?? 0,
            transient: res.transient === true,
          }
        );
        this._syncRetryCounts[provider] = tried + 1;
        this._syncRetryTimers[provider] = setTimeout(() => {
          if (AppState.isConnected(provider) === true) {
            void this.syncProvider(provider, { from: "retry" });
          }
        }, this.syncRetryDelayMs);
      } else {
        if (this._syncRetryTimers[provider] !== undefined) {
          clearTimeout(this._syncRetryTimers[provider]);
        }
        this._syncRetryCounts[provider] = 0;
      }

      if (res.success && provider !== "ai0") {
        const refreshOpts: {
          silent: boolean;
          provider: string;
          skipNotify: boolean;
          forceSelectId?: string;
        } = {
          silent: true,
          provider,
          skipNotify: false,
        };
        if ("conversationId" in res && res.conversationId !== undefined) {
          refreshOpts.forceSelectId = res.conversationId;
        }
        await ConversationListManager.refresh(refreshOpts);
      }

      if (res.commands !== undefined && res.commands.length > 0 && this._coreEngine !== null) {
        const coreEngine = this._coreEngine;
        await res.commands.reduce(async (prev, cmd) => {
          await prev;
          await coreEngine.handleCaughtCommand(cmd.command, {
            ...cmd,
            source: opts.from ?? "auto",
          });
        }, Promise.resolve());
      }

      return res;
    } catch (err) {
      const message = err instanceof Error ? getErrorMessage(err) : String(err);
      Logger.errorT(
        LogCategory.WEBVIEW,
        syncLogKey("syncProviderError"),
        { provider, message },
        { provider, error: message }
      );
      this._setSyncStatus(provider, "error", message);
      return { success: false, message };
    }
  }

  _resolveGeneratedImageMessageId(
    message: ScrapedMessage,
    finalMessages: ScrapedMessage[]
  ): string | null {
    const domId = readStringField(message, "domId", "dom_id");
    const savedContentHash = readStringField(message, "contentHash", "content_hash");
    const fallbackContentHash = hashString((message.text ?? message.content ?? "").trim());
    const contentHash = savedContentHash !== "" ? savedContentHash : fallbackContentHash;
    const domIndex =
      readNumberField(message, "domIndex", "dom_index", "index") ??
      readNumberField(message, "index");

    const byDomId =
      domId === ""
        ? null
        : finalMessages.find(
            (candidate) => readStringField(candidate, "domId", "dom_id") === domId
          );
    if (byDomId !== null && byDomId !== undefined) {
      const messageId = readStringField(byDomId, "id");
      if (messageId !== "") {
        return messageId;
      }
    }

    const lookupKey = buildGeneratedImageLookupKey(domIndex, contentHash);
    const byHash = finalMessages.find((candidate) => {
      const candidateLookupKey = buildGeneratedImageLookupKey(
        readNumberField(candidate, "domIndex", "dom_index", "index"),
        readStringField(candidate, "contentHash", "content_hash")
      );
      return candidateLookupKey === lookupKey;
    });

    const messageId = byHash !== undefined ? readStringField(byHash, "id") : "";
    return messageId !== "" ? messageId : null;
  }

  _buildGeneratedImageStableKey(
    provider: string,
    message: ScrapedMessage,
    asset: GeneratedImageAsset
  ): string {
    const assetStableKey = asset.stableKey?.trim() ?? "";
    if (assetStableKey !== "") {
      return assetStableKey;
    }

    const messageIdentity = readStringField(
      message,
      "domId",
      "dom_id",
      "contentHash",
      "content_hash"
    );
    const messageKey =
      messageIdentity !== ""
        ? messageIdentity
        : `${provider}:${readNumberField(message, "domIndex", "dom_index", "index") ?? 0}`;
    return hashString(`${messageKey}|${asset.imageIndex ?? 0}|${asset.alt ?? ""}`);
  }

  _buildGeneratedImageName(
    provider: string,
    message: ScrapedMessage,
    asset: GeneratedImageAsset
  ): string {
    const originalName = asset.originalName?.trim() ?? "";
    if ((asset.stableKey?.trim() ?? "") === "" && originalName !== "") {
      return originalName;
    }

    const mimeType = asset.mimeType ?? "";
    const lowerMimeType = mimeType.toLowerCase();
    const ext = lowerMimeType.includes("png")
      ? "png"
      : lowerMimeType.includes("webp")
        ? "webp"
        : lowerMimeType.includes("gif")
          ? "gif"
          : lowerMimeType.includes("bmp")
            ? "bmp"
            : lowerMimeType.includes("svg")
              ? "svg"
              : lowerMimeType.includes("jpeg") || lowerMimeType.includes("jpg")
                ? "jpg"
                : "png";

    const imageIndex = asset.imageIndex ?? 0;
    const stableKey = this._buildGeneratedImageStableKey(provider, message, asset);
    return `generated-image-${provider}-${String(imageIndex + 1).padStart(2, "0")}-${stableKey}.${ext}`;
  }

  async _extractGeneratedImageContent(
    webview: Electron.WebviewTag | WebviewElement,
    asset: GeneratedImageAsset
  ): Promise<ImageExtractionResult | null> {
    try {
      const rawResult = (await webview.executeJavaScript(
        buildGeneratedImageExtractionScript(asset as Record<string, unknown>)
      )) as ImageExtractionResult | null;

      return rawResult;
    } catch (error) {
      Logger.warn(LogCategory.WEBVIEW, "[webview-sync] Failed to extract generated image bytes", {
        providerError: getErrorMessage(error),
      });
      return null;
    }
  }

  async _captureGeneratedImageFallback(
    webview: Electron.WebviewTag | WebviewElement,
    rect: ImageCaptureRect | null | undefined
  ): Promise<ImageExtractionResult | null> {
    if (rect === null || rect === undefined) {
      return null;
    }

    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    if (width < 2 || height < 2) {
      return null;
    }

    const webContentsId =
      typeof webview.getWebContentsId === "function" ? webview.getWebContentsId() : null;
    const electronApi = window.electronAPI;
    const guestRegion = `${Math.max(0, Math.round(rect.x))};${Math.max(0, Math.round(rect.y))}:${width};${height}`;

    try {
      const captureWebContentsPage = electronApi?.["captureWebContentsPage"];
      if (
        typeof webContentsId === "number" &&
        Number.isFinite(webContentsId) &&
        typeof captureWebContentsPage === "function"
      ) {
        const guestCapture = (await captureWebContentsPage(webContentsId, guestRegion)) as {
          success?: boolean;
          dataUrl?: string;
          data?: string;
        } | null;
        if (guestCapture?.success === true) {
          const parsed = parseGeneratedImageDataUrl(
            guestCapture.dataUrl ?? guestCapture.data ?? ""
          );
          if (parsed !== null && parsed.base64 !== "") {
            return {
              success: true,
              base64: parsed.base64,
              mimeType: parsed.mimeType ?? "image/png",
            };
          }
        }
      }

      const capturePage = electronApi?.["capturePage"];
      if (
        typeof webview.getBoundingClientRect !== "function" ||
        typeof capturePage !== "function"
      ) {
        return null;
      }

      const hostRect = webview.getBoundingClientRect();
      const x = Math.max(0, Math.round(hostRect.x + rect.x));
      const y = Math.max(0, Math.round(hostRect.y + rect.y));
      const windowRegion = `${x};${y}:${width};${height}`;
      const capture = (await capturePage("region", windowRegion)) as {
        success?: boolean;
        dataUrl?: string;
        data?: string;
      } | null;
      if (capture?.success !== true) {
        return null;
      }

      const parsed = parseGeneratedImageDataUrl(capture.dataUrl ?? capture.data ?? "");
      if (parsed === null || parsed.base64 === "") {
        return null;
      }

      return {
        success: true,
        base64: parsed.base64,
        mimeType: parsed.mimeType ?? "image/png",
      };
    } catch (error) {
      Logger.warn(
        LogCategory.WEBVIEW,
        "[webview-sync] Generated image screenshot fallback failed",
        {
          providerError: getErrorMessage(error),
        }
      );
      return null;
    }
  }

  async _persistGeneratedImages(
    provider: string,
    webview: Electron.WebviewTag | WebviewElement,
    accountId: string,
    conversationId: string | undefined,
    scrapedMessages: ScrapedMessage[],
    finalMessages: ScrapedMessage[]
  ): Promise<GeneratedImagePersistResult> {
    if (conversationId === undefined || conversationId === "") {
      const pendingCount = scrapedMessages.reduce((count, message) => {
        return count + normalizeGeneratedImageAssets(message.generatedImages).length;
      }, 0);
      return { savedCount: 0, pendingCount };
    }

    const saveAttachmentContent = window.electronAPI?.["dbSaveAttachmentContent"];
    const getAttachments = window.electronAPI?.["dbGetAttachments"];
    const readFile = window.electronAPI?.["readFile"];
    if (typeof saveAttachmentContent !== "function" || typeof getAttachments !== "function") {
      return { savedCount: 0, pendingCount: 0 };
    }

    const rawAttachments = (await getAttachments({
      accountId,
      conversationId,
    })) as DbAttachmentsResult | undefined;
    const attachmentRows = Array.isArray(rawAttachments?.data) ? rawAttachments.data : [];
    const existingAttachments = new Map<
      string,
      { storedPath: string; mimeType: string; originalName: string }
    >(
      attachmentRows.flatMap((attachment) => {
        const messageId = readStringField(attachment, "messageId", "message_id");
        const originalName = readStringField(attachment, "originalName", "original_name");
        if (messageId === "" || originalName === "") {
          return [];
        }

        const storedPath = readStringField(attachment, "storedPath", "stored_path");
        const mimeType = readStringField(attachment, "mimeType", "mime_type");
        return [
          [
            buildAttachmentDedupeKey(messageId, originalName),
            {
              storedPath,
              mimeType,
              originalName,
            },
          ] as const,
        ];
      })
    );

    let savedCount = 0;
    let pendingCount = 0;

    for (const message of scrapedMessages) {
      if (message.role !== "assistant") {
        continue;
      }

      const generatedImages = normalizeGeneratedImageAssets(message.generatedImages);
      if (generatedImages.length === 0) {
        continue;
      }

      const messageId = this._resolveGeneratedImageMessageId(message, finalMessages);
      if (messageId === null) {
        pendingCount += generatedImages.length;
        continue;
      }

      for (const asset of generatedImages) {
        const originalName = this._buildGeneratedImageName(provider, message, asset);
        const dedupeKey = buildAttachmentDedupeKey(messageId, originalName);
        // NOTE: Extraction is sequential because each asset maps to a live DOM node that may mutate during generation.
        // eslint-disable-next-line no-await-in-loop
        const extracted = await this._extractGeneratedImageContent(webview, asset);
        const persisted =
          extracted?.success === true &&
          typeof extracted.base64 === "string" &&
          extracted.base64 !== ""
            ? extracted
            : // NOTE: Fallback capture must run after extraction on the same asset to keep coordinates aligned.
              // eslint-disable-next-line no-await-in-loop
              await this._captureGeneratedImageFallback(webview, extracted?.rect);
        const existingAttachment = existingAttachments.get(dedupeKey);

        if (
          persisted?.success !== true ||
          typeof persisted.base64 !== "string" ||
          persisted.base64 === ""
        ) {
          if (existingAttachment !== undefined) {
            continue;
          }
          pendingCount += 1;
          continue;
        }

        if (
          existingAttachment !== undefined &&
          typeof existingAttachment.storedPath === "string" &&
          existingAttachment.storedPath !== ""
        ) {
          try {
            const currentBase64 =
              typeof readFile === "function"
                ? // NOTE: Replacement detection must read the current archived file before deciding whether to rewrite it.
                  // eslint-disable-next-line no-await-in-loop
                  await readFile(existingAttachment.storedPath)
                : null;
            if (typeof currentBase64 === "string" && currentBase64 === persisted.base64) {
              continue;
            }
          } catch {}
        }

        // NOTE: Save operations stay ordered so later assets observe the updated dedupe map from earlier writes.
        // eslint-disable-next-line no-await-in-loop
        const saveResult = (await saveAttachmentContent({
          accountId,
          conversationId,
          messageId,
          base64: persisted.base64,
          originalName,
          mimeType: persisted.mimeType ?? asset.mimeType ?? "image/png",
        })) as { success?: boolean; error?: string; data?: unknown } | null;

        if (saveResult?.success === true) {
          const savedData = saveResult.data;
          const savedStoredPath = readStringField(savedData, "storedPath", "stored_path");
          existingAttachments.set(dedupeKey, {
            storedPath:
              savedStoredPath !== "" ? savedStoredPath : (existingAttachment?.storedPath ?? ""),
            mimeType: persisted.mimeType ?? asset.mimeType ?? "image/png",
            originalName,
          });
          savedCount += 1;
          continue;
        }

        pendingCount += 1;
        Logger.warn(LogCategory.WEBVIEW, "[webview-sync] Generated image could not be archived", {
          provider,
          messageId,
          originalName,
          error: saveResult?.error ?? "unknown",
        });
      }
    }

    return { savedCount, pendingCount };
  }

  _notifyStable(provider: string, res: SyncResult): void {
    try {
      const list = this._stableListeners[provider] ?? [];
      delete this._stableListeners[provider];

      for (const cb of list) {
        try {
          cb(null, res);
        } catch (_e: unknown) {
          const errorMessage = _e instanceof Error ? _e.message : String(_e);
          Logger.warnT(
            LogCategory.WEBVIEW,
            syncLogKey("stableCallbackFailed"),
            { provider, message: errorMessage },
            {
              provider,
              error: errorMessage,
            }
          );
        }
      }

      try {
        PendingArchiveHandler.processPending(provider, res);
      } catch (_e: unknown) {
        const errorMessage = _e instanceof Error ? _e.message : String(_e);
        Logger.warnT(
          LogCategory.WEBVIEW,
          syncLogKey("pendingProcessingFailed"),
          { provider, message: errorMessage },
          {
            provider,
            error: errorMessage,
          }
        );
      }
    } catch (_e: unknown) {
      const errorMessage = _e instanceof Error ? _e.message : String(_e);
      Logger.warnT(
        LogCategory.WEBVIEW,
        syncLogKey("notifyStableFailed"),
        { provider, message: errorMessage },
        { provider, error: errorMessage }
      );
    }
  }

  addStableListener(provider: string, callback: StableCallback): void {
    this._stableListeners[provider] ??= [];
    this._stableListeners[provider].push(callback);
  }

  cancelListeners(provider: string): void {
    if (this._stableListeners[provider] !== undefined) {
      delete this._stableListeners[provider];
    }

    if (this._syncRetryTimers[provider] !== undefined) {
      clearTimeout(this._syncRetryTimers[provider]);
      delete this._syncRetryTimers[provider];
    }
    delete this._syncRetryCounts[provider];
  }

  getLastSyncResult(provider: string): SyncResult | null {
    return this._lastSyncResult[provider] ?? null;
  }

  async _getArchiveStatus(
    provider: string,
    webUrl: string
  ): Promise<{ existing: ConversationItem | null; prevCount: number; newEntry: boolean }> {
    try {
      const accountInfo = AppState.getAccountForSlot(provider);
      if (accountInfo?.id === undefined || accountInfo.id === "") {
        return { existing: null, prevCount: 0, newEntry: true };
      }

      const dbGetConversations = window.electronAPI?.["dbGetConversations"] as
        | ((
            payload: Record<string, unknown>
          ) => Promise<{ data?: ConversationItem[] } | ConversationItem[]>)
        | undefined;
      const conversationsResult = (await dbGetConversations?.({
        accountId: accountInfo.id,
      })) as { data?: ConversationItem[] } | ConversationItem[] | undefined;
      const conversations = Array.isArray(conversationsResult)
        ? conversationsResult
        : Array.isArray(conversationsResult?.data)
          ? conversationsResult.data
          : [];

      const providerId = AppState.getProviderIdForSlot(provider);
      const normalizedTargetUrl = normalizeSyncWebUrl(providerId, webUrl);
      const existing =
        conversations.find(
          (item) => normalizeSyncWebUrl(providerId, item.webUrl as string) === normalizedTargetUrl
        ) ?? null;

      return {
        existing,
        prevCount: existing?.messageCount ?? 0,
        newEntry: existing === null,
      };
    } catch (_error) {
      const errorMessage = _error instanceof Error ? _error.message : String(_error);
      Logger.warn(
        LogCategory.WEBVIEW,
        "[archive-status-fallback] Failed to inspect archive status",
        {
          provider,
          webUrl,
          error: errorMessage,
        }
      );
      return { existing: null, prevCount: 0, newEntry: true };
    }
  }

  _setSyncStatus(
    provider: string,
    status: "syncing" | "success" | "error",
    message?: string
  ): void {
    const event = new CustomEvent("sync-status-changed", {
      detail: { provider, status, message },
    });
    window.dispatchEvent(event);
  }

  destroy(): void {
    if (this._trafficUnsubscribe !== null) {
      this._trafficUnsubscribe();
      this._trafficUnsubscribe = null;
    }

    Object.values(this._syncRetryTimers).forEach((timer) => {
      clearTimeout(timer);
    });
    this._syncRetryTimers = {};
    this._syncRetryCounts = {};
    this._stableListeners = {};

    this._syncInProgress = {};
    this._lastSyncResult = {};
    this._coreEngine = null;
    this._resolveWebviewFn = null;

    Logger.debugT(LogCategory.WEBVIEW, syncLogKey("destroyed"));
  }
}

const conversationSyncer = new ConversationSyncerClass();
export { conversationSyncer as ConversationSyncer };
