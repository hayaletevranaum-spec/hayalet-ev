import test from "node:test";
import assert from "node:assert/strict";
import createRepairRoomHostRuntimeBase from "../../rooms/repair-room/host/runtime.ts";
import {
  createEmptyRepairReplayProjection,
  createRepairReplayProjection,
} from "../../rooms/repair-room/host/state/repair-replay-projection.ts";
import {
  REPAIR_ROOM_ID,
  REPAIR_UI_COMMANDS,
} from "../../rooms/repair-room/shared/repair-constants.ts";
import { createRepairDefaultGuidanceProjection } from "../../rooms/repair-room/shared/ui/state.ts";
import type {
  RepairStoredEvidenceSelectionRecord,
  RepairStoredLayoutRecord,
  RepairStoredOperatorProfileRecord,
  RepairStoredSessionRecord,
} from "../../rooms/repair-room/host/repair-session-storage.ts";
import type {
  RepairChatTurn,
  RepairSession,
} from "../../rooms/repair-room/shared/types/index.ts";
import {
  cloneJson,
  createTestRepairRuntimeSeed,
  toStoredSessionListItem,
} from "./helpers/repair-test-data.ts";

type RepairRoomHostRuntimeOptions = NonNullable<
  Parameters<typeof createRepairRoomHostRuntimeBase>[0]
>;

function createRepairRoomHostRuntime(options: RepairRoomHostRuntimeOptions = {}) {
  const usesCallerState =
    options.initialSeed !== undefined || options.io !== undefined || options.storage !== undefined;
  return createRepairRoomHostRuntimeBase(
    usesCallerState
      ? options
      : { ...options, autoHydrateStorage: false, initialSeed: createTestRepairRuntimeSeed() }
  );
}

function createMemoryRepairIo() {
  return {
    callRoomTools: async (_request: Record<string, unknown>) => ({ success: true }),
    ensureRuntimeDirectory: async (_dirPath: string, _requestId?: string | null) => {},
    deleteRuntimePath: async (_targetPath: string, _options?: { recursive?: boolean; requestId?: string | null }) => {},
    getElectronApi: () => null,
    listDirectory: async (_dirPath: string) => [],
    readJsonFile: async (_filePath: string) => null,
    resolveRuntimePaths: async (_requestId?: string | null) => ({ storageDir: "/tmp/repair-room-test" }),
    writeJsonFile: async (_filePath: string, _value: unknown) => {},
  };
}

function createStoredRepairRecord(
  session: RepairSession,
  chatTurns: RepairChatTurn[] = [],
  schemaVersion = 2
): RepairStoredSessionRecord {
  return {
    chatTurns,
    roomId: REPAIR_ROOM_ID,
    savedAt: session.updatedAt,
    schemaVersion,
    session,
  } as RepairStoredSessionRecord;
}

