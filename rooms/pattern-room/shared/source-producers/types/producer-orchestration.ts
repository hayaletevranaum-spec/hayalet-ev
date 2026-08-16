import type {
  ImportWarning,
  SourceImportOptions,
  SourceImportResult,
  SourcePackage,
} from "../../source-workbench/types/source-package.js";
import type { SourceKind } from "../../source-workbench/types/source-kind.js";
import type { ProducerError, ProducerWarning } from "./producer-contract.js";

export type SourceProducerOrchestrationWarning = ProducerWarning | ImportWarning;

export type SourceProducerImportPackageResult = {
  packageId: string;
  sourceKind: SourceKind;
  importResult: SourceImportResult;
};

export type SourceProducerOrchestrationStats = {
  packagesProduced: number;
  packagesImported: number;
  packagesFailed: number;
  totalSources: number;
  totalEvidence: number;
  totalNodes: number;
  totalEdges: number;
  totalNotes: number;
  totalWarnings: number;
};

export type SourceProducerOrchestrationOptions = {
  importOptions?: SourceImportOptions;
  stopOnProducerError?: boolean;
};

export type SourceProducerOrchestrationResult = {
  packagesProduced: readonly SourcePackage[];
  packagesImported: number;
  importResults: readonly SourceProducerImportPackageResult[];
  errors: readonly ProducerError[];
  warnings: readonly SourceProducerOrchestrationWarning[];
  stats: SourceProducerOrchestrationStats;
};
