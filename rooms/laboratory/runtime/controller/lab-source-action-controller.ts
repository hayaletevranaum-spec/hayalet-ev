import { asLabRecord, asNonEmptyString } from "../../domain/lab-types.js";
import { createLabI18n } from "../lab-context-i18n.js";
import { formatSourceRetryBlockReason } from "../lab-source-retry-copy.js";
import {
  getSourceMode,
  getSourceRetryBlockReason,
  getWorkspaceLockState,
  isRunActive,
} from "../lab-selectors.js";
import {
  buildProjectImportHostAction,
  buildProjectImportLocalHostAction,
  buildProjectImportUrlCheckAction,
  hasProjectImportDraftValue,
  normalizeProjectImportKindValue,
  normalizeProjectImportMethodValue,
} from "../lab-project-import.js";
import type { createLabStore } from "../lab-store.js";
import { buildAutoProjectName, buildUiEvent } from "./lab-controller-helpers.js";
import {
  buildEmptySourceState,
  buildSourceDraftPatch,
  getActiveProjectCreatedAt,
  mergeSourceDrafts,
} from "./lab-source-draft-controller.js";

type LabSourceActionControllerDeps = {
  dispatch: ReturnType<typeof createLabStore>["dispatch"];
  pushLockedWorkspaceEvent: (message: string) => void;
  sendMediaAction: (action: string, payload?: Record<string, unknown>) => string | null;
  store: ReturnType<typeof createLabStore>;
  updateWorkbench: (
    update: (currentWorkbench: Record<string, unknown>) => Record<string, unknown>
  ) => void;
  windowRef: Pick<Window, "confirm">;
};

type LabStoreState = ReturnType<ReturnType<typeof createLabStore>["getState"]>;

