import assert from "node:assert/strict";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { closeDatabaseForAccount } from "../../electron/database/sqlite-manager.ts";
import { MailIdentityService } from "../../electron/mail-identity-service.ts";
import type {
  FetchInboxResult,
  MailTransportParsedAttachment,
  ParsedTransportMessage,
  SendMailRequest,
} from "../../electron/mail-transport/index.ts";
import { initPaths, Paths } from "../../electron/paths.ts";
import { createDefaultSettings } from "../../src/types/settings-defaults.ts";
import { buildRemoteEmailAccountId } from "../../src/types/archive.ts";
import type { AppSettings, RemoteUserIdentity } from "../../src/types/settings.ts";
import { normalizeSettings } from "../../src/js/modules/settings/settings-schema.ts";

const HANDSHAKE_PROTOCOL = "hayalet-ev-us1-handshake";
const HANDSHAKE_VERSION = 1;
const PAYLOAD_START = "--- HAYALET_EV_US1_PAYLOAD ---";
const PAYLOAD_END = "--- /HAYALET_EV_US1_PAYLOAD ---";
const FIXED_NOW = 1700000000000;

type HandshakeMessageType = "invite" | "accept" | "reject" | "profile";

initPaths(join(process.cwd(), "electron"));

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createSettingsStore(initial?: AppSettings) {
  let current = normalizeSettings(initial ?? createDefaultSettings());

  return {
    loadSettings(): AppSettings {
      return clone(current);
    },
    saveSettings(next: AppSettings): boolean {
      current = normalizeSettings(clone(next));
      return true;
    },
    snapshot(): AppSettings {
      return clone(current);
    },
  };
}

function createParsedMessage(
  text: string,
  transportMessageId: string,
  attachments: MailTransportParsedAttachment[] = []
): ParsedTransportMessage {
  return {
    transportMessageId,
    inReplyTo: null,
    references: [],
    subject: "[Hayalet Ev] Handshake",
    text,
    html: null,
    headersHash: `headers:${transportMessageId}`,
    headerLines: [
      `X-Hayalet-Ev-Protocol: ${HANDSHAKE_PROTOCOL}`,
      "Content-Type: text/plain; charset=utf-8",
    ],
    from: [],
    to: [],
    cc: [],
    bcc: [],
    replyTo: [],
    attachments,
    receivedAt: FIXED_NOW,
    rawSize: text.length,
  };
}

function createHandshakePayload(options: {
  messageType: HandshakeMessageType;
  email: string;
  nickname?: string;
  profileRevision?: number;
  inviteId?: string;
  avatar?: string;
  avatarAttachmentName?: string | null;
}): string {
  return [
    "Hayalet Ev US1 handshake payload.",
    "",
    PAYLOAD_START,
    JSON.stringify(
      {
        protocol: HANDSHAKE_PROTOCOL,
        version: HANDSHAKE_VERSION,
        messageType: options.messageType,
        inviteId: options.inviteId ?? "invite-fixed",
        sentAt: FIXED_NOW,
        profile: {
          remoteUserId: options.email,
          email: options.email,
          nickname: options.nickname ?? options.email,
          avatar: options.avatar ?? "",
          ...(options.avatarAttachmentName !== undefined
            ? { avatarAttachmentName: options.avatarAttachmentName }
            : {}),
          profileRevision: options.profileRevision ?? FIXED_NOW,
        },
      },
      null,
      2
    ),
    PAYLOAD_END,
    "",
  ].join("\n");
}

function createFetchedHandshakeResult(options: {
  accountId: string;
  transportMessageId: string;
  messageType: HandshakeMessageType;
  email: string;
  nickname?: string;
  inviteId?: string;
  avatar?: string;
  avatarAttachmentName?: string | null;
  attachments?: MailTransportParsedAttachment[];
}): FetchInboxResult {
  const payload: Parameters<typeof createHandshakePayload>[0] = {
    messageType: options.messageType,
    email: options.email,
  };
  if (options.nickname !== undefined) payload.nickname = options.nickname;
  if (options.inviteId !== undefined) payload.inviteId = options.inviteId;
  if (options.avatar !== undefined) payload.avatar = options.avatar;
  if (options.avatarAttachmentName !== undefined) {
    payload.avatarAttachmentName = options.avatarAttachmentName;
  }

  const text = createHandshakePayload(payload);

  return {
    accountId: options.accountId,
    mailbox: "INBOX",
    cursor: "uid:1",
    fetchedCount: 1,
    processedCount: 1,
    duplicateCount: 0,
    messages: [
      {
        status: "processed",
        duplicate: false,
        accountId: options.accountId,
        mailbox: "INBOX",
        uid: 1,
        threadId: null,
        transportMessageId: options.transportMessageId,
        localMessageId: `local:${options.messageType}`,
        fingerprint: `fingerprint:${options.messageType}`,
        headersHash: `headers:${options.messageType}`,
        deliveryState: "received",
        remoteUserId: options.email,
        localSessionId: null,
        threadMessageId: options.transportMessageId,
        parsed: createParsedMessage(text, options.transportMessageId, options.attachments ?? []),
      },
    ],
  };
}

