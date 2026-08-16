import { asLabRecord, asNonEmptyString } from "../../domain/lab-types.js";
import type { LabAsset, LabComparisonSide, LabStoreState } from "../../domain/lab-types.js";
import { normalizeAudioFocusSettings } from "../lab-audio-focus-normalization.js";
import {
  createLabComparisonInteractiveSettings,
  normalizeLabInteractiveSettings,
} from "../lab-workspace-defaults.js";
import { getWorkspaceSourceSelectionResetKey } from "../lab-workspace-selection.js";
import { getCurrentSourceAsset, getLinkedAudioAssets } from "./lab-source-selectors.js";

export function getROIRegions(state: LabStoreState) {
  return state.ui.workspace.roiRegions;
}

export function getActiveROIRegions(state: LabStoreState) {
  return state.ui.workspace.roiRegions.filter(function (entry) {
    return entry.active;
  });
}

export function getComparisonInteractiveSettings(state: LabStoreState) {
  const baseSettings = normalizeLabInteractiveSettings(state.ui.workspace.interactiveSettings);
  const comparisonSettings =
    state.ui.workspace.comparisonInteractiveSettings ??
    createLabComparisonInteractiveSettings(baseSettings);
  return {
    primary: normalizeLabInteractiveSettings(comparisonSettings.primary, baseSettings),
    reference: normalizeLabInteractiveSettings(comparisonSettings.reference, baseSettings),
  };
}

export function getInteractiveSettingsForComparisonSide(
  state: LabStoreState,
  side?: LabComparisonSide | null
) {
  const comparisonReferenceAssetId = asNonEmptyString(
    state.ui.workspace.comparisonReferenceAssetId
  );
  if (comparisonReferenceAssetId === null) {
    return normalizeLabInteractiveSettings(state.ui.workspace.interactiveSettings);
  }
  const targetSide = side ?? state.ui.workspace.comparisonRois.activeSide;
  return getComparisonInteractiveSettings(state)[targetSide];
}

export function getInteractiveSettings(state: LabStoreState) {
  return getInteractiveSettingsForComparisonSide(state);
}

export function getAudioFocusSettings(state: LabStoreState) {
  return normalizeAudioFocusSettings(state.ui.workspace.audioFocus);
}

export function getEffectivePreviewAudioFocusSettings(state: LabStoreState) {
  return getAudioFocusSettings(state);
}

export function getPreviewVolume(state: LabStoreState) {
  return Math.max(0, Math.min(1, state.ui.workspace.previewVolume));
}

export function getDualPreviewVolume(state: LabStoreState) {
  const workspace = asLabRecord(state.ui.workspace);
  const legacyVolume = workspace["dualPreviewVolume"];
  return typeof legacyVolume === "number" && Number.isFinite(legacyVolume)
    ? Math.max(0, Math.min(1, legacyVolume))
    : getPreviewVolume(state);
}

export function getSelectedDualPreviewAudioAsset(state: LabStoreState): LabAsset | null {
  const currentSource = getCurrentSourceAsset(state);
  if (currentSource === null) {
    return null;
  }
  const linkedAudioAssets = getLinkedAudioAssets(state, currentSource.id);
  if (linkedAudioAssets.length === 0) {
    return null;
  }
  const workspace = asLabRecord(state.ui.workspace);
  const selectedAssetId = asNonEmptyString(workspace["dualPreviewAudioAssetId"]);
  return (
    linkedAudioAssets.find(function (asset) {
      return asset.id === selectedAssetId;
    }) ||
    linkedAudioAssets[0] ||
    null
  );
}

export function isDualPreviewAvailable(state: LabStoreState) {
  return getSelectedDualPreviewAudioAsset(state) !== null;
}

export function isDualPreviewActive(state: LabStoreState) {
  const workspace = asLabRecord(state.ui.workspace);
  return workspace["dualPreviewEnabled"] === true && isDualPreviewAvailable(state);
}

export function getBookmarks(state: LabStoreState) {
  const activeProjectId = state.projectIndex.activeProjectId;
  const activeSourceKey = getWorkspaceSourceSelectionResetKey(state.source);
  return state.ui.workspace.bookmarks.filter(function (bookmark) {
    const bookmarkRecord = asLabRecord(bookmark);
    const bookmarkProjectId = asNonEmptyString(bookmarkRecord["projectId"]);
    const bookmarkSourceKey = asNonEmptyString(bookmarkRecord["sourceKey"]);
    return bookmarkProjectId === activeProjectId && bookmarkSourceKey === activeSourceKey;
  });
}

export function getHypothesis(state: LabStoreState) {
  return state.ui.workspace.hypothesis;
}
