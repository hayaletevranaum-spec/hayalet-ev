import type {
  Us1RoomCommandInput,
  Us1RoomEventInput,
  Us1SessionMode,
  Us1SessionOpenHint,
} from "./us1-mail.js";

export const US1_RELAY_PROTOCOL = "hayalet-ev-us1-relay";
export const US1_RELAY_PROTOCOL_VERSION = 1;
export const US1_RELAY_MESSAGE_PROTOCOL = "hayalet-ev-us1-relay-message";

export interface Us1RelayLocalIdentityMetadata {
  deviceId: string;
  protocolVersion: number;
  encryptionPublicKey: string;
  encryptionKeyFingerprint: string;
  signingPublicKey: string;
  signingKeyFingerprint: string;
  createdAt: number;
}

export interface Us1RelayStoredIdentity extends Us1RelayLocalIdentityMetadata {
  encryptionPrivateKeyPem: string;
  signingPrivateKeyPem: string;
}

export interface Us1RelayAttachmentPayload {
  name: string;
  mimeType?: string | null;
  size: number;
  transferMode?: "inline" | "chunked";
  contentBase64?: string;
  chunkTransfer?: {
    attachmentId: string;
    chunkCount: number;
    chunkSize: number;
  } | null;
}

export interface Us1RelayProfilePayload {
  remoteUserId: string;
  email: string;
  nickname: string;
  avatar: string;
  profileRevision: number;
}

export interface Us1RelaySessionDescriptor {
  id: string;
  mode: Us1SessionMode;
  title: string | null;
  createdAt: number;
  openHint: Us1SessionOpenHint;
}

export interface Us1RelayThreadDescriptor {
  threadRootMessageId: string | null;
  replyToMessageId: string | null;
}

export interface Us1RelayConversationPayload {
  protocol: typeof US1_RELAY_MESSAGE_PROTOCOL;
  version: typeof US1_RELAY_PROTOCOL_VERSION;
  messageType: "conversation";
  sentAt: number;
  localSessionId: string | null;
  session: Us1RelaySessionDescriptor | null;
  thread: Us1RelayThreadDescriptor | null;
  profile: Us1RelayProfilePayload;
  text: string;
  attachments: Us1RelayAttachmentPayload[];
  roomEvent?: Us1RoomEventInput | null;
  roomCommand?: Us1RoomCommandInput | null;
}

export interface Us1RelayEncryptedEnvelope {
  protocol: typeof US1_RELAY_PROTOCOL;
  version: typeof US1_RELAY_PROTOCOL_VERSION;
  messageId: string;
  senderRemoteUserId: string;
  senderEncryptionKeyFingerprint: string;
  recipientEncryptionKeyFingerprint: string;
  sentAt: number;
  nonce: string;
  aad: string;
  ciphertext: string;
  authTag: string;
}

export interface Us1RelayPublishRequest {
  senderSigningPublicKey: string;
  senderSigningKeyFingerprint: string;
  recipientSigningKeyFingerprint: string;
  signedAt: number;
  nonce: string;
  signature: string;
  envelope: Us1RelayEncryptedEnvelope;
}

export interface Us1RelayPublishResponse {
  success: boolean;
  messageId?: string;
  queuedAt?: number;
  error?: string;
}

export interface Us1RelayAttachmentUploadRequest {
  senderSigningPublicKey: string;
  senderSigningKeyFingerprint: string;
  recipientSigningKeyFingerprint: string;
  attachmentId: string;
  chunkIndex: number;
  chunkCount: number;
  signedAt: number;
  nonce: string;
  signature: string;
  envelope: Us1RelayEncryptedEnvelope;
}

export interface Us1RelayAttachmentUploadResponse {
  success: boolean;
  attachmentId?: string;
  chunkIndex?: number;
  queuedAt?: number;
  error?: string;
}

export interface Us1RelayAttachmentDownloadRequest {
  recipientSigningPublicKey: string;
  recipientSigningKeyFingerprint: string;
  attachmentId: string;
  signedAt: number;
  nonce: string;
  signature: string;
}

export interface Us1RelayStoredAttachmentChunk {
  id: string;
  attachmentId: string;
  chunkIndex: number;
  chunkCount: number;
  queuedAt: number;
  envelope: Us1RelayEncryptedEnvelope;
}

export interface Us1RelayAttachmentDownloadResponse {
  success: boolean;
  attachmentId?: string;
  chunks?: Us1RelayStoredAttachmentChunk[];
  error?: string;
}

export interface Us1RelayPollRequest {
  recipientSigningPublicKey: string;
  recipientSigningKeyFingerprint: string;
  cursor?: string | null;
  limit?: number;
  signedAt: number;
  nonce: string;
  signature: string;
}

export interface Us1RelayQueuedEnvelope {
  id: string;
  cursor: string;
  queuedAt: number;
  envelope: Us1RelayEncryptedEnvelope;
}

export interface Us1RelayPollResponse {
  success: boolean;
  cursor?: string | null;
  messages?: Us1RelayQueuedEnvelope[];
  error?: string;
}

export interface Us1RelayAckRequest {
  recipientSigningPublicKey: string;
  recipientSigningKeyFingerprint: string;
  messageIds: string[];
  attachmentIds?: string[];
  signedAt: number;
  nonce: string;
  signature: string;
}

export interface Us1RelayAckResponse {
  success: boolean;
  acknowledgedCount?: number;
  deletedAttachmentCount?: number;
  error?: string;
}

export interface Us1RelayHealthCheckParams {
  baseUrl?: string | null;
}

export interface Us1RelayHealthCheckResult {
  success: boolean;
  reachable?: boolean;
  checkedAt?: number;
  error?: string;
}
