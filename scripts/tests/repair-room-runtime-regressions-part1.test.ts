import test from "node:test";
import assert from "node:assert/strict";
import createRepairRoomHostRuntimeBase from "../../rooms/repair-room/host/runtime.ts";
import { createRepairReplayProjection } from "../../rooms/repair-room/host/state/repair-replay-projection.ts";
import {
  REPAIR_ROOM_ID,
  REPAIR_UI_COMMANDS,
} from "../../rooms/repair-room/shared/repair-constants.ts";
import { normalizeRepairHostMessage } from "../../rooms/repair-room/shared/ui/host-messages.ts";
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
  TEST_REPAIR_ACTIVE_SESSION_ID,
  toStoredSessionListItem,
  createTestRepairSession,
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
    deleteRuntimePath: async (
      _targetPath: string,
      _options?: { recursive?: boolean; requestId?: string | null }
    ) => {},
    getElectronApi: () => null,
    listDirectory: async (_dirPath: string) => [],
    readJsonFile: async (_filePath: string) => null,
    resolveRuntimePaths: async (_requestId?: string | null) => ({
      storageDir: "/tmp/repair-room-test",
    }),
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
    readRecord(sessionId: string): RepairStoredSessionRecord | null {
      return cloneJson(records.get(sessionId) ?? null);
    },
    readEvidenceSelectionRecord(sessionId: string): RepairStoredEvidenceSelectionRecord | null {
      return cloneJson(evidenceSelectionRecords.get(sessionId) ?? null);
    },
  };
}

void test("repair-room host exports room-page lifecycle hooks and command registry", () => {
  const notifications: Array<{ type: string; payload: Record<string, unknown> | undefined }> = [];
  const logs: string[] = [];
  const runtime = createRepairRoomHostRuntime().activate({
    log: (_level, message) => {
      logs.push(message);
    },
    notifyRoom: (type, payload) => {
      notifications.push({ type, payload });
    },
  });

  assert.equal(typeof runtime.onRoomReady, "function");
  assert.equal(typeof runtime.commands[REPAIR_UI_COMMANDS.uiReady], "function");
  assert.ok(logs.some((entry) => entry.includes("Repair Room host activated.")));

  runtime.onRoomReady({ stage: "ui-ready" });

  const stateMessage = notifications.find((entry) => entry.type === "repair-state");
  const normalized = normalizeRepairHostMessage({
    type: stateMessage?.type,
    payload: stateMessage?.payload,
  });

  assert.ok(normalized);
  assert.equal(normalized.type, "repair-state");
  assert.equal(normalized.snapshot.sessions.activeId, TEST_REPAIR_ACTIVE_SESSION_ID);
  assert.equal(normalized.snapshot.sessions.list.length, 1);
  assert.ok(normalized.snapshot.sessions.detail?.pcbImage);
  assert.equal(normalized.snapshot.tacticalFeed.length, 3);
  assert.equal(normalized.snapshot.guidance.operationalProfile, "novice");
  assert.equal(normalized.snapshot.guidance.panelVisibility.primarySurface, "measurement");
  assert.equal(normalized.snapshot.guidance.panelVisibility.tacticalFeedDensity, "compact");
  assert.equal(normalized.snapshot.guidance.panelVisibility.panels["tactical-feed"], "compact");
  assert.equal(normalized.snapshot.guidance.panelVisibility.panels["session-wizard"], "compact");
  assert.equal(normalized.snapshot.guidance.overlaySaturation.maxVisibleRelationships, 4);
  assert.equal(normalized.snapshot.guidance.overlaySaturation.maxVisibleRegions, 5);
  assert.equal(normalized.snapshot.guidance.overlaySaturation.labelMode, "simplified");
  assert.equal(normalized.snapshot.guidance.rhythm.lifecycle.length, 6);
  assert.equal(
    normalized.snapshot.guidance.rhythm.lifecycle.includes(
      normalized.snapshot.guidance.investigationPhase
    ),
    true
  );
  assert.equal(normalized.snapshot.guidance.focusCorridor.active, false);
  assert.equal(normalized.snapshot.guidance.aiInterruption.attentionBudget.maxAiInterruptions, 2);
  assert.equal(normalized.snapshot.guidance.voice.spokenGuidanceMode, "brief");
  assert.equal(
    normalized.meta.events.some((event) => event.id === "evt-psu-ai-3"),
    true
  );

  const toggleFreeze = runtime.commands[REPAIR_UI_COMMANDS.toggleFreezeFrame];
  assert.equal(typeof toggleFreeze, "function");
  assert.equal((toggleFreeze as (...args: unknown[]) => { success: boolean })().success, true);
  assert.equal(runtime.getStateSnapshot().state.workbench.isFrozen, true);

  runtime.dispose();
  assert.ok(logs.some((entry) => entry.includes("Repair Room host disposed.")));
});

