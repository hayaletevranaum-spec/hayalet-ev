import { isSceneRoomId, SCENE_ROOM_IDS } from "../scene/schema.js";
import { RoomRegistry } from "../modules/rooms/room-registry.js";
import { getRoomPageName } from "../modules/rooms/room-markup.js";
import { navigateToScenePage, openSceneSettingsPanel } from "../scene/navigation.js";
import { isSceneUiMode } from "../ui/ui-mode.js";

export type SceneDebugRoomId = string;
export type SceneEditorRoomId = SceneDebugRoomId;

const SCENE_EDITOR_ROOM_ATTRIBUTE = "data-scene-editor-room";
const SCENE_DEBUG_ROOM_ATTRIBUTE = "data-scene-debug-room";
const SCENE_DEBUG_ROOM_LABEL_KEYS: Record<SceneDebugRoomId, string> = {
  entrance: "sideNav.entranceLabel",
  analyze: "sideNav.analyzeLabel",
  assistant: "sideNav.assistantLabel",
  server: "sideNav.serverLabel",
  rooms: "sideNav.roomsLabel",
  settings: "settingsHub.openButton",
};

export interface SceneDebugRoomDefinition {
  id: SceneDebugRoomId;
  page: string;
  labelKey?: string;
  label?: string;
}

export type SceneEditorRoomDefinition = SceneDebugRoomDefinition;

function getInstalledSceneDebugRooms(): SceneDebugRoomDefinition[] {
  return RoomRegistry.getInstalledRooms()
    .filter((room) => room.scene !== undefined)
    .map((room) => {
      const page = getRoomPageName(room.id);
      return {
        id: page,
        page,
        label: room.name,
      };
    });
}

export function isSceneDebugRoomId(value: string | null | undefined): value is SceneDebugRoomId {
  if (value === null || value === undefined || value.trim() === "") {
    return false;
  }

  return isSceneRoomId(value) || getInstalledSceneDebugRooms().some((room) => room.id === value);
}

export function getActiveSceneDebugRoomId(): SceneDebugRoomId | null {
  if (typeof document === "undefined") {
    return null;
  }

  const value =
    document.documentElement.getAttribute(SCENE_EDITOR_ROOM_ATTRIBUTE) ??
    document.documentElement.getAttribute(SCENE_DEBUG_ROOM_ATTRIBUTE);
  return isSceneDebugRoomId(value) ? value : null;
}

export function setActiveSceneDebugRoomId(roomId: SceneDebugRoomId | null): void {
  if (typeof document === "undefined") {
    return;
  }

  if (roomId === null) {
    document.documentElement.removeAttribute(SCENE_EDITOR_ROOM_ATTRIBUTE);
    document.documentElement.removeAttribute(SCENE_DEBUG_ROOM_ATTRIBUTE);
    return;
  }

  document.documentElement.setAttribute(SCENE_EDITOR_ROOM_ATTRIBUTE, roomId);
  document.documentElement.setAttribute(SCENE_DEBUG_ROOM_ATTRIBUTE, roomId);
}

export const SCENE_DEBUG_ROOMS: readonly SceneDebugRoomDefinition[] = [
  ...SCENE_ROOM_IDS.map((roomId) => ({
    id: roomId,
    page: roomId,
    ...(SCENE_DEBUG_ROOM_LABEL_KEYS[roomId] !== undefined
      ? { labelKey: SCENE_DEBUG_ROOM_LABEL_KEYS[roomId] }
      : {}),
  })),
];

export function getSceneDebugRoomOptions(
  translate: (key: string) => string
): Array<{ id: SceneDebugRoomId; label: string }> {
  return [...SCENE_DEBUG_ROOMS, ...getInstalledSceneDebugRooms()].map((room) => ({
    id: room.id,
    label: room.labelKey !== undefined ? translate(room.labelKey) : (room.label ?? room.id),
  }));
}

export function isSceneDebugRoomActive(roomId: SceneDebugRoomId): boolean {
  if (!isSceneUiMode()) {
    return false;
  }

  const activeRoomId = getActiveSceneDebugRoomId();
  const fallbackRoomId = document.documentElement.getAttribute("data-active-page");
  return (activeRoomId ?? fallbackRoomId) === roomId;
}

export function openSceneDebugRoom(roomId: SceneDebugRoomId): void {
  if (roomId === "settings") {
    openSceneSettingsPanel(null);
    return;
  }

  navigateToScenePage(roomId);
}

export function isSceneEditorRoomId(value: string | null | undefined): value is SceneEditorRoomId {
  return isSceneDebugRoomId(value);
}

export function getActiveSceneEditorRoomId(): SceneEditorRoomId | null {
  return getActiveSceneDebugRoomId();
}

export function setActiveSceneEditorRoomId(roomId: SceneEditorRoomId | null): void {
  setActiveSceneDebugRoomId(roomId);
}

export function getSceneEditorRoomOptions(
  translate: (key: string) => string
): Array<{ id: SceneEditorRoomId; label: string }> {
  return getSceneDebugRoomOptions(translate);
}

export function isSceneEditorRoomActive(roomId: SceneEditorRoomId): boolean {
  return isSceneDebugRoomActive(roomId);
}

export function openSceneEditorRoom(roomId: SceneEditorRoomId): void {
  openSceneDebugRoom(roomId);
}
