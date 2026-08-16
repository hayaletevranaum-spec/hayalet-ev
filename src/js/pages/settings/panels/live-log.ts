import { setupLiveLogOverlay } from "../live-log/overlay.js";
import { t as settingsPanelT } from "../panel-i18n.js";

let initialized = false;

function formatLogCategory(category: string): string {
  if (category === "") {
    return settingsPanelT("logs.systemCategory");
  }

  return category
    .replace(/^(WEBVIEW|SLOT|TRAFFIC|ASISTAN|OPENCODE|DATABASE)_/, "$1: ")
    .replace(/_/g, " ")
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function setupSettingsLiveLogPanel(): void {
  if (initialized) {
    return;
  }

  setupLiveLogOverlay({
    formatLogCategory,
    escapeHtml,
  });
  initialized = true;
}