void test("repair-room runtime handles the advertised interactive Phase 1 commands", async () => {
  const notifications: Array<{ type: string; payload: Record<string, unknown> | undefined }> = [];
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: (type, payload) => {
      notifications.push({ type, payload });
    },
  });

  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.uiReady).success, true);
  assert.equal(runtime.getStateSnapshot().state.tacticalFeed.length, 3);
  assert.equal(runtime.getStateSnapshot().state.sessionList[0]?.serialNumber, "R21Z14CSN100123");
  const firstStatePayload = notifications.find((entry) => entry.type === "repair-state")
    ?.payload as { meta?: { events?: Array<{ id: string }> } } | undefined;
  assert.equal(
    firstStatePayload?.meta?.events?.some((event) => event.id === "evt-psu-ai-3"),
    true
  );

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.toggleOverlayLayer, {
      layerId: "grid",
      visible: false,
    }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.workbench.visibleLayers.grid, false);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.setActiveTool, { tool: "zoom-in" }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.workbench.viewport.zoom, 1.25);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.addMeasurement, {
      xPx: 712,
      yPx: 304,
      rawDisplay: "0.002",
      reference: "U14 VCC",
    }).success,
    true
  );
  const measurementState = runtime.getStateSnapshot().state.measurement;
  assert.equal(measurementState.current.display, "0.002");
  assert.equal(measurementState.recent[0]?.reference, "U14 VCC");

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.addTimelineEvent, {
      kind: "snapshot",
      caption: "Android companion frame captured.",
      thumbnailSrc: "/tmp/repair-frame.jpg",
    }).success,
    true
  );
  const snapshotEvent = runtime
    .getStateSnapshot()
    .state.sessions[
      TEST_REPAIR_ACTIVE_SESSION_ID
    ]?.events.find((event) => event.kind === "snapshot" && event.caption === "Android companion frame captured.");
  assert.equal(snapshotEvent?.kind, "snapshot");
  assert.equal(snapshotEvent.thumbnailSrc, "/tmp/repair-frame.jpg");

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.sendChatTurn, { text: "Check standby rail" }).success,
    true
  );
  let chatState = runtime.getStateSnapshot().state.chat;
  assert.equal(chatState.turns.at(-1)?.role, "operator");
  assert.equal(chatState.pendingReplyId, chatState.turns.at(-1)?.id);

  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  chatState = runtime.getStateSnapshot().state.chat;
  assert.equal(chatState.pendingReplyId, null);
  assert.equal(chatState.turns.at(-1)?.role, "operator");
  assert.equal(runtime.getStateSnapshot().state.aiDispatch.status, "failed");
  assert.equal(runtime.getStateSnapshot().state.aiDispatch.activity, "chat-reply");

  assert.ok(notifications.some((entry) => entry.type === "repair-state"));
  runtime.dispose();
});

void test("repair-room chat uses live protocol bridge guidance", async () => {
  const dispatchCalls: Record<string, unknown>[] = [];
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
    dispatchBridge: (payload: Record<string, unknown>) => {
      dispatchCalls.push(payload);
      return {
        success: true,
        reply: {
          text: JSON.stringify({
            replyText:
              "Measure 5V_STBY first, then compare it with the knowledge-pack expected rail.",
            contextRefs: ["tp-5v-stby"],
          }),
        },
      };
    },
    getLocale: () => "en",
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.sendChatTurn, { text: "What should I check next?" })
      .success,
    true
  );
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(dispatchCalls.length, 1);
  assert.equal(dispatchCalls[0]?.["action"], "message.sendWait");
  assert.equal(dispatchCalls[0]["toSlot"], "ai2");
  const payload = dispatchCalls[0]["payload"] as Record<string, unknown> | undefined;
  const protocol = payload?.["protocol"] as Record<string, unknown> | undefined;
  assert.equal(payload?.["page"], "repair-room:assistant-chat");
  assert.equal(protocol?.["protocolKey"], "repair-room-assistant-chat");
  assert.match(String(payload["text"]), /repair-room-assistant-chat/);

  const chatState = runtime.getStateSnapshot().state.chat;
  assert.equal(chatState.pendingReplyId, null);
  assert.equal(chatState.turns.at(-1)?.role, "ai");
  assert.equal(runtime.getStateSnapshot().state.aiDispatch.status, "succeeded");
  assert.equal(runtime.getStateSnapshot().state.aiDispatch.activity, "chat-reply");
  assert.equal(runtime.getStateSnapshot().state.aiDispatch.targetSlot, "ai2");
  assert.equal(
    chatState.turns.at(-1)?.text,
    "Measure 5V_STBY first, then compare it with the knowledge-pack expected rail."
  );
  assert.equal(chatState.turns.at(-1)?.contextRefs.includes("tp-5v-stby"), true);

  runtime.dispose();
});

void test("repair-room chat can apply safe AI room commands and reject malformed commands", async () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
    dispatchBridge: () => ({
      success: true,
      reply: {
        text: JSON.stringify({
          replyText: "I marked the next safe measurement point.",
          contextRefs: ["tp-ai-safe"],
          roomCommands: [
            {
              commandName: REPAIR_UI_COMMANDS.addTimelineEvent,
              payload: {
                kind: "annotation",
                tool: "rect",
                label: "AI suggested safe probe area",
                xPx: 420,
                yPx: 240,
                widthPx: 120,
                heightPx: 80,
              },
              reason: "Operator asked for the next safe visual target.",
            },
            {
              commandName: "RepairRoomDeleteSession",
              payload: {},
            },
          ],
        }),
      },
    }),
    getLocale: () => "en",
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.sendChatTurn, { text: "Mark the next safe target" })
      .success,
    true
  );
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  const state = runtime.getStateSnapshot().state;
  const session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  assert.equal(
    session.events.some(
      (event) => event.kind === "annotation" && event.label === "AI suggested safe probe area"
    ),
    true
  );
  assert.equal(state.aiDispatch.status, "succeeded");
  assert.equal(state.aiDispatch.activity, "chat-reply");
  assert.match(state.aiDispatch.message ?? "", /1\/1 room command applied/);
  assert.match(state.aiDispatch.message ?? "", /1 malformed room command ignored/);

  runtime.dispose();
});

