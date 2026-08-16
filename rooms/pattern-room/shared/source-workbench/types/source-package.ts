import type { PatternEdgeType, PatternLayer } from "../../types/pattern-room-domain.js";
import type { SourceKind } from "./source-kind.js";
import { isSourceKind } from "./source-kind.js";
import type { PatternSourceType } from "../../types/pattern-room-domain.js";

export type SourceObservationType = "pattern" | "correlation" | "frequency" | "anomaly" | "other";

export type SourcePackageItem = {
  sourceItemId: string;
  label: string;
  content?: string | null;
  order?: number | null;
  timecodeStart?: string | null;
  timecodeEnd?: string | null;
  origin: string | null;
  metadata: Record<string, unknown>;
};

export type SourceSegment = {
  segmentId: string;
  sourceItemId: string | null;
  label: string;
  text: string;
  order: number | null;
  page: string | null;
  timecode: string | null;
  speaker: string | null;
  metadata: Record<string, unknown>;
};

export type SourceQuote = {
  quoteId: string;
  sourceItemId: string | null;
  segmentId: string | null;
  label: string;
  excerpt: string;
  context: string | null;
  page: string | null;
  timecode: string | null;
  speaker: string | null;
  metadata: Record<string, unknown>;
};

export type SourceObservation = {
  observationId: string;
  observationType: SourceObservationType;
  label: string;
  content: string;
  relatedQuoteIds: readonly string[];
  metadata: Record<string, unknown>;
};

export type SourceMotif = {
  motifId: string;
  label: string;
  content: string;
  relatedQuoteIds: readonly string[];
  metadata: Record<string, unknown>;
};

export type SourceUncertainty = {
  uncertaintyId: string;
  label: string;
  content: string;
  relatedQuoteIds: readonly string[];
  metadata: Record<string, unknown>;
};

export type SourceNumericPattern = {
  patternId: string;
  label: string;
  content: string;
  value: string | null;
  relatedQuoteIds: readonly string[];
  metadata: Record<string, unknown>;
};

export type SourceReference = {
  referenceId: string;
  sourceId: string;
  targetId: string;
  edgeType: PatternEdgeType | null;
  note: string | null;
  metadata: Record<string, unknown>;
};

export type SourcePackage = {
  sourcePackageId: string;
  sourceKind: SourceKind;
  title: string;
  origin: string;
  language: string;
  createdAt: string;
  sourceItems: readonly SourcePackageItem[];
  cleanedText: string | null;
  segments: readonly SourceSegment[];
  quotes: readonly SourceQuote[];
  observations: readonly SourceObservation[];
  motifs: readonly SourceMotif[];
  uncertainties: readonly SourceUncertainty[];
  numericPatterns: readonly SourceNumericPattern[];
  references: readonly SourceReference[];
  metadata: Record<string, unknown>;
};

export type SourceImportSourceDraft = {
  draftId: string;
  label: string;
  origin: string;
  note: string;
  sourceKind: SourceKind;
  patternSourceType: PatternSourceType;
  segments?: readonly SourceImportSourceSegmentDraft[];
};

export type SourceImportSourceSegmentDraft = {
  id: string;
  label: string;
  text: string;
  order: number;
};

export type SourceImportEvidenceDraft = {
  draftId: string;
  label: string;
  excerpt: string;
  interpretation: string | null;
  layer: Extract<PatternLayer, "evidence">;
  sourceQuoteId: string;
  sourceItemId: string | null;
  page: string | null;
  timecode: string | null;
  speaker: string | null;
  context: string | null;
};

export type SourceImportNodeOriginKind =
  "motif" | "observation" | "uncertainty" | "numeric_pattern";

export type SourceImportNodeDraft = {
  draftId: string;
  nodeType: "inspiration" | "uncertainty" | "claim";
  label: string;
  content: string;
  originKind: SourceImportNodeOriginKind;
};

export type SourceImportEdgeDraft = {
  draftId: string;
  edgeType: PatternEdgeType;
  sourceDraftId: string;
  targetDraftId: string;
  note: string | null;
};

