import assert from "node:assert/strict";
import test from "node:test";

import { ConversationSyncer } from "../../src/js/modules/webview/conversation-syncer.ts";
import { ConversationListManager } from "../../src/js/modules/conversation-list-manager.ts";
import { AppState } from "../../src/js/modules/app-state.ts";

type TimeoutFn = typeof globalThis.setTimeout;
type ClearTimeoutFn = typeof globalThis.clearTimeout;

function installWindowMock(): {
  restore: () => void;
} {
  const globalScope = globalThis as unknown as {
    window?: { dispatchEvent: (event: Event) => boolean };
  };
  const originalWindow = globalScope.window;
  globalScope.window = { dispatchEvent: () => true };
  return {
    restore: () => {
      globalScope.window = originalWindow as Window;
    },
  };
}

function installTimerMock(): {
  scheduled: Array<{ fn: () => void; delay: number }>;
  restore: () => void;
} {
  const originalSetTimeout: TimeoutFn = globalThis.setTimeout;
  const originalClearTimeout: ClearTimeoutFn = globalThis.clearTimeout;
  const scheduled: Array<{ fn: () => void; delay: number }> = [];

  globalThis.setTimeout = ((fn: (...args: unknown[]) => void, delay?: number) => {
    scheduled.push({ fn: () => { fn(); }, delay: delay ?? 0 });
    return scheduled.length as unknown as ReturnType<typeof setTimeout>;
  }) as TimeoutFn;

  globalThis.clearTimeout = (() => {});

  return {
    scheduled,
    restore: () => {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    },
  };
}

function resetSyncerState(): void {
  ConversationSyncer._syncRetryTimers = {};
  ConversationSyncer._syncRetryCounts = {};
  ConversationSyncer._syncInProgress = {};
  ConversationSyncer._lastSyncResult = {};
  ConversationSyncer._lastThinkingEndedAt = { ai1: 0, ai2: 0 };
}

void test("auto sync schedules retry when scraped messages are empty", async () => {
  const windowMock = installWindowMock();
  const timerMock = installTimerMock();
  const originalSyncConversation = ConversationSyncer.syncConversation;
  const originalRefresh = ConversationListManager.refresh;

  resetSyncerState();

  ConversationSyncer.syncConversation = async () => ({
    success: true,
    count: 0,
    messages: [],
    commands: [],
    webUrl: "https://chatgpt.com/c/abc",
  });
  ConversationListManager.refresh = async () => {};

  try {
    await ConversationSyncer.syncProvider("ai1", { from: "auto" });
    assert.equal(timerMock.scheduled.length > 0, true);
  } finally {
    ConversationSyncer.syncConversation = originalSyncConversation;
    ConversationListManager.refresh = originalRefresh;
    timerMock.restore();
    windowMock.restore();
  }
});

void test("auto sync does not schedule retry when last message is assistant", async () => {
  const windowMock = installWindowMock();
  const timerMock = installTimerMock();
  const originalSyncConversation = ConversationSyncer.syncConversation;
  const originalRefresh = ConversationListManager.refresh;

  resetSyncerState();

  ConversationSyncer.syncConversation = async () => ({
    success: true,
    count: 2,
    messages: [
      { role: "user", text: "hello" },
      { role: "assistant", text: "hi" },
    ],
    commands: [],
    webUrl: "https://chatgpt.com/c/abc",
  });
  ConversationListManager.refresh = async () => {};

  try {
    await ConversationSyncer.syncProvider("ai1", { from: "auto" });
    assert.equal(timerMock.scheduled.length, 0);
  } finally {
    ConversationSyncer.syncConversation = originalSyncConversation;
    ConversationListManager.refresh = originalRefresh;
    timerMock.restore();
    windowMock.restore();
  }
});

