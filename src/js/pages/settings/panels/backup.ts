import { LogCategory, Logger } from "../../../modules/logger/index.js";
import { AppI18n } from "../../../modules/i18n/index.js";
import { Toast } from "../../../ui/toast-manager.js";
import { ButtonStates } from "../../../ui/button-states.js";
import { shellT } from "../../../app/shell-i18n.js";
import { registerSettingsPanelLifecycle } from "../controller.js";
import {
  buildBackupListMarkup,
  buildBackupPreviewMarkup,
  buildBackupScopesMarkup,
  buildBackupSummaryMarkup,
} from "./backup-markup.js";

interface BackupScopeDefinition {
  id: string;
  category: string;
  enabledByDefault: boolean;
  riskLevel: string;
  requiresColdRestore: boolean;
  restartTargets: string[];
}

interface BackupPresetDefinition {
  id: string;
  scopeIds: string[];
}

interface BackupListItem {
  filePath: string;
  createdAt: string | null;
  label: string | null;
  selectedScopes: string[];
  totalBytes: number | null;
  restoreMode: string | null;
  invalid?: boolean;
}

interface BackupPreviewResult {
  selectedScopes: string[];
  requiresColdRestore: boolean;
  restartTargets: string[];
  riskLevel: string;
  fileCount: number;
  overwrittenFilesCount: number;
}

interface BackupOverlayRefs {
  createButton: HTMLButtonElement | null;
  selectButton: HTMLButtonElement | null;
  openFolderButton: HTMLButtonElement | null;
  refreshButton: HTMLButtonElement | null;
  restoreButton: HTMLButtonElement | null;
  summary: HTMLElement | null;
  scopes: HTMLElement | null;
  list: HTMLElement | null;
  preview: HTMLElement | null;
}

