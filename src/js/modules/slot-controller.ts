import { LogCategory, LogLevel } from "@shared/logging-core";
import { Logger } from "./logger/index.js";
import { SettingsManager } from "./settings-manager.js";
import { AppI18n } from "./i18n/index.js";
import type { SlotId } from "@shared/index.js";
import type { SlotStateType, TransitionResult } from "./slot/state-machine.js";
import {
  emitSlotEvent,
  generateSlotCorrelationId,
  logSlotEvent,
  subscribeToSlotEvents,
  subscribeToSpecificSlotEvent,
  type SlotListener,
} from "./slot/controller-events.js";
import {
  cleanupInactiveWebviews as cleanupInactiveSlotWebviews,
  cloneSlotState,
  createSlotState,
  ensureWebviewAttached as ensureSlotWebviewAttached,
  ensureWebviewMounted as ensureSlotWebviewMounted,
  getSlotState,
  isValidSlot,
  markSlotActive,
  parkWebview as parkSlotWebview,
  type SlotOperationResult,
  type SlotStateData,
  type WebviewElement,
} from "./slot/controller-state.js";
import { navigate as navigateWebview } from "./slot/url-handler.js";
import {
  cleanupSlotAfterError,
  connectSlotLifecycle,
  disconnectSlotLifecycle,
  handleSlotUrlChange,
  startSlotTraffic,
  stopSlotTraffic,
} from "./slot/controller-lifecycle.js";

import {
  handleSettingsChange,
  syncWithSettings,
  syncSlotWithSettings,
} from "./slot/settings-sync.js";
import type { Settings } from "./slot/settings-sync.js";

export enum SlotState {
  EMPTY = "empty",
  ASSIGNED = "assigned",
  CONNECTING = "connecting",
  CONNECTED = "connected",
  DISCONNECTING = "disconnecting",
  ERROR = "error",
}

export enum SlotEvent {
  ACCOUNT_ASSIGNED = "account_assigned",
  ACCOUNT_REMOVED = "account_removed",
  CONNECT_START = "connect_start",
  CONNECT_COMPLETE = "connect_complete",
  CONNECT_FAILED = "connect_failed",
  DISCONNECT_START = "disconnect_start",
  DISCONNECT_COMPLETE = "disconnect_complete",
  WEBVIEW_REGISTERED = "webview_registered",
  WEBVIEW_ATTACHED = "webview_attached",
  WEBVIEW_DETACHED = "webview_detached",
  WEBVIEW_DOM_READY = "webview_dom_ready",
  WEBVIEW_NAVIGATED = "webview_navigated",
  TRAFFIC_STARTED = "traffic_started",
  TRAFFIC_STOPPED = "traffic_stopped",
  URL_CHANGED = "url_changed",
  URL_EXCLUDED = "url_excluded",
  URL_INCLUDED = "url_included",
  STATE_CHANGED = "state_changed",
}

const CONFIG = {
  connectTimeoutMs: 30000,
  urlCheckDelayMs: 500,
};

class SlotControllerClass {
  _slots: Record<string, SlotStateData>;
  _listeners: SlotListener[];
  _initialized: boolean;
  _boundLog: typeof this._log;
  _boundEmit: typeof this._emit;
  _boundTransition: typeof this._transition;
  // NOTE: One operation lock per slot to avoid race conditions.
  _operationLocks: Record<string, Promise<unknown> | null>;

  constructor() {
    this._slots = {
      ai0: createSlotState("ai0"),
      ai1: createSlotState("ai1"),
      ai2: createSlotState("ai2"),
    };
    this._listeners = [];
    this._initialized = false;
    this._operationLocks = { ai0: null, ai1: null, ai2: null };

    this._boundLog = this._log.bind(this);
    this._boundEmit = this._emit.bind(this);
    this._boundTransition = this._transition.bind(this);
  }

  // NOTE: Acquire an operation lock to prevent concurrent slot operations.
  private async _acquireLock<T>(slot: string, operation: () => Promise<T>): Promise<T> {
    const waitForUnlock = async (): Promise<void> => {
      const pending = this._operationLocks[slot];
      if (pending == null) return;
      try {
        await pending;
      } catch {}
      await waitForUnlock();
    };
    await waitForUnlock();

    const operationPromise = operation();
    this._operationLocks[slot] = operationPromise;

    try {
      const result = await operationPromise;
      return result;
    } finally {
      this._operationLocks[slot] = null;
    }
  }

