export { createUserTextProducer } from "./producers/user-text-producer.js";
export { createLongTextProducer } from "./producers/long-text-producer.js";
export { segmentLongText } from "./producers/long-text-segmenter.js";
export { produceAndImportSource } from "./orchestration/producer-import-orchestrator.js";
export type { UserTextProducerOptions } from "./producers/user-text-producer.js";
export type { LongTextProducerOptions } from "./producers/long-text-producer.js";
export type { LongTextSegmenterOptions } from "./producers/long-text-segmenter.js";
export type {
  ProduceResult,
  ProducerCapabilities,
  ProducerError,
  ProducerPreview,
  ProducerType,
  ProducerWarning,
  SourceProducer,
  ValidationError,
  ValidationResult,
  ValidationWarning,
} from "./types/producer-contract.js";
export type {
  LongTextInput,
  LongTextSourceKind,
  PastedTextInput,
  ProducerInputKind,
} from "./types/producer-input.js";
export type {
  SourceProducerImportPackageResult,
  SourceProducerOrchestrationOptions,
  SourceProducerOrchestrationResult,
  SourceProducerOrchestrationStats,
  SourceProducerOrchestrationWarning,
} from "./types/producer-orchestration.js";
