export * from "./common.js";
export * from "./provider.js";
export * from "./settings.js";
export * from "./i18n.js";
export * from "./commands.js";
export * from "./database.js";
export * from "./traffic.js";
export * from "./relay.js";
export * from "./ipc-channels.js";
export * from "./rooms.js";
export * from "./tts.js";
export * from "./operations.js";

export * from "./logging-core.js";

export * from "./assistant.js";

// NOTE: Explicit type re-exports keep IDE type hints stable.
export type { BaseResult, ErrorLike } from "./common.js";

export type {
  CommandJob,
  CommandPayload,
  CommandResult,
  CommandDefinition,
  CommandArgs,
  ExecutorContext,
  ExecutorOptions,
} from "./commands.js";

export type { Conversation, ConversationUpdate } from "./database.js";

export type {
  BaseSelectors,
  TelemetryConfig,
  BaseProviderConfig,
  ChatGPTConfig,
  OpenCodeConfig,
} from "./provider.js";

export type { ThinkingState, ThinkingIndicator, ThinkingEvent } from "./traffic.js";

export type {
  LogEntry,
  LogOperation,
  LogQueryFilter,
  LogStats,
  LogBatch,
  LogExportResult,
} from "./logging-core.js";

export { LogLevel, LogVisibility, LogCategory } from "./logging-core.js";
