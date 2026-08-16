export type RepairChatRole = "operator" | "ai";

export interface RepairChatTurn {
  id: string;
  role: RepairChatRole;
  text: string;
  occurredAt: string;
  contextRefs: string[];
}

export interface RepairChatState {
  turns: RepairChatTurn[];
  composerDraft: string;
  pendingReplyId: string | null;
}
