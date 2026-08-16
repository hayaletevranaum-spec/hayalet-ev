import type { SourcePackage } from "../../source-workbench/types/source-package.js";
import type { SourceKind } from "../../source-workbench/types/source-kind.js";
import type { ProducerInputKind } from "./producer-input.js";

export type ProducerType = "user_text" | "long_text";

export type ProducerCapabilities = {
  supportsPreview: boolean;
  supportsMultiPackage: boolean;
  requiresHost: boolean;
  maxInputSizeHint: number;
};

export type ProducerWarning = {
  code: string;
  message: string;
  field?: string;
};

export type ProducerError = {
  code: string;
  message: string;
  field?: string;
};

export type ValidationWarning = ProducerWarning;

export type ValidationError = ProducerError;

export type ValidationResult = {
  valid: boolean;
  errors: readonly ValidationError[];
  warnings: readonly ValidationWarning[];
};

export type ProducerPreview = {
  estimatedPackageCount: number;
  estimatedItemCount: number;
  estimatedSegmentCount?: number;
  sampleTitle: string;
  warnings: readonly ProducerWarning[];
};

export type ProduceResult = {
  packages: readonly SourcePackage[];
  errors: readonly ProducerError[];
  warnings: readonly ProducerWarning[];
};

export type SourceProducer<TInput> = {
  producerId: string;
  producerType: ProducerType;
  sourceKind: SourceKind;
  inputKind: ProducerInputKind;
  capabilities: ProducerCapabilities;
  validateInput(input: TInput): ValidationResult;
  getPreview(input: TInput): ProducerPreview | null;
  produce(input: TInput): ProduceResult;
};
