import type { PatternRoomSessionSnapshot } from "./pattern-room-snapshot.js";

export interface PatternRoomStorageAdapter {
  save(snapshot: PatternRoomSessionSnapshot): Promise<void>;
  load(topicId: string): Promise<PatternRoomSessionSnapshot | null>;
  list(): Promise<PatternRoomSnapshotMeta[]>;
  delete(snapshotId: string): Promise<void>;
}

export type PatternRoomSnapshotMeta = {
  snapshotId: string;
  topicId: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
};
