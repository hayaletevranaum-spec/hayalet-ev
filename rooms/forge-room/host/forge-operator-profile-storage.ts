import {
  createDefaultForgeOperatorProfile,
  normalizeForgeLegacyOperatorEquipmentRecords,
  normalizeForgeLegacyOperatorSkillRecords,
  normalizeForgeOperatorEquipmentRecords,
  normalizeForgeOperatorPreferences,
  normalizeForgeOperatorSkillRecords,
  type ForgeOperatorProfile,
} from "../shared/types/index.js";
import { createForgeRoomPaths } from "../shared/host/forge-paths.js";
import { FORGE_OPERATOR_PROFILE_SCHEMA_VERSION } from "../shared/forge-constants.js";
import { asNonEmptyString, nowIso, toRecord } from "./forge-runtime-support.js";

type ForgeOperatorProfileStorageDeps = {
  ensureRuntimeDirectory: (dirPath: string, requestId?: string | null) => Promise<void>;
  readJsonFile: (filePath: string) => Promise<unknown>;
  writeJsonFile: (filePath: string, value: unknown) => Promise<void>;
};

export function normalizeForgeOperatorProfile(
  value: unknown,
  updatedAtFallback = nowIso()
): ForgeOperatorProfile {
  const record = toRecord(value);

  if (Array.isArray(record["skills"]) || Array.isArray(record["equipment"])) {
    return {
      schemaVersion: FORGE_OPERATOR_PROFILE_SCHEMA_VERSION,
      updatedAt: asNonEmptyString(record["updatedAt"]) ?? updatedAtFallback,
      skills: normalizeForgeOperatorSkillRecords(record["skills"]),
      equipment: normalizeForgeOperatorEquipmentRecords(record["equipment"]),
      preferences: normalizeForgeOperatorPreferences(record["preferences"]),
    };
  }

  const skill = toRecord(record["skill"]);
  const tools = toRecord(record["tools"]);

  return {
    schemaVersion: FORGE_OPERATOR_PROFILE_SCHEMA_VERSION,
    updatedAt: asNonEmptyString(record["updatedAt"]) ?? updatedAtFallback,
    skills: normalizeForgeLegacyOperatorSkillRecords(skill),
    equipment: normalizeForgeLegacyOperatorEquipmentRecords(tools),
    preferences: normalizeForgeOperatorPreferences(record["preferences"]),
  };
}

export function createForgeOperatorProfileStorage(deps: ForgeOperatorProfileStorageDeps) {
  const { ensureRuntimeDirectory, readJsonFile, writeJsonFile } = deps;

  async function loadProfile(runtimePaths: unknown): Promise<ForgeOperatorProfile> {
    const roomPaths = createForgeRoomPaths(runtimePaths);
    const loaded = await readJsonFile(roomPaths.operatorProfilePath);
    if (loaded === null || loaded === undefined) {
      return createDefaultForgeOperatorProfile();
    }
    return normalizeForgeOperatorProfile(loaded, nowIso());
  }

  async function saveProfile(runtimePaths: unknown, value: unknown): Promise<ForgeOperatorProfile> {
    const roomPaths = createForgeRoomPaths(runtimePaths);
    await ensureRuntimeDirectory(roomPaths.roomStorageDir);
    const profile = normalizeForgeOperatorProfile(value, nowIso());
    await writeJsonFile(roomPaths.operatorProfilePath, profile);
    return profile;
  }

  return {
    loadProfile,
    saveProfile,
  };
}
