function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

const MEDIA_FEATURE_ID = "media-analysis";
const AUDIO_FEATURE_ID = "audio-analysis";

export function getProjectDir(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string {
  return `${runtime.paths.projectsDir}/${project.slug}`;
}

export function getProjectMetaPath(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string {
  return `${getProjectDir(runtime, project)}/project.json`;
}

export function getProjectSourceDir(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string {
  return `${getProjectDir(runtime, project)}/sources`;
}

export function getProjectArtifactsDir(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string {
  return `${getProjectDir(runtime, project)}/artifacts`;
}

export function getProjectFeatureArtifactDir(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string },
  featureId: string
): string {
  return `${getProjectArtifactsDir(runtime, project)}/${asNonEmptyString(featureId) || MEDIA_FEATURE_ID}`;
}

export function getProjectFeatureStageDir(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string },
  featureId: string,
  stageId: string
): string {
  return `${getProjectFeatureArtifactDir(runtime, project, featureId)}/${stageId}`;
}

export function getProjectEditDir(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string {
  return getProjectFeatureStageDir(runtime, project, MEDIA_FEATURE_ID, "edit");
}

export function getProjectEditPreviewDir(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string {
  return `${getProjectEditDir(runtime, project)}/preview`;
}

export function getProjectEditOutputDir(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string {
  return `${getProjectEditDir(runtime, project)}/output`;
}

export function getProjectEditManifestPath(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string {
  return `${getProjectEditDir(runtime, project)}/manifest.json`;
}

export function getProjectProfileDir(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string {
  return getProjectFeatureStageDir(runtime, project, MEDIA_FEATURE_ID, "profile");
}

export function getProjectProfilePreflightDir(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string {
  return `${getProjectProfileDir(runtime, project)}/preflight`;
}

export function getProjectProfileManifestPath(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string {
  return `${getProjectProfileDir(runtime, project)}/manifest.json`;
}

export function getProjectFeatureProcessDir(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string },
  featureId: string
): string {
  return getProjectFeatureStageDir(runtime, project, featureId, "process");
}

export function getProjectProcessDir(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string {
  return getProjectFeatureProcessDir(runtime, project, MEDIA_FEATURE_ID);
}

export function getProjectFeatureProcessManifestPath(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string },
  featureId: string
): string {
  return `${getProjectFeatureProcessDir(runtime, project, featureId)}/manifest.json`;
}

export function getProjectProcessManifestPath(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string {
  return getProjectFeatureProcessManifestPath(runtime, project, MEDIA_FEATURE_ID);
}

export function getProjectFeatureReportDir(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string },
  featureId: string
): string {
  return `${getProjectDir(runtime, project)}/reports/${asNonEmptyString(featureId) || MEDIA_FEATURE_ID}`;
}

export function getProjectReportDir(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string {
  return getProjectFeatureReportDir(runtime, project, MEDIA_FEATURE_ID);
}

export function getProjectFeatureReportManifestPath(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string },
  featureId: string
): string {
  return `${getProjectFeatureReportDir(runtime, project, featureId)}/manifest.json`;
}

export function getProjectReportManifestPath(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string {
  return getProjectFeatureReportManifestPath(runtime, project, MEDIA_FEATURE_ID);
}

export function getProjectDirectoryList(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string[] {
  return [
    getProjectDir(runtime, project),
    getProjectSourceDir(runtime, project),
    getProjectArtifactsDir(runtime, project),
    getProjectFeatureArtifactDir(runtime, project, MEDIA_FEATURE_ID),
    getProjectEditDir(runtime, project),
    getProjectEditPreviewDir(runtime, project),
    getProjectEditOutputDir(runtime, project),
    getProjectProfileDir(runtime, project),
    getProjectProfilePreflightDir(runtime, project),
    getProjectProcessDir(runtime, project),
    getProjectReportDir(runtime, project),
    getProjectFeatureArtifactDir(runtime, project, AUDIO_FEATURE_ID),
    getAudioAnalysisProcessRootDir(runtime, project),
    getProjectFeatureReportDir(runtime, project, AUDIO_FEATURE_ID),
  ];
}

export function getProjectDirectoryFallbackMarkerList(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string[] {
  return [
    getProjectSourceDir(runtime, project),
    getProjectArtifactsDir(runtime, project),
    getProjectFeatureArtifactDir(runtime, project, MEDIA_FEATURE_ID),
    getProjectEditPreviewDir(runtime, project),
    getProjectEditOutputDir(runtime, project),
    getProjectProfilePreflightDir(runtime, project),
    getProjectProcessDir(runtime, project),
    getProjectFeatureArtifactDir(runtime, project, AUDIO_FEATURE_ID),
    getAudioAnalysisProcessRootDir(runtime, project),
    getProjectReportDir(runtime, project),
    getProjectFeatureReportDir(runtime, project, AUDIO_FEATURE_ID),
  ];
}

export function getRoomPackageToolsDir(runtime: { packageToolsDir: unknown }): string | null {
  return asNonEmptyString(runtime.packageToolsDir);
}

export function getAudioAnalysisOpenSmileConfigDir(runtime: {
  packageToolsDir: unknown;
}): string | null {
  const packageToolsDir = getRoomPackageToolsDir(runtime);
  return packageToolsDir !== null ? `${packageToolsDir}/opensmile` : null;
}

export function getAudioAnalysisOpenSmileConfigPath(
  runtime: { packageToolsDir: unknown },
  relativePath: string
): string | null {
  const configDir = getAudioAnalysisOpenSmileConfigDir(runtime);
  return configDir !== null ? `${configDir}/${relativePath}` : null;
}

export function getAudioAnalysisYamnetDir(runtime: { packageToolsDir: unknown }): string | null {
  const packageToolsDir = getRoomPackageToolsDir(runtime);
  return packageToolsDir !== null ? `${packageToolsDir}/yamnet` : null;
}

export function getAudioAnalysisYamnetScriptPath(runtime: {
  packageToolsDir: unknown;
}): string | null {
  const yamnetDir = getAudioAnalysisYamnetDir(runtime);
  return yamnetDir !== null ? `${yamnetDir}/yamnet_infer.py` : null;
}

export function getAudioAnalysisDiarizationDir(runtime: {
  packageToolsDir: unknown;
}): string | null {
  const packageToolsDir = getRoomPackageToolsDir(runtime);
  return packageToolsDir !== null ? `${packageToolsDir}/diarization` : null;
}

export function getAudioAnalysisDiarizationScriptPath(runtime: {
  packageToolsDir: unknown;
}): string | null {
  const diarizationDir = getAudioAnalysisDiarizationDir(runtime);
  return diarizationDir !== null ? `${diarizationDir}/pyaudioanalysis_diarize.py` : null;
}

export function getAudioAnalysisMusicDir(runtime: { packageToolsDir: unknown }): string | null {
  const packageToolsDir = getRoomPackageToolsDir(runtime);
  return packageToolsDir !== null ? `${packageToolsDir}/music` : null;
}

export function getAudioAnalysisMusicScriptPath(runtime: {
  packageToolsDir: unknown;
}): string | null {
  const musicDir = getAudioAnalysisMusicDir(runtime);
  return musicDir !== null ? `${musicDir}/librosa_music_analysis.py` : null;
}

export function getAudioAnalysisProcessRootDir(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string }
): string {
  return getProjectFeatureProcessDir(runtime, project, AUDIO_FEATURE_ID);
}

export function getAudioAnalysisModuleProcessDir(
  runtime: { paths: { projectsDir: string } },
  project: { slug: string },
  moduleId: string,
  sanitizeFileSegment: (value: unknown, fallback: string) => string
): string {
  return `${getAudioAnalysisProcessRootDir(runtime, project)}/${sanitizeFileSegment(moduleId, "audio-module")}`;
}
