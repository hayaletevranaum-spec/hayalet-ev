import {
  TEAM_TETRIS_BOARD_HEIGHT,
  TEAM_TETRIS_BOARD_WIDTH,
  TEAM_TETRIS_PIECES,
} from "./engine-schema.js";

export type PieceId = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export type TeamTetrisBoard = string[][];

export interface TeamTetrisCell {
  x: number;
  y: number;
}

export interface TeamTetrisReplayFailure {
  success: false;
  reason: string;
  stepIndex?: number;
}

export interface TeamTetrisReplaySuccess {
  success: true;
  x: number;
  y: number;
  rotation: number;
  cells: TeamTetrisCell[];
  pathCells: TeamTetrisCell[];
  pathComplete: boolean;
  autoDropDistance: number;
  blockedReason?: string;
  stepIndex?: number;
}

export type TeamTetrisReplayResult = TeamTetrisReplayFailure | TeamTetrisReplaySuccess;

type PieceCell = readonly [number, number];
type TeamTetrisPieceDefinition = { rotations: PieceCell[][] };

const TEAM_TETRIS_PIECE_MAP = TEAM_TETRIS_PIECES as unknown as Record<
  PieceId,
  TeamTetrisPieceDefinition
>;

function createEmptyTeamTetrisBoard(): TeamTetrisBoard {
  return Array.from({ length: TEAM_TETRIS_BOARD_HEIGHT }, function () {
    return Array.from({ length: TEAM_TETRIS_BOARD_WIDTH }, function () {
      return "";
    });
  });
}

function cloneTeamTetrisBoard(board: unknown): TeamTetrisBoard {
  if (Array.isArray(board) === false) {
    return createEmptyTeamTetrisBoard();
  }
  const rows = board as unknown[];

  return Array.from({ length: TEAM_TETRIS_BOARD_HEIGHT }, function (_entry, rowIndex: number) {
    const row = Array.isArray(rows[rowIndex]) ? (rows[rowIndex] as unknown[]) : [];
    return Array.from({ length: TEAM_TETRIS_BOARD_WIDTH }, function (_cell, columnIndex: number) {
      const value = row[columnIndex];
      return typeof value === "string" ? value : "";
    });
  });
}

function teamTetrisBoardToRows(board: TeamTetrisBoard): string[] {
  return cloneTeamTetrisBoard(board).map(function (row: string[]) {
    return row
      .map(function (cell: string) {
        return cell === "" ? "." : String(cell).charAt(0);
      })
      .join("");
  });
}

function getPieceRotations(pieceId: PieceId): PieceCell[][] {
  return TEAM_TETRIS_PIECE_MAP[pieceId].rotations;
}

function getTeamTetrisLegalRotations(pieceId: PieceId): number[] {
  return getPieceRotations(pieceId).map(function (_entry: PieceCell[], index: number) {
    return index;
  });
}

function getNormalizedTeamTetrisRotation(pieceId: PieceId, rotation: number): number | null {
  const legalRotations = getTeamTetrisLegalRotations(pieceId);
  return legalRotations.indexOf(rotation) !== -1 ? rotation : null;
}

function getTeamTetrisPieceCells(
  pieceId: PieceId,
  rotation: number,
  originX: number,
  originY: number
): TeamTetrisCell[] {
  const normalizedRotation = getNormalizedTeamTetrisRotation(pieceId, rotation);
  const shapes = getPieceRotations(pieceId);
  if (normalizedRotation === null || shapes.length === 0) {
    return [];
  }
  const shape = shapes[normalizedRotation];
  if (!Array.isArray(shape)) {
    return [];
  }
  return shape.map(function (cell: PieceCell) {
    return {
      x: originX + cell[0],
      y: originY + cell[1],
    };
  });
}

function getTeamTetrisPieceBounds(
  pieceId: PieceId,
  rotation: number
): { width: number; height: number } {
  const cells = getTeamTetrisPieceCells(pieceId, rotation, 0, 0);
  let maxX = -1;
  let maxY = -1;
  cells.forEach(function (cell: TeamTetrisCell) {
    maxX = Math.max(maxX, cell.x);
    maxY = Math.max(maxY, cell.y);
  });
  return {
    width: maxX + 1,
    height: maxY + 1,
  };
}

function getTeamTetrisSpawnPosition(pieceId: PieceId, rotation: number): TeamTetrisCell {
  const bounds = getTeamTetrisPieceBounds(pieceId, rotation);
  return {
    x: Math.max(0, Math.floor((TEAM_TETRIS_BOARD_WIDTH - bounds.width) / 2)),
    y: 0,
  };
}

function isTeamTetrisCellBlocked(board: TeamTetrisBoard, x: number, y: number): boolean {
  if (x < 0 || x >= TEAM_TETRIS_BOARD_WIDTH || y < 0 || y >= TEAM_TETRIS_BOARD_HEIGHT) {
    return true;
  }
  const row = board[y];
  return !row || row[x] !== "";
}

