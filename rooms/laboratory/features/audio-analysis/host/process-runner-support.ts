import { getAudioAnalysisProcessRootDir } from "../../../shared/host/project-paths.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryRuntimeRecord = LaboratoryRecord & {
  paths?: unknown;
};

type LaboratoryProjectRecord = LaboratoryRecord & {
  slug?: unknown;
};

type LaboratoryProcessTargetRecord = LaboratoryRecord & {
  path?: unknown;
};

type LaboratoryProcessArtifactRecord = LaboratoryRecord;
type AudioAnalysisProcessRootRuntime = Parameters<typeof getAudioAnalysisProcessRootDir>[0];
type AudioAnalysisProcessRootProject = Parameters<typeof getAudioAnalysisProcessRootDir>[1];

type LaboratoryProfileToolRequest = {
  requestId: string;
  jobId: string;
  toolId: string;
  cwd: string;
  args: string[];
  timeoutMs: number;
};

type AudioAnalysisProcessRunnerSupportDeps = {
  clone: (value: unknown) => unknown;
  createProcessArtifact: (
    moduleId: string,
    artifactKind: string,
    filePath: string,
    label: string,
    metadata: LaboratoryRecord
  ) => LaboratoryProcessArtifactRecord;
  ensureRuntimeDirectory: (path: string, requestId: string | null) => Promise<unknown>;
  parseAspectralStatsText: (rawText: unknown) => LaboratoryRecord;
  readTextFile: (path: string) => Promise<string>;
  runProfileTool: (
    runtime: LaboratoryRuntimeRecord,
    request: LaboratoryProfileToolRequest
  ) => Promise<unknown>;
  sanitizeFileSegment: (value: string, fallback: string) => string;
  writeJsonFile: (path: string, content: LaboratoryRecord) => Promise<unknown>;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function requireTargetPath(target: LaboratoryProcessTargetRecord): string {
  const targetPath = asNonEmptyString(target.path);
  if (targetPath === null) {
    throw new Error("Audio analysis target path is required before generating process artifacts.");
  }
  return targetPath;
}

export function createAudioAnalysisProcessRunnerSupport(
  deps: AudioAnalysisProcessRunnerSupportDeps
) {
  const {
    clone,
    createProcessArtifact,
    ensureRuntimeDirectory,
    parseAspectralStatsText,
    readTextFile,
    runProfileTool,
    sanitizeFileSegment,
    writeJsonFile,
  } = deps;

  function getProcessRootDir(
    runtime: LaboratoryRuntimeRecord,
    project: LaboratoryProjectRecord
  ): string {
    return getAudioAnalysisProcessRootDir(
      runtime as unknown as AudioAnalysisProcessRootRuntime,
      project as unknown as AudioAnalysisProcessRootProject
    );
  }

  function getModuleProcessDir(
    runtime: LaboratoryRuntimeRecord,
    project: LaboratoryProjectRecord,
    moduleId: string
  ) {
    const processRootDir = getProcessRootDir(runtime, project);
    return `${processRootDir}/${sanitizeFileSegment(moduleId, "audio-module")}`;
  }

  async function generateProcessSpectrogram(
    runtime: LaboratoryRuntimeRecord,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryProcessTargetRecord,
    artifactBase: string,
    outputDir: string,
    moduleId: string
  ) {
    return generateProcessSpectrogramFromInputPath(
      runtime,
      project,
      requestId,
      jobId,
      requireTargetPath(target),
      artifactBase,
      outputDir,
      moduleId,
      "Spectrogram"
    );
  }

  async function generateProcessSpectrogramFromInputPath(
    runtime: LaboratoryRuntimeRecord,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    inputPath: string,
    artifactBase: string,
    outputDir: string,
    moduleId: string,
    label: string,
    metadata: LaboratoryRecord = {}
  ) {
    const processRootDir = getProcessRootDir(runtime, project);
    const outputPath = `${outputDir}/${artifactBase}-spectrogram.png`;
    await runProfileTool(runtime, {
      requestId,
      jobId,
      toolId: "ffmpeg",
      cwd: processRootDir,
      args: [
        "-y",
        "-i",
        inputPath,
        "-lavfi",
        "showspectrumpic=s=1600x440:legend=0",
        "-frames:v",
        "1",
        outputPath,
      ],
      timeoutMs: 90_000,
    });
    return createProcessArtifact(moduleId, "spectrogram", outputPath, label, metadata);
  }

  async function generateProcessWaveform(
    runtime: LaboratoryRuntimeRecord,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryProcessTargetRecord,
    artifactBase: string,
    outputDir: string,
    moduleId: string
  ) {
    const processRootDir = getProcessRootDir(runtime, project);
    const targetPath = requireTargetPath(target);
    const outputPath = `${outputDir}/${artifactBase}-waveform.png`;
    await runProfileTool(runtime, {
      requestId,
      jobId,
      toolId: "ffmpeg",
      cwd: processRootDir,
      args: [
        "-y",
        "-i",
        targetPath,
        "-filter_complex",
        "showwavespic=s=1600x440:split_channels=0",
        "-frames:v",
        "1",
        outputPath,
      ],
      timeoutMs: 90_000,
    });
    return createProcessArtifact(moduleId, "waveform", outputPath, "Waveform", {});
  }

  async function generateSpectralDescriptorArtifact(
    runtime: LaboratoryRuntimeRecord,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryProcessTargetRecord,
    artifactBase: string,
    outputDir: string,
    moduleId: string
  ) {
    const processRootDir = getProcessRootDir(runtime, project);
    const targetPath = requireTargetPath(target);
    const textPath = `${outputDir}/${artifactBase}-spectral.txt`;
    const jsonPath = `${outputDir}/${artifactBase}-spectral.json`;
    await runProfileTool(runtime, {
      requestId,
      jobId,
      toolId: "ffmpeg",
      cwd: processRootDir,
      args: [
        "-y",
        "-i",
        targetPath,
        "-af",
        `aspectralstats=measure=centroid+rolloff+flatness+flux,ametadata=mode=print:file=${textPath}:direct=1`,
        "-f",
        "null",
        "-",
      ],
      timeoutMs: 90_000,
    });

    const descriptorSummary = parseAspectralStatsText(await readTextFile(textPath));
    await writeJsonFile(jsonPath, {
      generatedAt: new Date().toISOString(),
      target: clone(target),
      descriptorSummary: descriptorSummary,
    });
    return createProcessArtifact(
      moduleId,
      "spectral-descriptors",
      jsonPath,
      "Spectral Descriptor Summary",
      {
        descriptorSummary: descriptorSummary,
      }
    );
  }

  async function generateFilteredAudioArtifact(
    runtime: LaboratoryRuntimeRecord,
    project: LaboratoryProjectRecord,
    requestId: string,
    jobId: string,
    target: LaboratoryProcessTargetRecord,
    artifactBase: string,
    outputDir: string,
    moduleId: string,
    filterGraph: string,
    label: string,
    metadata: LaboratoryRecord,
    outputExtension: string = "wav"
  ) {
    const processRootDir = getProcessRootDir(runtime, project);
    const targetPath = requireTargetPath(target);
    const safeExtension =
      asNonEmptyString(outputExtension)
        ?.replace(/[^a-z0-9]/gi, "")
        .toLowerCase() || "wav";
    const outputPath = `${outputDir}/${artifactBase}.${safeExtension}`;
    await runProfileTool(runtime, {
      requestId,
      jobId,
      toolId: "ffmpeg",
      cwd: processRootDir,
      args: ["-y", "-i", targetPath, "-af", filterGraph, outputPath],
      timeoutMs: 120_000,
    });
    return createProcessArtifact(moduleId, "filtered-audio", outputPath, label, {
      ...metadata,
      filterGraph,
    });
  }

  return {
    ensureProcessRuntimeDirectories(
      runtime: LaboratoryRuntimeRecord,
      project: LaboratoryProjectRecord,
      requestId: string,
      moduleOutputDir: string
    ) {
      return Promise.all([
        ensureRuntimeDirectory(getProcessRootDir(runtime, project), requestId),
        ensureRuntimeDirectory(moduleOutputDir, requestId),
      ]);
    },
    generateProcessSpectrogram: generateProcessSpectrogram,
    generateProcessSpectrogramFromInputPath: generateProcessSpectrogramFromInputPath,
    generateProcessWaveform: generateProcessWaveform,
    generateSpectralDescriptorArtifact: generateSpectralDescriptorArtifact,
    generateFilteredAudioArtifact: generateFilteredAudioArtifact,
    getModuleProcessDir: getModuleProcessDir,
  };
}
