import test from "node:test";
import assert from "node:assert/strict";
import createRepairRoomHostRuntimeBase from "../../rooms/repair-room/host/runtime.ts";
import { createRepairReplayProjection } from "../../rooms/repair-room/host/state/repair-replay-projection.ts";
import {
  REPAIR_UI_COMMANDS,
} from "../../rooms/repair-room/shared/repair-constants.ts";
import {
  REPAIR_ACTION_REGISTRY,
  getRepairVoiceCommandPhraseMap,
} from "../../rooms/repair-room/shared/repair-action-registry.ts";
import type {
  RepairSession,
} from "../../rooms/repair-room/shared/types/index.ts";
import type { OperationsStatus } from "../../src/types/operations.ts";
import {
  createTestRepairRuntimeSeed,
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


void test("repair-room Phase 2.8 folds investigation regions from canonical replay events", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  const state = runtime.getStateSnapshot().state;
  const session = state.sessions["psu-2025-0510"];
  assert.ok(session);

  const regionSession = {
    ...session,
    events: [
      ...session.events,
      {
        kind: "investigation-region-created" as const,
        id: "evt-region-create-1",
        sessionId: session.id,
        occurredAt: "2026-05-10T10:43:00.000Z",
        source: "operator" as const,
        linkedEventIds: ["evt-psu-meas-4"],
        regionId: "region-u14-chain",
        label: "U14 gate-driver chain",
        region: { xPx: 440, yPx: 245, widthPx: 140, heightPx: 110 },
        status: "active" as const,
        color: "rgb(86, 200, 222)",
        sourceRef: { kind: "event" as const, id: "evt-psu-ai-2" },
        measurementEventIds: ["evt-psu-meas-3", "evt-psu-meas-4"],
        annotationEventIds: ["evt-psu-anno-1"],
        aiMarkEventIds: ["evt-psu-ai-2"],
      },
      {
        kind: "investigation-region-updated" as const,
        id: "evt-region-update-1",
        sessionId: session.id,
        occurredAt: "2026-05-10T10:44:00.000Z",
        source: "operator" as const,
        linkedEventIds: ["evt-psu-meas-4"],
        regionId: "region-u14-chain",
        label: "U14 chain resolved",
        status: "resolved" as const,
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
          playheadMs: 30 * 60 * 1000,
          autoFollowLive: false,
        },
      },
    },
    regionSession
  );

  assert.equal(projection.investigationRegions.length, 1);
  assert.equal(projection.investigationRegions[0]?.regionId, "region-u14-chain");
  assert.equal(projection.investigationRegions[0].createdEventId, "evt-region-create-1");
  assert.equal(projection.investigationRegions[0].updatedEventId, "evt-region-update-1");
  assert.equal(projection.investigationRegions[0].status, "resolved");
  assert.deepEqual(projection.investigationRegions[0].linkage.measurementEventIds, [
    "evt-psu-meas-3",
    "evt-psu-meas-4",
  ]);
});

void test("repair-room Phase 2.8 keeps investigation mode explicit and entity refs commandable", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.toggleInvestigationMode, { enabled: true }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.workbench.investigationModeEnabled, true);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.selectOverlayEntities, {
      refs: [
        { kind: "event", id: "evt-psu-meas-3" },
        { kind: "knowledge-region", id: "startup-resistor-open" },
      ],
      mode: "replace",
    }).success,
    true
  );
  assert.deepEqual(runtime.getStateSnapshot().state.workbench.selection.selectedEventIds, [
    "evt-psu-meas-3",
  ]);
  assert.deepEqual(runtime.getStateSnapshot().state.workbench.selection.selectedEntityRefs, [
    { kind: "event", id: "evt-psu-meas-3" },
    { kind: "knowledge-region", id: "startup-resistor-open" },
  ]);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.focusOverlayEntity, {
      ref: { kind: "live-edge", id: "live-edge" },
    }).success,
    true
  );
  assert.equal(
    runtime.getStateSnapshot().state.workbench.selection.inspectorEntityRef?.kind,
    "live-edge"
  );
});

