import {
  PATTERN_ROOM_CASE_REVIEW_RESULT_VERSION,
  PATTERN_ROOM_CASE_REVIEW_SECTION_KEYS,
  type PatternRoomCaseReviewConnectionSuggestion,
  type PatternRoomCaseReviewResult,
  type PatternRoomCaseReviewResultItem,
  type PatternRoomCaseReviewSection,
  type PatternRoomCaseReviewSectionKey,
  type PatternRoomCaseReviewSuggestion,
  type PatternRoomCaseReviewSuggestionKind,
  type PatternRoomCaseReviewWarning,
} from "../types/pattern-room-case-review-result.js";
import type { PatternEdgeType } from "../types/pattern-room-domain.js";

const CANONICAL_JSON_FORMAT = "pattern-room-case-review" as const;
const CANONICAL_JSON_VERSION = 1 as const;

const SECTION_LABELS: Readonly<Record<PatternRoomCaseReviewSectionKey, string>> = {
  observation: "Observation",
  evidence: "Evidence",
  analysis: "Analysis",
  counterArgument: "Counter Argument",
  missingInformation: "Missing Information",
  openQuestions: "Open Questions",
  confidenceNotes: "Confidence Notes",
};

const SECTION_KEY_BY_NORMALIZED_LABEL: Readonly<Record<string, PatternRoomCaseReviewSectionKey>> = {
  observation: "observation",
  observations: "observation",
  gozlem: "observation",
  gozlemler: "observation",
  evidence: "evidence",
  kanit: "evidence",
  kanitlar: "evidence",
  analysis: "analysis",
  analyses: "analysis",
  analiz: "analysis",
  analizler: "analysis",
  counterargument: "counterArgument",
  counterarguments: "counterArgument",
  karsiarguman: "counterArgument",
  karsiargumanlar: "counterArgument",
  missinginformation: "missingInformation",
  eksikbilgi: "missingInformation",
  eksikbilgiler: "missingInformation",
  openquestion: "openQuestions",
  openquestions: "openQuestions",
  aciksoru: "openQuestions",
  aciksorular: "openQuestions",
  confidencenote: "confidenceNotes",
  confidencenotes: "confidenceNotes",
  guvennotu: "confidenceNotes",
  guvennotlari: "confidenceNotes",
};

const SUGGESTION_KIND_BY_SECTION: Readonly<
  Record<PatternRoomCaseReviewSectionKey, PatternRoomCaseReviewSuggestionKind>
> = {
  observation: "review_observation",
  evidence: "evidence_candidate",
  analysis: "review_analysis",
  counterArgument: "review_counter_argument",
  missingInformation: "uncertainty_note",
  openQuestions: "open_question",
  confidenceNotes: "uncertainty_note",
};

const PATTERN_EDGE_TYPES = new Set<PatternEdgeType>([
  "supports",
  "contradicts",
  "references",
  "derived_from",
  "inspired_by",
  "questions",
  "needs_review",
]);

const CONNECTION_TAG_PATTERN =
  /^\[connection\]\s+source=([^;]+);\s*type=([^;]+);\s*target=([^;]+)(?:;\s*note=(.*))?$/i;

type Heading = {
  readonly key: PatternRoomCaseReviewSectionKey | null;
  readonly label: string;
  readonly structural: boolean;
};