export type SourceImportNoteDraft = {
  draftId: string;
  text: string;
};

export type ImportWarning = {
  code: string;
  message: string;
  relatedIds: readonly string[];
};

export type ImportStats = {
  sourcesCreated: number;
  evidenceCreated: number;
  nodesCreated: number;
  edgesCreated: number;
  notesCreated: number;
  duplicatesSkipped: number;
  itemsDropped: number;
};

export type SourceImportResult = {
  sources: readonly SourceImportSourceDraft[];
  evidence: readonly SourceImportEvidenceDraft[];
  nodes: readonly SourceImportNodeDraft[];
  edges: readonly SourceImportEdgeDraft[];
  notes: readonly SourceImportNoteDraft[];
  warnings: readonly ImportWarning[];
  stats: ImportStats;
};

export type SourceImportLimits = {
  quotes: number;
  motifs: number;
  observations: number;
  uncertainties: number;
  numericPatterns: number;
  edges: number;
};

export type SourceImportOptions = {
  existingOrigins?: readonly string[];
  existingPackageIds?: readonly string[];
  limits?: Partial<SourceImportLimits>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && Array.isArray(value) === false;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    const text = readNonEmptyString(entry);
    return text === null ? [] : [text];
  });
}

function readMetadata(value: unknown): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function readObservationType(value: unknown): SourceObservationType {
  if (
    value === "pattern" ||
    value === "correlation" ||
    value === "frequency" ||
    value === "anomaly" ||
    value === "other"
  ) {
    return value;
  }

  return "other";
}

function readEdgeType(value: unknown): PatternEdgeType | null {
  if (
    value === "supports" ||
    value === "contradicts" ||
    value === "references" ||
    value === "derived_from" ||
    value === "inspired_by" ||
    value === "questions" ||
    value === "needs_review"
  ) {
    return value;
  }

  return null;
}

function parseSourcePackageItems(value: unknown): SourcePackageItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const sourceItemId = readNonEmptyString(entry["sourceItemId"]);
    const label = readNonEmptyString(entry["label"]);
    if (sourceItemId === null || label === null) {
      return [];
    }

    return [
      {
        sourceItemId,
        label,
        content: readOptionalString(entry["content"]),
        order: readOptionalNumber(entry["order"]),
        timecodeStart: readOptionalString(entry["timecodeStart"]),
        timecodeEnd: readOptionalString(entry["timecodeEnd"]),
        origin: readOptionalString(entry["origin"]),
        metadata: readMetadata(entry["metadata"]),
      },
    ];
  });
}

function parseSegments(value: unknown): SourceSegment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const segmentId = readNonEmptyString(entry["segmentId"]);
    const label = readNonEmptyString(entry["label"]);
    const text = readNonEmptyString(entry["text"]);
    if (segmentId === null || label === null || text === null) {
      return [];
    }

    return [
      {
        segmentId,
        sourceItemId: readOptionalString(entry["sourceItemId"]),
        label,
        text,
        order: readOptionalNumber(entry["order"]),
        page: readOptionalString(entry["page"]),
        timecode: readOptionalString(entry["timecode"]),
        speaker: readOptionalString(entry["speaker"]),
        metadata: readMetadata(entry["metadata"]),
      },
    ];
  });
}

function parseQuotes(value: unknown): SourceQuote[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const quoteId = readNonEmptyString(entry["quoteId"]);
    const label = readNonEmptyString(entry["label"]);
    const excerpt = readNonEmptyString(entry["excerpt"]);
    if (quoteId === null || label === null || excerpt === null) {
      return [];
    }

    return [
      {
        quoteId,
        sourceItemId: readOptionalString(entry["sourceItemId"]),
        segmentId: readOptionalString(entry["segmentId"]),
        label,
        excerpt,
        context: readOptionalString(entry["context"]),
        page: readOptionalString(entry["page"]),
        timecode: readOptionalString(entry["timecode"]),
        speaker: readOptionalString(entry["speaker"]),
        metadata: readMetadata(entry["metadata"]),
      },
    ];
  });
}