function createMemoryRepairStorage(initialRecords: RepairStoredSessionRecord[] = []) {
  const records = new Map<string, RepairStoredSessionRecord>();
  const evidenceSelectionRecords = new Map<string, RepairStoredEvidenceSelectionRecord>();
  let layoutRecord: RepairStoredLayoutRecord | null = null;
  let operatorProfileRecord: RepairStoredOperatorProfileRecord | null = null;
  initialRecords.forEach((record) => {
    records.set(record.session.id, cloneJson(record));
  });
  const listRecords = () =>
    Array.from(records.values())
      .filter(
        (record) =>
          record.session.schemaVersion === 2 &&
          typeof record.session.deviceInfo.deviceType === "string"
      )
      .sort((left, right) => right.session.updatedAt.localeCompare(left.session.updatedAt));
  return {
    deleteSessionRecord: async (_runtimePaths: unknown, _sessionId: string) => {},
    ensureSessionRoot: async (_runtimePaths: unknown) => "/tmp/repair-room-test/sessions",
    listSessionRecords: async (_runtimePaths: unknown) =>
      listRecords().map((record) => cloneJson(record)),
    listSessions: async (_runtimePaths: unknown) =>
      listRecords().map((record) => toStoredSessionListItem(record.session)),
    loadOperatorProfileRecord: async (_runtimePaths: unknown) => cloneJson(operatorProfileRecord),
    loadLayoutRecord: async (_runtimePaths: unknown) => cloneJson(layoutRecord),
    loadLatestSessionRecord: async (_runtimePaths: unknown) => cloneJson(listRecords()[0] ?? null),
    loadSessionRecord: async (_runtimePaths: unknown, sessionId: string) =>
      cloneJson(records.get(sessionId) ?? null),
    saveSessionRecord: async (
      _runtimePaths: unknown,
      record: Pick<RepairStoredSessionRecord, "chatTurns" | "session">
    ) => {
      const nextRecord = createStoredRepairRecord(
        cloneJson(record.session),
        cloneJson(record.chatTurns)
      );
      records.set(nextRecord.session.id, nextRecord);
      return cloneJson(nextRecord);
    },
    loadEvidenceSelectionRecord: async (_runtimePaths: unknown, sessionId: string) =>
      cloneJson(evidenceSelectionRecords.get(sessionId) ?? null),
    saveEvidenceSelectionRecord: async (
      _runtimePaths: unknown,
      selection: RepairStoredEvidenceSelectionRecord["selection"]
    ) => {
      const nextRecord: RepairStoredEvidenceSelectionRecord = {
        roomId: REPAIR_ROOM_ID,
        savedAt: new Date().toISOString(),
        schemaVersion: 2,
        selection: cloneJson(selection),
        sessionId: selection.sessionId,
      };
      evidenceSelectionRecords.set(selection.sessionId, nextRecord);
      return cloneJson(nextRecord);
    },
    saveOperatorProfileRecord: async (
      _runtimePaths: unknown,
      profile: RepairStoredOperatorProfileRecord["profile"]
    ) => {
      operatorProfileRecord = {
        profile: cloneJson(profile),
        roomId: REPAIR_ROOM_ID,
        savedAt: new Date().toISOString(),
        schemaVersion: 1,
      };
      return cloneJson(operatorProfileRecord);
    },
    saveLayoutRecord: async (
      _runtimePaths: unknown,
      panelSizes: RepairStoredLayoutRecord["panelSizes"]
    ) => {
      layoutRecord = {
        panelSizes: cloneJson(panelSizes),
        roomId: REPAIR_ROOM_ID,
        savedAt: new Date().toISOString(),
        schemaVersion: 1,
      };
      return cloneJson(layoutRecord);
    },
    readOperatorProfileRecord(): unknown {
      return cloneJson(operatorProfileRecord);
    },
    readLayoutRecord(): RepairStoredLayoutRecord | null {
      return cloneJson(layoutRecord);
    },
    readRecord(sessionId: string): RepairStoredSessionRecord | null {
      return cloneJson(records.get(sessionId) ?? null);
    },
    readEvidenceSelectionRecord(sessionId: string): RepairStoredEvidenceSelectionRecord | null {
      return cloneJson(evidenceSelectionRecords.get(sessionId) ?? null);
    },
  };
}
void test("repair-room patches operator profile equipment, skills, preferences, and adaptation", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateOperatorProfile, {
      displayName: "Mobile Bench",
      preferences: {
        aiVerbosity: "detailed",
        annotationDefaultStrokeWidth: 4,
        riskTolerance: "low",
      },
      skills: [{ id: "smps-repair", label: "SMPS repair", proficiency: 5 }],
      tools: [
        { id: "bench-psu", category: "power", label: "DC Bench Power Supply", available: false },
        {
          id: "hot-air-quick861d",
          category: "soldering",
          label: "Hot Air Station (Quick 861D)",
          available: false,
        },
        {
          id: "microscope-relife-rl-m3t",
          category: "vision",
          label: "Microscope (Relife RL-M3T)",
          available: true,
        },
      ],
    }).success,
    true
  );

  const profile = runtime.getStateSnapshot().state.operatorProfile;
  assert.equal(profile.displayName, "Mobile Bench");
  assert.equal(profile.preferences.aiVerbosity, "detailed");
  assert.equal(profile.preferences.annotationDefaultStrokeWidth, 4);
  assert.equal(profile.preferences.riskTolerance, "low");
  assert.equal(profile.skills.find((skill) => skill.id === "smps-repair")?.proficiency, 5);
  assert.equal(profile.bench.tools.find((tool) => tool.id === "bench-psu")?.available, false);
  assert.equal(
    profile.bench.tools.find((tool) => tool.id === "hot-air-quick861d")?.available,
    false
  );
  assert.equal(runtime.getStateSnapshot().state.operatorAdaptation.hasBenchPsu, false);
  assert.equal(runtime.getStateSnapshot().state.operatorAdaptation.hasHotAirStation, false);
  assert.equal(runtime.getStateSnapshot().state.operatorAdaptation.hasMicroscope, true);

  runtime.dispose();
});