void test("auto sync does not schedule retry when assistant only contains generated images", async () => {
  const windowMock = installWindowMock();
  const timerMock = installTimerMock();
  const originalSyncConversation = ConversationSyncer.syncConversation;
  const originalRefresh = ConversationListManager.refresh;

  resetSyncerState();

  ConversationSyncer.syncConversation = async () => ({
    success: true,
    count: 1,
    messages: [
      {
        role: "assistant",
        text: "",
        generatedImages: [{ id: "img-1", src: "data:image/png;base64,QUJD" }],
      },
    ],
    commands: [],
    webUrl: "https://chatgpt.com/c/abc",
  });
  ConversationListManager.refresh = async () => { await Promise.resolve(); };

  try {
    await ConversationSyncer.syncProvider("ai1", { from: "auto" });
    assert.equal(timerMock.scheduled.length, 0);
  } finally {
    ConversationSyncer.syncConversation = originalSyncConversation;
    ConversationListManager.refresh = originalRefresh;
    timerMock.restore();
    windowMock.restore();
  }
});

void test("ai0 sync returns latest assistant message without DB persistence", async () => {
  const globalScope = globalThis as unknown as {
    window?: {
      electronAPI?: {
        dbSyncMessages?: (...args: unknown[]) => Promise<unknown>;
        dbGetMessages?: (...args: unknown[]) => Promise<unknown>;
      };
    };
  };

  const originalWindow = globalScope.window;
  const originalGetProvider = AppState.getProviderIdForSlot;
  const originalGetAccount = AppState.getAccountForSlot;

  let dbSyncCallCount = 0;

  globalScope.window = {
    electronAPI: {
      dbSyncMessages: async () => {
        dbSyncCallCount += 1;
        return await Promise.resolve({ success: true, conversationId: "c1", added: 0, total: 0 });
      },
      dbGetMessages: async () => await Promise.resolve({ data: [] }),
    },
  };

  AppState.getProviderIdForSlot = (() => "opencode");
  AppState.getAccountForSlot = (() => ({
    id: "opencode_opencode_at_opencode_com",
    provider: "opencode",
  })) as unknown as typeof AppState.getAccountForSlot;

  const mockWebview = {
    getURL: () => "https://opencode.local/chat",
    isLoading: () => false,
    executeJavaScript: async () => await Promise.resolve([
      { role: "user", text: "hello" },
      { role: "assistant", text: "latest assistant reply" },
    ]),
  };

  try {
    const result = await ConversationSyncer.syncConversation("ai0", mockWebview, {});
    assert.equal(result.success, true);
    assert.equal(Array.isArray(result["messages"]), true);
    assert.equal((result["messages"] as unknown[]).length, 1);
    const msg = (result["messages"] as { role: string; text: string }[])[0] as { role: string; text: string };
    assert.equal(msg.role, "assistant");
    assert.equal(msg.text, "latest assistant reply");
    assert.equal(dbSyncCallCount, 0);
  } finally {
    AppState.getProviderIdForSlot = originalGetProvider;
    AppState.getAccountForSlot = originalGetAccount;
    globalScope.window = originalWindow as Window;
  }
});

void test("ai0 syncProvider skips conversation refresh after latest-message sync", async () => {
  const windowMock = installWindowMock();
  const originalSyncConversation = ConversationSyncer.syncConversation;
  const originalRefresh = ConversationListManager.refresh;
  let refreshCallCount = 0;

  resetSyncerState();

  ConversationSyncer.syncConversation = async () => ({
    success: true,
    count: 1,
    messages: [{ role: "assistant", text: "latest assistant reply" }],
    commands: [],
    webUrl: "https://opencode.local/chat",
    conversationId: "conv-ai0",
  });
  ConversationListManager.refresh = async () => {
    refreshCallCount += 1;
  };

  try {
    await ConversationSyncer.syncProvider("ai0", { from: "manual" });
    assert.equal(refreshCallCount, 0);
  } finally {
    ConversationSyncer.syncConversation = originalSyncConversation;
    ConversationListManager.refresh = originalRefresh;
    windowMock.restore();
  }
});

