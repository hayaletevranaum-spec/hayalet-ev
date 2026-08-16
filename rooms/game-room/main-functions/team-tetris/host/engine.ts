import {
  TEAM_TETRIS_BOARD_HEIGHT,
  TEAM_TETRIS_BOARD_WIDTH,
  TEAM_TETRIS_MOVE_SCHEMA,
  TEAM_TETRIS_PIECE_IDS,
  TEAM_TETRIS_SCHEMA_VERSION,
  TEAM_TETRIS_SEAT_IDS,
  TEAM_TETRIS_TURN_LOOP,
  buildTeamTetrisBoardHash,
  buildTeamTetrisTurn,
  buildTeamTetrisTurnToken,
  clearTeamTetrisLines,
  cloneTeamTetrisBoard,
  cloneTeamTetrisMatch,
  createTeamTetrisMatch,
  doesTeamTetrisPieceCollide,
  drawTeamTetrisPiece,
  getOtherTeamId,
  getTeamTetrisLegalRotations,
  getTeamTetrisSeatInfo,
  getTeamTetrisSpawnPosition,
  getTeamTetrisTeamIds,
  replayTeamTetrisPath,
  teamTetrisBoardToRows,
} from "./engine-helpers.js";
import { normalizeText } from "./engine-schema.js";
import type {
  PieceId,
  TeamTetrisCell,
  TeamTetrisReplayFailure,
  TeamTetrisReplaySuccess,
} from "./engine-board.js";
import type {
  TeamTetrisMatch,
  TeamTetrisMatchResult,
  TeamTetrisRole,
  TeamTetrisSeatId,
  TeamTetrisTeamId,
  TeamTetrisTurn,
} from "./engine-match.js";

export interface TeamTetrisMovePayload {
  schemaVersion: number;
  matchId: string;
  turnIndex: number | null;
  turnToken: string;
  pieceId: string;
  rotation: number;
  rowShifts: number[];
}

export interface TeamTetrisMoveValidationSuccess {
  success: true;
  turn: TeamTetrisTurn;
  replay: TeamTetrisReplaySuccess;
}

export type TeamTetrisMoveValidationResult =
  TeamTetrisMoveValidationSuccess | TeamTetrisReplayFailure | { success: false; reason: string };

export interface TeamTetrisApplyMoveSuccess {
  success: true;
  match: TeamTetrisMatch;
  clearedLines: number;
  lockedCells: TeamTetrisCell[];
  resolution: TeamTetrisReplaySuccess;
}

export type TeamTetrisApplyMoveResult =
  TeamTetrisApplyMoveSuccess | TeamTetrisReplayFailure | { success: false; reason: string };

export interface TeamTetrisPartnerPieceView {
  pieceId: PieceId;
  rotation: number;
  cells: TeamTetrisCell[];
  placedByRole: TeamTetrisRole;
  placedBySeatId?: TeamTetrisSeatId;
}

export interface TeamTetrisTeamReveal {
  teamId: TeamTetrisTeamId;
  seatIds: TeamTetrisSeatId[];
}

export interface TeamTetrisPendingTurnView {
  turnIndex: number;
  turnToken: string;
  pieceId: PieceId;
  legalRotations: number[];
  actingRole: TeamTetrisRole;
}

