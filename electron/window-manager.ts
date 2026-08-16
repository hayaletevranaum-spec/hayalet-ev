import { BrowserWindow, session, Tray, Menu, nativeImage, app, shell, screen } from "electron";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getLoggerCore } from "./logger/index.js";
import { LogCategory, LogLevel } from "@shared/index.js";
import { PARTITIONS } from "@slots";
import { Paths } from "./paths.ts";
import { buildPreloadAdditionalArguments, type StartupFlags } from "./startup-flags.ts";
import { resolveLaunchDisplay } from "./window-launch-display.ts";
import type { TranslationParams } from "../src/types/i18n.ts";
import { readElectronAppLanguageSync, translateElectronMessage } from "./i18n/language-service.ts";
import { resolveAcceptLanguage } from "../shared/i18n/locale.js";

interface ExtendedWebPreferences extends Electron.WebPreferences {
  navigationTheme?: string;
}

const logger = getLoggerCore();

let _tray: Tray | null = null;
let _trayIconPath: string | null = null;
let _isMinimizedToTray: boolean = false;
let _mainWindow: BrowserWindow | null = null;
const SHOULD_USE_LINUX_WINDOW_MANAGER_MAXIMIZE = process.platform === "linux";
const LINUX_VISIBLE_WORK_AREA_GUARD = {
  width: 2,
  height: 1,
};

async function windowT(key: string, params?: TranslationParams): Promise<string> {
  return await translateElectronMessage(`electron.window.${key}`, params);
}

function boundsAreInsideWorkArea(
  bounds: Electron.Rectangle,
  workArea: Electron.Rectangle
): boolean {
  return (
    bounds.x >= workArea.x &&
    bounds.y >= workArea.y &&
    bounds.x + bounds.width <= workArea.x + workArea.width &&
    bounds.y + bounds.height <= workArea.y + workArea.height
  );
}

function intersectWorkAreas(
  first: Electron.Rectangle,
  second: Electron.Rectangle
): Electron.Rectangle | null {
  const x = Math.max(first.x, second.x);
  const y = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  const width = right - x;
  const height = bottom - y;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x, y, width, height };
}

function parseLinuxEwmhWorkArea(rawOutput: string): Electron.Rectangle | null {
  const workAreaMatch = rawOutput.match(/_NET_WORKAREA\(CARDINAL\)\s*=\s*([0-9,\s-]+)/);
  if (workAreaMatch === null) {
    return null;
  }

  const currentDesktopMatch = rawOutput.match(/_NET_CURRENT_DESKTOP\(CARDINAL\)\s*=\s*(\d+)/);
  const currentDesktop =
    currentDesktopMatch === null ? 0 : Number.parseInt(currentDesktopMatch[1] ?? "0", 10);
  const values = (workAreaMatch[1] ?? "")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value));
  const offset = Number.isFinite(currentDesktop) ? currentDesktop * 4 : 0;

  if (values.length < offset + 4) {
    return null;
  }

  const [x, y, width, height] = values.slice(offset, offset + 4);
  if (
    x === undefined ||
    y === undefined ||
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return { x, y, width, height };
}

function readLinuxEwmhWorkArea(): Electron.Rectangle | null {
  if (!SHOULD_USE_LINUX_WINDOW_MANAGER_MAXIMIZE) {
    return null;
  }

  try {
    const output = execFileSync("xprop", ["-root", "_NET_WORKAREA", "_NET_CURRENT_DESKTOP"], {
      encoding: "utf8",
      timeout: 250,
    });
    return parseLinuxEwmhWorkArea(output);
  } catch {
    return null;
  }
}

