import test from "node:test";
import assert from "node:assert/strict";

import { createLaboratoryFeatureReportRuntime } from "../../rooms/laboratory/shared/host/reporting-feature-report.ts";

type RecordValue = Record<string, unknown>;

function toRecord(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && Array.isArray(value) === false
    ? (value as RecordValue)
    : {};
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function createReportRuntime() {
  return createLaboratoryFeatureReportRuntime({
    asNonEmptyString,
    audioFeatureId: "audio-analysis",
    clone<T>(value: T): T {
      return JSON.parse(JSON.stringify(value)) as T;
    },
    createEmptyFeatureReportRecord(featureId: string) {
      return {
        featureId,
        status: "idle",
        findings: [],
        exports: [],
        emptyReason: "empty",
      };
    },
    formatIdentifierLabel(value: string) {
      return value;
    },
    getAudioAnalysisModulesForRuntime() {
      return [];
    },
    getFeatureProcessRecord(project, featureId: string) {
      const p = project as RecordValue;
      return (toRecord(toRecord(p["process"])["records"])[featureId] ?? { status: "idle" }) as Record<string, unknown>;
    },
    getFeatureReportRecord(project: RecordValue, featureId: string) {
      return toRecord(toRecord(toRecord(project["report"])["records"])[featureId]);
    },
    getFindingSeverityRank(level: unknown) {
      return level === "high" ? 3 : level === "medium" ? 2 : 1;
    },
    mediaFeatureId: "media-analysis",
    normalizeAudioAnalysisModuleResult(rawValue: RecordValue) {
      return rawValue;
    },
    normalizeAudioAnalysisState(rawValue: unknown) {
      return toRecord(rawValue);
    },
    normalizeFeatureReportRecord(rawValue: unknown, featureId: string) {
      return {
        featureId,
        ...toRecord(rawValue),
      };
    },
    normalizeProcessFinding(rawValue: unknown) {
      const source = toRecord(rawValue);
      return {
        id: asNonEmptyString(source["id"]) ?? "finding",
        moduleId: asNonEmptyString(source["moduleId"]),
        code: asNonEmptyString(source["code"]),
        title: asNonEmptyString(source["title"]) ?? "Finding",
        detail: asNonEmptyString(source["detail"]) ?? "",
        level: asNonEmptyString(source["level"]) ?? "low",
        severity: asNonEmptyString(source["severity"]) ?? "info",
        confidence: asNonEmptyString(source["confidence"]) ?? "low",
        kind: asNonEmptyString(source["kind"]) ?? "derived",
        evidenceCount: typeof source["evidenceCount"] === "number" ? source["evidenceCount"] : 0,
        artifactIds: Array.isArray(source["artifactIds"]) ? source["artifactIds"] : [],
        sourceModule: asNonEmptyString(source["sourceModule"]),
        reference: null,
        hypothesis: null,
      };
    },
    normalizeStringArray(value: unknown) {
      return Array.isArray(value) ? value.map(String) : [];
    },
    syncProjectAudioAnalysisProjection() {},
    toRecord,
  });
}

void test("laboratory report composition includes saved image comparison findings", () => {
  const runtime = createReportRuntime();
  const project = {
    id: "project-1",
    name: "Comparison project",
    process: {
      records: {
        "media-analysis": { status: "idle" },
      },
    },
    report: {
      records: {
        "media-analysis": { exports: [] },
      },
    },
    assets: [
      {
        id: "snapshot-1",
        type: "image",
        name: "comparison-finding-snapshot.png",
        localPath: "/tmp/comparison-finding-snapshot.png",
        createdAt: 1000,
        metadata: {
          artifactKind: "comparison-finding-snapshot",
          findingId: "finding-1",
        },
      },
      {
        id: "manifest-1",
        type: "artifact",
        name: "comparison-finding.json",
        localPath: "/tmp/comparison-finding.json",
        createdAt: 1001,
        metadata: {
          artifactKind: "comparison-finding-manifest",
          comparisonReferenceAssetId: "asset-b",
          captureContext: {
            comparisonRoiActiveSide: "reference",
            comparisonRois: {
              activeSide: "reference",
              primary: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
              reference: { x: 0.2, y: 0.1, width: 0.25, height: 0.35 },
            },
            primaryNormalizedRoi: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
            referenceNormalizedRoi: { x: 0.2, y: 0.1, width: 0.25, height: 0.35 },
          },
          findingId: "finding-1",
          note: "Sol göz çevresinde belirgin fark",
          snapshotAssetId: "snapshot-1",
        },
      },
    ],
  };

  const report = runtime.composeFeatureReport({}, project, "media-analysis") as RecordValue;
  const aiReport = toRecord(report["aiReport"]);
  const userReport = toRecord(report["userReport"]);
  const findings = Array.isArray(aiReport["findings"]) ? aiReport["findings"] : [];
  const artifacts = Array.isArray(aiReport["artifacts"]) ? aiReport["artifacts"] : [];
  const topFindings = Array.isArray(userReport["topFindings"])
    ? (userReport["topFindings"] as RecordValue[])
    : [];

  assert.equal(report["status"], "ready");
  assert.equal(findings.length, 1);
  assert.equal(toRecord(findings[0])["id"], "finding-1");
  assert.match(
    (toRecord(findings[0])["detail"] as string | undefined) ?? "",
    /ROI baglami: Primary ROI x=10%, y=20%, w=30%, h=40%; Reference ROI x=20%, y=10%, w=25%, h=35%; active=reference/
  );
  assert.equal(artifacts.length, 2);
  assert.deepEqual(toRecord(toRecord(artifacts[0])["metadata"])["comparisonRois"], {
    activeSide: "reference",
    primary: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    reference: { x: 0.2, y: 0.1, width: 0.25, height: 0.35 },
  });
  assert.match(
    (toRecord(toRecord(artifacts[1])["metadata"])["roiSummary"] as string | undefined) ?? "",
    /Primary ROI x=10%/
  );
  assert.equal(topFindings[0]?.["title"], "Sol göz çevresinde belirgin fark");
  assert.match((topFindings[0]["detail"] as string | undefined) ?? "", /ROI baglami:/);
});
