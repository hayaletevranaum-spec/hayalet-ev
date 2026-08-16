import {
  asLabRecord,
  asNonEmptyString,
  asStringArray,
  CAPABILITY_FAMILIES,
  createLabEventId,
  getModuleIdsForCapabilityFamily,
} from "../../domain/lab-types.js";
import type {
  CapabilityFamilyId,
  LabBookmark,
  LabEventFeedItem,
  LabFocusLayer,
  LabInspectionMode,
  LabRecord,
  LabSelection,
  LabStoreState,
} from "../../domain/lab-types.js";
import { getWorkspaceSourceSelectionResetKey } from "../lab-workspace-selection.js";

export function scopeWorkspaceBookmark(state: LabStoreState, bookmark: LabBookmark): LabBookmark {
  const bookmarkRecord = asLabRecord(bookmark);
  return {
    ...bookmark,
    projectId: asNonEmptyString(bookmarkRecord["projectId"]) ?? state.projectIndex.activeProjectId,
    sourceKey:
      asNonEmptyString(bookmarkRecord["sourceKey"]) ??
      getWorkspaceSourceSelectionResetKey(state.source),
  };
}

export function normalizeWorkspaceCapabilityIds(value: unknown): CapabilityFamilyId[] {
  const knownCapabilityIds = new Set<string>(
    CAPABILITY_FAMILIES.map(function (capability) {
      return capability.id;
    })
  );
  return asStringArray(value).filter(function (capabilityId, index, allCapabilityIds) {
    return knownCapabilityIds.has(capabilityId) && allCapabilityIds.indexOf(capabilityId) === index;
  }) as CapabilityFamilyId[];
}

export function getAnalysisModuleIdsForCapabilityId(capabilityId: CapabilityFamilyId): string[] {
  return Array.from(new Set(getModuleIdsForCapabilityFamily(capabilityId)));
}

function deriveAnalysisModuleIdsFromCapabilityIds(capabilityIds: unknown): string[] {
  return Array.from(
    new Set(
      normalizeWorkspaceCapabilityIds(capabilityIds).flatMap(function (capabilityId) {
        return getAnalysisModuleIdsForCapabilityId(capabilityId);
      })
    )
  );
}

export function replaceAnalysisPreparationModuleToggles(
  workbench: LabRecord,
  selectedCapabilityIds: unknown
): LabRecord {
  const selectedModuleIds = new Set(
    deriveAnalysisModuleIdsFromCapabilityIds(selectedCapabilityIds)
  );
  const moduleToggles = {
    ...asLabRecord(workbench["moduleToggles"]),
  };
  deriveAnalysisModuleIdsFromCapabilityIds(
    CAPABILITY_FAMILIES.map(function (capability) {
      return capability.id;
    })
  ).forEach(function (moduleId) {
    moduleToggles[moduleId] = selectedModuleIds.has(moduleId);
  });
  return {
    ...workbench,
    moduleToggles,
  };
}

export function patchAnalysisPreparationCapabilityModuleToggles(
  workbench: LabRecord,
  capabilityId: CapabilityFamilyId,
  selectedCapabilityIds: unknown,
  enabled: boolean
): LabRecord {
  const selectedCapabilitySet = new Set(normalizeWorkspaceCapabilityIds(selectedCapabilityIds));
  const moduleToggles = {
    ...asLabRecord(workbench["moduleToggles"]),
  };
  getAnalysisModuleIdsForCapabilityId(capabilityId).forEach(function (moduleId) {
    if (enabled) {
      moduleToggles[moduleId] = true;
      return;
    }
    const neededByAnotherSelectedCapability = CAPABILITY_FAMILIES.some(function (capability) {
      return (
        capability.id !== capabilityId &&
        selectedCapabilitySet.has(capability.id) &&
        getAnalysisModuleIdsForCapabilityId(capability.id).includes(moduleId)
      );
    });
    moduleToggles[moduleId] = neededByAnotherSelectedCapability;
  });
  return {
    ...workbench,
    moduleToggles,
  };
}

export function isLabFocusLayer(value: unknown): value is LabFocusLayer {
  return value === "preview" || value === "timeline" || value === "inspector";
}

export function normalizeInspectionMode(value: unknown): LabInspectionMode {
  switch (value) {
    case "visual":
    case "audio":
    case "motion":
      return value;
    default:
      return "none";
  }
}

export function resetInspectionMode(state: LabStoreState) {
  state.ui.inspectionMode = "none";
}

function isLabCapabilityId(value: unknown): value is CapabilityFamilyId {
  return (
    typeof value === "string" &&
    CAPABILITY_FAMILIES.some(function (capability) {
      return capability.id === value;
    })
  );
}

export function normalizeLabCapabilityIds(values: unknown): CapabilityFamilyId[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(
    new Set(
      values.filter(function (value): value is CapabilityFamilyId {
        return isLabCapabilityId(value);
      })
    )
  );
}

export function clearRoiFocus(state: LabStoreState) {
  state.ui.roiFocusActive = false;
}

export function clearInspectionSnapshot(state: LabStoreState) {
  state.ui.activeInspectionSnapshot = null;
}

export function clearInspectionDepth(state: LabStoreState) {
  clearRoiFocus(state);
  clearInspectionSnapshot(state);
}

export function createImageInspectionSelection(
  roi: NonNullable<LabSelection["roi"]>
): LabSelection {
  return {
    id: createLabEventId("selection"),
    startMs: 0,
    endMs: 1,
    type: "inspect",
    roi,
    createdAt: Math.max(0, Date.now()),
  };
}

export function createSnapshotEvent(
  message: string,
  severity: LabEventFeedItem["severity"],
  detail: string | null = null,
  scope: LabEventFeedItem["scope"] = "global"
): LabEventFeedItem {
  return {
    id: createLabEventId("ui"),
    kind: "activity",
    severity,
    message,
    detail,
    percent: null,
    timestamp: Date.now(),
    source: "ui",
    action: null,
    stage: null,
    scope,
    moduleId: null,
    rawLine: null,
  };
}
