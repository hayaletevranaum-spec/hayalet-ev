import {
  buildTeamTetrisSeatView,
  getTeamTetrisSpawnPosition,
  TEAM_TETRIS_BOARD_HEIGHT,
  TEAM_TETRIS_BOARD_WIDTH,
  TEAM_TETRIS_MOVE_SCHEMA,
  TEAM_TETRIS_SCHEMA_VERSION,
  type PieceId,
  type TeamTetrisMatch,
  type TeamTetrisSeatId,
} from "./engine.js";
import { TEAM_TETRIS_PIECES } from "./engine-schema.js";
import { TEAM_TETRIS_COMMAND_COPY } from "./state.js";
import { fillTemplate, translate } from "../../../shared/host/text.js";
import { buildRoomBridgeCommand } from "../../../shared/host/slot-bridge-command.js";

type TeamTetrisPieceCell = readonly [number, number];
type TeamTetrisPieceDefinition = { rotations: TeamTetrisPieceCell[][] };
type TeamTetrisAiTurnPacket = ReturnType<typeof buildTeamTetrisAiTurnPacket>;

const TEAM_TETRIS_PATH_SHIFTS = [-1, 0, 1] as const;
const TEAM_TETRIS_PIECE_MAP = TEAM_TETRIS_PIECES as unknown as Record<
  PieceId,
  TeamTetrisPieceDefinition
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
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

function teamTetrisCommandMessage(
  locale: unknown,
  key: string,
  params: Record<string, unknown> = {}
) {
  return fillTemplate(translate(locale, TEAM_TETRIS_COMMAND_COPY, key), params);
}

function resolveTeamTetrisSeatFromProvider(provider: unknown): TeamTetrisSeatId | null {
  if (provider === "room-ui") {
    return "user";
  }
  if (provider === "ai1" || provider === "ai2" || provider === "us1") {
    return provider;
  }
  return null;
}

function buildTeamTetrisProtocolScenario(match: TeamTetrisMatch | null | undefined) {
  const currentTurn = match?.currentTurn ?? null;
  return currentTurn?.role === "followup" ? "team-tetris-ai-followup" : "team-tetris-ai-opening";
}

function formatTeamTetrisSeatToken(seatId: unknown): string {
  return typeof seatId === "string" && seatId.trim() !== "" ? seatId.trim().toUpperCase() : "???";
}

function deriveCreatorPartnerSeatId(match: TeamTetrisMatch | null | undefined): string | null {
  if (!match) {
    return null;
  }

  const teamWithUser =
    match.teams["team-a"].seatIds.includes("user") === true
      ? match.teams["team-a"]
      : match.teams["team-b"];
  const partnerSeatId =
    teamWithUser.seatIds.find(function (seatId: TeamTetrisSeatId) {
      return seatId !== "user";
    }) || null;
  return partnerSeatId;
}

function buildTeamTetrisPairingLines(
  match: TeamTetrisMatch | null | undefined,
  options: {
    hiddenPairs?: boolean;
    selectedPartnerSeatId?: string | null;
  } = {}
): string[] {
  const hiddenPairs =
    options.hiddenPairs !== undefined ? options.hiddenPairs === true : match?.hiddenPairs === true;
  if (hiddenPairs === true && match?.revealedPairs !== true) {
    return [
      "Pairing mode: Hidden until game over.",
      "Pairs were randomized and their identities stay hidden until the match ends.",
    ];
  }

  const creatorPartnerSeatId = options.selectedPartnerSeatId || deriveCreatorPartnerSeatId(match);
  if (!creatorPartnerSeatId) {
    return ["Pairing mode: Pairs are visible from the start."];
  }

  const remainingPair = ["ai1", "ai2", "us1"].filter(function (seatId) {
    return seatId !== creatorPartnerSeatId;
  });
  return [
    "Pairing mode: Creator-selected pairs are visible from the start.",
    `Creator pair: USER + ${formatTeamTetrisSeatToken(creatorPartnerSeatId)}.`,
    `Remaining pair: ${remainingPair.map(formatTeamTetrisSeatToken).join(" + ")}.`,
  ];
}

