const SLOT_BRIDGE_COMMAND = "SlotBridge";

interface Us1RoomBridgeCommandOptions {
  roomId: string;
  featureId: string;
  commandName: string;
  payload?: Record<string, unknown>;
  matchId?: string | null;
  turnIndex?: number | null;
  turnToken?: string | null;
  boardHashBeforeMove?: string | null;
}

function buildRoomBridgeEnvelope(commandName: string, payload: Record<string, unknown> = {}) {
  return {
    action: "room.command",
    payload: {
      commandName,
      ...payload,
    },
  };
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readOptionalInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

export function buildRoomBridgeCommand(
  commandName: string,
  payload: Record<string, unknown> = {}
): string {
  return `++cmd:${SLOT_BRIDGE_COMMAND}(${JSON.stringify(buildRoomBridgeEnvelope(commandName, payload))})`;
}

export function buildUs1RoomBridgeCommand(options: Us1RoomBridgeCommandOptions): {
  roomId: string;
  featureId: string;
  action: "room.command";
  commandName: string;
  roomPayload: Record<string, unknown>;
  matchId?: string;
  turnIndex?: number;
  turnToken?: string;
  boardHashBeforeMove?: string;
  rawArgs: string;
} {
  const roomPayload = options.payload !== undefined ? { ...options.payload } : {};

  const matchId = readOptionalString(options.matchId) ?? readOptionalString(roomPayload["matchId"]);
  const turnIndex =
    readOptionalInteger(options.turnIndex) ?? readOptionalInteger(roomPayload["turnIndex"]);
  const turnToken =
    readOptionalString(options.turnToken) ?? readOptionalString(roomPayload["turnToken"]);
  const boardHashBeforeMove =
    readOptionalString(options.boardHashBeforeMove) ??
    readOptionalString(roomPayload["boardHashBeforeMove"]);

  return {
    roomId: options.roomId,
    featureId: options.featureId,
    action: "room.command",
    commandName: options.commandName,
    roomPayload,
    ...(matchId !== null ? { matchId } : {}),
    ...(turnIndex !== null ? { turnIndex } : {}),
    ...(turnToken !== null ? { turnToken } : {}),
    ...(boardHashBeforeMove !== null ? { boardHashBeforeMove } : {}),
    rawArgs: JSON.stringify(roomPayload),
  };
}
