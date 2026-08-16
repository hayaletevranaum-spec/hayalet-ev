import type { ForgePersonaPreset } from "../types/index.js";

export const FORGE_PERSONA_PRESETS: Record<string, ForgePersonaPreset> = {
  gok: {
    id: "gok",
    label: "Gok",
    summary: "UI and experience-biased perspective for visual clarity and interaction quality.",
    tone: "visual, human-centered, detail-aware",
    focus: "experience, interface, presentation, friction",
    preferredRoleIds: ["architect", "challenger"],
  },
  rovo: {
    id: "rovo",
    label: "Rovo",
    summary: "Practical reality-check perspective for execution risk and operational fit.",
    tone: "pragmatic, grounded, delivery-oriented",
    focus: "constraints, integration risk, validation, practical tradeoffs",
    preferredRoleIds: ["challenger", "external-perspective"],
  },
};
