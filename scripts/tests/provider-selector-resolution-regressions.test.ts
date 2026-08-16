import assert from "node:assert/strict";
import test from "node:test";

import { config as grokConfig } from "../../src/js/modules/webview/providers/grok/config.ts";

async function loadResolverModule(): Promise<Record<string, unknown> | null> {
  try {
    const moduleUrl = new URL("../../shared/provider-selector-resolution.ts", import.meta.url).href;
    return (await import(moduleUrl)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

void test("provider selector resolver exposes locale-aware candidate ordering", async () => {
  const mod = await loadResolverModule();

  assert.ok(mod !== null, "shared/provider-selector-resolution.ts should exist");
  assert.equal(typeof mod["resolveSelectorCandidates"], "function");

  const candidates = (
    mod["resolveSelectorCandidates"] as (entry: unknown, locale: string) => string[]
  )(
    {
      tr: 'button[aria-label="Gonder"]',
      en: 'button[aria-label="Submit"]',
      fallbacks: ["button[type='submit']", ".send-button"],
    },
    "tr"
  );

  assert.deepEqual(candidates, [
    'button[aria-label="Gonder"]',
    'button[aria-label="Submit"]',
    "button[type='submit']",
    ".send-button",
  ]);
});

void test("provider selector resolver preserves ordered candidates from legacy selector lists", async () => {
  const mod = await loadResolverModule();

  assert.ok(mod !== null, "shared/provider-selector-resolution.ts should exist");
  assert.equal(typeof mod["resolveSelectorCandidates"], "function");

  const candidates = (
    mod["resolveSelectorCandidates"] as (entry: unknown, locale: string) => string[]
  )('button[aria-label="Gonder"], button[aria-label="Submit"], button[type="submit"]', "tr");

  assert.deepEqual(candidates, [
    'button[aria-label="Gonder"]',
    'button[aria-label="Submit"]',
    'button[type="submit"]',
  ]);
});

void test("provider configs expose locale-aware selector metadata for promotable DOM keys", () => {
  const selectorMatrix = (grokConfig as Record<string, unknown>)["selectorMatrix"] as
    | Record<string, unknown>
    | undefined;

  assert.ok(selectorMatrix, "provider config should expose selectorMatrix metadata");

  const selectors = selectorMatrix["selectors"] as Record<string, unknown> | undefined;
  const sendButton = selectors?.["sendButton"] as Record<string, unknown> | undefined;

  assert.ok(sendButton, "sendButton should have locale-aware metadata");
  assert.equal(typeof sendButton["tr"], "string");
  assert.equal(typeof sendButton["en"], "string");
  assert.ok(Array.isArray(sendButton["fallbacks"]), "sendButton fallbacks should be an array");
});