void test("repair-room persists operator profile to room-local storage and hydrates it", async () => {
  const storage = createMemoryRepairStorage();
  const runtime = createRepairRoomHostRuntime({
    autoHydrateStorage: false,
    io: createMemoryRepairIo(),
    storage,
  }).activate({
    log: () => {},
    notifyRoom: () => {},
  });

  await runtime.hydrateStorage();
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateOperatorProfile, {
      displayName: "Persisted Bench",
      tools: [{ id: "bench-psu", available: false }],
    }).success,
    true
  );
  await runtime.flushStorage();
  assert.equal(
    (storage.readOperatorProfileRecord() as { profile?: { displayName?: string } } | null)?.profile
      ?.displayName,
    "Persisted Bench"
  );
  runtime.dispose();

  const hydratedRuntime = createRepairRoomHostRuntime({
    autoHydrateStorage: false,
    io: createMemoryRepairIo(),
    storage,
  }).activate({
    log: () => {},
    notifyRoom: () => {},
  });
  await hydratedRuntime.hydrateStorage();

  assert.equal(
    hydratedRuntime.getStateSnapshot().state.operatorProfile.displayName,
    "Persisted Bench"
  );
  assert.equal(hydratedRuntime.getStateSnapshot().state.operatorAdaptation.hasBenchPsu, false);
  hydratedRuntime.dispose();
});

void test("repair-room persists panel sizes to room-local storage and hydrates them", async () => {
  const storage = createMemoryRepairStorage();
  const runtime = createRepairRoomHostRuntime({
    autoHydrateStorage: false,
    io: createMemoryRepairIo(),
    storage,
  }).activate({
    log: () => {},
    notifyRoom: () => {},
  });

  await runtime.hydrateStorage();
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updatePanelLayout, {
      panelSizes: {
        mainColumns: {
          "session-rail": 1.35,
          "workbench-stage": 1.25,
          "tactical-feed": 0.7,
          "knowledge-pack": 1.1,
        },
      },
    }).success,
    true
  );
  await runtime.flushStorage();

  assert.equal(storage.readLayoutRecord()?.panelSizes.mainColumns["session-rail"], 1.35);
  assert.equal(storage.readLayoutRecord()?.panelSizes.mainColumns["workbench-stage"], 1.25);
  runtime.dispose();

  const hydratedRuntime = createRepairRoomHostRuntime({
    autoHydrateStorage: false,
    io: createMemoryRepairIo(),
    storage,
  }).activate({
    log: () => {},
    notifyRoom: () => {},
  });
  await hydratedRuntime.hydrateStorage();

  assert.equal(hydratedRuntime.getStateSnapshot().state.layout.panelSizes.mainColumns["session-rail"], 1.35);
  assert.equal(
    hydratedRuntime.getStateSnapshot().state.layout.panelSizes.mainColumns["workbench-stage"],
    1.25
  );
  assert.equal(hydratedRuntime.getStateSnapshot().state.layout.panelSizes.mainColumns["tactical-feed"], 0.7);
  assert.equal(hydratedRuntime.getStateSnapshot().state.layout.panelSizes.mainColumns["knowledge-pack"], 1.1);
  hydratedRuntime.dispose();
});

void test("repair-room opens rare operator and control surfaces in a settings overlay", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });

  assert.equal(runtime.getStateSnapshot().state.layout.settingsOverlayOpen, false);
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.setSettingsOverlay, {
      open: true,
      tabId: "bench-operator",
    }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.layout.settingsOverlayOpen, true);
  assert.equal(runtime.getStateSnapshot().state.layout.settingsOverlayTabId, "bench-operator");

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.setSettingsOverlay, {
      tabId: "repair-controls",
    }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.layout.settingsOverlayOpen, true);
  assert.equal(runtime.getStateSnapshot().state.layout.settingsOverlayTabId, "repair-controls");

  const invalid = runtime.handleCommand(REPAIR_UI_COMMANDS.setSettingsOverlay, {
    tabId: "timeline",
  });
  assert.equal(invalid.success, false);
  assert.equal(runtime.getStateSnapshot().state.layout.settingsOverlayTabId, "repair-controls");

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.setSettingsOverlay, { open: false }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.layout.settingsOverlayOpen, false);

  runtime.dispose();
});

