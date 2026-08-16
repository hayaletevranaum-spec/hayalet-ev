import { listAvailableLanguages, loadAvailableLanguage } from "../i18n/language-service.ts";
import { registerHandler } from "./ipc-helpers.ts";

export function setupI18nHandlers(): void {
  registerHandler("i18n-list-languages", async () => {
    return await listAvailableLanguages();
  });

  registerHandler("i18n-load-language", async (_event, locale: unknown) => {
    return await loadAvailableLanguage(locale);
  });
}
