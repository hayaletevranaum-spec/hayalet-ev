import { AppI18n } from "../../modules/i18n/index.js";

export function roomPageT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.roomPage.${key}`, params);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
