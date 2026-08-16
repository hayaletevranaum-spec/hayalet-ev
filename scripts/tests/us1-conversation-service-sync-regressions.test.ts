import {
  assert,
  buildConversationPayload,
  buildRemoteEmailAccountId,
  cleanupAccount,
  createArchiveFactory,
  createSettings,
  createSettingsStore,
  createTransportStub,
  Database,
  existsSync,
  FIXED_NOW,
  MailSidecarStoreManager,
  MESSAGE_PAYLOAD_END,
  MESSAGE_PAYLOAD_START,
  MESSAGE_PROTOCOL,
  Paths,
  test,
  Us1ConversationService,
} from "./us1-conversation-service.helpers.ts";

void test("US1 conversation service syncs inbound mail, updates remote profile, and flags room bundles", async () => {
  const accountId = `us1_mail_${Date.now().toString(36)}_sync`;
  const store = createSettingsStore(createSettings(accountId));
  const transportStub = createTransportStub();
  const service = new Us1ConversationService({
    now: () => FIXED_NOW,
    transport: transportStub.transport,
    archiveFactory: createArchiveFactory(),
    settingsStore: {
      loadSettings: async () => {
        await Promise.resolve();
        return store.loadSettings();
      },
      saveSettings: async (settings) => {
        await Promise.resolve();
        return store.saveSettings(settings);
      },
    },
  });
  const remoteAccountId = buildRemoteEmailAccountId("remote@example.com");

  try {
    const outbound = await service.sendMessage({ text: "Thread opener" });
    assert.equal(outbound.success, true);

    const roomBundle = JSON.stringify(
      {
        manifest: {
          id: "mail-room",
          name: "Mail Room",
        },
        files: {
          "README.md": {
            encoding: "base64",
            content: Buffer.from("room").toString("base64"),
          },
        },
      },
      null,
      2
    );

    transportStub.enqueueFetch({
      accountId,
      mailbox: "INBOX",
      cursor: "uid:5",
      fetchedCount: 1,
      processedCount: 1,
      duplicateCount: 0,
      messages: [
        {
          status: "processed",
          duplicate: false,
          accountId,
          mailbox: "INBOX",
          uid: 5,
          threadId: null,
          transportMessageId: "<incoming-1@example.test>",
          localMessageId: "local-in-1",
          fingerprint: "fingerprint-in-1",
          headersHash: "headers-in-1",
          deliveryState: "received",
          remoteUserId: "remote@example.com",
          localSessionId: null,
          threadMessageId: outbound.transportMessageId ?? null,
          parsed: {
            transportMessageId: "<incoming-1@example.test>",
            inReplyTo: outbound.transportMessageId ?? null,
            references: outbound.transportMessageId != null ? [outbound.transportMessageId] : [],
            subject: "Re: Thread opener",
            text: buildConversationPayload("Remote Fresh", 10, "Inbound hello"),
            html: null,
            headersHash: "headers-in-1",
            headerLines: [`X-Hayalet-Ev-Protocol: ${MESSAGE_PROTOCOL}`],
            from: [{ name: "Remote Fresh", address: "remote@example.com" }],
            to: [],
            cc: [],
            bcc: [],
            replyTo: [],
            attachments: [
              {
                filename: "mail-room.hevroom.json",
                contentType: "application/json",
                contentDisposition: "attachment",
                checksum: "bundle-checksum",
                size: Buffer.byteLength(roomBundle),
                contentId: null,
                inline: false,
                content: Buffer.from(roomBundle),
              },
            ],
            receivedAt: FIXED_NOW + 1,
            rawSize: roomBundle.length,
          },
        },
      ],
    });

    const result = await service.syncMessages();

    assert.equal(result.success, true);
    assert.equal(result.projectedCount, 1);
    assert.equal(result.localSessionId, outbound.localSessionId);
    assert.equal(result.sessionEvents?.[0]?.mode, "reply");
    assert.equal(result.sessionEvents[0].isNewSession, false);
    assert.equal(result.roomPackages?.length, 1);
    assert.equal(result.roomPackages[0]?.originalName, "mail-room.hevroom.json");

    const nextRemoteUser = store.snapshot().remoteUsers?.find(
      (remoteUser) => remoteUser.remoteUserId === "remote@example.com"
    );
    assert.equal(nextRemoteUser?.nickname, "Remote Fresh");
    assert.equal(nextRemoteUser.avatar, "https://example.com/avatar.png");
    assert.equal(nextRemoteUser.profileRevision, 10);

    const sidecar = new MailSidecarStoreManager(accountId);
    const meta = sidecar.getMessageMeta("<incoming-1@example.test>");
    assert.equal(meta?.metadata?.["direction"], "inbound");
    assert.equal(meta.metadata["localSessionId"], outbound.localSessionId);

    const db = new Database(Paths.getAccountDbPath(remoteAccountId), { readonly: true });
    const messages = db
      .prepare<[string], { role: string; content: string }>(
        "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC"
      )
      .all(result.conversationId ?? "");
    const attachments = db
      .prepare<[string], { original_name: string }>(
        "SELECT original_name FROM attachments WHERE conversation_id = ? ORDER BY created_at ASC"
      )
      .all(result.conversationId ?? "");
    db.close();

    assert.equal(messages.length, 2);
    assert.equal(messages[1]?.role, "assistant");
    assert.equal(messages[1].content, "Inbound hello");
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0]?.original_name, "mail-room.hevroom.json");
  } finally {
    cleanupAccount(accountId);
    cleanupAccount(remoteAccountId);
  }
});

