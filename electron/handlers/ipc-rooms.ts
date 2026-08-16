import type { BrowserWindow } from "electron";
import { registerHandler } from "./ipc-helpers.ts";
import { getRoomPackageManager } from "../room-package-manager.ts";

export function setupRoomHandlers(_mainWindow: BrowserWindow | null): void {
  registerHandler("rooms-list-workspace", async () => {
    const roomPackageManager = getRoomPackageManager();
    return {
      success: true,
      rooms: await roomPackageManager.listWorkspaceRooms(),
    };
  });

  registerHandler("rooms-list-installed", async () => {
    const roomPackageManager = getRoomPackageManager();
    return {
      success: true,
      rooms: await roomPackageManager.listInstalledRooms(),
    };
  });

  registerHandler("rooms-sync-linked-startup", async () => {
    const roomPackageManager = getRoomPackageManager();
    return await roomPackageManager.syncLinkedWorkspaceRoomsOnStartup();
  });

  registerHandler("rooms-install-from-workspace", async (_event, roomId: string) => {
    const roomPackageManager = getRoomPackageManager();
    return await roomPackageManager.installFromWorkspace(roomId);
  });

  registerHandler(
    "rooms-remove-installed",
    async (_event, payload: string | { roomId?: string; deleteData?: boolean }) => {
      const roomPackageManager = getRoomPackageManager();
      const roomId = typeof payload === "string" ? payload : (payload.roomId ?? "");
      return await roomPackageManager.removeInstalledRoom(roomId, {
        deleteData: typeof payload === "object" && payload.deleteData === true,
      });
    }
  );

  registerHandler(
    "rooms-delete-workspace",
    async (_event, payload: { roomId?: string; deleteData?: boolean } = {}) => {
      const roomPackageManager = getRoomPackageManager();
      return await roomPackageManager.deleteWorkspaceRoom(payload.roomId ?? "", {
        deleteData: payload.deleteData === true,
      });
    }
  );

  registerHandler(
    "rooms-export-to-workspace",
    async (_event, payload: { roomId?: string; overwrite?: boolean } = {}) => {
      const roomPackageManager = getRoomPackageManager();
      return await roomPackageManager.exportInstalledRoomToWorkspace(payload.roomId ?? "", {
        overwrite: payload.overwrite === true,
      });
    }
  );

  registerHandler(
    "rooms-package-from-workspace",
    async (_event, payload: { roomId?: string; outputFile?: string } = {}) => {
      const roomPackageManager = getRoomPackageManager();
      return await roomPackageManager.packageWorkspaceRoom(payload.roomId ?? "", {
        ...(typeof payload.outputFile === "string" && payload.outputFile.trim() !== ""
          ? { outputFile: payload.outputFile.trim() }
          : {}),
      });
    }
  );

  registerHandler(
    "rooms-import-bundle",
    async (_event, payload: { bundleFile?: string; overwriteWorkspace?: boolean } = {}) => {
      const roomPackageManager = getRoomPackageManager();
      return await roomPackageManager.importBundleFile(payload.bundleFile ?? "", {
        overwriteWorkspace: payload.overwriteWorkspace === true,
      });
    }
  );
}
