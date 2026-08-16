import { asLabRecord, asNonEmptyString, asNumber } from "../../domain/lab-types.js";
import type {
  LabProjectImportKind,
  LabProjectImportMethod,
  LabProjectImportUiState,
  LabSourceDrafts,
  LabStoreState,
  LabYoutubeImportFormat,
} from "../../domain/lab-types.js";
import { cloneSourceDrafts, createDefaultProjectImportState } from "./lab-store-defaults.js";

export function chooseDefaultYoutubeFormats(formats: LabYoutubeImportFormat[]) {
  const videoFormats = formats.filter(
    (format) => format.kind === "video" || format.kind === "muxed"
  );
  const audioFormats = formats.filter(
    (format) => format.kind === "audio" || format.kind === "muxed"
  );
  const pickHighestBitrate = (entries: LabYoutubeImportFormat[]) =>
    entries.slice().sort(function (left, right) {
      const rightBitrate = right.bitrateKbps || 0;
      const leftBitrate = left.bitrateKbps || 0;
      return rightBitrate - leftBitrate;
    })[0] || null;
  return {
    videoFormatId:
      videoFormats.find((format) => format.kind === "video")?.formatId ||
      pickHighestBitrate(videoFormats)?.formatId ||
      null,
    audioFormatId:
      audioFormats.find((format) => format.kind === "audio")?.formatId ||
      (videoFormats.some((format) => format.kind === "video")
        ? pickHighestBitrate(audioFormats)?.formatId || null
        : null),
  };
}

export function normalizeYoutubeImportUrl(url: string | null): string | null {
  if (typeof url !== "string") {
    return null;
  }
  const normalizedUrl = url.trim();
  return normalizedUrl === "" ? null : normalizedUrl;
}

function normalizeYoutubeImportFormat(value: unknown): LabYoutubeImportFormat | null {
  const record = asLabRecord(value);
  const formatId = asNonEmptyString(record["formatId"]) || asNonEmptyString(record["format_id"]);
  if (formatId === null) {
    return null;
  }
  const kind = asNonEmptyString(record["kind"]);
  const fps = asNumber(record["fps"]);
  const bitrateKbps = asNumber(record["bitrateKbps"] ?? record["tbr"]);
  const filesizeBytes = asNumber(record["filesizeBytes"] ?? record["filesize"]);
  const filesizeApproxBytes = asNumber(record["filesizeApproxBytes"] ?? record["filesize_approx"]);
  return {
    formatId,
    label: asNonEmptyString(record["label"]) || formatId,
    kind: kind === "video" || kind === "audio" || kind === "muxed" ? kind : "unknown",
    extension: asNonEmptyString(record["extension"] ?? record["ext"]),
    resolution: asNonEmptyString(record["resolution"]),
    fps: fps !== null ? fps : null,
    videoCodec: asNonEmptyString(record["videoCodec"] ?? record["vcodec"]),
    audioCodec: asNonEmptyString(record["audioCodec"] ?? record["acodec"]),
    bitrateKbps: bitrateKbps !== null ? bitrateKbps : null,
    filesizeBytes: filesizeBytes !== null ? filesizeBytes : null,
    filesizeApproxBytes: filesizeApproxBytes !== null ? filesizeApproxBytes : null,
    note: asNonEmptyString(record["note"] ?? record["format_note"]),
  };
}

export function normalizeYoutubeImportFormats(value: unknown): LabYoutubeImportFormat[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  return value
    .map(normalizeYoutubeImportFormat)
    .filter((format): format is LabYoutubeImportFormat => {
      if (format === null || seen.has(format.formatId)) {
        return false;
      }
      seen.add(format.formatId);
      return true;
    });
}

export function normalizeYoutubeFormatSelection(
  value: unknown,
  formats: LabYoutubeImportFormat[]
): string | null {
  const selected = asNonEmptyString(value);
  if (selected === null) {
    return null;
  }
  return formats.some((format) => format.formatId === selected) ? selected : null;
}

