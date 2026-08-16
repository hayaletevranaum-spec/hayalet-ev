import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

import { buildInventory } from "./laboratory-cleanup-inventory.ts";

type ExportHit = {
  exportName: string;
  file: string;
  kind: string;
  line: number;
};

type GateReport = {
  summary: {
    unusedExportCount: number;
    unusedFileCount: number;
  };
  unusedExports: ExportHit[];
  unusedFiles: string[];
};

const ROOT = process.cwd();
const LAB_ROOT = join(ROOT, "rooms", "laboratory");
const TEST_ROOT = join(ROOT, "scripts", "tests");
const ENTRY_FILES = new Set([
  "rooms/laboratory/host/index.ts",
  "rooms/laboratory/host/runtime.ts",
  "rooms/laboratory/ui/index.ts",
  "rooms/laboratory/ui/bootstrap.ts",
  "rooms/laboratory/runtime/lab-selectors.ts",
  "rooms/laboratory/runtime/lab-run-controller.ts",
  "rooms/laboratory/runtime/lab-store.ts",
  "rooms/laboratory/ui/workspace-surface.ts",
  "rooms/laboratory/ui/lab-waveform-timeline-render.ts",
]);
const IGNORE_EXPORT_FILES = new Set([
  "rooms/laboratory/domain/lab-types.ts",
  "rooms/laboratory/shared/types/lab-process-events.ts",
]);
const IGNORE_EXPORT_PATH_PATTERNS = [
  /^rooms\/laboratory\/services\//,
  /^rooms\/laboratory\/shared\/host\//,
  /^rooms\/laboratory\/shared\/types\//,
  /^rooms\/laboratory\/ui\/lab-root\.ts$/,
  /^rooms\/laboratory\/ui\/lab-runtime-i18n\.ts$/,
  /^rooms\/laboratory\/ui\/lab-waveform-timeline-types\.ts$/,
];

function toRelative(filePath: string): string {
  return relative(ROOT, filePath).replace(/\\/g, "/");
}

async function walkFiles(root: string): Promise<string[]> {
  if (existsSync(root) !== true) {
    return [];
  }

  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function buildModuleMap(tsFiles: string[]): Map<string, string> {
  const moduleMap = new Map<string, string>();
  for (const filePath of tsFiles) {
    moduleMap.set(filePath, filePath);
    moduleMap.set(filePath.replace(/\.ts$/, ".js"), filePath);
  }
  return moduleMap;
}

function resolveLocalImport(
  importerPath: string,
  specifier: string,
  moduleMap: Map<string, string>
): string | null {
  if (specifier.startsWith(".") !== true) {
    return null;
  }

  const base = resolve(dirname(importerPath), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.js`,
    join(base, "index.ts"),
    join(base, "index.js"),
  ];

  for (const candidate of candidates) {
    const mapped = moduleMap.get(candidate) || moduleMap.get(candidate.replace(/\.js$/, ".ts"));
    if (mapped) {
      return mapped;
    }
  }

  return null;
}

function getImportedNames(importerPath: string, moduleMap: Map<string, string>) {
  const source = readFileSync(importerPath, "utf8");
  const sourceFile = ts.createSourceFile(importerPath, source, ts.ScriptTarget.Latest, true);
  const importsByTarget = new Map<string, Set<string>>();

  function upsert(target: string, name: string): void {
    const names = importsByTarget.get(target) || new Set<string>();
    names.add(name);
    importsByTarget.set(target, names);
  }

  sourceFile.forEachChild((node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = resolveLocalImport(importerPath, node.moduleSpecifier.text, moduleMap);
      if (target === null) {
        return;
      }
      const clause = node.importClause;
      if (clause?.name) {
        upsert(target, "default");
      }
      if (clause?.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings)) {
          upsert(target, "*");
        } else {
          clause.namedBindings.elements.forEach((element) => {
            upsert(target, element.propertyName?.text || element.name.text);
          });
        }
      }
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const target = resolveLocalImport(importerPath, node.moduleSpecifier.text, moduleMap);
      if (target === null) {
        return;
      }
      if (!node.exportClause) {
        upsert(target, "*");
        return;
      }
      if (ts.isNamedExports(node.exportClause)) {
        node.exportClause.elements.forEach((element) => {
          upsert(target, element.propertyName?.text || element.name.text);
        });
      }
    }
  });

  return importsByTarget;
}

function getNodeLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function collectNamedExports(filePath: string): ExportHit[] {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const hits: ExportHit[] = [];

  function push(name: string, kind: string, node: ts.Node): void {
    if (name.trim() === "") {
      return;
    }
    hits.push({
      exportName: name,
      file: toRelative(filePath),
      kind,
      line: getNodeLine(sourceFile, node),
    });
  }

  sourceFile.forEachChild((node) => {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const isExported = modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (isExported !== true) {
      return;
    }

    if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      push(node.name?.text || "", ts.SyntaxKind[node.kind], node);
      return;
    }

    if (ts.isVariableStatement(node)) {
      node.declarationList.declarations.forEach((declaration) => {
        if (ts.isIdentifier(declaration.name)) {
          push(declaration.name.text, "VariableStatement", declaration);
        }
      });
    }
  });

  return hits;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

const inventory = await buildInventory();
const labFiles = await walkFiles(LAB_ROOT);
const tsFiles = labFiles.filter((filePath) => filePath.endsWith(".ts"));
const testFiles = (await walkFiles(TEST_ROOT)).filter(
  (filePath) => filePath.endsWith(".ts") && filePath.includes("laboratory")
);
const moduleMap = buildModuleMap(tsFiles);
const importedNamesByFile = new Map<string, Set<string>>();

for (const importerPath of tsFiles.concat(testFiles)) {
  const importsByTarget = getImportedNames(importerPath, moduleMap);
  for (const [target, names] of importsByTarget) {
    const collected = importedNamesByFile.get(target) || new Set<string>();
    names.forEach((name) => {
      collected.add(name);
    });
    importedNamesByFile.set(target, collected);
  }
}

const unusedExports = tsFiles
  .flatMap((filePath) => {
    const relativePath = toRelative(filePath);
    if (
      ENTRY_FILES.has(relativePath) ||
      IGNORE_EXPORT_FILES.has(relativePath) ||
      IGNORE_EXPORT_PATH_PATTERNS.some((pattern) => pattern.test(relativePath))
    ) {
      return [];
    }

    const importedNames = importedNamesByFile.get(filePath) || new Set<string>();
    if (importedNames.has("*")) {
      return [];
    }

    return collectNamedExports(filePath).filter(
      (entry) => importedNames.has(entry.exportName) !== true
    );
  })
  .sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);

const report: GateReport = {
  summary: {
    unusedExportCount: unusedExports.length,
    unusedFileCount: inventory.zeroIndegreeCandidates.length,
  },
  unusedExports,
  unusedFiles: inventory.zeroIndegreeCandidates,
};

console.log(`${JSON.stringify(report, null, 2)}\n`);

if (
  hasFlag("--fail-on-findings") &&
  (unusedExports.length > 0 || inventory.zeroIndegreeCandidates.length > 0)
) {
  process.exitCode = 1;
}
