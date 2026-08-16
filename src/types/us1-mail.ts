import type {
  LocalMailAccountSummary,
  MailTransportAuthConfig,
  MailTransportAuthType,
  MailTransportProviderType,
  MailTransportServerConfig,
  RemoteUserIdentity,
  Us1CommunicationSystem,
  Us1RelayConnectionState,
  Us1RelaySettings,
  Us1SlotSettings,
} from "./settings.js";

export interface Us1MailAccountDraft {
  mailAccountId?: string | null;
  providerType: MailTransportProviderType;
  email: string;
  enabled?: boolean;
  authType: MailTransportAuthType;
  imap?: Partial<MailTransportServerConfig>;
  smtp?: Partial<MailTransportServerConfig>;
  auth?: Partial<MailTransportAuthConfig>;
}

export interface Us1StateSnapshot {
  localMailAccounts: LocalMailAccountSummary[];
  remoteUsers: RemoteUserIdentity[];
  activeRemoteUsers: RemoteUserIdentity[];
  us1Slot: Us1SlotSettings;
  communicationSystem?: Us1CommunicationSystem;
  relaySettings?: Us1RelaySettings | null;
  relayConfigured?: boolean;
  relayConnectionState?: Us1RelayConnectionState;
  selectedMailAccountId: string | null;
  selectedIdentityId?: string | null;
  selectedRemoteAccountId?: string | null;
  verifiedLocalMailAccountId?: string | null;
  verifiedUserEmail?: string | null;
  canAddRemoteUser: boolean;
}

export interface Us1ListStateParams {
  selectedMailAccountId?: string | null;
}

export interface Us1ListStateResult {
  success: boolean;
  state?: Us1StateSnapshot;
  error?: string;
}

export interface Us1MailAccountMutationResult {
  success: boolean;
  localMailAccount?: LocalMailAccountSummary;
  state?: Us1StateSnapshot;
  error?: string;
}

export interface Us1DeleteMailAccountParams {
  mailAccountId: string;
}

export interface Us1DeleteMailAccountResult {
  success: boolean;
  state?: Us1StateSnapshot;
  error?: string;
}

export interface Us1InviteRemoteUserParams {
  mailAccountId: string;
  email: string;
  nickname?: string;
}

export interface Us1AcceptRemoteUserParams {
  remoteUserId: string;
}

export interface Us1RejectRemoteUserParams {
  remoteUserId: string;
}

export interface Us1SyncRemoteUsersParams {
  mailAccountId?: string;
  limit?: number;
}

export interface Us1RemoteUserMutationResult {
  success: boolean;
  remoteUser?: RemoteUserIdentity;
  remoteUsers?: RemoteUserIdentity[];
  state?: Us1StateSnapshot;
  fetchedCount?: number;
  processedCount?: number;
  duplicateCount?: number;
  error?: string;
}

export interface Us1MessageAttachmentInput {
  path: string;
  name?: string;
  mimeType?: string;
}

export interface Us1RoomPackageCandidate {
  remoteUserId: string;
  localSessionId: string;
  conversationId: string;
  messageId: string;
  attachmentId?: string;
  originalName: string;
  storedPath: string;
  mimeType?: string | null;
  size?: number;
}

export type Us1SessionMode = "new" | "reply";

export type Us1SessionOpenHint = "auto_if_idle" | "list_only";

export type Us1RoomInviteStarter = "user" | "opponent";

export type Us1RoomEventType = "invite" | "accept" | "reject" | "reset" | "start";

export interface Us1RoomEventInput {
  roomId: string;
  featureId: string;
  inviteId: string;
  matchId?: string | null;
  eventType: Us1RoomEventType;
  starter?: Us1RoomInviteStarter;
  note?: string | null;
}

export interface Us1RoomCommandInput {
  roomId: string;
  featureId: string;
  commandName: string;
  action?: "room.command";
  roomPayload?: unknown;
  matchId?: string | null;
  turnIndex?: number;
  turnToken?: string | null;
  boardHashBeforeMove?: string | null;
  rawArgs?: string | null;
}

export interface Us1RoomEventRecord extends Us1RoomEventInput {
  remoteUserId: string;
  localSessionId: string;
  conversationId: string;
  transportMessageId: string;
  sentAt?: number;
  senderNickname?: string | null;
  senderEmail?: string | null;
}

export interface Us1RoomCommandRecord extends Us1RoomCommandInput {
  remoteUserId: string;
  localSessionId: string;
  conversationId: string;
  transportMessageId: string;
  commandArgs?: unknown;
  sentAt?: number;
  senderNickname?: string | null;
  senderEmail?: string | null;
}

export interface Us1SessionEvent {
  remoteUserId: string;
  localSessionId: string;
  conversationId: string;
  sessionTitle?: string | null;
  mode?: Us1SessionMode;
  openHint?: Us1SessionOpenHint;
  createdAt?: number;
  sentAt?: number;
  isNewSession: boolean;
}

export interface Us1SendMessageParams {
  text?: string;
  clientRequestId?: string | null;
  brokerMessageId?: string | null;
  remoteUserId?: string | null;
  localSessionId?: string | null;
  attachments?: Us1MessageAttachmentInput[];
  roomEvent?: Us1RoomEventInput | null;
  roomCommand?: Us1RoomCommandInput | null;
}

export interface Us1SendMessageResult {
  success: boolean;
  brokerMessageId?: string;
  remoteUserId?: string;
  localSessionId?: string;
  conversationId?: string;
  transportMessageId?: string;
  archiveMessageId?: string;
  deliveryState?: string;
  attachmentCount?: number;
  error?: string;
}

export interface Us1SyncMessagesParams {
  limit?: number;
  localSessionId?: string | null;
  consumeRoomCommands?: boolean;
}

export interface Us1SyncMessagesResult {
  success: boolean;
  remoteUserId?: string;
  localSessionId?: string | null;
  conversationId?: string | null;
  fetchedCount?: number;
  processedCount?: number;
  duplicateCount?: number;
  projectedCount?: number;
  skippedCount?: number;
  unresolvedSessionCount?: number;
  roomPackages?: Us1RoomPackageCandidate[];
  sessionEvents?: Us1SessionEvent[];
  roomEvents?: Us1RoomEventRecord[];
  roomCommands?: Us1RoomCommandRecord[];
  roomInviteInbox?: Us1RoomEventRecord[];
  error?: string;
}
