import {
  createPublicKey,
  diffieHellman,
  hkdfSync,
  randomBytes,
  sign,
  verify,
  createCipheriv,
  createDecipheriv,
  type KeyObject,
} from "node:crypto";

import type { Us1RelayConversationPayload, Us1RelayEncryptedEnvelope } from "@shared/us1-relay.js";

function fromBase64(value: string): Buffer {
  return Buffer.from(value, "base64");
}

function toBase64(value: Buffer): string {
  return value.toString("base64");
}

function toBuffer(value: string | Buffer): Buffer {
  return typeof value === "string" ? Buffer.from(value, "utf8") : value;
}

function buildRelayAad(params: {
  messageId: string;
  senderRemoteUserId: string;
  senderEncryptionKeyFingerprint: string;
  recipientEncryptionKeyFingerprint: string;
  sentAt: number;
}): string {
  return stableSerialize({
    protocol: "hayalet-ev-us1-relay",
    version: 1,
    messageId: params.messageId,
    senderRemoteUserId: params.senderRemoteUserId,
    senderEncryptionKeyFingerprint: params.senderEncryptionKeyFingerprint,
    recipientEncryptionKeyFingerprint: params.recipientEncryptionKeyFingerprint,
    sentAt: params.sentAt,
  });
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableValue(entry));
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }

  return value;
}

export function stableSerialize(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export function randomNonce(size = 12): string {
  return randomBytes(size).toString("base64");
}

export function randomToken(size = 18): string {
  return randomBytes(size).toString("hex");
}

export function deriveMessageKey(params: {
  localPrivateKey: KeyObject;
  remotePublicKeyBase64: string;
  senderEncryptionKeyFingerprint: string;
  recipientEncryptionKeyFingerprint: string;
  messageId: string;
}): Buffer {
  const sharedSecret = diffieHellman({
    privateKey: params.localPrivateKey,
    publicKey: createPublicKey({
      key: fromBase64(params.remotePublicKeyBase64),
      type: "spki",
      format: "der",
    }),
  });

  const salt = toBuffer(
    `${params.senderEncryptionKeyFingerprint}:${params.recipientEncryptionKeyFingerprint}`
  );
  const info = toBuffer(`${params.messageId}:hayalet-ev-us1-relay`);
  return Buffer.from(hkdfSync("sha256", sharedSecret, salt, info, 32));
}

export function encryptRelayPayload(params: {
  payload: Us1RelayConversationPayload;
  localPrivateKey: KeyObject;
  remotePublicKeyBase64: string;
  senderRemoteUserId: string;
  senderEncryptionKeyFingerprint: string;
  recipientEncryptionKeyFingerprint: string;
  messageId: string;
  sentAt: number;
}): Us1RelayEncryptedEnvelope {
  return encryptRelayBinary({
    payload: Buffer.from(stableSerialize(params.payload), "utf8"),
    localPrivateKey: params.localPrivateKey,
    remotePublicKeyBase64: params.remotePublicKeyBase64,
    senderRemoteUserId: params.senderRemoteUserId,
    senderEncryptionKeyFingerprint: params.senderEncryptionKeyFingerprint,
    recipientEncryptionKeyFingerprint: params.recipientEncryptionKeyFingerprint,
    messageId: params.messageId,
    sentAt: params.sentAt,
  });
}

export function encryptRelayBinary(params: {
  payload: Buffer;
  localPrivateKey: KeyObject;
  remotePublicKeyBase64: string;
  senderRemoteUserId: string;
  senderEncryptionKeyFingerprint: string;
  recipientEncryptionKeyFingerprint: string;
  messageId: string;
  sentAt: number;
}): Us1RelayEncryptedEnvelope {
  const nonce = randomNonce();
  const key = deriveMessageKey({
    localPrivateKey: params.localPrivateKey,
    remotePublicKeyBase64: params.remotePublicKeyBase64,
    senderEncryptionKeyFingerprint: params.senderEncryptionKeyFingerprint,
    recipientEncryptionKeyFingerprint: params.recipientEncryptionKeyFingerprint,
    messageId: params.messageId,
  });
  const aad = buildRelayAad(params);
  const cipher = createCipheriv("aes-256-gcm", key, fromBase64(nonce));
  cipher.setAAD(toBuffer(aad));
  const ciphertext = Buffer.concat([cipher.update(params.payload), cipher.final()]);

  return {
    protocol: "hayalet-ev-us1-relay",
    version: 1,
    messageId: params.messageId,
    senderRemoteUserId: params.senderRemoteUserId,
    senderEncryptionKeyFingerprint: params.senderEncryptionKeyFingerprint,
    recipientEncryptionKeyFingerprint: params.recipientEncryptionKeyFingerprint,
    sentAt: params.sentAt,
    nonce,
    aad,
    ciphertext: toBase64(ciphertext),
    authTag: toBase64(cipher.getAuthTag()),
  };
}

export function decryptRelayBinary(params: {
  envelope: Us1RelayEncryptedEnvelope;
  localPrivateKey: KeyObject;
  remotePublicKeyBase64: string;
}): Buffer {
  const key = deriveMessageKey({
    localPrivateKey: params.localPrivateKey,
    remotePublicKeyBase64: params.remotePublicKeyBase64,
    senderEncryptionKeyFingerprint: params.envelope.senderEncryptionKeyFingerprint,
    recipientEncryptionKeyFingerprint: params.envelope.recipientEncryptionKeyFingerprint,
    messageId: params.envelope.messageId,
  });
  const decipher = createDecipheriv("aes-256-gcm", key, fromBase64(params.envelope.nonce));
  decipher.setAAD(toBuffer(params.envelope.aad));
  decipher.setAuthTag(fromBase64(params.envelope.authTag));
  return Buffer.concat([decipher.update(fromBase64(params.envelope.ciphertext)), decipher.final()]);
}

export function decryptRelayPayload(params: {
  envelope: Us1RelayEncryptedEnvelope;
  localPrivateKey: KeyObject;
  remotePublicKeyBase64: string;
}): Us1RelayConversationPayload {
  const plaintext = decryptRelayBinary(params).toString("utf8");
  return JSON.parse(plaintext) as Us1RelayConversationPayload;
}

export function signRelayPayload(payload: unknown, signingPrivateKey: KeyObject): string {
  return sign(null, toBuffer(stableSerialize(payload)), signingPrivateKey).toString("base64");
}

export function verifyRelayPayloadSignature(params: {
  payload: unknown;
  signature: string;
  signingPublicKeyBase64: string;
}): boolean {
  return verify(
    null,
    toBuffer(stableSerialize(params.payload)),
    createPublicKey({
      key: fromBase64(params.signingPublicKeyBase64),
      type: "spki",
      format: "der",
    }),
    fromBase64(params.signature)
  );
}
