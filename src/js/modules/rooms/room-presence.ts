import { AppState } from "../app-state.js";
import { SlotController, SlotEvent } from "../slot-controller.js";
import type { SlotPresenceSnapshot, SlotPresenceUserSnapshot } from "../slot-presence-store.js";

export const ROOM_PRESENCE_SLOT_IDS = ["ai1", "ai2", "us1"] as const;

export type RoomPresenceSlotId = (typeof ROOM_PRESENCE_SLOT_IDS)[number];
export type RoomPresenceUserSnapshot = SlotPresenceUserSnapshot;
export type RoomPresenceSnapshot = SlotPresenceSnapshot;
export type RoomPresenceSlotSnapshot = RoomPresenceSnapshot["slots"][RoomPresenceSlotId];

interface BindRoomPresenceSubscriptionsParams {
  subscriptions: Array<() => void>;
  onPresenceChange: () => void;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readAvatar(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function buildRoomUserPresenceSnapshot(): RoomPresenceUserSnapshot {
  return {
    participantId: "user",
    label: "USER",
    nickname: AppState.getNickname("user"),
    avatar: readAvatar(AppState.getAvatar("user")),
  };
}

export function buildRoomAssistantPresenceSnapshot(): RoomPresenceSnapshot["assistant"] {
  const assistant = AppState.getEntityPresence("ai0");
  return {
    ...assistant,
    participantId: "ai0",
    slotId: "ai0",
    avatar: readAvatar(AppState.getAvatar("ai0")),
  };
}

export function buildRoomSlotPresenceSnapshot(
  slotId: RoomPresenceSlotId
): RoomPresenceSlotSnapshot {
  const presence = AppState.getEntityPresence(slotId);

  if (slotId === "us1") {
    const identity = AppState.getUs1Identity();
    return {
      ...presence,
      participantId: "us1",
      slotId: "us1",
      avatar: readAvatar(AppState.getAvatar(slotId)),
      accountId: AppState.getUs1ArchiveAccountId(),
      remoteUserId: identity?.remoteUserId ?? null,
    };
  }

  return {
    ...presence,
    participantId: slotId,
    slotId,
    avatar: readAvatar(AppState.getAvatar(slotId)),
  };
}

export function createRoomPresenceSnapshot(
  user: RoomPresenceUserSnapshot,
  slots: Record<RoomPresenceSlotId, RoomPresenceSlotSnapshot>,
  assistant: RoomPresenceSnapshot["assistant"] = buildRoomAssistantPresenceSnapshot(),
  updatedAt: number = Date.now()
): RoomPresenceSnapshot {
  return {
    schemaVersion: 1,
    updatedAt,
    user: cloneValue(user),
    assistant: cloneValue(assistant),
    slots: cloneValue(slots),
  };
}

export function buildRoomPresenceSnapshot(): RoomPresenceSnapshot {
  const user = buildRoomUserPresenceSnapshot();
  const assistant = buildRoomAssistantPresenceSnapshot();
  const slots = {
    ai1: buildRoomSlotPresenceSnapshot("ai1"),
    ai2: buildRoomSlotPresenceSnapshot("ai2"),
    us1: buildRoomSlotPresenceSnapshot("us1"),
  };

  return createRoomPresenceSnapshot(user, slots, assistant);
}

export function bindRoomPresenceSubscriptions({
  subscriptions,
  onPresenceChange,
}: BindRoomPresenceSubscriptionsParams): void {
  if (subscriptions.length > 0) {
    return;
  }

  subscriptions.push(AppState.subscribe(onPresenceChange));
  subscriptions.push(SlotController.on(SlotEvent.DISCONNECT_COMPLETE, onPresenceChange));
}
