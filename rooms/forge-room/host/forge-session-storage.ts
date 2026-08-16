import { FORGE_ROOM_ID } from "../shared/forge-constants.js";
import type { ForgeEventLog, ForgeSession } from "../shared/types/index.js";
import { createForgeStoragePaths, readForgeRoomStorageDir } from "../shared/host/forge-paths.js";
import { createEmptyForgeSession, type ForgeSessionListItem } from "./state/forge-runtime-state.js";

type ForgeDirectoryEntry = {
  isDirectory: boolean;
  name: string;
  path: string;
};

type ForgeSessionStorageDeps = {
  ensureRuntimeDirectory: (dirPath: string, requestId?: string | null) => Promise<void>;
  listDirectory: (dirPath: string) => Promise<ForgeDirectoryEntry[]>;
  readJsonFile: (filePath: string) => Promise<unknown>;
  readTextFile: (filePath: string) => Promise<string | null>;
  writeJsonFile: (filePath: string, value: unknown) => Promise<void>;
  writeTextFile: (filePath: string, value: string) => Promise<void>;
};

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function asSession(value: unknown): ForgeSession | null {
  return value !== null &&
    typeof value === "object" &&
    Array.isArray(value) === false &&
    typeof (value as { id?: unknown }).id === "string"
    ? (value as ForgeSession)
    : null;
}

function formatSessionTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatSessionListTitle(session: ForgeSession): string {
  const goalSummary = session.goal?.summary.trim() || session.id;
  return `${formatSessionTimestamp(session.updatedAt)} - ${goalSummary}`;
}

export function createForgeSessionStorage(deps: ForgeSessionStorageDeps) {
  const {
    ensureRuntimeDirectory,
    listDirectory,
    readJsonFile,
    readTextFile,
    writeJsonFile,
    writeTextFile,
  } = deps;

  async function ensureSessionRoot(runtimePaths: unknown): Promise<string> {
    const roomStorageDir = readForgeRoomStorageDir(runtimePaths);
    if (roomStorageDir === null) {
      throw new Error("Forge room storage is unavailable.");
    }

    const sessionsDir = `${roomStorageDir}/sessions`;
    await ensureRuntimeDirectory(sessionsDir);
    return sessionsDir;
  }

  async function createSession(
    runtimePaths: unknown,
    options: {
      persist?: boolean;
    } = {}
  ): Promise<ForgeSession> {
    const sessionId = createId("forge-session");
    const session = createEmptyForgeSession(sessionId);
    if (options.persist !== false) {
      await saveSession(runtimePaths, session);
    }
    return session;
  }

  async function saveSession(runtimePaths: unknown, session: ForgeSession): Promise<ForgeSession> {
    const paths = createForgeStoragePaths(runtimePaths, session.id);
    await ensureRuntimeDirectory(paths.sessionsDir);
    await ensureRuntimeDirectory(paths.sessionDir);
    await ensureRuntimeDirectory(paths.exportsDir);
    await ensureRuntimeDirectory(paths.artifactsDir);
    await writeJsonFile(paths.sessionFilePath, session);
    return session;
  }

  async function loadSession(
    runtimePaths: unknown,
    sessionId: string
  ): Promise<ForgeSession | null> {
    const session = asSession(
      await readJsonFile(createForgeStoragePaths(runtimePaths, sessionId).sessionFilePath)
    );
    if (session === null || session.roomId !== FORGE_ROOM_ID) {
      return null;
    }
    return session;
  }

  async function listSessions(runtimePaths: unknown): Promise<ForgeSessionListItem[]> {
    const sessionsDir = await ensureSessionRoot(runtimePaths);
    const entries = await listDirectory(sessionsDir);
    const items = (
      await Promise.all(
        entries
          .filter((entry) => entry.isDirectory === true)
          .map(async (entry) => {
            // NOTE: Keep Phase 1 listing scoped to the reserved sessions root so room package
            // residue under room-storage does not get mistaken for session data.
            const loaded = asSession(await readJsonFile(`${entry.path}/session.json`));
            if (loaded === null || loaded.roomId !== FORGE_ROOM_ID) {
              return null;
            }

            return {
              id: loaded.id,
              updatedAt: loaded.updatedAt,
              title: formatSessionListTitle(loaded),
            } satisfies ForgeSessionListItem;
          })
      )
    ).filter((entry): entry is ForgeSessionListItem => entry !== null);

    return items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async function loadLatestSession(runtimePaths: unknown): Promise<ForgeSession | null> {
    const sessions = await listSessions(runtimePaths);
    const latest = sessions[0];
    return latest ? await loadSession(runtimePaths, latest.id) : null;
  }

  async function appendEvent(
    runtimePaths: unknown,
    sessionId: string,
    eventLog: ForgeEventLog
  ): Promise<void> {
    const paths = createForgeStoragePaths(runtimePaths, sessionId);
    await ensureRuntimeDirectory(paths.sessionDir);
    const current = (await readTextFile(paths.eventsPath)) ?? "";
    const nextLine = `${JSON.stringify(eventLog)}\n`;
    // NOTE: Phase 1 keeps append-only semantics behind one boundary, even though the current
    // implementation rewrites the file atomically instead of using a dedicated append API.
    await writeTextFile(paths.eventsPath, `${current}${nextLine}`);
  }

  return {
    appendEvent,
    createSession,
    ensureSessionRoot,
    listSessions,
    loadLatestSession,
    loadSession,
    saveSession,
  };
}
