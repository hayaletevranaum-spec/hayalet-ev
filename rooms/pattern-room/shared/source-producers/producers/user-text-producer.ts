import type {
  ProducerError,
  ProduceResult,
  SourceProducer,
  ValidationResult,
} from "../types/producer-contract.js";
import type { PastedTextInput } from "../types/producer-input.js";

const USER_TEXT_PRODUCER_ID = "user_text_producer";
const USER_TEXT_SOURCE_KIND = "user_text";
const PASTED_TEXT_INPUT_KIND = "pasted_text";
const MAX_USER_TEXT_INPUT_SIZE = 200_000;
const DEFAULT_USER_TEXT_TITLE = "Kullanıcı metni";

export type UserTextProducerOptions = {
  now?: () => string;
};

function createValidationResult(errors: ValidationResult["errors"]): ValidationResult {
  return {
    valid: errors.length === 0,
    errors,
    warnings: [],
  };
}

function normalizeOptionalText(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function createTitle(input: PastedTextInput): string {
  const explicitTitle = normalizeOptionalText(input.title);
  if (explicitTitle !== null) {
    return explicitTitle;
  }

  const firstLine = input.text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== "");

  if (firstLine === undefined) {
    return DEFAULT_USER_TEXT_TITLE;
  }

  return firstLine.length > 72 ? `${firstLine.slice(0, 69)}...` : firstLine;
}

function createSafeToken(value: string): string {
  const token = value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");

  return token === "" ? "text" : token.toLowerCase();
}

function createStableHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(36);
}

function createSourcePackageId(input: PastedTextInput, title: string, text: string): string {
  const safeToken = createSafeToken(title);
  const hash = createStableHash(`${input.inputKind}\n${title}\n${input.language ?? ""}\n${text}`);
  return `source-package-user-text-${safeToken}-${hash}`;
}

export function createUserTextProducer(
  options: UserTextProducerOptions = {}
): SourceProducer<PastedTextInput> {
  const now = options.now ?? (() => new Date().toISOString());

  return {
    producerId: USER_TEXT_PRODUCER_ID,
    producerType: "user_text",
    sourceKind: USER_TEXT_SOURCE_KIND,
    inputKind: PASTED_TEXT_INPUT_KIND,
    capabilities: {
      supportsPreview: true,
      supportsMultiPackage: false,
      requiresHost: false,
      maxInputSizeHint: MAX_USER_TEXT_INPUT_SIZE,
    },
    validateInput(input: PastedTextInput): ValidationResult {
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

      if (input.text.length > MAX_USER_TEXT_INPUT_SIZE) {
        errors.push({
          code: "input-too-large",
          message: "Text input exceeds the producer size limit.",
          field: "text",
        });
      }

      return createValidationResult(errors);
    },
    getPreview(input: PastedTextInput) {
      const validation = this.validateInput(input);
      if (validation.valid === false) {
        return null;
      }

      return {
        estimatedPackageCount: 1,
        estimatedItemCount: 1,
        sampleTitle: createTitle(input),
        warnings: validation.warnings,
      };
    },
    produce(input: PastedTextInput): ProduceResult {
      const validation = this.validateInput(input);
      if (validation.valid === false) {
        return {
          packages: [],
          errors: validation.errors,
          warnings: validation.warnings,
        };
      }

      const text = input.text.trim();
      const title = createTitle(input);
      const sourcePackageId = createSourcePackageId(input, title, text);
      const sourceItemId = `${sourcePackageId}-item-1`;

      return {
        packages: [
          {
            sourcePackageId,
            sourceKind: USER_TEXT_SOURCE_KIND,
            title,
            origin: DEFAULT_USER_TEXT_TITLE,
            language: normalizeOptionalText(input.language) ?? "tr",
            createdAt: now(),
            sourceItems: [
              {
                sourceItemId,
                label: title,
                content: text,
                order: 0,
                timecodeStart: null,
                timecodeEnd: null,
                origin: DEFAULT_USER_TEXT_TITLE,
                metadata: {
                  producerId: USER_TEXT_PRODUCER_ID,
                },
              },
            ],
            cleanedText: text,
            segments: [],
            quotes: [],
            observations: [],
            motifs: [],
            uncertainties: [],
            numericPatterns: [],
            references: [],
            metadata: {
              producerId: USER_TEXT_PRODUCER_ID,
              inputKind: PASTED_TEXT_INPUT_KIND,
              generatedBy: "source-producer",
            },
          },
        ],
        errors: [],
        warnings: validation.warnings,
      };
    },
  };
}
