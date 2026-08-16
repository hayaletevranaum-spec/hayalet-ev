import { readFileSync, existsSync } from "fs";
import { parse } from "@babel/parser";
import traverseImport from "@babel/traverse";
import { countBracketsContextAware } from "./structure-visualizer.js";
import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";
import { createMcpTranslatorSync } from "../../utils/i18n/index.js";

type TraverseFn = (...args: unknown[]) => unknown;

interface TraverseModule {
  default?: TraverseFn | { default?: TraverseFn };
}
const traverseModule = traverseImport as TraverseModule;
const fallbackTraverse: TraverseFn = (): void => {};
const traverse: TraverseFn =
  typeof traverseImport === "function"
    ? (traverseImport as TraverseFn)
    : typeof traverseModule.default === "function"
      ? traverseModule.default
      : (traverseModule.default?.default ?? fallbackTraverse);

function scopeValidatorT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.scopeValidator.${key}`, params);
}

interface ScopeInfo {
  type: string;
  name: string;
  startLine: number;
  endLine: number;
  startCol: number;
  endCol: number;
}

interface ScopeValidationResult {
  success: boolean;
  willBreakScope: boolean;
  affectedScopes: ScopeInfo[];
  brokenScopes: ScopeInfo[];
  warnings: string[];
  bracketIssues: string[];
}

export function analyzeScopeImpact(
  filePath: string,
  startLine: number,
  endLine: number
): ScopeValidationResult {
  const warnings: string[] = [];
  const brokenScopes: ScopeInfo[] = [];
  const affectedScopes: ScopeInfo[] = [];

  if (!existsSync(filePath)) {
    return {
      success: false,
      willBreakScope: false,
      affectedScopes: [],
      brokenScopes: [],
      warnings: [scopeValidatorT("runtime.fileNotFound")],
      bracketIssues: [],
    };
  }

  const content = readFileSync(filePath, "utf-8");
  const ext = filePath.split(".").pop();

  if (!["js", "ts", "jsx", "tsx", "mjs", "cjs"].includes(ext ?? "")) {
    return {
      success: true,
      willBreakScope: false,
      affectedScopes: [],
      brokenScopes: [],
      warnings: [],
      bracketIssues: [],
    };
  }

  try {
    // NOTE: Debug logs are intentionally omitted. The MCP server should not write to stdout.

    const ast = parse(content, {
      sourceType: "module",
      plugins: [
        "typescript",
        "jsx",
        "decorators-legacy",
        "classProperties",
        "objectRestSpread",
        "optionalChaining",
        "nullishCoalescingOperator",
      ],
    });

    const scopes: ScopeInfo[] = [];

    traverse(ast, {
      ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
        const node = path.node;

        if (node.loc) {
          scopes.push({
            type: "import",
            name: "import statement",
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            startCol: node.loc.start.column,
            endCol: node.loc.end.column,
          });
        }
      },
      ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
        const node = path.node;

        if (node.loc) {
          scopes.push({
            type: "export",
            name: "export statement",
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            startCol: node.loc.start.column,
            endCol: node.loc.end.column,
          });
        }
      },
      FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
        const node = path.node;

        if (node.loc) {
          scopes.push({
            type: "function",
            name: node.id?.name ?? "anonymous",
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            startCol: node.loc.start.column,
            endCol: node.loc.end.column,
          });
        }
      },
      FunctionExpression(path: NodePath<t.FunctionExpression>) {
        const node = path.node;

        if (node.loc) {
          scopes.push({
            type: "function",
            name: node.id?.name ?? "anonymous",
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            startCol: node.loc.start.column,
            endCol: node.loc.end.column,
          });
        }
      },
      ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) {
        const node = path.node;

        if (node.loc) {
          scopes.push({
            type: "arrow",
            name: "arrow function",
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            startCol: node.loc.start.column,
            endCol: node.loc.end.column,
          });
        }
      },
      ClassDeclaration(path: NodePath<t.ClassDeclaration>) {
        const node = path.node;

        if (node.loc) {
          scopes.push({
            type: "class",
            name: node.id?.name ?? "anonymous",
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            startCol: node.loc.start.column,
            endCol: node.loc.end.column,
          });
        }
      },
      IfStatement(path: NodePath<t.IfStatement>) {
        const node = path.node;

        if (node.loc) {
          scopes.push({
            type: "if",
            name: "if statement",
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            startCol: node.loc.start.column,
            endCol: node.loc.end.column,
          });
        }
      },
      ForStatement(path: NodePath<t.ForStatement>) {
        const node = path.node;

        if (node.loc) {
          scopes.push({
            type: "for",
            name: "for loop",
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            startCol: node.loc.start.column,
            endCol: node.loc.end.column,
          });
        }
      },
      WhileStatement(path: NodePath<t.WhileStatement>) {
        const node = path.node;

        if (node.loc) {
          scopes.push({
            type: "while",
            name: "while loop",
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            startCol: node.loc.start.column,
            endCol: node.loc.end.column,
          });
        }
      },
      TryStatement(path: NodePath<t.TryStatement>) {
        const node = path.node;

        if (node.loc) {
          scopes.push({
            type: "try",
            name: "try block",
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            startCol: node.loc.start.column,
            endCol: node.loc.end.column,
          });
        }
      },
      SwitchStatement(path: NodePath<t.SwitchStatement>) {
        const node = path.node;

        if (node.loc) {
          scopes.push({
            type: "switch",
            name: "switch statement",
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            startCol: node.loc.start.column,
            endCol: node.loc.end.column,
          });
        }
      },
    });

    const isWrapperPattern = (scope: ScopeInfo): boolean => {
      if (scope.type === "arrow" && scope.endLine - scope.startLine < 10) {
        return true;
      }
      return false;
    };

    const isNestedInside = (child: ScopeInfo, parent: ScopeInfo): boolean => {
      return (
        child.startLine >= parent.startLine &&
        child.endLine <= parent.endLine &&
        !(child.startLine === parent.startLine && child.endLine === parent.endLine)
      );
    };

    const safeParentScopes: ScopeInfo[] = [];

    for (const scope of scopes) {
      const scopeStart = scope.startLine;
      const scopeEnd = scope.endLine;

      const intersects =
        (startLine >= scopeStart && startLine <= scopeEnd) ||
        (endLine >= scopeStart && endLine <= scopeEnd) ||
        (startLine <= scopeStart && endLine >= scopeEnd);

      if (intersects) {
        affectedScopes.push(scope);

        const isSafeType = ["import", "export"].includes(scope.type);

        const isWrapper = isWrapperPattern(scope);

        if (isSafeType || isWrapper) {
          safeParentScopes.push(scope);
          continue;
        }

        const isNestedInSafeParent = safeParentScopes.some((parent) =>
          isNestedInside(scope, parent)
        );
        if (isNestedInSafeParent) {
          continue;
        }

        if (scopeEnd >= startLine && scopeEnd <= endLine) {
          brokenScopes.push(scope);
          warnings.push(
            scopeValidatorT("runtime.scopeBreakClosing", {
              type: scope.type,
              name: scope.name,
              startLine: scope.startLine,
              endLine: scope.endLine,
            })
          );
        }

        if (scopeStart >= startLine && scopeStart <= endLine && scopeEnd > endLine) {
          brokenScopes.push(scope);
          warnings.push(
            scopeValidatorT("runtime.scopeBreakOpening", {
              type: scope.type,
              name: scope.name,
              startLine: scope.startLine,
              endLine: scope.endLine,
            })
          );
        }
      }
    }
  } catch (err) {
    const error = err as Error;
    warnings.push(scopeValidatorT("runtime.astParsingFailed", { message: error.message }));
  }

  return {
    success: brokenScopes.length === 0,
    willBreakScope: brokenScopes.length > 0,
    affectedScopes,
    brokenScopes,
    warnings,
    bracketIssues: [],
  };
}

function isOnlyVariableRename(oldContent: string, newContent: string): boolean {
  const normalize = (s: string): unknown => {
    return s
      .replace(/\b[a-z_$][a-zA-Z0-9_$]*\b/g, "VAR")
      .replace(/\s+/g, " ")
      .trim();
  };

  return normalize(oldContent) === normalize(newContent);
}

function isOnlyTypeChange(oldContent: string, newContent: string): boolean {
  const removeTypes = (s: string): unknown => {
    return s
      .replace(/:\s*[A-Z][a-zA-Z0-9<>[\]|&,\s]*(?=[,;)])/g, ": TYPE")
      .replace(/<[^>]+>/g, "<T>")
      .replace(/\s+/g, " ")
      .trim();
  };

  return removeTypes(oldContent) === removeTypes(newContent);
}

function isOnlyOptionalChainingAddition(oldContent: string, newContent: string): boolean {
  const removeOptional = (s: string): string => s.replace(/\?\./g, ".").replace(/\??\[/g, "[");

  return removeOptional(oldContent) === removeOptional(newContent);
}

export function validateBracketBalance(
  oldContent: string,
  newContent: string
): { balanced: boolean; details: string[] } {
  const oldBrackets = countBracketsContextAware(oldContent);
  const newBrackets = countBracketsContextAware(newContent);

  const issues: string[] = [];
  const pairs: Array<[string, string]> = [
    ["(", ")"],
    ["{", "}"],
    ["[", "]"],
  ];

  for (const [openChar, closeChar] of pairs) {
    const oldOpenCount = oldBrackets.open[openChar]?.length ?? 0;
    const oldCloseCount = oldBrackets.close[closeChar]?.length ?? 0;
    const newOpenCount = newBrackets.open[openChar]?.length ?? 0;
    const newCloseCount = newBrackets.close[closeChar]?.length ?? 0;

    const wasBalanced = oldOpenCount === oldCloseCount;
    const isBalanced = newOpenCount === newCloseCount;

    if (wasBalanced && !isBalanced) {
      const isBenignChange =
        isOnlyVariableRename(oldContent, newContent) ||
        isOnlyTypeChange(oldContent, newContent) ||
        isOnlyOptionalChainingAddition(oldContent, newContent);

      if (isBenignChange) {
        continue;
      }

      const diff = Math.abs(newOpenCount - newCloseCount);
      const missing = newOpenCount > newCloseCount ? closeChar : openChar;
      issues.push(
        scopeValidatorT("runtime.bracketBalanceBroken", {
          pair: `${openChar}${closeChar}`,
          diff,
          missing,
          direction:
            newOpenCount > newCloseCount
              ? scopeValidatorT("runtime.balanceDirection.missing")
              : scopeValidatorT("runtime.balanceDirection.extra"),
        })
      );
    }
  }

  return {
    balanced: issues.length === 0,
    details: issues,
  };
}