function buildTeamTetrisAiTurnPacket(
  match: TeamTetrisMatch | null | undefined,
  seatId: TeamTetrisSeatId
) {
  const view = buildTeamTetrisSeatView(match, seatId);
  if (!view || !view.pendingTurn) {
    return null;
  }
  return {
    schemaVersion: TEAM_TETRIS_SCHEMA_VERSION,
    matchId: view.matchId,
    turnIndex: view.pendingTurn.turnIndex,
    turnToken: view.pendingTurn.turnToken,
    teamId: view.seat.teamId,
    actingRole: view.pendingTurn.actingRole,
    boardWidth: TEAM_TETRIS_BOARD_WIDTH,
    boardHeight: TEAM_TETRIS_BOARD_HEIGHT,
    pathEncoding: TEAM_TETRIS_MOVE_SCHEMA.pathEncoding,
    rowShiftRange: TEAM_TETRIS_MOVE_SCHEMA.rowShiftRange.slice(),
    pieceGeometryCatalog: Object.fromEntries(
      Object.entries(TEAM_TETRIS_PIECE_MAP).map(function ([pieceKey, definition]) {
        return [
          pieceKey,
          Array.isArray(definition.rotations)
            ? definition.rotations.map(function (shape: TeamTetrisPieceCell[]) {
                return Array.isArray(shape)
                  ? shape.map(function (cell: TeamTetrisPieceCell) {
                      return [cell[0], cell[1]];
                    })
                  : [];
              })
            : [],
        ];
      })
    ),
    hiddenPairs: view.hiddenPairs,
    revealedPairs: view.revealedPairs,
    teamBoardPrivateRows: view.ownTeam.boardRows.slice(),
    teamBoardBeforePartnerPieceRows: view.ownTeam.boardBeforePartnerPieceRows.slice(),
    partnerLastPiece: view.ownTeam.partnerLastPiece,
    opponentBoardPublicRows: view.opponentTeam.boardRows.slice(),
    currentPiece: view.pendingTurn.pieceId,
    legalRotations: view.pendingTurn.legalRotations.slice(),
  };
}

function buildTeamTetrisAsciiBoard(rows: string[] | null | undefined) {
  return Array.isArray(rows) ? rows.join("\n") : "";
}

function getTeamTetrisRotationCells(
  pieceId: PieceId,
  rotation: number,
  originX: number,
  originY: number
) {
  const definition = TEAM_TETRIS_PIECE_MAP[pieceId];
  const shape = Array.isArray(definition.rotations) ? definition.rotations[rotation] : null;
  if (!Array.isArray(shape)) {
    return [];
  }
  return shape.map(function (cell: TeamTetrisPieceCell) {
    return {
      x: originX + cell[0],
      y: originY + cell[1],
    };
  });
}

function isTeamTetrisAsciiCellBlocked(rows: string[], x: number, y: number) {
  if (x < 0 || x >= TEAM_TETRIS_BOARD_WIDTH || y < 0 || y >= TEAM_TETRIS_BOARD_HEIGHT) {
    return true;
  }

  const row = rows[y] ?? "";
  const cell = row[x] ?? ".";
  return cell !== ".";
}

function doesTeamTetrisAsciiPieceCollide(
  rows: string[],
  pieceId: PieceId,
  rotation: number,
  x: number,
  y: number
) {
  const cells = getTeamTetrisRotationCells(pieceId, rotation, x, y);
  if (cells.length === 0) {
    return true;
  }
  return cells.some(function (cell) {
    return isTeamTetrisAsciiCellBlocked(rows, cell.x, cell.y);
  });
}

