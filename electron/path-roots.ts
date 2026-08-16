import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const electronRequire = createRequire(import.meta.url);
const moduleFileName = fileURLToPath(import.meta.url);

function isProjectRoot(candidateDir: string): boolean {
  return (
    existsSync(join(candidateDir, "package.json")) && existsSync(join(candidateDir, "AGENTS.md"))
  );
}

function resolveProjectRootFromFile(moduleFile: string): string {
  let currentDir = dirname(moduleFile);

  for (;;) {
    if (isProjectRoot(currentDir)) return currentDir;

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  const moduleDir = dirname(moduleFile);
  const distElectronSuffix = join("dist", "electron");
  if (moduleDir.endsWith(distElectronSuffix)) {
    return resolve(moduleDir, "..", "..");
  }

  return resolve(moduleDir, "..");
}

const defaultProjectRoot = resolveProjectRootFromFile(moduleFileName);

function getElectronApp(): { isPackaged?: boolean; getPath?: (name: string) => string } | null {
  try {
    const electronModule: unknown = electronRequire("electron");
    if (electronModule === null || typeof electronModule !== "object") {
      return null;
    }

    const app = (
      electronModule as { app?: { isPackaged?: boolean; getPath?: (name: string) => string } }
    ).app;
    return app !== undefined && typeof app === "object" ? app : null;
  } catch {
    return null;
  }
}

function isPackagedMode(): boolean {
  return getElectronApp()?.isPackaged === true;
}

function resolvePackagedProjectRoot(
  app: { isPackaged?: boolean; getPath?: (name: string) => string } | null
): string {
  const portableDir =
    typeof process.env["PORTABLE_EXECUTABLE_DIR"] === "string"
      ? process.env["PORTABLE_EXECUTABLE_DIR"].trim()
      : "";
  if (portableDir !== "") {
    return portableDir;
  }

  const appImagePath =
    typeof process.env["APPIMAGE"] === "string" ? process.env["APPIMAGE"].trim() : "";
  if (appImagePath !== "") {
    return dirname(appImagePath);
  }

  const executablePath = app?.getPath?.("exe");
  return typeof executablePath === "string" && executablePath !== ""
    ? dirname(executablePath)
    : dirname(process.execPath);
}

export function resolveProjectRoot(): string {
  const app = getElectronApp();
  if (isPackagedMode()) {
    return resolvePackagedProjectRoot(app);
  }

  return defaultProjectRoot;
}

export function resolveDataDir(): string {
  return join(resolveProjectRoot(), "data");
}

export function resolveConfigDir(): string {
  return join(resolveProjectRoot(), "config");
}

export function resolveAssetsDir(): string {
  return isPackagedMode()
    ? join(process.resourcesPath, "app.asar", "src", "assets")
    : join(resolveProjectRoot(), "src", "assets");
}

export function detectPackagedMode(): boolean {
  return isPackagedMode();
}
