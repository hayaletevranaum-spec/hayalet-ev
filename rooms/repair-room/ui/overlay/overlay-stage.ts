import type {
  RepairEvent,
  RepairImagePoint,
  RepairImageRect,
  RepairInvestigationRegion,
  RepairOverlayLayerId,
  RepairOverlayEntityRef,
  RepairPcbImageRef,
  RepairWorkbenchState,
} from "../../shared/types/index.js";
import type {
  RepairGuidanceProjection,
  RepairKnowledgeRegionProjection,
  RepairMeasurementRelationship,
  RepairSpatialFocusState,
  RepairTemporarySpatialRegion,
} from "../../shared/ui/state.js";
import { REPAIR_UI_COLORS } from "../../shared/repair-constants.js";
import { loadKonvaNamespace, type RepairKonvaNamespace } from "./konva-loader.js";
import {
  clampImagePoint,
  getContainedImageFrame,
  imageRectToStageRect,
  stagePointToImagePoint,
} from "./overlay-coords.js";
import {
  getRepairFocusFrame,
  getRepairMarqueeSelection,
  getRepairSnapAssist,
  repairOverlayRefsEqual,
  type RepairSelectableOverlayEntity,
} from "./overlay-geometry.js";
import { isRepairOverlayDrawTool } from "./overlay-tools.js";
import {
  getEntityInteractionState,
  getEventImageRect,
  getEventInteractionState,
  getInteractionFromKonvaEvent,
  getOverlayEntityOpacity,
  hasEventModifier,
  type RepairOverlayEventInteraction,
} from "./overlay-interaction.js";

type KonvaNamespace = RepairKonvaNamespace;
type RepairKonvaContainer =
  InstanceType<KonvaNamespace["Layer"]> | InstanceType<KonvaNamespace["Group"]>;

export type { RepairOverlayEventInteraction } from "./overlay-interaction.js";

export interface RepairOverlayStageConfig {
  container: HTMLElement;
  activeSpatialFocus: RepairSpatialFocusState | null;
  events: RepairEvent[];
  focusedEventId: string | null;
  guidance: RepairGuidanceProjection;
  image: RepairPcbImageRef;
  investigationRegions: RepairInvestigationRegion[];
  knowledgeRegions: RepairKnowledgeRegionProjection[];
  measurementRelationships: RepairMeasurementRelationship[];
  temporarySpatialRegions: RepairTemporarySpatialRegion[];
  visibleLayers: Record<RepairOverlayLayerId, boolean>;
  workbench: RepairWorkbenchState;
  onAddAnnotation: (payload: {
    tool: string;
    xPx: number;
    yPx: number;
    widthPx?: number;
    heightPx?: number;
    label?: string;
  }) => void;
  onAddMeasurement: (payload: {
    eventId?: string;
    xPx: number;
    yPx: number;
    reference: string;
  }) => void;
  onCursor: (point: RepairImagePoint) => void;
  onEntityClick: (ref: RepairOverlayEntityRef, interaction: RepairOverlayEventInteraction) => void;
  onEntityFocus: (ref: RepairOverlayEntityRef) => void;
  onEntityHover: (ref: RepairOverlayEntityRef | null) => void;
  onEventClick: (eventId: string, interaction: RepairOverlayEventInteraction) => void;
  onEventHover: (eventId: string | null) => void;
  onMarqueeSelect: (refs: RepairOverlayEntityRef[], additive: boolean) => void;
  onNudgeSelection: (delta: RepairImagePoint, hardSnap: boolean) => void;
  onSelectionClear: () => void;
  onViewportChange: (payload: { zoom: number; panXPx: number; panYPx: number }) => void;
}

export interface RepairOverlayController {
  update: (config: RepairOverlayStageConfig) => void;
  resize: () => void;
  destroy: () => void;
}

function getStageSize(container: HTMLElement): { width: number; height: number } {
  const rect = container.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(rect.width || container.clientWidth || 800)),
    height: Math.max(1, Math.round(rect.height || container.clientHeight || 480)),
  };
}

function addGridLayer(
  Konva: KonvaNamespace,
  config: RepairOverlayStageConfig,
  layer: RepairKonvaContainer
): void {
  if (!config.visibleLayers.grid) return;
  const { width, height } = getStageSize(config.container);
  const frame = getContainedImageFrame(width, height, config.image.widthPx, config.image.heightPx);
  const stepPx = Math.max(
    12,
    config.image.pixelsPerMm * 10 * frame.scale * config.workbench.viewport.zoom
  );
  const startX = frame.leftPx + config.workbench.viewport.panXPx;
  const startY = frame.topPx + config.workbench.viewport.panYPx;
  const endX =
    frame.leftPx +
    frame.widthPx * config.workbench.viewport.zoom +
    config.workbench.viewport.panXPx;
  const endY =
    frame.topPx +
    frame.heightPx * config.workbench.viewport.zoom +
    config.workbench.viewport.panYPx;

  for (let x = startX; x <= endX; x += stepPx) {
    layer.add(
      new Konva.Line({
        points: [x, startY, x, endY],
        stroke: "rgba(86, 200, 222, 0.055)",
        strokeWidth: 1,
      })
    );
  }
  for (let y = startY; y <= endY; y += stepPx) {
    layer.add(
      new Konva.Line({
        points: [startX, y, endX, y],
        stroke: "rgba(86, 200, 222, 0.045)",
        strokeWidth: 1,
      })
    );
  }

  layer.add(
    new Konva.Text({
      x: startX + 10,
      y: startY + 10,
      text: "10mm",
      fontFamily: "IBM Plex Mono, JetBrains Mono, monospace",
      fontSize: 10,
      fill: "rgba(226, 232, 240, 0.38)",
    })
  );
}

function addLabel(
  Konva: KonvaNamespace,
  layer: RepairKonvaContainer,
  x: number,
  y: number,
  text: string,
  color: string
): void {
  const label = new Konva.Label({ x, y, listening: false });
  label.add(
    new Konva.Tag({
      fill: "rgba(5, 8, 12, 0.84)",
      stroke: color,
      strokeWidth: 1,
      cornerRadius: 3,
      lineJoin: "round",
    })
  );
  label.add(
    new Konva.Text({
      text,
      padding: 5,
      fill: color,
      fontFamily: "IBM Plex Mono, JetBrains Mono, monospace",
      fontSize: 10,
    })
  );
  layer.add(label);
}

function addRectSelectionAssist(
  Konva: KonvaNamespace,
  layer: RepairKonvaContainer,
  rect: RepairImageRect,
  color: string,
  selected: boolean,
  hovered: boolean
): void {
  if (!selected && !hovered) return;
  layer.add(
    new Konva.Rect({
      x: rect.xPx - 4,
      y: rect.yPx - 4,
      width: rect.widthPx + 8,
      height: rect.heightPx + 8,
      stroke: color,
      strokeWidth: selected ? 1.5 : 1,
      dash: selected ? [4, 3] : [2, 4],
      opacity: selected ? 0.88 : 0.54,
      cornerRadius: 6,
      listening: false,
    })
  );
}

