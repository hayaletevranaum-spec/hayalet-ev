import {
  TEAM_TETRIS_PIECE_IDS,
  TEAM_TETRIS_SEAT_IDS,
  TEAM_TETRIS_SCHEMA_VERSION,
  createDeterministicRng,
  hashString,
  normalizeText,
} from "./engine-schema.js";
import {
  buildTeamTetrisBoardHash,
  cloneTeamTetrisBoard,
  createEmptyTeamTetrisBoard,
  getTeamTetrisLegalRotations,
  type PieceId,
  type TeamTetrisBoard,
  type TeamTetrisCell,
} from "./engine-board.js";

export type TeamTetrisSeatId = "user" | "ai1" | "ai2" | "us1";
export type TeamTetrisTeamId = "team-a" | "team-b";
export type TeamTetrisRole = "opener" | "followup";
export type TeamTetrisMatchResult = "pending" | "team-a-win" | "team-b-win" | "draw";

export interface TeamTetrisPieceSnapshot {
  pieceId: PieceId;
  rotation: number;
  turnIndex: number;
  placedBySeatId: TeamTetrisSeatId;
  cells: TeamTetrisCell[];
}

export interface BagState {
  rngCursor: number;
  bag: PieceId[];
  index: number;
  seed: string;
}

export interface TeamTetrisTeamState {
  id: TeamTetrisTeamId;
  seatIds: TeamTetrisSeatId[];
  openerSeatId: TeamTetrisSeatId;
  followupSeatId: TeamTetrisSeatId;
  board: TeamTetrisBoard;
  alive: boolean;
  bagState: BagState;
  nextPieceId: PieceId;
  boardBeforeLastLock: TeamTetrisBoard;
  lastLockedPiece: TeamTetrisPieceSnapshot | null;
  topOutTurnIndex: number | null;
}

export interface TeamTetrisTurn {
  turnIndex: number;
  seatId: TeamTetrisSeatId;
  teamId: TeamTetrisTeamId;
  role: TeamTetrisRole;
  pieceId: PieceId;
  turnToken: string;
  legalRotations: number[];
}

export interface TeamTetrisSeatInfo {
  teamId: TeamTetrisTeamId;
  role: TeamTetrisRole;
}

export interface TeamTetrisMatch {
  schemaVersion: number;
  matchId: string;
  seed: string;
  hiddenPairs: boolean;
  revealPairsOnFinish: boolean;
  revealedPairs: boolean;
  result: TeamTetrisMatchResult;
  winnerTeamId: TeamTetrisTeamId | null;
  turnIndex: number;
  turnLoop: TeamTetrisSeatId[];
  seatMap: Partial<Record<TeamTetrisSeatId, TeamTetrisSeatInfo>>;
  teams: Record<TeamTetrisTeamId, TeamTetrisTeamState>;
  currentTurn: TeamTetrisTurn | null;
}

export interface TeamTetrisMatchOptions {
  seed?: unknown;
  matchId?: unknown;
  hiddenPairs?: unknown;
  revealPairsOnFinish?: unknown;
  selectedPartnerSeatId?: unknown;
}

const DEFAULT_TEAM_TETRIS_PIECE_ID: PieceId = "I";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

function isTeamTetrisSeatId(value: unknown): value is TeamTetrisSeatId {
  return value === "user" || value === "ai1" || value === "ai2" || value === "us1";
}

function isManualPartnerSeatId(value: unknown): value is Exclude<TeamTetrisSeatId, "user"> {
  return value === "ai1" || value === "ai2" || value === "us1";
}

function isTeamTetrisTeamId(value: unknown): value is TeamTetrisTeamId {
  return value === "team-a" || value === "team-b";
}

function isTeamTetrisRole(value: unknown): value is TeamTetrisRole {
  return value === "opener" || value === "followup";
}

function isTeamTetrisPieceId(value: unknown): value is PieceId {
  return (
    value === "I" ||
    value === "O" ||
    value === "T" ||
    value === "S" ||
    value === "Z" ||
    value === "J" ||
    value === "L"
  );
}

function isTeamTetrisCell(value: unknown): value is TeamTetrisCell {
  return (
    isRecord(value) &&
    typeof value["x"] === "number" &&
    Number.isInteger(value["x"]) &&
    typeof value["y"] === "number" &&
    Number.isInteger(value["y"])
  );
}