  async init(): Promise<void> {
    if (this._initialized) {
      await Promise.resolve();
      return;
    }

    const settings = SettingsManager.getSnapshot();
    syncWithSettings(this._slots, settings as Settings | null, (slot: string, s: unknown) => {
      this._syncSlotWithSettings(slot, s as Settings);
    });

    SettingsManager.subscribe(
      ({ settings, changedPaths }: { settings: unknown; changedPaths: string[] }) => {
        handleSettingsChange(
          this._slots,
          settings as Settings | null,
          changedPaths,
          (slot: string, s: unknown) => {
            this._syncSlotWithSettings(slot, s as Settings);
          }
        );
      }
    );

    this._initialized = true;
    Logger.infoT(LogCategory.SLOT, "app.logs.slotController.initialized");
    await Promise.resolve();
  }

  private _getSlot(slot: string): SlotStateData | null {
    return getSlotState(this._slots, slot);
  }

  getState(slot: string): SlotStateData | null {
    return cloneSlotState(this._getSlot(slot));
  }

  isConnected(slot: string): boolean {
    const slotData = this._getSlot(slot);
    if (!slotData) return false;
    return slotData.state === SlotState.CONNECTED;
  }

  isAssigned(slot: string): boolean {
    const slotData = this._getSlot(slot);
    if (!slotData) return false;
    return slotData.state !== SlotState.EMPTY;
  }

  isTransitioning(slot: string): boolean {
    const slotData = this._getSlot(slot);
    if (!slotData) return false;
    const state = slotData.state;
    return state === SlotState.CONNECTING || state === SlotState.DISCONNECTING;
  }

  isUrlExcluded(slot: string): boolean {
    const slotData = this._getSlot(slot);
    if (!slotData) return false;
    return slotData.urlExcluded;
  }

  getProviderId(slot: string): string | null {
    const slotData = this._getSlot(slot);
    if (!slotData) return null;
    return slotData.providerId;
  }

  getWebview(slot: string): WebviewElement | null {
    const slotData = this._getSlot(slot);
    if (!slotData) return null;
    return slotData.webview;
  }

  ensureWebviewMounted(slot: SlotId): boolean {
    return ensureSlotWebviewMounted(this._slots, slot, this._boundLog);
  }

  ensureWebviewAttached(slot: SlotId): boolean {
    return ensureSlotWebviewAttached(this._slots, slot);
  }

  markActive(slot: SlotId): boolean {
    return markSlotActive(this._slots, slot);
  }

  parkWebview(slot: SlotId, reason = "manual_park"): boolean {
    return parkSlotWebview(
      this._slots,
      slot,
      reason,
      this._boundEmit,
      this._boundLog,
      SlotEvent.WEBVIEW_DETACHED
    );
  }

  cleanupInactiveWebviews(inactivityThresholdMs = 30 * 60 * 1000): number {
    return cleanupInactiveSlotWebviews(this._slots, inactivityThresholdMs, (slot, reason) =>
      this.parkWebview(slot, reason)
    );
  }

  registerWebview(slot: string, webview: HTMLElement): void {
    const slotState = this._getSlot(slot);
    if (!slotState) return;

    if (slotState.webviewRegistered && slotState.webview === webview) {
      return;
    }

    slotState.webview = webview as WebviewElement;
    slotState.webviewRegistered = true;
    slotState.lastActivity = Date.now();

    this._log(slot, "info", AppI18n.t("app.logs.slotController.webviewRegistered"));
    this._emit(slot, SlotEvent.WEBVIEW_REGISTERED, { webview });
  }

  unregisterWebview(slot: string): void {
    const slotState = this._getSlot(slot);
    if (!slotState) return;

    // NOTE: Await disconnect to prevent state inconsistencies.
    if (slotState.state === SlotState.CONNECTED) {
      this._log(slot, "warning", AppI18n.t("app.logs.slotController.unregisterConnected"));
      this.disconnect(slot, { force: true })
        .then((result: { success?: boolean; message?: string }) => {
          if (result.success !== true) {
            Logger.panelT(
              LogCategory.SLOT,
              LogLevel.ERROR,
              "app.logs.slotController.unregisterDisconnectFailed",
              { slot, message: result.message ?? "" },
              {
                slot,
                error: result.message,
              }
            );
          }
        })
        .catch((err) => {
          Logger.panelT(
            LogCategory.SLOT,
            LogLevel.ERROR,
            "app.logs.slotController.unregisterDisconnectError",
            { slot, message: err instanceof Error ? err.message : String(err) },
            {
              error: err,
            }
          );
        });
      // NOTE: Exit early; disconnect handles cleanup.
      return;
    }

    slotState.webview = null;
    slotState.webviewRegistered = false;
    slotState.domReady = false;

    this._log(slot, "info", AppI18n.t("app.logs.slotController.webviewUnregistered"));
    this._emit(slot, SlotEvent.WEBVIEW_DETACHED, {});
  }

