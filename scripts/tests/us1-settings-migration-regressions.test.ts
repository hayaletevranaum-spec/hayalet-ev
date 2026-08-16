import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultSettings,
  normalizeSettings,
} from "../../src/js/modules/settings/settings-schema.ts";
import {
  buildRemoteEmailAccountId,
  extractRemoteEmailFromAccountId,
} from "../../src/types/archive.ts";

void test("default settings scaffold user email, local mail account, and us1 selected account", () => {
  const settings = defaultSettings();

  assert.equal(settings.user!.email, "");
  assert.equal(settings.integrations!.mailTransport!.localAccount, null);
  assert.equal(settings.integrations!.us1Relay!.enabled, false);
  assert.equal(settings.integrations!.us1Relay!.trustState, "unknown");
  assert.equal(settings.us1Slot!.communicationSystem, "mail");
  assert.equal(settings.us1Slot!.selectedIdentityId, null);
  assert.equal(settings.us1Slot!.selectedAccountId, null);
});

void test("normalize settings backfills singleton local mail account from legacy mail accounts", () => {
  const normalized = normalizeSettings({
    integrations: {
      mailTransport: {
        accounts: [
          {
            id: "mail_local_example_com",
            providerType: "gmail",
            email: "local@example.com",
            enabled: true,
            connectionState: "connected",
            authType: "password",
            auth: {
              user: "local@example.com",
              password: "app-password",
            },
          },
        ],
      },
    },
  });

  assert.equal(normalized.integrations!.mailTransport!.localAccount!.id, "mail_local_example_com");
  assert.equal(normalized.user!.email, "local@example.com");
});

void test("normalize settings keeps localAccount empty until a mail account is connected", () => {
  const normalized = normalizeSettings({
    integrations: {
      mailTransport: {
        accounts: [
          {
            id: "mail_local_example_com",
            providerType: "gmail",
            email: "local@example.com",
            enabled: true,
            connectionState: "disconnected",
            authType: "password",
            auth: {
              user: "local@example.com",
              password: "app-password",
            },
          },
        ],
      },
    },
  });

  assert.equal(normalized.integrations!.mailTransport!.localAccount, null);
  assert.equal(normalized.user!.email, "");
});

void test("normalize settings derives us1 selected account id from legacy selected remote user id", () => {
  const normalized = normalizeSettings({
    accounts: [
      {
        id: "chatgpt_local_example_com",
        provider: "chatgpt",
        email: "local@example.com",
      },
    ],
    remoteUsers: [
      {
        remoteUserId: "remote@example.com",
        email: "remote@example.com",
        handshakeState: "active",
        profileRevision: 1,
        linkedMailAccountId: "mail_local_example_com",
      },
    ],
    us1Slot: {
      selectedRemoteUserId: "remote@example.com",
      connectionState: "connected",
    },
  });

  assert.equal(
    normalized.us1Slot!.selectedAccountId,
    buildRemoteEmailAccountId("remote@example.com")
  );
  assert.equal(normalized.us1Slot!.selectedIdentityId, "remote@example.com");
  assert.deepEqual(
    normalized.accounts.map((account) => ({ id: account.id, provider: account.provider })),
    [
      { id: "chatgpt_local_example_com", provider: "chatgpt" },
      {
        id: buildRemoteEmailAccountId("remote@example.com"),
        provider: "remote-email",
      },
    ]
  );
  assert.equal(
    normalized.accounts.find((account) => account.provider === "remote-email")!.remoteEmail!
      .linkedLocalMailAccountId,
    "mail_local_example_com"
  );
});

void test("normalize settings derives legacy remote identity from selected remote account id", () => {
  const selectedAccountId = buildRemoteEmailAccountId("remote@example.com");
  const normalized = normalizeSettings({
    remoteUsers: [
      {
        remoteUserId: "remote@example.com",
        email: "remote@example.com",
        handshakeState: "active",
        profileRevision: 1,
        linkedMailAccountId: "mail_local_example_com",
      },
    ],
    us1Slot: {
      selectedAccountId,
      connectionState: "connected",
    },
  });

  assert.equal(normalized.us1Slot!.selectedRemoteUserId, "remote@example.com");
  assert.equal(normalized.us1Slot!.selectedIdentityId, "remote@example.com");
  assert.equal(normalized.us1Slot!.selectedAccountId, selectedAccountId);
});

void test("normalize settings keeps us1 selected account id aligned with selected remote identity", () => {
  const normalized = normalizeSettings({
    remoteUsers: [
      {
        remoteUserId: "remote@example.com",
        email: "remote@example.com",
        handshakeState: "active",
        profileRevision: 1,
        linkedMailAccountId: "mail_local_example_com",
      },
    ],
    us1Slot: {
      selectedRemoteUserId: "remote@example.com",
      selectedAccountId: buildRemoteEmailAccountId("other@example.com"),
      connectionState: "connected",
    },
  });

  assert.equal(
    normalized.us1Slot!.selectedAccountId,
    buildRemoteEmailAccountId("remote@example.com")
  );
});

void test("normalize settings backfills remote users from stored remote email accounts", () => {
  const normalized = normalizeSettings({
    accounts: [
      {
        id: buildRemoteEmailAccountId("remote@example.com"),
        provider: "remote-email",
        accountKind: "remote-email",
        email: "remote@example.com",
        nickname: "Remote User",
        remoteEmail: {
          remoteUserId: "remote@example.com",
          linkedLocalMailAccountId: "mail_local_example_com",
          handshakeState: "active",
          profileRevision: 3,
          pendingIncoming: true,
        },
      },
    ],
  });

  assert.equal(normalized.remoteUsers!.length, 1);
  assert.equal(normalized.remoteUsers![0]!.remoteUserId, "remote@example.com");
  assert.equal(normalized.remoteUsers![0]!.linkedMailAccountId, "mail_local_example_com");
  assert.equal(normalized.accounts[0]!.remoteEmail!.pendingIncoming, true);
});

void test("normalize settings preserves rejected remote handshake state", () => {
  const normalized = normalizeSettings({
    remoteUsers: [
      {
        remoteUserId: "remote@example.com",
        email: "remote@example.com",
        nickname: "Remote User",
        handshakeState: "rejected",
        profileRevision: 4,
        linkedMailAccountId: "mail_local_example_com",
      },
    ],
  });

  assert.equal(normalized.remoteUsers?.[0]?.handshakeState, "rejected");
  assert.equal(normalized.accounts[0]?.remoteEmail?.handshakeState, "rejected");
});

void test("remote email account id helpers round-trip normalized email values", () => {
  const accountId = buildRemoteEmailAccountId("Remote@Example.com");

  assert.equal(accountId, "remote_email_remote%40example.com");
  assert.equal(extractRemoteEmailFromAccountId(accountId), "remote@example.com");
});
