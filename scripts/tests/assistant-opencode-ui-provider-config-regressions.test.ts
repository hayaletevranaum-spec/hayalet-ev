import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

void test("assistant webview provider selection resolves dynamically for ai0", () => {
  const content = readFileSync("src/js/pages/assistant/assistant.ts", "utf8");

  assert.match(content, /_initActiveAdapter\(\): void \{\s+const providerId = this\.providerSelect\?\.value;/);
  assert.match(content, /async _onProviderChange\(\): Promise<void> \{\s+const providerId = this\.providerSelect\?\.value;/);
  assert.doesNotMatch(
    content,
    /(?:AssistantProviderRegistry\.getAdapter|ProviderRegistry\.getAssistant)\(AppState\.getProviderIdForSlot\("ai0"\)\)/
  );
});
