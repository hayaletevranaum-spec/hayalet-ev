import type { StartupRoomsSnapshot } from "@shared/index.js";

export type StartupUiMode = "classic" | "scene";

export interface StartupFlags {
  startPage: string | null;
  autoConnect: boolean;
  uiMode: StartupUiMode;
  sceneEditor: boolean;
  sceneDebug: boolean;
  displayId: number | null;
  roomsSnapshot: StartupRoomsSnapshot | null;
}

const STARTUP_ROOMS_SNAPSHOT_FLAG = "--app-rooms-snapshot";

function readFlagValue(argv: readonly string[], flagName: string): string | null {
  const prefix = `${flagName}=`;
  const raw = argv.find((arg) => arg.startsWith(prefix));
  if (raw === undefined) {
    return null;
  }

  const value = raw.slice(prefix.length).trim();
  return value === "" ? null : value;
}

function normalizeStartPage(startPage: string | null): string | null {
  if (startPage === null || startPage === "") {
    return null;
  }

  return startPage;
}

function normalizeUiMode(uiMode: string | null): StartupUiMode {
  return uiMode === "scene" ? "scene" : "classic";
}

function normalizeDisplayId(displayId: string | null): number | null {
  if (displayId === null || displayId === "") {
    return null;
  }

  const parsed = Number.parseInt(displayId, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function parseStartupFlagsFromArgv(argv: readonly string[]): StartupFlags {
  const startPage = normalizeStartPage(
    readFlagValue(argv, "--app-start-page") ?? readFlagValue(argv, "--start-page")
  );
  const uiMode = normalizeUiMode(
    readFlagValue(argv, "--app-ui-mode") ?? readFlagValue(argv, "--ui-mode")
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
  const displayId = normalizeDisplayId(
    readFlagValue(argv, "--app-display-id") ?? readFlagValue(argv, "--display-id")
  );

  return {
    startPage,
    autoConnect,
    uiMode,
    sceneEditor: sceneDebug,
    sceneDebug,
    displayId,
    roomsSnapshot: null,
  };
}

export function buildPreloadAdditionalArguments(flags: StartupFlags): string[] {
  const args: string[] = [];

  const startPage = normalizeStartPage(flags.startPage);
  if (startPage !== null && startPage !== "") {
    args.push(`--app-start-page=${startPage}`);
  }

  if (flags.autoConnect) {
    args.push("--app-auto-connect=1");
  }

  if (normalizeUiMode(flags.uiMode) === "scene") {
    args.push("--app-ui-mode=scene");
  }

  if (flags.sceneDebug) {
    args.push("--app-scene-editor=1");
    args.push("--app-scene-debug=1");
  }

  if (flags.roomsSnapshot !== null) {
    const encodedSnapshot = Buffer.from(JSON.stringify(flags.roomsSnapshot), "utf8").toString(
      "base64"
    );
    args.push(`${STARTUP_ROOMS_SNAPSHOT_FLAG}=${encodedSnapshot}`);
  }

  return args;
}
