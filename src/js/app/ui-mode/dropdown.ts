import { shellT } from "../shell-i18n.js";
import {
  getUiModeOptionDefinitions,
  getUiModeToggleState,
  type UiModeOptionDefinition,
} from "./state.js";

export const UI_MODE_DROPDOWN_SELECTOR = "[data-ui-mode-dropdown]";
export const UI_MODE_TRIGGER_SELECTOR = "[data-ui-mode-trigger]";
export const UI_MODE_OPTION_SELECTOR = "[data-ui-mode-option]";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildUiModeOptionMarkup(option: UiModeOptionDefinition): string {
  const label = escapeHtml(shellT(option.labelKey));

  return `
    <button
      class="theme-dropdown-item ui-mode-option"
      type="button"
      role="menuitem"
      data-ui-mode-option="${option.state}"
    >
      <span class="theme-dropdown-icon">${option.icon}</span>
      <span class="theme-dropdown-copy">
        <strong data-shell-i18n-text="${option.labelKey}">${label}</strong>
      </span>
    </button>
  `.trim();
}

export function buildUiModeOptionsMarkup(): string {
  return getUiModeOptionDefinitions().map(buildUiModeOptionMarkup).join("\n");
}

export function renderUiModeDropdowns(root: ParentNode = document): void {
  root
    .querySelectorAll<HTMLElement>(
      `${UI_MODE_DROPDOWN_SELECTOR} .ui-mode-dropdown-menu[role="menu"]`
    )
    .forEach((menu) => {
      menu.innerHTML = buildUiModeOptionsMarkup();
    });
}

export function syncUiModeDropdownOptions(dropdown: HTMLElement): void {
  const state = getUiModeToggleState();
  dropdown.dataset["uiModeState"] = state;

  const options = Array.from(dropdown.querySelectorAll<HTMLButtonElement>(UI_MODE_OPTION_SELECTOR));
  options.forEach((option) => {
    const optionState = option.dataset["uiModeOption"] ?? "";
    const isActive = optionState === state;
    option.hidden = isActive;
    option.setAttribute("aria-hidden", String(isActive));
  });
}
