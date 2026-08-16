import {
  PATTERN_ROOM_SNAPSHOT_VERSION,
  type PatternRoomSessionSnapshot,
} from "../types/pattern-room-snapshot.js";
import { parsePatternRoomSessionSnapshot } from "./pattern-room-snapshot.js";

type SnapshotRecord = Record<string, unknown>;
type PatternRoomSnapshotMigration = (blob: unknown) => PatternRoomSessionSnapshot | null;

const SNAPSHOT_MIGRATIONS: Record<number, PatternRoomSnapshotMigration> = {
  [PATTERN_ROOM_SNAPSHOT_VERSION]: parsePatternRoomSessionSnapshot,
};

function isRecord(value: unknown): value is SnapshotRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSchemaVersion(blob: unknown): number | null {
  if (!isRecord(blob) || typeof blob["schemaVersion"] !== "number") {
    return null;
  }
  return blob["schemaVersion"];
}

export function migratePatternRoomSnapshot(blob: unknown): PatternRoomSessionSnapshot | null {
  const schemaVersion = readSchemaVersion(blob);
  if (schemaVersion === null) {
    return null;
  }

  const migrate = SNAPSHOT_MIGRATIONS[schemaVersion];
  return migrate === undefined ? null : migrate(blob);
}
