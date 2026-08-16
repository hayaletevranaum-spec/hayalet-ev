import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { migratePatternRoomSnapshot } from "../shared/state/pattern-room-snapshot-migration.js";
import type { PatternRoomStorageAdapter } from "../shared/types/pattern-room-storage.js";
import type { PatternRoomSessionSnapshot } from "../shared/types/pattern-room-snapshot.js";
import type { PatternRoomSnapshotMeta } from "../shared/types/pattern-room-storage.js";

const SNAPSHOT_FILE_SUFFIX = ".snapshot.json";
const SAFE_TOPIC_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function assertSafeTopicId(topicId: string): void {
  if (SAFE_TOPIC_ID_PATTERN.test(topicId) !== true) {
    throw new Error("Unsafe Pattern Room snapshot topicId.");
  }
}

function createSnapshotMeta(snapshot: PatternRoomSessionSnapshot): PatternRoomSnapshotMeta {
  return {
    snapshotId: snapshot.snapshotId,
    topicId: snapshot.topicId,
    schemaVersion: snapshot.schemaVersion,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
  };
}

async function readSnapshotFile(filePath: string): Promise<PatternRoomSessionSnapshot | null> {
  try {
    const blob = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    return migratePatternRoomSnapshot(blob);
  } catch (error) {
    if (isMissingFileError(error) || error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

export class PatternRoomJsonStore implements PatternRoomStorageAdapter {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async save(snapshot: PatternRoomSessionSnapshot): Promise<void> {
    assertSafeTopicId(snapshot.topicId);
    const parsedSnapshot = migratePatternRoomSnapshot(snapshot);
    if (parsedSnapshot === null) {
      throw new Error("Pattern Room snapshot cannot be persisted.");
    }

    await mkdir(this.baseDir, { recursive: true });
    const snapshotPath = this.getSnapshotPath(snapshot.topicId);
    const tempPath = this.getTempSnapshotPath(snapshot.topicId);

    try {
      await writeFile(tempPath, `${JSON.stringify(parsedSnapshot, null, 2)}\n`, "utf8");
      await rename(tempPath, snapshotPath);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async load(topicId: string): Promise<PatternRoomSessionSnapshot | null> {
    assertSafeTopicId(topicId);
    return await readSnapshotFile(this.getSnapshotPath(topicId));
  }

  async list(): Promise<PatternRoomSnapshotMeta[]> {
    const entries = await this.listSnapshotFileNames();
    const snapshots = await Promise.all(
      entries.map(async (fileName) => {
        return await readSnapshotFile(join(this.baseDir, fileName));
      })
    );

    return snapshots
      .filter((snapshot): snapshot is PatternRoomSessionSnapshot => snapshot !== null)
      .map(createSnapshotMeta)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async delete(snapshotId: string): Promise<void> {
    const entries = await this.listSnapshotFileNames();
    const snapshots = await Promise.all(
      entries.map(async (fileName) => {
        const snapshotPath = join(this.baseDir, fileName);
        const snapshot = await readSnapshotFile(snapshotPath);
        return { snapshot, snapshotPath };
      })
    );
    const target = snapshots.find(({ snapshot }) => snapshot?.snapshotId === snapshotId);
    if (target !== undefined) {
      await rm(target.snapshotPath, { force: true });
    }
  }

  private getSnapshotPath(topicId: string): string {
    assertSafeTopicId(topicId);
    return join(this.baseDir, `${topicId}${SNAPSHOT_FILE_SUFFIX}`);
  }

  private getTempSnapshotPath(topicId: string): string {
    const suffix = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return join(this.baseDir, `.${topicId}.${suffix}.tmp`);
  }

  private async listSnapshotFileNames(): Promise<string[]> {
    try {
      const entries = await readdir(this.baseDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((fileName) => fileName.endsWith(SNAPSHOT_FILE_SUFFIX))
        .filter((fileName) =>
          SAFE_TOPIC_ID_PATTERN.test(fileName.slice(0, -SNAPSHOT_FILE_SUFFIX.length))
        );
    } catch (error) {
      if (isMissingFileError(error)) {
        return [];
      }
      throw error;
    }
  }
}

export function createPatternRoomJsonStore(baseDir: string): PatternRoomStorageAdapter {
  return new PatternRoomJsonStore(baseDir);
}
