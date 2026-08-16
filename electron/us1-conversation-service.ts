import { readFile, readdir } from "node:fs/promises";
import { basename, extname, join } from "node:path";

import type {
  Account,
  AppSettings,
  MailTransportAccountConfig,
  RemoteUserIdentity,
  Us1RelayPeerCapability,
} from "@shared/settings.js";
import {
  getRemoteEmailAccounts,
  getRemoteUserLinkedAccountId,
  getUs1SelectedIdentityId,
} from "@shared/settings.js";
import {
  buildRemoteEmailAccountId,
  buildUs1SyntheticSessionUri,
  extractUs1RemoteIdentityIdFromAccountId,
} from "@shared/archive.js";
import type {
  Us1RoomCommandInput,
  Us1RoomCommandRecord,
  Us1RoomEventInput,
  Us1RoomEventRecord,
  Us1RoomEventType,
  Us1RoomInviteStarter,
  Us1RoomPackageCandidate,
  Us1SessionEvent,
  Us1SessionMode,
  Us1SessionOpenHint,
  Us1SendMessageParams,
  Us1SendMessageResult,
  Us1SyncMessagesParams,
  Us1SyncMessagesResult,
} from "@shared/us1-mail.js";
import type {
  Us1RelayAttachmentPayload,
  Us1RelayHealthCheckParams,
  Us1RelayHealthCheckResult,
  Us1RelayConversationPayload,
  Us1RelayProfilePayload,
} from "@shared/us1-relay.js";
import { US1_RELAY_MESSAGE_PROTOCOL, US1_RELAY_PROTOCOL_VERSION } from "@shared/us1-relay.js";

import { parseInlineCommands } from "../src/js/modules/commands/inline-command-parser.ts";
import { normalizeSettings } from "../src/js/modules/settings/settings-schema.ts";
import { MailSidecarStoreManager } from "./database/mail-sidecar-manager.ts";
import { hashString, normalizeText } from "./database/hash-utils.ts";
import { getLoggerCore } from "./logger/index.js";
import { MailTransportService } from "./mail-transport/index.js";
import type {
  FetchInboxResult,
  MailTransportParsedAttachment,
  SendMailRequest,
  SendMailResult,
} from "./mail-transport/index.js";
import {
  decryptRelayBinary,
  decryptRelayPayload,
  encryptRelayBinary,
  encryptRelayPayload,
} from "./us1-relay/crypto.ts";
import { us1RelayIdentityService } from "./us1-relay/identity-service.ts";
import {
  RelayTlsPinError,
  normalizeRelayServerFingerprint,
  us1RelayClient,
  type Us1RelayRequestOptions,
  type Us1RelayResponseMeta,
} from "./us1-relay/client.ts";
import { Paths } from "./paths.ts";
import { LogCategory, LogLevel } from "@shared/index.js";

const HANDSHAKE_PROTOCOL = "hayalet-ev-us1-handshake";
const HANDSHAKE_VERSION = 1;
const HANDSHAKE_PAYLOAD_START = "--- HAYALET_EV_US1_PAYLOAD ---";
const HANDSHAKE_PAYLOAD_END = "--- /HAYALET_EV_US1_PAYLOAD ---";

const MESSAGE_PROTOCOL = "hayalet-ev-us1-message";
const MESSAGE_VERSION = 1;
const MESSAGE_PAYLOAD_START = "--- HAYALET_EV_US1_MESSAGE_PAYLOAD ---";
const MESSAGE_PAYLOAD_END = "--- /HAYALET_EV_US1_MESSAGE_PAYLOAD ---";
const MESSAGE_TYPE_CONVERSATION = "conversation";
const ROOM_BUNDLE_SUFFIX = ".hevroom.json";
const OUTBOUND_ATTACHMENT_ONLY_TEXT = "Attachment-only message.";
const INBOUND_ATTACHMENT_ONLY_TEXT = "Attachment-only mail message.";
const SUBJECT_PREFIX = "[Hayalet Ev] US1";
const RELAY_INLINE_ATTACHMENT_LIMIT_BYTES = 256 * 1024;
const RELAY_ATTACHMENT_CHUNK_SIZE_BYTES = 256 * 1024;
const logger = getLoggerCore();

type HandshakeMessageType = "invite" | "accept" | "reject" | "profile";

interface HandshakeEnvelope {
  protocol: typeof HANDSHAKE_PROTOCOL;
  version: typeof HANDSHAKE_VERSION;
  messageType: HandshakeMessageType;
  inviteId: string;
  sentAt: number;
  profile: MessageProfile;
}

interface MessageProfile {
  remoteUserId: string;
  email: string;
  nickname: string;
  avatar: string;
  avatarAttachmentName?: string | null;
  profileRevision: number;
  relayCapability?: Us1RelayPeerCapability | null;
}

interface ConversationEnvelope {
  protocol: typeof MESSAGE_PROTOCOL;
  version: typeof MESSAGE_VERSION;
  messageType: typeof MESSAGE_TYPE_CONVERSATION;
  sentAt: number;
  localSessionId: string | null;
  session: ConversationSessionDescriptor | null;
  thread: ConversationThreadDescriptor | null;
  profile: MessageProfile;
  roomEvent?: ConversationRoomEvent | null;
  roomCommand?: ConversationRoomCommand | null;
}

interface ConversationSessionDescriptor {
  id: string;
  mode: Us1SessionMode;
  title: string | null;
  createdAt: number;
  openHint: Us1SessionOpenHint;
}

interface ConversationThreadDescriptor {
  threadRootMessageId: string | null;
  replyToMessageId: string | null;
}

type ConversationRoomEvent = Us1RoomEventInput;

type ConversationRoomCommand = Omit<Us1RoomCommandInput, "roomId" | "featureId"> & {
  roomId?: string | null;
  featureId?: string | null;
};

interface RoomCommandIdentity {
  roomId: string;
  featureId: string;
}

interface MailTransportFacade {
  sendMail(
    accountConfig: MailTransportAccountConfig,
    message: SendMailRequest
  ): Promise<SendMailResult>;
  fetchInbox(
    accountConfig: MailTransportAccountConfig,
    request?: { limit?: number; includeAttachmentContent?: boolean }
  ): Promise<FetchInboxResult>;
}

interface ConversationSettingsStore {
  loadSettings(): Promise<AppSettings | null>;
  saveSettings(settings: AppSettings): Promise<boolean>;
}

interface ResolvedBinding {
  remoteUser: RemoteUserIdentity;
  account: MailTransportAccountConfig;
}

interface ArchiveContext {
  manager: ArchiveManagerLike;
  archiveAccountId: string;
  webUrl: string;
  conversationId: string;
}

interface ArchiveManagerLike {
  upsertConversationMetadata(params: {
    webUrl: string;
    provider?: string;
    title?: string | null;
  }): Promise<{
    success: boolean;
    data?: {
      conversationId: string;
      created: boolean;
      title: string;
      titleUpdated: boolean;
    };
    error?: string;
  }>;
  getMessages(conversationId: string): Promise<{
    success: boolean;
    data?: Array<unknown>;
    error?: string;
  }>;
  syncMessages(params: {
    accountId: string;
    clientRequestId?: string;
    provider?: string;
    webUrl: string;
    messages: Array<{
      role: "user" | "assistant";
      text: string;
      author?: string;
      brokerMessageId?: string;
      index?: number;
      domIndex?: number;
      domId?: string;
      contentHash?: string;
      providerMessageId?: string;
    }>;
  }): Promise<{
    success: boolean;
    conversationId?: string;
    added?: number;
    total?: number;
    error?: string;
  }>;
  saveAttachment(
    conversationId: string,
    messageId: string,
    filePath: string,
    originalName: string,
    mimeType?: string
  ): Promise<{
    success: boolean;
    data?: { attachmentId: string; storedPath: string };
    error?: string;
  }>;
  saveAttachmentContent(
    conversationId: string,
    messageId: string,
    content: Buffer,
    originalName: string,
    mimeType?: string
  ): Promise<{
    success: boolean;
    data?: { attachmentId: string; storedPath: string };
    error?: string;
  }>;
}

type OutboundSendCacheEntry = {
  createdAt: number;
  promise: Promise<Us1SendMessageResult>;
  result?: Us1SendMessageResult;
};

type ArchiveManagerFactory = (accountId: string) => Promise<ArchiveManagerLike>;

