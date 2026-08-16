import { normalizeLocale, normalizeText } from "../../../shared/host/text.js";

export type BackgammonSeat = "user" | "ai";
export type BackgammonOwner = BackgammonSeat | "";
export type BackgammonResult = "idle" | "pending" | "user-win" | "ai-win" | "blocked";
export type BackgammonMoveOrigin =
  | {
      type: "bar";
      seat: BackgammonSeat;
    }
  | {
      type: "point";
      point: number;
    };
export type BackgammonMoveDestination =
  | {
      type: "off";
    }
  | {
      type: "point";
      point: number;
    };

export interface BackgammonPoint {
  point: number;
  owner: BackgammonOwner;
  count: number;
}

export interface BackgammonSubMove {
  from: BackgammonMoveOrigin;
  to: BackgammonMoveDestination;
  die: number;
  hit: boolean;
}

export interface BackgammonLegalMove {
  id: string;
  label: string;
  moves: BackgammonSubMove[];
  diceUsed: number[];
  pass?: boolean;
}

interface BackgammonMoveStep {
  from: BackgammonMoveOrigin;
  to: BackgammonMoveDestination;
}

export interface BackgammonMatchHistoryEntry {
  id: string;
  finishedAt: number;
  target: string;
  opponentNickname: string;
  opponentAvatar: string | null;
  userNickname: string;
  result: "user-win" | "ai-win";
  starter: "ai" | "user";
  scorePoints: number;
  boardHash: string;
}

export interface BackgammonGameState {
  locale: "tr" | "en";
  target: "ai1" | "ai2" | "us1";
  starter: "ai" | "user";
  board: BackgammonPoint[];
  bar: Record<BackgammonSeat, number>;
  off: Record<BackgammonSeat, number>;
  dice: number[];
  legalMoves: BackgammonLegalMove[];
  active: boolean;
  awaitingMoveFrom: BackgammonSeat | null;
  result: BackgammonResult;
  winner: BackgammonOwner;
  statusKey: string;
  protocolDelivered: boolean;
  blockedReason: string;
  protocolPreface: string;
  matchId: string | null;
  inviteId: string | null;
  turnIndex: number;
  turnToken: string;
  localSessionId: string | null;
  remoteUserId: string | null;
  opponentNickname: string;
  lastRemoteTransportMessageId: string | null;
  lastRemoteTurnIndex: number | null;
  scorePoints: number;
}

type MutableBoard = BackgammonPoint[];

const CHECKERS_PER_SEAT = 15;
const BOARD_POINTS = 24;

export const MATCH_HISTORY_LIMIT = 20;
export const TERMINAL_RESULTS = new Set(["user-win", "ai-win", "blocked"]);
export const DEFAULT_TARGET = "ai1";
export const DEFAULT_STARTER = "user";
export const US1_SYNC_INTERVAL_MS = 5000;

export const STATUS_COPY = {
  idle: {
    en: "Choose a ready opponent or accept an incoming Tavla invite.",
    tr: "Hazir bir rakip sec veya gelen Tavla davetlerinden birini kabul et.",
  },
  invitePending: {
    en: "Invite sent to {opponent}. Waiting for a reply.",
    tr: "{opponent} tarafina davet gonderildi. Yanit bekleniyor.",
  },
  userTurn: {
    en: "Your turn. Choose one legal Tavla move.",
    tr: "Sira sende. Legal Tavla hamlelerinden birini sec.",
  },
  aiTurn: {
    en: "Waiting for {opponent} to answer with a Tavla move.",
    tr: "{opponent} Tavla hamlesini gonderene kadar bekleniyor.",
  },
  userWin: {
    en: "You won the Tavla match.",
    tr: "Tavla macini sen kazandin.",
  },
  aiWin: {
    en: "{opponent} won the Tavla match.",
    tr: "{opponent} Tavla macini kazandi.",
  },
  inviteRejected: {
    en: "{opponent} rejected the Tavla invite.",
    tr: "{opponent} Tavla davetini reddetti.",
  },
  remoteReset: {
    en: "{opponent} ended the Tavla match.",
    tr: "{opponent} Tavla macini sonlandirdi.",
  },
  blockedOpponent: {
    en: "{opponent} disconnected during the match. Reset to begin again.",
    tr: "{opponent} mac sirasinda baglantidan dustu. Yeniden baslamak icin sifirla.",
  },
  blockedDispatch: {
    en: "The latest Tavla update could not be delivered to {opponent}. Reset to try again.",
    tr: "Guncel Tavla durumu {opponent} tarafina iletilemedi. Tekrar denemek icin sifirla.",
  },
  blockedInvalidMove: {
    en: "{opponent} returned an invalid Tavla move. Reset to start over.",
    tr: "{opponent} gecersiz bir Tavla hamlesi dondu. Basa almak icin sifirla.",
  },
};

