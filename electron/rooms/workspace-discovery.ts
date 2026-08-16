import { existsSync } from "fs";
import { readdir } from "fs/promises";
import { join, resolve } from "path";
import type { RoomManifest, RoomWorkspaceEntry } from "@shared/index.js";
import { collectRoomManifestRequiredFilePaths, validateRoomManifest } from "@shared/index.js";
import { readJsonFile } from "./room-install-files.ts";
import { roomSourceSatisfiesRuntimePath } from "./workspace-room-build-support.ts";

export interface RoomWorkspaceRoot {
  root: string;
  sourceKind: "workspace" | "bundle";
  readOnly: boolean;
}

export function buildRoomWorkspaceRoots(
  workspaceRoot: string,
  bundledWorkspaceRoot: string
): RoomWorkspaceRoot[] {
  const dedupedRoots = new Map<string, RoomWorkspaceRoot>();

  dedupedRoots.set(resolve(workspaceRoot), {
    root: workspaceRoot,
    sourceKind: "workspace",
    readOnly: false,
  });

  const bundledKey = resolve(bundledWorkspaceRoot);
  if (!dedupedRoots.has(bundledKey)) {
    dedupedRoots.set(bundledKey, {
      root: bundledWorkspaceRoot,
      sourceKind: "bundle",
      readOnly: true,
    });
  }

  return Array.from(dedupedRoots.values());
}

export async function readWorkspaceRoomsFromRoot(
  rootConfig: RoomWorkspaceRoot
): Promise<RoomWorkspaceEntry[]> {
  if (existsSync(rootConfig.root) !== true) {
    return [];
  }

  const entries = await readdir(rootConfig.root, { withFileTypes: true });
  const rooms = await Promise.all(
    entries.map(async (entry): Promise<RoomWorkspaceEntry | null> => {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        return null;
      }

      const dirPath = join(rootConfig.root, entry.name);
      const manifestPath = join(dirPath, "manifest.json");
      const errors: string[] = [];
      let manifest: RoomManifest | undefined;

      if (!existsSync(manifestPath)) {
        errors.push("manifest.json missing");
      } else {
        try {
          const validation = validateRoomManifest(await readJsonFile<unknown>(manifestPath));
          errors.push(...validation.errors);
          manifest = validation.manifest;

          if (validation.valid && validation.manifest !== undefined) {
            collectRoomManifestRequiredFilePaths(validation.manifest).forEach((requiredPath) => {
              if (!roomSourceSatisfiesRuntimePath(dirPath, requiredPath)) {
                errors.push(`required asset missing: ${requiredPath}`);
              }
            });

            if (
              validation.manifest.i18n !== undefined &&
              !existsSync(join(dirPath, validation.manifest.i18n.baseDir))
            ) {
              errors.push(`i18n.baseDir missing: ${validation.manifest.i18n.baseDir}`);
            }
          }
        } catch (error) {
          errors.push(
            `manifest read failed: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      return {
        dirName: entry.name,
        dirPath,
        valid: errors.length === 0 && manifest !== undefined,
        errors,
        ...(manifest !== undefined ? { manifest } : {}),
        sourceKind: rootConfig.sourceKind,
        readOnly: rootConfig.readOnly,
      };
    })
  );

  return rooms.filter((room): room is RoomWorkspaceEntry => room !== null);
}

export function pickPreferredWorkspaceRoom(
  current: RoomWorkspaceEntry,
  candidate: RoomWorkspaceEntry
): RoomWorkspaceEntry {
  const getPriority = (room: RoomWorkspaceEntry): number => {
    let score = room.valid === true ? 100 : 0;
    score += room.readOnly === true ? 0 : 10;
    score += room.sourceKind === "workspace" ? 1 : 0;
    return score;
  };

  return getPriority(candidate) > getPriority(current) ? candidate : current;
}
