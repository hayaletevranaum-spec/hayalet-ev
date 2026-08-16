import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { RoomPackageManager } from "../../../electron/room-package-manager.ts";

interface RoomTestArtifact {
  rootDir: string;
  cleanup: () => Promise<void>;
}

async function ensureModulePackage(rootDir: string): Promise<void> {
  await writeFile(join(rootDir, "package.json"), JSON.stringify({ type: "module" }, null, 2), "utf8");
}

async function createRoomTestPackageManager(roomId: string) {
  return await (async (): Promise<{
    cleanup: () => Promise<void>;
    roomPackageManager: RoomPackageManager;
  }> => {
    const tempRoot = await mkdtemp(join(tmpdir(), `room-installed-${roomId}-`));
    const installedRoot = join(tempRoot, "installed-rooms");
    const registryPath = join(tempRoot, "config", "rooms.json");

    return {
      async cleanup(): Promise<void> {
        await rm(dirname(installedRoot), { recursive: true, force: true });
      },
      roomPackageManager: new RoomPackageManager({
        installedRoot,
        registryPath,
        workspaceRoot: resolve("rooms"),
      }),
    };
  })();
}

export async function createRoomBuiltArtifact(roomId: string): Promise<RoomTestArtifact> {
  const { cleanup, roomPackageManager } = await createRoomTestPackageManager(roomId);
  const buildResult = await roomPackageManager.buildWorkspaceRoom(roomId);

  if (buildResult.success !== true || typeof buildResult.path !== "string") {
    await cleanup();
    throw new Error(buildResult.error ?? `Failed to build room ${roomId} for test runtime.`);
  }

  await ensureModulePackage(buildResult.path);

  return {
    cleanup,
    rootDir: buildResult.path,
  };
}

export async function createRoomInstalledCopy(roomId: string): Promise<RoomTestArtifact> {
  const { cleanup, roomPackageManager } = await createRoomTestPackageManager(roomId);
  const installResult = await roomPackageManager.installFromWorkspace(roomId);
  if (installResult.success !== true || installResult.room === undefined) {
    await cleanup();
    throw new Error(installResult.error ?? `Failed to install room ${roomId} for test runtime.`);
  }

  await ensureModulePackage(installResult.room.installedDir);

  return {
    rootDir: installResult.room.installedDir,
    cleanup,
  };
}
