import { REPAIR_ROOM_ID } from "../../shared/repair-constants.js";
import { buildRepairAiAdaptation } from "../../shared/data/index.js";
import type { RepairHostIoRuntime } from "../../shared/host/io-runtime.js";
import { readRepairRoomStorageDir } from "../../shared/host/repair-paths.js";
import type {
  RepairChatTurn,
  RepairEvidenceSelection,
  RepairSession,
} from "../../shared/types/index.js";
import type { RepairStorageState } from "../../shared/ui/state.js";
import type { RepairSessionStorageRuntime } from "../repair-session-storage.js";
import type { RepairRuntimeStore } from "../state/repair-runtime-store.js";
import { buildSessionList, getActiveSession } from "./session-helpers.js";

interface RepairStorageControllerApi {
  log: (level: string, message: string) => void;
}

export interface RepairStorageController {
  deleteSessionChatTurns: (sessionId: string) => void;
  flushStorage: () => Promise<void>;
  getRuntimePaths: () => unknown | null;
  getSessionChatTurns: (sessionId: string) => RepairChatTurn[];
  hydrateStorage: () => Promise<void>;
  isReady: () => boolean;
  queueDeleteSession: (sessionId: string) => void;
  queuePersistEvidenceSelection: (selection: RepairEvidenceSelection) => void;
  queuePersistActiveSessionChat: () => void;
  queuePersistOperatorProfile: () => void;
  queuePersistLayout: () => void;
  queuePersistSession: (session: RepairSession) => void;
  setSessionChatTurns: (sessionId: string, chatTurns: RepairChatTurn[]) => void;
  updateReadyStorageState: (sessionCount?: number) => void;
}

