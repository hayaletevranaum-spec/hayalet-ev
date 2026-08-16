import { LogCategory, LogLevel } from "@shared/logging-core";
import { Logger } from "../logger/index.js";

export type SlotListener = (...args: unknown[]) => void;

export function subscribeToSlotEvents(
  listeners: SlotListener[],
  listener: (payload: unknown) => void
): () => void {
  if (typeof listener === "function") {
    listeners.push(listener);
  }

  return (): void => {
    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  };
}

export function subscribeToSpecificSlotEvent(
  listeners: SlotListener[],
  eventType: string,
  listener: (payload: { event?: string; slot?: string }) => void
): () => void {
  type WrapperFunction = ((payload: unknown) => void) & {
    _original: typeof listener;
    _eventType: string;
  };

  const wrapper = ((payload: unknown): void => {
    if (
      payload !== null &&
      payload !== undefined &&
      typeof payload === "object" &&
      "event" in payload &&
      payload.event === eventType
    ) {
      listener(payload as { event?: string; slot?: string });
    }
  }) as WrapperFunction;

  wrapper._original = listener;
  wrapper._eventType = eventType;
  listeners.push(wrapper);

  return (): void => {
    const index = listeners.indexOf(wrapper);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  };
}

export function emitSlotEvent(
  listeners: SlotListener[],
  slots: Record<string, { state?: string }>,
  slot: string,
  event: string,
  data: Record<string, unknown> = {},
  stateChangedEvent: string
): void {
  const payload = {
    slot,
    event,
    data,
    timestamp: Date.now(),
    state: slots[slot]?.state,
  };

  listeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (error) {
      Logger.warn(LogCategory.SLOT, `[${slot.toUpperCase()}] slot listener failed`, {
        slotId: slot,
        event,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  if (event === stateChangedEvent) {
    window.dispatchEvent(
      new CustomEvent("slot-state-changed", {
        detail: payload,
      })
    );
  }
}

export function logSlotEvent(
  slot: string,
  level: string,
  message: string,
  context: { correlationId?: string } = {}
): void {
  const logContext = {
    ...(context.correlationId !== undefined && context.correlationId !== ""
      ? { correlationId: context.correlationId }
      : {}),
    slotId: slot,
  };
  const category = LogCategory.SLOT;
  const formattedMessage = `[${slot.toUpperCase()}] ${message}`;

  if (level === "error") {
    Logger.panel(category, LogLevel.ERROR, formattedMessage, logContext);
  } else if (level === "warning") {
    Logger.warn(category, formattedMessage, logContext);
  } else if (level === "debug") {
    Logger.debug(category, formattedMessage, logContext);
  } else if (level === "success") {
    Logger.panel(category, LogLevel.SUCCESS, formattedMessage, logContext);
  } else {
    Logger.info(category, formattedMessage, logContext);
  }
}

export function generateSlotCorrelationId(slot: string, operation: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${slot}-${operation}-${timestamp}-${random}`;
}
