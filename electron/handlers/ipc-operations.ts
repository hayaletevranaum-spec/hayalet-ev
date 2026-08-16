import { BrowserWindow } from "electron";
import { registerHandler } from "./ipc-helpers.ts";
import { operationsService } from "../operations-service.ts";
import { OPERATIONS_STATUS_CHANNEL } from "../../src/types/operations.ts";

let broadcastRegistered = false;

function ensureOperationsStatusBroadcast(): void {
  if (broadcastRegistered) {
    return;
  }

  broadcastRegistered = true;
  operationsService.subscribe((status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(OPERATIONS_STATUS_CHANNEL, status);
      }
    }
  });
}

export function setupOperationsHandlers(): void {
  ensureOperationsStatusBroadcast();

  registerHandler("operations-status", () => {
    return operationsService.getStatus();
  });

  registerHandler("operations-acquire", (_event, capability: unknown, owner: unknown) => {
    return operationsService.acquire(capability, owner);
  });

  registerHandler("operations-release", (_event, capability: unknown, owner: unknown) => {
    return operationsService.release(capability, owner);
  });
}
