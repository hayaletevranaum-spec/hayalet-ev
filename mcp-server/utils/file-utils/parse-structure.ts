import type { CodeStructure } from "../../types/index-mcp.js";

// NOTE: Regex-based parsing is used for performance instead of full AST parsing.
export function parseCodeStructure(content: string, extension: string): CodeStructure[] {
  const structures: CodeStructure[] = [];
  const lines = content.split("\n");

  // NOTE: Only parse TS/JS files.
  if (![".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(extension)) {
    return structures;
  }

  const stack: { type: string; name: string; startLine: number; braceCount: number }[] = [];
  let braceCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line == null || line.length === 0) continue;
    const lineNum = i;

    const openBraces = (line.match(/{/g) ?? []).length;
    const closeBraces = (line.match(/}/g) ?? []).length;

    const funcMatch = line.match(/^(\s*)(export\s+)?(async\s+)?function\s+(\w+)\s*\(/);
    const funcName = funcMatch?.[4];
    if (typeof funcName === "string" && funcName.length > 0) {
      stack.push({ type: "function", name: funcName, startLine: lineNum, braceCount });
    }

    const arrowMatch = line.match(
      /^(\s*)(export\s+)?(const|let|var)\s+(\w+)\s*=\s*(async\s*)?\([^)]*\)\s*(:\s*\w+)?\s*=>/
    );
    const arrowName = arrowMatch?.[4];
    if (typeof arrowName === "string" && arrowName.length > 0) {
      stack.push({ type: "function", name: arrowName, startLine: lineNum, braceCount });
    }

    const classMatch = line.match(/^(\s*)(export\s+)?(abstract\s+)?class\s+(\w+)/);
    const className = classMatch?.[4];
    if (typeof className === "string" && className.length > 0) {
      stack.push({ type: "class", name: className, startLine: lineNum, braceCount });
    }

    const interfaceMatch = line.match(/^(\s*)(export\s+)?interface\s+(\w+)/);
    const interfaceName = interfaceMatch?.[3];
    if (typeof interfaceName === "string" && interfaceName.length > 0) {
      stack.push({ type: "interface", name: interfaceName, startLine: lineNum, braceCount });
    }

    const typeMatch = line.match(/^(\s*)(export\s+)?type\s+(\w+)\s*=/);
    const typeName = typeMatch?.[3];
    if (typeof typeName === "string" && typeName.length > 0) {
      stack.push({ type: "type", name: typeName, startLine: lineNum, braceCount });
    }

    const methodMatch = line.match(/^(\s+)(async\s+)?(\w+)\s*\([^)]*\)\s*(:\s*[^{]+)?\s*{/);
    const methodName = methodMatch?.[3];
    if (
      typeof methodName === "string" &&
      methodName.length > 0 &&
      stack.length > 0 &&
      stack[stack.length - 1]?.type === "class"
    ) {
      stack.push({ type: "method", name: methodName, startLine: lineNum, braceCount });
    }

    braceCount += openBraces - closeBraces;

    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      if (!current) break;
      if (braceCount <= current.braceCount) {
        stack.pop();
        structures.push({
          type: current.type as CodeStructure["type"],
          name: current.name,
          startLine: current.startLine,
          endLine: lineNum,
        });
      } else {
        break;
      }
    }
  }

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    structures.push({
      type: current.type as CodeStructure["type"],
      name: current.name,
      startLine: current.startLine,
      endLine: lines.length - 1,
    });
  }

  return structures.sort((a, b) => a.startLine - b.startLine);
}
