import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

void test("provider registry can replace current-session config entries after promotion", () => {
  const source = readFileSync("src/js/modules/webview/provider-registry.ts", "utf8");

  assert.ok(
    source.includes("update(id: string") || source.includes("update(id,"),
    "ProviderRegistry.update should exist for current-session config refresh"
  );
  assert.ok(
    source.includes("allProviders[id as keyof typeof allProviders] = config") ||
      source.includes("allProviders[id] = config") ||
      source.includes("[id] = record") ||
      source.includes("registry.set(id, config)"),
    "ProviderRegistry.update should replace the cached provider config entry"
  );
});

void test("provider test flow no longer auto-promotes config files from IPC runs", () => {
  const ipcHandler = readFileSync("electron/handlers/ipc-provider.ts", "utf8");
  const entrancePanel = readFileSync("src/js/pages/entrance/webview-panel.ts", "utf8");
  const assistantIndex = readFileSync("src/js/pages/assistant/assistant.ts", "utf8");

  assert.doesNotMatch(ipcHandler, /collectPromotableSelectors/);
  assert.doesNotMatch(ipcHandler, /promoteProviderConfigFile/);
  assert.ok(
    entrancePanel.includes("ProviderRegistry.update("),
    "entrance webview panel may still support registry refresh if explicit data is ever returned"
  );
  assert.ok(
    assistantIndex.includes("ProviderRegistry.update("),
    "assistant page may still support registry refresh if explicit data is ever returned"
  );
});
