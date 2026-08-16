import type { IpcMainInvokeEvent } from "electron";
import { registerHandler } from "./ipc-helpers.ts";
import { roomToolService } from "../room-tool-service.ts";
import type { RoomToolCallRequest, RoomToolCancelRequest } from "../../src/types/room-tools.ts";

export function setupRoomToolHandlers(): void {
  registerHandler("room-tools-call", async (event: IpcMainInvokeEvent, request: unknown) => {
    return await roomToolService.handleCall(event, request as RoomToolCallRequest);
  });

  registerHandler("room-tools-cancel", (_event: IpcMainInvokeEvent, request: unknown) => {
    return roomToolService.cancel(request as RoomToolCancelRequest);
  });
}
