import { getErrorMessage } from "@shared/index.js";
import type { SlotId } from "@shared/index.js";
import type { TranslationParams } from "@shared/i18n.js";
import { AppI18n } from "../i18n/index.js";
import { normalizeUrl } from "../webview/methods/shared/url-utils.js";
import type { TransitionResult } from "./state-machine.js";
import type { SlotOperationResult, SlotStateData } from "./controller-state.js";
import {
  attachWebview,
  clearDomReadyHandler,
  detachWebview,
  getCurrentUrl,
  waitForDomReady,
} from "./webview-handler.js";
import {
  checkUrlExclusion,
  clearUrlChangeHandler,
  handleUrlChange,
  setupUrlChangeHandler,
} from "./url-handler.js";
import {
  cleanupAfterError as cleanupTimeoutAfterError,
  clearTimeout,
  handleConnectError,
  handleConnectTimeout,
  startTimeout,
} from "./timeout-handler.js";

interface LifecycleStates {
  EMPTY: string;
  ASSIGNED: string;
  CONNECTING: string;
  CONNECTED: string;
  DISCONNECTING: string;
  ERROR: string;
}

interface LifecycleEvents {
  CONNECT_START: string;
  CONNECT_COMPLETE: string;
  CONNECT_FAILED: string;
  DISCONNECT_START: string;
  DISCONNECT_COMPLETE: string;
  WEBVIEW_ATTACHED: string;
  WEBVIEW_DETACHED: string;
  WEBVIEW_DOM_READY: string;
  TRAFFIC_STARTED: string;
  TRAFFIC_STOPPED: string;
  URL_CHANGED: string;
  URL_EXCLUDED: string;
  URL_INCLUDED: string;
}

interface LifecycleConfig {
  connectTimeoutMs: number;
  urlCheckDelayMs: number;
}

interface LifecycleContext {
  getSlot: (slot: string) => SlotStateData | null;
  generateCorrelationId: (slot: string, operation: string) => string;
  log: (slot: string, level: string, message: string, context?: { correlationId?: string }) => void;
  emit: (slot: string, event: string, data?: Record<string, unknown>) => void;
  transition: (slot: string, newState: string, reason?: string) => TransitionResult;
  delay: (ms: number) => Promise<void>;
  disconnect: (slot: string, options?: { force?: boolean }) => Promise<SlotOperationResult>;
  startTraffic: (slot: string, correlationId: string) => Promise<void>;
  stopTraffic: (slot: string, correlationId: string) => Promise<void>;
  cleanupAfterError: (slot: string, correlationId: string) => Promise<void>;
  states: LifecycleStates;
  events: LifecycleEvents;
  config: LifecycleConfig;
}

