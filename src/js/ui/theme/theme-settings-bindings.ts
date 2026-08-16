import { isUiScalePercent, type ThemeAppearanceSettings, type ThemeId } from "@shared/settings.js";

export interface ThemeSettingsBindings {
  isValidTheme(theme: string): theme is ThemeId;
  onSelectTheme(theme: ThemeId): void;
  onUpdateAppearance(patch: Partial<Required<ThemeAppearanceSettings>>): void;
}

export function setupThemeDropdownListeners(bindings: ThemeSettingsBindings): void {
  const dropdown = document.getElementById("theme-dropdown");
  const btn = document.getElementById("theme-dropdown-btn");
  const menu = document.getElementById("theme-dropdown-menu");

  if (!dropdown || !btn || !menu) return;
  if (dropdown.dataset["themeBindingsBound"] === "true") {
    return;
  }

  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    dropdown.classList.toggle("is-expanded");
  });

  document.addEventListener("click", () => {
    dropdown.classList.remove("is-expanded");
  });

  menu.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const item = target.closest<HTMLElement>(".theme-dropdown-item[data-theme]");

    if (item != null) {
      const theme = item.getAttribute("data-theme");
      if (theme != null && theme !== "" && bindings.isValidTheme(theme)) {
        bindings.onSelectTheme(theme);
        dropdown.classList.remove("is-expanded");
      }
    }
  });

  dropdown.dataset["themeBindingsBound"] = "true";
}

export function setupThemeSettingsPanelListeners(bindings: ThemeSettingsBindings): void {
  const panel = document.getElementById("settings-panel-theme");
  if (panel?.dataset["themeBindingsBound"] === "true") {
    return;
  }

  const list = document.getElementById("theme-settings-list");
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

  list?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const item = target.closest<HTMLElement>(".theme-dropdown-item[data-theme]");
    const theme = item?.getAttribute("data-theme");

    if (theme != null && theme !== "" && bindings.isValidTheme(theme)) {
      bindings.onSelectTheme(theme);
    }
  });

  modeSelect?.addEventListener("change", () => {
    const mode = modeSelect.value;
    if (mode === "manual" || mode === "system" || mode === "schedule") {
      bindings.onUpdateAppearance({ mode });
    }
  });

  lightSelect?.addEventListener("change", () => {
    const theme = lightSelect.value;
    if (bindings.isValidTheme(theme)) {
      bindings.onUpdateAppearance({ lightTheme: theme });
    }
  });

  darkSelect?.addEventListener("change", () => {
    const theme = darkSelect.value;
    if (bindings.isValidTheme(theme)) {
      bindings.onUpdateAppearance({ darkTheme: theme });
    }
  });

  dayStartInput?.addEventListener("change", () => {
    bindings.onUpdateAppearance({ dayStart: dayStartInput.value });
  });

  nightStartInput?.addEventListener("change", () => {
    bindings.onUpdateAppearance({ nightStart: nightStartInput.value });
  });

  motionSelect?.addEventListener("change", () => {
    const motion = motionSelect.value;
    if (motion === "full" || motion === "reduced" || motion === "off") {
      bindings.onUpdateAppearance({ motion });
    }
  });

  textScaleSelect?.addEventListener("change", () => {
    const textScale = textScaleSelect.value;
    if (textScale === "sm" || textScale === "md" || textScale === "lg") {
      bindings.onUpdateAppearance({ textScale });
    }
  });

  uiScaleSelect?.addEventListener("change", () => {
    const uiScale = Number.parseInt(uiScaleSelect.value, 10);
    if (isUiScalePercent(uiScale)) {
      bindings.onUpdateAppearance({ uiScale });
    }
  });

  surfaceSelect?.addEventListener("change", () => {
    const surface = surfaceSelect.value;
    if (surface === "glass" || surface === "soft" || surface === "solid") {
      bindings.onUpdateAppearance({ surface });
    }
  });

  contrastToggle?.addEventListener("change", () => {
    bindings.onUpdateAppearance({
      contrast: contrastToggle.checked ? "high" : "normal",
    });
  });

  if (panel != null) {
    panel.dataset["themeBindingsBound"] = "true";
  }
}
