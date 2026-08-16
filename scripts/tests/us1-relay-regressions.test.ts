import assert from "node:assert/strict";
import { createHash, createPrivateKey, generateKeyPairSync, type KeyObject } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer as createHttpsServer } from "node:https";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { initPaths } from "../../electron/paths.ts";
import { Us1RelayServer } from "../../electron/us1-relay-server/server.ts";
import {
  RelayTlsPinError,
  us1RelayClient,
} from "../../electron/us1-relay/client.ts";
import {
  decryptRelayBinary,
  decryptRelayPayload,
  encryptRelayBinary,
  encryptRelayPayload,
  randomNonce,
  randomToken,
  signRelayPayload,
} from "../../electron/us1-relay/crypto.ts";
import {
  US1_RELAY_MESSAGE_PROTOCOL,
  US1_RELAY_PROTOCOL_VERSION,
  type Us1RelayConversationPayload,
  type Us1RelayEncryptedEnvelope,
} from "../../src/types/us1-relay.ts";

initPaths(join(process.cwd(), "electron"));

const TEST_TLS_CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIDJTCCAg2gAwIBAgIUJTb+9Hv5oymcAR2C8z0uO3lNg8YwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDUwMTE4MjUzNFoXDTM2MDQy
ODE4MjUzNFowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEApzRQ2OToBhiNjfaOhkdmUvqzCyzJXoyhWz5yDiU33EBz
qb5NxSDpAB3PeJJoUssmPh0bcYLkX/Ew2kMyW7nBUHQdIMF1FNRrkieQAPTdruIr
q+cEYalWY5AENAdNtNfFRlrcfElAUNxWu5o2dHX1ZtkZOxnm85yil9AhixVqTED2
0dl6bYO3aQ1LUIErKUuefdUvZqcZaajrXAcZ0W2uJtfX891a5StmB+vbqQSFzpaj
0F7yA+ME0VhWPkEzB7jfZPpWjxzzjQ5UMlGTOwwyqg2rIJAcRDqbI/FLDN0y/Chc
BLpzPL+OZve7HEdeuCfEQCCOm9OFoeSDtoI6ej02nwIDAQABo28wbTAdBgNVHQ4E
FgQU7w69w85RScdBb/dAJooie4UECdwwHwYDVR0jBBgwFoAU7w69w85RScdBb/dA
Jooie4UECdwwDwYDVR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhvc3SH
BH8AAAEwDQYJKoZIhvcNAQELBQADggEBAFtkuA0eHMw6qdDsTi0m8q4ehYoNlS/C
cHdeA79fPGsRx/7it0QCi38CHo4Bjc0Zv7EjvUZUwsWo0g7WTmjZ0d35BE/B2d6/
2Rft8PyqlMwIgHN8V/tHlpQWMyRZyBRDkeGYyPgSx08PZ8CeOpH1C0ZklCi3Ds6d
zCIqnk8DP0jn7AhuklgqhYDOOMNs61t7JEceZ7bAjgJVrk06p8tPedIOPEKPb9Fb
RAMBAU6BT0C5E62Ty+L7oL0+TQlhpKg5JRRuzv3XngDEGvgCqFmmbPLczSSFML2+
/aAdoOlQuLQLbt2BjqX90g6FMOqbNmJK8Jkvf0g6dHq2AEromuvSayA=
-----END CERTIFICATE-----
`;

const TEST_TLS_PRIVATE_KEY_DER_BASE64 =
  "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCnNFDY5OgGGI2N9o6GR2ZS+rMLLMlejKFbPnIO" +
  "JTfcQHOpvk3FIOkAHc94kmhSyyY+HRtxguRf8TDaQzJbucFQdB0gwXUU1GuSJ5AA9N2u4iur5wRhqVZjkAQ0B020" +
  "18VGWtx8SUBQ3Fa7mjZ0dfVm2Rk7GebznKKX0CGLFWpMQPbR2Xptg7dpDUtQgSspS5591S9mpxlpqOtcBxnRba4m" +
  "19fz3VrlK2YH69upBIXOlqPQXvID4wTRWFY+QTMHuN9k+laPHPONDlQyUZM7DDKqDasgkBxEOpsj8UsM3TL8KFwE" +
  "unM8v45m97scR164J8RAII6b04Wh5IO2gjp6PTafAgMBAAECggEAJ3VXJvhOMTIWJcxrshCjey2ilx6InwF9CrVf" +
  "4SqzVgz3vrUkUUME+XwPfBrA99jtO3dPBKipEGMw7jExbygVENF2FkbRRIskn6cqeq9OqXjCaZzpEcsOkgxokYav" +
  "td+9tG643bPDs9FrvnYUJ8O2mADfzWy9bfwm+sCpSdNR9JB2hB4+TG/buUvWWoTCEJxXFLE+DwmHNDt50DIoL0o5" +
  "fDUSmUb5c3E7W/IzfBD9VYkNnawdhnmCy+FDNniCvxlVIQUS3qdxfsx1JWe1JtJskbtJ8k1X4PRInPKqToFZf8ny" +
  "IhJTPUea8l5gnK9jZQkQWpS9WvC8JAT24eibNEGKAQKBgQDS0jiW8MXW6TWuGZsYxLQlYCEgkGHJkcTBdzuMSZKx" +
  "e7tBh+lW6ktn4m6j1Z0JGGwSMTBQpJiFRhT8A4oP8U9GHnrKDd/FPRDj0Xe/hkt0tAZFthxzn7fzGo1M9QDQrwvo" +
  "hllG+YdNmdFCyF4GTyXN3UPGhZEGec3WoyNgkH8PgQKBgQDLCT/Z8RpNmAyWdIWHQ3rooRdcMs5DRHbIzXTpPYc4" +
  "BK8poh6s+TVbYiUAxJk4eUeunBMiLGy9oC805DeH3YEABu77T7V7Rvx613wQk8Edw5RUNUOWZZvBzhQfcYw0M0xr" +
  "4Rc6Xy3rsG0qcpENpwFo5t3XjV6eMky4rlfIDiVWHwKBgEw51lw9EktyZwZcG8gI11nsOA4eJj1Lh2isQ8uljnS9" +
  "2CcJjUTv0fPt2zNBuVXgjrLFNkLyQHNvs4argO/iwFcKDjugaJhYTBMTWcjWNdIshVgPUJo91bUAlLaOn4zUvemF" +
  "KiKPdmyIgTE0YUrGs1SL/EV7ZcSBpftFYTU5CbgBAoGASZDmY89qWmcXWISLxUD8DcIgtrVp6xGpgISBMemrTu7T" +
  "kOA/ASmi3aOoCKkzYzT+dhPzEtTJ6cNal22BeWcW0K2ydbih5zMHVHMzbsY6mNA+tGxAOwRB9Wz3+ZSo2lkj/Yqn" +
  "Ye0OtHFOfKzaRfoXFq1gADQm7mcHSXtSLxiBCr0CgYEAxCPAHG1iV0DgDnl6rJiPJMCmVUT1bLHgJYzk4sW52LHL" +
  "rpPlfyTh4TDWMNDH3XIUr/xBkkn83e4ghx2rIxajxumKPhMV29KZQ7FOvGrLsGhX2776DLXb9NHYsTY26l8nCp/a" +
  "UL3ZKDzD/8YWGAfvUNRgpeop1YrFs4vtNVsfRoc=";

const TEST_TLS_PRIVATE_KEY = createPrivateKey({
  key: Buffer.from(TEST_TLS_PRIVATE_KEY_DER_BASE64, "base64"),
  format: "der",
  type: "pkcs8",
});

const TEST_TLS_PRIVATE_KEY_PEM = TEST_TLS_PRIVATE_KEY.export({
  format: "pem",
  type: "pkcs8",
}).toString();

function exportPublicKeyBase64(key: KeyObject): string {
  return Buffer.from(key.export({ type: "spki", format: "der" })).toString("base64");
}

function fingerprint(base64Key: string): string {
  return createHash("sha256").update(Buffer.from(base64Key, "base64")).digest("hex");
}

function fingerprintFromPemCertificate(pemCertificate: string): string {
  const der = Buffer.from(
    pemCertificate
      .replace(/-----BEGIN CERTIFICATE-----/g, "")
      .replace(/-----END CERTIFICATE-----/g, "")
      .replace(/\s+/g, ""),
    "base64"
  );
  return createHash("sha256").update(der).digest("hex");
}

async function postJson<TResponse>(url: string, body: unknown): Promise<TResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as TResponse;
}

void test("US1 relay server stores, serves, decrypts, and acknowledges encrypted envelopes", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "us1-relay-test-"));
  const relayServer = new Us1RelayServer(rootDir);
  const listener = relayServer.createListener();

  const senderEncryptionKeys = generateKeyPairSync("x25519");
  const senderSigningKeys = generateKeyPairSync("ed25519");
  const recipientEncryptionKeys = generateKeyPairSync("x25519");
  const recipientSigningKeys = generateKeyPairSync("ed25519");

  const senderEncryptionPublicKey = exportPublicKeyBase64(senderEncryptionKeys.publicKey);
  const senderSigningPublicKey = exportPublicKeyBase64(senderSigningKeys.publicKey);
  const recipientEncryptionPublicKey = exportPublicKeyBase64(recipientEncryptionKeys.publicKey);
  const recipientSigningPublicKey = exportPublicKeyBase64(recipientSigningKeys.publicKey);

  const senderEncryptionKeyFingerprint = fingerprint(senderEncryptionPublicKey);
  const senderSigningKeyFingerprint = fingerprint(senderSigningPublicKey);
  const recipientEncryptionKeyFingerprint = fingerprint(recipientEncryptionPublicKey);
  const recipientSigningKeyFingerprint = fingerprint(recipientSigningPublicKey);

  const payload: Us1RelayConversationPayload = {
    protocol: US1_RELAY_MESSAGE_PROTOCOL,
    version: US1_RELAY_PROTOCOL_VERSION,
    messageType: "conversation",
    sentAt: 1700000000000,
    localSessionId: "session-relay-1",
    session: {
      id: "session-relay-1",
      mode: "new",
      title: "Relay Test",
      createdAt: 1700000000000,
      openHint: "auto_if_idle",
    },
    thread: {
      threadRootMessageId: null,
      replyToMessageId: null,
    },
    profile: {
      remoteUserId: "sender@example.test",
      email: "sender@example.test",
      nickname: "Sender",
      avatar: "",
      profileRevision: 1,
    },
    text: "hello from relay",
    attachments: [],
  };

  const envelope: Us1RelayEncryptedEnvelope = encryptRelayPayload({
    payload,
    localPrivateKey: senderEncryptionKeys.privateKey,
    remotePublicKeyBase64: recipientEncryptionPublicKey,
    senderRemoteUserId: "sender@example.test",
    senderEncryptionKeyFingerprint,
    recipientEncryptionKeyFingerprint,
    messageId: "relay-message-1",
    sentAt: payload.sentAt,
  });

  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", () => { resolve(); }));
  const address = listener.address();
  assert.ok(address !== null && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const publishUnsignedPayload = {
      senderSigningPublicKey,
      senderSigningKeyFingerprint,
      recipientSigningKeyFingerprint,
      signedAt: Date.now(),
      nonce: randomToken(12),
      envelope,
    };
    const publishResult = await postJson<{ success: boolean; messageId?: string; error?: string }>(
      `${baseUrl}/v1/publish`,
      {
        ...publishUnsignedPayload,
        signature: signRelayPayload(publishUnsignedPayload, senderSigningKeys.privateKey),
      }
    );

    assert.equal(publishResult.success, true);
    assert.ok(publishResult.messageId != null);

    const pollUnsignedPayload = {
      recipientSigningPublicKey,
      recipientSigningKeyFingerprint,
      signedAt: Date.now(),
      nonce: randomNonce(9),
      cursor: null,
      limit: 10,
    };
    const pollResult = await postJson<{
      success: boolean;
      messages?: Array<{ id: string; envelope: Us1RelayEncryptedEnvelope }>;
    }>(`${baseUrl}/v1/poll`, {
      ...pollUnsignedPayload,
      signature: signRelayPayload(pollUnsignedPayload, recipientSigningKeys.privateKey),
    });

    assert.equal(pollResult.success, true);
    assert.equal(pollResult.messages?.length, 1);
    const message = pollResult.messages[0];
    assert.ok(message != null);

    const decrypted = decryptRelayPayload({
      envelope: message.envelope,
      localPrivateKey: recipientEncryptionKeys.privateKey,
      remotePublicKeyBase64: senderEncryptionPublicKey,
    });

    assert.equal(decrypted.text, "hello from relay");
    assert.equal(decrypted.localSessionId, "session-relay-1");

    const ackUnsignedPayload = {
      recipientSigningPublicKey,
      recipientSigningKeyFingerprint,
      messageIds: [message.id],
      signedAt: Date.now(),
      nonce: randomToken(12),
    };
    const ackResult = await postJson<{ success: boolean; acknowledgedCount?: number }>(
      `${baseUrl}/v1/ack`,
      {
        ...ackUnsignedPayload,
        signature: signRelayPayload(ackUnsignedPayload, recipientSigningKeys.privateKey),
      }
    );

    assert.equal(ackResult.success, true);
    assert.equal(ackResult.acknowledgedCount, 1);
  } finally {
    listener.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

void test("US1 relay server stores, downloads, decrypts, and cleans up encrypted attachment chunks", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "us1-relay-attachment-test-"));
  const relayServer = new Us1RelayServer(rootDir);
  const listener = relayServer.createListener();

  const senderEncryptionKeys = generateKeyPairSync("x25519");
  const senderSigningKeys = generateKeyPairSync("ed25519");
  const recipientEncryptionKeys = generateKeyPairSync("x25519");
  const recipientSigningKeys = generateKeyPairSync("ed25519");

  const senderEncryptionPublicKey = exportPublicKeyBase64(senderEncryptionKeys.publicKey);
  const senderSigningPublicKey = exportPublicKeyBase64(senderSigningKeys.publicKey);
  const recipientEncryptionPublicKey = exportPublicKeyBase64(recipientEncryptionKeys.publicKey);
  const recipientSigningPublicKey = exportPublicKeyBase64(recipientSigningKeys.publicKey);

  const senderEncryptionKeyFingerprint = fingerprint(senderEncryptionPublicKey);
  const senderSigningKeyFingerprint = fingerprint(senderSigningPublicKey);
  const recipientEncryptionKeyFingerprint = fingerprint(recipientEncryptionPublicKey);
  const recipientSigningKeyFingerprint = fingerprint(recipientSigningPublicKey);

  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", () => { resolve(); }));
  const address = listener.address();
  assert.ok(address !== null && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const attachmentId = "relay-attachment-1";
  const chunkPayloads = [Buffer.from("hello "), Buffer.from("from relay chunks")];

  try {
    await Promise.all(
      chunkPayloads.map(async (chunkPayload, chunkIndex) => {
        const envelope = encryptRelayBinary({
          payload: chunkPayload,
          localPrivateKey: senderEncryptionKeys.privateKey,
          remotePublicKeyBase64: recipientEncryptionPublicKey,
          senderRemoteUserId: "sender@example.test",
          senderEncryptionKeyFingerprint,
          recipientEncryptionKeyFingerprint,
          messageId: `${attachmentId}:${chunkIndex}`,
          sentAt: 1700000000000 + chunkIndex,
        });

        const uploadUnsignedPayload = {
          senderSigningPublicKey,
          senderSigningKeyFingerprint,
          recipientSigningKeyFingerprint,
          attachmentId,
          chunkIndex,
          chunkCount: chunkPayloads.length,
          signedAt: Date.now(),
          nonce: randomToken(12),
          envelope,
        };
        const uploadResult = await postJson<{ success: boolean; chunkIndex?: number }>(
          `${baseUrl}/v1/attachment/upload`,
          {
            ...uploadUnsignedPayload,
            signature: signRelayPayload(uploadUnsignedPayload, senderSigningKeys.privateKey),
          }
        );

        assert.equal(uploadResult.success, true);
        assert.equal(uploadResult.chunkIndex, chunkIndex);
      })
    );

    const downloadUnsignedPayload = {
      recipientSigningPublicKey,
      recipientSigningKeyFingerprint,
      attachmentId,
      signedAt: Date.now(),
      nonce: randomNonce(9),
    };
    const downloadResult = await postJson<{
      success: boolean;
      chunks?: Array<{ chunkIndex: number; envelope: Us1RelayEncryptedEnvelope }>;
    }>(`${baseUrl}/v1/attachment/download`, {
      ...downloadUnsignedPayload,
      signature: signRelayPayload(downloadUnsignedPayload, recipientSigningKeys.privateKey),
    });

    assert.equal(downloadResult.success, true);
    assert.equal(downloadResult.chunks?.length, chunkPayloads.length);

    const decrypted = Buffer.concat(
      (downloadResult.chunks ?? []).map((chunk) =>
        decryptRelayBinary({
          envelope: chunk.envelope,
          localPrivateKey: recipientEncryptionKeys.privateKey,
          remotePublicKeyBase64: senderEncryptionPublicKey,
        })
      )
    );
    assert.equal(decrypted.toString("utf8"), "hello from relay chunks");

    const ackUnsignedPayload = {
      recipientSigningPublicKey,
      recipientSigningKeyFingerprint,
      messageIds: [],
      attachmentIds: [attachmentId],
      signedAt: Date.now(),
      nonce: randomToken(12),
    };
    const ackResult = await postJson<{
      success: boolean;
      deletedAttachmentCount?: number;
    }>(`${baseUrl}/v1/ack`, {
      ...ackUnsignedPayload,
      signature: signRelayPayload(ackUnsignedPayload, recipientSigningKeys.privateKey),
    });

    assert.equal(ackResult.success, true);
    assert.equal(ackResult.deletedAttachmentCount, 1);

    const afterCleanupUnsignedPayload = {
      recipientSigningPublicKey,
      recipientSigningKeyFingerprint,
      attachmentId,
      signedAt: Date.now(),
      nonce: randomNonce(9),
    };
    const afterCleanup = await postJson<{
      success: boolean;
      chunks?: Array<{ chunkIndex: number; envelope: Us1RelayEncryptedEnvelope }>;
    }>(`${baseUrl}/v1/attachment/download`, {
      ...afterCleanupUnsignedPayload,
      signature: signRelayPayload(afterCleanupUnsignedPayload, recipientSigningKeys.privateKey),
    });

    assert.equal(afterCleanup.success, true);
    assert.equal(afterCleanup.chunks?.length ?? 0, 0);
  } finally {
    listener.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

void test("US1 relay client pins the HTTPS relay certificate fingerprint", async () => {
  const listener = createHttpsServer(
    {
      key: TEST_TLS_PRIVATE_KEY_PEM,
      cert: TEST_TLS_CERT_PEM,
    },
    (_req, res) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ success: true }));
    }
  );

  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", () => { resolve(); }));
  const address = listener.address();
  assert.ok(address !== null && typeof address === "object");
  const baseUrl = `https://localhost:${address.port}`;
  const expectedFingerprint = fingerprintFromPemCertificate(TEST_TLS_CERT_PEM);

  try {
    const healthResult = await us1RelayClient.health(baseUrl);
    assert.equal(healthResult.reachable, true);
    assert.equal(healthResult.transportProtocol, "https");
    assert.equal(healthResult.serverFingerprint, expectedFingerprint);

    await assert.rejects(
      async () => {
        await us1RelayClient.health(baseUrl, {
          pinnedServerFingerprint: "deadbeef",
        });
      },
      (error: unknown) => {
        assert.ok(error instanceof RelayTlsPinError);
        assert.equal(error.expectedFingerprint, "deadbeef");
        assert.equal(error.observedFingerprint, expectedFingerprint);
        return true;
      }
    );

    const pinnedResult = await us1RelayClient.health(baseUrl, {
      pinnedServerFingerprint: expectedFingerprint,
    });
    assert.equal(pinnedResult.reachable, true);
    assert.equal(pinnedResult.serverFingerprint, expectedFingerprint);
  } finally {
    listener.close();
  }
});

