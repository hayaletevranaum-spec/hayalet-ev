const { contextBridge, ipcRenderer } = require("electron");

const ALLOWED_IPC_RENDERER_CHANNELS = new Set(["log:ui-notify-batch"]);
const OPENCODE_UI_SESSION_UPDATED_CHANNEL = "opencode-ui:session-updated";
const PROVIDER_SCENARIO_PROGRESS_CHANNEL = "provider-scenario:progress";
const ROOM_TOOLS_PROGRESS_CHANNEL = "room-tools:progress";
const TRANSCRIPT_INGRESS_CHANNEL = "transcript:ingress";
const CAPTURE_MEDIA_INGRESS_CHANNEL = "capture:media-ingress";
const CAPTURE_DICTATION_STATUS_CHANNEL = "capture:dictation-status";
const CAPTURE_AMBIENT_STATUS_CHANNEL = "capture:ambient-status";
const TTS_STATUS_CHANNEL = "tts:status";
const OPERATIONS_STATUS_CHANNEL = "operations:status";
const SETTINGS_BROADCAST_NAME = "app-settings";
const opencodeUiSessionUpdatedHandlers = new Map();
const providerScenarioProgressHandlers = new Map();
const roomToolsProgressHandlers = new Map();
const transcriptIngressHandlers = new Map();
const captureMediaIngressHandlers = new Map();
const captureDictationStatusHandlers = new Map();
const captureAmbientStatusHandlers = new Map();
const ttsStatusHandlers = new Map();
const operationsStatusHandlers = new Map();
let __app_preload_locale = "tr";
let __app_preload_catalog = null;
let __app_preload_settings_channel = null;

const PRELOAD_DIAGNOSTIC_ONCE = new Set();
const STARTUP_ROOMS_SNAPSHOT_FLAG = "--app-rooms-snapshot";

function warnPreloadOnce(key, message, error) {
  if (PRELOAD_DIAGNOSTIC_ONCE.has(key)) return;
  PRELOAD_DIAGNOSTIC_ONCE.add(key);
  if (typeof console === "undefined" || typeof console.warn !== "function") return;
  if (error !== undefined) {
    console.warn(message, { error: getPreloadErrorMessage(error) });
    return;
  }
  console.warn(message);
}

function readArgFlagValue(argv, flagName) {
  const prefix = `${flagName}=`;
  const raw = argv.find((arg) => typeof arg === "string" && arg.startsWith(prefix));
  if (typeof raw !== "string") {
    return null;
  }
  const value = raw.slice(prefix.length).trim();
  return value === "" ? null : value;
}

function normalizeUiModeFlag(value) {
  return value === "scene" ? "scene" : "classic";
}

function readStartupRoomsSnapshotFromArgv(argv) {
  const raw = readArgFlagValue(argv, STARTUP_ROOMS_SNAPSHOT_FLAG);
  if (raw === null) {
    return null;
  }

  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    warnPreloadOnce(
      "startup-rooms-snapshot-invalid",
      "Failed to read startup rooms snapshot in preload.",
      error
    );
    return null;
  }
}

const STARTUP_ROOMS_SNAPSHOT = readStartupRoomsSnapshotFromArgv(process.argv || []);

const PRELOAD_MESSAGE_FALLBACKS = {
  en: {
    appScriptLoaded: "/js/app.js loaded via src.",
    disableSpellcheckFailed: "Failed to disable spellcheck: {{message}}",
    appScriptLoadFailed: "Failed to load /js/app.js via src: {{message}}",
    injectInitAppFailed: "injectInitApp failed: {{message}}",
    initFailed: "Preload initialization failed: {{message}}",
  },
  tr: {
    appScriptLoaded: "/js/app.js kaynak üzerinden yüklendi.",
    disableSpellcheckFailed: "Yazım denetimi kapatılamadı: {{message}}",
    appScriptLoadFailed: "/js/app.js kaynak üzerinden yüklenemedi: {{message}}",
    injectInitAppFailed: "injectInitApp başarısız: {{message}}",
    initFailed: "Preload başlatma hatası: {{message}}",
  },
};

function normalizePreloadLocale(value) {
  if (typeof value !== "string") {
    return "tr";
  }

  const normalized = value.trim().toLowerCase().replace(/_/g, "-");
  return normalized !== "" ? normalized : "tr";
}

function resolvePreloadMessageLocale(value) {
  const normalized = normalizePreloadLocale(value);
  return normalized === "tr" || normalized.startsWith("tr-") ? "tr" : "en";
}

function readCatalogValue(catalog, path) {
  if (!catalog || typeof catalog !== "object") {
    return null;
  }

  const parts = path.split(".");
  let current = catalog;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return null;
    }
    current = current[part];
  }

  return typeof current === "string" ? current : null;
}

