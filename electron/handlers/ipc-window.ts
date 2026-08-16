import { ipcMain, dialog, shell, BrowserWindow } from "electron";
import {
  windowMinimize,
  windowClose,
  windowToggleFullscreen,
  minimizeToTray,
  appRestart,
} from "../window-manager.ts";
import { registerHandler } from "./ipc-helpers.ts";
import { spawn, spawnSync, execFile } from "child_process";
import { platform } from "os";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { promisify } from "util";
import { getLoggerCore } from "../logger/index.js";
import { LogCategory, LogLevel } from "@shared/index.js";
import { Paths } from "../paths.ts";
import { loadSettings } from "../settings-manager.ts";
import type { TranslationParams } from "../../src/types/i18n.ts";
import { DEFAULT_APP_LANGUAGE } from "../../src/types/i18n.ts";
import { loadAvailableLanguage } from "../i18n/language-service.ts";
import { translateCatalog } from "../../shared/i18n/catalog.js";
import { getBuiltInLanguagePack } from "../../shared/i18n/bundled-languages.js";
import { normalizeAppLanguage } from "../../shared/i18n/locale.js";

const logger = getLoggerCore();
const execFileAsync = promisify(execFile);
const OPENCODE_INSTALL_URL = "https://opencode.ai/install";
const OPENCODE_RELEASES_API_URL = "https://api.github.com/repos/anomalyco/opencode/releases/latest";
const OPENCODE_RELEASES_PAGE_URL = "https://github.com/anomalyco/opencode/releases/latest";
const INTERACTION_CLI_PROVIDERS = Object.freeze([
  {
    id: "opencode",
    patterns: [/(^|[/\s])opencode([/\s]|$)/i],
  },
  {
    id: "codex",
    patterns: [/@openai\/codex/i, /(^|[/\s])codex([/\s]|$)/i],
  },
  {
    id: "claude",
    patterns: [/(^|[/\s])claude(?:-code)?([/\s]|$)/i],
  },
  {
    id: "gemini",
    patterns: [/(^|[/\s])gemini(?:-cli)?([/\s]|$)/i],
  },
  {
    id: "aider",
    patterns: [/(^|[/\s])aider([/\s]|$)/i],
  },
  {
    id: "cursor",
    patterns: [/(^|[/\s])cursor([/\s]|$)/i],
  },
  {
    id: "qwen",
    patterns: [/(^|[/\s])qwen([/\s]|$)/i],
  },
  {
    id: "roo",
    patterns: [/(^|[/\s])roo([/\s]|$)/i],
  },
]);

interface InteractionProcessEntry {
  pid: number;
  ppid: number;
  args: string;
}

function parseInteractionProcessLine(line: string): InteractionProcessEntry | null {
  const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/u);
  if (match === null) {
    return null;
  }

  const pid = Number.parseInt(match[1] ?? "", 10);
  const ppid = Number.parseInt(match[2] ?? "", 10);
  const args = (match[3] ?? "").trim();
  if (!Number.isFinite(pid) || !Number.isFinite(ppid) || args === "") {
    return null;
  }

  return { pid, ppid, args };
}

function normalizeInteractionArgs(args: string): string {
  return args.replace(/\\/g, "/").toLowerCase();
}

function isInteractionMainAppProcess(args: string): boolean {
  const normalizedArgs = normalizeInteractionArgs(args);
  return (
    normalizedArgs.includes("dist/electron/main.js") &&
    !normalizedArgs.includes("dist/ghost-agent/electron/main.js")
  );
}

function isInteractionGhostProcess(args: string): boolean {
  return normalizeInteractionArgs(args).includes("dist/ghost-agent/electron/main.js");
}

function isInteractionWrapperProcess(args: string): boolean {
  return normalizeInteractionArgs(args).includes("scripts/ghost-agent-wrapper.mjs");
}

function isInteractionOpencodeServeProcess(args: string): boolean {
  return /\bopencode\b.*\bserve\b/iu.test(args);
}

