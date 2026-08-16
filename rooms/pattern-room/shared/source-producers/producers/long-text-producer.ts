import { isSourceKind } from "../../source-workbench/types/source-kind.js";
import type { SourcePackage } from "../../source-workbench/types/source-package.js";
import type {
  ProducerError,
  ProduceResult,
  SourceProducer,
  ValidationResult,
} from "../types/producer-contract.js";
import type { LongTextInput, LongTextSourceKind } from "../types/producer-input.js";
import { segmentLongText, type LongTextSegmenterOptions } from "./long-text-segmenter.js";

const LONG_TEXT_PRODUCER_ID = "long_text_producer";
const LONG_TEXT_INPUT_KIND = "long_text";
const DEFAULT_MAX_INPUT_SIZE_HINT = 500_000;
const DEFAULT_SOURCE_ITEM_ID = "source-item-001";
const DEFAULT_LANGUAGE = "tr";

const LONG_TEXT_SOURCE_KINDS = [
  "book",
  "article",
  "newspaper",
  "religious_text",
  "archive_text",
  "personal_note",
] as const satisfies readonly LongTextSourceKind[];

export type LongTextProducerOptions = {
  now?: () => string;
  maxInputSizeHint?: number;
  maxSegmentLength?: number;
};

function createValidationResult(errors: ValidationResult["errors"]): ValidationResult {
  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
  };
}

function normalizeRequiredText(value: string): string {
  return value.trim();
}

function normalizeOptionalText(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function isLongTextSourceKind(value: unknown): value is LongTextSourceKind {
  return isSourceKind(value) && LONG_TEXT_SOURCE_KINDS.includes(value as LongTextSourceKind);
}

function createSafeTitleId(title: string): string {
  const token = title
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "")
    .toLowerCase();

  return token === "" ? "long-text" : token;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((word) => word !== "").length;
}

function createSegmenterOptions(maxSegmentLength: number | undefined): LongTextSegmenterOptions {
  const options: LongTextSegmenterOptions = {
    sourceItemId: DEFAULT_SOURCE_ITEM_ID,
  };

  if (maxSegmentLength !== undefined) {
    options.maxSegmentLength = maxSegmentLength;
  }

  return options;
}

function createMetadata(
  input: LongTextInput,
  text: string,
  segmentCount: number
): Record<string, unknown> {
  return {
    producerId: LONG_TEXT_PRODUCER_ID,
    inputKind: LONG_TEXT_INPUT_KIND,
    generatedBy: "source-producer",
    wordCount: countWords(text),
    charCount: text.length,
    segmentCount,
    chapter: normalizeOptionalText(input.chapter),
    page: normalizeOptionalText(input.page),
  };
}

function createSourcePackage(
  input: LongTextInput,
  now: () => string,
  maxSegmentLength: number | undefined
): SourcePackage {
  const text = normalizeRequiredText(input.text);
  const title = normalizeRequiredText(input.title);
  const origin = normalizeRequiredText(input.origin);
  const language = normalizeOptionalText(input.language) ?? DEFAULT_LANGUAGE;
  const segments = segmentLongText(text, createSegmenterOptions(maxSegmentLength));

  return {
    sourcePackageId: `source-package-long-text-${createSafeTitleId(title)}`,
    sourceKind: input.sourceKind,
    title,
    origin,
    language,
    createdAt: now(),
    sourceItems: [
      {
        sourceItemId: DEFAULT_SOURCE_ITEM_ID,
        label: title,
        origin,
        content: text,
        order: 0,
        timecodeStart: null,
        timecodeEnd: null,
        metadata: {
          producerId: LONG_TEXT_PRODUCER_ID,
          chapter: normalizeOptionalText(input.chapter),
          page: normalizeOptionalText(input.page),
        },
      },
    ],
    cleanedText: text,
    segments,
    quotes: [],
    observations: [],
    motifs: [],
    uncertainties: [],
    numericPatterns: [],
    references: [],
    metadata: createMetadata(input, text, segments.length),
  };
}

export function createLongTextProducer(
  options: LongTextProducerOptions = {}
): SourceProducer<LongTextInput> {
  const now = options.now ?? (() => new Date().toISOString());
  const maxInputSizeHint = options.maxInputSizeHint ?? DEFAULT_MAX_INPUT_SIZE_HINT;

  return {
    producerId: LONG_TEXT_PRODUCER_ID,
    producerType: "long_text",
    sourceKind: "article",
    inputKind: LONG_TEXT_INPUT_KIND,
    capabilities: {
      supportsPreview: true,
      supportsMultiPackage: false,
      requiresHost: false,
      maxInputSizeHint,
    },
    validateInput(input: LongTextInput): ValidationResult {
      const errors: ProducerError[] = [];

      if (input.text === "") {
        errors.push({
          code: "empty-text",
          message: "Text input is empty.",
          field: "text",
        });
      } else if (input.text.trim() === "") {
        errors.push({
          code: "blank-text",
          message: "Text input is blank after trimming.",
          field: "text",
        });
      }

      if (input.title.trim() === "") {
        errors.push({
          code: "blank-title",
          message: "Title is blank after trimming.",
          field: "title",
        });
      }

      if (input.origin.trim() === "") {
        errors.push({
          code: "blank-origin",
          message: "Origin is blank after trimming.",
          field: "origin",
        });
      }

      if (isLongTextSourceKind(input.sourceKind) === false) {
        errors.push({
          code: "invalid-source-kind",
          message: "Source kind is not supported by the long text producer.",
          field: "sourceKind",
        });
      }

      if (input.text.length > maxInputSizeHint) {
        errors.push({
          code: "input-too-large",
          message: "Text input exceeds the producer size limit.",
          field: "text",
        });
      }

      return createValidationResult(errors);
    },
    getPreview(input: LongTextInput) {
      const validation = this.validateInput(input);
      if (validation.valid === false) {
        return null;
      }

      return {
        estimatedPackageCount: 1,
        estimatedItemCount: 1,
        estimatedSegmentCount: segmentLongText(
          input.text,
          createSegmenterOptions(options.maxSegmentLength)
        ).length,
        sampleTitle: normalizeRequiredText(input.title),
        warnings: validation.warnings,
      };
    },
    produce(input: LongTextInput): ProduceResult {
      const validation = this.validateInput(input);
      if (validation.valid === false) {
        return {
          packages: [],
          errors: validation.errors,
          warnings: validation.warnings,
        };
      }

      return {
        packages: [createSourcePackage(input, now, options.maxSegmentLength)],
        errors: [],
        warnings: validation.warnings,
      };
    },
  };
}