void test("llm sync persists default-page messages and preserves session query", async () => {
  const globalScope = globalThis as unknown as {
    window?: {
      electronAPI?: {
        dbGetConversations?: (...args: unknown[]) => Promise<unknown>;
        dbSyncMessages?: (...args: unknown[]) => Promise<unknown>;
        dbGetMessages?: (...args: unknown[]) => Promise<unknown>;
      };
    };
  };

  const originalWindow = globalScope.window;
  const originalGetProvider = AppState.getProviderIdForSlot;
  const originalGetAccount = AppState.getAccountForSlot;
  const originalGetRelay = AppState.getAssistantRelay;
  const originalGetNickname = AppState.getNickname;
  let syncPayload: Record<string, unknown> | null = null;

  resetSyncerState();

  globalScope.window = {
    electronAPI: {
      dbGetConversations: async () => await Promise.resolve({ data: [] }),
      dbSyncMessages: async (...args: unknown[]) => {
        syncPayload = args[0] as Record<string, unknown> | undefined ?? null;
        return await Promise.resolve({ success: true, conversationId: "conv-llm-1", added: 2, total: 2 });
      },
      dbGetMessages: async () => await Promise.resolve({
        data: [
          { id: "user-1", role: "user", text: "hello", dom_id: "llm-session-1-0" },
          { id: "assistant-1", role: "assistant", text: "local reply", dom_id: "llm-session-1-1" },
        ],
      }),
    },
  };

  AppState.getProviderIdForSlot = (() => "llm");
  AppState.getAccountForSlot = (() => ({
    id: "llm-account-1",
    provider: "llm",
  })) as unknown as typeof AppState.getAccountForSlot;
  AppState.getAssistantRelay = (() => ({
    active: false,
    sourceSlot: null,
  }));
  AppState.getNickname = ((slot: string) => slot);

  const mockWebview = {
    getURL: () => "http://127.0.0.1:9876/?session=llm-session-1",
    isLoading: () => false,
    executeJavaScript: () => [
      {
        role: "user",
        text: "hello",
        index: 0,
        domIndex: 0,
        domId: "llm-session-1-0",
        contentHash: "h-user",
      },
      {
        role: "assistant",
        text: "local reply",
        index: 1,
        domIndex: 1,
        domId: "llm-session-1-1",
        contentHash: "h-assistant",
      },
    ],
  };

  try {
    const result = await ConversationSyncer.syncConversation("ai1", mockWebview as any, {
      catchEnabled: false,
    });

    assert.equal(result.success, true);
    assert.equal(result.conversationId, "conv-llm-1");
    assert.equal(result["webUrl"], "http://127.0.0.1:9876/?session=llm-session-1");
    assert.equal(syncPayload?.["webUrl"], "http://127.0.0.1:9876/?session=llm-session-1");
    assert.equal((syncPayload["messages"] as unknown[]).length, 2);
  } finally {
    AppState.getProviderIdForSlot = originalGetProvider;
    AppState.getAccountForSlot = originalGetAccount;
    AppState.getAssistantRelay = originalGetRelay;
    AppState.getNickname = originalGetNickname;
    globalScope.window = originalWindow as any;
  }
});

void test("_getArchiveStatus keeps llm local sessions distinct by query", async () => {
  const globalScope = globalThis as unknown as {
    window?: {
      electronAPI?: {
        dbGetConversations?: (...args: unknown[]) => Promise<unknown>;
      };
    };
  };

  const originalWindow = globalScope.window;
  const originalGetProvider = AppState.getProviderIdForSlot;
  const originalGetAccount = AppState.getAccountForSlot;

  globalScope.window = {
    electronAPI: {
      dbGetConversations: async () => ({
        success: true,
        data: [
          {
            id: "conv-llm-1",
            webUrl: "http://127.0.0.1:9876/?session=llm-session-1",
            messageCount: 2,
          },
        ],
      }),
    },
  };

  AppState.getProviderIdForSlot = (() => "llm");
  AppState.getAccountForSlot = (() => ({
    id: "llm-account-1",
    provider: "llm",
  })) as unknown as typeof AppState.getAccountForSlot;

  try {
    const existing = await ConversationSyncer._getArchiveStatus(
      "ai1",
      "http://127.0.0.1:9876/?session=llm-session-1"
    );
    const otherSession = await ConversationSyncer._getArchiveStatus(
      "ai1",
      "http://127.0.0.1:9876/?session=llm-session-2"
    );

    assert.equal(existing.newEntry, false);
    assert.equal(existing.prevCount, 2);
    assert.equal(otherSession.newEntry, true);
  } finally {
    AppState.getProviderIdForSlot = originalGetProvider;
    AppState.getAccountForSlot = originalGetAccount;
    globalScope.window = originalWindow as any;
  }
});