void test("repair-room Phase 2.8 focuses investigation regions, relationships, and live edge explicitly", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.promoteKnowledgeRegion, {
      spatialRefId: "startup-resistor-open",
    }).success,
    true
  );
  let state = runtime.getStateSnapshot().state;
  let session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  const regionEvent = session.events.find(
    (event) =>
      event.kind === "investigation-region-created" &&
      event.knowledgeSpatialRefId === "startup-resistor-open"
  );
  assert.ok(regionEvent);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.focusInvestigationRegion, {
      regionId: (regionEvent as { regionId: string }).regionId,
    }).success,
    true
  );
  state = runtime.getStateSnapshot().state;
  session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  let projection = createRepairReplayProjection(state, session);
  assert.equal(state.workbench.investigationModeEnabled, true);
  assert.deepEqual(state.workbench.selection.inspectorEntityRef, {
    kind: "investigation-region",
    id: (regionEvent as { regionId: string }).regionId,
  });
  assert.deepEqual(projection.activeSpatialFocus?.ref, {
    kind: "investigation-region",
    id: (regionEvent as { regionId: string }).regionId,
  });
  assert.deepEqual(
    [
      ...new Set(projection.measurementRelationships.map((relationship) => relationship.kind)),
    ].sort(),
    ["investigation-group", "linked-ai-mark", "linked-annotation", "previous-event", "rail"]
  );

  const relationship = projection.measurementRelationships[0];
  assert.ok(relationship);
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.focusOverlayEntity, {
      ref: { kind: "measurement-relationship", id: relationship.id },
    }).success,
    true
  );
  state = runtime.getStateSnapshot().state;
  session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  projection = createRepairReplayProjection(state, session);
  assert.deepEqual(projection.activeSpatialFocus?.ref, {
    kind: "measurement-relationship",
    id: relationship.id,
  });
  assert.ok(projection.activeSpatialFocus.region);
  assert.deepEqual(
    projection.activeSpatialFocus.relatedMeasurementIds,
    relationship.eventIds.filter((eventId) => {
      const linked = (session as RepairSession).events.find((event) => event.id === eventId);
      return linked?.kind === "measurement";
    })
  );

  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.focusLiveEdge).success, true);
  state = runtime.getStateSnapshot().state;
  session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  projection = createRepairReplayProjection(state, session);
  assert.equal(state.workbench.timeline.replayMode, "live");
  assert.equal(state.workbench.timeline.autoFollowLive, true);
  assert.equal(state.workbench.investigationModeEnabled, false);
  assert.equal(state.workbench.selection.inspectorEntityRef, null);
  assert.equal(projection.activeSpatialFocus, null);
  assert.equal(projection.guidance.focusCorridor.active, false);
});

void test("repair-room Phase 2.8 separates temporary knowledge focus from promoted regions", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.focusKnowledgeSpatialRef, {
      spatialRefId: "startup-resistor-open",
    }).success,
    true
  );
  let state = runtime.getStateSnapshot().state;
  let session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  let projection = createRepairReplayProjection(state, session);
  assert.equal(
    session.events.some((event) => event.kind === "investigation-region-created"),
    false
  );
  assert.equal(
    projection.temporarySpatialRegions[0]?.knowledgeSpatialRefId,
    "startup-resistor-open"
  );

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.promoteKnowledgeRegion, {
      spatialRefId: "startup-resistor-open",
    }).success,
    true
  );
  state = runtime.getStateSnapshot().state;
  session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  projection = createRepairReplayProjection(state, session);
  assert.equal(
    session.events.some(
      (event) =>
        event.kind === "investigation-region-created" &&
        event.knowledgeSpatialRefId === "startup-resistor-open"
    ),
    true
  );
  const promotedRegionEvent = session.events.find(
    (event) =>
      event.kind === "investigation-region-created" &&
      event.knowledgeSpatialRefId === "startup-resistor-open"
  );
  assert.equal(promotedRegionEvent?.kind, "investigation-region-created");
  assert.deepEqual(promotedRegionEvent.measurementEventIds, ["evt-psu-meas-2"]);
  assert.deepEqual(promotedRegionEvent.annotationEventIds, ["evt-psu-anno-2"]);
  assert.deepEqual(promotedRegionEvent.aiMarkEventIds, ["evt-psu-ai-1"]);
  assert.equal(promotedRegionEvent.linkedEventIds.includes("evt-psu-anno-2"), true);
  assert.equal(projection.investigationRegions[0]?.knowledgeSpatialRefId, "startup-resistor-open");
});