function buildTeamTetrisReferenceMove(
  packet: NonNullable<TeamTetrisAiTurnPacket>
): { rotation: number; rowShifts: number[] } | null {
  if (isTeamTetrisPieceId(packet.currentPiece) === false) {
    return null;
  }

  for (const rotation of packet.legalRotations) {
    const spawn = getTeamTetrisSpawnPosition(packet.currentPiece, rotation);
    if (
      doesTeamTetrisAsciiPieceCollide(
        packet.teamBoardPrivateRows,
        packet.currentPiece,
        rotation,
        spawn.x,
        spawn.y
      )
    ) {
      continue;
    }

    const queue: Array<{ x: number; y: number; rowShifts: number[] }> = [
      {
        x: spawn.x,
        y: spawn.y,
        rowShifts: [],
      },
    ];
    const visited = new Set<string>([`${rotation}:${spawn.x}:${spawn.y}`]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      if (
        doesTeamTetrisAsciiPieceCollide(
          packet.teamBoardPrivateRows,
          packet.currentPiece,
          rotation,
          current.x,
          current.y + 1
        )
      ) {
        return {
          rotation,
          rowShifts: current.rowShifts,
        };
      }

      TEAM_TETRIS_PATH_SHIFTS.forEach(function (shift) {
        const shiftedX = current.x + shift;
        if (
          shift !== 0 &&
          doesTeamTetrisAsciiPieceCollide(
            packet.teamBoardPrivateRows,
            packet.currentPiece,
            rotation,
            shiftedX,
            current.y
          )
        ) {
          return;
        }

        if (
          doesTeamTetrisAsciiPieceCollide(
            packet.teamBoardPrivateRows,
            packet.currentPiece,
            rotation,
            shiftedX,
            current.y + 1
          )
        ) {
          return;
        }

        const nextY = current.y + 1;
        const key = `${rotation}:${shiftedX}:${nextY}`;
        if (visited.has(key)) {
          return;
        }

        visited.add(key);
        queue.push({
          x: shiftedX,
          y: nextY,
          rowShifts: current.rowShifts.concat(shift),
        });
      });
    }
  }

  return null;
}

function buildTeamTetrisSpawnHints(packet: NonNullable<TeamTetrisAiTurnPacket>) {
  if (isTeamTetrisPieceId(packet.currentPiece) === false) {
    return [];
  }

  return packet.legalRotations.map(function (rotation) {
    const spawn = getTeamTetrisSpawnPosition(packet.currentPiece, rotation);
    return `rot ${rotation} -> (${spawn.x},${spawn.y})`;
  });
}

function buildTeamTetrisAiCommandExample(packet: NonNullable<TeamTetrisAiTurnPacket>) {
  if (packet.partnerLastPiece) {
    return "";
  }

  const referenceMove = buildTeamTetrisReferenceMove(packet);
  if (!referenceMove) {
    return "";
  }

  return buildRoomBridgeCommand("GameRoomTeamTetrisAiMove", {
    schemaVersion: packet.schemaVersion,
    matchId: packet.matchId,
    turnIndex: packet.turnIndex,
    turnToken: packet.turnToken,
    pieceId: packet.currentPiece,
    rotation: referenceMove.rotation,
    rowShifts: referenceMove.rowShifts,
  });
}

function buildTeamTetrisCommandSkeleton(packet: {
  schemaVersion: number;
  matchId: string;
  turnIndex: number;
  turnToken: string;
  currentPiece: string;
  rowShiftRange: number[];
}) {
  return (
    '++cmd:SlotBridge({"action":"room.command","payload":{"commandName":"GameRoomTeamTetrisAiMove",' +
    `"schemaVersion":${packet.schemaVersion},` +
    `"matchId":"${packet.matchId}",` +
    `"turnIndex":${packet.turnIndex},` +
    `"turnToken":"${packet.turnToken}",` +
    `"pieceId":"${packet.currentPiece}",` +
    '"rotation":<legal-rotation>,' +
    `"rowShifts":[${packet.rowShiftRange.join("|")}, ... intended route]}})`
  );
}

