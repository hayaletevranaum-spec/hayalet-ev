import {
  type PatternRoomCaseReviewEvent,
  type PatternRoomCaseReviewHistoryEntry,
  type PatternRoomCaseReviewRuntimeState,
  type PatternRoomCaseReviewSession,
  type PatternRoomCaseReviewSessionStatus,
} from "../types/pattern-room-case-review-session.js";

const MAX_SEEN_REPLY_KEYS = 256;

function cloneAndFreezeRuntimeValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  const cached = seen.get(value);
  if (cached !== undefined) {
    return cached;
  }
  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    value.forEach((item) => {
      clone.push(cloneAndFreezeRuntimeValue(item, seen));
    });
    return Object.freeze(clone);
  }

  const clone: Record<string, unknown> = {};
  seen.set(value, clone);
  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    clone[key] = cloneAndFreezeRuntimeValue(entry, seen);
  });
  return Object.freeze(clone);
}

function freezeMetadata(
  metadata: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, unknown>> {
  return cloneAndFreezeRuntimeValue(metadata ?? {}, new WeakMap<object, unknown>()) as Readonly<
    Record<string, unknown>
  >;
}

function createHistoryEntry(
  session: PatternRoomCaseReviewSession,
  timestamp: string
): PatternRoomCaseReviewHistoryEntry {
  return Object.freeze({
    sessionId: session.sessionId,
    requestId: session.requestId,
    timestamp,
    role: session.role,
    packetHash: session.packetHash,
    responseHash: session.responseHash,
    state: session.status,
    operation: session.operation,
    attempt: session.attempt,
  });
}

function replaceHistoryEntry(
  history: readonly PatternRoomCaseReviewHistoryEntry[],
  session: PatternRoomCaseReviewSession,
  timestamp: string
): readonly PatternRoomCaseReviewHistoryEntry[] {
  const exactIndex = history.findIndex((entry) => {
    return entry.sessionId === session.sessionId && entry.requestId === session.requestId;
  });
  const previewIndex =
    exactIndex === -1 && session.requestId !== null
      ? history.findIndex(
          (entry) => entry.sessionId === session.sessionId && entry.requestId === null
        )
      : -1;
  const replacementIndex = exactIndex === -1 ? previewIndex : exactIndex;
  const nextEntry = createHistoryEntry(session, timestamp);

  if (replacementIndex === -1) {
    return Object.freeze([...history, nextEntry]);
  }

  return Object.freeze(
    history.map((entry, index) => (index === replacementIndex ? nextEntry : entry))
  );
}

function createState(
  previous: PatternRoomCaseReviewRuntimeState,
  session: PatternRoomCaseReviewSession,
  occurredAt: string,
  seenReplyKeys = previous.seenReplyKeys
): PatternRoomCaseReviewRuntimeState {
  return Object.freeze({
    activeSession: Object.freeze(session),
    history: replaceHistoryEntry(previous.history, session, occurredAt),
    seenReplyKeys: Object.freeze([...seenReplyKeys]),
    revision: previous.revision + 1,
  });
}

function isTerminalStatus(status: PatternRoomCaseReviewSessionStatus): boolean {
  return (
    status === "ready" ||
    status === "failed" ||
    status === "timed-out" ||
    status === "cancelled" ||
    status === "applied"
  );
}

function matchesActiveSession(
  state: PatternRoomCaseReviewRuntimeState,
  event: Exclude<PatternRoomCaseReviewEvent, { readonly type: "preview-created" }>
): event is typeof event & { readonly requestId: string | null } {
  const active = state.activeSession;
  if (active === null || active.sessionId !== event.sessionId) {
    return false;
  }

  if (!("requestId" in event)) {
    return false;
  }

  return event.requestId === active.requestId;
}

function reducePreviewCreated(
  state: PatternRoomCaseReviewRuntimeState,
  event: Extract<PatternRoomCaseReviewEvent, { readonly type: "preview-created" }>
): PatternRoomCaseReviewRuntimeState {
  if (
    state.activeSession?.sessionId === event.sessionId &&
    state.activeSession.lastEvent === "preview-created"
  ) {
    return state;
  }

  const session: PatternRoomCaseReviewSession = {
    sessionId: event.sessionId,
    role: event.role,
    reviewLabel: event.reviewLabel,
    status: "preview",
    requestId: null,
    operation: "start",
    parentSessionId: null,
    attempt: 1,
    startedAt: event.occurredAt,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    appliedAt: null,
    reply: null,
    result: null,
    applySummary: null,
    error: null,
    packetHash: event.packetHash,
    responseHash: null,
    metadata: freezeMetadata(event.metadata),
    lastEvent: event.type,
  };
  return createState(state, session, event.occurredAt);
}

function canStartDispatch(
  session: PatternRoomCaseReviewSession,
  event: Extract<PatternRoomCaseReviewEvent, { readonly type: "dispatch-started" }>
): boolean {
  if (session.requestId === event.requestId && session.lastEvent === event.type) {
    return false;
  }

  if (session.status === "dispatching" || session.status === "waiting-reply") {
    return false;
  }

  if (event.operation === "start") {
    return session.status === "preview";
  }

  if (event.operation === "retry") {
    return (
      session.status === "failed" ||
      session.status === "timed-out" ||
      session.status === "cancelled"
    );
  }

  return session.status === "preview";
}

function reduceDispatchStarted(
  state: PatternRoomCaseReviewRuntimeState,
  event: Extract<PatternRoomCaseReviewEvent, { readonly type: "dispatch-started" }>
): PatternRoomCaseReviewRuntimeState {
  const active = state.activeSession;
  if (active === null || active.sessionId !== event.sessionId || !canStartDispatch(active, event)) {
    return state;
  }

  const attempt =
    event.attempt === undefined || Number.isFinite(event.attempt) === false
      ? active.attempt
      : Math.max(1, Math.floor(event.attempt));
  const session: PatternRoomCaseReviewSession = {
    ...active,
    status: "dispatching",
    requestId: event.requestId,
    operation: event.operation,
    parentSessionId: event.parentSessionId ?? null,
    attempt,
    startedAt: event.occurredAt,
    completedAt: null,
    failedAt: null,
    cancelledAt: null,
    appliedAt: null,
    reply: null,
    result: null,
    applySummary: null,
    error: null,
    responseHash: null,
    metadata: freezeMetadata({
      ...active.metadata,
      operation: event.operation,
      attempt,
      ...(event.parentSessionId === undefined ? {} : { parentSessionId: event.parentSessionId }),
    }),
    lastEvent: event.type,
  };
  return createState(state, session, event.occurredAt);
}

function reduceDispatchProgress(
  state: PatternRoomCaseReviewRuntimeState,
  event: Extract<PatternRoomCaseReviewEvent, { readonly type: "dispatch-sent" | "waiting-reply" }>
): PatternRoomCaseReviewRuntimeState {
  if (!matchesActiveSession(state, event)) {
    return state;
  }

  const active = state.activeSession;
  const requiredPreviousEvent =
    event.type === "dispatch-sent" ? "dispatch-started" : "dispatch-sent";
  if (
    active === null ||
    isTerminalStatus(active.status) ||
    active.lastEvent !== requiredPreviousEvent
  ) {
    return state;
  }

  const session: PatternRoomCaseReviewSession = {
    ...active,
    status: event.type === "waiting-reply" ? "waiting-reply" : "dispatching",
    lastEvent: event.type,
  };
  return createState(state, session, event.occurredAt);
}

function createReplyKey(
  event: Extract<PatternRoomCaseReviewEvent, { readonly type: "reply-received" }>
): string {
  const replyIdentity = event.reply.messageId?.trim() || event.reply.responseHash;
  return `${event.requestId}:${replyIdentity}`;
}

function reduceReplyReceived(
  state: PatternRoomCaseReviewRuntimeState,
  event: Extract<PatternRoomCaseReviewEvent, { readonly type: "reply-received" }>
): PatternRoomCaseReviewRuntimeState {
  if (!matchesActiveSession(state, event)) {
    return state;
  }

  const active = state.activeSession;
  const replyKey = createReplyKey(event);
  if (
    active === null ||
    active.status !== "waiting-reply" ||
    active.lastEvent !== "waiting-reply" ||
    active.reply !== null ||
    isTerminalStatus(active.status) ||
    state.seenReplyKeys.includes(replyKey) ||
    (event.reply.clientRequestId !== null && event.reply.clientRequestId !== event.requestId)
  ) {
    return state;
  }

  const nextSeenReplyKeys = [...state.seenReplyKeys, replyKey].slice(-MAX_SEEN_REPLY_KEYS);
  const session: PatternRoomCaseReviewSession = {
    ...active,
    reply: Object.freeze({ ...event.reply }),
    responseHash: event.reply.responseHash,
    error: null,
    lastEvent: event.type,
  };
  return createState(state, session, event.occurredAt, nextSeenReplyKeys);
}

function reduceParsed(
  state: PatternRoomCaseReviewRuntimeState,
  event: Extract<PatternRoomCaseReviewEvent, { readonly type: "parsed" | "review-ready" }>
): PatternRoomCaseReviewRuntimeState {
  if (!matchesActiveSession(state, event)) {
    return state;
  }

  const active = state.activeSession;
  const ready = event.type === "review-ready";
  const requiredPreviousEvent = ready ? "parsed" : "reply-received";
  if (
    active === null ||
    active.reply === null ||
    active.lastEvent !== requiredPreviousEvent ||
    (ready && active.result === null) ||
    isTerminalStatus(active.status)
  ) {
    return state;
  }

  const session: PatternRoomCaseReviewSession = {
    ...active,
    status: ready ? "ready" : active.status,
    result: event.result,
    completedAt: ready ? event.occurredAt : active.completedAt,
    error: null,
    lastEvent: event.type,
  };
  return createState(state, session, event.occurredAt);
}

function reduceFailure(
  state: PatternRoomCaseReviewRuntimeState,
  event: Extract<
    PatternRoomCaseReviewEvent,
    {
      readonly type: "dispatch-failed" | "timeout" | "reply-invalid" | "parse-failed";
    }
  >
): PatternRoomCaseReviewRuntimeState {
  if (!matchesActiveSession(state, event)) {
    return state;
  }

  const active = state.activeSession;
  if (active === null || isTerminalStatus(active.status)) {
    return state;
  }

  const session: PatternRoomCaseReviewSession = {
    ...active,
    status: event.type === "timeout" ? "timed-out" : "failed",
    failedAt: event.occurredAt,
    error: Object.freeze({ ...event.error }),
    lastEvent: event.type,
  };
  return createState(state, session, event.occurredAt);
}

function reduceCancelled(
  state: PatternRoomCaseReviewRuntimeState,
  event: Extract<PatternRoomCaseReviewEvent, { readonly type: "cancelled" }>
): PatternRoomCaseReviewRuntimeState {
  if (!matchesActiveSession(state, event)) {
    return state;
  }

  const active = state.activeSession;
  if (active === null || isTerminalStatus(active.status)) {
    return state;
  }

  const reason = event.reason?.trim() ?? "";
  const session: PatternRoomCaseReviewSession = {
    ...active,
    status: "cancelled",
    cancelledAt: event.occurredAt,
    error: reason === "" ? null : Object.freeze({ code: "cancelled", message: reason }),
    lastEvent: event.type,
  };
  return createState(state, session, event.occurredAt);
}

function reduceApplied(
  state: PatternRoomCaseReviewRuntimeState,
  event: Extract<PatternRoomCaseReviewEvent, { readonly type: "review-applied" }>
): PatternRoomCaseReviewRuntimeState {
  if (!matchesActiveSession(state, event)) {
    return state;
  }

  const active = state.activeSession;
  if (active === null || active.status !== "ready") {
    return state;
  }

  const session: PatternRoomCaseReviewSession = {
    ...active,
    status: "applied",
    appliedAt: event.occurredAt,
    applySummary:
      event.summary === undefined
        ? null
        : Object.freeze({
            ...event.summary,
            warnings: Object.freeze([...event.summary.warnings]),
          }),
    metadata: freezeMetadata({ ...active.metadata, applyMode: event.mode }),
    lastEvent: event.type,
  };
  return createState(state, session, event.occurredAt);
}

export function createPatternRoomCaseReviewRuntimeState(): PatternRoomCaseReviewRuntimeState {
  return Object.freeze({
    activeSession: null,
    history: Object.freeze([]),
    seenReplyKeys: Object.freeze([]),
    revision: 0,
  });
}

export function isPatternRoomCaseReviewRuntimeState(
  value: unknown
): value is PatternRoomCaseReviewRuntimeState {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    (record["activeSession"] === null ||
      (typeof record["activeSession"] === "object" &&
        Array.isArray(record["activeSession"]) === false)) &&
    Array.isArray(record["history"]) &&
    Array.isArray(record["seenReplyKeys"]) &&
    record["seenReplyKeys"].every((entry) => typeof entry === "string") &&
    typeof record["revision"] === "number" &&
    Number.isInteger(record["revision"]) &&
    record["revision"] >= 0
  );
}

export function reducePatternRoomCaseReviewRuntimeState(
  state: PatternRoomCaseReviewRuntimeState,
  event: PatternRoomCaseReviewEvent
): PatternRoomCaseReviewRuntimeState {
  switch (event.type) {
    case "preview-created":
      return reducePreviewCreated(state, event);
    case "dispatch-started":
      return reduceDispatchStarted(state, event);
    case "dispatch-sent":
    case "waiting-reply":
      return reduceDispatchProgress(state, event);
    case "reply-received":
      return reduceReplyReceived(state, event);
    case "parsed":
    case "review-ready":
      return reduceParsed(state, event);
    case "dispatch-failed":
    case "timeout":
    case "reply-invalid":
    case "parse-failed":
      return reduceFailure(state, event);
    case "cancelled":
      return reduceCancelled(state, event);
    case "review-applied":
      return reduceApplied(state, event);
  }
}
