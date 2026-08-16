import { createLaboratoryPresetEditRuntime } from "./preset-edit-runtime.js";
import { createLaboratoryPresetProfileRuntime } from "./preset-profile-runtime.js";
import { createLaboratoryPresetSourceRuntime } from "./preset-source-runtime.js";

type LaboratoryPresetRuntimeDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  clone: <T>(value: T) => T;
  toRecord: (value: unknown) => Record<string, unknown>;
};

export function createLaboratoryPresetRuntime(deps: LaboratoryPresetRuntimeDeps) {
  const presetSource = createLaboratoryPresetSourceRuntime({
    asNonEmptyString: deps.asNonEmptyString,
    clone: deps.clone,
    toRecord: deps.toRecord,
  });
  const presetEdit = createLaboratoryPresetEditRuntime({
    asNonEmptyString: deps.asNonEmptyString,
    normalizeSourceMetadata: presetSource.normalizeSourceMetadata,
    toRecord: deps.toRecord,
  });
  const presetProfile = createLaboratoryPresetProfileRuntime({
    asNonEmptyString: deps.asNonEmptyString,
    toRecord: deps.toRecord,
  });

  return {
    ...presetSource,
    ...presetEdit,
    ...presetProfile,
  };
}
