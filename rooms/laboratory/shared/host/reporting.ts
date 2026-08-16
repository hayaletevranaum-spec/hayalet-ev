import { createLaboratoryReportExportRuntime } from "./reporting-export.js";
import { createLaboratoryFeatureReportRuntime } from "./reporting-feature-report.js";

type LaboratoryReportingRuntimeDeps = Parameters<typeof createLaboratoryFeatureReportRuntime>[0] &
  Omit<
    Parameters<typeof createLaboratoryReportExportRuntime>[0],
    "buildReportMarkdown" | "composeFeatureReport"
  >;

type LaboratoryReportingRuntime = ReturnType<typeof createLaboratoryFeatureReportRuntime> &
  ReturnType<typeof createLaboratoryReportExportRuntime>;

export function createLaboratoryReportingRuntime(
  deps: LaboratoryReportingRuntimeDeps
): LaboratoryReportingRuntime {
  const laboratoryFeatureReportRuntime = createLaboratoryFeatureReportRuntime(deps);
  type LaboratoryReportExportDeps = Parameters<typeof createLaboratoryReportExportRuntime>[0];
  const laboratoryReportExportRuntime = createLaboratoryReportExportRuntime({
    ...deps,
    buildReportMarkdown:
      laboratoryFeatureReportRuntime.buildReportMarkdown as LaboratoryReportExportDeps["buildReportMarkdown"],
    composeFeatureReport:
      laboratoryFeatureReportRuntime.composeFeatureReport as LaboratoryReportExportDeps["composeFeatureReport"],
  });

  return {
    ...laboratoryFeatureReportRuntime,
    ...laboratoryReportExportRuntime,
  };
}
