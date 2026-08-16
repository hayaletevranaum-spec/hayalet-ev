import { TIMEOUTS } from "@timeouts";
import type { SlotId } from "@shared/index.js";
import { LogLevel, getErrorMessage } from "@shared/index.js";
import type { TranslationParams } from "@shared/i18n.js";
import type { BaseProviderConfig } from "@shared/provider.js";
import { AppI18n } from "../i18n/index.js";

type WebviewElement = HTMLElement & {
  getURL?: () => string;
  loadURL?: (url: string) => Promise<void>;
  isLoading?: () => boolean;
  src: string;
  style: CSSStyleDeclaration;
  addEventListener: (
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions
  ) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
};

interface WebviewHandlerSlotState {
  webview: WebviewElement | null;
  providerConfig: BaseProviderConfig | null;
  lastActivity: number;
  _overrideUrl?: string;
  _pendingLoad?: boolean;
  _targetUrl?: string;
}

interface AttachResult {
  needsLoad: boolean;
  targetUrl: string;
}

interface DomReadyHandlerInfo {
  handler: () => void;
  errorHandler: (event: { errorCode?: number; errorDescription?: string }) => void;
  webview: WebviewElement;
  timeoutId: ReturnType<typeof setTimeout>;
}

type LogFn = (
  slot: SlotId,
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
) => void;

type EmitFn = (slot: SlotId, event: string, data: Record<string, unknown>) => void;

