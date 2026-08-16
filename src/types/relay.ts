import type { SlotId, Attachment } from "./common.js";

export type RelayMessageType = "text" | "command" | "file" | "system";

export interface RelayMessage {
  id: string;
  type: RelayMessageType;
  source: SlotId;
  target: SlotId;
  content: string;
  attachments?: Attachment[];
  timestamp: number;
  metadata?: RelayMessageMetadata;
}

export interface RelayMessageMetadata {
  originalMessageId?: string;
  replyTo?: string;
  flags?: string[];
  [key: string]: unknown;
}

export type RelayStatus = "idle" | "active" | "paused" | "error";

export interface RelayState {
  status: RelayStatus;
  source: SlotId | null;
  target: SlotId | null;
  messageQueue: RelayMessage[];
  lastActivity: number;
  error?: string;
}

export interface RelayConfig {
  autoStart?: boolean;
  maxQueueSize?: number;
  messageDelay?: number;
  retryAttempts?: number;
  retryDelay?: number;
  filters?: RelayFilters;
}

export interface RelayFilters {
  allowedTypes?: RelayMessageType[];
  blockedPatterns?: string[];
  maxMessageLength?: number;
}

export type AIRelayMode = "ping-pong" | "broadcast" | "chain";

export interface AIRelayConfig extends RelayConfig {
  mode: AIRelayMode;
  participants: SlotId[];
  turnOrder?: SlotId[];
  maxTurns?: number;
}

export interface AIRelayState extends RelayState {
  mode: AIRelayMode;
  currentTurn: SlotId | null;
  turnCount: number;
  participants: SlotId[];
}

export interface AssistantRelayConfig extends RelayConfig {
  assistantSlot: SlotId;
  userSlot: SlotId;
  commandPrefix?: string;
}

export interface AssistantRelayState extends RelayState {
  assistantSlot: SlotId;
  userSlot: SlotId;
  pendingCommands: string[];
}

export type RelayEventType =
  | "message:received"
  | "message:sent"
  | "message:error"
  | "status:changed"
  | "turn:changed"
  | "queue:updated";

export interface RelayEvent {
  type: RelayEventType;
  relay: string;
  timestamp: number;
  data: unknown;
}

export type RelayEventListener = (event: RelayEvent) => void;
