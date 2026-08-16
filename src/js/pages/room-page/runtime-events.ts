import { RoomHostRuntime } from "../../modules/rooms/room-host-runtime.js";
import { toRoomRuntimeFileUrl } from "../../modules/rooms/room-runtime-url.js";
import type { RoomHostMessage } from "./runtime-context.js";
import {
  describeRoomCommand,
  describeRuntimePayload,
  flushPendingRoomHostMessages,
  markRoomRuntimeReady,
  type RoomIpcMessageEvent,
  type RoomLoadErrorEvent,
  type RoomWebviewElement,
} from "./runtime-messaging.js";

export type RoomRuntimeState = "idle" | "loading" | "ready" | "error";

interface UpdateRoomRuntimeStatusParams {
  lastRuntimeEvent: string;
  page: HTMLElement;
  runtimeState: RoomRuntimeState;
  translate: (key: string) => string;
}

interface BindRoomRuntimeEventsParams {
  closeRoom: () => void;
  getPage: () => HTMLElement | null;
  pendingHostMessages: WeakMap<RoomWebviewElement, RoomHostMessage[]>;
  roomId: string;
  runtimeEntryPath: string;
  sendHostContext: (webview: RoomWebviewElement, reason: string) => void;
  setRuntimeState: (state: RoomRuntimeState, lastEvent: string) => void;
  translate: (key: string) => string;
  updateRuntimeStatus: (page: HTMLElement) => void;
  webview: RoomWebviewElement;
}

type BindRoomRuntimeEventBinderParams = Omit<BindRoomRuntimeEventsParams, "webview">;
type RoomRuntimeBoundWebview = RoomWebviewElement & {
  __roomRuntimeBinding?: {
    dispose: () => void;
    roomId: string;
  };
};

export function updateRoomRuntimeStatus({
  lastRuntimeEvent,
  page,
  runtimeState,
  translate,
}: UpdateRoomRuntimeStatusParams): void {
  const statusEl = page.querySelector<HTMLElement>("[data-room-role='runtime-status']");
  const eventEl = page.querySelector<HTMLElement>("[data-room-role='runtime-event']");
  if (statusEl !== null) {
    statusEl.dataset["state"] = runtimeState;
    statusEl.textContent =
      runtimeState === "error"
        ? translate("status.loadFailed")
        : runtimeState === "ready"
          ? translate("status.ready")
          : runtimeState === "loading"
            ? translate("status.loading")
            : translate("status.preparing");
  }
  if (eventEl !== null) {
    eventEl.textContent = lastRuntimeEvent;
  }
}

export function bindRoomRuntimeEvents({
  closeRoom,
  getPage,
  pendingHostMessages,
  roomId,
  runtimeEntryPath,
  sendHostContext,
  setRuntimeState,
  translate,
  updateRuntimeStatus,
  webview,
}: BindRoomRuntimeEventsParams): void {
  const boundWebview = webview as RoomRuntimeBoundWebview;
  if (boundWebview.__roomRuntimeBinding?.roomId === roomId) {
    return;
  }
  boundWebview.__roomRuntimeBinding?.dispose();

  webview.dataset["roomRuntimeBound"] = "true";

  const syncStatus = (): void => {
    const page = getPage();
    if (page !== null) {
      updateRuntimeStatus(page);
    }
  };

  const handleStartLoading = (): void => {
    markRoomRuntimeReady(webview, false);
    setRuntimeState(
      "loading",
      webview.getAttribute("src") ?? toRoomRuntimeFileUrl(runtimeEntryPath)
    );
    syncStatus();
  };

  const handleDomReady = (): void => {
    markRoomRuntimeReady(webview, true);
    flushPendingRoomHostMessages(pendingHostMessages, webview);
  };

  const handleStopLoading = (): void => {
    setRuntimeState("ready", webview.getAttribute("src") ?? toRoomRuntimeFileUrl(runtimeEntryPath));
    syncStatus();
  };

  const handleFailLoad = (event: Event): void => {
    const loadEvent = event as RoomLoadErrorEvent;
    if (loadEvent.errorCode === -3) {
      return;
    }
    setRuntimeState(
      "error",
      loadEvent.errorDescription ?? `Runtime load error (${String(loadEvent.errorCode ?? 0)})`
    );
    syncStatus();
  };

  const handleIpcMessage = (event: Event): void => {
    const ipcEvent = event as RoomIpcMessageEvent;
    if (ipcEvent.channel === "room-close") {
      closeRoom();
      return;
    }

    if (ipcEvent.channel === "room-ready") {
      const payload = ipcEvent.args?.[0];
      setRuntimeState("ready", describeRuntimePayload(payload, translate("status.runtimeReady")));
      syncStatus();
      sendHostContext(webview, "room-ready");
      void RoomHostRuntime.handleRuntimeMessage(roomId, "room-ready", payload);
    }

    if (ipcEvent.channel === "room-command") {
      const payload = ipcEvent.args?.[0];
      setRuntimeState("ready", describeRoomCommand(payload, translate("status.commandSent")));
      syncStatus();
      void RoomHostRuntime.handleRuntimeMessage(roomId, "room-command", payload);
    }

    if (ipcEvent.channel === "room-event") {
      const payload = ipcEvent.args?.[0];
      setRuntimeState("ready", describeRuntimePayload(payload, translate("status.roomEvent")));
      syncStatus();
      void RoomHostRuntime.handleRuntimeMessage(roomId, "room-event", payload);
    }
  };

  webview.addEventListener("did-start-loading", handleStartLoading);
  webview.addEventListener("dom-ready", handleDomReady);
  webview.addEventListener("did-stop-loading", handleStopLoading);
  webview.addEventListener("did-fail-load", handleFailLoad);
  webview.addEventListener("ipc-message", handleIpcMessage);

  boundWebview.__roomRuntimeBinding = {
    roomId,
    dispose: (): void => {
      webview.removeEventListener("did-start-loading", handleStartLoading);
      webview.removeEventListener("dom-ready", handleDomReady);
      webview.removeEventListener("did-stop-loading", handleStopLoading);
      webview.removeEventListener("did-fail-load", handleFailLoad);
      webview.removeEventListener("ipc-message", handleIpcMessage);
      delete boundWebview.__roomRuntimeBinding;
      delete webview.dataset["roomRuntimeBound"];
    },
  };
}

export function createRoomRuntimeEventBinder(
  options: BindRoomRuntimeEventBinderParams
): (webview: RoomWebviewElement) => void {
  return function bindRuntimeEvents(webview: RoomWebviewElement): void {
    bindRoomRuntimeEvents({
      ...options,
      webview,
    });
  };
}
