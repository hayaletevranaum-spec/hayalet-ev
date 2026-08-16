import { loadContext, readLocale } from "../../../shared/host/context-state.js";
import { FEATURE_ID, ROOM_ID } from "../../../shared/host/feature-meta.js";
import { fillTemplate, translate } from "../../../shared/host/text.js";
import type { GameRoomContextSnapshot } from "../../../shared/host/context-state.js";
import type {
  GameRoomContextState,
  GameRoomSlotState,
} from "../../../shared/types/room-shell-contracts.js";
import {
  type BackgammonLegalMove,
  type BackgammonPoint,
  type BackgammonGameState,
  type BackgammonMatchHistoryEntry,
  MATCH_HISTORY_LIMIT,
  TERMINAL_RESULTS,
  buildBoardAscii,
  buildBoardStateHash,
  normalizeMatchHistory,
  normalizeState,
  STATUS_COPY,
} from "./state-core.js";
import {
  type InviteEntry,
  type PendingInvite,
  normalizeInviteInbox,
  normalizePendingInvite,
} from "./state-invites.js";

interface BackgammonStateApi {
  getState: (key: string) => unknown;
  setState: (key: string, value: unknown) => void;
  deleteState?: (key: string) => void;
  notifyRoom?: (event: string, payload: Record<string, unknown>) => void;
  getLocale?: () => unknown;
}

interface SerializedBackgammonState {
  roomId: string;
  featureId: string;
  board: BackgammonPoint[];
  boardAscii: string;
  boardHash: string;
  bar: Record<"user" | "ai", number>;
  off: Record<"user" | "ai", number>;
  dice: number[];
  legalMoves: BackgammonLegalMove[];
  active: boolean;
  awaitingMoveFrom: BackgammonGameState["awaitingMoveFrom"];
  result: string;
  winner: BackgammonGameState["winner"];
  selectedTarget: string;
  starter: BackgammonGameState["starter"];
  protocolDelivered: boolean;
  blockedReason: string;
  protocolPreface: string;
  matchId: string | null;
  inviteId: string | null;
  turnIndex: number;
  turnToken: string;
  localSessionId: string | null;
  remoteUserId: string | null;
  lastRemoteTransportMessageId: string | null;
  lastRemoteTurnIndex: number | null;
  pendingInvite: PendingInvite | null;
  inviteInbox: InviteEntry[];
  matchHistory: BackgammonMatchHistoryEntry[];
  opponent: GameRoomSlotState;
  opponentReady: boolean;
  user: {
    nickname: string;
  };
  scorePoints: number;
  status: string;
}

export function loadState(api: BackgammonStateApi): BackgammonGameState {
  return normalizeState(api.getState("backgammon-game"), readLocale(api));
}

export function saveState(
  api: BackgammonStateApi,
  state: BackgammonGameState
): BackgammonGameState {
  const normalized = normalizeState(state, readLocale(api));
  normalized.locale = readLocale(api);
  api.setState("locale", normalized.locale);
  api.setState("backgammon-game", normalized);
  return normalized;
}

export function loadInviteInbox(api: BackgammonStateApi): InviteEntry[] {
  return normalizeInviteInbox(api.getState("backgammon-invite-inbox"));
}

export function saveInviteInbox(api: BackgammonStateApi, inviteInbox: unknown): InviteEntry[] {
  const normalized = normalizeInviteInbox(inviteInbox);
  api.setState("backgammon-invite-inbox", normalized);
  return normalized;
}

export function loadPendingInvite(api: BackgammonStateApi): PendingInvite | null {
  return normalizePendingInvite(api.getState("backgammon-pending-invite"));
}

export function savePendingInvite(
  api: BackgammonStateApi,
  pendingInvite: unknown
): PendingInvite | null {
  const normalized = normalizePendingInvite(pendingInvite);
  if (normalized === null) {
    api.deleteState?.("backgammon-pending-invite");
    return null;
  }
  api.setState("backgammon-pending-invite", normalized);
  return normalized;
}

export function clearPendingInvite(api: BackgammonStateApi): void {
  api.deleteState?.("backgammon-pending-invite");
}

export function loadMatchHistory(api: BackgammonStateApi): BackgammonMatchHistoryEntry[] {
  return normalizeMatchHistory(api.getState("backgammon-match-history"));
}

export function saveMatchHistory(
  api: BackgammonStateApi,
  entries: BackgammonMatchHistoryEntry[]
): BackgammonMatchHistoryEntry[] {
  const normalized = normalizeMatchHistory(entries);
  api.setState("backgammon-match-history", normalized);
  return normalized;
}

export function appendMatchHistory(
  api: BackgammonStateApi,
  entry: BackgammonMatchHistoryEntry
): BackgammonMatchHistoryEntry[] {
  const existing = loadMatchHistory(api);
  const next = [entry, ...existing].slice(0, MATCH_HISTORY_LIMIT);
  return saveMatchHistory(api, next);
}

