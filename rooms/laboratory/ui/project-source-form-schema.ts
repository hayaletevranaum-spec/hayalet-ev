import { asLabRecord, asNonEmptyString } from "../domain/lab-types.js";
import type { LabStoreState } from "../domain/lab-types.js";

export type YtDlpFormFieldOption = {
  labelKey: string;
  value: string;
};

export type YtDlpFormField = {
  id: string;
  labelKey: string;
  max?: number;
  min?: number;
  options?: YtDlpFormFieldOption[];
  placeholderKey?: string;
  span?: string;
  type: "number" | "select" | "text" | "toggle";
};

export type YtDlpFormSection = {
  fields: YtDlpFormField[];
  id: string;
};

export type YtDlpFormSchema = {
  sections: YtDlpFormSection[];
};

const YT_DLP_FORM_FIELD_TYPES = new Set(["number", "select", "text", "toggle"]);
const STREAM_OWNED_YT_DLP_FIELD_IDS = new Set(["captureMode", "format"]);

function readYtDlpFormOption(value: unknown): YtDlpFormFieldOption | null {
  const record = asLabRecord(value);
  const valueText = asNonEmptyString(record["value"]);
  const labelKey = asNonEmptyString(record["labelKey"]);
  if (valueText === null || labelKey === null) {
    return null;
  }
  return {
    labelKey,
    value: valueText,
  };
}

function readYtDlpFormField(value: unknown): YtDlpFormField | null {
  const record = asLabRecord(value);
  const id = asNonEmptyString(record["id"]);
  const labelKey = asNonEmptyString(record["labelKey"]);
  const type = asNonEmptyString(record["type"]);
  if (id === null || labelKey === null || !YT_DLP_FORM_FIELD_TYPES.has(type ?? "")) {
    return null;
  }

  const options = Array.isArray(record["options"])
    ? record["options"]
        .map(function (option) {
          return readYtDlpFormOption(option);
        })
        .filter((option): option is YtDlpFormFieldOption => option !== null)
    : undefined;
  const min = typeof record["min"] === "number" ? record["min"] : undefined;
  const max = typeof record["max"] === "number" ? record["max"] : undefined;
  const placeholderKey = asNonEmptyString(record["placeholderKey"]) ?? undefined;
  const span = asNonEmptyString(record["span"]) ?? undefined;

  return {
    id,
    labelKey,
    ...(max !== undefined ? { max } : {}),
    ...(min !== undefined ? { min } : {}),
    ...(options !== undefined ? { options } : {}),
    ...(placeholderKey !== undefined ? { placeholderKey } : {}),
    ...(span !== undefined ? { span } : {}),
    type: type as YtDlpFormField["type"],
  };
}

function readYtDlpFormSection(value: unknown): YtDlpFormSection | null {
  const record = asLabRecord(value);
  const id = asNonEmptyString(record["id"]);
  if (id === null || !Array.isArray(record["fields"])) {
    return null;
  }
  const fields = record["fields"]
    .map(function (field) {
      return readYtDlpFormField(field);
    })
    .filter((field): field is YtDlpFormField => field !== null);
  return {
    fields,
    id,
  };
}

export function getYtDlpFormSchema(state: LabStoreState): YtDlpFormSchema {
  const snapshot = asLabRecord(state.snapshot);
  const ytDlpForm = asLabRecord(snapshot["ytDlpForm"]);
  const sections = Array.isArray(ytDlpForm["sections"])
    ? ytDlpForm["sections"]
        .map(function (section) {
          return readYtDlpFormSection(section);
        })
        .filter((section): section is YtDlpFormSection => section !== null)
    : [];
  return {
    sections,
  };
}

export function findYtDlpFormField(
  schema: YtDlpFormSchema,
  fieldId: string
): YtDlpFormField | null {
  for (const section of schema.sections) {
    const field = section.fields.find(function (candidate) {
      return candidate.id === fieldId;
    });
    if (field) {
      return field;
    }
  }
  return null;
}

export function shouldRenderAdvancedYtDlpFormField(field: YtDlpFormField): boolean {
  return !STREAM_OWNED_YT_DLP_FIELD_IDS.has(field.id);
}
