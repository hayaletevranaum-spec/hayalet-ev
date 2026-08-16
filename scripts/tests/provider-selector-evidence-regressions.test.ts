import assert from "node:assert/strict";
import test from "node:test";

import type { ProviderTestResult } from "../../src/types/provider.ts";

async function loadEvidenceModule(): Promise<Record<string, unknown> | null> {
  try {
    const moduleUrl = new URL(
      "../../electron/provider-tester/selector-evidence.ts",
      import.meta.url
    ).href;
    return (await import(moduleUrl)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

void test("selector evidence module resolves promotion locale from app settings", async () => {
  const mod = await loadEvidenceModule();

  assert.ok(mod !== null, "electron/provider-tester/selector-evidence.ts should exist");
  assert.equal(typeof mod["resolvePromotionLocaleFromSettings"], "function");

  const resolvePromotionLocaleFromSettings = mod["resolvePromotionLocaleFromSettings"] as (input: {
    general?: {
      language?: string;
    };
  }) => string;

  assert.equal(resolvePromotionLocaleFromSettings({ general: { language: "tr" } }), "tr");
  assert.equal(resolvePromotionLocaleFromSettings({ general: { language: "en" } }), "en");
  assert.equal(resolvePromotionLocaleFromSettings({ general: { language: "de" } }), "tr");
  assert.equal(resolvePromotionLocaleFromSettings({}), "tr");
});

void test("selector evidence module only promotes passing selector evidence from clean suites", async () => {
  const mod = await loadEvidenceModule();

  assert.ok(mod !== null, "electron/provider-tester/selector-evidence.ts should exist");
  assert.equal(typeof mod["collectPromotableSelectors"], "function");

  const results: ProviderTestResult[] = [
    {
      id: "send-button-enabled",
      name: "Send Button",
      category: "interactive",
      status: "pass",
      message: "ok",
      details: {
        selector: 'button[aria-label="Submit"]',
        selectorEvidence: {
          group: "selectors",
          key: "sendButton",
          selector: 'button[aria-label="Submit"]',
          promotable: true,
        },
      },
      duration: 5,
      timestamp: 0,
    },
    {
      id: "assistant-message",
      name: "Assistant Message",
      category: "scraping",
      status: "pass",
      message: "ok",
      duration: 5,
      timestamp: 0,
    },
  ];

  const collectPromotableSelectors = mod["collectPromotableSelectors"] as (input: {
    locale: string;
    aborted: boolean;
    failed: number;
    warnings: number;
    results: ProviderTestResult[];
  }) => Array<{ group: string; key: string; selector: string }>;

  assert.deepEqual(
    collectPromotableSelectors({
      locale: "en",
      aborted: false,
      failed: 0,
      warnings: 0,
      results,
    }),
    [{ group: "selectors", key: "sendButton", selector: 'button[aria-label="Submit"]' }]
  );

  assert.deepEqual(
    collectPromotableSelectors({
      locale: "unknown",
      aborted: false,
      failed: 0,
      warnings: 0,
      results,
    }),
    []
  );

  assert.deepEqual(
    collectPromotableSelectors({
      locale: "en",
      aborted: false,
      failed: 0,
      warnings: 1,
      results,
    }),
    []
  );
});
