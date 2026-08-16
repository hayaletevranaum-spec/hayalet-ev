import { repairEventToTacticalFeedItem } from "../../shared/data/index.js";
import {
  REPAIR_MAIN_LAYOUT_PANEL_IDS,
  type RepairImagePoint,
  type RepairMainLayoutPanelId,
  type RepairOverlayEntityRef,
  type RepairPanelSizePatch,
  type RepairSession,
} from "../../shared/types/index.js";
import type { ReplayRuntimeController } from "../repair-replay-runtime.js";
import type { RepairRuntimeStore } from "../state/repair-runtime-store.js";
import { createRepairUiSnapshotMeta } from "../state/repair-selectors.js";
import { createInvestigationRegionUpdatedEvent } from "./event-factory.js";
import {
  isInstrumentKind,
  isOperatorProfileTab,
  isPanelId,
  safeImagePoint,
  safeNumber,
  safeOverlayEntityRef,
  safeOverlayEntityRefs,
  safeString,
  safeStringArray,
} from "./guards.js";
import type { RepairLiveController } from "./live-controller.js";
import {
  clampSessionPoint,
  clampWorkbenchPan,
  dedupeOverlayRefs,
  getEventIdFromOverlayRef,
  getEventNudgeCenter,
  getNudgeTargetDelta,
  moveSessionRect,
  refsEqual,
} from "./overlay-selection.js";
import type { RepairSessionController } from "./session-controller.js";
import { getActiveSession } from "./session-helpers.js";

export interface RepairLayoutController {
  applyFocusUpdate: (flat: Record<string, unknown>) => { success: boolean; message?: string };
  applyOverlayEntitySelection: (params: {
    refs: RepairOverlayEntityRef[];
    mode: string | null;
    inspectorRef: RepairOverlayEntityRef | null;
    focusJump: boolean;
  }) => void;
  applyPanelLayoutUpdate: (flat: Record<string, unknown>) => { success: boolean; message?: string };
  applyPanelTabUpdate: (flat: Record<string, unknown>) => { success: boolean; message?: string };
  applyTimelineUpdate: (flat: Record<string, unknown>) => { success: boolean; message?: string };
  applyViewportUpdate: (flat: Record<string, unknown>) => { success: boolean; message?: string };
}

