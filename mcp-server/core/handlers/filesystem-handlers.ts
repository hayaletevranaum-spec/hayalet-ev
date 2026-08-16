import { createFilesystemMiscTools } from "./filesystem/misc-tools.js";
import { createFilesystemBasicTools } from "./filesystem/basic-tools.js";
import type { ToolEntry, ToolContext } from "../registry.js";

export function createFilesystemTools(context: ToolContext): ToolEntry[] {
  const { PROJECT_ROOT } = context;

  return [...createFilesystemMiscTools(PROJECT_ROOT), ...createFilesystemBasicTools()];
}
