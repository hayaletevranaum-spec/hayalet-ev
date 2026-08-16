import { shellT } from "../../../app/shell-i18n.js";
import { resolveIpcErrorMessage } from "../../../modules/ipc-errors.js";
import { AppI18n } from "../../../modules/i18n/index.js";
import { Toast } from "../../../ui/toast-manager.js";
import {
  getActiveSceneThemeId,
  getAvailableSceneThemes,
  getSceneThemeRegistration,
  SceneUiScaleManager,
  SceneThemeManager,
  type SceneThemeRegistration,
  type SceneThemeSummary,
} from "../../../scene-system/index.js";
import { syncInstalledSceneThemeRegistrationsFromElectron } from "../../../scene-system/scene-theme-installed-registry.js";
import { registerSettingsPanelLifecycle } from "../controller.js";

interface SceneThemePanelRefs {
  currentName: HTMLElement | null;
  currentMeta: HTMLElement | null;
  selectionHint: HTMLElement | null;
  list: HTMLElement | null;
  importButton: HTMLButtonElement | null;
  refreshButton: HTMLButtonElement | null;
  exportButton: HTMLButtonElement | null;
  applyButton: HTMLButtonElement | null;
  conflictSelect: HTMLSelectElement | null;
  scaleSelect: HTMLSelectElement | null;
}

interface SceneThemePanelState {
  isOpen: boolean;
  isBusy: boolean;
  activeThemeId: string;
  selectedThemeId: string | null;
  availableThemes: SceneThemeSummary[];
  uiScale: number;
}

let initialized = false;

function sceneThemeT(key: string, params?: Record<string, string | number>): string {
  return shellT(`theme.scene.${key}`, params);
}

function getRefs(): SceneThemePanelRefs {
  return {
    currentName: document.getElementById("scene-theme-current-name"),
    currentMeta: document.getElementById("scene-theme-current-meta"),
    selectionHint: document.getElementById("scene-theme-selection-hint"),
    list: document.getElementById("scene-theme-settings-list"),
    importButton: document.getElementById("scene-theme-import") as HTMLButtonElement | null,
    refreshButton: document.getElementById("scene-theme-refresh") as HTMLButtonElement | null,
    exportButton: document.getElementById("scene-theme-export") as HTMLButtonElement | null,
    applyButton: document.getElementById("scene-theme-apply") as HTMLButtonElement | null,
    conflictSelect: document.getElementById(
      "scene-theme-conflict-select"
    ) as HTMLSelectElement | null,
    scaleSelect: document.getElementById("scene-ui-scale-select") as HTMLSelectElement | null,
  };
}

function getSourceIcon(sourceKind: SceneThemeSummary["sourceKind"]): string {
  return sourceKind === "installed" ? "🧩" : "🏰";
}

function getSourceLabel(sourceKind: SceneThemeSummary["sourceKind"]): string {
  return sceneThemeT(`source.${sourceKind}`);
}

function getRegistrationIfAvailable(
  themeId: string | null,
  availableThemes: SceneThemeSummary[]
): SceneThemeRegistration | null {
  if (themeId === null || availableThemes.some((theme) => theme.themeId === themeId) === false) {
    return null;
  }

  return getSceneThemeRegistration(themeId);
}

function ensureSelectedThemeId(state: SceneThemePanelState): void {
  if (
    state.selectedThemeId !== null &&
    state.availableThemes.some((theme) => theme.themeId === state.selectedThemeId)
  ) {
    return;
  }

  state.selectedThemeId =
    state.availableThemes.find((theme) => theme.themeId === state.activeThemeId)?.themeId ??
    state.availableThemes[0]?.themeId ??
    null;
}