function readInteger(value: unknown, fallback: number = 0): number {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function normalizeSeatId(value: unknown, fallback: TeamTetrisSeatId): TeamTetrisSeatId {
  return isTeamTetrisSeatId(value) ? value : fallback;
}

function readSelectedPartnerSeatId(value: unknown): Exclude<TeamTetrisSeatId, "user"> | null {
  return isManualPartnerSeatId(value) ? value : null;
}

function normalizeTeamId(value: unknown, fallback: TeamTetrisTeamId): TeamTetrisTeamId {
  return isTeamTetrisTeamId(value) ? value : fallback;
}

function normalizeRole(value: unknown, fallback: TeamTetrisRole): TeamTetrisRole {
  return isTeamTetrisRole(value) ? value : fallback;
}

function normalizePieceId(
  value: unknown,
  fallback: PieceId = DEFAULT_TEAM_TETRIS_PIECE_ID
): PieceId {
  return isTeamTetrisPieceId(value) ? value : fallback;
}

function normalizeMatchResult(value: unknown): TeamTetrisMatchResult {
  return value === "team-a-win" || value === "team-b-win" || value === "draw" ? value : "pending";
}

function cloneTeamTetrisPieceSnapshot(snapshot: unknown): TeamTetrisPieceSnapshot | null {
  if (isRecord(snapshot) === false || isTeamTetrisPieceId(snapshot["pieceId"]) === false) {
    return null;
  }

  return {
    pieceId: snapshot["pieceId"],
    rotation: readInteger(snapshot["rotation"]),
    turnIndex: readInteger(snapshot["turnIndex"]),
    placedBySeatId: normalizeSeatId(snapshot["placedBySeatId"], "user"),
    cells: Array.isArray(snapshot["cells"])
      ? snapshot["cells"]
          .filter(function (cell: unknown): cell is TeamTetrisCell {
            return isTeamTetrisCell(cell);
          })
          .map(function (cell: TeamTetrisCell) {
            return { x: cell.x, y: cell.y };
          })
      : [],
  };
}

function cloneTeamTetrisBagState(bagState: unknown, seedFallback: string): BagState {
  const source = isRecord(bagState) ? bagState : {};
  return {
    rngCursor: readInteger(source["rngCursor"]),
    bag: Array.isArray(source["bag"])
      ? source["bag"].filter(function (pieceId: unknown): pieceId is PieceId {
          return isTeamTetrisPieceId(pieceId);
        })
      : [],
    index: readInteger(source["index"]),
    seed: normalizeText(source["seed"]) || seedFallback,
  };
}

function getTeamTetrisSeatValue(
  seatIds: TeamTetrisSeatId[],
  index: number,
  fallback: TeamTetrisSeatId
): TeamTetrisSeatId {
  return normalizeSeatId(seatIds[index], fallback);
}

function getTeamTetrisSeatPair(
  seatIds: TeamTetrisSeatId[],
  firstFallback: TeamTetrisSeatId,
  secondFallback: TeamTetrisSeatId
): [TeamTetrisSeatId, TeamTetrisSeatId] {
  return [
    getTeamTetrisSeatValue(seatIds, 0, firstFallback),
    getTeamTetrisSeatValue(seatIds, 1, secondFallback),
  ];
}

function cloneTeamTetrisTeamState(
  team: unknown,
  teamIdFallback: TeamTetrisTeamId,
  seed: string
): TeamTetrisTeamState {
  const source = isRecord(team) ? team : {};
  const rawSeatIds = Array.isArray(source["seatIds"])
    ? source["seatIds"].filter(function (seatId: unknown): seatId is TeamTetrisSeatId {
        return isTeamTetrisSeatId(seatId);
      })
    : [];
  const [defaultOpener, defaultFollowup] = getTeamTetrisSeatPair(
    rawSeatIds,
    teamIdFallback === "team-a" ? "user" : "ai2",
    teamIdFallback === "team-a" ? "ai1" : "us1"
  );
  const bagState = cloneTeamTetrisBagState(source["bagState"], `${seed}|${teamIdFallback}`);
  return {
    id: normalizeTeamId(source["id"], teamIdFallback),
    seatIds: [defaultOpener, defaultFollowup],
    openerSeatId: normalizeSeatId(source["openerSeatId"], defaultOpener),
    followupSeatId: normalizeSeatId(source["followupSeatId"], defaultFollowup),
    board: cloneTeamTetrisBoard(source["board"]),
    alive: source["alive"] !== false,
    bagState,
    nextPieceId: normalizePieceId(source["nextPieceId"]),
    boardBeforeLastLock: cloneTeamTetrisBoard(source["boardBeforeLastLock"]),
    lastLockedPiece: cloneTeamTetrisPieceSnapshot(source["lastLockedPiece"]),
    topOutTurnIndex:
      typeof source["topOutTurnIndex"] === "number" && Number.isInteger(source["topOutTurnIndex"])
        ? source["topOutTurnIndex"]
        : null,
  };
}

function cloneTeamTetrisTurn(turn: unknown): TeamTetrisTurn | null {
  if (isRecord(turn) === false || isTeamTetrisPieceId(turn["pieceId"]) === false) {
    return null;
  }
  return {
    turnIndex: readInteger(turn["turnIndex"]),
    seatId: normalizeSeatId(turn["seatId"], "user"),
    teamId: normalizeTeamId(turn["teamId"], "team-a"),
    role: normalizeRole(turn["role"], "opener"),
    pieceId: turn["pieceId"],
    turnToken: normalizeText(turn["turnToken"]),
    legalRotations: Array.isArray(turn["legalRotations"])
      ? turn["legalRotations"].filter(function (value: unknown): value is number {
          return typeof value === "number" && Number.isInteger(value);
        })
      : [],
  };
}

function cloneTeamTetrisSeatMap(
  seatMap: unknown
): Partial<Record<TeamTetrisSeatId, TeamTetrisSeatInfo>> {
  const next: Partial<Record<TeamTetrisSeatId, TeamTetrisSeatInfo>> = {};
  if (isRecord(seatMap) === false) {
    return next;
  }
  (["user", "ai1", "ai2", "us1"] as TeamTetrisSeatId[]).forEach(function (seatId) {
    const entry = seatMap[seatId];
    if (isRecord(entry)) {
      next[seatId] = {
        teamId: normalizeTeamId(
          entry["teamId"],
          seatId === "ai2" || seatId === "us1" ? "team-b" : "team-a"
        ),
        role: normalizeRole(
          entry["role"],
          seatId === "user" || seatId === "ai2" ? "opener" : "followup"
        ),
      };
    }
  });
  return next;
}

function cloneTeamTetrisMatch(match: unknown): TeamTetrisMatch | null {
  if (isRecord(match) === false) {
    return null;
  }

  const seed = normalizeText(match["seed"]) || `seed_${Date.now().toString(36)}`;
  const teamA = cloneTeamTetrisTeamState(
    match["teams"] && isRecord(match["teams"]) ? match["teams"]["team-a"] : null,
    "team-a",
    seed
  );
  const teamB = cloneTeamTetrisTeamState(
    match["teams"] && isRecord(match["teams"]) ? match["teams"]["team-b"] : null,
    "team-b",
    seed
  );
  const fallbackSeatMap = buildTeamTetrisSeatMap(teamA.seatIds, teamB.seatIds);
  const clonedSeatMap = cloneTeamTetrisSeatMap(match["seatMap"]);
  const turnLoopSource = Array.isArray(match["turnLoop"])
    ? match["turnLoop"].filter(function (seatId: unknown): seatId is TeamTetrisSeatId {
        return isTeamTetrisSeatId(seatId);
      })
    : [];
  const turnLoop =
    turnLoopSource.length > 0
      ? turnLoopSource
      : [teamA.openerSeatId, teamB.openerSeatId, teamA.followupSeatId, teamB.followupSeatId];

  const nextMatch: TeamTetrisMatch = {
    schemaVersion: readInteger(match["schemaVersion"], TEAM_TETRIS_SCHEMA_VERSION),
    matchId: normalizeText(match["matchId"]),
    seed,
    hiddenPairs: match["hiddenPairs"] !== false,
    revealPairsOnFinish: match["revealPairsOnFinish"] !== false,
    revealedPairs: match["hiddenPairs"] === false || match["revealedPairs"] === true,
    result: normalizeMatchResult(match["result"]),
    winnerTeamId:
      normalizeMatchResult(match["result"]) === "team-a-win"
        ? "team-a"
        : normalizeMatchResult(match["result"]) === "team-b-win"
          ? "team-b"
          : isTeamTetrisTeamId(match["winnerTeamId"])
            ? match["winnerTeamId"]
            : null,
    turnIndex: readInteger(match["turnIndex"]),
    turnLoop,
    seatMap: {
      ...fallbackSeatMap,
      ...clonedSeatMap,
    },
    teams: {
      "team-a": teamA,
      "team-b": teamB,
    },
    currentTurn: cloneTeamTetrisTurn(match["currentTurn"]),
  };

  if (nextMatch.currentTurn === null && nextMatch.result === "pending") {
    nextMatch.currentTurn = buildTeamTetrisTurn(nextMatch, nextMatch.turnIndex);
  }

  return nextMatch;
}

function buildTeamTetrisTurnToken(
  matchId: string,
  turnIndex: number,
  seatId: TeamTetrisSeatId,
  teamId: TeamTetrisTeamId,
  pieceId: PieceId,
  board: TeamTetrisBoard
): string {
  const hash = hashString(
    [matchId, turnIndex, seatId, teamId, pieceId, buildTeamTetrisBoardHash(board)].join("|")
  );
  return `tt_${hash.toString(16)}`;
}

function shuffleTeamTetrisBag(seed: string, cursor: number): PieceId[] {
  const rng = createDeterministicRng([seed, cursor].join("|"));
  const bag: PieceId[] = TEAM_TETRIS_PIECE_IDS.filter(function (
    pieceId: string
  ): pieceId is PieceId {
    return isTeamTetrisPieceId(pieceId);
  });
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const current = bag[index];
    const swapValue = bag[swapIndex];
    if (current === undefined || swapValue === undefined) {
      continue;
    }
    bag[index] = swapValue;
    bag[swapIndex] = current;
  }
  return bag;
}

