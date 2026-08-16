import type {
  Account,
  AppSettings,
  CaptureAttachMode,
  CaptureCommandPhraseSettings,
  CaptureCommandConfirmation,
  CaptureDefaultLens,
  CapturePhotoFlashMode,
  CapturePhotoQuality,
  AndroidDictationBackend,
  AnalyzeDictationMode,
  SceneAppearanceSettings,
  SlotSettings,
  RemoteUserIdentity,
  Us1CommunicationSystem,
  Us1RelayConnectionState,
  Us1RelayPeerCapability,
  Us1RelaySettings,
  Us1RelayTrustState,
  Us1SlotSettings,
  MessageMethod,
  UploadMethod,
  MailTransportSettings,
  MailTransportAccountConfig,
  MailTransportServerConfig,
  MailTransportAuthConfig,
  MailTransportAccountBinding,
  MailTransportProviderType,
  MailTransportAuthType,
  ProjectAiSessionBinding,
  ThemeAppearanceSettings,
} from "@shared/settings.js";
import type { TranscriptDictationBackend } from "@shared/transcript.js";
import {
  ASSISTANT_ACCOUNTS_SETTINGS_KEY,
  ASSISTANT_SLOT_SETTINGS_KEY,
  DEFAULT_SCENE_APPEARANCE_SETTINGS,
  normalizeUiScalePercent,
} from "@shared/settings.js";
import {
  buildRemoteEmailAccountId,
  extractUs1RemoteIdentityIdFromAccountId,
} from "@shared/archive.js";
import { isAssistantProviderId } from "@shared/common.js";
import { normalizeThemeAppearance } from "../../ui/theme/appearance-normalizer.js";
import { normalizeAppLanguage } from "../../../../shared/i18n/locale.js";
import {
  DEFAULT_CAPTURE_COMMAND_PHRASES,
  normalizeCapturePhraseList,
} from "../../../../shared/capture/command-catalog.js";
import {
  DEFAULT_AMBIENT_ACTIVE_WINDOW_MS,
  DEFAULT_AMBIENT_SILENCE_TIMEOUT_MS,
  DEFAULT_AMBIENT_WAKE_PHRASES,
  normalizeAmbientDurationMs,
  normalizeAmbientWakePhrases,
} from "../../../../shared/capture/ambient-defaults.js";
import {
  normalizeTranscriptBackend,
  normalizeTranscriptModelVariant,
  resolveTranscriptSupportedLanguage,
} from "../../../../shared/transcript/model-catalog.js";
import {
  normalizeTtsLanguage,
  normalizeTtsMode,
  resolveTtsLanguageFromLocale,
} from "../../../../shared/tts/model-catalog.js";
import {
  DEFAULT_ASSISTANT_ACCOUNT_ID,
  DEFAULT_OPENCODE_UI_ACCOUNT_ID,
  createDefaultAssistantAccount,
  createDefaultOpencodeUiAccount,
  createDefaultRemoteUsers,
  createDefaultSettings,
} from "@shared/settings-defaults.js";
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && v !== undefined && typeof v === "object" && !Array.isArray(v);
}

function resolvePreferredAssistantAccountId(
  settings: Pick<AppSettings, "assistantAccounts" | "assistants">
): string {
  const assistantAccounts = Array.isArray(settings.assistantAccounts)
    ? settings.assistantAccounts
    : [];
  const preferredProviderId = settings.assistants?.preferred;
  const preferredAccount =
    typeof preferredProviderId === "string"
      ? assistantAccounts.find((account) => account.provider === preferredProviderId)
      : null;
  const defaultAccount =
    assistantAccounts.find((account) => account.id === DEFAULT_ASSISTANT_ACCOUNT_ID) ?? null;
  const fallbackAccount = preferredAccount ?? defaultAccount ?? assistantAccounts[0] ?? null;
  return fallbackAccount?.id ?? DEFAULT_ASSISTANT_ACCOUNT_ID;
}

function normalizeThemeAppearanceSettings(
  raw: unknown,
  legacyTheme?: unknown
): Required<ThemeAppearanceSettings> {
  return normalizeThemeAppearance(raw, legacyTheme);
}

function normalizeSceneAppearanceSettings(raw: unknown): Required<SceneAppearanceSettings> {
  if (!isPlainObject(raw)) {
    return { ...DEFAULT_SCENE_APPEARANCE_SETTINGS };
  }

  const activeThemeIdValue = raw["activeThemeId"];
  const activeThemeId =
    typeof activeThemeIdValue === "string" && activeThemeIdValue.trim() !== ""
      ? activeThemeIdValue.trim()
      : DEFAULT_SCENE_APPEARANCE_SETTINGS.activeThemeId;
  const uiScale = normalizeUiScalePercent(
    raw["uiScale"],
    DEFAULT_SCENE_APPEARANCE_SETTINGS.uiScale
  );

  return {
    activeThemeId,
    uiScale,
  };
}

function normalizeCaptureDefaultLens(value: unknown): CaptureDefaultLens {
  return value === "front" ? "front" : "back";
}

function normalizeCapturePhotoQuality(value: unknown): CapturePhotoQuality {
  return value === "balanced" ? "balanced" : "high";
}

function normalizeCapturePhotoFlashMode(value: unknown): CapturePhotoFlashMode {
  if (value === "auto" || value === "on") {
    return value;
  }
  return "off";
}

function normalizeCaptureAttachMode(value: unknown): CaptureAttachMode {
  return value === "auto-stage" ? "auto-stage" : "manual-sync";
}

function normalizeCaptureCommandConfirmation(value: unknown): CaptureCommandConfirmation {
  return value === "none" ? "none" : "toast";
}

function normalizeAndroidDictationBackend(value: unknown): AndroidDictationBackend {
  void value;
  return "vosk";
}

function normalizeAnalyzeDictationMode(value: unknown): AnalyzeDictationMode {
  return value === "android" ? "android" : "local";
}

function normalizeLocalTranscriptBackend(value: unknown): TranscriptDictationBackend {
  return normalizeTranscriptBackend(value, "whisper.cpp");
}

function normalizeCaptureSettings(
  raw: unknown,
  appLanguage: unknown = "tr"
): AppSettings["capture"] | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }

  const defaults = isPlainObject(raw["defaults"]) ? raw["defaults"] : {};
  const providers = isPlainObject(raw["providers"]) ? raw["providers"] : {};
  return {
    defaults: {
      preferredDeviceId:
        typeof defaults["preferredDeviceId"] === "string" &&
        defaults["preferredDeviceId"].trim() !== ""
          ? defaults["preferredDeviceId"].trim()
          : null,
      defaultLens: normalizeCaptureDefaultLens(defaults["defaultLens"]),
      photoQuality: normalizeCapturePhotoQuality(defaults["photoQuality"]),
      photoFlashMode: normalizeCapturePhotoFlashMode(
        defaults["photoFlashMode"] ?? (defaults["photoFlashEnabled"] === true ? "on" : "off")
      ),
      attachMode: normalizeCaptureAttachMode(defaults["attachMode"]),
      commandConfirmation: normalizeCaptureCommandConfirmation(defaults["commandConfirmation"]),
      dictationMode: normalizeAnalyzeDictationMode(defaults["dictationMode"]),
      dictationLanguage: resolveTranscriptSupportedLanguage(
        defaults["dictationLanguage"] ?? appLanguage
      ),
      androidTranscriptModelVariant: normalizeTranscriptModelVariant(
        defaults["androidTranscriptModelVariant"],
        "light"
      ),
      androidDictationBackend: normalizeAndroidDictationBackend(
        defaults["androidDictationBackend"]
      ),
      ttsMode: normalizeTtsMode(defaults["ttsMode"], "local"),
      ttsLanguage: normalizeTtsLanguage(
        defaults["ttsLanguage"],
        resolveTtsLanguageFromLocale(appLanguage)
      ),
    },
    providers: {
      androidCompanionEnabled: providers["androidCompanionEnabled"] !== false,
      androidTorchEnabled: providers["androidTorchEnabled"] === true,
    },
  };
}

