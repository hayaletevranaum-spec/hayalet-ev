import type { TranslationParams } from "../../../../../src/types/i18n.js";

export type MatchScope = "first" | "last" | "all";
export type EOLMode = "lf" | "crlf" | "auto" | "preserve";

export interface FileEdit {
  old_text: string;
  new_text: string;
}

export interface EditFileOptions {
  file_path: string;
  edits: FileEdit[];
  dry_run?: boolean;
  ignore_whitespace?: boolean;
  all_or_nothing?: boolean;
  match_scope?: MatchScope | number[];
  normalize_eol?: EOLMode;
}

export interface EditMatchInfo {
  line: number;
  column: number;
  length: number;
}

export interface EditResult {
  index: number;
  edit: FileEdit;
  replacements: number;
  success: boolean;
  error?: string;
  errorKey?: string;
  errorParams?: TranslationParams;
  matches?: EditMatchInfo[];
}

export interface ApplyEditResult extends EditResult {
  newContent?: string;
}

export interface ConflictInfo {
  editA: number;
  editB: number;
  reason?: string;
  reasonKey?: string;
  reasonParams?: TranslationParams;
}

export interface BracketDifference {
  pair: "parentheses" | "curlyBraces" | "squareBrackets";
  difference: number;
  missingToken: string;
  state: "missing" | "extra";
}

export interface FormatOptions {
  mode: "dry-run" | "apply";
  filePath: string;
  results: EditResult[];
  diff: string;
  hasChanges: boolean;
  elapsed: number;
  lineCount: number;
  fileSize: number;
  conflicts: ConflictInfo[];
  bracketStatus: string;
  matchScope: MatchScope | number[];
  atomic: boolean;
  translate: (key: string, params?: TranslationParams) => string;
}