function extractHandshakeEnvelope(message: SendMailRequest): Record<string, unknown> {
  const text = typeof message.text === "string" ? message.text : "";
  const match = text.match(
    /--- HAYALET_EV_US1_PAYLOAD ---\s*([\s\S]+?)\s*--- \/HAYALET_EV_US1_PAYLOAD ---/
  );
  assert.ok(match?.[1] != null);
  return JSON.parse(match[1]) as Record<string, unknown>;
}

function cleanupRemoteAccount(remoteUserId: string): void {
  const accountId = buildRemoteEmailAccountId(remoteUserId);
  closeDatabaseForAccount(accountId);
  rmSync(Paths.getAccountDir(accountId), { recursive: true, force: true });
}

function createTransportStub() {
  const sentMessages: SendMailRequest[] = [];
  const fetchQueue: FetchInboxResult[] = [];

  return {
    sentMessages,
    enqueueFetch(result: FetchInboxResult): void {
      fetchQueue.push(result);
    },
    transport: {
      async probeAccount(account: { id: string }) {
        return {
          accountId: account.id,
          connectionState: "connected" as const,
          smtpVerified: true,
          imapVerified: true,
        };
      },
      async sendMail(account: { id: string }, message: SendMailRequest) {
        sentMessages.push(clone(message));
        const transportMessageId = message.messageId ?? `<${message.localMessageId}@example.test>`;
        const threadMessageId = message.threadMessageId ?? transportMessageId;
        const recipients = Array.isArray(message.to) ? message.to : [message.to];

        return {
          accountId: account.id,
          localMessageId: message.localMessageId,
          transportMessageId,
          deliveryState: "sent",
          headersHash: `hash:${message.localMessageId}`,
          accepted: recipients,
          rejected: [] as string[],
          pending: [] as string[],
          response: "250 ok",
          remoteUserId: message.remoteUserId ?? null,
          localSessionId: message.localSessionId ?? null,
          threadMessageId,
        };
      },
      async fetchInbox(account: { id: string }) {
        return (
          fetchQueue.shift() ?? {
            accountId: account.id,
            mailbox: "INBOX",
            cursor: null,
            fetchedCount: 0,
            processedCount: 0,
            duplicateCount: 0,
            messages: [],
          }
        );
      },
    },
  };
}

function createMailAccountDraft(email = "local@example.com") {
  return {
    providerType: "gmail" as const,
    email,
    enabled: true,
    authType: "password" as const,
    auth: {
      user: email,
      password: "app-password",
    },
  };
}

async function createConnectedServiceContext() {
  const store = createSettingsStore();
  const transportStub = createTransportStub();
  const service = new MailIdentityService({
    now: () => FIXED_NOW,
    transport: transportStub.transport,
    settingsStore: {
      loadSettings: async () => await Promise.resolve(store.loadSettings()),
      saveSettings: async (settings) => await Promise.resolve(store.saveSettings(settings)),
    },
  });

  const saveResult = await service.upsertMailAccount(createMailAccountDraft(), { verifyAfterSave: false });
  assert.equal(saveResult.success, true);
  const accountId = store.snapshot().integrations?.mailTransport?.accounts[0]?.id;
  assert.ok(accountId != null);

  const verifyResult = await service.verifyMailAccount(accountId);
  assert.equal(verifyResult.success, true);

  return {
    service,
    store,
    transportStub,
    accountId,
  };
}

