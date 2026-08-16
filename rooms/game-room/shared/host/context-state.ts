import {
  FEATURE_ID,
  getDefaultFeatureRecords,
  normalizeFeatureId,
  sanitizeFeatureRecord,
} from "./feature-meta.js";
import { normalizeLocale } from "./text.js";
import {
  createGameRoomContextState,
  createGameRoomSlotState,
  type GameRoomContextState,
  type GameRoomFeatureRecord,
  type GameRoomSlotState,
} from "../types/room-shell-contracts.js";

type GenericRecord = Record<string, unknown>;
export type GameRoomContextSnapshot = GameRoomContextState & {
  presentation: Record<string, unknown>;
};

function isRecord(value: unknown): value is GenericRecord {
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

export function createSlotState(slotId: string): GameRoomSlotState {
  return createGameRoomSlotState(slotId);
}

export function normalizeSlot(candidate: unknown, slotId: string): GameRoomSlotState {
  const source = isRecord(candidate) ? candidate : {};
  const nickname =
    typeof source["nickname"] === "string" && source["nickname"].trim() !== ""
      ? source["nickname"].trim()
      : slotId.toUpperCase();
  const assigned = source["assigned"] === true;
  const connected = source["connected"] === true;
  const urlExcluded = source["urlExcluded"] === true;
  const ready = source["ready"] === true || (assigned && connected && urlExcluded !== true);
  const dispatchable = source["dispatchable"] === true || ready;

  return {
    slotId,
    label:
      typeof source["label"] === "string" && source["label"].trim() !== ""
        ? source["label"].trim()
        : slotId.toUpperCase(),
    nickname,
    avatar:
      typeof source["avatar"] === "string" && source["avatar"].trim() !== ""
        ? source["avatar"].trim()
        : null,
    assigned,
    connected,
    ready,
    dispatchable,
    state:
      typeof source["state"] === "string" && source["state"].trim() !== ""
        ? source["state"].trim()
        : "empty",
    urlExcluded,
    providerId:
      typeof source["providerId"] === "string" && source["providerId"].trim() !== ""
        ? source["providerId"].trim()
        : null,
    accountId:
      typeof source["accountId"] === "string" && source["accountId"].trim() !== ""
        ? source["accountId"].trim()
        : null,
    remoteUserId:
      typeof source["remoteUserId"] === "string" && source["remoteUserId"].trim() !== ""
        ? source["remoteUserId"].trim()
        : null,
  };
}

export function sanitizeContext(payload: unknown): GameRoomContextSnapshot {
  const source = isRecord(payload) ? payload : {};
  const fallbackContext = createGameRoomContextState();
  const presenceSource = isRecord(source["presence"]) ? source["presence"] : {};
  const slotsSource = isRecord(presenceSource["slots"])
    ? presenceSource["slots"]
    : isRecord(source["slots"])
      ? source["slots"]
      : {};
  const userSource = isRecord(presenceSource["user"])
    ? presenceSource["user"]
    : isRecord(source["user"])
      ? source["user"]
      : {};
  const defaultFeatures = getDefaultFeatureRecords();
  const featureMap = new Map<string, GameRoomFeatureRecord>(
    defaultFeatures.map((feature): [string, GameRoomFeatureRecord] => [feature.id, feature])
  );
  if (Array.isArray(source["features"])) {
    source["features"].forEach((feature) => {
      const normalized = sanitizeFeatureRecord(feature, FEATURE_ID);
      featureMap.set(normalized.id, normalized);
    });
  }
  const features = Array.from(featureMap.values());
  const roomSource = isRecord(source["room"]) ? source["room"] : {};
  const activeFeature = sanitizeFeatureRecord(
    source["activeFeature"],
    normalizeFeatureId(
      typeof roomSource["defaultFeatureId"] === "string"
        ? roomSource["defaultFeatureId"]
        : FEATURE_ID
    )
  );
  const user = {
    nickname:
      typeof userSource["nickname"] === "string" && userSource["nickname"].trim() !== ""
        ? userSource["nickname"].trim()
        : fallbackContext.user.nickname,
    avatar:
      typeof userSource["avatar"] === "string" && userSource["avatar"].trim() !== ""
        ? userSource["avatar"].trim()
        : fallbackContext.user.avatar,
  };
  const slots = {
    ai1: normalizeSlot(slotsSource["ai1"], "ai1"),
    ai2: normalizeSlot(slotsSource["ai2"], "ai2"),
    us1: normalizeSlot(slotsSource["us1"], "us1"),
  };

  return {
    room: isRecord(source["room"])
      ? (source["room"] as { id: string; name: string })
      : fallbackContext.room,
    presentation: isRecord(source["presentation"]) ? source["presentation"] : { mode: "classic" },
    user,
    features,
    activeFeature: features.find((feature) => feature.id === activeFeature.id) || activeFeature,
    slots,
    presence: {
      user: { ...user },
      slots: {
        ai1: { ...slots.ai1 },
        ai2: { ...slots.ai2 },
        us1: { ...slots.us1 },
      },
    },
  };
}

export function readLocale(api: {
  getLocale?: () => unknown;
  getState: (key: string) => unknown;
}): "tr" | "en" {
  return normalizeLocale(
    typeof api["getLocale"] === "function" ? api["getLocale"]() : api.getState("locale")
  );
}

export function getActiveFeatureId(
  context: { activeFeature?: { id?: unknown } } | null | undefined
): string {
  return normalizeFeatureId(context?.activeFeature?.id);
}

export function loadContext(api: { getState: (key: string) => unknown }): GameRoomContextSnapshot {
  return sanitizeContext(api.getState("backgammon-context"));
}

export function saveContext(
  api: { setState: (key: string, value: unknown) => unknown },
  payload: unknown
): GameRoomContextSnapshot {
  const context = sanitizeContext(payload);
  api.setState("backgammon-context", context);
  return context;
}
