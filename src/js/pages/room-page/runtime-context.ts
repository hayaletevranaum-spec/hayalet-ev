import type { InstalledRoomFeatureRecord, InstalledRoomRecord } from "@shared/index.js";
import { FileManager } from "../../modules/file-manager.js";
import { AppI18n } from "../../modules/i18n/index.js";
import {
  buildRoomAssistantPresenceSnapshot,
  buildRoomSlotPresenceSnapshot,
  buildRoomUserPresenceSnapshot,
  createRoomPresenceSnapshot,
  type RoomPresenceSlotId,
  type RoomPresenceSlotSnapshot,
} from "../../modules/rooms/room-presence.js";
import { getAppUiScale, getSceneUiScale } from "../../ui/theme/ui-scale-state.js";

export type RoomHostMessage = Record<string, unknown>;
type RoomSlotId = RoomPresenceSlotId;

function normalizeRoomAvatarSource(value: string | null | undefined): string | null {
  const normalizedValue = typeof value === "string" ? value.trim() : "";
  if (normalizedValue === "") {
    return null;
  }

  if (
    normalizedValue.startsWith("blob:") ||
    normalizedValue.startsWith("data:") ||
    normalizedValue.startsWith("file://") ||
    normalizedValue.startsWith("http://") ||
    normalizedValue.startsWith("https://") ||
    normalizedValue.startsWith("/")
  ) {
    return normalizedValue;
  }

  const dataDir = FileManager.getPath("data").trim();
  if (dataDir === "") {
    return normalizedValue;
  }

  const normalizedDataDir = dataDir.replace(/[\\/]+$/g, "");
  const appRoot = normalizedDataDir.replace(/[\\/]data$/, "");
  if (appRoot === normalizedDataDir || appRoot.trim() === "") {
    return normalizedValue;
  }

  const separator = normalizedDataDir.includes("\\") ? "\\" : "/";
  const relativePath = normalizedValue.replace(/[\\/]+/g, separator);
  return `${appRoot}${separator}${relativePath}`;
}

export function buildRoomSlotContext(slotId: RoomSlotId): RoomPresenceSlotSnapshot {
  return buildRoomSlotPresenceSnapshot(slotId);
}

export function buildRoomRuntimeContextPayload(options: {
  activeFeature: InstalledRoomFeatureRecord | null;
  reason: string;
  room: InstalledRoomRecord;
  sceneFeature: InstalledRoomFeatureRecord | null;
  sceneFeatureOpen: boolean;
}): RoomHostMessage {
  const { activeFeature, reason, room, sceneFeature, sceneFeatureOpen } = options;
  const user = buildRoomUserPresenceSnapshot();
  const assistant = buildRoomAssistantPresenceSnapshot();
  const slots = {
    ai1: buildRoomSlotContext("ai1"),
    ai2: buildRoomSlotContext("ai2"),
    us1: buildRoomSlotContext("us1"),
  };
  const presence = createRoomPresenceSnapshot(user, slots, {
    ...assistant,
    avatar: normalizeRoomAvatarSource(assistant.avatar),
  });

  return {
    type: "host-context",
    reason,
    locale: AppI18n.getLocale(),
    translations: AppI18n.getNamespaceCatalog(["rooms", room.id]),
    room: {
      id: room.id,
      name: room.name,
      version: room.version,
      runtimeEntryPath: room.runtimeEntryPath,
      hostEntryPath: room.hostEntryPath,
      defaultFeatureId: room.defaultFeatureId,
    },
    presence,
    features: room.features.map((feature) => ({
      id: feature.id,
      name: feature.name,
      description: feature.description ?? "",
    })),
    activeFeature:
      activeFeature === null
        ? null
        : {
            id: activeFeature.id,
            name: activeFeature.name,
            description: activeFeature.description ?? "",
          },
    presentation: {
      mode: sceneFeatureOpen ? "scene-view" : "classic",
      uiScale: sceneFeatureOpen ? getSceneUiScale() : getAppUiScale(),
      sceneEnabled: room.scene !== undefined,
      sceneViewId: sceneFeature?.scene?.view.id ?? null,
    },
  };
}
