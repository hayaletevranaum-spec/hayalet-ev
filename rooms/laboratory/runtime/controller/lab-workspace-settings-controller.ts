import {
  asLabRecord,
  asNonEmptyString,
  LAB_ANALYSIS_MODULE_SETTINGS_DEFAULTS,
  LAB_OPERATION_CAPABILITIES,
  LAB_OPERATION_SETTINGS_DEFAULTS,
  normalizeLabAnalysisModuleSettings,
  normalizeLabOperationSettings,
} from "../../domain/lab-types.js";
import type {
  LabAudioFocusSettings,
  LabComparisonSide,
  LabComparisonViewMode,
  LabInteractiveSettings,
  LabOperationCapabilityId,
} from "../../domain/lab-types.js";
import { getInteractiveSettingsForComparisonSide, isRunActive } from "../lab-selectors.js";
import type { createLabStore } from "../lab-store.js";
import { DEFAULT_LAB_INTERACTIVE_SETTINGS } from "../lab-workspace-defaults.js";
import { clampAdjustedValue, parseFiniteNumber } from "./lab-timeline-controller-helpers.js";

type LabWorkspaceSettingsControllerDeps = {
  dispatch: ReturnType<typeof createLabStore>["dispatch"];
  pushLockedWorkspaceEvent: (message: string) => void;
  store: ReturnType<typeof createLabStore>;
  updateWorkbench: (
    update: (currentWorkbench: Record<string, unknown>) => Record<string, unknown>
  ) => void;
};

