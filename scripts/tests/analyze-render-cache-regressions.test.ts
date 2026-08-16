import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAttachmentsByMessage,
  buildRenderSnapshot,
  canUseIncrementalAppend,
  getScrollTopAfterPrepend,
  shouldAutoScrollToBottom,
  shouldSkipRender,
} from "../../src/js/pages/analyze/render-cache.ts";

void test("shouldSkipRender returns true for identical snapshot", () => {
  const messages = [
    {
      id: "m1",
      role: "assistant",
      content: "Merhaba",
      createdAt: 100,
    },
  ];

  const attachments = [
    {
      messageId: "m1",
      originalName: "a.txt",
      storedName: "a-1.txt",
      storedPath: "data/p/a-1.txt",
    },
  ];

  const prev = buildRenderSnapshot("c1", messages, attachments);
  const next = buildRenderSnapshot("c1", messages, attachments);

  assert.equal(shouldSkipRender(prev, next), true);
});

void test("shouldSkipRender returns false when attachments changed", () => {
  const messages = [
    {
      id: "m1",
      role: "assistant",
      content: "Merhaba",
      createdAt: 100,
    },
  ];

  const prev = buildRenderSnapshot("c1", messages, [
    {
      messageId: "m1",
      originalName: "a.txt",
      storedName: "a-1.txt",
      storedPath: "data/p/a-1.txt",
    },
  ]);

  const next = buildRenderSnapshot("c1", messages, [
    {
      messageId: "m1",
      originalName: "b.txt",
      storedName: "b-1.txt",
      storedPath: "data/p/b-1.txt",
    },
  ]);

  assert.equal(shouldSkipRender(prev, next), false);
});

void test("shouldSkipRender returns false when attachment mime type changed", () => {
  const messages = [
    {
      id: "m1",
      role: "assistant",
      content: "Merhaba",
      createdAt: 100,
    },
  ];

  const prev = buildRenderSnapshot("c1", messages, [
    {
      messageId: "m1",
      originalName: "image.png",
      storedName: "image.png",
      storedPath: "data/p/image.png",
      mimeType: "image/png",
    },
  ]);

  const next = buildRenderSnapshot("c1", messages, [
    {
      messageId: "m1",
      originalName: "image.png",
      storedName: "image.png",
      storedPath: "data/p/image.png",
      mimeType: "image/webp",
    },
  ]);

  assert.equal(shouldSkipRender(prev, next), false);
});

void test("shouldSkipRender returns false when conversation changes", () => {
  const messages = [
    {
      id: "m1",
      role: "assistant",
      content: "Merhaba",
      createdAt: 100,
    },
  ];

  const attachments = [
    {
      messageId: "m1",
      originalName: "a.txt",
      storedName: "a-1.txt",
      storedPath: "data/p/a-1.txt",
    },
  ];

  const prev = buildRenderSnapshot("c1", messages, attachments);
  const next = buildRenderSnapshot("c2", messages, attachments);

  assert.equal(shouldSkipRender(prev, next), false);
});

void test("buildAttachmentsByMessage groups attachments by message id", () => {
  const map = buildAttachmentsByMessage([
    {
      messageId: "m1",
      originalName: "a.txt",
      storedName: "a-1.txt",
      storedPath: "data/p/a-1.txt",
    },
    {
      messageId: "m1",
      originalName: "b.txt",
      storedName: "b-1.txt",
      storedPath: "data/p/b-1.txt",
    },
    {
      messageId: "m2",
      originalName: "c.txt",
      storedName: "c-1.txt",
      storedPath: "data/p/c-1.txt",
    },
  ]);

  assert.equal((map["m1"] ?? []).length, 2);
  assert.equal((map["m2"] ?? []).length, 1);
});

void test("getScrollTopAfterPrepend preserves viewport offset", () => {
  const value = getScrollTopAfterPrepend({
    previousScrollTop: 180,
    previousHeight: 1200,
    nextHeight: 1560,
  });

  assert.equal(value, 540);
});

void test("canUseIncrementalAppend returns append point when messages only appended", () => {
  const result = canUseIncrementalAppend({
    previousMessages: [
      { id: "m1", role: "user", text: "a", createdAt: 1 },
      { id: "m2", role: "assistant", text: "b", createdAt: 2 },
    ],
    nextMessages: [
      { id: "m1", role: "user", text: "a", createdAt: 1 },
      { id: "m2", role: "assistant", text: "b", createdAt: 2 },
      { id: "m3", role: "assistant", text: "c", createdAt: 3 },
    ],
    previousAttachmentsByMessage: {
      m1: [],
      m2: [{ messageId: "m2", originalName: "a.txt" }],
    },
    nextAttachmentsByMessage: {
      m1: [],
      m2: [{ messageId: "m2", originalName: "a.txt" }],
      m3: [{ messageId: "m3", originalName: "b.txt" }],
    },
  });

  assert.equal(result.canAppend, true);
  assert.equal(result.appendStart, 2);
});

void test("canUseIncrementalAppend returns false when old message content changed", () => {
  const result = canUseIncrementalAppend({
    previousMessages: [
      { id: "m1", role: "user", text: "a", createdAt: 1 },
      { id: "m2", role: "assistant", text: "b", createdAt: 2 },
    ],
    nextMessages: [
      { id: "m1", role: "user", text: "a", createdAt: 1 },
      { id: "m2", role: "assistant", text: "changed", createdAt: 2 },
      { id: "m3", role: "assistant", text: "c", createdAt: 3 },
    ],
    previousAttachmentsByMessage: {
      m1: [],
      m2: [],
    },
    nextAttachmentsByMessage: {
      m1: [],
      m2: [],
      m3: [],
    },
  });

  assert.equal(result.canAppend, false);
});

void test("canUseIncrementalAppend returns false when old attachment list changed", () => {
  const result = canUseIncrementalAppend({
    previousMessages: [
      { id: "m1", role: "user", text: "a", createdAt: 1 },
      { id: "m2", role: "assistant", text: "b", createdAt: 2 },
    ],
    nextMessages: [
      { id: "m1", role: "user", text: "a", createdAt: 1 },
      { id: "m2", role: "assistant", text: "b", createdAt: 2 },
      { id: "m3", role: "assistant", text: "c", createdAt: 3 },
    ],
    previousAttachmentsByMessage: {
      m1: [],
      m2: [{ messageId: "m2", originalName: "a.txt" }],
    },
    nextAttachmentsByMessage: {
      m1: [],
      m2: [{ messageId: "m2", originalName: "changed.txt" }],
      m3: [],
    },
  });

  assert.equal(result.canAppend, false);
});

void test("shouldAutoScrollToBottom returns true when near bottom", () => {
  const shouldScroll = shouldAutoScrollToBottom({
    scrollTop: 860,
    clientHeight: 200,
    scrollHeight: 1100,
    thresholdPx: 50,
  });

  assert.equal(shouldScroll, true);
});

void test("shouldAutoScrollToBottom returns false when user reading old messages", () => {
  const shouldScroll = shouldAutoScrollToBottom({
    scrollTop: 400,
    clientHeight: 200,
    scrollHeight: 1100,
    thresholdPx: 50,
  });

  assert.equal(shouldScroll, false);
});