void test("syncConversation saves generated images as assistant attachments", async () => {
  const globalScope = globalThis as unknown as {
    window?: {
      electronAPI?: {
        dbSyncMessages?: (...args: unknown[]) => Promise<unknown>;
        dbGetMessages?: (...args: unknown[]) => Promise<unknown>;
        dbGetAttachments?: (...args: unknown[]) => Promise<unknown>;
        dbSaveAttachmentContent?: (...args: unknown[]) => Promise<unknown>;
        capturePage?: (...args: unknown[]) => Promise<unknown>;
      };
    };
  };

  const originalWindow = globalScope.window;
  const originalGetProvider = AppState.getProviderIdForSlot;
  const originalGetAccount = AppState.getAccountForSlot;
  const originalGetRelay = AppState.getAssistantRelay;
  const originalGetNickname = AppState.getNickname;

  const saveCalls: Array<Record<string, unknown>> = [];
  let captureCallCount = 0;
  let executeCount = 0;

  globalScope.window = {
    electronAPI: {
      dbSyncMessages: async () => ({ success: true, conversationId: "c1", added: 1, total: 1 }),
      dbGetMessages: async () => ({
        data: [
          {
            id: "db-assistant-1",
            role: "assistant",
            content: "[image]",
            dom_index: 0,
            content_hash: "h1",
            created_at: 123,
          },
        ],
      }),
      dbGetAttachments: async () => ({ success: true, data: [] }),
      dbSaveAttachmentContent: ((payload: Record<string, unknown>) => {
        saveCalls.push(payload);
        return { success: true, data: { attachmentId: "att-1", storedPath: "/tmp/generated.png" } };
      }) as unknown as (...args: unknown[]) => Promise<unknown>,
      capturePage: async () => {
        captureCallCount += 1;
        return { success: false };
      },
    },
  };

  AppState.getProviderIdForSlot = (() => "chatgpt");
  AppState.getAccountForSlot = (() => ({
    id: "account-1",
    provider: "chatgpt",
  })) as unknown as typeof AppState.getAccountForSlot;
  AppState.getAssistantRelay = (() => ({
    active: false,
    sourceSlot: null,
  }));
  AppState.getNickname = ((slot: string) => slot);

  const mockWebview = {
    getURL: () => "https://chatgpt.com/c/generated-image",
    executeJavaScript: () => {
      executeCount += 1;
      if (executeCount === 1) {
        return [
          {
            role: "assistant",
            text: "[image]",
            index: 0,
            domIndex: 0,
            contentHash: "h1",
            generatedImages: [
              {
                id: "img-1",
                src: "data:image/png;base64,QUJD",
                currentSrc: "data:image/png;base64,QUJD",
                alt: "Generated image",
                mimeType: "image/png",
                originalName: "generated-image-chatgpt-01-img-1.png",
                imageIndex: 0,
              },
            ],
          },
        ];
      }

      return {
        success: true,
        base64: "QUJD",
        mimeType: "image/png",
        rect: null,
      };
    },
  };

  try {
    const result = await ConversationSyncer.syncConversation("ai1", mockWebview as any, {});
    assert.equal(result.success, true);
    assert.equal(saveCalls.length, 1);
    assert.equal(saveCalls[0]?.["messageId"], "db-assistant-1");
    assert.equal(saveCalls[0]["base64"], "QUJD");
    assert.equal(captureCallCount, 0);
  } finally {
    AppState.getProviderIdForSlot = originalGetProvider;
    AppState.getAccountForSlot = originalGetAccount;
    AppState.getAssistantRelay = originalGetRelay;
    AppState.getNickname = originalGetNickname;
    globalScope.window = originalWindow as any;
  }
});

