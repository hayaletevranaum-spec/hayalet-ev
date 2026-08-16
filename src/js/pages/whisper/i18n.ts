import type { TranslationParams } from "@shared/i18n.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { resolveIntlLocale } from "../../../../shared/i18n/locale.js";

const WHISPER_KEY_PREFIX = "whisper";
const WHISPER_SCENE_PREFIX = "entrance.whisper";

function resolveScopedKey(key: string): string {
  const normalized = key.trim();
  if (normalized === "") {
    return WHISPER_SCENE_PREFIX;
  }

  if (normalized.startsWith("panels.")) {
    return normalized;
  }

  if (normalized.startsWith(`${WHISPER_SCENE_PREFIX}.`)) {
    return normalized;
  }

  return normalized.startsWith(`${WHISPER_KEY_PREFIX}.`)
    ? `entrance.${normalized}`
    : normalized.includes(".")
      ? normalized
      : `${WHISPER_SCENE_PREFIX}.${normalized}`;
}

export function t(key: string, params?: TranslationParams): string {
  return AppI18n.t(resolveScopedKey(key), params);
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

export function applyWhisperStaticTranslations(root: ParentNode = document): void {
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

function getIntlLocale(): string {
  return resolveIntlLocale(AppI18n.getLocale());
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