function normalizeCaptureCommandPhrases(raw: unknown): Required<CaptureCommandPhraseSettings> {
  const commandPhrases = isPlainObject(raw) ? raw : {};
  return {
    openCamera: normalizeCapturePhraseList(
      commandPhrases["openCamera"],
      DEFAULT_CAPTURE_COMMAND_PHRASES.openCamera
    ),
    capture: normalizeCapturePhraseList(
      commandPhrases["capture"],
      DEFAULT_CAPTURE_COMMAND_PHRASES.capture
    ),
    stop: normalizeCapturePhraseList(commandPhrases["stop"], DEFAULT_CAPTURE_COMMAND_PHRASES.stop),
  };
}

function normalizeVoiceCommandSettings(
  raw: unknown,
  legacyCapture: unknown
): AppSettings["voiceCommands"] | undefined {
  const voiceCommands = isPlainObject(raw) ? raw : {};
  const legacyCapturePhrases =
    isPlainObject(legacyCapture) && isPlainObject(legacyCapture["commandPhrases"])
      ? legacyCapture["commandPhrases"]
      : undefined;
  const rawPhrases =
    voiceCommands["analyzePhrases"] ?? voiceCommands["commandPhrases"] ?? legacyCapturePhrases;

  return {
    analyzeEnabled:
      typeof voiceCommands["analyzeEnabled"] === "boolean"
        ? voiceCommands["analyzeEnabled"]
        : false,
    analyzePhrases: normalizeCaptureCommandPhrases(rawPhrases),
    ambient: {
      wakePhrases: normalizeAmbientWakePhrases(
        isPlainObject(voiceCommands["ambient"])
          ? voiceCommands["ambient"]["wakePhrases"]
          : undefined,
        DEFAULT_AMBIENT_WAKE_PHRASES
      ),
      activeWindowMs: normalizeAmbientDurationMs(
        isPlainObject(voiceCommands["ambient"])
          ? voiceCommands["ambient"]["activeWindowMs"]
          : undefined,
        DEFAULT_AMBIENT_ACTIVE_WINDOW_MS,
        { min: 1_000, max: 30_000 }
      ),
      silenceTimeoutMs: normalizeAmbientDurationMs(
        isPlainObject(voiceCommands["ambient"])
          ? voiceCommands["ambient"]["silenceTimeoutMs"]
          : undefined,
        DEFAULT_AMBIENT_SILENCE_TIMEOUT_MS,
        { min: 300, max: 10_000 }
      ),
    },
  };
}

export function defaultSettings(): AppSettings {
  return createDefaultSettings();
}

function mergeDefaults(obj: unknown, defaults: Record<string, unknown>): Record<string, unknown> {
  if (!isPlainObject(obj)) return JSON.parse(JSON.stringify(defaults)) as Record<string, unknown>;
  const out = JSON.parse(JSON.stringify(defaults)) as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = mergeDefaults(v, out[k]);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function normalizeUs1CommunicationSystem(value: unknown): Us1CommunicationSystem {
  return value === "relay-e2ee" ? "relay-e2ee" : "mail";
}

function normalizeUs1RelayConnectionState(value: unknown): Us1RelayConnectionState {
  return value === "connecting" || value === "connected" || value === "error"
    ? value
    : "disconnected";
}

function normalizeUs1RelayTrustState(value: unknown): Us1RelayTrustState {
  return value === "trusted" || value === "mismatch" ? value : "unknown";
}

function normalizeUs1RelayPeerCapability(raw: unknown): Us1RelayPeerCapability | null {
  if (!isPlainObject(raw)) {
    return null;
  }

  const supported =
    raw["supported"] === true ||
    (typeof raw["endpoint"] === "string" && raw["endpoint"].trim() !== "") ||
    (typeof raw["encryptionPublicKey"] === "string" && raw["encryptionPublicKey"].trim() !== "");

  if (supported !== true) {
    return null;
  }

  const protocolVersion = raw["protocolVersion"];
  const advertisedAt = raw["advertisedAt"];
  const trustState = raw["trustState"];

  return {
    supported: true,
    endpoint:
      typeof raw["endpoint"] === "string" && raw["endpoint"].trim() !== ""
        ? raw["endpoint"].trim()
        : null,
    encryptionPublicKey:
      typeof raw["encryptionPublicKey"] === "string" && raw["encryptionPublicKey"].trim() !== ""
        ? raw["encryptionPublicKey"].trim()
        : null,
    encryptionKeyFingerprint:
      typeof raw["encryptionKeyFingerprint"] === "string" &&
      raw["encryptionKeyFingerprint"].trim() !== ""
        ? raw["encryptionKeyFingerprint"].trim()
        : null,
    signingPublicKey:
      typeof raw["signingPublicKey"] === "string" && raw["signingPublicKey"].trim() !== ""
        ? raw["signingPublicKey"].trim()
        : null,
    signingKeyFingerprint:
      typeof raw["signingKeyFingerprint"] === "string" && raw["signingKeyFingerprint"].trim() !== ""
        ? raw["signingKeyFingerprint"].trim()
        : null,
    protocolVersion:
      typeof protocolVersion === "number" &&
      Number.isFinite(protocolVersion) &&
      protocolVersion >= 1
        ? Math.trunc(protocolVersion)
        : 1,
    advertisedAt:
      typeof advertisedAt === "number" && Number.isFinite(advertisedAt) && advertisedAt >= 0
        ? Math.trunc(advertisedAt)
        : null,
    trustState:
      trustState === "trusted" || trustState === "mismatch" || trustState === "unknown"
        ? trustState
        : "unknown",
    lastError:
      typeof raw["lastError"] === "string" && raw["lastError"].trim() !== ""
        ? raw["lastError"].trim()
        : null,
  };
}

type SettingsInput = Partial<AppSettings> & {
  [ASSISTANT_ACCOUNTS_SETTINGS_KEY]?: Account[];
  [ASSISTANT_SLOT_SETTINGS_KEY]?: SlotSettings;
};

function normalizeRemoteUsers(raw: unknown): RemoteUserIdentity[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  return raw.filter(isPlainObject).reduce<RemoteUserIdentity[]>((acc, entry) => {
    const remoteUserId = entry["remoteUserId"] ?? entry["id"];
    const email = entry["email"];
    const nickname = entry["nickname"];
    const avatar = entry["avatar"];
    const avatarPath = entry["avatarPath"];
    const handshakeState = entry["handshakeState"];
    const linkedAccountId = entry["linkedAccountId"];
    const linkedMailAccountId = entry["linkedMailAccountId"];
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const normalizedRemoteUserId =
      typeof remoteUserId === "string" && remoteUserId.trim() !== ""
        ? remoteUserId.trim()
        : normalizedEmail;
    const normalizedLinkedAccountId =
      typeof linkedAccountId === "string" && linkedAccountId.trim() !== ""
        ? linkedAccountId.trim()
        : typeof linkedMailAccountId === "string" && linkedMailAccountId.trim() !== ""
          ? linkedMailAccountId.trim()
          : "";
    const normalizedLinkedMailAccountId =
      typeof linkedMailAccountId === "string" && linkedMailAccountId.trim() !== ""
        ? linkedMailAccountId.trim()
        : normalizedLinkedAccountId;

    if (
      normalizedRemoteUserId === "" ||
      normalizedLinkedMailAccountId === "" ||
      normalizedRemoteUserId === "us1_demo_remote_user"
    ) {
      return acc;
    }

    const normalizedHandshakeState =
      handshakeState === "invite_sent" ||
      handshakeState === "handshake_pending" ||
      handshakeState === "active" ||
      handshakeState === "rejected" ||
      handshakeState === "error"
        ? handshakeState
        : handshakeState === "ready"
          ? "active"
          : handshakeState === "pending"
            ? "handshake_pending"
            : "handshake_pending";
    const profileRevision = entry["profileRevision"];
    const lastSyncAt = entry["lastSyncAt"];
    const normalizedLastSyncAt =
      typeof lastSyncAt === "number" && Number.isFinite(lastSyncAt) && lastSyncAt >= 0
        ? Math.trunc(lastSyncAt)
        : undefined;

    const nextRemoteUser: RemoteUserIdentity = {
      remoteUserId: normalizedRemoteUserId,
      email: normalizedEmail,
      nickname: typeof nickname === "string" ? nickname : "",
      avatar: typeof avatar === "string" ? avatar : "",
      avatarPath: typeof avatarPath === "string" ? avatarPath : "",
      handshakeState: normalizedHandshakeState,
      profileRevision:
        typeof profileRevision === "number" &&
        Number.isFinite(profileRevision) &&
        profileRevision >= 1
          ? Math.trunc(profileRevision)
          : 1,
      linkedMailAccountId: normalizedLinkedMailAccountId,
      linkedAccountId: normalizedLinkedAccountId,
      inviteMessageId:
        typeof entry["inviteMessageId"] === "string" && entry["inviteMessageId"].trim() !== ""
          ? entry["inviteMessageId"].trim()
          : null,
      acceptMessageId:
        typeof entry["acceptMessageId"] === "string" && entry["acceptMessageId"].trim() !== ""
          ? entry["acceptMessageId"].trim()
          : null,
      threadMessageId:
        typeof entry["threadMessageId"] === "string" && entry["threadMessageId"].trim() !== ""
          ? entry["threadMessageId"].trim()
          : null,
      lastTransportMessageId:
        typeof entry["lastTransportMessageId"] === "string" &&
        entry["lastTransportMessageId"].trim() !== ""
          ? entry["lastTransportMessageId"].trim()
          : null,
      lastError:
        typeof entry["lastError"] === "string" && entry["lastError"].trim() !== ""
          ? entry["lastError"].trim()
          : null,
      sessionAlias:
        typeof entry["sessionAlias"] === "string" && entry["sessionAlias"].trim() !== ""
          ? entry["sessionAlias"].trim()
          : null,
      relayCapability: normalizeUs1RelayPeerCapability(entry["relayCapability"]),
      ...(normalizedLastSyncAt !== undefined ? { lastSyncAt: normalizedLastSyncAt } : {}),
    };

    acc.push(nextRemoteUser);
    return acc;
  }, []);
}

function normalizeProjectAiSessionString(value: unknown): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : "";
}

