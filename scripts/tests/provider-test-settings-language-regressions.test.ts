import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

void test("settings user panel exposes app language selector", () => {
  const html = readFileSync("src/pages/settings.html", "utf8");

  assert.match(html, /id="app-language-select"/);
  assert.match(html, /id="app-language-label"/);
});

void test("user panel persists app language to general.language", () => {
  const source = readFileSync("src/js/pages/settings/accounts/user-panel.ts", "utf8");

  assert.match(source, /general:\s*\{\s*\.\.\.current\.general,\s*language:\s*nextLanguage/s);
  assert.match(source, /normalizeAppLanguage\(language\)/);
  assert.match(source, /saveAppLanguage\(language: string\)/);
});

void test("provider test handler sources promotion locale from app settings", () => {
  const source = readFileSync("electron/handlers/ipc-provider.ts", "utf8");

  assert.match(source, /loadSettings\(/);
  assert.match(source, /general\?\.language|resolvePromotionLocaleFromSettings/);
});
