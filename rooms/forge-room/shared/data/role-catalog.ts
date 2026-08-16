import type { ForgeAgentRole } from "../types/index.js";

export const FORGE_ROLE_CATALOG: Record<string, ForgeAgentRole> = {
  architect: {
    id: "architect",
    label: "Architect",
    description: "Proposes the primary technical shape for the active task.",
    defaultSeatId: "ai1",
    localActor: false,
  },
  challenger: {
    id: "challenger",
    label: "Challenger",
    description: "Surfaces alternative paths, failure modes, and counterarguments.",
    defaultSeatId: "ai2",
    localActor: false,
  },
  "external-perspective": {
    id: "external-perspective",
    label: "External Perspective",
    description: "Provides outside review when the remote user channel is available.",
    defaultSeatId: "us1",
    localActor: false,
  },
  coordinator: {
    id: "coordinator",
    label: "Coordinator",
    description: "A room-local actor that tracks orchestration status and synthesis readiness.",
    defaultSeatId: null,
    localActor: true,
  },
};