void test("repair-room chat reply exposes AI2 dispatch state", async () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
    dispatchBridge: () => ({
      success: true,
      reply: {
        text: JSON.stringify({
          replyText: "Probe 5V_STBY and compare against the known good rail.",
          contextRefs: ["tp-5v-stby"],
        }),
      },
    }),
    getLocale: () => "en",
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.sendChatTurn, { text: "Which rail next?" }).success,
    true
  );
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  const { aiDispatch } = runtime.getStateSnapshot().state;
  assert.equal(aiDispatch.status, "succeeded");
  assert.equal(aiDispatch.activity, "chat-reply");
  assert.equal(aiDispatch.targetSlot, "ai2");
  assert.equal(aiDispatch.contextRefs.length, 3);
  assert.equal(aiDispatch.contextRefs.includes("tp-5v-stby"), true);

  runtime.dispose();
});

void test("repair-room state exposes one Assistant AI dispatch contract", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  const dispatch = runtime.getStateSnapshot().state.aiDispatch as unknown as Record<string, unknown>;

  assert.deepEqual(Object.keys(dispatch).sort(), [
    "activity",
    "completedAt",
    "contextRefs",
    "message",
    "startedAt",
    "status",
    "targetSlot",
  ]);
  assert.equal(dispatch["activity"], "idle");
  assert.equal(dispatch["status"], "idle");
  assert.equal(Object.prototype.hasOwnProperty.call(dispatch, "chat"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(dispatch, "research"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(dispatch, "tactical"), false);

  runtime.dispose();
});

void test("repair-room research uses selected AI slot for live knowledge-pack dispatch", async () => {
  const dispatchCalls: Record<string, unknown>[] = [];
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
    dispatchBridge: (payload: Record<string, unknown>) => {
      dispatchCalls.push(payload);
      const page = (payload["payload"] as Record<string, unknown> | undefined)?.["page"];
      if (page === "repair-room:assistant-risk-scan") {
        return {
          success: true,
          reply: { text: JSON.stringify({ risks: [] }) },
        };
      }
      return {
        success: true,
        reply: {
          text: JSON.stringify({
            contextRefs: ["research-bn44"],
            knowledgePack: {
              id: "ai-bn44-00932a",
              modelNumber: "BN44-00932A",
              deviceLabel: "Samsung PSU",
              resources: [
                {
                  id: "candidate-schematic",
                  label: "Candidate service manual",
                  kind: "schematic",
                  url: "https://example.test/bn44-00932a-service-manual.pdf",
                  source: "Assistant AI evidence candidate",
                  pages: 12,
                  confidence: 0.74,
                },
              ],
              commonFailures: [
                {
                  id: "startup-resistor-open",
                  label: "Startup resistor open",
                  rationale: "No standby symptom matches startup bias loss.",
                  affectedPart: "R201",
                  recommendedAction: "Measure startup resistance before replacing parts.",
                  confidence: 0.81,
                },
              ],
              testPoints: [
                {
                  id: "tp-5v-stby-ai",
                  label: "5V_STBY",
                  rail: "Standby",
                  expectedValue: 5,
                  unit: "V",
                  tolerance: 0.25,
                },
              ],
              notes: ["Discharge the bulk capacitor before primary-side checks."],
            },
          }),
        },
      };
    },
    getLocale: () => "en",
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateSession, {
      wizardDraft: {
        boardCode: "BN44-00932A",
        deviceType: "PSU / power board",
        manufacturer: "Samsung",
        model: "BN44-00932A",
        primarySymptoms: ["No Power"],
      },
    }).success,
    true
  );

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.startKnowledgeResearch, { targetSlot: "ai0" }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.aiDispatch.status, "pending");
  assert.equal(runtime.getStateSnapshot().state.aiDispatch.activity, "evidence-research");

  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(dispatchCalls.length, 1);
  assert.equal(dispatchCalls[0]?.["action"], "message.sendWait");
  assert.equal(dispatchCalls[0]["toSlot"], "ai0");
  const payload = dispatchCalls[0]["payload"] as Record<string, unknown> | undefined;
  const protocol = payload?.["protocol"] as Record<string, unknown> | undefined;
  assert.equal(payload?.["page"], "repair-room:assistant-evidence");
  assert.equal(protocol?.["protocolKey"], "repair-room-assistant-evidence");

  const state = runtime.getStateSnapshot().state;
  assert.equal(state.aiDispatch.targetSlot, "ai0");
  assert.equal(state.aiDispatch.activity, "evidence-research");
  assert.equal(state.aiDispatch.status, "succeeded");
  assert.equal(state.wizard.currentStep, "evidence-review");
  assert.equal(state.wizard.generatedKnowledgePackId, "ai-bn44-00932a");
  assert.equal(state.wizard.foundResources[0]?.id, "candidate-schematic");
  assert.equal(
    state.knowledgePack.pack?.resources[0]?.sourceUrl,
    "https://example.test/bn44-00932a-service-manual.pdf"
  );
  assert.equal(
    state.knowledgePack.pack?.resources[0]?.downloadUrl,
    state.knowledgePack.pack?.resources[0]?.sourceUrl
  );
  assert.equal(
    state.wizard.researchProgress.every((item) => item.completed),
    true
  );
  assert.deepEqual(state.wizard.draft.selectedEvidenceResourceIds, ["candidate-schematic"]);
  assert.deepEqual(state.wizard.draft.selectedFailureIds, ["startup-resistor-open"]);
  assert.deepEqual(state.wizard.draft.selectedTestPointIds, ["tp-5v-stby-ai"]);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.addKnowledgeResource, {
      kind: "schematic",
      label: "Manual boardview mirror",
      url: "https://example.test/manual-boardview.pdf",
    }).success,
    true
  );
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.addKnowledgeFailure, {
      label: "Input MLCC short",
      affectedPart: "Main input rail",
      recommendedAction: "Lift suspect capacitor and retest rail resistance.",
      rationale: "Operator found a low resistance main rail during review.",
    }).success,
    true
  );
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.addKnowledgeTestPoint, {
      label: "Main rail to ground",
      rail: "19V_PBUS",
      expectedValue: 19,
      unit: "V",
    }).success,
    true
  );
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.addKnowledgeNote, {
      text: "Board has prior rework near DC-in.",
      source: "operator bench note",
    }).success,
    true
  );
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.removeKnowledgeEvidence, {
      kind: "resource",
      id: "candidate-schematic",
    }).success,
    true
  );

  const manualState = runtime.getStateSnapshot().state;
  assert.equal(
    manualState.knowledgePack.pack?.resources.some(
      (resource) => resource.id === "manual-schematic-manual-boardview-mirror"
    ),
    false
  );
  assert.equal(
    manualState.knowledgePack.pack?.resources.some(
      (resource) => resource.id === "candidate-schematic"
    ),
    true
  );
  assert.equal(
    manualState.wizard.draft.manualEvidence.resources.some(
      (resource) =>
        resource.label === "Manual boardview mirror" &&
        resource.addedBy === "operator" &&
        resource.sourceUrl === "https://example.test/manual-boardview.pdf"
    ),
    true
  );
  assert.equal(
    manualState.wizard.draft.manualEvidence.failures.some(
      (failure) => failure.id === "manual-failure-input-mlcc-short"
    ),
    true
  );
  assert.equal(
    manualState.wizard.draft.manualEvidence.testPoints.some(
      (point) => point.id === "manual-test-point-main-rail-to-ground"
    ),
    true
  );
  assert.equal(manualState.wizard.draft.manualEvidence.notes.length, 1);
  assert.equal(
    manualState.wizard.draft.manualEvidence.removedResourceIds.includes("candidate-schematic"),
    true
  );
  assert.equal(
    manualState.wizard.draft.selectedEvidenceResourceIds.includes(
      "manual-schematic-manual-boardview-mirror"
    ),
    true
  );
  assert.equal(
    manualState.wizard.draft.selectedEvidenceResourceIds.includes("candidate-schematic"),
    false
  );

  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.advanceWizard).success, true);
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.createSession).success, true);
  const nextState = runtime.getStateSnapshot().state;
  const activeSession = nextState.sessions[nextState.activeSessionId ?? ""];
  assert.equal(activeSession?.knowledgePackId, "ai-bn44-00932a");
  assert.equal(activeSession.knowledgePack?.testPoints[0]?.label, "5V_STBY");
  assert.equal(
    activeSession.knowledgePack?.resources.some(
      (resource) => resource.id === "manual-schematic-manual-boardview-mirror"
    ),
    true
  );
  assert.equal(
    activeSession.knowledgePack?.resources.some(
      (resource) => resource.id === "candidate-schematic"
    ),
    false
  );
  assert.equal(
    activeSession.knowledgePack?.commonFailures.some(
      (failure) => failure.id === "manual-failure-input-mlcc-short"
    ),
    true
  );
  assert.equal(
    activeSession.knowledgePack?.testPoints.some(
      (point) => point.id === "manual-test-point-main-rail-to-ground"
    ),
    true
  );
  assert.equal(
    activeSession.knowledgePack?.notes.includes("Board has prior rework near DC-in."),
    true
  );

  runtime.dispose();
});

