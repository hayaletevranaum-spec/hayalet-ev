import { AppState } from "../../modules/app-state.js";
import { TrafficManager } from "../../modules/traffic-manager.js";
import type { SceneCharacterSlot } from "../schema.js";

export type { SceneCharacterSlot } from "../schema.js";
export type SceneCharacterState = "inactive" | "connected" | "thinking" | "loading";

export function getSceneCharacterState(slot: SceneCharacterSlot | null): SceneCharacterState {
  if (slot === null) {
    return "inactive";
  }

  const trafficState = TrafficManager.state[slot];

  if (trafficState?.status.thinking === "busy") {
    return "thinking";
  }

  if (trafficState?.status.loading === "busy") {
    return "loading";
  }

  if (slot === "us1") {
    return AppState.isUs1Connected() ? "connected" : "inactive";
  }

  return AppState.isConnected(slot) ? "connected" : "inactive";
}
