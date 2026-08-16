import type { BackgammonGameState } from "./state-core.js";
import { getOpponentInfo } from "./state.js";
import { fillTemplate, translate } from "../../../shared/host/text.js";
import {
  buildRoomBridgeCommand,
  buildUs1RoomBridgeCommand,
} from "../../../shared/host/slot-bridge-command.js";
import type {
  GameRoomContextState,
  GameRoomSlotState,
} from "../../../shared/types/room-shell-contracts.js";

function readOpponentInfo(
  context: GameRoomContextState,
  state: BackgammonGameState
): GameRoomSlotState {
  return getOpponentInfo(context, state);
}

export function commandMessage(locale: unknown, key: string, params: Record<string, unknown> = {}) {
  const messages = {
    started: { en: "Tavla match started.", tr: "Tavla maci baslatildi." },
    inviteSent: {
      en: "Tavla invite sent to the remote opponent.",
      tr: "Uzak rakibe Tavla daveti gonderildi.",
    },
    reset: { en: "Tavla match reset.", tr: "Tavla maci sifirlandi." },
    needReadyOpponent: {
      en: "The selected opponent is not ready.",
      tr: "Secilen rakip hazir degil.",
    },
    pendingInviteExists: {
      en: "There is already a pending remote invite. Reset first if you want to start over.",
      tr: "Bekleyen bir uzak davet zaten var. Basa donmek icin once sifirla.",
    },
    noActiveGame: { en: "There is no active Tavla match.", tr: "Aktif bir Tavla maci yok." },
    blockedGame: {
      en: "This match is blocked. Reset to start again.",
      tr: "Bu mac bloke oldu. Yeniden baslamak icin sifirla.",
    },
    notUserTurn: { en: "It is not the user's turn.", tr: "Sira kullanicida degil." },
    invalidMove: { en: "Choose a legal Tavla move.", tr: "Legal bir Tavla hamlesi sec." },
    moveSent: {
      en: "Move applied and sent to the opponent.",
      tr: "Hamle uygulandi ve rakibe gonderildi.",
    },
    aiTurnOnly: {
      en: "The room is not waiting for an opponent move.",
      tr: "Oda su an bir rakip hamlesi beklemiyor.",
    },
    providerMismatch: {
      en: "The move came from a different opponent than the active match.",
      tr: "Hamle aktif mactakinden farkli bir rakipten geldi.",
    },
    inviteMismatch: {
      en: "The invite does not match the active Tavla match.",
      tr: "Davet bilgisi aktif Tavla maci ile eslesmiyor.",
    },
    aiInvalidMove: {
      en: "The opponent sent an invalid move.",
      tr: "Rakip gecersiz bir hamle gonderdi.",
    },
    dispatchFailed: {
      en: "The Tavla update could not be sent to the opponent.",
      tr: "Tavla guncellemesi rakibe gonderilemedi.",
    },
    inviteNotFound: {
      en: "The selected invite is no longer available.",
      tr: "Secilen davet artik kullanilabilir degil.",
    },
    inviteAcceptFailed: { en: "The invite could not be accepted.", tr: "Davet kabul edilemedi." },
    inviteRejectFailed: { en: "The invite could not be rejected.", tr: "Davet reddedilemedi." },
    inviteAccepted: {
      en: "The invite was accepted and the match is ready.",
      tr: "Davet kabul edildi ve mac hazir.",
    },
    inviteRejected: { en: "The invite was rejected.", tr: "Davet reddedildi." },
    staleRemoteMove: {
      en: "A stale remote move was ignored.",
      tr: "Gec kalan uzak hamle yoksayildi.",
    },
    duplicateRemoteMove: {
      en: "A duplicate remote move was ignored.",
      tr: "Yinelenen uzak hamle yoksayildi.",
    },
    resetRemoteFailed: {
      en: "Local reset applied, but the remote side could not be notified.",
      tr: "Yerel sifirlama uygulandi, ancak uzak tarafa bildirim gonderilemedi.",
    },
    incomingInviteToast: {
      en: "{opponent} sent a new Tavla invite.",
      tr: "{opponent} yeni bir Tavla daveti gonderdi.",
    },
  };
  return fillTemplate(translate(locale, messages, key), params);
}