void test("US1 conversation sync keeps explicit inbound new session ids isolated", async () => {
  const accountId = `us1_mail_${Date.now().toString(36)}_new_session`;
  const store = createSettingsStore(createSettings(accountId));
  const transportStub = createTransportStub();
  const service = new Us1ConversationService({
    now: () => FIXED_NOW,
    transport: transportStub.transport,
    archiveFactory: createArchiveFactory(),
    settingsStore: {
      loadSettings: async () => {
        await Promise.resolve();
        return store.loadSettings();
      },
      saveSettings: async (settings) => {
        await Promise.resolve();
        return store.saveSettings(settings);
      },
    },
  });
  const remoteAccountId = buildRemoteEmailAccountId("remote@example.com");

  try {
    transportStub.enqueueFetch({
      accountId,
      mailbox: "INBOX",
      cursor: "uid:9",
      fetchedCount: 1,
      processedCount: 1,
      duplicateCount: 0,
      messages: [
        {
          status: "processed",
          duplicate: false,
          accountId,
          mailbox: "INBOX",
          uid: 9,
          threadId: null,
          transportMessageId: "<incoming-new-session@example.test>",
          localMessageId: "local-new-session-1",
          fingerprint: "fingerprint-new-session-1",
          headersHash: "headers-new-session-1",
          deliveryState: "received",
          remoteUserId: "remote@example.com",
          localSessionId: "us1-remote-session-1",
          threadMessageId: "<incoming-new-session@example.test>",
          parsed: {
            transportMessageId: "<incoming-new-session@example.test>",
            inReplyTo: null,
            references: [],
            subject: "Fresh remote session",
            text: buildConversationPayload("Remote Fresh", 12, "Brand new thread", {
              localSessionId: "us1-remote-session-1",
              mode: "new",
              title: "Fresh thread",
            }),
            html: null,
            headersHash: "headers-new-session-1",
            headerLines: [
              `X-Hayalet-Ev-Protocol: ${MESSAGE_PROTOCOL}`,
              "X-Hayalet-Ev-Session-Id: us1-remote-session-1",
            ],
            from: [{ name: "Remote Fresh", address: "remote@example.com" }],
            to: [],
            cc: [],
            bcc: [],
            replyTo: [],
            attachments: [],
            receivedAt: FIXED_NOW + 3,
            rawSize: 128,
          },
        },
      ],
    });

    const result = await service.syncMessages();

    assert.equal(result.success, true);
    assert.equal(result.projectedCount, 1);
    assert.equal(result.localSessionId, "us1-remote-session-1");
    assert.equal(result.sessionEvents?.length, 1);
    assert.equal(result.sessionEvents[0]?.localSessionId, "us1-remote-session-1");
    assert.equal(result.sessionEvents[0].mode, "new");
    assert.equal(result.sessionEvents[0].isNewSession, true);

    const db = new Database(Paths.getAccountDbPath(remoteAccountId), { readonly: true });
    const conversation = db
      .prepare<[string], { title: string; web_url: string }>(
        "SELECT title, web_url FROM conversations WHERE id = ? LIMIT 1"
      )
      .get(result.conversationId ?? "");
    db.close();

    assert.equal(conversation?.title, "Sohbet 001");
    assert.match(conversation.web_url, /us1-remote-session-1/);
  } finally {
    cleanupAccount(accountId);
    cleanupAccount(remoteAccountId);
  }
});

