import type { InstalledRoomFeatureRecord, InstalledRoomRecord } from "@shared/index.js";
import { RoomHostRuntime } from "../../modules/rooms/room-host-runtime.js";
import { buildRoomRuntimeContextPayload, type RoomHostMessage } from "./runtime-context.js";
import { sendRoomHostContext, syncRoomRuntimeContext } from "./runtime-sync.js";
import type { RoomWebviewElement } from "./runtime-messaging.js";

interface CreateRoomPageRuntimeContextRuntimeParams {
  getActiveFeature: () => InstalledRoomFeatureRecord | null;
  getPage: () => HTMLElement | null;
  getRoom: () => InstalledRoomRecord;
  getSceneFeature: () => InstalledRoomFeatureRecord | null;
  isSceneFeatureOpen: () => boolean;
  pendingHostMessages: WeakMap<RoomWebviewElement, RoomHostMessage[]>;
}

interface RoomPageRuntimeContextRuntime {
  buildPayload: (reason: string) => RoomHostMessage;
  sendHostContext: (webview: RoomWebviewElement, reason: string) => void;
  sync: (reason: string) => Promise<void>;
}

export function createRoomPageRuntimeContextRuntime(
  deps: CreateRoomPageRuntimeContextRuntimeParams
): RoomPageRuntimeContextRuntime {
  function buildPayload(reason: string): RoomHostMessage {
    const room = deps.getRoom();

    return buildRoomRuntimeContextPayload({
      activeFeature: deps.getActiveFeature(),
      reason,
      room,
      sceneFeature: deps.getSceneFeature(),
      sceneFeatureOpen: deps.isSceneFeatureOpen(),
    });
  }

  function sendHostContext(webview: RoomWebviewElement, reason: string): void {
    const payload = buildPayload(reason);
    sendRoomHostContext({
      payload,
      pendingHostMessages: deps.pendingHostMessages,
      webview,
    });
    void RoomHostRuntime.handleRuntimeMessage(deps.getRoom().id, "room-event", payload);
  }

  async function sync(reason: string): Promise<void> {
    await syncRoomRuntimeContext({
      getPage: deps.getPage,
      payload: buildPayload(reason),
      pendingHostMessages: deps.pendingHostMessages,
      roomId: deps.getRoom().id,
    });
  }

  return {
    buildPayload,
    sendHostContext,
    sync,
  };
}