void test("repair-room wizard v2 gates tabs, accepts unknown fields, and skips failed research", async () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.advanceWizard, { step: "symptoms" }).success,
    false
  );
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.createSession).success, false);
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateSession, {
      wizardDraft: {
        boardCode: "Bilinmiyor",
        deviceType: "Bilinmiyor",
        manufacturer: "Bilinmiyor",
        model: "Bilinmiyor",
      },
    }).success,
    true
  );
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.advanceWizard, { step: "symptoms" }).success,
    true
  );
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.advanceWizard, { step: "ai-research" }).success,
    false
  );
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.createSession).success, false);
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateSession, {
      wizardDraft: {
        customSymptoms: ["Intermittent short"],
      },
    }).success,
    true
  );
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.advanceWizard, { step: "ai-research" }).success,
    true
  );
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.startKnowledgeResearch).success, true);

  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  const failedResearch = runtime.getStateSnapshot().state.wizard;
  assert.equal(failedResearch.draft.researchStatus, "failed");
  assert.match(failedResearch.draft.researchMessage ?? "", /bridge/i);
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.createSession).success, false);
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.skipKnowledgeResearch).success, true);

  const skippedState = runtime.getStateSnapshot().state;
  const skipped = skippedState.wizard;
  assert.equal(skipped.currentStep, "evidence-review");
  assert.equal(skipped.draft.researchSkipped, true);
  assert.equal(skipped.evidenceReviewed, false);
  assert.equal(skipped.generatedKnowledgePackId, "manual-bilinmiyor");
  assert.equal(skippedState.knowledgePack.pack?.id, "manual-bilinmiyor");
  assert.equal(skippedState.knowledgePack.pack?.resources.length, 0);
  assert.equal(runtime.getStateSnapshot().state.phase, "wizard-active");
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.createSession).success, false);
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.addKnowledgeResource, {
      kind: "schematic",
      label: "Manual boardview mirror",
      url: "https://example.test/manual-boardview.pdf",
    }).success,
    true
  );
  const manualReview = runtime.getStateSnapshot().state;
  assert.equal(manualReview.wizard.currentStep, "evidence-review");
  assert.equal(manualReview.wizard.draft.researchSkipped, true);
  assert.equal(
    manualReview.wizard.draft.selectedEvidenceResourceIds.includes(
      "manual-schematic-manual-boardview-mirror"
    ),
    true
  );
  assert.equal(
    manualReview.knowledgePack.pack?.resources.some(
      (resource) => resource.id === "manual-schematic-manual-boardview-mirror"
    ),
    false
  );
  assert.equal(
    manualReview.wizard.draft.manualEvidence.resources.some(
      (resource) => resource.id === "manual-schematic-manual-boardview-mirror"
    ),
    true
  );
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.createSession).success, false);
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.advanceWizard, { step: "ready" }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.phase, "wizard-active");
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.createSession).success, true);

  const nextState = runtime.getStateSnapshot().state;
  const activeSession = nextState.sessions[nextState.activeSessionId ?? ""];
  assert.equal(activeSession?.status, "in-progress");
  assert.equal(activeSession.knowledgePackId, "manual-bilinmiyor");
  assert.equal(
    activeSession.knowledgePack?.resources.some(
      (resource) => resource.id === "manual-schematic-manual-boardview-mirror"
    ),
    true
  );
  assert.equal(activeSession.deviceInfo.deviceType, "Bilinmiyor");
  assert.deepEqual(activeSession.symptoms.primarySymptoms, ["Intermittent short"]);

  runtime.dispose();
});