void test("repair-room bridges hands-free capture and TTS commands through RoomHost APIs", async () => {
  const calls: string[] = [];
  const activeRequestIds: Record<string, string> = {};
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
    capture: {
      startDictation: async (requestId = "") => {
        activeRequestIds["dictation"] = requestId;
        calls.push(`start-dictation:${requestId}`);
        return { requestId, outcome: { ok: true } };
      },
      stopDictation: async (requestId) => {
        calls.push(`stop-dictation:${requestId}`);
        return { ok: true };
      },
      startAmbientListener: async (requestId = "") => {
        activeRequestIds["ambient"] = requestId;
        calls.push(`start-ambient:${requestId}`);
        return { requestId, outcome: { ok: true } };
      },
      stopAmbientListener: async (requestId) => {
        calls.push(`stop-ambient:${requestId}`);
        return { ok: true };
      },
      startCameraFeed: async (requestId = "") => {
        activeRequestIds["camera"] = requestId;
        calls.push(`start-camera:${requestId}`);
        return {
          requestId,
          outcome: {
            ok: true,
            status: {
              scrcpy: {
                activeSession: {
                  previewVideo: {
                    source: "mjpeg-stream",
                    devicePath:
                      "http://127.0.0.1:4765/api/v1/live/camera/stream?target=room%3Arepair-room",
                    streamUrl:
                      "http://127.0.0.1:4765/api/v1/live/camera/stream?target=room%3Arepair-room",
                    contentType: "multipart/x-mixed-replace; boundary=hayalet-ev-live-frame",
                    label: "Hayalet Ev Companion Live Camera",
                    width: 1280,
                    height: 720,
                    fps: 10,
                  },
                },
              },
            },
          },
        };
      },
      stopCameraFeed: async (requestId = "") => {
        calls.push(`stop-camera:${requestId}`);
        return { requestId, outcome: { ok: true } };
      },
      capturePhoto: async (requestId = "") => {
        activeRequestIds["photo"] = requestId;
        calls.push(`capture-photo:${requestId}`);
        return { ok: true };
      },
    },
    tts: {
      speak: async (text, options) => {
        activeRequestIds["tts"] = options?.requestId ?? "";
        calls.push(`speak:${String(options?.mode ?? "")}:${String(options?.language ?? "")}:${text}`);
        return {
          requestId: options?.requestId ?? "",
          outcome: { status: { status: "playing" } },
        };
      },
      stop: async (requestId) => {
        calls.push(`stop-tts:${requestId}`);
      },
    },
    getLocale: () => "tr",
  });

  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.startDictation).success, true);
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.startAmbientListener).success, true);
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.startCameraFeed).success, true);
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.capturePhoto).success, true);
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.setInteractionSettings, { ttsRoute: "android" })
      .success,
    true
  );
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.speakGuidance, { text: "Bir sonraki adimi oku." })
      .success,
    true
  );
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  assert.match(activeRequestIds["dictation"] ?? "", /^repair-room:dictation:/);
  assert.match(activeRequestIds["ambient"] ?? "", /^repair-room:ambient:/);
  assert.match(activeRequestIds["camera"] ?? "", /^repair-room:camera:/);
  assert.match(activeRequestIds["photo"] ?? "", /^repair-room:photo:/);
  assert.equal(runtime.getStateSnapshot().state.livePreview?.source, "mjpeg-stream");
  assert.equal(
    runtime.getStateSnapshot().state.livePreview?.streamUrl,
    "http://127.0.0.1:4765/api/v1/live/camera/stream?target=room%3Arepair-room"
  );
  assert.match(activeRequestIds["tts"] ?? "", /^repair-room:tts:/);
  assert.ok(calls.some((call) => call.startsWith("capture-photo:repair-room:photo:")));
  assert.ok(calls.some((call) => call.startsWith("speak:android:tr:Bir sonraki adimi oku.")));

  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.stopDictation).success, true);
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.stopAmbientListener).success, true);
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.stopCameraFeed).success, true);
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.stopSpeech).success, true);
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  assert.ok(calls.includes(`stop-dictation:${String(activeRequestIds["dictation"])}`));
  assert.ok(calls.includes(`stop-ambient:${String(activeRequestIds["ambient"])}`));
  assert.ok(calls.includes(`stop-camera:${String(activeRequestIds["camera"])}`));
  assert.ok(calls.includes(`stop-tts:${String(activeRequestIds["tts"])}`));

  const beforeDisabledCaptureCallCount = calls.length;
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.setInteractionSettings, {
      androidCompanionEnabled: false,
    }).success,
    true
  );
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.startCameraFeed).success, false);
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.capturePhoto).success, false);
  assert.equal(calls.length, beforeDisabledCaptureCallCount);

  runtime.dispose();
});

