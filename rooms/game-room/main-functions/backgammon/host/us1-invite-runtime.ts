import type { BackgammonGameState } from "./state-core.js";
import type { InviteEntry } from "./state-invites.js";
import type { GameRoomContextState } from "../../../shared/types/room-shell-contracts.js";
import { buildUs1RoomBridgeCommand } from "../../../shared/host/slot-bridge-command.js";

interface Us1Api {
  dispatchUs1BridgeMessage: (
    msg: Record<string, unknown> & { remoteUserId?: string | null }
  ) => Promise<{ success: boolean; localSessionId?: string; conversationId?: string }>;
  getState: (key: string) => unknown;
  setState: (key: string, value: unknown) => void;
  deleteState?: (key: string) => void;
  getLocale?: () => unknown;
  notifyRoom?: (event: string, payload: Record<string, unknown>) => void;
}

interface Us1InviteRuntimeDeps {
  FEATURE_ID: string;
  ROOM_ID: string;
  buildInviteId: () => string;
  buildUs1InviteText: (
    state: BackgammonGameState,
    context: GameRoomContextState,
    note: string
  ) => string;
  buildUs1MoveText: (
    matchId: string,
    turnIndex: number,
    boardHashBeforeMove: string,
    legalMoveId: string,
    turnToken: string
  ) => string;
  buildUs1ResetText: (matchId: string) => string;
  commandMessage: (locale: unknown, key: string, params?: Record<string, unknown>) => string;
  createInitialState: (locale: unknown, target: string, starter: string) => BackgammonGameState;
  createPendingInvite: (
    direction: string,
    inviteEntry: Record<string, unknown>
  ) => Record<string, unknown>;
  getOpponentInfo: (
    context: GameRoomContextState,
    state: BackgammonGameState
  ) => { remoteUserId?: string | null; nickname: string; ready?: boolean; dispatchable?: boolean };
  loadContext: (api: Us1Api) => GameRoomContextState;
  loadInviteInbox: (api: Us1Api) => InviteEntry[];
  normalizeInviteInbox: (value: unknown) => InviteEntry[];
  prepareTurn: (state: BackgammonGameState, seat: "ai" | "user") => BackgammonGameState;
  pushRoomState: (api: Us1Api, state: BackgammonGameState) => BackgammonGameState;
  readLocale: (api: Us1Api) => "tr" | "en";
  removePendingInvite: (api: Us1Api) => void;
  resolveStateMatchId: (state: BackgammonGameState) => string | null;
  saveInviteInbox: (api: Us1Api, inbox: InviteEntry[]) => void;
  savePendingInvite: (api: Us1Api, pending: Record<string, unknown>) => void;
}

