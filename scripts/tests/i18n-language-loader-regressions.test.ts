import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { getBuiltInLanguageDescriptor, getBuiltInLanguagePack } from "../../shared/i18n/bundled-languages.ts";
import { normalizeAppLanguage } from "../../shared/i18n/locale.ts";
import { listInstalledLanguages, loadInstalledLanguage } from "../../shared/i18n/node-loader.ts";
import { normalizeSettings } from "../../src/js/modules/settings/settings-schema.ts";
import type { TranslationCatalog } from "../../src/types/i18n.ts";

function getCatalogString(
  catalog: TranslationCatalog | null | undefined,
  path: string[]
): string | undefined {
  let current: string | TranslationCatalog | undefined = catalog ?? undefined;

  for (const segment of path) {
    if (current === undefined || typeof current === "string") {
      return undefined;
    }
    current = current[segment];
  }

  return typeof current === "string" ? current : undefined;
}

void test("language loader includes built-ins and external manifests", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "app-i18n-"));
  const germanDir = join(rootDir, "de");

  mkdirSync(germanDir, { recursive: true });
  writeFileSync(
    join(germanDir, "manifest.json"),
    JSON.stringify({
      locale: "de",
      nativeName: "Deutsch",
      englishName: "German",
      selectorLanguage: "en",
    })
  );
  writeFileSync(
    join(germanDir, "index.json"),
    JSON.stringify({
      entrance: {
        user: {
          language: {
            label: "Sprache",
          },
        },
      },
    })
  );

  const languages = await listInstalledLanguages(rootDir);

  assert.ok(languages.some((language) => language.locale === "tr"));
  assert.ok(languages.some((language) => language.locale === "en"));
  assert.ok(languages.some((language) => language.locale === "de"));
});

void test("built-in language packs resolve through folder-backed manifests and catalogs", () => {
  const descriptor = getBuiltInLanguageDescriptor("tr");
  const pack = getBuiltInLanguagePack("en");

  assert.equal(descriptor?.locale, "tr");
  assert.equal(descriptor.source, "builtin");
  assert.equal(pack?.locale, "en");
  assert.equal(pack.source, "builtin");
  assert.equal(getCatalogString(pack.catalog, ["entrance", "user", "language", "label"]), "Application Language");
});

void test("language loader merges split external catalogs and preserves selector fallback", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "app-i18n-split-"));
  const azeriDir = join(rootDir, "az");

  mkdirSync(azeriDir, { recursive: true });
  writeFileSync(
    join(azeriDir, "manifest.json"),
    JSON.stringify({
      locale: "az",
      nativeName: "Azərbaycanca",
      englishName: "Azerbaijani",
      selectorLanguage: "tr",
    })
  );
  writeFileSync(
    join(azeriDir, "entrance.json"),
    JSON.stringify({
      entrance: {
        user: {
          language: {
            label: "Tətbiq dili",
          },
        },
      },
    })
  );
  writeFileSync(
    join(azeriDir, "hints.json"),
    JSON.stringify({
      entrance: {
        user: {
          language: {
            restartHint: "Dil dəyişiklikləri yenidən başladıldıqdan sonra tətbiq olunur.",
          },
        },
      },
    })
  );

  const pack = await loadInstalledLanguage(rootDir, "az");

  assert.equal(pack?.locale, "az");
  assert.equal(pack.selectorLanguage, "tr");
  assert.equal(getCatalogString(pack.catalog, ["entrance", "user", "language", "label"]), "Tətbiq dili");
  assert.equal(
    getCatalogString(pack.catalog, ["entrance", "user", "language", "restartHint"]),
    "Dil dəyişiklikləri yenidən başladıldıqdan sonra tətbiq olunur."
  );
});

void test("normalizeAppLanguage preserves custom locales and falls back to Turkish", () => {
  assert.equal(normalizeAppLanguage("de"), "de");
  assert.equal(normalizeAppLanguage("EN_us"), "en-US");
  assert.equal(normalizeAppLanguage(""), "tr");
  assert.equal(normalizeAppLanguage(null), "tr");
});

void test("normalizeSettings accepts custom locales without narrowing back to built-ins", () => {
  const normalized = normalizeSettings({
    general: {
      language: "de",
    },
  });

  assert.equal(normalized.general?.language, "de");

  const fallback = normalizeSettings({
    general: {
      language: 42,
    },
  });

  assert.equal(fallback.general?.language, "tr");
});

void test("invalid external language packs are skipped or fall back safely", async () => {
  const rootDir = mkdtempSync(join(tmpdir(), "app-i18n-invalid-"));
  const brokenExternalDir = join(rootDir, "fr");
  const brokenOverrideDir = join(rootDir, "en");

  mkdirSync(brokenExternalDir, { recursive: true });
  mkdirSync(brokenOverrideDir, { recursive: true });

  writeFileSync(
    join(brokenExternalDir, "manifest.json"),
    JSON.stringify({
      locale: "fr",
      nativeName: "",
      englishName: "French",
    })
  );
  writeFileSync(join(brokenExternalDir, "index.json"), JSON.stringify({ greeting: "Bonjour" }));

  writeFileSync(
    join(brokenOverrideDir, "manifest.json"),
    JSON.stringify({
      locale: "en",
      nativeName: "English Override",
      englishName: "English Override",
    })
  );
  writeFileSync(join(brokenOverrideDir, "index.json"), "{ invalid json ");

  const languages = await listInstalledLanguages(rootDir);
  const englishPack = await loadInstalledLanguage(rootDir, "en");

  assert.equal(languages.some((language) => language.locale === "fr"), false);
  assert.equal(englishPack?.locale, "en");
  assert.equal(
    getCatalogString(englishPack.catalog, ["entrance", "user", "language", "label"]),
    "Application Language"
  );
});
