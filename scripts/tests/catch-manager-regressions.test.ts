import assert from "node:assert/strict";
import test from "node:test";

import { CatchManager } from "../../src/js/modules/catch-manager.ts";

void test("catch manager scans only latest assistant message", () => {
  const commands = CatchManager.catchCommands({
    provider: "ai2",
    webUrl: "https://grok.com/c/abc",
    messages: [
      { index: 0, role: "assistant", text: "++cmd:first()" },
      { index: 1, role: "user", text: "ok" },
      { index: 2, role: "assistant", text: "++cmd:last(42)" },
    ],
    hasExisting: false,
    prevCount: 0,
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0]!.command, "last");
  assert.equal(commands[0]!.args, "42");
});

void test("catch manager respects prevCount window before latest assistant selection", () => {
  const commands = CatchManager.catchCommands({
    provider: "ai1",
    webUrl: "https://chatgpt.com/c/xyz",
    messages: [
      { index: 0, role: "assistant", text: "++cmd:old()" },
      { index: 1, role: "user", text: "u1" },
      { index: 2, role: "assistant", text: "++cmd:older()" },
      { index: 3, role: "user", text: "u2" },
      { index: 4, role: "assistant", text: "++cmd:new(run)" },
    ],
    hasExisting: true,
    prevCount: 3,
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0]!.command, "new");
  assert.equal(commands[0]!.args, "run");
});

void test("catch manager ignores malformed single-plus commands", () => {
  const commands = CatchManager.catchCommands({
    provider: "ai2",
    webUrl: "https://example.com/room",
    messages: [
      {
        index: 0,
        role: "assistant",
        text: '+cmd:GameRoomBackgammonAiMove({"cell":4})',
      },
    ],
  });

  assert.equal(commands.length, 0);
});

void test("catch manager keeps structured Team Tetris AI commands from the latest assistant message", () => {
  const commands = CatchManager.catchCommands({
    provider: "ai1",
    webUrl: "https://chatgpt.com/c/team-tetris",
    messages: [
      {
        index: 0,
        role: "assistant",
        text: '++cmd:GameRoomTeamTetrisAiMove({"schemaVersion":1,"matchId":"tt_1","turnIndex":2,"turnToken":"tt_token","pieceId":"T","rotation":1,"rowShifts":[0,1,0]})',
      },
    ],
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0]!.command, "GameRoomTeamTetrisAiMove");
  assert.match(commands[0]!.args, /"turnToken":"tt_token"/);
});

void test("catch manager keeps balanced SlotBridge JSON when payload contains closing parentheses", () => {
  const commands = CatchManager.catchCommands({
    provider: "ai1",
    webUrl: "https://chatgpt.com/c/slot-bridge",
    messages: [
      {
        index: 0,
        role: "assistant",
        text: '++cmd:SlotBridge({"action":"message.send","toSlot":"ai2","payload":{"text":"https://example.com/path_(demo)"}})',
      },
    ],
  });

  assert.equal(commands.length, 1);
  assert.equal(commands[0]!.command, "SlotBridge");
  assert.match(commands[0]!.args, /path_\(demo\)/);
});
