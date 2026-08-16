import { asLabRecord } from "./lab-primitives.js";
import {
  LAB_OPERATION_CAPABILITIES,
  LAB_OPERATION_SETTINGS_DEFAULTS,
  normalizeLabOperationSettings as normalizeCoreLabOperationSettings,
} from "./lab-capabilities-core.js";
import type {
  LabOperationCapabilityId,
  LabOperationSettingsMap,
  LabSettingsRecord,
} from "./lab-capabilities-core.js";
import { pickBoolean, pickNumber, pickOption } from "./lab-settings-normalization.js";

export * from "./lab-capabilities-core.js";

function readTransientPngDataUrl(value: unknown) {
  return typeof value === "string" &&
    value.length <= 4_000_000 &&
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value)
    ? value
    : "";
}

function normalizeImageComparisonSettings(value: unknown): LabSettingsRecord {
  const defaults = LAB_OPERATION_SETTINGS_DEFAULTS["image-comparison"];
  const record = asLabRecord(value);
  const source = asLabRecord(record["image-comparison"] ?? record);
  return {
    ...normalizeCoreLabOperationSettings("image-comparison", source),
    showImageFrames: pickBoolean(source["showImageFrames"], true),
    primaryZoom: pickNumber(source["primaryZoom"], Number(defaults["primaryZoom"]), 0.25, 4, 0.05),
    primaryAspectLock: pickBoolean(
      source["primaryAspectLock"],
      Boolean(defaults["primaryAspectLock"])
    ),
    primaryScaleX: pickNumber(
      source["primaryScaleX"],
      Number(defaults["primaryScaleX"]),
      0.25,
      4,
      0.05
    ),
    primaryScaleY: pickNumber(
      source["primaryScaleY"],
      Number(defaults["primaryScaleY"]),
      0.25,
      4,
      0.05
    ),
    primaryOffsetX: pickNumber(
      source["primaryOffsetX"],
      Number(defaults["primaryOffsetX"]),
      -100,
      100,
      0.1
    ),
    primaryOffsetY: pickNumber(
      source["primaryOffsetY"],
      Number(defaults["primaryOffsetY"]),
      -100,
      100,
      0.1
    ),
    primaryRotation: pickNumber(
      source["primaryRotation"],
      Number(defaults["primaryRotation"]),
      -180,
      180,
      0.5
    ),
    referenceZoom: pickNumber(
      source["referenceZoom"],
      Number(defaults["referenceZoom"]),
      0.25,
      4,
      0.05
    ),
    referenceAspectLock: pickBoolean(
      source["referenceAspectLock"],
      Boolean(defaults["referenceAspectLock"])
    ),
    referenceScaleX: pickNumber(
      source["referenceScaleX"],
      Number(defaults["referenceScaleX"]),
      0.25,
      4,
      0.05
    ),
    referenceScaleY: pickNumber(
      source["referenceScaleY"],
      Number(defaults["referenceScaleY"]),
      0.25,
      4,
      0.05
    ),
    referenceOffsetX: pickNumber(
      source["referenceOffsetX"],
      Number(defaults["referenceOffsetX"]),
      -100,
      100,
      0.1
    ),
    referenceOffsetY: pickNumber(
      source["referenceOffsetY"],
      Number(defaults["referenceOffsetY"]),
      -100,
      100,
      0.1
    ),
    referenceRotation: pickNumber(
      source["referenceRotation"],
      Number(defaults["referenceRotation"]),
      -180,
      180,
      0.5
    ),
    compositeMode: pickOption(
      source["compositeMode"],
      ["none", "primary-left-reference-right", "reference-left-primary-right"],
      String(defaults["compositeMode"])
    ),
    centerGuide: pickBoolean(source["centerGuide"], Boolean(defaults["centerGuide"])),
    marker1Enabled: pickBoolean(source["marker1Enabled"], Boolean(defaults["marker1Enabled"])),
    marker1Side: pickOption(
      source["marker1Side"],
      ["primary", "reference"],
      String(defaults["marker1Side"])
    ),
    marker1X: pickNumber(source["marker1X"], Number(defaults["marker1X"]), 0, 100, 0.5),
    marker1Y: pickNumber(source["marker1Y"], Number(defaults["marker1Y"]), 0, 100, 0.5),
    marker2Enabled: pickBoolean(source["marker2Enabled"], Boolean(defaults["marker2Enabled"])),
    marker2Side: pickOption(
      source["marker2Side"],
      ["primary", "reference"],
      String(defaults["marker2Side"])
    ),
    marker2X: pickNumber(source["marker2X"], Number(defaults["marker2X"]), 0, 100, 0.5),
    marker2Y: pickNumber(source["marker2Y"], Number(defaults["marker2Y"]), 0, 100, 0.5),
    marker3Enabled: pickBoolean(source["marker3Enabled"], Boolean(defaults["marker3Enabled"])),
    marker3Side: pickOption(
      source["marker3Side"],
      ["primary", "reference"],
      String(defaults["marker3Side"])
    ),
    marker3X: pickNumber(source["marker3X"], Number(defaults["marker3X"]), 0, 100, 0.5),
    marker3Y: pickNumber(source["marker3Y"], Number(defaults["marker3Y"]), 0, 100, 0.5),
    drawingQuickExport: source["drawingQuickExport"] === true,
    annotationOverlayDataUrl: readTransientPngDataUrl(source["annotationOverlayDataUrl"]),
  };
}

export function normalizeLabOperationSettings(
  capabilityId: LabOperationCapabilityId,
  value: unknown
): LabSettingsRecord {
  return capabilityId === "image-comparison"
    ? normalizeImageComparisonSettings(value)
    : normalizeCoreLabOperationSettings(capabilityId, value);
}

export function normalizeLabOperationSettingsMap(value: unknown): LabOperationSettingsMap {
  const record = asLabRecord(value);
  return LAB_OPERATION_CAPABILITIES.reduce<LabOperationSettingsMap>(function (
    settings,
    capability
  ) {
    settings[capability.id] = normalizeLabOperationSettings(capability.id, record[capability.id]);
    return settings;
  }, {} as LabOperationSettingsMap);
}
