import type { LabExecutionPayloadPreview, LabExecutionPlan } from "../domain/lab-types.js";
import { resolveLabI18n, type LabI18nLocale } from "./lab-i18n.js";

export type LabExecutionDescriptorParamShapeType =
  | "clip-boundary"
  | "clarity-region"
  | "generic-evidence-window"
  | "motion-window"
  | "narrowed-window"
  | "regional-window"
  | "spectral-window"
  | "stability-window"
  | "temporal-window";

export type LabExecutionDescriptorParamShape = {
  type: LabExecutionDescriptorParamShapeType;
  fields: string[];
};

export type LabExecutionDescriptor = {
  tool: string;
  intent: string;
  paramShape: LabExecutionDescriptorParamShape;
};

type LabExecutionDescriptorInput = {
  actionType: string;
  executionPayloadPreview?: LabExecutionPayloadPreview | null;
  executionPlan?: LabExecutionPlan | null;
};

type LabExecutionDescriptorMapping = {
  tool: string;
  intent: string;
  paramShapeType: LabExecutionDescriptorParamShapeType;
  advisoryStyle: "alignment" | "behavior" | "pattern";
};

const PARAM_SHAPE_FIELDS: Record<LabExecutionDescriptorParamShapeType, readonly string[]> = {
  "clip-boundary": ["range", "boundary", "packageScope"],
  "clarity-region": ["region", "claritySignal", "frameContext"],
  "generic-evidence-window": ["scope", "evidenceWindow", "reviewSurface"],
  "motion-window": ["timeWindow", "motionScope", "referenceFrame"],
  "narrowed-window": ["scope", "evidenceWindow", "comparisonSurface"],
  "regional-window": ["region", "timeWindow", "frameContext"],
  "spectral-window": ["timeWindow", "frequencyBands", "signalFocus"],
  "stability-window": ["timeWindow", "referenceScope", "stabilitySignal"],
  "temporal-window": ["timeWindow", "signalScope", "variationSurface"],
};

const FALLBACK_DESCRIPTOR_MAPPING: LabExecutionDescriptorMapping = {
  tool: "signal-inspection",
  intent: "evidence-shape-description",
  paramShapeType: "generic-evidence-window",
  advisoryStyle: "behavior",
};

const ACTION_DESCRIPTOR_MAPPINGS: Record<string, LabExecutionDescriptorMapping> = {
  "analyze-segment": {
    tool: "media-segmentation",
    intent: "temporal-variation-inspection",
    paramShapeType: "temporal-window",
    advisoryStyle: "pattern",
  },
  "enhance-visual": {
    tool: "visual-analysis",
    intent: "visual-clarity-inspection",
    paramShapeType: "clarity-region",
    advisoryStyle: "alignment",
  },
  "enhance-frame": {
    tool: "visual-operation",
    intent: "visual-clarity-inspection",
    paramShapeType: "clarity-region",
    advisoryStyle: "alignment",
  },
  "crop-region": {
    tool: "visual-operation",
    intent: "spatial-crop-framing",
    paramShapeType: "regional-window",
    advisoryStyle: "pattern",
  },
  "clean-audio": {
    tool: "audio-analysis",
    intent: "spectral-cleanup-framing",
    paramShapeType: "spectral-window",
    advisoryStyle: "pattern",
  },
  "separate-stems": {
    tool: "audio-analysis",
    intent: "source-separation-framing",
    paramShapeType: "spectral-window",
    advisoryStyle: "pattern",
  },
  "extract-clip": {
    tool: "media-segmentation",
    intent: "boundary-range-framing",
    paramShapeType: "clip-boundary",
    advisoryStyle: "pattern",
  },
  "focus-region": {
    tool: "visual-analysis",
    intent: "spatial-focus-inspection",
    paramShapeType: "regional-window",
    advisoryStyle: "alignment",
  },
  "generic-narrowed-inspection": {
    tool: "signal-inspection",
    intent: "scope-reduction-comparison",
    paramShapeType: "narrowed-window",
    advisoryStyle: "behavior",
  },
  "inspect-audio": {
    tool: "audio-analysis",
    intent: "spectral-variation-inspection",
    paramShapeType: "spectral-window",
    advisoryStyle: "alignment",
  },
  "inspect-motion": {
    tool: "motion-analysis",
    intent: "motion-continuity-inspection",
    paramShapeType: "motion-window",
    advisoryStyle: "alignment",
  },
  "ocr-region": {
    tool: "ocr-analysis",
    intent: "text-evidence-extraction",
    paramShapeType: "regional-window",
    advisoryStyle: "alignment",
  },
  "metadata-audit": {
    tool: "metadata-analysis",
    intent: "provenance-metadata-review",
    paramShapeType: "generic-evidence-window",
    advisoryStyle: "behavior",
  },
  "detect-scenes": {
    tool: "media-segmentation",
    intent: "scene-boundary-detection",
    paramShapeType: "temporal-window",
    advisoryStyle: "pattern",
  },
  "detect-objects": {
    tool: "object-analysis",
    intent: "object-region-detection",
    paramShapeType: "regional-window",
    advisoryStyle: "alignment",
  },
  "narrowed-inspection": {
    tool: "signal-inspection",
    intent: "scope-reduction-comparison",
    paramShapeType: "narrowed-window",
    advisoryStyle: "behavior",
  },
  "slow-playback-inspection": {
    tool: "signal-inspection",
    intent: "temporal-detail-comparison",
    paramShapeType: "temporal-window",
    advisoryStyle: "behavior",
  },
  "stabilize-segment": {
    tool: "motion-analysis",
    intent: "stability-pattern-inspection",
    paramShapeType: "stability-window",
    advisoryStyle: "pattern",
  },
};

