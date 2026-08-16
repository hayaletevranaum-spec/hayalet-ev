import {
  buildTeamTetrisSeatView,
  getTeamTetrisTeamIds,
  TEAM_TETRIS_BOARD_HEIGHT,
  TEAM_TETRIS_BOARD_WIDTH,
  TEAM_TETRIS_SCHEMA_VERSION,
  TEAM_TETRIS_TURN_LOOP,
  type TeamTetrisSeatId,
  type TeamTetrisSeatView,
  type TeamTetrisTeamId,
  type TeamTetrisTurn,
} from "./engine.js";
import {
  TEAM_TETRIS_STATUS_COPY,
  createInitialTeamTetrisState,
  loadTeamTetrisState,
  saveTeamTetrisState,
  type TeamTetrisHostState,
  type TeamTetrisStateApi,
  type TeamTetrisStatusKey,
} from "./state.js";
import { getActiveFeatureId, loadContext, readLocale } from "../../../shared/host/context-state.js";
import { ROOM_ID, TEAM_TETRIS_FEATURE_ID } from "../../../shared/host/feature-meta.js";
import { translate } from "../../../shared/host/text.js";
import { loadState, pushRoomState } from "../../backgammon/host/state.js";

type TeamTetrisRequiredSeatId = Exclude<TeamTetrisSeatId, "user">;
type TeamTetrisSeatReadiness = Record<TeamTetrisRequiredSeatId, boolean>;
type TeamTetrisContext = ReturnType<typeof loadContext>;

interface TeamTetrisRuntimeSyncApi extends TeamTetrisStateApi {
  notifyRoom?(eventType: string, data: unknown): void;
}

interface TeamTetrisBoardSnapshot {
  teamId: TeamTetrisTeamId;
  visibility: "private" | "public";
  rows: string[];
  boardBeforePartnerPieceRows?: string[];
  partnerLastPiece?: TeamTetrisSeatView["ownTeam"]["partnerLastPiece"];
}

interface TeamTetrisSerializedState {
  roomId: string;
  featureId: string;
  schemaVersion: number;
  active: boolean;
  result: TeamTetrisHostState["result"];
  hiddenPairs: boolean;
  revealPairsOnFinish: boolean;
  blockedReason: string;
  matchId: string | null;
  localSessionId: string | null;
  remoteUserId: string | null;
  lastRemoteTransportMessageId: string | null;
  lastRemoteTurnIndex: number | null;
  canStart: boolean;
  requiredSlots: TeamTetrisSeatReadiness;
  board: {
    width: number;
    height: number;
    seedLabel: string;
  };
  boards: TeamTetrisBoardSnapshot[];
  turnLoop: string[];
  currentTurn: TeamTetrisTurn | null;
  teams: { teamId: TeamTetrisTeamId; seatIds: string[] }[] | null;
  userView: TeamTetrisSeatView | null;
  status: string;
}

function resolveTeamTetrisLocalSeatId(state: TeamTetrisHostState): TeamTetrisSeatId {
  return state.localSeatId === "us1" ? "us1" : "user";
}

function isKnownTeamTetrisStatusKey(value: unknown): value is TeamTetrisStatusKey {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(TEAM_TETRIS_STATUS_COPY, value)
  );
}

function isTeamTetrisBlocked(state: TeamTetrisHostState): boolean {
  return state.result === "blocked" || state.blockedReason !== "";
}

function getTeamTetrisReadiness(context: TeamTetrisContext): TeamTetrisSeatReadiness {
  return {
    ai1: context.slots.ai1.dispatchable === true,
    ai2: context.slots.ai2.dispatchable === true,
    us1: context.slots.us1.dispatchable === true,
  };
}

function buildEmptyTeamTetrisRows(): string[] {
  return Array.from({ length: TEAM_TETRIS_BOARD_HEIGHT }, function () {
    return ".".repeat(TEAM_TETRIS_BOARD_WIDTH);
  });
}

function resolveTeamTetrisStatusText(
  state: TeamTetrisHostState,
  context: TeamTetrisContext
): string {
  if (state.blockedReason) {
    return state.blockedReason;
  }
  if (state.match && state.match.result === "pending" && state.match.currentTurn) {
    return "";
  }
  const readiness = getTeamTetrisReadiness(context);
  const canStart = readiness.ai1 && readiness.ai2 && readiness.us1;
  const statusKey: TeamTetrisStatusKey =
    canStart && state.statusKey === "idle" ? "ready" : state.statusKey;
  return translate(state.locale, TEAM_TETRIS_STATUS_COPY, statusKey);
}

