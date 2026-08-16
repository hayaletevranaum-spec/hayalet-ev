import type { PatternRoomLocalState } from "../shared/state/pattern-room-local-state.js";
import {
  importSourcePackage,
  SAMPLE_SOURCE_PACKAGES,
  type SourcePackage,
} from "../shared/source-workbench/index.js";
import type { PatternSampleSourceImportStatus } from "../shared/types/pattern-room.js";

const DEFAULT_SAMPLE_SOURCE_PACKAGE_ID = "sample-user-text";

function findSampleSourcePackage(packageId: string): SourcePackage | null {
  for (const samplePackage of SAMPLE_SOURCE_PACKAGES) {
    if (samplePackage.sourcePackageId === packageId) {
      return samplePackage;
    }
  }

  return null;
}

function collectExistingOrigins(localState: PatternRoomLocalState): string[] {
  return localState.getOverlay().localAuthoredSources.map((source) => {
    return source.origin;
  });
}

function createMissingPackageStatus(packageId: string): PatternSampleSourceImportStatus {
  return {
    packageId,
    message: "Örnek kaynak paketi bulunamadı.",
    duplicate: false,
    sourcesAdded: 0,
    evidenceAdded: 0,
    nodesAdded: 0,
    edgesAdded: 0,
    notesAdded: 0,
    duplicatesSkipped: 0,
    warningCount: 1,
  };
}

export function importSampleSourcePackage(
  localState: PatternRoomLocalState,
  packageId = DEFAULT_SAMPLE_SOURCE_PACKAGE_ID
): PatternSampleSourceImportStatus {
  const samplePackage = findSampleSourcePackage(packageId);
  if (samplePackage === null) {
    return createMissingPackageStatus(packageId);
  }

  const result = importSourcePackage(samplePackage, {
    existingOrigins: collectExistingOrigins(localState),
  });
  const summary = localState.applySourceImportResult(result);
  const duplicatesSkipped = summary.duplicatesSkipped + result.stats.duplicatesSkipped;
  const warningCount = summary.warnings.length + result.warnings.length;
  const importedCount =
    summary.sourcesAdded +
    summary.evidenceAdded +
    summary.nodesAdded +
    summary.edgesAdded +
    summary.notesAdded;
  const duplicate = importedCount === 0 && duplicatesSkipped > 0;

  return {
    packageId: samplePackage.sourcePackageId,
    message: duplicate
      ? "Bu kaynak paketi zaten odada kayıtlı görünüyor."
      : `Kaynak paketi odaya eklendi: ${String(summary.sourcesAdded)} kaynak, ${String(
          summary.evidenceAdded
        )} kanıt, ${String(summary.nodesAdded)} düğüm.`,
    duplicate,
    sourcesAdded: summary.sourcesAdded,
    evidenceAdded: summary.evidenceAdded,
    nodesAdded: summary.nodesAdded,
    edgesAdded: summary.edgesAdded,
    notesAdded: summary.notesAdded,
    duplicatesSkipped,
    warningCount,
  };
}