function buildSceneThemeOption(
  registration: SceneThemeRegistration,
  selectedThemeId: string | null,
  activeThemeId: string
): HTMLButtonElement {
  const item = document.createElement("button");
  const isSelected = registration.themeId === selectedThemeId;
  const isActive = registration.themeId === activeThemeId;

  item.className = "settings-theme-option settings-scene-theme-option";
  item.type = "button";
  item.dataset["sceneThemeId"] = registration.themeId;
  item.classList.toggle("is-active", isSelected);
  item.setAttribute("aria-pressed", String(isSelected));

  const icon = document.createElement("span");
  icon.className = "settings-scene-theme-option__icon";
  icon.textContent = getSourceIcon(registration.sourceKind);

  const copy = document.createElement("span");
  copy.className = "settings-scene-theme-option__copy";

  const title = document.createElement("strong");
  title.textContent = registration.label;

  const meta = document.createElement("small");
  meta.textContent = isActive
    ? sceneThemeT("meta.active", {
        source: getSourceLabel(registration.sourceKind),
      })
    : getSourceLabel(registration.sourceKind);

  copy.append(title, meta);
  item.append(icon, copy);
  return item;
}

function renderList(refs: SceneThemePanelRefs, state: SceneThemePanelState): void {
  if (refs.list === null) {
    return;
  }

  if (state.availableThemes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "settings-scene-theme-empty";
    empty.textContent = sceneThemeT("empty");
    refs.list.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.availableThemes.forEach((theme) => {
    fragment.append(
      buildSceneThemeOption(
        getSceneThemeRegistration(theme.themeId),
        state.selectedThemeId,
        state.activeThemeId
      )
    );
  });
  refs.list.replaceChildren(fragment);
}

function render(refs: SceneThemePanelRefs, state: SceneThemePanelState): void {
  ensureSelectedThemeId(state);

  const activeRegistration =
    getRegistrationIfAvailable(state.activeThemeId, state.availableThemes) ??
    getRegistrationIfAvailable(state.selectedThemeId, state.availableThemes);
  const selectedRegistration = getRegistrationIfAvailable(
    state.selectedThemeId,
    state.availableThemes
  );

  if (refs.currentName !== null) {
    refs.currentName.textContent = activeRegistration?.label ?? sceneThemeT("empty");
  }
  if (refs.currentMeta !== null) {
    refs.currentMeta.textContent =
      activeRegistration !== null ? getSourceLabel(activeRegistration.sourceKind) : "";
  }
  if (refs.selectionHint !== null) {
    if (selectedRegistration === null) {
      refs.selectionHint.textContent = sceneThemeT("empty");
    } else if (selectedRegistration.themeId === state.activeThemeId) {
      refs.selectionHint.textContent = sceneThemeT("selection.active", {
        source: getSourceLabel(selectedRegistration.sourceKind),
      });
    } else if (selectedRegistration.sourceKind === "built-in") {
      refs.selectionHint.textContent = sceneThemeT("selection.builtIn", {
        active: activeRegistration?.label ?? sceneThemeT("empty"),
      });
    } else {
      refs.selectionHint.textContent = sceneThemeT("selection.inactive", {
        active: activeRegistration?.label ?? sceneThemeT("empty"),
      });
    }
  }

  const canApply =
    selectedRegistration !== null &&
    selectedRegistration.themeId !== state.activeThemeId &&
    state.isBusy === false;
  const canExport =
    selectedRegistration !== null &&
    selectedRegistration.sourceKind === "installed" &&
    state.isBusy === false;

  refs.importButton?.toggleAttribute("disabled", state.isBusy);
  refs.refreshButton?.toggleAttribute("disabled", state.isBusy);
  refs.conflictSelect?.toggleAttribute("disabled", state.isBusy);
  if (refs.scaleSelect !== null) {
    refs.scaleSelect.value = String(state.uiScale);
    refs.scaleSelect.toggleAttribute("disabled", state.isBusy);
  }
  refs.exportButton?.toggleAttribute("disabled", !canExport);
  refs.applyButton?.toggleAttribute("disabled", !canApply);

  renderList(refs, state);
}

async function refreshSceneThemes(
  refs: SceneThemePanelRefs,
  state: SceneThemePanelState
): Promise<void> {
  state.isBusy = true;
  render(refs, state);

  try {
    await syncInstalledSceneThemeRegistrationsFromElectron();
    SceneThemeManager.reload();
    state.availableThemes = getAvailableSceneThemes();
    state.activeThemeId = getActiveSceneThemeId();
    ensureSelectedThemeId(state);
  } finally {
    state.isBusy = false;
    render(refs, state);
  }
}

export function setupSettingsThemePanel(): void {
  if (initialized) {
    return;
  }

  const refs = getRefs();
  if (
    refs.currentName === null ||
    refs.currentMeta === null ||
    refs.selectionHint === null ||
    refs.list === null ||
    refs.importButton === null ||
    refs.refreshButton === null ||
    refs.exportButton === null ||
    refs.applyButton === null ||
    refs.conflictSelect === null ||
    refs.scaleSelect === null
  ) {
    return;
  }

  const state: SceneThemePanelState = {
    isOpen: false,
    isBusy: false,
    activeThemeId: getActiveSceneThemeId(),
    selectedThemeId: getActiveSceneThemeId(),
    availableThemes: getAvailableSceneThemes(),
    uiScale: SceneUiScaleManager.getUiScale(),
  };

  const queueRefresh = async (): Promise<void> => {
    try {
      await refreshSceneThemes(refs, state);
    } catch (error) {
      state.isBusy = false;
      render(refs, state);
      Toast.error(
        sceneThemeT("toasts.refreshError"),
        error instanceof Error ? error.message : String(error)
      );
    }
  };

  refs.list.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const button = target?.closest<HTMLButtonElement>("[data-scene-theme-id]");
    const themeId = button?.dataset["sceneThemeId"] ?? "";
    if (themeId === "") {
      return;
    }

    state.selectedThemeId = themeId;
    render(refs, state);
  });

  refs.applyButton.addEventListener("click", () => {
    void (async (): Promise<void> => {
      const selectedRegistration = getRegistrationIfAvailable(
        state.selectedThemeId,
        state.availableThemes
      );
      if (selectedRegistration === null) {
        return;
      }

      state.isBusy = true;
      render(refs, state);
      try {
        const changed = await SceneThemeManager.setCurrentTheme(selectedRegistration.themeId);
        state.activeThemeId = getActiveSceneThemeId();
        state.availableThemes = getAvailableSceneThemes();
        render(refs, state);
        if (changed) {
          Toast.success(sceneThemeT("toasts.activateSuccess"), selectedRegistration.label);
        } else {
          Toast.error(sceneThemeT("toasts.activateError"), selectedRegistration.label);
        }
      } catch (error) {
        Toast.error(
          sceneThemeT("toasts.activateError"),
          error instanceof Error ? error.message : String(error)
        );
      } finally {
        state.isBusy = false;
        render(refs, state);
      }
    })();
  });

  refs.refreshButton.addEventListener("click", () => {
    void queueRefresh();
  });

  refs.scaleSelect.addEventListener("change", () => {
    void (async (): Promise<void> => {
      const uiScale = Number.parseInt(refs.scaleSelect?.value ?? "", 10);
      if (Number.isFinite(uiScale) !== true) {
        return;
      }

      try {
        const persisted = await SceneUiScaleManager.setUiScale(uiScale);
        state.uiScale = SceneUiScaleManager.getUiScale();
        render(refs, state);
        if (!persisted) {
          Toast.error(sceneThemeT("toasts.scaleError"));
        }
      } catch (error) {
        state.uiScale = SceneUiScaleManager.getUiScale();
        render(refs, state);
        Toast.error(
          sceneThemeT("toasts.scaleError"),
          error instanceof Error ? error.message : String(error)
        );
      }
    })();
  });

  refs.importButton.addEventListener("click", () => {
    void (async (): Promise<void> => {
      const api = window.electronAPI;
      if (
        api === undefined ||
        typeof api.showOpenDialog !== "function" ||
        typeof api.sceneThemesImportBundle !== "function"
      ) {
        Toast.error(sceneThemeT("toasts.importUnavailable"));
        return;
      }

      const selection = await api.showOpenDialog({
        title: sceneThemeT("dialog.bundleTitle"),
        buttonLabel: sceneThemeT("dialog.bundleButton"),
        filters: [{ name: sceneThemeT("dialog.bundleFilterName"), extensions: ["json"] }],
        properties: ["openFile"],
      });
      if (selection.canceled === true || selection.filePaths.length === 0) {
        return;
      }

      const selectedPath = String(selection.filePaths[0] ?? "").trim();
      if (selectedPath === "") {
        return;
      }
      if (selectedPath.toLowerCase().endsWith(".hevtheme.json") === false) {
        Toast.error(sceneThemeT("toasts.invalidBundleExtension"));
        return;
      }

      state.isBusy = true;
      render(refs, state);
      const result = await api.sceneThemesImportBundle({
        bundleFile: selectedPath,
        onConflict:
          refs.conflictSelect?.value === "reject" ||
          refs.conflictSelect?.value === "replace" ||
          refs.conflictSelect?.value === "rename"
            ? refs.conflictSelect.value
            : "rename",
      });
      if (result.success === true) {
        await syncInstalledSceneThemeRegistrationsFromElectron();
        SceneThemeManager.reload();
        state.availableThemes = getAvailableSceneThemes();
        state.activeThemeId = getActiveSceneThemeId();
        state.selectedThemeId = result.themeId ?? state.activeThemeId;
        state.isBusy = false;
        render(refs, state);
        Toast.success(
          sceneThemeT("toasts.importSuccess"),
          result.path ?? result.themeId ?? selectedPath
        );
        return;
      }

      state.isBusy = false;
      render(refs, state);
      Toast.error(
        sceneThemeT("toasts.importError"),
        resolveIpcErrorMessage(result) ?? selectedPath
      );
    })();
  });

  refs.exportButton.addEventListener("click", () => {
    void (async (): Promise<void> => {
      const selectedRegistration = getRegistrationIfAvailable(
        state.selectedThemeId,
        state.availableThemes
      );
      if (selectedRegistration === null) {
        return;
      }

      if (selectedRegistration.sourceKind !== "installed") {
        Toast.error(sceneThemeT("toasts.exportBuiltInUnavailable"), selectedRegistration.label);
        return;
      }

      const api = window.electronAPI;
      if (api === undefined || typeof api.sceneThemesPackageInstalled !== "function") {
        Toast.error(sceneThemeT("toasts.exportUnavailable"));
        return;
      }

      state.isBusy = true;
      render(refs, state);
      const result = await api.sceneThemesPackageInstalled({
        themeId: selectedRegistration.themeId,
      });
      state.isBusy = false;
      render(refs, state);

      if (result.success === true) {
        Toast.success(
          sceneThemeT("toasts.exportSuccess"),
          result.path ?? selectedRegistration.themeId
        );
        return;
      }

      Toast.error(
        sceneThemeT("toasts.exportError"),
        resolveIpcErrorMessage(result) ?? selectedRegistration.themeId
      );
    })();
  });

  SceneThemeManager.onChange(() => {
    state.activeThemeId = getActiveSceneThemeId();
    state.availableThemes = getAvailableSceneThemes();
    ensureSelectedThemeId(state);
    if (state.isOpen) {
      render(refs, state);
    }
  });

  SceneUiScaleManager.onChange((uiScale) => {
    state.uiScale = uiScale;
    if (state.isOpen) {
      render(refs, state);
    }
  });

  AppI18n.subscribe(() => {
    if (state.isOpen) {
      render(refs, state);
    }
  });

  registerSettingsPanelLifecycle("theme", {
    onActivate: () => {
      state.isOpen = true;
      void queueRefresh();
    },
    onDeactivate: () => {
      state.isOpen = false;
    },
  });

  render(refs, state);
  initialized = true;
}
