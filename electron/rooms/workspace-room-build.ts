import { stat } from "fs/promises";
import { join } from "path";
import type { RoomWorkspaceEntry } from "@shared/index.js";
import type { RoomPackageErrorTranslator, RoomPackageTranslator } from "./room-package-types.ts";
import { buildWorkspaceRoomOutput } from "./workspace-room-build-support.ts";

export interface BuiltWorkspaceRoomArtifact {
  buildDir: string;
  roomStorageRoot: string;
  sourceDir: string;
  workspaceRoom: RoomWorkspaceEntry;
}

export type BuildWorkspaceRoomArtifactResult =
  | {
      success: true;
      artifact: BuiltWorkspaceRoomArtifact;
    }
  | {
      success: false;
      error: string;
    };

export async function buildWorkspaceRoomArtifact({
  getRoomRuntimeBuildDir,
  getRoomStorageRoot,
  roomId,
  roomPackageError,
  roomPackageT,
  workspaceRooms,
}: {
  getRoomRuntimeBuildDir: (roomId: string) => string;
  getRoomStorageRoot: (roomId: string) => string;
  roomId: string;
  roomPackageError: RoomPackageErrorTranslator;
  roomPackageT: RoomPackageTranslator;
  workspaceRooms: RoomWorkspaceEntry[];
}): Promise<BuildWorkspaceRoomArtifactResult> {
  const normalizedRoomId = roomId.trim();
  if (normalizedRoomId === "") {
    return { success: false, error: await roomPackageT("roomIdRequired") };
  }

  const target = workspaceRooms.find(
    (entry) => entry.dirName === normalizedRoomId || entry.manifest?.id === normalizedRoomId
  );

  if (target === undefined) {
    return {
      success: false,
      error: await roomPackageT("roomNotFoundInWorkspace", { roomId: normalizedRoomId }),
    };
  }

  if (target.valid !== true || target.manifest === undefined) {
    return {
      success: false,
      error: await roomPackageError("workspaceInvalid", target.errors.join("; ")),
    };
  }

  const roomStorageRoot = getRoomStorageRoot(target.manifest.id);
  const buildDir = getRoomRuntimeBuildDir(target.manifest.id);
  await buildWorkspaceRoomOutput(target.dirPath, buildDir);

  const runtimeEntryPath = join(buildDir, target.manifest.runtime.uiEntry);
  const hostEntryPath = join(buildDir, target.manifest.runtime.hostEntry);
  const runtimeStat = await stat(runtimeEntryPath).catch(() => null);
  const hostStat = await stat(hostEntryPath).catch(() => null);

  if (runtimeStat?.isFile() !== true) {
    return {
      success: false,
      error: await roomPackageT("installedRuntimeEntryMissing", {
        path: runtimeEntryPath,
      }),
    };
  }

  if (hostStat?.isFile() !== true) {
    return {
      success: false,
      error: await roomPackageT("installedHostEntryMissing", { path: hostEntryPath }),
    };
  }

  return {
    success: true,
    artifact: {
      buildDir,
      roomStorageRoot,
      sourceDir: target.dirPath,
      workspaceRoom: target,
    },
  };
}
