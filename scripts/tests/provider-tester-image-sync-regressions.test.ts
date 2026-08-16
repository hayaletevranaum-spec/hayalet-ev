import assert from "node:assert/strict";
import test from "node:test";

import { ProviderTester } from "../../electron/provider-tester/index.ts";
import { hashString } from "../../src/js/modules/webview/providers/shared/scraper-helpers.ts";

function createConfig() {
  return {
    id: "chatgpt",
    name: "ChatGPT",
    baseUrl: "https://chatgpt.com",
    loginUrl: "https://chatgpt.com/auth/login",
    lastVerified: "2026-03-31",
    selectors: {
      sendButton: "button",
      stopButton: "button.stop",
      inputField: "textarea",
      messageContainer: "main",
      generatedImage: "img.generated",
    },
    inputType: "direct",
    scrollerSelectors: [],
    scrapeSelectors: {
      preferred: "main",
      fallback: "main",
    },
    fileInputSelectors: [],
    uploadTargetSelectors: [],
    criticalSelectors: [],
    contentContainers: [],
    excludedUrls: [],
    filters: {
      selectors: [],
      hosts: [],
      blockResourceTypes: [],
    },
    telemetry: {
      endpoints: [],
      tokenPaths: [],
    },
  };
}

function createFakeWebview(responses: unknown[]) {
  let callIndex = 0;

  return {
    getURL: () => "https://chatgpt.com/c/test-sync",
    loadURL: () => {},
    executeJavaScript: () => responses[callIndex++] ?? null,
    addEventListener: () => {},
  };
}

void test("provider tester full sync archives generated image attachments", async () => {
  const syncMessagesCalls: unknown[] = [];
  const saveAttachmentCalls: unknown[] = [];
  const rawMessages = [
    {
      role: "user",
      text: "draw a red apple",
      index: 0,
      domId: "user-1",
      contentHash: hashString("draw a red apple"),
    },
    {
      role: "assistant",
      text: "[image]",
      index: 1,
      domId: "assistant-1",
      contentHash: hashString("[image]"),
      generatedImages: [
        {
          id: "img-1",
          currentSrc: "https://cdn.example.test/generated/apple.png",
          mimeType: "image/png",
          originalName: "generated-image-01-img-1.png",
          imageIndex: 0,
        },
      ],
    },
  ];
  const fakeWebview = createFakeWebview([
    {
      success: true,
      base64: "ZmFrZS1pbWFnZS1ieXRlcw==",
      mimeType: "image/png",
      rect: { x: 10, y: 20, width: 200, height: 150 },
    },
  ]);
  const databaseManager = {
    syncMessages: (_event: null, params: unknown) => {
      syncMessagesCalls.push(params);
      return {
        success: true,
        conversationId: "conv-1",
        added: 2,
        total: 2,
      };
    },
    getMessages: () => ({
      success: true,
      data: [
        {
          id: "assistant-db-1",
          role: "assistant" as const,
          content: "[image]",
          dom_index: 1,
          dom_id: "assistant-1",
          content_hash: hashString("[image]"),
        },
      ],
    }),
    upsertConversationMetadata: () => ({
      success: true,
      data: {
        conversationId: "conv-1",
        created: false,
        title: "Test sync",
        titleUpdated: false,
      },
    }),
    getAttachments: () => ({
      success: true,
      data: [],
    }),
    saveAttachmentContent: (_event: null, params: unknown) => {
      saveAttachmentCalls.push(params);
      return {
        success: true,
        data: {
          attachmentId: "attachment-1",
          storedPath: "attachments/attachment-1.png",
        },
      };
    },
    resetConversationMessages: () => ({
      success: true,
      data: {
        conversationId: "conv-1",
        deletedCount: 0,
      },
    }),
  };

  const tester = new ProviderTester(fakeWebview as never, createConfig() as never, "ai1", undefined, {
    emitProgress: undefined,
    databaseManager: databaseManager as never,
  });
  const testerInternals = tester as unknown as {
    scrapeActiveConversationMessages: () => Promise<unknown[]>;
    performFullSyncForSession: (
      session: { title: string; url: string },
      accountId: string
    ) => Promise<{
      generatedImageSavedCount: number;
      generatedImagePendingCount: number;
    }>;
  };
   testerInternals.scrapeActiveConversationMessages = async () => {
      await Promise.resolve(undefined);
      return rawMessages;
    };
  
    const result = await testerInternals.performFullSyncForSession(
      { title: "Test sync", url: "https://chatgpt.com/c/test-sync" },
      "account-1"
    );
  
    assert.equal(result.generatedImageSavedCount, 1);
    assert.equal(result.generatedImagePendingCount, 0);
    assert.equal(syncMessagesCalls.length, 1);
    assert.equal(saveAttachmentCalls.length, 1);
    assert.deepEqual(syncMessagesCalls[0], {
      accountId: "account-1",
      webUrl: "https://chatgpt.com/c/test-sync",
      messages: [
      {
        role: "user",
        text: "draw a red apple",
        index: 0,
        domId: "user-1",
        contentHash: hashString("draw a red apple"),
      },
      {
        role: "assistant",
        text: "[image]",
        index: 1,
        domId: "assistant-1",
        contentHash: hashString("[image]"),
        generatedImages: [
          {
            id: "img-1",
            currentSrc: "https://cdn.example.test/generated/apple.png",
            mimeType: "image/png",
            originalName: "generated-image-01-img-1.png",
            imageIndex: 0,
          },
        ],
      },
    ],
  });
  assert.deepEqual(saveAttachmentCalls[0], {
    accountId: "account-1",
    conversationId: "conv-1",
    messageId: "assistant-db-1",
    base64: "ZmFrZS1pbWFnZS1ieXRlcw==",
    originalName: "generated-image-01-img-1.png",
    mimeType: "image/png",
  });
});

