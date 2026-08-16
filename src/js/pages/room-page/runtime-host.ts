import type { RoomHostMessage } from "./runtime-context.js";
import {
  markRoomRuntimeReady,
  resetPendingRoomHostMessages,
  type RoomWebviewElement,
} from "./runtime-messaging.js";

interface ResolveRoomPreloadUrlParams {
  electronApi: typeof window.electronAPI | undefined;
  existingPromise: Promise<string> | null;
}

interface EnsureRoomRuntimeWebviewParams {
  bindRuntimeEvents: (webview: RoomWebviewElement) => void;
  mount: HTMLElement;
  pendingHostMessages: WeakMap<RoomWebviewElement, RoomHostMessage[]>;
  preloadUrl: string;
  roomId: string;
  runtimeSceneAriaLabel: string;
  runtimeUrl: string;
}

interface SyncRoomRuntimeWebviewSourceParams {
  currentSrc: string;
  runtimeUrl: string;
  webview: RoomWebviewElement;
}

export async function resolveRoomPreloadUrl({
  electronApi,
  existingPromise,
}: ResolveRoomPreloadUrlParams): Promise<string> {
  if (existingPromise !== null) {
    return await existingPromise;
  }

  if (electronApi === undefined || typeof electronApi.getPreloadPath !== "function") {
    return await Promise.resolve("");
  }

  return await electronApi.getPreloadPath("room").catch(() => "");
}

export function ensureRoomRuntimeWebview({
  bindRuntimeEvents,
  mount,
  pendingHostMessages,
  preloadUrl,
  roomId,
  runtimeSceneAriaLabel,
  runtimeUrl,
}: EnsureRoomRuntimeWebviewParams): { currentSrc: string; webview: RoomWebviewElement } {
  let webview = mount.querySelector<RoomWebviewElement>("webview[data-room-runtime='true']");
  if (webview === null) {
    webview = document.createElement("webview");
    webview.className = "room-runtime-webview";
    webview.id = `room-webview-${roomId}`;
    webview.setAttribute("data-room-runtime", "true");
    webview.setAttribute("allowpopups", "false");
    webview.setAttribute("partition", `persist:room-${roomId}`);
    if (preloadUrl !== "") {
      webview.setAttribute("preload", preloadUrl);
    }
  }

  bindRuntimeEvents(webview);

  if (webview.parentElement !== mount) {
    mount.replaceChildren(webview);
  }

  const currentSrc = webview.getAttribute("src") ?? "";
  if (currentSrc !== runtimeUrl) {
    markRoomRuntimeReady(webview, false);
    resetPendingRoomHostMessages(pendingHostMessages, webview);
  }

  webview.setAttribute("aria-label", runtimeSceneAriaLabel);
  return { currentSrc, webview };
}

export function syncRoomRuntimeWebviewSource({
  currentSrc,
  runtimeUrl,
  webview,
}: SyncRoomRuntimeWebviewSourceParams): boolean {
  if (currentSrc === runtimeUrl) {
    return false;
  }

  webview.setAttribute("src", runtimeUrl);
  webview.src = runtimeUrl;
  return true;
}
