import type { SlotId, ProviderId, AllProviderId, AssistantProviderId } from "./common.js";
import type { SlotBridgeSessionRef } from "./commands.js";
import type { AppLanguage } from "./i18n.js";
import type {
  TranscriptDictationBackend,
  TranscriptModelVariant,
  TranscriptSupportedLanguage,
} from "./transcript.js";
import type { TtsLanguage, TtsMode } from "./tts.js";
export type { AppLanguage } from "./i18n.js";

export const ASSISTANT_SLOT_SETTINGS_KEY = "assistantSlot";
export const ASSISTANT_ACCOUNTS_SETTINGS_KEY = "assistantAccounts";

function matchesSettingsPath(path: string, key: string): boolean {
  return path === key || path.startsWith(`${key}.`);
}

export function isAssistantSlotSettingsPath(path: string): boolean {
  return matchesSettingsPath(path, ASSISTANT_SLOT_SETTINGS_KEY);
}

export function isAssistantAccountsSettingsPath(path: string): boolean {
  return matchesSettingsPath(path, ASSISTANT_ACCOUNTS_SETTINGS_KEY);
}

export interface Account {
  id: string;
  provider: AllProviderId | "remote-email";
  accountKind?: AccountKind;
  email: string;
  dbPath?: string | null;
  name?: string;
  nickname?: string;
  avatar?: string;
  avatarPath?: string;
  createdAt?: number;
  lastUsedAt?: number;
  lastSessionUrl?: string | null;
  remoteEmail?: RemoteEmailAccountState;
}

export type AccountKind = "ai-provider" | "remote-email";

export interface SlotAssignment {
  slot: SlotId;
  accountId: string | null;
}

export interface ProjectAiSessionBinding {
  projectId: string;
  roomId?: string | null;
  slot: SlotId;
  accountId: string;
  providerId?: string | null;
  sessionRef?: SlotBridgeSessionRef | null;
  webUrl?: string | null;
  createdAt?: number;
  updatedAt?: number;
}

export interface SlotSettings {
  accountId: string | null;
  provider?: ProviderId | null;
  url?: string;
  path?: string;
  messageMethod?: MessageMethod;
  fileMethod?: UploadMethod;
  catchCommands?: boolean;
  disabledCommands?: string[];
  resumeLastSession?: boolean;
  rememberConnectionStatus?: boolean;
  lastConnectionState?: "connected" | "disconnected" | null;
}

export type RemoteUserHandshakeState =
  "invite_sent" | "handshake_pending" | "active" | "rejected" | "error";

export type Us1SlotConnectionState = "disconnected" | "connected";
export type Us1CommunicationSystem = "mail" | "relay-e2ee";
export type Us1RelayConnectionState = "disconnected" | "connecting" | "connected" | "error";
export type Us1RelayTrustState = "unknown" | "trusted" | "mismatch";

export interface Us1RelayPeerCapability {
  supported: boolean;
  endpoint?: string | null;
  encryptionPublicKey?: string | null;
  encryptionKeyFingerprint?: string | null;
  signingPublicKey?: string | null;
  signingKeyFingerprint?: string | null;
  protocolVersion?: number | null;
  advertisedAt?: number | null;
  trustState?: Us1RelayTrustState;
  lastError?: string | null;
}

export interface RemoteUserIdentity {
  remoteUserId: string;
  email: string;
  nickname?: string;
  avatar?: string;
  avatarPath?: string;
  handshakeState: RemoteUserHandshakeState;
  profileRevision: number;
  linkedMailAccountId: string;
  linkedAccountId?: string | null;
  inviteMessageId?: string | null;
  acceptMessageId?: string | null;
  threadMessageId?: string | null;
  lastTransportMessageId?: string | null;
  lastSyncAt?: number;
  lastError?: string | null;
  sessionAlias?: string | null;
  relayCapability?: Us1RelayPeerCapability | null;
}

