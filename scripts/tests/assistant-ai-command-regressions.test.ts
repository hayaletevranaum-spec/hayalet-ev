import assert from "node:assert/strict";
import test from "node:test";

import { RelayManager } from "../../src/js/modules/relay-manager.ts";
import { RoomCommandRegistry } from "../../src/js/modules/rooms/room-command-registry.ts";
import { SettingsManager } from "../../src/js/modules/settings-manager.ts";
import type { InstalledRoomRecord } from "../../src/types/rooms.ts";

const { serverCommands } = await import("../../src/js/modules/server-commands.ts");
const aiChatCommandsModule = await import("../../src/js/modules/commands/ai-chat-commands.ts");
const { aiChatRuntime } = aiChatCommandsModule;

const room: InstalledRoomRecord = {
  id: "game-room",
  name: "Game Room",
  version: "2.2.0",
  installedDir: "/workspace/rooms/.build/game-room/runtime",
  sourceDir: "/workspace/rooms/game-room",
  manifestPath: "/workspace/rooms/.build/game-room/runtime/manifest.json",
  runtimeEntryPath: "/workspace/rooms/.build/game-room/runtime/ui/index.html",
  hostEntryPath: "/workspace/rooms/.build/game-room/runtime/host/index.js",
  defaultFeatureId: "backgammon",
  features: [{ id: "backgammon", name: "Tavla" }],
  commandSpecs: [
    {
      name: "GameRoomBackgammonAiMove",
      description: "Apply AI move from slot response",
      scope: "ai-slots",
      exposure: "internal",
    },
    {
      name: "GameRoomBackgammonRemoteMove",
      description: "Apply remote move from US1 response",
      scope: "us1",
      exposure: "internal",
    },
  ],
  installedAt: "2026-03-08T00:00:00.000Z",
  updatedAt: "2026-03-08T00:00:00.000Z",
};

const slotBridgeCalls: Array<Record<string, unknown>> = [];

test.beforeEach(() => {
  slotBridgeCalls.length = 0;
  aiChatRuntime.slotBridge = async (payload: Parameters<typeof aiChatRuntime.slotBridge>[0] = {}) => {
    slotBridgeCalls.push(payload);
    return { success: true };
  };
});

test.afterEach(() => {
  RoomCommandRegistry.reset();
});

void test("retired assistant wrapper handlers are no longer import-callable", () => {
  assert.equal("aiAssistantSendHandler" in aiChatCommandsModule, false);
  assert.equal("assistantAISendHandler" in aiChatCommandsModule, false);
});

void test("RelayManager catches ai0 last-message SlotBridge commands only when assistant checkbox is enabled", async () => {
  const originalGetSnapshot = SettingsManager.getSnapshot;
  const originalCoreEngine = RelayManager.coreEngine;
  const caught: Array<{ command: string; args: string; provider: string }> = [];

  try {
    RelayManager.coreEngine = {
      handleCaughtCommand: (
        command: string,
        payload: { args?: string; provider?: string }
      ) => {
        caught.push({
          command,
          args: payload.args ?? "",
          provider: payload.provider ?? "",
        });
        return { success: true };
      },
    } as never;

    const inline =
      '++cmd:SlotBridge({"action":"message.send","fromSlot":"ai0","toSlot":"ai1","payload":{"text":"Merhaba"}})';

    SettingsManager.getSnapshot = () =>
      ({
        assistantSlot: { catchCommands: false },
      }) as never;

    const disabledResult = await RelayManager.processAssistantCommandCatch({
      messages: [{ role: "assistant", text: inline }],
    });

    assert.equal(disabledResult, false);
    assert.equal(caught.length, 0);

    SettingsManager.getSnapshot = () =>
      ({
        assistantSlot: { catchCommands: true },
      }) as never;

    const enabledResult = await RelayManager.processAssistantCommandCatch({
      messages: [{ role: "assistant", text: inline }],
    });

    assert.equal(enabledResult, true);
    assert.equal(caught.length, 1);
    assert.equal(caught[0]?.command, "SlotBridge");
    assert.match(String(caught[0].args), /"toSlot":"ai1"/);
    assert.equal(caught[0].provider, "ai0");
  } finally {
    SettingsManager.getSnapshot = originalGetSnapshot;
    RelayManager.coreEngine = originalCoreEngine;
  }
});

void test("server commands treat retired assistant bridge wrappers as removed and still enforce category scope", async () => {
  const removed = (await serverCommands.run("AssistantAISend", {
    provider: "ai0",
    args: "ai2",
    text: "test",
  })) as { success?: boolean; message?: string };

  assert.equal(removed.success, false);
  assert.match(String(removed.message), /undefined|tan[ıi]ms[ıi]z/i);

  const nonAssistantFromAi0 = (await serverCommands.run("AIAIChatStart", {
    provider: "ai0",
    args: "ai1",
  })) as { success?: boolean; message?: string };

  assert.equal(nonAssistantFromAi0.success, false);
  assert.match(String(nonAssistantFromAi0.message), /yetki|izin|allowed|kullanamaz/i);
});

