import { createLaboratoryAudioReportRuntime } from "./reporting-audio.js";
import { createLaboratoryReportMarkdownRuntime } from "./reporting-markdown.js";
import { buildAiReport, buildUserReport } from "../../services/report-builder.js";
import type { LabRun } from "../../domain/lab-types.js";

type LaboratoryRecord = Record<string, unknown>;

type LaboratoryComposedFeatureReportRecord = LaboratoryRecord & {
  aiReport?: unknown;
  exports?: unknown[];
  status?: string | null;
  userReport?: unknown;
};

type LaboratoryFeatureReportRuntimeDeps = Parameters<typeof createLaboratoryAudioReportRuntime>[0] &
  Omit<
    Parameters<typeof createLaboratoryReportMarkdownRuntime>[0],
    "buildAudioAnalysisReportProjection"
  > & {
    mediaFeatureId: string;
  };

export function createLaboratoryFeatureReportRuntime(deps: LaboratoryFeatureReportRuntimeDeps) {
  const {
    asNonEmptyString,
    getFindingSeverityRank,
    normalizeFeatureReportRecord,
    createEmptyFeatureReportRecord,
    getFeatureProcessRecord,
    normalizeProcessFinding,
    getFeatureReportRecord,
    mediaFeatureId,
  } = deps;

  const laboratoryAudioReportRuntime = createLaboratoryAudioReportRuntime(deps);
  const laboratoryReportMarkdownRuntime = createLaboratoryReportMarkdownRuntime({
    ...deps,
    buildAudioAnalysisReportProjection:
      laboratoryAudioReportRuntime.buildAudioAnalysisReportProjection,
  });

  const { buildAudioAnalysisReportProjection, composeAudioAnalysisReport } =
    laboratoryAudioReportRuntime;
  const { buildReportMarkdown, formatReportCardLabel } = laboratoryReportMarkdownRuntime;

  function toRunProjection(processRecord: LaboratoryRecord) {
    const runId = asNonEmptyString(processRecord["runId"]);
    if (runId === null) {
      return null;
    }

    const analysisScopeRecord = deps.toRecord(processRecord["analysisScope"]);
    const moduleTrace = Array.isArray(processRecord["moduleTrace"])
      ? (processRecord["moduleTrace"] as unknown[]).map(function (entry) {
          return deps.toRecord(entry);
        })
      : [];
    const comparisonVariants = Array.isArray(processRecord["comparisonVariants"])
      ? (processRecord["comparisonVariants"] as unknown[]).map(function (entry) {
          return deps.toRecord(entry);
        })
      : [];
    const previewArtifacts = Array.isArray(processRecord["previewArtifacts"])
      ? (processRecord["previewArtifacts"] as unknown[]).map(function (entry) {
          return deps.toRecord(entry);
        })
      : [];

    const modules = Array.isArray(processRecord["modules"])
      ? (processRecord["modules"] as unknown[])
      : [];
    const moduleMap: Record<string, LaboratoryRecord> = {};
    const moduleOrder: string[] = [];
    modules.forEach(function (entry) {
      const normalizedEntry = deps.toRecord(entry);
      const moduleId = asNonEmptyString(normalizedEntry["id"]);
      if (moduleId === null) {
        return;
      }
      moduleMap[moduleId] = normalizedEntry;
      moduleOrder.push(moduleId);
    });

    return {
      id: runId,
      state: (asNonEmptyString(processRecord["status"]) || "idle") as LabRun["state"],
      startedAt: Date.parse(
        asNonEmptyString(processRecord["startedAt"]) || new Date().toISOString()
      ),
      ...(asNonEmptyString(processRecord["completedAt"])
        ? { endedAt: Date.parse(asNonEmptyString(processRecord["completedAt"]) || "") }
        : {}),
      modules: moduleMap,
      moduleOrder,
      events: Array.isArray(processRecord["events"])
        ? (processRecord["events"] as unknown[]).map(function (entry) {
            return deps.toRecord(entry);
          })
        : [],
      rawLog: Array.isArray(processRecord["rawLog"])
        ? (processRecord["rawLog"] as unknown[]).map(function (entry) {
            return deps.toRecord(entry);
          })
        : [],
      artifacts: Array.isArray(processRecord["artifacts"])
        ? (processRecord["artifacts"] as unknown[]).map(function (entry) {
            return deps.toRecord(entry);
          })
        : [],
      findings: (Array.isArray(processRecord["findings"]) ? processRecord["findings"] : []).map(
        function (entry) {
          return deps.normalizeProcessFinding(entry);
        }
      ),
      warnings: Array.isArray(processRecord["warnings"])
        ? (processRecord["warnings"] as unknown[]).map(String)
        : [],
      analysisScope: Object.keys(analysisScopeRecord).length > 0 ? analysisScopeRecord : null,
      hypothesisSummary: asNonEmptyString(processRecord["hypothesisSummary"]),
      moduleTrace,
      comparisonVariants,
      previewArtifacts,
      error: asNonEmptyString(processRecord["error"]),
      targetLabel: asNonEmptyString(deps.toRecord(processRecord["targetSummary"])["label"]),
      progress: typeof processRecord["percent"] === "number" ? processRecord["percent"] : null,
      emptyReason: asNonEmptyString(processRecord["emptyReason"]),
    };
  }

  function attachDualReports(
    featureId: string,
    processRecord: LaboratoryRecord,
    reportRecord: LaboratoryComposedFeatureReportRecord
  ): LaboratoryComposedFeatureReportRecord {
    const run = toRunProjection(processRecord) as LabRun | null;
    return {
      ...reportRecord,
      featureId,
      userReport: buildUserReport(run, reportRecord),
      aiReport: buildAiReport(run, reportRecord),
    };
  }

  function getProjectAssets(project: LaboratoryRecord) {
    return Array.isArray(project["assets"])
      ? (project["assets"] as unknown[]).map(function (entry) {
          return deps.toRecord(entry);
        })
      : [];
  }

  function getAssetFileName(asset: LaboratoryRecord) {
    return (
      asNonEmptyString(asset["name"]) ||
      asNonEmptyString(asset["fileName"]) ||
      asNonEmptyString(asset["id"]) ||
      "asset"
    );
  }

  function readNormalizedRoi(value: unknown) {
    const roi = deps.toRecord(value);
    const x = typeof roi["x"] === "number" ? roi["x"] : null;
    const y = typeof roi["y"] === "number" ? roi["y"] : null;
    const width = typeof roi["width"] === "number" ? roi["width"] : null;
    const height = typeof roi["height"] === "number" ? roi["height"] : null;
    if (x === null || y === null || width === null || height === null) {
      return null;
    }
    return { height, width, x, y };
  }

  function readComparisonRois(metadata: LaboratoryRecord) {
    const captureContext = deps.toRecord(metadata["captureContext"]);
    const comparisonRois =
      Object.keys(deps.toRecord(metadata["comparisonRois"])).length > 0
        ? deps.toRecord(metadata["comparisonRois"])
        : deps.toRecord(captureContext["comparisonRois"]);
    const primary =
      readNormalizedRoi(comparisonRois["primary"]) ||
      readNormalizedRoi(metadata["primaryNormalizedRoi"]) ||
      readNormalizedRoi(captureContext["primaryNormalizedRoi"]);
    const reference =
      readNormalizedRoi(comparisonRois["reference"]) ||
      readNormalizedRoi(metadata["referenceNormalizedRoi"]) ||
      readNormalizedRoi(captureContext["referenceNormalizedRoi"]);
    if (primary === null && reference === null) {
      return null;
    }
    return {
      activeSide:
        asNonEmptyString(comparisonRois["activeSide"]) ||
        asNonEmptyString(metadata["comparisonRoiActiveSide"]) ||
        asNonEmptyString(captureContext["comparisonRoiActiveSide"]) ||
        "primary",
      primary,
      reference,
    };
  }

  function formatRoiPercent(value: number) {
    return `${String(Math.round(value * 100))}%`;
  }

  function formatRoiSummaryPart(label: string, roi: ReturnType<typeof readNormalizedRoi>) {
    if (roi === null) {
      return null;
    }
    return `${label} ROI x=${formatRoiPercent(roi.x)}, y=${formatRoiPercent(roi.y)}, w=${formatRoiPercent(roi.width)}, h=${formatRoiPercent(roi.height)}`;
  }

  function buildComparisonRoiSummary(metadata: LaboratoryRecord) {
    const explicitSummary = asNonEmptyString(metadata["roiSummary"]);
    if (explicitSummary !== null) {
      return explicitSummary;
    }
    const comparisonRois = readComparisonRois(metadata);
    if (comparisonRois === null) {
      return null;
    }
    const parts = [
      formatRoiSummaryPart("Primary", comparisonRois.primary),
      formatRoiSummaryPart("Reference", comparisonRois.reference),
    ].filter((entry): entry is string => entry !== null);
    if (parts.length === 0) {
      return null;
    }
    return `${parts.join("; ")}; active=${comparisonRois.activeSide}`;
  }

  function getComparisonContextMetadata(metadata: LaboratoryRecord) {
    const captureContext = deps.toRecord(metadata["captureContext"]);
    const comparisonRois = readComparisonRois(metadata);
    const roiSummary = buildComparisonRoiSummary(metadata);
    const context: LaboratoryRecord = {};
    if (Object.keys(captureContext).length > 0) {
      context["captureContext"] = captureContext;
    }
    if (comparisonRois !== null) {
      context["comparisonRois"] = comparisonRois;
      context["comparisonRoiActiveSide"] = comparisonRois.activeSide;
    }
    if (roiSummary !== null) {
      context["roiSummary"] = roiSummary;
    }
    return context;
  }

  function buildComparisonFindingDetail(note: string | null, roiSummary: string | null) {
    const baseDetail = note || "Kullanici tarafindan kaydedilmis resim karsilastirma bulgusu.";
    if (roiSummary === null) {
      return baseDetail;
    }
    return `${baseDetail}\nROI baglami: ${roiSummary}`;
  }

  function getComparisonFindingEvidence(project: LaboratoryRecord) {
    const assets = getProjectAssets(project);
    const assetById = new Map<string, LaboratoryRecord>();
    assets.forEach(function (asset) {
      const id = asNonEmptyString(asset["id"]);
      if (id !== null) {
        assetById.set(id, asset);
      }
    });

    const findings: LaboratoryRecord[] = [];
    const artifacts: LaboratoryRecord[] = [];
    assets.forEach(function (asset) {
      const metadata = deps.toRecord(asset["metadata"]);
      if (asNonEmptyString(metadata["artifactKind"]) !== "comparison-finding-manifest") {
        return;
      }
      const findingId =
        asNonEmptyString(metadata["findingId"]) ||
        `comparison-finding-${asNonEmptyString(asset["id"]) || String(findings.length + 1)}`;
      const snapshotAssetId = asNonEmptyString(metadata["snapshotAssetId"]);
      const snapshotAsset =
        snapshotAssetId === null ? null : assetById.get(snapshotAssetId) || null;
      const note = asNonEmptyString(metadata["note"]);
      const comparisonContextMetadata = getComparisonContextMetadata(metadata);
      const roiSummary = asNonEmptyString(comparisonContextMetadata["roiSummary"]);
      const title = note
        ? note.split(/\r?\n/)[0]?.slice(0, 80) || "Karşılaştırma bulgusu"
        : "Karşılaştırma bulgusu";
      const artifactIds = [snapshotAssetId, asNonEmptyString(asset["id"])].filter(
        (entry): entry is string => entry !== null
      );
      findings.push(
        normalizeProcessFinding({
          artifactIds,
          code: "comparison-finding",
          confidence: "medium",
          detail: buildComparisonFindingDetail(note, roiSummary),
          evidenceCount: artifactIds.length,
          id: findingId,
          kind: "derived",
          level: "medium",
          moduleId: "image-comparison",
          severity: "info",
          sourceModule: "image-comparison",
          title,
        })
      );
      if (snapshotAsset !== null) {
        artifacts.push({
          createdAt: new Date(Number(snapshotAsset["createdAt"]) || Date.now()).toISOString(),
          fileName: getAssetFileName(snapshotAsset),
          id: snapshotAssetId,
          kind: "comparison-finding-snapshot",
          moduleId: "image-comparison",
          path: asNonEmptyString(snapshotAsset["localPath"]),
          previewUrl:
            asNonEmptyString(snapshotAsset["url"]) || asNonEmptyString(snapshotAsset["localPath"]),
          status: "ready",
          ...(Object.keys(comparisonContextMetadata).length === 0
            ? {}
            : { metadata: comparisonContextMetadata }),
        });
      }
      artifacts.push({
        createdAt: new Date(Number(asset["createdAt"]) || Date.now()).toISOString(),
        fileName: getAssetFileName(asset),
        id: asNonEmptyString(asset["id"]) || `${findingId}-manifest`,
        kind: "comparison-finding-manifest",
        moduleId: "image-comparison",
        path: asNonEmptyString(asset["localPath"]),
        previewUrl: null,
        status: "ready",
        ...(Object.keys(comparisonContextMetadata).length === 0
          ? {}
          : { metadata: comparisonContextMetadata }),
      });
    });

    return { artifacts, findings };
  }

  function getProcessBackedEmptyReason(processRecord: LaboratoryRecord, fallback: string) {
    const status = asNonEmptyString(processRecord["status"]) || "idle";
    const explicitReason = asNonEmptyString(processRecord["emptyReason"]);
    if (explicitReason !== null) {
      return explicitReason;
    }
    if (status === "running" || status === "queued") {
      return "Analiz hala suruyor; rapor tamamlaninca dolacak.";
    }
    if (status === "failed") {
      return (
        asNonEmptyString(processRecord["error"]) ||
        "Analiz hata ile tamamlandigi icin rapor bos kaldi."
      );
    }
    if (status === "cancelled") {
      return "Analiz iptal edildigi icin rapor bos kaldi.";
    }
    return fallback;
  }

  function composeFeatureReport(
    runtime: unknown,
    project: LaboratoryRecord,
    featureId: string
  ): LaboratoryComposedFeatureReportRecord {
    if (featureId === deps.audioFeatureId) {
      const processRecord = getFeatureProcessRecord(project, featureId);
      return normalizeFeatureReportRecord(
        attachDualReports(
          featureId,
          processRecord,
          composeAudioAnalysisReport(
            runtime as LaboratoryRecord,
            project
          ) as unknown as LaboratoryComposedFeatureReportRecord
        ),
        featureId
      ) as unknown as LaboratoryComposedFeatureReportRecord;
    }
    const processRecord = getFeatureProcessRecord(project, featureId);
    const comparisonEvidence =
      featureId === mediaFeatureId
        ? getComparisonFindingEvidence(project)
        : { artifacts: [], findings: [] };
    if (processRecord.status !== "ready" && processRecord.status !== "stale") {
      if (comparisonEvidence.findings.length > 0) {
        const generatedAt = new Date().toISOString();
        const comparisonProcessRecord = {
          ...processRecord,
          artifacts: comparisonEvidence.artifacts,
          completedAt: generatedAt,
          emptyReason: null,
          findings: comparisonEvidence.findings,
          modules: [],
          runId:
            asNonEmptyString(processRecord["runId"]) ||
            `comparison-findings-${asNonEmptyString(project["id"]) || "project"}`,
          startedAt: generatedAt,
          status: "ready",
          warnings: [],
        };
        return normalizeFeatureReportRecord(
          attachDualReports(featureId, comparisonProcessRecord, {
            featureId,
            status: "ready",
            sourceRunId: comparisonProcessRecord.runId,
            generatedAt,
            summaryCards: [
              {
                id: `${featureId}-findings`,
                label: "Findings",
                value: String(comparisonEvidence.findings.length),
              },
              {
                id: `${featureId}-artifacts`,
                label: "Artifacts",
                value: String(comparisonEvidence.artifacts.length),
              },
            ],
            findings: comparisonEvidence.findings,
            caveats: ["Report includes manually saved comparison findings."],
            warnings: [],
            error: null,
            emptyReason: null,
          }),
          featureId
        ) as unknown as LaboratoryComposedFeatureReportRecord;
      }
      return normalizeFeatureReportRecord(
        {
          ...createEmptyFeatureReportRecord(featureId),
          status: processRecord.status === "running" ? "staged" : "idle",
          warnings: processRecord["warnings"] || [],
          emptyReason: getProcessBackedEmptyReason(
            processRecord,
            "Önce process aşaması tamamlanmalı."
          ),
        },
        featureId
      ) as unknown as LaboratoryComposedFeatureReportRecord;
    }

    const processArtifacts = Array.isArray(processRecord["artifacts"])
      ? (processRecord["artifacts"] as unknown[]).map(function (entry) {
          return deps.toRecord(entry);
        })
      : [];
    const artifacts = processArtifacts.concat(comparisonEvidence.artifacts);
    const reportProcessRecord = {
      ...processRecord,
      artifacts,
      findings: (Array.isArray(processRecord["findings"]) ? processRecord["findings"] : []).concat(
        comparisonEvidence.findings
      ),
    };
    const findings = (
      Array.isArray(reportProcessRecord["findings"]) ? reportProcessRecord["findings"] : []
    )
      .map(normalizeProcessFinding)
      .sort(function (left, right) {
        return getFindingSeverityRank(right.level) - getFindingSeverityRank(left.level);
      });
    const topLevel = findings[0] ? asNonEmptyString(findings[0].level) || "low" : "low";
    const caveats: string[] = [];
    if (featureId === mediaFeatureId) {
      caveats.push(
        "Process findings remain evidence-led but still reflect heuristic interpretation where noted."
      );
    } else {
      caveats.push("Planned audio modules remain visible but do not pretend to be implemented.");
    }

    const currentReportExports = (
      getFeatureReportRecord(project, featureId) as unknown as LaboratoryComposedFeatureReportRecord
    )["exports"];

    return normalizeFeatureReportRecord(
      attachDualReports(featureId, reportProcessRecord, {
        featureId: featureId,
        status: "ready",
        sourceRunId: processRecord["runId"],
        generatedAt: new Date().toISOString(),
        summaryCards: [
          {
            id: `${featureId}-target`,
            labelKey: "mediaAnalysis.profile.summary.target",
            value:
              asNonEmptyString(deps.toRecord(processRecord.targetSummary)["label"]) ||
              asNonEmptyString(project["name"]),
          },
          {
            id: `${featureId}-modules`,
            label: "Modules",
            value: String(
              (Array.isArray(processRecord["modules"]) ? processRecord["modules"] : []).length
            ),
          },
          {
            id: `${featureId}-findings`,
            labelKey: "mediaAnalysis.profile.summary.signals",
            value: String(findings.length),
          },
          {
            id: `${featureId}-artifacts`,
            labelKey: "mediaAnalysis.profile.summary.artifacts",
            value: String(artifacts.length),
          },
          {
            id: `${featureId}-risk`,
            label: "Top risk",
            value: topLevel,
          },
        ],
        findings: findings,
        caveats: caveats,
        warnings: Array.isArray(processRecord["warnings"]) ? processRecord["warnings"] : [],
        ...(Array.isArray(currentReportExports) ? { exports: currentReportExports } : {}),
        error: null,
        emptyReason:
          findings.length === 0 && artifacts.length === 0
            ? getProcessBackedEmptyReason(
                processRecord,
                "Çalışma tamamlandı ancak raporlayacak belirgin bulgu oluşmadı."
              )
            : null,
      }),
      featureId
    ) as unknown as LaboratoryComposedFeatureReportRecord;
  }

  return {
    buildAudioAnalysisReportProjection,
    composeAudioAnalysisReport,
    composeFeatureReport,
    buildReportMarkdown,
    formatReportCardLabel,
  };
}
