import type { Us1SessionEvent } from "@shared/us1-mail.js";

interface ResolveUs1ForceSelectConversationIdOptions {
  selectedConversationId?: string | null;
  resultConversationId?: string | null;
  sessionEvents?: Us1SessionEvent[] | null;
  targetRemoteUserId?: string | null;
  preserveExplicitNewSelection?: boolean | null;
}

function normalizeNonEmptyText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function resolveUs1ForceSelectConversationId(
  options: ResolveUs1ForceSelectConversationIdOptions
): string | undefined {
  const selectedConversationId = normalizeNonEmptyText(options.selectedConversationId);
  if (selectedConversationId !== null) {
    if (selectedConversationId !== "new") {
      return selectedConversationId;
    }
    if (options.preserveExplicitNewSelection === true) {
      return undefined;
    }
  }

  const targetRemoteUserId = normalizeNonEmptyText(options.targetRemoteUserId);
  const sessionEvents = Array.isArray(options.sessionEvents) ? options.sessionEvents : [];
  const latestConversationId =
    [...sessionEvents].reverse().find((sessionEvent) => {
      const remoteUserId = normalizeNonEmptyText(sessionEvent.remoteUserId);
      const localSessionId = normalizeNonEmptyText(sessionEvent.localSessionId);
      const conversationId = normalizeNonEmptyText(sessionEvent.conversationId);

      if (localSessionId === null || conversationId === null) {
        return false;
      }

      if (targetRemoteUserId !== null && remoteUserId !== targetRemoteUserId) {
        return false;
      }

      return true;
    })?.conversationId ?? null;

  return (
    normalizeNonEmptyText(latestConversationId) ??
    normalizeNonEmptyText(options.resultConversationId) ??
    undefined
  );
}
