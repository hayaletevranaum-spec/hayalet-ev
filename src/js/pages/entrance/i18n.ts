import type { TranslationParams } from "@shared/i18n.js";
import { AppI18n } from "../../modules/i18n/index.js";

const ENTRANCE_KEY_PREFIX = "entrance";

function resolveScopedKey(key: string): string {
  const normalized = key.trim();
  if (normalized === "") {
    return ENTRANCE_KEY_PREFIX;
  }

  return normalized.startsWith(`${ENTRANCE_KEY_PREFIX}.`)
    ? normalized
    : `${ENTRANCE_KEY_PREFIX}.${normalized}`;
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

export function applyEntranceStaticTranslations(root: ParentNode = document): void {
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
