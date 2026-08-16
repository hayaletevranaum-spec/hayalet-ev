type ForgeRuntimePathsRecord = Record<string, unknown> & {
  storageDir?: unknown;
};

export interface ForgeRoomPaths {
  operatorProfilePath: string;
  roomStorageDir: string;
  sessionsDir: string;
}

export interface ForgeStoragePaths {
  artifactsDir: string;
  eventsPath: string;
  exportsDir: string;
  operatorProfilePath: string;
  roomStorageDir: string;
  sessionDir: string;
  sessionFilePath: string;
  sessionsDir: string;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function readForgeRoomStorageDir(runtimePaths: unknown): string | null {
  return asNonEmptyString((runtimePaths as ForgeRuntimePathsRecord | null)?.storageDir);
}

export function createForgeRoomPaths(runtimePaths: unknown): ForgeRoomPaths {
  const roomStorageDir = readForgeRoomStorageDir(runtimePaths);
  if (roomStorageDir === null) {
    throw new Error("Forge room storage path is unavailable.");
  }
  return {
    roomStorageDir,
    sessionsDir: `${roomStorageDir}/sessions`,
    operatorProfilePath: `${roomStorageDir}/operator-profile.json`,
  };
}

export function createForgeStoragePaths(
  runtimePaths: unknown,
  sessionId: string
): ForgeStoragePaths {
  const { operatorProfilePath, roomStorageDir, sessionsDir } = createForgeRoomPaths(runtimePaths);
  const sessionDir = `${sessionsDir}/${sessionId}`;
  return {
    operatorProfilePath,
    roomStorageDir,
    sessionsDir,
    sessionDir,
    sessionFilePath: `${sessionDir}/session.json`,
    eventsPath: `${sessionDir}/events.jsonl`,
    exportsDir: `${sessionDir}/exports`,
    artifactsDir: `${sessionDir}/artifacts`,
  };
}