void test("mail identity service saves and verifies a local mail account", async () => {
  const store = createSettingsStore();
  const transportStub = createTransportStub();
  const service = new MailIdentityService({
    now: () => FIXED_NOW,
    transport: transportStub.transport,
    settingsStore: {
      loadSettings: async () => await Promise.resolve(store.loadSettings()),
      saveSettings: async (settings) => await Promise.resolve(store.saveSettings(settings)),
    },
  });

  const saveResult = await service.upsertMailAccount(createMailAccountDraft(), { verifyAfterSave: false });
  assert.equal(saveResult.success, true);
  const savedAccount = store.snapshot().integrations?.mailTransport?.accounts[0];
  assert.ok(savedAccount);
  assert.equal(savedAccount.connectionState, "disconnected");
  assert.equal(store.snapshot().integrations?.mailTransport?.localAccount, null);
  assert.equal(store.snapshot().user?.email, "");

  const verifyResult = await service.verifyMailAccount(savedAccount.id);
  assert.equal(verifyResult.success, true);
  assert.equal(verifyResult.localMailAccount?.connectionState, "connected");
  assert.equal(store.snapshot().integrations?.mailTransport?.accounts[0]?.connectionState, "connected");
  assert.equal(store.snapshot().integrations?.mailTransport?.localAccount?.id, savedAccount.id);
  assert.equal(store.snapshot().user?.email, "local@example.com");
  assert.equal(verifyResult.state?.verifiedLocalMailAccountId, savedAccount.id);
  assert.equal(verifyResult.state.verifiedUserEmail, "local@example.com");
});

void test("updating a verified local mail account keeps the old verified identity until re-verify", async () => {
  const { service, store, accountId } = await createConnectedServiceContext();

  const updateResult = await service.upsertMailAccount(
    {
      ...createMailAccountDraft("changed@example.com"),
      mailAccountId: accountId,
    },
    { verifyAfterSave: false }
  );

  assert.equal(updateResult.success, true);
  assert.equal(store.snapshot().integrations?.mailTransport?.accounts[0]?.email, "changed@example.com");
  assert.equal(store.snapshot().integrations?.mailTransport?.localAccount?.email, "local@example.com");
  assert.equal(store.snapshot().user?.email, "local@example.com");

  const verifyResult = await service.verifyMailAccount(accountId);
  assert.equal(verifyResult.success, true);
  assert.equal(store.snapshot().integrations?.mailTransport?.localAccount?.email, "changed@example.com");
  assert.equal(store.snapshot().user?.email, "changed@example.com");
});

void test("inviteRemoteUser creates an invite_sent remote user bound to the selected mail account", async () => {
  const { service, store, transportStub, accountId } = await createConnectedServiceContext();
  const avatarPath = join(Paths.getDataDir(), "mail-identity-local-avatar.png");
  rmSync(avatarPath, { force: true });
  writeFileSync(avatarPath, "fake-image");

  try {
    store.saveSettings({
      ...store.snapshot(),
      user: {
        ...(store.snapshot().user ?? {}),
        avatarPath,
      },
    });

    const inviteResult = await service.inviteRemoteUser({
      mailAccountId: accountId,
      email: "remote@example.com",
      nickname: "Remote Ghost",
    });

    assert.equal(inviteResult.success, true);
    assert.equal(inviteResult.remoteUser?.handshakeState, "invite_sent");
    assert.equal(inviteResult.remoteUser.linkedMailAccountId, accountId);
    assert.equal(transportStub.sentMessages.length, 1);
    assert.equal(
      transportStub.sentMessages[0]?.headers?.["X-Hayalet-Ev-Message-Type"],
      "invite"
    );
    assert.equal(transportStub.sentMessages[0].attachments?.length, 1);
    assert.equal(transportStub.sentMessages[0].attachments[0]?.path, avatarPath);

    const envelope = extractHandshakeEnvelope(transportStub.sentMessages[0]);
    assert.equal(
      (envelope["profile"] as Record<string, unknown>)["avatarAttachmentName"],
      "us1-avatar.png"
    );

    const storedRemoteUser = store.snapshot().remoteUsers?.[0];
    assert.equal(storedRemoteUser?.remoteUserId, "remote@example.com");
    assert.equal(storedRemoteUser.handshakeState, "invite_sent");
  } finally {
    rmSync(avatarPath, { force: true });
    cleanupRemoteAccount("remote@example.com");
  }
});

