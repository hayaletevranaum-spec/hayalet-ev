const { contextBridge, ipcRenderer } = require("electron");

let __global_app_slot = null;
const OPENCODE_UI_SESSION_UPDATED_CHANNEL = "opencode-ui:session-updated";
const ASSISTANT_TRANSCRIPT_INGRESS_CHANNEL = "assistant-transcript-ingress";
const opencodeUiSessionUpdatedHandlers = new Map();
const assistantTranscriptIngressHandlers = new Map();
let __app_preload_locale = "tr";
let __app_preload_catalog = null;

const WEBVIEW_PRELOAD_DIAGNOSTIC_ONCE = new Set();

function warnWebviewOnce(key, message, context) {
  if (WEBVIEW_PRELOAD_DIAGNOSTIC_ONCE.has(key)) return;
  WEBVIEW_PRELOAD_DIAGNOSTIC_ONCE.add(key);
  if (typeof console === "undefined" || typeof console.warn !== "function") return;
  if (context !== undefined) {
    console.warn(message, context);
    return;
  }
  console.warn(message);
}

const WEBVIEW_PRELOAD_MESSAGE_FALLBACKS = {
  settingUpProvider: "Setting up provider for slot {{slot}} (source: {{source}})",
  providerConfigSet: "Provider config set: {{providerId}} {{providerName}}",
  slotSetViaIpc: "Slot set via IPC: {{slot}}",
  providerConfigLoadFailed: "Provider config could not be loaded for {{providerId}}",
  providerConfigSetFailed: "Provider config could not be assigned: {{message}}",
  providerConfigSetOuterFailed: "Provider config assignment failed before completion: {{message}}",
  slotSetFailed: "Slot assignment failed: {{message}}",
  providerUsageSendFailed: "Provider usage telemetry could not be sent: {{message}}",
  providerHandlerFailed: "The app-set-provider handler failed: {{message}}",
};

function normalizeAppLanguage(value) {
  if (typeof value !== "string") {
    return "tr";
  }

  const normalized = value.trim().replace(/_/g, "-");
  return normalized !== "" ? normalized : "tr";
}

