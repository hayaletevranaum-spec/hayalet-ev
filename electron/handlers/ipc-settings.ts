import { loadSettings, saveSettings } from "../settings-manager.ts";

import { registerHandler } from "./ipc-helpers.ts";

export function setupSettingsHandlers(): void {
  registerHandler("load-settings", async (_event) => {
    return await loadSettings();
  });

  registerHandler("save-settings", async (_event, settings: unknown) => {
    return await saveSettings(settings as Record<string, unknown>);
  });
}