export function createRepairStorageController(params: {
  api: RepairStorageControllerApi;
  ioRuntime: RepairHostIoRuntime;
  isDisposed: () => boolean;
  onHydratedActiveSession: (session: RepairSession | null) => void;
  sessionStorage: RepairSessionStorageRuntime;
  store: RepairRuntimeStore;
}): RepairStorageController {
  const { api, ioRuntime, isDisposed, onHydratedActiveSession, sessionStorage, store } = params;
  let storageHydratePromise: Promise<void> | null = null;
  let operatorProfilePersistQueue: Promise<void> = Promise.resolve();
  let storagePersistQueue: Promise<void> = Promise.resolve();
  let storageReady = false;
  let storageRuntimePaths: unknown = null;
  const storedChatTurnsBySessionId = new Map<string, RepairChatTurn[]>();
  const storedSessionIds = new Set<string>();

  function createRoomStorageState(
    status: RepairStorageState["status"],
    stateParams: {
      message?: string | null;
      sessionCount?: number;
      storageDir?: string | null;
    } = {}
  ): RepairStorageState {
    return {
      mode: status === "ready" || status === "hydrating" ? "room-storage" : "standalone",
      status,
      storageDir: stateParams.storageDir ?? null,
      sessionCount: stateParams.sessionCount ?? storedSessionIds.size,
      message: stateParams.message ?? null,
    };
  }

  function setStorageUnavailable(message: string): void {
    storageReady = false;
    storageRuntimePaths = null;
    if (isDisposed()) return;
    store.dispatch({
      type: "storage/set",
      storage: createRoomStorageState("error", { message }),
    });
  }

  function updateReadyStorageState(sessionCount = storedSessionIds.size): void {
    if (storageRuntimePaths === null) return;
    store.dispatch({
      type: "storage/set",
      storage: createRoomStorageState("ready", {
        message: "Room storage ready",
        sessionCount,
        storageDir: readRepairRoomStorageDir(storageRuntimePaths),
      }),
    });
  }

  function getSessionChatTurns(sessionId: string): RepairChatTurn[] {
    const state = store.getState();
    if (state.activeSessionId === sessionId) {
      return state.chat.turns;
    }
    return storedChatTurnsBySessionId.get(sessionId) ?? [];
  }

  function setSessionChatTurns(sessionId: string, chatTurns: RepairChatTurn[]): void {
    storedChatTurnsBySessionId.set(sessionId, chatTurns);
  }

  function deleteSessionChatTurns(sessionId: string): void {
    storedChatTurnsBySessionId.delete(sessionId);
  }

  function queuePersistSession(session: RepairSession): void {
    if (storageReady === false || storageRuntimePaths === null) {
      return;
    }

    const runtimePaths = storageRuntimePaths;
    const chatTurns = getSessionChatTurns(session.id);
    storedChatTurnsBySessionId.set(session.id, chatTurns);
    storagePersistQueue = storagePersistQueue
      .then(async () => {
        await sessionStorage.saveSessionRecord(runtimePaths, { session, chatTurns });
        if (isDisposed()) return;
        storedSessionIds.add(session.id);
        updateReadyStorageState();
      })
      .catch((error: unknown) => {
        api.log(
          "warn",
          `[${REPAIR_ROOM_ID}] session storage save failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        setStorageUnavailable("Room storage error; using in-memory state.");
      });
  }

  function queuePersistActiveSessionChat(): void {
    const state = store.getState();
    const session = getActiveSession(state);
    if (session === null) return;
    storedChatTurnsBySessionId.set(session.id, state.chat.turns);
    queuePersistSession(session);
  }

  function queuePersistEvidenceSelection(selection: RepairEvidenceSelection): void {
    if (storageReady === false || storageRuntimePaths === null) return;
    const runtimePaths = storageRuntimePaths;
    storagePersistQueue = storagePersistQueue
      .then(async () => {
        await sessionStorage.saveEvidenceSelectionRecord(runtimePaths, selection);
        if (isDisposed()) return;
        updateReadyStorageState();
      })
      .catch((error: unknown) => {
        api.log(
          "warn",
          `[${REPAIR_ROOM_ID}] evidence selection storage save failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        setStorageUnavailable("Room storage error; using in-memory evidence selection.");
      });
  }

  function queuePersistOperatorProfile(): void {
    if (storageReady === false || storageRuntimePaths === null) return;
    const runtimePaths = storageRuntimePaths;
    const profile = store.getState().operatorProfile;
    operatorProfilePersistQueue = operatorProfilePersistQueue
      .then(async () => {
        await sessionStorage.saveOperatorProfileRecord(runtimePaths, profile);
        if (isDisposed()) return;
        updateReadyStorageState();
      })
      .catch((error: unknown) => {
        api.log(
          "warn",
          `[${REPAIR_ROOM_ID}] operator profile storage save failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        setStorageUnavailable("Room storage error; using in-memory operator profile.");
      });
  }

  function queuePersistLayout(): void {
    if (storageReady === false || storageRuntimePaths === null) return;
    const runtimePaths = storageRuntimePaths;
    const panelSizes = store.getState().layout.panelSizes;
    storagePersistQueue = storagePersistQueue
      .then(async () => {
        await sessionStorage.saveLayoutRecord(runtimePaths, panelSizes);
        if (isDisposed()) return;
        updateReadyStorageState();
      })
      .catch((error: unknown) => {
        api.log(
          "warn",
          `[${REPAIR_ROOM_ID}] layout storage save failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        setStorageUnavailable("Room storage error; using in-memory layout state.");
      });
  }

  function hydrateStorage(): Promise<void> {
    if (storageHydratePromise !== null) {
      return storageHydratePromise;
    }

    storageHydratePromise = (async () => {
      store.dispatch({
        type: "storage/set",
        storage: createRoomStorageState("hydrating", {
          message: "Room storage loading",
        }),
      });

      try {
        const runtimePaths = await ioRuntime.resolveRuntimePaths();
        const [records, storedOperatorProfile, storedLayout] = await Promise.all([
          sessionStorage.listSessionRecords(runtimePaths),
          sessionStorage.loadOperatorProfileRecord(runtimePaths),
          sessionStorage.loadLayoutRecord(runtimePaths),
        ]);
        if (isDisposed()) return;

        storageRuntimePaths = runtimePaths;
        storageReady = true;
        storedChatTurnsBySessionId.clear();
        storedSessionIds.clear();
        records.forEach((record) => {
          storedChatTurnsBySessionId.set(record.session.id, record.chatTurns);
          storedSessionIds.add(record.session.id);
        });
        const sessions: Record<string, RepairSession> = Object.fromEntries(
          records.map((record) => [record.session.id, record.session] as const)
        );
        const activeSessionId = store.getState().activeSessionId;
        const activeSession = activeSessionId === null ? null : (sessions[activeSessionId] ?? null);

        store.batch(() => {
          store.dispatch({
            type: "session/hydrate",
            activeSessionId: activeSession?.id ?? null,
            sessions,
            sessionList: buildSessionList(sessions),
          });
          store.dispatch({
            type: "chat/set-turns",
            turns:
              activeSession === null
                ? []
                : (storedChatTurnsBySessionId.get(activeSession.id) ?? []),
          });
          if (storedOperatorProfile !== null) {
            store.dispatch({
              type: "operator-profile/set",
              adaptation: buildRepairAiAdaptation(storedOperatorProfile.profile),
              profile: storedOperatorProfile.profile,
            });
          }
          if (storedLayout !== null) {
            store.dispatch({ type: "layout/set-panel-sizes", panelSizes: storedLayout.panelSizes });
          }
          store.dispatch({
            type: "storage/set",
            storage: createRoomStorageState("ready", {
              message: "Room storage ready",
              sessionCount: storedSessionIds.size,
              storageDir: readRepairRoomStorageDir(runtimePaths),
            }),
          });
        });
        onHydratedActiveSession(activeSession);
      } catch (error: unknown) {
        storageReady = false;
        storageRuntimePaths = null;
        if (isDisposed()) return;
        api.log(
          "debug",
          `[${REPAIR_ROOM_ID}] room storage unavailable: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        store.dispatch({
          type: "storage/set",
          storage: createRoomStorageState("fallback", {
            message: "Repair history unavailable; using current session only.",
          }),
        });
      }
    })();

    return storageHydratePromise;
  }

  function queueDeleteSession(sessionId: string): void {
    const runtimePaths = storageReady && storageRuntimePaths !== null ? storageRuntimePaths : null;
    if (runtimePaths === null) return;
    storagePersistQueue = storagePersistQueue
      .then(async () => {
        await sessionStorage.deleteSessionRecord(runtimePaths, sessionId);
        if (isDisposed()) return;
        storedSessionIds.delete(sessionId);
        storedChatTurnsBySessionId.delete(sessionId);
        updateReadyStorageState();
      })
      .catch((error: unknown) => {
        api.log(
          "warn",
          `[${REPAIR_ROOM_ID}] session storage delete failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        setStorageUnavailable("Room storage delete error; using in-memory state.");
      });
  }

  function flushStorage(): Promise<void> {
    return Promise.all([storagePersistQueue, operatorProfilePersistQueue]).then(() => {});
  }

  return {
    deleteSessionChatTurns,
    flushStorage,
    getRuntimePaths: () =>
      storageReady && storageRuntimePaths !== null ? storageRuntimePaths : null,
    getSessionChatTurns,
    hydrateStorage,
    isReady: () => storageReady,
    queueDeleteSession,
    queuePersistEvidenceSelection,
    queuePersistActiveSessionChat,
    queuePersistOperatorProfile,
    queuePersistLayout,
    queuePersistSession,
    setSessionChatTurns,
    updateReadyStorageState,
  };
}
