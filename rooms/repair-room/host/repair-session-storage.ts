import { REPAIR_ROOM_ID } from "../shared/repair-constants.js";
import { normalizeRepairPanelSizes } from "../shared/types/index.js";
import {
  createRepairRoomPaths,
  createRepairStoragePaths,
  readRepairRoomStorageDir,
} from "../shared/host/repair-paths.js";
import type {
  RepairChatTurn,
  RepairEvidenceSelection,
  RepairOperatorProfile,
  RepairPanelSizeState,
  RepairSession,
  RepairSessionListItem,
} from "../shared/types/index.js";

type RepairDirectoryEntry = {
  isDirectory: boolean;
  name: string;
  path: string;
};

export type RepairSessionStorageDeps = {
  deleteRuntimePath?: (targetPath: string, options?: { recursive?: boolean }) => Promise<void>;
  ensureRuntimeDirectory: (dirPath: string, requestId?: string | null) => Promise<void>;
  listDirectory: (dirPath: string) => Promise<RepairDirectoryEntry[]>;
  readJsonFile: (filePath: string) => Promise<unknown>;
  writeJsonFile: (filePath: string, value: unknown) => Promise<void>;
};

export interface RepairStoredSessionRecord {
  chatTurns: RepairChatTurn[];
  roomId: string;
  savedAt: string;
  schemaVersion: 2;
  session: RepairSession;
}

export interface RepairStoredEvidenceSelectionRecord {
  roomId: string;
  savedAt: string;
  schemaVersion: 2;
  selection: RepairEvidenceSelection;
  sessionId: string;
}

export interface RepairStoredOperatorProfileRecord {
  profile: RepairOperatorProfile;
  roomId: string;
  savedAt: string;
  schemaVersion: 1;
}

export interface RepairStoredLayoutRecord {
  panelSizes: RepairPanelSizeState;
  roomId: string;
  savedAt: string;
  schemaVersion: 1;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && Array.isArray(value) === false
    ? (value as Record<string, unknown>)
    : null;
}

