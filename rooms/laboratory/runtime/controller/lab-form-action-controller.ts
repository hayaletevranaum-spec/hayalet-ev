import { asNonEmptyString } from "../../domain/lab-types.js";
import { getDefaultSourceMode } from "../lab-source-presets.js";
import { getActiveEditOutput } from "../lab-selectors.js";
import type { getWorkspaceLockState } from "../lab-selectors.js";
import type { createLabStore } from "../lab-store.js";
import { isTextControl } from "./lab-controller-helpers.js";
import {
  buildProjectImportDraftPatch,
  buildSourceDraftPatch,
} from "./lab-source-draft-controller.js";

type TextControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type WorkspaceLockKey = keyof ReturnType<typeof getWorkspaceLockState>;

type LabFormActionControllerDeps = {
  dispatch: (event: Parameters<ReturnType<typeof createLabStore>["dispatch"]>[0]) => void;
  isInsideWorkspaceInspector: (target: Element) => boolean;
  isWorkspaceMutationLocked: (lockKey: WorkspaceLockKey) => boolean;
  patchAnalysisModuleSetting: (field: string, rawValue: unknown) => void;
  patchAudioFocusSetting: (audioKey: string, rawValue: unknown) => void;
  patchInteractiveSetting: (settingKey: string, rawValue: unknown) => void;
  patchOperationSetting: (field: string, rawValue: unknown) => void;
  persistSourceDraftField: (field: string, value: unknown) => void;
  pushLockedWorkspaceEvent: (message: string) => void;
  readControlValue: (target: TextControl) => unknown;
  seekTimelineToMs: (timeMs: number) => void;
  selectProjectByValue: (projectId: string) => void;
  sendMediaAction: (action: string, payload?: Record<string, unknown>) => unknown;
  setLabFocusLayer: (layer: "preview" | "timeline" | "inspector") => void;
  store: ReturnType<typeof createLabStore>;
  syncTimelineTransportVolume: () => void;
  updateAnalysisScopeField: (field: string, value: unknown) => void;
  updateTimelinePlaybackUi: () => void;
};