void test("repair-room promotes captured companion snapshots to the active board image", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.addTimelineEvent, {
      kind: "snapshot",
      caption: "Captured board frame.",
      thumbnailSrc: "/tmp/repair-captured-board.jpg",
      useAsBoardImage: true,
      boardImageLabel: "repair-captured-board.jpg",
      widthPx: 1280,
      heightPx: 720,
    }).success,
    true
  );

  const snapshot = runtime.getStateSnapshot().state;
  const activeSession = snapshot.sessions[snapshot.activeSessionId ?? ""];
  const capturedEvent = activeSession?.events.find(
    (event) => event.kind === "snapshot" && event.thumbnailSrc === "/tmp/repair-captured-board.jpg"
  );

  assert.equal(capturedEvent?.kind, "snapshot");
  assert.equal(activeSession?.pcbImage?.src, "/tmp/repair-captured-board.jpg");
  assert.equal(activeSession?.pcbImage?.label, "repair-captured-board.jpg");
  assert.equal(activeSession?.pcbImage?.widthPx, 1280);
  assert.equal(activeSession?.pcbImage?.heightPx, 720);

  runtime.dispose();
});

void test("repair-room auto-reads Assistant AI chat replies when the room setting is enabled", async () => {
  const spoken: string[] = [];
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
    dispatchBridge: () => ({
      success: true,
      reply: {
        text: JSON.stringify({
          replyText: "Measure standby voltage before replacing parts.",
          contextRefs: ["tp-5v-stby"],
        }),
      },
    }),
    getLocale: () => "en",
    tts: {
      speak: async (text, options) => {
        spoken.push(`${String(options?.mode ?? "")}:${String(options?.language ?? "")}:${text}`);
        return {
          requestId: options?.requestId ?? "",
          outcome: { status: { status: "done" } },
        };
      },
      stop: async (_requestId: string) => {},
    },
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.sendChatTurn, { text: "Read this answer" }).success,
    true
  );
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  assert.deepEqual(spoken, ["local:en:Measure standby voltage before replacing parts."]);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.setInteractionSettings, {
      autoReadAiReplies: false,
    }).success,
    true
  );
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.sendChatTurn, { text: "Do not read this one" })
      .success,
    true
  );
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(spoken.length, 1);

  runtime.dispose();
});

void test("repair-room persists dictated composer drafts before chat submission", async () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
    dispatchBridge: () => ({
      success: true,
      reply: {
        text: JSON.stringify({
          replyText: "Composer draft received.",
          contextRefs: [],
        }),
      },
    }),
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.setChatComposer, {
      draft: "Measure U14 VCC",
    }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.chat.composerDraft, "Measure U14 VCC");

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.sendChatTurn, { text: "Measure U14 VCC" }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.chat.composerDraft, "");

  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  runtime.dispose();
});

void test("repair-room Phase 3 keeps calm defaults and applies AI attention budget", () => {
  const defaultGuidance = createRepairDefaultGuidanceProjection();
  const emptyGuidance = createEmptyRepairReplayProjection().guidance;
  assert.deepEqual(emptyGuidance, defaultGuidance);
  assert.equal(defaultGuidance.panelVisibility.panels["knowledge-pack"], "compact");

  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.setAttentionBudget, {
      windowMs: 240000,
      maxAiInterruptions: 1,
    }).success,
    true
  );
  const state = runtime.getStateSnapshot().state;
  const session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  const projection = createRepairReplayProjection(state, session);
  const noPackProjection = createRepairReplayProjection(state, {
    ...session,
    knowledgePack: null,
    knowledgePackId: null,
  });

  assert.equal(projection.guidance.aiInterruption.attentionBudget.windowMs, 240000);
  assert.equal(projection.guidance.aiInterruption.attentionBudget.maxAiInterruptions, 1);
  assert.equal(noPackProjection.guidance.panelVisibility.panels["knowledge-pack"], "compact");
  assert.equal(
    projection.guidance.aiInterruption.attentionBudget.usedAiInterruptions <=
      projection.guidance.aiInterruption.attentionBudget.maxAiInterruptions,
    true
  );
  assert.ok(projection.guidance.aiInterruption.attentionBudget.usedAiInterruptions >= 1);
  assert.ok(projection.guidance.aiInterruption.attentionBudget.collapsedByBudgetCount >= 1);

  runtime.dispose();
});

