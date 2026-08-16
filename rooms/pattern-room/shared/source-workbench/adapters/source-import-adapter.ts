import { mapSourceKindToPatternSourceType } from "../types/source-mapping.js";
import type {
  ImportStats,
  ImportWarning,
  SourceImportEdgeDraft,
  SourceImportEvidenceDraft,
  SourceImportLimits,
  SourceImportNodeDraft,
  SourceImportNoteDraft,
  SourceImportOptions,
  SourceImportResult,
  SourceImportSourceDraft,
  SourceImportSourceSegmentDraft,
  SourceObservation,
  SourcePackage,
} from "../types/source-package.js";

export const DEFAULT_SOURCE_IMPORT_LIMITS: SourceImportLimits = {
  quotes: 100,
  motifs: 30,
  observations: 50,
  uncertainties: 50,
  numericPatterns: 50,
  edges: 200,
};

type EntityIdMap = Map<string, string>;

function createEmptyStats(): ImportStats {
  return {
    sourcesCreated: 0,
    evidenceCreated: 0,
    nodesCreated: 0,
    edgesCreated: 0,
    notesCreated: 0,
    duplicatesSkipped: 0,
    itemsDropped: 0,
  };
}

function createEmptyResult(warnings: readonly ImportWarning[] = []): SourceImportResult {
  return {
    sources: [],
    evidence: [],
    nodes: [],
    edges: [],
    notes: [],
    warnings,
    stats: createEmptyStats(),
  };
}

function normalizeDraftToken(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}

function createDraftId(prefix: string, id: string): string {
  return `${prefix}-${normalizeDraftToken(id)}`;
}

function isDuplicatePackage(pkg: SourcePackage, options: SourceImportOptions): boolean {
  return (
    options.existingPackageIds?.includes(pkg.sourcePackageId) === true ||
    options.existingOrigins?.includes(pkg.origin) === true
  );
}

function readSummaryNote(pkg: SourcePackage): string | null {
  const summary = pkg.metadata["summary"];
  return typeof summary === "string" && summary.trim() !== "" ? summary.trim() : null;
}

function createLimitWarning(
  kind: keyof SourceImportLimits,
  limit: number,
  droppedIds: readonly string[]
): ImportWarning {
  return {
    code: "limit-exceeded",
    message: `Dropped ${String(droppedIds.length)} ${kind} item(s) over limit ${String(limit)}.`,
    relatedIds: droppedIds,
  };
}

function takeWithLimit<T>(
  items: readonly T[],
  limit: number,
  kind: keyof SourceImportLimits,
  getId: (item: T) => string,
  warnings: ImportWarning[],
  stats: ImportStats
): readonly T[] {
  if (items.length <= limit) {
    return items;
  }

  const kept = items.slice(0, limit);
  const dropped = items.slice(limit);
  const droppedIds = dropped.map(getId);
  stats.itemsDropped += dropped.length;
  warnings.push(createLimitWarning(kind, limit, droppedIds));
  return kept;
}

function createSourceDraft(pkg: SourcePackage): SourceImportSourceDraft {
  const segments = createSourceSegmentDrafts(pkg);
  return {
    draftId: createDraftId("import-source", pkg.sourcePackageId),
    label: pkg.title,
    origin: pkg.origin,
    note: pkg.cleanedText ?? "",
    sourceKind: pkg.sourceKind,
    patternSourceType: mapSourceKindToPatternSourceType(pkg.sourceKind),
    ...(segments.length === 0 ? {} : { segments }),
  };
}

function createSourceSegmentDrafts(pkg: SourcePackage): SourceImportSourceSegmentDraft[] {
  return pkg.segments.map((segment, index) => {
    return {
      id: segment.segmentId,
      label: segment.label,
      text: segment.text,
      order: segment.order ?? index,
    };
  });
}

function createEvidenceDrafts(
  pkg: SourcePackage,
  limits: SourceImportLimits,
  warnings: ImportWarning[],
  stats: ImportStats,
  entityIds: EntityIdMap
): SourceImportEvidenceDraft[] {
  const limitedQuotes = takeWithLimit(
    pkg.quotes,
    limits.quotes,
    "quotes",
    (quote) => quote.quoteId,
    warnings,
    stats
  );

  return limitedQuotes.map((quote) => {
    const draftId = createDraftId("import-evidence", quote.quoteId);
    entityIds.set(quote.quoteId, draftId);
    return {
      draftId,
      label: quote.label,
      excerpt: quote.excerpt,
      interpretation: quote.context,
      layer: "evidence",
      sourceQuoteId: quote.quoteId,
      sourceItemId: quote.sourceItemId,
      page: quote.page,
      timecode: quote.timecode,
      speaker: quote.speaker,
      context: quote.context,
    };
  });
}

function addEdge(
  edges: SourceImportEdgeDraft[],
  edge: SourceImportEdgeDraft,
  usedEdgeIds: Set<string>
): void {
  if (usedEdgeIds.has(edge.draftId)) {
    return;
  }

  usedEdgeIds.add(edge.draftId);
  edges.push(edge);
}

