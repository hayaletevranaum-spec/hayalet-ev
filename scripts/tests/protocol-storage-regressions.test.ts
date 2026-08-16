import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeProtocolKey,
  normalizeStoredProtocols,
  resolveStoredProtocolEntryForLocale,
} from "../../shared/protocol-storage.ts";

void test("protocol storage canonicalizes legacy assistant keys", () => {
  assert.equal(canonicalizeProtocolKey("AI-asistan"), "AI-assistant");
  assert.equal(canonicalizeProtocolKey("AI-assistant"), "AI-assistant");
});

void test("protocol storage migrates legacy keys into canonical entries", () => {
  const normalized = normalizeStoredProtocols({
    "AI-asistan": "legacy content",
  });

  assert.equal(normalized.protocols["AI-assistant"], "legacy content");
  assert.equal(normalized.changed, true);
});

void test("protocol storage preserves locale variants when a legacy alias duplicates a canonical key", () => {
  const normalized = normalizeStoredProtocols({
    "AI-assistant": {
      default: "Turkish default",
      locales: {
        en: "English variant",
      },
    },
    "AI-asistan": "Legacy default",
  });

  assert.deepEqual(normalized.protocols["AI-assistant"], {
    default: "Legacy default",
    locales: {
      en: "English variant",
    },
  });
});

void test("protocol storage resolves locale entries with Turkish fallback", () => {
  const resolvedEn = resolveStoredProtocolEntryForLocale(
    {
      default: "Turkish default",
      locales: {
        en: "English variant",
      },
    },
    "en"
  );
  const resolvedDe = resolveStoredProtocolEntryForLocale(
    {
      default: "Turkish default",
      locales: {
        en: "English variant",
      },
    },
    "de"
  );

  assert.equal(resolvedEn, "English variant");
  assert.equal(resolvedDe, "Turkish default");
});

void test("protocol storage keeps Turkish fallback ahead of base language for region locales", () => {
  const resolvedEnUs = resolveStoredProtocolEntryForLocale(
    {
      default: "Turkish default",
      locales: {
        en: "English variant",
      },
    },
    "en-US"
  );

  assert.equal(resolvedEnUs, "Turkish default");
});
