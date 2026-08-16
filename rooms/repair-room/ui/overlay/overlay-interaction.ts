import type {
  RepairEvent,
  RepairOverlayEntityRef,
  RepairWorkbenchState,
} from "../../shared/types/index.js";
import type { RepairGuidanceProjection } from "../../shared/ui/state.js";
import { repairOverlayRefsEqual } from "./overlay-geometry.js";

export interface RepairOverlayEventInteraction {
  additive: boolean;
  focusJump: boolean;
}

export interface RepairOverlayInteractionConfig {
  focusedEventId: string | null;
  guidance: RepairGuidanceProjection;
  workbench: RepairWorkbenchState;
}

export function hasEventModifier(
  event: unknown,
  key: "shiftKey" | "ctrlKey" | "metaKey" | "altKey"
): boolean {
  const candidate = event as Partial<Record<typeof key, unknown>> | null;
  return typeof candidate?.[key] === "boolean" ? Boolean(candidate[key]) : false;
}

export function getInteractionFromKonvaEvent(event: {
  evt?: unknown;
}): RepairOverlayEventInteraction {
  const nativeEvent = event.evt;
  return {
    additive:
      hasEventModifier(nativeEvent, "shiftKey") ||
      hasEventModifier(nativeEvent, "ctrlKey") ||
      hasEventModifier(nativeEvent, "metaKey"),
    focusJump: hasEventModifier(nativeEvent, "altKey") === false,
  };
}

export function getEventInteractionState(
  config: RepairOverlayInteractionConfig,
  eventId: string
): { hovered: boolean; selected: boolean; focused: boolean } {
  const ref: RepairOverlayEntityRef = { kind: "event", id: eventId };
  return {
    hovered:
      config.workbench.selection.hoveredEventId === eventId ||
      config.workbench.hoveredEventId === eventId ||
      (config.workbench.selection.hoveredEntityRef !== null &&
        repairOverlayRefsEqual(config.workbench.selection.hoveredEntityRef, ref)),
    selected:
      config.workbench.selection.selectedEventIds.includes(eventId) ||
      config.workbench.selection.selectedEntityRefs.some((candidate) =>
        repairOverlayRefsEqual(candidate, ref)
      ),
    focused: config.focusedEventId === eventId,
  };
}

export function getEntityInteractionState(
  config: RepairOverlayInteractionConfig,
  ref: RepairOverlayEntityRef
): { hovered: boolean; selected: boolean; focused: boolean } {
  return {
    hovered:
      config.workbench.selection.hoveredEntityRef !== null &&
      repairOverlayRefsEqual(config.workbench.selection.hoveredEntityRef, ref),
    selected: config.workbench.selection.selectedEntityRefs.some((candidate) =>
      repairOverlayRefsEqual(candidate, ref)
    ),
    focused:
      config.workbench.selection.inspectorEntityRef !== null &&
      repairOverlayRefsEqual(config.workbench.selection.inspectorEntityRef, ref),
  };
}

function isRefListed(refs: RepairOverlayEntityRef[], ref: RepairOverlayEntityRef): boolean {
  return refs.some((candidate) => repairOverlayRefsEqual(candidate, ref));
}

export function getOverlayEntityOpacity(
  config: RepairOverlayInteractionConfig,
  ref: RepairOverlayEntityRef
): number {
  const interaction =
    ref.kind === "event"
      ? getEventInteractionState(config, ref.id)
      : getEntityInteractionState(config, ref);
  if (interaction.focused || interaction.selected || interaction.hovered) return 1;
  if (isRefListed(config.guidance.overlaySaturation.activeAttentionRefs, ref)) return 1;
  if (config.guidance.operationalProfile === "advanced") return 1;
  if (isRefListed(config.guidance.overlaySaturation.fadedSecondaryRefs, ref)) return 0.26;
  if (config.guidance.overlaySaturation.clutterScore > 0.66) {
    return 0.52;
  }
  return 0.86;
}

export function getEventImageRect(event: RepairEvent) {
  if ((event.kind === "ai-mark" || event.kind === "risk-flag") && event.region !== null) {
    return event.region;
  }
  if (event.kind === "annotation") {
    if (event.region !== null) return event.region;
    if (event.point !== null) {
      return { xPx: event.point.xPx - 18, yPx: event.point.yPx - 18, widthPx: 36, heightPx: 36 };
    }
  }
  if (event.kind === "measurement" && event.pinAt !== null) {
    return { xPx: event.pinAt.xPx - 14, yPx: event.pinAt.yPx - 14, widthPx: 28, heightPx: 28 };
  }
  return null;
}