export function createLabWorkspaceSettingsController(deps: LabWorkspaceSettingsControllerDeps) {
  function guardRunActiveWorkspaceSettings() {
    if (isRunActive(deps.store.getState()) !== true) {
      return false;
    }
    deps.pushLockedWorkspaceEvent("Çalışma alanı ayarları aktif analiz sırasında kilitli.");
    return true;
  }

  function getActiveComparisonSettingsSide(): LabComparisonSide | undefined {
    const state = deps.store.getState();
    return asNonEmptyString(state.ui.workspace.comparisonReferenceAssetId) === null
      ? undefined
      : state.ui.workspace.comparisonRois.activeSide;
  }

  function readWorkspaceSetting(field: string): unknown {
    const state = deps.store.getState();
    if (field.startsWith("workspace.interactive.")) {
      const settingKey = field.replace("workspace.interactive.", "");
      return (getInteractiveSettingsForComparisonSide(state) as unknown as Record<string, unknown>)[
        settingKey
      ];
    }
    if (field.startsWith("workspace.audioFocus.eqBands.")) {
      const parts = field.replace("workspace.audioFocus.", "").split(".");
      const bandIndex = parts.length > 1 ? parseInt(parts[1] as string, 10) : NaN;
      const bandProp = parts.length > 2 ? parts[2] : undefined;
      if (!Number.isNaN(bandIndex) && bandIndex >= 0 && typeof bandProp === "string") {
        return (
          state.ui.workspace.audioFocus.eqBands[bandIndex] as Record<string, unknown> | undefined
        )?.[bandProp];
      }
      return undefined;
    }
    if (field.startsWith("workspace.audioFocus.")) {
      const audioKey = field.replace("workspace.audioFocus.", "");
      return (state.ui.workspace.audioFocus as unknown as Record<string, unknown>)[audioKey];
    }
    if (field === "workspace.comparison.viewMode") {
      return state.ui.workspace.comparisonViewMode;
    }
    if (field === "workspace.comparison.splitPercent") {
      return state.ui.workspace.comparisonSplitPercent;
    }
    if (field === "workspace.comparison.findingNote") {
      return state.ui.workspace.comparisonFindingNote;
    }
    return undefined;
  }

  function patchInteractiveSetting(settingKey: string, rawValue: unknown) {
    if (guardRunActiveWorkspaceSettings()) {
      return;
    }
    const comparisonSide = getActiveComparisonSettingsSide();
    deps.dispatch({
      type: "workspace-interactive-updated",
      ...(comparisonSide === undefined ? {} : { comparisonSide }),
      patch: { [settingKey]: rawValue } as Partial<LabInteractiveSettings>,
    });
  }

  function resetInteractiveSettings() {
    if (guardRunActiveWorkspaceSettings()) {
      return;
    }
    const comparisonSide = getActiveComparisonSettingsSide();
    deps.dispatch({
      type: "workspace-interactive-updated",
      ...(comparisonSide === undefined ? {} : { comparisonSide }),
      patch: { ...DEFAULT_LAB_INTERACTIVE_SETTINGS },
    });
  }

  function patchAudioFocusSetting(audioKey: string, rawValue: unknown) {
    if (guardRunActiveWorkspaceSettings()) {
      return;
    }
    if (audioKey.startsWith("eqBands.")) {
      const eqState = deps.store.getState();
      const currentBands = eqState.ui.workspace.audioFocus.eqBands.map(function (band) {
        return { ...band };
      });
      const parts = audioKey.split(".");
      const bandIndex = parts.length > 1 ? parseInt(parts[1] as string, 10) : NaN;
      const bandProp = parts.length > 2 ? parts[2] : "";
      if (
        !Number.isNaN(bandIndex) &&
        bandIndex >= 0 &&
        bandIndex < currentBands.length &&
        bandProp
      ) {
        const numValue = typeof rawValue === "number" ? rawValue : parseFloat(String(rawValue));
        if (!Number.isNaN(numValue)) {
          (currentBands[bandIndex] as Record<string, unknown>)[bandProp] = numValue;
        }
      }
      deps.dispatch({
        type: "workspace-audio-updated",
        patch: { eqBands: currentBands } as Partial<LabAudioFocusSettings>,
      });
      return;
    }
    deps.dispatch({
      type: "workspace-audio-updated",
      patch: { [audioKey]: rawValue } as Partial<LabAudioFocusSettings>,
    });
  }

  function patchWorkspaceSetting(field: string, rawValue: unknown) {
    if (guardRunActiveWorkspaceSettings()) {
      return;
    }
    if (field.startsWith("workspace.interactive.")) {
      patchInteractiveSetting(field.replace("workspace.interactive.", ""), rawValue);
      return;
    }
    if (field.startsWith("workspace.audioFocus.")) {
      patchAudioFocusSetting(field.replace("workspace.audioFocus.", ""), rawValue);
      return;
    }
    if (field === "workspace.comparison.viewMode") {
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
          patch: { comparisonViewMode: value as LabComparisonViewMode },
        });
      }
      return;
    }
    if (field === "workspace.comparison.splitPercent") {
      const parsed = typeof rawValue === "number" ? rawValue : parseFloat(String(rawValue));
      deps.dispatch({
        type: "workspace-comparison-updated",
        patch: {
          comparisonSplitPercent: Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 50,
        },
      });
      return;
    }
    if (field === "workspace.comparison.findingNote") {
      deps.dispatch({
        type: "workspace-comparison-updated",
        patch: { comparisonFindingNote: String(rawValue || "").slice(0, 1000) },
      });
    }
  }

  function isOperationCapabilityId(value: string): value is LabOperationCapabilityId {
    return LAB_OPERATION_CAPABILITIES.some(function (capability) {
      return capability.id === value;
    });
  }

  function patchOperationSetting(field: string, rawValue: unknown) {
    if (isRunActive(deps.store.getState())) {
      deps.pushLockedWorkspaceEvent("İşlem ayarları aktif analiz sırasında kilitli.");
      return;
    }
    const parts = field.replace("operationSettings.", "").split(".");
    const capabilityId = parts[0] || "";
    const settingKey = parts[1] || "";
    if (!isOperationCapabilityId(capabilityId) || settingKey === "") {
      return;
    }
    deps.updateWorkbench(function (workbench) {
      const operationSettings = { ...asLabRecord(workbench["operationSettings"]) };
      const currentSettings = asLabRecord(operationSettings[capabilityId]);
      operationSettings[capabilityId] = normalizeLabOperationSettings(capabilityId, {
        ...currentSettings,
        [settingKey]: rawValue,
      });
      return {
        ...workbench,
        operationSettings,
      };
    });
  }

  function resetOperationSettings(capabilityId: string) {
    if (isRunActive(deps.store.getState())) {
      deps.pushLockedWorkspaceEvent("İşlem ayarları aktif analiz sırasında kilitli.");
      return;
    }
    if (!isOperationCapabilityId(capabilityId)) {
      return;
    }
    deps.updateWorkbench(function (workbench) {
      return {
        ...workbench,
        operationSettings: {
          ...asLabRecord(workbench["operationSettings"]),
          [capabilityId]: normalizeLabOperationSettings(
            capabilityId,
            LAB_OPERATION_SETTINGS_DEFAULTS[capabilityId]
          ),
        },
      };
    });
  }

  function patchAnalysisModuleSetting(field: string, rawValue: unknown) {
    if (isRunActive(deps.store.getState())) {
      deps.pushLockedWorkspaceEvent("Analiz ayarları aktif analiz sırasında kilitli.");
      return;
    }
    const parts = field.replace("analysisSettings.modules.", "").split(".");
    const moduleId = parts[0] || "";
    const settingKey = parts[1] || "";
    if (moduleId === "" || settingKey === "") {
      return;
    }
    deps.updateWorkbench(function (workbench) {
      const analysisSettings = { ...asLabRecord(workbench["analysisSettings"]) };
      const modules = { ...asLabRecord(analysisSettings["modules"]) };
      const currentSettings = asLabRecord(modules[moduleId]);
      modules[moduleId] = normalizeLabAnalysisModuleSettings(moduleId, {
        ...currentSettings,
        [settingKey]: rawValue,
      });
      return {
        ...workbench,
        analysisSettings: {
          ...analysisSettings,
          modules,
        },
      };
    });
  }

  function resetAnalysisModuleSettings(moduleId: string) {
    if (isRunActive(deps.store.getState())) {
      deps.pushLockedWorkspaceEvent("Analiz ayarları aktif analiz sırasında kilitli.");
      return;
    }
    if (moduleId.trim() === "") {
      return;
    }
    deps.updateWorkbench(function (workbench) {
      const analysisSettings = { ...asLabRecord(workbench["analysisSettings"]) };
      const modules = { ...asLabRecord(analysisSettings["modules"]) };
      modules[moduleId] = normalizeLabAnalysisModuleSettings(
        moduleId,
        LAB_ANALYSIS_MODULE_SETTINGS_DEFAULTS[moduleId] || {}
      );
      return {
        ...workbench,
        analysisSettings: {
          ...analysisSettings,
          modules,
        },
      };
    });
  }

  function readControlValue(target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
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

  function applyWorkspaceSettingAdjustment(actionButton: HTMLElement) {
    const field =
      typeof actionButton.dataset["labField"] === "string" ? actionButton.dataset["labField"] : "";
    if (field.trim() === "") {
      return;
    }
    const resetRequested = actionButton.dataset["labReset"] === "true";
    const optionValues = String(actionButton.dataset["labOptions"] || "")
      .split("|")
      .filter(function (entry) {
        return entry.trim() !== "";
      });
    if (optionValues.length > 0) {
      const currentValue = String(readWorkspaceSetting(field) ?? optionValues[0]);
      const resetValue = String(actionButton.dataset["labResetValue"] || optionValues[0] || "");
      if (resetRequested) {
        patchWorkspaceSetting(field, resetValue);
        return;
      }
      const delta = parseFiniteNumber(actionButton.dataset["labDelta"], 0);
      const currentIndex = Math.max(0, optionValues.indexOf(currentValue));
      const nextIndex = Math.max(
        0,
        Math.min(optionValues.length - 1, currentIndex + (delta < 0 ? -1 : 1))
      );
      patchWorkspaceSetting(field, optionValues[nextIndex]);
      return;
    }

    const min = parseFiniteNumber(actionButton.dataset["labMin"], Number.NEGATIVE_INFINITY);
    const max = parseFiniteNumber(actionButton.dataset["labMax"], Number.POSITIVE_INFINITY);
    const step = parseFiniteNumber(actionButton.dataset["labStep"], 1);
    const currentValue = parseFiniteNumber(String(readWorkspaceSetting(field) ?? ""), 0);
    const resetValue = parseFiniteNumber(actionButton.dataset["labResetValue"], currentValue);
    const delta = parseFiniteNumber(actionButton.dataset["labDelta"], 0);
    const nextValue = resetRequested
      ? resetValue
      : clampAdjustedValue(currentValue + delta, min, max, step);
    patchWorkspaceSetting(field, clampAdjustedValue(nextValue, min, max, step));
  }

  return {
    applyWorkspaceSettingAdjustment,
    patchAnalysisModuleSetting,
    patchAudioFocusSetting,
    patchInteractiveSetting,
    patchOperationSetting,
    readControlValue,
    resetInteractiveSettings,
    resetAnalysisModuleSettings,
    resetOperationSettings,
  };
}
