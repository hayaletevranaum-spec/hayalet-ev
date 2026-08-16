import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

type ImportEdge = {
  importer: string;
  target: string;
  specifier: string;
};

type FileMetric = {
  file: string;
  functions: number;
  imports: number;
  importedBy: number;
  importsLocal: number;
  loc: number;
};

type MarkerHit = {
  file: string;
  line: number;
  text: string;
};

type CssAudit = {
  cssClasses: number;
  cssFiles: string[];
  possiblyUnused: string[];
  possiblyUnusedCount: number;
  uiReferencedClassTokens: number;
};

type Inventory = {
  css: CssAudit;
  dynamicKeepList: string[];
  generatedAt?: string;
  legacyMarkers: MarkerHit[];
  summary: {
    cssFileCount: number;
    cssPossiblyUnusedCount: number;
    legacyMarkerCount: number;
    tsFileCount: number;
    zeroIndegreeCandidateCount: number;
  };
  topFanIn: Array<FileMetric & { importers: string[] }>;
  topLoc: FileMetric[];
  zeroIndegreeCandidates: string[];
};

type BuildInventoryOptions = {
  includeGeneratedAt?: boolean;
};

const ROOT = process.cwd();
const LAB_ROOT = join(ROOT, "rooms", "laboratory");
const TEST_ROOT = join(ROOT, "scripts", "tests");
const MARKER_PATTERN = /\b(fallback|legacy|deprecated|compat|temporary|shim|dead|unused|stale)\b/i;

const ENTRY_HINTS = new Set([
  "rooms/laboratory/host/index.ts",
  "rooms/laboratory/host/runtime.ts",
  "rooms/laboratory/scripts/laboratory-cleanup-inventory.ts",
  "rooms/laboratory/scripts/laboratory-dead-code-gate.ts",
  "rooms/laboratory/ui/index.ts",
  "rooms/laboratory/ui/bootstrap.ts",
]);

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

function countLines(source: string): number {
  return source.split(/\r?\n/).length;
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

function collectImportSpecifiers(filePath: string): string[] {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];

  sourceFile.forEachChild((node) => {
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }
  });

  return specifiers;
}

function collectFunctionCount(filePath: string): number {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true);
  let functions = 0;

  function visit(node: ts.Node): void {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node)
    ) {
      functions += 1;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return functions;
}

function buildDynamicKeepList(): string[] {
  const keepList = new Set<string>();
  const manifestPath = join(LAB_ROOT, "manifest.json");

  keepList.add("rooms/laboratory/manifest.json");
  keepList.add("rooms/laboratory/ui/index.html");
  keepList.add("rooms/laboratory/ui/style.css");
  keepList.add("rooms/laboratory/i18n/**");
  keepList.add("rooms/laboratory/tools/**");
  keepList.add("rooms/laboratory/tools/**/*.py");
  keepList.add("rooms/laboratory/tools/**/*.conf");
  keepList.add("rooms/laboratory/tools/**/*.inc");
  keepList.add("rooms/laboratory/features/**/assets/**");

  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
    const runtime = readRecord(manifest["runtime"]);
    const menu = readRecord(manifest["menu"]);
    const i18n = readRecord(manifest["i18n"]);
    const scene = readRecord(manifest["scene"]);

    addManifestPath(keepList, runtime["uiEntry"]);
    addManifestPath(keepList, runtime["hostEntry"]);
    addManifestPath(keepList, menu["iconSrc"]);
    addManifestPath(keepList, i18n["baseDir"]);
    addManifestPath(keepList, scene["roomBackgroundSrc"]);

    const features = Array.isArray(manifest["features"]) ? manifest["features"] : [];
    for (const feature of features) {
      const featureRecord = readRecord(feature);
      const featureScene = readRecord(featureRecord["scene"]);
      const view = readRecord(featureScene["view"]);
      addManifestPath(keepList, view["backgroundSrc"]);
    }
  }

  return Array.from(keepList).sort();
}

function addManifestPath(keepList: Set<string>, value: unknown): void {
  if (typeof value !== "string" || value.trim() === "") {
    return;
  }
  keepList.add(`rooms/laboratory/${value.replace(/^\/+/, "")}`);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && Array.isArray(value) !== true
    ? (value as Record<string, unknown>)
    : {};
}

function collectLegacyMarkers(files: string[]): MarkerHit[] {
  const hits: MarkerHit[] = [];
  for (const filePath of files) {
    if (/\.(ts|json|css|html|md|py|conf|inc)$/.test(filePath) !== true) {
      continue;
    }
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (MARKER_PATTERN.test(line)) {
        hits.push({
          file: toRelative(filePath),
          line: index + 1,
          text: line.trim(),
        });
      }
    });
  }
  return hits;
}

