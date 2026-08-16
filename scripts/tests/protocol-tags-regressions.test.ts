import assert from "node:assert/strict";
import test from "node:test";

import {
  replaceProtocolTagsWithResolver,
  resolveProtocolTokenDeletionRange,
} from "../../shared/protocol-tags.ts";

void test("protocol tags replace AI and US1 placeholders with resolved nicknames", () => {
  const resolved = replaceProtocolTagsWithResolver(
    "Ping <AI0>, <AI1>, <AI2>, and <US1>.",
    (provider) =>
      ({
        ai0: "Asistan",
        ai1: "Ada",
        ai2: "Bora",
        us1: "Uzak Kullanici",
      })[provider]
  );

  assert.equal(resolved, "Ping Asistan, Ada, Bora, and Uzak Kullanici.");
});

void test("protocol tags delete the whole token on backward delete", () => {
  const rawValue = "Hello <AI0> world";
  const deletion = resolveProtocolTokenDeletionRange(rawValue, "Hello <AI0>".length, "backward");

  assert.deepEqual(deletion, {
    start: "Hello ".length,
    end: "Hello <AI0>".length,
    tag: "<AI0>",
  });
});

void test("protocol tags delete the whole token on forward delete", () => {
  const rawValue = "Hello <US1> world";
  const deletion = resolveProtocolTokenDeletionRange(rawValue, "Hello ".length, "forward");

  assert.deepEqual(deletion, {
    start: "Hello ".length,
    end: "Hello <US1>".length,
    tag: "<US1>",
  });
});

void test("protocol tags ignore plain text around the caret", () => {
  const rawValue = "Hello <AI1> world";

  assert.equal(resolveProtocolTokenDeletionRange(rawValue, 3, "backward"), null);
  assert.equal(resolveProtocolTokenDeletionRange(rawValue, rawValue.length, "forward"), null);
});