function resolveVisibleWorkArea(workArea: Electron.Rectangle): Electron.Rectangle {
  if (!SHOULD_USE_LINUX_WINDOW_MANAGER_MAXIMIZE) {
    return workArea;
  }

  // NOTE: KDE/Wayland can report full display height through Electron while EWMH exposes the panel-aware work area.
  const ewmhWorkArea = readLinuxEwmhWorkArea();
  const constrainedWorkArea =
    ewmhWorkArea === null ? workArea : (intersectWorkAreas(workArea, ewmhWorkArea) ?? ewmhWorkArea);

  return {
    ...constrainedWorkArea,
    width: Math.max(1, constrainedWorkArea.width - LINUX_VISIBLE_WORK_AREA_GUARD.width),
    height: Math.max(1, constrainedWorkArea.height - LINUX_VISIBLE_WORK_AREA_GUARD.height),
  };
}

function constrainWindowToVisibleWorkArea(win: BrowserWindow): void {
  const bounds = win.getBounds();
  const { workArea } = screen.getDisplayMatching(bounds);
  const visibleWorkArea = resolveVisibleWorkArea(workArea);

  if (boundsAreInsideWorkArea(bounds, visibleWorkArea)) {
    return;
  }

  win.setBounds(visibleWorkArea);
}

function resolveCorsAllowOrigin(isDev: boolean, referrer?: string): string {
  const fallbackOrigin = isDev ? "http://localhost:5174" : "null";
  if (referrer === undefined || referrer.length === 0) return fallbackOrigin;

  try {
    const origin = new URL(referrer).origin;
    const isAllowedOrigin =
      origin === "null" ||
      origin === "https://opencode.ai" ||
      origin === "http://localhost:5174" ||
      origin === "http://127.0.0.1:5174" ||
      /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);
    return isAllowedOrigin ? origin : fallbackOrigin;
  } catch {
    return fallbackOrigin;
  }
}

function applyPreferredLanguageHeader(targetSession: Electron.Session): void {
  targetSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders;
    headers["Accept-Language"] = resolveAcceptLanguage(readElectronAppLanguageSync());
    callback({ requestHeaders: headers });
  });
}

function allowLocalVideoCapture(targetSession: Electron.Session): void {
  targetSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (permission !== "media") {
      callback(false);
      return;
    }

    const mediaTypes = (details as { mediaTypes?: string[] }).mediaTypes ?? [];
    callback(mediaTypes.some((mediaType) => mediaType === "audio" || mediaType === "video"));
  });
}

function restoreWindowedBounds(win: BrowserWindow): void {
  if (SHOULD_USE_LINUX_WINDOW_MANAGER_MAXIMIZE) {
    win.setResizable(true);
    win.maximize();
    constrainWindowToVisibleWorkArea(win);
    return;
  }

  win.setResizable(false);
  const { workArea } = screen.getDisplayMatching(win.getBounds());
  win.setBounds(workArea);
}

export function initTray(iconPath: string): void {
  _trayIconPath = iconPath;
  createTrayInternal();
}

export function setTrayIconPath(iconPath: string): void {
  initTray(iconPath);
}

export async function minimizeToTray(): Promise<void> {
  if (_mainWindow === null) {
    await logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.ERROR,
      "electron.window.logs.mainWindowUnavailable"
    );
    return;
  }

  try {
    if (_tray === null) {
      createTrayInternal();
    }

    _isMinimizedToTray = true;
    _mainWindow.hide();
    await logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.INFO,
      "electron.window.logs.minimizedToTray"
    );
  } catch (err) {
    await logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.ERROR,
      "electron.window.logs.minimizeToTrayFailed",
      { message: (err as Error).message },
      {
        error: {
          name: (err as Error).name,
          message: (err as Error).message,
          stack: (err as Error).stack,
        },
      }
    );
  }
}

