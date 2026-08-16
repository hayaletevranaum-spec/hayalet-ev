import type { ForgePersonaPresetId, ForgeRoleId, ForgeSeatId } from "./forge-identities.js";

export interface ForgeAgentRole {
  id: ForgeRoleId;
  label: string;
  description: string;
  defaultSeatId: ForgeSeatId | null;
  localActor: boolean;
}

export interface ForgePersonaPreset {
  id: ForgePersonaPresetId;
  label: string;
  summary: string;
  tone: string;
  focus: string;
  preferredRoleIds: ForgeRoleId[];
}
