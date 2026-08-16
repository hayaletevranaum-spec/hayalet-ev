export {
  importSourcePackage,
  DEFAULT_SOURCE_IMPORT_LIMITS,
} from "./adapters/source-import-adapter.js";
export {
  SAMPLE_NEWSPAPER_SOURCE_PACKAGE,
  SAMPLE_SOURCE_PACKAGES,
  SAMPLE_SUBTITLE_SOURCE_PACKAGE,
  SAMPLE_USER_TEXT_SOURCE_PACKAGE,
} from "./mock/sample-source-package.js";
export { SOURCE_KINDS, isSourceKind } from "./types/source-kind.js";
export {
  SOURCE_KIND_TO_PATTERN_SOURCE_TYPE,
  mapSourceKindToPatternSourceType,
} from "./types/source-mapping.js";
export { parseSourcePackage } from "./types/source-package.js";
export type { SourceKind } from "./types/source-kind.js";
export type {
  ImportStats,
  ImportWarning,
  SourceImportEdgeDraft,
  SourceImportEvidenceDraft,
  SourceImportLimits,
  SourceImportNodeDraft,
  SourceImportNodeOriginKind,
  SourceImportNoteDraft,
  SourceImportOptions,
  SourceImportResult,
  SourceImportSourceDraft,
  SourceImportSourceSegmentDraft,
  SourceNumericPattern,
  SourceObservation,
  SourceObservationType,
  SourcePackage,
  SourcePackageItem,
  SourceQuote,
  SourceReference,
  SourceSegment,
  SourceMotif,
  SourceUncertainty,
} from "./types/source-package.js";
