import { AppState } from "../../../modules/app-state.js";

export type SceneAiTargetSlot = "ai1" | "ai2";

export interface SceneAiConnectResolution {
  slot: SceneAiTargetSlot | null;
  mode: "assigned" | "available" | "unavailable";
}

export interface SceneUs1ConnectResolution {
  slot: "us1";
  selectedAccountId: string | null;
  selectedRemoteUserId: string | null;
}

function normalizeAccountId(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveSceneAiConnectSlot(
  accountId: string | null | undefined
): SceneAiConnectResolution {
  const normalizedAccountId = normalizeAccountId(accountId);
  if (normalizedAccountId === "") {
    return {
      slot: null,
      mode: "unavailable",
    };
  }

  const ai1AccountId = normalizeAccountId(AppState.getEntityPresence("ai1").accountId);
  if (ai1AccountId === normalizedAccountId) {
    return {
      slot: "ai1",
      mode: "assigned",
    };
  }

  const ai2AccountId = normalizeAccountId(AppState.getEntityPresence("ai2").accountId);
  if (ai2AccountId === normalizedAccountId) {
    return {
      slot: "ai2",
      mode: "assigned",
    };
  }

  if (ai1AccountId === "") {
    return {
      slot: "ai1",
      mode: "available",
    };
  }

  if (ai2AccountId === "") {
    return {
      slot: "ai2",
      mode: "available",
    };
  }

  return {
    slot: null,
    mode: "unavailable",
  };
}
