// NOTE: Use Prettier parsing for syntax validation instead of custom bracket checks.

import * as prettier from "prettier";
import { logToolError } from "./mcp-logger.js";

export interface PrettierValidationResult {
  valid: boolean;
  error?: string;
  formatted?: string;
  errorLine?: number;
  errorColumn?: number;
}

export async function validateWithPrettier(
  code: string,
  filePath: string,
  options?: {
    format?: boolean;
    semi?: boolean;
    singleQuote?: boolean;
    tabWidth?: number;
  }
): Promise<PrettierValidationResult> {
  try {
    const formatted = await prettier.format(code, {
      filepath: filePath,
      semi: options?.semi ?? true,
      singleQuote: options?.singleQuote ?? true,
      tabWidth: options?.tabWidth ?? 2,
      printWidth: 100,
      trailingComma: "es5",
    });

    const result: { valid: true; formatted?: string } = { valid: true };
    if (options?.format === true) {
      result.formatted = formatted;
    }
    return result;
  } catch (error) {
    const err = error as Error & {
      loc?: { line: number; column: number };
      codeFrame?: string;
    };

    logToolError("validateWithPrettier", err, { filePath });

    const result: { valid: false; error: string; errorLine?: number; errorColumn?: number } = {
      valid: false,
      error: err.message,
    };
    if (err.loc?.line !== undefined) {
      result.errorLine = err.loc.line;
    }
    if (err.loc?.column !== undefined) {
      result.errorColumn = err.loc.column;
    }
    return result;
  }
}

export async function validateBrackets(
  code: string,
  filePath: string
): Promise<{ balanced: boolean; error?: string }> {
  const result = await validateWithPrettier(code, filePath, { format: false });

  const returnValue: { balanced: boolean; error?: string } = {
    balanced: result.valid,
  };
  if (result.error !== undefined) {
    returnValue.error = result.error;
  }
  return returnValue;
}

export async function compareBeforeAfter(
  beforeCode: string,
  afterCode: string,
  filePath: string
): Promise<{
  valid: boolean;
  beforeValid: boolean;
  afterValid: boolean;
  newErrors?: string[];
}> {
  const beforeResult = await validateWithPrettier(beforeCode, filePath);
  const afterResult = await validateWithPrettier(afterCode, filePath);

  // NOTE: If before was valid but after is invalid, the edit broke syntax.
  const introducedError = beforeResult.valid && !afterResult.valid;

  const result: {
    valid: boolean;
    beforeValid: boolean;
    afterValid: boolean;
    newErrors?: string[];
  } = {
    valid: !introducedError,
    beforeValid: beforeResult.valid,
    afterValid: afterResult.valid,
  };
  if (introducedError === true && afterResult.error != null && afterResult.error !== "") {
    result.newErrors = [afterResult.error];
  }
  return result;
}

export function isCodeFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase();
  return [
    "js",
    "jsx",
    "ts",
    "tsx",
    "mjs",
    "cjs",
    "json",
    "jsonc",
    "css",
    "scss",
    "less",
    "html",
    "vue",
    "svelte",
    "md",
    "mdx",
    "yaml",
    "yml",
  ].includes(ext ?? "");
}