export const COMMAND_COPY = {
  started: {
    en: "Tavla match started.",
    tr: "Tavla maci baslatildi.",
  },
  reset: {
    en: "Tavla match reset.",
    tr: "Tavla maci sifirlandi.",
  },
};

function createEmptyBoard(): BackgammonPoint[] {
  const board: BackgammonPoint[] = [];
  for (let point = 1; point <= BOARD_POINTS; point += 1) {
    board.push({ point, owner: "", count: 0 });
  }
  return board;
}

export function createInitialBoard(): BackgammonPoint[] {
  const board = createEmptyBoard();
  setPoint(board, 24, "user", 2);
  setPoint(board, 13, "user", 5);
  setPoint(board, 8, "user", 3);
  setPoint(board, 6, "user", 5);
  setPoint(board, 1, "ai", 2);
  setPoint(board, 12, "ai", 5);
  setPoint(board, 17, "ai", 3);
  setPoint(board, 19, "ai", 5);
  return board;
}

export const EMPTY_BOARD = createInitialBoard();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

function opponentOf(seat: BackgammonSeat): BackgammonSeat {
  return seat === "user" ? "ai" : "user";
}

function pointAt(board: MutableBoard, point: number): BackgammonPoint {
  const existing = board[point - 1];
  if (existing) {
    return existing;
  }
  const fallback = { point, owner: "", count: 0 } satisfies BackgammonPoint;
  board[point - 1] = fallback;
  return fallback;
}

function setPoint(board: MutableBoard, point: number, owner: BackgammonOwner, count: number): void {
  board[point - 1] = {
    point,
    owner: count > 0 ? owner : "",
    count: count > 0 ? count : 0,
  };
}

function cloneBarOrOff(value: unknown): Record<BackgammonSeat, number> {
  const source = isRecord(value) ? value : {};
  return {
    user: normalizeCounter(source["user"]),
    ai: normalizeCounter(source["ai"]),
  };
}