void test("repair-room runtime turns timeline jumps and layout controls into state", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });

  const firstEvent = runtime.getStateSnapshot().state.sessions["psu-2025-0510"]?.events[0];
  assert.ok(firstEvent);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.jumpToEvent, { eventId: firstEvent.id }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.workbench.focusedEventId, firstEvent.id);
  assert.equal(runtime.getStateSnapshot().state.workbench.investigationModeEnabled, true);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updatePanelLayout, {
      panelId: "tactical-feed",
      collapsed: true,
    }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.layout.collapsedPanels["tactical-feed"], true);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updatePanelLayout, {
      panelSizes: {
        mainColumns: {
          "session-rail": 1.25,
          "workbench-stage": 1.4,
        },
      },
    }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.layout.panelSizes.mainColumns["session-rail"], 1.25);
  assert.equal(runtime.getStateSnapshot().state.layout.panelSizes.mainColumns["workbench-stage"], 1.4);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updatePanelTab, {
      previewTabId: "board-view",
    }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.knowledgePack.previewTabId, "board-view");

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updatePanelTab, {
      operatorProfileTabId: "preferences",
    }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.layout.operatorProfileTabId, "preferences");

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateFocus, {
      focusMode: true,
    }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.layout.focusMode, true);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updatePanelLayout, {
      panelId: "tactical-feed",
      collapsed: false,
    }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.layout.collapsedPanels["tactical-feed"], false);
});

void test("repair-room updatePanelLayout rejects retired panel ids", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  const retiredPanelIds = ["chat", "measurement", "repair-settings", "room-sync"] as const;

  retiredPanelIds.forEach((panelId) => {
    const result = runtime.handleCommand(REPAIR_UI_COMMANDS.updatePanelLayout, {
      panelId,
      collapsed: true,
    });

    assert.equal(result.success, false);
    assert.match(result.message ?? "", /panel layout payload is empty/);
  });

  const collapsedPanels = runtime.getStateSnapshot().state.layout.collapsedPanels as Record<
    string,
    boolean | undefined
  >;
  retiredPanelIds.forEach((panelId) => {
    assert.equal(Object.prototype.hasOwnProperty.call(collapsedPanels, panelId), false);
  });

  runtime.dispose();
});

void test("repair-room runtime keeps event log canonical while feed remains a visibility projection", () => {
  const notifications: Array<{ type: string; payload: Record<string, unknown> | undefined }> = [];
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: (type, payload) => {
      notifications.push({ type, payload });
    },
  });

  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.uiReady).success, true);
  const payload = notifications.find((entry) => entry.type === "repair-state")?.payload as
    | {
        snapshot?: { tacticalFeed?: Array<{ eventId: string }> };
        meta?: { events?: Array<{ id: string }> };
      }
    | undefined;

  const feedIds = new Set(payload?.snapshot?.tacticalFeed?.map((item) => item.eventId) ?? []);
  assert.equal(feedIds.has("evt-psu-ai-3"), false);
  assert.equal(
    payload?.meta?.events?.some((event) => event.id === "evt-psu-ai-3"),
    true
  );
});

void test("repair-room runtime publishes one coherent state snapshot per logical action", () => {
  const notifications: Array<{ type: string; payload: Record<string, unknown> | undefined }> = [];
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: (type, payload) => {
      notifications.push({ type, payload });
    },
  });

  notifications.length = 0;
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.toggleFreezeFrame).success, true);
  assert.equal(notifications.filter((entry) => entry.type === "repair-state").length, 1);

  notifications.length = 0;
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.addMeasurement, {
      xPx: 712,
      yPx: 304,
      rawDisplay: "0.003",
      reference: "U14 VCC",
    }).success,
    true
  );
  assert.equal(notifications.filter((entry) => entry.type === "repair-state").length, 2);

  notifications.length = 0;
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.sendChatTurn, { text: "Next rail?" }).success,
    true
  );
  assert.equal(notifications.filter((entry) => entry.type === "repair-state").length, 1);
});