interface BackupOverlayState {
  scopes: BackupScopeDefinition[];
  presets: BackupPresetDefinition[];
  backups: BackupListItem[];
  selectedScopeIds: Set<string>;
  selectedFilePath: string | null;
  importedFilePath: string | null;
  preview: BackupPreviewResult | null;
  isOpen: boolean;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getContainingDirectoryPath(targetPath: string | null): string | null {
  if (typeof targetPath !== "string") {
    return null;
  }

  const normalizedPath = targetPath.trim();
  if (normalizedPath === "") {
    return null;
  }

  const lastSeparatorIndex = Math.max(
    normalizedPath.lastIndexOf("/"),
    normalizedPath.lastIndexOf("\\")
  );
  if (lastSeparatorIndex < 0) {
    return null;
  }
  if (lastSeparatorIndex === 0) {
    return normalizedPath.slice(0, 1);
  }
  if (lastSeparatorIndex === 2 && /^[A-Za-z]:[\\/]/.test(normalizedPath)) {
    return normalizedPath.slice(0, 3);
  }

  return normalizedPath.slice(0, lastSeparatorIndex);
}

function getRefs(): BackupOverlayRefs {
  return {
    createButton: document.getElementById("backup-overlay-create") as HTMLButtonElement | null,
    selectButton: document.getElementById("backup-overlay-select") as HTMLButtonElement | null,
    openFolderButton: document.getElementById(
      "backup-overlay-open-folder"
    ) as HTMLButtonElement | null,
    refreshButton: document.getElementById("backup-overlay-refresh") as HTMLButtonElement | null,
    restoreButton: document.getElementById("backup-overlay-restore") as HTMLButtonElement | null,
    summary: document.getElementById("backup-overlay-summary"),
    scopes: document.getElementById("backup-overlay-scopes"),
    list: document.getElementById("backup-overlay-list"),
    preview: document.getElementById("backup-overlay-preview"),
  };
}

function render(refs: BackupOverlayRefs, state: BackupOverlayState): void {
  const selectedScopes = state.scopes.filter((scope) => state.selectedScopeIds.has(scope.id));
  if (refs.summary !== null) {
    refs.summary.innerHTML = buildBackupSummaryMarkup(selectedScopes, state.preview);
  }
  if (refs.scopes !== null) {
    refs.scopes.innerHTML = buildBackupScopesMarkup(
      state.scopes,
      state.selectedScopeIds,
      state.presets
    );
  }
  if (refs.list !== null) {
    refs.list.innerHTML = buildBackupListMarkup(
      state.backups,
      state.selectedFilePath,
      state.importedFilePath
    );
  }
  if (refs.preview !== null) {
    refs.preview.innerHTML = buildBackupPreviewMarkup(state.preview, state.selectedFilePath);
  }
}

async function loadMetadata(state: BackupOverlayState): Promise<void> {
  const api = window.electronAPI;
  if (api === undefined) {
    return;
  }
  const [scopes, presets] = await Promise.all([api.backupScopes(), api.backupPresets()]);
  state.scopes = scopes;
  state.presets = presets;
  state.selectedScopeIds = new Set(
    scopes.filter((scope) => scope.enabledByDefault).map((scope) => scope.id)
  );
}

async function loadBackups(state: BackupOverlayState): Promise<void> {
  const api = window.electronAPI;
  if (api === undefined) {
    return;
  }
  state.backups = await api.backupList({ limit: 50 });
}

function syncSelectedFilePath(state: BackupOverlayState): void {
  if (state.selectedFilePath !== null) {
    const selectionExists = state.backups.some((item) => item.filePath === state.selectedFilePath);
    if (selectionExists) {
      return;
    }
    if (
      state.selectedFilePath === state.importedFilePath &&
      state.backups.some((item) => item.filePath === state.importedFilePath) === false
    ) {
      return;
    }
  }

  state.selectedFilePath = state.backups[0]?.filePath ?? state.importedFilePath;
}

async function refreshPreview(state: BackupOverlayState): Promise<void> {
  const api = window.electronAPI;
  if (api === undefined || state.selectedFilePath === null) {
    state.preview = null;
    return;
  }

  try {
    state.preview = await api.backupPreview({
      filePath: state.selectedFilePath,
      scopeIds: [...state.selectedScopeIds],
    });
  } catch (error) {
    state.preview = null;
    Logger.warnT(LogCategory.UI_MODAL, "app.logs.backup.previewFailed", {
      message: getErrorMessage(error),
    });
  }
}

export function setupSettingsBackupPanel(): void {
  const refs = getRefs();
  const state: BackupOverlayState = {
    scopes: [],
    presets: [],
    backups: [],
    selectedScopeIds: new Set(),
    selectedFilePath: null,
    importedFilePath: null,
    preview: null,
    isOpen: false,
  };

  if (
    refs.createButton === null ||
    refs.selectButton === null ||
    refs.openFolderButton === null ||
    refs.refreshButton === null ||
    refs.restoreButton === null ||
    refs.summary === null ||
    refs.scopes === null ||
    refs.list === null ||
    refs.preview === null
  ) {
    return;
  }

  const createButton = refs.createButton;
  const refreshButton = refs.refreshButton;

  const activate = async (): Promise<void> => {
    state.isOpen = true;
    try {
      if (state.scopes.length === 0) {
        await loadMetadata(state);
      }
      await loadBackups(state);
      syncSelectedFilePath(state);
      await refreshPreview(state);
      render(refs, state);
    } catch (error) {
      Toast.error(shellT("backup.toasts.refreshError"), getErrorMessage(error));
      Logger.errorT(LogCategory.UI_MODAL, "app.logs.backup.listRefreshFailed", {
        message: getErrorMessage(error),
      });
    }
  };

  const deactivate = (): void => {
    state.isOpen = false;
  };

  refreshButton.addEventListener("click", () => {
    void (async (): Promise<void> => {
      if (refreshButton.disabled) {
        return;
      }

      refreshButton.disabled = true;
      try {
        await loadBackups(state);
        syncSelectedFilePath(state);
        await refreshPreview(state);
        render(refs, state);
        Logger.debugT(LogCategory.UI_MODAL, "app.logs.backup.listRefreshed");
      } catch (error) {
        Toast.error(shellT("backup.toasts.refreshError"), getErrorMessage(error));
        Logger.errorT(LogCategory.UI_MODAL, "app.logs.backup.listRefreshFailed", {
          message: getErrorMessage(error),
        });
      } finally {
        refreshButton.disabled = false;
      }
    })();
  });

  createButton.addEventListener("click", () => {
    void (async (): Promise<void> => {
      const api = window.electronAPI;
      if (api === undefined || state.selectedScopeIds.size === 0) {
        Toast.error(shellT("backup.toasts.scopeRequired"));
        return;
      }

      if (ButtonStates.isLoading(createButton)) {
        return;
      }

      ButtonStates.setLoading(createButton, shellT("backup.createProcessing"));
      try {
        const result = await api.backupCreate({
          scopeIds: [...state.selectedScopeIds],
          createdBy: "ui",
        });
        await loadBackups(state);
        state.selectedFilePath = result.bundlePath;
        state.importedFilePath = null;
        syncSelectedFilePath(state);
        await refreshPreview(state);
        render(refs, state);
        Toast.success(shellT("backup.toasts.createSuccess"), result.bundlePath);
        Logger.successT(LogCategory.UI_MODAL, "app.logs.backup.createSucceeded", {
          path: result.bundlePath,
        });
      } catch (error) {
        Toast.error(shellT("backup.toasts.createError"), getErrorMessage(error));
        Logger.errorT(LogCategory.UI_MODAL, "app.logs.backup.createFailed", {
          message: getErrorMessage(error),
        });
      } finally {
        ButtonStates.reset(createButton);
      }
    })();
  });

  refs.selectButton.addEventListener("click", () => {
    void (async (): Promise<void> => {
      const api = window.electronAPI;
      if (api === undefined || typeof api.showOpenDialog !== "function") {
        Toast.error(shellT("backup.toasts.filePickerUnavailable"));
        return;
      }

      try {
        const selection = await api.showOpenDialog({
          title: shellT("backup.dialog.bundleTitle"),
          buttonLabel: shellT("backup.dialog.bundleButton"),
          filters: [{ name: shellT("backup.dialog.bundleFilterName"), extensions: ["hevbak"] }],
          properties: ["openFile"],
        });

        if (selection.canceled === true || selection.filePaths.length === 0) {
          return;
        }

        state.selectedFilePath = String(selection.filePaths[0] ?? "");
        state.importedFilePath = state.selectedFilePath;
        await refreshPreview(state);
        render(refs, state);
      } catch (error) {
        Toast.error(shellT("backup.toasts.filePickerUnavailable"), getErrorMessage(error));
      }
    })();
  });

  refs.openFolderButton.addEventListener("click", () => {
    const fallbackPath = state.backups[0]?.filePath;
    const candidatePath =
      getContainingDirectoryPath(state.selectedFilePath) ??
      getContainingDirectoryPath(typeof fallbackPath === "string" ? fallbackPath : null);
    if (typeof candidatePath === "string" && candidatePath !== "") {
      const api = window.electronAPI;
      if (api !== undefined) {
        void api.openPath(candidatePath);
      }
    }
  });

  refs.restoreButton.addEventListener("click", () => {
    void (async (): Promise<void> => {
      const api = window.electronAPI;
      if (api === undefined || state.selectedFilePath === null) {
        Toast.error(shellT("backup.toasts.bundleRequired"));
        return;
      }

      try {
        const preview = await api.backupPreview({
          filePath: state.selectedFilePath,
          scopeIds: [...state.selectedScopeIds],
        });
        state.preview = preview;
        render(refs, state);

        const confirmation = await api.showMessageBox({
          type: "warning",
          buttons: [shellT("common.confirm"), shellT("common.cancel")],
          defaultId: 1,
          cancelId: 1,
          title: shellT("backup.confirm.title"),
          message: shellT("backup.confirm.message"),
          detail: [
            shellT("backup.confirm.scopeLine", { scopes: preview.selectedScopes.join(", ") }),
            shellT("backup.confirm.fileLine", { count: String(preview.fileCount) }),
            ...preview.restartTargets.map((target) =>
              shellT("backup.confirm.restartLine", { target })
            ),
          ].join("\n"),
        });

        if (confirmation.response !== 0) {
          return;
        }

        const result = await api.backupRestore({
          filePath: state.selectedFilePath,
          scopeIds: [...state.selectedScopeIds],
          createdBy: "ui",
        });
        Toast.success(shellT("backup.toasts.restoreSuccess"), result.bundlePath);
        Logger.successT(LogCategory.UI_MODAL, "app.logs.backup.restoreSucceeded", {
          path: result.bundlePath,
        });
      } catch (error) {
        Toast.error(shellT("backup.toasts.restoreError"), getErrorMessage(error));
        Logger.errorT(LogCategory.UI_MODAL, "app.logs.backup.restoreFailed", {
          message: getErrorMessage(error),
        });
      }
    })();
  });

  refs.scopes.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | null;
    const scopeId = target?.dataset["backupScope"] ?? "";
    if (scopeId === "") {
      return;
    }
    if (target?.checked === true) {
      state.selectedScopeIds.add(scopeId);
    } else {
      state.selectedScopeIds.delete(scopeId);
    }
    void (async (): Promise<void> => {
      await refreshPreview(state);
      render(refs, state);
    })();
  });

  refs.scopes.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const presetId =
      target?.closest<HTMLButtonElement>("[data-backup-preset]")?.dataset["backupPreset"] ?? "";
    if (presetId === "") {
      return;
    }
    const preset = state.presets.find((entry) => entry.id === presetId);
    if (preset === undefined) {
      return;
    }
    state.selectedScopeIds = new Set(preset.scopeIds);
    void (async (): Promise<void> => {
      await refreshPreview(state);
      render(refs, state);
    })();
  });

  refs.list.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const deleteButton = target?.closest<HTMLButtonElement>("[data-backup-delete]") ?? null;
    if (deleteButton !== null) {
      void (async (): Promise<void> => {
        try {
          const api = window.electronAPI;
          const filePath = deleteButton.dataset["backupDelete"] ?? "";
          if (api === undefined || filePath === "") {
            return;
          }

          const confirmation = await api.showMessageBox({
            type: "warning",
            buttons: [shellT("common.cancel"), shellT("common.confirm")],
            defaultId: 0,
            cancelId: 0,
            title: shellT("backup.deleteConfirm.title"),
            message: shellT("backup.deleteConfirm.message"),
            detail: shellT("backup.deleteConfirm.fileLine", { path: filePath }),
          });
          if (confirmation.response !== 1) {
            return;
          }

          ButtonStates.setLoading(deleteButton, shellT("backup.list.deleteProcessing"));
          await api.backupDelete({ filePath });
          if (state.importedFilePath === filePath) {
            state.importedFilePath = null;
          }
          if (state.selectedFilePath === filePath) {
            state.preview = null;
          }
          await loadBackups(state);
          syncSelectedFilePath(state);
          await refreshPreview(state);
          render(refs, state);
          Toast.success(shellT("backup.toasts.deleteSuccess"), filePath);
          Logger.successT(LogCategory.UI_MODAL, "app.logs.backup.deleteSucceeded", {
            path: filePath,
          });
        } catch (error) {
          ButtonStates.setError(deleteButton, shellT("backup.list.deleteButton"), 1500);
          Toast.error(shellT("backup.toasts.deleteError"), getErrorMessage(error));
          Logger.errorT(LogCategory.UI_MODAL, "app.logs.backup.deleteFailed", {
            message: getErrorMessage(error),
          });
          return;
        }
      })();
      return;
    }

    const filePath =
      target?.closest<HTMLButtonElement>("[data-backup-file]")?.dataset["backupFile"] ?? "";
    if (filePath === "") {
      return;
    }
    state.selectedFilePath = filePath;
    void (async (): Promise<void> => {
      await refreshPreview(state);
      render(refs, state);
    })();
  });

  AppI18n.subscribe(() => {
    if (state.isOpen === true) {
      render(refs, state);
    }
  });

  registerSettingsPanelLifecycle("backup", {
    onEnter: () => {
      void activate();
    },
    onActivate: () => {
      void activate();
    },
    onDeactivate: () => {
      deactivate();
    },
    onExit: () => {
      deactivate();
    },
  });
}
