export interface SnapshotMessage {
  id: string;
  role: string;
  content?: string;
  text?: string;
  author?: string;
  createdAt?: number;
}

export interface SnapshotAttachment {
  messageId: string;
  originalName?: string;
  storedName?: string;
  storedPath?: string;
  mimeType?: string;
}

export interface RenderSnapshot {
  conversationId: string;
  messageCount: number;
  attachmentCount: number;
  messageHash: number;
  attachmentHash: number;
}

const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

function updateHash(hash: number, value: string): number {
  let next = hash >>> 0;
  for (let i = 0; i < value.length; i += 1) {
    next ^= value.charCodeAt(i);
    next = Math.imul(next, FNV_PRIME) >>> 0;
  }
  return next >>> 0;
}

function hashMessages(messages: SnapshotMessage[]): number {
  let hash = FNV_OFFSET_BASIS;
  for (const msg of messages) {
    hash = updateHash(hash, msg.id);
    hash = updateHash(hash, msg.role);
    hash = updateHash(hash, String(msg.createdAt ?? ""));
    hash = updateHash(hash, msg.author ?? "");
    hash = updateHash(hash, msg.content ?? "");
    hash = updateHash(hash, msg.text ?? "");
  }
  return hash >>> 0;
}

function hashAttachments(attachments: SnapshotAttachment[]): number {
  let hash = FNV_OFFSET_BASIS;
  for (const att of attachments) {
    hash = updateHash(hash, att.messageId);
    hash = updateHash(hash, att.originalName ?? "");
    hash = updateHash(hash, att.storedName ?? "");
    hash = updateHash(hash, att.storedPath ?? "");
    hash = updateHash(hash, att.mimeType ?? "");
  }
  return hash >>> 0;
}

export function buildRenderSnapshot(
  conversationId: string,
  messages: SnapshotMessage[],
  attachments: SnapshotAttachment[]
): RenderSnapshot {
  return {
    conversationId,
    messageCount: messages.length,
    attachmentCount: attachments.length,
    messageHash: hashMessages(messages),
    attachmentHash: hashAttachments(attachments),
  };
}

export function shouldSkipRender(
  previous: RenderSnapshot | undefined,
  next: RenderSnapshot
): boolean {
  if (!previous) {
    return false;
  }

  return (
    previous.conversationId === next.conversationId &&
    previous.messageCount === next.messageCount &&
    previous.attachmentCount === next.attachmentCount &&
    previous.messageHash === next.messageHash &&
    previous.attachmentHash === next.attachmentHash
  );
}

export function buildAttachmentsByMessage(
  attachments: SnapshotAttachment[]
): Record<string, SnapshotAttachment[]> {
  const map: Record<string, SnapshotAttachment[]> = {};
  for (const att of attachments) {
    const existing = map[att.messageId] ?? [];
    existing.push(att);
    map[att.messageId] = existing;
  }
  return map;
}

export function getScrollTopAfterPrepend(params: {
  previousScrollTop: number;
  previousHeight: number;
  nextHeight: number;
}): number {
  const delta = Math.max(0, params.nextHeight - params.previousHeight);
  return Math.max(0, params.previousScrollTop + delta);
}

function isSameMessage(a: SnapshotMessage, b: SnapshotMessage): boolean {
  return (
    a.id === b.id &&
    a.role === b.role &&
    (a.content ?? "") === (b.content ?? "") &&
    (a.text ?? "") === (b.text ?? "") &&
    (a.author ?? "") === (b.author ?? "") &&
    (a.createdAt ?? undefined) === (b.createdAt ?? undefined)
  );
}

function isSameAttachment(a: SnapshotAttachment, b: SnapshotAttachment): boolean {
  return (
    a.messageId === b.messageId &&
    (a.originalName ?? "") === (b.originalName ?? "") &&
    (a.storedName ?? "") === (b.storedName ?? "") &&
    (a.storedPath ?? "") === (b.storedPath ?? "") &&
    (a.mimeType ?? "") === (b.mimeType ?? "")
  );
}

function isSameAttachmentList(a: SnapshotAttachment[], b: SnapshotAttachment[]): boolean {
  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (!left || !right || !isSameAttachment(left, right)) {
      return false;
    }
  }

  return true;
}

export interface IncrementalAppendDecision {
  canAppend: boolean;
  appendStart: number;
}

export function canUseIncrementalAppend(params: {
  previousMessages: SnapshotMessage[];
  nextMessages: SnapshotMessage[];
  previousAttachmentsByMessage: Record<string, SnapshotAttachment[]>;
  nextAttachmentsByMessage: Record<string, SnapshotAttachment[]>;
}): IncrementalAppendDecision {
  const { previousMessages, nextMessages, previousAttachmentsByMessage, nextAttachmentsByMessage } =
    params;

  if (previousMessages.length === 0 || nextMessages.length <= previousMessages.length) {
    return { canAppend: false, appendStart: 0 };
  }

  for (let i = 0; i < previousMessages.length; i += 1) {
    const prevMessage = previousMessages[i];
    const nextMessage = nextMessages[i];

    if (!prevMessage || !nextMessage || !isSameMessage(prevMessage, nextMessage)) {
      return { canAppend: false, appendStart: 0 };
    }

    const prevAttachments = previousAttachmentsByMessage[prevMessage.id] ?? [];
    const nextAttachments = nextAttachmentsByMessage[nextMessage.id] ?? [];
    if (!isSameAttachmentList(prevAttachments, nextAttachments)) {
      return { canAppend: false, appendStart: 0 };
    }
  }

  return { canAppend: true, appendStart: previousMessages.length };
}

export function shouldAutoScrollToBottom(params: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  thresholdPx?: number;
}): boolean {
  const thresholdPx = params.thresholdPx ?? 120;

  if (params.scrollHeight <= 0) {
    return true;
  }

  const distanceFromBottom = params.scrollHeight - (params.scrollTop + params.clientHeight);
  return distanceFromBottom <= thresholdPx;
}
