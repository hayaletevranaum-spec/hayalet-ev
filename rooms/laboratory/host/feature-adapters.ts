import { createLaboratoryActionCompositionRuntime } from "../shared/host/action-composition.js";

type LaboratoryFeatureAdaptersDeps = Parameters<
  typeof createLaboratoryActionCompositionRuntime
>[0] & {
  audioFeatureId: string;
};

export function createLaboratoryFeatureAdapters(deps: LaboratoryFeatureAdaptersDeps) {
  function buildWorkbenchFeatureDescriptors() {
    return [
      {
        featureId: "media-analysis",
        role: "primary",
      },
      {
        featureId: deps.audioFeatureId,
        role: "optional",
      },
    ];
  }

  const laboratoryActionCompositionRuntime = createLaboratoryActionCompositionRuntime(deps);

  return {
    buildWorkbenchFeatureDescriptors,
    handleMediaAction: laboratoryActionCompositionRuntime.handleMediaAction,
  };
}