void test("repair-room persists selected evidence separately from the v2 session record", async () => {
  const baseStoredSession = createTestRepairSession();
  const storedSession: RepairSession = {
    ...cloneJson(baseStoredSession),
    id: "repair-existing-active-session",
    title: "Existing active repair session",
    updatedAt: "2026-06-13T11:00:00.000Z",
  };
  const storage = createMemoryRepairStorage([createStoredRepairRecord(storedSession)]);
  const runtime = createRepairRoomHostRuntime({
    autoHydrateStorage: false,
    initialSeed: {
      activeSessionId: storedSession.id,
      sessionList: [toStoredSessionListItem(storedSession)],
      sessions: { [storedSession.id]: storedSession },
    },
    io: createMemoryRepairIo(),
    storage,
  }).activate({
    log: () => {},
    notifyRoom: () => {},
    dispatchBridge: () => ({
      success: true,
      reply: {
        text: JSON.stringify({
          contextRefs: ["evidence-selection"],
          knowledgePack: {
            id: "ai-selection-pack",
            modelNumber: "BN44-00932A",
            deviceLabel: "Samsung PSU",
            resources: [
              {
                id: "res-a",
                label: "Schematic A",
                kind: "schematic",
                source: "AI",
                pages: 4,
                confidence: 0.8,
              },
              {
                id: "res-b",
                label: "Thread B",
                kind: "thread",
                source: "AI",
                pages: null,
                confidence: 0.6,
              },
            ],
            commonFailures: [
              {
                id: "fail-a",
                label: "Startup resistor open",
                rationale: "No standby symptom.",
                affectedPart: "R201",
                recommendedAction: "Measure resistance.",
                confidence: 0.82,
              },
            ],
            testPoints: [
              {
                id: "tp-a",
                label: "5V_STBY",
                rail: "Standby",
                expectedValue: 5,
                unit: "V",
                tolerance: 0.25,
              },
            ],
            notes: ["Discharge primary capacitors."],
          },
        }),
      },
    }),
    getLocale: () => "en",
  });

  await runtime.hydrateStorage();
  assert.equal(runtime.getStateSnapshot().state.activeSessionId, storedSession.id);
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateSession, {
      wizardDraft: {
        boardCode: "BN44-00932A",
        deviceType: "PSU / power board",
        manufacturer: "Samsung",
        model: "BN44-00932A",
        primarySymptoms: ["No Power"],
      },
    }).success,
    true
  );
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.startKnowledgeResearch).success, true);
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateEvidenceSelection, {
      selectedEvidenceResourceIds: ["res-a"],
      selectedFailureIds: [],
      selectedTestPointIds: ["tp-a"],
    }).success,
    true
  );
  await runtime.flushStorage();
  assert.equal(storage.readEvidenceSelectionRecord(storedSession.id), null);
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.advanceWizard, { step: "ready" }).success,
    true
  );
  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.createSession).success, true);
  await runtime.flushStorage();

  const nextState = runtime.getStateSnapshot().state;
  const activeSession = nextState.sessions[nextState.activeSessionId ?? ""];
  assert.equal(activeSession?.schemaVersion, 2);
  assert.equal(activeSession.knowledgePackId, "ai-selection-pack");
  assert.equal(storage.readEvidenceSelectionRecord(storedSession.id), null);
  assert.equal(typeof activeSession, "object");
  const selection = storage.readEvidenceSelectionRecord(activeSession.id);
  assert.equal(typeof selection, "object");
  assert.deepEqual(selection!.selection.selectedEvidenceResourceIds, ["res-a"]);
  assert.deepEqual(selection!.selection.selectedFailureIds, []);
  assert.deepEqual(selection!.selection.selectedTestPointIds, ["tp-a"]);

  runtime.dispose();
});