void test("_getArchiveStatus reads wrapped conversation payloads from IPC", async () => {
  const globalScope = globalThis as unknown as {
    window?: {
      electronAPI?: {
        dbGetConversations?: (...args: unknown[]) => Promise<unknown>;
      };
    };
  };

  const originalWindow = globalScope.window;
  const originalGetAccount = AppState.getAccountForSlot;

  globalScope.window = {
    electronAPI: {
      dbGetConversations: async () => ({
        success: true,
        data: [
          {
            id: "conversation-1",
            webUrl: "https://chatgpt.com/c/archive-demo",
            messageCount: 7,
          },
        ],
      }),
    },
  };

  AppState.getAccountForSlot = (() => ({
    id: "account-1",
    provider: "chatgpt",
  })) as unknown as typeof AppState.getAccountForSlot;

  try {
    const result = await ConversationSyncer._getArchiveStatus(
      "ai1",
      "https://chatgpt.com/c/archive-demo"
    );

    assert.equal(result.newEntry, false);
    assert.equal(result.prevCount, 7);
    assert.equal(result.existing?.webUrl, "https://chatgpt.com/c/archive-demo");
  } finally {
    AppState.getAccountForSlot = originalGetAccount;
    globalScope.window = originalWindow as any;
  }
});

void test("syncConversation skips generated image save when attachment already exists", async () => {
  const globalScope = globalThis as unknown as {
    window?: {
      electronAPI?: {
        dbSyncMessages?: (...args: unknown[]) => Promise<unknown>;
        dbGetMessages?: (...args: unknown[]) => Promise<unknown>;
        dbGetAttachments?: (...args: unknown[]) => Promise<unknown>;
        dbSaveAttachmentContent?: (...args: unknown[]) => Promise<unknown>;
      };
    };
  };

  const originalWindow = globalScope.window;
  const originalGetProvider = AppState.getProviderIdForSlot;
  const originalGetAccount = AppState.getAccountForSlot;
  const originalGetRelay = AppState.getAssistantRelay;
  const originalGetNickname = AppState.getNickname;

  let saveCallCount = 0;
  let executeCount = 0;

  globalScope.window = {
    electronAPI: {
      dbSyncMessages: async () => ({ success: true, conversationId: "c1", added: 1, total: 1 }),
      dbGetMessages: async () => ({
        data: [
          {
            id: "db-assistant-1",
            role: "assistant",
            content: "[image]",
            dom_index: 0,
            content_hash: "h1",
            created_at: 123,
          },
        ],
      }),
      dbGetAttachments: async () => ({
        success: true,
        data: [
          {
            message_id: "db-assistant-1",
            original_name: "generated-image-chatgpt-01-img-1.png",
          },
        ],
      }),
      dbSaveAttachmentContent: async () => {
        saveCallCount += 1;
        return { success: true };
      },
    },
  };

  AppState.getProviderIdForSlot = (() => "chatgpt");
  AppState.getAccountForSlot = (() => ({
    id: "account-1",
    provider: "chatgpt",
  })) as unknown as typeof AppState.getAccountForSlot;
  AppState.getAssistantRelay = (() => ({
    active: false,
    sourceSlot: null,
  }));
  AppState.getNickname = ((slot: string) => slot);

  const mockWebview = {
    getURL: () => "https://chatgpt.com/c/generated-image",
    executeJavaScript: () => {
      executeCount += 1;
      return [
        {
          role: "assistant",
          text: "[image]",
          index: 0,
          domIndex: 0,
          contentHash: "h1",
          generatedImages: [
            {
              id: "img-1",
              src: "data:image/png;base64,QUJD",
              currentSrc: "data:image/png;base64,QUJD",
              alt: "Generated image",
              mimeType: "image/png",
              originalName: "generated-image-chatgpt-01-img-1.png",
              imageIndex: 0,
            },
          ],
        },
      ];
    },
  };

  try {
    const result = await ConversationSyncer.syncConversation("ai1", mockWebview as any, {});
    assert.equal(result.success, true);
    assert.equal(saveCallCount, 0);
    assert.equal(executeCount, 2);
  } finally {
    AppState.getProviderIdForSlot = originalGetProvider;
    AppState.getAccountForSlot = originalGetAccount;
    AppState.getAssistantRelay = originalGetRelay;
    AppState.getNickname = originalGetNickname;
    globalScope.window = originalWindow as any;
  }
});

