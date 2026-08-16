import {
  FORGE_OPERATOR_PREFERENCE_KEYS,
  type ForgeOperatorPreferenceKey,
} from "../types/index.js";

export const FORGE_ACTIVE_OPERATOR_SKILL_KEYS = ["measurement"] as const;
export const FORGE_ACTIVE_OPERATOR_EQUIPMENT_KEYS = ["multimeter"] as const;

const ACTIVE_SKILL_KEYS = new Set<string>(FORGE_ACTIVE_OPERATOR_SKILL_KEYS);
const ACTIVE_EQUIPMENT_KEYS = new Set<string>(FORGE_ACTIVE_OPERATOR_EQUIPMENT_KEYS);
const ACTIVE_PREFERENCE_KEYS = new Set<string>(FORGE_OPERATOR_PREFERENCE_KEYS);

export function filterForgeActiveSkillKeys(skillKeys: readonly string[]): string[] {
  return skillKeys.filter((key) => ACTIVE_SKILL_KEYS.has(key));
}

export function filterForgeActiveEquipmentKeys(equipmentKeys: readonly string[]): string[] {
  return equipmentKeys.filter((key) => ACTIVE_EQUIPMENT_KEYS.has(key));
}

export function filterForgeActivePreferenceKeys(
  preferenceKeys: readonly string[]
): ForgeOperatorPreferenceKey[] {
  return preferenceKeys.filter((key): key is ForgeOperatorPreferenceKey =>
    ACTIVE_PREFERENCE_KEYS.has(key)
  );
}
