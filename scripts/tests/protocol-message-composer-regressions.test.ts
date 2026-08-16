import assert from "node:assert/strict";
import test from "node:test";

import {
  PROTOCOL_HEADER_TAG,
  composeProtocolMessage,
} from "../../src/js/modules/protocol-message-composer.ts";

void test("composeProtocolMessage prepends a standardized protocol header", () => {
  const message = composeProtocolMessage("[START][ANALYZE][AI-AI]", "Gövde metni");

  assert.equal(message, `${PROTOCOL_HEADER_TAG}[START][ANALYZE][AI-AI]\n\nGövde metni`);
});

void test("composeProtocolMessage falls back to header-only when body is empty", () => {
  const message = composeProtocolMessage("[STOP][ANALYZE][AI-ASSISTANT]", "   ");

  assert.equal(message, `${PROTOCOL_HEADER_TAG}[STOP][ANALYZE][AI-ASSISTANT]`);
});

void test("composeProtocolMessage keeps spacing for non-bracket legacy headers", () => {
  const message = composeProtocolMessage("Legacy Header", "");

  assert.equal(message, `${PROTOCOL_HEADER_TAG} Legacy Header`);
});

void test("composeProtocolMessage inserts protocol preface before the loaded body", () => {
  const message = composeProtocolMessage("[START][GAME-ROOM][Tavla]", "Protocol body", {
    preface: "Use only one command line.",
  });

  assert.equal(
    message,
    `${PROTOCOL_HEADER_TAG}[START][GAME-ROOM][Tavla]\n\nUse only one command line.\n\nProtocol body`
  );
});
