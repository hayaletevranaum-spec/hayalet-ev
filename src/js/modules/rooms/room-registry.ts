import type {
  InstalledRoomRecord,
  RoomWorkspaceEntry,
  StartupRoomProtocolSnapshot,
  StartupRoomsSnapshot,
} from "@shared/index.js";
import { Logger, LogCategory } from "../logger/index.js";
import { RoomCommandRegistry } from "./room-command-registry.js";
import { RoomProtocolRegistry } from "./room-protocol-registry.js";
import { RoomHostRuntime } from "./room-host-runtime.js";

type RoomRegistryListener = (rooms: InstalledRoomRecord[]) => void;
const LIST_INSTALLED_TIMEOUT_MS = 5000;
const PROTOCOL_SYNC_TIMEOUT_MS = 5000;
const STARTUP_SYNC_TIMEOUT_MS = 15000;

function cloneRooms(rooms: InstalledRoomRecord[]): InstalledRoomRecord[] {
  return rooms.map((room) => ({
    ...room,
    ...(Array.isArray(room.commandSpecs)
      ? { commandSpecs: room.commandSpecs.map((spec) => ({ ...spec })) }
      : {}),
    ...(Array.isArray(room.protocolSpecs)
      ? { protocolSpecs: room.protocolSpecs.map((spec) => ({ ...spec })) }
      : {}),
  }));
}