function buildMatchHistoryEntry(
  state: BackgammonGameState,
  context: GameRoomContextState | GameRoomContextSnapshot
): BackgammonMatchHistoryEntry | null {
  const result = state.result;
  if (result !== "user-win" && result !== "ai-win") {
    return null;
  }
  const opponent = getOpponentInfo(context, state);
  const id = state.matchId || state.inviteId || "tavla-" + state.target + "-" + String(Date.now());
  return {
    id,
    finishedAt: Date.now(),
    target: state.target,
    opponentNickname: opponent.nickname || state.opponentNickname || "Rakip",
    opponentAvatar: opponent.avatar || null,
    userNickname: context.user.nickname || "User",
    result,
    starter: state.starter,
    scorePoints: state.scorePoints || 1,
    boardHash: buildBoardStateHash(state.board, state.bar, state.off),
  };
}

export function createUs1OpponentFallback(state: BackgammonGameState): GameRoomSlotState {
  return {
    slotId: "us1",
    label: "US1",
    nickname: state.opponentNickname || "US1",
    avatar: null,
    assigned: state.remoteUserId !== null,
    connected: false,
    ready: false,
    dispatchable: state.remoteUserId !== null,
    state: "assigned",
    urlExcluded: false,
    providerId: "us1",
    accountId: null as string | null,
    remoteUserId: state.remoteUserId,
  };
}

export function getOpponentInfo(
  context: GameRoomContextState | GameRoomContextSnapshot,
  state: BackgammonGameState
): GameRoomSlotState {
  if (state.target === "us1") {
    const us1Slot = context.slots.us1;
    if (state.remoteUserId !== null && us1Slot.remoteUserId === state.remoteUserId) {
      return us1Slot;
    }
    if (state.remoteUserId === null) {
      return us1Slot;
    }
    return createUs1OpponentFallback(state);
  }

  return state.target === "ai2" ? context.slots.ai2 : context.slots.ai1;
}

export function resolveStatusText(
  state: BackgammonGameState,
  context: GameRoomContextState | GameRoomContextSnapshot
): string {
  const opponent = getOpponentInfo(context, state);
  return fillTemplate(translate(state.locale, STATUS_COPY, state.statusKey), {
    opponent: opponent.nickname,
  });
}

export function serializeState(
  api: BackgammonStateApi,
  state: BackgammonGameState,
  context: GameRoomContextState | GameRoomContextSnapshot
): SerializedBackgammonState {
  const opponent = getOpponentInfo(context, state);
  return {
    roomId: ROOM_ID,
    featureId: FEATURE_ID,
    board: state.board.map((point) => ({ ...point })),
    boardAscii: buildBoardAscii(state.board),
    boardHash: buildBoardStateHash(state.board, state.bar, state.off),
    bar: { ...state.bar },
    off: { ...state.off },
    dice: state.dice.slice(),
    legalMoves: state.legalMoves.map((move) => ({
      ...move,
      moves: move.moves.map((subMove) => ({ ...subMove })),
      diceUsed: move.diceUsed.slice(),
    })),
    active: state.active,
    awaitingMoveFrom: state.awaitingMoveFrom,
    result: state.result,
    winner: state.winner,
    selectedTarget: state.target,
    starter: state.starter,
    protocolDelivered: state.protocolDelivered,
    blockedReason: state.blockedReason,
    protocolPreface: state.protocolPreface,
    matchId: state.matchId,
    inviteId: state.inviteId,
    turnIndex: state.turnIndex,
    turnToken: state.turnToken,
    localSessionId: state.localSessionId,
    remoteUserId: state.remoteUserId,
    lastRemoteTransportMessageId: state.lastRemoteTransportMessageId,
    lastRemoteTurnIndex: state.lastRemoteTurnIndex,
    pendingInvite: loadPendingInvite(api),
    inviteInbox: loadInviteInbox(api),
    matchHistory: loadMatchHistory(api),
    opponent,
    opponentReady:
      state.target === "us1" ? opponent.dispatchable === true : opponent.assigned === true,
    user: {
      nickname: context.user.nickname,
    },
    scorePoints: state.scorePoints,
    status: resolveStatusText(state, context),
  };
}

export function pushRoomState(
  api: BackgammonStateApi,
  state: BackgammonGameState
): BackgammonGameState {
  const context = loadContext(api);
  const previousState = loadState(api);
  const savedState = saveState(api, state);
  if (TERMINAL_RESULTS.has(savedState.result) && !TERMINAL_RESULTS.has(previousState.result)) {
    const entry = buildMatchHistoryEntry(savedState, context);
    if (entry !== null) {
      appendMatchHistory(api, entry);
    }
  }
  api.notifyRoom?.("backgammon-state", {
    state: serializeState(api, savedState, context),
  });
  return savedState;
}

export function refreshRoomState(api: BackgammonStateApi): BackgammonGameState {
  return pushRoomState(api, loadState(api));
}
