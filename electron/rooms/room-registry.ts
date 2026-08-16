import { existsSync } from "fs";
import { writeFile } from "fs/promises";
import { resolve } from "path";
import type { InstalledRoomRecord, RoomRegistryState } from "@shared/index.js";
import { ROOM_SCHEMA_VERSION, validateRoomManifest } from "@shared/index.js";
import { readJsonFile } from "./room-install-files.ts";
import {
  buildInstalledFeatureRecord,
  optionalCommandSpecs,
  optionalInstalledFeatureScene,
  optionalProtocolSpecs,
  optionalScene,
  resolveInstalledFeatureScene,
  resolveInstalledScene,
} from "./installed-room-record.ts";
import { buildInstalledRoomRecord, optionalI18nBaseDir } from "./installed-room-builder.ts";

export function createEmptyRoomRegistry(): RoomRegistryState {
  return {
    version: ROOM_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    rooms: [],
  };
}

export async function readRoomRegistry(
  registryPath: string,
  ensureRoots: () => Promise<void>
): Promise<RoomRegistryState> {
  await ensureRoots();
  if (existsSync(registryPath) === false) {
    return createEmptyRoomRegistry();
  }

  try {
    const parsed = await readJsonFile<Partial<RoomRegistryState>>(registryPath);
    if (parsed.version !== ROOM_SCHEMA_VERSION || !Array.isArray(parsed.rooms)) {
      return createEmptyRoomRegistry();
    }
    return {
      version: ROOM_SCHEMA_VERSION,
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt.trim() !== ""
          ? parsed.updatedAt
          : new Date().toISOString(),
      rooms: parsed.rooms,
    };
  } catch {
    return createEmptyRoomRegistry();
  }
}

export async function writeRoomRegistry(
  registryPath: string,
  registry: RoomRegistryState,
  ensureRoots: () => Promise<void>
): Promise<void> {
  await ensureRoots();
  const normalized: RoomRegistryState = {
    version: ROOM_SCHEMA_VERSION,
    updatedAt: registry.updatedAt,
    rooms: registry.rooms.map((item) => ({
      ...item,
      sourceDir: resolve(item.sourceDir),
      installedDir: resolve(item.installedDir),
      manifestPath: resolve(item.manifestPath),
      ...(item.iconPath !== undefined ? { iconPath: resolve(item.iconPath) } : {}),
      runtimeEntryPath: resolve(item.runtimeEntryPath),
      hostEntryPath: resolve(item.hostEntryPath),
      features: item.features.map((feature) => ({
        ...buildInstalledFeatureRecord(feature),
        ...optionalInstalledFeatureScene(resolveInstalledFeatureScene(feature.scene)),
      })),
      ...optionalScene(resolveInstalledScene(item.scene)),
      ...optionalI18nBaseDir(
        item.i18nBaseDir !== undefined ? resolve(item.i18nBaseDir) : undefined
      ),
      ...optionalCommandSpecs(item.commandSpecs),
      ...optionalProtocolSpecs(item.protocolSpecs),
    })),
  };
  await writeFile(registryPath, JSON.stringify(normalized, null, 2), "utf-8");
}

export async function hydrateInstalledRoomRecord(
  record: InstalledRoomRecord
): Promise<InstalledRoomRecord | null> {
  if (existsSync(record.manifestPath) === false) {
    return null;
  }

  try {
    const validation = validateRoomManifest(await readJsonFile<unknown>(record.manifestPath));
    if (validation.valid !== true || validation.manifest === undefined) {
      return null;
    }

    return buildInstalledRoomRecord(validation.manifest, {
      sourceDir: resolve(record.sourceDir),
      installedDir: resolve(record.installedDir),
      installedAt: record.installedAt,
      updatedAt: record.updatedAt,
    });
  } catch {
    return null;
  }
}