export function createLabSourceActionController(deps: LabSourceActionControllerDeps) {
  function isSourceManagementLocked() {
    const state = deps.store.getState();
    return getWorkspaceLockState(state).source === true || isRunActive(state);
  }

  function guardSourceManagementLocked() {
    if (isSourceManagementLocked() !== true) {
      return false;
    }
    deps.pushLockedWorkspaceEvent("Kaynak ayarları aktif analiz sırasında kilitli.");
    return true;
  }

  function persistSourceDraftField(field: string, value: unknown) {
    const state = deps.store.getState();
    if (getWorkspaceLockState(state).source === true) {
      deps.pushLockedWorkspaceEvent("Kaynak ayarları aktif analiz sırasında kilitli.");
      return;
    }
    const patch = buildSourceDraftPatch(state, field, value);
    if (patch === null) {
      return;
    }
    deps.dispatch({
      type: "source-drafts-updated",
      patch,
    });
    deps.sendMediaAction("source-update-draft", {
      fields: mergeSourceDrafts(state, patch),
    });
  }

  function startCleanProjectSession() {
    if (guardSourceManagementLocked()) {
      return;
    }
    const state = deps.store.getState();
    const resetSourceState = buildEmptySourceState(state);
    deps.dispatch({ type: "project-import-reset" });
    deps.dispatch({
      type: "source-config-patched",
      patch: resetSourceState,
    });
    deps.dispatch({
      type: "source-drafts-updated",
      patch: resetSourceState.drafts,
    });
    deps.dispatch({
      type: "source-drafts-committed",
    });
    deps.sendMediaAction("project-create");
  }

  function selectProjectByValue(projectValue: string) {
    if (guardSourceManagementLocked()) {
      return;
    }
    if (projectValue === "new") {
      startCleanProjectSession();
      return;
    }
    if (projectValue.trim() !== "") {
      if (projectValue !== deps.store.getState().projectIndex.activeProjectId) {
        deps.dispatch({ type: "project-import-reset" });
      }
      deps.sendMediaAction("project-select", { projectId: projectValue });
    }
  }

  function runSourcePrimaryAction() {
    if (guardSourceManagementLocked()) {
      return;
    }
    const state = deps.store.getState();
    const sourceDrafts = state.ui.sourceDrafts;
    const mode = getSourceMode(state);
    const fields = {
      urlInput: sourceDrafts.urlInput,
      youtubeUrl: sourceDrafts.youtubeUrl,
      youtubePreset: sourceDrafts.youtubePreset,
      youtubeCustom: sourceDrafts.youtubeCustom,
      youtubeCaptureMode: sourceDrafts.youtubeCaptureMode,
    };
    if (mode === "url") {
      deps.sendMediaAction("source-download-url", { fields });
      return;
    }
    if (mode === "youtube") {
      deps.sendMediaAction("source-download-youtube", { fields });
      return;
    }
    deps.sendMediaAction("source-pick-local", { fields });
  }

  function runProjectImportAction(importAction: ReturnType<typeof buildProjectImportHostAction>) {
    const state = deps.store.getState();
    if (getWorkspaceLockState(state).source === true || isRunActive(state)) {
      deps.pushLockedWorkspaceEvent("Kaynak ayarları aktif analiz sırasında kilitli.");
      return;
    }
    if (importAction.disabledReason !== null) {
      deps.dispatch({
        type: "push-event",
        event: buildUiEvent(importAction.disabledReason, "warning"),
      });
      return;
    }
    const requestId = deps.sendMediaAction(importAction.action, { fields: importAction.fields });
    deps.dispatch({
      type: "project-import-review-focused",
      focus: requestId === null ? "draft" : "running",
      action: importAction.action,
      requestId,
    });
  }

  function runProjectImportAdd() {
    runProjectImportAction(buildProjectImportHostAction(deps.store.getState()));
  }

  function runProjectImportLocalAdd() {
    runProjectImportAction(buildProjectImportLocalHostAction(deps.store.getState()));
  }

  function runProjectImportUrlCheck() {
    const state = deps.store.getState();
    if (getWorkspaceLockState(state).source === true || isRunActive(state)) {
      deps.pushLockedWorkspaceEvent("Kaynak ayarları aktif analiz sırasında kilitli.");
      return;
    }
    const checkAction = buildProjectImportUrlCheckAction(state);
    if (checkAction.disabledReason !== null) {
      deps.dispatch({
        type: "push-event",
        event: buildUiEvent(checkAction.disabledReason, "warning"),
      });
      return;
    }
    const requestId = deps.sendMediaAction("project-import-check-url", {
      fields: checkAction.fields,
    });
    if (requestId === null) {
      deps.dispatch({
        type: "project-import-url-check-failed",
        url: checkAction.url,
        error: "Room API bridge is not connected.",
      });
      return;
    }
    deps.dispatch({
      type: "project-import-url-check-started",
      url: checkAction.url,
    });
  }

  function clearProjectImportDraft() {
    if (guardSourceManagementLocked()) {
      return;
    }
    const state = deps.store.getState();
    if (hasProjectImportDraftValue(state) !== true) {
      return;
    }
    const route = state.ui.projectImport;
    deps.dispatch({ type: "project-import-cleared", kind: route.activeKind });
    if (route.activeKind === "video" && route.methods.video === "youtube") {
      deps.dispatch({ type: "youtube-import-clear" });
    }
  }

  function saveActiveProjectCheckpoint() {
    const state = deps.store.getState();
    const sourceRecord = asLabRecord(state.source);
    const sourceLabel =
      asNonEmptyString(sourceRecord["storedFileName"]) ||
      asNonEmptyString(sourceRecord["routeLabel"]);
    if (sourceLabel === null || state.projectIndex.activeProjectId === null) {
      return;
    }
    deps.sendMediaAction("project-rename", {
      name: buildAutoProjectName(getActiveProjectCreatedAt(state), sourceLabel),
    });
    deps.updateWorkbench(function (workbench) {
      return {
        ...workbench,
        lastManualSaveAt: new Date().toISOString(),
      };
    });
    deps.dispatch({
      type: "push-event",
      event: buildUiEvent("Proje mevcut checkpoint durumu ile kaydedildi.", "success"),
    });
  }

  function deleteActiveProject() {
    if (guardSourceManagementLocked()) {
      return;
    }
    const state = deps.store.getState();
    const activeProjectId = state.projectIndex.activeProjectId;
    if (!activeProjectId) {
      return;
    }
    const activeProjectSummary = state.projectIndex.projects.find(function (project) {
      return asNonEmptyString((project as Record<string, unknown>)["id"]) === activeProjectId;
    }) as Record<string, unknown> | undefined;
    const projectLabel = asNonEmptyString(activeProjectSummary?.["name"]) || "seçili proje kaydı";
    const confirmed =
      typeof deps.windowRef.confirm === "function"
        ? deps.windowRef.confirm(`"${projectLabel}" kaydı silinsin mi?`)
        : true;
    if (confirmed) {
      deps.sendMediaAction("project-delete", { projectId: activeProjectId });
    }
  }

  function getRetrySourceFields(state: LabStoreState) {
    const source = asLabRecord(state.source);
    const drafts = state.ui.sourceDrafts;
    return {
      urlInput:
        drafts.urlInput ||
        asNonEmptyString(source["sourceUrl"]) ||
        asNonEmptyString(source["url"]) ||
        "",
      youtubeUrl:
        drafts.youtubeUrl ||
        asNonEmptyString(source["youtubeUrl"]) ||
        asNonEmptyString(source["sourceUrl"]) ||
        asNonEmptyString(source["url"]) ||
        "",
      youtubePreset: drafts.youtubePreset,
      youtubeCustom: drafts.youtubeCustom,
      youtubeCaptureMode: drafts.youtubeCaptureMode,
    };
  }

  function runSourceRetryAction() {
    if (guardSourceManagementLocked()) {
      return;
    }
    const state = deps.store.getState();
    const blockReason = getSourceRetryBlockReason(state);
    if (blockReason !== null) {
      const copy = createLabI18n(state.context);
      deps.dispatch({
        type: "push-event",
        event: buildUiEvent(formatSourceRetryBlockReason(blockReason, copy), "warning"),
      });
      return;
    }
    const mode = getSourceMode(state);
    const fields = getRetrySourceFields(state);
    if (mode === "url") {
      deps.sendMediaAction("source-download-url", { fields });
      return;
    }
    if (mode === "youtube") {
      deps.sendMediaAction("source-download-youtube", { fields });
      return;
    }
    deps.sendMediaAction("source-pick-local", { fields, retry: true });
  }

  function handleSourceClickAction(action: string, value: string) {
    const state = deps.store.getState();
    switch (action) {
      case "load-source":
        if (guardSourceManagementLocked()) {
          return true;
        }
        runSourcePrimaryAction();
        return true;
      case "project-import-kind": {
        if (guardSourceManagementLocked()) {
          return true;
        }
        const kind = normalizeProjectImportKindValue(value);
        if (kind !== null && state.ui.projectImport.activeKind !== kind) {
          deps.dispatch({ type: "project-import-kind-changed", kind });
        }
        return true;
      }
      case "project-import-method": {
        if (guardSourceManagementLocked()) {
          return true;
        }
        const activeKind = deps.store.getState().ui.projectImport.activeKind;
        const method = normalizeProjectImportMethodValue(value, activeKind);
        if (method !== null && state.ui.projectImport.methods[activeKind] !== method) {
          deps.dispatch({ type: "project-import-method-changed", kind: activeKind, method });
        }
        return true;
      }
      case "project-import-clear":
        clearProjectImportDraft();
        return true;
      case "project-import-local-add":
        runProjectImportLocalAdd();
        return true;
      case "project-import-check-url":
        runProjectImportUrlCheck();
        return true;
      case "project-import-url-add":
      case "project-import-add":
        runProjectImportAdd();
        return true;
      case "project-import-youtube-video-format":
        if (guardSourceManagementLocked()) {
          return true;
        }
        deps.dispatch({
          type: "youtube-import-format-selected",
          videoFormatId: value.trim() === "" ? null : value,
        });
        return true;
      case "project-import-youtube-audio-format":
        if (guardSourceManagementLocked()) {
          return true;
        }
        deps.dispatch({
          type: "youtube-import-format-selected",
          audioFormatId: value.trim() === "" ? null : value,
        });
        return true;
      case "source-probe-retry":
        runSourceRetryAction();
        return true;
      case "youtube-import-clear":
        if (guardSourceManagementLocked()) {
          return true;
        }
        deps.dispatch({ type: "youtube-import-clear" });
        return true;
      case "source-youtube-preset":
        if (guardSourceManagementLocked()) {
          return true;
        }
        if (value.trim() !== "" && state.ui.sourceDrafts.youtubePreset !== value) {
          persistSourceDraftField("source.youtubePreset", value);
        }
        return true;
      default:
        return false;
    }
  }

  return {
    clearProjectImportDraft,
    deleteActiveProject,
    handleSourceClickAction,
    persistSourceDraftField,
    runProjectImportAdd,
    runProjectImportLocalAdd,
    runProjectImportUrlCheck,
    runSourcePrimaryAction,
    runSourceRetryAction,
    saveActiveProjectCheckpoint,
    selectProjectByValue,
    startCleanProjectSession,
  };
}
