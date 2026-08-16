import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { initPaths, Paths } from "../../electron/paths.ts";
import { RoomPackageManager } from "../../electron/room-package-manager.ts";

async function listLegacyRoomIds(): Promise<string[]> {
  const legacyRoot = Paths.getInstalledRoomsDir();
  if (existsSync(legacyRoot) !== true) {
    return [];
  }

  const entries = await readdir(legacyRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function main(): Promise<void> {
  initPaths(join(process.cwd(), "electron"));

  const manager = new RoomPackageManager();
  const workspaceRooms = await manager.listWorkspaceRooms();
  const legacyRoomIds = await listLegacyRoomIds();

  const rooms = workspaceRooms.map((room) => {
    const roomId = room.manifest?.id ?? room.dirName;
    return {
      id: roomId,
      sourceDir: room.dirPath,
      runtimeBuildDir: Paths.getRoomRuntimeBuildDir(roomId),
      dataDir: Paths.getRoomStorageDir(roomId),
      legacyDataRoomsDir: Paths.getInstalledRoomDir(roomId),
      legacyDataRoomsExists: existsSync(Paths.getInstalledRoomDir(roomId)),
      staleStorageBuildDir: join(Paths.getRoomStorageDir(roomId), "build"),
      staleStorageBuildExists: existsSync(join(Paths.getRoomStorageDir(roomId), "build")),
      valid: room.valid,
      errors: room.errors,
    };
  });

  console.info(
    JSON.stringify(
      {
        roots: {
          sourceRoot: Paths.getRoomsWorkspaceDir(),
          runtimeBuildRoot: Paths.getGeneratedRoomsDir(),
          dataRoot: Paths.getDataDir(),
          legacyDataRoomsRoot: Paths.getInstalledRoomsDir(),
          registryPath: Paths.getRoomsRegistryPath(),
        },
        legacyRoomIds,
        rooms,
      },
      null,
      2
    )
  );
}

await main();