async function readWindowsProcessListWith(
  shellCommand: "powershell.exe" | "pwsh"
): Promise<string> {
  const command = [
    "$ErrorActionPreference = 'Stop';",
    "Get-CimInstance Win32_Process",
    "| Select-Object ProcessId,ParentProcessId,CommandLine,Name",
    "| ConvertTo-Json -Compress",
  ].join(" ");
  const { stdout } = await execFileAsync(
    shellCommand,
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  );
  return stdout;
}

async function readWindowsProcessList(): Promise<string> {
  try {
    return await readWindowsProcessListWith("powershell.exe");
  } catch {
    try {
      return await readWindowsProcessListWith("pwsh");
    } catch (fallbackError) {
      throw new Error("Unable to read Windows process list.", {
        cause: fallbackError,
      });
    }
  }
}

function parseInteractionProcessId(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number.parseInt(value, 10);
  }

  return Number.NaN;
}

async function readInteractionProcessEntries(): Promise<InteractionProcessEntry[]> {
  try {
    if (process.platform === "win32") {
      const stdout = await readWindowsProcessList();
      const trimmedStdout = stdout.trim();
      const parsed: unknown = JSON.parse(trimmedStdout !== "" ? trimmedStdout : "[]");
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows
        .map((entry): InteractionProcessEntry | null => {
          if (entry === null || typeof entry !== "object") return null;
          const record = entry as Record<string, unknown>;
          const pid = parseInteractionProcessId(record["ProcessId"]);
          const ppid = parseInteractionProcessId(record["ParentProcessId"]);
          const args =
            typeof record["CommandLine"] === "string" && record["CommandLine"].trim() !== ""
              ? record["CommandLine"].trim()
              : typeof record["Name"] === "string"
                ? record["Name"].trim()
                : "";
          return Number.isFinite(pid) && Number.isFinite(ppid) && args !== ""
            ? { pid, ppid, args }
            : null;
        })
        .filter((entry): entry is InteractionProcessEntry => entry !== null);
    }

    const { stdout } = await execFileAsync("ps", ["-eo", "pid=,ppid=,args="]);
    return stdout
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => parseInteractionProcessLine(line))
      .filter((entry): entry is InteractionProcessEntry => entry !== null);
  } catch {
    return [];
  }
}

function buildInteractionProbes(entries: InteractionProcessEntry[]): {
  mainProcess: boolean;
  ghostProcess: boolean;
  wrapperProcess: boolean;
  opencodeServerRunning: boolean;
} {
  return {
    mainProcess: entries.some((entry) => isInteractionMainAppProcess(entry.args)),
    ghostProcess: entries.some((entry) => isInteractionGhostProcess(entry.args)),
    wrapperProcess: entries.some((entry) => isInteractionWrapperProcess(entry.args)),
    opencodeServerRunning: entries.some((entry) => isInteractionOpencodeServeProcess(entry.args)),
  };
}