function createTrayInternal(): void {
  if (_tray !== null) {
    return;
  }

  if (_trayIconPath === null || _trayIconPath.length === 0) {
    void logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.ERROR,
      "electron.window.logs.trayIconPathMissing"
    );
    return;
  }

  try {
    const icon = nativeImage.createFromPath(_trayIconPath);

    // NOTE: Log the resolved tray icon path because packaging issues often surface here first.
    void logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.DEBUG,
      "electron.window.logs.creatingTrayIcon",
      undefined,
      {
        iconPath: _trayIconPath,
        iconSize: icon.getSize(),
      }
    );

    _tray = new Tray(icon.resize({ width: 22, height: 22 }));

    void updateTrayMenu();

    _tray.on("click", () => {
      void logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.DEBUG,
        "electron.window.logs.trayClicked"
      );
      restoreFromTray();
    });

    _tray.on("double-click", () => {
      void logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.DEBUG,
        "electron.window.logs.trayDoubleClicked"
      );
      restoreFromTray();
      _mainWindow?.maximize();
    });

    void logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.INFO,
      "electron.window.logs.trayCreated",
      undefined,
      { iconPath: _trayIconPath }
    );
  } catch (err) {
    void logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.ERROR,
      "electron.window.logs.trayCreationFailed",
      { message: (err as Error).message },
      {
        error: {
          name: (err as Error).name,
          message: (err as Error).message,
          stack: (err as Error).stack,
        },
      }
    );
  }
}

async function updateTrayMenu(): Promise<void> {
  if (_tray === null) return;

  const [showLabel, fullscreenLabel, quitLabel, tooltip] = await Promise.all([
    windowT("trayShow"),
    windowT("trayFullscreen"),
    windowT("trayQuit"),
    translateElectronMessage("app.documentTitle"),
  ]);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: showLabel,
      click: (): void => {
        restoreFromTray();
      },
    },
    {
      label: fullscreenLabel,
      click: (): void => {
        restoreFromTray();
        if (_mainWindow !== null) {
          _mainWindow.setFullScreen(!_mainWindow.isFullScreen());
        }
      },
    },
    { type: "separator" },
    {
      label: quitLabel,
      click: (): void => {
        _mainWindow?.destroy();
        app.quit();
      },
    },
  ]);

  _tray.setToolTip(tooltip);
  _tray.setContextMenu(contextMenu);
}

function restoreFromTray(): void {
  if (!_isMinimizedToTray) return;

  _isMinimizedToTray = false;

  if (_mainWindow !== null) {
    _mainWindow.show();
    _mainWindow.focus();
    void logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.INFO,
      "electron.window.logs.restoredFromTray"
    );
  }
}

interface CreateWindowOptions {
  isDev?: boolean;
  startupFlags?: StartupFlags;
}