void test("server commands expose SlotBridge without retired assistant wrapper commands", () => {
  const categoryApi = serverCommands as unknown as {
    listByCategory?: (category: string) => string[];
    has?: (commandName: string) => boolean;
  };

  assert.equal(typeof categoryApi.listByCategory, "function");
  assert.equal(typeof categoryApi.has, "function");

  const aiCategory = categoryApi.listByCategory?.("ai1-ai2") ?? [];
  const assistantCategory = categoryApi.listByCategory?.("ai0") ?? [];
  const us1Category = categoryApi.listByCategory?.("us1") ?? [];

  assert.equal(aiCategory.includes("AIAIChatStart"), true);
  assert.equal(aiCategory.includes("SlotBridge"), true);
  assert.equal(assistantCategory.includes("SlotBridge"), true);
  assert.equal(us1Category.includes("SlotBridge"), true);
  assert.equal(assistantCategory.includes("AssistantAISend"), false);
  assert.equal(aiCategory.includes("AIAssistantSend"), false);
  assert.equal(categoryApi.has?.("AssistantAISend"), false);
});

void test("server command catalog includes internal room commands for slot panels", () => {
  const categoryApi = serverCommands as unknown as {
    getCatalog?: (category: string) => Array<{ name: string }>;
  };

  RoomCommandRegistry.syncInstalledRooms([room]);

  const aiCatalog = categoryApi.getCatalog?.("ai1-ai2") ?? [];
  const us1Catalog = categoryApi.getCatalog?.("us1") ?? [];

  assert.equal(
    aiCatalog.some((item) => item.name === "GameRoomBackgammonAiMove"),
    true
  );
  assert.equal(
    us1Catalog.some((item) => item.name === "GameRoomBackgammonRemoteMove"),
    true
  );
});

void test("server commands block disabled commands per slot", async () => {
  const originalGetSnapshot = SettingsManager.getSnapshot;

  try {
    SettingsManager.getSnapshot = () =>
      ({
        slots: {
          ai1: { disabledCommands: ["WhisperManager"] },
          ai2: { disabledCommands: [] },
        },
        assistantSlot: { disabledCommands: [] },
      }) as never;

    const disabled = (await serverCommands.run("WhisperManager", {
      provider: "ai1",
      args: "",
    })) as { success?: boolean; message?: string };

    assert.equal(disabled.success, false);
    assert.match(String(disabled.message), /pasif|disabled|devre dışı/i);
  } finally {
    SettingsManager.getSnapshot = originalGetSnapshot;
  }
});

void test("server commands can disable SlotBridge actions per slot", async () => {
  const originalGetSnapshot = SettingsManager.getSnapshot;

  try {
    SettingsManager.getSnapshot = () =>
      ({
        slots: {
          ai1: { disabledCommands: ["SlotBridge:message.send"] },
          ai2: { disabledCommands: [] },
        },
        assistantSlot: { disabledCommands: [] },
      }) as never;

    const disabled = (await serverCommands.run("SlotBridge", {
      provider: "ai1",
      action: "message.send",
      toSlot: "ai2",
      payload: { text: "hello" },
    })) as { success?: boolean; message?: string };

    assert.equal(disabled.success, false);
    assert.match(String(disabled.message), /pasif|disabled|devre dışı/i);
  } finally {
    SettingsManager.getSnapshot = originalGetSnapshot;
  }
});

void test("server commands block disabled room commands routed through SlotBridge", async () => {
  const originalGetSnapshot = SettingsManager.getSnapshot;

  try {
    RoomCommandRegistry.syncInstalledRooms([room]);

    SettingsManager.getSnapshot = () =>
      ({
        slots: {
          ai1: { disabledCommands: ["GameRoomBackgammonAiMove"] },
          ai2: { disabledCommands: [] },
        },
        assistantSlot: { disabledCommands: [] },
      }) as never;

    const disabled = (await serverCommands.run("SlotBridge", {
      provider: "ai1",
      args: '{"action":"room.command","payload":{"commandName":"GameRoomBackgammonAiMove","cell":4}}',
    })) as { success?: boolean; message?: string };

    assert.equal(disabled.success, false);
    assert.match(String(disabled.message), /pasif|disabled|devre dışı/i);
  } finally {
    SettingsManager.getSnapshot = originalGetSnapshot;
  }
});

void test("server commands block disabled us1 room commands routed through SlotBridge", async () => {
  const originalGetSnapshot = SettingsManager.getSnapshot;

  try {
    RoomCommandRegistry.syncInstalledRooms([room]);

    SettingsManager.getSnapshot = () =>
      ({
        slots: {
          ai1: { disabledCommands: [] },
          ai2: { disabledCommands: [] },
        },
        us1Slot: { selectedRemoteUserId: null, disabledCommands: ["GameRoomBackgammonRemoteMove"] },
        assistantSlot: { disabledCommands: [] },
      }) as never;

    const disabled = (await serverCommands.run("SlotBridge", {
      provider: "us1",
      args: '{"action":"room.command","payload":{"commandName":"GameRoomBackgammonRemoteMove","cell":4}}',
    })) as { success?: boolean; message?: string };

    assert.equal(disabled.success, false);
    assert.match(String(disabled.message), /pasif|disabled|devre dışı/i);
  } finally {
    SettingsManager.getSnapshot = originalGetSnapshot;
  }
});
