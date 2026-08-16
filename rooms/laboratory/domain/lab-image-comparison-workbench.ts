import type { LabSettingsRecord } from "./lab-capabilities.js";

type LabImageComparisonSide = "primary" | "reference";
type LabImageComparisonCompositeMode =
  "none" | "primary-left-reference-right" | "reference-left-primary-right";

type LabImageComparisonTransform = {
  aspectLocked: boolean;
  offsetX: number;
  offsetY: number;
  rotationDeg: number;
  scaleX: number;
  scaleY: number;
  zoom: number;
};

type LabImageComparisonMarker = {
  enabled: boolean;
  id: 1 | 2 | 3;
  side: LabImageComparisonSide;
  x: number;
  y: number;
};

type LabImageComparisonGeometry = {
  compositeMode: LabImageComparisonCompositeMode;
  centerGuide: boolean;
  markers: LabImageComparisonMarker[];
  transforms: Record<LabImageComparisonSide, LabImageComparisonTransform>;
};

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readTransform(
  settings: LabSettingsRecord,
  side: LabImageComparisonSide
): LabImageComparisonTransform {
  const prefix = side === "primary" ? "primary" : "reference";
  return {
    aspectLocked: readBoolean(settings[`${prefix}AspectLock`], true),
    offsetX: clamp(settings[`${prefix}OffsetX`], -100, 100, 0),
    offsetY: clamp(settings[`${prefix}OffsetY`], -100, 100, 0),
    rotationDeg: clamp(settings[`${prefix}Rotation`], -180, 180, 0),
    scaleX: clamp(settings[`${prefix}ScaleX`], 0.25, 4, 1),
    scaleY: clamp(settings[`${prefix}ScaleY`], 0.25, 4, 1),
    zoom: clamp(settings[`${prefix}Zoom`], 0.25, 4, 1),
  };
}

function readCompositeMode(value: unknown): LabImageComparisonCompositeMode {
  return value === "primary-left-reference-right" || value === "reference-left-primary-right"
    ? value
    : "none";
}

function readMarker(settings: LabSettingsRecord, id: 1 | 2 | 3): LabImageComparisonMarker {
  const sideValue = settings[`marker${String(id)}Side`];
  return {
    enabled: readBoolean(settings[`marker${String(id)}Enabled`], false),
    id,
    side: sideValue === "reference" ? "reference" : "primary",
    x: clamp(settings[`marker${String(id)}X`], 0, 100, 50),
    y: clamp(settings[`marker${String(id)}Y`], 0, 100, 50),
  };
}

export function readImageComparisonGeometry(
  settings: LabSettingsRecord
): LabImageComparisonGeometry {
  return {
    centerGuide: readBoolean(settings["centerGuide"], true),
    compositeMode: readCompositeMode(settings["compositeMode"]),
    markers: [readMarker(settings, 1), readMarker(settings, 2), readMarker(settings, 3)],
    transforms: {
      primary: readTransform(settings, "primary"),
      reference: readTransform(settings, "reference"),
    },
  };
}

export function buildImageComparisonTransformCss(transform: LabImageComparisonTransform) {
  const effectiveScaleY = transform.aspectLocked ? transform.scaleX : transform.scaleY;
  const scaleX = transform.zoom * transform.scaleX;
  const scaleY = transform.zoom * effectiveScaleY;
  return [
    `translate(${String(transform.offsetX)}%, ${String(transform.offsetY)}%)`,
    `rotate(${String(transform.rotationDeg)}deg)`,
    `scale(${String(scaleX)}, ${String(scaleY)})`,
  ].join(" ");
}

function distance(a: LabImageComparisonMarker, b: LabImageComparisonMarker) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function getImageComparisonMarkerMetrics(settings: LabSettingsRecord) {
  const geometry = readImageComparisonGeometry(settings);
  function sideMetrics(side: LabImageComparisonSide) {
    const markers = geometry.markers.filter(function (marker) {
      return marker.enabled && marker.side === side;
    });
    const byId = new Map(markers.map((marker) => [marker.id, marker]));
    const first = byId.get(1);
    const second = byId.get(2);
    const third = byId.get(3);
    return {
      count: markers.length,
      d12: first && second ? distance(first, second) : null,
      d23: second && third ? distance(second, third) : null,
      d13: first && third ? distance(first, third) : null,
    };
  }
  return {
    primary: sideMetrics("primary"),
    reference: sideMetrics("reference"),
  };
}