export interface RemoteEmailAccountState {
  remoteUserId: string;
  handshakeState: RemoteUserHandshakeState;
  linkedLocalMailAccountId: string;
  profileRevision: number;
  inviteMessageId?: string | null;
  acceptMessageId?: string | null;
  threadMessageId?: string | null;
  lastTransportMessageId?: string | null;
  lastSyncAt?: number;
  lastError?: string | null;
  sessionAlias?: string | null;
  pendingIncoming?: boolean;
}

export interface Us1SlotSettings {
  communicationSystem?: Us1CommunicationSystem;
  selectedIdentityId?: string | null;
  selectedRemoteUserId: string | null;
  selectedAccountId?: string | null;
  connectionState?: Us1SlotConnectionState;
  relayConnectionState?: Us1RelayConnectionState;
  catchCommands?: boolean;
  disabledCommands?: string[];
  resumeLastSession?: boolean;
  rememberConnectionStatus?: boolean;
  lastConnectionState?: Us1SlotConnectionState | null;
}

export type UploadMethod = "catbox" | "uguu" | "tmpfile" | "googledrive" | "dragdrop" | "injection";

export type MessageMethod = "injection" | "xdotools";

export const THEME_IDS = ["obsidian", "ivory-lab", "ember-console"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.includes(value as ThemeId);
}

export type ThemeAppearanceMode = "manual" | "system" | "schedule";
export type ThemeAppearanceMotion = "full" | "reduced" | "off";
export type ThemeAppearanceTextScale = "sm" | "md" | "lg";
export type ThemeAppearanceSurface = "glass" | "soft" | "solid";
export type ThemeAppearanceContrast = "normal" | "high";
export const UI_SCALE_OPTIONS = [85, 90, 95, 100, 105, 110] as const;
export type UiScalePercent = (typeof UI_SCALE_OPTIONS)[number];
export const DEFAULT_SCENE_THEME_ID = "castle";

export function isUiScalePercent(value: unknown): value is UiScalePercent {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return Number.isFinite(numeric) && UI_SCALE_OPTIONS.includes(numeric as UiScalePercent);
}

export function normalizeUiScalePercent(
  value: unknown,
  fallback: UiScalePercent = 100
): UiScalePercent {
  if (!isUiScalePercent(value)) {
    return fallback;
  }

  return (typeof value === "number" ? value : Number.parseInt(value, 10)) as UiScalePercent;
}

export interface ThemeAppearanceSettings {
  mode?: ThemeAppearanceMode;
  manualTheme?: ThemeId;
  lightTheme?: ThemeId;
  darkTheme?: ThemeId;
  dayStart?: string;
  nightStart?: string;
  motion?: ThemeAppearanceMotion;
  textScale?: ThemeAppearanceTextScale;
  uiScale?: UiScalePercent;
  surface?: ThemeAppearanceSurface;
  contrast?: ThemeAppearanceContrast;
}

export const DEFAULT_THEME_APPEARANCE_SETTINGS: Readonly<Required<ThemeAppearanceSettings>> = {
  mode: "manual",
  manualTheme: "obsidian",
  lightTheme: "ivory-lab",
  darkTheme: "obsidian",
  dayStart: "07:00",
  nightStart: "19:00",
  motion: "full",
  textScale: "md",
  uiScale: 100,
  surface: "glass",
  contrast: "normal",
};

export interface SceneAppearanceSettings {
  activeThemeId?: string;
  uiScale?: UiScalePercent;
}

export const DEFAULT_SCENE_APPEARANCE_SETTINGS: Readonly<Required<SceneAppearanceSettings>> = {
  activeThemeId: DEFAULT_SCENE_THEME_ID,
  uiScale: 90,
};

export interface SceneSettings {
  appearance?: SceneAppearanceSettings;
}

export interface GeneralSettings {
  appearance?: ThemeAppearanceSettings;
  language?: AppLanguage;
  transcriptBackend?: TranscriptDictationBackend;
  transcriptModelVariant?: TranscriptModelVariant;
  startMinimized?: boolean;
  closeToTray?: boolean;
  autoUpdate?: boolean;
}