function serializeTeamTetrisState(
  api: TeamTetrisRuntimeSyncApi,
  state: TeamTetrisHostState,
  context: TeamTetrisContext
): TeamTetrisSerializedState {
  const readiness = getTeamTetrisReadiness(context);
  const canStart = readiness.ai1 && readiness.ai2 && readiness.us1;
  const savedState = saveTeamTetrisState(api, state);
  const localSeatId = resolveTeamTetrisLocalSeatId(savedState);
  const userView = savedState.match ? buildTeamTetrisSeatView(savedState.match, localSeatId) : null;
  const boardSnapshots: TeamTetrisBoardSnapshot[] =
    userView !== null
      ? [
          {
            teamId: userView.ownTeam.teamId,
            visibility: "private",
            rows: userView.ownTeam.boardRows.slice(),
            boardBeforePartnerPieceRows: userView.ownTeam.boardBeforePartnerPieceRows.slice(),
            partnerLastPiece: userView.ownTeam.partnerLastPiece,
          },
          {
            teamId: userView.opponentTeam.teamId,
            visibility: "public",
            rows: userView.opponentTeam.boardRows.slice(),
          },
        ]
      : [
          {
            teamId: "team-a",
            visibility: "private",
            rows: buildEmptyTeamTetrisRows(),
            boardBeforePartnerPieceRows: buildEmptyTeamTetrisRows(),
            partnerLastPiece: null,
          },
          {
            teamId: "team-b",
            visibility: "public",
            rows: buildEmptyTeamTetrisRows(),
          },
        ];

  return {
    roomId: ROOM_ID,
    featureId: TEAM_TETRIS_FEATURE_ID,
    schemaVersion: TEAM_TETRIS_SCHEMA_VERSION,
    active:
      savedState.result === "blocked"
        ? false
        : savedState.match
          ? savedState.match.result === "pending"
          : savedState.active,
    result:
      savedState.result === "blocked"
        ? "blocked"
        : savedState.match
          ? savedState.match.result
          : savedState.result,
    hiddenPairs: savedState.hiddenPairs,
    revealPairsOnFinish: savedState.revealPairsOnFinish,
    blockedReason: savedState.blockedReason,
    matchId: savedState.match ? savedState.match.matchId : savedState.matchId,
    localSessionId: savedState.localSessionId,
    remoteUserId: savedState.remoteUserId,
    lastRemoteTransportMessageId: savedState.lastRemoteTransportMessageId,
    lastRemoteTurnIndex: savedState.lastRemoteTurnIndex,
    canStart,
    requiredSlots: readiness,
    board: {
      width: TEAM_TETRIS_BOARD_WIDTH,
      height: TEAM_TETRIS_BOARD_HEIGHT,
      seedLabel: "contract-frozen",
    },
    boards: boardSnapshots,
    turnLoop: TEAM_TETRIS_TURN_LOOP.slice(),
    currentTurn:
      savedState.match && savedState.match.currentTurn ? { ...savedState.match.currentTurn } : null,
    teams:
      savedState.match &&
      savedState.revealPairsOnFinish === true &&
      savedState.match.revealedPairs === true
        ? getTeamTetrisTeamIds().map(function (teamId: TeamTetrisTeamId) {
            return {
              teamId,
              seatIds: savedState.match ? savedState.match.teams[teamId].seatIds.slice() : [],
            };
          })
        : null,
    userView,
    status: resolveTeamTetrisStatusText(savedState, context),
  };
}

function pushTeamTetrisState(
  api: TeamTetrisRuntimeSyncApi,
  state: TeamTetrisHostState
): TeamTetrisHostState {
  const context = loadContext(api);
  api.notifyRoom?.("team-tetris-state", {
    state: serializeTeamTetrisState(api, state, context),
  });
  return loadTeamTetrisState(api);
}

function blockTeamTetrisMatch(
  api: TeamTetrisRuntimeSyncApi,
  state: TeamTetrisHostState,
  statusKey: TeamTetrisStatusKey,
  blockedReason: string
): TeamTetrisHostState {
  state.active = false;
  state.result = "blocked";
  state.statusKey = statusKey;
  state.blockedReason = blockedReason;
  return pushTeamTetrisState(api, state);
}

function resetTeamTetrisState(
  api: TeamTetrisRuntimeSyncApi,
  statusKey: unknown
): TeamTetrisHostState {
  const nextState = createInitialTeamTetrisState(readLocale(api));
  if (isKnownTeamTetrisStatusKey(statusKey)) {
    nextState.statusKey = statusKey;
  }
  return saveTeamTetrisState(api, nextState);
}

function pushActiveFeatureState(api: TeamTetrisRuntimeSyncApi): unknown {
  const context = loadContext(api);
  if (getActiveFeatureId(context) === TEAM_TETRIS_FEATURE_ID) {
    return pushTeamTetrisState(api, loadTeamTetrisState(api));
  }
  return pushRoomState(api, loadState(api));
}

export {
  blockTeamTetrisMatch,
  buildEmptyTeamTetrisRows,
  getTeamTetrisReadiness,
  isTeamTetrisBlocked,
  pushActiveFeatureState,
  pushTeamTetrisState,
  resetTeamTetrisState,
  resolveTeamTetrisStatusText,
  serializeTeamTetrisState,
};
