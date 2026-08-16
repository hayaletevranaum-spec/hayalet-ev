import { FEATURE_ID, ROOM_ID, getDefaultFeatureRecords } from "../host/feature-meta.js";

export const GAME_ROOM_SLOT_IDS = ["ai1", "ai2", "us1"] as const;
export const GAME_ROOM_PRESENTATION_MODES = ["classic", "scene-view"] as const;

export type GameRoomPresentationMode = (typeof GAME_ROOM_PRESENTATION_MODES)[number];

export interface GameRoomSlotState {
  slotId: string;
  label: string;
  nickname: string;
  avatar: string | null;
  assigned: boolean;
  connected: boolean;
  ready: boolean;
  dispatchable: boolean;
  state: string;
  urlExcluded: boolean;
  providerId: string | null;
  accountId: string | null;
  remoteUserId: string | null;
}

export interface GameRoomFeatureRecord {
  id: string;
  name: string;
  description: string;
}

export interface GameRoomUserState {
  nickname: string;
  avatar: string | null;
}

export interface GameRoomPresenceState {
  user: GameRoomUserState;
  slots: {
    ai1: GameRoomSlotState;
    ai2: GameRoomSlotState;
    us1: GameRoomSlotState;
  };
}

export interface GameRoomContextState {
  room: { id: string; name: string };
  features: GameRoomFeatureRecord[];
  activeFeature: GameRoomFeatureRecord;
  user: GameRoomUserState;
  slots: GameRoomPresenceState["slots"];
  presence: GameRoomPresenceState;
}

export function createGameRoomSlotState(slotId: string): GameRoomSlotState {
  return {
    slotId,
    label: slotId.toUpperCase(),
    nickname: slotId.toUpperCase(),
    avatar: null,
    assigned: false,
    connected: false,
    ready: false,
    dispatchable: false,
    state: "empty",
    urlExcluded: false,
    providerId: null,
    accountId: null,
    remoteUserId: null,
  };
}

export function createGameRoomPresentationState(
  mode: string = "classic",
  uiScale: number | string = 100
): { mode: GameRoomPresentationMode; uiScale: number } {
  const normalizedMode = GAME_ROOM_PRESENTATION_MODES.includes(mode as GameRoomPresentationMode)
    ? (mode as GameRoomPresentationMode)
    : "classic";
  const numericScale =
    typeof uiScale === "number"
      ? uiScale
      : typeof uiScale === "string"
        ? Number.parseInt(uiScale, 10)
        : Number.NaN;
  const normalizedScale =
    Number.isFinite(numericScale) && numericScale > 0 ? Math.round(numericScale) : 100;

  return {
    mode: normalizedMode,
    uiScale: Math.max(70, Math.min(130, normalizedScale)),
  };
}

export function createGameRoomContextState(): GameRoomContextState {
  const featureRecords = getDefaultFeatureRecords();
  const activeFeature = featureRecords[0] || {
    id: FEATURE_ID,
    name: "Tavla",
    description: "",
  };

  const user: GameRoomUserState = {
    nickname: "User",
    avatar: null,
  };
  const slots: GameRoomPresenceState["slots"] = {
    ai1: createGameRoomSlotState("ai1"),
    ai2: createGameRoomSlotState("ai2"),
    us1: createGameRoomSlotState("us1"),
  };

  return {
    room: {
      id: ROOM_ID,
      name: "Game Room",
    },
    features: featureRecords,
    activeFeature,
    user,
    slots,
    presence: {
      user,
      slots: {
        ai1: { ...slots.ai1 },
        ai2: { ...slots.ai2 },
        us1: { ...slots.us1 },
      },
    },
  };
}