  recoverFromError(slot: string): SlotOperationResult {
    const slotState = this._getSlot(slot);
    if (!slotState) {
      return { success: false, message: AppI18n.t("app.logs.slotController.invalidSlot") };
    }

    if (slotState.state !== SlotState.ERROR) {
      return { success: false, message: AppI18n.t("app.logs.slotController.notInErrorState") };
    }

    this._log(slot, "info", AppI18n.t("app.logs.slotController.manualRecovery"));
    slotState.error = null;

    if (slotState.accountId !== null && slotState.accountId !== "") {
      this._transition(slot, SlotState.ASSIGNED);
    } else {
      this._transition(slot, SlotState.EMPTY);
    }

    return { success: true, message: AppI18n.t("app.logs.slotController.recovered") };
  }

  async connect(
    slot: SlotId,
    options: { force?: boolean; url?: string; correlationId?: string } = {}
  ): Promise<SlotOperationResult> {
    // NOTE: Use lock to prevent concurrent connect operations.
    return await this._acquireLock(slot, async () => await this._connectInternal(slot, options));
  }

  private async _connectInternal(
    slot: SlotId,
    options: { force?: boolean; url?: string; correlationId?: string } = {}
  ): Promise<SlotOperationResult> {
    return await connectSlotLifecycle(slot, options, this._getLifecycleContext());
  }

  async disconnect(slot: string, _options: { force?: boolean } = {}): Promise<SlotOperationResult> {
    // NOTE: Use lock to prevent concurrent disconnect operations.
    return await this._acquireLock(
      slot,
      async () => await this._disconnectInternal(slot, _options)
    );
  }

  private async _disconnectInternal(
    slot: string,
    _options: { force?: boolean } = {}
  ): Promise<SlotOperationResult> {
    return await disconnectSlotLifecycle(slot, _options, this._getLifecycleContext());
  }

  navigate(slot: SlotId, url: string | null = null): void {
    const slotState = this._getSlot(slot);
    if (!slotState) return;

    navigateWebview(
      slotState,
      slot,
      url,
      SlotState.CONNECTED,
      this._boundLog,
      this._boundEmit,
      SlotEvent.WEBVIEW_NAVIGATED
    );
  }

  subscribe(listener: (payload: unknown) => void): () => void {
    return subscribeToSlotEvents(this._listeners, listener);
  }

  on(
    eventType: string,
    listener: (payload: { event?: string; slot?: string }) => void
  ): () => void {
    return subscribeToSpecificSlotEvent(this._listeners, eventType, listener);
  }

  _syncSlotWithSettings(slot: string, settings: Settings): void {
    const slotState = this._getSlot(slot);
    if (!slotState) return;

    syncSlotWithSettings(
      slotState,
      slot,
      settings,
      {
        EMPTY: SlotState.EMPTY,
        ASSIGNED: SlotState.ASSIGNED,
        CONNECTED: SlotState.CONNECTED,
        CONNECTING: SlotState.CONNECTING,
      },
      { ACCOUNT_ASSIGNED: SlotEvent.ACCOUNT_ASSIGNED, ACCOUNT_REMOVED: SlotEvent.ACCOUNT_REMOVED },
      this._boundLog,
      this._boundTransition,
      this._boundEmit,
      async (s: string, opts?: { force?: boolean }) => await this.disconnect(s, opts),
      (s: string) => {
        this.navigate(s as SlotId);
      }
    );
  }

  _handleUrlChange(slot: SlotId, newUrl: string): void {
    handleSlotUrlChange(slot, newUrl, this._getLifecycleContext());
  }

  async _startTraffic(slot: string, correlationId: string): Promise<void> {
    await startSlotTraffic(slot, correlationId, this._getLifecycleContext());
  }
  async _stopTraffic(slot: string, correlationId: string): Promise<void> {
    await stopSlotTraffic(slot, correlationId, this._getLifecycleContext());
  }

  async _cleanupAfterError(slot: string, correlationId: string): Promise<void> {
    await cleanupSlotAfterError(slot, correlationId, this._getLifecycleContext());
  }