export function createWindow(options: CreateWindowOptions = {}): BrowserWindow {
  const { isDev = !Paths.isPackaged(), startupFlags } = options;
  const additionalArguments =
    startupFlags === undefined ? [] : buildPreloadAdditionalArguments(startupFlags);
  const launchDisplay = resolveLaunchDisplay(
    screen.getAllDisplays(),
    screen.getPrimaryDisplay(),
    screen.getCursorScreenPoint(),
    { displayId: startupFlags?.displayId ?? null }
  );
  const { workArea } = launchDisplay;
  const visibleWorkArea = resolveVisibleWorkArea(workArea);

  if (isDev) {
    process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true";
  }

  const iconPath = Paths.getIconPath();

  const win = new BrowserWindow({
    x: visibleWorkArea.x,
    y: visibleWorkArea.y,
    width: visibleWorkArea.width,
    height: visibleWorkArea.height,
    frame: false,
    resizable: SHOULD_USE_LINUX_WINDOW_MANAGER_MAXIMIZE,
    maximizable: SHOULD_USE_LINUX_WINDOW_MANAGER_MAXIMIZE,
    fullscreenable: true,
    show: false,
    icon: nativeImage.createFromPath(iconPath),
    webPreferences: {
      preload: Paths.getPreloadPath("preload.cjs"),
      additionalArguments,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,
      spellcheck: false,
      allowRunningInsecureContent: false,
      disableBlinkFeatures: "Auxclick",
      navigationTheme: "dark",
    } as ExtendedWebPreferences,
  });

  allowLocalVideoCapture(session.defaultSession);

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const cspDev = [
      "default-src 'self' 'unsafe-inline' 'unsafe-eval'",
      // NOTE: Room hosts fall back to data: module graphs when the renderer cannot import file URLs directly.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
      "img-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:*",
      "media-src 'self' data: blob: http://localhost:* http://127.0.0.1:*",
      "connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:*",
    ].join("; ");

    const cspProd = [
      "default-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' data: blob:",
      "img-src 'self' data: blob: https: http://127.0.0.1:*",
      "media-src 'self' data: blob: http://127.0.0.1:*",
      "connect-src 'self' http://127.0.0.1:*",
    ].join("; ");

    const responseHeaders: Record<string, string[]> = {
      ...details.responseHeaders,
      "Content-Security-Policy": [isDev ? cspDev : cspProd],
    };

    // NOTE: Local helper services need explicit CORS headers because they are called from isolated webviews.
    const url = details.url;
    if (url.includes("127.0.0.1:") && /:\d{4,5}\//.test(url)) {
      const referrer = (details as { referrer?: string }).referrer;
      responseHeaders["Access-Control-Allow-Origin"] = [resolveCorsAllowOrigin(isDev, referrer)];
      responseHeaders["Access-Control-Allow-Methods"] = ["GET, POST, PUT, PATCH, DELETE, OPTIONS"];
      responseHeaders["Access-Control-Allow-Headers"] = ["Content-Type"];
    }

    callback({ responseHeaders });
  });

  const mainWebviewSession = session.fromPartition(PARTITIONS.MAIN);
  const assistantSession = session.fromPartition(PARTITIONS.ASSISTANT);

  applyPreferredLanguageHeader(mainWebviewSession);
  applyPreferredLanguageHeader(assistantSession);

  // NOTE: The assistant webview needs broader connect-src rules for OpenCode changelog fetches and local helper services.
  assistantSession.webRequest.onHeadersReceived((details, callback) => {
    const headers: Record<string, string[]> = { ...details.responseHeaders };
    const cspKey = Object.keys(headers).find(
      (key) => key.toLowerCase() === "content-security-policy"
    );

    if (cspKey !== undefined) {
      const rawValue = headers[cspKey];
      const cspValue = Array.isArray(rawValue) ? rawValue.join("; ") : String(rawValue);
      const updatedCsp = extendConnectSrc(cspValue, ["https://opencode.ai", "http://127.0.0.1:*"]);
      headers[cspKey] = [updatedCsp];
    }

    // NOTE: Mirror the local-service CORS override for the assistant partition.
    const reqUrl = details.url;
    if (reqUrl.includes("127.0.0.1:") && /:\d{4,5}\//.test(reqUrl)) {
      const referrer = (details as { referrer?: string }).referrer;
      headers["Access-Control-Allow-Origin"] = [resolveCorsAllowOrigin(isDev, referrer)];
      headers["Access-Control-Allow-Methods"] = ["GET, POST, PUT, PATCH, DELETE, OPTIONS"];
      headers["Access-Control-Allow-Headers"] = ["Content-Type"];
    }

    callback({ responseHeaders: headers });
  });

  const nodeEnv = process.env["NODE_ENV"];
  const shouldUseDevServer =
    isDev && (nodeEnv === undefined || nodeEnv.length === 0 || nodeEnv === "development");
  if (shouldUseDevServer) {
    void win.loadURL("http://localhost:5174");
  } else {
    void win.loadFile(Paths.getHtmlEntryPath());
  }

  // WARNING: Install the webview navigation guard before any provider content starts navigating.
  setupWebviewNavigationGuard();

  if (SHOULD_USE_LINUX_WINDOW_MANAGER_MAXIMIZE) {
    win.on("maximize", () => {
      win.setResizable(false);
    });
  }

  win.once("ready-to-show", () => {
    if (SHOULD_USE_LINUX_WINDOW_MANAGER_MAXIMIZE) {
      restoreWindowedBounds(win);
    }
    win.show();
    if (SHOULD_USE_LINUX_WINDOW_MANAGER_MAXIMIZE) {
      setTimeout(() => {
        constrainWindowToVisibleWorkArea(win);
      }, 0);
    }
  });

  return win;
}