export function normalizeYoutubeImportPreview(
  value: unknown
): LabStoreState["ui"]["youtubeImport"]["preview"] {
  const record = asLabRecord(value);
  const title = asNonEmptyString(record["title"]);
  const thumbnail = asNonEmptyString(record["thumbnail"]);
  const duration = asNumber(record["duration"]);
  const uploader = asNonEmptyString(record["uploader"]);
  const webpageUrl = asNonEmptyString(record["webpageUrl"] ?? record["webpage_url"]);
  if (
    title === null &&
    thumbnail === null &&
    duration === null &&
    uploader === null &&
    webpageUrl === null
  ) {
    return null;
  }
  return {
    ...(title !== null ? { title } : {}),
    ...(duration !== null ? { duration } : {}),
    ...(thumbnail !== null ? { thumbnail } : {}),
    ...(uploader !== null ? { uploader } : {}),
    ...(webpageUrl !== null ? { webpageUrl } : {}),
  };
}

export function normalizeProjectImportUrlCheckKind(value: unknown): LabProjectImportKind | null {
  return value === "video" || value === "audio" || value === "image" ? value : null;
}

export function normalizeProjectImportKind(
  value: unknown,
  fallback: LabProjectImportKind = "video"
) {
  return value === "audio" || value === "image" || value === "video" ? value : fallback;
}

export function normalizeProjectImportMethod(
  value: unknown,
  kind: LabProjectImportKind,
  fallback: LabProjectImportMethod = "local"
): LabProjectImportMethod {
  if (value === "youtube") {
    return kind === "video" ? "youtube" : fallback;
  }
  if (value === "url" || value === "local") {
    return value;
  }
  return fallback;
}

function normalizeYoutubeCaptureMode(value: unknown): LabSourceDrafts["youtubeCaptureMode"] {
  return value === "audio-only" || value === "video-only" ? value : "video+audio";
}

export function normalizeSourceDraftPatch(
  patch: Partial<LabSourceDrafts>,
  current: LabSourceDrafts
): LabSourceDrafts {
  return {
    ...current,
    ...patch,
    youtubeCustom:
      patch.youtubeCustom !== undefined
        ? {
            ...asLabRecord(current.youtubeCustom),
            ...asLabRecord(patch.youtubeCustom),
          }
        : asLabRecord(current.youtubeCustom),
    youtubeCaptureMode:
      patch.youtubeCaptureMode !== undefined
        ? normalizeYoutubeCaptureMode(patch.youtubeCaptureMode)
        : normalizeYoutubeCaptureMode(current.youtubeCaptureMode),
  };
}

export function normalizeProjectImportState(
  value: unknown,
  current: LabProjectImportUiState = createDefaultProjectImportState()
): LabProjectImportUiState {
  const record = asLabRecord(value);
  const activeKind = normalizeProjectImportKind(record["activeKind"], current.activeKind);
  const methodsRecord = asLabRecord(record["methods"]);
  const draftsRecord = asLabRecord(record["drafts"]);
  const nextMethods: LabProjectImportUiState["methods"] = { ...current.methods };
  const nextDrafts: LabProjectImportUiState["drafts"] = {
    video: cloneSourceDrafts(current.drafts.video),
    audio: cloneSourceDrafts(current.drafts.audio),
    image: cloneSourceDrafts(current.drafts.image),
  };
  (["video", "audio", "image"] as LabProjectImportKind[]).forEach(function (kind) {
    nextMethods[kind] = normalizeProjectImportMethod(methodsRecord[kind], kind, nextMethods[kind]);
    nextDrafts[kind] = normalizeSourceDraftPatch(
      asLabRecord(draftsRecord[kind]) as Partial<LabSourceDrafts>,
      nextDrafts[kind]
    );
  });
  const reviewFocus = record["reviewFocus"];
  const urlCheckRecord = asLabRecord(record["urlCheck"]);
  const urlCheckStatus = asNonEmptyString(urlCheckRecord["status"]);
  return {
    activeKind,
    methods: nextMethods,
    drafts: nextDrafts,
    urlCheck: {
      status:
        urlCheckStatus === "checking" || urlCheckStatus === "ready" || urlCheckStatus === "error"
          ? urlCheckStatus
          : "idle",
      url: asNonEmptyString(urlCheckRecord["url"]),
      isYoutube:
        typeof urlCheckRecord["isYoutube"] === "boolean" ? urlCheckRecord["isYoutube"] : null,
      kind: normalizeProjectImportUrlCheckKind(urlCheckRecord["kind"]),
      error: asNonEmptyString(urlCheckRecord["error"]),
    },
    reviewFocus:
      reviewFocus === "draft" || reviewFocus === "running" || reviewFocus === "completed"
        ? reviewFocus
        : "idle",
    lastAction: asNonEmptyString(record["lastAction"]),
    lastRequestId: asNonEmptyString(record["lastRequestId"]),
  };
}
