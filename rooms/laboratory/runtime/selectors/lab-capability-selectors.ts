import { asLabRecord, asNonEmptyString } from "../../domain/lab-types.js";
import type {
  CapabilityFamilyId,
  CapabilityReadiness,
  LabAnalysisPreparationGroup,
  LabAsset,
  LabOperationCapabilityProjection,
  LabPreflightResult,
  LabStoreState,
  LabUserActionEvent,
} from "../../domain/lab-types.js";
import {
  CAPABILITY_FAMILIES,
  LAB_ANALYSIS_MODULE_SETTINGS_FIELDS,
  LAB_OPERATION_CAPABILITIES,
  LAB_OPERATION_SETTINGS_FIELDS,
  getAnalysisModuleRequirementMeta,
  getModuleIdsForCapabilityFamily,
  normalizeLabAnalysisModuleSettings,
  normalizeLabOperationSettings,
} from "../../domain/lab-types.js";
import { getProjectSource } from "./lab-project-selectors.js";
import { getSourceKind, getToolState } from "./lab-source-selectors.js";
import { getTrackedOperationActionId } from "../lab-operation-action-map.js";
import { getUserActions } from "./lab-activity-selectors.js";
import { inferLabAssetSourceKind, type LabAssetSourceKind } from "../../shared/lab-asset-kind.js";
import { isFullSourceWorkspaceSelection } from "../lab-workspace-selection.js";

type OperationSourceKind = LabAssetSourceKind;

type OperationTargetContext = {
  blockReason: string | null;
  metadata: Record<string, unknown>;
  sourceKind: OperationSourceKind | null;
  sourceReady: boolean;
};

export function getSourceReady(state: LabStoreState): boolean {
  return state.source !== null && state.sourceProbeStatus === "completed";
}

function hasAuthoritativeToolState(state: LabStoreState): boolean {
  const toolRegistry = asLabRecord(getToolState(state)["tools"]);
  if (Object.keys(toolRegistry).length > 0) {
    return true;
  }
  return Array.isArray(asLabRecord(state.snapshot)["toolRegistry"]);
}

function isToolReady(state: LabStoreState, toolId: string) {
  if (toolId === "transcript-runtime") {
    return state.profileModels.some(function (model) {
      return model["ready"] === true;
    });
  }
  if (!hasAuthoritativeToolState(state)) {
    return true;
  }
  const toolRegistry = asLabRecord(getToolState(state)["tools"]);
  const tool = asLabRecord(toolRegistry[toolId]);
  return tool["installed"] === true || asNonEmptyString(tool["status"]) === "installed";
}

function getAssetOperationKind(asset: LabAsset): OperationSourceKind | null {
  return inferLabAssetSourceKind(asset);
}

function normalizeOperationSourceKind(value: string): OperationSourceKind {
  return value === "audio" || value === "image" ? value : "video";
}

function getWorkspaceOperationTarget(state: LabStoreState): OperationTargetContext {
  const assetId = asNonEmptyString(state.ui.activeWorkspaceAssetId);
  if (assetId === null) {
    const sourceKind = normalizeOperationSourceKind(getSourceKind(state));
    return {
      blockReason: getSourceReady(state) ? null : "Kaynak henüz hazır değil.",
      metadata: asLabRecord(asLabRecord(state.source)["metadata"]),
      sourceKind,
      sourceReady: getSourceReady(state),
    };
  }

  const asset =
    state.assets.find(function (candidate) {
      return candidate.id === assetId;
    }) || null;
  if (asset === null) {
    return {
      blockReason: "Seçili dosya bulunamadı.",
      metadata: {},
      sourceKind: null,
      sourceReady: false,
    };
  }

  const sourceKind = getAssetOperationKind(asset);
  if (sourceKind === null) {
    return {
      blockReason: "Seçili dosya bu işlem için desteklenmiyor.",
      metadata: asLabRecord(asset.metadata),
      sourceKind: null,
      sourceReady: false,
    };
  }

  if (asNonEmptyString(asset.localPath) === null) {
    return {
      blockReason: "Seçili dosya yerel işlem hedefi değil.",
      metadata: asLabRecord(asset.metadata),
      sourceKind,
      sourceReady: false,
    };
  }

  return {
    blockReason: null,
    metadata: asLabRecord(asset.metadata),
    sourceKind,
    sourceReady: true,
  };
}

