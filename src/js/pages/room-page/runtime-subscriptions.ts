import { bindRoomPresenceSubscriptions } from "../../modules/rooms/room-presence.js";
import { TrafficManager } from "../../modules/traffic-manager.js";

interface BindRoomContextSubscriptionsParams {
  slotSubscriptions: Array<() => void>;
  syncContext: () => void;
  syncSceneCharacters: () => void;
}

export function bindRoomContextSubscriptions({
  slotSubscriptions,
  syncContext,
  syncSceneCharacters,
}: BindRoomContextSubscriptionsParams): void {
  const existingSubscriptionCount = slotSubscriptions.length;
  bindRoomPresenceSubscriptions({
    subscriptions: slotSubscriptions,
    onPresenceChange: () => {
      syncContext();
      syncSceneCharacters();
    },
  });

  if (existingSubscriptionCount > 0) {
    return;
  }

  slotSubscriptions.push(
    TrafficManager.onUpdate(() => {
      syncSceneCharacters();
    })
  );
}

export function clearRoomContextSubscriptions(slotSubscriptions: Array<() => void>): void {
  while (slotSubscriptions.length > 0) {
    const unsubscribe = slotSubscriptions.pop();
    try {
      unsubscribe?.();
    } catch {
      continue;
    }
  }
}
