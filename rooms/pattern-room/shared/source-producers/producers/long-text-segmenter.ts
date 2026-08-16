import type { SourceSegment } from "../../source-workbench/types/source-package.js";

const DEFAULT_MAX_SEGMENT_LENGTH = 3_000;
const DEFAULT_SOURCE_ITEM_ID = "source-item-001";
const SEGMENT_LABEL_LENGTH = 80;

export type LongTextSegmenterOptions = {
  maxSegmentLength?: number;
  sourceItemId?: string;
};

function normalizeMaxSegmentLength(value: number | undefined): number {
  if (value === undefined || Number.isFinite(value) === false || value < 1) {
    return DEFAULT_MAX_SEGMENT_LENGTH;
  }

  return Math.floor(value);
}

function createSegmentId(index: number): string {
  return `segment-${String(index + 1).padStart(3, "0")}`;
}

function createSegmentLabel(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, SEGMENT_LABEL_LENGTH);
}

function findSentenceSplitIndex(text: string, maxSegmentLength: number): number | null {
  const prefix = text.slice(0, maxSegmentLength);
  const sentenceEndPattern = /[.!?…](?:["')\]]+)?(?=\s|$)/g;
  let splitIndex: number | null = null;
  let match: RegExpExecArray | null = sentenceEndPattern.exec(prefix);

  while (match !== null) {
    splitIndex = match.index + match[0].length;
    match = sentenceEndPattern.exec(prefix);
  }

  return splitIndex;
}

function splitLongParagraph(paragraph: string, maxSegmentLength: number): string[] {
  const chunks: string[] = [];
  let remaining = paragraph.trim();

  while (remaining.length > maxSegmentLength) {
    const splitIndex = findSentenceSplitIndex(remaining, maxSegmentLength) ?? maxSegmentLength;
    const chunk = remaining.slice(0, splitIndex).trim();

    if (chunk !== "") {
      chunks.push(chunk);
    }

    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining !== "") {
    chunks.push(remaining);
  }

  return chunks;
}

export function segmentLongText(
  text: string,
  options: LongTextSegmenterOptions = {}
): SourceSegment[] {
  const trimmedText = text.trim();
  if (trimmedText === "") {
    return [];
  }

  const maxSegmentLength = normalizeMaxSegmentLength(options.maxSegmentLength);
  const sourceItemId = options.sourceItemId ?? DEFAULT_SOURCE_ITEM_ID;
  const segmentTexts = trimmedText
    .split(/\r?\n\s*\r?\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== "")
    .flatMap((paragraph) => splitLongParagraph(paragraph, maxSegmentLength));

  return segmentTexts.map((segmentText, index) => ({
    segmentId: createSegmentId(index),
    sourceItemId,
    label: createSegmentLabel(segmentText),
    text: segmentText,
    order: index,
    page: null,
    timecode: null,
    speaker: null,
    metadata: {},
  }));
}