interface AttachmentArchiveRef {
  attachmentId?: string;
  originalName: string;
  storedPath: string;
  mimeType?: string | null;
  size?: number;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normalizeEmail(value: unknown): string {
  return normalizeOptionalText(value)?.toLowerCase() ?? "";
}

function normalizeRelayCapability(value: unknown): Us1RelayPeerCapability | null {
  if (value === null || value === undefined || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record["supported"] !== true) {
    return null;
  }

  return {
    supported: true,
    endpoint:
      typeof record["endpoint"] === "string" && record["endpoint"].trim() !== ""
        ? record["endpoint"].trim()
        : null,
    encryptionPublicKey:
      typeof record["encryptionPublicKey"] === "string" &&
      record["encryptionPublicKey"].trim() !== ""
        ? record["encryptionPublicKey"].trim()
        : null,
    encryptionKeyFingerprint:
      typeof record["encryptionKeyFingerprint"] === "string" &&
      record["encryptionKeyFingerprint"].trim() !== ""
        ? record["encryptionKeyFingerprint"].trim()
        : null,
    signingPublicKey:
      typeof record["signingPublicKey"] === "string" && record["signingPublicKey"].trim() !== ""
        ? record["signingPublicKey"].trim()
        : null,
    signingKeyFingerprint:
      typeof record["signingKeyFingerprint"] === "string" &&
      record["signingKeyFingerprint"].trim() !== ""
        ? record["signingKeyFingerprint"].trim()
        : null,
    protocolVersion:
      typeof record["protocolVersion"] === "number" &&
      Number.isFinite(record["protocolVersion"]) &&
      record["protocolVersion"] >= 1
        ? Math.trunc(record["protocolVersion"])
        : 1,
    advertisedAt:
      typeof record["advertisedAt"] === "number" &&
      Number.isFinite(record["advertisedAt"]) &&
      record["advertisedAt"] >= 0
        ? Math.trunc(record["advertisedAt"])
        : null,
    trustState:
      record["trustState"] === "trusted" ||
      record["trustState"] === "mismatch" ||
      record["trustState"] === "unknown"
        ? record["trustState"]
        : "unknown",
    lastError:
      typeof record["lastError"] === "string" && record["lastError"].trim() !== ""
        ? record["lastError"].trim()
        : null,
  };
}

function resolveSelectedRemoteUserId(settings: AppSettings): string | null {
  const selectedAccountId = normalizeOptionalText(settings.us1Slot?.selectedAccountId);
  const remoteUserIdFromAccountId =
    selectedAccountId !== null ? extractUs1RemoteIdentityIdFromAccountId(selectedAccountId) : null;

  return remoteUserIdFromAccountId ?? getUs1SelectedIdentityId(settings.us1Slot);
}

function buildRemoteUserFromRemoteAccount(
  account: Account | null | undefined
): RemoteUserIdentity | null {
  const remoteState = account?.remoteEmail;
  const remoteUserId = normalizeOptionalText(remoteState?.remoteUserId);
  const email = normalizeEmail(account?.email ?? remoteUserId ?? "");
  if (remoteState === undefined || remoteUserId === null || email === "") {
    return null;
  }

  return {
    remoteUserId,
    email,
    ...(typeof account?.nickname === "string" ? { nickname: account.nickname } : {}),
    ...(typeof account?.avatar === "string" ? { avatar: account.avatar } : {}),
    ...(typeof account?.avatarPath === "string" ? { avatarPath: account.avatarPath } : {}),
    handshakeState: remoteState.handshakeState,
    profileRevision: remoteState.profileRevision,
    linkedMailAccountId: remoteState.linkedLocalMailAccountId,
    linkedAccountId: remoteState.linkedLocalMailAccountId,
    ...(remoteState.inviteMessageId !== undefined
      ? { inviteMessageId: remoteState.inviteMessageId ?? null }
      : {}),
    ...(remoteState.acceptMessageId !== undefined
      ? { acceptMessageId: remoteState.acceptMessageId ?? null }
      : {}),
    ...(remoteState.threadMessageId !== undefined
      ? { threadMessageId: remoteState.threadMessageId ?? null }
      : {}),
    ...(remoteState.lastTransportMessageId !== undefined
      ? { lastTransportMessageId: remoteState.lastTransportMessageId ?? null }
      : {}),
    ...(remoteState.lastSyncAt !== undefined ? { lastSyncAt: remoteState.lastSyncAt } : {}),
    ...(remoteState.lastError !== undefined ? { lastError: remoteState.lastError ?? null } : {}),
    ...(remoteState.sessionAlias !== undefined
      ? { sessionAlias: remoteState.sessionAlias ?? null }
      : {}),
  };
}

function getUs1CommunicationSystem(settings: AppSettings): "mail" | "relay-e2ee" {
  return settings.us1Slot?.communicationSystem === "relay-e2ee" ? "relay-e2ee" : "mail";
}

function resolveUs1LocalUserId(
  settings: AppSettings,
  binding?: ResolvedBinding | null
): string | null {
  const bindingEmail = normalizeOptionalText(binding?.account.email);
  if (bindingEmail !== null) {
    return normalizeEmail(bindingEmail);
  }

  const firstEnabledAccount = (settings.integrations?.mailTransport?.accounts ?? []).find(
    (account) => account.enabled !== false && normalizeOptionalText(account.email) !== null
  );
  return firstEnabledAccount ? normalizeEmail(firstEnabledAccount.email) : null;
}

function buildImplicitUs1ClientRequestId(params: {
  attachments: Array<{ mimeType: string | null; name: string | null; path: string }>;
  localSessionId: string | null;
  remoteUserId: string;
  roomCommand: Us1SendMessageParams["roomCommand"];
  roomEvent: Us1SendMessageParams["roomEvent"];
  text: string;
}): string {
  return `us1-implicit:${hashString(
    JSON.stringify({
      attachments: params.attachments,
      localSessionId: params.localSessionId,
      remoteUserId: params.remoteUserId,
      roomCommand: params.roomCommand ?? null,
      roomEvent: params.roomEvent ?? null,
      text: params.text,
    })
  )}`;
}

function resolveOwnedOutboundSession(params: {
  now: number;
  remoteUserId: string;
  requestedSessionId: string | null;
  sidecar: MailSidecarStoreManager;
  threadSeed: string | null;
}): {
  ignoredRequestedSessionId: boolean;
  isNewSession: boolean;
  latestMapping: ReturnType<MailSidecarStoreManager["getLatestSessionMapping"]>;
  localSessionId: string;
} {
  const ownedRequestedSession =
    params.requestedSessionId !== null
      ? params.sidecar.getSessionMapping(params.remoteUserId, params.requestedSessionId)
      : null;
  const latestMapping =
    params.requestedSessionId === null
      ? params.sidecar.getLatestSessionMapping(params.remoteUserId)
      : ownedRequestedSession;

  return {
    ignoredRequestedSessionId: params.requestedSessionId !== null && ownedRequestedSession === null,
    isNewSession: latestMapping === null,
    latestMapping,
    localSessionId:
      latestMapping?.localSessionId ??
      buildSessionId(
        params.remoteUserId,
        latestMapping?.threadMessageId ?? params.threadSeed,
        params.now
      ),
  };
}

function getRelayReceiveBaseUrl(settings: AppSettings): string | null {
  return normalizeOptionalText(settings.integrations?.us1Relay?.baseUrl);
}

function getRelaySendBaseUrl(settings: AppSettings, remoteUser: RemoteUserIdentity): string | null {
  return (
    normalizeOptionalText(remoteUser.relayCapability?.endpoint) ?? getRelayReceiveBaseUrl(settings)
  );
}

function getRelayPinnedServerFingerprint(settings: AppSettings): string | null {
  return normalizeRelayServerFingerprint(settings.integrations?.us1Relay?.trustedServerFingerprint);
}

function getRelayClientRequestOptions(settings: AppSettings): Us1RelayRequestOptions {
  return {
    pinnedServerFingerprint: getRelayPinnedServerFingerprint(settings),
  };
}

function hasRelayCapability(remoteUser: RemoteUserIdentity | null | undefined): boolean {
  return (
    remoteUser?.relayCapability?.supported === true &&
    normalizeOptionalText(remoteUser.relayCapability.encryptionPublicKey) !== null &&
    normalizeOptionalText(remoteUser.relayCapability.encryptionKeyFingerprint) !== null &&
    normalizeOptionalText(remoteUser.relayCapability.signingPublicKey) !== null &&
    normalizeOptionalText(remoteUser.relayCapability.signingKeyFingerprint) !== null
  );
}

function toRelayParsedAttachments(
  attachments: Us1RelayAttachmentPayload[]
): MailTransportParsedAttachment[] {
  return attachments.map((attachment) => ({
    filename: normalizeOptionalText(attachment.name),
    contentType: normalizeOptionalText(attachment.mimeType ?? null),
    contentDisposition: "attachment",
    checksum: null,
    size:
      typeof attachment.size === "number" && Number.isFinite(attachment.size)
        ? Math.max(0, Math.trunc(attachment.size))
        : Buffer.from(attachment.contentBase64 ?? "", "base64").byteLength,
    contentId: null,
    inline: false,
    content: Buffer.from(attachment.contentBase64 ?? "", "base64"),
  }));
}

function isChunkedRelayAttachment(attachment: Us1RelayAttachmentPayload): boolean {
  return (
    attachment.transferMode === "chunked" &&
    normalizeOptionalText(attachment.chunkTransfer?.attachmentId ?? null) !== null &&
    typeof attachment.chunkTransfer?.chunkCount === "number" &&
    Number.isFinite(attachment.chunkTransfer.chunkCount) &&
    attachment.chunkTransfer.chunkCount >= 1
  );
}

function buildLocalMessageId(prefix: string, token: string, now: number): string {
  const normalizedToken = token
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return `${prefix}:${normalizedToken !== "" ? normalizedToken : "us1"}:${now}`;
}

function buildSyntheticTransportMessageId(localMessageId: string): string {
  return `synthetic:${localMessageId}`;
}

function buildSessionId(remoteUserId: string, threadSeed: string | null, now: number): string {
  const seed = normalizeOptionalText(threadSeed) ?? `${remoteUserId}:${now}`;
  return `us1-${hashString(`${remoteUserId}:${seed}:${now}`).slice(0, 16)}`;
}

function normalizeSessionMode(value: unknown): Us1SessionMode | null {
  return value === "new" || value === "reply" ? value : null;
}

function normalizeSessionOpenHint(value: unknown): Us1SessionOpenHint | null {
  return value === "auto_if_idle" || value === "list_only" ? value : null;
}

function normalizeRoomEventType(value: unknown): Us1RoomEventType | null {
  return value === "invite" ||
    value === "accept" ||
    value === "reject" ||
    value === "reset" ||
    value === "start"
    ? value
    : null;
}

function normalizeRoomInviteStarter(value: unknown): Us1RoomInviteStarter | null {
  return value === "user" || value === "opponent" ? value : null;
}

function buildDerivedRoomPayload(
  source: Record<string, unknown>
): Record<string, unknown> | undefined {
  const payload = Object.entries(source).reduce<Record<string, unknown>>((acc, [key, value]) => {
    if (
      key === "commandName" ||
      key === "actionId" ||
      key === "roomCommand" ||
      key === "roomId" ||
      key === "featureId" ||
      key === "rawArgs"
    ) {
      return acc;
    }
    acc[key] = value;
    return acc;
  }, {});
  return Object.keys(payload).length > 0 ? payload : undefined;
}

function buildRoomCommandIdentityIndex(candidate: unknown): Map<string, RoomCommandIdentity> {
  const index = new Map<string, RoomCommandIdentity>();
  if (candidate === null || candidate === undefined || typeof candidate !== "object") {
    return index;
  }

  const rooms = Array.isArray((candidate as { rooms?: unknown }).rooms)
    ? ((candidate as { rooms?: unknown[] }).rooms ?? [])
    : [];

  for (const room of rooms) {
    if (room === null || room === undefined || typeof room !== "object") {
      continue;
    }
    const roomRecord = room as Record<string, unknown>;
    const roomId = normalizeOptionalText(roomRecord["id"]);
    if (roomId === null) {
      continue;
    }

    const roomCommandSpecs = Array.isArray(roomRecord["commandSpecs"])
      ? (roomRecord["commandSpecs"] as unknown[])
      : [];
    for (const spec of roomCommandSpecs) {
      if (spec !== null && typeof spec === "object") {
        const commandName = normalizeOptionalText((spec as Record<string, unknown>)["name"]);
        if (commandName !== null) {
          index.set(commandName.toLowerCase(), {
            roomId,
            featureId: roomId,
          });
        }
      }
    }

    const features = Array.isArray(roomRecord["features"])
      ? (roomRecord["features"] as unknown[])
      : [];
    for (const feature of features) {
      if (feature === null || feature === undefined || typeof feature !== "object") {
        continue;
      }
      const featureRecord = feature as Record<string, unknown>;
      const featureId = normalizeOptionalText(featureRecord["id"]);
      if (featureId === null) {
        continue;
      }

      const commandSpecs = Array.isArray(featureRecord["commandSpecs"])
        ? (featureRecord["commandSpecs"] as unknown[])
        : [];
      for (const spec of commandSpecs) {
        if (spec !== null && typeof spec === "object") {
          const commandName = normalizeOptionalText((spec as Record<string, unknown>)["name"]);
          if (commandName !== null) {
            index.set(commandName.toLowerCase(), {
              roomId,
              featureId,
            });
          }
        }
      }
    }
  }

  return index;
}

async function buildWorkspaceRoomCommandIdentityIndex(): Promise<Map<string, RoomCommandIdentity>> {
  const index = new Map<string, RoomCommandIdentity>();
  let entries: Array<{ name: string; isDirectory: () => boolean }>;
  try {
    entries = await readdir(Paths.getRoomsWorkspaceDir(), { withFileTypes: true });
  } catch {
    return index;
  }

  const workspaceIdentityEntries = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(".") === false)
      .map(async (entry): Promise<Array<[string, RoomCommandIdentity]>> => {
        try {
          const manifestRaw = await readFile(
            join(Paths.getRoomsWorkspaceDir(), entry.name, "manifest.json"),
            "utf8"
          );
          return Array.from(
            buildRoomCommandIdentityIndex({
              rooms: [JSON.parse(manifestRaw) as unknown],
            }).entries()
          );
        } catch {
          // Room discovery is best-effort here; malformed workspace packages must not block mail sync.
          return [];
        }
      })
  );

  for (const roomEntries of workspaceIdentityEntries) {
    for (const [commandName, identity] of roomEntries) {
      index.set(commandName, identity);
    }
  }

  return index;
}

function parseHeaderValue(headerLines: string[], headerName: string): string | null {
  const normalizedHeaderName = headerName.toLowerCase();
  for (const line of headerLines) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    if (key !== normalizedHeaderName) {
      continue;
    }
    return normalizeOptionalText(line.slice(separatorIndex + 1));
  }
  return null;
}

function getAvatarExtension(
  filename: string | null,
  contentType: string | null,
  fallback = ".png"
): string {
  const fromFilename = filename !== null ? extname(filename).toLowerCase() : "";
  if (fromFilename !== "") {
    return fromFilename;
  }

  if (contentType === "image/jpeg") return ".jpg";
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/gif") return ".gif";
  if (contentType === "image/svg+xml") return ".svg";
  return fallback;
}

function getAvatarMimeType(filename: string | null, contentType: string | null): string {
  if (contentType !== null && contentType.trim() !== "") {
    return contentType;
  }

  const extension = getAvatarExtension(filename, null, ".png");
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".svg") return "image/svg+xml";
  return "image/png";
}

function buildImageDataUrl(contentType: string, content: Buffer): string {
  return `data:${contentType};base64,${content.toString("base64")}`;
}

function findHandshakeAvatarAttachment(
  attachments: MailTransportParsedAttachment[],
  avatarAttachmentName: string | null
): MailTransportParsedAttachment | null {
  if (avatarAttachmentName !== null) {
    const matched = attachments.find(
      (attachment) =>
        normalizeOptionalText(attachment.filename)?.toLowerCase() ===
        avatarAttachmentName.toLowerCase()
    );
    if (matched !== undefined) {
      return matched;
    }
  }

  return (
    attachments.find((attachment) => {
      const contentType = normalizeOptionalText(attachment.contentType);
      return contentType?.startsWith("image/") === true;
    }) ?? null
  );
}

