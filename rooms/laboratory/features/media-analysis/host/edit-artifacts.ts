type LaboratoryRecord = Record<string, unknown>;

type LaboratoryMediaEditArtifactRuntime = LaboratoryRecord;

type LaboratoryProjectRecord = LaboratoryRecord & {
  edit?: unknown;
  source?: unknown;
};

type LaboratoryProjectEditRecord = LaboratoryRecord & {
  recipe?: unknown;
};

type LaboratoryProjectEditRecipeRecord = LaboratoryRecord & {
  audio?: unknown;
  video?: unknown;
};

type LaboratoryProjectSourceRecord = LaboratoryRecord & {
  kind?: unknown;
  metadata?: unknown;
};

type LaboratoryAudioEditRecipeRecord = LaboratoryRecord & {
  spectrogram?: unknown;
};

type LaboratoryVideoEditRecipeRecord = LaboratoryRecord & {
  frameGrabCount?: unknown;
};

type LaboratoryDirectoryEntry = {
  isDirectory?: boolean;
  name?: string;
  path?: string;
};

type LaboratoryArtifactOptions = LaboratoryRecord & {
  baseName?: unknown;
  jobId?: unknown;
  metadata?: unknown;
  mode?: unknown;
  outputPath?: unknown;
  requestId?: unknown;
};

type LaboratoryArtifactEntry = {
  fileName: string;
  kind: string;
  path: string;
};

type MediaEditArtifactRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  asNumber: (value: unknown) => number | null;
  callRoomTools: (payload: LaboratoryRecord) => Promise<unknown>;
  clampNumber: (value: unknown, min: number, max: number, fallback: number) => number;
  getProjectEditDir: (
    runtime: LaboratoryMediaEditArtifactRuntime,
    project: LaboratoryProjectRecord
  ) => string;
  getProjectEditOutputDir: (
    runtime: LaboratoryMediaEditArtifactRuntime,
    project: LaboratoryProjectRecord
  ) => string;
  getProjectEditPreviewDir: (
    runtime: LaboratoryMediaEditArtifactRuntime,
    project: LaboratoryProjectRecord
  ) => string;
  listDirectory: (dirPath: string) => Promise<LaboratoryDirectoryEntry[]>;
  roomId: string;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createMediaEditArtifactRuntime(deps: MediaEditArtifactRuntimeDeps) {
  const {
    asNonEmptyString,
    asNumber,
    callRoomTools,
    clampNumber,
    getProjectEditDir,
    getProjectEditOutputDir,
    getProjectEditPreviewDir,
    listDirectory,
    roomId,
    toRecord,
  } = deps;

  function toProjectEditRecord(value: unknown): LaboratoryProjectEditRecord {
    return toRecord(value);
  }

  function toProjectEditRecipeRecord(value: unknown): LaboratoryProjectEditRecipeRecord {
    return toRecord(value);
  }

  function toProjectSourceRecord(value: unknown): LaboratoryProjectSourceRecord {
    return toRecord(value);
  }

  function toAudioEditRecipeRecord(value: unknown): LaboratoryAudioEditRecipeRecord {
    return toRecord(value);
  }

  function toVideoEditRecipeRecord(value: unknown): LaboratoryVideoEditRecipeRecord {
    return toRecord(value);
  }

  function toArtifactOptionsRecord(value: unknown): LaboratoryArtifactOptions {
    return toRecord(value);
  }

  function isArtifactEntry(
    entry: LaboratoryArtifactEntry | null
  ): entry is LaboratoryArtifactEntry {
    return entry !== null;
  }

  function buildArtifactEntry(filePath: unknown, kind: string): LaboratoryArtifactEntry | null {
    const normalizedPath = asNonEmptyString(filePath);
    if (normalizedPath === null) {
      return null;
    }
    return {
      kind: kind,
      path: normalizedPath,
      fileName: normalizedPath.split(/[\\/]/).pop() || normalizedPath,
    };
  }

  async function listArtifactsWithPrefix(dirPath: string, filePrefix: string) {
    const entries = await listDirectory(dirPath);
    return entries
      .filter(function (entry) {
        return entry.isDirectory !== true && String(entry.name || "").startsWith(filePrefix);
      })
      .map(function (entry) {
        return typeof entry.path === "string" ? entry.path : "";
      })
      .filter(Boolean)
      .sort();
  }

  async function buildAuxiliaryArtifacts(
    runtime: LaboratoryMediaEditArtifactRuntime,
    project: LaboratoryProjectRecord,
    options: LaboratoryArtifactOptions
  ) {
    const artifactOptions = toArtifactOptionsRecord(options);
    const projectSource = toProjectSourceRecord(project.source);
    const projectEdit = toProjectEditRecord(project.edit);
    const recipe = toProjectEditRecipeRecord(projectEdit.recipe);
    const artifactDir =
      artifactOptions.mode === "preview"
        ? getProjectEditPreviewDir(runtime, project)
        : getProjectEditOutputDir(runtime, project);

    if (projectSource.kind === "audio") {
      if (toAudioEditRecipeRecord(recipe.audio).spectrogram !== true) {
        return [];
      }
      const artifactBase = asNonEmptyString(artifactOptions.baseName) || "artifact";
      const spectrogramPath = `${artifactDir}/${artifactBase}-spectrogram.png`;

      await callRoomTools({
        operation: "tool-run",
        roomId: roomId,
        requestId: artifactOptions.requestId || null,
        jobId: artifactOptions.jobId || null,
        toolId: "ffmpeg",
        cwd: getProjectEditDir(runtime, project),
        args: [
          "-y",
          "-i",
          String(artifactOptions.outputPath || ""),
          "-lavfi",
          "showspectrumpic=s=1600x480:legend=0",
          "-frames:v",
          "1",
          spectrogramPath,
        ],
        timeoutMs: 60_000,
      });

      return [buildArtifactEntry(spectrogramPath, "spectrogram")].filter(isArtifactEntry);
    }

    if (projectSource.kind === "video" && artifactOptions.mode === "apply") {
      const frameGrabCount = clampNumber(
        toVideoEditRecipeRecord(recipe.video).frameGrabCount,
        0,
        24,
        0
      );
      const durationSeconds =
        asNumber(toArtifactOptionsRecord(artifactOptions.metadata)["durationSeconds"]) ||
        asNumber(toRecord(projectSource.metadata)["durationSeconds"]);
      if (frameGrabCount > 0 && durationSeconds && durationSeconds > 0) {
        const artifactBase = asNonEmptyString(artifactOptions.baseName) || "artifact";
        const framePattern = `${artifactDir}/${artifactBase}-frame-%03d.jpg`;
        const fpsValue = Math.max(0.2, frameGrabCount / durationSeconds);

        await callRoomTools({
          operation: "tool-run",
          roomId: roomId,
          requestId: artifactOptions.requestId || null,
          jobId: artifactOptions.jobId || null,
          toolId: "ffmpeg",
          cwd: getProjectEditDir(runtime, project),
          args: [
            "-y",
            "-i",
            String(artifactOptions.outputPath || ""),
            "-vf",
            `fps=${fpsValue}`,
            "-frames:v",
            String(frameGrabCount),
            framePattern,
          ],
          timeoutMs: 60_000,
        });

        const createdFrames = await listArtifactsWithPrefix(artifactDir, `${artifactBase}-frame-`);
        return createdFrames
          .map(function (filePath) {
            return buildArtifactEntry(filePath, "frame");
          })
          .filter(isArtifactEntry);
      }
    }

    return [];
  }

  return {
    buildAuxiliaryArtifacts,
  };
}
