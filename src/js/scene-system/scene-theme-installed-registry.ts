import type { SceneThemeRegistration } from "./scene-theme-registry-contract.js";

type SceneThemeRegistryListener = () => void;
type SceneThemeElectronApi = {
  sceneThemesListInstalled?: () => Promise<{
    success: boolean;
    themes?: SceneThemeRegistration[];
    error?: string;
  }>;
};

const sceneThemeRegistryListeners = new Set<SceneThemeRegistryListener>();

let installedSceneThemeRegistrations: SceneThemeRegistration[] = [];

function notifyInstalledSceneThemeRegistryListeners(): void {
  sceneThemeRegistryListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore listener failures so registry updates stay best-effort.
    }
  });
}

function cloneInstalledSceneThemeRegistration(
  registration: SceneThemeRegistration
): SceneThemeRegistration {
  return {
    ...structuredClone(registration),
    themeId: registration.themeId.trim(),
    sourceKind: "installed",
  };
}

function normalizeInstalledSceneThemeRegistrations(
  registrations: SceneThemeRegistration[]
): SceneThemeRegistration[] {
  const seenThemeIds = new Set<string>();

  return registrations.map(cloneInstalledSceneThemeRegistration).filter((registration) => {
    const themeId = registration.themeId.trim();
    if (themeId === "" || seenThemeIds.has(themeId)) {
      return false;
    }

    seenThemeIds.add(themeId);
    registration.themeId = themeId;
    registration.sourceKind = "installed";
    return true;
  });
}

export async function syncInstalledSceneThemeRegistrationsFromElectron(): Promise<
  SceneThemeRegistration[]
> {
  if (typeof window === "undefined") {
    clearInstalledSceneThemeRegistrations();
    return [];
  }

  const electronApi = window as Window & { electronAPI?: SceneThemeElectronApi };
  const listInstalledThemes = electronApi.electronAPI?.sceneThemesListInstalled;
  if (typeof listInstalledThemes !== "function") {
    clearInstalledSceneThemeRegistrations();
    return [];
  }

  try {
    const result = await listInstalledThemes();
    if (result.success !== true || Array.isArray(result.themes) === false) {
      clearInstalledSceneThemeRegistrations();
      return [];
    }

    replaceInstalledSceneThemeRegistrations(result.themes);
    return getInstalledSceneThemeRegistrations();
  } catch {
    clearInstalledSceneThemeRegistrations();
    return [];
  }
}

export function getInstalledSceneThemeRegistrations(): SceneThemeRegistration[] {
  return installedSceneThemeRegistrations.map(cloneInstalledSceneThemeRegistration);
}

export function replaceInstalledSceneThemeRegistrations(
  registrations: SceneThemeRegistration[]
): void {
  installedSceneThemeRegistrations = normalizeInstalledSceneThemeRegistrations([...registrations]);
  notifyInstalledSceneThemeRegistryListeners();
}

export function clearInstalledSceneThemeRegistrations(): void {
  if (installedSceneThemeRegistrations.length === 0) {
    return;
  }

  installedSceneThemeRegistrations = [];
  notifyInstalledSceneThemeRegistryListeners();
}

export function subscribeInstalledSceneThemeRegistry(
  listener: SceneThemeRegistryListener
): () => void {
  sceneThemeRegistryListeners.add(listener);
  return () => {
    sceneThemeRegistryListeners.delete(listener);
  };
}