function normalizeCounter(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function normalizeDie(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6
    ? value
    : null;
}

function normalizeDice(value: unknown): number[] {
  if (Array.isArray(value) === false) {
    return [];
  }
  return value
    .map((entry) => normalizeDie(entry))
    .filter((entry): entry is number => entry !== null)
    .slice(0, 4);
}

export function sanitizeTarget(value: string): "ai1" | "ai2" | "us1" {
  if (value === "ai2" || value === "us1") {
    return value;
  }
  return DEFAULT_TARGET;
}

export function sanitizeStarter(value: string): "ai" | "user" {
  return value === "ai" ? "ai" : DEFAULT_STARTER;
}

export function cloneBoard(board: unknown): BackgammonPoint[] {
  if (Array.isArray(board) === false) {
    return createInitialBoard();
  }
  if (board.length > 0 && isRecord(board[0]) === false) {
    return createInitialBoard();
  }
  return normalizeBoard(board);
}

export function normalizeBoard(board: unknown): BackgammonPoint[] {
  if (Array.isArray(board) === false) {
    return createInitialBoard();
  }

  const next = createEmptyBoard();
  const entries = board as unknown[];
  for (let index = 0; index < entries.length; index += 1) {
    const source = entries[index];
    if (isRecord(source) === false) {
      continue;
    }
    const point =
      typeof source["point"] === "number" &&
      Number.isInteger(source["point"]) &&
      source["point"] >= 1 &&
      source["point"] <= BOARD_POINTS
        ? source["point"]
        : index + 1;
    const owner = source["owner"] === "user" || source["owner"] === "ai" ? source["owner"] : "";
    const count = normalizeCounter(source["count"]);
    setPoint(next, point, owner, owner === "" ? 0 : count);
  }
  return next;
}

function normalizeLegalMoves(value: unknown): BackgammonLegalMove[] {
  if (Array.isArray(value) === false) {
    return [];
  }
  return value
    .map((candidate): BackgammonLegalMove | null => {
      if (isRecord(candidate) === false) {
        return null;
      }
      const id = normalizeText(candidate["id"]);
      const label = normalizeText(candidate["label"]);
      const moves = Array.isArray(candidate["moves"])
        ? candidate["moves"]
            .map(normalizeSubMove)
            .filter((move): move is BackgammonSubMove => move !== null)
        : [];
      if (id === "" || label === "") {
        return null;
      }
      return {
        id,
        label,
        moves,
        diceUsed: normalizeDice(candidate["diceUsed"]),
        ...(candidate["pass"] === true ? { pass: true } : {}),
      };
    })
    .filter((move): move is BackgammonLegalMove => move !== null);
}

function normalizeSubMove(candidate: unknown): BackgammonSubMove | null {
  if (isRecord(candidate) === false) {
    return null;
  }
  const die = normalizeDie(candidate["die"]);
  const from = normalizeOrigin(candidate["from"]);
  const to = normalizeDestination(candidate["to"]);
  if (die === null || from === null || to === null) {
    return null;
  }
  return {
    from,
    to,
    die,
    hit: candidate["hit"] === true,
  };
}

function normalizeMoveStepPoint(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= BOARD_POINTS) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isInteger(parsed) && parsed >= 1 && parsed <= BOARD_POINTS ? parsed : null;
  }
  return null;
}

function normalizeCommandOrigin(value: unknown): BackgammonMoveOrigin | null {
  if (value === "bar") {
    return { type: "bar", seat: "ai" };
  }
  const point = normalizeMoveStepPoint(value);
  if (point !== null) {
    return { type: "point", point };
  }
  return normalizeOrigin(value);
}

function normalizeCommandDestination(value: unknown): BackgammonMoveDestination | null {
  if (value === "off") {
    return { type: "off" };
  }
  const point = normalizeMoveStepPoint(value);
  if (point !== null) {
    return { type: "point", point };
  }
  return normalizeDestination(value);
}

function normalizeMoveStep(candidate: unknown): BackgammonMoveStep | null {
  if (isRecord(candidate) === false) {
    return null;
  }
  const from = normalizeCommandOrigin(candidate["from"]);
  const to = normalizeCommandDestination(candidate["to"]);
  if (from === null || to === null) {
    return null;
  }
  return { from, to };
}

function normalizeOrigin(value: unknown): BackgammonMoveOrigin | null {
  if (isRecord(value) === false) {
    return null;
  }
  if (value["type"] === "bar") {
    return {
      type: "bar",
      seat: value["seat"] === "ai" ? "ai" : "user",
    };
  }
  if (
    value["type"] === "point" &&
    typeof value["point"] === "number" &&
    Number.isInteger(value["point"]) &&
    value["point"] >= 1 &&
    value["point"] <= BOARD_POINTS
  ) {
    return {
      type: "point",
      point: value["point"],
    };
  }
  return null;
}

function normalizeDestination(value: unknown): BackgammonMoveDestination | null {
  if (isRecord(value) === false) {
    return null;
  }
  if (value["type"] === "off") {
    return {
      type: "off",
    };
  }
  if (
    value["type"] === "point" &&
    typeof value["point"] === "number" &&
    Number.isInteger(value["point"]) &&
    value["point"] >= 1 &&
    value["point"] <= BOARD_POINTS
  ) {
    return {
      type: "point",
      point: value["point"],
    };
  }
  return null;
}