void test("repair-room hydrate ignores legacy v1 room-local session records", async () => {
  const v2Session: RepairSession = {
    ...cloneJson(createTestRepairSession()),
    id: "repair-v2-session",
    title: "Persisted v2 repair session",
    updatedAt: "2026-06-13T12:00:00.000Z",
  };
  const v1Session = {
    ...cloneJson(createTestRepairSession()),
    id: "repair-v1-session",
    schemaVersion: 1,
    title: "Legacy v1 repair session",
    updatedAt: "2026-06-13T13:00:00.000Z",
  };
  delete (v1Session.deviceInfo as Partial<RepairSession["deviceInfo"]>).deviceType;

  const storage = createMemoryRepairStorage([
    createStoredRepairRecord(v1Session, [], 1),
    createStoredRepairRecord(v2Session),
  ]);
  const runtime = createRepairRoomHostRuntime({
    autoHydrateStorage: false,
    io: createMemoryRepairIo(),
    storage,
  }).activate({
    log: () => {},
    notifyRoom: () => {},
  });

  await runtime.hydrateStorage();

  const state = runtime.getStateSnapshot().state;
  assert.equal(state.storage.sessionCount, 1);
  assert.equal(state.activeSessionId, null);
  assert.equal(state.sessionList.length, 1);
  assert.equal(state.sessionList[0]?.id, "repair-v2-session");
  assert.equal(state.sessions["repair-v2-session"]?.title, "Persisted v2 repair session");
  assert.equal(state.sessions["repair-v1-session"], undefined);
  assert.equal(state.chat.turns.length, 0);

  runtime.dispose();
});

void test("repair-room hydrate keeps a clean fallback when storage has no v2 sessions", async () => {
  const v1Session = {
    ...cloneJson(createTestRepairSession()),
    id: "repair-v1-only-session",
    schemaVersion: 1,
    title: "Legacy v1 only session",
    updatedAt: "2026-06-13T13:00:00.000Z",
  };
  delete (v1Session.deviceInfo as Partial<RepairSession["deviceInfo"]>).deviceType;

  const storage = createMemoryRepairStorage([createStoredRepairRecord(v1Session, [], 1)]);
  const runtime = createRepairRoomHostRuntime({
    autoHydrateStorage: false,
    io: createMemoryRepairIo(),
    storage,
  }).activate({
    log: () => {},
    notifyRoom: () => {},
  });

  const before = runtime.getStateSnapshot().state;
  assert.equal(before.sessionList.length, 0);
  assert.equal(before.activeSessionId, null);

  await runtime.hydrateStorage();

  const after = runtime.getStateSnapshot().state;
  assert.equal(after.storage.status, "ready");
  assert.equal(after.storage.sessionCount, 0);
  assert.equal(after.activeSessionId, null);
  assert.equal(after.sessionList.length, before.sessionList.length);
  assert.equal(
    after.sessionList.some((session) => session.id === "repair-v1-only-session"),
    false
  );

  runtime.dispose();
});

void test("repair-room hydrates room-local storage without opening saved sessions", async () => {
  const storedSession: RepairSession = {
    ...cloneJson(createTestRepairSession()),
    id: "repair-persisted-session",
    title: "Persisted repair session",
    updatedAt: "2026-06-13T10:00:00.000Z",
  };
  const storedChat: RepairChatTurn = {
    id: "chat-stored-1",
    role: "operator",
    text: "Stored repair context",
    occurredAt: "2026-06-13T10:00:01.000Z",
    contextRefs: [storedSession.id],
  };
  const storage = createMemoryRepairStorage([
    createStoredRepairRecord(storedSession, [storedChat]),
  ]);
  const runtime = createRepairRoomHostRuntime({
    autoHydrateStorage: false,
    io: createMemoryRepairIo(),
    storage,
  }).activate({
    log: () => {},
    notifyRoom: () => {},
  });

  await runtime.hydrateStorage();

  const runtimeState = runtime.getStateSnapshot().state;
  assert.equal(runtimeState.storage.status, "ready");
  assert.equal(runtimeState.storage.sessionCount, 1);
  assert.equal(runtimeState.activeSessionId, null);
  assert.equal(runtimeState.sessionList.length, 1);
  assert.equal(runtimeState.sessionList[0]?.id, storedSession.id);
  assert.equal(runtimeState.sessions[storedSession.id]?.title, "Persisted repair session");
  assert.equal(runtimeState.chat.turns.length, 0);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.activateSession, { sessionId: storedSession.id })
      .success,
    true
  );
  const activatedState = runtime.getStateSnapshot().state;
  assert.equal(activatedState.activeSessionId, storedSession.id);
  assert.equal(activatedState.chat.turns[0]?.text, "Stored repair context");

  runtime.dispose();
});

void test("repair-room persists session event and chat updates to room-local session JSON", async () => {
  const storedSession: RepairSession = {
    ...cloneJson(createTestRepairSession()),
    id: "repair-persist-session-updates",
    title: "Persist repair updates",
    updatedAt: "2026-06-13T11:00:00.000Z",
  };
  const storage = createMemoryRepairStorage([createStoredRepairRecord(storedSession)]);
  const runtime = createRepairRoomHostRuntime({
    autoHydrateStorage: false,
    initialSeed: {
      activeSessionId: storedSession.id,
      sessionList: [toStoredSessionListItem(storedSession)],
      sessions: { [storedSession.id]: storedSession },
    },
    io: createMemoryRepairIo(),
    storage,
  }).activate({
    log: () => {},
    notifyRoom: () => {},
    dispatchBridge: () => ({
      success: true,
      reply: {
        text: JSON.stringify({
          replyText: "Stored AI reply",
          contextRefs: ["stored-ref"],
        }),
      },
    }),
    getLocale: () => "en",
  });

  await runtime.hydrateStorage();

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.addMeasurement, {
      xPx: 712,
      yPx: 304,
      rawDisplay: "0.421",
      reference: "Persisted TP",
    }).success,
    true
  );
  await runtime.flushStorage();

  let saved = storage.readRecord(storedSession.id);
  assert.equal(
    saved?.session.events.some(
      (event) => event.kind === "measurement" && event.reference === "Persisted TP"
    ),
    true
  );

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.sendChatTurn, { text: "Persist this chat" }).success,
    true
  );
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  await runtime.flushStorage();

  saved = storage.readRecord(storedSession.id);
  assert.equal(
    saved?.chatTurns.some((turn) => turn.text === "Persist this chat"),
    true
  );
  assert.equal(
    saved.chatTurns.some((turn) => turn.text === "Stored AI reply"),
    true
  );

  runtime.dispose();
});

