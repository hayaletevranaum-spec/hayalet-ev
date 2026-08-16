import { resolveSelectorCandidates } from "../../../../../../shared/provider-selector-resolution";
import { resolveSelectorLanguage } from "../../../../../../shared/i18n/locale.js";
import { SettingsManager } from "../../../settings-manager.js";

import type { SelectorLanguage } from "../../../../../types/i18n.js";

type RuntimeProviderConfig = {
  selectors?: Record<string, unknown>;
  selectorMatrix?: {
    selectors?: Record<string, unknown>;
  };
  fileInputSelectors?: unknown;
  uploadTargetSelectors?: unknown;
};

type RuntimeWebviewLike = {
  executeJavaScript?: (script: string) => Promise<unknown>;
};

function getCurrentSelectorLanguage(): SelectorLanguage {
  const settings = SettingsManager.getSnapshot() as { general?: { language?: unknown } } | null;
  return resolveSelectorLanguage(settings?.general?.language);
}

export async function getRuntimeProviderConfig(
  webview: RuntimeWebviewLike
): Promise<RuntimeProviderConfig | null> {
  const configJson = await webview.executeJavaScript?.(`(function() {
    const config = window.__app_provider_config;
    if (config === null || config === undefined || typeof config !== "object") {
      return null;
    }

    try {
      return JSON.stringify({
        selectors: config.selectors,
        selectorMatrix: config.selectorMatrix,
        fileInputSelectors: config.fileInputSelectors,
        uploadTargetSelectors: config.uploadTargetSelectors,
      });
    } catch {
      return null;
    }
  })();`);

  if (typeof configJson !== "string" || configJson.trim() === "") {
    return null;
  }

  try {
    const config: unknown = JSON.parse(configJson);
    return config !== null && config !== undefined && typeof config === "object" ? config : null;
  } catch {
    return null;
  }
}

export function getRuntimeSelectorCandidates(
  config: RuntimeProviderConfig | null,
  key: string
): string[] {
  const entry = config?.selectorMatrix?.selectors?.[key] ?? config?.selectors?.[key];
  return resolveSelectorCandidates(
    entry as string | string[] | Record<string, unknown>,
    getCurrentSelectorLanguage()
  );
}

export function getRuntimeConfigCandidates(entry: unknown): string[] {
  return resolveSelectorCandidates(
    entry as string | string[] | Record<string, unknown>,
    getCurrentSelectorLanguage()
  );
}