function normalizeProjectAiSessionSlot(value: unknown): ProjectAiSessionBinding["slot"] | null {
  return value === "ai0" || value === "ai1" || value === "ai2" ? value : null;
}

function normalizeProjectAiSessionTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : undefined;
}

function normalizeProjectAiSessionRef(
  raw: unknown
): NonNullable<ProjectAiSessionBinding["sessionRef"]> | null {
  if (!isPlainObject(raw)) {
    return null;
  }

  const id = normalizeProjectAiSessionString(raw["id"]);
  const conversationId = normalizeProjectAiSessionString(raw["conversationId"]);
  const threadId = normalizeProjectAiSessionString(raw["threadId"]);
  const openHint = normalizeProjectAiSessionString(raw["openHint"]);

  if (id === "" && conversationId === "" && threadId === "" && openHint === "") {
    return null;
  }

  return {
    ...(id !== "" ? { id } : {}),
    ...(conversationId !== "" ? { conversationId } : {}),
    ...(threadId !== "" ? { threadId } : {}),
    ...(openHint !== "" ? { openHint } : {}),
  };
}

function normalizeProjectAiSessions(raw: unknown): ProjectAiSessionBinding[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  const byKey = new Map<string, ProjectAiSessionBinding>();
  raw.forEach((entry) => {
    if (!isPlainObject(entry)) {
      return;
    }

    const explicitProjectId = normalizeProjectAiSessionString(entry["projectId"]);
    const projectId =
      explicitProjectId !== "" ? explicitProjectId : normalizeProjectAiSessionString(entry["id"]);
    const roomId = normalizeProjectAiSessionString(entry["roomId"]);
    const slot = normalizeProjectAiSessionSlot(entry["slot"]);
    const accountId = normalizeProjectAiSessionString(entry["accountId"]);
    if (projectId === "" || slot === null || accountId === "") {
      return;
    }

    const providerId = normalizeProjectAiSessionString(entry["providerId"]);
    const webUrl = normalizeProjectAiSessionString(entry["webUrl"]);
    const sessionRef = normalizeProjectAiSessionRef(entry["sessionRef"]);
    const createdAt = normalizeProjectAiSessionTimestamp(entry["createdAt"]);
    const updatedAt = normalizeProjectAiSessionTimestamp(entry["updatedAt"]);
    const binding: ProjectAiSessionBinding = {
      projectId,
      roomId: roomId !== "" ? roomId : null,
      slot,
      accountId,
      providerId: providerId !== "" ? providerId : null,
      sessionRef,
      webUrl: webUrl !== "" ? webUrl : null,
      ...(createdAt !== undefined ? { createdAt } : {}),
      ...(updatedAt !== undefined ? { updatedAt } : {}),
    };
    byKey.set(`${binding.roomId ?? ""}\u0000${projectId}`, binding);
  });

  return Array.from(byKey.values());
}

function normalizeAccountKind(value: unknown): "ai-provider" | "remote-email" {
  return value === "remote-email" ? "remote-email" : "ai-provider";
}

function normalizeRemoteEmailAccountState(raw: unknown): Account["remoteEmail"] | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }

  const remoteUserId =
    typeof raw["remoteUserId"] === "string" && raw["remoteUserId"].trim() !== ""
      ? raw["remoteUserId"].trim().toLowerCase()
      : "";
  const linkedLocalMailAccountId =
    typeof raw["linkedLocalMailAccountId"] === "string" &&
    raw["linkedLocalMailAccountId"].trim() !== ""
      ? raw["linkedLocalMailAccountId"].trim()
      : "";

  if (remoteUserId === "" || linkedLocalMailAccountId === "") {
    return undefined;
  }

  const handshakeState = raw["handshakeState"];
  const profileRevision = raw["profileRevision"];
  const lastSyncAt = raw["lastSyncAt"];

  return {
    remoteUserId,
    handshakeState:
      handshakeState === "invite_sent" ||
      handshakeState === "handshake_pending" ||
      handshakeState === "active" ||
      handshakeState === "rejected" ||
      handshakeState === "error"
        ? handshakeState
        : "handshake_pending",
    linkedLocalMailAccountId,
    profileRevision:
      typeof profileRevision === "number" &&
      Number.isFinite(profileRevision) &&
      profileRevision >= 1
        ? Math.trunc(profileRevision)
        : 1,
    inviteMessageId:
      typeof raw["inviteMessageId"] === "string" && raw["inviteMessageId"].trim() !== ""
        ? raw["inviteMessageId"].trim()
        : null,
    acceptMessageId:
      typeof raw["acceptMessageId"] === "string" && raw["acceptMessageId"].trim() !== ""
        ? raw["acceptMessageId"].trim()
        : null,
    threadMessageId:
      typeof raw["threadMessageId"] === "string" && raw["threadMessageId"].trim() !== ""
        ? raw["threadMessageId"].trim()
        : null,
    lastTransportMessageId:
      typeof raw["lastTransportMessageId"] === "string" &&
      raw["lastTransportMessageId"].trim() !== ""
        ? raw["lastTransportMessageId"].trim()
        : null,
    lastError:
      typeof raw["lastError"] === "string" && raw["lastError"].trim() !== ""
        ? raw["lastError"].trim()
        : null,
    sessionAlias:
      typeof raw["sessionAlias"] === "string" && raw["sessionAlias"].trim() !== ""
        ? raw["sessionAlias"].trim()
        : null,
    pendingIncoming: raw["pendingIncoming"] === true,
    ...(typeof lastSyncAt === "number" && Number.isFinite(lastSyncAt) && lastSyncAt >= 0
      ? { lastSyncAt: Math.trunc(lastSyncAt) }
      : {}),
  };
}

function normalizeAccount(raw: unknown): Account | null {
  if (!isPlainObject(raw)) {
    return null;
  }

  const id = typeof raw["id"] === "string" ? raw["id"].trim() : "";
  const email = typeof raw["email"] === "string" ? raw["email"].trim().toLowerCase() : "";
  const provider =
    typeof raw["provider"] === "string" && raw["provider"].trim() !== ""
      ? raw["provider"].trim()
      : "";

  if (id === "" || email === "") {
    return null;
  }

  const accountKind = normalizeAccountKind(
    raw["accountKind"] ?? (provider === "remote-email" ? "remote-email" : "ai-provider")
  );
  const remoteEmail = normalizeRemoteEmailAccountState(raw["remoteEmail"]);
  const createdAt =
    typeof raw["createdAt"] === "number" && Number.isFinite(raw["createdAt"])
      ? Math.trunc(raw["createdAt"])
      : undefined;
  const lastUsedAt =
    typeof raw["lastUsedAt"] === "number" && Number.isFinite(raw["lastUsedAt"])
      ? Math.trunc(raw["lastUsedAt"])
      : undefined;

  return {
    id,
    provider: (accountKind === "remote-email" ? "remote-email" : provider) as Account["provider"],
    accountKind,
    email,
    dbPath: typeof raw["dbPath"] === "string" && raw["dbPath"].trim() !== "" ? raw["dbPath"] : null,
    name: typeof raw["name"] === "string" ? raw["name"] : "",
    nickname: typeof raw["nickname"] === "string" ? raw["nickname"] : "",
    avatar: typeof raw["avatar"] === "string" ? raw["avatar"] : "",
    avatarPath: typeof raw["avatarPath"] === "string" ? raw["avatarPath"] : "",
    lastSessionUrl:
      typeof raw["lastSessionUrl"] === "string" && raw["lastSessionUrl"].trim() !== ""
        ? raw["lastSessionUrl"].trim()
        : null,
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(lastUsedAt !== undefined ? { lastUsedAt } : {}),
    ...(remoteEmail !== undefined ? { remoteEmail } : {}),
  };
}