export interface TeamTetrisSeatView {
  schemaVersion: number;
  matchId: string;
  seat: {
    seatId: TeamTetrisSeatId;
    teamId: TeamTetrisTeamId;
    role: TeamTetrisRole;
  };
  hiddenPairs: boolean;
  revealedPairs: boolean;
  result: TeamTetrisMatchResult;
  winnerTeamId: TeamTetrisTeamId | null;
  teams: TeamTetrisTeamReveal[] | null;
  ownTeam: {
    teamId: TeamTetrisTeamId;
    boardRows: string[];
    boardBeforePartnerPieceRows: string[];
    partnerLastPiece: TeamTetrisPartnerPieceView | null;
  };
  opponentTeam: {
    teamId: TeamTetrisTeamId;
    boardRows: string[];
  };
  pendingTurn: TeamTetrisPendingTurnView | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

function normalizeTeamTetrisMove(move: TeamTetrisMovePayload | unknown): TeamTetrisMovePayload {
  const source = isRecord(move) ? move : {};
  return {
    schemaVersion:
      typeof source["schemaVersion"] === "number" && Number.isInteger(source["schemaVersion"])
        ? source["schemaVersion"]
        : TEAM_TETRIS_SCHEMA_VERSION,
    matchId: normalizeText(source["matchId"]),
    turnIndex:
      typeof source["turnIndex"] === "number" && Number.isInteger(source["turnIndex"])
        ? source["turnIndex"]
        : null,
    turnToken: normalizeText(source["turnToken"]),
    pieceId: normalizeText(source["pieceId"]),
    rotation:
      typeof source["rotation"] === "number" && Number.isInteger(source["rotation"])
        ? source["rotation"]
        : 0,
    rowShifts: Array.isArray(source["rowShifts"])
      ? source["rowShifts"].filter(function (value: unknown): value is number {
          return typeof value === "number" && Number.isInteger(value);
        })
      : [],
  };
}

function validateTeamTetrisMove(
  match: TeamTetrisMatch | null | undefined,
  move: TeamTetrisMovePayload | unknown
): TeamTetrisMoveValidationResult {
  const normalizedMove = normalizeTeamTetrisMove(move);
  if (!match || match.result !== "pending" || !match.currentTurn) {
    return { success: false, reason: "match-not-active" };
  }

  const currentTurn = match.currentTurn;
  if (normalizedMove.matchId !== match.matchId) {
    return { success: false, reason: "match-id-mismatch" };
  }
  if (normalizedMove.schemaVersion !== TEAM_TETRIS_SCHEMA_VERSION) {
    return { success: false, reason: "schema-version-mismatch" };
  }
  if (normalizedMove.turnIndex !== currentTurn.turnIndex) {
    return { success: false, reason: "turn-index-mismatch" };
  }
  if (normalizedMove.turnToken !== currentTurn.turnToken) {
    return { success: false, reason: "turn-token-mismatch" };
  }
  if (normalizedMove.pieceId !== currentTurn.pieceId) {
    return { success: false, reason: "piece-mismatch" };
  }

  const team = match.teams[currentTurn.teamId];
  if (team.alive !== true) {
    return { success: false, reason: "team-not-alive" };
  }

  const replay = replayTeamTetrisPath(
    team.board,
    currentTurn.pieceId,
    normalizedMove.rotation,
    normalizedMove.rowShifts
  );
  if (replay.success !== true) {
    return replay;
  }

  return {
    success: true,
    turn: currentTurn,
    replay,
  };
}

function resolveTeamTetrisResult(match: TeamTetrisMatch): void {
  const teamAAlive = match.teams["team-a"].alive === true;
  const teamBAlive = match.teams["team-b"].alive === true;
  if (!teamAAlive && !teamBAlive) {
    match.result = "draw";
    match.winnerTeamId = null;
    return;
  }
  if (!teamAAlive) {
    match.result = "team-b-win";
    match.winnerTeamId = "team-b";
    return;
  }
  if (!teamBAlive) {
    match.result = "team-a-win";
    match.winnerTeamId = "team-a";
    return;
  }
  match.result = "pending";
  match.winnerTeamId = null;
}

function applyTeamTetrisMove(
  match: TeamTetrisMatch | null | undefined,
  move: TeamTetrisMovePayload | unknown
): TeamTetrisApplyMoveResult {
  const validation = validateTeamTetrisMove(match, move);
  if (validation.success !== true) {
    return validation;
  }

  const nextMatch = cloneTeamTetrisMatch(match);
  if (!nextMatch || !nextMatch.currentTurn) {
    return { success: false, reason: "match-not-active" };
  }

  const currentTurn = nextMatch.currentTurn;
  const team = nextMatch.teams[currentTurn.teamId];
  const boardBefore = cloneTeamTetrisBoard(team.board);
  const replay = validation.replay;
  replay.cells.forEach(function (cell: TeamTetrisCell) {
    const row = team.board[cell.y];
    if (row) {
      row[cell.x] = currentTurn.pieceId;
    }
  });

  const clearResult = clearTeamTetrisLines(team.board);
  team.board = clearResult.board;
  team.boardBeforeLastLock = boardBefore;
  team.lastLockedPiece = {
    pieceId: currentTurn.pieceId,
    rotation: replay.rotation,
    turnIndex: currentTurn.turnIndex,
    placedBySeatId: currentTurn.seatId,
    cells: replay.cells,
  };
  const nextTeamPieceId =
    currentTurn.role === "followup" ? drawTeamTetrisPiece(team.bagState) : currentTurn.pieceId;
  team.nextPieceId = nextTeamPieceId;
  const spawnRotation = getTeamTetrisLegalRotations(nextTeamPieceId)[0] ?? 0;
  const spawn = getTeamTetrisSpawnPosition(nextTeamPieceId, spawnRotation);
  if (doesTeamTetrisPieceCollide(team.board, nextTeamPieceId, 0, spawn.x, spawn.y)) {
    team.alive = false;
    team.topOutTurnIndex = currentTurn.turnIndex;
  }

  resolveTeamTetrisResult(nextMatch);
  if (nextMatch.result === "pending") {
    nextMatch.turnIndex = currentTurn.turnIndex + 1;
    nextMatch.currentTurn = buildTeamTetrisTurn(nextMatch, nextMatch.turnIndex);
  } else {
    nextMatch.currentTurn = null;
    if (nextMatch.hiddenPairs === true && nextMatch.revealPairsOnFinish === true) {
      nextMatch.revealedPairs = true;
    }
  }

  return {
    success: true,
    match: nextMatch,
    clearedLines: clearResult.clearedLines,
    lockedCells: replay.cells,
    resolution: replay,
  };
}

function buildTeamTetrisSeatView(
  match: TeamTetrisMatch | null | undefined,
  seatId: TeamTetrisSeatId
): TeamTetrisSeatView | null {
  const source = cloneTeamTetrisMatch(match);
  if (!source) {
    return null;
  }

  const seatInfo = getTeamTetrisSeatInfo(source, seatId);
  if (!seatInfo) {
    return null;
  }

  const ownTeam = source.teams[seatInfo.teamId];
  const opponentTeam = source.teams[getOtherTeamId(seatInfo.teamId)];
  const partnerSeatId =
    ownTeam.seatIds.find(function (candidate: TeamTetrisSeatId) {
      return candidate !== seatId;
    }) || null;
  const partnerInfo = partnerSeatId ? getTeamTetrisSeatInfo(source, partnerSeatId) : null;
  const identityVisible = source.hiddenPairs !== true || source.revealedPairs === true;
  const partnerSnapshot =
    ownTeam.lastLockedPiece && ownTeam.lastLockedPiece.placedBySeatId === partnerSeatId
      ? {
          pieceId: ownTeam.lastLockedPiece.pieceId,
          rotation: ownTeam.lastLockedPiece.rotation,
          cells: [],
          placedByRole: partnerInfo ? partnerInfo.role : "opener",
          ...(identityVisible === true ? { placedBySeatId: partnerSeatId } : {}),
        }
      : null;
  const actualOwnBoardRows = teamTetrisBoardToRows(ownTeam.board);
  const boardBeforePartnerPieceRows = partnerSnapshot
    ? teamTetrisBoardToRows(ownTeam.boardBeforeLastLock)
    : actualOwnBoardRows;
  const visibleOwnBoardRows = partnerSnapshot ? boardBeforePartnerPieceRows : actualOwnBoardRows;

  return {
    schemaVersion: TEAM_TETRIS_SCHEMA_VERSION,
    matchId: source.matchId,
    seat: {
      seatId,
      teamId: seatInfo.teamId,
      role: seatInfo.role,
    },
    hiddenPairs: source.hiddenPairs,
    revealedPairs: source.revealedPairs,
    result: source.result,
    winnerTeamId: source.winnerTeamId,
    teams:
      identityVisible === true
        ? getTeamTetrisTeamIds().map(function (teamId: TeamTetrisTeamId) {
            const team = source.teams[teamId];
            return {
              teamId,
              seatIds: team.seatIds.slice(),
            };
          })
        : null,
    ownTeam: {
      teamId: ownTeam.id,
      boardRows: visibleOwnBoardRows,
      boardBeforePartnerPieceRows,
      partnerLastPiece: partnerSnapshot,
    },
    opponentTeam: {
      teamId: opponentTeam.id,
      boardRows: teamTetrisBoardToRows(opponentTeam.board),
    },
    pendingTurn:
      source.currentTurn && source.currentTurn.seatId === seatId
        ? {
            turnIndex: source.currentTurn.turnIndex,
            turnToken: source.currentTurn.turnToken,
            pieceId: source.currentTurn.pieceId,
            legalRotations: source.currentTurn.legalRotations.slice(),
            actingRole: source.currentTurn.role,
          }
        : null,
  };
}

const teamTetrisEngine = {
  schemaVersion: TEAM_TETRIS_SCHEMA_VERSION,
  moveSchema: TEAM_TETRIS_MOVE_SCHEMA,
  pieceIds: TEAM_TETRIS_PIECE_IDS.slice(),
  createMatch: createTeamTetrisMatch,
  cloneMatch: cloneTeamTetrisMatch,
  validateMove: validateTeamTetrisMove,
  applyMove: applyTeamTetrisMove,
  buildSeatView: buildTeamTetrisSeatView,
  boardToRows: teamTetrisBoardToRows,
  getLegalRotations: getTeamTetrisLegalRotations,
  replayPath: replayTeamTetrisPath,
  buildTurnToken: buildTeamTetrisTurnToken,
};

export type {
  PieceId,
  TeamTetrisCell,
  TeamTetrisMatch,
  TeamTetrisMatchResult,
  TeamTetrisRole,
  TeamTetrisSeatId,
  TeamTetrisTeamId,
  TeamTetrisTurn,
};

export {
  TEAM_TETRIS_BOARD_HEIGHT,
  TEAM_TETRIS_BOARD_WIDTH,
  TEAM_TETRIS_MOVE_SCHEMA,
  TEAM_TETRIS_PIECE_IDS,
  TEAM_TETRIS_SCHEMA_VERSION,
  TEAM_TETRIS_SEAT_IDS,
  TEAM_TETRIS_TURN_LOOP,
  applyTeamTetrisMove,
  buildTeamTetrisBoardHash,
  buildTeamTetrisSeatView,
  buildTeamTetrisTurnToken,
  cloneTeamTetrisMatch,
  createTeamTetrisMatch,
  getOtherTeamId,
  getTeamTetrisLegalRotations,
  getTeamTetrisSeatInfo,
  getTeamTetrisSpawnPosition,
  getTeamTetrisTeamIds,
  replayTeamTetrisPath,
  teamTetrisBoardToRows,
  teamTetrisEngine,
  validateTeamTetrisMove,
};
