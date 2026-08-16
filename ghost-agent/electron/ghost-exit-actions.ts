export type GhostExitAction = "close" | "return-main";

export interface GhostExitRuntimePatch {
  desiredMode: "terminal" | "soft";
  phase: "idle";
}

export function isGhostExitAction(value: unknown): value is GhostExitAction {
  return value === "close" || value === "return-main";
}

export function shouldStopSystemActiveServersOnGhostExit(action: GhostExitAction): boolean {
  return action === "close";
}

export function buildRuntimePatchForGhostExit(action: GhostExitAction): GhostExitRuntimePatch {
  if (action === "close") {
    return {
      desiredMode: "terminal",
      phase: "idle",
    };
  }

  return {
    desiredMode: "soft",
    phase: "idle",
  };
}