export function createGameRoomBackgammonUs1InviteRuntime(deps: Us1InviteRuntimeDeps) {
  const {
    FEATURE_ID,
    ROOM_ID,
    buildInviteId,
    buildUs1InviteText,
    buildUs1MoveText,
    buildUs1ResetText,
    commandMessage,
    createInitialState,
    createPendingInvite,
    getOpponentInfo,
    loadContext,
    loadInviteInbox,
    normalizeInviteInbox,
    prepareTurn,
    pushRoomState,
    readLocale,
    removePendingInvite,
    resolveStateMatchId,
    saveInviteInbox,
    savePendingInvite,
  } = deps;

  function matchesInviteEntry(
    entry: InviteEntry | null,
    inviteId: string,
    remoteUserId: string | null
  ) {
    if (!entry) {
      return false;
    }
    const matchesInviteId = entry.inviteId === inviteId || entry.matchId === inviteId;
    if (matchesInviteId !== true) {
      return false;
    }
    if (remoteUserId === null || remoteUserId === "") {
      return true;
    }
    return entry.remoteUserId === remoteUserId;
  }

  function findInviteById(api: Us1Api, inviteId: string, remoteUserId: string) {
    return (
      loadInviteInbox(api).find(function (entry: InviteEntry) {
        return matchesInviteEntry(entry, inviteId, remoteUserId || null);
      }) || null
    );
  }

  function buildInviteInboxSnapshotKey(inviteInbox: InviteEntry[]): string {
    return JSON.stringify(
      inviteInbox.map((entry) => ({
        roomId: entry.roomId,
        featureId: entry.featureId,
        inviteId: entry.inviteId,
        matchId: entry.matchId,
        remoteUserId: entry.remoteUserId,
        nickname: entry.nickname,
        senderEmail: entry.senderEmail,
        note: entry.note,
        starter: entry.starter,
        localSessionId: entry.localSessionId,
        conversationId: entry.conversationId,
        transportMessageId: entry.transportMessageId,
        sentAt: entry.sentAt,
      }))
    );
  }

  function syncInviteInboxFromSnapshot(api: Us1Api, roomInviteInbox: unknown): boolean {
    const currentInviteInbox = loadInviteInbox(api);
    const nextInviteInbox = normalizeInviteInbox(roomInviteInbox).filter(function (
      entry: InviteEntry
    ) {
      return (
        entry.roomId === ROOM_ID &&
        entry.featureId === FEATURE_ID &&
        entry.inviteId !== "" &&
        entry.remoteUserId !== ""
      );
    });
    if (
      buildInviteInboxSnapshotKey(currentInviteInbox) ===
      buildInviteInboxSnapshotKey(nextInviteInbox)
    ) {
      return false;
    }
    saveInviteInbox(api, nextInviteInbox);
    return true;
  }

  function removeInviteFromInbox(api: Us1Api, inviteId: string, remoteUserId: string) {
    const nextInviteInbox = loadInviteInbox(api).filter(function (entry: InviteEntry) {
      return matchesInviteEntry(entry, inviteId, remoteUserId || null) !== true;
    });
    saveInviteInbox(api, nextInviteInbox);
  }

  function applyInviteAcceptedState(api: Us1Api, inviteEntry: InviteEntry, starter: "ai" | "user") {
    const state = createInitialState(readLocale(api), "us1", starter);
    state.active = true;
    state.result = "pending";
    state.matchId = inviteEntry.matchId || inviteEntry.inviteId;
    state.inviteId = inviteEntry.inviteId || inviteEntry.matchId || null;
    state.turnIndex = 0;
    state.localSessionId = inviteEntry.localSessionId || null;
    state.remoteUserId = inviteEntry.remoteUserId;
    state.opponentNickname = inviteEntry.nickname;
    state.protocolDelivered = true;
    prepareTurn(state, starter === "ai" ? "ai" : "user");
    removePendingInvite(api);
    removeInviteFromInbox(
      api,
      inviteEntry.matchId || inviteEntry.inviteId,
      inviteEntry.remoteUserId
    );
    return pushRoomState(api, state);
  }

  function readIncomingInviteStarter(inviteEntry: InviteEntry): "ai" | "user" {
    return inviteEntry.starter === "opponent" ? "user" : "ai";
  }

  function readOutgoingInviteStarter(inviteEntry: InviteEntry): "ai" | "user" {
    return inviteEntry.starter === "opponent" ? "ai" : "user";
  }

  async function sendUs1Invite(
    api: Us1Api,
    state: BackgammonGameState,
    inviteNote: string,
    syncUs1Mailbox: (api: Us1Api, reason: string) => Promise<void>
  ) {
    const context = loadContext(api);
    const matchId = buildInviteId();
    const opponent = getOpponentInfo(context, state);
    const sendResult = await api.dispatchUs1BridgeMessage({
      remoteUserId: opponent.remoteUserId || state.remoteUserId || null,
      text: buildUs1InviteText(state, context, inviteNote),
      roomEvent: {
        roomId: ROOM_ID,
        featureId: FEATURE_ID,
        inviteId: matchId,
        matchId: matchId,
        eventType: "invite",
        starter: state.starter === "ai" ? "opponent" : "user",
        note: inviteNote !== "" ? inviteNote : null,
      },
    });

    if (sendResult.success !== true) {
      return { success: false, message: commandMessage(state.locale, "dispatchFailed") };
    }

    state.statusKey = "invitePending";
    state.matchId = matchId;
    state.inviteId = matchId;
    state.turnIndex = 0;
    state.lastRemoteTransportMessageId = null;
    state.lastRemoteTurnIndex = null;
    state.localSessionId =
      typeof sendResult.localSessionId === "string" ? sendResult.localSessionId : null;
    state.remoteUserId = opponent.remoteUserId || null;
    state.opponentNickname = opponent.nickname;
    savePendingInvite(
      api,
      createPendingInvite("outgoing", {
        inviteId: matchId,
        matchId: matchId,
        remoteUserId: state.remoteUserId || opponent.remoteUserId || "us1",
        nickname: opponent.nickname,
        note: inviteNote,
        starter: state.starter === "ai" ? "opponent" : "user",
        localSessionId: state.localSessionId,
        conversationId:
          typeof sendResult.conversationId === "string" ? sendResult.conversationId : "",
      })
    );
    pushRoomState(api, state);
    await syncUs1Mailbox(api, "invite-sent");
    return { success: true, message: commandMessage(state.locale, "inviteSent") };
  }

  async function sendUs1Move(
    api: Us1Api,
    state: BackgammonGameState,
    moveContext: {
      turnIndex: number;
      boardHashBeforeMove: string;
      legalMoveId: string;
      turnToken: string;
    }
  ) {
    const context = loadContext(api);
    const opponent = getOpponentInfo(context, state);

    if (
      opponent.dispatchable !== true ||
      state.remoteUserId === null ||
      (opponent.remoteUserId !== null && opponent.remoteUserId !== state.remoteUserId)
    ) {
      return { success: false, message: commandMessage(state.locale, "needReadyOpponent") };
    }

    const matchId = resolveStateMatchId(state) || "";
    const movePayload = {
      matchId: matchId,
      inviteId: matchId,
      turnIndex: moveContext.turnIndex,
      boardHashBeforeMove: moveContext.boardHashBeforeMove,
      legalMoveId: moveContext.legalMoveId,
      turnToken: moveContext.turnToken,
    };
    const sendResult = await api.dispatchUs1BridgeMessage({
      localSessionId: state.localSessionId,
      remoteUserId: state.remoteUserId,
      text: buildUs1MoveText(
        matchId,
        moveContext.turnIndex,
        moveContext.boardHashBeforeMove,
        moveContext.legalMoveId,
        moveContext.turnToken
      ),
      roomCommand: buildUs1RoomBridgeCommand({
        roomId: ROOM_ID,
        featureId: FEATURE_ID,
        commandName: "GameRoomBackgammonRemoteMove",
        matchId,
        turnIndex: moveContext.turnIndex,
        boardHashBeforeMove: moveContext.boardHashBeforeMove,
        payload: movePayload,
      }),
    });

    if (sendResult.success !== true) {
      return { success: false, message: commandMessage(state.locale, "dispatchFailed") };
    }

    if (typeof sendResult.localSessionId === "string" && sendResult.localSessionId !== "") {
      state.localSessionId = sendResult.localSessionId;
    }

    pushRoomState(api, state);
    return sendResult;
  }

  async function sendUs1Reset(
    api: Us1Api,
    resetContext: {
      matchId: string;
      localSessionId?: string | null;
      remoteUserId?: string | null;
    } | null
  ) {
    if (resetContext === null) {
      return { success: true };
    }

    return await api.dispatchUs1BridgeMessage({
      localSessionId: resetContext.localSessionId || null,
      remoteUserId: resetContext.remoteUserId || null,
      text: buildUs1ResetText(resetContext.matchId),
      roomEvent: {
        roomId: ROOM_ID,
        featureId: FEATURE_ID,
        inviteId: resetContext.matchId,
        matchId: resetContext.matchId,
        eventType: "reset",
      },
    });
  }

  return {
    applyInviteAcceptedState: applyInviteAcceptedState,
    findInviteById: findInviteById,
    readIncomingInviteStarter: readIncomingInviteStarter,
    readOutgoingInviteStarter: readOutgoingInviteStarter,
    removeInviteFromInbox: removeInviteFromInbox,
    sendUs1Invite: sendUs1Invite,
    sendUs1Move: sendUs1Move,
    sendUs1Reset: sendUs1Reset,
    syncFromSnapshot: syncInviteInboxFromSnapshot,
  };
}
