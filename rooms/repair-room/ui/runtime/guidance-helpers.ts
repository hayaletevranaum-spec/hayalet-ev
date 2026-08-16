import type { RepairPanelId } from "../../shared/types/index.js";
import type { RepairGuidanceProjection } from "../../shared/ui/state.js";

export function getGuidanceSurfaceForPanel(
  panelId: RepairPanelId
): RepairGuidanceProjection["panelVisibility"]["primarySurface"] {
  if (panelId === "workbench-stage") return "workbench";
  if (panelId === "tactical-feed") return "tactical-feed";
  if (panelId === "session-wizard") return "session-wizard";
  if (panelId === "knowledge-pack") return "knowledge-pack";
  if (panelId === "visual-timeline") return "visual-timeline";
  return "none";
}

export function getRepairOverlayRefKey(ref: { kind: string; id: string }): string {
  return `${ref.kind}:${ref.id}`;
}