void test("repair-room runtime keeps P1 wizard, viewport, timeline, and pin edits stateful", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateSession, {
      wizardDraft: {
        boardCode: "BN44-00932A",
        deviceType: "PSU / power board",
        manufacturer: "Samsung",
        model: "BN44-00932A",
      },
    }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.wizard.draft.model, "BN44-00932A");
  assert.equal(runtime.getStateSnapshot().state.wizard.draft.deviceType, "PSU / power board");

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateSession, {
      wizardField: "primarySymptoms",
      value: ["No Power", "No 5V_STBY"],
    }).success,
    true
  );
  assert.deepEqual(runtime.getStateSnapshot().state.wizard.draft.primarySymptoms, [
    "No Power",
    "No 5V_STBY",
  ]);

  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.startKnowledgeResearch).success, true);
  const researchState = runtime.getStateSnapshot().state.wizard;
  assert.equal(researchState.currentStep, "ai-research");
  assert.equal(researchState.foundResources.length, 0);
  assert.ok(researchState.researchProgress.every((item) => item.completed === false));

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateViewport, {
      viewportZoom: 1.75,
      panXPx: 36,
      panYPx: -18,
    }).success,
    true
  );
  assert.deepEqual(runtime.getStateSnapshot().state.workbench.viewport, {
    zoom: 1.75,
    panXPx: 36,
    panYPx: -18,
  });
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateViewport, {
      panXPx: 999999,
      panYPx: -999999,
    }).success,
    true
  );
  assert.ok(runtime.getStateSnapshot().state.workbench.viewport.panXPx < 999999);
  assert.ok(runtime.getStateSnapshot().state.workbench.viewport.panYPx > -999999);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.scrubTimeline, { positionMs: 42000 }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.workbench.timeline.playheadMs, 42000);
  assert.equal(runtime.getStateSnapshot().state.workbench.timeline.autoFollowLive, false);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateTimeline, {
      timelineZoom: 1.5,
      timelineRangeStartMs: 27000,
      timelineRangeEndMs: 57000,
    }).success,
    true
  );
  assert.deepEqual(
    {
      zoom: runtime.getStateSnapshot().state.workbench.timeline.zoom,
      rangeStartMs: runtime.getStateSnapshot().state.workbench.timeline.rangeStartMs,
      rangeEndMs: runtime.getStateSnapshot().state.workbench.timeline.rangeEndMs,
    },
    {
      zoom: 1.5,
      rangeStartMs: 27000,
      rangeEndMs: 57000,
    }
  );

  const session =
    runtime.getStateSnapshot().state.sessions[
      runtime.getStateSnapshot().state.activeSessionId ?? ""
    ];
  const measurement = session?.events.find((event) => event.kind === "measurement");
  assert.ok(measurement);
  const eventCount = (session as RepairSession).events.length;

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.addMeasurement, {
      eventId: measurement.id,
      xPx: 111,
      yPx: 222,
      reference: "Dragged probe",
    }).success,
    true
  );

  const updatedSession = runtime.getStateSnapshot().state.sessions[(session as RepairSession).id];
  const updatedMeasurement = updatedSession?.events.find((event) => event.id === measurement.id);
  assert.equal(updatedSession?.events.length, eventCount);
  assert.equal(updatedMeasurement?.kind, "measurement");
  assert.deepEqual(updatedMeasurement.pinAt, { xPx: 111, yPx: 222 });
  assert.equal(runtime.getStateSnapshot().state.workbench.focusedEventId, measurement.id);
});

void test("repair-room Phase 2 projection restores replay state from the canonical event log", () => {
  const notifications: Array<{ type: string; payload: Record<string, unknown> | undefined }> = [];
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: (type, payload) => {
      notifications.push({ type, payload });
    },
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.scrubTimeline, { positionMs: 16 * 60 * 1000 }).success,
    true
  );

  const payload = notifications.at(-1)?.payload as
    | {
        meta?: {
          replay?: {
            visibleEvents?: Array<{ id: string }>;
            overlayEvents?: Array<{ id: string }>;
            measurementEvidence?: Array<{ reference: string; history: string[] }>;
          };
        };
        snapshot?: {
          measurement?: { evidence?: Array<{ reference: string }> };
          workbench?: { measurementEvidence?: Array<{ reference: string }> };
        };
      }
    | undefined;

  assert.ok(payload?.meta?.replay);
  assert.equal(
    payload.meta.replay.visibleEvents?.some((event) => event.id === "evt-psu-meas-1"),
    true
  );
  assert.equal(
    payload.meta.replay.overlayEvents?.some((event) => event.id === "evt-psu-anno-1"),
    true
  );
  assert.equal(
    payload.meta.replay.measurementEvidence?.some((entry) => entry.reference.includes("C101")),
    true
  );
  assert.equal(
    payload.snapshot?.measurement?.evidence?.some((entry) => entry.reference.includes("C101")),
    true
  );
  assert.equal(
    payload.snapshot.workbench?.measurementEvidence?.some((entry) =>
      entry.reference.includes("C101")
    ),
    true
  );
});

void test("repair-room replay projection holds forensic overlay state during freeze frames", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  const state = runtime.getStateSnapshot().state;
  const session = state.sessions["psu-2025-0510"];
  assert.ok(session);

  const frozenSession = {
    ...session,
    events: [
      ...session.events,
      {
        kind: "measurement" as const,
        id: "evt-freeze-inner-meas",
        sessionId: session.id,
        occurredAt: "2026-05-10T10:31:30.000Z",
        source: "instrument" as const,
        linkedEventIds: ["evt-psu-freeze-1"],
        instrumentId: "multimeter-fnirsi-dmt99",
        channel: "COM/VΩ",
        mode: "DCV",
        range: "20 V",
        value: 4.81,
        rawDisplay: "4.81",
        unit: "V",
        pinAt: { xPx: 900, yPx: 400 },
        reference: "Freeze-window reading",
      },
    ],
  };

  const projection = createRepairReplayProjection(
    {
      ...state,
      workbench: {
        ...state.workbench,
        timeline: {
          ...state.workbench.timeline,
          playheadMs: 13 * 60 * 1000 + 30 * 1000,
          autoFollowLive: false,
        },
      },
    },
    frozenSession
  );

  assert.equal(
    projection.visibleEvents.some((event) => event.id === "evt-freeze-inner-meas"),
    true
  );
  assert.equal(
    projection.overlayEvents.some((event) => event.id === "evt-freeze-inner-meas"),
    false
  );
  assert.equal(projection.activeFreezeFrameEventId, "evt-psu-freeze-1");
});