void test("syncConversation replaces preview image attachment when final bytes change", async () => {
  const globalScope = globalThis as unknown as {
    window?: {
      electronAPI?: {
        dbSyncMessages?: (...args: unknown[]) => Promise<unknown>;
        dbGetMessages?: (...args: unknown[]) => Promise<unknown>;
        dbGetAttachments?: (...args: unknown[]) => Promise<unknown>;
        dbSaveAttachmentContent?: (...args: unknown[]) => Promise<unknown>;
        readFile?: (path: string) => Promise<string | null>;
      };
    };
  };

  const originalWindow = globalScope.window;
  const originalGetProvider = AppState.getProviderIdForSlot;
  const originalGetAccount = AppState.getAccountForSlot;
  const originalGetRelay = AppState.getAssistantRelay;
  const originalGetNickname = AppState.getNickname;
  const saveCalls: Array<Record<string, unknown>> = [];
  let executeCount = 0;

  globalScope.window = {
    electronAPI: {
      dbSyncMessages: async () => ({ success: true, conversationId: "c1", added: 1, total: 1 }),
      dbGetMessages: async () => ({
        data: [
          {
            id: "db-assistant-1",
            role: "assistant",
            content: "[image]",
            dom_index: 0,
            content_hash: "h1",
            created_at: 123,
          },
        ],
      }),
      dbGetAttachments: async () => ({
        success: true,
        data: [
          {
            message_id: "db-assistant-1",
            original_name: "generated-image-ai1-01-stable.png",
            stored_path: "/tmp/generated-preview.png",
          },
        ],
      }),
      readFile: async () => "UFJFVklFVw==",
      dbSaveAttachmentContent: ((payload: Record<string, unknown>) => {
        saveCalls.push(payload);
        return {
          success: true,
          data: { attachmentId: "att-1", storedPath: "/tmp/generated-preview.png" },
        };
      }) as unknown as (...args: unknown[]) => Promise<unknown>,
    },
  };

  AppState.getProviderIdForSlot = (() => "chatgpt");
  AppState.getAccountForSlot = (() => ({
    id: "account-1",
    provider: "chatgpt",
  })) as unknown as typeof AppState.getAccountForSlot;
  AppState.getAssistantRelay = (() => ({
    active: false,
    sourceSlot: null,
  }));
  AppState.getNickname = ((slot: string) => slot);

  const mockWebview = {
    getURL: () => "https://chatgpt.com/c/generated-image",
    executeJavaScript: () => {
      executeCount += 1;
      if (executeCount === 1) {
        return [
          {
            role: "assistant",
            text: "[image]",
            index: 0,
            domIndex: 0,
            contentHash: "h1",
            generatedImages: [
              {
                stableKey: "stable",
                src: "https://cdn.example.test/final.png",
                currentSrc: "https://cdn.example.test/final.png",
                mimeType: "image/png",
                originalName: "generated-image-ai1-01-stable.png",
                imageIndex: 0,
              },
            ],
          },
        ];
      }

      return {
        success: true,
        base64: "RklOQUw=",
        mimeType: "image/png",
        rect: null,
      };
    },
  };

  try {
    const result = await ConversationSyncer.syncConversation("ai1", mockWebview as any, {});
    assert.equal(result.success, true);
    assert.equal(saveCalls.length, 1);
    assert.equal(saveCalls[0]?.["originalName"], "generated-image-ai1-01-stable.png");
    assert.equal(saveCalls[0]["base64"], "RklOQUw=");
  } finally {
    AppState.getProviderIdForSlot = originalGetProvider;
    AppState.getAccountForSlot = originalGetAccount;
    AppState.getAssistantRelay = originalGetRelay;
    AppState.getNickname = originalGetNickname;
    globalScope.window = originalWindow as any;
  }
});

