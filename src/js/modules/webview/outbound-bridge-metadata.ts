interface PendingOutboundBridgeMessage {
  messageText: string;
  clientRequestId: string;
  brokerMessageId?: string;
  createdAt: number;
}

type BridgeSyncMessage = Record<string, unknown> & {
  role?: unknown;
  clientRequestId?: unknown;
  brokerMessageId?: unknown;
  text?: unknown;
  content?: unknown;
};

const OUTBOUND_BRIDGE_METADATA_TTL_MS = 2 * 60_000;
const pendingOutboundBridgeMessages = new Map<string, PendingOutboundBridgeMessage[]>();

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function matchesPendingBridgeText(expected: string, actual: string): boolean {
  const normalizedExpected = normalizeText(expected);
  const normalizedActual = normalizeText(actual);

  if (normalizedExpected === "") {
    return normalizedActual === "" || normalizedActual === "[image]";
  }

  return normalizedExpected === normalizedActual;
}

function prunePendingOutboundBridgeMessages(provider?: string, now = Date.now()): void {
  const pruneProvider = (key: string): void => {
    const entries = pendingOutboundBridgeMessages.get(key) ?? [];
    const nextEntries = entries.filter(
      (entry) => now - entry.createdAt <= OUTBOUND_BRIDGE_METADATA_TTL_MS
    );
    if (nextEntries.length > 0) {
      pendingOutboundBridgeMessages.set(key, nextEntries);
      return;
    }
    pendingOutboundBridgeMessages.delete(key);
  };

  if (typeof provider === "string" && provider.trim() !== "") {
    pruneProvider(provider.trim());
    return;
  }

  [...pendingOutboundBridgeMessages.keys()].forEach((key) => {
    pruneProvider(key);
  });
}

export function clearPendingOutboundBridgeMessages(provider?: string): void {
  if (typeof provider === "string" && provider.trim() !== "") {
    pendingOutboundBridgeMessages.delete(provider.trim());
    return;
  }

  pendingOutboundBridgeMessages.clear();
}

export function rememberOutboundBridgeMessage(
  provider: string,
  payload: {
    messageText?: string;
    clientRequestId?: string;
    brokerMessageId?: string;
  }
): void {
  const normalizedProvider = provider.trim();
  const clientRequestId = normalizeText(payload.clientRequestId);
  if (normalizedProvider === "" || clientRequestId === "") {
    return;
  }

  prunePendingOutboundBridgeMessages(normalizedProvider);

  const nextEntry: PendingOutboundBridgeMessage = {
    messageText: typeof payload.messageText === "string" ? payload.messageText : "",
    clientRequestId,
    createdAt: Date.now(),
    ...(normalizeText(payload.brokerMessageId) !== ""
      ? { brokerMessageId: normalizeText(payload.brokerMessageId) }
      : {}),
  };

  const currentEntries = pendingOutboundBridgeMessages.get(normalizedProvider) ?? [];
  const dedupedEntries = currentEntries.filter(
    (entry) => entry.clientRequestId !== clientRequestId
  );
  pendingOutboundBridgeMessages.set(normalizedProvider, [...dedupedEntries, nextEntry]);
}

export function applyPendingOutboundBridgeMetadata<T extends BridgeSyncMessage>(
  provider: string,
  messages: T[]
): T[] {
  const normalizedProvider = provider.trim();
  if (normalizedProvider === "" || messages.length === 0) {
    return messages;
  }

  prunePendingOutboundBridgeMessages(normalizedProvider);

  const pendingEntries = pendingOutboundBridgeMessages.get(normalizedProvider) ?? [];
  if (pendingEntries.length === 0) {
    return messages;
  }

  const nextMessages = [...messages];
  const usedEntryIndexes = new Set<number>();

  for (let messageIndex = nextMessages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = nextMessages[messageIndex];
    if (message === undefined) {
      continue;
    }

    const role = normalizeText(message["role"]);
    if (role !== "user") {
      continue;
    }

    if (
      normalizeText(message["clientRequestId"]) !== "" ||
      normalizeText(message["brokerMessageId"]) !== ""
    ) {
      continue;
    }

    const messageText =
      typeof message["text"] === "string"
        ? message["text"]
        : typeof message["content"] === "string"
          ? message["content"]
          : "";

    for (let entryIndex = pendingEntries.length - 1; entryIndex >= 0; entryIndex -= 1) {
      if (usedEntryIndexes.has(entryIndex)) {
        continue;
      }

      const pendingEntry = pendingEntries[entryIndex];
      if (pendingEntry === undefined) {
        continue;
      }
      if (!matchesPendingBridgeText(pendingEntry.messageText, messageText)) {
        continue;
      }

      nextMessages[messageIndex] = {
        ...message,
        clientRequestId: pendingEntry.clientRequestId,
        ...(typeof pendingEntry.brokerMessageId === "string" && pendingEntry.brokerMessageId !== ""
          ? { brokerMessageId: pendingEntry.brokerMessageId }
          : {}),
      };
      usedEntryIndexes.add(entryIndex);
      break;
    }
  }

  if (usedEntryIndexes.size === 0) {
    return messages;
  }

  const remainingEntries = pendingEntries.filter(
    (_, index) => usedEntryIndexes.has(index) !== true
  );
  if (remainingEntries.length > 0) {
    pendingOutboundBridgeMessages.set(normalizedProvider, remainingEntries);
  } else {
    pendingOutboundBridgeMessages.delete(normalizedProvider);
  }

  return nextMessages;
}
