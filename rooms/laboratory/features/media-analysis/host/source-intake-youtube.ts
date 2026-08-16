import { resetLaboratoryWorkbenchForSourceActivation } from "../../../shared/host/runtime-primitives.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryMediaYoutubeRuntime = LaboratoryRecord & {
  sourcePresets?: unknown;
  toolState?: unknown;
};

type LaboratoryProjectRecord = LaboratoryRecord & {
  id?: unknown;
  source?: unknown;
  workbench?: unknown;
};

type LaboratoryProjectSourceRecord = LaboratoryRecord & {
  drafts?: unknown;
  kind?: unknown;
};

type LaboratorySourceDraftsRecord = LaboratoryRecord & {
  youtubeCaptureMode?: unknown;
  youtubeCustom?: unknown;
  youtubePreset?: unknown;
  youtubeUrl?: unknown;
};

type LaboratoryToolRecord = LaboratoryRecord & {
  binaryPath?: unknown;
  installed?: unknown;
};

type LaboratoryToolStateRecord = {
  ffmpeg: LaboratoryToolRecord;
  sourcePresets: LaboratoryRecord;
};

type LaboratoryPreparedSource = {
  metadata: unknown;
  metadataError: string | null;
  mimeType: string | null;
  storedFileName: string | null;
  storedPath: string | null;
};

type LaboratoryYoutubeSettings = {
  presetId: string;
  values: LaboratoryRecord;
};

type LaboratoryYoutubeFormatRecord = LaboratoryRecord & {
  formatId: string;
  kind: "video" | "audio" | "muxed";
  label: string;
};

const SINGLE_YOUTUBE_VIDEO_URL_ERROR = "Only a single YouTube video URL is supported.";

type LaboratoryMediaYoutubeSourceIntakeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  callRoomTools: (payload: LaboratoryRecord) => Promise<unknown>;
  cancelJobsForProject: (
    runtime: LaboratoryMediaYoutubeRuntime,
    projectId: string,
    requestId: string
  ) => Promise<unknown>;
  clearJob: (runtime: LaboratoryMediaYoutubeRuntime, jobId: string) => void;
  getActiveProject: (runtime: LaboratoryMediaYoutubeRuntime) => LaboratoryProjectRecord | null;
  getPresetDefaultCustomValues: (sourcePresets: unknown, presetId: string) => LaboratoryRecord;
  getProjectSourceDir: (
    runtime: LaboratoryMediaYoutubeRuntime,
    project: LaboratoryProjectRecord
  ) => string;
  normalizeMimeType: (fileName: unknown, kind: string) => string;
  patchActiveProject: (
    runtime: LaboratoryMediaYoutubeRuntime,
    updater: (project: LaboratoryProjectRecord) => LaboratoryProjectRecord
  ) => Promise<unknown>;
  pushJobState: (api: unknown, payload: LaboratoryRecord) => void;
  registerJob: (runtime: LaboratoryMediaYoutubeRuntime, payload: LaboratoryRecord) => void;
  resetEditForCurrentSource: (
    runtime: LaboratoryMediaYoutubeRuntime,
    project: LaboratoryProjectRecord
  ) => void;
  resetProfileForCurrentSource: (
    runtime: LaboratoryMediaYoutubeRuntime,
    project: LaboratoryProjectRecord,
    reason: string
  ) => void;
  resolvePreparedSource: (
    runtime: LaboratoryMediaYoutubeRuntime,
    project: LaboratoryProjectRecord,
    options: LaboratoryRecord
  ) => Promise<LaboratoryPreparedSource>;
  roomId: string;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createMediaYoutubeSourceIntakeRuntime(
  deps: LaboratoryMediaYoutubeSourceIntakeDeps
) {
  const {
    asNonEmptyString,
    callRoomTools,
    cancelJobsForProject,
    clearJob,
    getActiveProject,
    getPresetDefaultCustomValues,
    getProjectSourceDir,
    normalizeMimeType,
    patchActiveProject,
    pushJobState,
    registerJob,
    resetEditForCurrentSource,
    resetProfileForCurrentSource,
    resolvePreparedSource,
    roomId,
    toRecord,
  } = deps;

  function toProjectSourceRecord(value: unknown): LaboratoryProjectSourceRecord {
    return toRecord(value);
  }

  function toSourceDraftsRecord(value: unknown): LaboratorySourceDraftsRecord {
    return toRecord(value);
  }

  function toToolRecord(value: unknown): LaboratoryToolRecord {
    return toRecord(value);
  }

  function toString(value: unknown): string | null {
    return typeof value === "string" && value.trim() !== "" ? value : null;
  }

  function toNumber(value: unknown): number | null {
    const numeric = typeof value === "number" ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function getProjectId(project: LaboratoryProjectRecord): string {
    return toString(project.id) || "unknown-project";
  }

  function getProjectSource(project: LaboratoryProjectRecord): LaboratoryProjectSourceRecord {
    return toProjectSourceRecord(project.source);
  }

  function getSourceDrafts(project: LaboratoryProjectRecord): LaboratorySourceDraftsRecord {
    return toSourceDraftsRecord(getProjectSource(project).drafts);
  }

  function getToolMap(
    runtime: LaboratoryMediaYoutubeRuntime
  ): Record<string, LaboratoryToolRecord> {
    return toRecord(toRecord(runtime.toolState)["tools"]) as Record<string, LaboratoryToolRecord>;
  }

  function getYoutubeToolState(runtime: LaboratoryMediaYoutubeRuntime): LaboratoryToolRecord {
    return toToolRecord(getToolMap(runtime)["yt-dlp"]);
  }

  function getFfmpegToolState(runtime: LaboratoryMediaYoutubeRuntime): LaboratoryToolRecord {
    return toToolRecord(getToolMap(runtime)["ffmpeg"]);
  }

  function getResolvedYoutubeSettings(
    project: LaboratoryProjectRecord,
    sourcePresets: unknown
  ): LaboratoryYoutubeSettings {
    const drafts = getSourceDrafts(project);
    const presetId = asNonEmptyString(drafts["youtubePreset"]) || "medium";
    const presetDefaults = getPresetDefaultCustomValues(sourcePresets, presetId);
    if (presetId === "custom") {
      return {
        presetId: presetId,
        values: {
          ...presetDefaults,
          ...toRecord(drafts["youtubeCustom"]),
        },
      };
    }
    return {
      presetId: presetId,
      values: presetDefaults,
    };
  }

  function findYtDlpFinalPath(stdoutValue: unknown) {
    const lines = String(stdoutValue || "")
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (!line) {
        continue;
      }
      if (/^[A-Za-z]:\\/.test(line) || line.startsWith("/")) {
        return line;
      }
    }

    return null;
  }

  function parseYtDlpJson(stdoutValue: unknown): LaboratoryRecord {
    const stdout = String(stdoutValue || "").trim();
    const startIndex = stdout.indexOf("{");
    const endIndex = stdout.lastIndexOf("}");
    if (startIndex < 0 || endIndex <= startIndex) {
      throw new Error("yt-dlp did not return video metadata.");
    }
    return toRecord(JSON.parse(stdout.slice(startIndex, endIndex + 1)));
  }

  function isSingleYoutubeVideoUrl(value: string) {
    try {
      const parsedUrl = new URL(value);
      const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
      const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
      if (parsedUrl.searchParams.has("list")) {
        return false;
      }
      if (host === "youtu.be") {
        return pathParts.length === 1 && pathParts[0] !== "";
      }
      if (host !== "youtube.com" && host !== "m.youtube.com" && host !== "youtube-nocookie.com") {
        return false;
      }
      if (parsedUrl.pathname === "/watch") {
        return asNonEmptyString(parsedUrl.searchParams.get("v")) !== null;
      }
      const route = pathParts[0] || "";
      return (
        (route === "shorts" || route === "embed" || route === "live") &&
        pathParts.length === 2 &&
        pathParts[1] !== ""
      );
    } catch {
      return false;
    }
  }

  function assertSingleYoutubeVideoUrl(url: string) {
    if (isSingleYoutubeVideoUrl(url) !== true) {
      throw new Error(SINGLE_YOUTUBE_VIDEO_URL_ERROR);
    }
  }

  function assertSingleYoutubeVideoMetadata(metadata: LaboratoryRecord) {
    const metadataType = asNonEmptyString(metadata["_type"]);
    if (
      metadataType === "playlist" ||
      metadataType === "multi_video" ||
      Array.isArray(metadata["entries"])
    ) {
      throw new Error(SINGLE_YOUTUBE_VIDEO_URL_ERROR);
    }
  }

  function getBestThumbnail(metadata: LaboratoryRecord) {
    const directThumbnail = asNonEmptyString(metadata["thumbnail"]);
    if (directThumbnail !== null) {
      return directThumbnail;
    }
    const thumbnails = Array.isArray(metadata["thumbnails"]) ? metadata["thumbnails"] : [];
    for (let index = thumbnails.length - 1; index >= 0; index -= 1) {
      const url = asNonEmptyString(toRecord(thumbnails[index])["url"]);
      if (url !== null) {
        return url;
      }
    }
    return null;
  }

  function getYoutubeFormatKind(format: LaboratoryRecord) {
    const videoCodec = asNonEmptyString(format["vcodec"]);
    const audioCodec = asNonEmptyString(format["acodec"]);
    const hasVideo = videoCodec !== null && videoCodec !== "none";
    const hasAudio = audioCodec !== null && audioCodec !== "none";
    if (hasVideo && hasAudio) {
      return "muxed";
    }
    if (hasVideo) {
      return "video";
    }
    if (hasAudio) {
      return "audio";
    }
    return "unknown";
  }

  function formatYoutubeFormatLabel(format: LaboratoryRecord, kind: string, formatId: string) {
    const parts = [
      asNonEmptyString(format["format_note"]),
      asNonEmptyString(format["resolution"]),
      asNonEmptyString(format["ext"])?.toUpperCase() || null,
      toNumber(format["fps"]) !== null ? `${Math.round(toNumber(format["fps"]) || 0)} fps` : null,
      toNumber(format["tbr"]) !== null ? `${Math.round(toNumber(format["tbr"]) || 0)} kbps` : null,
    ].filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "");
    const prefix = kind === "audio" ? "Audio" : kind === "video" ? "Video" : "Muxed";
    return `${prefix} ${formatId}${parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}`;
  }

  function normalizeYoutubeFormat(formatValue: unknown): LaboratoryYoutubeFormatRecord | null {
    const format = toRecord(formatValue);
    const formatId = asNonEmptyString(format["format_id"]);
    if (formatId === null) {
      return null;
    }
    const kind = getYoutubeFormatKind(format);
    if (kind === "unknown") {
      return null;
    }
    return {
      formatId,
      label: formatYoutubeFormatLabel(format, kind, formatId),
      kind,
      extension: asNonEmptyString(format["ext"]),
      resolution: asNonEmptyString(format["resolution"]),
      fps: toNumber(format["fps"]),
      videoCodec: asNonEmptyString(format["vcodec"]),
      audioCodec: asNonEmptyString(format["acodec"]),
      bitrateKbps: toNumber(format["tbr"]),
      filesizeBytes: toNumber(format["filesize"]),
      filesizeApproxBytes: toNumber(format["filesize_approx"]),
      note: asNonEmptyString(format["format_note"]),
    };
  }

  function normalizeYoutubeFormats(metadata: LaboratoryRecord) {
    const formats = Array.isArray(metadata["formats"]) ? metadata["formats"] : [];
    return formats
      .map(normalizeYoutubeFormat)
      .filter((format): format is LaboratoryYoutubeFormatRecord => format !== null)
      .sort(function (left, right) {
        const kindWeight = { video: 0, muxed: 1, audio: 2, unknown: 3 } as Record<string, number>;
        const leftKind = kindWeight[String(left["kind"])] ?? 3;
        const rightKind = kindWeight[String(right["kind"])] ?? 3;
        if (leftKind !== rightKind) {
          return leftKind - rightKind;
        }
        return (Number(right["bitrateKbps"]) || 0) - (Number(left["bitrateKbps"]) || 0);
      })
      .slice(0, 120);
  }

  function chooseDefaultYoutubeFormats(formats: LaboratoryYoutubeFormatRecord[]) {
    const videoFormat =
      formats.find((format) => format["kind"] === "video") ||
      formats.find((format) => format["kind"] === "muxed") ||
      null;
    const audioFormat = formats.find((format) => format["kind"] === "audio") || null;
    return {
      selectedVideoFormatId: asNonEmptyString(videoFormat?.["formatId"]),
      selectedAudioFormatId: asNonEmptyString(audioFormat?.["formatId"]),
    };
  }

  async function handleYoutubeProbe(
    _api: unknown,
    runtime: LaboratoryMediaYoutubeRuntime,
    requestId: string,
    url: string
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("Active project is missing.");
    }
    const ytDlpState = getYoutubeToolState(runtime);
    if (ytDlpState.installed !== true) {
      throw new Error("yt-dlp is not installed.");
    }
    assertSingleYoutubeVideoUrl(url);
    const sourceDir = getProjectSourceDir(runtime, project);
    const runResult = await callRoomTools({
      args: ["--dump-single-json", "--skip-download", "--no-playlist", url],
      cwd: sourceDir,
      jobId: `room-youtube-probe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      operation: "tool-run",
      requestId,
      roomId,
      timeoutMs: 90 * 1000,
      toolId: "yt-dlp",
    });
    const runPayload = toRecord(toRecord(runResult)["run"]);
    const metadata = parseYtDlpJson(runPayload["stdout"]);
    assertSingleYoutubeVideoMetadata(metadata);
    const formats = normalizeYoutubeFormats(metadata);
    const defaults = chooseDefaultYoutubeFormats(formats);
    return {
      url,
      isYoutube: true,
      kind: "video",
      preview: {
        title: asNonEmptyString(metadata["title"]) || "YouTube video",
        duration: toNumber(metadata["duration"]),
        thumbnail: getBestThumbnail(metadata),
        uploader: asNonEmptyString(metadata["uploader"]) || asNonEmptyString(metadata["channel"]),
        webpageUrl: asNonEmptyString(metadata["webpage_url"]) || url,
      },
      formats,
      ...defaults,
    };
  }

  function buildYtDlpArgs(
    project: LaboratoryProjectRecord,
    toolState: LaboratoryToolStateRecord,
    sourceDir: string
  ) {
    const settings = getResolvedYoutubeSettings(project, toolState.sourcePresets);
    const values = settings.values;
    const drafts = getSourceDrafts(project);
    const youtubeUrl = asNonEmptyString(drafts["youtubeUrl"]);
    const captureMode = asNonEmptyString(drafts["youtubeCaptureMode"]) || "video+audio";
    const isAudioOnly = captureMode === "audio-only";
    const isVideoOnly = captureMode === "video-only";
    const args = [
      "--newline",
      "--progress",
      "--print",
      "after_move:filepath",
      "-o",
      `${sourceDir}/%(title).120B-%(id)s.%(ext)s`,
    ];

    if (isAudioOnly) {
      const formatValue = asNonEmptyString(values["format"]);
      if (formatValue) {
        args.push("-f", formatValue);
      }
      args.push("-x");
      const audioFormat = asNonEmptyString(values["audioFormat"]);
      if (audioFormat && audioFormat !== "none") {
        args.push("--audio-format", audioFormat);
      } else {
        args.push("--audio-format", "best");
      }
      const audioQuality = asNonEmptyString(values["audioQuality"]);
      if (audioQuality && audioQuality !== "best") {
        args.push("--audio-quality", audioQuality);
      }
    } else if (isVideoOnly) {
      const formatValue = asNonEmptyString(values["format"]) || "bestvideo";
      args.push("-f", formatValue);
      const mergeOutputFormat = asNonEmptyString(values["mergeOutputFormat"]);
      if (mergeOutputFormat && mergeOutputFormat !== "auto") {
        args.push("--merge-output-format", mergeOutputFormat);
      }
      const recodeVideo = asNonEmptyString(values["recodeVideo"]);
      if (recodeVideo && recodeVideo !== "none") {
        args.push("--recode-video", recodeVideo);
      }
    } else {
      let formatValue = asNonEmptyString(values["format"]) || "bestvideo*+bestaudio/best";
      if (formatValue.indexOf("+") >= 0 && toolState.ffmpeg.installed !== true) {
        formatValue = "best";
      }

      args.push("-f", formatValue);

      const mergeOutputFormat = asNonEmptyString(values["mergeOutputFormat"]);
      if (mergeOutputFormat && mergeOutputFormat !== "auto") {
        args.push("--merge-output-format", mergeOutputFormat);
      }

      const recodeVideo = asNonEmptyString(values["recodeVideo"]);
      if (recodeVideo && recodeVideo !== "none") {
        args.push("--recode-video", recodeVideo);
      }

      const audioFormat = asNonEmptyString(values["audioFormat"]);
      if (audioFormat && audioFormat !== "none") {
        args.push("-x", "--audio-format", audioFormat);
        const audioQuality = asNonEmptyString(values["audioQuality"]);
        if (audioQuality && audioQuality !== "best") {
          args.push("--audio-quality", audioQuality);
        }
      }
    }

    args.push("--no-playlist");

    const limitRate = asNonEmptyString(values["limitRate"]);
    if (limitRate) {
      args.push("--limit-rate", limitRate);
    }

    const retries = Number(values["retries"]);
    if (Number.isFinite(retries) && retries > 0) {
      args.push("--retries", String(retries));
    }

    if (
      toolState.ffmpeg.installed === true &&
      typeof toolState.ffmpeg.binaryPath === "string" &&
      toolState.ffmpeg.binaryPath.trim() !== ""
    ) {
      const binaryPath = toolState.ffmpeg.binaryPath.replace(/\\/g, "/");
      const separatorIndex = binaryPath.lastIndexOf("/");
      const ffmpegDir = separatorIndex >= 0 ? binaryPath.slice(0, separatorIndex) : binaryPath;
      args.push("--ffmpeg-location", ffmpegDir);
    }

    if (youtubeUrl !== null) {
      assertSingleYoutubeVideoUrl(youtubeUrl);
      args.push(youtubeUrl);
    }
    return args;
  }

  async function handleYoutubeDownload(
    api: unknown,
    runtime: LaboratoryMediaYoutubeRuntime,
    requestId: string
  ) {
    const project = getActiveProject(runtime);
    if (project === null) {
      throw new Error("Active project is missing.");
    }

    const projectId = getProjectId(project);
    const ytDlpState = getYoutubeToolState(runtime);
    if (ytDlpState.installed !== true) {
      throw new Error("yt-dlp is not installed.");
    }

    const source = getProjectSource(project);
    const drafts = toSourceDraftsRecord(source.drafts);
    const youtubeUrl = asNonEmptyString(drafts.youtubeUrl);
    if (youtubeUrl === null) {
      throw new Error("YouTube URL is empty.");
    }
    assertSingleYoutubeVideoUrl(youtubeUrl);
    const captureMode = asNonEmptyString(drafts.youtubeCaptureMode) || "video+audio";
    const draftKind = asNonEmptyString(drafts["kind"]);
    const derivedSourceKind =
      captureMode === "audio-only"
        ? "audio"
        : draftKind === "video" || draftKind === "audio" || draftKind === "image"
          ? draftKind
          : toString(source["kind"]) || "video";

    await cancelJobsForProject(runtime, projectId, requestId);

    const jobId = `room-youtube-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    registerJob(runtime, {
      action: "source-download-youtube",
      featureStage: "source",
      jobId: jobId,
      projectId: projectId,
      requestId: requestId,
      toolId: "yt-dlp",
    });

    pushJobState(api, {
      action: "source-download-youtube",
      featureStage: "source",
      jobId: jobId,
      projectId: projectId,
      requestId: requestId,
      percent: 0,
      phaseCount: 4,
      phaseIndex: 0,
      phaseLabel: "Hazırlık",
      phasePercent: null,
      stage: "queued",
      toolId: "yt-dlp",
    });

    try {
      const sourceDir = getProjectSourceDir(runtime, project);
      pushJobState(api, {
        action: "source-download-youtube",
        featureStage: "source",
        jobId: jobId,
        message: "Aşama: YouTube aktarımı hazırlanıyor",
        percent: 4,
        phaseCount: 4,
        phaseIndex: 0,
        phaseLabel: "Hazırlık",
        phasePercent: null,
        projectId: projectId,
        requestId: requestId,
        stage: "running",
        toolId: "yt-dlp",
      });
      const runResult = await callRoomTools({
        args: buildYtDlpArgs(
          project,
          {
            ffmpeg: getFfmpegToolState(runtime),
            sourcePresets: toRecord(runtime.sourcePresets),
          },
          sourceDir
        ),
        cwd: sourceDir,
        jobId: jobId,
        operation: "tool-run",
        requestId: requestId,
        roomId: roomId,
        timeoutMs: 45 * 60 * 1000,
        toolId: "yt-dlp",
      });

      const runPayload = toRecord(toRecord(runResult)["run"]);
      const storedPath = findYtDlpFinalPath(runPayload["stdout"]);
      const storedFileName = storedPath ? storedPath.split(/[\\/]/).pop() || null : null;
      if (!storedPath) {
        throw new Error("yt-dlp finished without a final output path.");
      }

      pushJobState(api, {
        action: "source-download-youtube",
        featureStage: "source",
        jobId: jobId,
        message: "Aşama: Dosya projeye kaydediliyor",
        percent: 97,
        phaseCount: 4,
        phaseIndex: 3,
        phaseLabel: "Dosya projeye kaydediliyor",
        phasePercent: null,
        projectId: projectId,
        requestId: requestId,
        stage: "running",
        toolId: "yt-dlp",
      });
      const preparedSource = await resolvePreparedSource(runtime, project, {
        jobId: jobId,
        mimeType: normalizeMimeType(storedFileName, derivedSourceKind),
        requestId: requestId,
        storedFileName: storedFileName,
        storedPath: storedPath,
      });

      await patchActiveProject(runtime, function (nextProject) {
        if (toString(nextProject.id) !== projectId) {
          return nextProject;
        }
        const nextSource = toProjectSourceRecord(nextProject.source);
        nextProject.source = nextSource;
        nextSource["kind"] = derivedSourceKind;
        nextSource["mode"] = "youtube";
        nextSource["status"] = "ready";
        nextSource["storedPath"] = preparedSource.storedPath;
        nextSource["storedFileName"] = preparedSource.storedFileName;
        nextSource["sourceUrl"] = youtubeUrl;
        nextSource["mimeType"] = preparedSource.mimeType;
        nextSource["routeLabel"] = "YouTube";
        nextSource["lastError"] = null;
        nextSource["metadata"] = preparedSource.metadata;
        nextSource["metadataError"] = preparedSource.metadataError;
        resetEditForCurrentSource(runtime, nextProject);
        resetProfileForCurrentSource(
          runtime,
          nextProject,
          "Source media changed; rerun the profile preflight."
        );
        nextProject["workbench"] = resetLaboratoryWorkbenchForSourceActivation(
          nextProject["workbench"]
        );
        return nextProject;
      });

      pushJobState(api, {
        action: "source-download-youtube",
        jobId: jobId,
        message: "Aşama: Kayıt tamamlandı",
        percent: 100,
        phaseCount: 4,
        phaseIndex: 3,
        phaseLabel: "Kayıt tamamlandı",
        phasePercent: 100,
        projectId: projectId,
        requestId: requestId,
        stage: "completed",
        toolId: "yt-dlp",
      });

      return {
        storedFileName: preparedSource.storedFileName,
        storedPath: preparedSource.storedPath,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await patchActiveProject(runtime, function (nextProject) {
        if (toString(nextProject.id) !== projectId) {
          return nextProject;
        }
        const nextSource = toProjectSourceRecord(nextProject.source);
        nextProject.source = nextSource;
        nextSource["status"] = "error";
        nextSource["lastError"] = errorMessage;
        return nextProject;
      });

      pushJobState(api, {
        action: "source-download-youtube",
        jobId: jobId,
        message: errorMessage,
        projectId: projectId,
        requestId: requestId,
        stage: "failed",
        toolId: "yt-dlp",
      });
      throw error;
    } finally {
      clearJob(runtime, jobId);
    }
  }

  return {
    buildYtDlpArgs,
    findYtDlpFinalPath,
    getResolvedYoutubeSettings,
    handleYoutubeDownload,
    handleYoutubeProbe,
  };
}
