import { asLabRecord, createLabEventId } from "../../domain/lab-types.js";
import type { LabFeatureId } from "../../domain/lab-types.js";

export function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatProjectTimestamp(dateValue: unknown): string {
  const date = new Date(
    typeof dateValue === "string" || typeof dateValue === "number" || dateValue instanceof Date
      ? dateValue
      : Date.now()
  );
  const fallbackDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return `${fallbackDate.getFullYear()}-${pad2(fallbackDate.getMonth() + 1)}-${pad2(
    fallbackDate.getDate()
  )} ${pad2(fallbackDate.getHours())}-${pad2(fallbackDate.getMinutes())}`;
}

export function buildAutoProjectName(dateValue: unknown, sourceLabel: string): string {
  return `${formatProjectTimestamp(dateValue)} - ${sourceLabel}`;
}

export function isTextControl(
  target: EventTarget | null
): target is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  );
}

export function buildUiEvent(
  message: string,
  severity: "info" | "warning" | "error" | "success" = "info"
) {
  return {
    id: createLabEventId("ui"),
    kind: "activity",
    severity,
    message,
    detail: null,
    timestamp: Date.now(),
    source: "ui" as const,
    action: null,
    stage: null,
    scope: "global" as const,
    moduleId: null,
    rawLine: null,
  };
}

export function toDraftScope(workbench: Record<string, unknown>): Record<string, unknown> {
  const currentScope = asLabRecord(workbench["analysisScope"]);
  return {
    ...currentScope,
    lifecycle: {
      mutable: true,
      processId: null,
      frozenAt: null,
    },
  };
}

function getFeatureIdForCapability(capabilityId: string): LabFeatureId {
  return capabilityId === "visual-structure" || capabilityId === "visual-forensics"
    ? "media-analysis"
    : "audio-analysis";
}

export function deriveFeatureSelectionFromCapabilities(capabilityIds: string[]) {
  const featureIds = Array.from(
    new Set(
      capabilityIds.map(function (capabilityId) {
        return getFeatureIdForCapability(capabilityId);
      })
    )
  );
  return {
    activeFeatureId: (featureIds[0] || "media-analysis") as LabFeatureId,
    featureIds,
  };
}
