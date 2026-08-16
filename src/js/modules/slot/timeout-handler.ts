import { getErrorMessage } from "@shared/index.js";
import type { TranslationParams } from "@shared/i18n.js";
import { AppI18n } from "../i18n/index.js";

const timeouts: Record<string, ReturnType<typeof setTimeout>> = {};

export function startTimeout(
  slot: string,
  operation: string,
  ms: number,
  callback: () => void
): void {
  const key = `${slot}-${operation}`;
  clearTimeout(slot, operation);
  timeouts[key] = setTimeout(callback, ms);
}

export function clearTimeout(slot: string, operation: string): void {
  const key = `${slot}-${operation}`;
  if (timeouts[key]) {
    globalThis.clearTimeout(timeouts[key]);
    delete timeouts[key];
  }
}

interface SlotState {
  error?: Error | null;
  trafficStarted?: boolean;
  webview?: unknown;
  domReady?: boolean;
}

type LogFn = (
  slot: string,
  level: string,
  message: string,
  context?: Record<string, unknown>
) => void;
type EmitFn = (slot: string, event: string, data: Record<string, unknown>) => void;
type TransitionFn = (slot: string, state: string) => void;
type CleanupFn = (slot: string, correlationId: string) => void;

function slotTimeoutT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.logs.slotTimeout.${key}`, params);
}

export function handleConnectTimeout(
  slotState: SlotState,
  slot: string,
  correlationId: string,
  errorState: string,
  logFn: LogFn,
  emitFn: EmitFn,
  transitionFn: TransitionFn,
  connectFailedEvent: string,
  cleanupFn: CleanupFn
): void {
  logFn(slot, "error", slotTimeoutT("connectionTimeout"), { correlationId });

  slotState.error = new Error(slotTimeoutT("connectionTimeout"));
  emitFn(slot, connectFailedEvent, { correlationId, error: "timeout" });

  cleanupFn(slot, correlationId);
  transitionFn(slot, errorState);
}

export function handleConnectError(
  slotState: SlotState,
  slot: string,
  correlationId: string,
  error: unknown,
  errorState: string,
  logFn: LogFn,
  emitFn: EmitFn,
  transitionFn: TransitionFn,
  connectFailedEvent: string,
  cleanupFn: CleanupFn
): { success: boolean; message: string; correlationId: string } {
  const errorMsg = getErrorMessage(error);
  logFn(slot, "error", slotTimeoutT("connectionFailed", { message: errorMsg }), { correlationId });

  slotState.error = error instanceof Error ? error : new Error(errorMsg);
  emitFn(slot, connectFailedEvent, { correlationId, error: errorMsg });

  cleanupFn(slot, correlationId);
  transitionFn(slot, errorState);

  return { success: false, message: errorMsg, correlationId };
}

export async function cleanupAfterError(
  slotState: SlotState,
  slot: string,
  correlationId: string,
  logFn: LogFn,
  clearUrlChangeHandlerFn: (slot: string) => void,
  clearDomReadyHandlerFn: (slot: string) => void,
  stopTrafficFn: (slot: string, correlationId: string) => Promise<void>,
  detachWebviewFn: (slot: string, correlationId: string) => Promise<void>
): Promise<void> {
  try {
    clearUrlChangeHandlerFn(slot);
    clearDomReadyHandlerFn(slot);

    if (slotState.trafficStarted === true) {
      await stopTrafficFn(slot, correlationId);
    }

    if (slotState.webview !== null && slotState.webview !== undefined) {
      await detachWebviewFn(slot, correlationId);
    }

    slotState.domReady = false;
    slotState.trafficStarted = false;
  } catch (err) {
    logFn(slot, "warning", slotTimeoutT("cleanupWarning", { message: getErrorMessage(err) }), {
      correlationId,
    });
  }
}
