import type { SlotId, Attachment } from "./common.js";

export type CommandJobStatus = "pending" | "processing" | "done" | "failed";
export type CommandProvider = SlotId | "room-ui" | "us1" | "user" | "system";
export type SlotBridgeAction =
  | "message.send"
  | "message.sendWait"
  | "connection.ensure"
  | "session.open"
  | "session.switch"
  | "session.sync"
  | "room.command";
export type SlotBridgeMessageTarget = SlotId | "us1";
export type SlotBridgeConnectPolicy = "never" | "ensure" | "require-ready";
export type SlotBridgeDelivery = "sync" | "async";
export type SlotBridgeArtifactKind =
  "attachment-ref" | "filesystem" | "archive-attachment" | "generated-image";
export type SlotBridgeProtocolTextPosition = "before" | "after" | "replace";

export interface SlotBridgeProtocolDescriptor {
  room?: string;
  scenario?: string;
  protocolKey?: string;
  fallbackTitle?: string | null;
  preface?: string | null;
  context?: Record<string, unknown> | null;
  textPosition?: SlotBridgeProtocolTextPosition;
}

export interface SlotBridgeSessionRef {
  id?: string | null;
  conversationId?: string | null;
  threadId?: string | null;
  openHint?: string | null;
}

export interface SlotBridgeProjectRef {
  id?: string | null;
  projectId?: string | null;
  roomId?: string | null;
  title?: string | null;
  aliases?: SlotBridgeProjectRef[] | null;
  aliasProjectIds?: string[] | null;
}

export interface SlotBridgeAttachmentDescriptor {
  id?: string;
  ref?: string | null;
  name: string;
  kind?: SlotBridgeArtifactKind;
  path?: string | null;
  url?: string | null;
  archivePath?: string | null;
  mimeType?: string | null;
  size?: number | null;
  sourceSlot?: SlotId | null;
  conversationId?: string | null;
  messageId?: string | null;
}

export interface SlotBridgeReply {
  text?: string;
  slot?: CommandProvider | null;
  provider?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
  brokerMessageId?: string | null;
  clientRequestId?: string | null;
  eventSeq?: number | null;
  attachments?: SlotBridgeAttachmentDescriptor[];
}

export interface SlotBridgeEnvelope {
  version?: number;
  reqId?: string;
  clientRequestId?: string;
  brokerMessageId?: string;
  action: SlotBridgeAction;
  fromSlot?: CommandProvider;
  toSlot?: CommandProvider | null;
  toSlots?: CommandProvider[] | null;
  replyToSlot?: CommandProvider | null;
  delivery?: SlotBridgeDelivery;
  wait?: boolean;
  timeoutMs?: number;
  force?: boolean;
  connectPolicy?: SlotBridgeConnectPolicy;
  sessionRef?: SlotBridgeSessionRef | null;
  projectRef?: SlotBridgeProjectRef | null;
  payload?: Record<string, unknown> | null;
  attachments?: SlotBridgeAttachmentDescriptor[];
}

export interface CommandJob {
  id: string;
  command: string;
  status: CommandJobStatus;
  createdAt: number;
  updatedAt?: number;
  source?: SlotId | "user" | "system";
  target?: SlotId;
  payload?: CommandPayload;
  result?: CommandResult;
  error?: string;
}

export interface CommandPayload {
  message?: string;
  files?: string[];
  attachments?: Attachment[];
  options?: Record<string, unknown>;
  // NOTE: Extra fields used by server command utilities.
  provider?: string;
  args?: string;
  sender?: string;
  source?: string;
  detail?: string;
  testMode?: boolean;
  [key: string]: unknown;
}

export interface CommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
  error?: string;
}

export interface SlotBridgeResult extends CommandResult {
  ok?: boolean;
  reqId?: string;
  clientRequestId?: string;
  brokerMessageId?: string;
  code?: string;
  reply?: SlotBridgeReply | null;
  session?: SlotBridgeSessionRef | null;
  artifacts?: SlotBridgeAttachmentDescriptor[];
}

export interface CommandDefinition {
  name: string;
  description: string;
  aliases?: string[];
  usage?: string;
  examples?: string[];
  handler: CommandHandler;
}

export type CommandHandler = (args: CommandArgs) => Promise<CommandResult>;

export interface CommandArgs {
  raw: string;
  command: string;
  args: string[];
  flags: Record<string, string | boolean>;
  source?: SlotId | "user";
  target?: SlotId;
}

export interface ExecutorContext {
  slot: SlotId;
  jobId?: string;
  attachments?: Attachment[];
  tempPaths?: string[];
}

export interface ExecutorOptions {
  timeout?: number;
  retries?: number;
  onProgress?: (progress: number) => void;
}