export function createLabFormActionController(deps: LabFormActionControllerDeps) {
  function readRawControlValue(target: TextControl) {
    return target instanceof HTMLInputElement && target.type === "checkbox"
      ? target.checked
      : target instanceof HTMLInputElement && target.type === "number"
        ? target.value === ""
          ? null
          : Number(target.value)
        : target.value;
  }

  function readWorkspaceControlValue(target: TextControl) {
    return target instanceof HTMLInputElement && target.type === "number"
      ? target.value === ""
        ? null
        : Number(target.value)
      : target instanceof HTMLInputElement && target.type === "checkbox"
        ? target.checked
        : target instanceof HTMLInputElement && target.type === "range"
          ? Number(target.value)
          : target.value;
  }

  function focusInspectorIfNeeded(target: TextControl) {
    if (deps.isInsideWorkspaceInspector(target)) {
      deps.setLabFocusLayer("inspector");
    }
  }

  function handleProjectImportInput(field: string, target: TextControl) {
    if (deps.isWorkspaceMutationLocked("source")) {
      deps.pushLockedWorkspaceEvent("Kaynak ayarları aktif analiz sırasında kilitli.");
      return;
    }
    const rawValue = readRawControlValue(target);
    const patch = buildProjectImportDraftPatch(deps.store.getState(), field, rawValue);
    if (patch !== null) {
      deps.dispatch({
        type: "project-import-draft-updated",
        patch,
      });
    }
  }

  function handleSourceDraftInput(field: string, target: TextControl) {
    if (deps.isWorkspaceMutationLocked("source")) {
      deps.pushLockedWorkspaceEvent("Kaynak ayarları aktif analiz sırasında kilitli.");
      return;
    }
    const patch = buildSourceDraftPatch(deps.store.getState(), field, readRawControlValue(target));
    if (patch !== null) {
      deps.dispatch({
        type: "source-drafts-updated",
        patch,
      });
    }
  }

  function handleWorkspaceFieldInput(workspaceField: string, rawValue: unknown) {
    if (workspaceField === "timelineStartMs" || workspaceField === "timelineEndMs") {
      if (deps.isWorkspaceMutationLocked("timeline")) {
        deps.pushLockedWorkspaceEvent("Zaman aralığı aktif analiz sırasında kilitli.");
        return;
      }
      const state = deps.store.getState();
      const requestedSeekMs =
        typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null;
      deps.dispatch({
        type: "workspace-timeline-updated",
        startMs:
          workspaceField === "timelineStartMs"
            ? (rawValue as number | null)
            : state.ui.workspace.timelineStartMs,
        endMs:
          workspaceField === "timelineEndMs"
            ? (rawValue as number | null)
            : state.ui.workspace.timelineEndMs,
      });
      const acceptedWorkspace = deps.store.getState().ui.workspace;
      const acceptedSeekMs =
        workspaceField === "timelineStartMs"
          ? acceptedWorkspace.timelineStartMs
          : acceptedWorkspace.timelineEndMs;
      if (requestedSeekMs !== null && acceptedSeekMs === requestedSeekMs) {
        deps.seekTimelineToMs(requestedSeekMs);
      }
      return;
    }
    if (workspaceField === "previewVolume") {
      if (deps.isWorkspaceMutationLocked("timeline")) {
        return;
      }
      deps.setLabFocusLayer("timeline");
      deps.dispatch({
        type: "workspace-preview-volume-updated",
        volume: typeof rawValue === "number" ? rawValue : Number(rawValue),
      });
      deps.syncTimelineTransportVolume();
      deps.updateTimelinePlaybackUi();
      return;
    }
    if (workspaceField === "hypothesis") {
      if (deps.isWorkspaceMutationLocked("hypothesis")) {
        deps.pushLockedWorkspaceEvent("Hipotez aktif analiz sırasında kilitli.");
        return;
      }
      deps.dispatch({ type: "workspace-hypothesis-updated", text: String(rawValue || "") });
      return;
    }
    if (workspaceField.startsWith("interactive.")) {
      deps.patchInteractiveSetting(workspaceField.replace("interactive.", ""), rawValue);
      return;
    }
    if (workspaceField.startsWith("audioFocus.")) {
      deps.patchAudioFocusSetting(workspaceField.replace("audioFocus.", ""), rawValue);
      return;
    }
    if (workspaceField === "comparison.viewMode") {
      const value = String(rawValue);
      if (
        value === "side-by-side" ||
        value === "stacked" ||
        value === "split" ||
        value === "difference" ||
        value === "roi-detail"
      ) {
        deps.dispatch({
          type: "workspace-comparison-updated",
          patch: { comparisonViewMode: value },
        });
      }
      return;
    }
    if (workspaceField === "comparison.splitPercent") {
      const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
      deps.dispatch({
        type: "workspace-comparison-updated",
        patch: {
          comparisonSplitPercent: Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50,
        },
      });
      return;
    }
    if (workspaceField === "comparison.findingNote") {
      deps.dispatch({
        type: "workspace-comparison-updated",
        patch: { comparisonFindingNote: String(rawValue || "").slice(0, 1000) },
      });
    }
  }

  function handleInput(event: Event) {
    const target = event.target;
    if (!isTextControl(target)) {
      return;
    }

    const field = target.dataset["labField"];
    if (!field) {
      return;
    }

    focusInspectorIfNeeded(target);

    if (field.startsWith("operationSettings.")) {
      deps.patchOperationSetting(field, deps.readControlValue(target));
      return;
    }

    if (field.startsWith("analysisSettings.modules.")) {
      deps.patchAnalysisModuleSetting(field, deps.readControlValue(target));
      return;
    }

    if (field === "project-import.youtubeVideoFormat") {
      deps.dispatch({
        type: "youtube-import-format-selected",
        videoFormatId: target.value.trim() === "" ? null : target.value,
      });
      return;
    }

    if (field === "project-import.youtubeAudioFormat") {
      deps.dispatch({
        type: "youtube-import-format-selected",
        audioFormatId: target.value.trim() === "" ? null : target.value,
      });
      return;
    }

    if (field.startsWith("project-import.")) {
      handleProjectImportInput(field, target);
      return;
    }

    if (
      field === "source.urlInput" ||
      field === "source.youtubeUrl" ||
      field.startsWith("source.youtubeCustom.")
    ) {
      handleSourceDraftInput(field, target);
      return;
    }

    if (field.startsWith("edit.")) {
      deps.dispatch({
        type: "edit-drafts-updated",
        patch: {
          [field.replace("edit.", "")]:
            target instanceof HTMLInputElement && target.type === "checkbox"
              ? target.checked
              : target.value,
        },
      });
      return;
    }

    if (field.startsWith("profile.")) {
      const rawValue = target.value;
      const value =
        target instanceof HTMLInputElement && target.type === "number"
          ? rawValue === ""
            ? null
            : Number(rawValue)
          : rawValue;
      deps.dispatch({
        type: "profile-drafts-updated",
        patch: {
          [field.replace("profile.", "")]: value,
        },
      });
      return;
    }

    if (field.startsWith("scope.")) {
      const rawValue =
        target instanceof HTMLInputElement && target.type === "number"
          ? target.value === ""
            ? null
            : Number(target.value)
          : target.value;
      deps.updateAnalysisScopeField(field.replace("scope.", ""), rawValue);
      return;
    }

    if (field.startsWith("workspace.")) {
      handleWorkspaceFieldInput(field.replace("workspace.", ""), readWorkspaceControlValue(target));
    }
  }

  function handleChange(event: Event) {
    const target = event.target;
    if (!isTextControl(target)) {
      return;
    }

    const field = target.dataset["labField"];
    if (!field) {
      return;
    }

    focusInspectorIfNeeded(target);

    if (field.startsWith("operationSettings.")) {
      deps.patchOperationSetting(field, deps.readControlValue(target));
      return;
    }

    if (field.startsWith("analysisSettings.modules.")) {
      deps.patchAnalysisModuleSetting(field, deps.readControlValue(target));
      return;
    }

    const state = deps.store.getState();
    const targetValue = readRawControlValue(target);

    if (field.startsWith("project-import.youtubeCustom.")) {
      if (deps.isWorkspaceMutationLocked("source")) {
        deps.pushLockedWorkspaceEvent("Kaynak ayarları aktif analiz sırasında kilitli.");
        return;
      }
      const patch = buildProjectImportDraftPatch(state, field, targetValue);
      if (patch !== null) {
        deps.dispatch({
          type: "project-import-draft-updated",
          patch,
        });
      }
      return;
    }

    switch (field) {
      case "scope.focus":
      case "scope.timeStartMs":
      case "scope.timeEndMs":
      case "scope.frameStart":
      case "scope.frameEnd":
      case "scope.regionX":
      case "scope.regionY":
      case "scope.regionWidth":
      case "scope.regionHeight":
      case "scope.hypothesis":
        deps.updateAnalysisScopeField(field.replace("scope.", ""), targetValue);
        return;
      case "project.id":
        if (deps.isWorkspaceMutationLocked("source")) {
          deps.pushLockedWorkspaceEvent("Kaynak ayarları aktif analiz sırasında kilitli.");
          return;
        }
        deps.selectProjectByValue(String(targetValue || ""));
        return;
      case "project-import.urlInput":
      case "project-import.youtubeUrl":
      case "project-import.youtubeCaptureMode": {
        if (deps.isWorkspaceMutationLocked("source")) {
          deps.pushLockedWorkspaceEvent("Kaynak ayarları aktif analiz sırasında kilitli.");
          return;
        }
        const patch = buildProjectImportDraftPatch(state, field, targetValue);
        if (patch !== null) {
          deps.dispatch({
            type: "project-import-draft-updated",
            patch,
          });
        }
        return;
      }
      case "project-import.youtubeVideoFormat":
        deps.dispatch({
          type: "youtube-import-format-selected",
          videoFormatId: String(targetValue || "").trim() === "" ? null : String(targetValue),
        });
        return;
      case "project-import.youtubeAudioFormat":
        deps.dispatch({
          type: "youtube-import-format-selected",
          audioFormatId: String(targetValue || "").trim() === "" ? null : String(targetValue),
        });
        return;
      case "source.kind":
        if (deps.isWorkspaceMutationLocked("source")) {
          deps.pushLockedWorkspaceEvent("Kaynak ayarları aktif analiz sırasında kilitli.");
          return;
        }
        deps.dispatch({
          type: "source-config-patched",
          patch: {
            kind: targetValue,
            mode: getDefaultSourceMode(state, targetValue),
            status: "idle",
            storedPath: null,
            storedFileName: null,
            sourceUrl: null,
            mimeType: null,
            routeLabel: null,
            lastError: null,
            metadata: null,
            metadataError: null,
          },
        });
        deps.sendMediaAction("source-set-kind", { kind: targetValue });
        return;
      case "source.mode":
        if (deps.isWorkspaceMutationLocked("source")) {
          deps.pushLockedWorkspaceEvent("Kaynak ayarları aktif analiz sırasında kilitli.");
          return;
        }
        deps.dispatch({
          type: "source-config-patched",
          patch: {
            mode: targetValue,
            status: "idle",
            storedPath: null,
            storedFileName: null,
            sourceUrl: null,
            mimeType: null,
            routeLabel: null,
            lastError: null,
            metadata: null,
            metadataError: null,
            previewUrl: null,
          },
        });
        deps.sendMediaAction("source-set-mode", { mode: targetValue });
        return;
      case "source.urlInput":
      case "source.youtubeUrl":
      case "source.youtubePreset":
        deps.persistSourceDraftField(field, targetValue);
        return;
      default:
        if (field.startsWith("source.youtubeCustom.")) {
          deps.persistSourceDraftField(field, targetValue);
          return;
        }
        handleEditProfileChange(field, targetValue, state);
    }
  }

  function handleEditProfileChange(
    field: string,
    targetValue: unknown,
    state: ReturnType<typeof deps.store.getState>
  ) {
    switch (field) {
      case "edit.outputNameHint":
        deps.sendMediaAction("edit-update-recipe", {
          patch: {
            common: {
              outputNameHint: targetValue,
            },
          },
        });
        return;
      case "edit.notes":
        deps.sendMediaAction("edit-update-recipe", {
          patch: {
            common: {
              notes: targetValue,
            },
          },
        });
        return;
      case "edit.handoffMode":
        deps.sendMediaAction("edit-set-handoff", {
          mode: targetValue,
        });
        return;
      case "edit.activeSourceRef":
        deps.dispatch({
          type: "edit-drafts-updated",
          patch: {
            activeSourceRef: targetValue === "preview" ? "preview" : "original",
          },
        });
        return;
      case "edit.activeOutputId":
        deps.sendMediaAction("edit-set-output", {
          outputId: targetValue,
        });
        return;
      case "edit.advancedOpen":
        deps.dispatch({
          type: "edit-drafts-updated",
          patch: {
            advancedOpen: targetValue === true,
          },
        });
        return;
      case "profile.targetMode":
        deps.sendMediaAction("profile-set-target", {
          mode: targetValue,
          outputId:
            targetValue === "derived" ? asNonEmptyString(getActiveEditOutput(state)?.["id"]) : null,
        });
        return;
      case "profile.targetOutputId":
        deps.sendMediaAction("profile-set-target", {
          mode: "derived",
          outputId: targetValue || null,
        });
        return;
      case "profile.depth":
      case "profile.frameSampleDensity":
      case "profile.sensitivity":
      case "profile.transcriptSampleSeconds":
        deps.sendMediaAction("profile-update", {
          patch: {
            [field.replace("profile.", "")]: targetValue,
          },
        });
        return;
      case "profile.modelId":
        deps.sendMediaAction("profile-set-model", {
          modelId: targetValue || null,
        });
        return;
      default:
        return;
    }
  }

  return {
    handleChange,
    handleInput,
  };
}
