import { asLabRecord, asNonEmptyString, asStringArray } from "../domain/lab-types.js";
import type { LabPreflightResult, LabProfileConfig } from "../domain/lab-types.js";

export function runPreflight(
  profileConfig: LabProfileConfig | Record<string, unknown> | null,
  _source: Record<string, unknown> | null = null
): LabPreflightResult {
  const profile = asLabRecord(profileConfig);
  const readiness = asLabRecord(profile["readiness"]);
  const preflight = asLabRecord(profile["preflight"]);
  const requiredTools = Array.isArray(readiness["requiredTools"])
    ? (readiness["requiredTools"] as unknown[])
    : [];
  const enabledModules = Array.isArray(readiness["enabledLaneIds"])
    ? (readiness["enabledLaneIds"] as unknown[]).map(String)
    : [];

  const missingDependencies = requiredTools
    .map(function (entry) {
      const record = asLabRecord(entry);
      if (record["ready"] === true) {
        return null;
      }
      return asNonEmptyString(record["displayName"]) || asNonEmptyString(record["toolId"]);
    })
    .filter((entry): entry is string => entry !== null);

  const warnings = Array.from(
    new Set(asStringArray(readiness["warnings"]).concat(asStringArray(preflight["warnings"])))
  );
  const stageReady = readiness["stageReady"] === true;
  const rawStatus = asNonEmptyString(preflight["status"]);

  return {
    status: stageReady !== true ? "blocked" : warnings.length > 0 ? "warning" : "ready",
    missingDependencies,
    warnings,
    estimatedRuntime:
      typeof asLabRecord(profile["estimate"])["runtimeSeconds"] === "number"
        ? (asLabRecord(profile["estimate"])["runtimeSeconds"] as number)
        : null,
    enabledModules,
    stageReady,
    rawStatus,
    reason:
      stageReady === true
        ? warnings.length > 0
          ? "Ön kontrolde uyarılar var ama işlem devam edebilir."
          : null
        : missingDependencies.length > 0
          ? `Eksik bağımlılıklar: ${missingDependencies.join(", ")}`
          : "Ön kontrol bu aşamayı henüz hazır işaretlemedi.",
  };
}

export function normalizeLabPreflight(projectProfile: unknown): LabPreflightResult {
  return runPreflight(asLabRecord(projectProfile), null);
}