export type CaptureDefaultLens = "back" | "front";
export type CapturePhotoQuality = "balanced" | "high";
export type CapturePhotoFlashMode = "off" | "auto" | "on";
export type CaptureAttachMode = "manual-sync" | "auto-stage";
export type CaptureCommandConfirmation = "none" | "toast";
export type AndroidDictationBackend = "whisper.cpp" | "vosk";
export type AnalyzeDictationMode = "local" | "android";

export interface CaptureDefaultsSettings {
  preferredDeviceId?: string | null;
  defaultLens?: CaptureDefaultLens;
  photoQuality?: CapturePhotoQuality;
  photoFlashMode?: CapturePhotoFlashMode;
  attachMode?: CaptureAttachMode;
  commandConfirmation?: CaptureCommandConfirmation;
  dictationMode?: AnalyzeDictationMode;
  dictationLanguage?: TranscriptSupportedLanguage;
  androidTranscriptModelVariant?: TranscriptModelVariant;
  androidDictationBackend?: AndroidDictationBackend;
  ttsMode?: TtsMode;
  ttsLanguage?: TtsLanguage;
}

export interface CaptureProviderSettings {
  androidCompanionEnabled?: boolean;
  androidTorchEnabled?: boolean;
}

export interface CaptureCommandPhraseSettings {
  openCamera?: string[];
  capture?: string[];
  stop?: string[];
}

export interface VoiceCommandAmbientSettings {
  wakePhrases?: string[];
  activeWindowMs?: number;
  silenceTimeoutMs?: number;
}

export interface CaptureSettings {
  defaults?: CaptureDefaultsSettings;
  providers?: CaptureProviderSettings;
}

export interface VoiceCommandSettings {
  analyzeEnabled?: boolean;
  commandPhrases?: CaptureCommandPhraseSettings;
  analyzePhrases?: CaptureCommandPhraseSettings;
  ambient?: VoiceCommandAmbientSettings;
}

export interface UploadSettings {
  preferredMethod: UploadMethod;
  fallbackMethod?: UploadMethod;
  maxFileSize?: number;
  allowedTypes?: string[];
}

export interface GoogleDriveSettings {
  connected: boolean;
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  clientId?: string;
  clientSecret?: string;
  authorizationCode?: string;
  account?: string;
  tokens?: unknown;
}

export type MailTransportProviderType = "gmail" | "custom-imap-smtp";

export type MailTransportAuthType = "password" | "oauth2";

export type LocalMailAccountConnectionState = "disconnected" | "connected" | "error";

export interface MailTransportServerConfig {
  host: string;
  port: number;
  secure: boolean;
}

export interface MailTransportAuthConfig {
  user: string;
  password?: string;
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  expiresAt?: number;
  loginMethod?: string;
}

export interface MailTransportAccountBinding {
  remoteUserId?: string | null;
  defaultLocalSessionId?: string | null;
}

export interface MailTransportAccountConfig {
  id: string;
  providerType: MailTransportProviderType;
  email: string;
  enabled?: boolean;
  connectionState?: LocalMailAccountConnectionState;
  lastConnectionError?: string | null;
  authType: MailTransportAuthType;
  imap: MailTransportServerConfig;
  smtp: MailTransportServerConfig;
  auth: MailTransportAuthConfig;
  defaultMailbox?: string;
  fetchBatchSize?: number;
  binding?: MailTransportAccountBinding;
}

export interface LocalMailAccountSummary {
  mailAccountId: string;
  providerType: MailTransportProviderType;
  email: string;
  authType: MailTransportAuthType;
  authConfigRef: string;
  configRef: string;
  connectionState: LocalMailAccountConnectionState;
  enabled: boolean;
  lastConnectionError?: string | null;
}

export interface MailTransportSettings {
  accounts: MailTransportAccountConfig[];
  localAccount?: MailTransportAccountConfig | null;
  retryBaseMs?: number;
  maxRetries?: number;
}

export interface Us1RelaySettings {
  enabled?: boolean;
  baseUrl?: string | null;
  trustedServerFingerprint?: string | null;
  trustState?: Us1RelayTrustState;
  encryptionPublicKey?: string | null;
  encryptionKeyFingerprint?: string | null;
  signingPublicKey?: string | null;
  signingKeyFingerprint?: string | null;
  protocolVersion?: number;
  connectionState?: Us1RelayConnectionState;
  lastError?: string | null;
  lastConnectedAt?: number | null;
}

