import {
  buildRemoteEmailAccountId,
  extractUs1RemoteIdentityIdFromAccountId,
  isRemoteEmailAccountId,
  isUs1ProjectedAccountId,
  type ArchiveProviderKey,
} from "@shared/archive.js";
import {
  getRemoteEmailAccounts,
  getUs1SelectedIdentityId,
  isAiProviderAccount,
} from "@shared/settings.js";
import type { Account, AppSettings, RemoteUserIdentity } from "@shared/settings.js";
import type { SlotStateInfo } from "../../types/assistant.js";
import { AppI18n } from "./i18n/index.js";
import { SettingsManager } from "./settings-manager.js";
import { SlotController, SlotEvent } from "./slot-controller.js";

export const SLOT_PRESENCE_SLOT_IDS = ["ai1", "ai2", "us1"] as const;

export type SlotPresenceSlotId = (typeof SLOT_PRESENCE_SLOT_IDS)[number];
export type SlotPresenceParticipantId = "user" | "ai0" | SlotPresenceSlotId;
type AiPresenceSlotId = "ai0" | "ai1" | "ai2";

export interface SlotPresenceUserSnapshot {
  participantId: "user";
  label: "USER";
  nickname: string;
  avatar: string | null;
}

export interface SlotPresenceEntitySnapshot {
  participantId: Exclude<SlotPresenceParticipantId, "user">;
  slotId: Exclude<SlotPresenceParticipantId, "user">;
  label: string;
  nickname: string;
  avatar: string | null;
  assigned: boolean;
  connected: boolean;
  ready: boolean;
  state: string;
  urlExcluded: boolean;
  providerId: string | null;
  accountId: string | null;
  remoteUserId: string | null;
}

export interface SlotPresenceSnapshot {
  schemaVersion: 1;
  updatedAt: number;
  user: SlotPresenceUserSnapshot;
  assistant: SlotPresenceEntitySnapshot & {
    participantId: "ai0";
    slotId: "ai0";
  };
  slots: Record<
    SlotPresenceSlotId,
    SlotPresenceEntitySnapshot & {
      participantId: SlotPresenceSlotId;
      slotId: SlotPresenceSlotId;
    }
  >;
}

interface SlotPresenceRuntimeState {
  snapshot: SlotPresenceSnapshot;
  aiAccounts: Record<AiPresenceSlotId, Account | null>;
  us1Identity: RemoteUserIdentity | null;
}

type SlotPresenceListener = (snapshot: SlotPresenceSnapshot) => void;

function cloneValue<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized !== "" ? normalized : null;
}

function readAvatar(value: unknown): string | null {
  return readTrimmedString(value);
}

function getDefaultUserNickname(): string {
  return AppI18n.t("entrance.user.defaultNickname");
}

function isLegacyDefaultNickname(value: string): boolean {
  const normalized = value
    .trim()
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\u0131/g, "i");

  return normalized === "user" || normalized === "user";
}

function getSettingsSnapshot(): AppSettings | null {
  return SettingsManager.getSnapshot();
}

function getAiAccountFromSettings(
  settings: AppSettings | null,
  slotId: "ai0" | "ai1" | "ai2"
): Account | null {
  if (settings === null) {
    return null;
  }

  if (slotId === "ai0") {
    const accountId = readTrimmedString(settings.assistantSlot?.accountId);
    if (accountId === null || Array.isArray(settings.assistantAccounts) === false) {
      return null;
    }

    return settings.assistantAccounts.find((account) => account.id === accountId) ?? null;
  }

  const accountId = readTrimmedString(settings.slots[slotId].accountId);
  if (accountId === null) {
    return null;
  }

  const account = settings.accounts.find((candidate) => candidate.id === accountId) ?? null;
  return isAiProviderAccount(account) ? account : null;
}

function getRemoteUsers(settings: AppSettings | null): RemoteUserIdentity[] {
  if (settings === null || Array.isArray(settings.remoteUsers) === false) {
    return [];
  }

  return settings.remoteUsers;
}

