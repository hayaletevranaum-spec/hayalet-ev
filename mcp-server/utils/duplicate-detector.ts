import { parse } from "@typescript-eslint/typescript-estree";
import type { TSESTree } from "@typescript-eslint/typescript-estree";
import { readFile } from "fs/promises";

const TEMPLATE_PATTERNS = [
  /^\*\*Category:\*\*/,
  /^\*\*Prefix:\*\*/,
  /^\*\*Description:\*\*/,
  /^\*\*Tool:\*\*/,
  /^\*\*Use Case:\*\*/,
  /^\*\*When:\*\*/,
  /^\*\*Impact:\*\*/,
  /^\*\*Status:\*\*/,
  /^---+$/,
  /^===+$/,
  /^#{1,6}\s/,
  /^\s*\|\s*[-:]+\s*\|/,
  /^import\s+.*from\s+['"].*['"];?$/,
  /^export\s+\{.*\}\s+from/,
  /^\s*\/\/\s*TODO:/,
  /^\s*\/\/\s*FIXME:/,
  /^\s*console\.(log|warn|error)\(/,
];

function isTemplatePattern(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return true;
  return TEMPLATE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

interface ScopeInfo {
  type:
    | "function"
    | "class"
    | "method"
    | "block"
    | "switch-case"
    | "interface"
    | "type-alias"
    | "file";
  name: string;
  startLine: number;
  endLine: number;
  parentScope?: ScopeInfo;
}

interface DuplicateInfo {
  line1: number;
  line2: number;
  content: string;
  scope: string;
}

function buildScopeMap(ast: TSESTree.Program): Map<number, ScopeInfo> {
  const scopeMap = new Map<number, ScopeInfo>();

  const fileScope: ScopeInfo = {
    type: "file",
    name: "<file>",
    startLine: 0,
    endLine: Infinity,
  };

  function visit(node: TSESTree.Node, currentScope: ScopeInfo): void {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (node.loc == null) return;

    const start = node.loc.start.line;
    const end = node.loc.end.line;

    let newScope: ScopeInfo | null = null;

    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      const funcNode = node;
      newScope = {
        type: "function",
        name: funcNode.id?.name ?? "<anonymous>",
        startLine: start,
        endLine: end,
        parentScope: currentScope,
      };
    } else if (node.type === "ClassDeclaration") {
      const classNode = node;
      newScope = {
        type: "class",
        name: classNode.id?.name ?? "<anonymous>",
        startLine: start,
        endLine: end,
        parentScope: currentScope,
      };
    } else if (node.type === "MethodDefinition") {
      const methodNode = node;
      newScope = {
        type: "method",
        name: methodNode.key.type === "Identifier" ? methodNode.key.name : "<computed>",
        startLine: start,
        endLine: end,
        parentScope: currentScope,
      };
    } else if (node.type === "TSInterfaceDeclaration") {
      const interfaceNode = node;
      newScope = {
        type: "interface",
        name: interfaceNode.id.name,
        startLine: start,
        endLine: end,
        parentScope: currentScope,
      };
    } else if (node.type === "TSTypeAliasDeclaration") {
      const typeNode = node;
      newScope = {
        type: "type-alias",
        name: typeNode.id.name,
        startLine: start,
        endLine: end,
        parentScope: currentScope,
      };
    } else if (node.type === "SwitchCase") {
      const caseNode = node;
      const caseValue =
        caseNode.test?.type === "Literal" ? String(caseNode.test.value) : "<default>";
      newScope = {
        type: "switch-case",
        name: `case ${caseValue}`,
        startLine: start,
        endLine: end,
        parentScope: currentScope,
      };
    } else if (node.type === "BlockStatement") {
      // NOTE: Only create scope for blocks that are not part of function/class.
      if (
        currentScope.type !== "function" &&
        currentScope.type !== "method" &&
        currentScope.type !== "class"
      ) {
        newScope = {
          type: "block",
          name: `<block@${start}>`,
          startLine: start,
          endLine: end,
          parentScope: currentScope,
        };
      }
    }

    const scopeToUse = newScope ?? currentScope;

    for (let line = start; line <= end; line++) {
      if (!scopeMap.has(line) || (newScope && scopeMap.get(line)?.type === "file")) {
        scopeMap.set(line, scopeToUse);
      }
    }

    const keys = Object.keys(node) as Array<keyof typeof node>;
    for (const key of keys) {
      const child = node[key];
      if (child != null && typeof child === "object") {
        if (Array.isArray(child)) {
          child.forEach((item: unknown) => {
            if (item != null && typeof item === "object" && "type" in item) {
              visit(item as TSESTree.Node, scopeToUse);
            }
          });
        } else if ("type" in child) {
          visit(child, scopeToUse);
        }
      }
    }
  }

  visit(ast, fileScope);

  return scopeMap;
}

function areSameScope(scope1: ScopeInfo, scope2: ScopeInfo): boolean {
  if (scope1.type !== scope2.type) return false;

  if (scope1.startLine !== scope2.startLine || scope1.endLine !== scope2.endLine) {
    return false;
  }

  if (scope1.type === "switch-case") {
    if (scope1.parentScope && scope2.parentScope) {
      return areSameScope(scope1.parentScope, scope2.parentScope);
    }
    if (scope1.parentScope || scope2.parentScope) {
      return false;
    }
  }

  if (
    scope1.type === "function" ||
    scope1.type === "method" ||
    scope1.type === "class" ||
    scope1.type === "interface" ||
    scope1.type === "type-alias"
  ) {
    return scope1.name === scope2.name;
  }

  return true;
}

export async function detectContextAwareDuplicates(
  filePath: string,
  changedLineStart: number,
  changedLineEnd: number,
  searchRadius: number = 20
): Promise<DuplicateInfo[]> {
  try {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");

    const ext = filePath.toLowerCase();
    const isCodeFile =
      ext.endsWith(".ts") ||
      ext.endsWith(".tsx") ||
      ext.endsWith(".js") ||
      ext.endsWith(".jsx") ||
      ext.endsWith(".mjs") ||
      ext.endsWith(".cjs");

    if (!isCodeFile) {
      return detectSimpleDuplicates(lines, changedLineStart, changedLineEnd, searchRadius);
    }

    let ast: TSESTree.Program;
    try {
      ast = parse(content, {
        loc: true,
        range: true,
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      });
    } catch (_parseError) {
      return detectSimpleDuplicates(lines, changedLineStart, changedLineEnd, searchRadius);
    }

    const scopeMap = buildScopeMap(ast);

    const duplicates: DuplicateInfo[] = [];
    const changedLines = lines.slice(changedLineStart, changedLineEnd);

    for (let i = 0; i < changedLines.length; i++) {
      const changedLine = (changedLines[i] ?? "").trim();
      if (changedLine.length < 10) continue;
      if (changedLine.startsWith("//") || changedLine.startsWith("/*")) continue;
      if (isTemplatePattern(changedLine)) continue;

      const changedLineNum = changedLineStart + i + 1;
      const changedScope = scopeMap.get(changedLineNum);

      const searchStart = Math.max(0, changedLineStart - searchRadius);
      const searchEnd = Math.min(lines.length, changedLineEnd + searchRadius);

      for (let j = searchStart; j < searchEnd; j++) {
        if (j >= changedLineStart && j < changedLineEnd) continue;

        const compareLine = (lines[j] ?? "").trim();
        if (changedLine === compareLine && compareLine.length > 0) {
          const compareLineNum = j + 1;
          const compareScope = scopeMap.get(compareLineNum);

          if (changedScope && compareScope && areSameScope(changedScope, compareScope)) {
            duplicates.push({
              line1: changedLineNum,
              line2: compareLineNum,
              content: changedLine,
              scope: changedScope.name !== "" ? changedScope.name : changedScope.type,
            });
            break;
          }
        }
      }
    }

    return duplicates;
  } catch (error) {
    // NOTE: Duplicate detection is advisory and must not block the caller.
    process.stderr.write(`Duplicate detection error: ${String(error)}\n`);
    return [];
  }
}

function detectSimpleDuplicates(
  lines: string[],
  changedLineStart: number,
  changedLineEnd: number,
  searchRadius: number
): DuplicateInfo[] {
  const duplicates: DuplicateInfo[] = [];
  const changedLines = lines.slice(changedLineStart, changedLineEnd);

  for (let i = 0; i < changedLines.length; i++) {
    const changedLine = (changedLines[i] ?? "").trim();
    if (changedLine.length < 10) continue;
    if (isTemplatePattern(changedLine)) continue;

    const changedLineNum = changedLineStart + i + 1;
    const searchStart = Math.max(0, changedLineStart - searchRadius);
    const searchEnd = Math.min(lines.length, changedLineEnd + searchRadius);

    for (let j = searchStart; j < searchEnd; j++) {
      if (j >= changedLineStart && j < changedLineEnd) continue;

      const compareLine = (lines[j] ?? "").trim();
      if (changedLine === compareLine && compareLine.length > 0) {
        duplicates.push({
          line1: changedLineNum,
          line2: j + 1,
          content: changedLine,
          scope: "<unknown>",
        });
        break;
      }
    }
  }

  return duplicates;
}
