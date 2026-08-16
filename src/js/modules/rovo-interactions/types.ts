export const ROVO_INTERACTION_TOKEN_PREFIX = "[rovo-ui:v1:";

export type RovoInteractionVersion = 1;

export interface RovoInteractionBasePayload {
  id: string;
  version: RovoInteractionVersion;
  type: "change-approval" | "plan-harder-local";
  title: string;
  fallbackText: string;
  body?: string;
  packId?: string;
}

export interface RovoInteractionChoiceOption {
  value: string;
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface RovoInteractionChoiceQuestion {
  id: string;
  kind: "single-choice";
  label: string;
  helpText?: string;
  required?: boolean;
  options: RovoInteractionChoiceOption[];
}

export interface RovoInteractionTextQuestion {
  id: string;
  kind: "short-text" | "long-text";
  label: string;
  helpText?: string;
  required?: boolean;
  placeholder?: string;
}

export type RovoInteractionQuestion = RovoInteractionChoiceQuestion | RovoInteractionTextQuestion;

export interface RovoChangeApprovalPayload extends RovoInteractionBasePayload {
  type: "change-approval";
  canonicalReply: string;
  canonicalReplyLabel?: string;
  modeLabel?: string;
  counterpartyLabel?: string;
  issue: string;
  solution: string;
  files?: string[];
}

export interface RovoPlanHarderLocalPayload extends RovoInteractionBasePayload {
  type: "plan-harder-local";
  submitLabel?: string;
  clearLabel?: string;
  responseTitle?: string;
  responsePreamble?: string;
  persistDraft?: boolean;
  questions: RovoInteractionQuestion[];
}

export type RovoInteractionPayload = RovoChangeApprovalPayload | RovoPlanHarderLocalPayload;

export interface ParsedRovoInteraction {
  payload: RovoInteractionPayload;
  displayText: string;
  rawToken: string;
}

export interface RovoInteractionActivationSnapshot {
  active: boolean;
  providerId: string;
  assistantAccountId: string | null;
  appMode: "terminal" | "app" | "ghost-agent" | "transitioning" | "conflict" | null;
  effectiveMode:
    | "terminal"
    | "app"
    | "ghost-agent"
    | "transitioning"
    | "conflict"
    | "opencode-terminal-mode"
    | "other-provider-cli"
    | null;
  assistantRuntimeMode: "terminal" | "soft" | "ghost-agent" | null;
  assistantRuntimePhase: "idle" | "preparing-handoff" | "in-ghost" | "returning" | null;
  opencodeServeRunning: boolean;
  reason: string;
}
