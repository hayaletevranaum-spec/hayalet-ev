import {
  assert,
  buildRemoteEmailAccountId,
  cleanupAccount,
  createArchiveFactory,
  createMultiRemoteSettings,
  createSettings,
  createSettingsStore,
  createTransportStub,
  Database,
  extractConversationEnvelope,
  FIXED_NOW,
  getLoggerCore,
  join,
  MailSidecarStoreManager,
  mkdtemp,
  Paths,
  rm,
  test,
  tmpdir,
  Us1ConversationService,
  writeFile,
} from "./us1-conversation-service.helpers.ts";

void test("US1 conversation service sends outbound mail and projects archive metadata", async () => {
  const accountId = `us1_mail_${Date.now().toString(36)}`;
  const store = createSettingsStore(createSettings(accountId));
  const transportStub = createTransportStub();
  const service = new Us1ConversationService({
    now: () => FIXED_NOW,
    transport: transportStub.transport,
    archiveFactory: createArchiveFactory(),
    settingsStore: {
      loadSettings: () => store.loadSettings(),
      saveSettings: (settings) => store.saveSettings(settings),
    },
  });
  const tempRoot = await mkdtemp(join(tmpdir(), "us1-mail-outbound-"));
  const attachmentPath = join(tempRoot, "note.txt");
  const remoteAccountId = buildRemoteEmailAccountId("remote@example.com");

  try {
    await writeFile(attachmentPath, "outbound attachment", "utf8");

    const result = await service.sendMessage({
      text: "Outbound hello",
      attachments: [{ path: attachmentPath, name: "note.txt", mimeType: "text/plain" }],
    });

    assert.equal(result.success, true);
    assert.equal(transportStub.sentMessages.length, 1);
    assert.equal(transportStub.sentMessages[0]?.to, "remote@example.com");
    assert.equal(typeof result.transportMessageId, "string");
    assert.equal(typeof result.conversationId, "string");
    const envelope = extractConversationEnvelope(transportStub.sentMessages[0]);
    assert.equal(
      (envelope["session"] as Record<string, unknown>)["id"],
      result.localSessionId ?? null
    );
    assert.equal((envelope["session"] as Record<string, unknown>)["mode"], "new");
    assert.equal((envelope["session"] as Record<string, unknown>)["title"], null);

    const sidecar = new MailSidecarStoreManager(accountId);
    const meta = sidecar.getMessageMeta(result.transportMessageId ?? "");
    assert.equal(meta?.deliveryState, "sent");
    assert.equal(meta.metadata?.["direction"], "outbound");
    assert.equal(meta.metadata["localSessionId"], result.localSessionId);

    const db = new Database(Paths.getAccountDbPath(remoteAccountId), { readonly: true });
    const conversation = db
      .prepare<[string], { title: string | null }>(
        "SELECT title FROM conversations WHERE id = ? LIMIT 1"
      )
      .get(result.conversationId ?? "");
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

    assert.equal(conversation?.title, "Sohbet 001");
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.role, "user");
    assert.equal(messages[0].content, "Outbound hello");
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0]?.original_name, "note.txt");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
    cleanupAccount(accountId);
    cleanupAccount(remoteAccountId);
  }
});

