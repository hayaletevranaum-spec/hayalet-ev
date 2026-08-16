import {
  DEFAULT_STARTER,
  DEFAULT_TARGET,
  applyLegalMove,
  applyOutcomeForSeat,
  buildBoardStateHash,
  buildMirroredBoardStateHash,
  createInitialState,
  createPendingInvite,
  getOpponentInfo,
  loadInviteInbox,
  loadPendingInvite,
  loadState,
  mirrorLegalMoveIdForOpponent,
  normalizeInviteInbox,
  prepareTurn,
  pushRoomState,
  refreshRoomState,
  resolveStatusText,
  saveInviteInbox,
  savePendingInvite,
  clearPendingInvite,
  sanitizeStarter,
  sanitizeTarget,
} from "./state.js";
import {
  readArgs,
  readInviteId,
  readLegalMoveId,
  readInviteNote,
  readRemoteUserId,
  readTurnToken,
} from "../../../shared/host/command-args.js";
import { loadContext, readLocale } from "../../../shared/host/context-state.js";
import type {
  GameRoomContextState,
  GameRoomSlotState,
} from "../../../shared/types/room-shell-contracts.js";
import { FEATURE_ID, ROOM_ID, TEAM_TETRIS_FEATURE_ID } from "../../../shared/host/feature-meta.js";
import {
  dispatchNextTeamTetrisTurn,
  parseTeamTetrisStartEventNote,
  pushTeamTetrisState,
  resetTeamTetrisState,
} from "../../team-tetris/host/runtime.js";
import { createTeamTetrisMatch } from "../../team-tetris/host/engine.js";
import { loadTeamTetrisState, saveTeamTetrisState } from "../../team-tetris/host/state.js";
import {
  buildInviteId,
  buildUs1InviteResponseText,
  buildUs1InviteText,
  buildUs1MoveText,
  buildUs1ResetText,
  commandMessage,
} from "./copy.js";
import {
  applyOpponentMove,
  isBlocked,
  resolveStateMatchId,
  sendAiTurnUpdate,
} from "./runtime-match.js";
import type { BackgammonRuntimeMatchApi } from "./runtime-match.js";
import { syncFromContext } from "./runtime-sync.js";
import { createGameRoomBackgammonUs1Runtime } from "./us1-runtime.js";

const BACKGAMMON_COMMAND_NAMES = {
  acceptInvite: "GameRoomBackgammonAcceptInvite",
  aiMove: "GameRoomBackgammonAiMove",
  rejectInvite: "GameRoomBackgammonRejectInvite",
  remoteMove: "GameRoomBackgammonRemoteMove",
  reset: "GameRoomBackgammonReset",
  start: "GameRoomBackgammonStart",
  userMove: "GameRoomBackgammonUserMove",
};

const backgammonUs1Runtime = createGameRoomBackgammonUs1Runtime({
  DEFAULT_STARTER: DEFAULT_STARTER,
  FEATURE_ID: FEATURE_ID,
  ROOM_ID: ROOM_ID,
  TEAM_TETRIS_FEATURE_ID: TEAM_TETRIS_FEATURE_ID,
  buildInviteId: buildInviteId,
  buildUs1InviteText: buildUs1InviteText,
  buildUs1MoveText: buildUs1MoveText,
  buildUs1ResetText: buildUs1ResetText,
  commandMessage: commandMessage,
  createInitialState: createInitialState,
  createPendingInvite: createPendingInvite as unknown as Parameters<
    typeof createGameRoomBackgammonUs1Runtime
  >[0]["createPendingInvite"],
  createTeamTetrisMatch: createTeamTetrisMatch,
  dispatchNextTeamTetrisTurn: dispatchNextTeamTetrisTurn,
  getOpponentInfo: getOpponentInfo,
  loadContext: loadContext,
  loadInviteInbox: loadInviteInbox,
  loadPendingInvite: loadPendingInvite,
  loadState: loadState,
  loadTeamTetrisState: loadTeamTetrisState,
  normalizeInviteInbox: normalizeInviteInbox,
  parseTeamTetrisStartEventNote: parseTeamTetrisStartEventNote,
  prepareTurn: prepareTurn,
  pushRoomState: pushRoomState,
  pushTeamTetrisState: pushTeamTetrisState,
  readLocale: readLocale,
  refreshRoomState: refreshRoomState,
  removePendingInvite: clearPendingInvite,
  resolveStateMatchId: resolveStateMatchId,
  resetTeamTetrisState: resetTeamTetrisState,
  saveInviteInbox: saveInviteInbox,
  savePendingInvite: savePendingInvite,
  saveTeamTetrisState: saveTeamTetrisState,
  toInviteApi: toUs1InviteApi,
});
const {
  applyInviteAcceptedState,
  clearUs1SyncLoop,
  ensureUs1SyncLoop,
  findInviteById,
  processRoomCommands,
  processRoomEvents,
  readIncomingInviteStarter,
  removeInviteFromInbox,
  sendUs1Invite,
  sendUs1Move,
  sendUs1Reset,
  syncUs1Mailbox,
} = backgammonUs1Runtime;

