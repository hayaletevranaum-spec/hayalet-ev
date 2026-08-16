import type { LoadedLanguagePack, TranslationParams } from "@shared/i18n.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { resolveIntlLocale } from "../../../../shared/i18n/locale.js";

const OPENCODE_UI_KEY_PREFIX = "opencodeUi";

let hasBootstrapped = false;

function resolveScopedKey(key: string): string {
  const normalized = key.trim();
  if (normalized === "") {
    return OPENCODE_UI_KEY_PREFIX;
  }
  return normalized.startsWith(`${OPENCODE_UI_KEY_PREFIX}.`)
    ? normalized
    : `${OPENCODE_UI_KEY_PREFIX}.${normalized}`;
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

export function applyStaticTranslations(root: ParentNode = document): void {
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
  applyAttributeTranslation(root, "data-i18n-alt", "alt");

  document.title = t("documentTitle");
}

export async function bootstrapOpencodeUiI18n(): Promise<void> {
  const { SettingsManager: settingsManager } = await import("../../modules/settings-manager.js");
  await settingsManager.load();
  await AppI18n.bootstrap(settingsManager);

  if (hasBootstrapped) {
    applyStaticTranslations();
    return;
  }

  AppI18n.subscribe((_pack: LoadedLanguagePack) => {
    applyStaticTranslations();
  });
  hasBootstrapped = true;
  applyStaticTranslations();
}

export function t(key: string, params?: TranslationParams): string {
  return AppI18n.t(resolveScopedKey(key), params);
}

function normalizeErrorDetail(detail: unknown): string {
  if (typeof detail === "string" && detail.trim() !== "") {
    return detail.trim();
  }

  if (detail instanceof Error && detail.message.trim() !== "") {
    return detail.message.trim();
  }

  return "";
}

export function formatDetailedErrorMessage(
  baseKey: string,
  detail?: unknown,
  params?: TranslationParams
): string {
  const normalizedDetail = normalizeErrorDetail(detail);
  if (normalizedDetail !== "") {
    return t(`${baseKey}WithDetail`, { ...(params ?? {}), message: normalizedDetail });
  }

  return t(baseKey, params);
}

export function getIntlLocale(): string {
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

export function localeCompare(left: string, right: string): number {
  return left.localeCompare(right, getIntlLocale());
}