void test("syncRemoteUsers promotes incoming invite to handshake_pending and incoming accept to active", async () => {
  const { service, store, transportStub, accountId } = await createConnectedServiceContext();
  const avatarContent = Buffer.from("remote-avatar");
  const avatarAttachmentName = "us1-avatar.png";

  try {
    transportStub.enqueueFetch(
      createFetchedHandshakeResult({
        accountId,
        transportMessageId: "<incoming-invite@example.test>",
        messageType: "invite",
        email: "remote@example.com",
        nickname: "Remote Ghost",
        avatarAttachmentName,
        attachments: [
          {
            filename: avatarAttachmentName,
            contentType: "image/png",
            contentDisposition: "attachment",
            checksum: "invite-avatar",
            size: avatarContent.length,
            contentId: null,
            inline: false,
            content: avatarContent,
          },
        ],
      })
    );

    const inviteSync = await service.syncRemoteUsers({ mailAccountId: accountId, limit: 10 });
    assert.equal(inviteSync.success, true);
    assert.equal(inviteSync.fetchedCount, 1);
    assert.equal(store.snapshot().remoteUsers?.[0]?.handshakeState, "handshake_pending");
    assert.equal(
      store.snapshot().remoteUsers?.[0]?.avatar,
      `data:image/png;base64,${avatarContent.toString("base64")}`
    );

    transportStub.enqueueFetch(
      createFetchedHandshakeResult({
        accountId,
        transportMessageId: "<incoming-accept@example.test>",
        messageType: "accept",
        email: "remote@example.com",
        nickname: "Remote Ghost",
        avatarAttachmentName,
        attachments: [
          {
            filename: avatarAttachmentName,
            contentType: "image/png",
            contentDisposition: "attachment",
            checksum: "accept-avatar",
            size: avatarContent.length,
            contentId: null,
            inline: false,
            content: avatarContent,
          },
        ],
      })
    );

    const acceptSync = await service.syncRemoteUsers({ mailAccountId: accountId, limit: 10 });
    assert.equal(acceptSync.success, true);
    assert.equal(store.snapshot().remoteUsers?.[0]?.handshakeState, "active");
    assert.equal(existsSync(Paths.getAccountDbPath(buildRemoteEmailAccountId("remote@example.com"))), true);
    assert.equal(existsSync(store.snapshot().remoteUsers?.[0]?.avatarPath ?? ""), true);
    assert.equal(
      store.snapshot().accounts.find((account) => account.id === buildRemoteEmailAccountId("remote@example.com"))?.dbPath,
      Paths.getAccountDbPath(buildRemoteEmailAccountId("remote@example.com"))
    );
  } finally {
    cleanupRemoteAccount("remote@example.com");
  }
});

void test("acceptRemoteUser sends an accept message and activates the remote user", async () => {
  const { service, store, transportStub, accountId } = await createConnectedServiceContext();
  try {
    store.saveSettings({
      ...store.snapshot(),
      remoteUsers: [
        {
          remoteUserId: "remote@example.com",
          email: "remote@example.com",
          nickname: "Remote Ghost",
          avatar: `data:image/png;base64,${Buffer.from("accept-avatar").toString("base64")}`,
          avatarPath: "",
          handshakeState: "handshake_pending",
          profileRevision: FIXED_NOW,
          linkedMailAccountId: accountId,
          inviteMessageId: "<invite@example.test>",
          threadMessageId: "<invite@example.test>",
          lastTransportMessageId: "<invite@example.test>",
          lastError: null,
        } satisfies RemoteUserIdentity,
      ],
    });

    const acceptResult = await service.acceptRemoteUser({ remoteUserId: "remote@example.com" });
    assert.equal(acceptResult.success, true);
    assert.equal(acceptResult.remoteUser?.handshakeState, "active");
    assert.equal(
      transportStub.sentMessages.at(-1)?.headers?.["X-Hayalet-Ev-Message-Type"],
      "accept"
    );
    assert.equal(store.snapshot().remoteUsers?.[0]?.handshakeState, "active");
    assert.equal(existsSync(Paths.getAccountDbPath(buildRemoteEmailAccountId("remote@example.com"))), true);
    assert.equal(existsSync(store.snapshot().remoteUsers?.[0]?.avatarPath ?? ""), true);
  } finally {
    cleanupRemoteAccount("remote@example.com");
  }
});

