export type RepairPanelId =
  | "session-rail"
  | "workbench-stage"
  | "tactical-feed"
  | "session-wizard"
  | "knowledge-pack"
  | "visual-timeline"
  | "operator-profile";

export type RepairMainLayoutPanelId =
  "session-rail" | "workbench-stage" | "tactical-feed" | "knowledge-pack";

export type RepairOperatorProfileTabId = "tools" | "skills" | "preferences" | "controls";

export type RepairSettingsOverlayTabId = "repair-controls" | "bench-operator";

export type RepairOperationalProfile = "novice" | "advanced";

export type RepairAmbientListeningState = "idle" | "listening" | "muted";

export type RepairSpokenGuidanceMode = "silent" | "brief" | "step-by-step";

export type RepairDictationRoute = "local" | "android";

export type RepairTtsRoute = "local" | "android";

export type RepairCameraFeedPreference = "manual" | "android-feed";

export type RepairDictationSubmitMode = "composer" | "send";

export const REPAIR_MAIN_LAYOUT_PANEL_IDS = [
  "session-rail",
  "workbench-stage",
  "tactical-feed",
  "knowledge-pack",
] as const satisfies readonly RepairMainLayoutPanelId[];

export const REPAIR_PANEL_SIZE_LIMITS = {
  minWeight: 0.35,
  maxWeight: 4,
} as const;

export interface RepairVoiceGuidanceState {
  ambientListeningState: RepairAmbientListeningState;
  spokenGuidanceMode: RepairSpokenGuidanceMode;
  handsBusyMode: boolean;
}

export interface RepairInteractionSettingsState {
  androidCompanionEnabled: boolean;
  dictationRoute: RepairDictationRoute;
  ttsRoute: RepairTtsRoute;
  cameraFeedPreference: RepairCameraFeedPreference;
  dictationSubmitMode: RepairDictationSubmitMode;
  autoReadAiReplies: boolean;
}

export interface RepairAttentionBudgetState {
  windowMs: number;
  maxAiInterruptions: number;
}

export interface RepairPanelSizeState {
  mainColumns: Record<RepairMainLayoutPanelId, number>;
}

export interface RepairPanelSizePatch {
  mainColumns?: Partial<Record<RepairMainLayoutPanelId, number>>;
}

export interface RepairLayoutState {
  collapsedPanels: Record<RepairPanelId, boolean>;
  panelSizes: RepairPanelSizeState;
  operationalProfile: RepairOperationalProfile;
  voiceGuidance: RepairVoiceGuidanceState;
  interactionSettings: RepairInteractionSettingsState;
  attentionBudget: RepairAttentionBudgetState;
  operatorProfileTabId: RepairOperatorProfileTabId;
  settingsOverlayOpen: boolean;
  settingsOverlayTabId: RepairSettingsOverlayTabId;
  focusMode: boolean;
  ambientClock: string;
}

function clampRepairPanelSize(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(
    REPAIR_PANEL_SIZE_LIMITS.maxWeight,
    Math.max(REPAIR_PANEL_SIZE_LIMITS.minWeight, numeric)
  );
}

export function createRepairDefaultPanelSizes(): RepairPanelSizeState {
  return {
    mainColumns: {
      "session-rail": 1,
      "workbench-stage": 1.65,
      "tactical-feed": 0.82,
      "knowledge-pack": 0.9,
    },
  };
}

export function normalizeRepairPanelSizes(patch: RepairPanelSizePatch = {}): RepairPanelSizeState {
  const defaults = createRepairDefaultPanelSizes();
  return {
    mainColumns: {
      "session-rail": clampRepairPanelSize(
        patch.mainColumns?.["session-rail"],
        defaults.mainColumns["session-rail"]
      ),
      "workbench-stage": clampRepairPanelSize(
        patch.mainColumns?.["workbench-stage"],
        defaults.mainColumns["workbench-stage"]
      ),
      "tactical-feed": clampRepairPanelSize(
        patch.mainColumns?.["tactical-feed"],
        defaults.mainColumns["tactical-feed"]
      ),
      "knowledge-pack": clampRepairPanelSize(
        patch.mainColumns?.["knowledge-pack"],
        defaults.mainColumns["knowledge-pack"]
      ),
    },
  };
}