void test("repair-room Phase 2.8 keyboard nudging moves event-backed and canonical region refs", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  let state = runtime.getStateSnapshot().state;
  let session = state.sessions["psu-2025-0510"];
  assert.ok(session);
  const measurement = session.events.find((event) => event.kind === "measurement");
  assert.ok(measurement);
  assert.ok(measurement.pinAt);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.selectOverlayEntities, {
      refs: [{ kind: "event", id: measurement.id }],
      mode: "replace",
    }).success,
    true
  );
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateFocus, {
      nudgeDelta: { xPx: 6, yPx: -3 },
    }).success,
    true
  );
  session = runtime.getStateSnapshot().state.sessions["psu-2025-0510"];
  const nudgedMeasurement = session?.events.find((event) => event.id === measurement.id);
  assert.equal(nudgedMeasurement?.kind, "measurement");
  assert.deepEqual(nudgedMeasurement.pinAt, {
    xPx: measurement.pinAt.xPx + 6,
    yPx: measurement.pinAt.yPx - 3,
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.promoteKnowledgeRegion, {
      spatialRefId: "startup-resistor-open",
    }).success,
    true
  );
  state = runtime.getStateSnapshot().state;
  session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  let projection = createRepairReplayProjection(state, session);
  const region = projection.investigationRegions[0];
  assert.ok(region);
  const beforeRegion = region.region;

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.selectOverlayEntities, {
      refs: [{ kind: "investigation-region", id: region.regionId }],
      mode: "replace",
    }).success,
    true
  );
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateFocus, {
      nudgeDelta: { xPx: 10, yPx: 5 },
    }).success,
    true
  );
  state = runtime.getStateSnapshot().state;
  session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  const updateEvent = session.events.at(-1);
  assert.equal(updateEvent?.kind, "investigation-region-updated");
  assert.equal(updateEvent.regionId, region.regionId);
  assert.deepEqual(updateEvent.region, {
    ...beforeRegion,
    xPx: beforeRegion.xPx + 10,
    yPx: beforeRegion.yPx + 5,
  });
  projection = createRepairReplayProjection(state, session);
  assert.deepEqual(projection.investigationRegions[0]?.region, {
    ...beforeRegion,
    xPx: beforeRegion.xPx + 10,
    yPx: beforeRegion.yPx + 5,
  });
});

void test("repair-room overlay selection supports hover, multi-select, deselect, and focus jump", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  const session = runtime.getStateSnapshot().state.sessions["psu-2025-0510"];
  assert.ok(session);
  const first = session.events.find((event) => event.kind === "annotation");
  const second = session.events.find((event) => event.kind === "measurement");
  assert.ok(first);
  assert.ok(second);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateFocus, { hoveredEventId: first.id }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.workbench.selection.hoveredEventId, first.id);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateFocus, {
      eventId: first.id,
      selectionMode: "replace",
      focusJump: true,
      jumpToEvent: true,
    }).success,
    true
  );
  assert.deepEqual(runtime.getStateSnapshot().state.workbench.selection.selectedEventIds, [
    first.id,
  ]);
  assert.equal(runtime.getStateSnapshot().state.workbench.focusedEventId, first.id);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateFocus, {
      eventId: second.id,
      selectionMode: "toggle",
      focusJump: false,
    }).success,
    true
  );
  assert.deepEqual(runtime.getStateSnapshot().state.workbench.selection.selectedEventIds, [
    first.id,
    second.id,
  ]);
  assert.equal(runtime.getStateSnapshot().state.workbench.selection.inspectorEventId, second.id);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.updateFocus, { clearSelection: true }).success,
    true
  );
  assert.deepEqual(runtime.getStateSnapshot().state.workbench.selection.selectedEventIds, []);
  assert.equal(runtime.getStateSnapshot().state.workbench.focusedEventId, null);
  assert.equal(runtime.getStateSnapshot().state.workbench.selection.hoveredEventId, null);
});

