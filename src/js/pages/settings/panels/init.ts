import { setupSettingsAccountsPanel } from "./accounts.js";
import { setupSettingsBackupPanel } from "./backup.js";
import { setupSettingsCapturePanel } from "./capture.js";
import { setupSettingsLanguagesPanel } from "./languages.js";
import { setupSettingsLiveLogPanel } from "./live-log.js";
import { setupSettingsRoomsPanel } from "./rooms.js";
import { setupSettingsThemePanel } from "./theme.js";

export function setupSettingsPanels(): void {
  setupSettingsAccountsPanel();
  setupSettingsBackupPanel();
  setupSettingsCapturePanel();
  setupSettingsLanguagesPanel();
  setupSettingsRoomsPanel();
  setupSettingsLiveLogPanel();
  setupSettingsThemePanel();
}