function doesTeamTetrisPieceCollide(
  board: TeamTetrisBoard,
  pieceId: PieceId,
  rotation: number,
  x: number,
  y: number
): boolean {
  const cells = getTeamTetrisPieceCells(pieceId, rotation, x, y);
  if (cells.length === 0) {
    return true;
  }
  return cells.some(function (cell: TeamTetrisCell) {
    return isTeamTetrisCellBlocked(board, cell.x, cell.y);
  });
}

function buildTeamTetrisBoardHash(board: TeamTetrisBoard): string {
  return teamTetrisBoardToRows(board).join("|");
}

function pushUniqueTeamTetrisPathCell(
  pathCells: TeamTetrisCell[],
  pieceId: PieceId,
  rotation: number,
  x: number,
  y: number
): void {
  const bounds = getTeamTetrisPieceBounds(pieceId, rotation);
  const traceCell = {
    x: Math.max(0, Math.min(TEAM_TETRIS_BOARD_WIDTH - 1, x + Math.floor((bounds.width - 1) / 2))),
    y: Math.max(0, Math.min(TEAM_TETRIS_BOARD_HEIGHT - 1, y + Math.floor((bounds.height - 1) / 2))),
  };
  const lastCell = pathCells[pathCells.length - 1] ?? null;
  if (lastCell && lastCell.x === traceCell.x && lastCell.y === traceCell.y) {
    return;
  }
  pathCells.push(traceCell);
}

function replayTeamTetrisPath(
  board: TeamTetrisBoard,
  pieceId: PieceId,
  rotation: number,
  rowShifts: number[]
): TeamTetrisReplayResult {
  const normalizedRotation = getNormalizedTeamTetrisRotation(pieceId, rotation);
  if (normalizedRotation === null) {
    return { success: false, reason: "invalid-rotation" };
  }
  if (
    Array.isArray(rowShifts) === false ||
    rowShifts.some(function (value: number) {
      return value !== -1 && value !== 0 && value !== 1;
    })
  ) {
    return { success: false, reason: "invalid-row-shifts" };
  }

  const spawn = getTeamTetrisSpawnPosition(pieceId, normalizedRotation);
  if (doesTeamTetrisPieceCollide(board, pieceId, normalizedRotation, spawn.x, spawn.y)) {
    return { success: false, reason: "spawn-collision" };
  }

  let x = spawn.x;
  let y = spawn.y;
  const pathCells: TeamTetrisCell[] = [];
  pushUniqueTeamTetrisPathCell(pathCells, pieceId, normalizedRotation, x, y);
  for (let index = 0; index < rowShifts.length; index += 1) {
    const shift = rowShifts[index] ?? 0;
    if (shift !== 0) {
      if (doesTeamTetrisPieceCollide(board, pieceId, normalizedRotation, x + shift, y)) {
        return {
          success: true,
          x,
          y,
          rotation: normalizedRotation,
          cells: getTeamTetrisPieceCells(pieceId, normalizedRotation, x, y),
          pathCells,
          pathComplete: false,
          autoDropDistance: 0,
          blockedReason: "horizontal-collision",
          stepIndex: index,
        };
      }
      x += shift;
    }
    if (doesTeamTetrisPieceCollide(board, pieceId, normalizedRotation, x, y + 1)) {
      return {
        success: true,
        x,
        y,
        rotation: normalizedRotation,
        cells: getTeamTetrisPieceCells(pieceId, normalizedRotation, x, y),
        pathCells,
        pathComplete: false,
        autoDropDistance: 0,
        blockedReason: "downward-collision",
        stepIndex: index,
      };
    }
    y += 1;
    pushUniqueTeamTetrisPathCell(pathCells, pieceId, normalizedRotation, x, y);
  }

  let autoDropDistance = 0;
  while (!doesTeamTetrisPieceCollide(board, pieceId, normalizedRotation, x, y + 1)) {
    y += 1;
    autoDropDistance += 1;
    pushUniqueTeamTetrisPathCell(pathCells, pieceId, normalizedRotation, x, y);
  }

  return {
    success: true,
    x,
    y,
    rotation: normalizedRotation,
    cells: getTeamTetrisPieceCells(pieceId, normalizedRotation, x, y),
    pathCells,
    pathComplete: true,
    autoDropDistance,
  };
}

function clearTeamTetrisLines(board: TeamTetrisBoard): {
  board: TeamTetrisBoard;
  clearedLines: number;
} {
  const rows = cloneTeamTetrisBoard(board);
  const keptRows = rows.filter(function (row: string[]) {
    return row.some(function (cell: string) {
      return cell === "";
    });
  });
  const clearedLines = TEAM_TETRIS_BOARD_HEIGHT - keptRows.length;
  while (keptRows.length < TEAM_TETRIS_BOARD_HEIGHT) {
    keptRows.unshift(
      Array.from({ length: TEAM_TETRIS_BOARD_WIDTH }, function () {
        return "";
      })
    );
  }
  return {
    board: keptRows,
    clearedLines,
  };
}

export {
  buildTeamTetrisBoardHash,
  clearTeamTetrisLines,
  cloneTeamTetrisBoard,
  createEmptyTeamTetrisBoard,
  doesTeamTetrisPieceCollide,
  getTeamTetrisLegalRotations,
  getTeamTetrisSpawnPosition,
  replayTeamTetrisPath,
  teamTetrisBoardToRows,
};
