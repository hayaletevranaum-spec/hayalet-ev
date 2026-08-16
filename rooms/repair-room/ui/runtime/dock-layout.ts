import {
  REPAIR_MAIN_LAYOUT_PANEL_IDS,
  type RepairPanelId,
  type RepairPanelSizeState,
} from "../../shared/types/index.js";

type RepairCollapsedPanels = Partial<Record<RepairPanelId, boolean>>;

function formatRepairLayoutWeight(value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  const normalized = Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
  const rounded = Math.round(normalized * 1000) / 1000;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : String(rounded)}fr`;
}

export function getRepairMainGridTemplateColumns(
  collapsedPanels: RepairCollapsedPanels = {},
  mainColumnSizes: RepairPanelSizeState["mainColumns"]
): string {
  return REPAIR_MAIN_LAYOUT_PANEL_IDS.map((panelId) => {
    if (collapsedPanels[panelId] === true) return "0";
    return formatRepairLayoutWeight(mainColumnSizes[panelId]);
  }).join(" ");
}
