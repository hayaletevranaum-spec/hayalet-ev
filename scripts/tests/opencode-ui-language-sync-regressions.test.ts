import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

async function loadProviderConfig(providerId: "opencode" | "opencode-ui"): Promise<Record<string, unknown>> {
  const moduleUrl = new URL(
    `../../src/js/modules/webview/providers/${providerId}/config.ts`,
    import.meta.url
  ).href;
  const mod = (await import(moduleUrl)) as { config?: Record<string, unknown> };
  assert.ok(mod.config, `provider config should exist for ${providerId}`);
  return mod.config;
}

void test("opencode-ui bootstrap initializes page i18n before app startup", () => {
  const source = readFileSync("src/js/pages/opencode-ui/app.ts", "utf8");

  assert.match(source, /bootstrapOpencodeUiI18n/);
  assert.match(source, /await bootstrapOpencodeUiI18n\(\)/);
});

void test("opencode-ui html declares static translation anchors for visible controls", () => {
  const html = readFileSync("src/pages/opencode-ui.html", "utf8");

  assert.match(html, /data-i18n-title="workspace\.toggleLeftTitle"/);
  assert.match(html, /data-i18n-text="session\.newConversation"/);
  assert.match(html, /data-i18n-placeholder="chat\.inputPlaceholder"/);
  assert.match(html, /data-i18n-text="modelSettings\.title"/);
});

void test("webview preload resolves app language and emits provider language sync events", () => {
  const source = readFileSync("electron/webview-preload.cjs", "utf8");

  assert.match(source, /async function applyProviderUiLanguageSync/);
  assert.match(source, /ipcRenderer\.invoke\("i18n-load-language", appLocale\)/);
  assert.match(source, /window\.dispatchEvent\(new CustomEvent\("app-provider-language-sync"/);
  assert.match(source, /ipcRenderer\.sendToHost\("provider-language-sync"/);
});

void test("opencode providers declare explicit localStorage language signals", async () => {
  const providerIds = ["opencode", "opencode-ui"] as const;
  const configs = await Promise.all(
    providerIds.map(async (id) => ({ id, config: await loadProviderConfig(id) }))
  );

  for (const { id: providerId, config } of configs) {
    const strategy = config["uiLanguage"] as Record<string, unknown> | undefined;
    const signals = strategy?.["signals"] as Record<string, unknown> | undefined;
    const localStorageKeys = signals?.["localStorageKeys"];

    assert.ok(Array.isArray(localStorageKeys), `${providerId} should declare localStorage language keys`);
    assert.ok(localStorageKeys.length > 0, `${providerId} should expose at least one language storage key`);
  }
});

void test("renderer webview hosts prefer app-set-provider IPC for language sync capable injects", () => {
  const assistantBindings = readFileSync("src/js/pages/assistant/webview-bindings.ts", "utf8");
  const entrancePanel = readFileSync("src/js/pages/entrance/webview-panel.ts", "utf8");

  assert.match(assistantBindings, /send\("app-set-provider"/);
  assert.match(entrancePanel, /send\("app-set-provider"/);
});
