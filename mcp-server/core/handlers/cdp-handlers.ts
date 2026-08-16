import { createCdpConnectionTools } from "./cdp/connection-tools.js";
import { createCdpInspectionTools } from "./cdp/inspection-tools.js";
import { createCdpWorkflowTools } from "./cdp/workflow-tools.js";
import type { ToolEntry } from "../registry.js";

export function createCdpTools(): ToolEntry[] {
  return [...createCdpConnectionTools(), ...createCdpInspectionTools(), ...createCdpWorkflowTools()];
}
