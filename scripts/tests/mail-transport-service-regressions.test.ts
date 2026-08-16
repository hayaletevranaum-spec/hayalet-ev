import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";

import { initPaths, Paths } from "../../electron/paths.ts";
import {
  MailTransportService,
  applyMailTransportAccountDefaults,
  type MailTransportImapClient,
} from "../../electron/mail-transport/index.ts";
import { MailSidecarStoreManager } from "../../electron/database/mail-sidecar-manager.ts";
import { closeMailSidecarDatabaseForAccount } from "../../electron/database/mail-sidecar-sqlite.ts";
import type { MailTransportAccountConfig } from "../../src/types/settings.ts";

const electronDir = join(process.cwd(), "electron");
initPaths(electronDir);

function createAccount(prefix: string): MailTransportAccountConfig {
  return {
    id: `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    providerType: "gmail",
    email: "sender@example.com",
    enabled: true,
    authType: "password",
    imap: {
      host: "",
      port: 0,
      secure: false,
    },
    smtp: {
      host: "",
      port: 0,
      secure: false,
    },
    auth: {
      user: "sender@example.com",
      password: "app-password",
    },
    binding: {
      remoteUserId: "remote-user@example.com",
      defaultLocalSessionId: "session-default",
    },
  };
}

function cleanupAccount(accountId: string): void {
  closeMailSidecarDatabaseForAccount(accountId);
  const accountDir = Paths.getAccountDir(accountId);
  rmSync(accountDir, { recursive: true, force: true });
}

function buildReplyMail(messageId: string, bodyText = "Reply body"): string {
  return [
    "From: Remote User <remote-user@example.com>",
    "To: Sender <sender@example.com>",
    `Message-ID: <incoming-${Date.now().toString(36)}@example.com>`,
    `In-Reply-To: ${messageId}`,
    `References: ${messageId}`,
    "Subject: Re: Hello",
    "Date: Thu, 13 Mar 2026 10:00:00 +0000",
    "MIME-Version: 1.0",
    'Content-Type: multipart/mixed; boundary="frontier"',
    "",
    "--frontier",
    'Content-Type: text/plain; charset="utf-8"',
    "",
    bodyText,
    "--frontier",
    'Content-Type: text/plain; name="note.txt"',
    'Content-Disposition: attachment; filename="note.txt"',
    "Content-Transfer-Encoding: base64",
    "",
    "SGVsbG8gd29ybGQh",
    "--frontier--",
    "",
  ].join("\r\n");
}

void test("gmail transport account applies provider defaults", () => {
  const resolved = applyMailTransportAccountDefaults(createAccount("mail_transport_defaults"));

  assert.equal(resolved.imap.host, "imap.gmail.com");
  assert.equal(resolved.imap.port, 993);
  assert.equal(resolved.imap.secure, true);
  assert.equal(resolved.smtp.host, "smtp.gmail.com");
  assert.equal(resolved.smtp.port, 465);
  assert.equal(resolved.smtp.secure, true);
  assert.equal(resolved.fetchBatchSize, 20);
  assert.equal(resolved.defaultMailbox, "INBOX");
});

void test("sendMail updates outbound sidecar metadata and session mapping", async () => {
  const account = createAccount("mail_transport_send");
  const sentMessages: Array<Record<string, unknown>> = [];
  const service = new MailTransportService({
    now: () => 1700000000000,
    wait: async (_ms: number) => {},
    createSmtpTransporter: () => ({
      sendMail: async (message) => {
        sentMessages.push(message as Record<string, unknown>);
        return {
          messageId: String(message.messageId),
          accepted: ["remote-user@example.com"],
          rejected: [],
          pending: [],
          response: "250 queued",
        };
      },
      close: () => undefined,
    }),
  });

  try {
    const result = await service.sendMail(account, {
      localMessageId: "local-out-1",
      remoteUserId: "remote-user@example.com",
      localSessionId: "session-1",
      to: "remote-user@example.com",
      subject: "Hello",
      text: "Phase 4 outbound test",
    });

    const sidecar = new MailSidecarStoreManager(account.id);
    const meta = sidecar.getMessageMeta(result.transportMessageId);
    const mapping = sidecar.getSessionMapping("remote-user@example.com", "session-1");

    assert.equal(sentMessages.length, 1);
    assert.equal(result.deliveryState, "sent");
    assert.equal(meta?.deliveryState, "sent");
    assert.equal(meta.localMessageId, "local-out-1");
    assert.equal(mapping?.lastMessageId, result.transportMessageId);
    assert.equal(mapping.threadMessageId, result.threadMessageId);
  } finally {
    cleanupAccount(account.id);
  }
});

void test("processIncomingMessage parses attachments, resolves session mapping, and skips duplicates", async () => {
  const account = createAccount("mail_transport_process");
  const service = new MailTransportService({
    now: () => 1700000005000,
    wait: async (_ms: number) => {},
  });
  const sidecar = new MailSidecarStoreManager(account.id);
  const threadMessageId = "<thread-phase4@example.com>";

  try {
    sidecar.upsertSessionMapping({
      remoteUserId: "remote-user@example.com",
      localSessionId: "session-lookup",
      threadMessageId,
      lastMessageId: threadMessageId,
    });
    const source = buildReplyMail(threadMessageId);

    const first = await service.processIncomingMessage(account, {
      mailbox: "INBOX",
      uid: 41,
      source,
      remoteUserId: "remote-user@example.com",
    });

    const second = await service.processIncomingMessage(account, {
      mailbox: "INBOX",
      uid: 41,
      source,
      remoteUserId: "remote-user@example.com",
    });

    assert.equal(first.status, "processed");
    assert.equal(first.duplicate, false);
    assert.equal(first.localSessionId, "session-lookup");
    assert.equal(first.parsed.attachments.length, 1);
    assert.equal(first.parsed.attachments[0]?.filename, "note.txt");
    assert.equal(second.status, "duplicate_skipped");
    assert.equal(second.duplicate, true);
  } finally {
    cleanupAccount(account.id);
  }
});

void test("fetchInbox uses injected IMAP client and advances sidecar cursor", async () => {
  const account = createAccount("mail_transport_fetch");
  let released = false;
  let loggedOut = false;

  const fakeImapClient: MailTransportImapClient = {
    connect: async () => {},
    getMailboxLock: async (path) => ({
      path,
      release: () => {
        released = true;
      },
    }),
    async *fetch() {
      yield {
        seq: 1,
        uid: 105,
        source: Buffer.from(buildReplyMail("<fetch-thread@example.com>")),
        flags: new Set(),
      };
    },
    logout: async () => {
      loggedOut = true;
    },
    close: () => undefined,
  };

  const service = new MailTransportService({
    now: () => 1700000010000,
    wait: async (_ms: number) => {},
    createImapClient: () => fakeImapClient,
  });

  try {
    const result = await service.fetchInbox(account, {
      limit: 5,
      remoteUserId: "remote-user@example.com",
    });

    const sidecar = new MailSidecarStoreManager(account.id);
    const cursor = sidecar.getSyncCursor(account.id);

    assert.equal(result.fetchedCount, 1);
    assert.equal(result.processedCount, 1);
    assert.equal(result.cursor, "uid:105");
    assert.equal(cursor?.cursor, "uid:105");
    assert.equal(released, true);
    assert.equal(loggedOut, true);
    assert.equal(existsSync(Paths.getAccountMailSidecarDbPath(account.id)), true);
  } finally {
    cleanupAccount(account.id);
  }
});