export interface OpencodeUiModelPreferences {
  hiddenProviders?: string[];
  hiddenModels?: string[];
  disabledProviders?: string[];
  disabledModels?: string[];
  favoriteModels?: string[];
  defaultModelKey?: string | null;
  lastSelectedModelKey?: string | null;
}

export interface AppSettings {
  version?: string;
  general?: GeneralSettings;
  capture?: CaptureSettings;
  voiceCommands?: VoiceCommandSettings;
  scene?: SceneSettings;
  user?: {
    nickname?: string;
    email?: string;
    avatarPath?: string;
  };
  integrations?: {
    googledrive?: GoogleDriveSettings;
    mailTransport?: MailTransportSettings;
    us1Relay?: Us1RelaySettings;
  };
  slots: {
    ai1: SlotSettings;
    ai2: SlotSettings;
    [key: string]: SlotSettings;
  };
  remoteUsers?: RemoteUserIdentity[];
  projectAiSessions?: ProjectAiSessionBinding[];
  us1Slot?: Us1SlotSettings;
  assistantSlot?: SlotSettings;
  accounts: Account[];
  assistantAccounts?: Account[];
  upload?: UploadSettings;
  googleDrive?: GoogleDriveSettings;
  assistants?: {
    preferred?: AssistantProviderId;
    lastConnected?: AssistantProviderId | null;
    resumeLastSession?: boolean;
    keepServersOnAppClose?: boolean;
    lastOpencodeUrl?: string | null;
    lastOpencodeUiSessionId?: string | null;
    lastActiveRelay?: string | null;
    disabledMcpServers?: string[];
    opencode?: {
      defaultPort?: number;
      version?: string | null;
    };
    opencodeUi?: OpencodeUiModelPreferences;
  };
  logging?: {
    level?: string;
    verboseModules?: string[];
    silentModules?: string[];
    persistLevel?: string;
    maxMemoryLogs?: number;
    enableStateSnapshots?: boolean;
    snapshotInterval?: number;
  };
  [key: string]: unknown;
}

export interface SettingsChangeEvent {
  path: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
}

export type SettingsListener = (event: SettingsChangeEvent) => void;

export function isRemoteEmailAccount(account: Account | null | undefined): boolean {
  return account?.accountKind === "remote-email" || account?.provider === "remote-email";
}

export function isAiProviderAccount(account: Account | null | undefined): boolean {
  return account !== null && account !== undefined && !isRemoteEmailAccount(account);
}

export function getAiProviderAccounts(accounts: readonly Account[] | null | undefined): Account[] {
  const list: readonly Account[] = Array.isArray(accounts) ? accounts : [];
  return list.filter((account) => isAiProviderAccount(account));
}

export function getRemoteEmailAccounts(accounts: readonly Account[] | null | undefined): Account[] {
  const list: readonly Account[] = Array.isArray(accounts) ? accounts : [];
  return list.filter((account) => isRemoteEmailAccount(account));
}

export function getUs1SelectedIdentityId(slot: Us1SlotSettings | null | undefined): string | null {
  if (typeof slot?.selectedIdentityId === "string" && slot.selectedIdentityId.trim() !== "") {
    return slot.selectedIdentityId.trim();
  }

  if (typeof slot?.selectedRemoteUserId === "string" && slot.selectedRemoteUserId.trim() !== "") {
    return slot.selectedRemoteUserId.trim();
  }

  return null;
}

export function getRemoteUserLinkedAccountId(
  remoteUser: RemoteUserIdentity | null | undefined
): string | null {
  if (typeof remoteUser?.linkedAccountId === "string" && remoteUser.linkedAccountId.trim() !== "") {
    return remoteUser.linkedAccountId.trim();
  }

  if (
    typeof remoteUser?.linkedMailAccountId === "string" &&
    remoteUser.linkedMailAccountId.trim() !== ""
  ) {
    return remoteUser.linkedMailAccountId.trim();
  }

  return null;
}
