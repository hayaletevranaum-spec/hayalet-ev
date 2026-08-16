import type { ThemeAppearanceMode, ThemeAppearanceSettings, ThemeId } from "@shared/settings.js";

import type { ThemeInfo } from "./theme-contract.js";

export interface ThemeSettingsUiOptions {
  themeOrder: readonly ThemeId[];
  themes: Record<ThemeId, ThemeInfo>;
  getThemeName(theme: ThemeId): string;
  getThemeDescription(theme: ThemeId): string;
  getModeLabel(mode: ThemeAppearanceMode): string;
  getModeHint(mode: ThemeAppearanceMode): string;
}

function renderThemeOption(theme: ThemeId, options: ThemeSettingsUiOptions): HTMLButtonElement {
  const item = document.createElement("button");
  item.className = "theme-dropdown-item settings-theme-option";
  item.type = "button";
  item.dataset["theme"] = theme;

  const icon = document.createElement("span");
  icon.className = "theme-dropdown-icon";
  icon.textContent = options.themes[theme].icon;

  const copy = document.createElement("span");
  copy.className = "theme-dropdown-copy";

  const title = document.createElement("strong");
  title.textContent = options.getThemeName(theme);

  const description = document.createElement("small");
  description.textContent = options.getThemeDescription(theme);

  copy.append(title, description);
  item.append(icon, copy);
  return item;
}

function renderThemeSelectOptions(
  select: HTMLSelectElement,
  options: ThemeSettingsUiOptions
): void {
  const previousValue = select.value;
  const fragment = document.createDocumentFragment();

  options.themeOrder.forEach((theme) => {
    const option = document.createElement("option");
    option.value = theme;
    option.textContent = options.getThemeName(theme);
    fragment.append(option);
  });

  select.replaceChildren(fragment);
  if (previousValue !== "") {
    select.value = previousValue;
  }
}

export function renderThemeSettingsPanel(options: ThemeSettingsUiOptions): void {
  const list = document.getElementById("theme-settings-list");
  if (list != null) {
    list.replaceChildren(...options.themeOrder.map((theme) => renderThemeOption(theme, options)));
  }

  const lightSelect = document.getElementById("theme-light-select") as HTMLSelectElement | null;
  if (lightSelect != null) {
    renderThemeSelectOptions(lightSelect, options);
  }

  const darkSelect = document.getElementById("theme-dark-select") as HTMLSelectElement | null;
  if (darkSelect != null) {
    renderThemeSelectOptions(darkSelect, options);
  }
}

export function updateThemePanelUI(
  _theme: ThemeId,
  appearance: Required<ThemeAppearanceSettings>,
  options: ThemeSettingsUiOptions
): void {
  const modeHint = document.getElementById("theme-mode-hint");
  const modeSelect = document.getElementById("theme-behavior-select") as HTMLSelectElement | null;
  const lightSelect = document.getElementById("theme-light-select") as HTMLSelectElement | null;
  const darkSelect = document.getElementById("theme-dark-select") as HTMLSelectElement | null;
  const dayStartInput = document.getElementById("theme-day-start") as HTMLInputElement | null;
  const nightStartInput = document.getElementById("theme-night-start") as HTMLInputElement | null;
  const motionSelect = document.getElementById("theme-motion-select") as HTMLSelectElement | null;
  const textScaleSelect = document.getElementById(
    "theme-text-scale-select"
  ) as HTMLSelectElement | null;
  const uiScaleSelect = document.getElementById(
    "theme-ui-scale-select"
  ) as HTMLSelectElement | null;
  const surfaceSelect = document.getElementById("theme-surface-select") as HTMLSelectElement | null;
  const contrastToggle = document.getElementById(
    "theme-contrast-toggle"
  ) as HTMLInputElement | null;
  const scheduleFields = document.querySelectorAll<HTMLElement>("[data-theme-schedule-field]");

  if (modeHint) modeHint.textContent = options.getModeHint(appearance.mode);

  if (modeSelect) modeSelect.value = appearance.mode;
  if (lightSelect) lightSelect.value = appearance.lightTheme;
  if (darkSelect) darkSelect.value = appearance.darkTheme;
  if (dayStartInput) dayStartInput.value = appearance.dayStart;
  if (nightStartInput) nightStartInput.value = appearance.nightStart;
  if (motionSelect) motionSelect.value = appearance.motion;
  if (textScaleSelect) textScaleSelect.value = appearance.textScale;
  if (uiScaleSelect) uiScaleSelect.value = String(appearance.uiScale);
  if (surfaceSelect) surfaceSelect.value = appearance.surface;
  if (contrastToggle) contrastToggle.checked = appearance.contrast === "high";

  scheduleFields.forEach((field) => {
    const hidden = appearance.mode !== "schedule";
    field.hidden = hidden;
    field.setAttribute("aria-hidden", String(hidden));
  });
}

export function updateThemeDropdownUI(
  theme: ThemeId,
  appearance: Required<ThemeAppearanceSettings>,
  options: ThemeSettingsUiOptions
): void {
  const menuItems = document.querySelectorAll<HTMLElement>(".theme-dropdown-item[data-theme]");
  menuItems.forEach((item) => {
    const itemTheme = item.getAttribute("data-theme");
    const active = itemTheme === theme;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-pressed", String(active));
  });

  updateThemePanelUI(theme, appearance, options);
}