void test("repair-room AI mark lifecycle changes append canonical replay events", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  const session = runtime.getStateSnapshot().state.sessions["psu-2025-0510"];
  assert.ok(session);
  const target = session.events.find((event) => event.id === "evt-psu-ai-2");
  assert.ok(target);
  assert.equal(target.kind, "ai-mark");

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.dismissAiMark, {
      eventId: target.id,
      state: "dismissed",
      reason: "Operator dismissed duplicate observation.",
    }).success,
    true
  );

  const nextSession = runtime.getStateSnapshot().state.sessions["psu-2025-0510"];
  const lifecycle = nextSession?.events.at(-1);
  assert.equal(lifecycle?.kind, "ai-mark-lifecycle");
  assert.equal(lifecycle.targetEventId, target.id);
  assert.equal(lifecycle.state, "dismissed");
  assert.equal(lifecycle.linkedEventIds.includes(target.id), true);
  const baseTarget = nextSession?.events.find((event) => event.id === target.id);
  assert.equal(baseTarget?.kind, "ai-mark");
  assert.equal(baseTarget.dismissed, false);

  const liveProjection = createRepairReplayProjection(
    runtime.getStateSnapshot().state,
    nextSession ?? null
  );
  assert.equal(liveProjection.aiMarkEventIds.includes(target.id), false);
  assert.equal(
    liveProjection.overlayEvents.some((event) => event.id === target.id),
    false
  );

  const targetOffset = Date.parse(target.occurredAt) - Date.parse(session.startedAt);
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.scrubTimeline, { positionMs: targetOffset }).success,
    true
  );
  const restoredProjection = createRepairReplayProjection(
    runtime.getStateSnapshot().state,
    runtime.getStateSnapshot().state.sessions["psu-2025-0510"] ?? null
  );
  assert.equal(restoredProjection.aiMarkEventIds.includes(target.id), true);
});

void test("repair-room opens the existing active session without replaying research setup", (t) => {
  t.mock.timers.enable({
    apis: ["Date", "setInterval", "setTimeout"],
    now: new Date("2026-05-11T09:00:00.000Z"),
  });
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });

  assert.equal(runtime.getStateSnapshot().state.wizard.currentStep, "device-info");
  assert.equal(runtime.getStateSnapshot().state.wizard.generatedKnowledgePackId, null);
  assert.equal(runtime.getStateSnapshot().state.wizard.researchProgress.length, 0);

  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.uiReady).success, true);
  t.mock.timers.tick(4000);

  const wizard = runtime.getStateSnapshot().state.wizard;
  assert.equal(wizard.currentStep, "device-info");
  assert.equal(wizard.foundResources.length, 0);
  assert.equal(wizard.researchProgress.length, 0);

  runtime.dispose();
  t.mock.timers.reset();
});

void test("repair-room live ambient tick does not advance the moment strip playhead", (t) => {
  t.mock.timers.enable({
    apis: ["Date", "setInterval", "setTimeout"],
    now: new Date("2026-05-11T09:00:00.000Z"),
  });
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  const before = runtime.getStateSnapshot().state.workbench.timeline.playheadMs;

  assert.equal(runtime.handleCommand(REPAIR_UI_COMMANDS.uiReady).success, true);
  t.mock.timers.tick(1100);

  const after = runtime.getStateSnapshot().state.workbench.timeline.playheadMs;
  assert.equal(after, before);

  runtime.dispose();
  t.mock.timers.reset();
});