function extendConnectSrc(csp: string, extras: string[]): string {
  const connectSrcRegex = /(^|;)\s*connect-src\s+([^;]+)/i;
  const match = csp.match(connectSrcRegex);

  if (match === null) {
    return `${csp}; connect-src 'self' ${extras.join(" ")}`.trim();
  }

  const prefix = match[1] ?? "";
  const sources = match[2] ?? "";
  const missing = extras.filter((extra) => !sources.includes(extra));
  if (missing.length === 0) {
    return csp;
  }

  const replacement = `${prefix} connect-src ${sources} ${missing.join(" ")}`;
  return csp.replace(connectSrcRegex, replacement);
}

interface WindowManagerOptions {
  mainWindow?: BrowserWindow | null;
}

export function initWindowManager(opts: WindowManagerOptions = {}): void {
  _mainWindow = opts.mainWindow ?? _mainWindow;
}

export function setMainWindow(window: BrowserWindow | null): void {
  _mainWindow = window;
}

export function windowMinimize(): void {
  try {
    _mainWindow?.minimize();
  } catch (err) {
    void logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.WARNING,
      "electron.window.logs.minimizeFailed",
      { message: err instanceof Error ? err.message : String(err) },
      {
        error: err instanceof Error ? err.message : String(err),
      }
    );
  }
}

export function windowClose(): void {
  try {
    _mainWindow?.close();
  } catch (err) {
    void logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.WARNING,
      "electron.window.logs.closeFailed",
      { message: err instanceof Error ? err.message : String(err) },
      {
        error: err instanceof Error ? err.message : String(err),
      }
    );
  }
}

export function windowToggleFullscreen(): void {
  try {
    if (_mainWindow === null) return;
    const isFull = _mainWindow.isFullScreen();
    if (isFull) {
      _mainWindow.setFullScreen(false);
      restoreWindowedBounds(_mainWindow);
      void logger.logInternalT(
        LogCategory.MAIN,
        LogLevel.INFO,
        "electron.window.logs.exitedFullscreen",
        undefined,
        {
          bounds: _mainWindow.getBounds(),
        }
      );
      return;
    }
    _mainWindow.setResizable(true);
    _mainWindow.setFullScreen(true);
    void logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.INFO,
      "electron.window.logs.enteredFullscreen",
      undefined,
      {
        bounds: _mainWindow.getBounds(),
      }
    );
  } catch (err) {
    void logger.logInternalT(
      LogCategory.MAIN,
      LogLevel.WARNING,
      "electron.window.logs.toggleFullscreenFailed",
      { message: err instanceof Error ? err.message : String(err) },
      {
        error: err instanceof Error ? err.message : String(err),
      }
    );
  }
}

type RestartUiMode = "classic" | "scene";

interface AppRestartOptions {
  forceFullRestart?: boolean;
  uiMode?: RestartUiMode;
  sceneEditor?: boolean;
  sceneDebug?: boolean;
}

const UI_MODE_ARG_PREFIXES = ["--app-ui-mode", "--ui-mode"];
const SCENE_EDITOR_ARG_PREFIXES = ["--app-scene-editor", "--scene-editor"];
const SCENE_DEBUG_ARG_PREFIXES = ["--app-scene-debug", "--scene-debug"];
const WRAPPER_RESTART_REQUEST_FILE = "assistant-wrapper-restart.json";

function shouldStripArg(arg: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => arg === prefix || arg.startsWith(`${prefix}=`));
}