function readLocaleFromSettings(settings) {
  return normalizePreloadLocale(settings && settings.general && settings.general.language);
}

function getPreloadFallbackTemplate(key) {
  const messageLocale = resolvePreloadMessageLocale(__app_preload_locale);
  return (
    (PRELOAD_MESSAGE_FALLBACKS[messageLocale] && PRELOAD_MESSAGE_FALLBACKS[messageLocale][key]) ||
    PRELOAD_MESSAGE_FALLBACKS.en[key] ||
    key
  );
}

async function syncPreloadLocale(nextSettings) {
  let nextLocale;

  try {
    const settings =
      nextSettings && typeof nextSettings === "object"
        ? nextSettings
        : await ipcRenderer.invoke("load-settings");
    nextLocale = readLocaleFromSettings(settings);
  } catch (err) {
    warnPreloadOnce(
      "preload-locale-settings",
      "[preload] failed to load settings for locale sync",
      err
    );
    nextLocale = normalizePreloadLocale(__app_preload_locale);
  }

  __app_preload_locale = nextLocale;

  try {
    const pack = await ipcRenderer.invoke("i18n-load-language", nextLocale);
    const resolvedLocale =
      pack && typeof pack.locale === "string" ? normalizePreloadLocale(pack.locale) : nextLocale;
    __app_preload_locale = resolvedLocale;
    __app_preload_catalog =
      pack && pack.catalog && typeof pack.catalog === "object" ? pack.catalog : null;
  } catch (err) {
    warnPreloadOnce(
      "preload-locale-pack",
      "[preload] failed to load language pack for locale sync",
      err
    );
    __app_preload_catalog = null;
    __app_preload_locale = nextLocale;
  }

  return __app_preload_locale;
}

function startPreloadLocaleSync() {
  if (
    typeof globalThis.BroadcastChannel !== "function" ||
    __app_preload_settings_channel !== null
  ) {
    return;
  }

  try {
    __app_preload_settings_channel = new globalThis.BroadcastChannel(SETTINGS_BROADCAST_NAME);
    __app_preload_settings_channel.onmessage = (event) => {
      const message = event && typeof event === "object" ? event.data : null;
      if (!message || typeof message !== "object" || message.type !== "settings-changed") {
        return;
      }
      void syncPreloadLocale(message.payload);
    };
  } catch (err) {
    warnPreloadOnce(
      "preload-broadcast-channel",
      "[preload] settings broadcast channel failed to initialize",
      err
    );
    __app_preload_settings_channel = null;
  }
}

function getPreloadErrorMessage(error) {
  if (error && typeof error.message === "string" && error.message.trim() !== "") {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim() !== "") {
    return error.trim();
  }

  try {
    return JSON.stringify(error);
  } catch (_) {
    return String(error);
  }
}

function preloadT(key, params) {
  const messageLocale = resolvePreloadMessageLocale(__app_preload_locale);
  const template =
    readCatalogValue(__app_preload_catalog, `electron.preload.${key}.${messageLocale}`) ||
    readCatalogValue(__app_preload_catalog, "electron.preload." + key) ||
    getPreloadFallbackTemplate(key) ||
    key;

  return template.replace(/\{\{(\w+)\}\}/g, (_, token) => {
    const value =
      params && Object.prototype.hasOwnProperty.call(params, token) ? params[token] : "";
    return value == null ? "" : String(value);
  });
}

startPreloadLocaleSync();

