import { LogCategory } from "@shared/logging-core";
import { ASSISTANT_TIMEOUTS } from "@timeouts";
import { Logger } from "../logger/index.js";
import { getErrorMessage } from "@shared/index.js";
import { TrafficManager } from "../traffic-manager.js";
import { AppState } from "../app-state.js";
import { SlotController } from "../slot-controller.js";
import { ProviderRegistry } from "./provider-registry.js";

import { ConversationSyncer } from "./conversation-syncer.js";

function lifecycleLogKey(key: string): string {
  return `app.logs.webviewLifecycle.${key}`;
}

class LifecycleManagerClass {
  webviews: Record<string, Electron.WebviewTag>;
  _lastActivity: Record<string, number>;
  _inactivityThreshold: number;

  constructor() {
    this.webviews = {};
    this._lastActivity = {};
    this._inactivityThreshold = 30 * 60 * 1000;
  }

  private _isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }

  private _isSlotId(provider: string): provider is "ai0" | "ai1" | "ai2" {
    return provider === "ai0" || provider === "ai1" || provider === "ai2";
  }

  private _resolveSlotWebview(provider: "ai0" | "ai1" | "ai2"): Electron.WebviewTag | null {
    const slotWebview = SlotController.getWebview(provider);
    if (slotWebview !== null) {
      return slotWebview as Electron.WebviewTag;
    }

    if (typeof document === "undefined") {
      return null;
    }

    const fallbackId = `${provider}-webview`;
    const found = document.getElementById(fallbackId) as Electron.WebviewTag | null;
    if (found !== null) {
      SlotController.registerWebview(provider, found);
    }
    return found;
  }

  register(provider: string, webview: HTMLElement): void {
    if (provider === "") return;

    if (this._isSlotId(provider)) {
      SlotController.registerWebview(provider, webview);
      return;
    }

    this.webviews[provider] = webview as Electron.WebviewTag;
    this._lastActivity[provider] = Date.now();
  }

  get(provider: string): Electron.WebviewTag | null {
    if (this._isSlotId(provider)) {
      return this._resolveSlotWebview(provider);
    }

    return this.webviews[provider] ?? null;
  }

  resolve(provider: string): Electron.WebviewTag | null {
    if (this._isSlotId(provider)) {
      return this._resolveSlotWebview(provider);
    }

    if (this.webviews[provider]) return this.webviews[provider];

    if (typeof document === "undefined") {
      return null;
    }

    const fallbackId = `${provider}-webview`;
    const found = document.getElementById(fallbackId);
    if (found) {
      this.webviews[provider] = found as Electron.WebviewTag;
    }
    return found as Electron.WebviewTag | null;
  }

  attach(
    provider: string,
    webview: Electron.WebviewTag,
    opts: { providerId?: string; onReady?: () => void; urgent?: boolean } = {}
  ): void {
    if (provider === "") return;

    if (this._isSlotId(provider)) {
      SlotController.registerWebview(provider, webview);
      SlotController.ensureWebviewMounted(provider);
      SlotController.ensureWebviewAttached(provider);
      SlotController.markActive(provider);
      return;
    }

    this.register(provider, webview);

    const { providerId, onReady } = opts;

    try {
      if (providerId === undefined || providerId === "") {
        Logger.warnT(
          LogCategory.WEBVIEW,
          lifecycleLogKey("noProviderConfigured"),
          { provider },
          { provider }
        );
        return;
      }

      const cfg = ProviderRegistry.get(providerId);
      const defaultPage =
        this._isRecord(cfg) && typeof cfg["baseUrl"] === "string" ? cfg["baseUrl"] : "";

      const detachedAttr = webview.getAttribute("data-detached");
      if (detachedAttr !== null && detachedAttr !== "") {
        webview.removeAttribute("data-detached");
        webview.classList.remove("is-hidden");
      }

      const isActive = AppState.getState().activeProvider === provider;
      const isUrgent = opts.urgent ?? false;

      const loadWebview = (): void => {
        const currentSrc = webview.getAttribute("src") ?? "";
        let currentUrl = "";
        try {
          const fullUrl = webview.getURL();
          const parts = fullUrl.split("?");
          const beforeQuery = parts[0] ?? "";
          if (beforeQuery !== "") {
            const hashParts = beforeQuery.split("#");
            currentUrl = hashParts[0] ?? "";
          }
        } catch (_err) {
          const errorMessage = _err instanceof Error ? _err.message : String(_err);
          Logger.warnT(
            LogCategory.WEBVIEW,
            lifecycleLogKey("urlReadFailed"),
            { provider, message: errorMessage },
            {
              provider,
              error: errorMessage,
            }
          );
        }

        const targetParts = defaultPage.split("?");
        const targetBeforeQuery = targetParts[0] ?? "";
        const targetHashParts = targetBeforeQuery.split("#");
        const targetUrl = targetHashParts[0] ?? "";

        const hasCurrentSource = currentSrc !== "" || currentUrl !== "";
        const urlMismatch =
          currentUrl !== "" &&
          targetUrl !== "" &&
          !currentUrl.startsWith(targetUrl) &&
          !targetUrl.startsWith(currentUrl);
        const needsReload = !hasCurrentSource || urlMismatch;

        if (defaultPage !== "" && needsReload) {
          Logger.infoT(
            LogCategory.WEBVIEW,
            lifecycleLogKey("loadingUrl"),
            { provider, url: defaultPage },
            { provider, url: defaultPage }
          );
          webview.setAttribute("src", defaultPage);
        }

        this._setupWebviewLogger(webview, provider, providerId);
      };

      if (isActive || isUrgent) {
        loadWebview();
      } else {
        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(
            () => {
              loadWebview();
            },
            { timeout: 2000 }
          );
        } else {
          setTimeout(loadWebview, ASSISTANT_TIMEOUTS.NAVIGATE_SETTLE);
        }
      }

      if (onReady && typeof onReady === "function") {
        const handleReady = (): void => {
          try {
            onReady();
            Logger.infoT(
              LogCategory.WEBVIEW,
              lifecycleLogKey("onReadyCompleted"),
              { provider },
              { provider }
            );
          } catch (err) {
            const errorMessage = getErrorMessage(err);
            Logger.errorT(
              LogCategory.WEBVIEW,
              lifecycleLogKey("onReadyFailed"),
              { provider, message: errorMessage },
              {
                provider,
                error: errorMessage,
              }
            );
          }
        };
        webview.addEventListener("dom-ready", handleReady, true);
      }

      Logger.infoT(LogCategory.WEBVIEW, lifecycleLogKey("attached"), { provider }, { provider });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      Logger.errorT(
        LogCategory.WEBVIEW,
        lifecycleLogKey("attachFailed"),
        { provider, message: errorMessage },
        {
          provider,
          error: errorMessage,
        }
      );
    }
  }

  detach(
    provider: string,
    {
      cleanupDom = true,
      skipTrafficStop = false,
    }: { cleanupDom?: boolean; skipTrafficStop?: boolean } = {}
  ): void {
    if (provider === "") return;

    if (this._isSlotId(provider)) {
      SlotController.parkWebview(provider, "lifecycle_manager_detach");
      return;
    }

    const webview = this.webviews[provider];

    try {
      if (!skipTrafficStop) {
        TrafficManager.stop(provider, { force: true });
        TrafficManager.detachWebview(provider);
      }

      ConversationSyncer.cancelListeners(provider);

      if (webview && cleanupDom) {
        webview.setAttribute("data-detached", "1");
        webview.classList.add("is-hidden");
        webview.removeAttribute("src");
      }
    } catch (_err) {
    } finally {
      delete this.webviews[provider];
      Logger.infoT(
        LogCategory.WEBVIEW,
        lifecycleLogKey("detached"),
        { provider },
        {
          provider,
          cleanup: !!cleanupDom,
          skipTrafficStop: !!skipTrafficStop,
        }
      );
    }
  }

  destroy(provider: string): void {
    if (provider === "") return;

    if (this._isSlotId(provider)) {
      SlotController.parkWebview(provider, "lifecycle_manager_destroy");
      return;
    }

    const webview = this.webviews[provider];
    if (!webview) return;

    try {
      TrafficManager.detachWebview(provider);

      if (webview.parentNode) {
        webview.parentNode.removeChild(webview);
      }

      delete this.webviews[provider];
      delete this._lastActivity[provider];

      Logger.infoT(LogCategory.WEBVIEW, lifecycleLogKey("destroyed"), { provider }, { provider });
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      Logger.errorT(
        LogCategory.WEBVIEW,
        lifecycleLogKey("destroyFailed"),
        { provider, message: errorMessage },
        {
          provider,
          error: errorMessage,
        }
      );
    }
  }

  markActive(provider: string): void {
    if (provider === "") return;

    if (this._isSlotId(provider)) {
      SlotController.markActive(provider);
      return;
    }

    this._lastActivity[provider] = Date.now();
  }

  cleanupInactive(): void {
    SlotController.cleanupInactiveWebviews(this._inactivityThreshold);

    const now = Date.now();
    const providers = Object.keys(this.webviews).filter((provider) => !this._isSlotId(provider));

    for (const provider of providers) {
      const lastActivity = this._lastActivity[provider] ?? 0;
      const inactive = now - lastActivity > this._inactivityThreshold;

      const isVisible = AppState.getState().activeProvider === provider;
      const isConnected = AppState.isConnected(provider) === true;

      if (inactive && !isVisible && !isConnected) {
        Logger.infoT(
          LogCategory.WEBVIEW,
          lifecycleLogKey("detachingInactive"),
          {
            provider,
            idleMinutes: Math.floor((now - lastActivity) / 60000),
          },
          {
            provider,
            idleMinutes: Math.floor((now - lastActivity) / 60000),
          }
        );
        this.detach(provider, { cleanupDom: true, skipTrafficStop: false });
      }
    }
  }

  _setupWebviewLogger(webview: Electron.WebviewTag, provider: string, providerId: string): void {
    try {
      const webContentsId = webview.getWebContentsId();
      const setupWebviewLogger = window.electronAPI?.["setupWebviewLogger"] as
        | ((webContentsId: number, provider: string, providerId: string) => Promise<void>)
        | undefined;
      if (setupWebviewLogger) {
        setupWebviewLogger(webContentsId, provider, providerId)
          .then(() => {})
          .catch((err: unknown) => {
            const errorMessage = getErrorMessage(err);
            Logger.warnT(
              LogCategory.WEBVIEW,
              lifecycleLogKey("loggerSetupFailed"),
              { provider, providerId, message: errorMessage },
              {
                provider,
                providerId,
                error: errorMessage,
              }
            );
          });
      }
    } catch (_err) {
      const errorMessage = getErrorMessage(_err);
      Logger.warnT(
        LogCategory.WEBVIEW,
        lifecycleLogKey("handlerAttachFailed"),
        { provider, message: errorMessage },
        {
          provider,
          error: errorMessage,
        }
      );
    }
  }

  getAll(): Record<string, Electron.WebviewTag> {
    const all: Record<string, Electron.WebviewTag> = { ...this.webviews };

    (["ai0", "ai1", "ai2"] as const).forEach((slot) => {
      const webview = this._resolveSlotWebview(slot);
      if (webview !== null) {
        all[slot] = webview;
      }
    });

    return all;
  }

  has(provider: string): boolean {
    if (this._isSlotId(provider)) {
      return this._resolveSlotWebview(provider) !== null;
    }

    return !!this.webviews[provider];
  }
}

const lifecycleManager = new LifecycleManagerClass();
export { lifecycleManager as LifecycleManager };
