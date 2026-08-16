import { createCoreDevTools } from "./dev/core-tools.js";
import { createRefactorDevTools } from "./dev/refactor-tools.js";
import { createTsLanguageDevTools } from "./dev/ts-language-tools.js";
import type { ToolEntry, ToolContext } from "../registry.js";

export function createDevTools(context: ToolContext): ToolEntry[] {
  const { PROJECT_ROOT } = context;

  return [
    ...createCoreDevTools(PROJECT_ROOT),
    ...createRefactorDevTools(PROJECT_ROOT),
    ...createTsLanguageDevTools(PROJECT_ROOT),
  ];
}
