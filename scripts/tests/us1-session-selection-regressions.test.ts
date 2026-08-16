import assert from "node:assert/strict";
import test from "node:test";

import { resolveUs1ForceSelectConversationId } from "../../src/js/modules/us1-session-selection.ts";

void test("US1 session selection keeps an explicit non-new conversation selection", () => {
  const result = resolveUs1ForceSelectConversationId({
    selectedConversationId: "conv-existing",
    resultConversationId: "conv-fallback",
    sessionEvents: [
      {
        remoteUserId: "remote@example.com",
        localSessionId: "session-1",
        conversationId: "conv-event",
        isNewSession: true,
      },
    ],
    targetRemoteUserId: "remote@example.com",
  });

  assert.equal(result, "conv-existing");
});

void test("US1 session selection falls back to the latest matching session event when new is selected", () => {
  const result = resolveUs1ForceSelectConversationId({
    selectedConversationId: "new",
    resultConversationId: null,
    sessionEvents: [
      {
        remoteUserId: "remote@example.com",
        localSessionId: "session-1",
        conversationId: "conv-1",
        isNewSession: true,
      },
      {
        remoteUserId: "remote@example.com",
        localSessionId: "session-2",
        conversationId: "conv-2",
        isNewSession: true,
      },
    ],
    targetRemoteUserId: "remote@example.com",
  });

  assert.equal(result, "conv-2");
});

void test("US1 session selection can preserve an explicit new selection", () => {
  const result = resolveUs1ForceSelectConversationId({
    selectedConversationId: "new",
    resultConversationId: "conv-fallback",
    sessionEvents: [
      {
        remoteUserId: "remote@example.com",
        localSessionId: "session-1",
        conversationId: "conv-1",
        isNewSession: true,
      },
    ],
    targetRemoteUserId: "remote@example.com",
    preserveExplicitNewSelection: true,
  });

  assert.equal(result, undefined);
});

void test("US1 session selection ignores session events from other remote users", () => {
  const result = resolveUs1ForceSelectConversationId({
    selectedConversationId: "new",
    resultConversationId: "conv-fallback",
    sessionEvents: [
      {
        remoteUserId: "target@example.com",
        localSessionId: "session-target",
        conversationId: "conv-target",
        isNewSession: true,
      },
      {
        remoteUserId: "other@example.com",
        localSessionId: "session-other",
        conversationId: "conv-other",
        isNewSession: true,
      },
    ],
    targetRemoteUserId: "target@example.com",
  });

  assert.equal(result, "conv-target");
});