type BackgammonCommandResult = { success: boolean; message: string };
type BackgammonTarget = ReturnType<typeof sanitizeTarget>;
type BackgammonResetContext = {
  matchId: string;
  localSessionId: string | null;
  remoteUserId?: string | null;
};
type BackgammonUs1Runtime = ReturnType<typeof createGameRoomBackgammonUs1Runtime>;
type BackgammonUs1Api = Parameters<BackgammonUs1Runtime["sendUs1Invite"]>[0];
type BackgammonUs1InviteApi = Parameters<BackgammonUs1Runtime["sendUs1Move"]>[0];
type BackgammonInviteEntry = NonNullable<ReturnType<BackgammonUs1Runtime["findInviteById"]>>;
type CommandDispatchResult = { success?: boolean } | null | undefined;
type Us1MessageSendResult =
  | {
      success?: boolean;
      localSessionId?: unknown;
      conversationId?: unknown;
      remoteUserId?: unknown;
    }
  | null
  | undefined;

interface BackgammonRuntimeApi extends BackgammonUs1Api, BackgammonRuntimeMatchApi {}

function isSuccessfulDispatch(result: CommandDispatchResult): result is { success: true } {
  return !!result && result.success === true;
}

function isSuccessfulUs1MessageSend(
  result: Us1MessageSendResult
): result is { success: true; localSessionId?: unknown; conversationId?: unknown } {
  return !!result && result.success === true;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

async function dispatchUs1BridgeMessage(
  api: BackgammonRuntimeApi,
  msg: Record<string, unknown>
): Promise<Us1MessageSendResult> {
  if (typeof api.dispatchBridge !== "function") {
    return null;
  }

  const localSessionId =
    typeof msg["localSessionId"] === "string" && msg["localSessionId"].trim() !== ""
      ? msg["localSessionId"].trim()
      : null;
  const remoteUserId =
    typeof msg["remoteUserId"] === "string" && msg["remoteUserId"].trim() !== ""
      ? msg["remoteUserId"].trim()
      : null;
  const bridgeResultRaw = await api.dispatchBridge({
    action: "message.send",
    toSlot: "us1",
    ...(localSessionId !== null
      ? {
          sessionRef: {
            id: localSessionId,
          },
        }
      : {}),
    payload: {
      ...(typeof msg["text"] === "string" ? { text: msg["text"] } : {}),
      ...(remoteUserId !== null ? { remoteUserId } : {}),
      ...(msg["roomEvent"] !== undefined ? { roomEvent: msg["roomEvent"] } : {}),
      ...(msg["roomCommand"] !== undefined ? { roomCommand: msg["roomCommand"] } : {}),
    },
  });

  const bridgeResult =
    bridgeResultRaw !== null &&
    typeof bridgeResultRaw === "object" &&
    Array.isArray(bridgeResultRaw) === false
      ? (bridgeResultRaw as Record<string, unknown>)
      : null;
  if (bridgeResult === null || bridgeResult["success"] !== true) {
    return bridgeResult;
  }

  const data =
    bridgeResult["data"] !== null &&
    typeof bridgeResult["data"] === "object" &&
    Array.isArray(bridgeResult["data"]) === false
      ? (bridgeResult["data"] as Record<string, unknown>)
      : {};
  const session =
    bridgeResult["session"] !== null &&
    typeof bridgeResult["session"] === "object" &&
    Array.isArray(bridgeResult["session"]) === false
      ? ((bridgeResultRaw as Record<string, unknown>)["session"] as Record<string, unknown>)
      : {};
  return {
    success: true,
    ...(typeof session["id"] === "string" ? { localSessionId: session["id"] } : {}),
    ...(typeof session["conversationId"] === "string"
      ? { conversationId: session["conversationId"] }
      : {}),
    ...(typeof data["remoteUserId"] === "string" ? { remoteUserId: data["remoteUserId"] } : {}),
  };
}

function toUs1InviteApi(api: BackgammonRuntimeApi): BackgammonUs1InviteApi {
  const inviteApi: BackgammonUs1InviteApi = {
    getState(key: string) {
      return api.getState(key);
    },
    dispatchUs1BridgeMessage: async function (msg: Record<string, unknown>) {
      const result = await dispatchUs1BridgeMessage(api, msg);
      const response: { success: boolean; localSessionId?: string; conversationId?: string } = {
        success: result?.success === true,
      };
      const localSessionId = readNonEmptyString(result?.localSessionId);
      const conversationId = readNonEmptyString(result?.conversationId);
      if (localSessionId !== null) {
        response.localSessionId = localSessionId;
      }
      if (conversationId !== null) {
        response.conversationId = conversationId;
      }
      return response;
    },
    setState(key: string, value: unknown) {
      api.setState(key, value);
    },
  };
  if (typeof api.deleteState === "function") {
    inviteApi.deleteState = function (key: string) {
      api.deleteState?.(key);
    };
  }
  if (typeof api.getLocale === "function") {
    inviteApi.getLocale = function () {
      return api.getLocale?.();
    };
  }
  if (typeof api.notifyRoom === "function") {
    inviteApi.notifyRoom = function (event: string, payload: Record<string, unknown>) {
      api.notifyRoom?.(event, payload);
    };
  }
  return inviteApi;
}

function createUs1OpponentFallback(
  remoteUserId: string | null,
  opponentNickname: string
): GameRoomSlotState {
  return {
    slotId: "us1",
    label: "US1",
    nickname: opponentNickname || "US1",
    avatar: null,
    assigned: remoteUserId !== null,
    connected: false,
    ready: false,
    dispatchable: remoteUserId !== null,
    state: remoteUserId === null ? "empty" : "assigned",
    urlExcluded: false,
    providerId: "us1",
    accountId: null,
    remoteUserId,
  };
}

function readOpponentSlot(
  context: GameRoomContextState,
  target: BackgammonTarget,
  remoteUserId: string | null,
  opponentNickname: string
): GameRoomSlotState {
  if (target === "us1") {
    if (remoteUserId !== null && context.slots.us1.remoteUserId === remoteUserId) {
      return context.slots.us1;
    }
    if (remoteUserId === null) {
      return context.slots.us1;
    }
    return createUs1OpponentFallback(remoteUserId, opponentNickname);
  }
  return context.slots[target];
}

function canStartAgainstOpponent(target: BackgammonTarget, opponent: GameRoomSlotState): boolean {
  return target === "us1" ? opponent.dispatchable === true : opponent.assigned === true;
}

async function ensureAiOpponentConnection(
  api: BackgammonRuntimeApi,
  target: BackgammonTarget
): Promise<void> {
  if (target === "us1" || typeof api.dispatchBridge !== "function") {
    return;
  }
  try {
    await api.dispatchBridge({
      action: "connection.ensure",
      toSlot: target,
    });
  } catch {}
}

async function handleStart(
  api: BackgammonRuntimeApi,
  payload: unknown
): Promise<BackgammonCommandResult> {
  const locale = readLocale(api);
  const args = readArgs(payload);
  const target = sanitizeTarget(typeof args["target"] === "string" ? args["target"] : "");
  const starter = sanitizeStarter(typeof args["starter"] === "string" ? args["starter"] : "");
  const inviteNote = readInviteNote(payload);
  const context = loadContext(api) as GameRoomContextState;
  const opponent = readOpponentSlot(context, target, null, "");

  if (loadPendingInvite(api) !== null) {
    return { success: false, message: commandMessage(locale, "pendingInviteExists") };
  }

  if (canStartAgainstOpponent(target, opponent) !== true) {
    return { success: false, message: commandMessage(locale, "needReadyOpponent") };
  }

  const state = createInitialState(locale, target, starter);
  state.opponentNickname = opponent.nickname;
  state.remoteUserId = target === "us1" ? opponent.remoteUserId || null : null;
  state.protocolPreface = inviteNote;

  if (target === "us1") {
    if (state.remoteUserId === null) {
      return { success: false, message: commandMessage(locale, "needReadyOpponent") };
    }

    return await sendUs1Invite(api, state, inviteNote);
  }

  state.active = true;
  state.result = "pending";
  prepareTurn(state, starter === "ai" ? "ai" : "user");
  pushRoomState(api, state);

  if (starter === "ai") {
    const sendResult = await sendAiTurnUpdate(api, state, true);
    if (isSuccessfulDispatch(sendResult) === false) {
      return { success: false, message: commandMessage(locale, "dispatchFailed") };
    }
  } else {
    await ensureAiOpponentConnection(api, target);
  }

  return { success: true, message: commandMessage(locale, "started") };
}

async function handleReset(api: BackgammonRuntimeApi): Promise<BackgammonCommandResult> {
  const locale = readLocale(api);
  const currentState = loadState(api);
  const pendingInvite = loadPendingInvite(api);
  const currentMatchId = resolveStateMatchId(currentState);
  const resetRemoteUserId =
    pendingInvite !== null && pendingInvite.direction === "outgoing"
      ? pendingInvite.remoteUserId || null
      : currentState.target === "us1"
        ? currentState.remoteUserId
        : null;
  const resetContext: BackgammonResetContext | null =
    pendingInvite !== null && pendingInvite.direction === "outgoing" && pendingInvite.matchId
      ? {
          matchId: pendingInvite.matchId,
          localSessionId: pendingInvite.localSessionId,
          remoteUserId: pendingInvite.remoteUserId,
        }
      : currentState.target === "us1" &&
          currentState.remoteUserId !== null &&
          currentMatchId !== null
        ? {
            matchId: currentMatchId,
            localSessionId: currentState.localSessionId,
            remoteUserId: currentState.remoteUserId,
          }
        : null;

  let remoteResetSent = true;
  if (resetContext !== null) {
    if (resetRemoteUserId === null) {
      remoteResetSent = false;
    } else {
      const sendResult = await sendUs1Reset(toUs1InviteApi(api), resetContext);
      remoteResetSent = isSuccessfulDispatch(sendResult);
    }
  }

  clearPendingInvite(api);
  const state = createInitialState(locale, DEFAULT_TARGET, DEFAULT_STARTER);
  pushRoomState(api, state);
  return {
    success: remoteResetSent,
    message: commandMessage(locale, remoteResetSent ? "reset" : "resetRemoteFailed"),
  };
}

async function handleUserMove(
  api: BackgammonRuntimeApi,
  payload: unknown
): Promise<BackgammonCommandResult> {
  const state = loadState(api);
  const locale = state.locale;
  const legalMoveId = readLegalMoveId(payload);
  const turnToken = readTurnToken(payload);

  if (state.active !== true) {
    return { success: false, message: commandMessage(locale, "noActiveGame") };
  }
  if (isBlocked(state)) {
    return { success: false, message: commandMessage(locale, "blockedGame") };
  }
  if (state.awaitingMoveFrom !== "user") {
    return { success: false, message: commandMessage(locale, "notUserTurn") };
  }
  if (turnToken !== null && turnToken !== state.turnToken) {
    return { success: false, message: commandMessage(locale, "staleRemoteMove") };
  }
  if (state.target === "us1") {
    if (state.remoteUserId === null) {
      return { success: false, message: commandMessage(locale, "needReadyOpponent") };
    }
  }

  const outboundTurnIndex = state.turnIndex;
  const selectedMove =
    legalMoveId !== null ? state.legalMoves.find((move) => move.id === legalMoveId) : undefined;
  const boardHashBeforeMove =
    state.target === "us1"
      ? buildMirroredBoardStateHash(state.board, state.bar, state.off)
      : buildBoardStateHash(state.board, state.bar, state.off);
  const outboundTurnToken = turnToken || state.turnToken;
  const outboundLegalMoveId =
    state.target === "us1" && selectedMove !== undefined
      ? mirrorLegalMoveIdForOpponent(selectedMove)
      : legalMoveId;

  if (legalMoveId === null || applyLegalMove(state, "user", legalMoveId) !== true) {
    return { success: false, message: commandMessage(locale, "invalidMove") };
  }

  state.turnIndex += 1;
  applyOutcomeForSeat(state, "user");

  const finished = state.result === "user-win";
  if (!finished) {
    prepareTurn(state, "ai");
  }

  if (state.target === "us1") {
    const sendResult = await sendUs1Move(toUs1InviteApi(api), state, {
      legalMoveId: outboundLegalMoveId || legalMoveId,
      turnToken: outboundTurnToken,
      turnIndex: outboundTurnIndex,
      boardHashBeforeMove: boardHashBeforeMove,
    });
    if (isSuccessfulDispatch(sendResult) === false) {
      return { success: false, message: commandMessage(locale, "dispatchFailed") };
    }
    return {
      success: true,
      message: finished
        ? resolveStatusText(state, loadContext(api))
        : commandMessage(locale, "moveSent"),
    };
  }

  if (finished) {
    pushRoomState(api, state);
    return {
      success: true,
      message: resolveStatusText(state, loadContext(api)),
    };
  }

  pushRoomState(api, state);

  const sendResult = await sendAiTurnUpdate(api, state, state.protocolDelivered !== true);
  if (isSuccessfulDispatch(sendResult) === false) {
    return { success: false, message: commandMessage(locale, "dispatchFailed") };
  }

  return { success: true, message: commandMessage(locale, "moveSent") };
}

async function handleAiMove(
  api: BackgammonRuntimeApi,
  payload: unknown
): Promise<BackgammonCommandResult> {
  const state = loadState(api);
  return await applyOpponentMove(api, payload, state.target, false);
}

async function handleRemoteMove(
  api: BackgammonRuntimeApi,
  payload: unknown
): Promise<BackgammonCommandResult> {
  return await applyOpponentMove(api, payload, "us1", true);
}

async function handleAcceptInvite(
  api: BackgammonRuntimeApi,
  payload: unknown
): Promise<BackgammonCommandResult> {
  const matchId = readInviteId(payload);
  const remoteUserId = readRemoteUserId(payload);
  const inviteEntry: BackgammonInviteEntry | null =
    matchId !== null ? findInviteById(api, matchId, remoteUserId || "") : null;
  if (inviteEntry === null) {
    return { success: false, message: commandMessage(readLocale(api), "inviteNotFound") };
  }

  if (loadPendingInvite(api) !== null || loadState(api).active === true) {
    return { success: false, message: commandMessage(readLocale(api), "pendingInviteExists") };
  }

  const sendResult = await dispatchUs1BridgeMessage(api, {
    localSessionId: inviteEntry.localSessionId || null,
    remoteUserId: inviteEntry.remoteUserId,
    text: buildUs1InviteResponseText("accept", inviteEntry),
    roomEvent: {
      roomId: ROOM_ID,
      featureId: FEATURE_ID,
      inviteId: inviteEntry.inviteId,
      matchId: inviteEntry.matchId || inviteEntry.inviteId,
      eventType: "accept",
      starter: inviteEntry.starter,
      note: inviteEntry.note || null,
    },
  });

  if (isSuccessfulUs1MessageSend(sendResult) === false) {
    return { success: false, message: commandMessage(readLocale(api), "inviteAcceptFailed") };
  }

  inviteEntry.localSessionId =
    readNonEmptyString(sendResult.localSessionId) || inviteEntry.localSessionId;
  inviteEntry.conversationId =
    readNonEmptyString(sendResult.conversationId) || inviteEntry.conversationId;
  applyInviteAcceptedState(api, inviteEntry, readIncomingInviteStarter(inviteEntry));
  await syncUs1Mailbox(api, "invite-accepted");
  return { success: true, message: commandMessage(readLocale(api), "inviteAccepted") };
}

async function handleRejectInvite(
  api: BackgammonRuntimeApi,
  payload: unknown
): Promise<BackgammonCommandResult> {
  const matchId = readInviteId(payload);
  const remoteUserId = readRemoteUserId(payload);
  const inviteEntry: BackgammonInviteEntry | null =
    matchId !== null ? findInviteById(api, matchId, remoteUserId || "") : null;
  if (inviteEntry === null) {
    return { success: false, message: commandMessage(readLocale(api), "inviteNotFound") };
  }

  const sendResult = await dispatchUs1BridgeMessage(api, {
    localSessionId: inviteEntry.localSessionId || null,
    remoteUserId: inviteEntry.remoteUserId,
    text: buildUs1InviteResponseText("reject", inviteEntry),
    roomEvent: {
      roomId: ROOM_ID,
      featureId: FEATURE_ID,
      inviteId: inviteEntry.inviteId,
      matchId: inviteEntry.matchId || inviteEntry.inviteId,
      eventType: "reject",
      starter: inviteEntry.starter,
      note: inviteEntry.note || null,
    },
  });

  if (isSuccessfulUs1MessageSend(sendResult) === false) {
    return { success: false, message: commandMessage(readLocale(api), "inviteRejectFailed") };
  }

  removeInviteFromInbox(api, inviteEntry.matchId || inviteEntry.inviteId, inviteEntry.remoteUserId);
  refreshRoomState(api);
  await syncUs1Mailbox(api, "invite-rejected");
  return { success: true, message: commandMessage(readLocale(api), "inviteRejected") };
}

export {
  BACKGAMMON_COMMAND_NAMES,
  handleAcceptInvite,
  handleAiMove,
  handleRejectInvite,
  handleRemoteMove,
  handleReset,
  handleStart,
  handleUserMove,
  clearUs1SyncLoop,
  ensureUs1SyncLoop,
  processRoomCommands,
  processRoomEvents,
  syncFromContext,
  syncUs1Mailbox,
};