function addQuoteEdges(
  edges: SourceImportEdgeDraft[],
  usedEdgeIds: Set<string>,
  relatedQuoteIds: readonly string[],
  entityIds: EntityIdMap,
  sourceDraftId: string,
  edgePrefix: string,
  edgeType: SourceImportEdgeDraft["edgeType"],
  note: string | null,
  warnings: ImportWarning[],
  stats: ImportStats
): void {
  relatedQuoteIds.forEach((quoteId) => {
    const targetDraftId = entityIds.get(quoteId);
    if (targetDraftId === undefined) {
      stats.itemsDropped += 1;
      warnings.push({
        code: "unresolved-related-quote",
        message: "Related quote id could not be resolved to an import evidence draft.",
        relatedIds: [sourceDraftId, quoteId],
      });
      return;
    }

    addEdge(
      edges,
      {
        draftId: createDraftId(edgePrefix, `${sourceDraftId}-${quoteId}`),
        edgeType,
        sourceDraftId,
        targetDraftId,
        note,
      },
      usedEdgeIds
    );
  });
}

function getObservationQuoteEdgeType(
  observation: SourceObservation
): SourceImportEdgeDraft["edgeType"] {
  if (
    observation.observationType === "pattern" ||
    observation.observationType === "correlation" ||
    observation.observationType === "frequency"
  ) {
    return "supports";
  }

  return "inspired_by";
}

function createNodeDraftsAndDerivedEdges(
  pkg: SourcePackage,
  limits: SourceImportLimits,
  warnings: ImportWarning[],
  stats: ImportStats,
  entityIds: EntityIdMap
): { edges: SourceImportEdgeDraft[]; nodes: SourceImportNodeDraft[] } {
  const nodes: SourceImportNodeDraft[] = [];
  const edges: SourceImportEdgeDraft[] = [];
  const usedEdgeIds = new Set<string>();
  const motifs = takeWithLimit(
    pkg.motifs,
    limits.motifs,
    "motifs",
    (motif) => motif.motifId,
    warnings,
    stats
  );
  const observations = takeWithLimit(
    pkg.observations,
    limits.observations,
    "observations",
    (observation) => observation.observationId,
    warnings,
    stats
  );
  const uncertainties = takeWithLimit(
    pkg.uncertainties,
    limits.uncertainties,
    "uncertainties",
    (uncertainty) => uncertainty.uncertaintyId,
    warnings,
    stats
  );
  const numericPatterns = takeWithLimit(
    pkg.numericPatterns,
    limits.numericPatterns,
    "numericPatterns",
    (pattern) => pattern.patternId,
    warnings,
    stats
  );

  motifs.forEach((motif) => {
    const draftId = createDraftId("import-node-motif", motif.motifId);
    entityIds.set(motif.motifId, draftId);
    nodes.push({
      draftId,
      nodeType: "inspiration",
      label: motif.label,
      content: motif.content,
      originKind: "motif",
    });
    addQuoteEdges(
      edges,
      usedEdgeIds,
      motif.relatedQuoteIds,
      entityIds,
      draftId,
      "import-edge-motif",
      "derived_from",
      "Motif derived from source quote.",
      warnings,
      stats
    );
  });

  observations.forEach((observation) => {
    const draftId = createDraftId("import-node-observation", observation.observationId);
    entityIds.set(observation.observationId, draftId);
    nodes.push({
      draftId,
      nodeType: "inspiration",
      label: observation.label,
      content: observation.content,
      originKind: "observation",
    });
    addQuoteEdges(
      edges,
      usedEdgeIds,
      observation.relatedQuoteIds,
      entityIds,
      draftId,
      "import-edge-observation",
      getObservationQuoteEdgeType(observation),
      "Observation linked to source quote.",
      warnings,
      stats
    );
  });

  uncertainties.forEach((uncertainty) => {
    const draftId = createDraftId("import-node-uncertainty", uncertainty.uncertaintyId);
    entityIds.set(uncertainty.uncertaintyId, draftId);
    nodes.push({
      draftId,
      nodeType: "uncertainty",
      label: uncertainty.label,
      content: uncertainty.content,
      originKind: "uncertainty",
    });
    addQuoteEdges(
      edges,
      usedEdgeIds,
      uncertainty.relatedQuoteIds,
      entityIds,
      draftId,
      "import-edge-uncertainty",
      "questions",
      "Uncertainty questions the source quote.",
      warnings,
      stats
    );
  });

  numericPatterns.forEach((pattern) => {
    const draftId = createDraftId("import-node-number", pattern.patternId);
    entityIds.set(pattern.patternId, draftId);
    nodes.push({
      draftId,
      nodeType: "inspiration",
      label: pattern.label,
      content: pattern.value === null ? pattern.content : `${pattern.content} (${pattern.value})`,
      originKind: "numeric_pattern",
    });
  });

  return { edges, nodes };
}