function toInteractionTimestampMs(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveInteractionAppMode(
  runtime: {
    desiredMode: "terminal" | "soft" | "ghost-agent";
    phase: "idle" | "preparing-handoff" | "in-ghost" | "returning";
    updatedAt: string;
  },
  probes: {
    mainProcess: boolean;
    ghostProcess: boolean;
    wrapperProcess: boolean;
    opencodeServerRunning: boolean;
  }
): "terminal" | "app" | "ghost-agent" | "transitioning" | "conflict" {
  const nowMs = Date.now();
  const updatedMs = toInteractionTimestampMs(runtime.updatedAt);
  const runtimeAgeMs = updatedMs === null ? null : Math.max(0, nowMs - updatedMs);
  const staleRuntime = runtimeAgeMs === null ? true : runtimeAgeMs > 60000;

  const inferred =
    probes.mainProcess && probes.ghostProcess
      ? "conflict"
      : probes.ghostProcess
        ? "ghost-agent"
        : probes.mainProcess
          ? "app"
          : "terminal";

  const expected =
    runtime.phase === "preparing-handoff" || runtime.phase === "returning"
      ? "transitioning"
      : runtime.phase === "in-ghost"
        ? "ghost-agent"
        : runtime.desiredMode === "terminal"
          ? "terminal"
          : "app";

  if (inferred === "conflict") {
    return "conflict";
  }

  if (expected === "transitioning") {
    if (!probes.mainProcess && !probes.ghostProcess && !probes.wrapperProcess && staleRuntime) {
      return "terminal";
    }

    return "transitioning";
  }

  if (expected === inferred) {
    return inferred;
  }

  if (expected === "app" && inferred === "terminal") {
    return probes.wrapperProcess && !staleRuntime ? "transitioning" : "terminal";
  }

  if (expected === "terminal" && (inferred === "app" || inferred === "ghost-agent")) {
    return "conflict";
  }

  return "conflict";
}

function collectInteractionAncestorChain(
  entries: InteractionProcessEntry[],
  startPid: number
): InteractionProcessEntry[] {
  const entryMap = new Map<number, InteractionProcessEntry>();
  entries.forEach((entry) => {
    entryMap.set(entry.pid, entry);
  });

  const chain: InteractionProcessEntry[] = [];
  const visited = new Set<number>();
  let currentPid = startPid;

  while (currentPid > 0 && visited.has(currentPid) === false) {
    visited.add(currentPid);
    const entry = entryMap.get(currentPid);
    if (entry === undefined) {
      break;
    }
    chain.push(entry);
    currentPid = entry.ppid;
  }

  return chain;
}

function detectInteractionCliProvider(args: string): string | null {
  for (const provider of INTERACTION_CLI_PROVIDERS) {
    if (provider.patterns.some((pattern) => pattern.test(args))) {
      return provider.id;
    }
  }

  return null;
}

function resolveInteractionEffectiveMode(options: {
  entries: InteractionProcessEntry[];
  currentPid: number;
  appMode: "terminal" | "app" | "ghost-agent" | "transitioning" | "conflict";
  probes: {
    opencodeServerRunning: boolean;
  };
}): {
  effectiveMode:
    | "terminal"
    | "app"
    | "ghost-agent"
    | "transitioning"
    | "conflict"
    | "opencode-terminal-mode"
    | "other-provider-cli";
  terminalOwner: "none" | "opencode" | "other-provider" | "opencode-server";
  cliProvider: string | null;
} {
  const chain = collectInteractionAncestorChain(options.entries, options.currentPid).slice(1);
  const matchedProvider =
    chain
      .map((entry) => detectInteractionCliProvider(entry.args))
      .find((provider) => provider !== null) ?? null;
  const canOverrideMode = options.appMode === "terminal" || options.appMode === "app";

  if (canOverrideMode && options.probes.opencodeServerRunning) {
    return {
      effectiveMode: options.appMode,
      terminalOwner: "opencode-server",
      cliProvider: matchedProvider,
    };
  }

  if (canOverrideMode && matchedProvider === "opencode") {
    return {
      effectiveMode: "opencode-terminal-mode",
      terminalOwner: "opencode",
      cliProvider: matchedProvider,
    };
  }

  if (canOverrideMode && matchedProvider !== null) {
    return {
      effectiveMode: "other-provider-cli",
      terminalOwner: "other-provider",
      cliProvider: matchedProvider,
    };
  }

  return {
    effectiveMode: options.appMode,
    terminalOwner: "none",
    cliProvider: matchedProvider,
  };
}

async function translateElectronMessage(key: string, params?: TranslationParams): Promise<string> {
  let settings: { general?: { language?: unknown } };
  try {
    settings = (await loadSettings()) ?? {};
  } catch {
    settings = {};
  }

  const locale = normalizeAppLanguage(settings.general?.language);
  const fallbackPack = getBuiltInLanguagePack(DEFAULT_APP_LANGUAGE);
  const activePack = (await loadAvailableLanguage(locale)) ?? fallbackPack;
  const activeCatalog = activePack?.catalog ?? {};
  const fallbackCatalog = fallbackPack?.catalog;

  return translateCatalog(activeCatalog, key, params, fallbackCatalog);
}

async function ipcWindowT(key: string, params?: TranslationParams): Promise<string> {
  return await translateElectronMessage(`electron.ipcWindow.${key}`, params);
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, "");
}