void test("US1 conversation service resolves provider credentials server-side for explicit remote users", async () => {
  const accountIdA = `us1_mail_${Date.now().toString(36)}_alpha_send`;
  const accountIdB = `us1_mail_${Date.now().toString(36)}_beta_send`;
  const store = createSettingsStore(
    createMultiRemoteSettings("alpha@example.com", [
      {
        accountId: accountIdA,
        remoteUserId: "alpha@example.com",
        nickname: "Alpha Remote",
      },
      {
        accountId: accountIdB,
        remoteUserId: "beta@example.com",
        nickname: "Beta Remote",
      },
    ])
  );
  const transportStub = createTransportStub();
  const service = new Us1ConversationService({
    now: () => FIXED_NOW,
    transport: transportStub.transport,
    archiveFactory: createArchiveFactory(),
    settingsStore: {
      loadSettings: () => store.loadSettings(),
      saveSettings: (settings) => store.saveSettings(settings),
    },
  });
  const remoteAccountIdA = buildRemoteEmailAccountId("alpha@example.com");
  const remoteAccountIdB = buildRemoteEmailAccountId("beta@example.com");

  try {
    const result = await service.sendMessage({
      text: "Server resolved beta",
      remoteUserId: "beta@example.com",
    });

    assert.equal(result.success, true);
    assert.equal(result.remoteUserId, "beta@example.com");
    assert.equal(transportStub.sentMessages.length, 1);
    assert.equal(transportStub.sentMessages[0]?.to, "beta@example.com");
    assert.equal(transportStub.sentAccountIds[0], accountIdB);
    assert.equal(store.snapshot().us1Slot?.selectedRemoteUserId, "alpha@example.com");
  } finally {
    cleanupAccount(accountIdA);
    cleanupAccount(accountIdB);
    cleanupAccount(remoteAccountIdA);
    cleanupAccount(remoteAccountIdB);
  }
});

void test(
  "US1 conversation service rejects foreign remote users outside the owner-scoped bindings",
  { concurrency: false },
  async () => {
  const accountId = `us1_mail_${Date.now().toString(36)}_foreign_send`;
  const store = createSettingsStore(createSettings(accountId));
  const transportStub = createTransportStub();
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

  const service = new Us1ConversationService({
    now: () => FIXED_NOW,
    transport: transportStub.transport,
    archiveFactory: createArchiveFactory(),
    settingsStore: {
      loadSettings: () => store.loadSettings(),
      saveSettings: (settings) => store.saveSettings(settings),
    },
  });
  const remoteAccountId = buildRemoteEmailAccountId("remote@example.com");

  try {
    const result = await service.sendMessage({
      text: "Should be rejected",
      remoteUserId: "foreign@example.com",
    });

    assert.equal(result.success, false);
    assert.match(result.error ?? "", /foreign@example\.com/);
    assert.equal(transportStub.sentMessages.length, 0);
    assert.equal(store.snapshot().us1Slot?.selectedRemoteUserId, "remote@example.com");
    assert.equal(
      capturedContexts.some((context) => context["eventCode"] === "auth.owner_scope_violation"),
      true
    );
  } finally {
    logger.logInternal = originalLogInternal;
    cleanupAccount(accountId);
    cleanupAccount(remoteAccountId);
  }
  }
);

void test("US1 conversation service ignores forged client session ids and mints owner-scoped ones", async () => {
  const accountId = `us1_mail_${Date.now().toString(36)}_forged_session`;
  const store = createSettingsStore(createSettings(accountId));
  const transportStub = createTransportStub();
  const service = new Us1ConversationService({
    now: () => FIXED_NOW,
    transport: transportStub.transport,
    archiveFactory: createArchiveFactory(),
    settingsStore: {
      loadSettings: () => store.loadSettings(),
      saveSettings: (settings) => store.saveSettings(settings),
    },
  });
  const remoteAccountId = buildRemoteEmailAccountId("remote@example.com");

  try {
    const result = await service.sendMessage({
      text: "Forged session attempt",
      localSessionId: "forged-session-id",
    });

    assert.equal(result.success, true);
    assert.notEqual(result.localSessionId, "forged-session-id");
    assert.equal(transportStub.sentMessages[0]?.localSessionId, result.localSessionId);
  } finally {
    cleanupAccount(accountId);
    cleanupAccount(remoteAccountId);
  }
});

