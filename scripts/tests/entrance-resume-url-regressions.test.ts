import assert from "node:assert/strict";
import test from "node:test";

import { EntranceHallController } from "../../src/js/pages/entrance.ts";
import { defaultSettings } from "../../src/js/modules/settings/settings-schema.ts";
import { SettingsManager } from "../../src/js/modules/settings-manager.ts";
import { SlotController } from "../../src/js/modules/slot-controller.ts";

void test("getResumeUrlForSlot returns account lastSessionUrl when slot resume is enabled", () => {
  const controller = new EntranceHallController();
  const settings = defaultSettings();

  settings.accounts = [
    {
      id: "chatgpt_demo",
      provider: "chatgpt",
      email: "demo@example.com",
      lastSessionUrl: "https://chatgpt.com/c/resume-123",
    },
  ];

  settings.slots.ai1.accountId = "chatgpt_demo";
  settings.slots.ai1.resumeLastSession = true;

  const resumeUrl = controller.getResumeUrlForSlot("ai1", settings);
  assert.equal(resumeUrl, "https://chatgpt.com/c/resume-123");
});

void test("getResumeUrlForSlot returns empty when resume is disabled", () => {
  const controller = new EntranceHallController();
  const settings = defaultSettings();

  settings.accounts = [
    {
      id: "chatgpt_demo",
      provider: "chatgpt",
      email: "demo@example.com",
      lastSessionUrl: "https://chatgpt.com/c/resume-123",
    },
  ];

  settings.slots.ai1.accountId = "chatgpt_demo";
  settings.slots.ai1.resumeLastSession = false;

  const resumeUrl = controller.getResumeUrlForSlot("ai1", settings);
  assert.equal(resumeUrl, "");
});

void test("shouldAutoConnectSlot returns true when remember is enabled and last state is connected", () => {
  const controller = new EntranceHallController();
  const settings = defaultSettings();

  settings.slots.ai1.accountId = "chatgpt_demo";
  settings.slots.ai1.rememberConnectionStatus = true;
  settings.slots.ai1.lastConnectionState = "connected";

  const shouldAutoConnect = controller.shouldAutoConnectSlot("ai1", settings);
  assert.equal(shouldAutoConnect, true);
});

void test("shouldAutoConnectSlot returns false when remember is enabled but last state is disconnected", () => {
  const controller = new EntranceHallController();
  const settings = defaultSettings();

  settings.slots.ai1.accountId = "chatgpt_demo";
  settings.slots.ai1.rememberConnectionStatus = true;
  settings.slots.ai1.lastConnectionState = "disconnected";

  const shouldAutoConnect = controller.shouldAutoConnectSlot("ai1", settings);
  assert.equal(shouldAutoConnect, false);
});

void test("shouldAutoConnectSlot returns false when remember connection is disabled", () => {
  const controller = new EntranceHallController();
  const settings = defaultSettings();

  settings.slots.ai1.accountId = "chatgpt_demo";
  settings.slots.ai1.rememberConnectionStatus = false;
  settings.slots.ai1.lastConnectionState = "connected";

  const shouldAutoConnect = controller.shouldAutoConnectSlot("ai1", settings);
  assert.equal(shouldAutoConnect, false);
});

void test("applyDefaultConnections does not click connect before webview is registered", async () => {
  const controller = new EntranceHallController();
  const settings = defaultSettings();

  settings.slots.ai1.accountId = "chatgpt_demo";
  settings.slots.ai1.rememberConnectionStatus = true;
  settings.slots.ai1.lastConnectionState = "connected";

  const originalGetSnapshot = SettingsManager.getSnapshot;
  const originalIsConnected = SlotController.isConnected;
  const originalGetWebview = SlotController.getWebview;
  const originalDocument = globalThis.document;

  let clickCount = 0;
  const mockButton = { disabled: false, click: () => clickCount++ } as unknown as HTMLButtonElement;

  Object.defineProperty(SettingsManager, "getSnapshot", {
    value: () => settings,
    configurable: true,
  });
  Object.defineProperty(SlotController, "isConnected", {
    value: () => false,
    configurable: true,
  });
  Object.defineProperty(SlotController, "getWebview", {
    value: () => null,
    configurable: true,
  });
  Object.defineProperty(globalThis, "document", {
    value: {
      getElementById: (id: string) => (id === "ai1-toggle-btn" ? mockButton : null),
    },
    configurable: true,
  });

  try {
    controller.applyDefaultConnections();
    await Promise.resolve();
    assert.equal(clickCount, 0);
  } finally {
    Object.defineProperty(SettingsManager, "getSnapshot", {
      value: originalGetSnapshot,
      configurable: true,
    });
    Object.defineProperty(SlotController, "isConnected", {
      value: originalIsConnected,
      configurable: true,
    });
    Object.defineProperty(SlotController, "getWebview", {
      value: originalGetWebview,
      configurable: true,
    });
    Object.defineProperty(globalThis, "document", {
      value: originalDocument,
      configurable: true,
    });
  }
});

void test("updateRememberedConnectionState saves connected state when remember is enabled", async () => {
  const controller = new EntranceHallController();
  const settings = defaultSettings();
  settings.slots.ai1.accountId = "chatgpt_demo";
  settings.slots.ai1.rememberConnectionStatus = true;
  settings.slots.ai1.lastConnectionState = "disconnected";

  const originalGetSnapshot = SettingsManager.getSnapshot;
  const originalSave = SettingsManager.save;

  let savedSettings: Record<string, unknown> | null = null;
  Object.defineProperty(SettingsManager, "getSnapshot", {
    value: () => settings,
    configurable: true,
  });
  Object.defineProperty(SettingsManager, "save", {
    value: (next: Record<string, unknown>) => {
      savedSettings = next;
      return true;
    },
    configurable: true,
  });

  try {
    await controller.updateRememberedConnectionState("ai1", "connected");
    const savedSettingsRef = { value: savedSettings as Record<string, unknown> | null };
    if (savedSettingsRef.value == null) {
      assert.fail("Expected savedSettings to be set");
    }
    const slots = savedSettingsRef.value['slots'] as Record<string, unknown>;
    assert.equal((slots['ai1'] as Record<string, unknown>)['lastConnectionState'], "connected");
  } finally {
    Object.defineProperty(SettingsManager, "getSnapshot", {
      value: originalGetSnapshot,
      configurable: true,
    });
    Object.defineProperty(SettingsManager, "save", {
      value: originalSave,
      configurable: true,
    });
  }
});
