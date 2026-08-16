export const FORGE_SEAT_IDS = ["ai1", "ai2", "us1"] as const;
export const FORGE_ARCHITECT_SEAT_IDS = ["ai1", "ai2"] as const;
export const FORGE_ROLE_IDS = [
  "architect",
  "challenger",
  "external-perspective",
  "coordinator",
] as const;
export const FORGE_PERSONA_PRESET_IDS = ["gok", "rovo"] as const;

export type ForgeSeatId = (typeof FORGE_SEAT_IDS)[number];
export type ForgeArchitectSeatId = (typeof FORGE_ARCHITECT_SEAT_IDS)[number];
export type ForgeRoleId = (typeof FORGE_ROLE_IDS)[number];
export type ForgePersonaPresetId = (typeof FORGE_PERSONA_PRESET_IDS)[number];
export type ForgeLocalActorId = "coordinator";
export type ForgeActorId = ForgeSeatId | ForgeLocalActorId | "user";

export interface ForgeSeatRef {
  seatId: ForgeSeatId;
  label: string;
}

export function isForgeSeatId(value: unknown): value is ForgeSeatId {
  return typeof value === "string" && FORGE_SEAT_IDS.includes(value as ForgeSeatId);
}

export function isForgeArchitectSeatId(value: unknown): value is ForgeArchitectSeatId {
  return (
    typeof value === "string" && FORGE_ARCHITECT_SEAT_IDS.includes(value as ForgeArchitectSeatId)
  );
}

export function isForgeRoleId(value: unknown): value is ForgeRoleId {
  return typeof value === "string" && FORGE_ROLE_IDS.includes(value as ForgeRoleId);
}

export function isForgePersonaPresetId(value: unknown): value is ForgePersonaPresetId {
  return (
    typeof value === "string" && FORGE_PERSONA_PRESET_IDS.includes(value as ForgePersonaPresetId)
  );
}
