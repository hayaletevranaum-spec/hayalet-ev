import { asLabRecord } from "../domain/lab-types.js";
import type { LabRecord } from "../domain/lab-types.js";

export type LabI18n = {
  locale: string;
  t: (key: string, fallback: string, params?: Record<string, string | number>) => string;
};

function getCatalogValue(catalog: LabRecord, key: string): string | null {
  const parts = key.split(".").filter(Boolean);
  let current: unknown = catalog;
  for (const part of parts) {
    const record = asLabRecord(current);
    if (Object.prototype.hasOwnProperty.call(record, part) !== true) {
      return null;
    }
    current = record[part];
  }
  return typeof current === "string" ? current : null;
}

function applyParams(template: string, params: Record<string, string | number> | undefined) {
  if (!params) {
    return template;
  }
  return Object.entries(params).reduce(function (copy, [key, value]) {
    return copy.replaceAll(`{${key}}`, String(value));
  }, template);
}

export const LAB_FALLBACK_I18N: LabI18n = {
  locale: "en",
  t(_key, fallback, params) {
    return applyParams(fallback, params);
  },
};

export function createLabI18n(context: LabRecord): LabI18n {
  const translations = asLabRecord(context["translations"]);
  const locale = typeof context["locale"] === "string" ? context["locale"] : "en";
  return {
    locale,
    t(key, fallback, params) {
      return applyParams(getCatalogValue(translations, key) ?? fallback, params);
    },
  };
}