function shuffleTeamTetrisSeatOrder(seed: string, seatIds: TeamTetrisSeatId[]): TeamTetrisSeatId[] {
  const next = seatIds.slice();
  const rng = createDeterministicRng(seed);
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const current = next[index];
    const swapValue = next[swapIndex];
    if (current === undefined || swapValue === undefined) {
      continue;
    }
    next[index] = swapValue;
    next[swapIndex] = current;
  }
  return next;
}

function buildTeamTetrisTeamsFromSeed(
  seed: string,
  hiddenPairs: boolean,
  selectedPartnerSeatId: Exclude<TeamTetrisSeatId, "user"> | null
): [TeamTetrisSeatId[], TeamTetrisSeatId[]] {
  if (hiddenPairs !== true && selectedPartnerSeatId !== null) {
    const remainingSeats = TEAM_TETRIS_SEAT_IDS.filter(function (
      seatId: string
    ): seatId is TeamTetrisSeatId {
      return seatId !== "user" && seatId !== selectedPartnerSeatId && isTeamTetrisSeatId(seatId);
    });
    return [
      shuffleTeamTetrisSeatOrder(`${seed}|team-a`, ["user", selectedPartnerSeatId]),
      shuffleTeamTetrisSeatOrder(`${seed}|team-b`, remainingSeats),
    ];
  }

  const shuffledSeats = shuffleTeamTetrisSeatOrder(seed, ["user", "ai1", "ai2", "us1"]);
  return [shuffledSeats.slice(0, 2), shuffledSeats.slice(2, 4)];
}

