import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const CSS_IMPORT_PATTERN = /@import\s+(?:url\()?["']([^"']+)["']\)?\s*;/g;

function isLocalCssImport(importPath: string): boolean {
  return importPath.startsWith(".") === true;
}

export function readCssWithImports(filePath: string, seenPaths = new Set<string>()): string {
  const absolutePath = resolve(filePath);
  if (seenPaths.has(absolutePath)) {
    return "";
  }

  seenPaths.add(absolutePath);

  const source = readFileSync(absolutePath, "utf8");
  const importedSources = Array.from(source.matchAll(CSS_IMPORT_PATTERN), function (match) {
    const importPath = match[1] as string;
    if (isLocalCssImport(importPath) === false) {
      return "";
    }

    return readCssWithImports(resolve(dirname(absolutePath), importPath), seenPaths);
  }).filter(Boolean);

  return [source, ...importedSources].join("\n");
}
