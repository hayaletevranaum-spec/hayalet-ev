import type { InstalledRoomRecord } from "@shared/index.js";
import { RoomHostRuntime } from "../../modules/rooms/room-host-runtime.js";
import { toRoomRuntimeFileUrl } from "../../modules/rooms/room-runtime-url.js";
import type { RoomHostMessage } from "./runtime-context.js";
import { ensureRoomRuntimeWebview, syncRoomRuntimeWebviewSource } from "./runtime-host.js";
import { sendRoomRuntimeMessage, type RoomWebviewElement } from "./runtime-messaging.js";
import { createRoomRuntimeEventBinder, type RoomRuntimeState } from "./runtime-events.js";

interface EnsureRoomPageRuntimeHostParams {
  closeRoom: () => void;
  getPage: () => HTMLElement | null;
  getRoomPreloadUrl: () => Promise<string>;
  getRoom: () => InstalledRoomRecord;
  getRuntimeMountHost: (page: HTMLElement) => HTMLElement | null;
  page: HTMLElement;
  pendingHostMessages: WeakMap<RoomWebviewElement, RoomHostMessage[]>;
  runtimeSceneAriaLabel: string;
  sendHostContext: (webview: RoomWebviewElement, reason: string) => void;
  setRuntimeState: (runtimeState: RoomRuntimeState, lastRuntimeEvent: string) => void;
  translate: (key: string, params?: Record<string, string | number>) => string;
  updateRuntimeStatus: (page: HTMLElement) => void;
}

export async function ensureRoomPageRuntimeHost({
  closeRoom,
  getPage,
  getRoomPreloadUrl,
  getRoom,
  getRuntimeMountHost,
  page,
  pendingHostMessages,
  runtimeSceneAriaLabel,
  sendHostContext,
  setRuntimeState,
  translate,
  updateRuntimeStatus,
}: EnsureRoomPageRuntimeHostParams): Promise<void> {
  const room = getRoom();
  const mount = getRuntimeMountHost(page);
  if (mount === null) {
    return;
  }

  const runtimeUrl = toRoomRuntimeFileUrl(room.runtimeEntryPath);
  const preloadUrl = await getRoomPreloadUrl();
  if (page.isConnected === false) {
    return;
  }

  const bindRuntimeEvents = createRoomRuntimeEventBinder({
    closeRoom,
    getPage,
    pendingHostMessages,
    roomId: room.id,
    runtimeEntryPath: room.runtimeEntryPath,
    sendHostContext,
    setRuntimeState,
    translate,
    updateRuntimeStatus,
  });

  const { currentSrc, webview } = ensureRoomRuntimeWebview({
    bindRuntimeEvents,
    mount,
    pendingHostMessages,
    preloadUrl,
    roomId: room.id,
    runtimeSceneAriaLabel,
    runtimeUrl,
  });

  await RoomHostRuntime.ensureRoomHost(room, {
    sendToRoom: (payload) => {
      sendRoomRuntimeMessage(pendingHostMessages, webview, payload);
    },
  });

  if (syncRoomRuntimeWebviewSource({ currentSrc, runtimeUrl, webview })) {
    setRuntimeState("loading", runtimeUrl);
    updateRuntimeStatus(page);
  }

  sendHostContext(webview, "render-sync");
}