function buildTeamTetrisAiTurnMessage(
  match: TeamTetrisMatch | null | undefined,
  seatId: TeamTetrisSeatId
) {
  const packet = buildTeamTetrisAiTurnPacket(match, seatId);
  if (!packet) {
    return "";
  }

  const commandExample = buildTeamTetrisAiCommandExample(packet);
  const commandSkeleton = buildTeamTetrisCommandSkeleton(packet);
  const spawnHints = buildTeamTetrisSpawnHints(packet);
  const hiddenPartnerLock = packet.partnerLastPiece !== null;
  const privateBoardAscii = buildTeamTetrisAsciiBoard(packet.teamBoardPrivateRows);
  const beforePartnerAscii = buildTeamTetrisAsciiBoard(packet.teamBoardBeforePartnerPieceRows);
  const includeBeforePartnerAppendix =
    beforePartnerAscii.trim() !== "" && beforePartnerAscii !== privateBoardAscii;
  const messageLines = [
    "Team Tetris turn update from the Game Room.",
    "Game: Team Tetris.",
    ...buildTeamTetrisPairingLines(match),
    "Your reply is parsed from only the latest assistant message.",
    'Reply with exactly one ++cmd:SlotBridge({"action":"room.command","payload":{...}}) line.',
    "Copy schemaVersion, matchId, turnIndex, turnToken, and pieceId exactly from the turn packet.",
    "Use pieceGeometryCatalog from the packet as the authoritative tetromino geometry reference instead of memory.",
    hiddenPartnerLock
      ? "Choose one legal rotation from the packet and compute an intended rowShifts route from the visible private board plus the hidden occupancy implied by partnerLastPiece."
      : "Choose one legal rotation from the packet and compute an intended rowShifts route from the private board snapshot.",
    ...(hiddenPartnerLock
      ? [
          "If partnerLastPiece is present, the visible board intentionally omits your partner's most recent lock; infer its landing cells before planning rowShifts.",
        ]
      : []),
    "rowShifts encodes your intended sideways shift for each downward advance you explicitly plan.",
    "When the explicit rowShifts route ends, the host keeps dropping the piece straight down until it locks.",
    "If the real board blocks a drawn step early, the piece locks at the last reached step instead.",
    "The host rejects stale turn tokens, invalid rotations, invalid rowShifts, and spawn collisions.",
    commandExample
      ? `A legal reference command for this exact board is: ${commandExample}`
      : hiddenPartnerLock
        ? `No exact reference command is included because the visible board may hide your partner's latest lock. Command skeleton (replace placeholders before sending): ${commandSkeleton}`
        : `Command skeleton (replace placeholders before sending): ${commandSkeleton}`,
    "You may send a different legal move, but rowShifts should only describe the intended route you want replayed.",
    "The final closing `)` is required or the command is rejected.",
    "Do not add markdown, prose, code fences, or a second command.",
    "",
    "Turn packet JSON:",
    JSON.stringify(packet, null, 2),
    "",
    `Board geometry: ${packet.boardWidth} columns x ${packet.boardHeight} rows.`,
    `Path encoding: ${packet.pathEncoding} (${packet.rowShiftRange.join(", ")} per row, top-to-bottom).`,
    spawnHints.length > 0
      ? `Spawn by legal rotation: ${spawnHints.join(" | ")}`
      : "Spawn by legal rotation: unavailable",
    "",
    "ASCII appendix:",
    hiddenPartnerLock
      ? "Own team visible board (partner lock hidden on purpose):"
      : "Own team board:",
    privateBoardAscii,
    ...(includeBeforePartnerAppendix
      ? ["", "Own team board before partner piece:", beforePartnerAscii]
      : []),
    "",
    "Opponent public board:",
    buildTeamTetrisAsciiBoard(packet.opponentBoardPublicRows),
  ];

  return messageLines.join("\n");
}

function buildTeamTetrisAiStartMessage(
  match: TeamTetrisMatch | null | undefined,
  options: {
    hiddenPairs?: boolean;
    selectedPartnerSeatId?: string | null;
  } = {}
) {
  return [
    "Team Tetris match initialized from the Game Room.",
    "Game: Team Tetris.",
    ...buildTeamTetrisPairingLines(match, options),
    "No reply is needed yet. Wait for your turn packet before sending any move command.",
  ].join("\n");
}

function buildTeamTetrisRemoteStartText(
  match: TeamTetrisMatch | null | undefined,
  options: {
    hiddenPairs?: boolean;
    selectedPartnerSeatId?: string | null;
  } = {}
) {
  return [
    "Team Tetris match started.",
    ...buildTeamTetrisPairingLines(match, options),
    "Open the room UI to follow the live board state.",
  ].join("\n");
}

function buildTeamTetrisRemoteMoveText(movePayload: Record<string, unknown>) {
  return buildRoomBridgeCommand("GameRoomTeamTetrisRemoteMove", movePayload);
}

function parseTeamTetrisStartEventNote(note: unknown): Record<string, unknown> | null {
  if (typeof note !== "string" || note.trim() === "") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(note);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export {
  buildTeamTetrisAiStartMessage,
  buildTeamTetrisAiTurnMessage,
  buildTeamTetrisAiTurnPacket,
  buildTeamTetrisAsciiBoard,
  buildTeamTetrisProtocolScenario,
  buildTeamTetrisRemoteStartText,
  buildTeamTetrisRemoteMoveText,
  parseTeamTetrisStartEventNote,
  resolveTeamTetrisSeatFromProvider,
  teamTetrisCommandMessage,
};