function getUs1RemoteAccount(settings: AppSettings | null): Account | null {
  if (settings === null) {
    return null;
  }

  const remoteAccounts = getRemoteEmailAccounts(settings.accounts);
  const selectedAccountId = readTrimmedString(settings.us1Slot?.selectedAccountId);
  if (selectedAccountId !== null) {
    const selectedAccount =
      remoteAccounts.find((account) => account.id === selectedAccountId) ?? null;
    if (selectedAccount?.remoteEmail?.handshakeState === "active") {
      return selectedAccount;
    }
  }

  const selectedRemoteUserId = getUs1SelectedIdentityId(settings.us1Slot) ?? "";
  if (selectedRemoteUserId === "") {
    return null;
  }

  return (
    remoteAccounts.find(
      (account) =>
        account.remoteEmail?.remoteUserId === selectedRemoteUserId &&
        account.remoteEmail.handshakeState === "active"
    ) ?? null
  );
}

function getUs1IdentityFromSettings(settings: AppSettings | null): RemoteUserIdentity | null {
  const remoteAccount = getUs1RemoteAccount(settings);
  const remoteState = remoteAccount?.remoteEmail ?? null;
  if (remoteAccount !== null && remoteState !== null) {
    return {
      remoteUserId: remoteState.remoteUserId,
      email: remoteAccount.email,
      ...(remoteAccount.nickname !== undefined ? { nickname: remoteAccount.nickname } : {}),
      ...(remoteAccount.avatar !== undefined ? { avatar: remoteAccount.avatar } : {}),
      ...(remoteAccount.avatarPath !== undefined ? { avatarPath: remoteAccount.avatarPath } : {}),
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

  const selectedRemoteUserId =
    getUs1SelectedIdentityId(settings?.us1Slot) ??
    (typeof settings?.us1Slot?.selectedAccountId === "string"
      ? extractUs1RemoteIdentityIdFromAccountId(settings.us1Slot.selectedAccountId)
      : null);
  if (selectedRemoteUserId === null || selectedRemoteUserId === "") {
    return null;
  }

  return (
    getRemoteUsers(settings).find(
      (identity) =>
        identity.remoteUserId === selectedRemoteUserId && identity.handshakeState === "active"
    ) ?? null
  );
}

function getUs1ArchiveAccountIdFromSettings(settings: AppSettings | null): string | null {
  const remoteAccount = getUs1RemoteAccount(settings);
  if (typeof remoteAccount?.id === "string" && remoteAccount.id !== "") {
    return remoteAccount.id;
  }

  const identity = getUs1IdentityFromSettings(settings);
  if (identity?.remoteUserId === undefined || identity.remoteUserId === "") {
    return null;
  }

  const selectedAccountId = settings?.us1Slot?.selectedAccountId;
  const derivedAccountId = buildRemoteEmailAccountId(identity.remoteUserId);
  const accountId =
    (typeof selectedAccountId === "string" && selectedAccountId.trim() !== ""
      ? selectedAccountId.trim()
      : null) ?? derivedAccountId;
  return accountId !== "" ? accountId : null;
}

function getSlotState(slotId: "ai0" | "ai1" | "ai2"): SlotStateInfo | null {
  return SlotController.getState(slotId) as SlotStateInfo | null;
}

function buildUserSnapshot(settings: AppSettings | null): SlotPresenceUserSnapshot {
  const nickname = readTrimmedString(settings?.user?.nickname);
  return {
    participantId: "user",
    label: "USER",
    nickname:
      nickname === null || isLegacyDefaultNickname(nickname) ? getDefaultUserNickname() : nickname,
    avatar: readAvatar(settings?.user?.avatarPath),
  };
}

function buildAiEntitySnapshot(
  slotId: AiPresenceSlotId,
  account: Account | null
): SlotPresenceEntitySnapshot {
  const slotState = getSlotState(slotId);
  const assigned = account !== null;
  const connected = slotState?.state === "connected";
  const urlExcluded = slotState === null ? false : slotState.urlExcluded === true;

  return {
    participantId: slotId,
    slotId,
    label: slotId.toUpperCase(),
    nickname: String(account?.nickname ?? account?.email ?? slotId.toUpperCase()),
    avatar: readAvatar(account?.avatarPath) ?? readAvatar(account?.avatar),
    assigned,
    connected,
    ready: assigned && connected && urlExcluded !== true,
    state:
      readTrimmedString(slotState?.state) ??
      (assigned ? (connected ? "connected" : "assigned") : "empty"),
    urlExcluded,
    providerId: account?.provider ?? null,
    accountId: account?.id ?? null,
    remoteUserId: null,
  };
}

function buildUs1EntitySnapshot(
  settings: AppSettings | null,
  identity: RemoteUserIdentity | null
): SlotPresenceSnapshot["slots"]["us1"] {
  const connected = settings?.us1Slot?.connectionState === "connected" && identity !== null;
  const assigned = identity !== null;

  return {
    participantId: "us1",
    slotId: "us1",
    label: "US1",
    nickname: String(identity?.nickname ?? identity?.email ?? "US1"),
    avatar: readAvatar(identity?.avatarPath) ?? readAvatar(identity?.avatar),
    assigned,
    connected,
    ready: assigned && connected,
    state: connected ? "connected" : assigned ? "assigned" : "empty",
    urlExcluded: false,
    providerId: "us1",
    accountId: getUs1ArchiveAccountIdFromSettings(settings),
    remoteUserId: identity?.remoteUserId ?? null,
  };
}

function buildRuntimeState(): SlotPresenceRuntimeState {
  const settings = getSettingsSnapshot();
  const aiAccounts: Record<AiPresenceSlotId, Account | null> = {
    ai0: getAiAccountFromSettings(settings, "ai0"),
    ai1: getAiAccountFromSettings(settings, "ai1"),
    ai2: getAiAccountFromSettings(settings, "ai2"),
  };
  const us1Identity = getUs1IdentityFromSettings(settings);
  const snapshot: SlotPresenceSnapshot = {
    schemaVersion: 1,
    updatedAt: Date.now(),
    user: buildUserSnapshot(settings),
    assistant: {
      ...buildAiEntitySnapshot("ai0", aiAccounts.ai0),
      participantId: "ai0",
      slotId: "ai0",
    },
    slots: {
      ai1: {
        ...buildAiEntitySnapshot("ai1", aiAccounts.ai1),
        participantId: "ai1",
        slotId: "ai1",
      },
      ai2: {
        ...buildAiEntitySnapshot("ai2", aiAccounts.ai2),
        participantId: "ai2",
        slotId: "ai2",
      },
      us1: buildUs1EntitySnapshot(settings, us1Identity),
    },
  };

  return {
    snapshot,
    aiAccounts,
    us1Identity,
  };
}

function getSignature(snapshot: SlotPresenceSnapshot): string {
  return JSON.stringify({
    user: snapshot.user,
    assistant: snapshot.assistant,
    slots: snapshot.slots,
  });
}

class SlotPresenceStoreClass {
  private snapshot: SlotPresenceSnapshot;
  private aiAccounts: Record<AiPresenceSlotId, Account | null>;
  private us1Identity: RemoteUserIdentity | null;
  private signature: string;
  private readonly listeners = new Set<SlotPresenceListener>();

  constructor() {
    const runtimeState = buildRuntimeState();
    this.snapshot = runtimeState.snapshot;
    this.aiAccounts = runtimeState.aiAccounts;
    this.us1Identity = runtimeState.us1Identity;
    this.signature = getSignature(this.snapshot);

    SettingsManager.subscribe(() => {
      this.refresh();
    });

    AppI18n.subscribe(() => {
      this.refresh();
    });

    [
      SlotEvent.STATE_CHANGED,
      SlotEvent.ACCOUNT_ASSIGNED,
      SlotEvent.ACCOUNT_REMOVED,
      SlotEvent.URL_EXCLUDED,
      SlotEvent.URL_INCLUDED,
      SlotEvent.CONNECT_COMPLETE,
      SlotEvent.CONNECT_FAILED,
      SlotEvent.DISCONNECT_COMPLETE,
    ].forEach((eventName) => {
      SlotController.on(eventName, () => {
        this.refresh();
      });
    });
  }

  private refresh(): void {
    const runtimeState = buildRuntimeState();
    const nextSignature = getSignature(runtimeState.snapshot);
    if (nextSignature === this.signature) {
      return;
    }

    this.snapshot = runtimeState.snapshot;
    this.aiAccounts = runtimeState.aiAccounts;
    this.us1Identity = runtimeState.us1Identity;
    this.signature = nextSignature;

    const clonedSnapshot = this.getSnapshot();
    this.listeners.forEach((listener) => {
      listener(clonedSnapshot);
    });
  }

  getSnapshot(): SlotPresenceSnapshot {
    return cloneValue(this.snapshot);
  }

  getUser(): SlotPresenceUserSnapshot {
    return cloneValue(this.snapshot.user);
  }

  getAssistant(): SlotPresenceSnapshot["assistant"] {
    return cloneValue(this.snapshot.assistant);
  }

  getSlot(slotId: SlotPresenceSlotId): SlotPresenceSnapshot["slots"][SlotPresenceSlotId] {
    return cloneValue(this.snapshot.slots[slotId]);
  }

  getParticipant(
    participantId: SlotPresenceParticipantId
  ): SlotPresenceUserSnapshot | SlotPresenceEntitySnapshot {
    if (participantId === "user") {
      return this.getUser();
    }

    if (participantId === "ai0") {
      return this.getAssistant();
    }

    return this.getSlot(participantId);
  }

  getEntity(participantId: Exclude<SlotPresenceParticipantId, "user">): SlotPresenceEntitySnapshot {
    if (participantId === "ai0") {
      return this.getAssistant();
    }

    return this.getSlot(participantId);
  }

  getNickname(participantId: SlotPresenceParticipantId): string {
    return this.getParticipant(participantId).nickname;
  }

  getAvatar(participantId: SlotPresenceParticipantId): string {
    if (participantId === "user") {
      return this.snapshot.user.avatar ?? "";
    }

    return this.getParticipant(participantId).avatar ?? "";
  }

  getAccountForSlot(slotId: string): Account | null {
    if (slotId !== "ai0" && slotId !== "ai1" && slotId !== "ai2") {
      return null;
    }

    return cloneValue(this.aiAccounts[slotId]);
  }

  getUs1Identity(): RemoteUserIdentity | null {
    return cloneValue(this.us1Identity);
  }

  hasUs1Identity(): boolean {
    return this.snapshot.slots.us1.assigned;
  }

  isUs1Connected(): boolean {
    return this.snapshot.slots.us1.connected;
  }

  getUs1ArchiveAccountId(): string | null {
    return this.snapshot.slots.us1.accountId;
  }

  getProviderIdForSlot(slotId: string): string | null {
    if (slotId === "us1") {
      return this.snapshot.slots.us1.providerId;
    }

    if (slotId === "ai0") {
      return this.snapshot.assistant.providerId;
    }

    if (slotId === "ai1" || slotId === "ai2") {
      return this.snapshot.slots[slotId].providerId;
    }

    return null;
  }

  getAssignedSlotForAccount(accountId: string): AiPresenceSlotId | null {
    const normalizedAccountId = accountId.trim();
    if (normalizedAccountId === "") {
      return null;
    }

    if (this.snapshot.assistant.accountId === normalizedAccountId) {
      return "ai0";
    }

    if (this.snapshot.slots.ai1.accountId === normalizedAccountId) {
      return "ai1";
    }

    if (this.snapshot.slots.ai2.accountId === normalizedAccountId) {
      return "ai2";
    }

    return null;
  }

  isAssigned(participantId: Exclude<SlotPresenceParticipantId, "user">): boolean {
    return this.getEntity(participantId).assigned === true;
  }

  isConnected(participantId: Exclude<SlotPresenceParticipantId, "user">): boolean {
    return this.getEntity(participantId).connected === true;
  }

  getState(participantId: Exclude<SlotPresenceParticipantId, "user">): string {
    return this.getEntity(participantId).state;
  }

  resolveArchiveProviderByAccountId(accountId: string): ArchiveProviderKey | null {
    const normalizedAccountId = accountId.trim();
    if (normalizedAccountId === "") {
      return null;
    }

    if (this.snapshot.slots.ai1.accountId === normalizedAccountId) {
      return "ai1";
    }

    if (this.snapshot.slots.ai2.accountId === normalizedAccountId) {
      return "ai2";
    }

    if (
      this.snapshot.slots.us1.accountId === normalizedAccountId ||
      isUs1ProjectedAccountId(normalizedAccountId) ||
      isRemoteEmailAccountId(normalizedAccountId)
    ) {
      return "us1";
    }

    return null;
  }

  subscribe(listener: SlotPresenceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

const slotPresenceStore = new SlotPresenceStoreClass();

export { slotPresenceStore, slotPresenceStore as SlotPresenceStore };