function buildRelaunchArgs(options: AppRestartOptions): string[] {
  const baseArgs = process.argv.slice(1);
  const overrideUiMode = options.uiMode !== undefined;
  const overrideSceneEditor = options.sceneEditor !== undefined;
  const overrideSceneDebug = options.sceneDebug !== undefined;
  const overrideSceneFlag = overrideSceneEditor || overrideSceneDebug;

  if (!overrideUiMode && !overrideSceneFlag) {
    return baseArgs;
  }

  const nextArgs = baseArgs.filter((arg) => {
    if (overrideUiMode && shouldStripArg(arg, UI_MODE_ARG_PREFIXES)) {
      return false;
    }
    if (
      overrideSceneFlag &&
      (shouldStripArg(arg, SCENE_EDITOR_ARG_PREFIXES) ||
        shouldStripArg(arg, SCENE_DEBUG_ARG_PREFIXES))
    ) {
      return false;
    }
    return true;
  });

  if (overrideUiMode && options.uiMode === "scene") {
    nextArgs.push("--app-ui-mode=scene");
  }

  if (overrideSceneFlag && resolveRestartSceneEditor(options) === true) {
    nextArgs.push("--app-scene-editor=1");
    nextArgs.push("--app-scene-debug=1");
  }

  return nextArgs;
}

function readArgValue(prefixes: string[]): string | null {
  for (const arg of process.argv) {
    for (const prefix of prefixes) {
      if (arg.startsWith(`${prefix}=`)) {
        const value = arg.slice(prefix.length + 1).trim();
        return value === "" ? null : value;
      }
      if (arg === prefix) {
        return "";
      }
    }
  }
  return null;
}

function resolveRestartUiMode(options: AppRestartOptions): RestartUiMode {
  if (options.uiMode !== undefined) {
    return options.uiMode;
  }
  const raw = readArgValue(UI_MODE_ARG_PREFIXES);
  return raw === "scene" ? "scene" : "classic";
}

function resolveRestartSceneEditor(options: AppRestartOptions): boolean {
  if (options.sceneEditor !== undefined) {
    return options.sceneEditor;
  }
  if (options.sceneDebug !== undefined) {
    return options.sceneDebug;
  }
  return process.argv.some(
    (arg) =>
      shouldStripArg(arg, SCENE_EDITOR_ARG_PREFIXES) ||
      shouldStripArg(arg, SCENE_DEBUG_ARG_PREFIXES)
  );
}

function resolveRestartSceneDebug(options: AppRestartOptions): boolean {
  return resolveRestartSceneEditor(options);
}

function resolveDevRestartScript(options: AppRestartOptions): string {
  const sceneDebug = resolveRestartSceneDebug(options);
  if (sceneDebug) {
    return "start:scene:debug";
  }
  const uiMode = resolveRestartUiMode(options);
  return uiMode === "scene" ? "start:scene" : "start";
}

function buildDevRestartEnv(scriptName: string): NodeJS.ProcessEnv {
  const env = { ...process.env };

  if (scriptName === "start") {
    delete env["APP_UI_MODE"];
    delete env["APP_SCENE_DEBUG"];
  } else if (scriptName === "start:scene") {
    env["APP_UI_MODE"] = "scene";
    delete env["APP_SCENE_DEBUG"];
  } else if (scriptName === "start:scene:debug") {
    env["APP_UI_MODE"] = "scene";
    env["APP_SCENE_DEBUG"] = "1";
  }

  return env;
}

function isWrapperManagedRestart(): boolean {
  return process.env["HAYALET_WRAPPER_MANAGED"] === "1";
}

function getWrapperRestartRequestPath(): string {
  return join(Paths.getProjectRoot(), "data", WRAPPER_RESTART_REQUEST_FILE);
}