void test("repair-room runtime records manual readings into recent instrument history", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  const before = runtime.getStateSnapshot().state.measurement.recent.length;

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.addMeasurement, {
      rawDisplay: "3.300",
      value: 3.3,
      unit: "V",
      mode: "dc-voltage",
      range: "20 V",
      channel: "COM/V",
      reference: "TP1 VCC",
    }).success,
    true
  );

  const measurement = runtime.getStateSnapshot().state.measurement;
  assert.equal(measurement.recent.length, before + 1);
  assert.equal(measurement.recent[0]?.reference, "TP1 VCC");
  assert.equal(measurement.recent[0]?.rawDisplay, "3.300");
  assert.equal(measurement.recent[0]?.unit, "V");
  assert.equal(measurement.current.display, "3.300");
  assert.equal(measurement.current.value, 3.3);
  assert.equal(measurement.current.unit, "V");
  assert.equal(measurement.current.range, "20 V");
  assert.equal(measurement.current.mode, "dc-voltage");
  assert.equal(measurement.current.label, "TP1 VCC");
  runtime.dispose();
});

void test("repair-room new evidence exits history review and links to the latest snapshot", (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-05-11T09:05:00.000Z"),
  });
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.jumpToEvent, { eventId: "evt-psu-meas-2" }).success,
    true
  );
  assert.equal(runtime.getStateSnapshot().state.workbench.timeline.autoFollowLive, false);
  assert.equal(runtime.getStateSnapshot().state.workbench.investigationModeEnabled, true);

  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.addMeasurement, {
      rawDisplay: "1.240",
      value: 1.24,
      unit: "V",
      mode: "dc-voltage",
      range: "20 V",
      channel: "COM/V",
      reference: "Live TP after history review",
    }).success,
    true
  );

  const state = runtime.getStateSnapshot().state;
  const session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  const event = session.events.at(-1);
  assert.equal(event?.kind, "measurement");
  assert.equal(event?.occurredAt, "2026-05-11T09:05:00.000Z");
  assert.equal(state.workbench.timeline.autoFollowLive, true);
  assert.equal(state.workbench.timeline.replayMode, "live");
  assert.equal(state.workbench.focusedEventId, null);
  assert.equal(state.workbench.investigationModeEnabled, false);
  assert.deepEqual(state.workbench.selection.selectedEventIds, []);
  assert.deepEqual(state.workbench.selection.selectedEntityRefs, []);
  assert.ok(event?.linkedEventIds.includes("evt-psu-snap-2"));

  runtime.dispose();
  t.mock.timers.reset();
});



void test("repair-room P3.5 keeps operations projection optional for standalone room runs", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  const state = runtime.getStateSnapshot().state;
  const session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);

  const projection = createRepairReplayProjection(state, session);
  assert.equal(projection.operationsAvailable, false);
  assert.deepEqual(projection.operations.activeCapabilities, []);
  assert.equal(projection.operations.localMicActive, false);
  assert.equal(projection.voiceReadiness.available, false);
  assert.deepEqual(projection.liveSource, {
    available: true,
    connected: false,
    sourceType: "image",
  });

  runtime.dispose();
});

void test("repair-room P3.5 starts operations bridge and pushes live camera status", async () => {
  const notifications: Array<{ type: string; payload: Record<string, unknown> | undefined }> = [];
  const subscribers: Array<(status: OperationsStatus) => void> = [];
  let unsubscribed = false;
  const initialStatus: OperationsStatus = {
    updatedAt: 0,
    records: [],
  };
  const liveStatus: OperationsStatus = {
    updatedAt: 1,
    records: [
      {
        capability: "android-camera",
        owner: { id: "repair-room", label: "Repair Room", roomId: "repair-room" },
        startedAt: 1,
      },
      {
        capability: "live-feed",
        owner: { id: "repair-room", label: "Repair Room", roomId: "repair-room" },
        startedAt: 2,
      },
    ],
  };

  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: (type, payload) => {
      notifications.push({ type, payload });
    },
    operations: {
      getStatus: () => initialStatus,
      subscribe: (listener: (status: OperationsStatus) => void) => {
        subscribers.push(listener);
        return () => {
          unsubscribed = true;
        };
      },
    },
  });

  await Promise.resolve();
  assert.equal(runtime.getStateSnapshot().state.operationsStatus?.updatedAt, 0);
  assert.equal(subscribers.length, 1);

  subscribers.at(-1)?.(liveStatus);
  const snapshot = runtime.getStateSnapshot().state;
  const session = snapshot.sessions[snapshot.activeSessionId ?? ""];
  assert.ok(session);
  const projection = createRepairReplayProjection(snapshot, session);
  assert.equal(projection.operationsAvailable, true);
  assert.equal(projection.operations.cameraActive, true);
  assert.equal(projection.operations.liveFeedActive, true);
  assert.deepEqual(projection.liveSource, {
    available: true,
    connected: true,
    sourceType: "android-camera",
    preview: null,
  });
  assert.ok(notifications.some((entry) => entry.type === "repair-state"));

  runtime.dispose();
  assert.equal(unsubscribed, true);
});

