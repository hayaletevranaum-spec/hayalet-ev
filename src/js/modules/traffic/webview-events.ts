import { Logger } from "../logger/index.js";
import { LogCategory } from "@shared/index.js";
import { getErrorMessage } from "@shared/index.js";
import type { TranslationParams } from "@shared/i18n.js";
import { AppI18n } from "../i18n/index.js";
import { isProviderScenarioActive } from "../webview/provider-scenario-lock.js";

interface WebviewElement {
  getWebContentsId?: () => number;
  getURL?: () => string;
  isLoading?: () => boolean;
  executeJavaScript: (script: string) => Promise<unknown>;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
}

interface NavigationEvent {
  url?: string;
}

interface WebviewCallbacks {
  onNavigation: (provider: string, href: string) => void;
  onDomReady?: (provider: string) => void;
  onFailLoad: (provider: string) => void;
  buildProbeScript: (provider: string) => string;
}

interface WebviewListeners {
  didStartLoading: (e: NavigationEvent) => void;
  didStartNavigation: (e: NavigationEvent) => void;
  willNavigate: (e: NavigationEvent) => void;
  didNavigate: (e: NavigationEvent) => void;
  didNavigateInPage: (e: NavigationEvent) => void;
  domReady: () => void;
  failLoad: () => void;
}

interface WebviewHandler {
  handleNavEvent: (url: string | undefined, eventType: string) => void;
  domReadyHandler: () => void;
  failLoadHandler: () => void;
  listeners: WebviewListeners;
  webviewEl: WebviewElement;
}

const webviewHandlers: Record<string, WebviewHandler> = {};

const bridgeDiagnostics = new Set<string>();

function warnBridgeOnce(provider: string, error: unknown): void {
  if (bridgeDiagnostics.has(provider)) return;
  bridgeDiagnostics.add(provider);
  Logger.warn(LogCategory.TRAFFIC, "[traffic] webview probe injection failed", {
    provider,
    error: getErrorMessage(error),
  });
}

function trafficWebviewEventsT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.logs.traffic.${key}`, params);
}

export function normalizeHref(href: string | undefined): string {
  if (href === undefined || href === "") return "";
  const parts = href.split("?");
  const beforeQuery = parts[0];
  if (beforeQuery === undefined || beforeQuery === "") return "";
  const hashParts = beforeQuery.split("#");
  return hashParts[0] ?? "";
}

export function attachWebviewEvents(
  provider: string,
  webviewEl: WebviewElement,
  callbacks: WebviewCallbacks
): void {
  if (provider === "") return;

  if (webviewHandlers[provider]) {
    return;
  }

  const { onNavigation, onDomReady, onFailLoad, buildProbeScript } = callbacks;

  Logger.info(LogCategory.TRAFFIC, trafficWebviewEventsT("attachingWebviewEvents", { provider }), {
    provider,
  });

  const ensureBridge = (): void => {
    if (isProviderScenarioActive(provider)) {
      return;
    }

    try {
      if (typeof webviewEl.getWebContentsId !== "function") return;
      webviewEl.getWebContentsId();
      if (webviewEl.isLoading?.() === true) return;
    } catch (_) {
      return;
    }

    const script = buildProbeScript(provider);
    webviewEl.executeJavaScript(script).catch((err) => {
      warnBridgeOnce(provider, err);
    });
  };

  const handleNavEvent = (url: string | undefined, _eventType: string): void => {
    let href: string;
    if (url !== undefined && url !== "") {
      href = normalizeHref(url);
    } else {
      try {
        href = normalizeHref(webviewEl.getURL?.());
      } catch (_err) {
        href = "";
      }
    }
    if (href === "") return;

    if (href === "about:blank" || href.startsWith("data:")) {
      return;
    }

    onNavigation(provider, href);
  };

  const domReadyHandler = (): void => {
    ensureBridge();
    try {
      handleNavEvent(webviewEl.getURL?.(), "dom-ready");
    } catch (_e) {}

    Logger.info(LogCategory.TRAFFIC, trafficWebviewEventsT("webviewDomReady", { provider }), {
      provider,
    });

    onDomReady?.(provider);
  };

  const failLoadHandler = (): void => {
    Logger.error(LogCategory.TRAFFIC, trafficWebviewEventsT("webviewLoadFailed", { provider }), {
      provider,
    });

    onFailLoad(provider);
  };

  const listeners: WebviewListeners = {
    didStartLoading: (e: NavigationEvent) => {
      handleNavEvent(e.url, "did-start-loading");
    },
    didStartNavigation: (e: NavigationEvent) => {
      handleNavEvent(e.url, "did-start-navigation");
    },
    willNavigate: (e: NavigationEvent) => {
      handleNavEvent(e.url, "will-navigate");
    },
    didNavigate: (e: NavigationEvent) => {
      handleNavEvent(e.url, "did-navigate");
    },
    didNavigateInPage: (e: NavigationEvent) => {
      handleNavEvent(e.url, "did-navigate-in-page");
    },
    domReady: domReadyHandler,
    failLoad: failLoadHandler,
  };

  webviewHandlers[provider] = {
    handleNavEvent,
    domReadyHandler,
    failLoadHandler,
    listeners,
    webviewEl,
  };

  webviewEl.addEventListener("did-start-loading", listeners.didStartLoading as EventListener);
  webviewEl.addEventListener("did-start-navigation", listeners.didStartNavigation as EventListener);
  webviewEl.addEventListener("will-navigate", listeners.willNavigate as EventListener);
  webviewEl.addEventListener("did-navigate", listeners.didNavigate as EventListener);
  webviewEl.addEventListener("did-navigate-in-page", listeners.didNavigateInPage as EventListener);
  webviewEl.addEventListener("dom-ready", listeners.domReady);
  webviewEl.addEventListener("did-fail-load", listeners.failLoad);
}

export function detachWebviewEvents(provider: string): void {
  if (provider === "") return;

  const handlers = webviewHandlers[provider];
  if (!handlers) return;

  Logger.info(LogCategory.TRAFFIC, trafficWebviewEventsT("detachingWebviewEvents", { provider }), {
    provider,
  });

  const webviewEl = handlers.webviewEl;
  const l = handlers.listeners;

  try {
    try {
      webviewEl.removeEventListener("did-start-loading", l.didStartLoading as EventListener);
    } catch (e) {
      void 0;
    }
    try {
      webviewEl.removeEventListener("did-start-navigation", l.didStartNavigation as EventListener);
    } catch (e) {
      void 0;
    }
    try {
      webviewEl.removeEventListener("will-navigate", l.willNavigate as EventListener);
    } catch (e) {
      void 0;
    }
    try {
      webviewEl.removeEventListener("did-navigate", l.didNavigate as EventListener);
    } catch (e) {
      void 0;
    }
    try {
      webviewEl.removeEventListener("did-navigate-in-page", l.didNavigateInPage as EventListener);
    } catch (e) {
      void 0;
    }
    try {
      webviewEl.removeEventListener("dom-ready", l.domReady);
    } catch (e) {
      void 0;
    }
    try {
      webviewEl.removeEventListener("did-fail-load", l.failLoad);
    } catch (e) {
      void 0;
    }
  } catch (err) {
    Logger.warnT(
      LogCategory.TRAFFIC,
      "app.logs.traffic.detachEventsFailed",
      { message: getErrorMessage(err) },
      {
        error: getErrorMessage(err),
      }
    );
  }

  delete webviewHandlers[provider];
}

export function hasHandlers(provider: string): boolean {
  return !!webviewHandlers[provider];
}