async function writeWrapperRestartRequest(options: AppRestartOptions): Promise<void> {
  const restartRequest = {
    requestedAt: new Date().toISOString(),
    uiMode: resolveRestartUiMode(options),
    sceneDebug: resolveRestartSceneDebug(options),
  };
  const filePath = getWrapperRestartRequestPath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(restartRequest, null, 2)}\n`, "utf-8");
}

function spawnDevRestart(scriptName: string): void {
  const projectRoot = Paths.getProjectRoot();
  const helperPath = join(projectRoot, "scripts", "dev-restart-helper.mjs");
  const restartEnv = buildDevRestartEnv(scriptName);
  const child = spawn(
    process.execPath,
    [helperPath, "--pid", String(process.pid), "--script", scriptName],
    {
      cwd: projectRoot,
      env: restartEnv,
      detached: true,
      stdio: "ignore",
    }
  );
  child.unref();
}

export async function appRestart(options: AppRestartOptions = {}): Promise<{
  success: boolean;
  message?: string;
}> {
  try {
    const shouldRelaunch =
      options.forceFullRestart === true ||
      options.uiMode !== undefined ||
      options.sceneEditor !== undefined ||
      options.sceneDebug !== undefined;

    if (isWrapperManagedRestart()) {
      if (!app.isPackaged && !shouldRelaunch && _mainWindow !== null) {
        _mainWindow.reload();
        return {
          success: true,
          message: await windowT("devPageReloaded"),
        };
      }

      await writeWrapperRestartRequest(options);
      app.quit();
      return { success: true };
    }

    if (!app.isPackaged) {
      const scriptName = resolveDevRestartScript(options);
      spawnDevRestart(scriptName);
      app.quit();
      return { success: true };
    }

    const relaunchArgs = buildRelaunchArgs(options);
    app.relaunch({ args: relaunchArgs });
    app.quit();
    return { success: true };
  } catch (err) {
    return { success: false, message: (err as Error).message };
  }
}

const PROVIDER_ALLOWED_DOMAINS: Record<string, string[]> = {
  "chatgpt.com": ["chatgpt.com", "auth.openai.com", "auth0.openai.com", "openai.com"],
  "gemini.google.com": ["gemini.google.com", "accounts.google.com", "myaccount.google.com"],
  "grok.com": ["grok.com", "x.ai", "accounts.x.ai"],
  "127.0.0.1": ["127.0.0.1", "localhost"],
  localhost: ["127.0.0.1", "localhost"],
};

function isUrlAllowedInWebview(targetUrl: string, currentUrl: string): boolean {
  let target: URL;
  try {
    target = new URL(targetUrl);
  } catch {
    // NOTE: Ignore malformed targets instead of blocking navigation entirely.
    return true;
  }

  // NOTE: Non-http(s) schemes stay allowed so built-in Electron pages are not blocked.
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return true;
  }

  let providerHostname: string;
  try {
    providerHostname = new URL(currentUrl).hostname;
  } catch {
    // NOTE: Skip enforcement when the current provider URL is unavailable.
    return true;
  }

  const allowedDomains = findAllowedDomains(providerHostname);
  if (allowedDomains === null) {
    // NOTE: Unknown providers fall back to permissive navigation.
    return true;
  }

  const targetHostname = target.hostname;

  return allowedDomains.some((domain) => {
    return targetHostname === domain || targetHostname.endsWith(`.${domain}`);
  });
}

function findAllowedDomains(hostname: string): string[] | null {
  for (const [key, domains] of Object.entries(PROVIDER_ALLOWED_DOMAINS)) {
    if (hostname === key || hostname.endsWith(`.${key}`)) {
      return domains;
    }
  }

  if (hostname === "127.0.0.1" || hostname === "localhost") {
    return PROVIDER_ALLOWED_DOMAINS["127.0.0.1"] ?? null;
  }

  return null;
}

function setupWebviewNavigationGuard(): void {
  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() !== "webview") return;

    contents.on("will-navigate", (event, url) => {
      const currentUrl = contents.getURL();
      if (!isUrlAllowedInWebview(url, currentUrl)) {
        event.preventDefault();
        void shell.openExternal(url);
        void logger.logInternalT(
          LogCategory.WEBVIEW,
          LogLevel.INFO,
          "electron.window.logs.externalLinkOpened",
          undefined,
          { url, currentUrl }
        );
      }
    });

    contents.setWindowOpenHandler(({ url }) => {
      const currentUrl = contents.getURL();
      if (!isUrlAllowedInWebview(url, currentUrl)) {
        void shell.openExternal(url);
        void logger.logInternalT(
          LogCategory.WEBVIEW,
          LogLevel.INFO,
          "electron.window.logs.externalPopupOpened",
          undefined,
          { url, currentUrl }
        );
        return { action: "deny" };
      }
      return { action: "allow" };
    });
  });
}
