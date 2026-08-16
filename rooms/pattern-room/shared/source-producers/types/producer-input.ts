import type { SourceKind } from "../../source-workbench/types/source-kind.js";

export type ProducerInputKind = "pasted_text" | "long_text";

export type PastedTextInput = {
  inputKind: "pasted_text";
  text: string;
  title?: string;
  language?: string;
};

export type LongTextSourceKind = Extract<
  SourceKind,
  "book" | "article" | "newspaper" | "religious_text" | "archive_text" | "personal_note"
>;

export type LongTextInput = {
  inputKind: "long_text";
  text: string;
  title: string;
  sourceKind: LongTextSourceKind;
  origin: string;
  language?: string;
  chapter?: string;
  page?: string;
};
