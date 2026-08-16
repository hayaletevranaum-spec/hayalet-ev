type LaboratoryProjectConfigRuntime = {
  audioAnalysisCapabilities: unknown;
  audioAnalysisCatalog: unknown;
  audioAnalysisPresets: unknown;
  audioAnalysisProviders: unknown;
  editCapabilities: unknown;
  editPresets: unknown;
  packageToolsDir: string | null;
  profileCapabilities: unknown;
  profileModels: unknown;
  profilePresets: unknown;
  projectSchema: unknown;
  sourcePresets: unknown;
  toolchainManifest: unknown;
  visualAnalysisCapabilities: unknown;
  visualAnalysisCatalog: unknown;
  visualAnalysisProviders: unknown;
  ytDlpForm: unknown;
};

type LaboratoryProjectConfigLoaderDeps = {
  readJsonFile: (filePath: string) => Promise<unknown>;
};

type LaboratoryRoomApi = {
  room: {
    installedDir: string;
  };
};

export function createLaboratoryProjectConfigLoader(deps: LaboratoryProjectConfigLoaderDeps) {
  const { readJsonFile } = deps;

  async function loadRuntimeConfigs(
    api: LaboratoryRoomApi,
    runtime: LaboratoryProjectConfigRuntime
  ): Promise<void> {
    const baseDir = `${api.room.installedDir}/tools`;
    const [
      sourcePresets,
      projectSchema,
      ytDlpForm,
      toolchainManifest,
      editPresets,
      editCapabilities,
      profilePresets,
      profileCapabilities,
      visualAnalysisCatalog,
      visualAnalysisCapabilities,
      visualAnalysisProviders,
      audioAnalysisCatalog,
      audioAnalysisCapabilities,
      audioAnalysisPresets,
      audioAnalysisProviders,
    ] = await Promise.all([
      readJsonFile(`${baseDir}/source-presets.json`),
      readJsonFile(`${baseDir}/project-schema.json`),
      readJsonFile(`${baseDir}/yt-dlp.form.json`),
      readJsonFile(`${baseDir}/toolchain.manifest.json`),
      readJsonFile(`${baseDir}/edit-presets.json`),
      readJsonFile(`${baseDir}/edit-capabilities.json`),
      readJsonFile(`${baseDir}/profile-presets.json`),
      readJsonFile(`${baseDir}/profile-capabilities.json`),
      readJsonFile(`${baseDir}/visual-analysis-catalog.json`),
      readJsonFile(`${baseDir}/visual-analysis-capabilities.json`),
      readJsonFile(`${baseDir}/visual-analysis-providers.json`),
      readJsonFile(`${baseDir}/audio-analysis-catalog.json`),
      readJsonFile(`${baseDir}/audio-analysis-capabilities.json`),
      readJsonFile(`${baseDir}/audio-analysis-presets.json`),
      readJsonFile(`${baseDir}/audio-analysis-providers.json`),
    ]);

    runtime.packageToolsDir = baseDir;
    runtime.toolchainManifest = toolchainManifest || {};
    runtime.sourcePresets = sourcePresets || {};
    runtime.projectSchema = projectSchema || {};
    runtime.ytDlpForm = ytDlpForm || {};
    runtime.editPresets = editPresets || {};
    runtime.editCapabilities = editCapabilities || {};
    runtime.profilePresets = profilePresets || {};
    runtime.profileCapabilities = profileCapabilities || {};
    runtime.profileModels = {};
    runtime.visualAnalysisCatalog = visualAnalysisCatalog || {};
    runtime.visualAnalysisCapabilities = visualAnalysisCapabilities || {};
    runtime.visualAnalysisProviders = visualAnalysisProviders || {};
    runtime.audioAnalysisCatalog = audioAnalysisCatalog || {};
    runtime.audioAnalysisCapabilities = audioAnalysisCapabilities || {};
    runtime.audioAnalysisPresets = audioAnalysisPresets || {};
    runtime.audioAnalysisProviders = audioAnalysisProviders || {};
  }

  return {
    loadRuntimeConfigs,
  };
}