function parseObservations(value: unknown): SourceObservation[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const observationId = readNonEmptyString(entry["observationId"]);
    const label = readNonEmptyString(entry["label"]);
    const content = readNonEmptyString(entry["content"]);
    if (observationId === null || label === null || content === null) {
      return [];
    }

    return [
      {
        observationId,
        observationType: readObservationType(entry["observationType"]),
        label,
        content,
        relatedQuoteIds: readStringArray(entry["relatedQuoteIds"]),
        metadata: readMetadata(entry["metadata"]),
      },
    ];
  });
}

function parseMotifs(value: unknown): SourceMotif[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const motifId = readNonEmptyString(entry["motifId"]);
    const label = readNonEmptyString(entry["label"]);
    const content = readNonEmptyString(entry["content"]);
    if (motifId === null || label === null || content === null) {
      return [];
    }

    return [
      {
        motifId,
        label,
        content,
        relatedQuoteIds: readStringArray(entry["relatedQuoteIds"]),
        metadata: readMetadata(entry["metadata"]),
      },
    ];
  });
}

function parseUncertainties(value: unknown): SourceUncertainty[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const uncertaintyId = readNonEmptyString(entry["uncertaintyId"]);
    const label = readNonEmptyString(entry["label"]);
    const content = readNonEmptyString(entry["content"]);
    if (uncertaintyId === null || label === null || content === null) {
      return [];
    }

    return [
      {
        uncertaintyId,
        label,
        content,
        relatedQuoteIds: readStringArray(entry["relatedQuoteIds"]),
        metadata: readMetadata(entry["metadata"]),
      },
    ];
  });
}

function parseNumericPatterns(value: unknown): SourceNumericPattern[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const patternId = readNonEmptyString(entry["patternId"]);
    const label = readNonEmptyString(entry["label"]);
    const content = readNonEmptyString(entry["content"]);
    if (patternId === null || label === null || content === null) {
      return [];
    }

    return [
      {
        patternId,
        label,
        content,
        value: readOptionalString(entry["value"]),
        relatedQuoteIds: readStringArray(entry["relatedQuoteIds"]),
        metadata: readMetadata(entry["metadata"]),
      },
    ];
  });
}

function parseReferences(value: unknown): SourceReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const referenceId = readNonEmptyString(entry["referenceId"]);
    const sourceId = readNonEmptyString(entry["sourceId"]);
    const targetId = readNonEmptyString(entry["targetId"]);
    if (referenceId === null || sourceId === null || targetId === null) {
      return [];
    }

    return [
      {
        referenceId,
        sourceId,
        targetId,
        edgeType: readEdgeType(entry["edgeType"]),
        note: readOptionalString(entry["note"]),
        metadata: readMetadata(entry["metadata"]),
      },
    ];
  });
}

export function parseSourcePackage(input: unknown): SourcePackage | null {
  if (!isRecord(input)) {
    return null;
  }

  const sourcePackageId = readNonEmptyString(input["sourcePackageId"]);
  const sourceKind = input["sourceKind"];
  const title = readNonEmptyString(input["title"]);
  const origin = readNonEmptyString(input["origin"]);
  const language = readNonEmptyString(input["language"]);
  const createdAt = readNonEmptyString(input["createdAt"]);

  if (
    sourcePackageId === null ||
    isSourceKind(sourceKind) === false ||
    title === null ||
    origin === null ||
    language === null ||
    createdAt === null
  ) {
    return null;
  }

  return {
    sourcePackageId,
    sourceKind,
    title,
    origin,
    language,
    createdAt,
    sourceItems: parseSourcePackageItems(input["sourceItems"]),
    cleanedText: readOptionalString(input["cleanedText"]),
    segments: parseSegments(input["segments"]),
    quotes: parseQuotes(input["quotes"]),
    observations: parseObservations(input["observations"]),
    motifs: parseMotifs(input["motifs"]),
    uncertainties: parseUncertainties(input["uncertainties"]),
    numericPatterns: parseNumericPatterns(input["numericPatterns"]),
    references: parseReferences(input["references"]),
    metadata: readMetadata(input["metadata"]),
  };
}
