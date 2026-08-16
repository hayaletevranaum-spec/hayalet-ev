type LaboratorySourceDelegatesRecord = Record<string, unknown>;

type LaboratorySourceIntakeRuntime = {
  handleLocalPick: (
    api: unknown,
    runtime: unknown,
    requestId: string,
    localFields?: unknown
  ) => Promise<unknown>;
  handleUrlDownload: (api: unknown, runtime: unknown, requestId: string) => Promise<unknown>;
  getResolvedYoutubeSettings: (
    project: LaboratorySourceDelegatesRecord,
    sourcePresets: LaboratorySourceDelegatesRecord
  ) => LaboratorySourceDelegatesRecord;
  findYtDlpFinalPath: (stdoutValue: string) => string | null;
  buildYtDlpArgs: (
    project: LaboratorySourceDelegatesRecord,
    toolState: LaboratorySourceDelegatesRecord,
    sourceDir: string
  ) => unknown[];
  handleYoutubeDownload: (api: unknown, runtime: unknown, requestId: string) => Promise<unknown>;
  handleYoutubeProbe: (
    api: unknown,
    runtime: unknown,
    requestId: string,
    url: string
  ) => Promise<unknown>;
};

type LaboratorySourceDelegatesRuntimeDeps = {
  mediaSourceIntakeRuntime: LaboratorySourceIntakeRuntime;
};

export function createLaboratorySourceDelegatesRuntime(deps: LaboratorySourceDelegatesRuntimeDeps) {
  const { mediaSourceIntakeRuntime } = deps;

  return {
    buildYtDlpArgs: mediaSourceIntakeRuntime.buildYtDlpArgs,
    findYtDlpFinalPath: mediaSourceIntakeRuntime.findYtDlpFinalPath,
    getResolvedYoutubeSettings: mediaSourceIntakeRuntime.getResolvedYoutubeSettings,
    handleLocalPick: mediaSourceIntakeRuntime.handleLocalPick,
    handleUrlDownload: mediaSourceIntakeRuntime.handleUrlDownload,
    handleYoutubeDownload: mediaSourceIntakeRuntime.handleYoutubeDownload,
    handleYoutubeProbe: mediaSourceIntakeRuntime.handleYoutubeProbe,
  };
}
