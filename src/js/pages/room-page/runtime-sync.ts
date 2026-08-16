import { RoomHostRuntime } from "../../modules/rooms/room-host-runtime.js";
import type { RoomHostMessage } from "./runtime-context.js";
import { sendRoomRuntimeMessage, type RoomWebviewElement } from "./runtime-messaging.js";

interface SendRoomHostContextParams {
  payload: RoomHostMessage;
  pendingHostMessages: WeakMap<RoomWebviewElement, RoomHostMessage[]>;
  webview: RoomWebviewElement;
}

interface SyncRoomRuntimeContextParams {
  getPage: () => HTMLElement | null;
  payload: RoomHostMessage;
  pendingHostMessages: WeakMap<RoomWebviewElement, RoomHostMessage[]>;
  roomId: string;
}

export function sendRoomHostContext({
  payload,
  pendingHostMessages,
  webview,
}: SendRoomHostContextParams): void {
  sendRoomRuntimeMessage(pendingHostMessages, webview, payload);
}

export async function syncRoomRuntimeContext({
  getPage,
  payload,
  pendingHostMessages,
  roomId,
}: SyncRoomRuntimeContextParams): Promise<void> {
  const webview =
    getPage()?.querySelector<RoomWebviewElement>("webview[data-room-runtime='true']") ?? null;
  if (webview !== null) {
    sendRoomRuntimeMessage(pendingHostMessages, webview, payload);
  }

  await RoomHostRuntime.handleRuntimeMessage(roomId, "room-event", payload);
}