function collectCssAudit(cssFiles: string[], uiFiles: string[]): CssAudit {
  const cssClasses = new Set<string>();
  const referenced = new Set<string>();

  for (const filePath of cssFiles) {
    const source = readFileSync(filePath, "utf8");
    for (const match of source.matchAll(/\.([_a-zA-Z][_a-zA-Z0-9-]*)/g)) {
      const className = match[1];
      if (className && className !== "css") {
        cssClasses.add(className);
      }
    }
  }

  for (const filePath of uiFiles) {
    const source = readFileSync(filePath, "utf8");
    for (const match of source.matchAll(/class(?:Name)?\s*=\s*["'`]([^"'`]+)["'`]/g)) {
      const classList = match[1];
      if (!classList) {
        continue;
      }
      for (const token of classList.split(/\s+/)) {
        const normalized = token.replace(/\$\{.*$/, "").trim();
        if (normalized) {
          referenced.add(normalized);
        }
      }
    }
    for (const match of source.matchAll(/\b(labx-[a-zA-Z0-9_-]+|is-[a-zA-Z0-9_-]+)/g)) {
      const className = match[1];
      if (className) {
        referenced.add(className);
      }
    }
  }

  const possiblyUnused = Array.from(cssClasses)
    .filter((className) => referenced.has(className) !== true)
    .sort();

  return {
    cssClasses: cssClasses.size,
    cssFiles: cssFiles.map(toRelative).sort(),
    possiblyUnused,
    possiblyUnusedCount: possiblyUnused.length,
    uiReferencedClassTokens: referenced.size,
  };
}

export async function buildInventory(options: BuildInventoryOptions = {}): Promise<Inventory> {
  const labFiles = await walkFiles(LAB_ROOT);
  const tsFiles = labFiles.filter((filePath) => filePath.endsWith(".ts"));
  const testFiles = (await walkFiles(TEST_ROOT)).filter(
    (filePath) => filePath.endsWith(".ts") && readFileSync(filePath, "utf8").includes("laboratory")
  );
  const moduleMap = buildModuleMap(tsFiles);
  const indegree = new Map(tsFiles.map((filePath) => [filePath, 0]));
  const outdegree = new Map(tsFiles.map((filePath) => [filePath, 0]));
  const importersByFile = new Map(tsFiles.map((filePath) => [filePath, [] as string[]]));
  const edges: ImportEdge[] = [];

  for (const importer of tsFiles.concat(testFiles)) {
    let localImports = 0;
    for (const specifier of collectImportSpecifiers(importer)) {
      const target = resolveLocalImport(importer, specifier, moduleMap);
      if (target === null) {
        continue;
      }
      localImports += 1;
      indegree.set(target, (indegree.get(target) || 0) + 1);
      importersByFile.get(target)?.push(toRelative(importer));
      edges.push({
        importer: toRelative(importer),
        target: toRelative(target),
        specifier,
      });
    }
    if (outdegree.has(importer)) {
      outdegree.set(importer, localImports);
    }
  }

  const metrics = tsFiles.map((filePath): FileMetric => {
    const source = readFileSync(filePath, "utf8");
    return {
      file: toRelative(filePath),
      functions: collectFunctionCount(filePath),
      imports: collectImportSpecifiers(filePath).length,
      importedBy: indegree.get(filePath) || 0,
      importsLocal: outdegree.get(filePath) || 0,
      loc: countLines(source),
    };
  });

  const zeroIndegreeCandidates = metrics
    .filter((metric) => metric.importedBy === 0 && ENTRY_HINTS.has(metric.file) !== true)
    .map((metric) => metric.file)
    .sort();
  const cssFiles = labFiles.filter((filePath) => filePath.endsWith(".css"));
  const uiFiles = labFiles.filter(
    (filePath) =>
      filePath.startsWith(join(LAB_ROOT, "ui")) && /\.(ts|html)$/.test(filePath) === true
  );
  const legacyMarkers = collectLegacyMarkers(labFiles);
  const css = collectCssAudit(cssFiles, uiFiles);

  void edges;

  return {
    css,
    dynamicKeepList: buildDynamicKeepList(),
    ...(options.includeGeneratedAt === true ? { generatedAt: new Date().toISOString() } : {}),
    legacyMarkers,
    summary: {
      cssFileCount: cssFiles.length,
      cssPossiblyUnusedCount: css.possiblyUnusedCount,
      legacyMarkerCount: legacyMarkers.length,
      tsFileCount: tsFiles.length,
      zeroIndegreeCandidateCount: zeroIndegreeCandidates.length,
    },
    topFanIn: metrics
      .slice()
      .sort((left, right) => right.importedBy - left.importedBy)
      .slice(0, 30)
      .map((metric) => ({
        ...metric,
        importers: (importersByFile.get(join(ROOT, metric.file)) || []).slice(0, 12),
      })),
    topLoc: metrics
      .slice()
      .sort((left, right) => right.loc - left.loc)
      .slice(0, 40),
    zeroIndegreeCandidates,
  };
}

function getOutputPath(): string | null {
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex === -1) {
    return null;
  }
  const outputPath = process.argv[outputIndex + 1];
  return outputPath ? resolve(outputPath) : null;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main(): Promise<void> {
  const inventory = await buildInventory({
    includeGeneratedAt: hasFlag("--include-generated-at"),
  });
  const output = `${JSON.stringify(inventory, null, 2)}\n`;
  const outputPath = getOutputPath();

  if (outputPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output, "utf8");
    console.log(`Wrote ${relative(ROOT, outputPath)}`);
    return;
  }

  console.log(output);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;

if (invokedPath === import.meta.url) {
  await main();
}
