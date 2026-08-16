import { saveTeamTetrisState, type TeamTetrisHostState, type TeamTetrisStateApi } from "./state.js";
import { loadContext } from "../../../shared/host/context-state.js";
import { ROOM_ID, TEAM_TETRIS_FEATURE_ID } from "../../../shared/host/feature-meta.js";
import {
  buildTeamTetrisRemoteMoveText,
  buildTeamTetrisRemoteStartText,
} from "./runtime-protocol.js";
import { buildUs1RoomBridgeCommand } from "../../../shared/host/slot-bridge-command.js";
import type { TeamTetrisMovePayload } from "./engine.js";

interface TeamTetrisRemoteSendResult {
  success?: boolean;
  localSessionId?: unknown;
  remoteUserId?: unknown;
}

interface TeamTetrisUs1MessageRequest {
  localSessionId: string | null;
  text: string;
  roomEvent?: Record<string, unknown>;
  roomCommand?: Record<string, unknown>;
}

interface TeamTetrisTransportApi extends TeamTetrisStateApi {
  dispatchBridge?(options: Record<string, unknown>): Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function isSuccessfulSendResult(
  result: TeamTetrisRemoteSendResult | null | undefined
): result is TeamTetrisRemoteSendResult & { success: true } {
  return !!result && result.success === true;
}

function normalizeTeamTetrisRemoteSendResult(value: unknown): TeamTetrisRemoteSendResult | null {
  if (isRecord(value) === false) {
    return null;
  }

  const data = isRecord(value["data"]) ? value["data"] : {};
  const session = isRecord(value["session"]) ? value["session"] : {};
  return {
    success: value["success"] === true,
    ...(typeof session["id"] === "string" ? { localSessionId: session["id"] } : {}),
    ...(typeof data["remoteUserId"] === "string" ? { remoteUserId: data["remoteUserId"] } : {}),
  };
}

async function sendUs1MessageSafe(
  api: TeamTetrisTransportApi,
  options: TeamTetrisUs1MessageRequest & { remoteUserId: string }
): Promise<TeamTetrisRemoteSendResult | null> {
  if (typeof api.dispatchBridge !== "function") {
    return null;
  }
  return normalizeTeamTetrisRemoteSendResult(
    await api.dispatchBridge({
      action: "message.send",
      toSlot: "us1",
      ...(typeof options.localSessionId === "string" && options.localSessionId.trim() !== ""
        ? {
            sessionRef: {
              id: options.localSessionId.trim(),
            },
          }
        : {}),
      payload: {
        text: options.text,
        remoteUserId: options.remoteUserId,
        ...(options.roomEvent !== undefined ? { roomEvent: options.roomEvent } : {}),
        ...(options.roomCommand !== undefined ? { roomCommand: options.roomCommand } : {}),
      },
    })
  );
}

async function sendTeamTetrisRemoteStart(
  api: TeamTetrisTransportApi,
  state: TeamTetrisHostState,
  options: {
    selectedPartnerSeatId?: string | null;
  } = {}
): Promise<TeamTetrisRemoteSendResult> {
  const context = loadContext(api);
  const remoteUserId = context.slots.us1.remoteUserId || state.remoteUserId;
  if (!state.match || !remoteUserId) {
    return { success: false };
  }

  const sendResult = await sendUs1MessageSafe(api, {
    localSessionId: state.localSessionId,
    remoteUserId,
    text: buildTeamTetrisRemoteStartText(state.match, {
      hiddenPairs: state.match.hiddenPairs,
      selectedPartnerSeatId: options.selectedPartnerSeatId || null,
    }),
    roomEvent: {
      roomId: ROOM_ID,
      featureId: TEAM_TETRIS_FEATURE_ID,
      inviteId: state.match.matchId,
      matchId: state.match.matchId,
      eventType: "start",
      note: JSON.stringify({
        seed: state.match.seed,
        hiddenPairs: state.match.hiddenPairs,
        revealPairsOnFinish: state.match.revealPairsOnFinish,
        ...(typeof options.selectedPartnerSeatId === "string" &&
        options.selectedPartnerSeatId !== ""
          ? { selectedPartnerSeatId: options.selectedPartnerSeatId }
          : {}),
      }),
    },
  });

  if (isSuccessfulSendResult(sendResult)) {
    state.localSessionId = readNonEmptyString(sendResult.localSessionId) || state.localSessionId;
    state.remoteUserId = readNonEmptyString(sendResult.remoteUserId) || remoteUserId;
    saveTeamTetrisState(api, state);
    return sendResult;
  }

  return sendResult || { success: false };
}

async function sendTeamTetrisRemoteReset(
  api: TeamTetrisTransportApi,
  state: TeamTetrisHostState
): Promise<TeamTetrisRemoteSendResult> {
  if (!state.matchId || !state.remoteUserId) {
    return { success: true };
  }

  const sendResult = await sendUs1MessageSafe(api, {
    localSessionId: state.localSessionId,
    remoteUserId: state.remoteUserId,
    text: "Team Tetris match reset.",
    roomEvent: {
      roomId: ROOM_ID,
      featureId: TEAM_TETRIS_FEATURE_ID,
      inviteId: state.matchId,
      matchId: state.matchId,
      eventType: "reset",
    },
  });

  return sendResult || { success: false };
}

async function sendTeamTetrisRemoteMove(
  api: TeamTetrisTransportApi,
  state: TeamTetrisHostState,
  movePayload: TeamTetrisMovePayload,
  boardHashBeforeMove: string
): Promise<TeamTetrisRemoteSendResult> {
  if (!state.remoteUserId) {
    return { success: true };
  }

  const sendResult = await sendUs1MessageSafe(api, {
    localSessionId: state.localSessionId,
    remoteUserId: state.remoteUserId,
    text: buildTeamTetrisRemoteMoveText(movePayload as unknown as Record<string, unknown>),
    roomCommand: buildUs1RoomBridgeCommand({
      roomId: ROOM_ID,
      featureId: TEAM_TETRIS_FEATURE_ID,
      commandName: "GameRoomTeamTetrisRemoteMove",
      matchId: movePayload.matchId,
      turnIndex: movePayload.turnIndex,
      turnToken: movePayload.turnToken,
      boardHashBeforeMove,
      payload: movePayload as unknown as Record<string, unknown>,
    }),
  });

  if (isSuccessfulSendResult(sendResult)) {
    state.localSessionId = readNonEmptyString(sendResult.localSessionId) || state.localSessionId;
    saveTeamTetrisState(api, state);
    return sendResult;
  }

  return sendResult || { success: false };
}

export { sendTeamTetrisRemoteMove, sendTeamTetrisRemoteReset, sendTeamTetrisRemoteStart };