function addAiEvent(
  Konva: KonvaNamespace,
  config: RepairOverlayStageConfig,
  layer: RepairKonvaContainer,
  event: RepairEvent
): void {
  if ((event.kind !== "ai-mark" && event.kind !== "risk-flag") || event.region === null) return;
  if (!config.visibleLayers["ai-marks"]) return;
  if (event.kind === "risk-flag" && !config.visibleLayers.risks) return;
  const rect = event.region;
  const color =
    event.kind === "risk-flag" || event.severity === "risk"
      ? REPAIR_UI_COLORS.risk
      : REPAIR_UI_COLORS.amber;
  const interaction = getEventInteractionState(config, event.id);
  const shape = new Konva.Rect({
    x: rect.xPx,
    y: rect.yPx,
    width: rect.widthPx,
    height: rect.heightPx,
    stroke: color,
    strokeWidth: interaction.selected || interaction.focused ? 3 : interaction.hovered ? 2.5 : 2,
    dash: [8, 5],
    fill:
      event.kind === "risk-flag"
        ? interaction.hovered
          ? "rgba(217, 122, 122, 0.16)"
          : "rgba(217, 122, 122, 0.10)"
        : interaction.hovered
          ? "rgba(232, 168, 87, 0.16)"
          : "rgba(232, 168, 87, 0.10)",
    cornerRadius: 5,
    shadowColor: color,
    shadowBlur: interaction.selected || interaction.hovered ? 12 : 0,
    shadowOpacity: interaction.selected ? 0.28 : 0.16,
  });
  shape.on("click tap", (konvaEvent) => {
    const interaction = getInteractionFromKonvaEvent(konvaEvent);
    config.onEntityClick({ kind: "event", id: event.id }, interaction);
  });
  shape.on("mouseenter", () => {
    config.onEntityHover({ kind: "event", id: event.id });
  });
  shape.on("mouseleave", () => {
    config.onEntityHover(null);
  });
  layer.add(shape);
  addRectSelectionAssist(Konva, layer, rect, color, interaction.selected, interaction.hovered);
  addLabel(
    Konva,
    layer,
    rect.xPx,
    Math.max(0, rect.yPx - 26),
    event.kind === "risk-flag"
      ? "RISK"
      : config.guidance.overlaySaturation.labelMode === "simplified"
        ? "AI"
        : "AI SUGGESTION",
    color
  );
}

function addAnnotationEvent(
  Konva: KonvaNamespace,
  config: RepairOverlayStageConfig,
  layer: RepairKonvaContainer,
  event: RepairEvent
): void {
  if (event.kind !== "annotation" || !config.visibleLayers.annotations) return;
  const author = event.meta?.author ?? event.source;
  if (author === "operator" && !config.visibleLayers["operator-annotations"]) return;
  if (author === "ai" && !config.visibleLayers["ai-annotations"]) return;
  const color = event.color;
  const interaction = getEventInteractionState(config, event.id);
  if (event.region !== null) {
    const rect = event.region;
    if (event.tool === "arrow") {
      const shape = new Konva.Arrow({
        points: [rect.xPx, rect.yPx, rect.xPx + rect.widthPx, rect.yPx + rect.heightPx],
        pointerLength: 10,
        pointerWidth: 8,
        stroke: color,
        strokeWidth:
          interaction.selected || interaction.focused ? 3 : interaction.hovered ? 2.5 : 2,
        fill: color,
        shadowColor: color,
        shadowBlur: interaction.selected || interaction.hovered ? 10 : 0,
        shadowOpacity: interaction.selected ? 0.24 : 0.16,
      });
      shape.on("click tap", (konvaEvent) => {
        const interaction = getInteractionFromKonvaEvent(konvaEvent);
        config.onEntityClick({ kind: "event", id: event.id }, interaction);
      });
      shape.on("mouseenter", () => {
        config.onEntityHover({ kind: "event", id: event.id });
      });
      shape.on("mouseleave", () => {
        config.onEntityHover(null);
      });
      layer.add(shape);
      addRectSelectionAssist(Konva, layer, rect, color, interaction.selected, interaction.hovered);
      addLabel(Konva, layer, rect.xPx, rect.yPx + 8, event.label, color);
      return;
    }
    const shape = new Konva.Rect({
      x: rect.xPx,
      y: rect.yPx,
      width: rect.widthPx,
      height: rect.heightPx,
      stroke: color,
      strokeWidth: interaction.selected || interaction.focused ? 3 : interaction.hovered ? 2.5 : 2,
      dash: event.tool === "freehand" ? [3, 3] : [],
      cornerRadius: 4,
      shadowColor: color,
      shadowBlur: interaction.selected || interaction.hovered ? 9 : 0,
      shadowOpacity: interaction.selected ? 0.22 : 0.14,
    });
    shape.on("click tap", (konvaEvent) => {
      const interaction = getInteractionFromKonvaEvent(konvaEvent);
      config.onEntityClick({ kind: "event", id: event.id }, interaction);
    });
    shape.on("mouseenter", () => {
      config.onEntityHover({ kind: "event", id: event.id });
    });
    shape.on("mouseleave", () => {
      config.onEntityHover(null);
    });
    layer.add(shape);
    addRectSelectionAssist(Konva, layer, rect, color, interaction.selected, interaction.hovered);
    addLabel(Konva, layer, rect.xPx, rect.yPx + rect.heightPx + 5, event.label, color);
    return;
  }
  if (event.point !== null) {
    const point = event.point;
    const marker = new Konva.Circle({
      x: point.xPx,
      y: point.yPx,
      radius: interaction.selected || interaction.hovered ? 8 : 6,
      fill: color,
      stroke: "rgba(0, 0, 0, 0.72)",
      strokeWidth: 2,
      shadowColor: color,
      shadowBlur: interaction.selected || interaction.hovered ? 10 : 0,
      shadowOpacity: interaction.selected ? 0.24 : 0.14,
    });
    marker.on("click tap", (konvaEvent) => {
      const interaction = getInteractionFromKonvaEvent(konvaEvent);
      config.onEntityClick({ kind: "event", id: event.id }, interaction);
    });
    marker.on("mouseenter", () => {
      config.onEntityHover({ kind: "event", id: event.id });
    });
    marker.on("mouseleave", () => {
      config.onEntityHover(null);
    });
    layer.add(marker);
    addLabel(Konva, layer, point.xPx + 8, point.yPx - 12, event.label, color);
  }
}