contextBridge.exposeInMainWorld("electronAPI", {
  readDirectoryFiles: (dirPath) => ipcRenderer.invoke("read-directory-files", dirPath),
  loadSettings: () => ipcRenderer.invoke("load-settings"),
  saveSettings: async (settings) => {
    const result = await ipcRenderer.invoke("save-settings", settings);
    void syncPreloadLocale(settings);
    return result;
  },
  us1UpsertMailAccount: (draft, options) =>
    ipcRenderer.invoke("us1-upsert-mail-account", draft, options),
  us1VerifyMailAccount: (params) => ipcRenderer.invoke("us1-verify-mail-account", params),
  us1DeleteMailAccount: (params) => ipcRenderer.invoke("us1-delete-mail-account", params),
  us1InviteRemoteUser: (params) => ipcRenderer.invoke("us1-invite-remote-user", params),
  us1AcceptRemoteUser: (params) => ipcRenderer.invoke("us1-accept-remote-user", params),
  us1RejectRemoteUser: (params) => ipcRenderer.invoke("us1-reject-remote-user", params),
  us1SyncRemoteUsers: (params) => ipcRenderer.invoke("us1-sync-remote-users", params),
  us1SendMessage: (params) => ipcRenderer.invoke("us1-send-message", params),
  us1SyncMessages: (params) => ipcRenderer.invoke("us1-sync-messages", params),
  us1RelayHealthCheck: (params) => ipcRenderer.invoke("us1-relay-health-check", params),
  us1MailStartGmailOauth: () => ipcRenderer.invoke("us1-mail-start-gmail-oauth"),
  us1MailExchangeGmailCode: (params) => ipcRenderer.invoke("us1-mail-exchange-gmail-code", params),
  us1MailListenGmailCode: () => ipcRenderer.invoke("us1-mail-listen-gmail-code"),
  i18nListLanguages: () => ipcRenderer.invoke("i18n-list-languages"),
  i18nLoadLanguage: (locale) => ipcRenderer.invoke("i18n-load-language", locale),
  showOpenDialog: (options) => ipcRenderer.invoke("show-open-dialog", options),
  showMessageBox: (options) => ipcRenderer.invoke("show-message-box", options),
  backupCreate: (payload) => ipcRenderer.invoke("backup-create", payload),
  backupList: (payload) => ipcRenderer.invoke("backup-list", payload),
  backupDelete: (payload) => ipcRenderer.invoke("backup-delete", payload),
  backupScopes: () => ipcRenderer.invoke("backup-scopes"),
  backupPresets: () => ipcRenderer.invoke("backup-presets"),
  backupInspect: (payload) => ipcRenderer.invoke("backup-inspect", payload),
  backupPreview: (payload) => ipcRenderer.invoke("backup-preview", payload),
  backupRestore: (payload) => ipcRenderer.invoke("backup-restore", payload),
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
  loadProtocols: () => ipcRenderer.invoke("load-protocols"),
  saveProtocol: (key, content) => ipcRenderer.invoke("save-protocol", key, content),
  roomsListWorkspace: () => ipcRenderer.invoke("rooms-list-workspace"),
  roomsListInstalled: () => ipcRenderer.invoke("rooms-list-installed"),
  roomsSyncLinkedStartup: () => ipcRenderer.invoke("rooms-sync-linked-startup"),
  roomsInstallFromWorkspace: (roomId) => ipcRenderer.invoke("rooms-install-from-workspace", roomId),
  roomsRemoveInstalled: (payload) => ipcRenderer.invoke("rooms-remove-installed", payload),
  roomsDeleteWorkspace: (payload) => ipcRenderer.invoke("rooms-delete-workspace", payload),
  roomsExportToWorkspace: (payload) => ipcRenderer.invoke("rooms-export-to-workspace", payload),
  roomsPackageFromWorkspace: (payload) =>
    ipcRenderer.invoke("rooms-package-from-workspace", payload),
  roomsImportBundle: (payload) => ipcRenderer.invoke("rooms-import-bundle", payload),
  sceneThemesListInstalled: () => ipcRenderer.invoke("scene-themes-list-installed"),
  sceneThemesPackageInstalled: (payload) =>
    ipcRenderer.invoke("scene-themes-package-installed", payload),
  sceneThemesImportBundle: (payload) => ipcRenderer.invoke("scene-themes-import-bundle", payload),
  commandInit: () => ipcRenderer.invoke("command-init"),
  commandWrite: (item) => ipcRenderer.invoke("command-write", item),
  commandMove: (id, status, reason) => ipcRenderer.invoke("command-move", id, status, reason),
  commandPaths: () => ipcRenderer.invoke("command-paths"),
  commandStageAttachments: (payload) => ipcRenderer.invoke("command-stage-attachments", payload),
  commandStageTemp: (payload) => ipcRenderer.invoke("command-stage-temp", payload),
  commandCleanupTemp: (payload) => ipcRenderer.invoke("command-cleanup-temp", payload),
  commandMoveFailed: (payload) => ipcRenderer.invoke("command-move-failed", payload),
  commandArchiveCopy: (payload) => ipcRenderer.invoke("command-archive-copy", payload),
  commandCleanupJob: (payload) => ipcRenderer.invoke("command-cleanup-job", payload),
  copyToAssets: (srcPath, role, accountInfo) =>
    ipcRenderer.invoke("copy-to-assets", srcPath, role, accountInfo),
  deleteAsset: (assetPath) => ipcRenderer.invoke("delete-asset", assetPath),
  copyFileTo: (srcPath, destDir) => ipcRenderer.invoke("copy-file-to", srcPath, destDir),
  openPath: (path) => ipcRenderer.invoke("open-path", path),
  fmEnsureDirs: (scope) => ipcRenderer.invoke("fm-ensure-dirs", scope),
  fmTempPath: (prefix, ext) => ipcRenderer.invoke("fm-temp-path", prefix, ext),
  fmWriteFileAtomic: (payload) => ipcRenderer.invoke("fm-write-file-atomic", payload),
  roomToolsCall: (request) => ipcRenderer.invoke("room-tools-call", request),
  roomToolsCancel: (request) => ipcRenderer.invoke("room-tools-cancel", request),
  onRoomToolsProgress: (callback) => {
    if (typeof callback !== "function" || roomToolsProgressHandlers.has(callback)) {
      return;
    }
    const handler = (_event, payload) => callback(payload);
    roomToolsProgressHandlers.set(callback, handler);
    ipcRenderer.on(ROOM_TOOLS_PROGRESS_CHANNEL, handler);
  },
  offRoomToolsProgress: (callback) => {
    const handler = roomToolsProgressHandlers.get(callback);
    if (!handler) return;
    ipcRenderer.removeListener(ROOM_TOOLS_PROGRESS_CHANNEL, handler);
    roomToolsProgressHandlers.delete(callback);
  },
  getPreloadPath: (type) => ipcRenderer.invoke("get-preload-path", type),
  getProviderConfig: (providerId) => ipcRenderer.invoke("get-provider-config", providerId),
  runProviderScenario: (params) => ipcRenderer.invoke("run-provider-scenario", params),
  cancelProviderScenario: (params) => ipcRenderer.invoke("cancel-provider-scenario", params),
  testProvider: (params) => ipcRenderer.invoke("test-provider", params),
  onProviderScenarioProgress: (callback) => {
    if (typeof callback !== "function" || providerScenarioProgressHandlers.has(callback)) {
      return;
    }
    const handler = (_event, payload) => callback(payload);
    providerScenarioProgressHandlers.set(callback, handler);
    ipcRenderer.on(PROVIDER_SCENARIO_PROGRESS_CHANNEL, handler);
  },
  offProviderScenarioProgress: (callback) => {
    const handler = providerScenarioProgressHandlers.get(callback);
    if (!handler) return;
    ipcRenderer.removeListener(PROVIDER_SCENARIO_PROGRESS_CHANNEL, handler);
    providerScenarioProgressHandlers.delete(callback);
  },
  onProviderTestProgress: (callback) => {
    if (typeof callback !== "function" || providerScenarioProgressHandlers.has(callback)) {
      return;
    }
    const handler = (_event, payload) => callback(payload);
    providerScenarioProgressHandlers.set(callback, handler);
    ipcRenderer.on(PROVIDER_SCENARIO_PROGRESS_CHANNEL, handler);
  },
  offProviderTestProgress: (callback) => {
    const handler = providerScenarioProgressHandlers.get(callback);
    if (!handler) return;
    ipcRenderer.removeListener(PROVIDER_SCENARIO_PROGRESS_CHANNEL, handler);
    providerScenarioProgressHandlers.delete(callback);
  },
  sendToHost: (channel, data) => ipcRenderer.sendToHost(channel, data),

  dbDeleteAccount: (params) => ipcRenderer.invoke("db-delete-account", params),
  dbInitAccount: (params) => ipcRenderer.invoke("db-init-account", params),
  dbGetConversations: (params) => ipcRenderer.invoke("db-get-conversations", params),
  dbGetMessages: (params) => ipcRenderer.invoke("db-get-messages", params),
  dbSyncMessages: (params) => ipcRenderer.invoke("db-sync-messages", params),
  dbSaveAttachment: (params) => ipcRenderer.invoke("db-save-attachment", params),
  dbSaveAttachmentContent: (params) => ipcRenderer.invoke("db-save-attachment-content", params),
  dbGetAttachments: (params) => ipcRenderer.invoke("db-get-attachments", params),
  dbDeleteConversation: (params) => ipcRenderer.invoke("db-delete-conversation", params),
  dbSearchMessages: (params) => ipcRenderer.invoke("db-search-messages", params),
  dbSearchAttachments: (params) => ipcRenderer.invoke("db-search-attachments", params),
  dbSearchAllAccounts: (params) => ipcRenderer.invoke("db-search-all-accounts", params),
  dbUpdateConversation: (params) => ipcRenderer.invoke("db-update-conversation", params),

  logger: {
    appendBatch: (entries) => {
      ipcRenderer.send("logger:appendBatch", entries);
      return Promise.resolve({ success: true });
    },
    getSessionId: () => ipcRenderer.invoke("get-session-id"),
    readAllLogs: (sessionId) => ipcRenderer.invoke("read-all-logs", sessionId),
    queryLogs: (query) => ipcRenderer.invoke("query-logs", query),
    listSessions: () => ipcRenderer.invoke("list-sessions"),
    deleteInactiveSessions: () => ipcRenderer.invoke("delete-inactive-log-sessions"),
    getAppState: () => ipcRenderer.invoke("get-app-state"),
    writeStateSnapshot: () => ipcRenderer.invoke("write-state-snapshot"),
    setupWebviewLogger: (webviewId, slot, provider) =>
      ipcRenderer.invoke("setup-webview-logger", webviewId, slot, provider),
    generateCorrelationId: (prefix) => ipcRenderer.invoke("generate-correlation-id", prefix),
    readConsoleLogs: (tail) => ipcRenderer.invoke("read-console-logs", tail),
    readErrorLogs: (tail) => ipcRenderer.invoke("read-error-logs", tail),
    getLogPaths: () => ipcRenderer.invoke("get-log-paths"),
  },
  whisperLoad: (params) => ipcRenderer.invoke("whisper-load", params),
  whisperSave: (params) => ipcRenderer.invoke("whisper-save", params),
  capturePage: (type, region) => ipcRenderer.invoke("capture-page", type, region),
  captureWebContentsPage: (targetContentsId, region) =>
    ipcRenderer.invoke("capture-webcontents-page", targetContentsId, region),
  screenshotCapture: (options) => ipcRenderer.invoke("screenshot-capture", options),
  catboxUpload: (payload) => ipcRenderer.invoke("catbox-upload", payload),
  uguuUpload: (payload) => ipcRenderer.invoke("uguu-upload", payload),
  googledriveStartAuth: () => ipcRenderer.invoke("googledrive-start-auth"),
  googledriveExchangeCode: (code) => ipcRenderer.invoke("googledrive-exchange-code", code),
  googledriveUpload: (payload) => ipcRenderer.invoke("googledrive-upload", payload),
  googledriveDisconnect: () => ipcRenderer.invoke("googledrive-disconnect"),
  windowMinimize: () => ipcRenderer.send("window-minimize"),
  windowToggleFullscreen: () => ipcRenderer.send("window-toggle-fullscreen"),
  windowClose: () => ipcRenderer.send("window-close"),
  windowMinimizeToTray: () => ipcRenderer.send("window-minimize-to-tray"),
  appRestart: (options) => ipcRenderer.invoke("app-restart", options),
  openTerminal: (path) => ipcRenderer.invoke("open-terminal", path),
  assistantRuntimeRead: () => ipcRenderer.invoke("assistant-runtime-read"),
  assistantRuntimeWrite: (payload) => ipcRenderer.invoke("assistant-runtime-write", payload),
  rovoInteractionContextRead: () => ipcRenderer.invoke("rovo-interaction-context-read"),
  shellOpenPath: (path) => ipcRenderer.invoke("shell-open-path", path),
  deviceAction: (action, payload) => ipcRenderer.invoke("device-action", action, payload),
  generateTree: (basePath, options) => ipcRenderer.invoke("generate-tree", basePath, options),

  memorySearch: (params) => ipcRenderer.invoke("memory-search", params),
  memoryStats: (params) => ipcRenderer.invoke("memory-stats", params),
  memoryDelete: (params) => ipcRenderer.invoke("memory-delete", params),
  memoryUpdate: (params) => ipcRenderer.invoke("memory-update", params),
  memoryWrite: (params) => ipcRenderer.invoke("memory-write", params),
  memoryPrune: (params) => ipcRenderer.invoke("memory-prune", params),
  memoryDeleteAll: (params) => ipcRenderer.invoke("memory-delete-all", params),

  opencodeServeStart: (options) => ipcRenderer.invoke("opencode-serve-start", options),
  opencodeServeStop: () => ipcRenderer.invoke("opencode-serve-stop"),
  opencodeServeStatus: () => ipcRenderer.invoke("opencode-serve-status"),
  opencodeServeFindPort: (start, end) => ipcRenderer.invoke("opencode-serve-find-port", start, end),
  opencodeServeFindRunning: (start, end) =>
    ipcRenderer.invoke("opencode-serve-find-running", start, end),
  opencodeServeHealth: (url) => ipcRenderer.invoke("opencode-serve-health", url),
  opencodeServeDoctor: (options) => ipcRenderer.invoke("opencode-serve-doctor", options),
  llmServeStart: (payload) => ipcRenderer.invoke("llm-serve-start", payload),
  llmServeStop: (payload) => ipcRenderer.invoke("llm-serve-stop", payload),
  llmServeStatus: () => ipcRenderer.invoke("llm-serve-status"),
  opencodeCheckUpdates: (installedVersion) =>
    ipcRenderer.invoke("opencode-check-updates", installedVersion),
  opencodeLaunchInstall: () => ipcRenderer.invoke("opencode-launch-install"),

  opencodeUiApiProxy: (options) => ipcRenderer.invoke("opencode-ui-api-proxy", options),
  opencodeUiFsListSessions: (dbPath) => ipcRenderer.invoke("opencode-ui-fs-list-sessions", dbPath),
  opencodeUiFsEnsureSession: (sessionId, title, dbPath) =>
    ipcRenderer.invoke("opencode-ui-fs-ensure-session", sessionId, title, dbPath),
  opencodeUiFsReadSession: (sessionId, dbPath) =>
    ipcRenderer.invoke("opencode-ui-fs-read-session", sessionId, dbPath),
  opencodeUiFsArchiveSession: (sessionId, archived, dbPath) =>
    ipcRenderer.invoke("opencode-ui-fs-archive-session", sessionId, archived, dbPath),
  opencodeUiQuickPromptsRead: () => ipcRenderer.invoke("opencode-ui-quick-prompts-read"),
  opencodeUiQuickPromptsWrite: (prompts) =>
    ipcRenderer.invoke("opencode-ui-quick-prompts-write", prompts),
  opencodeUiSharedStateRead: () => ipcRenderer.invoke("opencode-ui-shared-state-read"),
  opencodeUiSharedStateWrite: (state) =>
    ipcRenderer.invoke("opencode-ui-shared-state-write", state),
  opencodeUiSessionWatchStart: (sessionId, dbPath) =>
    ipcRenderer.invoke("opencode-ui-session-watch-start", sessionId, dbPath),
  opencodeUiSessionWatchStop: () => ipcRenderer.invoke("opencode-ui-session-watch-stop"),
  opencodeUiOnSessionUpdated: (callback) => {
    if (typeof callback !== "function" || opencodeUiSessionUpdatedHandlers.has(callback)) {
      return;
    }
    const handler = (_event, payload) => callback(payload);
    opencodeUiSessionUpdatedHandlers.set(callback, handler);
    ipcRenderer.on(OPENCODE_UI_SESSION_UPDATED_CHANNEL, handler);
  },
  opencodeUiOffSessionUpdated: (callback) => {
    const handler = opencodeUiSessionUpdatedHandlers.get(callback);
    if (!handler) return;
    ipcRenderer.removeListener(OPENCODE_UI_SESSION_UPDATED_CHANNEL, handler);
    opencodeUiSessionUpdatedHandlers.delete(callback);
  },
  captureStatus: () => ipcRenderer.invoke("capture-status"),
  captureRefreshStatus: () => ipcRenderer.invoke("capture-refresh-status"),
  captureConsumeAnalyzeAssets: () => ipcRenderer.invoke("capture-consume-analyze-assets"),
  capturePrepareHostDependencies: () => ipcRenderer.invoke("capture-prepare-host-dependencies"),
  captureInstallCompanion: (options) => ipcRenderer.invoke("capture-install-companion", options),
  captureDismissOperation: () => ipcRenderer.invoke("capture-dismiss-operation"),
  captureConnectDevice: (address) => ipcRenderer.invoke("capture-connect-device", address),
  captureDisconnectDevice: (deviceId) => ipcRenderer.invoke("capture-disconnect-device", deviceId),
  captureLaunchCompanion: (options) => ipcRenderer.invoke("capture-launch-companion", options),
  captureStartAnalyzeSession: (options) =>
    ipcRenderer.invoke("capture-start-analyze-session", options),
  captureStopAnalyzeSession: (options) =>
    ipcRenderer.invoke("capture-stop-analyze-session", options),
  captureStartAnalyzePreview: (options) =>
    ipcRenderer.invoke("capture-start-analyze-preview", options),
  captureStopAnalyzePreview: (options) =>
    ipcRenderer.invoke("capture-stop-analyze-preview", options),
  captureStartCameraFeed: (options) => ipcRenderer.invoke("capture-start-camera-feed", options),
  captureStopCameraFeed: (options) => ipcRenderer.invoke("capture-stop-camera-feed", options),
  captureStartInteractiveMirror: (options) =>
    ipcRenderer.invoke("capture-start-interactive-mirror", options),
  captureStopInteractiveMirror: (options) =>
    ipcRenderer.invoke("capture-stop-interactive-mirror", options),
  captureStartAnalyzeDictation: (options) =>
    ipcRenderer.invoke("capture-start-analyze-dictation", options),
  captureStopAnalyzeDictation: (options) =>
    ipcRenderer.invoke("capture-stop-analyze-dictation", options),
  captureCancelAnalyzeDictation: (options) =>
    ipcRenderer.invoke("capture-cancel-analyze-dictation", options),
  captureStartAmbientListener: (options) =>
    ipcRenderer.invoke("capture-start-ambient-listener", options),
  captureStopAmbientListener: (options) =>
    ipcRenderer.invoke("capture-stop-ambient-listener", options),
  captureSetTorch: (options) => ipcRenderer.invoke("capture-set-torch", options),
  captureRequestAnalyzePhoto: (options) =>
    ipcRenderer.invoke("capture-request-analyze-photo", options),
  captureRetakeAnalyzePhoto: (options) =>
    ipcRenderer.invoke("capture-retake-analyze-photo", options),
  captureOnMediaIngress: (callback) => {
    if (typeof callback !== "function" || captureMediaIngressHandlers.has(callback)) {
      return;
    }
    const handler = (_event, payload) => callback(payload);
    captureMediaIngressHandlers.set(callback, handler);
    ipcRenderer.on(CAPTURE_MEDIA_INGRESS_CHANNEL, handler);
  },
  captureOffMediaIngress: (callback) => {
    const handler = captureMediaIngressHandlers.get(callback);
    if (!handler) return;
    ipcRenderer.removeListener(CAPTURE_MEDIA_INGRESS_CHANNEL, handler);
    captureMediaIngressHandlers.delete(callback);
  },
  captureOnDictationStatus: (callback) => {
    if (typeof callback !== "function" || captureDictationStatusHandlers.has(callback)) {
      return;
    }
    const handler = (_event, payload) => callback(payload);
    captureDictationStatusHandlers.set(callback, handler);
    ipcRenderer.on(CAPTURE_DICTATION_STATUS_CHANNEL, handler);
  },
  captureOffDictationStatus: (callback) => {
    const handler = captureDictationStatusHandlers.get(callback);
    if (!handler) return;
    ipcRenderer.removeListener(CAPTURE_DICTATION_STATUS_CHANNEL, handler);
    captureDictationStatusHandlers.delete(callback);
  },
  captureOnAmbientStatus: (callback) => {
    if (typeof callback !== "function" || captureAmbientStatusHandlers.has(callback)) {
      return;
    }
    const handler = (_event, payload) => callback(payload);
    captureAmbientStatusHandlers.set(callback, handler);
    ipcRenderer.on(CAPTURE_AMBIENT_STATUS_CHANNEL, handler);
  },
  captureOffAmbientStatus: (callback) => {
    const handler = captureAmbientStatusHandlers.get(callback);
    if (!handler) return;
    ipcRenderer.removeListener(CAPTURE_AMBIENT_STATUS_CHANNEL, handler);
    captureAmbientStatusHandlers.delete(callback);
  },
  transcriptStatus: () => ipcRenderer.invoke("transcript-status"),
  transcriptEnsureRuntime: () => ipcRenderer.invoke("transcript-ensure-runtime"),
  transcriptListModels: () => ipcRenderer.invoke("transcript-list-models"),
  transcriptInstallModel: (modelId) => ipcRenderer.invoke("transcript-install-model", modelId),
  transcriptRemoveModel: (modelId) => ipcRenderer.invoke("transcript-remove-model", modelId),
  transcriptTranscribeLocal: (request) =>
    ipcRenderer.invoke("transcript-transcribe-local", request),
  transcriptSubmitIngress: (request) => ipcRenderer.invoke("transcript-submit-ingress", request),
  ttsStatus: () => ipcRenderer.invoke("tts-status"),
  ttsSpeak: (request) => ipcRenderer.invoke("tts-speak", request),
  ttsStop: (requestId) => ipcRenderer.invoke("tts-stop", requestId),
  ttsListModels: () => ipcRenderer.invoke("tts-list-models"),
  ttsInstallModel: (modelId) => ipcRenderer.invoke("tts-install-model", modelId),
  operationsStatus: () => ipcRenderer.invoke("operations-status"),
  operationsAcquire: (capability, owner) =>
    ipcRenderer.invoke("operations-acquire", capability, owner),
  operationsRelease: (capability, owner) =>
    ipcRenderer.invoke("operations-release", capability, owner),
  operationsOnStatus: (callback) => {
    if (typeof callback !== "function" || operationsStatusHandlers.has(callback)) {
      return;
    }
    const handler = (_event, payload) => callback(payload);
    operationsStatusHandlers.set(callback, handler);
    ipcRenderer.on(OPERATIONS_STATUS_CHANNEL, handler);
  },
  operationsOffStatus: (callback) => {
    const handler = operationsStatusHandlers.get(callback);
    if (!handler) return;
    ipcRenderer.removeListener(OPERATIONS_STATUS_CHANNEL, handler);
    operationsStatusHandlers.delete(callback);
  },
  ttsOnStatus: (callback) => {
    if (typeof callback !== "function" || ttsStatusHandlers.has(callback)) {
      return;
    }
    const handler = (_event, payload) => callback(payload);
    ttsStatusHandlers.set(callback, handler);
    ipcRenderer.on(TTS_STATUS_CHANNEL, handler);
  },
  ttsOffStatus: (callback) => {
    const handler = ttsStatusHandlers.get(callback);
    if (!handler) return;
    ipcRenderer.removeListener(TTS_STATUS_CHANNEL, handler);
    ttsStatusHandlers.delete(callback);
  },
  transcriptOnIngress: (callback) => {
    if (typeof callback !== "function" || transcriptIngressHandlers.has(callback)) {
      return;
    }
    const handler = (_event, payload) => callback(payload);
    transcriptIngressHandlers.set(callback, handler);
    ipcRenderer.on(TRANSCRIPT_INGRESS_CHANNEL, handler);
  },
  transcriptOffIngress: (callback) => {
    const handler = transcriptIngressHandlers.get(callback);
    if (!handler) return;
    ipcRenderer.removeListener(TRANSCRIPT_INGRESS_CHANNEL, handler);
    transcriptIngressHandlers.delete(callback);
  },

  // NOTE: Startup flags are read from the preload process argv so the renderer stays passive.
  getStartupFlags: () => {
    const argv = process.argv || [];

    const startPage =
      readArgFlagValue(argv, "--app-start-page") ?? readArgFlagValue(argv, "--start-page");
    const uiMode = normalizeUiModeFlag(
      readArgFlagValue(argv, "--app-ui-mode") ?? readArgFlagValue(argv, "--ui-mode")
    );
    const autoConnect =
      argv.includes("--app-auto-connect=1") ||
      argv.includes("--app-auto-connect=true") ||
      argv.includes("--app-auto-connect") ||
      argv.includes("--auto-connect");
    const sceneDebug =
      argv.includes("--app-scene-editor=1") ||
      argv.includes("--app-scene-editor=true") ||
      argv.includes("--app-scene-editor") ||
      argv.includes("--scene-editor") ||
      argv.includes("--app-scene-debug=1") ||
      argv.includes("--app-scene-debug=true") ||
      argv.includes("--app-scene-debug") ||
      argv.includes("--scene-debug");

    return {
      startPage,
      autoConnect,
      uiMode,
      sceneEditor: sceneDebug,
      sceneDebug,
      roomsSnapshot: STARTUP_ROOMS_SNAPSHOT,
    };
  },

  // WARNING: Keep this allowlist narrow because callbacks are exposed to the renderer.
  ipcRenderer: {
    on: (channel, callback) => {
      if (!ALLOWED_IPC_RENDERER_CHANNELS.has(channel) || typeof callback !== "function") {
        return;
      }
      ipcRenderer.on(channel, callback);
    },
    removeListener: (channel, callback) => {
      if (!ALLOWED_IPC_RENDERER_CHANNELS.has(channel) || typeof callback !== "function") {
        return;
      }
      ipcRenderer.removeListener(channel, callback);
    },
  },
});

