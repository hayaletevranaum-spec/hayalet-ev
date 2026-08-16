import { asLabRecord } from "../domain/lab-types.js";
import type {
  LabEventFeedItem,
  LabProjectImportKind,
  LabProjectImportMethod,
  LabSourceDrafts,
  LabStoreState,
  LabYoutubeImportFormat,
} from "../domain/lab-types.js";
import { getSourceTypePreset, getYoutubePresetDefaults } from "./lab-source-presets.js";

export type LabProjectImportHostAction = {
  action: "source-pick-local" | "source-download-url" | "source-download-youtube";
  disabledReason: string | null;
  fields: Record<string, unknown>;
  kind: LabProjectImportKind;
  method: LabProjectImportMethod;
};

export type LabProjectImportUrlCheckAction = {
  disabledReason: string | null;
  fields: Record<string, unknown>;
  url: string;
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
}

function getToolInstalled(state: LabStoreState, toolId: string) {
  const toolState = asLabRecord(state.toolState);
  const tools = asLabRecord(toolState["tools"]);
  return asLabRecord(tools[toolId])["installed"] === true;
}

export function normalizeProjectImportKindValue(value: unknown): LabProjectImportKind | null {
  return value === "video" || value === "audio" || value === "image" ? value : null;
}

export function normalizeProjectImportMethodValue(
  value: unknown,
  kind: LabProjectImportKind
): LabProjectImportMethod | null {
  if (value === "youtube") {
    return kind === "video" ? "youtube" : null;
  }
  return value === "local" || value === "url" ? value : null;
}

function getProjectImportMethodOptions(
  state: LabStoreState,
  kind: LabProjectImportKind
): LabProjectImportMethod[] {
  const sourceConfig = getSourceTypePreset(state, kind);
  const configuredModes = toStringArray(sourceConfig["modes"]).filter(
    function (mode): mode is LabProjectImportMethod {
      return normalizeProjectImportMethodValue(mode, kind) !== null;
    }
  );
  if (configuredModes.length > 0) {
    return configuredModes;
  }
  return kind === "video" ? ["local", "url", "youtube"] : ["local", "url"];
}

export function getProjectImportRoute(state: LabStoreState) {
  const kind = state.ui.projectImport.activeKind;
  const methods = getProjectImportMethodOptions(state, kind);
  const configuredMethod = state.ui.projectImport.methods[kind];
  const method = methods.includes(configuredMethod) ? configuredMethod : methods[0] || "local";
  return {
    kind,
    method,
    methods,
    draft: state.ui.projectImport.drafts[kind],
  };
}

function getProjectImportActionForMethod(method: LabProjectImportMethod) {
  if (method === "youtube") {
    return "source-download-youtube" as const;
  }
  if (method === "url") {
    return "source-download-url" as const;
  }
  return "source-pick-local" as const;
}

function getYoutubeFormatById(formats: LabYoutubeImportFormat[], formatId: string | null) {
  if (formatId === null) {
    return null;
  }
  return formats.find((format) => format.formatId === formatId) || null;
}

function getSelectedYoutubeFormatExpression(state: LabStoreState, draft: LabSourceDrafts) {
  const youtubeState = state.ui.youtubeImport;
  const videoFormat = getYoutubeFormatById(
    youtubeState.formats,
    youtubeState.selectedVideoFormatId
  );
  const audioFormat = getYoutubeFormatById(
    youtubeState.formats,
    youtubeState.selectedAudioFormatId
  );
  const videoId = videoFormat?.formatId || null;
  const audioId = audioFormat?.formatId || null;
  const captureMode = draft.youtubeCaptureMode || "video+audio";

  if (captureMode === "audio-only") {
    const fallbackMuxedId = videoFormat?.kind === "muxed" ? videoId : null;
    const targetId = audioId || fallbackMuxedId;
    if (targetId !== null) {
      return {
        captureMode: "audio-only" as const,
        format: targetId,
        kind: "audio" as const,
      };
    }
    return null;
  }

  if (captureMode === "video-only") {
    if (videoId !== null) {
      return {
        captureMode: "video-only" as const,
        format: videoId,
        kind: "video" as const,
      };
    }
    return null;
  }

  if (videoId !== null && audioId !== null && videoId !== audioId) {
    return {
      captureMode: "video+audio" as const,
      format: `${videoId}+${audioId}/${videoId}/${audioId}`,
      kind: "video" as const,
    };
  }
  if (videoId !== null) {
    return {
      captureMode: "video+audio" as const,
      format: videoId,
      kind: "video" as const,
    };
  }
  if (audioId !== null) {
    return {
      captureMode: "audio-only" as const,
      format: audioId,
      kind: "audio" as const,
    };
  }
  return null;
}

function buildYoutubeFormatSelectionFields(state: LabStoreState, draft: LabSourceDrafts) {
  const selection = getSelectedYoutubeFormatExpression(state, draft);
  if (selection === null) {
    return null;
  }
  const nextCustom: Record<string, unknown> = {
    ...getYoutubePresetDefaults(state, "custom"),
    ...asLabRecord(draft.youtubeCustom),
    format: selection.format,
    selectedVideoFormatId: state.ui.youtubeImport.selectedVideoFormatId,
    selectedAudioFormatId: state.ui.youtubeImport.selectedAudioFormatId,
  };
  if (selection.captureMode === "audio-only" && typeof nextCustom["audioFormat"] !== "string") {
    nextCustom["audioFormat"] = "best";
  }
  return {
    kind: selection.kind,
    youtubePreset: "custom",
    youtubeCaptureMode: selection.captureMode,
    youtubeCustom: nextCustom,
  };
}

