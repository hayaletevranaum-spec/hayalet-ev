const TEAM_TETRIS_BOARD_WIDTH = 10;
const TEAM_TETRIS_BOARD_HEIGHT = 20;
const TEAM_TETRIS_SCHEMA_VERSION = 1;
const TEAM_TETRIS_PIECE_IDS = ["I", "O", "T", "S", "Z", "J", "L"];
const TEAM_TETRIS_SEAT_IDS = ["user", "ai1", "ai2", "us1"];
const TEAM_TETRIS_ROTATIONS = [0, 1, 2, 3];
const TEAM_TETRIS_TURN_LOOP = [
  "team-a-opener",
  "team-b-opener",
  "team-a-followup",
  "team-b-followup",
];

const TEAM_TETRIS_MOVE_SCHEMA = {
  schemaVersion: TEAM_TETRIS_SCHEMA_VERSION,
  rotationEnum: TEAM_TETRIS_ROTATIONS.slice(),
  pieceIds: TEAM_TETRIS_PIECE_IDS.slice(),
  pathEncoding: "rowShifts",
  rowShiftRange: [-1, 0, 1],
  rowOrder: "top-to-bottom",
  origin: "top-left",
  seatIdTrust: "derived-by-host",
};

const TEAM_TETRIS_PIECES = {
  I: {
    rotations: [
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
      ],
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [0, 3],
      ],
    ],
  },
  O: {
    rotations: [
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ],
    ],
  },
  T: {
    rotations: [
      [
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ],
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [0, 2],
      ],
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [1, 1],
      ],
      [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, 2],
      ],
    ],
  },
  S: {
    rotations: [
      [
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
      ],
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 2],
      ],
    ],
  },
  Z: {
    rotations: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [2, 1],
      ],
      [
        [1, 0],
        [0, 1],
        [1, 1],
        [0, 2],
      ],
    ],
  },
  J: {
    rotations: [
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ],
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 2],
      ],
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [2, 1],
      ],
      [
        [1, 0],
        [1, 1],
        [0, 2],
        [1, 2],
      ],
    ],
  },
  L: {
    rotations: [
      [
        [2, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ],
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 2],
      ],
      [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
      ],
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [1, 2],
      ],
    ],
  },
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function hashString(value: unknown) {
  let hash = 2166136261;
  const input = String(value || "");
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createDeterministicRng(seed: unknown) {
  let state = hashString(seed) || 1;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let candidate = state;
    candidate = Math.imul(candidate ^ (candidate >>> 15), candidate | 1);
    candidate ^= candidate + Math.imul(candidate ^ (candidate >>> 7), candidate | 61);
    return ((candidate ^ (candidate >>> 14)) >>> 0) / 4294967296;
  };
}

export {
  TEAM_TETRIS_BOARD_HEIGHT,
  TEAM_TETRIS_BOARD_WIDTH,
  TEAM_TETRIS_MOVE_SCHEMA,
  TEAM_TETRIS_PIECES,
  TEAM_TETRIS_PIECE_IDS,
  TEAM_TETRIS_ROTATIONS,
  TEAM_TETRIS_SCHEMA_VERSION,
  TEAM_TETRIS_SEAT_IDS,
  TEAM_TETRIS_TURN_LOOP,
  createDeterministicRng,
  hashString,
  normalizeText,
};
