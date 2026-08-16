type LaboratoryRecord = Record<string, unknown>;

type AnalysisArtifactRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  asNumber: (value: unknown) => number | null;
  callRoomTools: (payload: LaboratoryRecord) => Promise<LaboratoryRecord>;
  getProjectProfileDir: (
    runtime: { paths: { projectsDir: string } },
    project: { slug: string }
  ) => string;
  getProjectProfilePreflightDir: (
    runtime: { paths: { projectsDir: string } },
    project: { slug: string }
  ) => string;
  normalizeProcessArtifact: (rawValue: unknown) => LaboratoryRecord;
  normalizeProcessFinding: (rawValue: unknown) => LaboratoryRecord;
  normalizeProfileArtifact: (rawValue: unknown) => LaboratoryRecord;
  normalizeProfileSignal: (rawValue: unknown) => LaboratoryRecord;
  readTextFile: (filePath: string) => Promise<string>;
  roomId: string;
  toRecord: (value: unknown) => LaboratoryRecord;
  transcribeManagedAudioFile: (payload: LaboratoryRecord) => Promise<LaboratoryRecord>;
  writeJsonFile: (filePath: string, value: unknown) => Promise<void>;
};

type RunProfileToolOptions = {
  requestId?: string | null;
  jobId?: string | null;
  toolId: string;
  executableName?: string;
  cwd: string;
  args: string[];
  timeoutMs: number;
  roomId?: string;
};

type TranscriptSampleOptions = {
  language?: string | null;
  modelPolicy?: string | null;
  sampleSeconds: number;
};

type ProcessMediaInputScope = {
  args: string[];
  inputTimeScope: LaboratoryRecord | null;
};