  _transition(slot: string, newState: string, reason?: string): TransitionResult {
    const slotState = this._getSlot(slot);
    if (!slotState) {
      return {
        success: false,
        error: AppI18n.t("app.logs.slotController.invalidSlot"),
        fromState: "unknown" as SlotStateType,
        toState: newState as SlotStateType,
      };
    }

    const oldState = slotState.state;

    const result = slotState.stateMachine.transition(newState as SlotStateType, {
      ...(slotState.correlationId !== "" ? { correlationId: slotState.correlationId } : {}),
      ...(reason !== undefined && reason !== "" ? { reason } : {}),
    });

    if (result.success) {
      // NOTE: Keep legacy state in sync for backward compatibility.
      slotState.state = newState;
      slotState.lastActivity = Date.now();

      if (result.wasNoOp !== true) {
        this._emit(slot, SlotEvent.STATE_CHANGED, {
          oldState,
          newState,
          validated: true,
        });
      }
    } else {
      this._log(
        slot,
        "error",
        AppI18n.t("app.logs.slotController.invalidTransitionBlocked", {
          oldState,
          newState,
        })
      );
    }

    return result;
  }

  getStateMachineState(slot: string): SlotStateType | null {
    const slotData = this._getSlot(slot);
    if (!slotData) return null;
    return slotData.stateMachine.state;
  }

  getStateMachineDebugInfo(slot: string): unknown {
    const slotData = this._getSlot(slot);
    if (!slotData) return null;
    return slotData.stateMachine.getDebugInfo();
  }

  canTransitionTo(slot: string, targetState: string): boolean {
    const slotData = this._getSlot(slot);
    if (!slotData) return false;
    return slotData.stateMachine.canTransitionTo(targetState as SlotStateType);
  }

  _isValidSlot(slot: string): boolean {
    return isValidSlot(slot);
  }

  _generateCorrelationId(slot: string, operation: string): string {
    return generateSlotCorrelationId(slot, operation);
  }

  private _getLifecycleContext(): Parameters<typeof connectSlotLifecycle>[2] {
    return {
      getSlot: this._getSlot.bind(this),
      generateCorrelationId: this._generateCorrelationId.bind(this),
      log: this._boundLog,
      emit: this._boundEmit,
      transition: this._boundTransition,
      delay: this._delay.bind(this),
      disconnect: this.disconnect.bind(this),
      startTraffic: this._startTraffic.bind(this),
      stopTraffic: this._stopTraffic.bind(this),
      cleanupAfterError: this._cleanupAfterError.bind(this),
      states: {
        EMPTY: SlotState.EMPTY,
        ASSIGNED: SlotState.ASSIGNED,
        CONNECTING: SlotState.CONNECTING,
        CONNECTED: SlotState.CONNECTED,
        DISCONNECTING: SlotState.DISCONNECTING,
        ERROR: SlotState.ERROR,
      },
      events: {
        CONNECT_START: SlotEvent.CONNECT_START,
        CONNECT_COMPLETE: SlotEvent.CONNECT_COMPLETE,
        CONNECT_FAILED: SlotEvent.CONNECT_FAILED,
        DISCONNECT_START: SlotEvent.DISCONNECT_START,
        DISCONNECT_COMPLETE: SlotEvent.DISCONNECT_COMPLETE,
        WEBVIEW_ATTACHED: SlotEvent.WEBVIEW_ATTACHED,
        WEBVIEW_DETACHED: SlotEvent.WEBVIEW_DETACHED,
        WEBVIEW_DOM_READY: SlotEvent.WEBVIEW_DOM_READY,
        TRAFFIC_STARTED: SlotEvent.TRAFFIC_STARTED,
        TRAFFIC_STOPPED: SlotEvent.TRAFFIC_STOPPED,
        URL_CHANGED: SlotEvent.URL_CHANGED,
        URL_EXCLUDED: SlotEvent.URL_EXCLUDED,
        URL_INCLUDED: SlotEvent.URL_INCLUDED,
      },
      config: CONFIG,
    };
  }

  _emit(slot: string, event: string, data: Record<string, unknown> = {}): void {
    emitSlotEvent(this._listeners, this._slots, slot, event, data, SlotEvent.STATE_CHANGED);
  }

  _log(
    slot: string,
    level: string,
    message: string,
    context: { correlationId?: string } = {}
  ): void {
    logSlotEvent(slot, level, message, context);
  }

  async _delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}

const slotController = new SlotControllerClass();
export { slotController as SlotController };