function getSnapTargets(
  config: RepairOverlayStageConfig,
  sourceEventId: string
): RepairImagePoint[] {
  const targets: RepairImagePoint[] = [];
  config.events.forEach((event) => {
    if (event.id === sourceEventId) return;
    const rect = getEventImageRect(event);
    if (rect !== null) {
      targets.push({ xPx: rect.xPx + rect.widthPx / 2, yPx: rect.yPx + rect.heightPx / 2 });
    }
  });
  config.investigationRegions.forEach((region) => {
    targets.push({
      xPx: region.region.xPx + region.region.widthPx / 2,
      yPx: region.region.yPx + region.region.heightPx / 2,
    });
  });
  config.knowledgeRegions.forEach((region) => {
    targets.push({
      xPx: region.region.xPx + region.region.widthPx / 2,
      yPx: region.region.yPx + region.region.heightPx / 2,
    });
  });
  return targets;
}

function addMeasurementEvent(
  Konva: KonvaNamespace,
  config: RepairOverlayStageConfig,
  layer: RepairKonvaContainer,
  event: RepairEvent
): void {
  if (
    event.kind !== "measurement" ||
    event.pinAt === null ||
    !config.visibleLayers["measurement-pins"] ||
    !config.visibleLayers.measurements
  )
    return;
  const point = event.pinAt;
  const interaction = getEventInteractionState(config, event.id);
  const group = new Konva.Group({
    x: point.xPx,
    y: point.yPx,
    draggable: config.workbench.contextualCursor !== "replay-scrub-lock",
  });
  group.add(
    new Konva.Circle({
      x: 0,
      y: 0,
      radius: interaction.selected || interaction.hovered ? 9 : 7,
      fill: REPAIR_UI_COLORS.cyan,
      stroke: "rgba(0, 0, 0, 0.72)",
      strokeWidth: 2,
      shadowColor: REPAIR_UI_COLORS.cyan,
      shadowBlur: interaction.selected || interaction.hovered ? 10 : 0,
      shadowOpacity: interaction.selected ? 0.24 : 0.14,
    })
  );
  group.add(
    new Konva.Text({
      x: 12,
      y: -9,
      text:
        config.guidance.overlaySaturation.labelMode === "simplified"
          ? `${event.rawDisplay} ${event.unit}`
          : `${event.reference ?? event.channel} — ${event.rawDisplay} ${event.unit}`,
      fill: REPAIR_UI_COLORS.cyan,
      fontFamily: "IBM Plex Mono, JetBrains Mono, monospace",
      fontSize: 10,
    })
  );
  group.on("click tap", (konvaEvent) => {
    const interaction = getInteractionFromKonvaEvent(konvaEvent);
    config.onEntityClick({ kind: "event", id: event.id }, interaction);
  });
  group.on("mouseenter", () => {
    config.onEntityHover({ kind: "event", id: event.id });
  });
  group.on("mouseleave", () => {
    config.onEntityHover(null);
  });
  group.on("dragend", (konvaEvent) => {
    const clamped = clampImagePoint(
      { xPx: group.x(), yPx: group.y() },
      config.image.widthPx,
      config.image.heightPx
    );
    const snap = getRepairSnapAssist(
      clamped,
      getSnapTargets(config, event.id),
      42,
      14,
      hasEventModifier(konvaEvent.evt, "shiftKey")
    );
    const point = snap?.hardSnap === true ? snap.target : clamped;
    config.onAddMeasurement({
      eventId: event.id,
      xPx: Math.round(point.xPx),
      yPx: Math.round(point.yPx),
      reference: event.reference ?? "Dragged probe",
    });
  });
  layer.add(group);
}

function addInvestigationRegion(
  Konva: KonvaNamespace,
  config: RepairOverlayStageConfig,
  layer: RepairKonvaContainer,
  region: RepairInvestigationRegion | RepairTemporarySpatialRegion
): void {
  const isTemporary = !("regionId" in region);
  const ref: RepairOverlayEntityRef = isTemporary
    ? { kind: "temporary-spatial-region", id: region.id }
    : { kind: "investigation-region", id: region.regionId };
  const interaction = getEntityInteractionState(config, ref);
  const color = isTemporary ? "rgb(111, 191, 154)" : region.color;
  const rect = region.region;
  const shape = new Konva.Rect({
    x: rect.xPx,
    y: rect.yPx,
    width: rect.widthPx,
    height: rect.heightPx,
    stroke: color,
    strokeWidth: interaction.selected || interaction.focused ? 2.5 : interaction.hovered ? 2 : 1.4,
    dash: isTemporary ? [3, 6] : [10, 4],
    fill: isTemporary ? "rgba(111, 191, 154, 0.08)" : "rgba(86, 200, 222, 0.09)",
    cornerRadius: 6,
    shadowColor: color,
    shadowBlur: interaction.selected || interaction.hovered ? 14 : 0,
    shadowOpacity: interaction.selected ? 0.26 : 0.14,
  });
  shape.on("click tap", (konvaEvent) => {
    config.onEntityClick(ref, getInteractionFromKonvaEvent(konvaEvent));
  });
  shape.on("dblclick dbltap", () => {
    config.onEntityFocus(ref);
  });
  shape.on("mouseenter", () => {
    config.onEntityHover(ref);
  });
  shape.on("mouseleave", () => {
    config.onEntityHover(null);
  });
  layer.add(shape);
  addRectSelectionAssist(Konva, layer, rect, color, interaction.selected, interaction.hovered);
  addLabel(
    Konva,
    layer,
    rect.xPx,
    Math.max(0, rect.yPx - 24),
    config.guidance.overlaySaturation.labelMode === "simplified"
      ? region.label
      : isTemporary
        ? region.label
        : `${region.status.toUpperCase()} ${region.label}`,
    color
  );
}

function getEventRelationshipPoint(event: RepairEvent): RepairImagePoint | null {
  const rect = getEventImageRect(event);
  if (rect === null) return null;
  return {
    xPx: rect.xPx + rect.widthPx / 2,
    yPx: rect.yPx + rect.heightPx / 2,
  };
}

function getOverlayRefPoint(
  config: RepairOverlayStageConfig,
  ref: RepairOverlayEntityRef
): RepairImagePoint | null {
  if (ref.kind === "event") {
    const event = config.events.find((candidate) => candidate.id === ref.id);
    return event === undefined ? null : getEventRelationshipPoint(event);
  }
  if (ref.kind === "investigation-region") {
    const region = config.investigationRegions.find((candidate) => candidate.regionId === ref.id);
    if (region === undefined) return null;
    return {
      xPx: region.region.xPx + region.region.widthPx / 2,
      yPx: region.region.yPx + region.region.heightPx / 2,
    };
  }
  if (ref.kind === "knowledge-region") {
    const region = config.knowledgeRegions.find((candidate) => candidate.id === ref.id);
    if (region === undefined) return null;
    return {
      xPx: region.region.xPx + region.region.widthPx / 2,
      yPx: region.region.yPx + region.region.heightPx / 2,
    };
  }
  if (ref.kind === "temporary-spatial-region") {
    const region = config.temporarySpatialRegions.find((candidate) => candidate.id === ref.id);
    if (region === undefined) return null;
    return {
      xPx: region.region.xPx + region.region.widthPx / 2,
      yPx: region.region.yPx + region.region.heightPx / 2,
    };
  }
  return null;
}

