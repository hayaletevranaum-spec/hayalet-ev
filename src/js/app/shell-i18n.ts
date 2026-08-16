import type { LoadedLanguagePack, TranslationParams } from "@shared/i18n.js";
import { AppI18n } from "../modules/i18n/index.js";

const ROOT_NAMESPACES = new Set(["app", "shell", "entrance", "opencodeUi"]);

let hasBootstrapped = false;

function resolveShellKey(key: string): string {
  const normalized = key.trim();
  if (normalized === "") {
    return "shell";
  }

  const namespace = normalized.split(".", 1)[0] ?? "";
  return ROOT_NAMESPACES.has(namespace) ? normalized : `shell.${normalized}`;
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

    element.setAttribute(targetAttribute, shellT(key));
  });
}

export function applyShellStaticTranslations(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-shell-i18n-text]").forEach((element) => {
    const key = element.getAttribute("data-shell-i18n-text");
    if (key == null || key.trim() === "") {
      return;
    }

    element.textContent = shellT(key);
  });

  applyAttributeTranslation(root, "data-shell-i18n-title", "title");
  applyAttributeTranslation(root, "data-shell-i18n-placeholder", "placeholder");
  applyAttributeTranslation(root, "data-shell-i18n-aria-label", "aria-label");
  applyAttributeTranslation(root, "data-shell-i18n-alt", "alt");
  document.title = AppI18n.t("app.documentTitle");
}

export function bootstrapShellI18n(): void {
  if (hasBootstrapped) {
    applyShellStaticTranslations();
    return;
  }

  AppI18n.subscribe((_pack: LoadedLanguagePack) => {
    applyShellStaticTranslations();
  });
  hasBootstrapped = true;
  applyShellStaticTranslations();
}

export function shellT(key: string, params?: TranslationParams): string {
  return AppI18n.t(resolveShellKey(key), params);
}
