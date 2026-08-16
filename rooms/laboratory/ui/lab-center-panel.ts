import type { LabWorkspaceSurface } from "../domain/lab-types.js";
import { renderMainStage } from "./laboratory-layout.js";

export function renderLabCenterPanel(surface: LabWorkspaceSurface) {
  return renderMainStage(surface.main);
}