function normalizeAccounts(raw: unknown): Account[] | undefined {
  if (!Array.isArray(raw)) {
    return undefined;
  }

  return raw
    .map((entry) => normalizeAccount(entry))
    .filter((entry): entry is Account => entry !== null);
}

function resolveRemoteEmailNickname(email: string, nickname: string | null | undefined): string {
  if (typeof nickname === "string" && nickname.trim() !== "") {
    return nickname.trim();
  }

  const localPart = email.split("@")[0] ?? "";
  return localPart.trim() !== "" ? localPart.trim() : email;
}

function buildRemoteUserFromRemoteAccount(account: Account): RemoteUserIdentity | null {
  if (
    account.provider !== "remote-email" &&
    account.accountKind !== "remote-email" &&
    account.remoteEmail === undefined
  ) {
    return null;
  }

  const remoteState = account.remoteEmail;
  const email = typeof account.email === "string" ? account.email.trim().toLowerCase() : "";
  const remoteUserId =
    typeof remoteState?.remoteUserId === "string" && remoteState.remoteUserId.trim() !== ""
      ? remoteState.remoteUserId.trim().toLowerCase()
      : email;
  const linkedMailAccountId =
    typeof remoteState?.linkedLocalMailAccountId === "string" &&
    remoteState.linkedLocalMailAccountId.trim() !== ""
      ? remoteState.linkedLocalMailAccountId.trim()
      : "";

  if (remoteUserId === "" || linkedMailAccountId === "") {
    return null;
  }

  return {
    remoteUserId,
    email: email !== "" ? email : remoteUserId,
    nickname: typeof account.nickname === "string" ? account.nickname : "",
    avatar: typeof account.avatar === "string" ? account.avatar : "",
    avatarPath: typeof account.avatarPath === "string" ? account.avatarPath : "",
    handshakeState: remoteState?.handshakeState ?? "handshake_pending",
    profileRevision:
      typeof remoteState?.profileRevision === "number" &&
      Number.isFinite(remoteState.profileRevision) &&
      remoteState.profileRevision >= 1
        ? Math.trunc(remoteState.profileRevision)
        : 1,
    linkedMailAccountId,
    linkedAccountId: linkedMailAccountId,
    inviteMessageId: remoteState?.inviteMessageId ?? null,
    acceptMessageId: remoteState?.acceptMessageId ?? null,
    threadMessageId: remoteState?.threadMessageId ?? null,
    lastTransportMessageId: remoteState?.lastTransportMessageId ?? null,
    lastError: remoteState?.lastError ?? null,
    sessionAlias: remoteState?.sessionAlias ?? null,
    ...(typeof remoteState?.lastSyncAt === "number" &&
    Number.isFinite(remoteState.lastSyncAt) &&
    remoteState.lastSyncAt >= 0
      ? { lastSyncAt: Math.trunc(remoteState.lastSyncAt) }
      : {}),
  };
}

function mergeRemoteUsersWithAccountFallback(
  remoteUsers: RemoteUserIdentity[],
  accounts: Account[]
): RemoteUserIdentity[] {
  if (accounts.length === 0) {
    return remoteUsers;
  }

  const nextRemoteUsers = [...remoteUsers];
  const seen = new Set(
    remoteUsers
      .map((remoteUser) => remoteUser.remoteUserId.trim().toLowerCase())
      .filter((remoteUserId) => remoteUserId !== "")
  );

  accounts.forEach((account) => {
    const remoteUser = buildRemoteUserFromRemoteAccount(account);
    if (remoteUser === null) {
      return;
    }

    const key = remoteUser.remoteUserId.trim().toLowerCase();
    if (key === "" || seen.has(key)) {
      return;
    }

    seen.add(key);
    nextRemoteUsers.push(remoteUser);
  });

  return nextRemoteUsers;
}

function buildRemoteAccountFromIdentity(
  remoteUser: RemoteUserIdentity,
  existingAccount: Account | null
): Account {
  const email =
    typeof remoteUser.email === "string" && remoteUser.email.trim() !== ""
      ? remoteUser.email.trim().toLowerCase()
      : remoteUser.remoteUserId.trim().toLowerCase();
  const existingRemoteState = existingAccount?.remoteEmail;
  const nickname = resolveRemoteEmailNickname(
    email,
    remoteUser.nickname ?? existingAccount?.nickname ?? null
  );
  const avatarPath =
    typeof remoteUser.avatarPath === "string" && remoteUser.avatarPath.trim() !== ""
      ? remoteUser.avatarPath.trim()
      : typeof existingAccount?.avatarPath === "string" && existingAccount.avatarPath.trim() !== ""
        ? existingAccount.avatarPath.trim()
        : "";
  const lastSyncAt =
    typeof remoteUser.lastSyncAt === "number" && Number.isFinite(remoteUser.lastSyncAt)
      ? Math.trunc(remoteUser.lastSyncAt)
      : existingRemoteState?.lastSyncAt;

  return {
    id: buildRemoteEmailAccountId(remoteUser.remoteUserId),
    provider: "remote-email",
    accountKind: "remote-email",
    email,
    dbPath: existingAccount?.dbPath ?? null,
    name: typeof existingAccount?.name === "string" ? existingAccount.name : "",
    nickname,
    avatar:
      typeof remoteUser.avatar === "string" && remoteUser.avatar.trim() !== ""
        ? remoteUser.avatar.trim()
        : typeof existingAccount?.avatar === "string"
          ? existingAccount.avatar
          : "",
    avatarPath,
    lastSessionUrl: existingAccount?.lastSessionUrl ?? null,
    ...(typeof existingAccount?.createdAt === "number" && Number.isFinite(existingAccount.createdAt)
      ? { createdAt: Math.trunc(existingAccount.createdAt) }
      : {}),
    ...(typeof existingAccount?.lastUsedAt === "number" &&
    Number.isFinite(existingAccount.lastUsedAt)
      ? { lastUsedAt: Math.trunc(existingAccount.lastUsedAt) }
      : {}),
    remoteEmail: {
      remoteUserId: remoteUser.remoteUserId,
      handshakeState: remoteUser.handshakeState,
      linkedLocalMailAccountId: remoteUser.linkedAccountId ?? remoteUser.linkedMailAccountId,
      profileRevision: remoteUser.profileRevision,
      inviteMessageId: remoteUser.inviteMessageId ?? null,
      acceptMessageId: remoteUser.acceptMessageId ?? null,
      threadMessageId: remoteUser.threadMessageId ?? null,
      lastTransportMessageId: remoteUser.lastTransportMessageId ?? null,
      lastError: remoteUser.lastError ?? existingRemoteState?.lastError ?? null,
      sessionAlias: remoteUser.sessionAlias ?? existingRemoteState?.sessionAlias ?? null,
      pendingIncoming: existingRemoteState?.pendingIncoming === true,
      ...(typeof lastSyncAt === "number" && Number.isFinite(lastSyncAt) && lastSyncAt >= 0
        ? { lastSyncAt }
        : {}),
    },
  };
}

