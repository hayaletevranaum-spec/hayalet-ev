import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function loadPromotionModule(): Promise<Record<string, unknown> | null> {
  try {
    const moduleUrl = new URL(
      "../../electron/provider-tester/selector-promotion.ts",
      import.meta.url
    ).href;
    return (await import(moduleUrl)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const FIXTURE_SOURCE = `export const config = {
  id: "fixture-provider",
  name: "Fixture Provider",
  baseUrl: "https://example.com",
  loginUrl: null,
  lastVerified: "2026-03-07",
  selectors: {
    sendButton:
      'button[aria-label="Gonder"], button[aria-label="Submit"], button[type="submit"]',
    stopButton: 'button[aria-label="Stop"]',
    inputField: 'textarea',
    messageContainer: 'main',
  },
  selectorMatrix: {
    selectors: {
      sendButton: {
        tr: 'button[aria-label="Gonder"]',
        en: 'button[aria-label="Submit"]',
        fallbacks: ['button[type="submit"]'],
      },
    },
  },
  inputType: "direct",
  scrollerSelectors: ["main"],
  scrapeSelectors: {
    preferred: ".message",
    fallback: ".message",
  },
  fileInputSelectors: [],
  uploadTargetSelectors: [],
  criticalSelectors: [],
  contentContainers: ["div"],
  excludedUrls: [],
  filters: {
    selectors: [],
    hosts: [],
    blockResourceTypes: [],
  },
  telemetry: {
    endpoints: [],
    tokenPaths: [],
  },
};
`;

void test("promotion helper moves winning fallback to locale primary and rewrites source order", async () => {
  const mod = await loadPromotionModule();

  assert.ok(mod !== null, "electron/provider-tester/selector-promotion.ts should exist");
  assert.equal(typeof mod["promoteProviderConfigFile"], "function");

  const tempDir = mkdtempSync(join(tmpdir(), "hev-selector-promotion-"));
  const configPath = join(tempDir, "config.ts");
  writeFileSync(configPath, FIXTURE_SOURCE, "utf8");

  const result = await (
    mod["promoteProviderConfigFile"] as (opts: {
      configPath: string;
      locale: string;
      promotions: Array<{ group: string; key: string; selector: string }>;
    }) => Promise<{ updated?: boolean }>
  )({
    configPath,
    locale: "en",
    promotions: [
      {
        group: "selectors",
        key: "sendButton",
        selector: 'button[type="submit"]',
      },
    ],
  });

  assert.equal(result.updated, true);

  const updatedSource = readFileSync(configPath, "utf8");
  assert.ok(updatedSource.includes(`en: 'button[type="submit"]'`));
  assert.ok(updatedSource.includes(`'button[aria-label="Submit"]'`));
  assert.ok(
    updatedSource.includes(
      `sendButton:\n      'button[type="submit"], button[aria-label="Gonder"], button[aria-label="Submit"]'`
    )
  );
});