void test("syncConversation uses a post-thinking probe to pick up generated images", async () => {
  const globalScope = globalThis as unknown as {
    window?: {
      electronAPI?: {
        dbSyncMessages?: (...args: unknown[]) => Promise<unknown>;
        dbGetMessages?: (...args: unknown[]) => Promise<unknown>;
        dbGetAttachments?: (...args: unknown[]) => Promise<unknown>;
        dbSaveAttachmentContent?: (...args: unknown[]) => Promise<unknown>;
      };
    };
  };

  const originalWindow = globalScope.window;
  const originalGetProvider = AppState.getProviderIdForSlot;
  const originalGetAccount = AppState.getAccountForSlot;
  const originalGetRelay = AppState.getAssistantRelay;
  const originalGetNickname = AppState.getNickname;
  const originalProbeDelay = ConversationSyncer.postThinkingProbePollMs;
  const originalProbeMaxPolls = ConversationSyncer.postThinkingProbeMaxPolls;

  const saveCalls: Array<Record<string, unknown>> = [];
  let executeCount = 0;

  globalScope.window = {
    electronAPI: {
      dbSyncMessages: async () => ({ success: true, conversationId: "c1", added: 1, total: 1 }),
      dbGetMessages: async () => ({
        data: [
          {
            id: "db-assistant-1",
            role: "assistant",
            content: "[image]",
            dom_index: 0,
            content_hash: "h1",
            created_at: 123,
          },
        ],
      }),
      dbGetAttachments: async () => ({ success: true, data: [] }),
      dbSaveAttachmentContent: ((payload: Record<string, unknown>) => {
        saveCalls.push(payload);
        return { success: true, data: { attachmentId: "att-1", storedPath: "/tmp/generated.png" } };
      }) as unknown as (...args: unknown[]) => Promise<unknown>,
    },
  };

  AppState.getProviderIdForSlot = (() => "chatgpt");
  AppState.getAccountForSlot = (() => ({
    id: "account-1",
    provider: "chatgpt",
  })) as unknown as typeof AppState.getAccountForSlot;
  AppState.getAssistantRelay = (() => ({
    active: false,
    sourceSlot: null,
  }));
  AppState.getNickname = ((slot: string) => slot);

  ConversationSyncer.postThinkingProbePollMs = 0;
  ConversationSyncer.postThinkingProbeMaxPolls = 1;
  ConversationSyncer._lastThinkingEndedAt["ai1"] = Date.now();

  const mockWebview = {
    getURL: () => "https://chatgpt.com/c/generated-image",
    executeJavaScript: () => {
      executeCount += 1;
      if (executeCount === 1) {
        return [
          {
            role: "assistant",
            text: "[image]",
            index: 0,
            domIndex: 0,
            contentHash: "h1",
            generatedImages: [],
          },
        ];
      }

      if (executeCount === 2) {
        return [
          {
            role: "assistant",
            text: "[image]",
            index: 0,
            domIndex: 0,
            contentHash: "h1",
            generatedImages: [
              {
                stableKey: "stable",
                currentSrc: "data:image/png;base64,QUJD",
                mimeType: "image/png",
                originalName: "generated-image-ai1-01-stable.png",
                imageIndex: 0,
              },
            ],
          },
        ];
      }

      return {
        success: true,
        base64: "QUJD",
        mimeType: "image/png",
        rect: null,
      };
    },
  };

  try {
    const result = await ConversationSyncer.syncConversation("ai1", mockWebview as any, {
      source: "auto",
    });
    assert.equal(result.success, true);
    assert.equal(saveCalls.length, 1);
  } finally {
    AppState.getProviderIdForSlot = originalGetProvider;
    AppState.getAccountForSlot = originalGetAccount;
    AppState.getAssistantRelay = originalGetRelay;
    AppState.getNickname = originalGetNickname;
    ConversationSyncer.postThinkingProbePollMs = originalProbeDelay;
    ConversationSyncer.postThinkingProbeMaxPolls = originalProbeMaxPolls;
    globalScope.window = originalWindow as any;
  }
});