function mergeUnifiedAccounts(accounts: Account[], remoteUsers: RemoteUserIdentity[]): Account[] {
  const aiAccounts = accounts.filter(
    (account) => account.provider !== "remote-email" && account.accountKind !== "remote-email"
  );
  const remoteAccountsById = new Map(
    accounts
      .filter(
        (account) => account.provider === "remote-email" || account.accountKind === "remote-email"
      )
      .map((account) => [account.id, account] as const)
  );

  const mergedRemoteAccounts = remoteUsers.map((remoteUser) =>
    buildRemoteAccountFromIdentity(
      remoteUser,
      remoteAccountsById.get(buildRemoteEmailAccountId(remoteUser.remoteUserId)) ?? null
    )
  );

  return [...aiAccounts, ...mergedRemoteAccounts];
}

function normalizeUs1Slot(raw: unknown): Us1SlotSettings | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }

  const selectedIdentityId = raw["selectedIdentityId"] ?? raw["selectedRemoteUserId"];
  const selectedAccountId = raw["selectedAccountId"];
  const connectionState = raw["connectionState"];
  const connected = raw["connected"];
  const communicationSystem = raw["communicationSystem"];
  const relayConnectionState = raw["relayConnectionState"];
  const catchCommands = raw["catchCommands"];
  const disabledCommands = raw["disabledCommands"];
  const resumeLastSession = raw["resumeLastSession"];
  const rememberConnectionStatus = raw["rememberConnectionStatus"];
  const lastConnectionState = raw["lastConnectionState"];
  const normalizedIdentityId =
    typeof selectedIdentityId === "string" && selectedIdentityId.trim() !== ""
      ? selectedIdentityId.trim()
      : null;

  return {
    communicationSystem: normalizeUs1CommunicationSystem(communicationSystem),
    selectedIdentityId: normalizedIdentityId,
    selectedRemoteUserId: normalizedIdentityId,
    selectedAccountId:
      typeof selectedAccountId === "string" && selectedAccountId.trim() !== ""
        ? selectedAccountId.trim()
        : null,
    connectionState:
      connectionState === "connected" || connectionState === "disconnected"
        ? connectionState
        : connected === true
          ? "connected"
          : "disconnected",
    relayConnectionState: normalizeUs1RelayConnectionState(relayConnectionState),
    catchCommands: typeof catchCommands === "boolean" ? catchCommands : true,
    disabledCommands: Array.isArray(disabledCommands)
      ? disabledCommands.filter((item): item is string => typeof item === "string")
      : [],
    resumeLastSession: typeof resumeLastSession === "boolean" ? resumeLastSession : true,
    rememberConnectionStatus:
      typeof rememberConnectionStatus === "boolean" ? rememberConnectionStatus : false,
    lastConnectionState:
      lastConnectionState === "connected" || lastConnectionState === "disconnected"
        ? lastConnectionState
        : "disconnected",
  };
}

function normalizeMailTransportProviderType(value: unknown): MailTransportProviderType {
  return value === "gmail" ? "gmail" : "custom-imap-smtp";
}

function normalizeUs1RelaySettings(raw: unknown): Us1RelaySettings | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }

  const protocolVersion = raw["protocolVersion"];
  const lastConnectedAt = raw["lastConnectedAt"];
  const trustState = raw["trustState"];

  return {
    enabled: raw["enabled"] === true,
    baseUrl:
      typeof raw["baseUrl"] === "string" && raw["baseUrl"].trim() !== ""
        ? raw["baseUrl"].trim()
        : null,
    trustedServerFingerprint:
      typeof raw["trustedServerFingerprint"] === "string" &&
      raw["trustedServerFingerprint"].trim() !== ""
        ? raw["trustedServerFingerprint"].trim()
        : null,
    trustState: normalizeUs1RelayTrustState(trustState),
    encryptionPublicKey:
      typeof raw["encryptionPublicKey"] === "string" && raw["encryptionPublicKey"].trim() !== ""
        ? raw["encryptionPublicKey"].trim()
        : null,
    encryptionKeyFingerprint:
      typeof raw["encryptionKeyFingerprint"] === "string" &&
      raw["encryptionKeyFingerprint"].trim() !== ""
        ? raw["encryptionKeyFingerprint"].trim()
        : null,
    signingPublicKey:
      typeof raw["signingPublicKey"] === "string" && raw["signingPublicKey"].trim() !== ""
        ? raw["signingPublicKey"].trim()
        : null,
    signingKeyFingerprint:
      typeof raw["signingKeyFingerprint"] === "string" && raw["signingKeyFingerprint"].trim() !== ""
        ? raw["signingKeyFingerprint"].trim()
        : null,
    protocolVersion:
      typeof protocolVersion === "number" &&
      Number.isFinite(protocolVersion) &&
      protocolVersion >= 1
        ? Math.trunc(protocolVersion)
        : 1,
    connectionState: normalizeUs1RelayConnectionState(raw["connectionState"]),
    lastError:
      typeof raw["lastError"] === "string" && raw["lastError"].trim() !== ""
        ? raw["lastError"].trim()
        : null,
    lastConnectedAt:
      typeof lastConnectedAt === "number" &&
      Number.isFinite(lastConnectedAt) &&
      lastConnectedAt >= 0
        ? Math.trunc(lastConnectedAt)
        : null,
  };
}

function normalizeMailTransportAuthType(value: unknown): MailTransportAuthType {
  return value === "oauth2" ? "oauth2" : "password";
}

function normalizeMailTransportConnectionState(
  value: unknown
): "disconnected" | "connected" | "error" {
  return value === "connected" || value === "error" ? value : "disconnected";
}

function normalizeMailTransportPort(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 65535) {
    return value;
  }
  return fallback;
}

function normalizeMailTransportServer(
  raw: unknown,
  fallback: MailTransportServerConfig
): MailTransportServerConfig {
  if (!isPlainObject(raw)) {
    return { ...fallback };
  }

  const port = normalizeMailTransportPort(raw["port"], fallback.port);
  const secure =
    typeof raw["secure"] === "boolean"
      ? raw["secure"]
      : port === 465 || port === 993
        ? true
        : fallback.secure;

  return {
    host: typeof raw["host"] === "string" ? raw["host"].trim() : fallback.host,
    port,
    secure,
  };
}

function normalizeMailTransportAuth(raw: unknown, email: string): MailTransportAuthConfig {
  if (!isPlainObject(raw)) {
    return { user: email };
  }

  const expiresAt = raw["expiresAt"];

  return {
    user: typeof raw["user"] === "string" && raw["user"].trim() !== "" ? raw["user"].trim() : email,
    password: typeof raw["password"] === "string" ? raw["password"] : "",
    accessToken: typeof raw["accessToken"] === "string" ? raw["accessToken"] : "",
    refreshToken: typeof raw["refreshToken"] === "string" ? raw["refreshToken"] : "",
    clientId: typeof raw["clientId"] === "string" ? raw["clientId"] : "",
    clientSecret: typeof raw["clientSecret"] === "string" ? raw["clientSecret"] : "",
    expiresAt: typeof expiresAt === "number" && Number.isFinite(expiresAt) ? expiresAt : 0,
    loginMethod: typeof raw["loginMethod"] === "string" ? raw["loginMethod"] : "",
  };
}

function normalizeMailTransportBinding(raw: unknown): MailTransportAccountBinding | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }

  return {
    remoteUserId:
      typeof raw["remoteUserId"] === "string" && raw["remoteUserId"].trim() !== ""
        ? raw["remoteUserId"].trim()
        : null,
    defaultLocalSessionId:
      typeof raw["defaultLocalSessionId"] === "string" && raw["defaultLocalSessionId"].trim() !== ""
        ? raw["defaultLocalSessionId"].trim()
        : null,
  };
}

function defaultMailTransportServers(providerType: MailTransportProviderType): {
  imap: MailTransportServerConfig;
  smtp: MailTransportServerConfig;
} {
  if (providerType === "gmail") {
    return {
      imap: { host: "imap.gmail.com", port: 993, secure: true },
      smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    };
  }

  return {
    imap: { host: "", port: 993, secure: true },
    smtp: { host: "", port: 465, secure: true },
  };
}

