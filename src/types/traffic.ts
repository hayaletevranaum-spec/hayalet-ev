import type { SlotId, ProviderId } from "./common.js";

export interface SlotState {
  slot: SlotId;
  provider: ProviderId | null;
  url: string | null;
  isLoading: boolean;
  isThinking: boolean;
  isSending: boolean;
  isReady: boolean;
  lastActivity: number;
  error?: string;
}

export type TrafficState = Record<SlotId, SlotState>;

export interface StateChangeEvent {
  slot: SlotId;
  field: keyof SlotState;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
}

export interface LoadingState {
  isLoading: boolean;
  startedAt?: number;
  progress?: number;
  url?: string;
}

export interface LoadingEvent {
  slot: SlotId;
  type: "start" | "progress" | "complete" | "error";
  url?: string;
  progress?: number;
  error?: string;
}

export interface ThinkingState {
  isThinking: boolean;
  startedAt?: number;
  indicator?: ThinkingIndicator;
}

export interface ThinkingIndicator {
  visible: boolean;
  element?: string;
  text?: string;
}

export interface ThinkingEvent {
  slot: SlotId;
  type: "start" | "stop";
  duration?: number;
}

export interface SendState {
  isSending: boolean;
  startedAt?: number;
  message?: string;
  attachments?: number;
}

export interface SendEvent {
  slot: SlotId;
  type: "start" | "complete" | "error";
  messageLength?: number;
  attachmentCount?: number;
  duration?: number;
  error?: string;
}

export interface ProbeResult {
  slot: SlotId;
  timestamp: number;
  isReady: boolean;
  isLoading: boolean;
  isThinking: boolean;
  hasInput: boolean;
  hasSendButton: boolean;
  messageCount?: number;
  error?: string;
}

export interface ProbeScriptOptions {
  provider: ProviderId;
  checkInput?: boolean;
  checkSendButton?: boolean;
  checkThinking?: boolean;
  checkMessages?: boolean;
}
