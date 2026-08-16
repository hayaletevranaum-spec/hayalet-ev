type LaboratoryAudioProcessTarget = Record<string, unknown>;

type LaboratoryAudioAnalysisProcessRuntime = {
  getModuleProcessDir: (
    runtime: unknown,
    project: unknown,
    moduleId: string
  ) => string | null | undefined;
  getModuleRunner: (moduleId: string) => unknown;
  generateProcessSpectrogram: (
    runtime: unknown,
    project: unknown,
    requestId: string,
    jobId: string,
    target: LaboratoryAudioProcessTarget,
    artifactBase: string,
    outputDir: string,
    moduleId: string
  ) => Promise<unknown>;
};

type LaboratoryAudioProcessDelegatesRuntimeDeps = {
  audioAnalysisProcessRuntime: LaboratoryAudioAnalysisProcessRuntime;
};

export function createLaboratoryAudioProcessDelegatesRuntime(
  deps: LaboratoryAudioProcessDelegatesRuntimeDeps
) {
  const { audioAnalysisProcessRuntime } = deps;

  return {
    generateProcessSpectrogram: audioAnalysisProcessRuntime.generateProcessSpectrogram,
    getAudioAnalysisModuleProcessDir: audioAnalysisProcessRuntime.getModuleProcessDir,
    getAudioAnalysisModuleRunner: audioAnalysisProcessRuntime.getModuleRunner,
  };
}