function slotLifecycleT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.logs.slotLifecycle.${key}`, params);
}

function isLlmAllowedSlot(slot: SlotId): boolean {
  return slot === "ai1" || slot === "ai2";
}

function isLlmProviderSlot(slotState: SlotStateData, slot: SlotId): boolean {
  return isLlmAllowedSlot(slot) && slotState.providerConfig?.id === "llm";
}

function shouldReleaseLlmSlotServer(slotState: SlotStateData, slot: SlotId): boolean {
  return (
    isLlmAllowedSlot(slot) &&
    (slotState._llmServerActive === true || isLlmProviderSlot(slotState, slot))
  );
}

function shouldEmitDefaultPageEvent(slotState: SlotStateData): boolean {
  return slotState.providerConfig?.syncOnDefaultPage !== true;
}

async function startLlmSlotServer(
  slotState: SlotStateData,
  slot: SlotId,
  correlationId: string,
  context: LifecycleContext
): Promise<{ success: true } | { success: false; message: string }> {
  if (!isLlmProviderSlot(slotState, slot)) {
    return { success: true };
  }

  const api = window.electronAPI;
  const llmServeStart = api?.["llmServeStart"] as
    | ((payload: { slot: SlotId }) => Promise<{ running: boolean; url?: string; error?: string }>)
    | undefined;
  if (typeof llmServeStart !== "function") {
    return { success: false, message: "LLM server bridge is unavailable." };
  }

  try {
    const result = await llmServeStart({ slot });
    if (result.running !== true || typeof result.url !== "string" || result.url.trim() === "") {
      return {
        success: false,
        message: result.error ?? "LLM server did not start.",
      };
    }
    slotState._overrideUrl = result.url;
    slotState._llmServerActive = true;
    context.log(slot, "info", `LLM server ready: ${result.url}`, { correlationId });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: getErrorMessage(error),
    };
  }
}

async function stopLlmSlotServer(
  slotState: SlotStateData,
  slot: SlotId,
  correlationId: string,
  context: LifecycleContext
): Promise<void> {
  if (!shouldReleaseLlmSlotServer(slotState, slot)) {
    return;
  }

  const api = window.electronAPI;
  const llmServeStop = api?.["llmServeStop"] as
    ((payload: { slot: SlotId }) => Promise<void>) | undefined;
  if (typeof llmServeStop !== "function") {
    context.log(slot, "warning", "LLM server bridge is unavailable.", { correlationId });
    return;
  }

  try {
    await llmServeStop({ slot });
    delete slotState._llmServerActive;
    context.log(slot, "info", "LLM server slot reference released.", { correlationId });
  } catch (error) {
    context.log(slot, "warning", `LLM server stop failed: ${getErrorMessage(error)}`, {
      correlationId,
    });
  }
}

export async function connectSlotLifecycle(
  slot: SlotId,
  options: { force?: boolean; url?: string; correlationId?: string } = {},
  context: LifecycleContext
): Promise<SlotOperationResult> {
  const slotState = context.getSlot(slot);
  if (!slotState) {
    return { success: false, message: slotLifecycleT("invalidSlot") };
  }

  const correlationId = context.generateCorrelationId(slot, "connect");

  context.log(slot, "info", slotLifecycleT("connectRequested"), { correlationId });

  if (slotState.state === context.states.EMPTY) {
    context.log(slot, "warning", slotLifecycleT("connectBlockedNoAccount"), { correlationId });
    return { success: false, message: slotLifecycleT("connectBlockedNoAccount"), correlationId };
  }

  if (slotState.state === context.states.CONNECTED && options.force !== true) {
    context.log(slot, "debug", slotLifecycleT("alreadyConnected"), { correlationId });
    return { success: true, message: slotLifecycleT("alreadyConnected"), correlationId };
  }

  if (slotState.state === context.states.CONNECTING) {
    context.log(slot, "warning", slotLifecycleT("connectionInProgress"), { correlationId });
    return { success: false, message: slotLifecycleT("connectionInProgress"), correlationId };
  }

  if (slotState.state === context.states.ERROR) {
    context.log(slot, "info", slotLifecycleT("recoveringFromError"), { correlationId });
    slotState.error = null;
    context.transition(slot, context.states.ASSIGNED);
  }

  if (slotState.state === context.states.CONNECTED && options.force === true) {
    context.log(slot, "info", slotLifecycleT("forceReconnect"), { correlationId });
    await context.disconnect(slot, { force: true });
  }

  if (!slotState.webview) {
    context.log(slot, "error", slotLifecycleT("connectBlockedNoWebview"), { correlationId });
    return { success: false, message: slotLifecycleT("connectBlockedNoWebview"), correlationId };
  }

  const llmStartResult = await startLlmSlotServer(slotState, slot, correlationId, context);
  const llmServerStarted = llmStartResult.success === true && isLlmProviderSlot(slotState, slot);
  if (llmStartResult.success !== true) {
    context.log(slot, "error", llmStartResult.message, { correlationId });
    return { success: false, message: llmStartResult.message, correlationId };
  }

  if (options.url !== undefined && options.url !== "" && !isLlmProviderSlot(slotState, slot)) {
    slotState._overrideUrl = options.url;
    context.log(slot, "debug", slotLifecycleT("urlOverrideSet", { url: options.url }), {
      correlationId,
    });
  }

  slotState.correlationId = correlationId;

  const transitionResult = context.transition(slot, context.states.CONNECTING);
  if (!transitionResult.success) {
    context.log(
      slot,
      "error",
      slotLifecycleT("invalidConnectTransition", {
        state: slotState.state,
        message: transitionResult.error ?? "unknown",
      }),
      { correlationId }
    );
    if (llmServerStarted) {
      await stopLlmSlotServer(slotState, slot, correlationId, context);
    }
    return {
      success: false,
      message: slotLifecycleT("invalidStateTransition"),
      correlationId,
      ...(transitionResult.error !== undefined ? { error: transitionResult.error } : {}),
    };
  }
  context.emit(slot, context.events.CONNECT_START, { correlationId });

  startTimeout(slot, "connect", context.config.connectTimeoutMs, () => {
    handleConnectTimeout(
      slotState,
      slot,
      correlationId,
      context.states.ERROR,
      context.log,
      context.emit,
      context.transition,
      context.events.CONNECT_FAILED,
      (innerSlot, innerCorrelationId) => {
        void context.cleanupAfterError(innerSlot, innerCorrelationId);
      }
    );
  });

  try {
    await attachWebview(
      slotState,
      slot,
      correlationId,
      context.log,
      context.emit,
      context.events.WEBVIEW_ATTACHED
    );

    await waitForDomReady(slotState, slot, correlationId, context.log);
    slotState.domReady = true;
    context.emit(slot, context.events.WEBVIEW_DOM_READY, { correlationId });

    if (slotState.providerConfig) {
      try {
        const webviewEl = slotState.webview as HTMLElement & {
          send?: (channel: string, ...args: unknown[]) => void;
        };
        if (typeof webviewEl.send === "function") {
          webviewEl.send("app-set-provider", {
            providerId: slotState.providerConfig.id,
            slot,
          });
          context.log(
            slot,
            "debug",
            slotLifecycleT("providerInfoSent", { providerId: slotState.providerConfig.id }),
            { correlationId }
          );
        }
      } catch (sendErr) {
        context.log(
          slot,
          "warning",
          slotLifecycleT("providerInfoSendFailed", { message: getErrorMessage(sendErr) }),
          { correlationId }
        );
      }
    }

    await context.delay(context.config.urlCheckDelayMs);
    const currentUrl = getCurrentUrl(slotState);
    slotState.currentUrl = currentUrl;

    const isExcluded = checkUrlExclusion(slotState, currentUrl);
    slotState.urlExcluded = isExcluded;

    if (isExcluded) {
      context.emit(slot, context.events.URL_EXCLUDED, { url: currentUrl, correlationId });
      context.log(slot, "info", slotLifecycleT("urlExcluded", { url: currentUrl }), {
        correlationId,
      });
    } else {
      context.emit(slot, context.events.URL_INCLUDED, { url: currentUrl, correlationId });
      await context.startTraffic(slot, correlationId);
    }

    setupUrlChangeHandler(slotState, slot, correlationId, (innerSlot, newUrl) => {
      handleSlotUrlChange(innerSlot, newUrl, context);
    });

    clearTimeout(slot, "connect");
    context.transition(slot, context.states.CONNECTED);
    context.emit(slot, context.events.CONNECT_COMPLETE, {
      correlationId,
      urlExcluded: isExcluded,
    });

    const elapsed = Date.now() - slotState.lastActivity;
    context.log(
      slot,
      "success",
      slotLifecycleT(isExcluded ? "connectedUrlExcluded" : "connected", { elapsedMs: elapsed }),
      { correlationId }
    );

    return { success: true, message: slotLifecycleT("connected"), correlationId };
  } catch (error) {
    if (llmServerStarted) {
      await stopLlmSlotServer(slotState, slot, correlationId, context);
    }
    clearTimeout(slot, "connect");
    return handleConnectError(
      slotState,
      slot,
      correlationId,
      error,
      context.states.ERROR,
      context.log,
      context.emit,
      context.transition,
      context.events.CONNECT_FAILED,
      (innerSlot, innerCorrelationId) => {
        void context.cleanupAfterError(innerSlot, innerCorrelationId);
      }
    );
  }
}

export async function disconnectSlotLifecycle(
  slot: string,
  _options: { force?: boolean } = {},
  context: LifecycleContext
): Promise<SlotOperationResult> {
  const slotState = context.getSlot(slot);
  if (!slotState) {
    return { success: false, message: slotLifecycleT("invalidSlot") };
  }

  const correlationId = context.generateCorrelationId(slot, "disconnect");
  const shouldStopLlmServer = shouldReleaseLlmSlotServer(slotState, slot as SlotId);

  context.log(slot, "info", slotLifecycleT("disconnectRequested"), { correlationId });

  if (slotState.state === context.states.EMPTY) {
    return { success: true, message: slotLifecycleT("notAssigned"), correlationId };
  }

  if (slotState.state === context.states.ASSIGNED) {
    context.log(slot, "debug", slotLifecycleT("alreadyDisconnectedAssigned"), { correlationId });
    return {
      success: true,
      message: slotLifecycleT("alreadyDisconnectedAssigned"),
      correlationId,
    };
  }

  if (slotState.state === context.states.DISCONNECTING) {
    return { success: false, message: slotLifecycleT("disconnectInProgress"), correlationId };
  }

  const transitionResult = context.transition(slot, context.states.DISCONNECTING);
  if (!transitionResult.success) {
    context.log(
      slot,
      "error",
      slotLifecycleT("invalidDisconnectTransition", {
        state: slotState.state,
        message: transitionResult.error ?? "unknown",
      }),
      { correlationId }
    );
    return {
      success: false,
      message: slotLifecycleT("invalidStateTransition"),
      correlationId,
      ...(transitionResult.error !== undefined ? { error: transitionResult.error } : {}),
    };
  }
  context.emit(slot, context.events.DISCONNECT_START, { correlationId });

  try {
    clearUrlChangeHandler(slot as SlotId);

    if (slotState.trafficStarted) {
      await context.stopTraffic(slot, correlationId);
    }

    await detachWebview(
      slotState,
      slot as SlotId,
      correlationId,
      context.log,
      context.emit,
      context.events.WEBVIEW_DETACHED
    );

    slotState.domReady = false;
    slotState.currentUrl = "";
    slotState.urlExcluded = false;
    slotState.trafficStarted = false;
    slotState.correlationId = "";
    slotState.error = null;

    context.transition(slot, context.states.ASSIGNED);
    context.emit(slot, context.events.DISCONNECT_COMPLETE, { correlationId });

    if (shouldStopLlmServer) {
      await stopLlmSlotServer(slotState, slot as SlotId, correlationId, context);
    }

    context.log(slot, "success", slotLifecycleT("disconnected"), { correlationId });
    return { success: true, message: slotLifecycleT("disconnected"), correlationId };
  } catch (error) {
    slotState.domReady = false;
    slotState.trafficStarted = false;
    context.transition(slot, context.states.ASSIGNED);
    if (shouldStopLlmServer) {
      await stopLlmSlotServer(slotState, slot as SlotId, correlationId, context);
    }

    context.log(
      slot,
      "warning",
      slotLifecycleT("disconnectCompletedWithErrors", { message: getErrorMessage(error) }),
      { correlationId }
    );
    return { success: true, message: slotLifecycleT("disconnectedWithErrors"), correlationId };
  }
}

export function handleSlotUrlChange(slot: SlotId, newUrl: string, context: LifecycleContext): void {
  const slotState = context.getSlot(slot);
  if (!slotState) {
    return;
  }

  handleUrlChange(
    slotState,
    slot,
    newUrl,
    context.states.CONNECTED,
    context.log,
    context.emit,
    {
      URL_CHANGED: context.events.URL_CHANGED,
      URL_EXCLUDED: context.events.URL_EXCLUDED,
      URL_INCLUDED: context.events.URL_INCLUDED,
    },
    (innerSlot, correlationId) => {
      void context.startTraffic(innerSlot, correlationId);
    },
    (innerSlot, correlationId) => {
      void context.stopTraffic(innerSlot, correlationId);
    }
  );

  const baseUrl = slotState.providerConfig?.baseUrl;
  if (
    baseUrl !== undefined &&
    baseUrl !== "" &&
    shouldEmitDefaultPageEvent(slotState) &&
    normalizeUrl(newUrl) === normalizeUrl(baseUrl)
  ) {
    context.emit(slot, context.events.URL_CHANGED, { newUrl, isDefaultPage: true });
  }
}

export async function startSlotTraffic(
  slot: string,
  correlationId: string,
  context: LifecycleContext
): Promise<void> {
  const slotState = context.getSlot(slot);
  if (!slotState?.webview || slotState.trafficStarted) {
    await Promise.resolve();
    return;
  }

  try {
    slotState.trafficStarted = true;
    context.emit(slot, context.events.TRAFFIC_STARTED, { correlationId });
    context.log(slot, "debug", slotLifecycleT("trafficStarted"), { correlationId });
  } catch (err) {
    context.log(
      slot,
      "warning",
      slotLifecycleT("trafficStartWarning", { message: getErrorMessage(err) }),
      { correlationId }
    );
  }
  await Promise.resolve();
}

export async function stopSlotTraffic(
  slot: string,
  correlationId: string,
  context: LifecycleContext
): Promise<void> {
  const slotState = context.getSlot(slot);
  if (slotState?.trafficStarted !== true) {
    await Promise.resolve();
    return;
  }

  try {
    slotState.trafficStarted = false;
    context.emit(slot, context.events.TRAFFIC_STOPPED, { correlationId });
    context.log(slot, "debug", slotLifecycleT("trafficStopped"), { correlationId });
  } catch (err) {
    context.log(
      slot,
      "warning",
      slotLifecycleT("trafficStopWarning", { message: getErrorMessage(err) }),
      { correlationId }
    );
  }
  await Promise.resolve();
}

export async function cleanupSlotAfterError(
  slot: string,
  correlationId: string,
  context: LifecycleContext
): Promise<void> {
  const slotState = context.getSlot(slot);
  if (!slotState) {
    return;
  }

  await cleanupTimeoutAfterError(
    slotState,
    slot,
    correlationId,
    context.log,
    (innerSlot) => {
      clearUrlChangeHandler(innerSlot as SlotId);
    },
    (innerSlot) => {
      clearDomReadyHandler(innerSlot as SlotId);
    },
    async (innerSlot, innerCorrelationId) => {
      await context.stopTraffic(innerSlot, innerCorrelationId);
    },
    async (innerSlot, innerCorrelationId) => {
      const innerSlotState = context.getSlot(innerSlot);
      if (innerSlotState) {
        await detachWebview(
          innerSlotState,
          innerSlot as SlotId,
          innerCorrelationId,
          context.log,
          context.emit,
          context.events.WEBVIEW_DETACHED
        );
      }
    }
  );
}
