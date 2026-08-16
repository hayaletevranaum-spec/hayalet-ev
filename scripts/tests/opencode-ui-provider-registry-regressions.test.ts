import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const providerRegistryPath = "src/js/modules/webview/provider-registry.ts";
const providerFactoryPath = "src/js/modules/webview/provider-factory.ts";

function readProviderRegistry(): string {
  return readFileSync(providerRegistryPath, "utf8");
}

function readProviderFactory(): string {
  return readFileSync(providerFactoryPath, "utf8");
}

void test("provider-registry includes opencode-ui in assistant provider ids", () => {
  const registryContent = readProviderRegistry();

  assert.match(
    registryContent,
    /import \{ config as opencodeUi \} from "\.\/providers\/opencode-ui\/config\.js";/
  );
  assert.match(registryContent, /"opencode-ui": opencodeUi,/);
  assert.match(registryContent, /getAssistantIds\(\): string\[] {\s*return Object\.keys\(assistantProviders\);\s*}/s);
  assert.match(registryContent, /getAllAnyIds\(\): string\[] {\s*return Object\.keys\(allProviders\);\s*}/s);
  assert.match(registryContent, /isAssistant\(id: string\): boolean {\s*return id in assistantProviders;\s*}/s);
});

void test("provider-factory exposes opencode-ui module with send methods", () => {
  const factoryContent = readProviderFactory();

  assert.match(
    factoryContent,
    /import \* as opencodeUiProvider from "\.\/providers\/opencode-ui\/index\.js";/
  );
  assert.match(factoryContent, /"opencode-ui": opencodeUiProvider,/);
  assert.match(
    factoryContent,
    /export function getProvider\(providerId: string\): ProviderModule \| undefined {\s*return allProviders\[providerId\];\s*}/s
  );
});