function slotWebviewT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.logs.slotWebview.${key}`, params);
}

export function ensureWebviewMounted(slot: SlotId, webview: WebviewElement): boolean {
  const mountEl = document.getElementById(`${slot}-webview-mount`);
  if (!mountEl || mountEl.contains(webview)) {
    return false;
  }

  mountEl.appendChild(webview);
  webview.classList.add("webview-frame");
  return true;
}

export function markWebviewAttached(webview: WebviewElement): void {
  const detachedAttr = webview.getAttribute("data-detached");
  if (detachedAttr !== null && detachedAttr !== "") {
    webview.removeAttribute("data-detached");
  }
  webview.classList.remove("is-hidden");
  webview.classList.add("webview-frame");
}

export function markWebviewDetached(webview: WebviewElement): void {
  webview.setAttribute("data-detached", "1");
  webview.removeAttribute("src");
  webview.classList.add("is-hidden");
}

export async function attachWebview(
  slotState: WebviewHandlerSlotState,
  slot: SlotId,
  correlationId: string,
  logFn: LogFn,
  emitFn: EmitFn,
  eventAttached: string
): Promise<AttachResult> {
  const webview = slotState.webview;

  if (!webview) {
    throw new Error(slotWebviewT("webviewNotAvailable"));
  }

  markWebviewAttached(webview);

  const moved = ensureWebviewMounted(slot, webview);
  if (moved) {
    logFn(slot, LogLevel.DEBUG, slotWebviewT("movedToMountPoint"), { correlationId });
  }

  const currentSrc = webview.getAttribute("src") ?? "";
  let currentUrl = "";
  try {
    const fullUrl = webview.getURL?.() ?? "";
    const parts = fullUrl.split("?");
    const beforeQuery = parts[0];
    if (beforeQuery !== undefined && beforeQuery !== "") {
      const hashParts = beforeQuery.split("#");
      currentUrl = hashParts[0] ?? "";
    }
  } catch (_e) {}

  const targetUrl = slotState._overrideUrl ?? slotState.providerConfig?.baseUrl ?? "";
  const targetParts = targetUrl.split("?");
  const targetBeforeQuery = targetParts[0] ?? "";
  const targetHashParts = targetBeforeQuery.split("#");
  const normalizedTarget = targetHashParts[0] ?? "";

  const hasOverride = slotState._overrideUrl !== undefined && slotState._overrideUrl !== "";

  if (slotState._overrideUrl !== undefined && slotState._overrideUrl !== "") {
    delete slotState._overrideUrl;
  }

  const hasCurrentSource = currentSrc !== "" || currentUrl !== "";
  const urlsMismatch =
    currentUrl !== "" &&
    normalizedTarget !== "" &&
    !currentUrl.startsWith(normalizedTarget) &&
    !normalizedTarget.startsWith(currentUrl);
  const needsLoad = hasOverride || !hasCurrentSource || urlsMismatch;

  slotState._pendingLoad = needsLoad && targetUrl !== "";
  slotState._targetUrl = targetUrl;

  if (!needsLoad && currentUrl !== "") {
    logFn(slot, LogLevel.DEBUG, slotWebviewT("alreadyLoadedAtUrl", { url: currentUrl }), {
      correlationId,
    });
  }

  slotState.lastActivity = Date.now();
  emitFn(slot, eventAttached, { correlationId });
  logFn(slot, LogLevel.DEBUG, slotWebviewT("attached"), { correlationId });

  return await Promise.resolve({ needsLoad: slotState._pendingLoad ?? false, targetUrl });
}

export async function detachWebview(
  slotState: WebviewHandlerSlotState,
  slot: SlotId,
  correlationId: string,
  logFn: LogFn,
  emitFn: EmitFn,
  eventDetached: string
): Promise<void> {
  const webview = slotState.webview;

  if (!webview) {
    await Promise.resolve();
    return;
  }

  try {
    markWebviewDetached(webview);

    emitFn(slot, eventDetached, { correlationId });
    logFn(slot, LogLevel.DEBUG, slotWebviewT("detached"), { correlationId });
  } catch (err) {
    logFn(slot, LogLevel.ERROR, slotWebviewT("detachError", { message: getErrorMessage(err) }), {
      correlationId,
    });
  }

  slotState._pendingLoad = false;
  delete slotState._targetUrl;
  slotState.lastActivity = Date.now();

  await Promise.resolve();
}
const domReadyHandlers: Record<string, DomReadyHandlerInfo> = {};

// NOTE: Attach event listeners before setting src to avoid race conditions.
export async function waitForDomReady(
  slotState: WebviewHandlerSlotState,
  slot: SlotId,
  correlationId: string,
  logFn: LogFn
): Promise<void> {
  const webview = slotState.webview;

  if (!webview) {
    await Promise.reject(new Error(slotWebviewT("webviewNotAvailable")));
    return;
  }

  await new Promise<void>((resolve, reject) => {
    if (slotState._pendingLoad !== true) {
      try {
        const loadedUrl = webview.getURL?.() ?? "";
        const isLoading = webview.isLoading?.();
        if (loadedUrl !== "" && isLoading !== true) {
          logFn(slot, LogLevel.DEBUG, slotWebviewT("alreadyLoaded"), { correlationId });
          resolve();
          return;
        }
      } catch (_e) {}
    }

    const timeoutId = setTimeout(() => {
      clearDomReadyHandler(slot);
      reject(new Error(slotWebviewT("domReadyTimeout")));
    }, TIMEOUTS.DOM_READY);

    const handler = (): void => {
      clearTimeout(timeoutId);
      clearDomReadyHandler(slot);
      logFn(slot, LogLevel.DEBUG, slotWebviewT("domReadyReceived"), { correlationId });
      resolve();
    };

    const errorHandler = (event: { errorCode?: number; errorDescription?: string }): void => {
      if (event.errorCode === -3) {
        return;
      }

      clearTimeout(timeoutId);
      clearDomReadyHandler(slot);
      reject(
        new Error(
          slotWebviewT("loadFailed", {
            message: event.errorDescription ?? "unknown",
          })
        )
      );
    };

    domReadyHandlers[slot] = { handler, errorHandler, webview, timeoutId };

    webview.addEventListener("dom-ready", handler, { once: true });
    webview.addEventListener("did-fail-load", errorHandler as EventListener);

    if (
      slotState._pendingLoad === true &&
      slotState._targetUrl !== undefined &&
      slotState._targetUrl !== ""
    ) {
      logFn(slot, LogLevel.INFO, slotWebviewT("loadingUrl", { url: slotState._targetUrl }), {
        correlationId,
      });
      webview.setAttribute("src", slotState._targetUrl);
      slotState._pendingLoad = false;
      delete slotState._targetUrl;
    }
  });
}

export function clearDomReadyHandler(slot: SlotId): void {
  const handlers = domReadyHandlers[slot];
  if (!handlers) return;

  const { handler, errorHandler, webview, timeoutId } = handlers;
  try {
    clearTimeout(timeoutId);
    webview.removeEventListener("dom-ready", handler);
    webview.removeEventListener("did-fail-load", errorHandler as EventListener);
  } catch (_e) {}
  delete domReadyHandlers[slot];
}

export function getCurrentUrl(slotState: WebviewHandlerSlotState | null): string {
  const webview = slotState?.webview;
  if (!webview) return "";
  try {
    const url = webview.getURL?.();
    if (url !== undefined && url !== "") return url;
    return webview.getAttribute("src") ?? "";
  } catch (_e) {
    return "";
  }
}
