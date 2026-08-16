import type { RoomHostMessage } from "./runtime-context.js";

export type RoomWebviewElement = HTMLElement & {
  src: string;
  getURL?: () => string;
  send?: (channel: string, ...args: unknown[]) => void;
};

export type RoomIpcMessageEvent = Event & {
  channel?: string;
  args?: unknown[];
};

export type RoomLoadErrorEvent = Event & {
  errorCode?: number;
  errorDescription?: string;
};

export function getPendingRoomHostMessages(
  pendingHostMessages: WeakMap<RoomWebviewElement, RoomHostMessage[]>,
  webview: RoomWebviewElement
): RoomHostMessage[] {
  const existing = pendingHostMessages.get(webview);
  if (existing !== undefined) {
    return existing;
  }

  const next: RoomHostMessage[] = [];
  pendingHostMessages.set(webview, next);
  return next;
}

export function resetPendingRoomHostMessages(
  pendingHostMessages: WeakMap<RoomWebviewElement, RoomHostMessage[]>,
  webview: RoomWebviewElement
): void {
  pendingHostMessages.set(webview, []);
}

export function markRoomRuntimeReady(webview: RoomWebviewElement, ready: boolean): void {
  webview.dataset["roomRuntimeReady"] = ready ? "true" : "false";
}

export function isRoomRuntimeReady(webview: RoomWebviewElement): boolean {
  return webview.dataset["roomRuntimeReady"] === "true";
}

export function sendRoomRuntimeMessage(
  pendingHostMessages: WeakMap<RoomWebviewElement, RoomHostMessage[]>,
  webview: RoomWebviewElement,
  payload: RoomHostMessage
): void {
  if (!isRoomRuntimeReady(webview)) {
    getPendingRoomHostMessages(pendingHostMessages, webview).push(payload);
    return;
  }

  try {
    webview.send?.("room-host-message", payload);
  } catch {
    markRoomRuntimeReady(webview, false);
    getPendingRoomHostMessages(pendingHostMessages, webview).push(payload);
  }
}

export function flushPendingRoomHostMessages(
  pendingHostMessages: WeakMap<RoomWebviewElement, RoomHostMessage[]>,
  webview: RoomWebviewElement
): void {
  if (!isRoomRuntimeReady(webview)) {
    return;
  }

  const queue = getPendingRoomHostMessages(pendingHostMessages, webview);
  if (queue.length === 0) {
    return;
  }

  const pending = queue.splice(0, queue.length);
  for (const payload of pending) {
    try {
      webview.send?.("room-host-message", payload);
    } catch {
      markRoomRuntimeReady(webview, false);
      queue.unshift(payload);
      break;
    }
  }
}

export function describeRoomCommand(payload: unknown, fallback: string): string {
  if (payload !== null && typeof payload === "object") {
    const command = "command" in payload ? payload.command : undefined;
    if (typeof command === "string" && command.trim() !== "") {
      return `++cmd:${command.trim()}`;
    }
  }
  return fallback;
}

export function describeRuntimePayload(payload: unknown, fallback: string): string {
  if (payload === null || payload === undefined) {
    return fallback;
  }

  if (typeof payload === "string" && payload.trim() !== "") {
    return payload.trim();
  }

  if (typeof payload === "object") {
    const stage = "stage" in payload ? payload.stage : undefined;
    const type = "type" in payload ? payload.type : undefined;
    if (typeof stage === "string" && stage.trim() !== "") {
      return stage.trim();
    }
    if (typeof type === "string" && type.trim() !== "") {
      return type.trim();
    }
    try {
      return JSON.stringify(payload);
    } catch {
      return fallback;
    }
  }

  return fallback;
}
