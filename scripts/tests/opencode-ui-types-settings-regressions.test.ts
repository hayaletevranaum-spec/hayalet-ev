import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultSettings,
  normalizeSettings,
} from "../../src/js/modules/settings/settings-schema.ts";

void test("default settings scaffold assistants.lastOpencodeUiSessionId as null", () => {
  const settings = defaultSettings();

  assert.equal(settings.assistants?.lastOpencodeUiSessionId, null);
});

void test("default settings use Turkish as app language", () => {
  const settings = defaultSettings();

  assert.equal(settings.general?.language, "tr");
});

void test("normalize settings backfills missing assistants.lastOpencodeUiSessionId", () => {
  const normalized = normalizeSettings({
    assistants: {
      preferred: "opencode",
    },
  });

  assert.equal(normalized.assistants?.lastOpencodeUiSessionId, null);
});

void test("normalize settings keeps opencode-ui as assistants.preferred", () => {
  const normalized = normalizeSettings({
    assistants: {
      preferred: "opencode-ui",
    },
  });

  assert.equal(normalized.assistants?.preferred, "opencode-ui");
});

void test("normalize settings coerces invalid assistants.preferred to opencode", () => {
  const normalized = normalizeSettings({
    assistants: {
      preferred: "invalid-provider",
    },
  });

  assert.equal(normalized.assistants?.preferred, "opencode");
});

void test("normalize settings preserves string assistants.lastOpencodeUiSessionId", () => {
  const normalized = normalizeSettings({
    assistants: {
      lastOpencodeUiSessionId: "session-opencode-ui-123",
    },
  });

  assert.equal(normalized.assistants?.lastOpencodeUiSessionId, "session-opencode-ui-123");
});

void test("normalize settings coerces invalid assistants.lastOpencodeUiSessionId to null", () => {
  const normalized = normalizeSettings({
    assistants: {
      lastOpencodeUiSessionId: 123,
    },
  });

  assert.equal(normalized.assistants?.lastOpencodeUiSessionId, null);
});

void test("normalize settings preserves supported app language values", () => {
  const normalized = normalizeSettings({
    general: {
      language: "en",
    },
  });

  assert.equal(normalized.general?.language, "en");
});

void test("normalize settings preserves custom app language values", () => {
  const normalized = normalizeSettings({
    general: {
      language: "de",
    },
  });

  assert.equal(normalized.general?.language, "de");
});

void test("normalize settings preserves canonical custom app language tags", () => {
  const normalized = normalizeSettings({
    general: {
      language: "pt_br",
    },
  });

  assert.equal(normalized.general?.language, "pt-BR");
});

void test("normalize settings coerces empty app language to Turkish", () => {
  const normalized = normalizeSettings({
    general: {
      language: "   ",
    },
  });

  assert.equal(normalized.general?.language, "tr");
});

void test("normalize settings coerces non-string app language to Turkish", () => {
  const normalized = normalizeSettings({
    general: {
      language: 42,
    },
  });

  assert.equal(normalized.general?.language, "tr");
});

void test("normalize settings backfills opencode-ui assistant account from legacy key", () => {
  const normalized = normalizeSettings({
    assistantAccounts: [],
  });

  const providers = (normalized.assistantAccounts ?? []).map((account) => account.provider);
  assert.ok(providers.includes("opencode-ui"));
});

void test("default settings include opencode-ui db path binding", () => {
  const settings = defaultSettings();
  const opencodeUiAccount = (settings.assistantAccounts ?? []).find(
    (account) => account.provider === "opencode-ui"
  );

  assert.equal(opencodeUiAccount?.dbPath, "~/.local/share/opencode/opencode.db");
});

void test("default settings scaffold assistants.opencode preferences", () => {
  const settings = defaultSettings();
  assert.deepEqual(settings.assistants?.opencode, {
    defaultPort: 4096,
    version: null,
  });
});

void test("normalize settings coerces invalid assistants.opencode preferences and drops legacy binaryPath", () => {
  const normalized = normalizeSettings({
    assistants: {
      opencode: {
        binaryPath: 123,
        defaultPort: 80,
        version: 5,
      },
    },
  });

  assert.deepEqual(normalized.assistants?.opencode, {
    defaultPort: 4096,
    version: null,
  });
});
