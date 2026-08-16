import { bootstrapExternalToolPage } from "../shared/bootstrap-external-tool-page.js";
import { resolveExternalPanel } from "../shared/external-page.js";
import { applySettingsPanelStaticTranslations } from "./panel-i18n.js";
import { SettingsPageController, resolveSettingsPanelId } from "./controller.js";
import { setupSettingsPanels } from "./panels/init.js";

async function bootstrapSettingsPage(): Promise<void> {
  await bootstrapExternalToolPage({
    applyStaticTranslations: () => {
      applySettingsPanelStaticTranslations();
    },
    initializeRooms: true,
    initializeTraffic: true,
  });

  setupSettingsPanels();

  const controller = new SettingsPageController();
  controller.init();
  controller.show(resolveSettingsPanelId(resolveExternalPanel()) ?? "accounts");
}

void bootstrapSettingsPage();
