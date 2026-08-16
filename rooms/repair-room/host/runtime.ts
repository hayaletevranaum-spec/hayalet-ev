import {
  REPAIR_HOST_MESSAGES,
  REPAIR_ROOM_ID,
  REPAIR_UI_COMMANDS,
} from "../shared/repair-constants.js";
import { getRepairVoiceCommandPhraseMap } from "../shared/repair-action-registry.js";
import type { RepairAiDispatchBridge } from "./repair-ai-bridge.js";
import { createRepairHostIoRuntime, type RepairHostIoRuntime } from "../shared/host/io-runtime.js";
import {
  createRepairSessionStorage,
  type RepairSessionStorageRuntime,
} from "./repair-session-storage.js";
import { buildTacticalFeedItems } from "../shared/data/index.js";
import type { RepairSession } from "../shared/types/index.js";
import { createReplayRuntimeController } from "./repair-replay-runtime.js";
import {
  createInitialRepairRuntimeState,
  type RepairRuntimeSeedData,
  type RepairRuntimeState,
} from "./state/repair-runtime-state.js";
import { createRepairRuntimeStore, type RepairRuntimeStore } from "./state/repair-runtime-store.js";
import { createRepairUiSnapshot, createRepairUiSnapshotMeta } from "./state/repair-selectors.js";
import { createRepairAiController } from "./runtime/ai-controller.js";
import {
  getActiveSession,
  getSessionTimelineMs,
  phaseForSession,
} from "./runtime/session-helpers.js";
import {
  createRepairOperationsController,
  type RepairCaptureActionOutcome,
  type RepairCaptureActionResult,
  type RepairTtsActionResult,
} from "./runtime/operations-controller.js";
import { createRepairStorageController } from "./runtime/storage-controller.js";
import { createRepairLiveController } from "./runtime/live-controller.js";
import { createRepairSessionController } from "./runtime/session-controller.js";
import { createRepairLayoutController } from "./runtime/layout-controller.js";
import { createRepairCommandRouter, type RepairCommandPayload } from "./runtime/command-router.js";

interface RepairRoomApi {
  dispatchBridge?: RepairAiDispatchBridge;
  log: (level: string, message: string) => void;
  notifyRoom: (type: string, payload?: Record<string, unknown>) => void;
  operations?: {
    getStatus?: () => Promise<unknown> | unknown;
    subscribe?: (listener: (status: unknown) => void) => (() => void) | undefined;
  };
  capture?: {
    startDictation?: (requestId?: string) => Promise<RepairCaptureActionResult>;
    stopDictation?: (requestId: string) => Promise<RepairCaptureActionOutcome>;
    startAmbientListener?: (requestId?: string) => Promise<RepairCaptureActionResult>;
    stopAmbientListener?: (requestId: string) => Promise<RepairCaptureActionOutcome>;
    startCameraFeed?: (requestId?: string) => Promise<RepairCaptureActionResult>;
    stopCameraFeed?: (requestId?: string) => Promise<RepairCaptureActionResult>;
    capturePhoto?: (requestId?: string) => Promise<RepairCaptureActionOutcome>;
    setTorch?: (enabled: boolean, requestId?: string) => Promise<RepairCaptureActionResult>;
  };
  tts?: {
    speak?: (
      text: string,
      options?: { requestId?: string; mode?: "local" | "android"; language?: "tr" | "en" }
    ) => Promise<RepairTtsActionResult>;
    stop?: (requestId: string) => Promise<unknown>;
  };
  getLocale?: () => string;
  getState?: (key: string) => unknown;
  setState?: (key: string, value: unknown) => unknown;
}

interface RepairRoomHostRuntimeOptions {
  autoHydrateStorage?: boolean;
  initialSeed?: RepairRuntimeSeedData;
  io?: RepairHostIoRuntime;
  storage?: RepairSessionStorageRuntime;
}

const FEED_INITIAL_VISIBLE_COUNT = 3;

function nowIso(): string {
  return new Date().toISOString();
}

function setActiveSessionDerivedState(
  store: RepairRuntimeStore,
  session: RepairSession | null
): void {
  const timeline = store.getState().workbench.timeline;
  const playheadMs = getSessionTimelineMs(session);
  store.dispatchMany([
    { type: "phase/set", phase: phaseForSession(session) },
    {
      type: "workbench/set-timeline",
      playheadMs,
      zoom: timeline.zoom,
      rangeStartMs: null,
      rangeEndMs: null,
      autoFollowLive: session?.status === "in-progress",
    },
    {
      type: "knowledge-pack/set",
      pack: session?.knowledgePack ?? null,
      attachedToSessionId: session?.knowledgePack === null ? null : (session?.id ?? null),
    },
    {
      type: "tactical-feed/set",
      items:
        session === null
          ? []
          : buildTacticalFeedItems(session.events, session.startedAt).slice(
              0,
              FEED_INITIAL_VISIBLE_COUNT
            ),
    },
  ]);
}