function filterManagedInstalledRooms(rooms: InstalledRoomRecord[]): InstalledRoomRecord[] {
  return rooms.filter((room) => room.isWorkspaceFallback !== true);
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(label: string, ms: number, task: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  Logger.info(LogCategory.SYSTEM, `[startup] ${label}:start timeoutMs=${ms}`);
  const result = await Promise.race([
    task(),
    delay(ms).then(() => {
      throw new Error(`${label} timed out after ${ms}ms`);
    }),
  ]);
  Logger.info(
    LogCategory.SYSTEM,
    `[startup] ${label}:complete durationMs=${Math.round(performance.now() - startedAt)}`
  );
  return result;
}

class RoomRegistryClass {
  private installedRooms: InstalledRoomRecord[] = [];
  private listeners = new Set<RoomRegistryListener>();

  getInstalledRooms(): InstalledRoomRecord[] {
    return cloneRooms(this.installedRooms);
  }

  subscribe(listener: RoomRegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snapshot = this.getInstalledRooms();
    this.listeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        Logger.warnT(
          LogCategory.SYSTEM,
          "app.logs.roomRegistry.listenerFailed",
          { message: error instanceof Error ? error.message : String(error) },
          {
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    });
  }

  async loadInstalledRooms(
    startupSnapshot: StartupRoomsSnapshot | null = null
  ): Promise<InstalledRoomRecord[]> {
    if (startupSnapshot !== null && Array.isArray(startupSnapshot.rooms)) {
      try {
        Logger.info(
          LogCategory.SYSTEM,
          `[startup] room-registry.startup-snapshot:using count=${startupSnapshot.rooms.length}`
        );
        return await this.applyInstalledRooms(startupSnapshot.rooms, {
          startupProtocols: startupSnapshot.protocols,
        });
      } catch (error) {
        Logger.warnT(
          LogCategory.SYSTEM,
          "app.logs.roomRegistry.refreshFailed",
          { message: error instanceof Error ? error.message : String(error) },
          {
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }
    }

    const rooms = await this.fetchInstalledRooms();
    return await this.applyInstalledRooms(rooms);
  }

  async prepareStartupSnapshot(
    startupSnapshot: StartupRoomsSnapshot | null = null
  ): Promise<StartupRoomsSnapshot | null> {
    const api = window.electronAPI;
    const syncLinked = api?.["roomsSyncLinkedStartup"];
    if (typeof syncLinked !== "function") {
      return startupSnapshot;
    }

    try {
      const result = await withTimeout(
        "room-registry.startup-sync",
        STARTUP_SYNC_TIMEOUT_MS,
        async () =>
          (await syncLinked()) as {
            success: boolean;
            error?: string;
            snapshot?: StartupRoomsSnapshot;
            syncedRoomIds?: string[];
          }
      );
      if (result.success !== true) {
        Logger.warnT(
          LogCategory.SYSTEM,
          "app.logs.roomRegistry.startupSyncFailed",
          { message: result.error ?? "startup room sync failed" },
          {
            error: result.error ?? "startup room sync failed",
            syncedRoomIds: result.syncedRoomIds ?? [],
          }
        );
      }

      return result.snapshot ?? startupSnapshot;
    } catch (error) {
      Logger.warnT(
        LogCategory.SYSTEM,
        "app.logs.roomRegistry.startupSyncFailed",
        { message: error instanceof Error ? error.message : String(error) },
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return startupSnapshot;
    }
  }

  private async fetchInstalledRooms(): Promise<InstalledRoomRecord[]> {
    const api = window.electronAPI;
    const listInstalled = api?.["roomsListInstalled"];
    if (typeof listInstalled !== "function") {
      Logger.warnT(LogCategory.SYSTEM, "app.logs.roomRegistry.installedRoomsUnavailable");
      return [];
    }

    try {
      const result = await withTimeout(
        "room-registry.list-installed",
        LIST_INSTALLED_TIMEOUT_MS,
        async () =>
          (await listInstalled()) as {
            success: boolean;
            rooms: InstalledRoomRecord[];
            error?: string;
          }
      );
      return result.success === true && Array.isArray(result.rooms)
        ? filterManagedInstalledRooms(result.rooms)
        : [];
    } catch (error) {
      Logger.warnT(
        LogCategory.SYSTEM,
        "app.logs.roomRegistry.refreshFailed",
        { message: error instanceof Error ? error.message : String(error) },
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return [];
    }
  }

  async refreshInstalledRooms(): Promise<InstalledRoomRecord[]> {
    this.installedRooms = cloneRooms(await this.fetchInstalledRooms());
    this.emit();
    return this.getInstalledRooms();
  }

  private async applyInstalledRooms(
    rooms: InstalledRoomRecord[],
    options: { startupProtocols?: StartupRoomProtocolSnapshot[] | null } = {}
  ): Promise<InstalledRoomRecord[]> {
    this.installedRooms = cloneRooms(filterManagedInstalledRooms(rooms));

    Logger.info(
      LogCategory.SYSTEM,
      `[startup] room-registry.command-sync:start count=${this.installedRooms.length}`
    );
    RoomCommandRegistry.syncInstalledRooms(this.installedRooms);
    Logger.info(LogCategory.SYSTEM, "[startup] room-registry.command-sync:complete");
    const protocolOptions =
      options.startupProtocols !== undefined ? { startupProtocols: options.startupProtocols } : {};
    await withTimeout("room-registry.protocol-sync", PROTOCOL_SYNC_TIMEOUT_MS, async () => {
      await RoomProtocolRegistry.syncInstalledRooms(this.installedRooms, protocolOptions);
    });
    Logger.info(LogCategory.SYSTEM, "[startup] room-registry.host-sync:start");
    RoomHostRuntime.syncInstalledRooms(this.installedRooms);
    Logger.info(LogCategory.SYSTEM, "[startup] room-registry.host-sync:complete");

    this.emit();
    return this.getInstalledRooms();
  }

  async listWorkspaceRooms(): Promise<RoomWorkspaceEntry[]> {
    const api = window.electronAPI;
    const listWorkspace = api?.["roomsListWorkspace"];
    if (typeof listWorkspace !== "function") {
      return [];
    }

    try {
      const result = await (listWorkspace() as Promise<{
        success: boolean;
        rooms: RoomWorkspaceEntry[];
      }>);
      return result.success === true && Array.isArray(result.rooms) ? result.rooms : [];
    } catch (error) {
      Logger.warnT(
        LogCategory.SYSTEM,
        "app.logs.roomRegistry.workspaceListingFailed",
        { message: error instanceof Error ? error.message : String(error) },
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
      return [];
    }
  }

  async installFromWorkspace(roomId: string): Promise<{
    success: boolean;
    room?: InstalledRoomRecord;
    error?: string;
    restartRequired?: boolean;
  }> {
    const installFromWs = window.electronAPI?.["roomsInstallFromWorkspace"];
    if (typeof installFromWs !== "function") {
      return {
        success: false,
        error: "roomsInstallFromWorkspace missing",
      };
    }

    return await installFromWs(roomId);
  }

  async importBundle(bundleFile: string): Promise<{
    success: boolean;
    room?: InstalledRoomRecord;
    path?: string;
    error?: string;
    restartRequired?: boolean;
  }> {
    const importBundle = window.electronAPI?.["roomsImportBundle"];
    if (typeof importBundle !== "function") {
      return {
        success: false,
        error: "roomsImportBundle missing",
      };
    }

    return await importBundle({
      bundleFile,
      overwriteWorkspace: true,
    });
  }

  async removeInstalled(roomId: string): Promise<{
    success: boolean;
    room?: InstalledRoomRecord;
    error?: string;
    restartRequired?: boolean;
  }> {
    return await this.removeInstalledWithOptions({ roomId });
  }

  async removeInstalledWithOptions(payload: { roomId: string; deleteData?: boolean }): Promise<{
    success: boolean;
    room?: InstalledRoomRecord;
    error?: string;
    restartRequired?: boolean;
  }> {
    const removeInstalled = window.electronAPI?.["roomsRemoveInstalled"];
    if (typeof removeInstalled !== "function") {
      return {
        success: false,
        error: "roomsRemoveInstalled missing",
      };
    }

    return await removeInstalled(payload);
  }

  async deleteWorkspace(payload: { roomId: string; deleteData?: boolean }): Promise<{
    success: boolean;
    path?: string;
    error?: string;
    restartRequired?: boolean;
  }> {
    const deleteWs = window.electronAPI?.["roomsDeleteWorkspace"];
    if (typeof deleteWs !== "function") {
      return {
        success: false,
        error: "roomsDeleteWorkspace missing",
      };
    }

    return await deleteWs(payload);
  }
}

const roomRegistry = new RoomRegistryClass();

export { roomRegistry as RoomRegistry };