function asRepairSession(value: unknown): RepairSession | null {
  const record = asRecord(value);
  return record !== null &&
    record["schemaVersion"] === 2 &&
    typeof record["id"] === "string" &&
    typeof record["roomId"] === "string" &&
    typeof asRecord(record["deviceInfo"])?.["deviceType"] === "string" &&
    Array.isArray(record["events"])
    ? (value as RepairSession)
    : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asRepairChatTurns(value: unknown): RepairChatTurn[] {
  return Array.isArray(value)
    ? value.filter((turn): turn is RepairChatTurn => {
        const record = asRecord(turn);
        return (
          record !== null &&
          typeof record["id"] === "string" &&
          (record["role"] === "operator" || record["role"] === "ai") &&
          typeof record["text"] === "string" &&
          typeof record["occurredAt"] === "string"
        );
      })
    : [];
}

function asRepairOperatorProfile(value: unknown): RepairOperatorProfile | null {
  const record = asRecord(value);
  return record !== null &&
    typeof record["profileId"] === "string" &&
    typeof record["displayName"] === "string"
    ? (value as RepairOperatorProfile)
    : null;
}

function asStoredOperatorProfileRecord(value: unknown): RepairStoredOperatorProfileRecord | null {
  const rawProfile = asRepairOperatorProfile(value);
  if (rawProfile !== null) {
    return {
      profile: rawProfile,
      roomId: REPAIR_ROOM_ID,
      savedAt: rawProfile.updatedAt,
      schemaVersion: 1,
    };
  }

  const record = asRecord(value);
  const profile = asRepairOperatorProfile(record?.["profile"]);
  if (profile === null) return null;
  return {
    profile,
    roomId: REPAIR_ROOM_ID,
    savedAt: typeof record?.["savedAt"] === "string" ? record["savedAt"] : profile.updatedAt,
    schemaVersion: 1,
  };
}

function asStoredLayoutRecord(value: unknown): RepairStoredLayoutRecord | null {
  const record = asRecord(value);
  if (record === null) return null;

  const panelSizesSource = asRecord(record["panelSizes"]) ?? asRecord(value);
  if (panelSizesSource === null || asRecord(panelSizesSource["mainColumns"]) === null) {
    return null;
  }
  if (record["panelSizes"] !== undefined) {
    if (record["schemaVersion"] !== 1 || record["roomId"] !== REPAIR_ROOM_ID) return null;
  }

  return {
    panelSizes: normalizeRepairPanelSizes({
      mainColumns: asRecord(panelSizesSource["mainColumns"]) as RepairPanelSizeState["mainColumns"],
    }),
    roomId: REPAIR_ROOM_ID,
    savedAt: typeof record["savedAt"] === "string" ? record["savedAt"] : new Date(0).toISOString(),
    schemaVersion: 1,
  };
}

function asStoredSessionRecord(value: unknown): RepairStoredSessionRecord | null {
  const rawSession = asRepairSession(value);
  if (rawSession !== null) {
    return {
      chatTurns: [],
      roomId: REPAIR_ROOM_ID,
      savedAt: rawSession.updatedAt,
      schemaVersion: 2,
      session: rawSession,
    };
  }

  const record = asRecord(value);
  const session = asRepairSession(record?.["session"]);
  if (session === null || session.roomId !== REPAIR_ROOM_ID) {
    return null;
  }

  return {
    chatTurns: asRepairChatTurns(record?.["chatTurns"]),
    roomId: REPAIR_ROOM_ID,
    savedAt: typeof record?.["savedAt"] === "string" ? record["savedAt"] : session.updatedAt,
    schemaVersion: 2,
    session,
  };
}

function asStoredEvidenceSelectionRecord(
  value: unknown,
  fallbackSessionId: string
): RepairStoredEvidenceSelectionRecord | null {
  const record = asRecord(value);
  const rawSelection = asRecord(record?.["selection"]);
  if (
    record === null ||
    record["schemaVersion"] !== 2 ||
    record["roomId"] !== REPAIR_ROOM_ID ||
    rawSelection === null
  ) {
    return null;
  }

  const sessionId =
    typeof rawSelection["sessionId"] === "string"
      ? rawSelection["sessionId"]
      : typeof record["sessionId"] === "string"
        ? record["sessionId"]
        : fallbackSessionId;
  if (sessionId !== fallbackSessionId) return null;

  const updatedAt =
    typeof rawSelection["updatedAt"] === "string"
      ? rawSelection["updatedAt"]
      : typeof record["savedAt"] === "string"
        ? record["savedAt"]
        : new Date(0).toISOString();

  return {
    roomId: REPAIR_ROOM_ID,
    savedAt: typeof record["savedAt"] === "string" ? record["savedAt"] : updatedAt,
    schemaVersion: 2,
    sessionId,
    selection: {
      sessionId,
      selectedEvidenceResourceIds: asStringArray(rawSelection["selectedEvidenceResourceIds"]),
      selectedFailureIds: asStringArray(rawSelection["selectedFailureIds"]),
      selectedTestPointIds: asStringArray(rawSelection["selectedTestPointIds"]),
      updatedAt,
    },
  };
}

function toSessionListItem(session: RepairSession): RepairSessionListItem {
  return {
    id: session.id,
    title: session.title,
    deviceLabel: session.deviceInfo.deviceLabel,
    boardCode: session.deviceInfo.boardCode,
    serialNumber: session.deviceInfo.serialNumber,
    status: session.status,
    riskLevel: session.riskLevel,
    updatedAt: session.updatedAt,
    isArchived: session.status === "archived",
  };
}

export function createRepairSessionStorage(deps: RepairSessionStorageDeps) {
  const { deleteRuntimePath, ensureRuntimeDirectory, listDirectory, readJsonFile, writeJsonFile } =
    deps;

  async function ensureSessionRoot(runtimePaths: unknown): Promise<string> {
    const roomStorageDir = readRepairRoomStorageDir(runtimePaths);
    if (roomStorageDir === null) {
      throw new Error("Repair room storage is unavailable.");
    }

    const sessionsDir = `${roomStorageDir}/sessions`;
    await ensureRuntimeDirectory(sessionsDir);
    return sessionsDir;
  }

  async function saveSessionRecord(
    runtimePaths: unknown,
    record: Pick<RepairStoredSessionRecord, "chatTurns" | "session">
  ): Promise<RepairStoredSessionRecord> {
    const paths = createRepairStoragePaths(runtimePaths, record.session.id);
    const nextRecord: RepairStoredSessionRecord = {
      chatTurns: record.chatTurns,
      roomId: REPAIR_ROOM_ID,
      savedAt: new Date().toISOString(),
      schemaVersion: 2,
      session: record.session,
    };
    await ensureRuntimeDirectory(paths.sessionsDir);
    await ensureRuntimeDirectory(paths.sessionDir);
    await writeJsonFile(paths.sessionFilePath, nextRecord);
    return nextRecord;
  }

  async function loadEvidenceSelectionRecord(
    runtimePaths: unknown,
    sessionId: string
  ): Promise<RepairStoredEvidenceSelectionRecord | null> {
    const loaded = asStoredEvidenceSelectionRecord(
      await readJsonFile(
        createRepairStoragePaths(runtimePaths, sessionId).evidenceSelectionFilePath
      ),
      sessionId
    );
    return loaded;
  }

  async function saveEvidenceSelectionRecord(
    runtimePaths: unknown,
    selection: RepairEvidenceSelection
  ): Promise<RepairStoredEvidenceSelectionRecord> {
    const paths = createRepairStoragePaths(runtimePaths, selection.sessionId);
    const nextRecord: RepairStoredEvidenceSelectionRecord = {
      roomId: REPAIR_ROOM_ID,
      savedAt: new Date().toISOString(),
      schemaVersion: 2,
      selection,
      sessionId: selection.sessionId,
    };
    await ensureRuntimeDirectory(paths.sessionsDir);
    await ensureRuntimeDirectory(paths.sessionDir);
    await writeJsonFile(paths.evidenceSelectionFilePath, nextRecord);
    return nextRecord;
  }

  async function loadOperatorProfileRecord(
    runtimePaths: unknown
  ): Promise<RepairStoredOperatorProfileRecord | null> {
    const paths = createRepairRoomPaths(runtimePaths);
    return asStoredOperatorProfileRecord(await readJsonFile(paths.operatorProfileFilePath));
  }

  async function loadLayoutRecord(runtimePaths: unknown): Promise<RepairStoredLayoutRecord | null> {
    const paths = createRepairRoomPaths(runtimePaths);
    return asStoredLayoutRecord(await readJsonFile(paths.layoutFilePath));
  }

  async function saveLayoutRecord(
    runtimePaths: unknown,
    panelSizes: RepairPanelSizeState
  ): Promise<RepairStoredLayoutRecord> {
    const paths = createRepairRoomPaths(runtimePaths);
    const nextRecord: RepairStoredLayoutRecord = {
      panelSizes: normalizeRepairPanelSizes(panelSizes),
      roomId: REPAIR_ROOM_ID,
      savedAt: new Date().toISOString(),
      schemaVersion: 1,
    };
    await ensureRuntimeDirectory(paths.roomStorageDir);
    await writeJsonFile(paths.layoutFilePath, nextRecord);
    return nextRecord;
  }

  async function saveOperatorProfileRecord(
    runtimePaths: unknown,
    profile: RepairOperatorProfile
  ): Promise<RepairStoredOperatorProfileRecord> {
    const paths = createRepairRoomPaths(runtimePaths);
    const nextRecord: RepairStoredOperatorProfileRecord = {
      profile,
      roomId: REPAIR_ROOM_ID,
      savedAt: new Date().toISOString(),
      schemaVersion: 1,
    };
    await ensureRuntimeDirectory(paths.roomStorageDir);
    await writeJsonFile(paths.operatorProfileFilePath, nextRecord);
    return nextRecord;
  }

  async function loadSessionRecord(
    runtimePaths: unknown,
    sessionId: string
  ): Promise<RepairStoredSessionRecord | null> {
    const loaded = asStoredSessionRecord(
      await readJsonFile(createRepairStoragePaths(runtimePaths, sessionId).sessionFilePath)
    );
    if (loaded === null || loaded.session.roomId !== REPAIR_ROOM_ID) {
      return null;
    }
    return loaded;
  }

  async function deleteSessionRecord(runtimePaths: unknown, sessionId: string): Promise<void> {
    if (typeof deleteRuntimePath !== "function") {
      throw new Error("Repair session deletion is unavailable.");
    }
    await deleteRuntimePath(createRepairStoragePaths(runtimePaths, sessionId).sessionDir, {
      recursive: true,
    });
  }

  async function listSessionRecords(runtimePaths: unknown): Promise<RepairStoredSessionRecord[]> {
    const sessionsDir = await ensureSessionRoot(runtimePaths);
    const entries = await listDirectory(sessionsDir);
    const records = (
      await Promise.all(
        entries
          .filter((entry) => entry.isDirectory === true)
          .map(async (entry) => {
            const loaded = asStoredSessionRecord(await readJsonFile(`${entry.path}/session.json`));
            if (loaded === null || loaded.session.roomId !== REPAIR_ROOM_ID) {
              return null;
            }
            return loaded;
          })
      )
    ).filter((entry): entry is RepairStoredSessionRecord => entry !== null);

    return records.sort((left, right) =>
      right.session.updatedAt.localeCompare(left.session.updatedAt)
    );
  }

  async function listSessions(runtimePaths: unknown): Promise<RepairSessionListItem[]> {
    return (await listSessionRecords(runtimePaths)).map((record) =>
      toSessionListItem(record.session)
    );
  }

  async function loadLatestSessionRecord(
    runtimePaths: unknown
  ): Promise<RepairStoredSessionRecord | null> {
    return (await listSessionRecords(runtimePaths))[0] ?? null;
  }

  return {
    deleteSessionRecord,
    ensureSessionRoot,
    listSessionRecords,
    listSessions,
    loadEvidenceSelectionRecord,
    loadOperatorProfileRecord,
    loadLayoutRecord,
    loadLatestSessionRecord,
    loadSessionRecord,
    saveEvidenceSelectionRecord,
    saveOperatorProfileRecord,
    saveLayoutRecord,
    saveSessionRecord,
  };
}

export type RepairSessionStorageRuntime = ReturnType<typeof createRepairSessionStorage>;