export function createRepairLayoutController(params: {
  liveController: RepairLiveController;
  replayController: ReplayRuntimeController;
  sessionController: RepairSessionController;
  store: RepairRuntimeStore;
}): RepairLayoutController {
  const { liveController, replayController, sessionController, store } = params;

  function getLatestSnapshotEventId(session: RepairSession, iso: string): string | null {
    const occurredAtMs = Date.parse(iso);
    for (let index = session.events.length - 1; index >= 0; index -= 1) {
      const event = session.events[index];
      if (event?.kind !== "snapshot") continue;
      const eventAtMs = Date.parse(event.occurredAt);
      if (!Number.isFinite(occurredAtMs) || eventAtMs <= occurredAtMs) return event.id;
    }
    return null;
  }

  function appendLatestSnapshotLink(
    session: RepairSession,
    iso: string,
    linkedEventIds: string[]
  ): string[] {
    const snapshotEventId = getLatestSnapshotEventId(session, iso);
    return [
      ...new Set([...linkedEventIds, ...(snapshotEventId === null ? [] : [snapshotEventId])]),
    ];
  }

  function applyViewportUpdate(flat: Record<string, unknown>): {
    success: boolean;
    message?: string;
  } {
    const viewportZoom = safeNumber(flat["viewportZoom"] ?? flat["zoom"]);
    const panXPx = safeNumber(flat["panXPx"]);
    const panYPx = safeNumber(flat["panYPx"]);
    if (viewportZoom === null && panXPx === null && panYPx === null) {
      return { success: false, message: "viewport payload is empty" };
    }
    const viewport = store.getState().workbench.viewport;
    const nextZoom = Math.min(4, Math.max(0.5, viewportZoom ?? viewport.zoom));
    const nextPan = clampWorkbenchPan(
      panXPx ?? viewport.panXPx,
      panYPx ?? viewport.panYPx,
      nextZoom,
      getActiveSession(store.getState())
    );
    store.dispatch({
      type: "workbench/set-viewport",
      zoom: nextZoom,
      panXPx: nextPan.panXPx,
      panYPx: nextPan.panYPx,
    });
    return { success: true };
  }

  function applyTimelineUpdate(flat: Record<string, unknown>): {
    success: boolean;
    message?: string;
  } {
    const replayAction = safeString(flat["replayAction"]);
    if (replayAction === "play") {
      replayController.play();
      return { success: true };
    }
    if (replayAction === "pause") {
      replayController.pause();
      return { success: true };
    }
    if (replayAction === "live") {
      replayController.followLive();
      return { success: true };
    }
    const replaySpeed = safeNumber(flat["replaySpeed"]);
    if (replaySpeed !== null) {
      replayController.setSpeed(replaySpeed);
      return { success: true };
    }
    const timelineZoom = safeNumber(flat["timelineZoom"] ?? flat["zoom"]);
    const timelineRangeStartMs = safeNumber(flat["timelineRangeStartMs"] ?? flat["rangeStartMs"]);
    const timelineRangeEndMs = safeNumber(flat["timelineRangeEndMs"] ?? flat["rangeEndMs"]);
    const clearTimelineRange = flat["clearTimelineRange"] === true;
    if (
      timelineZoom === null &&
      timelineRangeStartMs === null &&
      timelineRangeEndMs === null &&
      clearTimelineRange === false
    ) {
      return { success: false, message: "timeline payload is empty" };
    }
    const timeline = store.getState().workbench.timeline;
    const rangeStartMs = clearTimelineRange
      ? null
      : (timelineRangeStartMs ?? timeline.rangeStartMs);
    const rangeEndMs = clearTimelineRange ? null : (timelineRangeEndMs ?? timeline.rangeEndMs);
    store.dispatch({
      type: "workbench/set-timeline",
      playheadMs: timeline.playheadMs,
      zoom: Math.min(4, Math.max(0.25, timelineZoom ?? timeline.zoom)),
      rangeStartMs,
      rangeEndMs,
      autoFollowLive: timeline.autoFollowLive,
    });
    return { success: true };
  }

  function isRecordValue(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function readPanelSizeRecord<PanelId extends string>(
    source: Record<string, unknown> | null,
    panelIds: readonly PanelId[]
  ): Partial<Record<PanelId, number>> | undefined {
    if (source === null) return undefined;
    const result: Partial<Record<PanelId, number>> = {};
    panelIds.forEach((panelId) => {
      const value = safeNumber(source[panelId]);
      if (value !== null) result[panelId] = value;
    });
    return Object.keys(result).length > 0 ? result : undefined;
  }

  function readRepairPanelSizePatch(flat: Record<string, unknown>): RepairPanelSizePatch | null {
    const source = isRecordValue(flat["panelSizes"]) ? flat["panelSizes"] : flat;
    const mainColumns = readPanelSizeRecord<RepairMainLayoutPanelId>(
      isRecordValue(source["mainColumns"]) ? source["mainColumns"] : null,
      REPAIR_MAIN_LAYOUT_PANEL_IDS
    );
    const panelSizes: RepairPanelSizePatch = {};
    if (mainColumns !== undefined) panelSizes.mainColumns = mainColumns;
    return Object.keys(panelSizes).length > 0 ? panelSizes : null;
  }

  function applyPanelLayoutUpdate(flat: Record<string, unknown>): {
    success: boolean;
    message?: string;
  } {
    const panelId = flat["panelId"];
    const collapsed = flat["collapsed"];
    let changed = false;
    if (isPanelId(panelId) && typeof collapsed === "boolean") {
      store.dispatch({ type: "layout/collapse-panel", panelId, collapsed });
      changed = true;
    }
    const panelSizes = readRepairPanelSizePatch(flat);
    if (panelSizes !== null) {
      store.dispatch({ type: "layout/set-panel-sizes", panelSizes });
      changed = true;
    }
    return changed
      ? { success: true }
      : { success: false, message: "panel layout payload is empty" };
  }

  function applyPanelTabUpdate(flat: Record<string, unknown>): {
    success: boolean;
    message?: string;
  } {
    const previewTabId = safeString(flat["previewTabId"]);
    if (
      previewTabId === "schematic-preview" ||
      previewTabId === "board-view" ||
      previewTabId === "notes"
    ) {
      store.dispatch({ type: "knowledge-pack/set-preview-tab", tabId: previewTabId });
      return { success: true };
    }
    const instrumentKind = flat["instrumentKind"];
    if (isInstrumentKind(instrumentKind)) {
      store.dispatch({ type: "measurement/set-instrument", instrumentKind });
      return { success: true };
    }
    const operatorProfileTabId = flat["operatorProfileTabId"];
    if (isOperatorProfileTab(operatorProfileTabId)) {
      store.dispatch({
        type: "layout/set-operator-profile-tab",
        tabId: operatorProfileTabId,
      });
      return { success: true };
    }
    const spatialRefId = safeString(flat["spatialRefId"]);
    if (spatialRefId !== null) {
      store.dispatchMany([
        { type: "knowledge-pack/set-spatial-focus", spatialRefId },
        { type: "knowledge-pack/set-preview-tab", tabId: "board-view" },
      ]);
      return { success: true };
    }
    return { success: false, message: "panel tab payload is empty" };
  }

  function applyOverlayEntitySelection(params: {
    refs: RepairOverlayEntityRef[];
    mode: string | null;
    inspectorRef: RepairOverlayEntityRef | null;
    focusJump: boolean;
  }): void {
    const current = store.getState().workbench.selection.selectedEntityRefs;
    const nextRefs =
      params.mode === "add"
        ? dedupeOverlayRefs([...current, ...params.refs])
        : params.mode === "toggle"
          ? params.refs.reduce<RepairOverlayEntityRef[]>((selection, ref) => {
              return selection.some((candidate) => refsEqual(candidate, ref))
                ? selection.filter((candidate) => !refsEqual(candidate, ref))
                : [...selection, ref];
            }, current)
          : dedupeOverlayRefs(params.refs);
    const inspectorRef = params.inspectorRef ?? params.refs.at(-1) ?? nextRefs.at(-1) ?? null;
    const selectedEventIds = nextRefs.filter((ref) => ref.kind === "event").map((ref) => ref.id);
    const inspectorEventId = getEventIdFromOverlayRef(inspectorRef);
    store.dispatch({
      type: "workbench/set-selection",
      focusedEventId: inspectorEventId,
      selection: {
        selectedEntityRefs: nextRefs,
        selectedEventIds,
        inspectorEntityRef: inspectorRef,
        inspectorEventId,
        focusJumpEntityRef: params.focusJump ? inspectorRef : null,
        focusJumpEventId: params.focusJump ? inspectorEventId : null,
      },
    });
  }

  function nudgeOverlaySelection(
    requestedDelta: RepairImagePoint,
    hardSnap: boolean
  ): { success: boolean; message?: string } {
    const state = store.getState();
    const session = getActiveSession(state);
    if (session === null) return { success: false, message: "active session is required" };
    const selectedRefs = state.workbench.selection.selectedEntityRefs;
    if (selectedRefs.length === 0) return { success: true };

    const selectedKeys = new Set(selectedRefs.map((ref) => `${ref.kind}:${ref.id}`));
    const replay = createRepairUiSnapshotMeta(state).replay;
    const snapTargets: Array<{ key: string; point: RepairImagePoint }> = [];
    session.events.forEach((event) => {
      const center = getEventNudgeCenter(event);
      if (center !== null) snapTargets.push({ key: `event:${event.id}`, point: center });
    });
    replay.investigationRegions.forEach((region) => {
      snapTargets.push({
        key: `investigation-region:${region.regionId}`,
        point: {
          xPx: region.region.xPx + region.region.widthPx / 2,
          yPx: region.region.yPx + region.region.heightPx / 2,
        },
      });
    });
    replay.knowledgeRegions.forEach((region) => {
      snapTargets.push({
        key: `knowledge-region:${region.id}`,
        point: {
          xPx: region.region.xPx + region.region.widthPx / 2,
          yPx: region.region.yPx + region.region.heightPx / 2,
        },
      });
    });

    const updatedEvents = session.events.map((event) => {
      const ref: RepairOverlayEntityRef = { kind: "event", id: event.id };
      if (!selectedKeys.has(`${ref.kind}:${ref.id}`)) return event;
      const center = getEventNudgeCenter(event);
      if (center === null) return event;
      const delta = getNudgeTargetDelta({
        center,
        requestedDelta,
        hardSnap,
        selectedKeys,
        snapTargets,
      });
      if (event.kind === "measurement" && event.pinAt !== null) {
        return {
          ...event,
          pinAt: clampSessionPoint(session, {
            xPx: event.pinAt.xPx + delta.xPx,
            yPx: event.pinAt.yPx + delta.yPx,
          }),
        };
      }
      if (event.kind === "annotation") {
        return {
          ...event,
          region: event.region === null ? null : moveSessionRect(session, event.region, delta),
          point:
            event.point === null
              ? null
              : clampSessionPoint(session, {
                  xPx: event.point.xPx + delta.xPx,
                  yPx: event.point.yPx + delta.yPx,
                }),
        };
      }
      return event;
    });

    const iso = liveController.createLiveSessionIso(session);
    const regionUpdates = selectedRefs.flatMap((ref) => {
      if (ref.kind !== "investigation-region") return [];
      const region = replay.investigationRegions.find((candidate) => candidate.regionId === ref.id);
      if (region === undefined) return [];
      const center = {
        xPx: region.region.xPx + region.region.widthPx / 2,
        yPx: region.region.yPx + region.region.heightPx / 2,
      };
      const delta = getNudgeTargetDelta({
        center,
        requestedDelta,
        hardSnap,
        selectedKeys,
        snapTargets,
      });
      return [
        createInvestigationRegionUpdatedEvent(session, iso, {
          regionId: region.regionId,
          region: moveSessionRect(session, region.region, delta),
          linkedEventIds: appendLatestSnapshotLink(session, iso, region.linkage.eventIds),
          measurementEventIds: region.linkage.measurementEventIds,
          annotationEventIds: region.linkage.annotationEventIds,
          aiMarkEventIds: region.linkage.aiMarkEventIds,
        }),
      ];
    });

    const eventsChanged = updatedEvents.some((event, index) => event !== session.events[index]);
    if (!eventsChanged && regionUpdates.length === 0) return { success: true };
    const nextSession: RepairSession = {
      ...session,
      events: [...updatedEvents, ...regionUpdates],
      updatedAt: iso,
    };
    store.batch(() => {
      sessionController.setSessionAndList(nextSession, { skipTransitionCheck: true });
      regionUpdates.forEach((event) => {
        const feedItem = repairEventToTacticalFeedItem(event, session.startedAt);
        if (feedItem !== null) {
          store.dispatch({ type: "tactical-feed/append", item: feedItem });
        }
      });
    });
    return { success: true };
  }

  function applyFocusUpdate(flat: Record<string, unknown>): {
    success: boolean;
    message?: string;
  } {
    let handled = false;

    if ("hoveredEntityRef" in flat) {
      const hoveredEntityRef = safeOverlayEntityRef(flat["hoveredEntityRef"]);
      store.dispatch({
        type: "workbench/set-selection",
        selection: {
          hoveredEntityRef,
          hoveredEventId: getEventIdFromOverlayRef(hoveredEntityRef),
        },
      });
      handled = true;
    }

    if ("hoveredEventId" in flat) {
      const hoveredEventId = safeString(flat["hoveredEventId"]);
      store.dispatch({
        type: "workbench/set-selection",
        selection: {
          hoveredEventId,
          hoveredEntityRef: hoveredEventId === null ? null : { kind: "event", id: hoveredEventId },
        },
      });
      handled = true;
    }

    if (flat["clearSelection"] === true || flat["deselect"] === true) {
      store.dispatch({
        type: "workbench/set-selection",
        focusedEventId: null,
        selection: {
          hoveredEventId: null,
          hoveredEntityRef: null,
          selectedEventIds: [],
          selectedEntityRefs: [],
          inspectorEventId: null,
          inspectorEntityRef: null,
          focusJumpEventId: null,
          focusJumpEntityRef: null,
        },
      });
      return { success: true };
    }

    const selectedEntityRefs = safeOverlayEntityRefs(flat["selectedEntityRefs"] ?? flat["refs"]);
    if (selectedEntityRefs !== null) {
      applyOverlayEntitySelection({
        refs: selectedEntityRefs,
        mode: safeString(flat["selectionMode"] ?? flat["mode"]),
        inspectorRef: safeOverlayEntityRef(flat["inspectorEntityRef"] ?? flat["inspectorRef"]),
        focusJump: flat["focusJump"] !== false,
      });
      return { success: true };
    }

    const selectedEventIds = safeStringArray(flat["selectedEventIds"]);
    if (selectedEventIds !== null) {
      const inspectorEventId =
        safeString(flat["inspectorEventId"]) ?? selectedEventIds.at(-1) ?? null;
      store.dispatch({
        type: "workbench/set-selection",
        focusedEventId: inspectorEventId,
        selection: {
          selectedEventIds,
          selectedEntityRefs: selectedEventIds.map((id) => ({ kind: "event", id })),
          inspectorEventId,
          inspectorEntityRef:
            inspectorEventId === null ? null : { kind: "event", id: inspectorEventId },
          focusJumpEventId: safeString(flat["focusJumpEventId"]) ?? inspectorEventId,
          focusJumpEntityRef:
            inspectorEventId === null ? null : { kind: "event", id: inspectorEventId },
        },
      });
      return { success: true };
    }

    const ref = safeOverlayEntityRef(flat["ref"] ?? flat["entityRef"]);
    if (ref !== null) {
      applyOverlayEntitySelection({
        refs: [ref],
        mode: safeString(flat["selectionMode"]),
        inspectorRef: ref,
        focusJump: flat["focusJump"] !== false,
      });
      return { success: true };
    }

    const eventId = safeString(flat["eventId"]);
    if (eventId !== null) {
      const selectionMode = safeString(flat["selectionMode"]);
      const currentSelection = store.getState().workbench.selection.selectedEventIds;
      const additive = selectionMode === "add" || selectionMode === "toggle";
      if (flat["jumpToEvent"] === true && additive === false) {
        replayController.jump(eventId);
        return { success: true };
      }

      const nextSelection =
        selectionMode === "add"
          ? Array.from(new Set([...currentSelection, eventId]))
          : selectionMode === "toggle"
            ? currentSelection.includes(eventId)
              ? currentSelection.filter((selectedId) => selectedId !== eventId)
              : [...currentSelection, eventId]
            : [eventId];
      const inspectorEventId = nextSelection.includes(eventId)
        ? eventId
        : (nextSelection.at(-1) ?? null);
      store.dispatch({
        type: "workbench/set-selection",
        focusedEventId: inspectorEventId,
        selection: {
          selectedEventIds: nextSelection,
          selectedEntityRefs: nextSelection.map((id) => ({ kind: "event", id })),
          inspectorEventId,
          inspectorEntityRef:
            inspectorEventId === null ? null : { kind: "event", id: inspectorEventId },
          focusJumpEventId: flat["focusJump"] === false ? null : (inspectorEventId ?? eventId),
          focusJumpEntityRef:
            flat["focusJump"] === false || inspectorEventId === null
              ? null
              : { kind: "event", id: inspectorEventId },
        },
      });
      return { success: true };
    }

    const focusMode = flat["focusMode"];
    if (typeof focusMode === "boolean") {
      store.dispatchMany([
        { type: "layout/set-focus-mode", focusMode },
        { type: "workbench/set-focus-mode", focusMode },
      ]);
      return { success: true };
    }
    const investigationMode = flat["investigationModeEnabled"] ?? flat["investigationMode"];
    if (typeof investigationMode === "boolean") {
      store.dispatch({ type: "workbench/set-investigation-mode", enabled: investigationMode });
      return { success: true };
    }
    const nudgeDelta = safeImagePoint(flat["nudgeDelta"]);
    if (nudgeDelta !== null) {
      return nudgeOverlaySelection(nudgeDelta, flat["hardSnap"] === true);
    }
    return handled ? { success: true } : { success: false, message: "focus payload is empty" };
  }

  return {
    applyFocusUpdate,
    applyOverlayEntitySelection,
    applyPanelLayoutUpdate,
    applyPanelTabUpdate,
    applyTimelineUpdate,
    applyViewportUpdate,
  };
}
