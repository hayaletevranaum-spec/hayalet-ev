export type OpencodeUiInteractionMode = "off" | "plan-harder-local" | "change-approval";

export interface OpencodeUiQuickPromptRecord {
  id: string;
  name: string;
  content: string;
  createdAt: number;
}

export interface OpencodeUiModelPreferencesState {
  hiddenProviders: string[];
  hiddenModels: string[];
  disabledProviders: string[];
  disabledModels: string[];
  favoriteModels: string[];
  defaultModelKey: string | null;
  lastSelectedModelKey: string | null;
}

export interface OpencodeUiModelSettingsOverlayState {
  favoritesOnly: boolean;
  showHidden: boolean;
}

export interface OpencodeUiCharacterProfileState {
  id: string;
  name: string;
  description: string;
  selectedFeatureIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface OpencodeUiCharacterProfilesState {
  activeProfileId: string | null;
  profiles: OpencodeUiCharacterProfileState[];
}

export interface OpencodeUiSharedState {
  version: 1;
  lastSessionId: string | null;
  lastAgentId: string | null;
  lastReasoningEffort: string | null;
  interactionMode: OpencodeUiInteractionMode;
  modelPreferences: OpencodeUiModelPreferencesState;
  quickPrompts: OpencodeUiQuickPromptRecord[];
  modelSettingsOverlay: OpencodeUiModelSettingsOverlayState;
  characterProfiles: OpencodeUiCharacterProfilesState;
}

export const DEFAULT_OPENCODE_UI_MODEL_PREFERENCES_STATE: OpencodeUiModelPreferencesState = {
  hiddenProviders: [],
  hiddenModels: [],
  disabledProviders: [],
  disabledModels: [],
  favoriteModels: [],
  defaultModelKey: null,
  lastSelectedModelKey: null,
};

export const DEFAULT_OPENCODE_UI_SHARED_STATE: OpencodeUiSharedState = {
  version: 1,
  lastSessionId: null,
  lastAgentId: null,
  lastReasoningEffort: null,
  interactionMode: "off",
  modelPreferences: { ...DEFAULT_OPENCODE_UI_MODEL_PREFERENCES_STATE },
  quickPrompts: [],
  modelSettingsOverlay: {
    favoritesOnly: false,
    showHidden: false,
  },
  characterProfiles: {
    activeProfileId: null,
    profiles: [],
  },
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

function normalizeInteractionMode(value: unknown): OpencodeUiInteractionMode {
  return value === "plan-harder-local" || value === "change-approval" ? value : "off";
}

export function normalizeOpencodeUiQuickPromptRecord(
  value: unknown
): OpencodeUiQuickPromptRecord | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record["id"] === "string" ? record["id"].trim() : "";
  const name = typeof record["name"] === "string" ? record["name"].trim() : "";
  const content = typeof record["content"] === "string" ? record["content"] : "";
  const createdAt = typeof record["createdAt"] === "number" ? record["createdAt"] : 0;

  if (id === "" || name === "" || content.trim() === "" || !Number.isFinite(createdAt)) {
    return null;
  }

  return {
    id,
    name,
    content,
    createdAt,
  };
}

export function normalizeOpencodeUiQuickPromptRecords(
  value: unknown
): OpencodeUiQuickPromptRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeOpencodeUiQuickPromptRecord(item))
    .filter((item): item is OpencodeUiQuickPromptRecord => item !== null)
    .sort((left, right) => right.createdAt - left.createdAt);
}

export function normalizeOpencodeUiModelPreferencesState(
  value: unknown
): OpencodeUiModelPreferencesState {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_OPENCODE_UI_MODEL_PREFERENCES_STATE };
  }

  const record = value as Record<string, unknown>;
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

function normalizeModelSettingsOverlayState(value: unknown): OpencodeUiModelSettingsOverlayState {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_OPENCODE_UI_SHARED_STATE.modelSettingsOverlay };
  }

  const record = value as Record<string, unknown>;
  return {
    favoritesOnly: record["favoritesOnly"] === true,
    showHidden: record["showHidden"] === true,
  };
}

function normalizeCharacterProfileState(value: unknown): OpencodeUiCharacterProfileState | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record["id"] === "string" ? record["id"].trim() : "";
  const name = typeof record["name"] === "string" ? record["name"].trim() : "";
  const description = typeof record["description"] === "string" ? record["description"] : "";
  const createdAt = typeof record["createdAt"] === "number" ? record["createdAt"] : Date.now();
  const updatedAt = typeof record["updatedAt"] === "number" ? record["updatedAt"] : createdAt;

  if (id === "" || name === "" || !Number.isFinite(createdAt) || !Number.isFinite(updatedAt)) {
    return null;
  }

  return {
    id,
    name,
    description,
    selectedFeatureIds: normalizeStringArray(record["selectedFeatureIds"]),
    createdAt,
    updatedAt,
  };
}

function normalizeCharacterProfilesState(value: unknown): OpencodeUiCharacterProfilesState {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_OPENCODE_UI_SHARED_STATE.characterProfiles, profiles: [] };
  }

  const record = value as Record<string, unknown>;
  const profilesRaw = Array.isArray(record["profiles"]) ? record["profiles"] : [];
  const profiles = profilesRaw
    .map((item) => normalizeCharacterProfileState(item))
    .filter((item): item is OpencodeUiCharacterProfileState => item !== null)
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const activeProfileId = normalizeNullableString(record["activeProfileId"]);

  return {
    activeProfileId:
      activeProfileId !== null && profiles.some((item) => item.id === activeProfileId)
        ? activeProfileId
        : null,
    profiles,
  };
}

export function normalizeOpencodeUiSharedState(value: unknown): OpencodeUiSharedState {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return {
      ...DEFAULT_OPENCODE_UI_SHARED_STATE,
      modelPreferences: { ...DEFAULT_OPENCODE_UI_SHARED_STATE.modelPreferences },
      quickPrompts: [],
      modelSettingsOverlay: { ...DEFAULT_OPENCODE_UI_SHARED_STATE.modelSettingsOverlay },
      characterProfiles: { ...DEFAULT_OPENCODE_UI_SHARED_STATE.characterProfiles, profiles: [] },
    };
  }

  const record = value as Record<string, unknown>;
  return {
    version: 1,
    lastSessionId: normalizeNullableString(record["lastSessionId"]),
    lastAgentId: normalizeNullableString(record["lastAgentId"]),
    lastReasoningEffort: normalizeNullableString(record["lastReasoningEffort"]),
    interactionMode: normalizeInteractionMode(record["interactionMode"]),
    modelPreferences: normalizeOpencodeUiModelPreferencesState(record["modelPreferences"]),
    quickPrompts: normalizeOpencodeUiQuickPromptRecords(record["quickPrompts"]),
    modelSettingsOverlay: normalizeModelSettingsOverlayState(record["modelSettingsOverlay"]),
    characterProfiles: normalizeCharacterProfilesState(record["characterProfiles"]),
  };
}
