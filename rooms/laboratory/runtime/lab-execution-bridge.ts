import type { LabExecutionDescriptor } from "./lab-execution-descriptor.js";
import { resolveLabI18n, type LabI18nLocale } from "./lab-i18n.js";

export type LabExecutionBridge = {
  adapter: string;
  operation: string;
  inputContract: {
    required: string[];
    optional: string[];
    constraints?: Record<string, string>;
  };
  outputContract: {
    type: "timeseries" | "segments" | "scalar" | "embedding";
    fields: string[];
    interpretationHint: string;
  };
  summary: string;
};

const TOOL_ADAPTERS: Record<string, string> = {
  "audio-analysis": "librosa",
  "embedding-extraction": "yamnet",
  "media-segmentation": "ffmpeg",
  "metadata-analysis": "exiftool",
  "object-analysis": "onnx-runtime",
  "ocr-analysis": "tesseract",
  "signal-inspection": "pyAudioAnalysis",
  "speech-transcription": "transcript-runtime",
  "visual-operation": "ffmpeg",
};

const INTENT_OPERATIONS: Record<string, string> = {
  "boundary-range-framing": "media_segment_extraction",
  "object-region-detection": "object_region_detection",
  "provenance-metadata-review": "metadata_provenance_review",
  "scene-boundary-detection": "scene_boundary_detection",
  "motion-continuity-inspection": "frame_diff_analysis",
  "source-separation-framing": "source_separation_preview",
  "spatial-crop-framing": "roi_crop_preview",
  segmentation: "media_segment_extraction",
  "spectral-cleanup-framing": "audio_cleanup_preview",
  "spectral-variation-inspection": "spectral_features_analysis",
  "text-evidence-extraction": "ocr_region_extraction",
  "temporal-inspection": "temporal_window_scan",
  "temporal-variation-inspection": "temporal_window_scan",
  "visual-clarity-inspection": "visual_clarity_preview",
};

const REQUIRED_FIELDS_BY_SHAPE: Record<string, readonly string[]> = {
  "clarity-region": ["region"],
  "clip-boundary": ["range", "boundary"],
  "generic-evidence-window": ["scope", "evidenceWindow"],
  "motion-window": ["timeWindow", "motionScope"],
  "narrowed-window": ["scope", "evidenceWindow"],
  "regional-window": ["region", "timeWindow"],
  "spectral-window": ["timeWindow", "frequencyBands"],
  "stability-window": ["timeWindow", "referenceScope"],
  "temporal-window": ["timeWindow"],
};

const FIELD_CONSTRAINTS: Record<string, string> = {
  boundary: "boundary-marker",
  evidenceWindow: "abstract-range",
  frequencyBands: "hz-range",
  range: "seconds-range",
  region: "normalized-rectangle",
  timeWindow: "seconds-range",
};

function getAdapter(tool: string) {
  return TOOL_ADAPTERS[tool] ?? "pyAudioAnalysis";
}

function getOperation(intent: string) {
  return INTENT_OPERATIONS[intent] ?? "evidence_shape_description";
}

function buildInputContract(
  descriptor: LabExecutionDescriptor
): LabExecutionBridge["inputContract"] {
  const fields = descriptor.paramShape.fields;
  const requiredSource = REQUIRED_FIELDS_BY_SHAPE[descriptor.paramShape.type] ?? fields.slice(0, 1);
  const required = requiredSource.filter(function (field) {
    return fields.includes(field);
  });
  const optional = fields.filter(function (field) {
    return !required.includes(field);
  });
  const constraints = fields.reduce<Record<string, string>>(function (result, field) {
    const constraint = FIELD_CONSTRAINTS[field];
    if (constraint !== undefined) {
      result[field] = constraint;
    }
    return result;
  }, {});
  return Object.keys(constraints).length > 0
    ? {
        required,
        optional,
        constraints,
      }
    : {
        required,
        optional,
      };
}

function buildOutputContract(
  descriptor: LabExecutionDescriptor
): LabExecutionBridge["outputContract"] {
  if (descriptor.tool === "audio-analysis") {
    return {
      type: "timeseries",
      fields: ["timestamp", "spectralCentroid", "bandwidth"],
      interpretationHint: "spectral variation over time",
    };
  }
  if (descriptor.tool === "media-segmentation") {
    return {
      type: "segments",
      fields: ["start", "end"],
      interpretationHint: "time-based segment boundaries",
    };
  }
  if (descriptor.tool === "speech-transcription") {
    return {
      type: "segments",
      fields: ["timestamp", "text"],
      interpretationHint: "transcribed speech segments",
    };
  }
  if (descriptor.tool === "embedding-extraction") {
    return {
      type: "embedding",
      fields: ["timestamp", "vector"],
      interpretationHint: "embedding representation over time",
    };
  }
  if (descriptor.intent === "motion-continuity-inspection") {
    return {
      type: "timeseries",
      fields: ["timestamp", "frameDelta", "continuityScore"],
      interpretationHint: "motion continuity over time",
    };
  }
  return {
    type: "scalar",
    fields: ["score", "confidence"],
    interpretationHint: "summarized signal evidence",
  };
}

function formatOutputType(type: LabExecutionBridge["outputContract"]["type"]) {
  if (type === "timeseries") {
    return "time-series";
  }
  if (type === "segments") {
    return "segment";
  }
  return type;
}

function buildBridgeSummary(input: {
  adapter: string;
  operation: string;
  outputType: LabExecutionBridge["outputContract"]["type"];
  shape: string;
}) {
  return `maps to ${input.adapter} using ${input.operation}, with a ${input.shape} shaped input and ${formatOutputType(input.outputType)} output`;
}

export function buildExecutionBridge(descriptor: LabExecutionDescriptor): LabExecutionBridge {
  const adapter = getAdapter(descriptor.tool);
  const operation = getOperation(descriptor.intent);
  const inputContract = buildInputContract(descriptor);
  const outputContract = buildOutputContract(descriptor);
  return {
    adapter,
    operation,
    inputContract,
    outputContract,
    summary: buildBridgeSummary({
      adapter,
      operation,
      outputType: outputContract.type,
      shape: descriptor.paramShape.type,
    }),
  };
}

export function formatExecutionBridgeAdvisory(
  bridge: LabExecutionBridge,
  locale: LabI18nLocale = "en"
): string {
  const view = resolveLabI18n("bridge.view", locale);
  if (locale === "tr") {
    const requiredInput = bridge.inputContract.required.join(", ") || "genel";
    return `${view}: Bu yol ${bridge.adapter} adaptörüne ${bridge.operation} işlemiyle bağlanır; ${requiredInput} girdisi ve ${formatOutputType(bridge.outputContract.type)} çıktısı kullanır.`;
  }
  return `${view}: This path ${bridge.summary}.`;
}