void test("US1 conversation sync does not activate unknown remote users from normal conversation mail", async () => {
  const accountId = `us1_mail_${Date.now().toString(36)}_skip`;
  const store = createSettingsStore(createSettings(accountId));
  const transportStub = createTransportStub();
  const service = new Us1ConversationService({
    now: () => FIXED_NOW,
    transport: transportStub.transport,
    archiveFactory: createArchiveFactory(),
    settingsStore: {
      loadSettings: async () => {
        await Promise.resolve();
        return store.loadSettings();
      },
      saveSettings: async (settings) => {
        await Promise.resolve();
        return store.saveSettings(settings);
      },
    },
  });
  const activeRemoteAccountId = buildRemoteEmailAccountId("remote@example.com");
  const strangerRemoteAccountId = buildRemoteEmailAccountId("stranger@example.com");

  try {
    transportStub.enqueueFetch({
      accountId,
      mailbox: "INBOX",
      cursor: "uid:7",
      fetchedCount: 1,
      processedCount: 1,
      duplicateCount: 0,
      messages: [
        {
          status: "processed",
          duplicate: false,
          accountId,
          mailbox: "INBOX",
          uid: 7,
          threadId: null,
          transportMessageId: "<incoming-stranger@example.test>",
          localMessageId: "local-stranger-1",
          fingerprint: "fingerprint-stranger-1",
          headersHash: "headers-stranger-1",
          deliveryState: "received",
          remoteUserId: "stranger@example.com",
          localSessionId: null,
          threadMessageId: "<incoming-stranger@example.test>",
          parsed: {
            transportMessageId: "<incoming-stranger@example.test>",
            inReplyTo: null,
            references: [],
            subject: "New stranger thread",
            text: [
              "Hello from stranger",
              "",
              MESSAGE_PAYLOAD_START,
              JSON.stringify(
                {
                  protocol: MESSAGE_PROTOCOL,
                  version: 1,
                  messageType: "conversation",
                  sentAt: FIXED_NOW + 2,
                  localSessionId: null,
                  profile: {
                    remoteUserId: "stranger@example.com",
                    email: "stranger@example.com",
                    nickname: "Stranger",
                    avatar: "https://example.com/stranger.png",
                    profileRevision: 9,
                  },
                },
                null,
                2
              ),
              MESSAGE_PAYLOAD_END,
              "",
            ].join("\n"),
            html: null,
            headersHash: "headers-stranger-1",
            headerLines: [`X-Hayalet-Ev-Protocol: ${MESSAGE_PROTOCOL}`],
            from: [{ name: "Stranger", address: "stranger@example.com" }],
            to: [],
            cc: [],
            bcc: [],
            replyTo: [],
            attachments: [],
            receivedAt: FIXED_NOW + 2,
            rawSize: 128,
          },
        },
      ],
    });

    const result = await service.syncMessages();

    assert.equal(result.success, true);
    assert.equal(result.projectedCount, 0);
    assert.equal(result.skippedCount, 1);
    assert.equal(
      (store.snapshot().remoteUsers ?? []).some((remoteUser) => remoteUser.remoteUserId === "stranger@example.com"),
      false
    );
    assert.equal(existsSync(Paths.getAccountDbPath(activeRemoteAccountId)), false);
    assert.equal(existsSync(Paths.getAccountDbPath(strangerRemoteAccountId)), false);
  } finally {
    cleanupAccount(accountId);
    cleanupAccount(activeRemoteAccountId);
    cleanupAccount(strangerRemoteAccountId);
  }
});