function getRelationshipImageRect(
  config: RepairOverlayStageConfig,
  relationship: RepairMeasurementRelationship
): RepairImageRect | null {
  const from = getOverlayRefPoint(config, relationship.from);
  const to = getOverlayRefPoint(config, relationship.to);
  if (from === null || to === null) return null;
  const left = Math.min(from.xPx, to.xPx);
  const top = Math.min(from.yPx, to.yPx);
  const right = Math.max(from.xPx, to.xPx);
  const bottom = Math.max(from.yPx, to.yPx);
  return {
    xPx: Math.max(0, left - 20),
    yPx: Math.max(0, top - 20),
    widthPx: Math.max(1, right - left + 40),
    heightPx: Math.max(1, bottom - top + 40),
  };
}

function shouldRenderRelationship(
  config: RepairOverlayStageConfig,
  relationship: RepairMeasurementRelationship
): boolean {
  if (config.workbench.investigationModeEnabled) return true;
  return getMeasurementRelationshipInteractionState(config, relationship).active;
}

function getMeasurementRelationshipInteractionState(
  config: RepairOverlayStageConfig,
  relationship: RepairMeasurementRelationship
): {
  relationshipRef: RepairOverlayEntityRef;
  active: boolean;
  hovered: boolean;
  focused: boolean;
  selected: boolean;
  endpointActive: boolean;
} {
  const hovered = config.workbench.selection.hoveredEntityRef;
  const focused = config.workbench.selection.inspectorEntityRef;
  const relationshipRef: RepairOverlayEntityRef = {
    kind: "measurement-relationship",
    id: relationship.id,
  };
  const selected = config.workbench.selection.selectedEntityRefs.some((ref) =>
    repairOverlayRefsEqual(ref, relationshipRef)
  );
  const focusedRelationship = focused !== null && repairOverlayRefsEqual(focused, relationshipRef);
  const hoveredRelationship = hovered !== null && repairOverlayRefsEqual(hovered, relationshipRef);
  const endpointActive = [hovered, focused, ...config.workbench.selection.selectedEntityRefs].some(
    (ref) =>
      ref !== null &&
      (repairOverlayRefsEqual(ref, relationship.from) ||
        repairOverlayRefsEqual(ref, relationship.to))
  );
  return {
    relationshipRef,
    active: selected || focusedRelationship || hoveredRelationship || endpointActive,
    hovered: hoveredRelationship,
    focused: focusedRelationship,
    selected,
    endpointActive,
  };
}

function addMeasurementRelationship(
  Konva: KonvaNamespace,
  config: RepairOverlayStageConfig,
  layer: RepairKonvaContainer,
  relationship: RepairMeasurementRelationship
): void {
  if (!shouldRenderRelationship(config, relationship)) return;
  const from = getOverlayRefPoint(config, relationship.from);
  const to = getOverlayRefPoint(config, relationship.to);
  if (from === null || to === null) return;
  const interaction = getMeasurementRelationshipInteractionState(config, relationship);
  const line = new Konva.Line({
    points: [from.xPx, from.yPx, to.xPx, to.yPx],
    stroke: relationship.kind === "linked-ai-mark" ? REPAIR_UI_COLORS.amber : REPAIR_UI_COLORS.cyan,
    strokeWidth: interaction.active ? 1.6 : 1,
    dash: relationship.kind === "previous-event" ? [] : [4, 5],
    opacity: interaction.active ? 0.72 : Math.max(0.18, relationship.strength * 0.42),
    hitStrokeWidth: 16,
    listening: true,
  });
  line.on("click tap", (konvaEvent) => {
    config.onEntityClick(interaction.relationshipRef, getInteractionFromKonvaEvent(konvaEvent));
  });
  line.on("dblclick dbltap", () => {
    config.onEntityFocus(interaction.relationshipRef);
  });
  line.on("mouseenter", () => {
    config.onEntityHover(interaction.relationshipRef);
  });
  line.on("mouseleave", () => {
    config.onEntityHover(null);
  });
  layer.add(line);
}

function addKnowledgeRegion(
  Konva: KonvaNamespace,
  config: RepairOverlayStageConfig,
  layer: RepairKonvaContainer,
  entry: RepairKnowledgeRegionProjection
): void {
  const { width, height } = getStageSize(config.container);
  const frame = getContainedImageFrame(width, height, config.image.widthPx, config.image.heightPx);
  const rect = imageRectToStageRect(entry.region, frame, config.workbench.viewport);
  const shape = new Konva.Rect({
    x: rect.xPx,
    y: rect.yPx,
    width: rect.widthPx,
    height: rect.heightPx,
    stroke: "rgba(111, 191, 154, 0.72)",
    strokeWidth: 1,
    dash: [4, 6],
    fill: "rgba(111, 191, 154, 0.08)",
    cornerRadius: 5,
    listening: false,
  });
  layer.add(shape);
  addLabel(Konva, layer, rect.xPx, Math.max(0, rect.yPx - 20), entry.label, "rgb(111, 191, 154)");
}

