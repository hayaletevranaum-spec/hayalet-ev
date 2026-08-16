import type { TranslationParams } from "../../src/types/i18n.ts";
import { createElectronTranslator } from "../i18n/language-service.ts";

const translatorCache = new Map<
  string,
  Promise<{
    t: (key: string, params?: TranslationParams) => string;
  }>
>();

async function getProviderTesterTranslator(locale: unknown): Promise<{
  t: (key: string, params?: TranslationParams) => string;
}> {
  const cacheKey = typeof locale === "string" ? locale : "__default__";
  let translatorPromise = translatorCache.get(cacheKey);

  if (translatorPromise === undefined) {
    translatorPromise = createElectronTranslator(locale).then(({ t }) => ({ t }));
    translatorCache.set(cacheKey, translatorPromise);
  }

  return await translatorPromise;
}

export async function providerTesterT(
  locale: unknown,
  key: string,
  params?: TranslationParams
): Promise<string> {
  const translator = await getProviderTesterTranslator(locale);
  return translator.t(`providerTest.runtime.${key}`, params);
}
