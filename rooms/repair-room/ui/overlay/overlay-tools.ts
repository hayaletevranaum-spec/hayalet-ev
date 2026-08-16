import type { RepairWorkbenchTool } from "../../shared/types/index.js";

export interface RepairOverlayToolDefinition {
  id: RepairWorkbenchTool;
  label: string;
  title: string;
  action: "select" | "view" | "draw" | "event" | "toggle";
}

export const REPAIR_OVERLAY_TOOLS: RepairOverlayToolDefinition[] = [
  { id: "select", label: "Select", title: "Select a board mark", action: "select" },
  { id: "pan", label: "Pan", title: "Move the board view", action: "view" },
  { id: "zoom-in", label: "Zoom in", title: "Zoom in on the board", action: "view" },
  { id: "zoom-out", label: "Zoom out", title: "Zoom out from the board", action: "view" },
  { id: "rect", label: "Box", title: "Draw a box around an area", action: "draw" },
  { id: "freehand", label: "Draw", title: "Draw a freehand board note", action: "draw" },
  { id: "text", label: "Text", title: "Add a text note", action: "draw" },
  { id: "measurement-pin", label: "Probe", title: "Add a measurement point", action: "event" },
  { id: "arrow", label: "Arrow", title: "Point to a board detail", action: "draw" },
  { id: "ruler", label: "Ruler", title: "Measure board distance", action: "view" },
  { id: "freeze-frame", label: "Freeze", title: "Freeze the current frame", action: "toggle" },
  { id: "snapshot", label: "Snapshot", title: "Capture a board snapshot", action: "event" },
];

export function isRepairOverlayDrawTool(tool: RepairWorkbenchTool): boolean {
  return tool === "rect" || tool === "freehand" || tool === "text" || tool === "arrow";
}