export function getProjectImportUrlInput(state: LabStoreState) {
  const activeDraft = state.ui.projectImport.drafts[state.ui.projectImport.activeKind];
  return (
    activeDraft.urlInput ||
    state.ui.projectImport.urlCheck.url ||
    state.ui.projectImport.drafts.video.urlInput ||
    state.ui.projectImport.drafts.video.youtubeUrl ||
    ""
  );
}

export function buildProjectImportUrlCheckAction(
  state: LabStoreState
): LabProjectImportUrlCheckAction {
  const url = getProjectImportUrlInput(state).trim();
  return {
    disabledReason: url === "" ? "URL is required." : null,
    fields: {
      urlInput: url,
      kind: state.ui.projectImport.activeKind,
      mode: "url",
    },
    url,
  };
}

export function buildProjectImportLocalHostAction(
  state: LabStoreState
): LabProjectImportHostAction {
  const route = getProjectImportRoute(state);
  return {
    action: "source-pick-local",
    disabledReason: null,
    fields: {
      kind: "auto",
      mode: "local",
    },
    kind: route.kind,
    method: "local",
  };
}

export function buildProjectImportHostAction(state: LabStoreState): LabProjectImportHostAction {
  const route = getProjectImportRoute(state);
  const checkedUrl = state.ui.projectImport.urlCheck;
  const checkedKind = checkedUrl.kind || route.kind;
  const checkedMethod: LabProjectImportMethod =
    checkedUrl.status === "ready" && checkedUrl.isYoutube === true
      ? "youtube"
      : checkedUrl.status === "ready"
        ? "url"
        : route.method;
  const effectiveKind = checkedUrl.status === "ready" ? checkedKind : route.kind;
  const effectiveDraft = state.ui.projectImport.drafts[effectiveKind];
  const action = getProjectImportActionForMethod(checkedMethod);
  const urlInput =
    checkedUrl.status === "ready" && checkedUrl.url !== null
      ? checkedUrl.url
      : effectiveDraft.urlInput;
  const baseFields: Record<string, unknown> = {
    kind: effectiveKind,
    mode: checkedMethod,
    urlInput,
    youtubeUrl: effectiveDraft.youtubeUrl,
    youtubePreset: effectiveDraft.youtubePreset,
    youtubeCustom: effectiveDraft.youtubeCustom,
    youtubeCaptureMode: effectiveDraft.youtubeCaptureMode,
  };

  let disabledReason: string | null = null;
  if (checkedMethod === "url") {
    if (urlInput.trim() === "") {
      disabledReason = "Direct URL is required.";
    } else if (checkedUrl.status !== "ready" || checkedUrl.isYoutube !== false) {
      disabledReason = "Check the URL before adding it to the project.";
    }
  }
  if (checkedMethod === "youtube") {
    const youtubeUrl = state.ui.youtubeImport.url || effectiveDraft.youtubeUrl || urlInput;
    const ytDlpInstalled = getToolInstalled(state, "yt-dlp") === true;
    const selectedFormatFields = buildYoutubeFormatSelectionFields(state, effectiveDraft);
    Object.assign(baseFields, {
      youtubePreset: "custom",
      youtubeCustom: {
        ...getYoutubePresetDefaults(state, "custom"),
        ...asLabRecord(effectiveDraft.youtubeCustom),
      },
      youtubeUrl,
    });
    if (selectedFormatFields !== null) {
      Object.assign(baseFields, selectedFormatFields, {
        youtubeUrl,
      });
      baseFields["kind"] = selectedFormatFields["kind"];
    }
    if (!ytDlpInstalled) {
      disabledReason = "yt-dlp is required.";
    } else if (String(youtubeUrl || "").trim() === "") {
      disabledReason = "YouTube URL is required.";
    } else if (checkedUrl.status !== "ready" || checkedUrl.isYoutube !== true) {
      disabledReason = "Check the YouTube URL before adding it to the project.";
    } else if (selectedFormatFields === null) {
      disabledReason = "Choose a YouTube stream after checking the URL.";
    }
  }

  return {
    action,
    disabledReason,
    fields: baseFields,
    kind: (baseFields["kind"] as LabProjectImportKind) || effectiveKind,
    method: checkedMethod,
  };
}

export function getLatestProjectImportEvent(
  state: LabStoreState,
  action: string
): LabEventFeedItem | null {
  const requestId = state.ui.projectImport.lastRequestId;
  if (requestId !== null) {
    return (
      state.activityFeed.find(function (entry) {
        return entry.requestId === requestId && entry.action === action;
      }) || null
    );
  }
  return (
    state.activityFeed.find(function (entry) {
      return entry.action === action;
    }) || null
  );
}

export function hasProjectImportDraftValue(state: LabStoreState) {
  return (
    getProjectImportUrlInput(state).trim() !== "" ||
    state.ui.projectImport.urlCheck.status !== "idle" ||
    state.ui.youtubeImport.url !== null
  );
}