export async function mountRepairOverlayStage(
  config: RepairOverlayStageConfig
): Promise<RepairOverlayController | null> {
  if (
    config.container.dataset["mounted"] === "true" ||
    config.container.dataset["mounting"] === "true"
  ) {
    return null;
  }
  config.container.dataset["mounting"] = "true";

  try {
    const Konva = await loadKonvaNamespace(config.container.ownerDocument);
    type RepairLayer = InstanceType<KonvaNamespace["Layer"]>;
    type RepairStage = InstanceType<KonvaNamespace["Stage"]>;
    let currentConfig = config;
    let stage: RepairStage | null = null;
    let layers: {
      grid: RepairLayer;
      ai: RepairLayer;
      annotation: RepairLayer;
      measurement: RepairLayer;
      relationship: RepairLayer;
      region: RepairLayer;
      focus: RepairLayer;
      helper: RepairLayer;
    } | null = null;
    const entityGroups = new Map<
      string,
      {
        group: InstanceType<KonvaNamespace["Group"]>;
        fingerprint: string;
        layerKey: "ai" | "annotation" | "measurement";
      }
    >();
    const investigationRegionGroups = new Map<
      string,
      { group: InstanceType<KonvaNamespace["Group"]>; fingerprint: string }
    >();
    const relationshipGroups = new Map<
      string,
      { group: InstanceType<KonvaNamespace["Group"]>; fingerprint: string }
    >();
    const knowledgeRegionGroups = new Map<
      string,
      { group: InstanceType<KonvaNamespace["Group"]>; fingerprint: string }
    >();
    const helperGroups = new Map<
      string,
      { group: InstanceType<KonvaNamespace["Group"]>; fingerprint: string }
    >();
    let panStart: { pointerX: number; pointerY: number; panXPx: number; panYPx: number } | null =
      null;
    let marqueeStart: RepairImagePoint | null = null;
    let marqueeCurrent: RepairImagePoint | null = null;
    let snapGuide: RepairImagePoint | null = null;
    let suppressNextStageClick = false;
    let disposed = false;

    function getRenderableSize(): { width: number; height: number } | null {
      const rect = currentConfig.container.getBoundingClientRect();
      const width = Math.round(rect.width || currentConfig.container.clientWidth || 0);
      const height = Math.round(rect.height || currentConfig.container.clientHeight || 0);
      if (width <= 0 || height <= 0) return null;
      return { width, height };
    }

    function getActiveStageSize(): { width: number; height: number } {
      if (stage !== null) {
        return { width: stage.width(), height: stage.height() };
      }
      return getStageSize(currentConfig.container);
    }

    function clearContainer(container: RepairKonvaContainer): void {
      container.getChildren().forEach((child) => {
        child.destroy();
      });
    }

    function getEventEntityFingerprint(
      layerKey: "ai" | "annotation" | "measurement",
      event: RepairEvent
    ): string {
      return JSON.stringify({
        layerKey,
        event,
        interaction: getEventInteractionState(currentConfig, event.id),
        contextualCursor: currentConfig.workbench.contextualCursor,
        visibleLayers: currentConfig.visibleLayers,
        guidance: currentConfig.guidance.overlaySaturation,
      });
    }

    function syncEntityLayerTransforms(): void {
      if (layers === null || stage === null) return;
      const { width, height } = getActiveStageSize();
      const frame = getContainedImageFrame(
        width,
        height,
        currentConfig.image.widthPx,
        currentConfig.image.heightPx
      );
      const scale = frame.scale * currentConfig.workbench.viewport.zoom;
      const transform = {
        x: frame.leftPx + currentConfig.workbench.viewport.panXPx,
        y: frame.topPx + currentConfig.workbench.viewport.panYPx,
      };
      [
        layers.ai,
        layers.annotation,
        layers.measurement,
        layers.relationship,
        layers.region,
      ].forEach((layer) => {
        layer.position(transform);
        layer.scale({ x: scale, y: scale });
      });
    }

    function syncEventEntity(
      layerKey: "ai" | "annotation" | "measurement",
      layer: RepairLayer,
      event: RepairEvent,
      draw: (group: InstanceType<KonvaNamespace["Group"]>) => void
    ): void {
      const key = `${layerKey}:${event.id}`;
      const fingerprint = getEventEntityFingerprint(layerKey, event);
      let record = entityGroups.get(key) ?? null;
      if (record !== null && record.layerKey !== layerKey) {
        record.group.destroy();
        entityGroups.delete(key);
        record = null;
      }
      if (record === null) {
        const group = new Konva.Group({ listening: true });
        layer.add(group);
        record = { group, fingerprint: "", layerKey };
        entityGroups.set(key, record);
      }
      if (record.fingerprint === fingerprint) return;
      clearContainer(record.group);
      draw(record.group);
      record.group.opacity(getOverlayEntityOpacity(currentConfig, { kind: "event", id: event.id }));
      record.fingerprint = fingerprint;
    }

    function syncMappedGroup(
      records: Map<string, { group: InstanceType<KonvaNamespace["Group"]>; fingerprint: string }>,
      layer: RepairLayer,
      key: string,
      fingerprint: string,
      draw: (group: InstanceType<KonvaNamespace["Group"]>) => void
    ): void {
      let record = records.get(key) ?? null;
      if (record === null) {
        const group = new Konva.Group({ listening: true });
        layer.add(group);
        record = { group, fingerprint: "" };
        records.set(key, record);
      }
      if (record.fingerprint === fingerprint) return;
      clearContainer(record.group);
      draw(record.group);
      record.fingerprint = fingerprint;
    }

    function pruneMappedGroups(
      records: Map<string, { group: InstanceType<KonvaNamespace["Group"]>; fingerprint: string }>,
      activeKeys: Set<string>
    ): void {
      records.forEach((record, key) => {
        if (activeKeys.has(key)) return;
        record.group.destroy();
        records.delete(key);
      });
    }

    function pruneEventEntities(activeKeys: Set<string>): void {
      entityGroups.forEach((record, key) => {
        if (activeKeys.has(key)) return;
        record.group.destroy();
        entityGroups.delete(key);
      });
    }

    function getSelectableOverlayEntities(): RepairSelectableOverlayEntity[] {
      const entities: RepairSelectableOverlayEntity[] = [];
      currentConfig.events.forEach((event) => {
        const rect = getEventImageRect(event);
        if (rect !== null) entities.push({ ref: { kind: "event", id: event.id }, rect });
      });
      currentConfig.investigationRegions.forEach((region) => {
        entities.push({
          ref: { kind: "investigation-region", id: region.regionId },
          rect: region.region,
        });
      });
      currentConfig.temporarySpatialRegions.forEach((region) => {
        entities.push({
          ref: { kind: "temporary-spatial-region", id: region.id },
          rect: region.region,
        });
      });
      currentConfig.knowledgeRegions.forEach((region) => {
        entities.push({ ref: { kind: "knowledge-region", id: region.id }, rect: region.region });
      });
      currentConfig.measurementRelationships.forEach((relationship) => {
        const rect = getRelationshipImageRect(currentConfig, relationship);
        if (rect !== null) {
          entities.push({
            ref: { kind: "measurement-relationship", id: relationship.id },
            rect,
          });
        }
      });
      return entities;
    }

    function getImageRectStageRect(rect: RepairImageRect): {
      xPx: number;
      yPx: number;
      widthPx: number;
      heightPx: number;
    } {
      const { width, height } = getActiveStageSize();
      const frame = getContainedImageFrame(
        width,
        height,
        currentConfig.image.widthPx,
        currentConfig.image.heightPx
      );
      return imageRectToStageRect(rect, frame, currentConfig.workbench.viewport);
    }

    function syncMarqueeHelper(
      activeKonva: KonvaNamespace,
      layer: RepairLayer,
      activeKeys: Set<string>
    ): void {
      if (marqueeStart === null || marqueeCurrent === null) return;
      const imageRect = {
        xPx: marqueeStart.xPx,
        yPx: marqueeStart.yPx,
        widthPx: marqueeCurrent.xPx - marqueeStart.xPx,
        heightPx: marqueeCurrent.yPx - marqueeStart.yPx,
      };
      const normalized = {
        xPx: Math.min(imageRect.xPx, imageRect.xPx + imageRect.widthPx),
        yPx: Math.min(imageRect.yPx, imageRect.yPx + imageRect.heightPx),
        widthPx: Math.abs(imageRect.widthPx),
        heightPx: Math.abs(imageRect.heightPx),
      };
      const rect = getImageRectStageRect(normalized);
      const key = "helper:marquee";
      activeKeys.add(key);
      syncMappedGroup(helperGroups, layer, key, JSON.stringify(rect), (group) => {
        group.add(
          new activeKonva.Rect({
            x: rect.xPx,
            y: rect.yPx,
            width: rect.widthPx,
            height: rect.heightPx,
            stroke: REPAIR_UI_COLORS.cyan,
            strokeWidth: 1,
            dash: [4, 4],
            fill: "rgba(86, 200, 222, 0.08)",
            listening: false,
          })
        );
      });
    }

    function syncFocusEffectHelper(
      activeKonva: KonvaNamespace,
      layer: RepairLayer,
      activeKeys: Set<string>
    ): void {
      const focusRegion = currentConfig.activeSpatialFocus?.region ?? null;
      if (focusRegion === null || !currentConfig.visibleLayers.focus) return;
      const frame = getRepairFocusFrame(
        focusRegion,
        currentConfig.image.widthPx,
        currentConfig.image.heightPx,
        42
      );
      const rect = getImageRectStageRect(frame);
      const key = "helper:focus-effect";
      activeKeys.add(key);
      syncMappedGroup(
        helperGroups,
        layer,
        key,
        JSON.stringify({
          rect,
          label: currentConfig.activeSpatialFocus?.label ?? "",
          profile: currentConfig.guidance.operationalProfile,
        }),
        (group) => {
          const calmFocus = currentConfig.guidance.operationalProfile === "novice";
          group.add(
            new activeKonva.Rect({
              x: rect.xPx,
              y: rect.yPx,
              width: rect.widthPx,
              height: rect.heightPx,
              stroke: REPAIR_UI_COLORS.cyan,
              strokeWidth: 1.5,
              dash: [12, 8],
              cornerRadius: 6,
              shadowColor: REPAIR_UI_COLORS.cyan,
              shadowBlur: calmFocus ? 6 : 18,
              shadowOpacity: calmFocus ? 0.1 : 0.18,
              listening: false,
            })
          );
        }
      );
    }

    function syncFocusCalloutHelper(
      activeKonva: KonvaNamespace,
      layer: RepairLayer,
      activeKeys: Set<string>
    ): void {
      if (!currentConfig.visibleLayers.focus || currentConfig.focusedEventId === null) return;
      const focused = currentConfig.events.find(
        (event) => event.id === currentConfig.focusedEventId
      );
      if (focused === undefined) return;
      const sourceRect =
        (focused.kind === "ai-mark" || focused.kind === "risk-flag") && focused.region !== null
          ? focused.region
          : focused.kind === "annotation"
            ? focused.region
            : null;
      if (sourceRect === null) return;
      const { width, height } = getActiveStageSize();
      const frame = getContainedImageFrame(
        width,
        height,
        currentConfig.image.widthPx,
        currentConfig.image.heightPx
      );
      const rect = imageRectToStageRect(sourceRect, frame, currentConfig.workbench.viewport);
      const key = "helper:focus-callout";
      activeKeys.add(key);
      syncMappedGroup(
        helperGroups,
        layer,
        key,
        JSON.stringify({ focusedEventId: focused.id, rect }),
        (group) => {
          addLabel(
            activeKonva,
            group,
            Math.min(width - 190, rect.xPx + rect.widthPx + 12),
            Math.max(12, rect.yPx),
            "AI SUGGESTION: Focus here",
            REPAIR_UI_COLORS.amber
          );
        }
      );
    }

    function syncSnapGuideHelper(
      activeKonva: KonvaNamespace,
      layer: RepairLayer,
      activeKeys: Set<string>
    ): void {
      if (snapGuide === null) return;
      const rect = getImageRectStageRect({
        xPx: snapGuide.xPx - 8,
        yPx: snapGuide.yPx - 8,
        widthPx: 16,
        heightPx: 16,
      });
      const key = "helper:snap-guide";
      activeKeys.add(key);
      syncMappedGroup(helperGroups, layer, key, JSON.stringify(rect), (group) => {
        group.add(
          new activeKonva.Line({
            points: [
              rect.xPx,
              rect.yPx + rect.heightPx / 2,
              rect.xPx + rect.widthPx,
              rect.yPx + rect.heightPx / 2,
            ],
            stroke: REPAIR_UI_COLORS.amber,
            strokeWidth: 1,
            listening: false,
          })
        );
        group.add(
          new activeKonva.Line({
            points: [
              rect.xPx + rect.widthPx / 2,
              rect.yPx,
              rect.xPx + rect.widthPx / 2,
              rect.yPx + rect.heightPx,
            ],
            stroke: REPAIR_UI_COLORS.amber,
            strokeWidth: 1,
            listening: false,
          })
        );
      });
    }

    function renderOverlay(): void {
      if (stage === null || layers === null || disposed) return;
      const activeStage = stage;
      const activeLayers = layers;
      const activeEntityKeys = new Set<string>();
      const activeRegionKeys = new Set<string>();
      const activeRelationshipKeys = new Set<string>();
      const activeKnowledgeKeys = new Set<string>();
      const activeHelperKeys = new Set<string>();
      clearContainer(activeLayers.grid);
      syncEntityLayerTransforms();

      addGridLayer(Konva, currentConfig, activeLayers.grid);
      if (currentConfig.visibleLayers.knowledge) {
        currentConfig.knowledgeRegions.forEach((region) => {
          const key = `knowledge:${region.id}`;
          activeKnowledgeKeys.add(key);
          syncMappedGroup(
            knowledgeRegionGroups,
            activeLayers.focus,
            key,
            JSON.stringify({
              region,
              view: currentConfig.workbench.viewport,
              image: currentConfig.image,
              guidance: currentConfig.guidance.overlaySaturation,
            }),
            (group) => {
              addKnowledgeRegion(Konva, currentConfig, group, region);
              group.opacity(
                getOverlayEntityOpacity(currentConfig, { kind: "knowledge-region", id: region.id })
              );
            }
          );
        });
      }
      currentConfig.measurementRelationships.forEach((relationship) => {
        const key = `relationship:${relationship.id}`;
        activeRelationshipKeys.add(key);
        syncMappedGroup(
          relationshipGroups,
          activeLayers.relationship,
          key,
          JSON.stringify({
            relationship,
            interaction: getMeasurementRelationshipInteractionState(currentConfig, relationship),
            investigationModeEnabled: currentConfig.workbench.investigationModeEnabled,
            guidance: currentConfig.guidance.overlaySaturation,
          }),
          (group) => {
            addMeasurementRelationship(Konva, currentConfig, group, relationship);
            group.opacity(
              getOverlayEntityOpacity(currentConfig, {
                kind: "measurement-relationship",
                id: relationship.id,
              })
            );
          }
        );
      });
      currentConfig.investigationRegions.forEach((region) => {
        const key = `region:${region.regionId}`;
        activeRegionKeys.add(key);
        syncMappedGroup(
          investigationRegionGroups,
          activeLayers.region,
          key,
          JSON.stringify({
            region,
            interaction: getEntityInteractionState(currentConfig, {
              kind: "investigation-region",
              id: region.regionId,
            }),
            guidance: currentConfig.guidance.overlaySaturation,
          }),
          (group) => {
            addInvestigationRegion(Konva, currentConfig, group, region);
            group.opacity(
              getOverlayEntityOpacity(currentConfig, {
                kind: "investigation-region",
                id: region.regionId,
              })
            );
          }
        );
      });
      currentConfig.temporarySpatialRegions.forEach((region) => {
        const key = `temporary:${region.id}`;
        activeRegionKeys.add(key);
        syncMappedGroup(
          investigationRegionGroups,
          activeLayers.region,
          key,
          JSON.stringify({
            region,
            interaction: getEntityInteractionState(currentConfig, {
              kind: "temporary-spatial-region",
              id: region.id,
            }),
            guidance: currentConfig.guidance.overlaySaturation,
          }),
          (group) => {
            addInvestigationRegion(Konva, currentConfig, group, region);
            group.opacity(
              getOverlayEntityOpacity(currentConfig, {
                kind: "temporary-spatial-region",
                id: region.id,
              })
            );
          }
        );
      });
      currentConfig.events.forEach((event) => {
        if (event.kind === "ai-mark" || event.kind === "risk-flag") {
          activeEntityKeys.add(`ai:${event.id}`);
          syncEventEntity("ai", activeLayers.ai, event, (group) => {
            addAiEvent(Konva, currentConfig, group, event);
          });
        }
        if (event.kind === "annotation") {
          activeEntityKeys.add(`annotation:${event.id}`);
          syncEventEntity("annotation", activeLayers.annotation, event, (group) => {
            addAnnotationEvent(Konva, currentConfig, group, event);
          });
        }
        if (event.kind === "measurement") {
          activeEntityKeys.add(`measurement:${event.id}`);
          syncEventEntity("measurement", activeLayers.measurement, event, (group) => {
            addMeasurementEvent(Konva, currentConfig, group, event);
          });
        }
      });
      pruneEventEntities(activeEntityKeys);
      pruneMappedGroups(investigationRegionGroups, activeRegionKeys);
      pruneMappedGroups(relationshipGroups, activeRelationshipKeys);
      pruneMappedGroups(knowledgeRegionGroups, activeKnowledgeKeys);
      syncFocusCalloutHelper(Konva, activeLayers.helper, activeHelperKeys);
      syncMarqueeHelper(Konva, activeLayers.helper, activeHelperKeys);
      syncSnapGuideHelper(Konva, activeLayers.helper, activeHelperKeys);
      syncFocusEffectHelper(Konva, activeLayers.helper, activeHelperKeys);
      pruneMappedGroups(helperGroups, activeHelperKeys);

      activeLayers.grid.batchDraw();
      activeLayers.ai.batchDraw();
      activeLayers.annotation.batchDraw();
      activeLayers.measurement.batchDraw();
      activeLayers.relationship.batchDraw();
      activeLayers.region.batchDraw();
      activeLayers.focus.batchDraw();
      activeLayers.helper.batchDraw();
      activeStage.batchDraw();
    }

    function syncStageCursor(): void {
      if (stage === null) return;
      const cursor =
        currentConfig.workbench.contextualCursor === "pan"
          ? "grab"
          : currentConfig.workbench.contextualCursor === "measurement"
            ? "crosshair"
            : currentConfig.workbench.contextualCursor === "annotate"
              ? "cell"
              : currentConfig.workbench.contextualCursor === "replay-scrub-lock"
                ? "not-allowed"
                : "default";
      stage.container().style.cursor = cursor;
    }

    function isReplayInteractionLocked(): boolean {
      return currentConfig.workbench.contextualCursor === "replay-scrub-lock";
    }

    function bindStageEvents(activeStage: RepairStage): void {
      function getPointerImagePoint(): RepairImagePoint | null {
        const pointer = activeStage.getPointerPosition();
        if (pointer === null) return null;
        const { width, height } = getActiveStageSize();
        const frame = getContainedImageFrame(
          width,
          height,
          currentConfig.image.widthPx,
          currentConfig.image.heightPx
        );
        return clampImagePoint(
          stagePointToImagePoint(
            { xPx: pointer.x, yPx: pointer.y },
            frame,
            currentConfig.workbench.viewport
          ),
          currentConfig.image.widthPx,
          currentConfig.image.heightPx
        );
      }

      activeStage.on("mousemove tap", () => {
        const point = getPointerImagePoint();
        if (point === null) return;
        currentConfig.onCursor({ xPx: Math.round(point.xPx), yPx: Math.round(point.yPx) });
        if (currentConfig.workbench.activeTool === "measurement-pin") {
          const snap = getRepairSnapAssist(point, getSnapTargets(currentConfig, ""), 42, 14, false);
          snapGuide = snap?.target ?? null;
          renderOverlay();
        } else if (snapGuide !== null) {
          snapGuide = null;
          renderOverlay();
        }
        if (marqueeStart !== null) {
          marqueeCurrent = point;
          renderOverlay();
        }
      });

      activeStage.on("wheel", (event) => {
        event.evt.preventDefault();
        if (isReplayInteractionLocked()) return;
        const delta = event.evt.deltaY > 0 ? -0.12 : 0.12;
        currentConfig.onViewportChange({
          zoom: Math.min(4, Math.max(0.5, currentConfig.workbench.viewport.zoom + delta)),
          panXPx: currentConfig.workbench.viewport.panXPx,
          panYPx: currentConfig.workbench.viewport.panYPx,
        });
      });

      activeStage.on("mousedown touchstart", () => {
        if (isReplayInteractionLocked()) return;
        if (
          currentConfig.workbench.activeTool === "select" &&
          activeStage.getPointerPosition() !== null
        ) {
          marqueeStart = getPointerImagePoint();
          marqueeCurrent = marqueeStart;
          return;
        }
        if (currentConfig.workbench.activeTool !== "pan") return;
        const pointer = activeStage.getPointerPosition();
        if (pointer === null) return;
        panStart = {
          pointerX: pointer.x,
          pointerY: pointer.y,
          panXPx: currentConfig.workbench.viewport.panXPx,
          panYPx: currentConfig.workbench.viewport.panYPx,
        };
      });

      activeStage.on("mouseup touchend", (konvaEvent) => {
        if (marqueeStart !== null && marqueeCurrent !== null) {
          const rect = {
            xPx: marqueeStart.xPx,
            yPx: marqueeStart.yPx,
            widthPx: marqueeCurrent.xPx - marqueeStart.xPx,
            heightPx: marqueeCurrent.yPx - marqueeStart.yPx,
          };
          const refs = getRepairMarqueeSelection(rect, getSelectableOverlayEntities());
          const moved = Math.abs(rect.widthPx) > 4 || Math.abs(rect.heightPx) > 4;
          marqueeStart = null;
          marqueeCurrent = null;
          if (moved) {
            suppressNextStageClick = true;
            currentConfig.onMarqueeSelect(
              refs,
              hasEventModifier(konvaEvent.evt, "shiftKey") ||
                hasEventModifier(konvaEvent.evt, "ctrlKey") ||
                hasEventModifier(konvaEvent.evt, "metaKey")
            );
          }
          renderOverlay();
        }
        panStart = null;
      });

      activeStage.on("dragmove mousemove touchmove", () => {
        if (isReplayInteractionLocked()) return;
        if (panStart === null) return;
        const pointer = activeStage.getPointerPosition();
        if (pointer === null) return;
        currentConfig.onViewportChange({
          zoom: currentConfig.workbench.viewport.zoom,
          panXPx: panStart.panXPx + pointer.x - panStart.pointerX,
          panYPx: panStart.panYPx + pointer.y - panStart.pointerY,
        });
      });

      activeStage.on("click tap", (event) => {
        if (event.target !== activeStage) return;
        if (isReplayInteractionLocked()) return;
        if (suppressNextStageClick) {
          suppressNextStageClick = false;
          return;
        }
        const pointer = activeStage.getPointerPosition();
        if (pointer === null) return;
        const { width, height } = getActiveStageSize();
        const frame = getContainedImageFrame(
          width,
          height,
          currentConfig.image.widthPx,
          currentConfig.image.heightPx
        );
        const point = clampImagePoint(
          stagePointToImagePoint(
            { xPx: pointer.x, yPx: pointer.y },
            frame,
            currentConfig.workbench.viewport
          ),
          currentConfig.image.widthPx,
          currentConfig.image.heightPx
        );
        const xPx = Math.round(point.xPx);
        const yPx = Math.round(point.yPx);
        if (currentConfig.workbench.activeTool === "measurement-pin") {
          const snap = getRepairSnapAssist(
            point,
            getSnapTargets(currentConfig, ""),
            42,
            14,
            hasEventModifier(event.evt, "shiftKey")
          );
          const targetPoint = snap?.hardSnap === true ? snap.target : point;
          currentConfig.onAddMeasurement({
            xPx: Math.round(targetPoint.xPx),
            yPx: Math.round(targetPoint.yPx),
            reference: `TP@${Math.round(targetPoint.xPx)},${Math.round(targetPoint.yPx)}`,
          });
          return;
        }
        if (currentConfig.workbench.activeTool === "select") {
          currentConfig.onSelectionClear();
          return;
        }
        if (currentConfig.workbench.activeTool === "ruler") {
          const widthPx = Math.round(currentConfig.image.pixelsPerMm * 10);
          currentConfig.onAddAnnotation({
            tool: "arrow",
            xPx,
            yPx,
            widthPx,
            heightPx: 0,
            label: "Ruler 10.0 mm",
          });
          return;
        }
        if (isRepairOverlayDrawTool(currentConfig.workbench.activeTool)) {
          currentConfig.onAddAnnotation({
            tool: currentConfig.workbench.activeTool,
            xPx,
            yPx,
            widthPx: 120,
            heightPx: 80,
          });
        }
      });

      const stageContainer = activeStage.container();
      stageContainer.tabIndex = 0;
      stageContainer.addEventListener("keydown", (event) => {
        if (event.defaultPrevented) return;
        if (isReplayInteractionLocked()) return;
        if (event.key === "Tab") {
          const entities = getSelectableOverlayEntities();
          if (entities.length === 0) return;
          event.preventDefault();
          event.stopPropagation();
          const current =
            currentConfig.workbench.selection.inspectorEntityRef ??
            currentConfig.workbench.selection.selectedEntityRefs.at(-1) ??
            null;
          const currentIndex =
            current === null
              ? -1
              : entities.findIndex((entity) => repairOverlayRefsEqual(entity.ref, current));
          const direction = event.shiftKey ? -1 : 1;
          const nextIndex =
            (currentIndex + direction + entities.length) % Math.max(1, entities.length);
          const next = entities[nextIndex];
          if (next !== undefined) {
            currentConfig.onMarqueeSelect([next.ref], false);
          }
          return;
        }
        if (event.key === "Enter") {
          const ref =
            currentConfig.workbench.selection.inspectorEntityRef ??
            currentConfig.workbench.selection.selectedEntityRefs.at(-1) ??
            null;
          if (ref !== null) {
            event.preventDefault();
            event.stopPropagation();
            currentConfig.onEntityFocus(ref);
          }
          return;
        }
        const step = event.shiftKey ? 8 : 1;
        const delta =
          event.key === "ArrowLeft"
            ? { xPx: -step, yPx: 0 }
            : event.key === "ArrowRight"
              ? { xPx: step, yPx: 0 }
              : event.key === "ArrowUp"
                ? { xPx: 0, yPx: -step }
                : event.key === "ArrowDown"
                  ? { xPx: 0, yPx: step }
                  : null;
        if (delta !== null) {
          event.preventDefault();
          event.stopPropagation();
          currentConfig.onNudgeSelection(delta, event.shiftKey);
        }
      });
    }

    function ensureStage(): boolean {
      if (stage !== null) return true;
      const size = getRenderableSize();
      if (size === null) {
        currentConfig.container.dataset["mountDeferred"] = "true";
        delete currentConfig.container.dataset["mounting"];
        return false;
      }

      stage = new Konva.Stage({
        container: currentConfig.container as HTMLDivElement,
        width: size.width,
        height: size.height,
      });
      layers = {
        grid: new Konva.Layer(),
        ai: new Konva.Layer(),
        annotation: new Konva.Layer(),
        measurement: new Konva.Layer(),
        relationship: new Konva.Layer(),
        region: new Konva.Layer(),
        focus: new Konva.Layer(),
        helper: new Konva.Layer(),
      };
      layers.grid.listening(false);
      layers.focus.listening(false);
      layers.helper.listening(false);

      stage.add(layers.grid);
      stage.add(layers.relationship);
      stage.add(layers.ai);
      stage.add(layers.annotation);
      stage.add(layers.measurement);
      stage.add(layers.region);
      stage.add(layers.focus);
      stage.add(layers.helper);
      bindStageEvents(stage);

      delete currentConfig.container.dataset["mounting"];
      delete currentConfig.container.dataset["mountDeferred"];
      currentConfig.container.dataset["mounted"] = "true";
      return true;
    }

    function resize(): void {
      if (disposed) return;
      if (ensureStage() === false || stage === null) return;
      const size = getRenderableSize();
      if (size === null) {
        currentConfig.container.dataset["mountDeferred"] = "true";
        return;
      }
      if (stage.width() !== size.width || stage.height() !== size.height) {
        stage.size(size);
      }
      syncStageCursor();
      renderOverlay();
    }

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            resize();
          });
    resizeObserver?.observe(currentConfig.container);
    resize();

    return {
      update: (nextConfig) => {
        currentConfig = nextConfig;
        resize();
      },
      resize,
      destroy: () => {
        disposed = true;
        resizeObserver?.disconnect();
        stage?.destroy();
        delete currentConfig.container.dataset["mounted"];
        delete currentConfig.container.dataset["mounting"];
        delete currentConfig.container.dataset["mountDeferred"];
      },
    };
  } catch (error) {
    delete config.container.dataset["mounted"];
    delete config.container.dataset["mounting"];
    delete config.container.dataset["mountDeferred"];
    throw error;
  }
}