export function getReadySelectedAnalysisCapabilityIds(state: LabStoreState): CapabilityFamilyId[] {
  return getAnalysisPreparationGroups(state)
    .filter(function (group) {
      return (
        group.selected &&
        group.modules.some(function (module) {
          return module.enabled && module.readiness !== "blocked";
        })
      );
    })
    .map(function (group) {
      return group.capabilityId;
    });
}

function getEffectiveSelectedCapabilities(state: LabStoreState) {
  return getSelectedCapabilities(state);
}

export function getCurrentPreflight(state: LabStoreState): LabPreflightResult {
  const source = getProjectSource(state);
  const operationTarget = getWorkspaceOperationTarget(state);
  if (Object.keys(source).length === 0) {
    return {
      status: "idle",
      missingDependencies: [],
      warnings: [],
      estimatedRuntime: null,
      enabledModules: [],
      stageReady: false,
      rawStatus: null,
      reason: "Önce kaynak seçilmelidir.",
    };
  }

  if (operationTarget.sourceKind === null || operationTarget.sourceReady !== true) {
    return {
      status: "idle",
      missingDependencies: [],
      warnings: [],
      estimatedRuntime: null,
      enabledModules: [],
      stageReady: false,
      rawStatus: null,
      reason: operationTarget.blockReason || "Kaynak probe tamamlanmadan ön kontrol doğrulanamaz.",
    };
  }

  const selectedCapabilities = getReadySelectedAnalysisCapabilityIds(state);
  if (selectedCapabilities.length === 0) {
    return {
      status: "blocked",
      missingDependencies: [],
      warnings: [],
      estimatedRuntime: null,
      enabledModules: [],
      stageReady: false,
      rawStatus: null,
      reason: "Önce en az bir yetenek ailesi seçilmelidir.",
    };
  }

  const selectedEntries = getAvailableCapabilities(state).filter(function (entry) {
    return selectedCapabilities.includes(entry.id);
  });
  const blockedEntries = selectedEntries.filter(function (entry) {
    return entry.readiness === "blocked";
  });
  const warningEntries = selectedEntries.filter(function (entry) {
    return entry.readiness === "optional";
  });

  const missingDependencies = blockedEntries.map(function (entry) {
    return entry.label;
  });
  const warnings = warningEntries.map(function (entry) {
    return entry.blockReason || `${entry.label} kısmi hazırlıkta.`;
  });
  const hostPreflight = state.preflight;
  const stageReady = blockedEntries.length === 0 && selectedEntries.length > 0;

  return {
    status: stageReady !== true ? "blocked" : warnings.length > 0 ? "warning" : "ready",
    missingDependencies,
    warnings:
      hostPreflight && hostPreflight.warnings.length > 0
        ? Array.from(new Set(hostPreflight.warnings.concat(warnings)))
        : warnings,
    estimatedRuntime:
      hostPreflight?.estimatedRuntime || Math.max(60, Math.round(selectedEntries.length * 75)),
    enabledModules: Array.isArray(selectedCapabilities) ? selectedCapabilities.slice() : [],
    stageReady,
    rawStatus: hostPreflight?.rawStatus || null,
    reason:
      stageReady !== true
        ? blockedEntries[0]?.blockReason || "Seçili yetenekler henüz hazır değil."
        : warnings.length > 0
          ? "Araç uyarıları var ama işlem başlatılabilir."
          : null,
  };
}

export function getSelectedCapabilities(state: LabStoreState): CapabilityFamilyId[] {
  return state.selectedCapabilities;
}

export function getAvailableCapabilities(state: LabStoreState) {
  const operationTarget = getWorkspaceOperationTarget(state);
  const sourceKind = operationTarget.sourceKind;
  const sourceReady = operationTarget.sourceReady;
  const effectiveSelectedCapabilities = getEffectiveSelectedCapabilities(state);

  return CAPABILITY_FAMILIES.map(function (family) {
    const sourceCompatible =
      sourceKind !== null && family.sourceKinds.includes(sourceKind as "video" | "audio" | "image");
    const toolsReady = family.requiredTools.every(function (toolId) {
      return isToolReady(state, toolId);
    });
    const toolsMissing = family.requiredTools.filter(function (toolId) {
      return isToolReady(state, toolId) !== true;
    });

    let readiness: "ready" | "optional" | "blocked" = "ready";
    let blockReason: string | null = null;

    if (sourceKind === null) {
      readiness = "blocked";
      blockReason = operationTarget.blockReason || "Bu dosya türü desteklenmiyor.";
    } else if (!sourceReady) {
      readiness = "blocked";
      blockReason = operationTarget.blockReason || "Kaynak henüz hazır değil.";
    } else if (!sourceCompatible) {
      readiness = "blocked";
      blockReason = `Bu kaynak türü (${sourceKind}) desteklenmiyor.`;
    } else if (!toolsReady) {
      if (toolsMissing.length === family.requiredTools.length) {
        readiness = "blocked";
        blockReason = `Eksik araç: ${toolsMissing.join(", ")}`;
      } else {
        readiness = "optional";
        blockReason = `Opsiyonel araç eksik: ${toolsMissing.join(", ")}`;
      }
    }

    return {
      ...family,
      readiness,
      blockReason,
      selected: effectiveSelectedCapabilities.includes(family.id),
    };
  });
}