function normalizeMailTransportAccount(raw: unknown): MailTransportAccountConfig | null {
  if (!isPlainObject(raw)) {
    return null;
  }

  const providerType = normalizeMailTransportProviderType(raw["providerType"]);
  const email = typeof raw["email"] === "string" ? raw["email"].trim() : "";
  const id =
    typeof raw["id"] === "string" && raw["id"].trim() !== ""
      ? raw["id"].trim()
      : email !== ""
        ? `mail_${email.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`
        : "";

  if (id === "") {
    return null;
  }

  const defaults = defaultMailTransportServers(providerType);
  const fetchBatchSize = raw["fetchBatchSize"];

  const binding = normalizeMailTransportBinding(raw["binding"]);

  return {
    id,
    providerType,
    email,
    enabled: raw["enabled"] !== false,
    connectionState: normalizeMailTransportConnectionState(raw["connectionState"]),
    lastConnectionError:
      typeof raw["lastConnectionError"] === "string" && raw["lastConnectionError"].trim() !== ""
        ? raw["lastConnectionError"].trim()
        : null,
    authType: normalizeMailTransportAuthType(raw["authType"]),
    imap: normalizeMailTransportServer(raw["imap"], defaults.imap),
    smtp: normalizeMailTransportServer(raw["smtp"], defaults.smtp),
    auth: normalizeMailTransportAuth(raw["auth"], email),
    defaultMailbox:
      typeof raw["defaultMailbox"] === "string" && raw["defaultMailbox"].trim() !== ""
        ? raw["defaultMailbox"].trim()
        : "INBOX",
    fetchBatchSize:
      typeof fetchBatchSize === "number" && Number.isInteger(fetchBatchSize) && fetchBatchSize >= 1
        ? fetchBatchSize
        : 20,
    ...(binding !== undefined ? { binding } : {}),
  };
}

function normalizeMailTransportSettings(raw: unknown): MailTransportSettings | undefined {
  if (!isPlainObject(raw)) {
    return undefined;
  }

  const accounts = Array.isArray(raw["accounts"])
    ? raw["accounts"]
        .map((entry) => normalizeMailTransportAccount(entry))
        .filter((entry): entry is MailTransportAccountConfig => entry !== null)
    : [];
  const localAccount = normalizeMailTransportAccount(raw["localAccount"]);

  const retryBaseMs = raw["retryBaseMs"];
  const maxRetries = raw["maxRetries"];

  return {
    accounts,
    localAccount:
      localAccount ??
      accounts.find(
        (account) => account.enabled !== false && account.connectionState === "connected"
      ) ??
      null,
    retryBaseMs:
      typeof retryBaseMs === "number" && Number.isFinite(retryBaseMs) && retryBaseMs >= 0
        ? Math.trunc(retryBaseMs)
        : 1500,
    maxRetries:
      typeof maxRetries === "number" && Number.isFinite(maxRetries) && maxRetries >= 1
        ? Math.trunc(maxRetries)
        : 2,
  };
}

function resolveAssistantAccounts(raw: SettingsInput): Account[] | undefined {
  if (Array.isArray(raw.assistantAccounts)) {
    return raw.assistantAccounts;
  }
  if (Array.isArray(raw[ASSISTANT_ACCOUNTS_SETTINGS_KEY])) {
    return raw[ASSISTANT_ACCOUNTS_SETTINGS_KEY];
  }
  return undefined;
}

function resolveAssistantSlot(raw: SettingsInput): SlotSettings | undefined {
  if (isPlainObject(raw.assistantSlot)) {
    return raw.assistantSlot;
  }
  if (isPlainObject(raw[ASSISTANT_SLOT_SETTINGS_KEY])) {
    return raw[ASSISTANT_SLOT_SETTINGS_KEY];
  }
  return undefined;
}

function normalizeKnownSettings(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === undefined || typeof raw !== "object") {
    return {};
  }

  const r = raw as SettingsInput;
  const out: Partial<AppSettings> = {};

  if (isPlainObject(r.user)) {
    out.user = {
      ...r.user,
      ...(typeof r.user.email === "string" ? { email: r.user.email.trim().toLowerCase() } : {}),
    };
  }

  if (isPlainObject(r.general)) {
    out.general = r.general;
  }

  const capture = normalizeCaptureSettings(
    r.capture,
    isPlainObject(r.general) ? r.general["language"] : "tr"
  );
  if (capture !== undefined) {
    out.capture = capture;
  }

  const voiceCommands = normalizeVoiceCommandSettings(r.voiceCommands, r.capture);
  if (voiceCommands !== undefined) {
    out.voiceCommands = voiceCommands;
  }

  const integrations: NonNullable<AppSettings["integrations"]> = {};
  const gd = r.integrations?.googledrive;
  if (isPlainObject(gd)) {
    integrations.googledrive = gd;
  }

  const mailTransport = normalizeMailTransportSettings(r.integrations?.mailTransport);
  if (mailTransport !== undefined) {
    integrations.mailTransport = mailTransport;
  }

  const us1Relay = normalizeUs1RelaySettings(r.integrations?.us1Relay);
  if (us1Relay !== undefined) {
    integrations.us1Relay = us1Relay;
  }

  if (Object.keys(integrations).length > 0) {
    out.integrations = integrations;
  }

  const accounts = normalizeAccounts(r.accounts);
  if (accounts !== undefined) {
    out.accounts = accounts;
  }

  const remoteUsers = normalizeRemoteUsers(r.remoteUsers);
  if (remoteUsers !== undefined) {
    out.remoteUsers = remoteUsers;
  }

  const projectAiSessions = normalizeProjectAiSessions(r.projectAiSessions);
  if (projectAiSessions !== undefined) {
    out.projectAiSessions = projectAiSessions;
  }

  const assistantAccounts = resolveAssistantAccounts(r);
  if (Array.isArray(assistantAccounts)) {
    out.assistantAccounts = assistantAccounts;
  }

  const slots: { ai1?: SlotSettings; ai2?: SlotSettings; [key: string]: SlotSettings | undefined } =
    {};
  ["ai1", "ai2"].forEach((slot) => {
    const slotData = r.slots?.[slot];
    if (!isPlainObject(slotData)) {
      return;
    }
    slots[slot] = {
      accountId: slotData.accountId ?? null,
      catchCommands: typeof slotData.catchCommands === "boolean" ? slotData.catchCommands : true,
      disabledCommands: Array.isArray(slotData.disabledCommands)
        ? slotData.disabledCommands.filter((item): item is string => typeof item === "string")
        : [],
      resumeLastSession:
        typeof slotData.resumeLastSession === "boolean" ? slotData.resumeLastSession : true,
      rememberConnectionStatus:
        typeof slotData.rememberConnectionStatus === "boolean"
          ? slotData.rememberConnectionStatus
          : false,
      lastConnectionState:
        slotData.lastConnectionState === "connected" ||
        slotData.lastConnectionState === "disconnected"
          ? slotData.lastConnectionState
          : "disconnected",
      messageMethod: ((slotData.messageMethod as string | undefined) ??
        "injection") as MessageMethod,
      fileMethod: ((slotData.fileMethod as string | undefined) ?? "dragdrop") as UploadMethod,
    };
  });
  out.slots = slots as { ai1: SlotSettings; ai2: SlotSettings; [key: string]: SlotSettings };

  const us1Slot = normalizeUs1Slot(r.us1Slot);
  if (us1Slot !== undefined) {
    out.us1Slot = us1Slot;
  }

  const assistantSlot = resolveAssistantSlot(r);
  if (isPlainObject(assistantSlot)) {
    out.assistantSlot = {
      accountId: assistantSlot.accountId ?? null,
      catchCommands:
        typeof assistantSlot.catchCommands === "boolean" ? assistantSlot.catchCommands : true,
      disabledCommands: Array.isArray(assistantSlot.disabledCommands)
        ? assistantSlot.disabledCommands.filter((item): item is string => typeof item === "string")
        : [],
      messageMethod: assistantSlot.messageMethod ?? "injection",
      fileMethod: assistantSlot.fileMethod ?? "injection",
    };
  }

  if (isPlainObject(r.assistants)) {
    out.assistants = r.assistants;
  }

  if (isPlainObject(r.scene)) {
    out.scene = r.scene;
  }

  if (isPlainObject(r.logging)) {
    out.logging = r.logging;
  }

  return out;
}