void test("repair-room measurements can promote Assistant AI observations into canonical events", async () => {
  const dispatchCalls: Record<string, unknown>[] = [];
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
    dispatchBridge: (payload: Record<string, unknown>) => {
      dispatchCalls.push(payload);
      const page = (payload["payload"] as Record<string, unknown> | undefined)?.["page"];
      if (page === "repair-room:assistant-risk-scan") {
        return {
          success: true,
          reply: { text: JSON.stringify({ risks: [] }) },
        };
      }
      return {
        success: true,
        reply: {
          text: JSON.stringify({
            observations: [
              {
                kind: "risk",
                text: "Discharge the primary bulk cap before touching this region.",
                region: { xPx: 360, yPx: 180, widthPx: 180, heightPx: 140 },
                linkedMeasurementIds: [],
              },
              {
                kind: "suggestion",
                text: "Compare this probe result with the standby rail before rework.",
                linkedEventIds: [],
              },
            ],
          }),
        },
      };
    },
    getLocale: () => "en",
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.addMeasurement, {
      xPx: 712,
      yPx: 304,
      rawDisplay: "0.002",
      reference: "AI TEST U14 VCC",
    }).success,
    true
  );
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(dispatchCalls.length, 2);
  assert.equal(dispatchCalls[0]?.["action"], "message.sendWait");
  assert.equal(dispatchCalls[0]["toSlot"], "ai2");
  const payload = dispatchCalls[0]["payload"] as Record<string, unknown> | undefined;
  const protocol = payload?.["protocol"] as Record<string, unknown> | undefined;
  assert.equal(payload?.["page"], "repair-room:assistant-observation");
  assert.equal(protocol?.["protocolKey"], "repair-room-assistant-observation");
  assert.match(String(payload["text"]), /repair-room-assistant-observation/);

  const state = runtime.getStateSnapshot().state;
  const session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  const generatedRisk = session.events.find(
    (event) =>
      event.kind === "risk-flag" &&
      event.message === "Discharge the primary bulk cap before touching this region."
  );
  const generatedMark = session.events.find(
    (event) =>
      event.kind === "ai-mark" &&
      event.rationale === "Compare this probe result with the standby rail before rework."
  );
  const measurement = session.events.find(
    (event) => event.kind === "measurement" && event.reference === "AI TEST U14 VCC"
  );
  assert.ok(measurement);
  assert.ok(generatedRisk);
  assert.ok(generatedMark);
  if (generatedRisk.kind === "risk-flag" && generatedMark.kind === "ai-mark") {
    assert.equal(generatedRisk.linkedMeasurementIds?.includes(measurement.id), true);
    assert.equal(generatedMark.linkedMeasurementIds?.includes(measurement.id), true);
    assert.equal(generatedMark.protocolKey, "repair-room-assistant-observation");
  }
  assert.equal(
    state.tacticalFeed.some((item) => item.eventId === generatedRisk.id),
    true
  );
  assert.equal(state.aiDispatch.status, "succeeded");
  assert.equal(state.aiDispatch.activity, "risk-scan");
  assert.equal(state.aiDispatch.targetSlot, "ai2");

  runtime.dispose();
});

void test("repair-room tactical bridge accepts content-backed top-level observation arrays", async () => {
  const dispatchCalls: Record<string, unknown>[] = [];
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
    dispatchBridge: (payload: Record<string, unknown>) => {
      dispatchCalls.push(payload);
      const page = (payload["payload"] as Record<string, unknown> | undefined)?.["page"];
      if (page === "repair-room:assistant-risk-scan") {
        return {
          success: true,
          reply: { text: JSON.stringify({ risks: [] }) },
        };
      }
      return {
        success: true,
        reply: {
          content: `Here is the tactical pass:\n\n\`\`\`json\n[\n  {\n    "severity": "warning",\n    "message": "Confirm isolation before probing primary-side rails.",\n    "linkedMeasurementIds": []\n  }\n]\n\`\`\``,
        },
      };
    },
    getLocale: () => "en",
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.addMeasurement, {
      xPx: 618,
      yPx: 286,
      rawDisplay: "380.0",
      reference: "AI ARRAY BULK_DC",
      unit: "V",
    }).success,
    true
  );
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(dispatchCalls.length, 2);
  assert.equal(dispatchCalls[0]?.["toSlot"], "ai2");

  const state = runtime.getStateSnapshot().state;
  const session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  const measurement = session.events.find(
    (event) => event.kind === "measurement" && event.reference === "AI ARRAY BULK_DC"
  );
  const generatedRisk = session.events.find(
    (event) =>
      event.kind === "risk-flag" &&
      event.message === "Confirm isolation before probing primary-side rails."
  );
  assert.ok(measurement);
  assert.ok(generatedRisk);
  if (generatedRisk.kind === "risk-flag") {
    assert.equal(generatedRisk.linkedMeasurementIds?.includes(measurement.id), true);
  }
  assert.equal(state.aiDispatch.status, "succeeded");
  assert.equal(state.aiDispatch.activity, "risk-scan");

  runtime.dispose();
});

