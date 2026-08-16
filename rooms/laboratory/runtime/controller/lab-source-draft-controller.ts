import { asLabRecord, asNonEmptyString } from "../../domain/lab-types.js";
import type { LabSourceDrafts, LabStoreState } from "../../domain/lab-types.js";
import {
  getDefaultSourceKind,
  getDefaultSourceMode,
  getDefaultYoutubePreset,
  getYoutubePresetDefaults,
} from "../lab-source-presets.js";

export function getActiveProjectCreatedAt(state: LabStoreState): unknown {
  const snapshot = asLabRecord(state.snapshot);
  const activeProject = asLabRecord(snapshot["activeProject"]);
  return activeProject["createdAt"];
}

export function buildEmptySourceState(state: LabStoreState) {
  const kind = getDefaultSourceKind(state);
  const mode = getDefaultSourceMode(state, kind);
  const youtubePreset = getDefaultYoutubePreset(state);
  return {
    kind,
    mode,
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
    drafts: {
      urlInput: "",
      youtubeUrl: "",
      youtubePreset,
      youtubeCustom: {
        ...getYoutubePresetDefaults(state, youtubePreset),
      },
    },
  };
}

export function mergeSourceDrafts(
  state: LabStoreState,
  patch: Partial<LabSourceDrafts>
): LabSourceDrafts {
  const currentDrafts = state.ui.sourceDrafts;
  return {
    ...currentDrafts,
    ...patch,
    youtubeCustom:
      patch.youtubeCustom !== undefined
        ? {
            ...asLabRecord(currentDrafts.youtubeCustom),
            ...asLabRecord(patch.youtubeCustom),
          }
        : asLabRecord(currentDrafts.youtubeCustom),
  };
}

export function buildSourceDraftPatch(
  state: LabStoreState,
  field: string,
  value: unknown
): Partial<LabSourceDrafts> | null {
  const currentDrafts = state.ui.sourceDrafts;
  switch (field) {
    case "source.urlInput":
      if (currentDrafts.urlInput === value) {
        return null;
      }
      return {
        urlInput: typeof value === "string" ? value : "",
      };
    case "source.youtubeUrl":
      if (currentDrafts.youtubeUrl === value) {
        return null;
      }
      return {
        youtubeUrl: typeof value === "string" ? value : "",
      };
    case "source.youtubePreset": {
      const presetId =
        typeof value === "string" && value.trim() !== "" ? value : getDefaultYoutubePreset(state);
      return {
        youtubePreset: presetId,
        youtubeCustom:
          Object.keys(asLabRecord(currentDrafts.youtubeCustom)).length > 0
            ? asLabRecord(currentDrafts.youtubeCustom)
            : { ...getYoutubePresetDefaults(state, presetId) },
      };
    }
    case "source.youtubeCaptureMode": {
      const mode = value === "audio-only" || value === "video-only" ? value : "video+audio";
      return {
        youtubeCaptureMode: mode,
      };
    }
    default:
      if (field.startsWith("source.youtubeCustom.")) {
        const customField = field.replace("source.youtubeCustom.", "");
        const presetId =
          asNonEmptyString(currentDrafts.youtubePreset) || getDefaultYoutubePreset(state);
        return {
          youtubeCustom: {
            ...getYoutubePresetDefaults(state, presetId),
            ...asLabRecord(currentDrafts.youtubeCustom),
            [customField]: value,
          },
        };
      }
      return null;
  }
}

export function buildProjectImportDraftPatch(
  state: LabStoreState,
  field: string,
  value: unknown
): Partial<LabSourceDrafts> | null {
  const currentDrafts = state.ui.projectImport.drafts[state.ui.projectImport.activeKind];
  switch (field) {
    case "project-import.urlInput":
      if (currentDrafts.urlInput === value) {
        return null;
      }
      return {
        urlInput: typeof value === "string" ? value : "",
      };
    case "project-import.youtubeUrl":
      if (currentDrafts.youtubeUrl === value) {
        return null;
      }
      return {
        youtubeUrl: typeof value === "string" ? value : "",
      };
    case "project-import.youtubeCaptureMode": {
      const mode = value === "audio-only" || value === "video-only" ? value : "video+audio";
      return {
        youtubeCaptureMode: mode,
      };
    }
    default:
      if (field.startsWith("project-import.youtubeCustom.")) {
        const customField = field.replace("project-import.youtubeCustom.", "");
        const presetId =
          asNonEmptyString(currentDrafts.youtubePreset) || getDefaultYoutubePreset(state);
        return {
          youtubeCustom: {
            ...getYoutubePresetDefaults(state, presetId),
            ...asLabRecord(currentDrafts.youtubeCustom),
            [customField]: value,
          },
        };
      }
      return null;
  }
}