function addReferenceEdges(
  pkg: SourcePackage,
  entityIds: EntityIdMap,
  edges: SourceImportEdgeDraft[],
  warnings: ImportWarning[],
  stats: ImportStats
): void {
  const usedEdgeIds = new Set(edges.map((edge) => edge.draftId));

  pkg.references.forEach((reference) => {
    const sourceDraftId = entityIds.get(reference.sourceId);
    const targetDraftId = entityIds.get(reference.targetId);
    if (sourceDraftId === undefined || targetDraftId === undefined) {
      stats.itemsDropped += 1;
      warnings.push({
        code: "unresolved-reference",
        message: "Reference target could not be resolved to an import draft.",
        relatedIds: [reference.referenceId, reference.sourceId, reference.targetId],
      });
      return;
    }

    addEdge(
      edges,
      {
        draftId: createDraftId("import-edge-reference", reference.referenceId),
        edgeType: "references",
        sourceDraftId,
        targetDraftId,
        note: reference.note,
      },
      usedEdgeIds
    );
  });
}

function buildKnownDraftIds(
  sources: readonly SourceImportSourceDraft[],
  evidence: readonly SourceImportEvidenceDraft[],
  nodes: readonly SourceImportNodeDraft[],
  notes: readonly SourceImportNoteDraft[]
): Set<string> {
  return new Set([
    ...sources.map((source) => source.draftId),
    ...evidence.map((evidenceItem) => evidenceItem.draftId),
    ...nodes.map((node) => node.draftId),
    ...notes.map((note) => note.draftId),
  ]);
}

function filterEdgesWithKnownDrafts(
  edges: readonly SourceImportEdgeDraft[],
  knownDraftIds: ReadonlySet<string>,
  warnings: ImportWarning[],
  stats: ImportStats
): readonly SourceImportEdgeDraft[] {
  return edges.filter((edge) => {
    if (knownDraftIds.has(edge.sourceDraftId) && knownDraftIds.has(edge.targetDraftId)) {
      return true;
    }

    stats.itemsDropped += 1;
    warnings.push({
      code: "dangling-edge",
      message: "Edge source or target draft id was not produced by this import result.",
      relatedIds: [edge.draftId, edge.sourceDraftId, edge.targetDraftId],
    });
    return false;
  });
}

function applyEdgeLimit(
  edges: SourceImportEdgeDraft[],
  limits: SourceImportLimits,
  warnings: ImportWarning[],
  stats: ImportStats
): readonly SourceImportEdgeDraft[] {
  if (edges.length <= limits.edges) {
    return edges;
  }

  const kept = edges.slice(0, limits.edges);
  const dropped = edges.slice(limits.edges);
  const droppedIds = dropped.map((edge) => edge.draftId);
  stats.itemsDropped += dropped.length;
  warnings.push(createLimitWarning("edges", limits.edges, droppedIds));
  return kept;
}

function createNotes(pkg: SourcePackage): SourceImportNoteDraft[] {
  const summary = readSummaryNote(pkg);
  if (summary === null) {
    return [];
  }

  return [
    {
      draftId: createDraftId("import-note", pkg.sourcePackageId),
      text: summary,
    },
  ];
}

export function importSourcePackage(
  pkg: SourcePackage,
  options: SourceImportOptions = {}
): SourceImportResult {
  if (isDuplicatePackage(pkg, options)) {
    const result = createEmptyResult([
      {
        code: "duplicate-package",
        message: "Source package was skipped because its id or origin already exists.",
        relatedIds: [pkg.sourcePackageId, pkg.origin],
      },
    ]);
    result.stats.duplicatesSkipped = 1;
    return result;
  }

  const limits = { ...DEFAULT_SOURCE_IMPORT_LIMITS, ...options.limits };
  const warnings: ImportWarning[] = [];
  const stats = createEmptyStats();
  const entityIds: EntityIdMap = new Map();
  const source = createSourceDraft(pkg);
  entityIds.set(pkg.sourcePackageId, source.draftId);

  pkg.sourceItems.forEach((item) => {
    entityIds.set(item.sourceItemId, source.draftId);
  });

  const evidence = createEvidenceDrafts(pkg, limits, warnings, stats, entityIds);
  const { edges: derivedEdges, nodes } = createNodeDraftsAndDerivedEdges(
    pkg,
    limits,
    warnings,
    stats,
    entityIds
  );
  const edges = [...derivedEdges];
  const notes = createNotes(pkg);
  addReferenceEdges(pkg, entityIds, edges, warnings, stats);
  const knownDraftIds = buildKnownDraftIds([source], evidence, nodes, notes);
  const validEdges = filterEdgesWithKnownDrafts(edges, knownDraftIds, warnings, stats);
  const limitedEdges = applyEdgeLimit([...validEdges], limits, warnings, stats);

  stats.sourcesCreated = 1;
  stats.evidenceCreated = evidence.length;
  stats.nodesCreated = nodes.length;
  stats.edgesCreated = limitedEdges.length;
  stats.notesCreated = notes.length;

  return {
    sources: [source],
    evidence,
    nodes,
    edges: limitedEdges,
    notes,
    warnings,
    stats,
  };
}
