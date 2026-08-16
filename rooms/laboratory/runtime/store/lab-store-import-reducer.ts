import { asNonEmptyString } from "../../domain/lab-types.js";
import type { LabStoreEvent, LabStoreState } from "../../domain/lab-types.js";
import {
  cloneSourceDrafts,
  createDefaultSourceDrafts,
  createIdleProjectImportUrlCheckState,
  createIdleYoutubeImportState,
} from "./lab-store-defaults.js";
import {
  normalizeProjectImportKind,
  normalizeProjectImportMethod,
  normalizeSourceDraftPatch,
  normalizeYoutubeFormatSelection,
  normalizeYoutubeImportFormats,
  normalizeYoutubeImportUrl,
} from "./lab-store-import-state.js";
import { resetProjectImportState, syncSourceDraftsFromProjectImport } from "./lab-store-sync.js";

export function reduceLabImportUiEvent(state: LabStoreState, event: LabStoreEvent): boolean {
  switch (event.type) {
    case "youtube-import-set-url": {
      const nextUrl = normalizeYoutubeImportUrl(event.url);
      const sameUrl = nextUrl !== null && nextUrl === state.ui.youtubeImport.url;
      state.ui.youtubeImport = {
        ...state.ui.youtubeImport,
        url: nextUrl,
        status: sameUrl ? state.ui.youtubeImport.status : "idle",
        preview: sameUrl ? state.ui.youtubeImport.preview : null,
        formats: sameUrl ? state.ui.youtubeImport.formats : [],
        selectedVideoFormatId: sameUrl ? state.ui.youtubeImport.selectedVideoFormatId : null,
        selectedAudioFormatId: sameUrl ? state.ui.youtubeImport.selectedAudioFormatId : null,
      };
      return true;
    }
    case "youtube-import-parse-start":
      state.ui.youtubeImport = {
        ...state.ui.youtubeImport,
        status: "parsing",
        preview: null,
        formats: [],
        selectedVideoFormatId: null,
        selectedAudioFormatId: null,
      };
      return true;
    case "youtube-import-parse-success": {
      const eventUrl = normalizeYoutubeImportUrl(event.url ?? null);
      if (eventUrl !== null && eventUrl !== state.ui.youtubeImport.url) {
        return true;
      }
      const formats = normalizeYoutubeImportFormats(event.formats);
      state.ui.youtubeImport = {
        ...state.ui.youtubeImport,
        status: "ready",
        preview: { ...event.preview },
        formats,
        selectedVideoFormatId:
          event.selectedVideoFormatId !== undefined
            ? normalizeYoutubeFormatSelection(event.selectedVideoFormatId, formats)
            : normalizeYoutubeFormatSelection(
                state.ui.youtubeImport.selectedVideoFormatId,
                formats
              ),
        selectedAudioFormatId:
          event.selectedAudioFormatId !== undefined
            ? normalizeYoutubeFormatSelection(event.selectedAudioFormatId, formats)
            : normalizeYoutubeFormatSelection(
                state.ui.youtubeImport.selectedAudioFormatId,
                formats
              ),
      };
      return true;
    }
    case "youtube-import-parse-error":
      state.ui.youtubeImport = {
        ...state.ui.youtubeImport,
        status: "error",
        preview: null,
        formats: [],
        selectedVideoFormatId: null,
        selectedAudioFormatId: null,
      };
      return true;
    case "youtube-import-format-selected":
      state.ui.youtubeImport = {
        ...state.ui.youtubeImport,
        selectedVideoFormatId:
          event.videoFormatId !== undefined
            ? normalizeYoutubeFormatSelection(event.videoFormatId, state.ui.youtubeImport.formats)
            : state.ui.youtubeImport.selectedVideoFormatId,
        selectedAudioFormatId:
          event.audioFormatId !== undefined
            ? normalizeYoutubeFormatSelection(event.audioFormatId, state.ui.youtubeImport.formats)
            : state.ui.youtubeImport.selectedAudioFormatId,
      };
      return true;
    case "youtube-import-clear":
      state.ui.youtubeImport = createIdleYoutubeImportState();
      return true;
    case "project-import-kind-changed": {
      const kind = normalizeProjectImportKind(event.kind, state.ui.projectImport.activeKind);
      state.ui.projectImport = {
        ...state.ui.projectImport,
        activeKind: kind,
        reviewFocus: "draft",
      };
      syncSourceDraftsFromProjectImport(state);
      return true;
    }
    case "project-import-method-changed": {
      const kind = normalizeProjectImportKind(event.kind, state.ui.projectImport.activeKind);
      const method = normalizeProjectImportMethod(
        event.method,
        kind,
        state.ui.projectImport.methods[kind]
      );
      state.ui.projectImport = {
        ...state.ui.projectImport,
        activeKind: kind,
        methods: {
          ...state.ui.projectImport.methods,
          [kind]: method,
        },
        reviewFocus: "draft",
      };
      syncSourceDraftsFromProjectImport(state);
      return true;
    }
    case "project-import-draft-updated": {
      const kind = normalizeProjectImportKind(event.kind, state.ui.projectImport.activeKind);
      const currentDraft = state.ui.projectImport.drafts[kind];
      const nextDraft = normalizeSourceDraftPatch(event.patch, currentDraft);
      state.ui.projectImport = {
        ...state.ui.projectImport,
        activeKind: kind,
        drafts: {
          ...state.ui.projectImport.drafts,
          [kind]: nextDraft,
        },
        urlCheck:
          event.patch.urlInput !== undefined || event.patch.youtubeUrl !== undefined
            ? createIdleProjectImportUrlCheckState()
            : state.ui.projectImport.urlCheck,
        reviewFocus: "draft",
      };
      if (event.patch.urlInput !== undefined || event.patch.youtubeUrl !== undefined) {
        state.ui.youtubeImport = createIdleYoutubeImportState();
      }
      if (kind === state.ui.projectImport.activeKind) {
        state.ui.sourceDrafts = cloneSourceDrafts(nextDraft);
      }
      state.ui.sourceDraftDirty = true;
      return true;
    }
    case "project-import-reset":
      resetProjectImportState(state);
      return true;
    case "project-import-cleared": {
      const kind = normalizeProjectImportKind(event.kind, state.ui.projectImport.activeKind);
      const nextDrafts = {
        ...state.ui.projectImport.drafts,
        [kind]: createDefaultSourceDrafts(),
      };
      state.ui.projectImport = {
        ...state.ui.projectImport,
        drafts: nextDrafts,
        urlCheck: createIdleProjectImportUrlCheckState(),
        reviewFocus: "idle",
        lastAction: null,
        lastRequestId: null,
      };
      if (kind === state.ui.projectImport.activeKind) {
        state.ui.sourceDrafts = cloneSourceDrafts(nextDrafts[kind]);
      }
      state.ui.sourceDraftDirty = true;
      return true;
    }
    case "project-import-url-check-started":
      state.ui.projectImport = {
        ...state.ui.projectImport,
        urlCheck: {
          status: "checking",
          url: event.url.trim(),
          isYoutube: null,
          kind: null,
          error: null,
        },
        reviewFocus: "draft",
      };
      state.ui.youtubeImport = {
        ...state.ui.youtubeImport,
        url: event.url.trim(),
        status: "parsing",
        preview: null,
        formats: [],
        selectedVideoFormatId: null,
        selectedAudioFormatId: null,
      };
      return true;
    case "project-import-url-check-cleared":
      state.ui.projectImport = {
        ...state.ui.projectImport,
        urlCheck: createIdleProjectImportUrlCheckState(),
        lastAction: null,
        lastRequestId: null,
      };
      state.ui.youtubeImport = createIdleYoutubeImportState();
      return true;
    case "project-import-url-check-failed":
      state.ui.projectImport = {
        ...state.ui.projectImport,
        urlCheck: {
          status: "error",
          url: normalizeYoutubeImportUrl(event.url ?? null),
          isYoutube: null,
          kind: null,
          error: event.error || "URL check failed.",
        },
        reviewFocus: "draft",
      };
      state.ui.youtubeImport = {
        ...state.ui.youtubeImport,
        status: "error",
        preview: null,
        formats: [],
        selectedVideoFormatId: null,
        selectedAudioFormatId: null,
      };
      return true;
    case "project-import-review-focused":
      state.ui.projectImport = {
        ...state.ui.projectImport,
        reviewFocus: event.focus,
        lastAction:
          event.action === undefined
            ? state.ui.projectImport.lastAction
            : asNonEmptyString(event.action),
        lastRequestId:
          event.requestId === undefined
            ? state.ui.projectImport.lastRequestId
            : asNonEmptyString(event.requestId),
      };
      return true;
    default:
      return false;
  }
}
