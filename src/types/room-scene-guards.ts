export const ROOM_SCENE_CHARACTER_KINDS = ["ai", "assistant", "us1", "user"] as const;
export const ROOM_SCENE_CHARACTER_SLOTS = ["ai0", "ai1", "ai2", "us1"] as const;
export const ROOM_SCENE_CHARACTER_ROSTER_PRESETS = [
  "all-characters",
  "connected-plus-user",
  "assistant-only",
  "user-only",
] as const;
export const ROOM_SCENE_WINDOW_CONTROLS_VISIBILITIES = [
  "scene-only",
  "all-pages",
  "hidden",
] as const;
export const ROOM_SCENE_VIEW_BACK_BUTTON_VARIANTS = [
  "scene-back-layer",
  "standard-button",
] as const;
export const ROOM_SCENE_PAGE_SHELL_VARIANTS = ["standard", "immersive-stage"] as const;

export type RoomSceneCharacterKind = (typeof ROOM_SCENE_CHARACTER_KINDS)[number];
export type RoomSceneCharacterSlot = (typeof ROOM_SCENE_CHARACTER_SLOTS)[number];
export type RoomSceneCharacterRosterPreset = (typeof ROOM_SCENE_CHARACTER_ROSTER_PRESETS)[number];
export type RoomSceneWindowControlsVisibility =
  (typeof ROOM_SCENE_WINDOW_CONTROLS_VISIBILITIES)[number];
export type RoomSceneViewBackButtonVariant = (typeof ROOM_SCENE_VIEW_BACK_BUTTON_VARIANTS)[number];
export type RoomScenePageShellVariant = (typeof ROOM_SCENE_PAGE_SHELL_VARIANTS)[number];

export function isRoomSceneCharacterKind(value: string): value is RoomSceneCharacterKind {
  return ROOM_SCENE_CHARACTER_KINDS.includes(value as RoomSceneCharacterKind);
}

export function isRoomSceneCharacterSlot(value: string): value is RoomSceneCharacterSlot {
  return ROOM_SCENE_CHARACTER_SLOTS.includes(value as RoomSceneCharacterSlot);
}

export function isRoomSceneCharacterRosterPreset(
  value: string
): value is RoomSceneCharacterRosterPreset {
  return ROOM_SCENE_CHARACTER_ROSTER_PRESETS.includes(value as RoomSceneCharacterRosterPreset);
}

export function isRoomSceneWindowControlsVisibility(
  value: string
): value is RoomSceneWindowControlsVisibility {
  return ROOM_SCENE_WINDOW_CONTROLS_VISIBILITIES.includes(
    value as RoomSceneWindowControlsVisibility
  );
}

export function isRoomSceneViewBackButtonVariant(
  value: string
): value is RoomSceneViewBackButtonVariant {
  return ROOM_SCENE_VIEW_BACK_BUTTON_VARIANTS.includes(value as RoomSceneViewBackButtonVariant);
}

export function isRoomScenePageShellVariant(value: string): value is RoomScenePageShellVariant {
  return ROOM_SCENE_PAGE_SHELL_VARIANTS.includes(value as RoomScenePageShellVariant);
}