export function normalizeSettings(raw: unknown): AppSettings {
  const defaults = defaultSettings();
  const normalizedInput = normalizeKnownSettings(raw);

  const merged = mergeDefaults(normalizedInput, defaults) as AppSettings;

  if (!Array.isArray(merged.accounts)) {
    merged.accounts = [];
  } else {
    merged.accounts = normalizeAccounts(merged.accounts) ?? [];
  }

  if (!Array.isArray(merged.remoteUsers)) {
    merged.remoteUsers = createDefaultRemoteUsers();
  } else {
    merged.remoteUsers = normalizeRemoteUsers(merged.remoteUsers) ?? createDefaultRemoteUsers();
  }
  merged.remoteUsers = mergeRemoteUsersWithAccountFallback(merged.remoteUsers, merged.accounts);
  merged.accounts = mergeUnifiedAccounts(merged.accounts, merged.remoteUsers);
  merged.projectAiSessions = normalizeProjectAiSessions(merged.projectAiSessions) ?? [];

  if (!isPlainObject(merged.general)) {
    merged.general = defaults.general ?? { language: "tr" };
  }
  const legacyTheme = (merged.general as Record<string, unknown>)["theme"];
  merged.general.language = normalizeAppLanguage(merged.general.language);
  merged.general.transcriptBackend = normalizeLocalTranscriptBackend(
    merged.general.transcriptBackend
  );
  merged.general.transcriptModelVariant = normalizeTranscriptModelVariant(
    merged.general.transcriptModelVariant,
    defaults.general?.transcriptModelVariant ?? "full"
  );
  merged.general.appearance = normalizeThemeAppearanceSettings(
    merged.general.appearance,
    legacyTheme
  );
  delete (merged.general as Record<string, unknown>)["theme"];

  if (!isPlainObject(merged.scene)) {
    merged.scene = defaults.scene ?? {
      appearance: { ...DEFAULT_SCENE_APPEARANCE_SETTINGS },
    };
  }
  merged.scene.appearance = normalizeSceneAppearanceSettings(merged.scene.appearance);

  if (!Array.isArray(merged.assistantAccounts)) {
    merged.assistantAccounts = [createDefaultAssistantAccount(), createDefaultOpencodeUiAccount()];
  } else if (merged.assistantAccounts.length === 0) {
    merged.assistantAccounts = [createDefaultAssistantAccount(), createDefaultOpencodeUiAccount()];
  } else {
    if (
      !merged.assistantAccounts.find((a: { id: string }) => a.id === DEFAULT_OPENCODE_UI_ACCOUNT_ID)
    ) {
      merged.assistantAccounts.splice(1, 0, createDefaultOpencodeUiAccount());
    }
    if (
      !merged.assistantAccounts.find((a: { id: string }) => a.id === DEFAULT_ASSISTANT_ACCOUNT_ID)
    ) {
      merged.assistantAccounts.unshift(createDefaultAssistantAccount());
    }
  }

  merged.assistantAccounts.forEach((account) => {
    const dbPath = (account as { dbPath?: unknown }).dbPath;
    if (typeof dbPath !== "string" && dbPath !== null && dbPath !== undefined) {
      (account as { dbPath?: string | null }).dbPath = null;
    }
  });

  for (const slot of ["ai1", "ai2"] as const) {
    const id = merged.slots[slot].accountId;
    if (id === "" || typeof id === "undefined") {
      merged.slots[slot].accountId = null;
    }
    if (typeof merged.slots[slot].catchCommands !== "boolean") {
      merged.slots[slot].catchCommands = true;
    }
    if (!Array.isArray(merged.slots[slot].disabledCommands)) {
      merged.slots[slot].disabledCommands = [];
    }
    if (typeof merged.slots[slot].resumeLastSession !== "boolean") {
      merged.slots[slot].resumeLastSession = true;
    }
    if (typeof merged.slots[slot].rememberConnectionStatus !== "boolean") {
      merged.slots[slot].rememberConnectionStatus = false;
    }
    if (
      merged.slots[slot].lastConnectionState !== "connected" &&
      merged.slots[slot].lastConnectionState !== "disconnected"
    ) {
      merged.slots[slot].lastConnectionState = "disconnected";
    }
    merged.slots[slot].messageMethod ??= "injection";
    merged.slots[slot].fileMethod ??= "dragdrop";
  }

  if (!isPlainObject(merged.us1Slot)) {
    merged.us1Slot = defaults.us1Slot ?? {
      communicationSystem: "mail",
      selectedIdentityId: null,
      selectedRemoteUserId: null,
      selectedAccountId: null,
      connectionState: "disconnected",
      relayConnectionState: "disconnected",
      catchCommands: true,
      disabledCommands: [],
      resumeLastSession: true,
      rememberConnectionStatus: false,
      lastConnectionState: "disconnected",
    };
  }
  const us1Slot = merged.us1Slot;
  us1Slot.communicationSystem = normalizeUs1CommunicationSystem(us1Slot.communicationSystem);
  if (typeof us1Slot.selectedIdentityId !== "string" || us1Slot.selectedIdentityId.trim() === "") {
    us1Slot.selectedIdentityId =
      typeof us1Slot.selectedRemoteUserId === "string" && us1Slot.selectedRemoteUserId.trim() !== ""
        ? us1Slot.selectedRemoteUserId.trim()
        : null;
  }
  if (
    typeof us1Slot.selectedRemoteUserId !== "string" ||
    us1Slot.selectedRemoteUserId.trim() === ""
  ) {
    us1Slot.selectedRemoteUserId = us1Slot.selectedIdentityId ?? null;
  }
  if (
    us1Slot.selectedIdentityId !== null &&
    us1Slot.selectedRemoteUserId !== us1Slot.selectedIdentityId
  ) {
    us1Slot.selectedRemoteUserId = us1Slot.selectedIdentityId;
  }
  if (typeof us1Slot.selectedAccountId !== "string" || us1Slot.selectedAccountId.trim() === "") {
    us1Slot.selectedAccountId =
      us1Slot.selectedIdentityId !== null
        ? buildRemoteEmailAccountId(us1Slot.selectedIdentityId)
        : null;
  } else if (
    us1Slot.selectedIdentityId !== null &&
    extractUs1RemoteIdentityIdFromAccountId(us1Slot.selectedAccountId) !==
      us1Slot.selectedIdentityId
  ) {
    us1Slot.selectedAccountId = buildRemoteEmailAccountId(us1Slot.selectedIdentityId);
  }
  if (us1Slot.selectedIdentityId === null && us1Slot.selectedAccountId !== null) {
    us1Slot.selectedIdentityId =
      extractUs1RemoteIdentityIdFromAccountId(us1Slot.selectedAccountId) ?? null;
    us1Slot.selectedRemoteUserId = us1Slot.selectedIdentityId;
  }
  if (us1Slot.connectionState !== "connected" && us1Slot.connectionState !== "disconnected") {
    us1Slot.connectionState = "disconnected";
  }
  us1Slot.relayConnectionState = normalizeUs1RelayConnectionState(us1Slot.relayConnectionState);
  if (typeof us1Slot.catchCommands !== "boolean") {
    us1Slot.catchCommands = true;
  }
  if (!Array.isArray(us1Slot.disabledCommands)) {
    us1Slot.disabledCommands = [];
  }
  if (typeof us1Slot.resumeLastSession !== "boolean") {
    us1Slot.resumeLastSession = true;
  }
  if (typeof us1Slot.rememberConnectionStatus !== "boolean") {
    us1Slot.rememberConnectionStatus = false;
  }
  if (
    us1Slot.lastConnectionState !== "connected" &&
    us1Slot.lastConnectionState !== "disconnected"
  ) {
    us1Slot.lastConnectionState = "disconnected";
  }
  if (
    us1Slot.selectedIdentityId === null ||
    !merged.remoteUsers.some(
      (identity) =>
        identity.remoteUserId === us1Slot.selectedIdentityId && identity.handshakeState === "active"
    )
  ) {
    us1Slot.connectionState = "disconnected";
  }

  if (!isPlainObject(merged.assistantSlot)) {
    merged.assistantSlot = defaults.assistantSlot ?? {
      accountId: DEFAULT_ASSISTANT_ACCOUNT_ID,
      catchCommands: true,
      disabledCommands: [],
      messageMethod: "injection",
      fileMethod: "injection",
    };
  }
  if (
    merged.assistantSlot.accountId === "" ||
    typeof merged.assistantSlot.accountId === "undefined"
  ) {
    merged.assistantSlot.accountId = DEFAULT_ASSISTANT_ACCOUNT_ID;
  }
  if (typeof merged.assistantSlot.catchCommands !== "boolean") {
    merged.assistantSlot.catchCommands = true;
  }
  if (!Array.isArray(merged.assistantSlot.disabledCommands)) {
    merged.assistantSlot.disabledCommands = [];
  }
  merged.assistantSlot.messageMethod ??= "injection";
  merged.assistantSlot.fileMethod ??= "injection";

  if (!isPlainObject(merged.integrations)) {
    merged.integrations = defaults.integrations ?? {};
  }
  if (!isPlainObject(merged.integrations.googledrive)) {
    if (defaults.integrations?.googledrive) {
      merged.integrations.googledrive = defaults.integrations.googledrive;
    } else {
      delete merged.integrations.googledrive;
    }
  }
  const normalizedMailTransport = normalizeMailTransportSettings(merged.integrations.mailTransport);
  if (normalizedMailTransport !== undefined) {
    merged.integrations.mailTransport = normalizedMailTransport;
  } else if (defaults.integrations?.mailTransport) {
    merged.integrations.mailTransport = defaults.integrations.mailTransport;
  } else {
    delete merged.integrations.mailTransport;
  }
  const normalizedUs1Relay = normalizeUs1RelaySettings(merged.integrations.us1Relay);
  if (normalizedUs1Relay !== undefined) {
    merged.integrations.us1Relay = normalizedUs1Relay;
  } else if (defaults.integrations?.us1Relay) {
    merged.integrations.us1Relay = defaults.integrations.us1Relay;
  } else {
    delete merged.integrations.us1Relay;
  }
  const localMailAccount = merged.integrations.mailTransport?.localAccount;
  if (!isPlainObject(merged.user)) {
    merged.user = defaults.user ?? {
      nickname: "User",
      email: "",
      avatarPath: "src/assets/default.png",
    };
  }
  if (typeof merged.user.email !== "string") {
    merged.user.email = "";
  }
  if ((merged.user.email ?? "").trim() === "" && typeof localMailAccount?.email === "string") {
    merged.user.email = localMailAccount.email.trim().toLowerCase();
  }

  if (!isPlainObject(merged.assistants)) {
    merged.assistants = defaults.assistants ?? {};
  }
  if (!isAssistantProviderId(merged.assistants.preferred)) {
    merged.assistants.preferred = "opencode";
  }
  merged.assistantSlot.accountId = resolvePreferredAssistantAccountId(merged);
  if (typeof merged.assistants.resumeLastSession !== "boolean") {
    merged.assistants.resumeLastSession = true;
  }
  if (typeof merged.assistants.keepServersOnAppClose !== "boolean") {
    merged.assistants.keepServersOnAppClose = false;
  }
  if (
    typeof merged.assistants.lastOpencodeUrl !== "string" &&
    merged.assistants.lastOpencodeUrl !== null
  ) {
    merged.assistants.lastOpencodeUrl = null;
  }
  if (
    typeof merged.assistants.lastOpencodeUiSessionId !== "string" &&
    merged.assistants.lastOpencodeUiSessionId !== null
  ) {
    merged.assistants.lastOpencodeUiSessionId = null;
  }
  if (
    !isAssistantProviderId(merged.assistants.lastConnected) &&
    merged.assistants.lastConnected !== null
  ) {
    merged.assistants.lastConnected = null;
  }
  if (
    typeof merged.assistants.lastActiveRelay !== "string" &&
    merged.assistants.lastActiveRelay !== null
  ) {
    merged.assistants.lastActiveRelay = null;
  }
  if (!Array.isArray(merged.assistants.disabledMcpServers)) {
    merged.assistants.disabledMcpServers = [];
  }
  if (!isPlainObject(merged.assistants.opencode)) {
    merged.assistants.opencode = defaults.assistants?.opencode ?? {
      defaultPort: 4096,
    };
  }
  if ("binaryPath" in merged.assistants.opencode) {
    delete (merged.assistants.opencode as { binaryPath?: unknown }).binaryPath;
  }
  if (
    typeof merged.assistants.opencode.defaultPort !== "number" ||
    Number.isInteger(merged.assistants.opencode.defaultPort) !== true ||
    merged.assistants.opencode.defaultPort < 1024 ||
    merged.assistants.opencode.defaultPort > 65535
  ) {
    merged.assistants.opencode.defaultPort = 4096;
  }
  if (
    typeof merged.assistants.opencode.version !== "string" &&
    merged.assistants.opencode.version !== null
  ) {
    merged.assistants.opencode.version = null;
  }
  if (
    typeof merged.assistants.opencode.version === "string" &&
    merged.assistants.opencode.version.trim() === ""
  ) {
    merged.assistants.opencode.version = null;
  }
  if (!isPlainObject(merged.assistants.opencodeUi)) {
    merged.assistants.opencodeUi = defaults.assistants?.opencodeUi ?? {
      hiddenProviders: [],
      hiddenModels: [],
      disabledProviders: [],
      disabledModels: [],
      favoriteModels: [],
      defaultModelKey: null,
      lastSelectedModelKey: null,
    };
  }
  if (!Array.isArray(merged.assistants.opencodeUi.hiddenProviders)) {
    merged.assistants.opencodeUi.hiddenProviders = [];
  }
  if (!Array.isArray(merged.assistants.opencodeUi.hiddenModels)) {
    merged.assistants.opencodeUi.hiddenModels = [];
  }
  if (!Array.isArray(merged.assistants.opencodeUi.disabledProviders)) {
    merged.assistants.opencodeUi.disabledProviders = [];
  }
  if (!Array.isArray(merged.assistants.opencodeUi.disabledModels)) {
    merged.assistants.opencodeUi.disabledModels = [];
  }
  if (!Array.isArray(merged.assistants.opencodeUi.favoriteModels)) {
    merged.assistants.opencodeUi.favoriteModels = [];
  }
  if (
    typeof merged.assistants.opencodeUi.defaultModelKey !== "string" &&
    merged.assistants.opencodeUi.defaultModelKey !== null
  ) {
    merged.assistants.opencodeUi.defaultModelKey = null;
  }
  if (
    typeof merged.assistants.opencodeUi.lastSelectedModelKey !== "string" &&
    merged.assistants.opencodeUi.lastSelectedModelKey !== null
  ) {
    merged.assistants.opencodeUi.lastSelectedModelKey = null;
  }
  if (
    typeof merged.assistants.opencodeUi.defaultModelKey === "string" &&
    merged.assistants.opencodeUi.defaultModelKey.trim() === ""
  ) {
    merged.assistants.opencodeUi.defaultModelKey = null;
  }
  if (
    typeof merged.assistants.opencodeUi.lastSelectedModelKey === "string" &&
    merged.assistants.opencodeUi.lastSelectedModelKey.trim() === ""
  ) {
    merged.assistants.opencodeUi.lastSelectedModelKey = null;
  }

  if (!isPlainObject(merged.logging)) {
    merged.logging = defaults.logging ?? {};
  }
  if (merged.logging.level === undefined || merged.logging.level === "") {
    merged.logging.level = "info";
  }
  if (!Array.isArray(merged.logging.verboseModules)) {
    merged.logging.verboseModules = [];
  }
  if (!Array.isArray(merged.logging.silentModules)) {
    merged.logging.silentModules = [];
  }
  if (merged.logging.persistLevel === undefined || merged.logging.persistLevel === "") {
    merged.logging.persistLevel = "info";
  }
  if (typeof merged.logging.maxMemoryLogs !== "number") {
    merged.logging.maxMemoryLogs = 200;
  }
  if (typeof merged.logging.enableStateSnapshots !== "boolean") {
    merged.logging.enableStateSnapshots = true;
  }
  if (typeof merged.logging.snapshotInterval !== "number") {
    merged.logging.snapshotInterval = 60000;
  }

  return merged;
}

export function getChangedPaths(prev: unknown, next: unknown): string[] {
  if (prev === null || prev === undefined) {
    return ["*"];
  }
  const changed: string[] = [];

  const walk = (a: unknown, b: unknown, path: string): void => {
    if (a === b) return;
    const aObj = isPlainObject(a);
    const bObj = isPlainObject(b);
    if (aObj && bObj) {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) {
        walk(a[k], b[k], path !== "" ? `${path}.${k}` : k);
      }
      return;
    }
    const aArr = Array.isArray(a);
    const bArr = Array.isArray(b);
    if (aArr && bArr) {
      if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(path !== "" ? path : "*");
      return;
    }
    changed.push(path !== "" ? path : "*");
  };

  walk(prev, next, "");
  return changed.length > 0 ? changed : ["*"];
}