function resolvePreloadMessageLocale(value) {
  const normalized = normalizeAppLanguage(value).toLowerCase();
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

async function syncWebviewPreloadLocale() {
  let appLocale = "tr";

  try {
    const settings = await ipcRenderer.invoke("load-settings");
    const locale = settings && settings.general && settings.general.language;
    appLocale = normalizeAppLanguage(locale);
  } catch (err) {
    warnWebviewOnce(
      "webview-preload-locale-settings",
      "[webview-preload] failed to load settings for locale sync",
      { error: getWebviewPreloadErrorMessage(err) }
    );
  }

  try {
    const pack = await ipcRenderer.invoke("i18n-load-language", appLocale);
    const resolvedLocale =
      pack && typeof pack.locale === "string" ? normalizeAppLanguage(pack.locale) : appLocale;
    __app_preload_locale = resolvedLocale;
    __app_preload_catalog =
      pack && pack.catalog && typeof pack.catalog === "object" ? pack.catalog : null;
  } catch (err) {
    warnWebviewOnce(
      "webview-preload-locale-pack",
      "[webview-preload] failed to load language pack for locale sync",
      { error: getWebviewPreloadErrorMessage(err) }
    );
    __app_preload_catalog = null;
    __app_preload_locale = appLocale;
  }
}

function getWebviewPreloadErrorMessage(error) {
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

function webviewPreloadT(key, params) {
  const messageLocale = resolvePreloadMessageLocale(__app_preload_locale);
  const template =
    readCatalogValue(__app_preload_catalog, `electron.webviewPreload.${key}.${messageLocale}`) ||
    readCatalogValue(__app_preload_catalog, "electron.webviewPreload." + key) ||
    WEBVIEW_PRELOAD_MESSAGE_FALLBACKS[key] ||
    key;

  return template.replace(/\{\{(\w+)\}\}/g, (_, token) => {
    const value =
      params && Object.prototype.hasOwnProperty.call(params, token) ? params[token] : "";
    return value == null ? "" : String(value);
  });
}

async function applyProviderUiLanguageSync(providerConfig, appLocale) {
  try {
    const normalizedLocale = normalizeAppLanguage(appLocale);
    const payload = {
      providerId:
        providerConfig && typeof providerConfig.id === "string" ? providerConfig.id : "unknown",
      locale: normalizedLocale,
      strategy:
        providerConfig && typeof providerConfig.uiLanguage === "object"
          ? providerConfig.uiLanguage
          : null,
    };

    window.dispatchEvent(new CustomEvent("app-provider-language-sync", { detail: payload }));
    ipcRenderer.sendToHost("provider-language-sync", payload);
  } catch (error) {
    console.warn(
      webviewPreloadT("providerHandlerFailed", {
        message: getWebviewPreloadErrorMessage(error),
      }),
      error
    );
  }
}

void syncWebviewPreloadLocale();

contextBridge.exposeInMainWorld("electronAPI", {
  readDirectoryFiles: (dirPath) => ipcRenderer.invoke("read-directory-files", dirPath),
  loadSettings: () => ipcRenderer.invoke("load-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  showOpenDialog: (options) => ipcRenderer.invoke("show-open-dialog", options),
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
  readArchivesIndex: () => ipcRenderer.invoke("read-archives-index"),
  writeArchivesIndex: (entries) => ipcRenderer.invoke("write-archives-index", entries),
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
  copyToAssets: (srcPath, role) => ipcRenderer.invoke("copy-to-assets", srcPath, role),
  removeArchive: (folderPath) => ipcRenderer.invoke("remove-archive", folderPath),
  copyFileTo: (srcPath, destDir) => ipcRenderer.invoke("copy-file-to", srcPath, destDir),
  openPath: (path) => ipcRenderer.invoke("open-path", path),
  fmEnsureDirs: (scope) => ipcRenderer.invoke("fm-ensure-dirs", scope),
  fmTempPath: (prefix, ext) => ipcRenderer.invoke("fm-temp-path", prefix, ext),
  fmWriteFileAtomic: (payload) => ipcRenderer.invoke("fm-write-file-atomic", payload),
  fmArchiveWrite: (meta, files) => ipcRenderer.invoke("fm-archive-write", meta, files),
  getPreloadPath: (type) => ipcRenderer.invoke("get-preload-path", type),
  getProviderConfig: (providerId) => ipcRenderer.invoke("get-provider-config", providerId),
  sendToHost: (channel, data) => ipcRenderer.sendToHost(channel, data),
  archiveSync: (payload) => ipcRenderer.invoke("archive-sync", payload),
  whisperLoad: (provider) => ipcRenderer.invoke("whisper-load", provider),
  whisperSave: (provider, payload) => ipcRenderer.invoke("whisper-save", provider, payload),
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
  appRestart: () => ipcRenderer.invoke("app-restart"),
  assistantRuntimeRead: () => ipcRenderer.invoke("assistant-runtime-read"),
  assistantRuntimeWrite: (payload) => ipcRenderer.invoke("assistant-runtime-write", payload),
  rovoInteractionContextRead: () => ipcRenderer.invoke("rovo-interaction-context-read"),
  memorySearch: (params) => ipcRenderer.invoke("memory-search", params),
  memoryStats: (params) => ipcRenderer.invoke("memory-stats", params),
  memoryDelete: (params) => ipcRenderer.invoke("memory-delete", params),
  memoryUpdate: (params) => ipcRenderer.invoke("memory-update", params),
  memoryWrite: (params) => ipcRenderer.invoke("memory-write", params),
  memoryPrune: (params) => ipcRenderer.invoke("memory-prune", params),
  memoryDeleteAll: (params) => ipcRenderer.invoke("memory-delete-all", params),
  opencodeServeStatus: () => ipcRenderer.invoke("opencode-serve-status"),
  deviceAction: (action, payload) => ipcRenderer.invoke("device-action", action, payload),
  generateTree: (basePath, options) => ipcRenderer.invoke("generate-tree", basePath, options),

  loadOpencodeConfig: () => ipcRenderer.invoke("opc-load-config"),
  saveOpencodeConfig: (config) => ipcRenderer.invoke("opc-save-config", config),
  opcAddRecentFolder: (path, name) => ipcRenderer.invoke("opc-add-recent-folder", path, name),
  opcRemoveRecentFolder: (path) => ipcRenderer.invoke("opc-remove-recent-folder", path),
  opcAddBinary: (path, version) => ipcRenderer.invoke("opc-add-binary", path, version),
  opcRemoveBinary: (path) => ipcRenderer.invoke("opc-remove-binary", path),
  opcUpdatePreferences: (updates) => ipcRenderer.invoke("opc-update-preferences", updates),
  opcRecordLaunch: (folderPath, binaryPath) =>
    ipcRenderer.invoke("opc-record-launch", folderPath, binaryPath),
  opcOpenFolderDialog: (options) => ipcRenderer.invoke("opc-open-folder-dialog", options),
  opcOpenFileDialog: (options) => ipcRenderer.invoke("opc-open-file-dialog", options),
  opcListFilesystem: (path, options) => ipcRenderer.invoke("opc-list-filesystem", path, options),
  opcValidatePath: (path) => ipcRenderer.invoke("opc-validate-path", path),
  opcGetHomePath: () => ipcRenderer.invoke("opc-get-home-path"),
  opcJoinPath: (...segments) => ipcRenderer.invoke("opc-join-path", ...segments),
  opcPathInfo: (path) => ipcRenderer.invoke("opc-path-info", path),

  opcListModels: () => ipcRenderer.invoke("opc-list-models"),
  opcListAgents: () => ipcRenderer.invoke("opc-list-agents"),
  opcGetAgentModelPreference: (folderPath) =>
    ipcRenderer.invoke("opc-get-agent-model-preference", folderPath),
  opcSaveAgentModelPreference: (prefs, folderPath) =>
    ipcRenderer.invoke("opc-save-agent-model-preference", prefs, folderPath),
  opencodeUiApiProxy: (options) => ipcRenderer.invoke("opencode-ui-api-proxy", options),
  opencodeUiFsListSessions: (dbPath) => ipcRenderer.invoke("opencode-ui-fs-list-sessions", dbPath),
  opencodeUiFsEnsureSession: (sessionId, title, dbPath) =>
    ipcRenderer.invoke("opencode-ui-fs-ensure-session", sessionId, title, dbPath),
  opencodeUiFsReadSession: (sessionId, dbPath) =>
    ipcRenderer.invoke("opencode-ui-fs-read-session", sessionId, dbPath),
  opencodeUiFsArchiveSession: (sessionId, archived, dbPath) =>
    ipcRenderer.invoke("opencode-ui-fs-archive-session", sessionId, archived, dbPath),
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
  transcriptStatus: () => ipcRenderer.invoke("transcript-status"),
  transcriptEnsureRuntime: () => ipcRenderer.invoke("transcript-ensure-runtime"),
  transcriptTranscribeLocal: (request) =>
    ipcRenderer.invoke("transcript-transcribe-local", request),
  assistantOnTranscriptIngress: (callback) => {
    if (typeof callback !== "function" || assistantTranscriptIngressHandlers.has(callback)) {
      return;
    }
    const handler = (_event, payload) => callback(payload);
    assistantTranscriptIngressHandlers.set(callback, handler);
    ipcRenderer.on(ASSISTANT_TRANSCRIPT_INGRESS_CHANNEL, handler);
  },
  assistantOffTranscriptIngress: (callback) => {
    const handler = assistantTranscriptIngressHandlers.get(callback);
    if (!handler) return;
    ipcRenderer.removeListener(ASSISTANT_TRANSCRIPT_INGRESS_CHANNEL, handler);
    assistantTranscriptIngressHandlers.delete(callback);
  },
});

function setupProvider() {
  let slot = __global_app_slot;

  if (!slot) {
    try {
      slot = window.__app_slot || null;
    } catch (_) {}
  }

  if (!slot) {
    const hash = window.location.hash || "";
    slot = hash.substring(1);
  }

  if (slot === "ai0") {
    return;
  }

  if (!slot || (slot !== "ai1" && slot !== "ai2")) {
    return;
  }

  console.info(
    webviewPreloadT("settingUpProvider", {
      slot,
      source: __global_app_slot ? "IPC" : "hash",
    })
  );

  let readyState = "loading";
  let sendState = "not-found";
  let thinkingState = "idle";
  let stabilityTimer = null;

  function updateState() {
    try {
      ipcRenderer.sendToHost("provider-state", {
        slot,
        readyState,
        sendState,
        thinkingState,
      });
    } catch (err) {
      warnWebviewOnce(
        `webview-preload-provider-state-${slot}`,
        "[webview-preload] provider state send failed",
        { slot, error: getWebviewPreloadErrorMessage(err) }
      );
    }
  }

  function checkReady() {
    const pcfg = (window.__app_provider_config && window.__app_provider_config.selectors) || {};
    const prompt = pcfg.inputField ? document.querySelector(pcfg.inputField) : null;
    const sendButton = pcfg.sendButton ? document.querySelector(pcfg.sendButton) : null;

    if (prompt && sendButton) {
      if (stabilityTimer) clearTimeout(stabilityTimer);
      stabilityTimer = setTimeout(() => {
        readyState = "ready";
        sendState = sendButton.disabled ? "disabled" : "enabled";
        updateState();
      }, 500);
    } else {
      readyState = "loading";
      updateState();
    }
  }

  function updateSend() {
    const pcfg = (window.__app_provider_config && window.__app_provider_config.selectors) || {};
    const sendButton = pcfg.sendButton ? document.querySelector(pcfg.sendButton) : null;
    sendState = sendButton ? (sendButton.disabled ? "disabled" : "enabled") : "not-found";
    updateState();
  }

  function updateThinking() {
    const pcfg = (window.__app_provider_config && window.__app_provider_config.selectors) || {};
    const stopButton = pcfg.stopButton ? document.querySelector(pcfg.stopButton) : null;
    thinkingState = stopButton ? "thinking" : "idle";
    updateState();
  }

  const observer = new MutationObserver(() => {
    checkReady();
    updateSend();
    updateThinking();
  });

  function startObserver() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      setTimeout(startObserver, 100);
    }
  }

  ipcRenderer.on("nav-start", () => {
    readyState = "loading";
    sendState = "not-found";
    thinkingState = "idle";
    updateState();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      startObserver();
      checkReady();
    });
  } else if (document.body) {
    startObserver();
    checkReady();
  } else {
    window.addEventListener("load", () => {
      startObserver();
      checkReady();
    });
  }

  setInterval(() => {
    updateSend();
    updateThinking();
  }, 1000);
}

