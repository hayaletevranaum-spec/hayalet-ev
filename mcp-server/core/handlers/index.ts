import { registerTools, getToolCount, getRegistryStats } from "../registry.js";
import type { ToolContext } from "../registry.js";
import { createMcpTranslatorSync } from "../../utils/i18n/index.js";

import { createElectronTools } from "./electron-handlers.js";
import { createAndroidTools } from "./android-handlers.js";
import { createCdpTools } from "./cdp-handlers.js";
import { createFilesystemTools } from "./filesystem-handlers.js";
import { createDevTools } from "./dev-handlers.js";
import { createMemoryTools } from "./memory-handlers.js";
import { createWebTools } from "./web-handlers.js";
import { createAssistantTools } from "../../tools/assistant-tools.js";

const startupTranslator = createMcpTranslatorSync();

function startupT(key: string, params?: Record<string, string | number | boolean>): string {
  return startupTranslator(`mcpServer.startup.${key}`, params);
}

export function registerAllTools(context: ToolContext): void {
  registerTools(createElectronTools(context), "electron");
  registerTools(createAndroidTools(context), "android");
  registerTools(createCdpTools(), "cdp");
  registerTools(createFilesystemTools(context), "filesystem");
  registerTools(createDevTools(context), "dev");
  registerTools(createMemoryTools(context), "memory");
  registerTools(createWebTools(), "web");
  registerTools(createAssistantTools(context.PROJECT_ROOT), "assistant");

  const stats = getRegistryStats();
  const categories = Object.entries(stats)
    .filter(([k]) => k !== "total")
    .map(([k, v]) => `${k}:${v}`)
    .join(", ");

  process.stderr.write(
    `${startupT("registrySummary", {
      toolCount: getToolCount(),
      categories,
    })}\n`
  );
}

export function getHandlerStats(): Record<string, number> {
  return getRegistryStats();
}