function drawTeamTetrisPiece(bagState: BagState | unknown): PieceId {
  if (isRecord(bagState) === false) {
    return DEFAULT_TEAM_TETRIS_PIECE_ID;
  }

  const mutableBagState = bagState as unknown as BagState;
  if (
    Array.isArray(mutableBagState.bag) === false ||
    mutableBagState.index >= mutableBagState.bag.length
  ) {
    mutableBagState.bag = shuffleTeamTetrisBag(
      mutableBagState.seed || "team-tetris",
      mutableBagState.rngCursor || 0
    );
    mutableBagState.index = 0;
    mutableBagState.rngCursor = (mutableBagState.rngCursor || 0) + 1;
  }

  const pieceId = mutableBagState.bag[mutableBagState.index];
  mutableBagState.index += 1;
  return isTeamTetrisPieceId(pieceId) ? pieceId : DEFAULT_TEAM_TETRIS_PIECE_ID;
}

function buildTeamTetrisSeatMap(
  teamASeats: TeamTetrisSeatId[],
  teamBSeats: TeamTetrisSeatId[]
): Record<TeamTetrisSeatId, TeamTetrisSeatInfo> {
  const [teamAOpener, teamAFollowup] = getTeamTetrisSeatPair(teamASeats, "user", "ai1");
  const [teamBOpener, teamBFollowup] = getTeamTetrisSeatPair(teamBSeats, "ai2", "us1");
  const seatMap: Record<TeamTetrisSeatId, TeamTetrisSeatInfo> = {
    user: { teamId: "team-a", role: "opener" },
    ai1: { teamId: "team-a", role: "followup" },
    ai2: { teamId: "team-b", role: "opener" },
    us1: { teamId: "team-b", role: "followup" },
  };
  seatMap[teamAOpener] = { teamId: "team-a", role: "opener" };
  seatMap[teamAFollowup] = { teamId: "team-a", role: "followup" };
  seatMap[teamBOpener] = { teamId: "team-b", role: "opener" };
  seatMap[teamBFollowup] = { teamId: "team-b", role: "followup" };
  return seatMap;
}