void test("repair-room Phase 3 arbitrates one calm guidance surface per profile", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });

  let state = runtime.getStateSnapshot().state;
  let session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  let projection = createRepairReplayProjection(state, session);
  assert.equal(projection.guidance.operationalProfile, "novice");
  assert.equal(projection.guidance.panelVisibility.primarySurface, "measurement");
  assert.equal(projection.guidance.panelVisibility.panels["tactical-feed"], "compact");
  assert.equal(projection.guidance.panelVisibility.panels["session-wizard"], "compact");
  assert.equal(projection.guidance.panelVisibility.tacticalFeedDensity, "compact");

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.setOperationalProfile, { profile: "advanced" })
      .success,
    true
  );
  state = runtime.getStateSnapshot().state;
  session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  projection = createRepairReplayProjection(state, session);
  assert.equal(projection.guidance.operationalProfile, "advanced");
  assert.equal(projection.guidance.overlaySaturation.maxVisibleRelationships, 12);
  assert.equal(projection.guidance.overlaySaturation.labelMode, "full");
  assert.equal(projection.guidance.panelVisibility.panels["tactical-feed"], "compact");
  assert.equal(projection.guidance.panelVisibility.panels["session-wizard"], "compact");

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.advanceWizard, { step: "device-info" }).success,
    true
  );
  state = runtime.getStateSnapshot().state;
  session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  projection = createRepairReplayProjection(state, session);
  assert.equal(projection.guidance.panelVisibility.primarySurface, "session-wizard");
  assert.equal(projection.guidance.panelVisibility.panels["session-wizard"], "compact");
  assert.equal(projection.guidance.panelVisibility.panels["tactical-feed"], "compact");

  runtime.dispose();
});

void test("repair-room Phase 3 projects confidence, recovery, saturation, and voice hooks", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.setVoiceGuidance, {
      ambientListeningState: "listening",
      spokenGuidanceMode: "brief",
      handsBusyMode: true,
    }).success,
    true
  );
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.focusKnowledgeSpatialRef, {
      spatialRefId: "startup-resistor-open",
    }).success,
    true
  );
  const state = runtime.getStateSnapshot().state;
  const session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  const projection = createRepairReplayProjection(state, session);

  assert.equal(projection.guidance.aiInterruption.confidence, "high");
  assert.equal(projection.guidance.aiInterruption.urgency, "high");
  assert.equal(projection.guidance.aiInterruption.evidenceDepth, "strong");
  assert.equal(projection.guidance.recovery.currentFocus, "Startup resistor open");
  assert.match(projection.guidance.recovery.whyThisRegionMatters, /measurement evidence/);
  assert.ok(projection.guidance.overlaySaturation.clutterScore > 0);
  assert.ok(
    projection.guidance.overlaySaturation.visibleRelationshipIds.length <=
      projection.guidance.overlaySaturation.maxVisibleRelationships
  );
  assert.deepEqual(projection.guidance.voice.voiceFocusTarget, {
    kind: "knowledge-region",
    id: "startup-resistor-open",
  });
  assert.equal(projection.guidance.voice.ambientListeningState, "listening");
  assert.equal(projection.guidance.voice.handsBusyMode, true);
  assert.equal(projection.guidance.voice.spokenGuidanceMode, "step-by-step");
  assert.equal(projection.guidance.focusCorridor.active, true);
  assert.equal(projection.guidance.focusCorridor.targetRef?.kind, "knowledge-region");
  assert.equal(
    projection.guidance.overlaySaturation.visibleRegionRefs.length <=
      projection.guidance.overlaySaturation.maxVisibleRegions,
    true
  );
  assert.equal(
    projection.guidance.overlaySaturation.visibleEventIds.length <=
      projection.guidance.overlaySaturation.maxSimultaneousHighlights,
    true
  );
  assert.equal(
    projection.guidance.overlaySaturation.activeAttentionRefs.length <=
      projection.guidance.overlaySaturation.maxSimultaneousHighlights,
    true
  );
  assert.equal(
    projection.guidance.rhythm.lifecycle[projection.guidance.rhythm.currentIndex],
    "verify"
  );

  runtime.dispose();
});

void test("repair-room updates room-local hands-free interaction settings", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.setInteractionSettings, {
      androidCompanionEnabled: false,
      dictationRoute: "android",
      ttsRoute: "android",
      cameraFeedPreference: "android-feed",
      dictationSubmitMode: "send",
      autoReadAiReplies: false,
    }).success,
    true
  );
  assert.deepEqual(runtime.getStateSnapshot().state.layout.interactionSettings, {
    androidCompanionEnabled: false,
    dictationRoute: "android",
    ttsRoute: "android",
    cameraFeedPreference: "android-feed",
    dictationSubmitMode: "send",
    autoReadAiReplies: false,
  });

  const invalid = runtime.handleCommand(REPAIR_UI_COMMANDS.setInteractionSettings, {
    dictationRoute: "cloud",
  });
  assert.equal(invalid.success, false);
  assert.equal(
    runtime.getStateSnapshot().state.layout.interactionSettings.dictationRoute,
    "android"
  );

  runtime.dispose();
});