function formatDice(state: BackgammonGameState): string {
  return state.dice.length > 0 ? state.dice.join("-") : "not rolled";
}

function formatBarOff(state: BackgammonGameState): string {
  return [
    `User bar/off: ${state.bar.user}/${state.off.user}`,
    `Opponent bar/off: ${state.bar.ai}/${state.off.ai}`,
  ].join("\n");
}

export function buildAiTurnMessage(state: BackgammonGameState, context: GameRoomContextState) {
  const opponent = readOpponentInfo(context, state);
  const userName = context.user.nickname;
  const command = buildRoomBridgeCommand("GameRoomBackgammonAiMove", {
    moves: [{ from: 1, to: 3 }],
  });

  return [
    "Tavla turn update from the Game Room.",
    "Game: classic Tavla / Backgammon. No doubling cube.",
    "Your reply is parsed from only the latest assistant message.",
    `Use exactly one command line in this format: ${command}`,
    "Send your chosen move as ordered moves.",
    'Use point numbers, "bar" for bar entry, and "off" for bearing off.',
    "Do not add markdown, prose, code fences, or a second command.",
    "",
    "Match setup:",
    "- Opponent: " + userName,
    "- You move as Opponent from point 1 toward point 24.",
    "- The user moves from point 24 toward point 1.",
    "- Current opponent slot: " + opponent.nickname,
    "",
    "Dice: " + formatDice(state),
    "Board:",
    state.board
      .map(
        (point) =>
          `${point.point}:${point.owner === "user" ? "U" : point.owner === "ai" ? "O" : "-"}${point.count}`
      )
      .join(" "),
    formatBarOff(state),
    "",
    'If no checker can move, send an empty moves array: {"moves":[]}.',
  ].join("\n");
}

export function buildInviteId() {
  return `tavla_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildUs1InviteText(
  state: BackgammonGameState,
  context: GameRoomContextState,
  note: string
) {
  const opponent = readOpponentInfo(context, state);
  const starterLabel = state.starter === "ai" ? opponent.nickname : context.user.nickname;
  const parts = [];

  if (note !== "") {
    parts.push(note, "");
  }

  parts.push(
    "Tavla invite from the Game Room.",
    "Opponent: " + context.user.nickname,
    "Starter: " + starterLabel,
    "Accept or reject the invite from the Game Room UI."
  );

  return parts.join("\n");
}

export function buildUs1InviteResponseText(
  type: string,
  inviteEntry: { matchId?: string; inviteId?: string }
) {
  const opener = type === "accept" ? "Tavla invite accepted." : "Tavla invite rejected.";
  return [opener, "Match ID: " + (inviteEntry.matchId || inviteEntry.inviteId)].join("\n");
}

export function buildUs1ResetText(matchId: string) {
  return ["Tavla match reset.", "Match ID: " + matchId].join("\n");
}

export function buildUs1MoveText(
  matchId: string,
  turnIndex: number,
  boardHashBeforeMove: string,
  legalMoveId: string,
  turnToken: string
) {
  return buildRoomBridgeCommand("GameRoomBackgammonRemoteMove", {
    matchId,
    inviteId: matchId,
    turnIndex,
    boardHashBeforeMove,
    legalMoveId,
    turnToken,
  });
}

export function buildUs1MoveRoomCommand(payload: {
  matchId: string;
  turnIndex: number;
  boardHashBeforeMove: string;
  legalMoveId: string;
  turnToken: string;
}) {
  return buildUs1RoomBridgeCommand({
    roomId: "game-room",
    featureId: "backgammon",
    commandName: "GameRoomBackgammonRemoteMove",
    matchId: payload.matchId,
    turnIndex: payload.turnIndex,
    boardHashBeforeMove: payload.boardHashBeforeMove,
    payload,
  });
}