void test("US1 conversation service starts explicit new sessions as fresh mail threads", async () => {
  const accountId = `us1_mail_${Date.now().toString(36)}_fresh_thread`;
  const initialSettings = createSettings(accountId);
  if (initialSettings.remoteUsers?.[0] !== undefined) {
    initialSettings.remoteUsers[0].threadMessageId = "<handshake-root@example.test>";
    initialSettings.remoteUsers[0].lastTransportMessageId = "<handshake-last@example.test>";
  }
  const store = createSettingsStore(initialSettings);
  const transportStub = createTransportStub();
  const service = new Us1ConversationService({
    now: () => FIXED_NOW,
    transport: transportStub.transport,
    archiveFactory: createArchiveFactory(),
    settingsStore: {
      loadSettings: () => store.loadSettings(),
      saveSettings: (settings) => store.saveSettings(settings),
    },
  });
  const remoteAccountId = buildRemoteEmailAccountId("remote@example.com");

  try {
    const firstResult = await service.sendMessage({
      text: "Fresh branch",
      localSessionId: "fresh-session-1",
    });

    assert.equal(firstResult.success, true);
    assert.notEqual(firstResult.localSessionId, "fresh-session-1");
    assert.equal(typeof firstResult.localSessionId, "string");
    assert.equal(transportStub.sentMessages.length, 1);
    assert.equal(transportStub.sentMessages[0]?.threadMessageId, null);
    assert.equal(transportStub.sentMessages[0].inReplyTo, null);
    assert.equal(transportStub.sentMessages[0].references, undefined);
    const firstEnvelope = extractConversationEnvelope(transportStub.sentMessages[0]);
    assert.equal((firstEnvelope["session"] as Record<string, unknown>)["mode"], "new");

    const secondParams: Parameters<typeof service.sendMessage>[0] = { text: "Fresh follow up" };
    if (firstResult.localSessionId !== undefined) {
      secondParams.localSessionId = firstResult.localSessionId;
    }
    const secondResult = await service.sendMessage(secondParams);

    assert.equal(secondResult.success, true);
    assert.equal(transportStub.sentMessages.length, 2);
    assert.equal(transportStub.sentMessages[1]?.threadMessageId, firstResult.transportMessageId);
    assert.equal(transportStub.sentMessages[1]?.inReplyTo, firstResult.transportMessageId);
    assert.deepEqual(transportStub.sentMessages[1]?.references, [
      firstResult.transportMessageId,
      firstResult.transportMessageId,
    ]);
    const secondEnvelope = extractConversationEnvelope(transportStub.sentMessages[1]);
    assert.equal((secondEnvelope["session"] as Record<string, unknown>)["mode"], "reply");

    const sidecar = new MailSidecarStoreManager(accountId);
    const mapping = sidecar.getSessionMapping("remote@example.com", firstResult.localSessionId ?? "");
    assert.equal(mapping?.threadMessageId, firstResult.transportMessageId);
    assert.equal(mapping?.lastMessageId, secondResult.transportMessageId);
  } finally {
    cleanupAccount(accountId);
    cleanupAccount(remoteAccountId);
  }
});

void test("US1 conversation service retries are idempotent with the same clientRequestId", async () => {
  const accountId = `us1_mail_${Date.now().toString(36)}_retry_send`;
  const store = createSettingsStore(createSettings(accountId));
  const transportStub = createTransportStub();
  const service = new Us1ConversationService({
    now: () => FIXED_NOW,
    transport: transportStub.transport,
    archiveFactory: createArchiveFactory(),
    settingsStore: {
      loadSettings: () => store.loadSettings(),
      saveSettings: (settings) => store.saveSettings(settings),
    },
  });
  const remoteAccountId = buildRemoteEmailAccountId("remote@example.com");

  try {
    const first = await service.sendMessage({
      clientRequestId: "us1-client-req-1",
      text: "Retry once",
    });
    const second = await service.sendMessage({
      clientRequestId: "us1-client-req-1",
      text: "Retry once",
    });

    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(transportStub.sentMessages.length, 1);
    assert.equal(first.transportMessageId, second.transportMessageId);
    assert.equal(first.brokerMessageId, second.brokerMessageId);
  } finally {
    cleanupAccount(accountId);
    cleanupAccount(remoteAccountId);
  }
});
