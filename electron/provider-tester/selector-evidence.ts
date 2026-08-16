import type { ProviderTestResult } from "../../src/types/provider.ts";
import type { AppSettings } from "../../src/types/settings.ts";
import { resolveSelectorLanguage } from "../../shared/i18n/locale.js";

export function resolvePromotionLocaleFromSettings(
  settings: AppSettings | null | undefined
): "tr" | "en" {
  return resolveSelectorLanguage(settings?.general?.language);
}

export function collectPromotableSelectors({
  locale,
  aborted,
  failed,
  warnings,
  results,
}: {
  locale: string;
  aborted: boolean;
  failed: number;
  warnings: number;
  results: ProviderTestResult[];
}): Array<{ group: string; key: string; selector: string }> {
  if (locale !== "tr" && locale !== "en") {
    return [];
  }

  if (aborted || failed > 0 || warnings > 0) {
    return [];
  }

  const promotions = new Map<string, { group: string; key: string; selector: string }>();

  for (const result of results) {
    if (result.status !== "pass") {
      continue;
    }

    const evidence = result.details?.selectorEvidence;
    if (evidence?.promotable !== true) {
      continue;
    }

    promotions.set(`${evidence.group}:${evidence.key}`, {
      group: evidence.group,
      key: evidence.key,
      selector: evidence.selector,
    });
  }

  return Array.from(promotions.values());
}
