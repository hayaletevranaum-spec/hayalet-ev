type RepairRuntimePathsRecord = Record<string, unknown> & {
  storageDir?: unknown;
};

export interface RepairRoomPaths {
  layoutFilePath: string;
  operatorProfileFilePath: string;
  roomStorageDir: string;
  sessionsDir: string;
}

export interface RepairStoragePaths {
  evidenceSelectionFilePath: string;
  roomStorageDir: string;
  sessionDir: string;
  sessionFilePath: string;
  sessionsDir: string;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function readRepairRoomStorageDir(runtimePaths: unknown): string | null {
  return asNonEmptyString((runtimePaths as RepairRuntimePathsRecord | null)?.storageDir);
}

export function createRepairRoomPaths(runtimePaths: unknown): RepairRoomPaths {
  const roomStorageDir = readRepairRoomStorageDir(runtimePaths);
  if (roomStorageDir === null) {
    throw new Error("Repair room storage path is unavailable.");
  }
  return {
    layoutFilePath: `${roomStorageDir}/layout.json`,
    operatorProfileFilePath: `${roomStorageDir}/operator-profile.json`,
    roomStorageDir,
    sessionsDir: `${roomStorageDir}/sessions`,
  };
}

export function createRepairStoragePaths(
  runtimePaths: unknown,
  sessionId: string
): RepairStoragePaths {
  const { roomStorageDir, sessionsDir } = createRepairRoomPaths(runtimePaths);
  const sessionDir = `${sessionsDir}/${sessionId}`;
  return {
    roomStorageDir,
    sessionsDir,
    sessionDir,
    evidenceSelectionFilePath: `${sessionDir}/evidence-selection.json`,
    sessionFilePath: `${sessionDir}/session.json`,
  };
}
