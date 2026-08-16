import assert from "node:assert/strict";
import test from "node:test";

import { ConversationListManager } from "../../src/js/modules/conversation-list-manager.ts";
import { AppState } from "../../src/js/modules/app-state.ts";
import { SettingsManager } from "../../src/js/modules/settings-manager.ts";
import type { SlotEvent } from "../../src/js/modules/slot-controller.ts";
import { SlotController } from "../../src/js/modules/slot-controller.ts";

void test("slot account change triggers conversation list refresh", () => {
  let settingsListener: ((event: { changedPaths: string[] }) => void) | null = null;
  let refreshCallCount = 0;
  let renderAllCallCount = 0;

  const originalSubscribe = SettingsManager.subscribe.bind(SettingsManager);
  const originalSlotOn = SlotController.on.bind(SlotController);
  const originalRefresh = ConversationListManager.refresh.bind(ConversationListManager);
  const originalRenderAll = ConversationListManager.renderAll.bind(ConversationListManager);

  SettingsManager.subscribe = (
    listener: (event: { settings: unknown; changedPaths: string[] }) => void
  ): (() => void) => {
    settingsListener = (event: { changedPaths: string[] }) => {
      listener({ settings: null, changedPaths: event.changedPaths });
    };
    return (): void => {};
  };

  SlotController.on = (
    _event: SlotEvent,
    _listener: (payload: {
      event?: string;
      slot?: string;
      data?: { isDefaultPage?: boolean };
    }) => void
  ): (() => void) => {
    return (): void => {};
  };

  ConversationListManager.refresh = async (): Promise<void> => {
    refreshCallCount += 1;
    await Promise.resolve();
  };

  ConversationListManager.renderAll = (): void => {
    renderAllCallCount += 1;
  };

  try {
    ConversationListManager.subscribeToSettings();

    const sl = settingsListener as unknown as (event: { changedPaths: string[] }) => void;

    sl({ changedPaths: ["slots.ai1.accountId"] });

    assert.equal(
      refreshCallCount,
      1,
      "slot account change must refresh conversation data for topbar lists"
    );
    assert.equal(
      renderAllCallCount,
      0,
      "slot account change should not use stale render-only path"
    );
  } finally {
    SettingsManager.subscribe = originalSubscribe;
    SlotController.on = originalSlotOn;
    ConversationListManager.refresh = originalRefresh;
    ConversationListManager.renderAll = originalRenderAll;
    ConversationListManager.destroy();
  }
});

void test("ai0 session change refreshes topbar with stored selection instead of stale DOM value", () => {
  let settingsListener: ((event: { changedPaths: string[] }) => void) | null = null;
  const refreshCalls: Array<{
    silent?: boolean;
    forceSelectId?: string;
    skipNotify?: boolean;
    provider?: string;
  }> = [];

  const originalSubscribe = SettingsManager.subscribe.bind(SettingsManager);
  const originalSlotOn = SlotController.on.bind(SlotController);
  const originalRefresh = ConversationListManager.refresh.bind(ConversationListManager);
  const originalSyncAi0SelectionFromSettings =
    ConversationListManager._syncAi0SelectionFromSettings.bind(ConversationListManager);

  SettingsManager.subscribe = (
    listener: (event: { settings: unknown; changedPaths: string[] }) => void
  ): (() => void) => {
    settingsListener = (event: { changedPaths: string[] }) => {
      listener({ settings: null, changedPaths: event.changedPaths });
    };
    return (): void => {};
  };

  SlotController.on = (
    _event: SlotEvent,
    _listener: (payload: {
      event?: string;
      slot?: string;
      data?: { isDefaultPage?: boolean };
    }) => void
  ): (() => void) => {
    return (): void => {};
  };

  ConversationListManager.refresh = async (options = {}): Promise<void> => {
    refreshCalls.push(options);
    await Promise.resolve();
  };

  ConversationListManager._syncAi0SelectionFromSettings = (): void => {};

  try {
    ConversationListManager.subscribeToSettings();

    const sl = settingsListener as unknown as (event: { changedPaths: string[] }) => void;

    sl({ changedPaths: ["assistants.lastOpencodeUiSessionId"] });

    assert.deepEqual(refreshCalls, [
      {
        silent: false,
        skipNotify: true,
        provider: "ai0",
      },
    ]);
  } finally {
    SettingsManager.subscribe = originalSubscribe;
    SlotController.on = originalSlotOn;
    ConversationListManager.refresh = originalRefresh;
    ConversationListManager._syncAi0SelectionFromSettings = originalSyncAi0SelectionFromSettings;
    ConversationListManager.destroy();
  }
});

void test("llm new conversation selection navigates to a local session URL", async () => {
  const globalScope = globalThis as unknown as {
    window?: { dispatchEvent: (event: Event) => boolean };
  };
  const originalWindow = globalScope.window;
  const originalGetProvider = AppState.getProviderIdForSlot;
  const originalNavigate = SlotController.navigate.bind(SlotController);
  const originalClearMessagesArea =
    ConversationListManager._clearMessagesArea.bind(ConversationListManager);
  const originalSelects = ConversationListManager.selects;
  const originalEntries = ConversationListManager.entries;
  const originalSelections = ConversationListManager.currentSelections;
  let navigation: { slot: string; url: string | null } | null = null;

  globalScope.window = { dispatchEvent: () => true };
  AppState.getProviderIdForSlot = ((slot: string) =>
    slot === "ai1" ? "llm" : null);
  SlotController.navigate = (slot: string, url: string | null): void => {
    navigation = { slot, url };
  };
  ConversationListManager._clearMessagesArea = (): void => {};
  ConversationListManager.selects = {
    ai0: null,
    ai1: { value: "new" } as HTMLSelectElement,
    ai2: null,
    us1: null,
  };
  ConversationListManager.entries = [];
  ConversationListManager.currentSelections = { ai0: "new", ai1: "old", ai2: "new", us1: "new" };

  try {
    await ConversationListManager.handleConversationChange("ai1");

    const nav = navigation as unknown as { slot: string; url: string | null };
    assert.equal(nav.slot, "ai1");
    assert.match(nav.url ?? "", /^http:\/\/127\.0\.0\.1:9876\/\?session=ai1-/);
  } finally {
    if (originalWindow === undefined) {
      delete globalScope.window;
    } else {
      globalScope.window = originalWindow;
    }
    AppState.getProviderIdForSlot = originalGetProvider;
    SlotController.navigate = originalNavigate;
    ConversationListManager._clearMessagesArea = originalClearMessagesArea;
    ConversationListManager.selects = originalSelects;
    ConversationListManager.entries = originalEntries;
    ConversationListManager.currentSelections = originalSelections;
  }
});
