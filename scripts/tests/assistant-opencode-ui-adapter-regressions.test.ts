import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const providerRegistryPath = "src/js/pages/assistant/provider-registry.ts";
const adapterPath = "src/js/pages/assistant/opencode-ui-adapter.ts";

function readProviderRegistry(): string {
  return readFileSync(providerRegistryPath, "utf8");
}

function readAdapter(): string {
  return readFileSync(adapterPath, "utf8");
}

void test("assistant provider-registry registers opencode-ui adapter", () => {
  const registryContent = readProviderRegistry();

  assert.match(registryContent, /import \{ OpenCodeUiAdapter \} from "\.\/opencode-ui-adapter\.js";/);
  assert.match(registryContent, /registerAdapter\(new OpenCodeUiAdapter\(\)\);/);
});

void test("opencode-ui adapter routes to native opencode-ui page path", () => {
  const adapterContent = readAdapter();

  assert.match(adapterContent, /private _buildPageUrl\(port: number\): string {/);
  assert.match(
    adapterContent,
    /const params = new URLSearchParams\(\{ port: String\(port\) \}\);\s*return `\/pages\/opencode-ui\.html\?\$\{params\.toString\(\)\}`;/s
  );
  assert.match(adapterContent, /const pageUrl = this\._buildPageUrl\(this\._currentPort\);/);
  assert.match(adapterContent, /return \{\s*success: true,\s*url: pageUrl,/s);
});