function getMissingToolIds(state: LabStoreState, toolIds: string[]) {
  if (!hasAuthoritativeToolState(state)) {
    return [];
  }
  return toolIds.filter(function (toolId) {
    return isToolReady(state, toolId) !== true;
  });
}

function getReadableModuleLabel(moduleId: string) {
  return moduleId
    .split("-")
    .filter(function (part) {
      return part.trim() !== "";
    })
    .map(function (part) {
      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");
}

function getReportSectionForCapability(capabilityId: CapabilityFamilyId) {
  switch (capabilityId) {
    case "visual-structure":
      return "Visual structure";
    case "visual-forensics":
      return "Visual forensics";
    case "audio-signal":
      return "Audio signal";
    case "audio-recovery":
      return "Audio recovery";
    case "transcription":
    case "speaker-analysis":
      return "Speech evidence";
    case "prosody-emotion":
      return "Prosody and emotion";
    case "sound-classification":
      return "Sound events";
    case "source-separation":
      return "Separated sources";
    case "music-analysis":
      return "Music descriptors";
    default:
      return "Analysis evidence";
  }
}

function getLatestOperationUserAction(
  state: LabStoreState,
  capability: (typeof LAB_OPERATION_CAPABILITIES)[number]
): LabUserActionEvent | null {
  const trackedAction = getTrackedOperationActionId(capability.actionId);
  if (trackedAction === null) {
    return null;
  }
  const matchingActions = getUserActions(state).filter(function (entry) {
    return entry.sourceAction === trackedAction;
  });
  return (
    matchingActions.find(function (entry) {
      return entry.status === "running";
    }) ||
    matchingActions[0] ||
    null
  );
}

function getOperationAudioBlockReason(sourceKind: string, metadata: Record<string, unknown>) {
  if (sourceKind === "audio") {
    return null;
  }
  if (sourceKind !== "video") {
    return "Bu işlem için ses akışı gerekir.";
  }
  const audioCodec = asNonEmptyString(metadata["audioCodec"]);
  const codec = asNonEmptyString(metadata["codec"]);
  if (audioCodec !== null || (codec !== null && codec.includes("+"))) {
    return null;
  }
  return Object.keys(metadata).length > 0 ? "Bu kaynakta ses akışı algılanmadı." : null;
}

function getComparisonReferenceBlockReason(state: LabStoreState): string | null {
  const referenceAssetId = asNonEmptyString(state.ui.workspace.comparisonReferenceAssetId);
  if (referenceAssetId === null) {
    return "Önce karşılaştırma referansı olarak ikinci bir resim seçilmelidir.";
  }
  const referenceAsset =
    state.assets.find(function (asset) {
      return asset.id === referenceAssetId;
    }) || null;
  if (referenceAsset === null) {
    return "Karşılaştırma referansı bulunamadı.";
  }
  if (inferLabAssetSourceKind(referenceAsset) !== "image") {
    return "Karşılaştırma referansı resim dosyası olmalıdır.";
  }
  if (asNonEmptyString(referenceAsset.localPath) === null) {
    return "Karşılaştırma referansı yerel dosya olmalıdır.";
  }
  return null;
}

export function getOperationSettings(
  state: LabStoreState,
  capabilityId: (typeof LAB_OPERATION_CAPABILITIES)[number]["id"]
) {
  const settings = asLabRecord(asLabRecord(state.workbench)["operationSettings"]);
  return normalizeLabOperationSettings(capabilityId, settings[capabilityId]);
}

export function getAvailableOperationCapabilities(
  state: LabStoreState
): LabOperationCapabilityProjection[] {
  const operationTarget = getWorkspaceOperationTarget(state);
  const sourceKind = operationTarget.sourceKind;
  if (sourceKind === null) {
    return [];
  }
  const sourceReady = operationTarget.sourceReady;
  const selection = state.ui.workspace.activeSelection;
  const hasSelection =
    selection !== null &&
    selection.endMs > selection.startMs &&
    !isFullSourceWorkspaceSelection(selection);
  const hasRoi = selection?.roi !== undefined;

  return LAB_OPERATION_CAPABILITIES.map(function (capability) {
    const sourceCompatible = capability.sourceKinds.includes(
      sourceKind as "video" | "audio" | "image"
    );
    const missingTools = getMissingToolIds(state, capability.toolIds);
    const activeAction = getLatestOperationUserAction(state, capability);
    const audioBlockReason =
      capability.groupId === "audio" || capability.groupId === "stems"
        ? getOperationAudioBlockReason(sourceKind, operationTarget.metadata)
        : null;
    const comparisonReferenceBlockReason =
      capability.requiresComparisonReference === true
        ? getComparisonReferenceBlockReason(state)
        : null;

    let readiness: CapabilityReadiness = "ready";
    let blockReason: string | null = null;

    if (!sourceReady) {
      readiness = "blocked";
      blockReason = operationTarget.blockReason || "Kaynak henüz hazır değil.";
    } else if (!sourceCompatible) {
      readiness = "blocked";
      blockReason = `Bu kaynak türü (${sourceKind}) desteklenmiyor.`;
    } else if (audioBlockReason !== null) {
      readiness = "blocked";
      blockReason = audioBlockReason;
    } else if (comparisonReferenceBlockReason !== null) {
      readiness = "blocked";
      blockReason = comparisonReferenceBlockReason;
    } else if (capability.requiresSelection === true && !hasSelection) {
      readiness = "blocked";
      blockReason = "Önce zaman aralığı seçilmelidir.";
    } else if (capability.requiresRoi === true && !hasRoi) {
      readiness = "blocked";
      blockReason = "Önce görüntü üzerinde ROI seçilmelidir.";
    } else if (missingTools.length > 0) {
      readiness = "blocked";
      blockReason = `Eksik araç: ${missingTools.join(", ")}`;
    } else if (capability.planned === true || capability.actionId === null) {
      readiness = "blocked";
      blockReason = "Bu işlem için runner henüz bağlanmadı.";
    }

    return {
      ...capability,
      readiness,
      blockReason,
      settings: getOperationSettings(state, capability.id),
      settingsFields: LAB_OPERATION_SETTINGS_FIELDS[capability.id] || [],
      actionStatus: activeAction?.status ?? "idle",
      activeActionLabel: activeAction?.label ?? null,
      activeActionMessage: activeAction?.message ?? null,
      activeJobId: activeAction?.jobId ?? null,
      activeRequestId: activeAction?.requestId ?? null,
      progress: activeAction?.progress ?? null,
      ...(activeAction?.resultAssetIds === undefined
        ? {}
        : { resultAssetIds: activeAction.resultAssetIds }),
    };
  }).filter(function (capability) {
    return capability.sourceKinds.includes(sourceKind as "video" | "audio" | "image");
  });
}

export function getAnalysisPreparationGroups(state: LabStoreState): LabAnalysisPreparationGroup[] {
  const availableCapabilities = getAvailableCapabilities(state);
  const selectedCapabilities = getSelectedCapabilities(state);
  const moduleToggles = asLabRecord(asLabRecord(state.workbench)["moduleToggles"]);
  const analysisSettings = asLabRecord(asLabRecord(state.workbench)["analysisSettings"]);
  const moduleSettings = asLabRecord(analysisSettings["modules"]);
  const operationTarget = getWorkspaceOperationTarget(state);
  const sourceKind = operationTarget.sourceKind;

  return availableCapabilities.map(function (capability) {
    const capabilitySelected = selectedCapabilities.includes(capability.id);
    const modules = getModuleIdsForCapabilityFamily(capability.id).map(function (moduleId) {
      const moduleMeta = getAnalysisModuleRequirementMeta(capability.id, moduleId);
      const requiredTools =
        moduleMeta.requiredToolIds.length > 0
          ? moduleMeta.requiredToolIds
          : (capability.requiredTools ?? []);
      const optionalTools = moduleMeta.optionalToolIds;
      const sourceCompatible =
        sourceKind !== null &&
        moduleMeta.sourceKinds.includes(sourceKind as "video" | "audio" | "image");
      const requiredMissing = getMissingToolIds(state, requiredTools);
      const optionalMissing = getMissingToolIds(state, optionalTools);
      let moduleReadiness = capability.readiness;
      let moduleBlockReason = capability.blockReason;

      if (moduleMeta.status === "planned" || moduleMeta.status === "gated") {
        moduleReadiness = "blocked";
        moduleBlockReason =
          moduleMeta.status === "gated"
            ? "Bu modul gelecek faz icin gated durumda."
            : "Bu modul gelecek faz icin planlandi.";
      } else if (sourceKind !== null && sourceCompatible !== true) {
        moduleReadiness = "blocked";
        moduleBlockReason = `Bu modul ${sourceKind} kaynak turu icin kullanilamaz.`;
      } else if (requiredMissing.length > 0) {
        moduleReadiness = "blocked";
        moduleBlockReason = `Eksik arac: ${requiredMissing.join(", ")}`;
      } else if (capability.readiness === "blocked") {
        moduleReadiness = "blocked";
        moduleBlockReason = capability.blockReason;
      } else if (optionalMissing.length > 0) {
        moduleReadiness = "optional";
        moduleBlockReason = `Opsiyonel arac eksik: ${optionalMissing.join(", ")}`;
      }

      return {
        capabilityId: capability.id,
        moduleId,
        label: getReadableModuleLabel(moduleId),
        flowKind: "analysis-report" as const,
        requiredTools: requiredTools.slice(),
        optionalTools: optionalTools.slice(),
        readiness: moduleReadiness,
        blockReason: moduleBlockReason,
        enabled: capabilitySelected && moduleToggles[moduleId] !== false,
        settings: normalizeLabAnalysisModuleSettings(moduleId, moduleSettings[moduleId]),
        settingsFields: LAB_ANALYSIS_MODULE_SETTINGS_FIELDS[moduleId] || [],
        reportSection: moduleMeta.reportSection || getReportSectionForCapability(capability.id),
        sourceKinds: moduleMeta.sourceKinds.slice(),
        status: moduleMeta.status,
      };
    });
    const selectedModules = modules.filter(function (module) {
      return module.enabled;
    });
    const selectionState =
      !capabilitySelected || selectedModules.length === 0
        ? "none"
        : selectedModules.length === modules.length
          ? "full"
          : "partial";
    const selected = selectionState !== "none";
    const blockedModules = selectedModules.filter(function (module) {
      return module.readiness === "blocked";
    });
    const optionalModules = selectedModules.filter(function (module) {
      return module.readiness === "optional";
    });
    const readiness: CapabilityReadiness =
      selectedModules.length === 0 || blockedModules.length === selectedModules.length
        ? "blocked"
        : blockedModules.length > 0 || optionalModules.length > 0
          ? "optional"
          : "ready";

    return {
      capabilityId: capability.id,
      label: capability.label,
      description: capability.primaryTool,
      selected,
      selectionState,
      readiness,
      blockReason:
        readiness === "blocked"
          ? blockedModules[0]?.blockReason || "Seçili rapor modülleri hazır değil."
          : readiness === "optional"
            ? "Bazı modüller kısmi veya kapalı durumda."
            : null,
      modules,
    };
  });
}

export function getReadyAnalysisPreparationGroups(
  state: LabStoreState
): LabAnalysisPreparationGroup[] {
  return getAnalysisPreparationGroups(state).filter(function (group) {
    return group.modules.some(function (module) {
      return module.readiness !== "blocked";
    });
  });
}

export function filterReadyAnalysisCapabilityIds(
  state: LabStoreState,
  capabilityIds: readonly CapabilityFamilyId[]
): CapabilityFamilyId[] {
  const readyCapabilityIds = new Set(
    getReadyAnalysisPreparationGroups(state).map(function (group) {
      return group.capabilityId;
    })
  );
  return capabilityIds.filter(function (capabilityId, index, allCapabilityIds) {
    return readyCapabilityIds.has(capabilityId) && allCapabilityIds.indexOf(capabilityId) === index;
  });
}

export function getCapabilityWorkflowSummary(state: LabStoreState) {
  const selected = getEffectiveSelectedCapabilities(state);
  const available = getAvailableCapabilities(state);
  const selectedFamilies = available.filter(function (entry) {
    return selected.includes(entry.id);
  });
  const readyCount = selectedFamilies.filter(function (entry) {
    return entry.readiness === "ready";
  }).length;

  return {
    familyCount: selectedFamilies.length,
    readyCount,
    blockedCount: selectedFamilies.length - readyCount,
    selectedIds: selected,
  };
}