void test("provider tester full sync skips generated image save when attachment already exists", async () => {
  const saveAttachmentCalls: unknown[] = [];
  const rawMessages = [
    {
      role: "assistant",
      text: "[image]",
      index: 0,
      domId: "assistant-1",
      contentHash: hashString("[image]"),
      generatedImages: [
        {
          id: "img-1",
          currentSrc: "https://cdn.example.test/generated/apple.png",
          mimeType: "image/png",
          originalName: "generated-image-01-img-1.png",
          imageIndex: 0,
        },
      ],
    },
  ];
  const fakeWebview = createFakeWebview([]);
  const databaseManager = {
    syncMessages: () => ({
      success: true,
      conversationId: "conv-1",
      added: 1,
      total: 1,
    }),
    getMessages: () => ({
      success: true,
      data: [
        {
          id: "assistant-db-1",
          role: "assistant" as const,
          content: "[image]",
          dom_index: 0,
          dom_id: "assistant-1",
          content_hash: hashString("[image]"),
        },
      ],
    }),
    upsertConversationMetadata: () => ({
      success: true,
      data: {
        conversationId: "conv-1",
        created: false,
        title: "Test sync",
        titleUpdated: false,
      },
    }),
    getAttachments: () => ({
      success: true,
      data: [
        {
          id: "attachment-1",
          message_id: "assistant-db-1",
          original_name: "generated-image-01-img-1.png",
          stored_path: "attachments/attachment-1.png",
          mime_type: "image/png",
          size: 128,
          created_at: Date.now(),
        },
      ],
    }),
    saveAttachmentContent: (_event: null, params: unknown) => {
      saveAttachmentCalls.push(params);
      return {
        success: true,
        data: {
          attachmentId: "attachment-2",
          storedPath: "attachments/attachment-2.png",
        },
      };
    },
    resetConversationMessages: () => ({
      success: true,
      data: {
        conversationId: "conv-1",
        deletedCount: 0,
      },
    }),
  };

  const tester = new ProviderTester(fakeWebview as never, createConfig() as never, "ai1", undefined, {
    emitProgress: undefined,
    databaseManager: databaseManager as never,
  });
  const testerInternals = tester as unknown as {
    scrapeActiveConversationMessages: () => Promise<unknown[]>;
    performFullSyncForSession: (
      session: { title: string; url: string },
      accountId: string
    ) => Promise<{
      generatedImageSavedCount: number;
      generatedImagePendingCount: number;
    }>;
  };
   testerInternals.scrapeActiveConversationMessages = async () => {
      await Promise.resolve(undefined);
      return rawMessages;
    };
  
    const result = await testerInternals.performFullSyncForSession(
      { title: "Test sync", url: "https://chatgpt.com/c/test-sync" },
      "account-1"
    );
  
    assert.equal(result.generatedImageSavedCount, 0);
    assert.equal(result.generatedImagePendingCount, 0);
    assert.equal(saveAttachmentCalls.length, 0);
  });
