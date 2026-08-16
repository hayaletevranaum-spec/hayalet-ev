import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

import { initPaths, Paths } from "../../electron/paths.ts";
import {
  closeMailSidecarDatabaseForAccount,
  closeAllMailSidecarDatabases,
} from "../../electron/database/mail-sidecar-sqlite.ts";
import { MailSidecarStoreManager } from "../../electron/database/mail-sidecar-manager.ts";

const electronDir = join(process.cwd(), "electron");
initPaths(electronDir);

function createAccountId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}_us1`;
}

function cleanupAccount(accountId: string): void {
  closeMailSidecarDatabaseForAccount(accountId);
  const accountDir = Paths.getAccountDir(accountId);
  rmSync(accountDir, { recursive: true, force: true });
}

void test("mail sidecar store uses a dedicated db path per account", () => {
  const accountId = createAccountId("mail_sidecar_path");

  try {
    const archiveDbPath = Paths.getAccountDbPath(accountId);
    const sidecarDbPath = Paths.getAccountMailSidecarDbPath(accountId);

    assert.equal(dirname(sidecarDbPath), dirname(archiveDbPath));
    assert.notEqual(sidecarDbPath, archiveDbPath);
    assert.match(sidecarDbPath, /mail-sidecar\.db$/);
  } finally {
    cleanupAccount(accountId);
  }
});

void test("mail sidecar manager persists session mapping, message meta, sync cursor, and receipt ledger", async () => {
  const accountId = createAccountId("mail_sidecar_data");
  const manager = new MailSidecarStoreManager(accountId);

  try {
    const mapping = manager.upsertSessionMapping({
      remoteUserId: "remote-user-1",
      localSessionId: "session-local-1",
      threadMessageId: "<thread-1@example.test>",
    });
    assert.equal(mapping.threadMessageId, "<thread-1@example.test>");
    assert.equal(mapping.lastMessageId, null);

    const updatedMapping = manager.upsertSessionMapping({
      remoteUserId: "remote-user-1",
      localSessionId: "session-local-1",
      lastMessageId: "<message-2@example.test>",
    });
    assert.equal(updatedMapping.threadMessageId, "<thread-1@example.test>");
    assert.equal(updatedMapping.lastMessageId, "<message-2@example.test>");

    await new Promise((resolve) => setTimeout(resolve, 2));
    manager.upsertSessionMapping({
      remoteUserId: "remote-user-1",
      localSessionId: "session-local-2",
      threadMessageId: "<thread-2@example.test>",
      lastMessageId: "<message-3@example.test>",
    });

    const messageMeta = manager.upsertMessageMeta({
      transportMessageId: "<transport-1@example.test>",
      localMessageId: "local-message-1",
      deliveryState: "queued",
      headersHash: "headers-hash-1",
      metadata: {
        direction: "outbound",
        localSessionId: "session-local-1",
      },
    });
    assert.equal(messageMeta.deliveryState, "queued");
    assert.equal(messageMeta.metadata?.["direction"], "outbound");
    assert.equal(
      manager.getMessageMetaByLocalMessageId("local-message-1")?.transportMessageId,
      "<transport-1@example.test>"
    );
    assert.equal(
      manager.getLatestSessionMapping("remote-user-1")?.localSessionId,
      "session-local-2"
    );

    const syncCursor = manager.updateSyncCursor({
      mailAccountId: "mail-account-1",
      cursor: "cursor-v1",
      lastSync: 1700000000000,
    });
    assert.equal(syncCursor.cursor, "cursor-v1");
    assert.equal(syncCursor.lastSync, 1700000000000);

    assert.equal(
      manager.hasProcessedReceipt({
        transportMessageId: "<transport-1@example.test>",
        checksum: "receipt-checksum-1",
      }),
      false
    );

    const receipt = manager.markReceiptProcessed({
      transportMessageId: "<transport-1@example.test>",
      checksum: "receipt-checksum-1",
      processedAt: 1700000001000,
    });
    assert.equal(receipt.processedAt, 1700000001000);
    assert.equal(
      manager.hasProcessedReceipt({
        transportMessageId: "<transport-1@example.test>",
      }),
      true
    );
    assert.equal(
      manager.hasProcessedReceipt({
        checksum: "receipt-checksum-1",
      }),
      true
    );

    const receiptDuplicate = manager.markReceiptProcessed({
      transportMessageId: "<transport-2@example.test>",
      checksum: "receipt-checksum-1",
      processedAt: 1700000002000,
    });
    assert.equal(receiptDuplicate.transportMessageId, "<transport-1@example.test>");

    const sidecarDbPath = Paths.getAccountMailSidecarDbPath(accountId);
    assert.equal(existsSync(sidecarDbPath), true);
  } finally {
    cleanupAccount(accountId);
    closeAllMailSidecarDatabases();
  }
});

void test("mail sidecar manager rejects empty identifiers for narrow api writes", () => {
  const accountId = createAccountId("mail_sidecar_validation");
  const manager = new MailSidecarStoreManager(accountId);

  try {
    assert.throws(
      () =>
        manager.upsertSessionMapping({
          remoteUserId: "",
          localSessionId: "session-local-1",
        }),
      /remoteUserId is required/
    );
    assert.throws(
      () =>
        manager.upsertMessageMeta({
          transportMessageId: "<transport-1@example.test>",
          localMessageId: "",
          deliveryState: "queued",
          headersHash: "headers-hash-1",
        }),
      /localMessageId is required/
    );
    assert.throws(
      () =>
        manager.markReceiptProcessed({
          transportMessageId: "<transport-1@example.test>",
          checksum: "",
        }),
      /checksum is required/
    );
  } finally {
    cleanupAccount(accountId);
  }
});
