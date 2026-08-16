import type { InstalledRoomRecord } from "@shared/index.js";
import type { RoomHostMessage } from "./runtime-context.js";
import { ensureRoomPageRuntimeHost } from "./runtime-bootstrap.js";
import { type RoomWebviewElement } from "./runtime-messaging.js";
import { type RoomRuntimeState } from "./runtime-events.js";

interface CreateRoomPageRuntimeHostRuntimeParams {
  closeRoom: () => void;
  getPage: () => HTMLElement | null;
  getRoomPreloadUrl: () => Promise<string>;
  getRoom: () => InstalledRoomRecord;
  getRuntimeMountHost: (page: HTMLElement) => HTMLElement | null;
  pendingHostMessages: WeakMap<RoomWebviewElement, RoomHostMessage[]>;
  runtimeSceneAriaLabel: string;
  sendHostContext: (webview: RoomWebviewElement, reason: string) => void;
  setRuntimeState: (runtimeState: RoomRuntimeState, lastRuntimeEvent: string) => void;
  translate: (key: string, params?: Record<string, string | number>) => string;
  updateRuntimeStatus: (page: HTMLElement) => void;
}

interface RoomPageRuntimeHostRuntime {
  ensure: (page?: HTMLElement | null) => Promise<void>;
}

export function createRoomPageRuntimeHostRuntime(
  deps: CreateRoomPageRuntimeHostRuntimeParams
): RoomPageRuntimeHostRuntime {
  async function ensure(page: HTMLElement | null = deps.getPage()): Promise<void> {
    if (page === null) {
      return;
    }

    await ensureRoomPageRuntimeHost({
      closeRoom: deps.closeRoom,
      getPage: deps.getPage,
      getRoomPreloadUrl: deps.getRoomPreloadUrl,
      getRoom: deps.getRoom,
      getRuntimeMountHost: deps.getRuntimeMountHost,
      page,
      pendingHostMessages: deps.pendingHostMessages,
      runtimeSceneAriaLabel: deps.runtimeSceneAriaLabel,
      sendHostContext: deps.sendHostContext,
      setRuntimeState: deps.setRuntimeState,
      translate: deps.translate,
      updateRuntimeStatus: deps.updateRuntimeStatus,
    });
  }

  return {
    ensure: ensure,
  };
}