void test("rejectRemoteUser sends a reject message and removes the pending remote user from receiver settings", async () => {
  const { service, store, transportStub, accountId } = await createConnectedServiceContext();

  store.saveSettings({
    ...store.snapshot(),
    remoteUsers: [
      {
        remoteUserId: "remote@example.com",
        email: "remote@example.com",
        nickname: "Remote Ghost",
        avatar: "",
        avatarPath: "",
        handshakeState: "handshake_pending",
        profileRevision: FIXED_NOW,
        linkedMailAccountId: accountId,
        inviteMessageId: "<invite@example.test>",
        threadMessageId: "<invite@example.test>",
        lastTransportMessageId: "<invite@example.test>",
        lastError: null,
      } satisfies RemoteUserIdentity,
    ],
  });

  const rejectResult = await service.rejectRemoteUser({ remoteUserId: "remote@example.com" });
  assert.equal(rejectResult.success, true);
  assert.equal(
    transportStub.sentMessages.at(-1)?.headers?.["X-Hayalet-Ev-Message-Type"],
    "reject"
  );
  assert.equal(store.snapshot().remoteUsers?.length ?? 0, 0);
  assert.equal(
    store.snapshot().accounts.some((account) => account.id === buildRemoteEmailAccountId("remote@example.com")),
    false
  );
});

void test("syncRemoteUsers marks invite sender side as rejected when a reject handshake arrives", async () => {
  const { service, store, transportStub, accountId } = await createConnectedServiceContext();

  store.saveSettings({
    ...store.snapshot(),
    remoteUsers: [
      {
        remoteUserId: "remote@example.com",
        email: "remote@example.com",
        nickname: "Remote Ghost",
        avatar: "data:image/png;base64,cmVtb3Rl",
        avatarPath: "",
        handshakeState: "invite_sent",
        profileRevision: FIXED_NOW,
        linkedMailAccountId: accountId,
        inviteMessageId: "<invite@example.test>",
        threadMessageId: "<invite@example.test>",
        lastTransportMessageId: "<invite@example.test>",
        lastError: null,
      } satisfies RemoteUserIdentity,
    ],
  });

  transportStub.enqueueFetch(
    createFetchedHandshakeResult({
      accountId,
      transportMessageId: "<incoming-reject@example.test>",
      messageType: "reject",
      email: "remote@example.com",
      nickname: "Remote Ghost",
    })
  );

  const syncResult = await service.syncRemoteUsers({ mailAccountId: accountId, limit: 10 });
  assert.equal(syncResult.success, true);
  assert.equal(store.snapshot().remoteUsers?.[0]?.handshakeState, "rejected");
  assert.equal(
    store.snapshot().accounts.find((account) => account.id === buildRemoteEmailAccountId("remote@example.com"))?.remoteEmail?.handshakeState,
    "rejected"
  );
});

void test("deleteMailAccount removes linked remote users and disconnects the US1 slot", async () => {
  const { service, store, accountId } = await createConnectedServiceContext();

  store.saveSettings({
    ...store.snapshot(),
    remoteUsers: [
      {
        remoteUserId: "remote@example.com",
        email: "remote@example.com",
        nickname: "Remote Ghost",
        avatar: "",
        avatarPath: "",
        handshakeState: "active",
        profileRevision: FIXED_NOW,
        linkedMailAccountId: accountId,
        inviteMessageId: "<invite@example.test>",
        acceptMessageId: "<accept@example.test>",
        threadMessageId: "<thread@example.test>",
        lastTransportMessageId: "<accept@example.test>",
        lastError: null,
      } satisfies RemoteUserIdentity,
    ],
    us1Slot: {
      selectedRemoteUserId: "remote@example.com",
      connectionState: "connected",
      catchCommands: false,
    },
  });

  const deleteResult = await service.deleteMailAccount({ mailAccountId: accountId });
  assert.equal(deleteResult.success, true);

  const nextSettings = store.snapshot();
  assert.equal(nextSettings.integrations?.mailTransport?.accounts.length, 0);
  assert.equal(nextSettings.integrations.mailTransport.localAccount, null);
  assert.equal(nextSettings.remoteUsers?.length ?? 0, 0);
  assert.equal(nextSettings.user?.email, "");
  assert.equal(nextSettings.us1Slot?.selectedRemoteUserId, null);
  assert.equal(nextSettings.us1Slot.connectionState, "disconnected");
});
