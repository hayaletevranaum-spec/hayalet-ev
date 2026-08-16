import { SettingsManager } from "../../modules/settings-manager.js";
import {
  patchOpencodeUiSharedState,
  readOpencodeUiSharedState,
} from "../../modules/opencode-ui-shared-state.js";
import type { OpencodeUiModelPreferences } from "./types.js";

export const DEFAULT_OPENCODE_UI_MODEL_PREFERENCES: OpencodeUiModelPreferences = {
  hiddenProviders: [],
  hiddenModels: [],
  disabledProviders: [],
  disabledModels: [],
  favoriteModels: [],
  defaultModelKey: null,
  lastSelectedModelKey: null,
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item !== "")
    )
  );
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed !== "" ? trimmed : null;
}

export function normalizeOpencodeUiModelPreferences(raw: unknown): OpencodeUiModelPreferences {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_OPENCODE_UI_MODEL_PREFERENCES };
  }

  const record = raw as Record<string, unknown>;
  return {
    hiddenProviders: normalizeStringArray(record["hiddenProviders"]),
    hiddenModels: normalizeStringArray(record["hiddenModels"]),
    disabledProviders: normalizeStringArray(record["disabledProviders"]),
    disabledModels: normalizeStringArray(record["disabledModels"]),
    favoriteModels: normalizeStringArray(record["favoriteModels"]),
    defaultModelKey: normalizeNullableString(record["defaultModelKey"]),
    lastSelectedModelKey: normalizeNullableString(record["lastSelectedModelKey"]),
  };
}

export async function loadOpencodeUiModelPreferences(): Promise<OpencodeUiModelPreferences> {
  try {
    const sharedState = await readOpencodeUiSharedState();
    const sharedPreferences = normalizeOpencodeUiModelPreferences(sharedState.modelPreferences);
    if (
      sharedPreferences.hiddenProviders.length > 0 ||
      sharedPreferences.hiddenModels.length > 0 ||
      sharedPreferences.disabledProviders.length > 0 ||
      sharedPreferences.disabledModels.length > 0 ||
      sharedPreferences.favoriteModels.length > 0 ||
      sharedPreferences.defaultModelKey !== null ||
      sharedPreferences.lastSelectedModelKey !== null
    ) {
      return sharedPreferences;
    }

    const settings = await SettingsManager.load();
    const legacyPreferences = normalizeOpencodeUiModelPreferences(settings.assistants?.opencodeUi);
    if (
      legacyPreferences.hiddenProviders.length > 0 ||
      legacyPreferences.hiddenModels.length > 0 ||
      legacyPreferences.disabledProviders.length > 0 ||
      legacyPreferences.disabledModels.length > 0 ||
      legacyPreferences.favoriteModels.length > 0 ||
      legacyPreferences.defaultModelKey !== null ||
      legacyPreferences.lastSelectedModelKey !== null
    ) {
      await patchOpencodeUiSharedState((current) => ({
        ...current,
        modelPreferences: legacyPreferences,
      }));
    }

    return legacyPreferences;
  } catch {
    return { ...DEFAULT_OPENCODE_UI_MODEL_PREFERENCES };
  }
}

export async function saveOpencodeUiModelPreferences(
  updater:
    | OpencodeUiModelPreferences
    | ((current: OpencodeUiModelPreferences) => OpencodeUiModelPreferences)
): Promise<OpencodeUiModelPreferences> {
  const fallbackCurrent = { ...DEFAULT_OPENCODE_UI_MODEL_PREFERENCES };
  try {
    const writtenState = await patchOpencodeUiSharedState((current) => {
      const currentPreferences = normalizeOpencodeUiModelPreferences(current.modelPreferences);
      const nextPreferences = normalizeOpencodeUiModelPreferences(
        typeof updater === "function" ? updater(currentPreferences) : updater
      );
      return {
        ...current,
        modelPreferences: nextPreferences,
      };
    });
    return normalizeOpencodeUiModelPreferences(writtenState.modelPreferences);
  } catch {
    return normalizeOpencodeUiModelPreferences(
      typeof updater === "function" ? updater(fallbackCurrent) : updater
    );
  }
}
