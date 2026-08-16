import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getRuntimeProviderConfig } from "../../src/js/modules/webview/methods/shared/runtime-selectors.ts";

async function loadProviderConfig(providerId: string): Promise<Record<string, unknown>> {
  const moduleUrl = new URL(
    `../../src/js/modules/webview/providers/${providerId}/config.ts`,
    import.meta.url
  ).href;
  const mod = (await import(moduleUrl)) as { config?: Record<string, unknown> };
  assert.ok(mod.config, `provider config should exist for ${providerId}`);
  return mod.config;
}

void test("opencode-based provider configs expose ui language signals", async () => {
  const opencodeProviders = ["opencode", "opencode-ui"];
  const opencodeConfigs = await Promise.all(
    opencodeProviders.map(async (id) => ({ id, config: await loadProviderConfig(id) }))
  );

  for (const { id: providerId, config } of opencodeConfigs) {
    const strategy = config["uiLanguage"] as Record<string, unknown> | undefined;
    const signals = strategy?.["signals"] as Record<string, unknown> | undefined;

    assert.ok(strategy, `${providerId} should expose uiLanguage metadata`);
    assert.ok(signals, `${providerId} should expose ui language signal metadata`);
    assert.ok(Array.isArray(signals["localStorageKeys"]));
    assert.ok((signals["localStorageKeys"] as unknown[]).length > 0);
  }

  const otherProviders = ["chatgpt", "gemini", "grok"];
  const otherConfigs = await Promise.all(
    otherProviders.map(async (id) => ({ id, config: await loadProviderConfig(id) }))
  );
  for (const { id: providerId, config } of otherConfigs) {
    assert.equal(config["uiLanguage"], undefined, `${providerId} should not require uiLanguage metadata`);
  }
});

void test("selector locale consumers use shared resolveSelectorLanguage helper", () => {
  const files = [
    "src/js/modules/webview/message-sender.ts",
    "src/js/modules/traffic/probe-script-builder.ts",
    "src/js/modules/webview/methods/shared/runtime-selectors.ts",
    "electron/provider-tester/selector-evidence.ts",
  ];

  for (const filePath of files) {
    const source = readFileSync(filePath, "utf8");
    assert.match(source, /resolveSelectorLanguage/);
  }
});

void test("runtime provider config reader requests a serializable subset from the webview", async () => {
  let executedScript = "";
  const config = await getRuntimeProviderConfig({
    executeJavaScript: async (script: string) => {
      executedScript = script;
      return JSON.stringify({
        selectors: {
          inputField: "#chat-input",
          filePreview: [".ds-file-chips"],
        },
        selectorMatrix: {
          selectors: {
            sendButton: {
              tr: "#send-btn",
              en: "#send-btn",
              fallbacks: ["#send-btn"],
            },
          },
        },
        fileInputSelectors: ['input[type="file"]'],
        uploadTargetSelectors: [".drop-zone"],
      });
    },
  });

  assert.match(executedScript, /JSON\.stringify/);
  assert.deepEqual(config, {
    selectors: {
      inputField: "#chat-input",
      filePreview: [".ds-file-chips"],
    },
    selectorMatrix: {
      selectors: {
        sendButton: {
          tr: "#send-btn",
          en: "#send-btn",
          fallbacks: ["#send-btn"],
        },
      },
    },
    fileInputSelectors: ['input[type="file"]'],
    uploadTargetSelectors: [".drop-zone"],
  });
});

void test("app bootstrap initializes renderer i18n from settings", () => {
  const source = readFileSync("src/js/app/index.ts", "utf8");
  const loadIndex = source.indexOf("await SettingsManager.load();");
  const bootstrapIndex = source.indexOf("await AppI18n.bootstrap(SettingsManager);");

  assert.notEqual(loadIndex, -1);
  assert.match(source, /await AppI18n\.bootstrap\(SettingsManager\)/);
  assert.notEqual(bootstrapIndex, -1);
  assert.ok(loadIndex < bootstrapIndex, "settings should load before AppI18n bootstrap");
  assert.doesNotMatch(source, /AppI18n\.t\("app\.startup\.loadingSettings"\)/);
});