function hashText(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function buildBoardStateHash(
  board: BackgammonPoint[],
  bar: Record<BackgammonSeat, number> = { user: 0, ai: 0 },
  off: Record<BackgammonSeat, number> = { user: 0, ai: 0 }
): string {
  const points = normalizeBoard(board).map((point) => {
    const owner = point.owner === "" ? "-" : point.owner === "user" ? "u" : "a";
    return `${point.point}${owner}${point.count}`;
  });
  return hashText(
    [points.join("."), `bu${bar.user}`, `ba${bar.ai}`, `ou${off.user}`, `oa${off.ai}`].join("|")
  );
}

export function buildBoardAscii(board: BackgammonPoint[]): string {
  const normalized = normalizeBoard(board);
  const top = normalized.slice(12, 24).reverse().map(formatPointAscii).join(" ");
  const bottom = normalized.slice(0, 12).map(formatPointAscii).join(" ");
  return [top, bottom].join("\n");
}

function formatPointAscii(point: BackgammonPoint): string {
  const owner = point.owner === "user" ? "U" : point.owner === "ai" ? "A" : "-";
  return `${String(point.point).padStart(2, "0")}:${owner}${point.count}`;
}

export function rollDice(): number[] {
  const first = Math.floor(Math.random() * 6) + 1;
  const second = Math.floor(Math.random() * 6) + 1;
  return first === second ? [first, first, first, first] : [first, second];
}

function rollDeterministicDice(seed: string): number[] {
  const firstHash = Number.parseInt(hashText(`${seed}:a`).slice(0, 6), 36);
  const secondHash = Number.parseInt(hashText(`${seed}:b`).slice(0, 6), 36);
  const first = (firstHash % 6) + 1;
  const second = (secondHash % 6) + 1;
  return first === second ? [first, first, first, first] : [first, second];
}

function diceOrders(dice: number[]): number[][] {
  if (dice.length <= 1 || dice.every((die) => die === dice[0])) {
    return [dice.slice()];
  }
  return [dice.slice(), dice.slice().reverse()];
}

function entryPoint(seat: BackgammonSeat, die: number): number {
  return seat === "user" ? 25 - die : die;
}

function moveDestination(seat: BackgammonSeat, point: number, die: number): number {
  return seat === "user" ? point - die : point + die;
}

function isPointBlocked(board: MutableBoard, point: number, seat: BackgammonSeat): boolean {
  const destination = pointAt(board, point);
  return destination.owner === opponentOf(seat) && destination.count >= 2;
}

function allCheckersInHome(
  board: MutableBoard,
  bar: Record<BackgammonSeat, number>,
  seat: BackgammonSeat
): boolean {
  if (bar[seat] > 0) {
    return false;
  }
  return board.every((point) => {
    if (point.owner !== seat || point.count <= 0) {
      return true;
    }
    return seat === "user" ? point.point >= 1 && point.point <= 6 : point.point >= 19;
  });
}

function canBearOffFrom(
  board: MutableBoard,
  seat: BackgammonSeat,
  fromPoint: number,
  destination: number
): boolean {
  if (destination >= 1 && destination <= BOARD_POINTS) {
    return false;
  }
  if (destination === 0 || destination === 25) {
    return true;
  }
  if (seat === "user") {
    return board.every((point) => point.owner !== seat || point.point <= fromPoint);
  }
  return board.every((point) => point.owner !== seat || point.point >= fromPoint);
}

function applySubMoveToSnapshot(
  board: MutableBoard,
  bar: Record<BackgammonSeat, number>,
  off: Record<BackgammonSeat, number>,
  seat: BackgammonSeat,
  subMove: BackgammonSubMove
): void {
  if (subMove.from.type === "bar") {
    bar[seat] = Math.max(0, bar[seat] - 1);
  } else {
    const origin = pointAt(board, subMove.from.point);
    origin.count = Math.max(0, origin.count - 1);
    if (origin.count === 0) {
      origin.owner = "";
    }
  }

  if (subMove.to.type === "off") {
    off[seat] += 1;
    return;
  }

  const destination = pointAt(board, subMove.to.point);
  if (destination.owner === opponentOf(seat) && destination.count === 1) {
    bar[opponentOf(seat)] += 1;
    destination.owner = seat;
    destination.count = 1;
    return;
  }
  destination.owner = seat;
  destination.count += 1;
}

function legalSingleMoves(
  board: MutableBoard,
  bar: Record<BackgammonSeat, number>,
  seat: BackgammonSeat,
  die: number
): BackgammonSubMove[] {
  if (bar[seat] > 0) {
    const point = entryPoint(seat, die);
    if (isPointBlocked(board, point, seat)) {
      return [];
    }
    const destination = pointAt(board, point);
    return [
      {
        from: { type: "bar", seat },
        to: { type: "point", point },
        die,
        hit: destination.owner === opponentOf(seat) && destination.count === 1,
      },
    ];
  }

  const inHome = allCheckersInHome(board, bar, seat);
  const points = board
    .filter((point) => point.owner === seat && point.count > 0)
    .sort((a, b) => (seat === "user" ? b.point - a.point : a.point - b.point));
  const moves: BackgammonSubMove[] = [];

  for (const point of points) {
    const destinationPoint = moveDestination(seat, point.point, die);
    if (destinationPoint >= 1 && destinationPoint <= BOARD_POINTS) {
      if (isPointBlocked(board, destinationPoint, seat) === false) {
        const destination = pointAt(board, destinationPoint);
        moves.push({
          from: { type: "point", point: point.point },
          to: { type: "point", point: destinationPoint },
          die,
          hit: destination.owner === opponentOf(seat) && destination.count === 1,
        });
      }
      continue;
    }
    if (inHome && canBearOffFrom(board, seat, point.point, destinationPoint)) {
      moves.push({
        from: { type: "point", point: point.point },
        to: { type: "off" },
        die,
        hit: false,
      });
    }
  }

  return moves;
}

function generateSequencesForOrder(
  board: MutableBoard,
  bar: Record<BackgammonSeat, number>,
  off: Record<BackgammonSeat, number>,
  seat: BackgammonSeat,
  dice: number[],
  used: BackgammonSubMove[]
): BackgammonSubMove[][] {
  if (dice.length === 0) {
    return [used];
  }

  const die = dice[0];
  if (die === undefined) {
    return [used];
  }
  const singles = legalSingleMoves(board, bar, seat, die);
  if (singles.length === 0) {
    return [used];
  }

  const sequences: BackgammonSubMove[][] = [];
  for (const single of singles) {
    const nextBoard = normalizeBoard(board);
    const nextBar = { ...bar };
    const nextOff = { ...off };
    applySubMoveToSnapshot(nextBoard, nextBar, nextOff, seat, single);
    sequences.push(
      ...generateSequencesForOrder(nextBoard, nextBar, nextOff, seat, dice.slice(1), [
        ...used,
        single,
      ])
    );
  }
  return sequences;
}

function moveSignature(move: BackgammonSubMove[]): string {
  return move
    .map((subMove) => {
      const from = subMove.from.type === "bar" ? "bar" : `${subMove.from.point}`;
      const to = subMove.to.type === "off" ? "off" : `${subMove.to.point}`;
      return `${from}/${to}/${subMove.die}/${subMove.hit ? "h" : "-"}`;
    })
    .join(",");
}

function moveStepSignature(move: BackgammonMoveStep[] | BackgammonSubMove[]): string {
  return move
    .map((subMove) => {
      const from = subMove.from.type === "bar" ? "bar" : `${subMove.from.point}`;
      const to = subMove.to.type === "off" ? "off" : `${subMove.to.point}`;
      return `${from}/${to}`;
    })
    .join(",");
}

function mirrorPoint(point: number): number {
  return 25 - point;
}

function mirrorOwner(owner: BackgammonOwner): BackgammonOwner {
  if (owner === "user") {
    return "ai";
  }
  if (owner === "ai") {
    return "user";
  }
  return "";
}

function mirrorSubMove(subMove: BackgammonSubMove): BackgammonSubMove {
  return {
    from:
      subMove.from.type === "bar"
        ? { type: "bar", seat: opponentOf(subMove.from.seat) }
        : { type: "point", point: mirrorPoint(subMove.from.point) },
    to:
      subMove.to.type === "off"
        ? { type: "off" }
        : { type: "point", point: mirrorPoint(subMove.to.point) },
    die: subMove.die,
    hit: subMove.hit,
  };
}

export function buildMirroredBoardStateHash(
  board: BackgammonPoint[],
  bar: Record<BackgammonSeat, number>,
  off: Record<BackgammonSeat, number>
): string {
  const mirrored = createEmptyBoard();
  normalizeBoard(board).forEach((point) => {
    setPoint(mirrored, mirrorPoint(point.point), mirrorOwner(point.owner), point.count);
  });
  return buildBoardStateHash(
    mirrored,
    { user: bar.ai, ai: bar.user },
    { user: off.ai, ai: off.user }
  );
}

export function mirrorLegalMoveIdForOpponent(move: BackgammonLegalMove): string {
  if (move.pass === true || move.id === "pass") {
    return "pass";
  }
  return `move_${hashText(moveSignature(move.moves.map(mirrorSubMove)))}`;
}

function describeOrigin(origin: BackgammonMoveOrigin): string {
  return origin.type === "bar" ? "bar" : String(origin.point);
}

function describeDestination(destination: BackgammonMoveDestination): string {
  return destination.type === "off" ? "off" : String(destination.point);
}

function describeMove(move: BackgammonSubMove[]): string {
  if (move.length === 0) {
    return "pass";
  }
  return move
    .map((subMove) => {
      const suffix = subMove.hit ? "*" : "";
      return `${describeOrigin(subMove.from)}/${describeDestination(subMove.to)}${suffix}`;
    })
    .join(", ");
}

export function getLegalMovesForTurn(
  board: BackgammonPoint[],
  bar: Record<BackgammonSeat, number>,
  off: Record<BackgammonSeat, number>,
  seat: BackgammonSeat,
  dice: number[]
): BackgammonLegalMove[] {
  const normalizedDice = normalizeDice(dice);
  if (normalizedDice.length === 0) {
    return [];
  }

  const sequences = diceOrders(normalizedDice).flatMap((order) =>
    generateSequencesForOrder(normalizeBoard(board), { ...bar }, { ...off }, seat, order, [])
  );
  const maxLength = sequences.reduce((max, sequence) => Math.max(max, sequence.length), 0);
  if (maxLength === 0) {
    return [
      {
        id: "pass",
        label: "pass",
        moves: [],
        diceUsed: [],
        pass: true,
      },
    ];
  }

  const highestDie = normalizedDice.reduce((max, die) => Math.max(max, die), 0);
  const filtered = sequences
    .filter((sequence) => sequence.length === maxLength)
    .filter((sequence) => {
      if (
        normalizedDice.length !== 2 ||
        maxLength !== 1 ||
        normalizedDice[0] === normalizedDice[1]
      ) {
        return true;
      }
      return sequence[0]?.die === highestDie;
    });
  const seen = new Set<string>();
  const legalMoves: BackgammonLegalMove[] = [];

  for (const sequence of filtered) {
    const signature = moveSignature(sequence);
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    legalMoves.push({
      id: `move_${hashText(signature)}`,
      label: describeMove(sequence),
      moves: sequence,
      diceUsed: sequence.map((subMove) => subMove.die),
    });
  }

  return legalMoves;
}

export function resolveLegalMoveIdForMoveSteps(
  legalMoves: BackgammonLegalMove[],
  value: unknown
): string | null {
  if (typeof value === "string" && value.trim().toLowerCase() === "pass") {
    return legalMoves.find((move) => move.pass === true || move.id === "pass")?.id ?? null;
  }
  if (Array.isArray(value) === false) {
    return null;
  }
  if (value.length === 0) {
    return legalMoves.find((move) => move.pass === true || move.id === "pass")?.id ?? null;
  }
  const moveSteps = value
    .map(normalizeMoveStep)
    .filter((move): move is BackgammonMoveStep => move !== null);
  if (moveSteps.length !== value.length) {
    return null;
  }
  const signature = moveStepSignature(moveSteps);
  return legalMoves.find((move) => moveStepSignature(move.moves) === signature)?.id ?? null;
}

export function createTurnToken(state: BackgammonGameState, seat: BackgammonSeat): string {
  void seat;
  return hashText(
    [state.turnIndex, state.matchId || state.inviteId || state.target, state.dice.join("-")].join(
      "|"
    )
  );
}

export function prepareTurn(state: BackgammonGameState, seat: BackgammonSeat): BackgammonGameState {
  state.awaitingMoveFrom = seat;
  state.result = "pending";
  state.statusKey = seat === "user" ? "userTurn" : "aiTurn";
  state.dice =
    state.target === "us1" && (state.matchId !== null || state.inviteId !== null)
      ? rollDeterministicDice(`${state.matchId || state.inviteId}:${state.turnIndex}`)
      : rollDice();
  state.legalMoves = getLegalMovesForTurn(state.board, state.bar, state.off, seat, state.dice);
  state.turnToken = createTurnToken(state, seat);
  return state;
}

export function applyLegalMove(
  state: BackgammonGameState,
  seat: BackgammonSeat,
  legalMoveId: string
): boolean {
  const legalMove = state.legalMoves.find((move) => move.id === legalMoveId);
  if (legalMove === undefined) {
    return false;
  }
  for (const subMove of legalMove.moves) {
    applySubMoveToSnapshot(state.board, state.bar, state.off, seat, subMove);
  }
  state.dice = [];
  state.legalMoves = [];
  state.turnToken = "";
  return true;
}

function computeScorePoints(state: BackgammonGameState, winner: BackgammonSeat): number {
  const loser = opponentOf(winner);
  if (state.off[loser] > 0) {
    return 1;
  }
  const winnerHomeHasLoser =
    loser === "user"
      ? state.board.some((point) => point.owner === loser && point.point >= 19)
      : state.board.some((point) => point.owner === loser && point.point <= 6);
  if (state.bar[loser] > 0 || winnerHomeHasLoser) {
    return 3;
  }
  return 2;
}

export function applyOutcomeForSeat(
  state: BackgammonGameState,
  seat: BackgammonSeat
): BackgammonGameState {
  if (state.off[seat] >= CHECKERS_PER_SEAT) {
    state.active = false;
    state.awaitingMoveFrom = null;
    state.result = seat === "user" ? "user-win" : "ai-win";
    state.winner = seat;
    state.statusKey = seat === "user" ? "userWin" : "aiWin";
    state.scorePoints = computeScorePoints(state, seat);
    state.dice = [];
    state.legalMoves = [];
    state.turnToken = "";
  }
  return state;
}

export function getOutcomeForBoard(_board: BackgammonPoint[], state: BackgammonGameState) {
  if (state.off.user >= CHECKERS_PER_SEAT) {
    return {
      finished: true,
      result: "user-win" as const,
      winner: "user" as const,
      statusKey: "userWin",
    };
  }
  if (state.off.ai >= CHECKERS_PER_SEAT) {
    return {
      finished: true,
      result: "ai-win" as const,
      winner: "ai" as const,
      statusKey: "aiWin",
    };
  }
  return { finished: false };
}

export function createInitialState(
  locale: unknown,
  target: string,
  starter: string
): BackgammonGameState {
  const normalizedLocale = normalizeLocale(locale);
  const normalizedTarget = sanitizeTarget(target);
  const normalizedStarter = sanitizeStarter(starter);

  return {
    locale: normalizedLocale,
    target: normalizedTarget,
    starter: normalizedStarter,
    board: createInitialBoard(),
    bar: { user: 0, ai: 0 },
    off: { user: 0, ai: 0 },
    dice: [],
    legalMoves: [],
    active: false,
    awaitingMoveFrom: null,
    result: "idle",
    winner: "",
    statusKey: "idle",
    protocolDelivered: false,
    blockedReason: "",
    protocolPreface: "",
    matchId: null,
    inviteId: null,
    turnIndex: 0,
    turnToken: "",
    localSessionId: null,
    remoteUserId: null,
    opponentNickname: "",
    lastRemoteTransportMessageId: null,
    lastRemoteTurnIndex: null,
    scorePoints: 1,
  };
}

export function normalizeState(candidate: unknown, localeFallback: unknown): BackgammonGameState {
  const source = isRecord(candidate) ? candidate : {};
  const state = createInitialState(
    source["locale"] || localeFallback,
    typeof source["target"] === "string" ? source["target"] : "",
    typeof source["starter"] === "string" ? source["starter"] : ""
  );

  state.board = normalizeBoard(source["board"]);
  state.bar = cloneBarOrOff(source["bar"]);
  state.off = cloneBarOrOff(source["off"]);
  state.dice = normalizeDice(source["dice"]);
  state.legalMoves = normalizeLegalMoves(source["legalMoves"]);
  state.active = source["active"] === true;
  state.awaitingMoveFrom =
    source["awaitingMoveFrom"] === "ai" || source["awaitingMoveFrom"] === "user"
      ? source["awaitingMoveFrom"]
      : null;
  state.result =
    source["result"] === "pending" ||
    source["result"] === "user-win" ||
    source["result"] === "ai-win" ||
    source["result"] === "blocked"
      ? source["result"]
      : "idle";
  state.winner = source["winner"] === "ai" || source["winner"] === "user" ? source["winner"] : "";
  state.statusKey =
    typeof source["statusKey"] === "string" &&
    Object.prototype.hasOwnProperty.call(STATUS_COPY, source["statusKey"])
      ? source["statusKey"]
      : state.active
        ? state.awaitingMoveFrom === "ai"
          ? "aiTurn"
          : "userTurn"
        : "idle";
  state.protocolDelivered = source["protocolDelivered"] === true;
  state.blockedReason =
    typeof source["blockedReason"] === "string" && source["blockedReason"].trim() !== ""
      ? source["blockedReason"].trim()
      : "";
  state.protocolPreface = normalizeText(source["protocolPreface"]);
  state.matchId = normalizeText(source["matchId"]) || normalizeText(source["inviteId"]) || null;
  state.inviteId = normalizeText(source["inviteId"]) || null;
  state.turnIndex =
    typeof source["turnIndex"] === "number" &&
    Number.isInteger(source["turnIndex"]) &&
    source["turnIndex"] >= 0
      ? source["turnIndex"]
      : 0;
  state.turnToken = normalizeText(source["turnToken"]);
  state.localSessionId = normalizeText(source["localSessionId"]) || null;
  state.remoteUserId = normalizeText(source["remoteUserId"]) || null;
  state.opponentNickname = normalizeText(source["opponentNickname"]);
  state.lastRemoteTransportMessageId =
    normalizeText(source["lastRemoteTransportMessageId"]) || null;
  state.lastRemoteTurnIndex =
    typeof source["lastRemoteTurnIndex"] === "number" &&
    Number.isInteger(source["lastRemoteTurnIndex"]) &&
    source["lastRemoteTurnIndex"] >= 0
      ? source["lastRemoteTurnIndex"]
      : null;
  state.scorePoints =
    typeof source["scorePoints"] === "number" &&
    Number.isInteger(source["scorePoints"]) &&
    source["scorePoints"] >= 1
      ? source["scorePoints"]
      : 1;

  return state;
}

export function normalizeMatchHistoryEntry(candidate: unknown): BackgammonMatchHistoryEntry | null {
  if (isRecord(candidate) === false) {
    return null;
  }
  const id = normalizeText(candidate["id"]);
  const result = candidate["result"];
  if (id === "" || (result !== "user-win" && result !== "ai-win")) {
    return null;
  }
  const finishedAt =
    typeof candidate["finishedAt"] === "number" &&
    Number.isFinite(candidate["finishedAt"]) &&
    candidate["finishedAt"] >= 0
      ? Math.trunc(candidate["finishedAt"])
      : 0;
  return {
    id,
    finishedAt,
    target: normalizeText(candidate["target"]) || "ai1",
    opponentNickname: normalizeText(candidate["opponentNickname"]) || "Rakip",
    opponentAvatar: normalizeText(candidate["opponentAvatar"]) || null,
    userNickname: normalizeText(candidate["userNickname"]) || "User",
    result,
    starter: candidate["starter"] === "ai" ? "ai" : "user",
    scorePoints:
      typeof candidate["scorePoints"] === "number" &&
      Number.isInteger(candidate["scorePoints"]) &&
      candidate["scorePoints"] > 0
        ? candidate["scorePoints"]
        : 1,
    boardHash: normalizeText(candidate["boardHash"]),
  };
}

export function normalizeMatchHistory(value: unknown): BackgammonMatchHistoryEntry[] {
  if (Array.isArray(value) === false) {
    return [];
  }
  const entries: BackgammonMatchHistoryEntry[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = normalizeMatchHistoryEntry(value[index]);
    if (entry !== null) {
      entries.push(entry);
    }
  }
  return entries.slice(0, MATCH_HISTORY_LIMIT);
}
