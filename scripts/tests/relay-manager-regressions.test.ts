import assert from "node:assert/strict";
import test from "node:test";

import { RelayManager } from "../../src/js/modules/relay-manager.ts";
import { WebviewManager } from "../../src/js/modules/webview-manager.ts";

async function waitTick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

void test("sync-complete auto source triggers AI-AI relay handler", async () => {
  const originalAIAI = RelayManager._aiaiRelay;
  const originalAIAssistant = RelayManager._aiAssistantRelay;

  let handled = false;

  RelayManager._aiaiRelay = {
    isActive: true,
    handlesProvider: (provider: string) => provider === "ai1",
    handleThinkingComplete: () => {
      handled = true;
    },
  } as unknown as typeof RelayManager._aiaiRelay;

  RelayManager._aiAssistantRelay = {
    isActive: false,
    handlesProvider: () => false,
    handleThinkingComplete: () => {},
  } as unknown as typeof RelayManager._aiAssistantRelay;

  try {
    RelayManager._onSyncComplete({
      detail: {
        provider: "ai1",
        result: { success: true, messages: [{ role: "assistant", text: "ok" }] },
        source: "auto",
      },
    } as unknown as Event);

    await waitTick();
    assert.equal(handled, true);
  } finally {
    RelayManager._aiaiRelay = originalAIAI;
    RelayManager._aiAssistantRelay = originalAIAssistant;
  }
});

void test("sync-complete manual source does not trigger relay forwarding", async () => {
  const originalAIAI = RelayManager._aiaiRelay;
  const originalAIAssistant = RelayManager._aiAssistantRelay;

  let handled = false;

  RelayManager._aiaiRelay = {
    isActive: true,
    handlesProvider: (provider: string) => provider === "ai1",
    handleThinkingComplete: () => {
      handled = true;
    },
  } as unknown as typeof RelayManager._aiaiRelay;

  RelayManager._aiAssistantRelay = {
    isActive: false,
    handlesProvider: () => false,
    handleThinkingComplete: () => {},
  } as unknown as typeof RelayManager._aiAssistantRelay;

  try {
    RelayManager._onSyncComplete({
      detail: {
        provider: "ai1",
        result: { success: true, messages: [{ role: "assistant", text: "manual" }] },
        source: "manual",
      },
    } as unknown as Event);

    await waitTick();
    assert.equal(handled, false);
  } finally {
    RelayManager._aiaiRelay = originalAIAI;
    RelayManager._aiAssistantRelay = originalAIAssistant;
  }
});

void test("AI-Assistant relay uses latest-message sync for ai0 thinking completion", async () => {
  const originalAIAI = RelayManager._aiaiRelay;
  const originalAIAssistant = RelayManager._aiAssistantRelay;
  const originalSyncConversation = WebviewManager.syncConversation;
  const originalSyncLatestMessage = (WebviewManager as unknown as { syncLatestMessage?: unknown })
    .syncLatestMessage;

  let calledConversationSync = 0;
  let calledLatestSync = 0;
  let handled = false;

  RelayManager._aiaiRelay = null;
  RelayManager._aiAssistantRelay = {
    isActive: true,
    handlesProvider: (provider: string) => provider === "ai0",
    checkThinkingTransition: () => true,
    handleThinkingComplete: () => {
      handled = true;
    },
  } as unknown as typeof RelayManager._aiAssistantRelay;

  WebviewManager.syncConversation = (async () => {
    calledConversationSync += 1;
    return { success: true, messages: [{ role: "assistant", text: "from-conversation" }] };
  }) as unknown as typeof WebviewManager.syncConversation;

  (
    WebviewManager as unknown as { syncLatestMessage: (...args: unknown[]) => Promise<unknown> }
  ).syncLatestMessage = async () => {
    calledLatestSync += 1;
    return { success: true, messages: [{ role: "assistant", text: "from-latest" }] };
  };

  try {
    await RelayManager._onTrafficUpdate({
      provider: "ai0",
      state: { thinkingState: "idle" },
    });

    assert.equal(calledLatestSync, 1);
    assert.equal(calledConversationSync, 0);
    assert.equal(handled, true);
  } finally {
    RelayManager._aiaiRelay = originalAIAI;
    RelayManager._aiAssistantRelay = originalAIAssistant;
    WebviewManager.syncConversation = originalSyncConversation;
    (WebviewManager as unknown as { syncLatestMessage?: unknown }).syncLatestMessage =
      originalSyncLatestMessage;
  }
});
