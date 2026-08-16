import {
  DEFAULT_SCENE_APPEARANCE_SETTINGS,
  DEFAULT_THEME_APPEARANCE_SETTINGS,
  type Account,
  type AppSettings,
} from "./settings.js";
import { DEFAULT_APP_LANGUAGE } from "./i18n.js";
import {
  DEFAULT_AMBIENT_ACTIVE_WINDOW_MS,
  DEFAULT_AMBIENT_SILENCE_TIMEOUT_MS,
  DEFAULT_AMBIENT_WAKE_PHRASES,
} from "../../shared/capture/ambient-defaults.js";
import { DEFAULT_CAPTURE_COMMAND_PHRASES } from "../../shared/capture/command-catalog.js";

export const DEFAULT_ASSISTANT_ACCOUNT_ID = "opencode_opencode_at_opencode_com";
export const DEFAULT_OPENCODE_UI_ACCOUNT_ID = "opencode_ui_opencode_at_opencode_com";

function getDefaultOpencodeUiDbPath(): string {
  // Default to the POSIX-style user data path in settings scaffolding so
  // the default value remains stable across platforms and in test suites.
  return "~/.local/share/opencode/opencode.db";
}

export function createDefaultAssistantAccount(): Account {
  return {
    id: DEFAULT_ASSISTANT_ACCOUNT_ID,
    email: "opencode@opencode.com",
    provider: "opencode",
    nickname: "Rovo",
    avatarPath: "src/assets/opencode.png",
  };
}

export function createDefaultOpencodeUiAccount(): Account {
  return {
    id: DEFAULT_OPENCODE_UI_ACCOUNT_ID,
    email: "opencode-ui@opencode.com",
    provider: "opencode-ui",
    nickname: "Rovo",
    avatarPath: "src/assets/opencode.png",
    dbPath: getDefaultOpencodeUiDbPath(),
  };
}

export function createDefaultAssistantAccounts(): Account[] {
  return [createDefaultAssistantAccount(), createDefaultOpencodeUiAccount()];
}

export function createDefaultRemoteUsers(): NonNullable<AppSettings["remoteUsers"]> {
  return [];
}

export function createDefaultSettings(): AppSettings {
  const defaultGoogleDrive = {
    connected: false,
    email: "",
    accessToken: "",
    refreshToken: "",
    expiresAt: 0,
    clientId: "",
    clientSecret: "",
    authorizationCode: "",
    account: "",
  } as NonNullable<NonNullable<AppSettings["integrations"]>["googledrive"]>;

  const defaultMailTransport = {
    accounts: [],
    localAccount: null,
    retryBaseMs: 1500,
    maxRetries: 2,
  } as NonNullable<NonNullable<AppSettings["integrations"]>["mailTransport"]>;

  return {
    general: {
      appearance: { ...DEFAULT_THEME_APPEARANCE_SETTINGS },
      language: DEFAULT_APP_LANGUAGE,
      transcriptBackend: "whisper.cpp",
      transcriptModelVariant: "full",
    },
    capture: {
      defaults: {
        preferredDeviceId: null,
        defaultLens: "back",
        photoQuality: "high",
        photoFlashMode: "off",
        attachMode: "manual-sync",
        commandConfirmation: "toast",
        dictationMode: "local",
        dictationLanguage: "tr",
        androidTranscriptModelVariant: "light",
        androidDictationBackend: "vosk",
        ttsMode: "local",
        ttsLanguage: "tr",
      },
      providers: {
        androidCompanionEnabled: true,
        androidTorchEnabled: false,
      },
    },
    voiceCommands: {
      analyzeEnabled: false,
      analyzePhrases: {
        openCamera: [...DEFAULT_CAPTURE_COMMAND_PHRASES.openCamera],
        capture: [...DEFAULT_CAPTURE_COMMAND_PHRASES.capture],
        stop: [...DEFAULT_CAPTURE_COMMAND_PHRASES.stop],
      },
      ambient: {
        wakePhrases: [...DEFAULT_AMBIENT_WAKE_PHRASES],
        activeWindowMs: DEFAULT_AMBIENT_ACTIVE_WINDOW_MS,
        silenceTimeoutMs: DEFAULT_AMBIENT_SILENCE_TIMEOUT_MS,
      },
    },
    scene: {
      appearance: { ...DEFAULT_SCENE_APPEARANCE_SETTINGS },
    },
    user: { nickname: "User", email: "", avatarPath: "src/assets/default.png" },
    integrations: {
      googledrive: defaultGoogleDrive,
      mailTransport: defaultMailTransport,
      us1Relay: {
        enabled: false,
        baseUrl: null,
        trustedServerFingerprint: null,
        trustState: "unknown",
        encryptionPublicKey: null,
        encryptionKeyFingerprint: null,
        signingPublicKey: null,
        signingKeyFingerprint: null,
        protocolVersion: 1,
        connectionState: "disconnected",
        lastError: null,
        lastConnectedAt: null,
      },
    },
    accounts: [],
    remoteUsers: createDefaultRemoteUsers(),
    projectAiSessions: [],
    us1Slot: {
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
    },
    assistantAccounts: createDefaultAssistantAccounts(),
    slots: {
      ai1: {
        accountId: null,
        catchCommands: true,
        disabledCommands: [],
        resumeLastSession: true,
        rememberConnectionStatus: false,
        lastConnectionState: "disconnected",
        messageMethod: "injection",
        fileMethod: "dragdrop",
      },
      ai2: {
        accountId: null,
        catchCommands: true,
        disabledCommands: [],
        resumeLastSession: true,
        rememberConnectionStatus: false,
        lastConnectionState: "disconnected",
        messageMethod: "injection",
        fileMethod: "dragdrop",
      },
    },
    assistantSlot: {
      accountId: DEFAULT_ASSISTANT_ACCOUNT_ID,
      catchCommands: true,
      disabledCommands: [],
      messageMethod: "injection",
      fileMethod: "injection",
    },
    assistants: {
      preferred: "opencode",
      lastConnected: null,
      resumeLastSession: true,
      keepServersOnAppClose: false,
      lastOpencodeUrl: null,
      lastOpencodeUiSessionId: null,
      lastActiveRelay: null,
      disabledMcpServers: [],
      opencode: {
        defaultPort: 4096,
        version: null,
      },
      opencodeUi: {
        hiddenProviders: [],
        hiddenModels: [],
        disabledProviders: [],
        disabledModels: [],
        favoriteModels: [],
        defaultModelKey: null,
        lastSelectedModelKey: null,
      },
    },
    logging: {
      level: "info",
      verboseModules: [],
      silentModules: [],
      persistLevel: "info",
      maxMemoryLogs: 200,
      enableStateSnapshots: true,
      snapshotInterval: 60000,
    },
  };
}