export function createLaboratoryAnalysisArtifactRuntime(deps: AnalysisArtifactRuntimeDeps) {
  const {
    asNonEmptyString,
    asNumber,
    callRoomTools,
    getProjectProfileDir,
    getProjectProfilePreflightDir,
    normalizeProcessArtifact,
    normalizeProcessFinding,
    normalizeProfileArtifact,
    normalizeProfileSignal,
    readTextFile,
    roomId,
    toRecord,
    transcribeManagedAudioFile,
    writeJsonFile,
  } = deps;

  function cloneValue(value: unknown): LaboratoryRecord {
    return toRecord(JSON.parse(JSON.stringify(value)) as unknown);
  }

  function toUnknownArray(value: unknown): unknown[] {
    return Array.isArray(value)
      ? value.map(function (entry): unknown {
          return entry;
        })
      : [];
  }

  function createProfileArtifact(kind: string, path: unknown, label: string, metadata: unknown) {
    const normalizedPath = asNonEmptyString(path);
    if (normalizedPath === null) {
      return null;
    }

    return normalizeProfileArtifact({
      id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: kind,
      path: normalizedPath,
      fileName: normalizedPath.split(/[\\/]/).pop() || normalizedPath,
      label: label,
      createdAt: new Date().toISOString(),
      metadata: toRecord(metadata),
    });
  }

  function normalizeTranscriptSampleOptions(value: unknown): TranscriptSampleOptions {
    if (typeof value === "number") {
      return {
        sampleSeconds: Math.max(5, Math.round(value)),
      };
    }
    const record = toRecord(value);
    return {
      language: asNonEmptyString(record["language"]),
      modelPolicy: asNonEmptyString(record["modelPolicy"]),
      sampleSeconds: Math.max(5, Math.round(asNumber(record["sampleSeconds"]) || 45)),
    };
  }

  function selectTranscriptModelRecord(
    models: LaboratoryRecord[],
    modelPolicy: string | null | undefined
  ) {
    const readyModels = models.filter(function (entry) {
      return entry["ready"] === true && asNonEmptyString(entry["modelId"]) !== null;
    });
    if (modelPolicy === "fastest") {
      return (
        readyModels.slice().sort(function (left, right) {
          return (asNumber(left["sizeBytes"]) || 0) - (asNumber(right["sizeBytes"]) || 0);
        })[0] || null
      );
    }
    if (modelPolicy === "best-ready") {
      return (
        readyModels.slice().sort(function (left, right) {
          return (asNumber(right["sizeBytes"]) || 0) - (asNumber(left["sizeBytes"]) || 0);
        })[0] || null
      );
    }
    return (
      readyModels.find(function (entry) {
        return entry["selected"] === true;
      }) || null
    );
  }

  function createProfileSignal(
    laneId: string,
    kind: string,
    level: string,
    confidence: string,
    title: string,
    detail: string,
    evidenceCount: number,
    artifactIds: unknown
  ) {
    return normalizeProfileSignal({
      id: `${laneId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      laneId: laneId,
      kind: kind,
      level: level,
      confidence: confidence,
      title: title,
      detail: detail,
      evidenceCount: evidenceCount,
      artifactIds: Array.isArray(artifactIds) ? artifactIds : [],
    });
  }

  function createProcessArtifact(
    moduleId: string,
    kind: string,
    path: unknown,
    label: string,
    metadata: unknown
  ) {
    const artifact = createProfileArtifact(kind, path, label, metadata);
    if (artifact === null) {
      return null;
    }

    return normalizeProcessArtifact({
      ...artifact,
      moduleId: moduleId,
    });
  }

  function createProcessFinding(
    moduleId: string,
    kind: string,
    level: string,
    confidence: string,
    title: string,
    detail: string,
    evidenceCount: number,
    artifactIds: unknown
  ) {
    return normalizeProcessFinding({
      ...createProfileSignal(
        moduleId,
        kind,
        level,
        confidence,
        title,
        detail,
        evidenceCount,
        artifactIds
      ),
      moduleId: moduleId,
    });
  }

  function formatTimeoutMs(timeoutMs: number) {
    if (timeoutMs >= 60_000) {
      return `${Math.round(timeoutMs / 60_000)}m`;
    }
    return `${Math.round(timeoutMs / 1000)}s`;
  }

  function trimToolOutput(value: string) {
    return value.length <= 1200 ? value : value.slice(-1200);
  }

  function readFiniteNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const numericValue = asNumber(value) ?? Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function formatFfmpegSeconds(value: number) {
    return (
      Math.max(0, value)
        .toFixed(3)
        .replace(/\.?0+$/, "") || "0"
    );
  }

  function readTargetDurationSeconds(target: LaboratoryRecord): number | null {
    const metadata = toRecord(target["metadata"]);
    const durationSeconds =
      readFiniteNumber(metadata["durationSeconds"]) ?? readFiniteNumber(target["durationSeconds"]);
    return durationSeconds !== null && durationSeconds > 0 ? durationSeconds : null;
  }

  function isStillImageTarget(target: LaboratoryRecord) {
    const metadata = toRecord(target["metadata"]);
    const sourceKind =
      asNonEmptyString(target["sourceKind"]) ||
      asNonEmptyString(metadata["sourceKind"]) ||
      asNonEmptyString(metadata["kind"]);
    const targetType = asNonEmptyString(target["type"]);
    const mimeType = asNonEmptyString(target["mimeType"]) || asNonEmptyString(metadata["mimeType"]);
    return (
      sourceKind === "image" ||
      targetType === "image" ||
      targetType === "frame" ||
      mimeType?.startsWith("image/") === true
    );
  }

  function resolveProjectAnalysisTimeScope(project: LaboratoryRecord, target: LaboratoryRecord) {
    if (isStillImageTarget(target)) {
      return null;
    }

    const analysisScope = toRecord(toRecord(project["workbench"])["analysisScope"]);
    const timeRange = toRecord(analysisScope["timeRange"]);
    const startMs = readFiniteNumber(timeRange["startMs"]);
    const endMs = readFiniteNumber(timeRange["endMs"]);
    if (startMs === null || endMs === null || endMs <= startMs) {
      return null;
    }

    const targetDurationSeconds = readTargetDurationSeconds(target);
    const unclampedStartSeconds = Math.max(0, startMs / 1000);
    const unclampedEndSeconds = Math.max(unclampedStartSeconds, endMs / 1000);
    const startSeconds =
      targetDurationSeconds === null
        ? unclampedStartSeconds
        : Math.min(unclampedStartSeconds, targetDurationSeconds);
    const endSeconds =
      targetDurationSeconds === null
        ? unclampedEndSeconds
        : Math.min(unclampedEndSeconds, targetDurationSeconds);
    if (endSeconds <= startSeconds) {
      return null;
    }

    return {
      durationSeconds: endSeconds - startSeconds,
      endSeconds,
      startSeconds,
      timeRange: {
        startMs: Math.round(startSeconds * 1000),
        endMs: Math.round(endSeconds * 1000),
      },
    };
  }

  function buildProcessScopedInputArgs(
    project: LaboratoryRecord,
    target: LaboratoryRecord
  ): ProcessMediaInputScope {
    const targetPath = target["path"] as string;
    const timeScope = resolveProjectAnalysisTimeScope(project, target);
    if (timeScope === null) {
      return {
        args: ["-i", targetPath],
        inputTimeScope: null,
      };
    }

    return {
      args: [
        "-ss",
        formatFfmpegSeconds(timeScope.startSeconds),
        "-t",
        formatFfmpegSeconds(timeScope.durationSeconds),
        "-i",
        targetPath,
      ],
      inputTimeScope: timeScope,
    };
  }

  async function runProfileTool(_runtime: unknown, options: RunProfileToolOptions) {
    const runResult = await callRoomTools({
      operation: "tool-run",
      roomId: options.roomId || roomId,
      requestId: options.requestId || null,
      jobId: options.jobId || null,
      toolId: options.toolId,
      executableName: options.executableName || undefined,
      cwd: options.cwd,
      args: options.args,
      timeoutMs: options.timeoutMs,
    });
    const runPayload = toRecord(runResult["run"]);
    const exitCode = typeof runPayload["exitCode"] === "number" ? runPayload["exitCode"] : 0;
    if (runPayload["cancelled"] === true) {
      const stderr = asNonEmptyString(runPayload["stderr"]);
      throw new Error(
        `${options.toolId} job was cancelled or timed out after ${formatTimeoutMs(options.timeoutMs)}.${
          stderr ? ` Last output:\n${trimToolOutput(stderr)}` : ""
        }`
      );
    }
    if (exitCode !== 0) {
      throw new Error(asNonEmptyString(runPayload["stderr"]) || `${options.toolId} job failed.`);
    }
    return runPayload;
  }

  async function generateProfileMetadataArtifact(
    runtime: { paths: { projectsDir: string } },
    project: LaboratoryRecord,
    target: LaboratoryRecord,
    artifactBase: string
  ) {
    const metadataPath = `${getProjectProfilePreflightDir(runtime, project as { slug: string })}/${artifactBase}-metadata.json`;
    await writeJsonFile(metadataPath, {
      generatedAt: new Date().toISOString(),
      target: {
        requestedMode: target["requestedMode"],
        mode: target["mode"],
        outputId: target["outputId"],
        label: target["label"],
        fileName: target["fileName"],
        mimeType: target["mimeType"],
        path: target["path"],
        signature: target["signature"],
      },
      metadata: cloneValue(target["metadata"] || {}),
    });
    return createProfileArtifact("metadata", metadataPath, "Metadata Snapshot", {
      requestedMode: target["requestedMode"],
      mode: target["mode"],
    });
  }

  async function generateProfileFrameStrip(
    runtime: { paths: { projectsDir: string } },
    project: LaboratoryRecord,
    requestId: string | null,
    jobId: string | null,
    target: LaboratoryRecord,
    artifactBase: string,
    sampleWindowSeconds: number,
    tileCount: unknown
  ) {
    const sourceKind =
      asNonEmptyString((project["source"] as LaboratoryRecord | undefined)?.["kind"]) || "video";
    const outputPath = `${getProjectProfilePreflightDir(runtime, project as { slug: string })}/${artifactBase}-frames.png`;

    if (sourceKind === "image") {
      await runProfileTool(runtime, {
        requestId: requestId,
        jobId: jobId,
        toolId: "ffmpeg",
        cwd: getProjectProfileDir(runtime, project as { slug: string }),
        args: [
          "-y",
          "-i",
          target["path"] as string,
          "-vf",
          "scale=1280:-1:flags=lanczos",
          "-frames:v",
          "1",
          outputPath,
        ],
        timeoutMs: 90_000,
      });
      return createProfileArtifact("frame-strip", outputPath, "Profile Reference Frame", {});
    }

    const normalizedTileCount = Math.max(2, Math.round(asNumber(tileCount) || 4));
    const intervalSeconds = Math.max(
      1,
      Math.round((sampleWindowSeconds || 40) / normalizedTileCount)
    );
    await runProfileTool(runtime, {
      requestId: requestId,
      jobId: jobId,
      toolId: "ffmpeg",
      cwd: getProjectProfileDir(runtime, project as { slug: string }),
      args: [
        "-y",
        "-i",
        target["path"] as string,
        "-vf",
        `fps=1/${intervalSeconds},scale=420:-1:flags=lanczos,tile=${normalizedTileCount}x1`,
        "-frames:v",
        "1",
        outputPath,
      ],
      timeoutMs: 90_000,
    });
    return createProfileArtifact("frame-strip", outputPath, "Frame Strip", {
      tileCount: normalizedTileCount,
      intervalSeconds: intervalSeconds,
    });
  }

  async function generateProfileSpectrogram(
    runtime: { paths: { projectsDir: string } },
    project: LaboratoryRecord,
    requestId: string | null,
    jobId: string | null,
    target: LaboratoryRecord,
    artifactBase: string
  ) {
    const outputPath = `${getProjectProfilePreflightDir(runtime, project as { slug: string })}/${artifactBase}-spectrogram.png`;
    await runProfileTool(runtime, {
      requestId: requestId,
      jobId: jobId,
      toolId: "ffmpeg",
      cwd: getProjectProfileDir(runtime, project as { slug: string }),
      args: [
        "-y",
        "-i",
        target["path"] as string,
        "-lavfi",
        "showspectrumpic=s=1600x440:legend=0",
        "-frames:v",
        "1",
        outputPath,
      ],
      timeoutMs: 90_000,
    });
    return createProfileArtifact("spectrogram", outputPath, "Spectrogram", {});
  }

  async function maybeRunTranscriptProfileSample(
    runtime: { paths: { projectsDir: string } },
    project: LaboratoryRecord,
    requestId: string | null,
    jobId: string | null,
    target: LaboratoryRecord,
    artifactBase: string,
    transcriptSampleSeconds: unknown
  ) {
    const sampleOptions = normalizeTranscriptSampleOptions(transcriptSampleSeconds);
    const profileReadiness = toRecord(toRecord(project["profile"])["readiness"]);
    const selectedModelRecord = selectTranscriptModelRecord(
      toUnknownArray(profileReadiness["models"]).map(toRecord),
      sampleOptions.modelPolicy
    );
    if (selectedModelRecord === null) {
      return null;
    }

    const modelId = asNonEmptyString(selectedModelRecord["modelId"]);
    if (modelId === null) {
      return null;
    }

    const requestedLanguage = asNonEmptyString(sampleOptions.language);
    const selectedLanguage =
      requestedLanguage !== null && requestedLanguage !== "auto"
        ? requestedLanguage
        : asNonEmptyString(selectedModelRecord["language"]) || "en";
    const languageOverride =
      selectedLanguage === "multilingual" || selectedLanguage === "auto" ? null : selectedLanguage;
    const sampleWavPath = `${getProjectProfilePreflightDir(runtime, project as { slug: string })}/${artifactBase}-speech.wav`;
    const transcriptBase = `${getProjectProfilePreflightDir(runtime, project as { slug: string })}/${artifactBase}-transcript`;
    const transcriptPath = `${transcriptBase}.txt`;

    await runProfileTool(runtime, {
      requestId: requestId,
      jobId: jobId,
      toolId: "ffmpeg",
      cwd: getProjectProfileDir(runtime, project as { slug: string }),
      args: [
        "-y",
        "-i",
        target["path"] as string,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-t",
        String(sampleOptions.sampleSeconds),
        sampleWavPath,
      ],
      timeoutMs: 120_000,
    });
    const transcriptResult = toRecord(
      await transcribeManagedAudioFile({
        audioPath: sampleWavPath,
        metadata: {
          artifactBase,
          featureStage: "profile",
          jobId,
          sampleSeconds: sampleOptions.sampleSeconds,
          settingsUsed: sampleOptions,
          requestId,
        },
        ...(languageOverride ? { language: languageOverride } : {}),
        modelId,
        outputBasePath: transcriptBase,
        roomId,
        source: "synthetic-test",
      })
    );
    if (transcriptResult["success"] !== true) {
      throw new Error(asNonEmptyString(transcriptResult["error"]) || "Transcript sample failed.");
    }

    const transcriptText =
      asNonEmptyString(transcriptResult["text"]) ||
      asNonEmptyString(await readTextFile(transcriptPath));
    if (transcriptText === null) {
      return null;
    }

    const artifact = createProfileArtifact("transcript", transcriptPath, "Transcript Sample", {
      wordCount: transcriptText.split(/\s+/).filter(Boolean).length,
      language: languageOverride || "app-default",
      modelPolicy: sampleOptions.modelPolicy || "selected",
      sampleSeconds: sampleOptions.sampleSeconds,
    });

    return {
      text: transcriptText,
      artifact: artifact,
    };
  }

  function buildSyntheticProfileSignal(
    signals: unknown[],
    sensitivity: number,
    artifactIds: unknown
  ) {
    const score = signals.reduce<number>(function (total, entry) {
      const signal = toRecord(entry);
      const level = asNonEmptyString(signal["level"]) || "low";
      return total + (level === "high" ? 3 : level === "medium" ? 2 : 1);
    }, 0);
    const threshold = sensitivity >= 0.68 ? 4 : sensitivity >= 0.5 ? 5 : 6;
    if (score < threshold) {
      return null;
    }

    const level = score >= threshold + 3 ? "high" : "medium";
    const confidence = score >= threshold + 2 ? "medium" : "low";
    return createProfileSignal(
      "synthetic-suspicion",
      "derived",
      level,
      confidence,
      "Composite suspicion score elevated",
      "Multiple weak structure, continuity, or audio anomalies overlap in the sampled profile pass.",
      signals.length,
      artifactIds
    );
  }

  async function generateProcessMetadataArtifact(
    _runtime: unknown,
    _project: unknown,
    target: LaboratoryRecord,
    artifactBase: string,
    outputDir: string,
    moduleId: string
  ) {
    const metadataPath = `${outputDir}/${artifactBase}-metadata.json`;
    await writeJsonFile(metadataPath, {
      generatedAt: new Date().toISOString(),
      target: cloneValue(target),
      metadata: cloneValue(target["metadata"] || {}),
    });
    return createProcessArtifact(moduleId, "metadata", metadataPath, "Metadata Snapshot", {
      mode: target["mode"],
    });
  }

  async function generateProcessFramePreviewArtifact(
    runtime: { paths: { projectsDir: string } },
    project: LaboratoryRecord,
    requestId: string | null,
    jobId: string | null,
    target: LaboratoryRecord,
    artifactBase: string,
    outputDir: string,
    moduleId: string,
    sampleWindowSeconds: number,
    tileCount: unknown,
    label: string = "Frame Preview",
    filterGraph: string | null = null
  ) {
    const sourceKind =
      asNonEmptyString((project["source"] as LaboratoryRecord | undefined)?.["kind"]) || "video";
    const outputPath = `${outputDir}/${artifactBase}-frames.png`;

    if (sourceKind === "image") {
      await runProfileTool(runtime, {
        requestId,
        jobId,
        toolId: "ffmpeg",
        cwd: getProjectProfileDir(runtime, project as { slug: string }),
        args: [
          "-y",
          "-i",
          target["path"] as string,
          "-vf",
          [filterGraph, "scale=1280:-1:flags=lanczos"]
            .filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
            .join(","),
          "-frames:v",
          "1",
          outputPath,
        ],
        timeoutMs: 90_000,
      });
      return createProcessArtifact(moduleId, "frame-preview", outputPath, label, {
        filterGraph,
        sourceKind,
      });
    }

    const scopedInput = buildProcessScopedInputArgs(project, target);
    const normalizedTileCount = Math.max(2, Math.round(asNumber(tileCount) || 4));
    const scopedDurationSeconds = readFiniteNumber(
      toRecord(scopedInput.inputTimeScope)["durationSeconds"]
    );
    const intervalSeconds =
      scopedDurationSeconds === null
        ? Math.max(1, Math.round((sampleWindowSeconds || 40) / normalizedTileCount))
        : Math.max(0.1, scopedDurationSeconds / normalizedTileCount);
    await runProfileTool(runtime, {
      requestId,
      jobId,
      toolId: "ffmpeg",
      cwd: getProjectProfileDir(runtime, project as { slug: string }),
      args: [
        "-y",
        ...scopedInput.args,
        "-vf",
        [
          `fps=1/${formatFfmpegSeconds(intervalSeconds)}`,
          filterGraph,
          "scale=420:-1:flags=lanczos",
          `tile=${normalizedTileCount}x1`,
        ]
          .filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
          .join(","),
        "-frames:v",
        "1",
        outputPath,
      ],
      timeoutMs: 90_000,
    });
    return createProcessArtifact(moduleId, "frame-preview", outputPath, label, {
      sourceKind,
      filterGraph,
      tileCount: normalizedTileCount,
      intervalSeconds,
      inputTimeScope: scopedInput.inputTimeScope,
    });
  }

  async function generateProcessVisualTransformArtifact(
    runtime: { paths: { projectsDir: string } },
    project: LaboratoryRecord,
    requestId: string | null,
    jobId: string | null,
    target: LaboratoryRecord,
    artifactBase: string,
    outputDir: string,
    moduleId: string,
    filterGraph: string,
    label: string,
    metadata: LaboratoryRecord = {}
  ) {
    const outputPath = `${outputDir}/${artifactBase}-transform.png`;
    const scopedInput = buildProcessScopedInputArgs(project, target);
    await runProfileTool(runtime, {
      requestId,
      jobId,
      toolId: "ffmpeg",
      cwd: getProjectProfileDir(runtime, project as { slug: string }),
      args: [
        "-y",
        ...scopedInput.args,
        "-vf",
        `${filterGraph},scale=1280:-1:flags=lanczos`,
        "-frames:v",
        "1",
        outputPath,
      ],
      timeoutMs: 90_000,
    });
    return createProcessArtifact(moduleId, "transform-preview", outputPath, label, {
      ...metadata,
      filterGraph,
      inputTimeScope: scopedInput.inputTimeScope,
    });
  }

  async function generateProcessImageComparisonArtifact(
    runtime: { paths: { projectsDir: string } },
    project: LaboratoryRecord,
    requestId: string | null,
    jobId: string | null,
    primaryTarget: LaboratoryRecord,
    referenceTarget: LaboratoryRecord,
    artifactBase: string,
    outputDir: string,
    comparisonKind: "side-by-side" | "difference",
    label: string,
    metadata: LaboratoryRecord = {}
  ) {
    const outputPath = `${outputDir}/${artifactBase}-${comparisonKind}.png`;
    const filterGraph =
      comparisonKind === "difference"
        ? "[0:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[a];[1:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[b];[a][b]blend=all_mode=difference,eq=contrast=1.5:brightness=0.02[out]"
        : "[0:v]scale=640:720:force_original_aspect_ratio=decrease,pad=640:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[left];[1:v]scale=640:720:force_original_aspect_ratio=decrease,pad=640:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[right];[left][right]hstack=inputs=2[out]";
    await runProfileTool(runtime, {
      requestId,
      jobId,
      toolId: "ffmpeg",
      cwd: getProjectProfileDir(runtime, project as { slug: string }),
      args: [
        "-y",
        "-i",
        primaryTarget["path"] as string,
        "-i",
        referenceTarget["path"] as string,
        "-filter_complex",
        filterGraph,
        "-map",
        "[out]",
        "-frames:v",
        "1",
        outputPath,
      ],
      timeoutMs: 90_000,
    });
    return createProcessArtifact(
      "image-comparison",
      comparisonKind === "difference" ? "comparison-difference" : "comparison-side-by-side",
      outputPath,
      label,
      {
        ...metadata,
        comparisonKind,
        filterGraph,
      }
    );
  }

  function getFindingSeverityRank(level: unknown) {
    const nextLevel = asNonEmptyString(level) || "low";
    return nextLevel === "high" ? 3 : nextLevel === "medium" ? 2 : 1;
  }

  function formatIdentifierLabel(value: unknown) {
    const token = asNonEmptyString(value) || "item";
    return token
      .split(/[-_]/)
      .filter(Boolean)
      .map(function (segment: string) {
        return segment.charAt(0).toUpperCase() + segment.slice(1);
      })
      .join(" ");
  }

  return {
    buildSyntheticProfileSignal,
    createProcessArtifact,
    createProcessFinding,
    createProfileArtifact,
    createProfileSignal,
    formatIdentifierLabel,
    generateProcessFramePreviewArtifact,
    generateProcessImageComparisonArtifact,
    generateProcessMetadataArtifact,
    generateProcessVisualTransformArtifact,
    generateProfileFrameStrip,
    generateProfileMetadataArtifact,
    generateProfileSpectrogram,
    getFindingSeverityRank,
    maybeRunTranscriptProfileSample,
    runProfileTool,
  };
}
