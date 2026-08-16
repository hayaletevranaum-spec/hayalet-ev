import { createLabOutputAsset, upsertLabAsset } from "./lab-assets.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryProcessOutputHelpersDeps = {
  asNonEmptyString: (value: unknown) => string | null;
  audioFeatureId: string;
  toRecord: (value: unknown) => LaboratoryRecord;
};

export function createLaboratoryProcessOutputHelpers(deps: LaboratoryProcessOutputHelpersDeps) {
  const { asNonEmptyString, audioFeatureId, toRecord } = deps;

  function formatProcessOutputFeatureLabel(featureId: string) {
    return featureId
      .split(/[-_]/)
      .filter(Boolean)
      .map(function (segment) {
        return segment.charAt(0).toUpperCase() + segment.slice(1);
      })
      .join(" ");
  }

  function getReportFindingCount(reportRecord: LaboratoryRecord) {
    const findings = Array.isArray(reportRecord["findings"]) ? reportRecord["findings"] : [];
    if (findings.length > 0) {
      return findings.length;
    }
    const userReport = toRecord(reportRecord["userReport"]);
    return Array.isArray(userReport["topFindings"]) ? userReport["topFindings"].length : 0;
  }

  function syncReportAssetsToProjectAssets(
    project: LaboratoryRecord,
    featureId: string,
    processRecord: LaboratoryRecord,
    reportRecord: LaboratoryRecord,
    assetsValue: unknown
  ) {
    if (asNonEmptyString(reportRecord["status"]) !== "ready") {
      return assetsValue;
    }

    const runId =
      asNonEmptyString(processRecord["runId"]) || asNonEmptyString(reportRecord["sourceRunId"]);
    const reportRunKey = runId || "latest";
    const featureLabel = formatProcessOutputFeatureLabel(featureId);
    const findingCount = getReportFindingCount(reportRecord);
    const generatedAt = asNonEmptyString(reportRecord["generatedAt"]) || new Date().toISOString();
    const reportViews = [
      { view: "user", label: `${featureLabel} User Report` },
      { view: "ai", label: `${featureLabel} AI Report` },
    ];

    return reportViews.reduce<unknown>(function (assets, reportView) {
      return upsertLabAsset(
        assets,
        createLabOutputAsset(project, {
          id: `process-report-${featureId}-${reportRunKey}-${reportView.view}`,
          type: "report",
          name: reportView.label,
          runId,
          metadata: {
            featureId,
            findingCount,
            format: "inline",
            generatedAt,
            reportView: reportView.view,
            sourceRunId: runId,
            status: "ready",
          },
        })
      );
    }, assetsValue);
  }

  function syncProcessOutputsToProjectAssets(
    project: LaboratoryRecord,
    featureId: string,
    processRecord: LaboratoryRecord,
    reportRecord: LaboratoryRecord
  ) {
    const processArtifacts = Array.isArray(processRecord["artifacts"])
      ? (processRecord["artifacts"] as unknown[]).map(toRecord)
      : [];
    let nextAssets: unknown = project["assets"];
    if (processArtifacts.length === 0) {
      return syncReportAssetsToProjectAssets(
        project,
        featureId,
        processRecord,
        reportRecord,
        Array.isArray(nextAssets) ? nextAssets : []
      );
    }

    const runId = asNonEmptyString(processRecord["runId"]);
    nextAssets = processArtifacts.reduce<unknown>(function (assets, artifact) {
      const artifactPath = asNonEmptyString(artifact["path"]);
      if (artifactPath === null) {
        return assets;
      }

      const artifactId = asNonEmptyString(artifact["id"]);
      const artifactKind = asNonEmptyString(artifact["kind"]);
      const artifactName =
        asNonEmptyString(artifact["fileName"]) ||
        asNonEmptyString(artifact["label"]) ||
        artifactPath.split(/[\\/]/).pop() ||
        null;
      const artifactAsset = createLabOutputAsset(project, {
        type: "artifact",
        name: artifactName,
        localPath: artifactPath,
        runId,
        ...(artifactId === null ? {} : { id: `process-artifact-${artifactId}` }),
        metadata: {
          ...toRecord(artifact["metadata"]),
          featureId,
          moduleId: asNonEmptyString(artifact["moduleId"]),
          kind: artifactKind,
          label: asNonEmptyString(artifact["label"]),
          processArtifactId: artifactId,
          status: asNonEmptyString(artifact["status"]) || "ready",
          variantId: asNonEmptyString(artifact["variantId"]),
        },
      });
      return upsertLabAsset(assets, artifactAsset);
    }, project["assets"]);
    return syncReportAssetsToProjectAssets(
      project,
      featureId,
      processRecord,
      reportRecord,
      nextAssets
    );
  }

  function deriveProcessEmptyReason(featureId: string, processRecord: LaboratoryRecord) {
    const semanticEventCount = Array.isArray(processRecord["events"])
      ? processRecord["events"].length
      : 0;
    const rawLogCount = Array.isArray(processRecord["rawLog"]) ? processRecord["rawLog"].length : 0;

    if (semanticEventCount === 0 && rawLogCount === 0) {
      return featureId === audioFeatureId
        ? "Ses analizi tamamlandi ancak okunabilir is izi uretilmedigi icin rapor bos kaldi."
        : "Analiz tamamlandi ancak araclardan anlamli cikti gelmedigi icin rapor bos kaldi.";
    }

    return featureId === audioFeatureId
      ? "Ses modulleri raporlanabilir bir sinyal veya artefakt uretmedi."
      : "Analiz akisi tamamlandi ancak raporlanabilir bulgu veya artefakt cikmadi.";
  }

  return {
    deriveProcessEmptyReason,
    syncProcessOutputsToProjectAssets,
  };
}