void test("repair-room AI mark expiry is evaluated against replay playhead", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  const state = runtime.getStateSnapshot().state;
  const session = state.sessions["psu-2025-0510"];
  assert.ok(session);

  const expiringSession = {
    ...session,
    events: [
      ...session.events,
      {
        kind: "ai-mark" as const,
        id: "evt-expiring-ai",
        sessionId: session.id,
        occurredAt: "2026-05-10T10:30:32.000Z",
        source: "ai" as const,
        linkedEventIds: [],
        severity: "suggestion" as const,
        region: { xPx: 100, yPx: 100, widthPx: 40, heightPx: 40 },
        rationale: "Short-lived replay mark.",
        protocolKey: "repair-room-assistant-observation",
        dismissed: false,
        lifecycleState: "detected" as const,
        expiresAt: "2026-05-10T10:30:40.000Z",
      },
    ],
  };

  const projection = createRepairReplayProjection(
    {
      ...state,
      workbench: {
        ...state.workbench,
        timeline: {
          ...state.workbench.timeline,
          playheadMs: 13 * 60 * 1000,
          autoFollowLive: false,
        },
      },
    },
    expiringSession
  );

  assert.equal(
    projection.visibleEvents.some((event) => event.id === "evt-expiring-ai"),
    true
  );
  assert.equal(projection.aiMarkEventIds.includes("evt-expiring-ai"), false);
});

void test("repair-room timeline chips seek to exact event state and replay controls stay deterministic", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  const session = runtime.getStateSnapshot().state.sessions["psu-2025-0510"];
  assert.ok(session);
  const target = session.events.find((event) => event.id === "evt-psu-meas-4");
  assert.ok(target);
  const expectedOffset = Date.parse(target.occurredAt) - Date.parse(session.startedAt);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.jumpToEvent, { eventId: target.id }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.workbench.focusedEventId, target.id);
  assert.equal(runtime.getStateSnapshot().state.workbench.timeline.playheadMs, expectedOffset);
  assert.equal(runtime.getStateSnapshot().state.workbench.timeline.autoFollowLive, false);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateTimeline, { replayAction: "play" }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.workbench.timeline.isPlaying, true);
  assert.equal(runtime.getStateSnapshot().state.workbench.timeline.replayMode, "replay");

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateTimeline, { replaySpeed: 2 }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.workbench.timeline.replaySpeed, 2);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateTimeline, { replayAction: "live" }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.workbench.timeline.autoFollowLive, true);
  assert.equal(runtime.getStateSnapshot().state.workbench.timeline.replayMode, "live");
});

void test("repair-room annotations and knowledge pack spatial focus are forensic records", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.addTimelineEvent, {
      kind: "annotation",
      tool: "rect",
      xPx: 500,
      yPx: 260,
      label: "Confirmed cracked startup resistor",
      linkedMeasurementId: "evt-psu-meas-2",
      linkedEventId: "evt-psu-ai-2",
    }).success,
    true
  );

  const session = runtime.getStateSnapshot().state.sessions["psu-2025-0510"];
  const annotation = session?.events.at(-1);
  assert.equal(annotation?.kind, "annotation");
  assert.equal(annotation!.meta!.author, "operator");
  assert.equal(annotation!.meta!.tool, "rect");
  assert.deepEqual(annotation!.meta!.linkedMeasurementIds, ["evt-psu-meas-2"]);
  assert.deepEqual(annotation!.meta!.linkedEventIds, ["evt-psu-ai-2"]);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updatePanelTab, {
      spatialRefId: "startup-resistor-open",
    }).success,
    true
  );
  assert.equal(
    runtime.getStateSnapshot().state.knowledgePack.focusedSpatialRefId,
    "startup-resistor-open"
  );
  assert.equal(runtime.getStateSnapshot().state.knowledgePack.previewTabId, "board-view");
});