void test("syncConversation prefers webcontents capture fallback and isolates image save failures", async () => {
  const globalScope = globalThis as unknown as {
    window?: {
      electronAPI?: {
        dbSyncMessages?: (...args: unknown[]) => Promise<unknown>;
        dbGetMessages?: (...args: unknown[]) => Promise<unknown>;
        dbGetAttachments?: (...args: unknown[]) => Promise<unknown>;
        dbSaveAttachmentContent?: (...args: unknown[]) => Promise<unknown>;
        captureWebContentsPage?: (...args: unknown[]) => Promise<unknown>;
        capturePage?: (...args: unknown[]) => Promise<unknown>;
      };
    };
  };

  const originalWindow = globalScope.window;
  const originalGetProvider = AppState.getProviderIdForSlot;
  const originalGetAccount = AppState.getAccountForSlot;
  const originalGetRelay = AppState.getAssistantRelay;
  const originalGetNickname = AppState.getNickname;
  const saveCalls: Array<Record<string, unknown>> = [];
  let guestCaptureCalls = 0;
  let windowCaptureCalls = 0;
  let executeCount = 0;

  globalScope.window = {
    electronAPI: {
      dbSyncMessages: async () => ({ success: true, conversationId: "c1", added: 1, total: 1 }),
      dbGetMessages: async () => ({
        data: [
          {
            id: "db-assistant-1",
            role: "assistant",
            content: "[image]",
            dom_index: 0,
            content_hash: "h1",
            created_at: 123,
          },
        ],
      }),
      dbGetAttachments: async () => ({ success: true, data: [] }),
      dbSaveAttachmentContent: ((payload: Record<string, unknown>) => {
        saveCalls.push(payload);
        if (saveCalls.length === 1) {
          return { success: false, error: "first-failed" };
        }
        return {
          success: true,
          data: { attachmentId: "att-2", storedPath: "/tmp/generated-2.png" },
        };
      }) as unknown as (...args: unknown[]) => Promise<unknown>,
      captureWebContentsPage: async () => {
        guestCaptureCalls += 1;
        return { success: true, dataUrl: "data:image/png;base64,Q0FQVFVSRTI=" };
      },
      capturePage: async () => {
        windowCaptureCalls += 1;
        return { success: true, dataUrl: "data:image/png;base64,V0lORE9X" };
      },
    },
  };

  AppState.getProviderIdForSlot = (() => "chatgpt");
  AppState.getAccountForSlot = (() => ({
    id: "account-1",
    provider: "chatgpt",
  })) as unknown as typeof AppState.getAccountForSlot;
  AppState.getAssistantRelay = (() => ({
    active: false,
    sourceSlot: null,
  }));
  AppState.getNickname = ((slot: string) => slot);

  const mockWebview = {
    getURL: () => "https://chatgpt.com/c/generated-image",
    getWebContentsId: () => 42,
    executeJavaScript: () => {
      executeCount += 1;
      if (executeCount === 1) {
        return [
          {
            role: "assistant",
            text: "[image]",
            index: 0,
            domIndex: 0,
            contentHash: "h1",
            generatedImages: [
              {
                stableKey: "stable-1",
                currentSrc: "https://cdn.example.test/first.png",
                mimeType: "image/png",
                originalName: "generated-image-ai1-01-stable-1.png",
                imageIndex: 0,
              },
              {
                stableKey: "stable-2",
                currentSrc: "https://cdn.example.test/second.png",
                mimeType: "image/png",
                originalName: "generated-image-ai1-02-stable-2.png",
                imageIndex: 1,
              },
            ],
          },
        ];
      }

      return {
        success: false,
        base64: "",
        mimeType: "image/png",
        rect: { x: 5, y: 8, width: 120, height: 90 },
      };
    },
  };

  try {
    const result = await ConversationSyncer.syncConversation("ai1", mockWebview as any, {});
    assert.equal(result.success, true);
    assert.equal(result["generatedImageSavedCount"], 1);
    assert.equal(result["generatedImagePendingCount"], 1);
    assert.equal(guestCaptureCalls, 2);
    assert.equal(windowCaptureCalls, 0);
  } finally {
    AppState.getProviderIdForSlot = originalGetProvider;
    AppState.getAccountForSlot = originalGetAccount;
    AppState.getAssistantRelay = originalGetRelay;
    AppState.getNickname = originalGetNickname;
    globalScope.window = originalWindow as any;
  }
});