ipcRenderer.on("app-set-provider", async (event, payload) => {
  try {
    const providerId = typeof payload === "string" ? payload : payload?.providerId;
    const slot = typeof payload === "object" ? payload?.slot : null;

    if (!providerId) return;

    const cfg = await ipcRenderer.invoke("get-provider-config", providerId);
    if (!cfg) {
      console.error(webviewPreloadT("providerConfigLoadFailed", { providerId }));
      return;
    }

    try {
      try {
        window.__app_provider_config = cfg;
        console.info(
          webviewPreloadT("providerConfigSet", {
            providerId: cfg.id,
            providerName: cfg.name,
          })
        );
        await applyProviderUiLanguageSync(cfg, __app_preload_locale);
      } catch (e) {
        console.error(
          webviewPreloadT("providerConfigSetFailed", { message: getWebviewPreloadErrorMessage(e) }),
          e
        );
      }
    } catch (e) {
      console.error(
        webviewPreloadT("providerConfigSetOuterFailed", {
          message: getWebviewPreloadErrorMessage(e),
        }),
        e
      );
    }

    if (slot) {
      try {
        __global_app_slot = slot;
        window.__app_slot = slot;
        console.info(webviewPreloadT("slotSetViaIpc", { slot }));
        setupProvider();
      } catch (err) {
        console.warn(
          webviewPreloadT("slotSetFailed", { message: getWebviewPreloadErrorMessage(err) }),
          err
        );
      }
    }

    try {
      const sels = (cfg.filters && cfg.filters.selectors) || [];
      if (sels && sels.length) {
        const applyFilters = () => {
          try {
            sels.forEach((sel) => {
              try {
                document.querySelectorAll(sel).forEach((n) => n.remove());
              } catch (_) {}
            });
          } catch (_) {}
        };
        applyFilters();
        try {
          const moTarget = document.documentElement || document.body;
          if (moTarget) {
            const mo = new MutationObserver(() => applyFilters());
            mo.observe(moTarget, { childList: true, subtree: true });
          }
        } catch (_) {}
      }
    } catch (_) {}

    try {
      const endpoints = (cfg.telemetry && cfg.telemetry.endpoints) || [];
      const tokenPaths = (cfg.telemetry && cfg.telemetry.tokenPaths) || [];
      const matchesEndpoint = (url) => {
        try {
          if (!url) return false;
          return endpoints.some((e) => e && url.indexOf(e) !== -1);
        } catch (_) {
          return false;
        }
      };

      const extractTokens = (obj) => {
        try {
          const out = [];
          tokenPaths.forEach((p) => {
            try {
              const parts = p.split(".");
              let cur = obj;
              for (const part of parts) {
                if (cur == null) break;
                cur = cur[part];
              }
              if (cur != null) out.push(cur);
            } catch (_) {}
          });
          return out;
        } catch (_) {
          return [];
        }
      };

      try {
        const _fetch = window.fetch;
        window.fetch = async function (...args) {
          const res = await _fetch.apply(this, args);
          try {
            const reqUrl =
              typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || res.url;
            if (matchesEndpoint(reqUrl)) {
              try {
                const clone = res.clone();
                const ct =
                  (clone.headers && clone.headers.get && clone.headers.get("content-type")) || "";
                if (ct.includes("application/json")) {
                  clone
                    .json()
                    .then((json) => {
                      const toks = extractTokens(json);
                      if (toks && toks.length) {
                        try {
                          ipcRenderer.sendToHost("provider-usage", {
                            providerId,
                            url: reqUrl,
                            tokens: toks,
                          });
                        } catch (err) {
                          console.warn(
                            webviewPreloadT("providerUsageSendFailed", {
                              message: getWebviewPreloadErrorMessage(err),
                            }),
                            err
                          );
                        }
                      }
                    })
                    .catch(() => {});
                }
              } catch (_) {}
            }
          } catch (_) {}
          return res;
        };
      } catch (_) {}

      try {
        const OrigXHR = window.XMLHttpRequest;
        function WrappedXHR() {
          const xhr = new OrigXHR();
          let _url = null;
          const _open = xhr.open;
          xhr.open = function (method, url, ...rest) {
            _url = url;
            return _open.call(this, method, url, ...rest);
          };
          const _onready = xhr.onreadystatechange;
          xhr.onreadystatechange = function () {
            try {
              if (this.readyState === 4) {
                try {
                  if (matchesEndpoint(_url)) {
                    const ct =
                      (this.getResponseHeader && this.getResponseHeader("content-type")) || "";
                    if (ct.includes("application/json")) {
                      try {
                        const json = JSON.parse(this.responseText || "{}");
                        const toks = extractTokens(json);
                        if (toks && toks.length) {
                          try {
                            ipcRenderer.sendToHost("provider-usage", {
                              providerId,
                              url: _url,
                              tokens: toks,
                            });
                          } catch (err) {
                            console.warn(
                              webviewPreloadT("providerUsageSendFailed", {
                                message: getWebviewPreloadErrorMessage(err),
                              }),
                              err
                            );
                          }
                        }
                      } catch (_) {}
                    }
                  }
                } catch (_) {}
              }
            } catch (_) {}
            if (typeof _onready === "function") return _onready.apply(this, arguments);
          };
          return xhr;
        }
        try {
          WrappedXHR.prototype = OrigXHR.prototype;
          window.XMLHttpRequest = WrappedXHR;
        } catch (_) {}
      } catch (_) {}
    } catch (_) {}
  } catch (err) {
    if (typeof console !== "undefined" && console.warn) {
      console.warn(
        webviewPreloadT("providerHandlerFailed", {
          message: getWebviewPreloadErrorMessage(err),
        }),
        err
      );
    }
  }
});