function compareSemver(a: string, b: string): number {
  const aParts = normalizeVersion(a)
    .split(".")
    .map((part) => {
      const parsed = Number.parseInt(part.replace(/[^0-9].*$/, ""), 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    });
  const bParts = normalizeVersion(b)
    .split(".")
    .map((part) => {
      const parsed = Number.parseInt(part.replace(/[^0-9].*$/, ""), 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    });
  const maxLength = Math.max(aParts.length, bParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const aPart = aParts[index] ?? 0;
    const bPart = bParts[index] ?? 0;
    if (aPart > bPart) return 1;
    if (aPart < bPart) return -1;
  }

  return 0;
}

function getOpencodeInstallCommand(currentPlatform: string): string {
  if (currentPlatform === "win32") {
    return "npm install -g opencode-ai";
  }

  return "curl -fsSL https://opencode.ai/install | bash";
}

function escapeShellSingleQuotes(input: string): string {
  return input.replace(/'/g, "'\"'\"'");
}

function escapeAppleScriptString(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function spawnDetachedTerminal(
  command: string,
  args: string[],
  options: { shell?: boolean } = {}
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      shell: options.shell === true,
    });

    let settled = false;
    proc.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    proc.once("spawn", () => {
      if (settled) return;
      settled = true;
      proc.unref();
      resolve();
    });
  });
}

async function launchOpencodeInstallTerminal(
  currentPlatform: string,
  installCommand: string
): Promise<boolean> {
  if (currentPlatform === "darwin") {
    const script = [
      'tell application "Terminal"',
      "activate",
      `do script "${escapeAppleScriptString(installCommand)}"`,
      "end tell",
    ].join("\n");
    await spawnDetachedTerminal("osascript", ["-e", script]);
    return true;
  }

  if (currentPlatform === "win32") {
    await spawnDetachedTerminal("cmd", ["/c", "start", "cmd", "/K", installCommand], {
      shell: true,
    });
    return true;
  }

  const shellCommand = `${installCommand}; echo; exec bash`;
  const linuxLaunchers: Array<{ command: string; args: string[]; shell?: boolean }> = [
    {
      command: "gnome-terminal",
      args: ["--", "bash", "-lc", shellCommand],
    },
    {
      command: "konsole",
      args: ["-e", "bash", "-lc", shellCommand],
    },
    {
      command: "x-terminal-emulator",
      args: ["-e", "bash", "-lc", shellCommand],
    },
    {
      command: "xfce4-terminal",
      args: ["--command", `bash -lc '${escapeShellSingleQuotes(shellCommand)}'`],
    },
  ];

  const tryLauncherAt = async (index: number): Promise<boolean> => {
    const launcher = linuxLaunchers[index];
    if (launcher == null) {
      return false;
    }

    try {
      await spawnDetachedTerminal(launcher.command, launcher.args, {
        shell: launcher.shell === true,
      });
      return true;
    } catch {
      return await tryLauncherAt(index + 1);
    }
  };

  return await tryLauncherAt(0);
}

async function fetchLatestOpencodeVersion(): Promise<{
  latestVersion: string;
  releaseUrl: string;
}> {
  const response = await fetch(OPENCODE_RELEASES_API_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "app-opencode-update-check",
    },
  });

  if (!response.ok) {
    throw new Error(await ipcWindowT("releaseCheckFailed", { status: String(response.status) }));
  }

  const payload = (await response.json()) as {
    html_url?: unknown;
    tag_name?: unknown;
    name?: unknown;
  };
  const tagName = typeof payload.tag_name === "string" ? payload.tag_name.trim() : "";
  const releaseName = typeof payload.name === "string" ? payload.name.trim() : "";
  const latestVersion = normalizeVersion(tagName !== "" ? tagName : releaseName);
  if (latestVersion === "") {
    throw new Error(await ipcWindowT("latestVersionParseFailed"));
  }

  return {
    latestVersion,
    releaseUrl:
      typeof payload.html_url === "string" && payload.html_url.trim() !== ""
        ? payload.html_url.trim()
        : OPENCODE_RELEASES_PAGE_URL,
  };
}