void test("repair-room P3.5 projects central operations status without owning capabilities", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  const state = runtime.getStateSnapshot().state;
  const session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);

  const projection = createRepairReplayProjection(
    {
      ...state,
      operationsStatus: {
        updatedAt: 1,
        records: [
          {
            capability: "local-microphone",
            owner: { id: "repair-room", label: "Repair Room", roomId: "repair-room" },
            startedAt: 1,
          },
          {
            capability: "android-camera",
            owner: { id: "repair-room", label: "Repair Room", roomId: "repair-room" },
            startedAt: 2,
          },
          {
            capability: "live-feed",
            owner: { id: "repair-room", label: "Repair Room", roomId: "repair-room" },
            startedAt: 3,
          },
          {
            capability: "ambient-listening",
            owner: { id: "repair-room", label: "Repair Room", roomId: "repair-room" },
            startedAt: 4,
          },
          {
            capability: "local-tts",
            owner: { id: "repair-room", label: "Repair Room", roomId: "repair-room" },
            startedAt: 5,
          },
        ],
      },
    },
    session
  );

  assert.equal(projection.operationsAvailable, true);
  assert.equal(projection.operations.localMicActive, true);
  assert.equal(projection.operations.androidMicActive, false);
  assert.equal(projection.operations.cameraActive, true);
  assert.equal(projection.operations.liveFeedActive, true);
  assert.equal(projection.operations.ambientActive, true);
  assert.equal(projection.operations.ttsActive, true);
  assert.equal(projection.operations.activeOwner, "Repair Room");
  assert.deepEqual(projection.liveSource, {
    available: true,
    connected: true,
    sourceType: "android-camera",
    preview: null,
  });

  runtime.dispose();
});

void test("repair-room P3.5 projects voice readiness from operations and guidance state", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.setVoiceGuidance, {
      ambientListeningState: "listening",
      handsBusyMode: true,
    }).success,
    true
  );

  const state = runtime.getStateSnapshot().state;
  const session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  const projection = createRepairReplayProjection(
    {
      ...state,
      operationsStatus: {
        updatedAt: 2,
        records: [
          {
            capability: "android-microphone",
            owner: { id: "repair-room", label: "Repair Room" },
            startedAt: 10,
          },
          {
            capability: "ambient-listening",
            owner: { id: "repair-room", label: "Repair Room" },
            startedAt: 11,
          },
        ],
      },
    },
    session
  );

  assert.deepEqual(projection.voiceReadiness, {
    available: true,
    listening: true,
    handsBusyMode: true,
    ambientMode: true,
  });

  runtime.dispose();
});

void test("repair-room P3.5 keeps live source extensible for future camera providers", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  const state = runtime.getStateSnapshot().state;
  const session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);

  const projection = createRepairReplayProjection(
    {
      ...state,
      operationsStatus: {
        updatedAt: 3,
        records: [
          {
            capability: "thermal-camera",
            owner: { id: "scope", label: "Thermal scope" },
            startedAt: 20,
          },
          {
            capability: "live-feed",
            owner: { id: "scope", label: "Thermal scope" },
            startedAt: 21,
          },
        ],
      },
    },
    session
  );

  assert.equal(projection.operations.cameraActive, true);
  assert.deepEqual(projection.liveSource, {
    available: true,
    connected: true,
    sourceType: "thermal-camera",
    preview: null,
  });

  runtime.dispose();
});

