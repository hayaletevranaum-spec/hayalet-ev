import type { TranslationParams } from "@shared/i18n.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { resolveIntlLocale } from "../../../../shared/i18n/locale.js";

const SETTINGS_PANEL_KEY_PREFIX = "entrance";

function resolveScopedKey(key: string): string {
  const normalized = key.trim();
  if (normalized === "") {
    return SETTINGS_PANEL_KEY_PREFIX;
  }

  return normalized.startsWith(`${SETTINGS_PANEL_KEY_PREFIX}.`)
    ? normalized
    : `${SETTINGS_PANEL_KEY_PREFIX}.${normalized}`;
}

function applyAttributeTranslation(
  root: ParentNode,
  attributeName: string,
  targetAttribute: string
): void {
  root.querySelectorAll<HTMLElement>(`[${attributeName}]`).forEach((element) => {
    const key = element.getAttribute(attributeName);
    if (key == null || key.trim() === "") {
      return;
    }

    element.setAttribute(targetAttribute, t(key));
  });
}

export function applySettingsPanelStaticTranslations(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n-text]").forEach((element) => {
    const key = element.getAttribute("data-i18n-text");
    if (key == null || key.trim() === "") {
      return;
    }

    element.textContent = t(key);
  });

  applyAttributeTranslation(root, "data-i18n-title", "title");
  applyAttributeTranslation(root, "data-i18n-placeholder", "placeholder");
  applyAttributeTranslation(root, "data-i18n-aria-label", "aria-label");
}

export function t(key: string, params?: TranslationParams): string {
  return AppI18n.t(resolveScopedKey(key), params);
}

function getIntlLocale(): string {
  return resolveIntlLocale(AppI18n.getLocale());
}

export function formatTime(value: Date | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat(getIntlLocale(), {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDateTime(value: Date | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat(getIntlLocale(), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
