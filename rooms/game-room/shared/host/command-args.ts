import { normalizeText } from "./text.js";

type RoomArgsRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RoomArgsRecord {
  return typeof value === "object" && value !== null && Array.isArray(value) === false;
}

export function readArgs(payload: unknown): RoomArgsRecord {
  if (isRecord(payload) === false) {
    return {};
  }
  if (isRecord(payload["roomArgs"])) {
    return payload["roomArgs"];
  }
  return {};
}

export function readInviteId(payload: unknown): string | null {
  const args = readArgs(payload);
  if (typeof args["matchId"] === "string" && args["matchId"].trim() !== "") {
    return args["matchId"].trim();
  }
  if (typeof args["inviteId"] === "string" && args["inviteId"].trim() !== "") {
    return args["inviteId"].trim();
  }
  return null;
}

export function readTurnIndex(payload: unknown): number | null {
  const args = readArgs(payload);
  if (
    typeof args["turnIndex"] === "number" &&
    Number.isInteger(args["turnIndex"]) &&
    args["turnIndex"] >= 0
  ) {
    return args["turnIndex"];
  }
  if (typeof args["turnIndex"] === "string" && args["turnIndex"].trim() !== "") {
    const parsed = Number.parseInt(args["turnIndex"], 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

export function readBoardHashBeforeMove(payload: unknown): string | null {
  const args = readArgs(payload);
  if (
    typeof args["boardHashBeforeMove"] === "string" &&
    args["boardHashBeforeMove"].trim() !== ""
  ) {
    return args["boardHashBeforeMove"].trim();
  }
  return null;
}

export function readLegalMoveId(payload: unknown): string | null {
  const args = readArgs(payload);
  const value = normalizeText(args["legalMoveId"]) || normalizeText(args["moveId"]);
  return value !== "" ? value : null;
}

export function readTurnToken(payload: unknown): string | null {
  const args = readArgs(payload);
  const value = normalizeText(args["turnToken"]);
  return value !== "" ? value : null;
}

export function readTransportMessageId(payload: unknown): string | null {
  if (
    isRecord(payload) &&
    typeof payload["transportMessageId"] === "string" &&
    payload["transportMessageId"].trim() !== ""
  ) {
    return payload["transportMessageId"].trim();
  }
  return null;
}

export function readRemoteUserId(payload: unknown): string | null {
  if (
    isRecord(payload) &&
    typeof payload["remoteUserId"] === "string" &&
    payload["remoteUserId"].trim() !== ""
  ) {
    return payload["remoteUserId"].trim();
  }
  const args = readArgs(payload);
  if (typeof args["remoteUserId"] === "string" && args["remoteUserId"].trim() !== "") {
    return args["remoteUserId"].trim();
  }
  return null;
}

export function readInviteNote(payload: unknown): string {
  const args = readArgs(payload);
  return normalizeText(args["inviteMessage"]);
}

export function parseIntegerValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeTeamTetrisMoveArgs(
  payload: unknown,
  defaultSchemaVersion: number
): {
  schemaVersion: number;
  matchId: string;
  turnIndex: number | null;
  turnToken: string;
  pieceId: string;
  rotation: number;
  rowShifts: number[];
} {
  const args = readArgs(payload);
  return {
    schemaVersion: parseIntegerValue(args["schemaVersion"]) || defaultSchemaVersion,
    matchId: normalizeText(args["matchId"]),
    turnIndex: parseIntegerValue(args["turnIndex"]),
    turnToken: normalizeText(args["turnToken"]),
    pieceId: normalizeText(args["pieceId"]),
    rotation: parseIntegerValue(args["rotation"]) || 0,
    rowShifts: Array.isArray(args["rowShifts"])
      ? args["rowShifts"]
          .map((value: unknown) => parseIntegerValue(value))
          .filter((value): value is number => value === -1 || value === 0 || value === 1)
      : [],
  };
}