function getDescriptorMapping(actionType: string) {
  return ACTION_DESCRIPTOR_MAPPINGS[actionType] ?? FALLBACK_DESCRIPTOR_MAPPING;
}

function getPayloadActionShapeType(
  actionType: string
): LabExecutionDescriptorParamShapeType | null {
  const mapping = ACTION_DESCRIPTOR_MAPPINGS[actionType];
  return mapping?.paramShapeType ?? null;
}

function getPayloadInputShapeType(
  payload: LabExecutionPayloadPreview
): LabExecutionDescriptorParamShapeType | null {
  const previewInput = payload.dryRunShape.previewInput;
  if ("audioWindow" in previewInput) {
    return "spectral-window";
  }
  if ("clipWindow" in previewInput) {
    return "clip-boundary";
  }
  if ("motionWindow" in previewInput) {
    return "motion-window";
  }
  if ("roi" in previewInput) {
    return "regional-window";
  }
  return null;
}

function payloadPassesPlanSanity(input: LabExecutionDescriptorInput) {
  const payload = input.executionPayloadPreview ?? null;
  const plan = input.executionPlan ?? null;
  if (payload === null || plan === null) {
    return true;
  }
  return payload.actionType === input.actionType && plan.actionType === input.actionType;
}

function selectParamShapeType(
  input: LabExecutionDescriptorInput,
  mapping: LabExecutionDescriptorMapping
) {
  const payload = input.executionPayloadPreview ?? null;
  if (payload !== null && payloadPassesPlanSanity(input)) {
    return (
      getPayloadInputShapeType(payload) ??
      getPayloadActionShapeType(payload.actionType) ??
      mapping.paramShapeType
    );
  }
  return mapping.paramShapeType;
}

function buildParamShape(
  type: LabExecutionDescriptorParamShapeType
): LabExecutionDescriptorParamShape {
  return {
    type,
    fields: [...PARAM_SHAPE_FIELDS[type]],
  };
}

export function buildExecutionDescriptor(
  input: LabExecutionDescriptorInput
): LabExecutionDescriptor {
  const mapping = getDescriptorMapping(input.actionType);
  return {
    tool: mapping.tool,
    intent: mapping.intent,
    paramShape: buildParamShape(selectParamShapeType(input, mapping)),
  };
}

export function formatExecutionDescriptorAdvisory(input: {
  actionType: string;
  descriptor: LabExecutionDescriptor;
  locale?: LabI18nLocale;
}) {
  const mapping = getDescriptorMapping(input.actionType);
  const shape = input.descriptor.paramShape.type;
  const locale = input.locale ?? "en";
  const view = resolveLabI18n("descriptor.view", locale);
  if (locale === "tr") {
    if (mapping.advisoryStyle === "pattern") {
      return `${view}: ${shape} biçimli bir ${input.descriptor.tool} örüntüsünü açıklar.`;
    }
    if (mapping.advisoryStyle === "behavior") {
      return `${view}: ${input.descriptor.intent}, ${input.descriptor.tool} üzerinden temsil edilir (${shape} biçimi).`;
    }
    return `${view}: ${input.descriptor.tool} ile uyumlu (${shape} biçimi).`;
  }
  if (mapping.advisoryStyle === "pattern") {
    return `${view}: describes a ${input.descriptor.tool} pattern with ${shape} shape.`;
  }
  if (mapping.advisoryStyle === "behavior") {
    return `${view}: ${input.descriptor.intent} is represented through ${input.descriptor.tool} (${shape} shape).`;
  }
  return `${view}: aligns with ${input.descriptor.tool} (${shape} shape).`;
}