function getAssistantRuntimePath(): string {
  return join(Paths.getProjectRoot(), "data", "assistant-runtime.json");
}

function normalizeAssistantRuntime(input: unknown): {
  workflowSessionId: string;
  desiredMode: "terminal" | "soft" | "ghost-agent";
  phase: "idle" | "preparing-handoff" | "in-ghost" | "returning";
  updatedAt: string;
} {
  const fallback = {
    workflowSessionId: "",
    desiredMode: "soft" as const,
    phase: "idle" as const,
    updatedAt: new Date().toISOString(),
  };

  const data =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const desiredModeRaw =
    typeof data["desiredMode"] === "string" ? data["desiredMode"] : fallback.desiredMode;
  const phaseRaw = typeof data["phase"] === "string" ? data["phase"] : fallback.phase;

  const desiredMode =
    desiredModeRaw === "terminal" || desiredModeRaw === "soft" || desiredModeRaw === "ghost-agent"
      ? desiredModeRaw
      : fallback.desiredMode;

  const phase =
    phaseRaw === "idle" ||
    phaseRaw === "preparing-handoff" ||
    phaseRaw === "in-ghost" ||
    phaseRaw === "returning"
      ? phaseRaw
      : fallback.phase;

  return {
    workflowSessionId:
      typeof data["workflowSessionId"] === "string"
        ? data["workflowSessionId"]
        : fallback.workflowSessionId,
    desiredMode,
    phase,
    updatedAt: typeof data["updatedAt"] === "string" ? data["updatedAt"] : fallback.updatedAt,
  };
}

