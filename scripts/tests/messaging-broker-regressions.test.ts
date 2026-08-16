import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { SQLiteArchiveManager } from "../../electron/database/sqlite-archive.ts";
import { getLoggerCore } from "../../electron/logger/core/LoggerCore.ts";
import {
  closeDatabaseForAccount,
  getDatabaseForAccount,
} from "../../electron/database/sqlite-manager.ts";
import { initPaths, Paths } from "../../electron/paths.ts";

initPaths(join(process.cwd(), "electron"));

function createAccountId(seed: string): string {
  return `messaging-broker-${seed}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function cleanupAccount(accountId: string): void {
  closeDatabaseForAccount(accountId);
  rmSync(Paths.getAccountDir(accountId), { recursive: true, force: true });
}

void test("messaging broker drops duplicate provider events", async () => {
  const accountId = createAccountId("duplicate");
  const manager = new SQLiteArchiveManager(accountId);

  try {
    const first = await manager.syncMessages({
      accountId,
      clientRequestId: "req-duplicate-1",
      webUrl: "https://chatgpt.com/c/messaging-broker-duplicate",
      messages: [
        {
          role: "assistant",
          text: "same event",
          domId: "dom-duplicate-1",
          domIndex: 0,
          providerMessageId: "provider-duplicate-1",
        },
      ],
    });
    const second = await manager.syncMessages({
      accountId,
      clientRequestId: "req-duplicate-2",
      webUrl: "https://chatgpt.com/c/messaging-broker-duplicate",
      messages: [
        {
          role: "assistant",
          text: "same event",
          domId: "dom-duplicate-1",
          domIndex: 0,
          providerMessageId: "provider-duplicate-1",
        },
      ],
    });

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(first.added, 1);
    assert.equal(second.droppedDuplicates, 1);

    const messages = await manager.getMessages(first.conversationId ?? "");
    assert.equal(messages.success, true);
    assert.equal(messages.data?.length, 1);
    assert.equal(messages.data[0]?.provider_message_id, "provider-duplicate-1");
  } finally {
    cleanupAccount(accountId);
  }
});

void test("messaging broker applies out-of-order events with monotonic sequence", async () => {
  const accountId = createAccountId("sequence");
  const manager = new SQLiteArchiveManager(accountId);

  try {
    const result = await manager.syncMessages({
      accountId,
      clientRequestId: "req-sequence-1",
      webUrl: "https://chatgpt.com/c/messaging-broker-sequence",
      messages: [
        {
          role: "assistant",
          text: "first applied",
          domId: "dom-sequence-1",
          domIndex: 0,
          eventSeq: 10,
          providerMessageId: "provider-sequence-1",
        },
        {
          role: "assistant",
          text: "second applied",
          domId: "dom-sequence-2",
          domIndex: 1,
          eventSeq: 5,
          providerMessageId: "provider-sequence-2",
        },
      ],
    });

    assert.equal(result.success, true);

    const conversationId = result.conversationId ?? "";
    const allMessages = await manager.getMessages(conversationId);
    const eventSeqs = (allMessages.data ?? []).map((message) => message.event_seq ?? 0);

    assert.deepEqual(
      (allMessages.data ?? []).map((message) => message.content),
      ["first applied", "second applied"]
    );
    assert.equal(eventSeqs.length, 2);
    assert.equal((eventSeqs[0] as number) < (eventSeqs[1] as number), true);

    const incremental = await manager.getMessages(conversationId, { afterSeq: eventSeqs[0] as number });
    assert.deepEqual(
      (incremental.data ?? []).map((message) => message.content),
      ["second applied"]
    );
    assert.equal(result.lastEventSeq, eventSeqs[1]);
  } finally {
    cleanupAccount(accountId);
  }
});

void test("messaging broker merges projections by message identity instead of timestamp", async () => {
  const accountId = createAccountId("identity");
  const manager = new SQLiteArchiveManager(accountId);

  try {
    const first = await manager.syncMessages({
      accountId,
      clientRequestId: "req-identity-1",
      webUrl: "https://chatgpt.com/c/messaging-broker-identity",
      messages: [
        {
          role: "assistant",
          text: "draft v1",
          domId: "dom-identity-1",
          domIndex: 0,
          eventSeq: 1,
          providerMessageId: "provider-identity-1",
        },
      ],
    });
    const second = await manager.syncMessages({
      accountId,
      clientRequestId: "req-identity-2",
      webUrl: "https://chatgpt.com/c/messaging-broker-identity",
      messages: [
        {
          role: "assistant",
          text: "draft v2",
          domId: "dom-identity-1",
          domIndex: 99,
          eventSeq: 2,
          providerMessageId: "provider-identity-1",
        },
      ],
    });

    assert.equal(first.success, true);
    assert.equal(second.success, true);

    const conversationId = first.conversationId ?? "";
    const projectedMessages = await manager.getMessages(conversationId);
    assert.equal(projectedMessages.data?.length, 1);
    assert.equal(projectedMessages.data[0]?.content, "draft v2");

    const db = getDatabaseForAccount(accountId);
    const eventCount = db
      .prepare(
        `
          SELECT COUNT(*) AS count
          FROM message_events
          WHERE conversation_id = ? AND account_id = ?
        `
      )
      .get(conversationId, accountId) as { count: number };
    assert.equal(eventCount.count, 2);
  } finally {
    cleanupAccount(accountId);
  }
});

void test("messaging broker keeps the newest same-identity projection when older events arrive later", async () => {
  const accountId = createAccountId("same-identity-order");
  const manager = new SQLiteArchiveManager(accountId);

  try {
    const first = await manager.syncMessages({
      accountId,
      clientRequestId: "req-same-identity-1",
      webUrl: "https://chatgpt.com/c/messaging-broker-same-identity",
      messages: [
        {
          role: "assistant",
          text: "newest",
          eventSeq: 10,
          providerMessageId: "provider-same-identity-1",
        },
      ],
    });
    const second = await manager.syncMessages({
      accountId,
      clientRequestId: "req-same-identity-2",
      webUrl: "https://chatgpt.com/c/messaging-broker-same-identity",
      messages: [
        {
          role: "assistant",
          text: "older",
          eventSeq: 5,
          providerMessageId: "provider-same-identity-1",
        },
      ],
    });

    assert.equal(first.success, true);
    assert.equal(second.success, true);

    const conversationId = first.conversationId ?? "";
    const projectedMessages = await manager.getMessages(conversationId);
    assert.equal(projectedMessages.data?.length, 1);
    assert.equal(projectedMessages.data[0]?.content, "newest");
    assert.equal(projectedMessages.data[0].event_seq, 10);
  } finally {
    cleanupAccount(accountId);
  }
});

void test(
  "messaging broker emits structured event codes for duplicate and out-of-order events",
  { concurrency: false },
  async () => {
    const accountId = createAccountId("event-code");
    const manager = new SQLiteArchiveManager(accountId);
    const logger = getLoggerCore() as unknown as {
      logInternal: (...args: unknown[]) => Promise<void>;
    };
    const originalLogInternal = logger.logInternal.bind(logger);
    const capturedContexts: Array<Record<string, unknown>> = [];

    logger.logInternal = async (
      _category: unknown,
      _level: unknown,
      _message: unknown,
      context?: unknown
    ) => {
      if (context !== null && context !== undefined && typeof context === "object") {
        capturedContexts.push(context as Record<string, unknown>);
      }
    };

    try {
      const first = await manager.syncMessages({
        accountId,
        clientRequestId: "req-event-code-1",
        webUrl: "https://chatgpt.com/c/messaging-broker-event-code",
        messages: [
          {
            role: "assistant",
            text: "seed event",
            eventSeq: 10,
            providerMessageId: "provider-event-code-1",
          },
        ],
      });
      const second = await manager.syncMessages({
        accountId,
        clientRequestId: "req-event-code-2",
        webUrl: "https://chatgpt.com/c/messaging-broker-event-code",
        messages: [
          {
            role: "assistant",
            text: "seed event",
            eventSeq: 10,
            providerMessageId: "provider-event-code-1",
          },
          {
            role: "assistant",
            text: "late event",
            eventSeq: 5,
            providerMessageId: "provider-event-code-2",
          },
        ],
      });

      assert.equal(first.success, true);
      assert.equal(second.success, true);
      assert.equal(
        capturedContexts.some((context) => context["eventCode"] === "broker.duplicate_drop"),
        true
      );
      assert.equal(
        capturedContexts.some((context) => context["eventCode"] === "broker.out_of_order"),
        true
      );
    } finally {
      logger.logInternal = originalLogInternal;
      cleanupAccount(accountId);
    }
  }
);
