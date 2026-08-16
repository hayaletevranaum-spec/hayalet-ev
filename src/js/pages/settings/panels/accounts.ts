import { AppState } from "../../../modules/app-state.js";
import { AppI18n } from "../../../modules/i18n/index.js";
import { SettingsManager } from "../../../modules/settings-manager.js";
import { AccountPanel } from "../accounts/account-panel.js";
import { applySettingsPanelStaticTranslations } from "../panel-i18n.js";
import { Us1Panel } from "../accounts/us1-panel.js";
import { UserPanel } from "../accounts/user-panel.js";

let initialized = false;

export function setupSettingsAccountsPanel(): void {
  if (initialized) {
    return;
  }

  const root = document.getElementById("settings-panel-accounts");
  if (!(root instanceof HTMLElement)) {
    return;
  }

  const userPanel = new UserPanel(SettingsManager);
  const accountPanel = new AccountPanel(SettingsManager);
  const us1Panel = new Us1Panel(SettingsManager);

  const renderAll = (): void => {
    applySettingsPanelStaticTranslations(root);
    userPanel.render();
    accountPanel.render();
    us1Panel.render();
  };

  applySettingsPanelStaticTranslations(root);
  userPanel.init();
  accountPanel.init();
  us1Panel.init();

  SettingsManager.subscribe(() => {
    renderAll();
  });

  AppI18n.subscribe(() => {
    renderAll();
  });

  AppState.subscribe(() => {
    us1Panel.render();
  });

  renderAll();
  initialized = true;
}