void test("repair-room P3.5 action registry carries reusable disabled metadata", () => {
  const requiredIds = [
    "focus-measurement",
    "focus-ai-mark",
    "next-event",
    "previous-event",
    "take-snapshot",
    "start-measurement",
    "verify-region",
    "conclude-investigation",
  ];
  const ids = REPAIR_ACTION_REGISTRY.map((entry) => entry.id);
  assert.deepEqual(ids, requiredIds);
  assert.equal(new Set(ids).size, ids.length);

  const commandNames = new Set(Object.values(REPAIR_UI_COMMANDS));
  REPAIR_ACTION_REGISTRY.forEach((entry) => {
    assert.equal(entry.enabled, true, entry.id);
    assert.equal(commandNames.has(entry.commandName), true, entry.id);
    assert.ok(entry.label.length > 0, entry.id);
    assert.ok(
      typeof entry.category === "string" && entry.category.length > 0,
      entry.id
    );
  });

  const phraseMap = getRepairVoiceCommandPhraseMap();
  assert.ok(Object.keys(phraseMap).length > 0);
  const enabledPhraseMap = getRepairVoiceCommandPhraseMap([
    {
      ...REPAIR_ACTION_REGISTRY[0],
      enabled: true,
    },
    {
      ...REPAIR_ACTION_REGISTRY[5],
      enabled: true,
    },
  ]);
  assert.ok(enabledPhraseMap[REPAIR_UI_COMMANDS.focusOverlayEntity]?.includes("focus measurement") === true);
  assert.ok(enabledPhraseMap[REPAIR_UI_COMMANDS.addMeasurement]?.includes("start measurement") === true);

  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  }) as { voiceCommands?: Record<string, readonly string[]>; dispose: () => void };
  assert.ok(runtime.voiceCommands !== undefined && Object.keys(runtime.voiceCommands).length > 0);
  runtime.dispose();
});

void test("repair-room P3.5 projects continuity from focus, measurement, and verified regions", () => {
  const runtime = createRepairRoomHostRuntime().activate({
    log: () => {},
    notifyRoom: () => {},
  });
  assert.equal(
    runtime.handleCommand(REPAIR_UI_COMMANDS.focusKnowledgeSpatialRef, {
      spatialRefId: "startup-resistor-open",
    }).success,
    true
  );

  const state = runtime.getStateSnapshot().state;
  const session = state.sessions[state.activeSessionId ?? ""];
  assert.ok(session);
  const regionSession = {
    ...session,
    events: [
      ...session.events,
      {
        kind: "investigation-region-created" as const,
        id: "evt-continuity-region-create",
        sessionId: session.id,
        occurredAt: "2026-05-10T10:43:00.000Z",
        source: "operator" as const,
        linkedEventIds: ["evt-psu-meas-4"],
        regionId: "region-continuity",
        label: "Continuity verified region",
        region: { xPx: 440, yPx: 245, widthPx: 140, heightPx: 110 },
        status: "active" as const,
        color: "rgb(86, 200, 222)",
        sourceRef: { kind: "event" as const, id: "evt-psu-ai-2" },
        measurementEventIds: ["evt-psu-meas-4"],
      },
      {
        kind: "investigation-region-updated" as const,
        id: "evt-continuity-region-update",
        sessionId: session.id,
        occurredAt: "2026-05-10T10:44:00.000Z",
        source: "operator" as const,
        linkedEventIds: ["evt-psu-meas-4"],
        regionId: "region-continuity",
        label: "Continuity verified region",
        status: "resolved" as const,
      },
    ],
  };

  const projection = createRepairReplayProjection(state, regionSession);
  assert.deepEqual(projection.continuity.lastFocusTarget, {
    ref: { kind: "knowledge-region", id: "startup-resistor-open" },
    label: "Startup resistor open",
  });
  assert.equal(projection.continuity.lastMeasurement?.eventId, "evt-psu-meas-5");
  assert.deepEqual(projection.continuity.lastVerifiedRegion, {
    ref: { kind: "investigation-region", id: "region-continuity" },
    label: "Continuity verified region",
  });
  assert.equal(
    projection.continuity.currentInvestigationPhase,
    projection.guidance.investigationPhase
  );

  runtime.dispose();
});
