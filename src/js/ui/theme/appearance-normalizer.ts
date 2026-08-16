import {
  DEFAULT_THEME_APPEARANCE_SETTINGS,
  normalizeUiScalePercent,
  type ThemeAppearanceSettings,
  type ThemeId,
  isThemeId,
} from "@shared/settings.js";

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)
  );
}

function isTimeString(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value);
}

export function cloneThemeAppearanceDefaults(): Required<ThemeAppearanceSettings> {
  return { ...DEFAULT_THEME_APPEARANCE_SETTINGS };
}

export function normalizeThemeAppearance(
  raw: unknown,
  legacyTheme?: unknown
): Required<ThemeAppearanceSettings> {
  const defaults = cloneThemeAppearanceDefaults();
  const next = isPlainObject(raw) ? { ...defaults, ...raw } : defaults;

  if (legacyTheme === "system") {
    next.mode = "system";
  } else if (legacyTheme === "light") {
    next.mode = "manual";
    next.manualTheme = "ivory-lab";
    next.lightTheme = "ivory-lab";
  } else if (legacyTheme === "dark") {
    next.mode = "manual";
    next.manualTheme = "obsidian";
    next.darkTheme = "obsidian";
  }

  const mode: unknown = next.mode;
  const manualTheme: unknown = next.manualTheme;
  const lightTheme: unknown = next.lightTheme;
  const darkTheme: unknown = next.darkTheme;
  next.mode = mode === "manual" || mode === "system" || mode === "schedule" ? mode : defaults.mode;
  next.manualTheme =
    typeof manualTheme === "string" && isThemeId(manualTheme) ? manualTheme : defaults.manualTheme;
  next.lightTheme =
    typeof lightTheme === "string" && isThemeId(lightTheme) ? lightTheme : defaults.lightTheme;
  next.darkTheme =
    typeof darkTheme === "string" && isThemeId(darkTheme) ? darkTheme : defaults.darkTheme;
  next.dayStart = isTimeString(next.dayStart) ? next.dayStart : defaults.dayStart;
  next.nightStart = isTimeString(next.nightStart) ? next.nightStart : defaults.nightStart;

  const motion: unknown = next.motion;
  const textScale: unknown = next.textScale;
  const uiScale: unknown = next.uiScale;
  const surface: unknown = next.surface;
  const contrast: unknown = next.contrast;
  next.motion =
    motion === "full" || motion === "reduced" || motion === "off" ? motion : defaults.motion;
  next.textScale =
    textScale === "sm" || textScale === "md" || textScale === "lg" ? textScale : defaults.textScale;
  next.uiScale = normalizeUiScalePercent(uiScale, defaults.uiScale);
  next.surface =
    surface === "glass" || surface === "soft" || surface === "solid" ? surface : defaults.surface;
  next.contrast = contrast === "normal" || contrast === "high" ? contrast : defaults.contrast;

  return next;
}

export function areThemeAppearanceSettingsEqual(
  left: ThemeAppearanceSettings,
  right: ThemeAppearanceSettings
): boolean {
  return (
    left.mode === right.mode &&
    left.manualTheme === right.manualTheme &&
    left.lightTheme === right.lightTheme &&
    left.darkTheme === right.darkTheme &&
    left.dayStart === right.dayStart &&
    left.nightStart === right.nightStart &&
    left.motion === right.motion &&
    left.textScale === right.textScale &&
    left.uiScale === right.uiScale &&
    left.surface === right.surface &&
    left.contrast === right.contrast
  );
}

export function parseThemeTimeToMinutes(value: string): number {
  const parts = value.split(":");
  const hours = Number.parseInt(parts[0] ?? "0", 10);
  const minutes = Number.parseInt(parts[1] ?? "0", 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0;
  }
  return hours * 60 + minutes;
}

export function isThemeDayWindowActive(appearance: Required<ThemeAppearanceSettings>): boolean {
  const dayStart = parseThemeTimeToMinutes(appearance.dayStart);
  const nightStart = parseThemeTimeToMinutes(appearance.nightStart);
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();

  if (dayStart === nightStart) {
    return true;
  }

  if (dayStart < nightStart) {
    return minutes >= dayStart && minutes < nightStart;
  }

  return minutes >= dayStart || minutes < nightStart;
}

export function resolveThemeFromAppearance(
  appearance: Required<ThemeAppearanceSettings>,
  options: { prefersDarkMode?: boolean } = {}
): ThemeId {
  if (appearance.mode === "system") {
    return options.prefersDarkMode === true ? appearance.darkTheme : appearance.lightTheme;
  }

  if (appearance.mode === "schedule") {
    return isThemeDayWindowActive(appearance) ? appearance.lightTheme : appearance.darkTheme;
  }

  return appearance.manualTheme;
}