void test("US1 relay server sweeps orphaned attachment uploads after the retention window", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "us1-relay-cleanup-test-"));
  let now = 1_700_000_100_000;
  const relayServer = new Us1RelayServer(rootDir, {
    now: () => now,
    orphanedAttachmentTtlMs: 50,
    cleanupIntervalMs: 0,
  });
  const listener = relayServer.createListener();

  const senderEncryptionKeys = generateKeyPairSync("x25519");
  const senderSigningKeys = generateKeyPairSync("ed25519");
  const recipientEncryptionKeys = generateKeyPairSync("x25519");
  const recipientSigningKeys = generateKeyPairSync("ed25519");

  const senderEncryptionPublicKey = exportPublicKeyBase64(senderEncryptionKeys.publicKey);
  const senderSigningPublicKey = exportPublicKeyBase64(senderSigningKeys.publicKey);
  const recipientEncryptionPublicKey = exportPublicKeyBase64(recipientEncryptionKeys.publicKey);
  const recipientSigningPublicKey = exportPublicKeyBase64(recipientSigningKeys.publicKey);

  const senderEncryptionKeyFingerprint = fingerprint(senderEncryptionPublicKey);
  const senderSigningKeyFingerprint = fingerprint(senderSigningPublicKey);
  const recipientEncryptionKeyFingerprint = fingerprint(recipientEncryptionPublicKey);
  const recipientSigningKeyFingerprint = fingerprint(recipientSigningPublicKey);

  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", () => { resolve(); }));
  const address = listener.address();
  assert.ok(address !== null && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const attachmentId = "relay-orphaned-attachment-1";

  try {
    const encryptedChunk = encryptRelayBinary({
      payload: Buffer.from("orphaned attachment"),
      localPrivateKey: senderEncryptionKeys.privateKey,
      remotePublicKeyBase64: recipientEncryptionPublicKey,
      senderRemoteUserId: "sender@example.test",
      senderEncryptionKeyFingerprint,
      recipientEncryptionKeyFingerprint,
      messageId: `${attachmentId}:0`,
      sentAt: now,
    });
    const uploadUnsignedPayload = {
      senderSigningPublicKey,
      senderSigningKeyFingerprint,
      recipientSigningKeyFingerprint,
      attachmentId,
      chunkIndex: 0,
      chunkCount: 1,
      signedAt: now,
      nonce: randomToken(12),
      envelope: encryptedChunk,
    };
    const uploadResult = await postJson<{ success: boolean }>(`${baseUrl}/v1/attachment/upload`, {
      ...uploadUnsignedPayload,
      signature: signRelayPayload(uploadUnsignedPayload, senderSigningKeys.privateKey),
    });
    assert.equal(uploadResult.success, true);

    now += 100;
    await fetch(`${baseUrl}/v1/health`);

    const downloadUnsignedPayload = {
      recipientSigningPublicKey,
      recipientSigningKeyFingerprint,
      attachmentId,
      signedAt: now,
      nonce: randomNonce(9),
    };
    const downloadResult = await postJson<{
      success: boolean;
      chunks?: Array<{ chunkIndex: number; envelope: Us1RelayEncryptedEnvelope }>;
    }>(`${baseUrl}/v1/attachment/download`, {
      ...downloadUnsignedPayload,
      signature: signRelayPayload(downloadUnsignedPayload, recipientSigningKeys.privateKey),
    });
    assert.equal(downloadResult.success, true);
    assert.equal(downloadResult.chunks?.length ?? 0, 0);
  } finally {
    listener.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});