try {
  function shouldInjectMainAppScript() {
    const href = typeof window?.location?.href === "string" ? window.location.href : "";
    const pathname =
      typeof window?.location?.pathname === "string" ? window.location.pathname.trim() : "";
    const isLocalRenderer =
      !href.startsWith("http") || window.location.hostname.includes("localhost");

    if (!isLocalRenderer) {
      return false;
    }

    if (pathname === "" || pathname === "/") {
      return true;
    }

    return pathname.endsWith("/index.html");
  }

  if (typeof window !== "undefined" && shouldInjectMainAppScript()) {
    function disableSpellcheck() {
      try {
        document.querySelectorAll("input, textarea").forEach((el) => {
          el.setAttribute("spellcheck", "false");
          el.autocapitalize = "off";
          el.autocomplete = "off";
        });
      } catch (err) {
        console.warn(
          preloadT("disableSpellcheckFailed", { message: getPreloadErrorMessage(err) }),
          err
        );
      }
    }

    function injectInitApp() {
      try {
        if (window.__app_init_injected) return;
        window.__app_init_injected = true;
        disableSpellcheck();

        // NOTE: External tool pages share this preload, but only the main shell should boot /js/app.js.
        const s = document.createElement("script");
        s.type = "module";
        s.src = "/js/app.js";
        s.onload = () => {
          console.info(preloadT("appScriptLoaded"));
        };
        s.onerror = (err) => {
          console.error(preloadT("appScriptLoadFailed", { message: getPreloadErrorMessage(err) }));
        };

        (document.head || document.documentElement).appendChild(s);
      } catch (err) {
        console.warn(
          preloadT("injectInitAppFailed", { message: getPreloadErrorMessage(err) }),
          err
        );
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", injectInitApp);
    } else {
      injectInitApp();
    }
  }
} catch (e) {
  console.warn(preloadT("initFailed", { message: getPreloadErrorMessage(e) }), e);
}
