import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSettingsWithDisabledCommands,
  getDisabledCommandsForSlot,
  normalizeSlot,
  resolveCategoryForSlot,
  splitCommandCatalogBySource,
} from "../../src/js/pages/server/command-helpers.ts";
import {
  extractExampleArgsFromDescription,
  buildCommandTestMessage,
  buildInlineCommandSnippet,
  parseCommandExecutionInput,
} from "../../src/js/pages/server-command-utils.ts";

void test("extractExampleArgsFromDescription picks SlotBridge JSON args from detail text", () => {
  const detail = [
    "📌 Canonical bridge command.",
    "",
    "Ornek:",
    '++cmd:SlotBridge({"action":"message.send","fromSlot":"ai0","toSlot":"ai1","payload":{"text":"Merhaba"}})',
  ].join("\n");

  const args = extractExampleArgsFromDescription("SlotBridge", detail);

  assert.match(args, /"action":"message\.send"/);
  assert.match(args, /"toSlot":"ai1"/);
});

void test("extractExampleArgsFromDescription returns empty for no-arg command", () => {
  const detail = "++cmd:AIAIChatStop()";

  const args = extractExampleArgsFromDescription("AIAIChatStop", detail);

  assert.equal(args, "");
});

void test("extractExampleArgsFromDescription ignores other command examples", () => {
  const detail = '++cmd:SlotBridge({"action":"message.send","toSlot":"ai2"})';

  const args = extractExampleArgsFromDescription("WhisperManager", detail);

  assert.equal(args, "");
});

void test("buildInlineCommandSnippet formats command with args", () => {
  const snippet = buildInlineCommandSnippet("WhisperManager", "demo");

  assert.equal(snippet, "++cmd:WhisperManager(demo)");
});

void test("buildInlineCommandSnippet formats command without args", () => {
  const snippet = buildInlineCommandSnippet("AIAIChatStop", "");

  assert.equal(snippet, "++cmd:AIAIChatStop()");
});

void test("parseCommandExecutionInput parses SlotBridge inline command input", () => {
  const inline =
    '++cmd:SlotBridge({"action":"message.send","fromSlot":"ai0","toSlot":"ai2","payload":{"text":"Selam"}})';

  const parsed = parseCommandExecutionInput(inline, "WhisperManager");

  assert.equal(parsed.commandName, "SlotBridge");
  assert.match(parsed.args, /"toSlot":"ai2"/);
  assert.equal(parsed.inputWasInlineCommand, true);
});

void test("parseCommandExecutionInput keeps balanced SlotBridge JSON payloads intact", () => {
  const inline =
    '++cmd:SlotBridge({"action":"message.send","toSlot":"ai1","payload":{"text":"https://example.com/path_(demo)"}})';

  const parsed = parseCommandExecutionInput(inline, "WhisperManager");

  assert.equal(parsed.commandName, "SlotBridge");
  assert.match(parsed.args, /path_\(demo\)/);
  assert.equal(parsed.inputWasInlineCommand, true);
});

void test("parseCommandExecutionInput falls back to selected command with plain args", () => {
  const parsed = parseCommandExecutionInput("demo", "WhisperManager");

  assert.equal(parsed.commandName, "WhisperManager");
  assert.equal(parsed.args, "demo");
  assert.equal(parsed.inputWasInlineCommand, false);
});

void test("buildCommandTestMessage formats command with args", () => {
  const message = buildCommandTestMessage("WhisperManager", "demo");

  assert.equal(message, "++cmd:WhisperManager(demo) Komut paneli test mesaji");
});

void test("buildCommandTestMessage formats command without args", () => {
  const message = buildCommandTestMessage("AIAIChatStop", "");

  assert.equal(message, "++cmd:AIAIChatStop() Komut paneli test mesaji");
});

void test("normalizeSlot keeps us1 selection", () => {
  assert.equal(normalizeSlot("us1"), "us1");
});

void test("resolveCategoryForSlot maps us1 to us1 category", () => {
  assert.equal(resolveCategoryForSlot("us1"), "us1");
});

void test("getDisabledCommandsForSlot reads us1 disabled commands", () => {
  const disabled = getDisabledCommandsForSlot(
    {
      slots: {
        ai1: { disabledCommands: [] },
        ai2: { disabledCommands: [] },
      },
      us1Slot: { selectedRemoteUserId: null, disabledCommands: ["GameRoomBackgammonRemoteMove"] },
      assistantSlot: { disabledCommands: [] },
    } as never,
    "us1"
  );

  assert.deepEqual(disabled, ["GameRoomBackgammonRemoteMove"]);
});

void test("buildSettingsWithDisabledCommands stores disabled commands under us1 slot", () => {
  const next = buildSettingsWithDisabledCommands(
    {
      slots: {
        ai1: { disabledCommands: [] },
        ai2: { disabledCommands: [] },
      },
      us1Slot: { selectedRemoteUserId: null, disabledCommands: [] },
      assistantSlot: { disabledCommands: [] },
    } as never,
    "us1",
    ["GameRoomBackgammonRemoteMove"]
  );

  assert.deepEqual(next.us1Slot?.disabledCommands, ["GameRoomBackgammonRemoteMove"]);
});

void test("splitCommandCatalogBySource separates system and room commands", () => {
  const grouped = splitCommandCatalogBySource([
    { name: "SlotBridge", category: "us1", isCustom: false, supportsTestMode: true },
    {
      name: "GameRoomBackgammonRemoteMove",
      category: "us1",
      isCustom: true,
      supportsTestMode: false,
    },
  ]);

  assert.deepEqual(
    grouped.systemCommands.map((item) => item.name),
    ["SlotBridge"]
  );
  assert.deepEqual(
    grouped.roomCommands.map((item) => item.name),
    ["GameRoomBackgammonRemoteMove"]
  );
});
