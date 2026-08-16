import type { RepairUiState, RepairUiSnapshotMeta } from "../../shared/ui/state.js";
import type { createRepairUiRequestRuntime } from "../../shared/ui/request-runtime.js";

type RepairUiRequestRuntime = ReturnType<typeof createRepairUiRequestRuntime>;

export function getKeyboardOverlayRefs(meta: RepairUiSnapshotMeta) {
  return [
    ...meta.replay.overlayEvents.map((event) => ({ kind: "event" as const, id: event.id })),
    ...meta.replay.investigationRegions.map((region) => ({
      kind: "investigation-region" as const,
      id: region.regionId,
    })),
    ...meta.replay.temporarySpatialRegions.map((region) => ({
      kind: "temporary-spatial-region" as const,
      id: region.id,
    })),
    ...meta.replay.knowledgeRegions.map((region) => ({
      kind: "knowledge-region" as const,
      id: region.id,
    })),
    ...meta.replay.measurementRelationships.map((relationship) => ({
      kind: "measurement-relationship" as const,
      id: relationship.id,
    })),
  ];
}

export function createRepairKeyboardController(params: {
  cancelSpatialFocusTween: () => void;
  meta: RepairUiSnapshotMeta;
  requestRuntime: RepairUiRequestRuntime;
  state: RepairUiState;
}) {
  const { cancelSpatialFocusTween, meta, requestRuntime, state } = params;

  function jumpRelativeEvent(direction: -1 | 1): void {
    if (meta.events.length === 0) return;
    const currentIndex =
      state.workbench.focusedEventId === null
        ? -1
        : meta.events.findIndex((event) => event.id === state.workbench.focusedEventId);
    const nextIndex = Math.min(meta.events.length - 1, Math.max(0, currentIndex + direction));
    const event = meta.events[nextIndex];
    if (event !== undefined) {
      cancelSpatialFocusTween();
      requestRuntime.jumpToEvent({ eventId: event.id });
    }
  }

  function cycleOverlayEntity(direction: -1 | 1): void {
    const refs = getKeyboardOverlayRefs(meta);
    if (refs.length === 0) return;
    const current =
      state.workbench.selection.inspectorEntityRef ??
      state.workbench.selection.selectedEntityRefs.at(-1) ??
      null;
    const currentIndex =
      current === null
        ? -1
        : refs.findIndex((ref) => ref.kind === current.kind && ref.id === current.id);
    const next = refs[(currentIndex + direction + refs.length) % refs.length];
    if (next !== undefined) {
      cancelSpatialFocusTween();
      requestRuntime.selectOverlayEntities({ refs: [next], mode: "replace", inspectorRef: next });
    }
  }

  function scrubTimelineTo(positionMs: number): void {
    cancelSpatialFocusTween();
    requestRuntime.scrubTimeline({ positionMs: Math.max(0, Math.round(positionMs)) });
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    switch (event.key) {
      case "Tab":
        if (event.altKey) {
          event.preventDefault();
          cycleOverlayEntity(event.shiftKey ? -1 : 1);
        }
        break;
      case "Enter": {
        const ref =
          state.workbench.selection.inspectorEntityRef ??
          state.workbench.selection.selectedEntityRefs.at(-1) ??
          null;
        if (ref !== null) {
          event.preventDefault();
          cancelSpatialFocusTween();
          requestRuntime.focusOverlayEntity({ ref, focusJump: true });
        }
        break;
      }
      case "f":
      case "F":
        requestRuntime.updateFocus({ focusMode: !state.layout.focusMode });
        break;
      case "i":
      case "I":
        requestRuntime.toggleInvestigationMode({
          enabled: !state.workbench.investigationModeEnabled,
        });
        break;
      case " ":
        event.preventDefault();
        requestRuntime.toggleFreezeFrame();
        break;
      case "Escape":
        if (state.layout.settingsOverlayOpen) {
          requestRuntime.setSettingsOverlay({ open: false });
        } else if (state.layout.focusMode) {
          requestRuntime.updateFocus({ focusMode: false });
        }
        break;
      case "[":
        jumpRelativeEvent(-1);
        break;
      case "]":
        jumpRelativeEvent(1);
        break;
      case "Home":
        scrubTimelineTo(0);
        break;
      case "End":
        cancelSpatialFocusTween();
        requestRuntime.focusLiveEdge();
        break;
      case ",":
        scrubTimelineTo(state.workbench.timeline.playheadMs - 1000);
        break;
      case ".":
        scrubTimelineTo(state.workbench.timeline.playheadMs + 1000);
        break;
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        const step = event.shiftKey ? 8 : 1;
        const delta =
          event.key === "ArrowLeft"
            ? { xPx: -step, yPx: 0 }
            : event.key === "ArrowRight"
              ? { xPx: step, yPx: 0 }
              : event.key === "ArrowUp"
                ? { xPx: 0, yPx: -step }
                : { xPx: 0, yPx: step };
        cancelSpatialFocusTween();
        requestRuntime.updateFocus({ nudgeDelta: delta, hardSnap: event.shiftKey });
        break;
      }
      case "r":
      case "R":
        requestRuntime.setActiveTool({ tool: "snapshot" });
        break;
      case "m":
      case "M":
        requestRuntime.setActiveTool({ tool: "measurement-pin" });
        break;
      case "a":
      case "A":
        requestRuntime.setActiveTool({ tool: "rect" });
        break;
      case "z":
      case "Z":
        requestRuntime.setActiveTool({ tool: "zoom-in" });
        break;
      case "x":
      case "X":
        requestRuntime.setActiveTool({ tool: "zoom-out" });
        break;
    }
  }

  return { handleKeydown };
}
