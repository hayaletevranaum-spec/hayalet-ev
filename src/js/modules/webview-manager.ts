import type { AppSettings } from "@shared/settings.js";
import type { WebviewTag } from "electron";

import { getProvider } from "./webview/provider-factory.js";
import { isSlotUrlExcluded } from "./webview/methods/shared/url-utils.js";
import { LifecycleManager } from "./webview/lifecycle-manager.js";
import { MessageSender } from "./webview/message-sender.js";
import type { MessageSenderWebview } from "./webview/message-sender.js";
import { AppState } from "./app-state.js";
import { AppI18n } from "./i18n/index.js";
import { SlotController } from "./slot-controller.js";
import { ConversationSyncer } from "./webview/conversation-syncer.js";
import { PendingArchiveHandler } from "./webview/pending-archive-handler.js";

interface FileEntry {
  name?: string;
  path?: string;
}

interface SyncCoreEngine {
  handleCaughtCommand: (command: string, payload: Record<string, unknown>) => Promise<unknown>;
}

function isMessageSenderWebview(webview: unknown): webview is MessageSenderWebview {
  return (
    webview != null &&
    typeof (webview as { executeJavaScript?: unknown }).executeJavaScript === "function"
  );
}

function isSlotId(provider: string): provider is "ai0" | "ai1" | "ai2" {
  return provider === "ai0" || provider === "ai1" || provider === "ai2";
}

class WebviewManagerClass {
  settings: AppSettings | null;

  constructor() {
    this.settings = null;
  }

  setSettings(settings: AppSettings): void {
    this.settings = settings;
    MessageSender.setSettings(settings);
    ConversationSyncer.setSettings(settings);
  }

  register(provider: string, webview: WebviewTag): void {
    if (isSlotId(provider)) {
      SlotController.registerWebview(provider, webview);
      return;
    }

    LifecycleManager.register(provider, webview);
  }

  attach(provider: string, webview: WebviewTag, opts: Record<string, unknown> = {}): void {
    if (isSlotId(provider)) {
      SlotController.registerWebview(provider, webview);
      SlotController.ensureWebviewMounted(provider);
      SlotController.ensureWebviewAttached(provider);
      SlotController.markActive(provider);
      return;
    }

    const providerId = AppState.getProviderIdForSlot(provider);
    LifecycleManager.attach(provider, webview, {
      ...opts,
      ...(providerId !== null && providerId !== "" ? { providerId } : {}),
    });
  }

  detach(provider: string, opts: Record<string, unknown> = {}): void {
    if (isSlotId(provider)) {
      SlotController.parkWebview(provider, "webview_manager_detach");
      return;
    }

    LifecycleManager.detach(provider, opts);
  }

  resolveWebview(provider: string): WebviewTag | null {
    if (isSlotId(provider)) {
      const slotWebview = SlotController.getWebview(provider);
      if (slotWebview !== null) {
        return slotWebview as WebviewTag;
      }
    }

    const cached = LifecycleManager.get(provider);
    if (cached !== null) {
      return cached;
    }

    if (typeof document === "undefined") {
      return null;
    }

    const fallbackId = `${provider}-webview`;
    const found = document.getElementById(fallbackId) as WebviewTag | null;
    if (found !== null && isSlotId(provider)) {
      SlotController.registerWebview(provider, found);
    }
    return found;
  }

  destroyWebview(provider: string): void {
    if (isSlotId(provider)) {
      SlotController.parkWebview(provider, "webview_manager_destroy");
      return;
    }

    LifecycleManager.destroy(provider);
  }

  markActive(provider: string): void {
    if (isSlotId(provider)) {
      SlotController.markActive(provider);
      return;
    }

    LifecycleManager.markActive(provider);
  }

  cleanupInactiveWebviews(): number {
    return SlotController.cleanupInactiveWebviews();
  }

  async send({
    provider,
    text,
    attachments = [],
  }: {
    provider: string;
    text: string;
    attachments?: FileEntry[];
  }): Promise<unknown> {
    const webview = this.resolveWebview(provider);
    if (!isMessageSenderWebview(webview)) {
      throw new Error(AppI18n.t("app.messageSender.webviewNotReady", { provider }));
    }
    return await MessageSender.send({ provider, text, attachments, webview });
  }

  initSyncer(coreEngine: SyncCoreEngine): void {
    ConversationSyncer.init(coreEngine, (provider: string) => this.resolveWebview(provider));
  }

  async syncConversation(
    provider: string,
    webview: WebviewTag | null,
    options: Record<string, unknown> = {}
  ): Promise<unknown> {
    const targetWebview = webview ?? this.resolveWebview(provider);
    if (targetWebview === null) {
      throw new Error(AppI18n.t("app.logs.webviewSync.webviewNotFound", { provider }));
    }
    return await ConversationSyncer.syncConversation(provider, targetWebview, options);
  }

  async syncLatestMessage(provider: string, webview: WebviewTag | null = null): Promise<unknown> {
    const targetWebview = webview ?? this.resolveWebview(provider);
    if (targetWebview === null) {
      throw new Error(AppI18n.t("app.logs.webviewSync.webviewNotFound", { provider }));
    }
    return await ConversationSyncer.syncLatestMessage(provider, targetWebview);
  }

  async syncProvider(provider: string, opts: Record<string, unknown> = {}): Promise<unknown> {
    return await ConversationSyncer.syncProvider(provider, opts);
  }

  addStableListener(provider: string, callback: () => void): void {
    ConversationSyncer.addStableListener(provider, callback);
  }

  getLastSyncResult(provider: string): unknown {
    return ConversationSyncer.getLastSyncResult(provider);
  }

  addPendingArchive(
    provider: string,
    entry: { jobId: string; folder: string; temp?: string[] }
  ): void {
    PendingArchiveHandler.addPending(provider, entry);
  }

  getProviderModule(providerSlot: string): unknown {
    const providerId = AppState.getProviderIdForSlot(providerSlot);
    return providerId !== null && providerId !== "" ? getProvider(providerId) : null;
  }

  isUrlExcluded(providerSlot: string, url: string): boolean {
    return isSlotUrlExcluded(providerSlot, url);
  }

  get webviews(): unknown {
    const lifecycleWebviews = LifecycleManager.getAll();
    return {
      ...lifecycleWebviews,
      ai0: SlotController.getWebview("ai0"),
      ai1: SlotController.getWebview("ai1"),
      ai2: SlotController.getWebview("ai2"),
    };
  }
}

const webviewManager = new WebviewManagerClass();

export { webviewManager, webviewManager as WebviewManager };
