import { importSourcePackage } from "../../source-workbench/adapters/source-import-adapter.js";
import { parseSourcePackage } from "../../source-workbench/types/source-package.js";
import type { SourcePackage } from "../../source-workbench/types/source-package.js";
import type { ProducerError, SourceProducer } from "../types/producer-contract.js";
import type {
  SourceProducerImportPackageResult,
  SourceProducerOrchestrationOptions,
  SourceProducerOrchestrationResult,
  SourceProducerOrchestrationWarning,
} from "../types/producer-orchestration.js";

function createStats(
  packagesProduced: readonly SourcePackage[],
  importResults: readonly SourceProducerImportPackageResult[],
  packagesFailed: number,
  warnings: readonly SourceProducerOrchestrationWarning[]
): SourceProducerOrchestrationResult["stats"] {
  return importResults.reduce(
    (stats, packageResult) => {
      stats.totalSources += packageResult.importResult.stats.sourcesCreated;
      stats.totalEvidence += packageResult.importResult.stats.evidenceCreated;
      stats.totalNodes += packageResult.importResult.stats.nodesCreated;
      stats.totalEdges += packageResult.importResult.stats.edgesCreated;
      stats.totalNotes += packageResult.importResult.stats.notesCreated;
      return stats;
    },
    {
      packagesProduced: packagesProduced.length,
      packagesImported: importResults.length,
      packagesFailed,
      totalSources: 0,
      totalEvidence: 0,
      totalNodes: 0,
      totalEdges: 0,
      totalNotes: 0,
      totalWarnings: warnings.length,
    }
  );
}

function createResult(
  packagesProduced: readonly SourcePackage[],
  importResults: readonly SourceProducerImportPackageResult[],
  errors: readonly ProducerError[],
  warnings: readonly SourceProducerOrchestrationWarning[],
  packagesFailed: number
): SourceProducerOrchestrationResult {
  return {
    packagesProduced,
    packagesImported: importResults.length,
    importResults,
    errors,
    warnings,
    stats: createStats(packagesProduced, importResults, packagesFailed, warnings),
  };
}

export function produceAndImportSource<TInput>(
  producer: SourceProducer<TInput>,
  input: TInput,
  options: SourceProducerOrchestrationOptions = {}
): SourceProducerOrchestrationResult {
  const validation = producer.validateInput(input);
  if (validation.valid === false) {
    return createResult([], [], validation.errors, validation.warnings, 0);
  }

  const produceResult = producer.produce(input);
  const warnings: SourceProducerOrchestrationWarning[] = [
    ...validation.warnings,
    ...produceResult.warnings,
  ];
  if (produceResult.errors.length > 0) {
    return createResult(
      produceResult.packages,
      [],
      produceResult.errors,
      warnings,
      produceResult.packages.length
    );
  }

  const importResults: SourceProducerImportPackageResult[] = [];
  const errors: ProducerError[] = [];
  let packagesFailed = 0;

  for (const producedPackage of produceResult.packages) {
    const parsedPackage = parseSourcePackage(producedPackage);
    if (parsedPackage === null) {
      packagesFailed += 1;
      errors.push({
        code: "invalid-source-package",
        message: "Produced source package failed defensive parsing.",
        field: "packages",
      });
      continue;
    }

    const importResult = importSourcePackage(parsedPackage, options.importOptions);
    warnings.push(...importResult.warnings);
    importResults.push({
      packageId: parsedPackage.sourcePackageId,
      sourceKind: parsedPackage.sourceKind,
      importResult,
    });
  }

  return createResult(produceResult.packages, importResults, errors, warnings, packagesFailed);
}
