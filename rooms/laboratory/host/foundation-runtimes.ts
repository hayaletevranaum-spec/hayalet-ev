import {
  getProjectDirectoryFallbackMarkerList,
  getProjectDirectoryList,
} from "../shared/host/project-paths.js";
import { createLaboratoryProfileModelStateRuntime } from "../shared/host/profile-model-state.js";
import { createLaboratoryHostUtils } from "../shared/host/host-utils.js";
import { createLaboratoryHostIoRuntime } from "../shared/host/io-runtime.js";
import { createLaboratoryRuntimeBootstrap } from "../shared/host/runtime-bootstrap.js";
import { createLaboratoryPresetRuntime } from "../shared/host/preset-runtime.js";
import { createAudioAnalysisUtilityRuntime } from "../features/audio-analysis/host/analysis-utils.js";

type LaboratoryRecord = Record<string, unknown>;
type LaboratoryPresetRuntimeDeps = Parameters<typeof createLaboratoryPresetRuntime>[0];
type LaboratoryRuntimeBootstrapDeps = Parameters<typeof createLaboratoryRuntimeBootstrap>[0];
type LaboratoryProfileModelStateRuntimeDeps = Parameters<
  typeof createLaboratoryProfileModelStateRuntime
>[0];
type LaboratoryHostUtilsDeps = Parameters<typeof createLaboratoryHostUtils>[0];
type LaboratoryAudioAnalysisUtilityRuntimeDeps = Parameters<
  typeof createAudioAnalysisUtilityRuntime
>[0];

type LaboratoryAnalysisArtifactRuntime = {
  runProfileTool: LaboratoryAudioAnalysisUtilityRuntimeDeps["runProfileTool"];
};

type LaboratoryHostFoundationDeps = {
  asNonEmptyString: LaboratoryPresetRuntimeDeps["asNonEmptyString"];
  audioFeatureId: LaboratoryHostUtilsDeps["audioFeatureId"];
  clone: LaboratoryPresetRuntimeDeps["clone"];
  defaultFeatureId: LaboratoryRuntimeBootstrapDeps["defaultFeatureId"];
  getAnalysisArtifactRuntime: () => LaboratoryAnalysisArtifactRuntime;
  getProjectStateRuntime: LaboratoryProfileModelStateRuntimeDeps["getProjectStateRuntime"];
  normalizeLocale: LaboratoryRuntimeBootstrapDeps["normalizeLocale"];
  roomId: LaboratoryRuntimeBootstrapDeps["roomId"];
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryHostFoundation(deps: LaboratoryHostFoundationDeps) {
  const bootstrap = createLaboratoryRuntimeBootstrap({
    defaultFeatureId: deps.defaultFeatureId,
    normalizeLocale: deps.normalizeLocale,
    roomId: deps.roomId,
    toRecord: deps.toRecord,
  });

  const profileModelState = createLaboratoryProfileModelStateRuntime({
    createDefaultProfileModelEntry: bootstrap.createDefaultProfileModelEntry,
    getProjectStateRuntime: deps.getProjectStateRuntime,
    toRecord: deps.toRecord,
  });

  const io = createLaboratoryHostIoRuntime({
    getProjectDirectoryFallbackMarkerList(runtime: unknown, project: unknown) {
      return getProjectDirectoryFallbackMarkerList(
        runtime as Parameters<typeof getProjectDirectoryFallbackMarkerList>[0],
        project as Parameters<typeof getProjectDirectoryFallbackMarkerList>[1]
      );
    },
    getProjectDirectoryList(runtime: unknown, project: unknown) {
      return getProjectDirectoryList(
        runtime as Parameters<typeof getProjectDirectoryList>[0],
        project as Parameters<typeof getProjectDirectoryList>[1]
      );
    },
    roomId: deps.roomId,
  });

  const preset = createLaboratoryPresetRuntime({
    asNonEmptyString: deps.asNonEmptyString,
    clone: deps.clone,
    toRecord: deps.toRecord,
  });

  const hostUtils = createLaboratoryHostUtils({
    audioFeatureId: deps.audioFeatureId,
    getDefaultSourceType: preset.getDefaultSourceType,
    toRecord: deps.toRecord,
  });

  const audioAnalysisUtility = createAudioAnalysisUtilityRuntime({
    asNonEmptyString: deps.asNonEmptyString,
    asNumber: preset.asNumber,
    readTextFile: io.readTextFile,
    runProfileTool(...args) {
      return deps.getAnalysisArtifactRuntime().runProfileTool(...args);
    },
    toRecord: deps.toRecord,
  });

  return {
    audioAnalysisUtility,
    bootstrap,
    hostUtils,
    io,
    preset,
    profileModelState,
  };
}