/**
 * Repair Room host runtime.
 *
 * Hydrates the runtime store from room-local session storage when available,
 * pushes state snapshots to the UI via api.notifyRoom("repair-state", …),
 * and accepts UI commands to update the store deterministically.
 * A clean idle state remains the fallback when room storage is unavailable.
 */
export default function createRepairRoomHostRuntime(options: RepairRoomHostRuntimeOptions = {}) {
  const ioRuntime = options.io ?? createRepairHostIoRuntime({ roomId: REPAIR_ROOM_ID });
  const sessionStorage = options.storage ?? createRepairSessionStorage(ioRuntime);
  const shouldAutoHydrateStorage = options.autoHydrateStorage !== false;

  return {
    activate(api: RepairRoomApi) {
      const store = createRepairRuntimeStore(
        createInitialRepairRuntimeState(nowIso(), options.initialSeed)
      );
      let disposed = false;
      const replayController = createReplayRuntimeController(store, () =>
        getActiveSession(store.getState())
      );
      const liveController = createRepairLiveController({ store });
      const operationsController = createRepairOperationsController({
        api,
        isDisposed: () => disposed,
        pushState,
        store,
      });
      const storageController = createRepairStorageController({
        api,
        ioRuntime,
        isDisposed: () => disposed,
        onHydratedActiveSession: (session) => {
          setActiveSessionDerivedState(store, session);
          liveController.resetTimelineAnchor(session);
          liveController.scheduleFeedStream();
        },
        sessionStorage,
        store,
      });
      const sessionController = createRepairSessionController({
        liveController,
        log: api.log,
        storageController,
        store,
      });
      const layoutController = createRepairLayoutController({
        liveController,
        replayController,
        sessionController,
        store,
      });
      let commandRouter: ReturnType<typeof createRepairCommandRouter> | null = null;
      const handleCommand = (command: string, payload: RepairCommandPayload = {}) => {
        if (commandRouter === null) {
          return { success: false, message: "command router is not ready" };
        }
        return commandRouter.handleCommand(command, payload);
      };
      const aiController = createRepairAiController({
        api,
        appendEventsToSession: sessionController.appendEventsToSession,
        getDisposed: () => disposed,
        handleCommand,
        liveController,
        operationsController,
        storageController,
        store,
      });
      commandRouter = createRepairCommandRouter({
        aiController,
        api,
        layoutController,
        liveController,
        operationsController,
        pushState,
        replayController,
        sessionController,
        setActiveSessionDerivedState: (session) => setActiveSessionDerivedState(store, session),
        storageController,
        store,
      });

      function pushState(): void {
        const state = store.getState();
        api.notifyRoom(REPAIR_HOST_MESSAGES.state, {
          snapshot: createRepairUiSnapshot(state),
          meta: createRepairUiSnapshotMeta(state),
        });
      }

      store.subscribe(() => {
        pushState();
      });
      operationsController.startProjectionBridge();
      if (shouldAutoHydrateStorage) {
        void storageController.hydrateStorage();
      }

      const commandEntries = Object.values(REPAIR_UI_COMMANDS).map((commandName) => [
        commandName,
        (commandPayload: RepairCommandPayload = {}) => handleCommand(commandName, commandPayload),
      ]);
      const commands = Object.fromEntries(commandEntries) as Record<
        string,
        (commandPayload?: RepairCommandPayload) => { success: boolean; message?: string }
      >;

      api.log("info", "Repair Room host activated.");
      operationsController.startProjectionBridge();

      return {
        onRoomReady(payload: unknown) {
          void payload;
          const result = handleCommand(REPAIR_UI_COMMANDS.uiReady, {});
          if (result.success === false && result.message !== undefined) {
            api.log("warn", `[${REPAIR_ROOM_ID}] room-ready failed: ${result.message}`);
          }
        },
        commands,
        voiceCommands: getRepairVoiceCommandPhraseMap(),
        handleCommand,
        getStateSnapshot(): { state: RepairRuntimeState } {
          return { state: store.getState() };
        },
        hydrateStorage: storageController.hydrateStorage,
        flushStorage: storageController.flushStorage,
        dispose() {
          disposed = true;
          operationsController.dispose();
          liveController.dispose();
          api.log("info", "Repair Room host disposed.");
        },
      };
    },
  };
}