function extractJsonBlock(text: string, startMarker: string, endMarker: string): string | null {
  const escapedStart = startMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = endMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escapedStart}\\s*([\\s\\S]+?)\\s*${escapedEnd}`));
  return match?.[1] ?? null;
}

function stripJsonBlock(text: string, startMarker: string, endMarker: string): string {
  const escapedStart = startMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = endMarker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return normalizeText(
    text.replace(new RegExp(`\\s*${escapedStart}[\\s\\S]+?${escapedEnd}\\s*`, "g"), "\n")
  );
}

function extractHandshakeEnvelope(text: string): HandshakeEnvelope | null {
  const payload = extractJsonBlock(text, HANDSHAKE_PAYLOAD_START, HANDSHAKE_PAYLOAD_END);
  if (payload === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as Partial<HandshakeEnvelope> | null;
    if (
      parsed?.protocol !== HANDSHAKE_PROTOCOL ||
      parsed.version !== HANDSHAKE_VERSION ||
      (parsed.messageType !== "invite" &&
        parsed.messageType !== "accept" &&
        parsed.messageType !== "reject" &&
        parsed.messageType !== "profile")
    ) {
      return null;
    }

    const profile = normalizeMessageProfile(parsed.profile);
    if (profile === null) {
      return null;
    }

    return {
      protocol: HANDSHAKE_PROTOCOL,
      version: HANDSHAKE_VERSION,
      messageType: parsed.messageType,
      inviteId: normalizeOptionalText(parsed.inviteId) ?? `invite_${Date.now()}`,
      sentAt:
        typeof parsed.sentAt === "number" && Number.isFinite(parsed.sentAt) && parsed.sentAt >= 0
          ? Math.trunc(parsed.sentAt)
          : Date.now(),
      profile,
    };
  } catch {
    return null;
  }
}

function normalizeMessageProfile(profile: unknown): MessageProfile | null {
  if (profile === null || profile === undefined || typeof profile !== "object") {
    return null;
  }

  const source = profile as Record<string, unknown>;
  const email = normalizeEmail(source["email"] ?? source["remoteUserId"]);
  if (email === "") {
    return null;
  }

  return {
    remoteUserId: normalizeEmail(source["remoteUserId"] ?? email),
    email,
    nickname: normalizeOptionalText(source["nickname"]) ?? email,
    avatar: normalizeOptionalText(source["avatar"]) ?? "",
    avatarAttachmentName: normalizeOptionalText(source["avatarAttachmentName"]),
    profileRevision:
      typeof source["profileRevision"] === "number" &&
      Number.isFinite(source["profileRevision"]) &&
      source["profileRevision"] >= 1
        ? Math.trunc(source["profileRevision"])
        : 1,
    relayCapability: normalizeRelayCapability(source["relayCapability"]),
  };
}

function normalizeConversationSession(
  session: unknown,
  fallbackLocalSessionId: string | null,
  fallbackSentAt: number
): ConversationSessionDescriptor | null {
  const legacySessionId = normalizeOptionalText(fallbackLocalSessionId);
  if (session === null || session === undefined) {
    if (legacySessionId === null) {
      return null;
    }
    return {
      id: legacySessionId,
      mode: "reply",
      title: null,
      createdAt: fallbackSentAt,
      openHint: "list_only",
    };
  }

  if (typeof session !== "object") {
    return legacySessionId === null
      ? null
      : {
          id: legacySessionId,
          mode: "reply",
          title: null,
          createdAt: fallbackSentAt,
          openHint: "list_only",
        };
  }

  const source = session as Record<string, unknown>;
  const id = normalizeOptionalText(source["id"]) ?? legacySessionId;
  if (id === null) {
    return null;
  }

  return {
    id,
    mode: normalizeSessionMode(source["mode"]) ?? "reply",
    title: normalizeOptionalText(source["title"]),
    createdAt:
      typeof source["createdAt"] === "number" &&
      Number.isFinite(source["createdAt"]) &&
      source["createdAt"] >= 0
        ? Math.trunc(source["createdAt"])
        : fallbackSentAt,
    openHint: normalizeSessionOpenHint(source["openHint"]) ?? "list_only",
  };
}

function normalizeConversationThread(thread: unknown): ConversationThreadDescriptor | null {
  if (thread === null || thread === undefined || typeof thread !== "object") {
    return null;
  }

  const source = thread as Record<string, unknown>;
  return {
    threadRootMessageId: normalizeOptionalText(source["threadRootMessageId"]),
    replyToMessageId: normalizeOptionalText(source["replyToMessageId"]),
  };
}

function normalizeConversationRoomEvent(roomEvent: unknown): ConversationRoomEvent | null {
  if (roomEvent === null || roomEvent === undefined || typeof roomEvent !== "object") {
    return null;
  }

  const source = roomEvent as Record<string, unknown>;
  const roomId = normalizeOptionalText(source["roomId"]);
  const featureId = normalizeOptionalText(source["featureId"]);
  const inviteId = normalizeOptionalText(source["inviteId"]);
  const matchId = normalizeOptionalText(source["matchId"]);
  const eventType = normalizeRoomEventType(source["eventType"]);
  if (roomId === null || featureId === null || inviteId === null || eventType === null) {
    return null;
  }

  const starter = normalizeRoomInviteStarter(source["starter"]);

  return {
    roomId,
    featureId,
    inviteId,
    ...(matchId !== null ? { matchId } : {}),
    eventType,
    ...(starter !== null ? { starter } : {}),
    note: normalizeOptionalText(source["note"]),
  };
}

function normalizeConversationRoomCommand(roomCommand: unknown): ConversationRoomCommand | null {
  if (roomCommand === null || roomCommand === undefined || typeof roomCommand !== "object") {
    return null;
  }

  const source = roomCommand as Record<string, unknown>;
  const actionPayload =
    source["payload"] !== null &&
    source["payload"] !== undefined &&
    typeof source["payload"] === "object" &&
    Array.isArray(source["payload"]) === false
      ? (source["payload"] as Record<string, unknown>)
      : source;
  const commandName =
    normalizeOptionalText(actionPayload["commandName"]) ??
    normalizeOptionalText(actionPayload["actionId"]) ??
    normalizeOptionalText(actionPayload["roomCommand"]) ??
    normalizeOptionalText(source["commandName"]);
  const roomId =
    normalizeOptionalText(actionPayload["roomId"]) ??
    normalizeOptionalText(source["roomId"]) ??
    null;
  const featureId =
    normalizeOptionalText(actionPayload["featureId"]) ??
    normalizeOptionalText(source["featureId"]) ??
    null;
  const action = source["action"] === "room.command" ? "room.command" : null;
  const roomPayload =
    source["roomPayload"] !== undefined
      ? source["roomPayload"]
      : actionPayload["roomPayload"] !== undefined
        ? actionPayload["roomPayload"]
        : buildDerivedRoomPayload(actionPayload);
  const matchId = normalizeOptionalText(source["matchId"] ?? actionPayload["matchId"]);
  const turnIndex =
    typeof (source["turnIndex"] ?? actionPayload["turnIndex"]) === "number" &&
    Number.isInteger(source["turnIndex"] ?? actionPayload["turnIndex"])
      ? ((source["turnIndex"] ?? actionPayload["turnIndex"]) as number)
      : null;
  const turnToken = normalizeOptionalText(source["turnToken"] ?? actionPayload["turnToken"]);
  const boardHashBeforeMove = normalizeOptionalText(
    source["boardHashBeforeMove"] ?? actionPayload["boardHashBeforeMove"]
  );
  const rawArgs =
    normalizeOptionalText(source["rawArgs"] ?? actionPayload["rawArgs"]) ??
    ((): string | null => {
      if (roomPayload === undefined) {
        return null;
      }
      try {
        return JSON.stringify(roomPayload);
      } catch {
        return null;
      }
    })();
  if (commandName === null) {
    return null;
  }

  return {
    roomId,
    featureId,
    commandName,
    ...(action !== null ? { action } : {}),
    ...(roomPayload !== undefined ? { roomPayload } : {}),
    ...(matchId !== null ? { matchId } : {}),
    ...(turnIndex !== null ? { turnIndex } : {}),
    ...(turnToken !== null ? { turnToken } : {}),
    ...(boardHashBeforeMove !== null ? { boardHashBeforeMove } : {}),
    ...(rawArgs !== null ? { rawArgs } : {}),
  };
}

function extractConversationRoomCommandFromText(text: string): ConversationRoomCommand | null {
  const commandText = stripJsonBlock(text, MESSAGE_PAYLOAD_START, MESSAGE_PAYLOAD_END);
  for (const match of parseInlineCommands(commandText)) {
    if (match.commandName.trim().toLowerCase() !== "slotbridge") {
      continue;
    }

    try {
      const parsed = JSON.parse(match.args) as unknown;
      const normalized = normalizeConversationRoomCommand(parsed);
      if (normalized?.action === "room.command") {
        return normalized;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function extractConversationEnvelope(text: string): ConversationEnvelope | null {
  const payload = extractJsonBlock(text, MESSAGE_PAYLOAD_START, MESSAGE_PAYLOAD_END);
  if (payload === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as Partial<ConversationEnvelope> | null;
    if (
      parsed?.protocol !== MESSAGE_PROTOCOL ||
      parsed.version !== MESSAGE_VERSION ||
      parsed.messageType !== MESSAGE_TYPE_CONVERSATION
    ) {
      return null;
    }

    const profile = normalizeMessageProfile(parsed.profile);
    if (profile === null) {
      return null;
    }

    return {
      protocol: MESSAGE_PROTOCOL,
      version: MESSAGE_VERSION,
      messageType: MESSAGE_TYPE_CONVERSATION,
      sentAt:
        typeof parsed.sentAt === "number" && Number.isFinite(parsed.sentAt) && parsed.sentAt >= 0
          ? Math.trunc(parsed.sentAt)
          : Date.now(),
      localSessionId: normalizeOptionalText(parsed.localSessionId),
      session: normalizeConversationSession(
        (parsed as Record<string, unknown>)["session"],
        normalizeOptionalText(parsed.localSessionId),
        typeof parsed.sentAt === "number" && Number.isFinite(parsed.sentAt) && parsed.sentAt >= 0
          ? Math.trunc(parsed.sentAt)
          : Date.now()
      ),
      thread: normalizeConversationThread((parsed as Record<string, unknown>)["thread"]),
      profile,
      roomEvent: normalizeConversationRoomEvent((parsed as Record<string, unknown>)["roomEvent"]),
      roomCommand: normalizeConversationRoomCommand(
        (parsed as Record<string, unknown>)["roomCommand"]
      ),
    };
  } catch {
    return null;
  }
}

function buildConversationPayload(text: string, envelope: ConversationEnvelope): string {
  const messageText = normalizeText(text);
  return [
    messageText !== "" ? messageText : OUTBOUND_ATTACHMENT_ONLY_TEXT,
    "",
    MESSAGE_PAYLOAD_START,
    JSON.stringify(envelope, null, 2),
    MESSAGE_PAYLOAD_END,
    "",
  ].join("\n");
}

function buildConversationSubject(text: string, attachmentCount: number): string {
  const preview = normalizeText(text).replace(/\n+/g, " ").slice(0, 72);
  if (preview !== "") {
    return `${SUBJECT_PREFIX}: ${preview}`;
  }
  if (attachmentCount > 0) {
    return `${SUBJECT_PREFIX}: ${attachmentCount} attachment`;
  }
  return SUBJECT_PREFIX;
}

function buildConversationAuthor(
  remoteUser: Pick<RemoteUserIdentity, "nickname" | "email">
): string {
  return normalizeOptionalText(remoteUser.nickname) ?? remoteUser.email;
}

function buildArchiveMessageId(conversationId: string, domId: string): string {
  return hashString(`${conversationId}-${domId}`);
}

function toDisplayText(rawText: string, attachmentCount: number, fallback: string): string {
  const stripped = stripJsonBlock(rawText, MESSAGE_PAYLOAD_START, MESSAGE_PAYLOAD_END);
  if (stripped !== "") {
    return stripped;
  }
  return attachmentCount > 0 ? fallback : "";
}

function sortRemoteUsers(remoteUsers: RemoteUserIdentity[]): RemoteUserIdentity[] {
  const rank: Record<RemoteUserIdentity["handshakeState"], number> = {
    active: 0,
    handshake_pending: 1,
    invite_sent: 2,
    rejected: 3,
    error: 4,
  };

  return [...remoteUsers].sort((left, right) => {
    const stateDelta = rank[left.handshakeState] - rank[right.handshakeState];
    if (stateDelta !== 0) {
      return stateDelta;
    }
    return `${left.nickname ?? left.email}`.localeCompare(`${right.nickname ?? right.email}`, "tr");
  });
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : String(error);
}

async function loadPersistedSettings(): Promise<AppSettings | null> {
  const settingsModule = await import("./settings-manager.ts");
  return await settingsModule.loadSettings();
}

async function persistSettingsToDisk(settings: AppSettings): Promise<boolean> {
  const settingsModule = await import("./settings-manager.ts");
  return await settingsModule.saveSettings(settings);
}

export class Us1ConversationService {
  private transport: MailTransportFacade;
  private now: () => number;
  private settingsStore: ConversationSettingsStore;
  private archiveFactory: ArchiveManagerFactory;
  private roomInviteInbox = new Map<string, Us1RoomEventRecord>();
  private pendingRoomCommands = new Map<string, Us1RoomCommandRecord>();
  private roomCommandIdentityIndex: Map<string, RoomCommandIdentity> | null = null;
  private outboundSendCache = new Map<string, OutboundSendCacheEntry>();

  constructor(
    options: {
      transport?: MailTransportFacade;
      now?: () => number;
      settingsStore?: Partial<ConversationSettingsStore>;
      archiveFactory?: ArchiveManagerFactory;
    } = {}
  ) {
    this.transport = options.transport ?? new MailTransportService();
    this.now = options.now ?? ((): number => Date.now());
    this.settingsStore = {
      loadSettings: options.settingsStore?.loadSettings ?? loadPersistedSettings,
      saveSettings: options.settingsStore?.saveSettings ?? persistSettingsToDisk,
    };
    this.archiveFactory =
      options.archiveFactory ??
      (async (accountId: string): Promise<ArchiveManagerLike> => {
        const { SQLiteArchiveManager: sqliteArchiveManagerCtor } =
          await import("./database/sqlite-archive.ts");
        return new sqliteArchiveManagerCtor(accountId);
      });
  }

  private pruneOutboundSendCache(now = this.now()): void {
    const ttlMs = 5 * 60_000;
    for (const [key, entry] of this.outboundSendCache.entries()) {
      if (now - entry.createdAt > ttlMs) {
        this.outboundSendCache.delete(key);
      }
    }
  }

  private buildOutboundSendCacheKey(remoteUserId: string, clientRequestId: string): string {
    return `${remoteUserId}|${clientRequestId}`;
  }

  private findBindingByRemoteUserId(
    bindings: ResolvedBinding[],
    remoteUserId: string | null
  ): ResolvedBinding | null {
    if (remoteUserId === null) {
      return null;
    }

    return (
      bindings.find(
        (binding) =>
          normalizeEmail(binding.remoteUser.remoteUserId) === normalizeEmail(remoteUserId)
      ) ?? null
    );
  }

  private resolveSendBinding(
    settings: AppSettings,
    communicationSystem: "mail" | "relay-e2ee",
    requestedRemoteUserId: string | null,
    requireConnected: boolean
  ): ResolvedBinding | null {
    if (requestedRemoteUserId !== null) {
      const availableBindings =
        communicationSystem === "relay-e2ee"
          ? this.resolveRelaySyncBindings(settings, requireConnected)
          : this.resolveSyncBindings(settings, requireConnected);
      return this.findBindingByRemoteUserId(availableBindings, requestedRemoteUserId);
    }

    return communicationSystem === "relay-e2ee"
      ? this.resolveActiveRelayBinding(settings, requireConnected)
      : this.resolveActiveBinding(settings, requireConnected);
  }

  async sendMessage(params: Us1SendMessageParams): Promise<Us1SendMessageResult> {
    const settings = await this.loadNormalizedSettings();
    const communicationSystem = getUs1CommunicationSystem(settings);
    const requestedRemoteUserId = normalizeOptionalText(params.remoteUserId);
    const binding = this.resolveSendBinding(
      settings,
      communicationSystem,
      requestedRemoteUserId,
      true
    );
    if (binding === null) {
      const error =
        requestedRemoteUserId !== null
          ? `Requested US1 remote user ${normalizeEmail(requestedRemoteUserId)} is unavailable.`
          : "Active US1 binding is not available.";
      await logger.logInternal(
        LogCategory.COMMAND,
        LogLevel.WARNING,
        requestedRemoteUserId !== null
          ? "US1 send rejected because the requested remote user is outside the active owner scope."
          : "US1 send rejected because the active binding is unavailable.",
        {
          eventCode: "auth.owner_scope_violation",
          provider: "us1",
          slotId: "us1",
          userId: resolveUs1LocalUserId(settings),
          remoteUserId:
            requestedRemoteUserId !== null ? normalizeEmail(requestedRemoteUserId) : null,
          connectionState: settings.us1Slot?.connectionState ?? null,
          operationName: "us1.sendMessage",
        }
      );
      return { success: false, error };
    }
    const implicitClientRequestId = buildImplicitUs1ClientRequestId({
      attachments: (params.attachments ?? [])
        .map((attachment) => ({
          mimeType: normalizeOptionalText(attachment.mimeType),
          name: normalizeOptionalText(attachment.name),
          path: normalizeOptionalText(attachment.path),
        }))
        .filter(
          (
            attachment
          ): attachment is {
            mimeType: string | null;
            name: string | null;
            path: string;
          } => attachment.path !== null
        ),
      localSessionId: normalizeOptionalText(params.localSessionId),
      remoteUserId: binding.remoteUser.remoteUserId,
      roomCommand: params.roomCommand ?? null,
      roomEvent: params.roomEvent ?? null,
      text: normalizeText(params.text ?? ""),
    });
    const clientRequestId =
      normalizeOptionalText(params.clientRequestId) ?? implicitClientRequestId;
    const brokerMessageId =
      normalizeOptionalText(params.brokerMessageId) ??
      `us1-broker:${hashString(`${binding.remoteUser.remoteUserId}|${clientRequestId}`)}`;
    const normalizedParams: Us1SendMessageParams = {
      ...params,
      clientRequestId,
      brokerMessageId,
    };

    const executeSend = async (): Promise<Us1SendMessageResult> => {
      if (communicationSystem === "relay-e2ee") {
        const relayResult = await this.sendRelayMessage(settings, binding, normalizedParams);
        return relayResult.success === true
          ? {
              ...relayResult,
              brokerMessageId,
            }
          : relayResult;
      }

      const { remoteUser, account } = binding;
      const sidecar = new MailSidecarStoreManager(account.id);
      const text = normalizeText(normalizedParams.text ?? "");
      const attachments = (normalizedParams.attachments ?? []).filter(
        (attachment) => normalizeOptionalText(attachment.path) !== null
      );

      if (text === "" && attachments.length === 0) {
        return { success: false, error: "US1 message content is empty." };
      }

      const requestedSessionId = normalizeOptionalText(normalizedParams.localSessionId);
      const outboundSession = resolveOwnedOutboundSession({
        now: this.now(),
        remoteUserId: remoteUser.remoteUserId,
        requestedSessionId,
        sidecar,
        threadSeed: null,
      });
      const { isNewSession, latestMapping, localSessionId } = outboundSession;
      if (outboundSession.ignoredRequestedSessionId) {
        await logger.logInternal(
          LogCategory.COMMAND,
          LogLevel.WARNING,
          "US1 send ignored an unowned client session identifier.",
          {
            eventCode: "auth.owner_scope_violation",
            provider: "us1",
            slotId: "us1",
            userId: resolveUs1LocalUserId(settings, binding),
            remoteUserId: remoteUser.remoteUserId,
            requestedLocalSessionId: requestedSessionId,
            resolvedLocalSessionId: localSessionId,
            clientRequestId,
            brokerMessageId,
            operationName: "us1.sendMessage",
          }
        );
      }
      const sessionTitle = null;
      const sessionMode: Us1SessionMode = isNewSession ? "new" : "reply";
      const sessionOpenHint: Us1SessionOpenHint = isNewSession ? "auto_if_idle" : "list_only";
      const localProfile = this.buildLocalProfile(settings, account);
      const localMessageId = buildLocalMessageId("us1-out", remoteUser.remoteUserId, this.now());
      const latestThreadMessageId =
        latestMapping?.threadMessageId ?? normalizeOptionalText(remoteUser.threadMessageId);
      const latestLastMessageId =
        latestMapping?.lastMessageId ?? normalizeOptionalText(remoteUser.lastTransportMessageId);
      const threadMessageId = isNewSession === true ? null : latestThreadMessageId;
      const inReplyTo = isNewSession === true ? null : latestLastMessageId;

      try {
        const transportResult = await this.transport.sendMail(account, {
          localMessageId,
          remoteUserId: remoteUser.remoteUserId,
          localSessionId,
          threadMessageId,
          to: remoteUser.email,
          subject: buildConversationSubject(text, attachments.length),
          text: buildConversationPayload(text, {
            protocol: MESSAGE_PROTOCOL,
            version: MESSAGE_VERSION,
            messageType: MESSAGE_TYPE_CONVERSATION,
            sentAt: this.now(),
            localSessionId,
            session: {
              id: localSessionId,
              mode: sessionMode,
              title: sessionTitle,
              createdAt: this.now(),
              openHint: sessionOpenHint,
            },
            thread: {
              threadRootMessageId: threadMessageId,
              replyToMessageId: inReplyTo,
            },
            profile: localProfile,
            ...(normalizedParams.roomEvent !== undefined && normalizedParams.roomEvent !== null
              ? { roomEvent: normalizedParams.roomEvent }
              : {}),
            ...(normalizedParams.roomCommand !== undefined && normalizedParams.roomCommand !== null
              ? { roomCommand: normalizedParams.roomCommand }
              : {}),
          }),
          inReplyTo,
          ...(threadMessageId !== null || inReplyTo !== null
            ? {
                references: [threadMessageId, inReplyTo].filter(
                  (value): value is string => normalizeOptionalText(value) !== null
                ),
              }
            : {}),
          headers: {
            "X-Hayalet-Ev-Protocol": MESSAGE_PROTOCOL,
            "X-Hayalet-Ev-Message-Type": MESSAGE_TYPE_CONVERSATION,
            "X-Hayalet-Ev-Remote-User-Id": remoteUser.remoteUserId,
            "X-Hayalet-Ev-Session-Id": localSessionId,
            "X-Hayalet-Ev-Session-Mode": sessionMode,
            "X-Hayalet-Ev-Local-Session-Id": localSessionId,
            "X-Hayalet-Ev-Profile-Revision": String(localProfile.profileRevision),
            "X-Hayalet-Ev-Client-Request-Id": clientRequestId,
            "X-Hayalet-Ev-Broker-Message-Id": brokerMessageId,
          },
          attachments: attachments.map((attachment) => ({
            path: attachment.path,
            filename: normalizeOptionalText(attachment.name) ?? basename(attachment.path),
            ...(normalizeOptionalText(attachment.mimeType) !== null
              ? { contentType: attachment.mimeType }
              : {}),
          })),
        });

        const archiveContext = await this.prepareArchiveContext(
          remoteUser,
          localSessionId,
          isNewSession ? null : undefined
        );
        const projectedMessage = await this.appendArchiveMessage(archiveContext, {
          role: "user",
          author: buildConversationAuthor(localProfile),
          text: text !== "" ? text : OUTBOUND_ATTACHMENT_ONLY_TEXT,
          brokerMessageId,
          clientRequestId,
          domId: localMessageId,
        });
        const attachmentRefs = await this.saveOutboundAttachments(
          archiveContext.manager,
          projectedMessage.conversationId,
          projectedMessage.messageId,
          attachments
        );

        sidecar.upsertSessionMapping({
          remoteUserId: remoteUser.remoteUserId,
          localSessionId,
          threadMessageId:
            transportResult.threadMessageId ??
            threadMessageId ??
            transportResult.transportMessageId,
          lastMessageId: transportResult.transportMessageId,
        });
        sidecar.upsertMessageMeta({
          transportMessageId: transportResult.transportMessageId,
          localMessageId,
          deliveryState: transportResult.deliveryState,
          headersHash: transportResult.headersHash,
          metadata: {
            direction: "outbound",
            remoteUserId: remoteUser.remoteUserId,
            localSessionId,
            conversationId: projectedMessage.conversationId,
            webUrl: archiveContext.webUrl,
            archiveMessageId: projectedMessage.messageId,
            clientRequestId,
            brokerMessageId,
            attachments: attachmentRefs,
          },
        });

        this.patchRemoteUserTransportState(settings, remoteUser.remoteUserId, {
          threadMessageId:
            transportResult.threadMessageId ??
            threadMessageId ??
            transportResult.transportMessageId,
          lastTransportMessageId: transportResult.transportMessageId,
          lastSyncAt: this.now(),
          lastError: null,
        });
        await this.persistSettings(settings);

        if (
          normalizedParams.roomEvent?.eventType === "accept" ||
          normalizedParams.roomEvent?.eventType === "reject" ||
          normalizedParams.roomEvent?.eventType === "reset"
        ) {
          this.roomInviteInbox.delete(
            this.buildRoomInviteInboxKey(
              remoteUser.remoteUserId,
              normalizedParams.roomEvent.inviteId
            )
          );
        }

        return {
          success: true,
          brokerMessageId,
          remoteUserId: remoteUser.remoteUserId,
          localSessionId,
          conversationId: projectedMessage.conversationId,
          transportMessageId: transportResult.transportMessageId,
          archiveMessageId: projectedMessage.messageId,
          deliveryState: transportResult.deliveryState,
          attachmentCount: attachmentRefs.length,
        };
      } catch (error) {
        this.patchRemoteUserTransportState(settings, remoteUser.remoteUserId, {
          lastSyncAt: this.now(),
          lastError: getErrorMessage(error),
        });
        await this.persistSettings(settings);
        return { success: false, error: getErrorMessage(error) };
      }
    };

    this.pruneOutboundSendCache();
    const cacheKey = this.buildOutboundSendCacheKey(
      binding.remoteUser.remoteUserId,
      clientRequestId
    );
    const cached = this.outboundSendCache.get(cacheKey);
    if (cached?.result !== undefined) {
      return cached.result;
    }
    if (cached !== undefined) {
      return await cached.promise;
    }

    const entry: OutboundSendCacheEntry = {
      createdAt: this.now(),
      promise: Promise.resolve({ success: false, error: "Uninitialized US1 send cache entry." }),
    };
    entry.promise = executeSend()
      .then((result) => {
        entry.result = result;
        return result;
      })
      .catch((error) => {
        this.outboundSendCache.delete(cacheKey);
        throw error;
      });
    this.outboundSendCache.set(cacheKey, entry);
    return await entry.promise;
  }

  async syncMessages(params: Us1SyncMessagesParams = {}): Promise<Us1SyncMessagesResult> {
    const settings = await this.loadNormalizedSettings();
    const consumeRoomCommands = params.consumeRoomCommands === true;
    const communicationSystem = getUs1CommunicationSystem(settings);
    const activeBinding =
      communicationSystem === "relay-e2ee"
        ? this.resolveActiveRelayBinding(settings, true)
        : this.resolveActiveBinding(settings, true);
    const syncBindings =
      communicationSystem === "relay-e2ee"
        ? this.resolveRelaySyncBindings(settings, true)
        : this.resolveSyncBindings(settings, true);
    if (syncBindings.length === 0) {
      return {
        success: true,
        ...(activeBinding !== null ? { remoteUserId: activeBinding.remoteUser.remoteUserId } : {}),
        localSessionId: null,
        conversationId: null,
        fetchedCount: 0,
        processedCount: 0,
        duplicateCount: 0,
        projectedCount: 0,
        skippedCount: 0,
        unresolvedSessionCount: 0,
        roomPackages: [],
        roomEvents: [],
        roomCommands: consumeRoomCommands ? [] : this.listPendingRoomCommands(null),
        roomInviteInbox: this.listRoomInviteInbox(),
      };
    }

    if (communicationSystem === "relay-e2ee") {
      return await this.syncRelayMessages(settings, activeBinding, syncBindings, params);
    }

    try {
      let fetchedCount = 0;
      let processedCount = 0;
      let duplicateCount = 0;
      let projectedCount = 0;
      let skippedCount = 0;
      let unresolvedSessionCount = 0;
      let activeConversationId: string | null = null;
      let activeLocalSessionId: string | null = normalizeOptionalText(params.localSessionId);
      const roomPackages: Us1RoomPackageCandidate[] = [];
      const sessionEventsById = new Map<string, Us1SessionEvent>();
      const roomEvents: Us1RoomEventRecord[] = [];
      const activeRemoteUserId = activeBinding?.remoteUser.remoteUserId ?? "";
      const syncedAccountIds = new Set<string>();

      // NOTE: Inbox sync intentionally runs account-by-account to keep sidecar writes ordered.
      /* eslint-disable no-await-in-loop */
      for (const binding of syncBindings) {
        const { account } = binding;
        if (syncedAccountIds.has(account.id)) {
          continue;
        }
        syncedAccountIds.add(account.id);
        const sidecar = new MailSidecarStoreManager(account.id);
        const fetchResult = await this.transport.fetchInbox(account, {
          limit:
            typeof params.limit === "number" && params.limit > 0 ? Math.trunc(params.limit) : 20,
          includeAttachmentContent: true,
        });
        fetchedCount += fetchResult.fetchedCount;
        processedCount += fetchResult.processedCount;
        duplicateCount += fetchResult.duplicateCount;

        this.applyFetchedHandshakeMessages(settings, account, fetchResult);

        for (const message of fetchResult.messages) {
          if (message.duplicate === true) {
            continue;
          }

          const protocolHeader = parseHeaderValue(
            message.parsed.headerLines,
            "X-Hayalet-Ev-Protocol"
          );
          if (protocolHeader === HANDSHAKE_PROTOCOL) {
            continue;
          }

          const messageEnvelope = extractConversationEnvelope(message.parsed.text);
          const remoteUserId = this.resolveRemoteUserId(
            messageEnvelope,
            message,
            activeRemoteUserId
          );
          const existingRemoteUser = this.findRemoteUser(settings, remoteUserId);
          if (remoteUserId === "" || existingRemoteUser?.handshakeState !== "active") {
            skippedCount += 1;
            continue;
          }

          const nextRemoteUser = this.upsertRemoteUser(settings, {
            remoteUserId,
            email: remoteUserId,
            nickname:
              messageEnvelope?.profile.nickname ?? existingRemoteUser.nickname ?? remoteUserId,
            avatar: messageEnvelope?.profile.avatar ?? existingRemoteUser.avatar ?? "",
            avatarPath: existingRemoteUser.avatarPath ?? "",
            handshakeState: "active",
            profileRevision:
              messageEnvelope?.profile.profileRevision ?? existingRemoteUser.profileRevision,
            linkedMailAccountId: existingRemoteUser.linkedMailAccountId,
            inviteMessageId: existingRemoteUser.inviteMessageId ?? null,
            acceptMessageId: existingRemoteUser.acceptMessageId ?? null,
            threadMessageId:
              normalizeOptionalText(message.threadMessageId) ??
              existingRemoteUser.threadMessageId ??
              normalizeOptionalText(message.transportMessageId),
            lastTransportMessageId:
              normalizeOptionalText(message.transportMessageId) ??
              existingRemoteUser.lastTransportMessageId ??
              null,
            lastSyncAt: this.now(),
            lastError: null,
          });

          const sessionDescriptor = messageEnvelope?.session ?? null;
          const sessionTitle = normalizeOptionalText(sessionDescriptor?.title);
          const sessionIdFromEnvelope = normalizeOptionalText(sessionDescriptor?.id);
          const explicitSessionId =
            sessionIdFromEnvelope ?? normalizeOptionalText(messageEnvelope?.localSessionId);
          let localSessionId =
            sessionIdFromEnvelope ??
            normalizeOptionalText(message.localSessionId) ??
            normalizeOptionalText(messageEnvelope?.localSessionId) ??
            sidecar.getLatestSessionMapping(remoteUserId)?.localSessionId ??
            null;
          const existingSessionMapping =
            localSessionId !== null
              ? sidecar.getSessionMapping(remoteUserId, localSessionId)
              : null;
          if (localSessionId === null) {
            localSessionId = buildSessionId(
              remoteUserId,
              normalizeOptionalText(message.threadMessageId) ??
                normalizeOptionalText(message.transportMessageId),
              this.now()
            );
            unresolvedSessionCount += 1;
          }

          const isNewSession = existingSessionMapping === null;
          const archiveTitle = isNewSession === true ? null : undefined;

          const archiveContext = await this.prepareArchiveContext(
            nextRemoteUser,
            localSessionId,
            archiveTitle
          );
          const transportMessageId =
            normalizeOptionalText(message.transportMessageId) ??
            buildSyntheticTransportMessageId(message.localMessageId);
          const displayText = toDisplayText(
            message.parsed.text,
            message.parsed.attachments.length,
            INBOUND_ATTACHMENT_ONLY_TEXT
          );
          const projectedMessage = await this.appendArchiveMessage(archiveContext, {
            role: "assistant",
            author: buildConversationAuthor(nextRemoteUser),
            text: displayText,
            domId: transportMessageId,
          });
          const inboundAttachments = await this.saveInboundAttachments(
            archiveContext.manager,
            projectedMessage.conversationId,
            projectedMessage.messageId,
            nextRemoteUser.remoteUserId,
            localSessionId,
            message.parsed.attachments
          );

          sidecar.upsertSessionMapping({
            remoteUserId,
            localSessionId,
            threadMessageId:
              normalizeOptionalText(message.threadMessageId) ??
              nextRemoteUser.threadMessageId ??
              transportMessageId,
            lastMessageId: transportMessageId,
          });
          sidecar.upsertMessageMeta({
            transportMessageId,
            localMessageId: message.localMessageId,
            deliveryState: message.deliveryState,
            headersHash: message.headersHash,
            metadata: {
              direction: "inbound",
              remoteUserId,
              localSessionId,
              conversationId: projectedMessage.conversationId,
              webUrl: archiveContext.webUrl,
              archiveMessageId: projectedMessage.messageId,
              attachments: inboundAttachments.attachmentRefs,
              missingAttachmentCount: inboundAttachments.missingAttachmentCount,
            },
          });

          projectedCount += 1;
          const sessionEvent = sessionEventsById.get(localSessionId);
          const createdAt = sessionDescriptor?.createdAt ?? messageEnvelope?.sentAt;
          sessionEventsById.set(localSessionId, {
            remoteUserId,
            localSessionId,
            conversationId: projectedMessage.conversationId,
            sessionTitle,
            mode: sessionDescriptor?.mode ?? (isNewSession ? "new" : "reply"),
            openHint: sessionDescriptor?.openHint ?? (isNewSession ? "auto_if_idle" : "list_only"),
            sentAt: messageEnvelope?.sentAt ?? message.parsed.receivedAt,
            isNewSession:
              sessionEvent?.isNewSession === true ||
              (isNewSession === true && explicitSessionId !== null),
            ...(createdAt !== undefined ? { createdAt } : {}),
          });

          const roomEvent = this.buildRoomEventRecord(
            messageEnvelope?.roomEvent ?? null,
            nextRemoteUser,
            localSessionId,
            projectedMessage.conversationId,
            transportMessageId,
            messageEnvelope?.sentAt ?? message.parsed.receivedAt
          );
          if (roomEvent !== null) {
            roomEvents.push(roomEvent);
            this.applyRoomInviteEvent(roomEvent);
          }

          const roomCommand = await this.buildRoomCommandRecord(
            messageEnvelope?.roomCommand ??
              extractConversationRoomCommandFromText(message.parsed.text),
            nextRemoteUser,
            localSessionId,
            projectedMessage.conversationId,
            transportMessageId,
            messageEnvelope?.sentAt ?? message.parsed.receivedAt
          );
          if (roomCommand !== null) {
            this.queuePendingRoomCommand(roomCommand);
          }

          if (remoteUserId === activeRemoteUserId) {
            activeConversationId = projectedMessage.conversationId;
            activeLocalSessionId = localSessionId;
            roomPackages.push(...inboundAttachments.roomPackages);
          }
        }
      }
      /* eslint-enable no-await-in-loop */

      if (activeBinding !== null && activeConversationId === null) {
        const sidecar = new MailSidecarStoreManager(activeBinding.account.id);
        const latestMapping = sidecar.getLatestSessionMapping(
          activeBinding.remoteUser.remoteUserId
        );
        const fallbackSessionId = activeLocalSessionId ?? latestMapping?.localSessionId ?? null;
        if (fallbackSessionId !== null) {
          const archiveContext = await this.prepareArchiveContext(
            activeBinding.remoteUser,
            fallbackSessionId
          );
          activeConversationId = archiveContext.conversationId;
          activeLocalSessionId = fallbackSessionId;
        }
      }

      await this.persistSettings(settings);

      const roomCommands = consumeRoomCommands
        ? this.drainPendingRoomCommands(activeLocalSessionId)
        : this.listPendingRoomCommands(activeLocalSessionId);

      return {
        success: true,
        ...(activeBinding !== null ? { remoteUserId: activeBinding.remoteUser.remoteUserId } : {}),
        localSessionId: activeLocalSessionId,
        conversationId: activeConversationId,
        fetchedCount,
        processedCount,
        duplicateCount,
        projectedCount,
        skippedCount,
        unresolvedSessionCount,
        roomPackages,
        sessionEvents: Array.from(sessionEventsById.values()),
        roomEvents,
        roomCommands,
        roomInviteInbox: this.listRoomInviteInbox(),
      };
    } catch (error) {
      syncBindings.forEach((binding) => {
        this.patchRemoteUserTransportState(settings, binding.remoteUser.remoteUserId, {
          lastSyncAt: this.now(),
          lastError: getErrorMessage(error),
        });
      });
      await this.persistSettings(settings);
      return { success: false, error: getErrorMessage(error) };
    }
  }

  private async buildRelayAttachmentPayloads(params: {
    attachments: NonNullable<Us1SendMessageParams["attachments"]>;
    relayBaseUrl: string;
    relayRequestOptions?: Us1RelayRequestOptions;
    remoteUserId: string;
    senderRemoteUserId: string;
    remoteEncryptionPublicKey: string;
    remoteEncryptionKeyFingerprint: string;
    remoteSigningKeyFingerprint: string;
    senderEncryptionKeyFingerprint: string;
    sentAt: number;
  }): Promise<Us1RelayAttachmentPayload[]> {
    const localPrivateKey = us1RelayIdentityService.getEncryptionPrivateKey();
    const relayAttachments = await Promise.all(
      params.attachments.map(
        async (attachment, index): Promise<Us1RelayAttachmentPayload | null> => {
          const attachmentPath = normalizeOptionalText(attachment.path);
          if (attachmentPath === null) {
            return null;
          }

          const content = await readFile(attachmentPath);
          const name = normalizeOptionalText(attachment.name) ?? basename(attachmentPath);
          const mimeType = normalizeOptionalText(attachment.mimeType) ?? null;

          if (content.byteLength <= RELAY_INLINE_ATTACHMENT_LIMIT_BYTES) {
            return {
              name,
              mimeType,
              transferMode: "inline",
              contentBase64: content.toString("base64"),
              size: content.byteLength,
            };
          }

          const attachmentId = `${buildLocalMessageId(
            "us1-relay-attachment",
            `${params.remoteUserId}:${String(index + 1)}`,
            params.sentAt
          )}:${hashString(name).slice(0, 8)}`;
          const chunkCount = Math.max(
            1,
            Math.ceil(content.byteLength / RELAY_ATTACHMENT_CHUNK_SIZE_BYTES)
          );

          const uploadResults = await Promise.all(
            Array.from({ length: chunkCount }, async (_, chunkIndex) => {
              const chunkStart = chunkIndex * RELAY_ATTACHMENT_CHUNK_SIZE_BYTES;
              const chunkEnd = Math.min(
                chunkStart + RELAY_ATTACHMENT_CHUNK_SIZE_BYTES,
                content.byteLength
              );
              const chunk = content.subarray(chunkStart, chunkEnd);
              const encryptedChunk = encryptRelayBinary({
                payload: chunk,
                localPrivateKey,
                remotePublicKeyBase64: params.remoteEncryptionPublicKey,
                senderRemoteUserId: params.senderRemoteUserId,
                senderEncryptionKeyFingerprint: params.senderEncryptionKeyFingerprint,
                recipientEncryptionKeyFingerprint: params.remoteEncryptionKeyFingerprint,
                messageId: `${attachmentId}:${String(chunkIndex).padStart(4, "0")}`,
                sentAt: params.sentAt,
              });

              return await us1RelayClient.uploadAttachmentChunk(
                params.relayBaseUrl,
                {
                  recipientSigningKeyFingerprint: params.remoteSigningKeyFingerprint,
                  attachmentId,
                  chunkIndex,
                  chunkCount,
                  envelope: encryptedChunk,
                },
                params.relayRequestOptions
              );
            })
          );
          const failedUpload = uploadResults.find((uploadResult) => uploadResult.success !== true);
          if (failedUpload !== undefined) {
            throw new Error(failedUpload.error ?? "US1 relay attachment upload failed.");
          }

          return {
            name,
            mimeType,
            size: content.byteLength,
            transferMode: "chunked",
            chunkTransfer: {
              attachmentId,
              chunkCount,
              chunkSize: RELAY_ATTACHMENT_CHUNK_SIZE_BYTES,
            },
          };
        }
      )
    );

    return relayAttachments.filter(
      (attachment): attachment is Us1RelayAttachmentPayload => attachment !== null
    );
  }

  private async materializeRelayAttachments(
    relayBaseUrl: string,
    remoteUser: RemoteUserIdentity,
    attachments: Us1RelayAttachmentPayload[],
    relayRequestOptions?: Us1RelayRequestOptions
  ): Promise<{
    parsedAttachments: MailTransportParsedAttachment[];
    downloadedAttachmentIds: string[];
  }> {
    const remoteEncryptionPublicKey = normalizeOptionalText(
      remoteUser.relayCapability?.encryptionPublicKey
    );
    const localPrivateKey = us1RelayIdentityService.getEncryptionPrivateKey();
    const buildFallbackAttachment = (
      attachment: Us1RelayAttachmentPayload
    ): MailTransportParsedAttachment => ({
      filename: normalizeOptionalText(attachment.name),
      contentType: normalizeOptionalText(attachment.mimeType ?? null),
      contentDisposition: "attachment",
      checksum: null,
      size:
        typeof attachment.size === "number" && Number.isFinite(attachment.size)
          ? Math.max(0, Math.trunc(attachment.size))
          : 0,
      contentId: null,
      inline: false,
    });

    const materializedAttachments = await Promise.all(
      attachments.map(
        async (
          attachment
        ): Promise<{
          parsedAttachments: MailTransportParsedAttachment[];
          downloadedAttachmentIds: string[];
        }> => {
          if (isChunkedRelayAttachment(attachment) !== true) {
            return {
              parsedAttachments: toRelayParsedAttachments([attachment]),
              downloadedAttachmentIds: [],
            };
          }

          const attachmentId = normalizeOptionalText(
            attachment.chunkTransfer?.attachmentId ?? null
          );
          const expectedChunkCount = attachment.chunkTransfer?.chunkCount;
          if (attachmentId === null || remoteEncryptionPublicKey === null) {
            return {
              parsedAttachments: [buildFallbackAttachment(attachment)],
              downloadedAttachmentIds: [],
            };
          }

          try {
            const downloadResult = await us1RelayClient.downloadAttachment(
              relayBaseUrl,
              {
                attachmentId,
              },
              relayRequestOptions
            );
            if (downloadResult.success !== true) {
              throw new Error(downloadResult.error ?? "US1 relay attachment download failed.");
            }

            const chunks = [...(downloadResult.chunks ?? [])].sort(
              (left, right) => left.chunkIndex - right.chunkIndex
            );
            if (
              chunks.length === 0 ||
              (typeof expectedChunkCount === "number" &&
                Number.isFinite(expectedChunkCount) &&
                expectedChunkCount >= 1 &&
                chunks.length !== expectedChunkCount)
            ) {
              throw new Error("US1 relay attachment download is incomplete.");
            }

            const chunkBuffers = chunks.map((chunk, chunkIndex) => {
              if (chunk.chunkIndex !== chunkIndex) {
                throw new Error("US1 relay attachment chunks are out of order.");
              }
              return decryptRelayBinary({
                envelope: chunk.envelope,
                localPrivateKey,
                remotePublicKeyBase64: remoteEncryptionPublicKey,
              });
            });
            const content = Buffer.concat(chunkBuffers);

            return {
              parsedAttachments: [
                {
                  filename: normalizeOptionalText(attachment.name),
                  contentType: normalizeOptionalText(attachment.mimeType ?? null),
                  contentDisposition: "attachment",
                  checksum: null,
                  size: content.byteLength,
                  contentId: null,
                  inline: false,
                  content,
                },
              ],
              downloadedAttachmentIds: [attachmentId],
            };
          } catch {
            return {
              parsedAttachments: [buildFallbackAttachment(attachment)],
              downloadedAttachmentIds: [],
            };
          }
        }
      )
    );

    return {
      parsedAttachments: materializedAttachments.flatMap((entry) => entry.parsedAttachments),
      downloadedAttachmentIds: materializedAttachments.flatMap(
        (entry) => entry.downloadedAttachmentIds
      ),
    };
  }

  private buildRelayProfilePayload(profile: MessageProfile): Us1RelayProfilePayload {
    return {
      remoteUserId: profile.remoteUserId,
      email: profile.email,
      nickname: profile.nickname,
      avatar: profile.avatar,
      profileRevision: profile.profileRevision,
    };
  }

  private async sendRelayMessage(
    settings: AppSettings,
    binding: ResolvedBinding,
    params: Us1SendMessageParams
  ): Promise<Us1SendMessageResult> {
    const { remoteUser, account } = binding;
    const relayBaseUrl = getRelaySendBaseUrl(settings, remoteUser);
    const remoteEncryptionPublicKey = normalizeOptionalText(
      remoteUser.relayCapability?.encryptionPublicKey
    );
    const remoteEncryptionKeyFingerprint = normalizeOptionalText(
      remoteUser.relayCapability?.encryptionKeyFingerprint
    );
    const remoteSigningKeyFingerprint = normalizeOptionalText(
      remoteUser.relayCapability?.signingKeyFingerprint
    );

    if (
      relayBaseUrl === null ||
      remoteEncryptionPublicKey === null ||
      remoteEncryptionKeyFingerprint === null ||
      remoteSigningKeyFingerprint === null
    ) {
      return { success: false, error: "Relay capability is incomplete for the selected US1 user." };
    }

    const sidecar = new MailSidecarStoreManager(account.id);
    const text = normalizeText(params.text ?? "");
    const attachments = (params.attachments ?? []).filter(
      (attachment) => normalizeOptionalText(attachment.path) !== null
    );

    if (text === "" && attachments.length === 0) {
      return { success: false, error: "US1 message content is empty." };
    }

    const requestedSessionId = normalizeOptionalText(params.localSessionId);
    const outboundSession = resolveOwnedOutboundSession({
      now: this.now(),
      remoteUserId: remoteUser.remoteUserId,
      requestedSessionId,
      sidecar,
      threadSeed: null,
    });
    const { isNewSession, latestMapping, localSessionId } = outboundSession;
    if (outboundSession.ignoredRequestedSessionId) {
      await logger.logInternal(
        LogCategory.COMMAND,
        LogLevel.WARNING,
        "US1 relay send ignored an unowned client session identifier.",
        {
          eventCode: "auth.owner_scope_violation",
          provider: "us1",
          slotId: "us1",
          userId: resolveUs1LocalUserId(settings, binding),
          remoteUserId: remoteUser.remoteUserId,
          requestedLocalSessionId: requestedSessionId,
          resolvedLocalSessionId: localSessionId,
          clientRequestId: normalizeOptionalText(params.clientRequestId),
          brokerMessageId: normalizeOptionalText(params.brokerMessageId),
          operationName: "us1.sendRelayMessage",
        }
      );
    }
    const sessionTitle = null;
    const sessionMode: Us1SessionMode = isNewSession ? "new" : "reply";
    const sessionOpenHint: Us1SessionOpenHint = isNewSession ? "auto_if_idle" : "list_only";
    const localProfile = this.buildLocalProfile(settings, account);
    const relayProfile = this.buildRelayProfilePayload(localProfile);
    const localMessageId = buildLocalMessageId(
      "us1-relay-out",
      remoteUser.remoteUserId,
      this.now()
    );
    const threadMessageId =
      latestMapping?.threadMessageId ?? normalizeOptionalText(remoteUser.threadMessageId);
    const inReplyTo =
      latestMapping?.lastMessageId ?? normalizeOptionalText(remoteUser.lastTransportMessageId);
    const localRelayIdentity = us1RelayIdentityService.getLocalMetadata();
    const sentAt = this.now();
    const relayRequestOptions = getRelayClientRequestOptions(settings);
    const relayAttachments = await this.buildRelayAttachmentPayloads({
      attachments,
      relayBaseUrl,
      relayRequestOptions,
      remoteUserId: remoteUser.remoteUserId,
      senderRemoteUserId: relayProfile.remoteUserId,
      remoteEncryptionPublicKey,
      remoteEncryptionKeyFingerprint,
      remoteSigningKeyFingerprint,
      senderEncryptionKeyFingerprint: localRelayIdentity.encryptionKeyFingerprint,
      sentAt,
    });
    const transportMessageId = buildLocalMessageId(
      "us1-relay-msg",
      remoteUser.remoteUserId,
      sentAt
    );

    try {
      const relayPayload: Us1RelayConversationPayload = {
        protocol: US1_RELAY_MESSAGE_PROTOCOL,
        version: US1_RELAY_PROTOCOL_VERSION,
        messageType: "conversation",
        sentAt,
        localSessionId,
        session: {
          id: localSessionId,
          mode: sessionMode,
          title: sessionTitle,
          createdAt: sentAt,
          openHint: sessionOpenHint,
        },
        thread: {
          threadRootMessageId: threadMessageId,
          replyToMessageId: inReplyTo,
        },
        profile: relayProfile,
        text,
        attachments: relayAttachments,
        ...(params.roomEvent !== undefined && params.roomEvent !== null
          ? { roomEvent: params.roomEvent }
          : {}),
        ...(params.roomCommand !== undefined && params.roomCommand !== null
          ? { roomCommand: params.roomCommand }
          : {}),
      };

      const encryptedEnvelope = encryptRelayPayload({
        payload: relayPayload,
        localPrivateKey: us1RelayIdentityService.getEncryptionPrivateKey(),
        remotePublicKeyBase64: remoteEncryptionPublicKey,
        senderRemoteUserId: relayProfile.remoteUserId,
        senderEncryptionKeyFingerprint: localRelayIdentity.encryptionKeyFingerprint,
        recipientEncryptionKeyFingerprint: remoteEncryptionKeyFingerprint,
        messageId: transportMessageId,
        sentAt,
      });

      const relayResult = await us1RelayClient.publish(
        relayBaseUrl,
        {
          recipientSigningKeyFingerprint: remoteSigningKeyFingerprint,
          envelope: encryptedEnvelope,
        },
        relayRequestOptions
      );

      if (relayResult.success !== true) {
        throw new Error(relayResult.error ?? "US1 relay publish failed.");
      }
      this.applyRelayTransportTrustSuccess(settings, relayBaseUrl, relayResult);

      const archiveContext = await this.prepareArchiveContext(
        remoteUser,
        localSessionId,
        isNewSession ? null : undefined
      );
      const projectedMessage = await this.appendArchiveMessage(archiveContext, {
        role: "user",
        author: buildConversationAuthor(localProfile),
        text: text !== "" ? text : OUTBOUND_ATTACHMENT_ONLY_TEXT,
        domId: transportMessageId,
      });
      const attachmentRefs = await this.saveOutboundAttachments(
        archiveContext.manager,
        projectedMessage.conversationId,
        projectedMessage.messageId,
        attachments
      );

      sidecar.upsertSessionMapping({
        remoteUserId: remoteUser.remoteUserId,
        localSessionId,
        threadMessageId: threadMessageId ?? transportMessageId,
        lastMessageId: transportMessageId,
      });
      sidecar.upsertMessageMeta({
        transportMessageId,
        localMessageId,
        deliveryState: "queued",
        headersHash: hashString(JSON.stringify(encryptedEnvelope)),
        metadata: {
          direction: "outbound",
          remoteUserId: remoteUser.remoteUserId,
          localSessionId,
          conversationId: projectedMessage.conversationId,
          webUrl: archiveContext.webUrl,
          archiveMessageId: projectedMessage.messageId,
          attachments: attachmentRefs,
        },
      });

      this.patchRemoteUserTransportState(settings, remoteUser.remoteUserId, {
        threadMessageId: threadMessageId ?? transportMessageId,
        lastTransportMessageId: transportMessageId,
        lastSyncAt: this.now(),
        lastError: null,
      });
      await this.persistSettings(settings);

      return {
        success: true,
        remoteUserId: remoteUser.remoteUserId,
        localSessionId,
        conversationId: projectedMessage.conversationId,
        transportMessageId,
        archiveMessageId: projectedMessage.messageId,
        deliveryState: "queued",
        attachmentCount: attachmentRefs.length,
      };
    } catch (error) {
      this.applyRelayTransportTrustError(settings, relayBaseUrl, error);
      this.patchRemoteUserTransportState(settings, remoteUser.remoteUserId, {
        lastSyncAt: this.now(),
        lastError: getErrorMessage(error),
      });
      await this.persistSettings(settings);
      return { success: false, error: getErrorMessage(error) };
    }
  }

  private async syncRelayMessages(
    settings: AppSettings,
    activeBinding: ResolvedBinding | null,
    syncBindings: ResolvedBinding[],
    params: Us1SyncMessagesParams
  ): Promise<Us1SyncMessagesResult> {
    const relayBaseUrl = getRelayReceiveBaseUrl(settings);
    if (relayBaseUrl === null) {
      return { success: false, error: "US1 relay base URL is not configured." };
    }

    const localRelayIdentity = us1RelayIdentityService.getLocalMetadata();
    const bindingsByRemoteUserId = new Map(
      syncBindings.map((binding) => [binding.remoteUser.remoteUserId, binding])
    );
    const relayRequestOptions = getRelayClientRequestOptions(settings);

    try {
      const pollResult = await us1RelayClient.poll(
        relayBaseUrl,
        {
          cursor: null,
          limit:
            typeof params.limit === "number" && params.limit > 0 ? Math.trunc(params.limit) : 20,
        },
        relayRequestOptions
      );

      if (pollResult.success !== true) {
        throw new Error(pollResult.error ?? "US1 relay sync failed.");
      }
      this.applyRelayTransportTrustSuccess(settings, relayBaseUrl, pollResult);

      const fetchedCount = pollResult.messages?.length ?? 0;
      let processedCount = 0;
      const duplicateCount = 0;
      let projectedCount = 0;
      let skippedCount = 0;
      let unresolvedSessionCount = 0;
      let activeConversationId: string | null = null;
      let activeLocalSessionId: string | null = normalizeOptionalText(params.localSessionId);
      const roomPackages: Us1RoomPackageCandidate[] = [];
      const sessionEventsById = new Map<string, Us1SessionEvent>();
      const roomEvents: Us1RoomEventRecord[] = [];
      const acknowledgedMessageIds: string[] = [];
      const acknowledgedAttachmentIds = new Set<string>();

      // NOTE: Relay sync mutates archive and session state per message, so processing stays sequential.
      /* eslint-disable no-await-in-loop */
      for (const queuedEnvelope of pollResult.messages ?? []) {
        const binding =
          bindingsByRemoteUserId.get(queuedEnvelope.envelope.senderRemoteUserId) ?? null;
        const remoteUser =
          binding?.remoteUser ??
          this.findRemoteUser(settings, queuedEnvelope.envelope.senderRemoteUserId);
        const account = binding?.account ?? null;
        const remoteEncryptionPublicKey = normalizeOptionalText(
          remoteUser?.relayCapability?.encryptionPublicKey
        );

        if (
          remoteUser === null ||
          account === null ||
          remoteUser.handshakeState !== "active" ||
          remoteEncryptionPublicKey === null ||
          queuedEnvelope.envelope.recipientEncryptionKeyFingerprint !==
            localRelayIdentity.encryptionKeyFingerprint
        ) {
          skippedCount += 1;
          continue;
        }

        let relayPayload: Us1RelayConversationPayload;
        try {
          relayPayload = decryptRelayPayload({
            envelope: queuedEnvelope.envelope,
            localPrivateKey: us1RelayIdentityService.getEncryptionPrivateKey(),
            remotePublicKeyBase64: remoteEncryptionPublicKey,
          });
        } catch {
          skippedCount += 1;
          continue;
        }

        const sidecar = new MailSidecarStoreManager(account.id);
        const transportMessageId = queuedEnvelope.envelope.messageId;
        const localMessageId = buildLocalMessageId(
          "us1-relay-in",
          remoteUser.remoteUserId,
          relayPayload.sentAt
        );
        const sessionDescriptor = relayPayload.session ?? null;
        const sessionTitle = normalizeOptionalText(sessionDescriptor?.title);
        const sessionIdFromEnvelope = normalizeOptionalText(sessionDescriptor?.id);
        const explicitSessionId =
          sessionIdFromEnvelope ?? normalizeOptionalText(relayPayload.localSessionId);
        let localSessionId =
          sessionIdFromEnvelope ??
          normalizeOptionalText(relayPayload.localSessionId) ??
          sidecar.getLatestSessionMapping(remoteUser.remoteUserId)?.localSessionId ??
          null;
        const existingSessionMapping =
          localSessionId !== null
            ? sidecar.getSessionMapping(remoteUser.remoteUserId, localSessionId)
            : null;
        if (localSessionId === null) {
          localSessionId = buildSessionId(
            remoteUser.remoteUserId,
            normalizeOptionalText(relayPayload.thread?.threadRootMessageId) ?? transportMessageId,
            this.now()
          );
          unresolvedSessionCount += 1;
        }

        const isNewSession = existingSessionMapping === null;
        const archiveTitle = isNewSession === true ? null : undefined;

        const archiveContext = await this.prepareArchiveContext(
          remoteUser,
          localSessionId,
          archiveTitle
        );
        const projectedMessage = await this.appendArchiveMessage(archiveContext, {
          role: "assistant",
          author: buildConversationAuthor(remoteUser),
          text:
            relayPayload.text !== ""
              ? relayPayload.text
              : relayPayload.attachments.length > 0
                ? INBOUND_ATTACHMENT_ONLY_TEXT
                : "",
          domId: transportMessageId,
        });
        const inboundRelayAttachments = await this.materializeRelayAttachments(
          relayBaseUrl,
          remoteUser,
          relayPayload.attachments,
          getRelayClientRequestOptions(settings)
        );
        const inboundAttachments = await this.saveInboundAttachments(
          archiveContext.manager,
          projectedMessage.conversationId,
          projectedMessage.messageId,
          remoteUser.remoteUserId,
          localSessionId,
          inboundRelayAttachments.parsedAttachments
        );

        sidecar.upsertSessionMapping({
          remoteUserId: remoteUser.remoteUserId,
          localSessionId,
          threadMessageId:
            normalizeOptionalText(relayPayload.thread?.threadRootMessageId) ??
            remoteUser.threadMessageId ??
            transportMessageId,
          lastMessageId: transportMessageId,
        });
        sidecar.upsertMessageMeta({
          transportMessageId,
          localMessageId,
          deliveryState: "received",
          headersHash: hashString(JSON.stringify(queuedEnvelope.envelope)),
          metadata: {
            direction: "inbound",
            remoteUserId: remoteUser.remoteUserId,
            localSessionId,
            conversationId: projectedMessage.conversationId,
            webUrl: archiveContext.webUrl,
            archiveMessageId: projectedMessage.messageId,
            attachments: inboundAttachments.attachmentRefs,
            missingAttachmentCount: inboundAttachments.missingAttachmentCount,
          },
        });

        this.patchRemoteUserTransportState(settings, remoteUser.remoteUserId, {
          threadMessageId:
            normalizeOptionalText(relayPayload.thread?.threadRootMessageId) ??
            remoteUser.threadMessageId ??
            transportMessageId,
          lastTransportMessageId: transportMessageId,
          lastSyncAt: this.now(),
          lastError: null,
        });

        processedCount += 1;
        projectedCount += 1;
        acknowledgedMessageIds.push(queuedEnvelope.id);
        inboundRelayAttachments.downloadedAttachmentIds.forEach((attachmentId) => {
          acknowledgedAttachmentIds.add(attachmentId);
        });

        const sessionEvent = sessionEventsById.get(localSessionId);
        sessionEventsById.set(localSessionId, {
          remoteUserId: remoteUser.remoteUserId,
          localSessionId,
          conversationId: projectedMessage.conversationId,
          sessionTitle,
          mode: sessionDescriptor?.mode ?? (isNewSession ? "new" : "reply"),
          openHint: sessionDescriptor?.openHint ?? (isNewSession ? "auto_if_idle" : "list_only"),
          sentAt: relayPayload.sentAt,
          isNewSession:
            sessionEvent?.isNewSession === true ||
            (isNewSession === true && explicitSessionId !== null),
          createdAt: sessionDescriptor?.createdAt ?? relayPayload.sentAt,
        });

        const roomEvent = this.buildRoomEventRecord(
          relayPayload.roomEvent ?? null,
          remoteUser,
          localSessionId,
          projectedMessage.conversationId,
          transportMessageId,
          relayPayload.sentAt
        );
        if (roomEvent !== null) {
          roomEvents.push(roomEvent);
          this.applyRoomInviteEvent(roomEvent);
        }

        const roomCommand = await this.buildRoomCommandRecord(
          relayPayload.roomCommand ?? extractConversationRoomCommandFromText(relayPayload.text),
          remoteUser,
          localSessionId,
          projectedMessage.conversationId,
          transportMessageId,
          relayPayload.sentAt
        );
        if (roomCommand !== null) {
          this.queuePendingRoomCommand(roomCommand);
        }

        if (remoteUser.remoteUserId === activeBinding?.remoteUser.remoteUserId) {
          activeConversationId = projectedMessage.conversationId;
          activeLocalSessionId = localSessionId;
          roomPackages.push(...inboundAttachments.roomPackages);
        }
      }
      /* eslint-enable no-await-in-loop */

      if (acknowledgedMessageIds.length > 0) {
        const ackResult = await us1RelayClient.acknowledge(
          relayBaseUrl,
          {
            messageIds: acknowledgedMessageIds,
            ...(acknowledgedAttachmentIds.size > 0
              ? { attachmentIds: Array.from(acknowledgedAttachmentIds) }
              : {}),
          },
          getRelayClientRequestOptions(settings)
        );
        this.applyRelayTransportTrustSuccess(settings, relayBaseUrl, ackResult);
      }

      if (activeBinding !== null && activeConversationId === null) {
        const sidecar = new MailSidecarStoreManager(activeBinding.account.id);
        const latestMapping = sidecar.getLatestSessionMapping(
          activeBinding.remoteUser.remoteUserId
        );
        const fallbackSessionId = activeLocalSessionId ?? latestMapping?.localSessionId ?? null;
        if (fallbackSessionId !== null) {
          const archiveContext = await this.prepareArchiveContext(
            activeBinding.remoteUser,
            fallbackSessionId
          );
          activeConversationId = archiveContext.conversationId;
          activeLocalSessionId = fallbackSessionId;
        }
      }

      await this.persistSettings(settings);

      const roomCommands =
        params.consumeRoomCommands === true
          ? this.drainPendingRoomCommands(activeLocalSessionId)
          : this.listPendingRoomCommands(activeLocalSessionId);

      return {
        success: true,
        ...(activeBinding !== null ? { remoteUserId: activeBinding.remoteUser.remoteUserId } : {}),
        localSessionId: activeLocalSessionId,
        conversationId: activeConversationId,
        fetchedCount,
        processedCount,
        duplicateCount,
        projectedCount,
        skippedCount,
        unresolvedSessionCount,
        roomPackages,
        sessionEvents: Array.from(sessionEventsById.values()),
        roomEvents,
        roomCommands,
        roomInviteInbox: this.listRoomInviteInbox(),
      };
    } catch (error) {
      this.applyRelayTransportTrustError(settings, relayBaseUrl, error);
      syncBindings.forEach((binding) => {
        this.patchRemoteUserTransportState(settings, binding.remoteUser.remoteUserId, {
          lastSyncAt: this.now(),
          lastError: getErrorMessage(error),
        });
      });
      await this.persistSettings(settings);
      return { success: false, error: getErrorMessage(error) };
    }
  }

  private applyRelayTransportTrustSuccess(
    settings: AppSettings,
    baseUrl: string,
    response: Us1RelayResponseMeta
  ): void {
    settings.integrations ??= {};
    const current = settings.integrations.us1Relay ?? {};
    const normalizedFingerprint = normalizeRelayServerFingerprint(response.serverFingerprint);

    settings.integrations.us1Relay = {
      ...current,
      baseUrl,
      trustedServerFingerprint:
        response.transportProtocol === "https" && normalizedFingerprint !== null
          ? (getRelayPinnedServerFingerprint(settings) ?? normalizedFingerprint)
          : (current.trustedServerFingerprint ?? null),
      trustState: response.transportProtocol === "https" ? "trusted" : "unknown",
      lastError: null,
    };
  }

  private applyRelayTransportTrustError(
    settings: AppSettings,
    baseUrl: string | null,
    error: unknown
  ): void {
    settings.integrations ??= {};
    const current = settings.integrations.us1Relay ?? {};
    const trustState =
      error instanceof RelayTlsPinError ? "mismatch" : (current.trustState ?? "unknown");

    settings.integrations.us1Relay = {
      ...current,
      ...(baseUrl !== null ? { baseUrl } : {}),
      trustState,
      lastError: getErrorMessage(error),
    };
  }

  async checkRelayHealth(
    params: Us1RelayHealthCheckParams = {}
  ): Promise<Us1RelayHealthCheckResult> {
    const settings = await this.loadNormalizedSettings();
    const baseUrl =
      normalizeOptionalText(params.baseUrl ?? null) ?? getRelayReceiveBaseUrl(settings);
    if (baseUrl === null) {
      return { success: false, reachable: false, error: "US1 relay base URL is not configured." };
    }

    const checkedAt = this.now();
    settings.integrations ??= {};
    settings.integrations.us1Relay = {
      ...(settings.integrations.us1Relay ?? {}),
      baseUrl,
      connectionState: "connecting",
      lastError: null,
    };
    await this.persistSettings(settings);

    try {
      const result = await us1RelayClient.health(baseUrl, getRelayClientRequestOptions(settings));
      this.applyRelayTransportTrustSuccess(settings, baseUrl, result);
      const previousLastConnectedAt = settings.integrations.us1Relay.lastConnectedAt ?? null;
      settings.integrations.us1Relay = {
        ...(settings.integrations.us1Relay ?? {}),
        baseUrl,
        connectionState: result.reachable === true ? "connected" : "error",
        lastError: result.reachable === true ? null : "US1 relay health check failed.",
        lastConnectedAt: result.reachable === true ? checkedAt : previousLastConnectedAt,
      };
      await this.persistSettings(settings);

      return {
        success: result.reachable,
        reachable: result.reachable,
        checkedAt,
        ...(result.reachable === true ? {} : { error: "US1 relay health check failed." }),
      };
    } catch (error) {
      this.applyRelayTransportTrustError(settings, baseUrl, error);
      settings.integrations.us1Relay = {
        ...(settings.integrations.us1Relay ?? {}),
        baseUrl,
        connectionState: "error",
        lastError: getErrorMessage(error),
      };
      await this.persistSettings(settings);
      return {
        success: false,
        reachable: false,
        checkedAt,
        error: getErrorMessage(error),
      };
    }
  }

  private async loadNormalizedSettings(): Promise<AppSettings> {
    const settings = normalizeSettings((await this.settingsStore.loadSettings()) ?? {});
    us1RelayIdentityService.syncSettingsMetadata(settings);
    return settings;
  }

  private async persistSettings(settings: AppSettings): Promise<void> {
    const saved = await this.settingsStore.saveSettings(normalizeSettings(settings));
    if (saved !== true) {
      throw new Error("Failed to persist US1 conversation settings.");
    }
  }

  private buildRoomInviteInboxKey(remoteUserId: string, inviteId: string): string {
    return `${remoteUserId}::${inviteId}`;
  }

  private listRoomInviteInbox(): Us1RoomEventRecord[] {
    return Array.from(this.roomInviteInbox.values()).sort((left, right) => {
      const leftSentAt = left.sentAt ?? 0;
      const rightSentAt = right.sentAt ?? 0;
      if (leftSentAt !== rightSentAt) {
        return rightSentAt - leftSentAt;
      }
      return left.remoteUserId.localeCompare(right.remoteUserId, "tr");
    });
  }

  private applyRoomInviteEvent(roomEvent: Us1RoomEventRecord): void {
    const key = this.buildRoomInviteInboxKey(roomEvent.remoteUserId, roomEvent.inviteId);
    if (roomEvent.eventType === "invite") {
      this.roomInviteInbox.set(key, roomEvent);
      return;
    }

    this.roomInviteInbox.delete(key);
  }

  private buildPendingRoomCommandKey(roomCommand: Us1RoomCommandRecord): string {
    return `${roomCommand.remoteUserId}::${roomCommand.transportMessageId}`;
  }

  private sortPendingRoomCommands(roomCommands: Us1RoomCommandRecord[]): Us1RoomCommandRecord[] {
    return roomCommands.sort((left, right) => {
      const leftSentAt = left.sentAt ?? 0;
      const rightSentAt = right.sentAt ?? 0;
      if (leftSentAt !== rightSentAt) {
        return leftSentAt - rightSentAt;
      }
      return left.transportMessageId.localeCompare(right.transportMessageId, "tr");
    });
  }

  private queuePendingRoomCommand(roomCommand: Us1RoomCommandRecord): void {
    this.pendingRoomCommands.set(this.buildPendingRoomCommandKey(roomCommand), roomCommand);
  }

  private listPendingRoomCommands(localSessionId: string | null): Us1RoomCommandRecord[] {
    if (localSessionId === null) {
      return [];
    }

    const roomCommands = Array.from(this.pendingRoomCommands.values()).filter(
      (roomCommand) => roomCommand.localSessionId === localSessionId
    );
    return this.sortPendingRoomCommands(roomCommands);
  }

  private drainPendingRoomCommands(localSessionId: string | null): Us1RoomCommandRecord[] {
    if (localSessionId === null) {
      return [];
    }

    const roomCommands: Us1RoomCommandRecord[] = [];
    for (const [key, roomCommand] of this.pendingRoomCommands.entries()) {
      if (roomCommand.localSessionId !== localSessionId) {
        continue;
      }
      roomCommands.push(roomCommand);
      this.pendingRoomCommands.delete(key);
    }

    return this.sortPendingRoomCommands(roomCommands);
  }

  private buildRoomEventRecord(
    roomEvent: ConversationRoomEvent | null,
    remoteUser: Pick<RemoteUserIdentity, "remoteUserId" | "nickname" | "email">,
    localSessionId: string,
    conversationId: string,
    transportMessageId: string,
    sentAt: number | undefined
  ): Us1RoomEventRecord | null {
    if (roomEvent === null) {
      return null;
    }

    return {
      ...roomEvent,
      remoteUserId: remoteUser.remoteUserId,
      localSessionId,
      conversationId,
      transportMessageId,
      ...(sentAt !== undefined ? { sentAt } : {}),
      senderNickname: remoteUser.nickname ?? null,
      senderEmail: remoteUser.email,
    };
  }

  private async loadRoomCommandIdentityIndex(): Promise<Map<string, RoomCommandIdentity>> {
    if (this.roomCommandIdentityIndex !== null) {
      return this.roomCommandIdentityIndex;
    }

    const index = new Map<string, RoomCommandIdentity>();
    try {
      const registryRaw = await readFile(Paths.getRoomsRegistryPath(), "utf8");
      buildRoomCommandIdentityIndex(JSON.parse(registryRaw) as unknown).forEach(
        (identity, commandName) => {
          index.set(commandName, identity);
        }
      );
    } catch {
      // Registry files can be absent in isolated sync tests and first-run mail flows.
    }

    const workspaceIndex = await buildWorkspaceRoomCommandIdentityIndex();
    workspaceIndex.forEach((identity, commandName) => {
      index.set(commandName, identity);
    });

    this.roomCommandIdentityIndex = index;
    return this.roomCommandIdentityIndex;
  }

  private async resolveRoomCommandIdentity(
    roomCommand: ConversationRoomCommand
  ): Promise<RoomCommandIdentity | null> {
    const roomId = normalizeOptionalText(roomCommand.roomId);
    const featureId = normalizeOptionalText(roomCommand.featureId);
    if (roomId !== null && featureId !== null) {
      return { roomId, featureId };
    }

    const commandName = normalizeOptionalText(roomCommand.commandName);
    if (commandName === null) {
      return null;
    }

    const index = await this.loadRoomCommandIdentityIndex();
    const indexedIdentity = index.get(commandName.toLowerCase()) ?? null;
    if (indexedIdentity !== null) {
      return indexedIdentity;
    }

    return null;
  }

  private async buildRoomCommandRecord(
    roomCommand: ConversationRoomCommand | null,
    remoteUser: Pick<RemoteUserIdentity, "remoteUserId" | "nickname" | "email">,
    localSessionId: string,
    conversationId: string,
    transportMessageId: string,
    sentAt: number | undefined
  ): Promise<Us1RoomCommandRecord | null> {
    if (roomCommand === null) {
      return null;
    }

    const identity = await this.resolveRoomCommandIdentity(roomCommand);
    if (identity === null) {
      return null;
    }

    let commandArgs: unknown =
      roomCommand.roomPayload !== undefined ? roomCommand.roomPayload : undefined;
    const rawArgs =
      normalizeOptionalText(roomCommand.rawArgs) ??
      ((): string => {
        if (commandArgs === undefined) {
          return "";
        }
        try {
          return JSON.stringify(commandArgs);
        } catch {
          return "";
        }
      })();
    if (commandArgs === undefined && rawArgs !== "") {
      try {
        commandArgs = JSON.parse(rawArgs) as unknown;
      } catch {
        commandArgs = rawArgs;
      }
    }

    return {
      ...roomCommand,
      roomId: identity.roomId,
      featureId: identity.featureId,
      rawArgs,
      ...(commandArgs !== undefined ? { commandArgs } : {}),
      remoteUserId: remoteUser.remoteUserId,
      localSessionId,
      conversationId,
      transportMessageId,
      ...(sentAt !== undefined ? { sentAt } : {}),
      senderNickname: remoteUser.nickname ?? null,
      senderEmail: remoteUser.email,
    };
  }

  private resolveSyncBindings(settings: AppSettings, requireConnected: boolean): ResolvedBinding[] {
    const remoteAccounts = getRemoteEmailAccounts(settings.accounts);
    const accountsById = new Map(
      (settings.integrations?.mailTransport?.accounts ?? [])
        .filter((account) => account.enabled !== false)
        .map((account) => [account.id, account] as const)
    );
    const bindingsByRemoteUserId = new Map<string, ResolvedBinding>();

    const shouldIncludeAccount = (account: MailTransportAccountConfig | undefined): boolean => {
      if (account === undefined) {
        return false;
      }
      if (requireConnected !== true) {
        return true;
      }
      return (
        settings.us1Slot?.connectionState === "connected" && account.connectionState === "connected"
      );
    };

    remoteAccounts.forEach((remoteAccount) => {
      const remoteUser = buildRemoteUserFromRemoteAccount(remoteAccount);
      const accountId = normalizeOptionalText(remoteUser?.linkedMailAccountId ?? null);
      const account = accountId !== null ? accountsById.get(accountId) : undefined;
      if (remoteUser?.handshakeState !== "active" || shouldIncludeAccount(account) !== true) {
        return;
      }

      bindingsByRemoteUserId.set(remoteUser.remoteUserId, {
        remoteUser,
        account: account as MailTransportAccountConfig,
      });
    });

    (settings.remoteUsers ?? []).forEach((remoteUser) => {
      if (
        remoteUser.handshakeState !== "active" ||
        bindingsByRemoteUserId.has(remoteUser.remoteUserId)
      ) {
        return;
      }

      const accountId = normalizeOptionalText(remoteUser.linkedMailAccountId);
      const account = accountId !== null ? accountsById.get(accountId) : undefined;
      if (shouldIncludeAccount(account) !== true) {
        return;
      }

      bindingsByRemoteUserId.set(remoteUser.remoteUserId, {
        remoteUser,
        account: account as MailTransportAccountConfig,
      });
    });

    return Array.from(bindingsByRemoteUserId.values()).sort((left, right) =>
      left.remoteUser.remoteUserId.localeCompare(right.remoteUser.remoteUserId, "tr")
    );
  }

  private resolveRelayRemoteUser(
    settings: AppSettings,
    remoteUserId: string
  ): RemoteUserIdentity | null {
    const storedRemoteUser =
      (settings.remoteUsers ?? []).find((candidate) => candidate.remoteUserId === remoteUserId) ??
      null;
    const projectedRemoteUser = buildRemoteUserFromRemoteAccount(
      getRemoteEmailAccounts(settings.accounts).find(
        (account) => normalizeOptionalText(account.remoteEmail?.remoteUserId) === remoteUserId
      ) ?? null
    );

    if (storedRemoteUser !== null && projectedRemoteUser !== null) {
      return {
        ...projectedRemoteUser,
        relayCapability:
          storedRemoteUser.relayCapability ?? projectedRemoteUser.relayCapability ?? null,
      };
    }

    return storedRemoteUser ?? projectedRemoteUser;
  }

  private resolveRelaySyncBindings(
    settings: AppSettings,
    requireConnected: boolean
  ): ResolvedBinding[] {
    const remoteUsers = (settings.remoteUsers ?? [])
      .map((remoteUser) => this.resolveRelayRemoteUser(settings, remoteUser.remoteUserId))
      .filter((remoteUser): remoteUser is RemoteUserIdentity => remoteUser !== null);
    const accountsById = new Map(
      (settings.integrations?.mailTransport?.accounts ?? []).map(
        (account) => [account.id, account] as const
      )
    );

    return remoteUsers
      .filter((remoteUser) => {
        if (remoteUser.handshakeState !== "active" || hasRelayCapability(remoteUser) !== true) {
          return false;
        }

        if (
          getRelayReceiveBaseUrl(settings) === null ||
          getRelaySendBaseUrl(settings, remoteUser) === null
        ) {
          return false;
        }

        if (requireConnected === true && settings.us1Slot?.connectionState !== "connected") {
          return false;
        }

        return accountsById.has(getRemoteUserLinkedAccountId(remoteUser) ?? "");
      })
      .map((remoteUser) => ({
        remoteUser,
        account: accountsById.get(
          getRemoteUserLinkedAccountId(remoteUser) ?? ""
        ) as MailTransportAccountConfig,
      }))
      .sort((left, right) =>
        left.remoteUser.remoteUserId.localeCompare(right.remoteUser.remoteUserId, "tr")
      );
  }

  private resolveActiveRelayBinding(
    settings: AppSettings,
    requireConnected: boolean
  ): ResolvedBinding | null {
    const selectedRemoteUserId = resolveSelectedRemoteUserId(settings);
    if (selectedRemoteUserId === null) {
      return null;
    }

    const remoteUser = this.resolveRelayRemoteUser(settings, selectedRemoteUserId);
    if (remoteUser?.handshakeState !== "active" || hasRelayCapability(remoteUser) !== true) {
      return null;
    }

    if (
      getRelayReceiveBaseUrl(settings) === null ||
      getRelaySendBaseUrl(settings, remoteUser) === null
    ) {
      return null;
    }

    if (requireConnected === true && settings.us1Slot?.connectionState !== "connected") {
      return null;
    }

    const linkedAccountId = getRemoteUserLinkedAccountId(remoteUser);
    if (linkedAccountId === null) {
      return null;
    }

    const account =
      settings.integrations?.mailTransport?.accounts.find(
        (candidate) => candidate.id === linkedAccountId
      ) ?? null;
    if (account === null) {
      return null;
    }

    return { remoteUser, account };
  }

  private resolveActiveBinding(
    settings: AppSettings,
    requireConnected: boolean
  ): ResolvedBinding | null {
    const remoteAccounts = getRemoteEmailAccounts(settings.accounts);
    const selectedAccountId = normalizeOptionalText(settings.us1Slot?.selectedAccountId);
    const selectedRemoteUserId = resolveSelectedRemoteUserId(settings);
    const integrations = settings.integrations ?? {};

    const remoteAccount =
      (selectedAccountId !== null
        ? remoteAccounts.find(
            (candidate) =>
              candidate.id === selectedAccountId &&
              candidate.remoteEmail?.handshakeState === "active"
          )
        : null) ??
      (selectedRemoteUserId !== null
        ? remoteAccounts.find(
            (candidate) =>
              normalizeOptionalText(candidate.remoteEmail?.remoteUserId) === selectedRemoteUserId &&
              candidate.remoteEmail?.handshakeState === "active"
          )
        : null) ??
      null;

    const remoteUserFromAccount = buildRemoteUserFromRemoteAccount(remoteAccount);
    if (remoteUserFromAccount !== null) {
      const account =
        integrations.mailTransport?.accounts.find(
          (candidate) => candidate.id === remoteUserFromAccount.linkedMailAccountId
        ) ?? null;
      if (account !== null && account.enabled !== false) {
        if (
          requireConnected === true &&
          (settings.us1Slot?.connectionState !== "connected" ||
            account.connectionState !== "connected")
        ) {
          return null;
        }

        return { remoteUser: remoteUserFromAccount, account };
      }
    }

    if (selectedRemoteUserId === null) {
      return null;
    }

    const remoteUser =
      (settings.remoteUsers ?? []).find(
        (candidate) =>
          candidate.remoteUserId === selectedRemoteUserId && candidate.handshakeState === "active"
      ) ?? null;
    if (remoteUser === null) {
      return null;
    }

    const account =
      integrations.mailTransport?.accounts.find(
        (candidate) => candidate.id === remoteUser.linkedMailAccountId
      ) ?? null;
    if (account === null || account.enabled === false) {
      return null;
    }

    if (
      requireConnected === true &&
      (settings.us1Slot?.connectionState !== "connected" || account.connectionState !== "connected")
    ) {
      return null;
    }

    return { remoteUser, account };
  }

  private findRemoteUser(settings: AppSettings, remoteUserId: string): RemoteUserIdentity | null {
    const remoteUserFromAccount = buildRemoteUserFromRemoteAccount(
      getRemoteEmailAccounts(settings.accounts).find(
        (account) => normalizeOptionalText(account.remoteEmail?.remoteUserId) === remoteUserId
      ) ?? null
    );
    const storedRemoteUser =
      (settings.remoteUsers ?? []).find((remoteUser) => remoteUser.remoteUserId === remoteUserId) ??
      null;
    if (remoteUserFromAccount !== null) {
      return {
        ...remoteUserFromAccount,
        relayCapability:
          storedRemoteUser?.relayCapability ?? remoteUserFromAccount.relayCapability ?? null,
      };
    }

    return storedRemoteUser;
  }

  private buildLocalProfile(
    settings: AppSettings,
    account: MailTransportAccountConfig
  ): MessageProfile {
    const nickname =
      normalizeOptionalText(settings.user?.nickname) ?? normalizeEmail(account.email);
    const rawAvatar = normalizeOptionalText(settings.user?.avatarPath) ?? "";
    const avatar =
      rawAvatar.startsWith("https://") ||
      rawAvatar.startsWith("http://") ||
      rawAvatar.startsWith("data:")
        ? rawAvatar
        : "";

    return {
      remoteUserId: normalizeEmail(account.email),
      email: normalizeEmail(account.email),
      nickname,
      avatar,
      profileRevision: this.now(),
    };
  }

  private resolveHandshakeAvatar(
    profile: MessageProfile,
    attachments: MailTransportParsedAttachment[]
  ): string {
    if (
      profile.avatar.startsWith("https://") ||
      profile.avatar.startsWith("http://") ||
      profile.avatar.startsWith("data:")
    ) {
      return profile.avatar;
    }

    const attachment = findHandshakeAvatarAttachment(
      attachments,
      profile.avatarAttachmentName ?? null
    );
    if (attachment?.content === undefined) {
      return "";
    }

    return buildImageDataUrl(
      getAvatarMimeType(attachment.filename, normalizeOptionalText(attachment.contentType)),
      attachment.content
    );
  }

  private patchRemoteUserTransportState(
    settings: AppSettings,
    remoteUserId: string,
    patch: {
      threadMessageId?: string | null;
      lastTransportMessageId?: string | null;
      lastSyncAt?: number;
      lastError?: string | null;
    }
  ): void {
    const remoteUsers = settings.remoteUsers ?? [];
    const index = remoteUsers.findIndex((remoteUser) => remoteUser.remoteUserId === remoteUserId);
    if (index < 0) {
      return;
    }

    const current = remoteUsers[index];
    if (current === undefined) {
      return;
    }

    remoteUsers[index] = {
      ...current,
      ...(patch.threadMessageId !== undefined ? { threadMessageId: patch.threadMessageId } : {}),
      ...(patch.lastTransportMessageId !== undefined
        ? { lastTransportMessageId: patch.lastTransportMessageId }
        : {}),
      ...(patch.lastSyncAt !== undefined ? { lastSyncAt: patch.lastSyncAt } : {}),
      lastError: patch.lastError ?? null,
    };
    settings.remoteUsers = sortRemoteUsers(remoteUsers);
  }

  private upsertRemoteUser(
    settings: AppSettings,
    candidate: RemoteUserIdentity
  ): RemoteUserIdentity {
    const remoteUsers = settings.remoteUsers ?? [];
    const index = remoteUsers.findIndex(
      (remoteUser) => remoteUser.remoteUserId === candidate.remoteUserId
    );
    const existingRemoteUser = index >= 0 ? (remoteUsers[index] ?? null) : null;

    const shouldApplyIncomingProfile =
      existingRemoteUser === null ||
      candidate.profileRevision >= existingRemoteUser.profileRevision ||
      candidate.handshakeState === "active";
    const nextHandshakeState =
      existingRemoteUser?.handshakeState === "active" && candidate.handshakeState !== "active"
        ? "active"
        : candidate.handshakeState;
    const resolvedLastSyncAt = candidate.lastSyncAt ?? existingRemoteUser?.lastSyncAt;
    const fallbackRemoteUser = existingRemoteUser ?? candidate;
    const resolvedNickname =
      shouldApplyIncomingProfile === true
        ? (candidate.nickname ?? candidate.email)
        : (fallbackRemoteUser.nickname ?? candidate.nickname ?? candidate.email);
    const resolvedAvatar =
      shouldApplyIncomingProfile === true
        ? (candidate.avatar ?? "")
        : (fallbackRemoteUser.avatar ?? candidate.avatar ?? "");
    const resolvedProfileRevision =
      shouldApplyIncomingProfile === true
        ? candidate.profileRevision
        : fallbackRemoteUser.profileRevision;

    const nextRemoteUser: RemoteUserIdentity = {
      remoteUserId: candidate.remoteUserId,
      email: candidate.email,
      nickname: resolvedNickname,
      avatar: resolvedAvatar,
      avatarPath:
        normalizeOptionalText(candidate.avatarPath) ??
        normalizeOptionalText(existingRemoteUser?.avatarPath) ??
        "",
      handshakeState: nextHandshakeState,
      profileRevision: resolvedProfileRevision,
      linkedMailAccountId: candidate.linkedMailAccountId,
      linkedAccountId: candidate.linkedAccountId ?? candidate.linkedMailAccountId,
      inviteMessageId: candidate.inviteMessageId ?? existingRemoteUser?.inviteMessageId ?? null,
      acceptMessageId: candidate.acceptMessageId ?? existingRemoteUser?.acceptMessageId ?? null,
      threadMessageId: candidate.threadMessageId ?? existingRemoteUser?.threadMessageId ?? null,
      lastTransportMessageId:
        candidate.lastTransportMessageId ?? existingRemoteUser?.lastTransportMessageId ?? null,
      lastError: candidate.lastError ?? null,
      sessionAlias: candidate.sessionAlias ?? existingRemoteUser?.sessionAlias ?? null,
      relayCapability: candidate.relayCapability ?? existingRemoteUser?.relayCapability ?? null,
      ...(resolvedLastSyncAt !== undefined ? { lastSyncAt: resolvedLastSyncAt } : {}),
    };

    if (index >= 0) {
      remoteUsers[index] = nextRemoteUser;
    } else {
      remoteUsers.push(nextRemoteUser);
    }

    settings.remoteUsers = sortRemoteUsers(remoteUsers);
    return nextRemoteUser;
  }

  private applyFetchedHandshakeMessages(
    settings: AppSettings,
    account: MailTransportAccountConfig,
    fetchResult: FetchInboxResult
  ): void {
    for (const message of fetchResult.messages) {
      if (message.duplicate) {
        continue;
      }

      const protocolHeader = parseHeaderValue(message.parsed.headerLines, "X-Hayalet-Ev-Protocol");
      if (protocolHeader !== HANDSHAKE_PROTOCOL) {
        continue;
      }

      const envelope = extractHandshakeEnvelope(message.parsed.text);
      if (envelope === null) {
        continue;
      }

      const existingRemoteUser = this.findRemoteUser(settings, envelope.profile.remoteUserId);
      const handshakeState =
        envelope.messageType === "accept"
          ? "active"
          : envelope.messageType === "reject"
            ? existingRemoteUser?.handshakeState === "active"
              ? "active"
              : "rejected"
            : existingRemoteUser?.handshakeState === "active"
              ? "active"
              : envelope.messageType === "invite"
                ? "handshake_pending"
                : (existingRemoteUser?.handshakeState ?? "handshake_pending");

      this.upsertRemoteUser(settings, {
        remoteUserId: envelope.profile.remoteUserId,
        email: envelope.profile.email,
        nickname: envelope.profile.nickname,
        avatar:
          envelope.messageType === "reject"
            ? (existingRemoteUser?.avatar ?? "")
            : this.resolveHandshakeAvatar(envelope.profile, message.parsed.attachments),
        avatarPath: existingRemoteUser?.avatarPath ?? "",
        handshakeState,
        profileRevision: envelope.profile.profileRevision,
        linkedMailAccountId: existingRemoteUser?.linkedMailAccountId ?? account.id,
        inviteMessageId:
          envelope.messageType === "invite"
            ? message.transportMessageId
            : (existingRemoteUser?.inviteMessageId ?? null),
        acceptMessageId:
          envelope.messageType === "accept"
            ? message.transportMessageId
            : (existingRemoteUser?.acceptMessageId ?? null),
        threadMessageId: existingRemoteUser?.threadMessageId ?? message.transportMessageId ?? null,
        lastTransportMessageId: message.transportMessageId,
        lastSyncAt: this.now(),
        lastError: null,
        relayCapability:
          envelope.profile.relayCapability ?? existingRemoteUser?.relayCapability ?? null,
      });
    }
  }

  private resolveRemoteUserId(
    messageEnvelope: ConversationEnvelope | null,
    message: FetchInboxResult["messages"][number],
    activeRemoteUserId: string
  ): string {
    const candidates = [
      normalizeEmail(messageEnvelope?.profile.email),
      normalizeEmail(messageEnvelope?.profile.remoteUserId),
      normalizeEmail(message.remoteUserId),
      normalizeEmail(message.parsed.from.find((entry) => entry.address !== null)?.address),
    ];
    const resolved = candidates.find((value) => value !== "");
    return resolved ?? activeRemoteUserId;
  }

  private async prepareArchiveContext(
    remoteUser: Pick<RemoteUserIdentity, "remoteUserId" | "nickname" | "email">,
    localSessionId: string,
    title?: string | null
  ): Promise<ArchiveContext> {
    const archiveAccountId = buildRemoteEmailAccountId(remoteUser.remoteUserId);
    if (archiveAccountId === "") {
      throw new Error("US1 archive account id could not be resolved.");
    }

    const webUrl = buildUs1SyntheticSessionUri(remoteUser.remoteUserId, localSessionId);
    if (webUrl === "") {
      throw new Error("US1 synthetic session uri could not be resolved.");
    }

    const manager = await this.archiveFactory(archiveAccountId);
    const metadataResult = await manager.upsertConversationMetadata({
      webUrl,
      provider: "us1",
      ...(title !== undefined ? { title } : {}),
    });
    if (metadataResult.success !== true || metadataResult.data === undefined) {
      throw new Error(metadataResult.error ?? "US1 archive conversation metadata sync failed.");
    }

    return {
      manager,
      archiveAccountId,
      webUrl,
      conversationId: metadataResult.data.conversationId,
    };
  }

  private async appendArchiveMessage(
    archiveContext: ArchiveContext,
    message: {
      role: "user" | "assistant";
      author: string;
      text: string;
      brokerMessageId?: string | null;
      clientRequestId?: string | null;
      domId: string;
    }
  ): Promise<{ conversationId: string; messageId: string }> {
    const currentMessages = await archiveContext.manager.getMessages(archiveContext.conversationId);
    const nextIndex = Array.isArray(currentMessages.data) ? currentMessages.data.length : 0;
    const messageId = buildArchiveMessageId(archiveContext.conversationId, message.domId);
    const clientRequestId = normalizeOptionalText(message.clientRequestId);
    const brokerMessageId = normalizeOptionalText(message.brokerMessageId);

    const syncResult = await archiveContext.manager.syncMessages({
      accountId: archiveContext.archiveAccountId,
      ...(clientRequestId !== null ? { clientRequestId } : {}),
      provider: "us1",
      webUrl: archiveContext.webUrl,
      messages: [
        {
          role: message.role,
          text: message.text,
          author: message.author,
          ...(brokerMessageId !== null ? { brokerMessageId } : {}),
          index: nextIndex,
          domIndex: nextIndex,
          domId: message.domId,
          providerMessageId: message.domId,
        },
      ],
    });

    if (syncResult.success !== true) {
      throw new Error(syncResult.error ?? "US1 archive message projection failed.");
    }

    return {
      conversationId: syncResult.conversationId ?? archiveContext.conversationId,
      messageId,
    };
  }

  private async saveOutboundAttachments(
    manager: ArchiveManagerLike,
    conversationId: string,
    messageId: string,
    attachments: NonNullable<Us1SendMessageParams["attachments"]>
  ): Promise<AttachmentArchiveRef[]> {
    const attachmentRefs: AttachmentArchiveRef[] = [];

    for (const attachment of attachments) {
      const filePath = normalizeOptionalText(attachment.path);
      if (filePath === null) {
        continue;
      }

      const originalName = normalizeOptionalText(attachment.name) ?? basename(filePath);
      // eslint-disable-next-line no-await-in-loop -- NOTE: attachment save order is sequential.
      const saveResult = await manager.saveAttachment(
        conversationId,
        messageId,
        filePath,
        originalName,
        normalizeOptionalText(attachment.mimeType) ?? undefined
      );
      if (saveResult.success !== true || saveResult.data === undefined) {
        continue;
      }

      attachmentRefs.push({
        attachmentId: saveResult.data.attachmentId,
        originalName,
        storedPath: saveResult.data.storedPath,
        mimeType: normalizeOptionalText(attachment.mimeType),
      });
    }

    return attachmentRefs;
  }

  private async saveInboundAttachments(
    manager: ArchiveManagerLike,
    conversationId: string,
    messageId: string,
    remoteUserId: string,
    localSessionId: string,
    attachments: MailTransportParsedAttachment[]
  ): Promise<{
    attachmentRefs: AttachmentArchiveRef[];
    roomPackages: Us1RoomPackageCandidate[];
    missingAttachmentCount: number;
  }> {
    const attachmentRefs: AttachmentArchiveRef[] = [];
    const roomPackages: Us1RoomPackageCandidate[] = [];
    let missingAttachmentCount = 0;

    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index];
      if (attachment === undefined) {
        continue;
      }
      const originalName =
        normalizeOptionalText(attachment.filename) ??
        `attachment-${String(index + 1).padStart(2, "0")}`;
      if (!Buffer.isBuffer(attachment.content)) {
        missingAttachmentCount += 1;
        continue;
      }

      // eslint-disable-next-line no-await-in-loop -- NOTE: attachment content is persisted sequentially.
      const saveResult = await manager.saveAttachmentContent(
        conversationId,
        messageId,
        attachment.content,
        originalName,
        normalizeOptionalText(attachment.contentType) ?? undefined
      );
      if (saveResult.success !== true || saveResult.data === undefined) {
        continue;
      }

      const attachmentRef: AttachmentArchiveRef = {
        attachmentId: saveResult.data.attachmentId,
        originalName,
        storedPath: saveResult.data.storedPath,
        mimeType: normalizeOptionalText(attachment.contentType),
        size: attachment.size,
      };
      attachmentRefs.push(attachmentRef);

      if (this.isRoomPackageAttachment(originalName, attachment.content)) {
        roomPackages.push({
          remoteUserId,
          localSessionId,
          conversationId,
          messageId,
          attachmentId: saveResult.data.attachmentId,
          originalName,
          storedPath: saveResult.data.storedPath,
          mimeType: normalizeOptionalText(attachment.contentType),
          size: attachment.size,
        });
      }
    }

    return { attachmentRefs, roomPackages, missingAttachmentCount };
  }

  private isRoomPackageAttachment(filename: string, content: Buffer): boolean {
    const normalizedFilename = filename.trim().toLowerCase();
    if (normalizedFilename.endsWith(ROOM_BUNDLE_SUFFIX)) {
      return true;
    }

    if (!normalizedFilename.endsWith(".json")) {
      return false;
    }

    try {
      const parsed: unknown = JSON.parse(content.toString("utf-8"));
      if (parsed === null || typeof parsed !== "object") {
        return false;
      }
      const record = parsed as { manifest?: { id?: unknown }; files?: unknown };
      const manifestId = record.manifest?.id;
      if (typeof manifestId !== "string" || manifestId.trim() === "") {
        return false;
      }
      return record.files !== null && typeof record.files === "object";
    } catch {
      return false;
    }
  }
}

export const us1ConversationService = new Us1ConversationService();
