import type { SlotId } from "@shared/index.js";
import type { TranslationParams } from "@shared/i18n.js";
import type { BaseProviderConfig } from "@shared/provider.js";
import { AppI18n } from "../i18n/index.js";
import type { SlotStateMachine } from "./state-machine.js";
import { SlotStates, createSlotStateMachine } from "./state-machine.js";
import {
  ensureWebviewMounted as ensureSlotWebviewMountedInDom,
  markWebviewAttached,
  markWebviewDetached,
} from "./webview-handler.js";

export type WebviewElement = HTMLElement & {
  getURL?: () => string;
  loadURL?: (url: string) => Promise<void>;
  isLoading?: () => boolean;
  src: string;
};

export interface SlotStateData {
  state: string;
  stateMachine: SlotStateMachine;
  accountId: string | null;
  providerId: string | null;
  providerConfig: BaseProviderConfig | null;
  webview: WebviewElement | null;
  webviewRegistered: boolean;
  domReady: boolean;
  currentUrl: string;
  urlExcluded: boolean;
  trafficStarted: boolean;
  correlationId: string;
  error: Error | null;
  lastActivity: number;
  _llmServerActive?: boolean;
  _overrideUrl?: string;
  _pendingLoad?: boolean;
  _targetUrl?: string;
}

export interface SlotOperationResult {
  success: boolean;
  message: string;
  correlationId?: string;
  error?: string;
}

function slotStateT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.logs.slotState.${key}`, params);
}

export function createSlotState(slotId: string): SlotStateData {
  return {
    state: "empty",
    stateMachine: createSlotStateMachine(slotId, SlotStates.EMPTY),
    accountId: null,
    providerId: null,
    providerConfig: null,
    webview: null,
    webviewRegistered: false,
    domReady: false,
    currentUrl: "",
    urlExcluded: false,
    trafficStarted: false,
    correlationId: "",
    error: null,
    lastActivity: Date.now(),
  };
}

export function isValidSlot(slot: string): slot is SlotId {
  return slot === "ai0" || slot === "ai1" || slot === "ai2";
}

export function getSlotState(
  slots: Record<string, SlotStateData>,
  slot: string
): SlotStateData | null {
  if (!isValidSlot(slot)) {
    return null;
  }
  return slots[slot] ?? null;
}

export function cloneSlotState(slotState: SlotStateData | null): SlotStateData | null {
  if (slotState == null) {
    return null;
  }
  return { ...slotState };
}

export function ensureWebviewMounted(
  slots: Record<string, SlotStateData>,
  slot: SlotId,
  log: (slot: string, level: string, message: string) => void
): boolean {
  const slotState = getSlotState(slots, slot);
  if (slotState?.webview == null) {
    return false;
  }

  const moved = ensureSlotWebviewMountedInDom(slot, slotState.webview);
  if (moved) {
    slotState.lastActivity = Date.now();
    log(slot, "debug", slotStateT("webviewMounted"));
  }

  return moved;
}

export function ensureWebviewAttached(slots: Record<string, SlotStateData>, slot: SlotId): boolean {
  const slotState = getSlotState(slots, slot);
  if (slotState?.webview == null) {
    return false;
  }

  markWebviewAttached(slotState.webview);
  slotState.lastActivity = Date.now();
  return true;
}

export function markSlotActive(slots: Record<string, SlotStateData>, slot: SlotId): boolean {
  const slotState = getSlotState(slots, slot);
  if (slotState == null) {
    return false;
  }

  slotState.lastActivity = Date.now();
  return true;
}

export function parkWebview(
  slots: Record<string, SlotStateData>,
  slot: SlotId,
  reason: string,
  emit: (slot: string, event: string, data?: Record<string, unknown>) => void,
  log: (slot: string, level: string, message: string) => void,
  detachedEvent: string
): boolean {
  const slotState = getSlotState(slots, slot);
  if (slotState == null || !slotState.webviewRegistered || slotState.webview == null) {
    return false;
  }

  markWebviewDetached(slotState.webview);
  slotState.domReady = false;
  slotState.currentUrl = "";
  slotState.urlExcluded = false;
  slotState.lastActivity = Date.now();

  emit(slot, detachedEvent, { reason });

  if (reason === "inactive_cleanup") {
    log(slot, "info", slotStateT("inactiveWebviewParked"));
  } else {
    log(slot, "debug", slotStateT("webviewParked", { reason }));
  }

  return true;
}

export function cleanupInactiveWebviews(
  slots: Record<string, SlotStateData>,
  inactivityThresholdMs: number,
  park: (slot: SlotId, reason?: string) => boolean
): number {
  const now = Date.now();
  let detachedCount = 0;

  (["ai0", "ai1", "ai2"] as SlotId[]).forEach((slot) => {
    const slotState = getSlotState(slots, slot);
    if (slotState == null || !slotState.webviewRegistered || slotState.webview == null) {
      return;
    }

    const state = slotState.state;
    const isConnected = state === "connected";
    const isTransitioning = state === "connecting" || state === "disconnecting";
    if (isConnected || isTransitioning) {
      return;
    }

    const inactive = now - slotState.lastActivity > inactivityThresholdMs;
    if (!inactive) {
      return;
    }

    if (park(slot, "inactive_cleanup")) {
      detachedCount += 1;
    }
  });

  return detachedCount;
}
