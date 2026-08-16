import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultSettings,
  normalizeSettings,
} from "../../src/js/modules/settings/settings-schema.ts";

void test("default settings enable slot command capture and resume defaults", () => {
  const settings = defaultSettings();
  assert.ok(settings.us1Slot);
  assert.ok(settings.assistantSlot);
  assert.ok(settings.assistants);

  assert.equal(settings.slots.ai1.catchCommands, true);
  assert.equal(settings.slots.ai1.resumeLastSession, true);
  assert.equal(settings.slots.ai1.rememberConnectionStatus, false);
  assert.equal(settings.slots.ai2.catchCommands, true);
  assert.equal(settings.slots.ai2.resumeLastSession, true);
  assert.equal(settings.slots.ai2.rememberConnectionStatus, false);
  assert.equal(settings.us1Slot.catchCommands, true);
  assert.equal(settings.us1Slot.resumeLastSession, true);
  assert.equal(settings.us1Slot.rememberConnectionStatus, false);
  assert.equal(settings.assistantSlot.catchCommands, true);
  assert.equal(settings.assistants.resumeLastSession, true);
});

void test("normalize settings backfills missing slot resume flag", () => {
  const normalized = normalizeSettings({
    slots: {
      ai1: {
        accountId: null,
        catchCommands: true,
        messageMethod: "injection",
        fileMethod: "dragdrop",
      },
      ai2: {
        accountId: null,
        catchCommands: true,
        messageMethod: "injection",
        fileMethod: "dragdrop",
      },
    },
    accounts: [],
    assistantAccounts: [],
  });

  assert.equal(normalized.slots.ai1.resumeLastSession, true);
  assert.equal(normalized.slots.ai2.resumeLastSession, true);
});

void test("normalize settings preserves account lastSessionUrl", () => {
  const normalized = normalizeSettings({
    accounts: [
      {
        id: "chatgpt_demo",
        provider: "chatgpt",
        email: "demo@example.com",
        lastSessionUrl: "https://chatgpt.com/c/abc123",
      },
    ],
    assistantAccounts: [],
    slots: {
      ai1: {
        accountId: "chatgpt_demo",
        catchCommands: true,
        messageMethod: "injection",
        fileMethod: "dragdrop",
      },
      ai2: {
        accountId: null,
        catchCommands: true,
        messageMethod: "injection",
        fileMethod: "dragdrop",
      },
    },
  });

  assert.equal(normalized.accounts[0]?.lastSessionUrl, "https://chatgpt.com/c/abc123");
});