async function readAssistantRuntime(): Promise<{
  workflowSessionId: string;
  desiredMode: "terminal" | "soft" | "ghost-agent";
  phase: "idle" | "preparing-handoff" | "in-ghost" | "returning";
  updatedAt: string;
}> {
  try {
    const raw = await readFile(getAssistantRuntimePath(), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return normalizeAssistantRuntime(parsed);
  } catch {
    return normalizeAssistantRuntime({});
  }
}

async function writeAssistantRuntime(value: unknown): Promise<{
  workflowSessionId: string;
  desiredMode: "terminal" | "soft" | "ghost-agent";
  phase: "idle" | "preparing-handoff" | "in-ghost" | "returning";
  updatedAt: string;
}> {
  const normalized = normalizeAssistantRuntime(value);
  await mkdir(dirname(getAssistantRuntimePath()), { recursive: true });
  await writeFile(getAssistantRuntimePath(), `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  return normalized;
}

function isGhostHandoffState(state: {
  desiredMode: "terminal" | "soft" | "ghost-agent";
  phase: "idle" | "preparing-handoff" | "in-ghost" | "returning";
}): boolean {
  if (state.desiredMode !== "ghost-agent") return false;
  return state.phase === "preparing-handoff" || state.phase === "in-ghost";
}

async function prepareRuntimeForWindowClose(): Promise<void> {
  const current = await readAssistantRuntime();
  if (isGhostHandoffState(current)) {
    return;
  }

  await writeAssistantRuntime({
    ...current,
    desiredMode: "terminal",
    phase: "idle",
    updatedAt: new Date().toISOString(),
  });
}

export function setupWindowHandlers(): void {
  ipcMain.on("window-minimize", windowMinimize);
  ipcMain.on("window-close", (): void => {
    void (async (): Promise<void> => {
      try {
        await prepareRuntimeForWindowClose();
      } catch (error) {
        await logger.logInternalT(
          LogCategory.IPC,
          LogLevel.WARNING,
          "electron.ipcWindow.logs.prepareRuntimeForWindowCloseFailed",
          { message: error instanceof Error ? error.message : String(error) },
          {
            error: error instanceof Error ? error.message : String(error),
          }
        );
      } finally {
        windowClose();
      }
    })();
  });

  ipcMain.on("window-toggle-fullscreen", windowToggleFullscreen);
  ipcMain.on("window-minimize-to-tray", () => {
    void minimizeToTray();
  });

  registerHandler("app-restart", async (_event, options?: { [key: string]: unknown }) => {
    const uiModeRaw = options?.["uiMode"];
    const uiMode = uiModeRaw === "classic" || uiModeRaw === "scene" ? uiModeRaw : undefined;
    const sceneEditorRaw = options?.["sceneEditor"];
    const sceneEditor =
      sceneEditorRaw === true ? true : sceneEditorRaw === false ? false : undefined;
    const sceneDebugRaw = options?.["sceneDebug"];
    const sceneDebug = sceneDebugRaw === true ? true : sceneDebugRaw === false ? false : undefined;

    return await appRestart({
      forceFullRestart: options?.["forceFullRestart"] === true,
      ...(uiMode !== undefined ? { uiMode } : {}),
      ...(sceneEditor !== undefined ? { sceneEditor } : {}),
      ...(sceneDebug !== undefined ? { sceneDebug } : {}),
    });
  });

  registerHandler("show-open-dialog", async (_event, options?: Electron.OpenDialogOptions) => {
    const focusedWindow = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    const defaultTitle = await ipcWindowT("openDialogTitle");
    const defaultButtonLabel = await ipcWindowT("openDialogButtonLabel");

    const dialogOptions: Electron.OpenDialogOptions = {
      properties: options?.properties ?? ["openDirectory"],
      title: options?.title ?? defaultTitle,
      buttonLabel: options?.buttonLabel ?? defaultButtonLabel,
      ...(Array.isArray(options?.filters) ? { filters: options.filters } : {}),
      ...(options?.defaultPath !== undefined && options.defaultPath.length > 0
        ? { defaultPath: options.defaultPath }
        : {}),
    };

    await logger.logInternalT(
      LogCategory.IPC,
      LogLevel.DEBUG,
      "electron.ipcWindow.logs.showOpenDialogCalled",
      undefined,
      {
        options: dialogOptions,
      }
    );

    const result =
      focusedWindow !== undefined
        ? await dialog.showOpenDialog(focusedWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);

    await logger.logInternalT(
      LogCategory.IPC,
      LogLevel.DEBUG,
      "electron.ipcWindow.logs.showOpenDialogResult",
      undefined,
      {
        canceled: result.canceled,
        filePathsCount: result.filePaths.length,
      }
    );
    return result;
  });

  registerHandler("open-terminal", async (_event, targetPath: string) => {
    const os = platform();

    if (os === "darwin") {
      return await new Promise((resolve, reject) => {
        const proc = spawn("open", ["-a", "Terminal", targetPath], {
          detached: true,
          stdio: "ignore",
        });
        proc.unref();
        proc.on(LogLevel.ERROR, reject);
        setTimeout(() => {
          resolve({ success: true });
        }, 100);
      });
    }

    if (os === "win32") {
      const wtResult = spawnSync("where", ["wt.exe"], { encoding: "utf8" });
      const useWt = wtResult.status === 0 && wtResult.stdout.trim() !== "";
      const [command, args] = useWt
        ? ["wt.exe", ["-d", targetPath]]
        : ["cmd", ["/c", "start", "cmd", "/K", `cd /d "${targetPath}"`]];
      return await new Promise((resolve, reject) => {
        const proc = spawn(command, args, {
          detached: true,
          stdio: "ignore",
          shell: true,
        });
        proc.unref();
        proc.on(LogLevel.ERROR, reject);
        setTimeout(() => {
          resolve({ success: true });
        }, 100);
      });
    }

    const linuxTerminals: Array<{ command: string; args: string[] }> = [
      { command: "gnome-terminal", args: ["--working-directory=" + targetPath] },
      { command: "konsole", args: ["--workdir", targetPath] },
      { command: "xfce4-terminal", args: ["--working-directory=" + targetPath] },
      { command: "x-terminal-emulator", args: [] },
    ];

    let foundTerm: { command: string; args: string[] } | null = null;
    for (const term of linuxTerminals) {
      const check = spawnSync("which", [term.command], { encoding: "utf8" });
      if (check.status === 0 && check.stdout.trim() !== "") {
        foundTerm = term;
        break;
      }
    }

    if (foundTerm !== null) {
      return await new Promise((resolve, reject) => {
        const proc = spawn(foundTerm.command, foundTerm.args, {
          detached: true,
          stdio: "ignore",
          cwd: targetPath,
        });
        proc.unref();
        proc.on(LogLevel.ERROR, reject);
        setTimeout(() => {
          resolve({ success: true });
        }, 100);
      });
    }

    return { success: false, error: "No terminal emulator found" };
  });

  registerHandler("opencode-check-updates", async (_event, installedVersion: string) => {
    const normalizedInstalledVersion = normalizeVersion(installedVersion);
    if (normalizedInstalledVersion === "") {
      return {
        success: false,
        installedVersion: "",
        error: await ipcWindowT("installedOpencodeVersionMissing"),
        errorKey: "electron.ipcWindow.installedOpencodeVersionMissing",
      };
    }

    const { latestVersion, releaseUrl } = await fetchLatestOpencodeVersion();
    const updateAvailable = compareSemver(latestVersion, normalizedInstalledVersion) > 0;

    await logger.logInternalT(
      LogCategory.IPC,
      LogLevel.INFO,
      "electron.ipcWindow.logs.opencodeUpdateCheckCompleted",
      {
        installedVersion: normalizedInstalledVersion,
        latestVersion,
      },
      {
        installedVersion: normalizedInstalledVersion,
        latestVersion,
        updateAvailable,
        releaseUrl,
      }
    );

    return {
      success: true,
      installedVersion: normalizedInstalledVersion,
      latestVersion,
      updateAvailable,
      releaseUrl,
    };
  });

  registerHandler("opencode-launch-install", async () => {
    const currentPlatform = platform();
    const installCommand = getOpencodeInstallCommand(currentPlatform);
    const launched = await launchOpencodeInstallTerminal(currentPlatform, installCommand);

    if (!launched) {
      await shell.openExternal(OPENCODE_INSTALL_URL);
      await logger.logInternalT(
        LogCategory.IPC,
        LogLevel.WARNING,
        "electron.ipcWindow.logs.opencodeInstallFellBackToBrowser",
        undefined,
        {
          installUrl: OPENCODE_INSTALL_URL,
          command: installCommand,
        }
      );
      return {
        success: true,
        command: installCommand,
        installUrl: OPENCODE_INSTALL_URL,
        fallbackToBrowser: true,
      };
    }

    await logger.logInternalT(
      LogCategory.IPC,
      LogLevel.INFO,
      "electron.ipcWindow.logs.opencodeInstallTerminalLaunched",
      undefined,
      {
        installUrl: OPENCODE_INSTALL_URL,
        command: installCommand,
        platform: currentPlatform,
      }
    );

    return {
      success: true,
      command: installCommand,
      installUrl: OPENCODE_INSTALL_URL,
      fallbackToBrowser: false,
    };
  });

  registerHandler("assistant-runtime-read", async () => {
    const state = await readAssistantRuntime();
    return { success: true, state };
  });

  registerHandler("rovo-interaction-context-read", async () => {
    const [runtime, entries] = await Promise.all([
      readAssistantRuntime(),
      readInteractionProcessEntries(),
    ]);
    const probes = buildInteractionProbes(entries);
    const appMode = resolveInteractionAppMode(runtime, probes);
    const providerContext = resolveInteractionEffectiveMode({
      entries,
      currentPid: process.pid,
      appMode,
      probes,
    });

    return {
      success: true,
      appMode,
      effectiveMode: providerContext.effectiveMode,
      opencodeServerRunning: probes.opencodeServerRunning,
      terminalOwner: providerContext.terminalOwner,
      cliProvider: providerContext.cliProvider,
    };
  });

  registerHandler("assistant-runtime-write", async (_event, payload: unknown) => {
    const current = await readAssistantRuntime();
    const next = normalizeAssistantRuntime({
      ...current,
      ...(typeof payload === "object" && payload !== null ? payload : {}),
      updatedAt: new Date().toISOString(),
    });
    const state = await writeAssistantRuntime(next);
    return { success: true, state };
  });

  registerHandler("shell-open-path", async (_event, path: string) => {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      await shell.openExternal(path);
      return "";
    }
    return await shell.openPath(path);
  });
}