function buildTeamTetrisTeamState(
  teamId: TeamTetrisTeamId,
  seatIds: TeamTetrisSeatId[],
  seed: string
): TeamTetrisTeamState {
  const [openerSeatId, followupSeatId] = getTeamTetrisSeatPair(
    seatIds,
    teamId === "team-a" ? "user" : "ai2",
    teamId === "team-a" ? "ai1" : "us1"
  );
  const bagState = cloneTeamTetrisBagState(
    {
      seed: `${seed}|${teamId}`,
      rngCursor: 0,
      bag: [],
      index: 0,
    },
    `${seed}|${teamId}`
  );
  return {
    id: teamId,
    seatIds: [openerSeatId, followupSeatId],
    openerSeatId,
    followupSeatId,
    board: createEmptyTeamTetrisBoard(),
    alive: true,
    bagState,
    nextPieceId: drawTeamTetrisPiece(bagState),
    boardBeforeLastLock: createEmptyTeamTetrisBoard(),
    lastLockedPiece: null,
    topOutTurnIndex: null,
  };
}

function buildTeamTetrisTurn(match: TeamTetrisMatch, turnIndex: number): TeamTetrisTurn | null {
  if (match.turnLoop.length === 0) {
    return null;
  }

  const teamAFallbackSeat = match.teams["team-a"].openerSeatId;
  const seatId = normalizeSeatId(
    match.turnLoop[turnIndex % match.turnLoop.length],
    teamAFallbackSeat
  );
  const seatInfo = match.seatMap[seatId] || null;
  if (!seatInfo) {
    return null;
  }

  const team = match.teams[seatInfo.teamId];
  return {
    turnIndex,
    seatId,
    teamId: seatInfo.teamId,
    role: seatInfo.role,
    pieceId: team.nextPieceId,
    legalRotations: getTeamTetrisLegalRotations(team.nextPieceId),
    turnToken: buildTeamTetrisTurnToken(
      match.matchId,
      turnIndex,
      seatId,
      seatInfo.teamId,
      team.nextPieceId,
      team.board
    ),
  };
}

function createTeamTetrisMatch(options: TeamTetrisMatchOptions | unknown): TeamTetrisMatch {
  const source = isRecord(options) ? options : {};
  const seed = normalizeText(source["seed"]) || `seed_${Date.now().toString(36)}`;
  const hiddenPairs = source["hiddenPairs"] !== false;
  const selectedPartnerSeatId = readSelectedPartnerSeatId(source["selectedPartnerSeatId"]);
  const [teamASeats, teamBSeats] = buildTeamTetrisTeamsFromSeed(
    `${seed}|teams`,
    hiddenPairs,
    selectedPartnerSeatId
  );
  const [teamAOpener, teamAFollowup] = getTeamTetrisSeatPair(teamASeats, "user", "ai1");
  const [teamBOpener, teamBFollowup] = getTeamTetrisSeatPair(teamBSeats, "ai2", "us1");
  const match: TeamTetrisMatch = {
    schemaVersion: TEAM_TETRIS_SCHEMA_VERSION,
    matchId: normalizeText(source["matchId"]) || `tt_${hashString(seed).toString(36)}`,
    seed,
    hiddenPairs,
    revealPairsOnFinish: source["revealPairsOnFinish"] !== false,
    revealedPairs: hiddenPairs === false,
    result: "pending",
    winnerTeamId: null,
    turnIndex: 0,
    turnLoop: [teamAOpener, teamBOpener, teamAFollowup, teamBFollowup],
    seatMap: buildTeamTetrisSeatMap(teamASeats, teamBSeats),
    teams: {
      "team-a": buildTeamTetrisTeamState("team-a", teamASeats, seed),
      "team-b": buildTeamTetrisTeamState("team-b", teamBSeats, seed),
    },
    currentTurn: null,
  };
  match.currentTurn = buildTeamTetrisTurn(match, 0);
  return match;
}

function getTeamTetrisTeamIds(): TeamTetrisTeamId[] {
  return ["team-a", "team-b"];
}

function getOtherTeamId(teamId: TeamTetrisTeamId): TeamTetrisTeamId {
  return teamId === "team-b" ? "team-a" : "team-b";
}

function getTeamTetrisSeatInfo(
  match: TeamTetrisMatch | null | undefined,
  seatId: string
): TeamTetrisSeatInfo | null {
  return match ? match.seatMap[normalizeSeatId(seatId, "user")] || null : null;
}

export {
  buildTeamTetrisTurn,
  buildTeamTetrisTurnToken,
  cloneTeamTetrisMatch,
  createTeamTetrisMatch,
  drawTeamTetrisPiece,
  getOtherTeamId,
  getTeamTetrisSeatInfo,
  getTeamTetrisTeamIds,
};
