import {
  normalizeUrl,
  isUrlExcluded as checkUrlExcluded,
} from "../webview/methods/shared/url-utils.js";
import type { SlotId } from "@shared/index.js";
import { LogLevel } from "@shared/index.js";
import type { TranslationParams } from "@shared/i18n.js";
import type { BaseProviderConfig } from "@shared/provider.js";
import { AppI18n } from "../i18n/index.js";

type WebviewElement = HTMLElement & {
  getURL?: () => string;
  loadURL?: (url: string) => Promise<void>;
  isLoading?: () => boolean;
  src: string;
  addEventListener: (
    type: string,
    listener: EventListener,
    options?: AddEventListenerOptions
  ) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
};

interface UrlHandlerSlotState {
  webview: WebviewElement | null;
  providerConfig: BaseProviderConfig | null;
  state: string;
  currentUrl: string;
  urlExcluded: boolean;
  trafficStarted: boolean;
  correlationId: string;
}

interface UrlChangeHandlerInfo {
  handler: (event: { url?: string }) => void;
  webview: WebviewElement;
}

interface UrlEvents {
  URL_CHANGED: string;
  URL_EXCLUDED: string;
  URL_INCLUDED: string;
}

type LogFn = (slot: SlotId, level: LogLevel, message: string) => void;

type EmitFn = (slot: SlotId, event: string, data: Record<string, unknown>) => void;

type TrafficFn = (slot: SlotId, correlationId: string) => void;

type UrlChangeCallback = (slot: SlotId, url: string) => void;

const urlChangeHandlers: Record<string, UrlChangeHandlerInfo> = {};

function slotUrlT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.logs.slotUrl.${key}`, params);
}

function shouldPreserveUrlQuery(slotState: UrlHandlerSlotState): boolean {
  return slotState.providerConfig?.preserveSyncUrlQuery === true;
}

function normalizeComparableUrl(slotState: UrlHandlerSlotState, url: string): string {
  if (!shouldPreserveUrlQuery(slotState)) {
    return normalizeUrl(url);
  }

  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return url.split("#")[0] ?? url;
  }
}

export function checkUrlExclusion(slotState: UrlHandlerSlotState, url: string): boolean {
  const config = slotState.providerConfig;
  const excludedUrls = config?.excludedUrls;

  if (excludedUrls === undefined || excludedUrls.length === 0 || url === "") {
    return false;
  }

  return checkUrlExcluded(url, excludedUrls);
}

export function setupUrlChangeHandler(
  slotState: UrlHandlerSlotState,
  slot: SlotId,
  _correlationId: string,
  onUrlChange: UrlChangeCallback
): void {
  clearUrlChangeHandler(slot);

  const webview = slotState.webview;
  if (!webview) return;

  const handler = (event: { url?: string }): void => {
    const url = event.url ?? "";
    if (url !== "" && url !== "about:blank" && !url.startsWith("data:")) {
      onUrlChange(slot, url);
    }
  };

  urlChangeHandlers[slot] = { handler, webview };

  webview.addEventListener("did-navigate", handler as EventListener);
  webview.addEventListener("did-navigate-in-page", handler as EventListener);
}

export function clearUrlChangeHandler(slot: SlotId): void {
  const handlers = urlChangeHandlers[slot];
  if (!handlers) return;

  const { handler, webview } = handlers;
  try {
    webview.removeEventListener("did-navigate", handler as EventListener);
    webview.removeEventListener("did-navigate-in-page", handler as EventListener);
  } catch (_e) {}
  delete urlChangeHandlers[slot];
}

export function handleUrlChange(
  slotState: UrlHandlerSlotState,
  slot: SlotId,
  newUrl: string,
  connectedState: string,
  logFn: LogFn,
  emitFn: EmitFn,
  events: UrlEvents,
  startTrafficFn: TrafficFn,
  stopTrafficFn: TrafficFn
): void {
  if (slotState.state !== connectedState) return;

  const normalizedNew = normalizeComparableUrl(slotState, newUrl);
  const normalizedOld = normalizeComparableUrl(slotState, slotState.currentUrl);

  if (normalizedNew === normalizedOld) return;

  logFn(slot, LogLevel.INFO, slotUrlT("changed", { oldUrl: normalizedOld, newUrl: normalizedNew }));
  emitFn(slot, events.URL_CHANGED, { oldUrl: slotState.currentUrl, newUrl });

  slotState.currentUrl = newUrl;
  const isExcluded = checkUrlExclusion(slotState, newUrl);
  const wasExcluded = slotState.urlExcluded;

  if (isExcluded !== wasExcluded) {
    slotState.urlExcluded = isExcluded;

    if (isExcluded && slotState.trafficStarted) {
      logFn(slot, LogLevel.INFO, slotUrlT("excludedStoppingTraffic", { url: newUrl }));
      emitFn(slot, events.URL_EXCLUDED, { url: newUrl });
      stopTrafficFn(slot, slotState.correlationId);
    } else if (!isExcluded && !slotState.trafficStarted) {
      logFn(slot, LogLevel.INFO, slotUrlT("includedStartingTraffic", { url: newUrl }));
      emitFn(slot, events.URL_INCLUDED, { url: newUrl });
      startTrafficFn(slot, slotState.correlationId);
    }
  }
}

export function navigate(
  slotState: UrlHandlerSlotState,
  slot: SlotId,
  url: string | null,
  connectedState: string,
  logFn: LogFn,
  emitFn: EmitFn,
  navigatedEvent: string
): void {
  if (slotState.state !== connectedState) {
    logFn(slot, LogLevel.WARNING, slotUrlT("navigateBlockedNotConnected"));
    return;
  }

  const webview = slotState.webview;
  if (!webview) return;

  const targetUrl = url ?? slotState.providerConfig?.baseUrl ?? "";

  if (targetUrl === "") {
    logFn(slot, LogLevel.WARNING, slotUrlT("navigateMissingUrl"));
    return;
  }

  let currentUrl = "";
  try {
    currentUrl = webview.getURL?.() ?? webview.getAttribute("src") ?? "";
  } catch (_e) {}

  if (
    normalizeComparableUrl(slotState, currentUrl) === normalizeComparableUrl(slotState, targetUrl)
  ) {
    return;
  }

  logFn(slot, LogLevel.INFO, slotUrlT("navigating", { url: targetUrl }));

  try {
    if (typeof webview.loadURL === "function") {
      webview.loadURL(targetUrl).catch((err: Error) => {
        logFn(slot, LogLevel.WARNING, slotUrlT("navigationWarning", { message: err.message }));
      });
    } else {
      webview.src = targetUrl;
    }
    emitFn(slot, navigatedEvent, { url: targetUrl });
  } catch (err) {
    const error = err as Error;
    logFn(slot, LogLevel.ERROR, slotUrlT("navigationError", { message: error.message }));
  }
}