type CanonicalJsonPayload = {
  readonly buckets: Record<PatternRoomCaseReviewSectionKey, string[]>;
  readonly connections: PatternRoomCaseReviewConnectionSuggestion[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRawText(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function normalizeHeadingLabel(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z]/g, "");
}

function readHeading(line: string): Heading | null {
  const trimmed = line.trim();
  if (trimmed === "") {
    return null;
  }

  let label: string | null = null;
  let structural = false;
  const markdown = trimmed.match(/^#{1,6}\s+(.+?)(?:\s+#+)?$/);
  const bracketed = trimmed.match(/^\[([^\]]+)\]$/);
  const suffixed = trimmed.match(/^([\p{L}][\p{L}\p{N} .&/_-]+):$/u);

  if (markdown !== null) {
    label = markdown[1]?.trim() ?? "";
    structural = true;
  } else if (bracketed !== null) {
    label = bracketed[1]?.trim() ?? "";
    structural = true;
  } else if (suffixed !== null) {
    label = suffixed[1]?.trim() ?? "";
    structural = true;
  } else {
    const normalized = normalizeHeadingLabel(trimmed);
    if (SECTION_KEY_BY_NORMALIZED_LABEL[normalized] !== undefined) {
      label = trimmed;
    }
  }

  if (label === null || label === "") {
    return null;
  }

  return {
    key: SECTION_KEY_BY_NORMALIZED_LABEL[normalizeHeadingLabel(label)] ?? null,
    label,
    structural,
  };
}

function createLineBuckets(): Record<PatternRoomCaseReviewSectionKey, string[]> {
  return {
    observation: [],
    evidence: [],
    analysis: [],
    counterArgument: [],
    missingInformation: [],
    openQuestions: [],
    confidenceNotes: [],
  };
}

function splitSectionItems(lines: readonly string[]): string[] {
  const items: string[] = [];
  let active = "";

  const flush = (): void => {
    const normalized = active.replace(/\s+/g, " ").trim();
    if (normalized !== "") {
      items.push(normalized);
    }
    active = "";
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      flush();
      continue;
    }

    const bullet = trimmed.match(/^(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
    if (bullet !== null) {
      flush();
      active = bullet[1]?.trim() ?? "";
      continue;
    }

    active = active === "" ? trimmed : `${active} ${trimmed}`;
  }

  flush();
  return items;
}

function createWarning(
  code: PatternRoomCaseReviewWarning["code"],
  message: string,
  section: PatternRoomCaseReviewSectionKey | null,
  rawText: string | null
): PatternRoomCaseReviewWarning {
  return Object.freeze({ code, message, section, rawText });
}

function parseConnectionSuggestion(
  rawText: string,
  warnings: PatternRoomCaseReviewWarning[]
): PatternRoomCaseReviewConnectionSuggestion | null {
  const match = rawText.match(CONNECTION_TAG_PATTERN);
  if (match === null) {
    warnings.push(
      createWarning(
        "invalid-connection",
        "Tagged connection did not match the canonical source/type/target grammar.",
        "analysis",
        rawText
      )
    );
    return null;
  }

  const sourceId = match[1]?.trim() ?? "";
  const edgeType = match[2]?.trim() ?? "";
  const targetId = match[3]?.trim() ?? "";
  const note = match[4]?.trim() ?? "";

  if (
    sourceId === "" ||
    targetId === "" ||
    sourceId === targetId ||
    PATTERN_EDGE_TYPES.has(edgeType as PatternEdgeType) === false
  ) {
    warnings.push(
      createWarning(
        "invalid-connection",
        "Tagged connection contains an invalid id or edge type.",
        "analysis",
        rawText
      )
    );
    return null;
  }

  return Object.freeze({
    sourceId,
    edgeType: edgeType as PatternEdgeType,
    targetId,
    note: note === "" ? null : note,
    rawText,
  });
}

function parseCanonicalConnection(
  value: unknown,
  warnings: PatternRoomCaseReviewWarning[]
): PatternRoomCaseReviewConnectionSuggestion | null {
  const rawText = JSON.stringify(value) ?? String(value);
  if (!isRecord(value)) {
    warnings.push(
      createWarning(
        "invalid-connection",
        "Canonical JSON connection must be an object.",
        "analysis",
        rawText
      )
    );
    return null;
  }

  const sourceId = typeof value["sourceId"] === "string" ? value["sourceId"].trim() : "";
  const edgeType = typeof value["edgeType"] === "string" ? value["edgeType"].trim() : "";
  const targetId = typeof value["targetId"] === "string" ? value["targetId"].trim() : "";
  const noteValue = value["note"];
  const note = typeof noteValue === "string" ? noteValue.trim() : "";

  if (
    sourceId === "" ||
    targetId === "" ||
    sourceId === targetId ||
    PATTERN_EDGE_TYPES.has(edgeType as PatternEdgeType) === false ||
    (noteValue !== undefined && noteValue !== null && typeof noteValue !== "string")
  ) {
    warnings.push(
      createWarning(
        "invalid-connection",
        "Canonical JSON connection contains an invalid id, edge type or note.",
        "analysis",
        rawText
      )
    );
    return null;
  }

  return Object.freeze({
    sourceId,
    edgeType: edgeType as PatternEdgeType,
    targetId,
    note: note === "" ? null : note,
    rawText,
  });
}

function extractCanonicalJsonCandidate(rawText: string): string | null {
  if (rawText.startsWith("{") && rawText.endsWith("}")) {
    return rawText;
  }

  const fenced = rawText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? null;
}

function parseCanonicalJson(
  rawText: string,
  warnings: PatternRoomCaseReviewWarning[]
): CanonicalJsonPayload | null {
  const candidate = extractCanonicalJsonCandidate(rawText);
  if (candidate === null) {
    return null;
  }

  let value: unknown;
  try {
    value = JSON.parse(candidate) as unknown;
  } catch {
    warnings.push(
      createWarning(
        "malformed-format",
        "The review reply looked like JSON but could not be parsed.",
        null,
        rawText
      )
    );
    return null;
  }

  if (
    !isRecord(value) ||
    value["format"] !== CANONICAL_JSON_FORMAT ||
    value["version"] !== CANONICAL_JSON_VERSION ||
    !isRecord(value["sections"])
  ) {
    warnings.push(
      createWarning(
        "malformed-format",
        "The JSON reply did not match the Pattern Room canonical review envelope.",
        null,
        rawText
      )
    );
    return null;
  }

  const buckets = createLineBuckets();
  const sections = value["sections"];
  for (const key of PATTERN_ROOM_CASE_REVIEW_SECTION_KEYS) {
    const sectionValue = sections[key];
    if (!Array.isArray(sectionValue) || sectionValue.some((entry) => typeof entry !== "string")) {
      warnings.push(
        createWarning(
          "malformed-format",
          `Canonical JSON section ${key} must be an array of strings.`,
          key,
          JSON.stringify(sectionValue) ?? null
        )
      );
      return null;
    }

    const sectionItems = sectionValue as string[];
    buckets[key].push(...sectionItems.map((entry) => entry.trim()).filter((entry) => entry !== ""));
  }

  const connectionValues = value["suggestedConnections"];
  if (connectionValues !== undefined && !Array.isArray(connectionValues)) {
    warnings.push(
      createWarning(
        "malformed-format",
        "Canonical JSON suggestedConnections must be an array.",
        "analysis",
        JSON.stringify(connectionValues) ?? null
      )
    );
    return null;
  }

  const connections: PatternRoomCaseReviewConnectionSuggestion[] = [];
  const connectionsToParse = (connectionValues ?? []) as unknown[];
  connectionsToParse.forEach((connectionValue) => {
    const connection = parseCanonicalConnection(connectionValue, warnings);
    if (connection !== null) {
      connections.push(connection);
    }
  });

  return { buckets, connections };
}

function createSection(
  key: PatternRoomCaseReviewSectionKey,
  rawLines: readonly string[],
  rawItems: readonly string[],
  warnings: PatternRoomCaseReviewWarning[],
  connections: PatternRoomCaseReviewConnectionSuggestion[]
): PatternRoomCaseReviewSection {
  const filteredItems =
    key === "analysis"
      ? rawItems.filter((item) => {
          if (/^\[connection\]/i.test(item) === false) {
            return true;
          }
          const connection = parseConnectionSuggestion(item, warnings);
          if (connection !== null) {
            connections.push(connection);
          }
          return false;
        })
      : [...rawItems];

  const items = Object.freeze(
    filteredItems.map((text, index): PatternRoomCaseReviewResultItem => {
      return Object.freeze({
        id: `review-${key}-${String(index + 1).padStart(3, "0")}`,
        section: key,
        text,
      });
    })
  );

  return Object.freeze({
    key,
    label: SECTION_LABELS[key],
    items,
    rawText: normalizeRawText(rawLines.join("\n")),
  });
}

function createSuggestions(
  sections: Readonly<Record<PatternRoomCaseReviewSectionKey, PatternRoomCaseReviewSection>>,
  connections: readonly PatternRoomCaseReviewConnectionSuggestion[]
): readonly PatternRoomCaseReviewSuggestion[] {
  const sectionSuggestions = PATTERN_ROOM_CASE_REVIEW_SECTION_KEYS.flatMap((sectionKey) => {
    return sections[sectionKey].items.map((item): PatternRoomCaseReviewSuggestion => {
      return Object.freeze({
        id: `suggestion-${item.id}`,
        kind: SUGGESTION_KIND_BY_SECTION[sectionKey],
        text: item.text,
        section: sectionKey,
        sourceItemId: item.id,
        connection: null,
      });
    });
  });
  const connectionSuggestions = connections.map(
    (connection, index): PatternRoomCaseReviewSuggestion => {
      const connectionText = `${connection.sourceId} -> ${connection.edgeType} -> ${connection.targetId}`;
      return Object.freeze({
        id: `suggestion-connection-${String(index + 1).padStart(3, "0")}`,
        kind: "connection_candidate",
        text: connection.note === null ? connectionText : `${connectionText}: ${connection.note}`,
        section: "analysis",
        sourceItemId: null,
        connection,
      });
    }
  );
  return Object.freeze([...sectionSuggestions, ...connectionSuggestions]);
}

function readSummary(
  sections: Readonly<Record<PatternRoomCaseReviewSectionKey, PatternRoomCaseReviewSection>>
): string {
  const priority: readonly PatternRoomCaseReviewSectionKey[] = [
    "observation",
    "analysis",
    "counterArgument",
    "evidence",
    "missingInformation",
    "openQuestions",
    "confidenceNotes",
  ];
  for (const key of priority) {
    const firstItem = sections[key].items[0];
    if (firstItem !== undefined) {
      return firstItem.text;
    }
  }
  return "";
}

function createResult(
  rawText: string,
  buckets: Record<PatternRoomCaseReviewSectionKey, string[]>,
  warnings: PatternRoomCaseReviewWarning[],
  encountered: ReadonlySet<PatternRoomCaseReviewSectionKey>,
  fallbackUsed: boolean,
  initialConnections: readonly PatternRoomCaseReviewConnectionSuggestion[] = [],
  options: {
    readonly canonicalItems?: boolean;
    readonly warnOnEmptyEncounteredSection?: boolean;
  } = {}
): PatternRoomCaseReviewResult {
  const connections: PatternRoomCaseReviewConnectionSuggestion[] = [...initialConnections];
  const sectionsRecord = {} as Record<
    PatternRoomCaseReviewSectionKey,
    PatternRoomCaseReviewSection
  >;

  for (const key of PATTERN_ROOM_CASE_REVIEW_SECTION_KEYS) {
    const rawItems =
      options.canonicalItems === true ? [...buckets[key]] : splitSectionItems(buckets[key]);
    const section = createSection(key, buckets[key], rawItems, warnings, connections);
    sectionsRecord[key] = section;
    if (
      options.warnOnEmptyEncounteredSection !== false &&
      encountered.has(key) &&
      section.items.length === 0 &&
      (key !== "analysis" || connections.length === 0)
    ) {
      warnings.push(
        createWarning("empty-section", `${SECTION_LABELS[key]} section was empty.`, key, null)
      );
    }
  }

  const sections = Object.freeze(sectionsRecord);
  const items = Object.freeze(
    PATTERN_ROOM_CASE_REVIEW_SECTION_KEYS.flatMap((key) => sections[key].items)
  );
  const suggestions = createSuggestions(sections, connections);

  return Object.freeze({
    resultVersion: PATTERN_ROOM_CASE_REVIEW_RESULT_VERSION,
    sections,
    items,
    suggestions,
    warnings: Object.freeze(warnings),
    confidence: Object.freeze(sections.confidenceNotes.items.map((item) => item.text)),
    missingEvidence: Object.freeze(sections.missingInformation.items.map((item) => item.text)),
    suggestedConnections: Object.freeze(connections),
    openQuestions: Object.freeze(sections.openQuestions.items.map((item) => item.text)),
    summary: readSummary(sections),
    rawText,
    fallbackUsed,
  });
}

function parseStructuredHeadings(
  rawText: string,
  warnings: PatternRoomCaseReviewWarning[]
): PatternRoomCaseReviewResult {
  const buckets = createLineBuckets();
  const encountered = new Set<PatternRoomCaseReviewSectionKey>();
  const fallbackLines: string[] = [];
  let currentSection: PatternRoomCaseReviewSectionKey | null = null;
  let foundAllowedHeading = false;

  for (const line of rawText === "" ? [] : rawText.split("\n")) {
    const heading = readHeading(line);
    if (heading !== null) {
      currentSection = heading.key;
      if (heading.key !== null) {
        foundAllowedHeading = true;
        encountered.add(heading.key);
      } else if (heading.structural) {
        warnings.push(
          createWarning(
            "unknown-section",
            `Unknown review section: ${heading.label}`,
            null,
            line.trim()
          )
        );
      }
      continue;
    }

    if (currentSection !== null) {
      buckets[currentSection].push(line);
    } else if (line.trim() !== "") {
      fallbackLines.push(line);
    }
  }

  let fallbackUsed = false;
  if (rawText === "") {
    fallbackUsed = true;
    warnings.push(createWarning("empty-reply", "Review reply was empty.", null, null));
  } else if (foundAllowedHeading === false) {
    fallbackUsed = true;
    buckets.analysis.push(...rawText.split("\n"));
    encountered.add("analysis");
    warnings.push(
      createWarning(
        "malformed-format",
        "No allowed English or Turkish review headings were found; the raw reply was preserved as Analysis.",
        "analysis",
        rawText
      )
    );
  } else if (fallbackLines.length > 0) {
    fallbackUsed = true;
    buckets.analysis.unshift(...fallbackLines, "");
    encountered.add("analysis");
    warnings.push(
      createWarning(
        "malformed-format",
        "Text outside allowed review sections was preserved as Analysis.",
        "analysis",
        normalizeRawText(fallbackLines.join("\n"))
      )
    );
  }

  return createResult(rawText, buckets, warnings, encountered, fallbackUsed);
}

export function parsePatternRoomCaseReviewResult(rawReply: string): PatternRoomCaseReviewResult {
  const rawText = normalizeRawText(rawReply);
  const warnings: PatternRoomCaseReviewWarning[] = [];
  const canonical = parseCanonicalJson(rawText, warnings);

  if (canonical !== null) {
    return createResult(
      rawText,
      canonical.buckets,
      warnings,
      new Set(PATTERN_ROOM_CASE_REVIEW_SECTION_KEYS),
      false,
      canonical.connections,
      { canonicalItems: true, warnOnEmptyEncounteredSection: false }
    );
  }

  return parseStructuredHeadings(rawText, warnings);
}
