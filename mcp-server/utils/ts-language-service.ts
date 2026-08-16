// NOTE: Lazy, multi-tsconfig language service with auto-dispose to cap memory use.

import * as ts from "typescript";
import { readFileSync, existsSync } from "fs";
import { join, relative, dirname } from "path";

export interface TsConfigMapping {
  name: string;
  configPath: string;
  // NOTE: Glob-like prefixes to match files to this tsconfig.
  pathPrefixes: string[];
}

export interface TypeInfoResult {
  displayString: string;
  documentation: string;
  kind: string;
  kindModifiers: string;
}

export interface DefinitionResult {
  file: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  kind?: string;
  name?: string;
  containerName?: string;
}

export interface ReferenceResult {
  file: string;
  line: number;
  column: number;
  lineText: string;
  isDefinition: boolean;
  isWriteAccess: boolean;
}

export interface CompletionResult {
  name: string;
  kind: string;
  sortText: string;
  insertText?: string;
  documentation?: string;
}

export interface DiagnosticResult {
  file: string;
  line: number;
  column: number;
  code: number;
  message: string;
  category: "error" | "warning" | "suggestion" | "message";
}

export interface RenameEdit {
  file: string;
  changes: Array<{
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
    newText: string;
  }>;
}

export interface DocumentSymbolResult {
  name: string;
  kind: string;
  line: number;
  endLine: number;
  children?: DocumentSymbolResult[];
}

export interface SignatureHelpResult {
  label: string;
  documentation: string;
  parameters: Array<{
    name: string;
    documentation: string;
    type: string;
  }>;
  activeParameter: number;
}

interface ProjectInstance {
  service: ts.LanguageService;
  program: ts.Program | undefined;
  configName: string;
  configPath: string;
  fileNames: string[];
  fileVersions: Map<string, number>;
  lastUsed: number;
  compilerOptions: ts.CompilerOptions;
}

// NOTE: Auto-dispose after 90 seconds of inactivity.
const DISPOSE_TIMEOUT_MS = 90_000;

// NOTE: Disposal check interval.
const DISPOSE_CHECK_INTERVAL_MS = 30_000;

// NOTE: Keep at most one warm project to cap memory usage on small machines.
const MAX_LOADED_PROJECTS = 1;

// NOTE: Map TS diagnostic categories to result labels.
const DIAGNOSTIC_CATEGORIES: Record<number, DiagnosticResult["category"]> = {
  [ts.DiagnosticCategory.Error]: "error",
  [ts.DiagnosticCategory.Warning]: "warning",
  [ts.DiagnosticCategory.Suggestion]: "suggestion",
  [ts.DiagnosticCategory.Message]: "message",
};

export class TsLanguageServiceManager {
  private projects = new Map<string, ProjectInstance>();
  private projectRoot: string;
  private configs: TsConfigMapping[];
  private disposeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(projectRoot: string, configs?: TsConfigMapping[]) {
    this.projectRoot = projectRoot;
    this.configs = configs ?? this.detectConfigs();
    this.startDisposeWatcher();
  }

  private detectConfigs(): TsConfigMapping[] {
    const mappings: TsConfigMapping[] = [];

    // NOTE: Check the narrowest tsconfig mappings first so shared files resolve predictably.
    const candidates: Array<{ name: string; file: string; prefixes: string[] }> = [
      { name: "tsconfig.mcp", file: "mcp-server/tsconfig.mcp.json", prefixes: ["mcp-server/"] },
      {
        name: "tsconfig.electron",
        file: "electron/tsconfig.electron.json",
        prefixes: ["electron/"],
      },
      {
        name: "tsconfig",
        file: "src/tsconfig.json",
        prefixes: ["src/js/", "src/types/", "shared/"],
      },
    ];

    for (const candidate of candidates) {
      const fullPath = join(this.projectRoot, candidate.file);
      if (existsSync(fullPath)) {
        mappings.push({
          name: candidate.name,
          configPath: fullPath,
          pathPrefixes: candidate.prefixes,
        });
      }
    }

    return mappings;
  }

  private resolveConfig(filePath: string): TsConfigMapping | null {
    const rel = filePath.startsWith("/") ? relative(this.projectRoot, filePath) : filePath;

    for (const config of this.configs) {
      if (config.pathPrefixes.some((prefix) => rel.startsWith(prefix))) {
        return config;
      }
    }

    // NOTE: Default to the main project config when no prefix-specific mapping matches.
    const fallback = this.configs.find((c) => c.name === "tsconfig");
    return fallback ?? this.configs[0] ?? null;
  }

  private getProject(config: TsConfigMapping): ProjectInstance {
    const existing = this.projects.get(config.name);
    if (existing) {
      existing.lastUsed = Date.now();
      return existing;
    }

    // NOTE: Keep at most one warm project to cap memory use in large repos.
    while (this.projects.size >= MAX_LOADED_PROJECTS) {
      let oldestName: string | null = null;
      let oldestTime = Infinity;
      for (const [name, project] of this.projects) {
        if (project.lastUsed < oldestTime) {
          oldestTime = project.lastUsed;
          oldestName = name;
        }
      }
      if (oldestName != null && oldestName !== "") {
        const old = this.projects.get(oldestName);
        old?.service.dispose();
        this.projects.delete(oldestName);
      } else {
        break;
      }
    }

    const configFile = ts.readConfigFile(config.configPath, (path) => readFileSync(path, "utf-8"));

    const parsed = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      dirname(config.configPath)
    );

    const fileNames = parsed.fileNames;
    const fileVersions = new Map<string, number>();
    for (const f of fileNames) {
      fileVersions.set(f, 1);
    }

    const serviceHost: ts.LanguageServiceHost = {
      getScriptFileNames: () => fileNames,
      getScriptVersion: (fileName) => String(fileVersions.get(fileName) ?? 1),
      getScriptSnapshot: (fileName) => {
        if (!existsSync(fileName)) return undefined;
        const content = readFileSync(fileName, "utf-8");
        return ts.ScriptSnapshot.fromString(content);
      },
      getCurrentDirectory: () => this.projectRoot,
      getCompilationSettings: () => parsed.options,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };

    const service = ts.createLanguageService(serviceHost, ts.createDocumentRegistry());

    const project: ProjectInstance = {
      service,
      program: service.getProgram(),
      configName: config.name,
      configPath: config.configPath,
      fileNames,
      fileVersions,
      lastUsed: Date.now(),
      compilerOptions: parsed.options,
    };

    this.projects.set(config.name, project);
    return project;
  }

  private getServiceForFile(filePath: string): {
    service: ts.LanguageService;
    absolutePath: string;
    project: ProjectInstance;
  } | null {
    const config = this.resolveConfig(filePath);
    if (!config) return null;

    const project = this.getProject(config);
    const absolutePath = filePath.startsWith("/") ? filePath : join(this.projectRoot, filePath);

    // NOTE: Add ad-hoc files on demand so tool calls can inspect newly created files.
    if (!project.fileNames.includes(absolutePath)) {
      if (existsSync(absolutePath)) {
        project.fileNames.push(absolutePath);
        project.fileVersions.set(absolutePath, 1);
      } else {
        return null;
      }
    }

    return { service: project.service, absolutePath, project };
  }

  private getPosition(
    service: ts.LanguageService,
    filePath: string,
    line: number,
    column: number
  ): number {
    const program = service.getProgram();
    const sourceFile = program?.getSourceFile(filePath);
    if (!sourceFile) {
      // NOTE: Fall back to text scanning when the file is not in the current TS program.
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      let pos = 0;
      for (let i = 0; i < line - 1 && i < lines.length; i++) {
        pos += (lines[i]?.length ?? 0) + 1;
      }
      return pos + (column - 1);
    }

    // NOTE: Clamp coordinates so callers can safely probe near line endings.
    const lineCount = sourceFile.getLineStarts().length;
    const safeLine = Math.max(0, Math.min(line - 1, lineCount - 1));
    const lineStart = sourceFile.getLineStarts()[safeLine] ?? 0;
    const lineEnd =
      safeLine < lineCount - 1
        ? (sourceFile.getLineStarts()[safeLine + 1] ?? sourceFile.end) - 1
        : sourceFile.end;
    const lineLength = lineEnd - lineStart;
    const safeCol = Math.max(0, Math.min(column - 1, lineLength));

    return sourceFile.getPositionOfLineAndCharacter(safeLine, safeCol);
  }

  private getLineCol(
    sourceFile: ts.SourceFile,
    position: number
  ): { line: number; column: number } {
    const lc = sourceFile.getLineAndCharacterOfPosition(position);
    return { line: lc.line + 1, column: lc.character + 1 };
  }

  private startDisposeWatcher(): void {
    this.disposeTimer = setInterval(() => {
      const now = Date.now();
      for (const [name, project] of this.projects) {
        if (now - project.lastUsed > DISPOSE_TIMEOUT_MS) {
          project.service.dispose();
          this.projects.delete(name);
        }
      }
    }, DISPOSE_CHECK_INTERVAL_MS);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (this.disposeTimer !== null) {
      this.disposeTimer.unref();
    }
  }

  getTypeInfo(filePath: string, line: number, column: number): TypeInfoResult | null {
    const ctx = this.getServiceForFile(filePath);
    if (!ctx) return null;

    const pos = this.getPosition(ctx.service, ctx.absolutePath, line, column);
    const info = ctx.service.getQuickInfoAtPosition(ctx.absolutePath, pos);
    if (!info) return null;

    return {
      displayString: ts.displayPartsToString(info.displayParts),
      documentation: ts.displayPartsToString(info.documentation),
      kind: info.kind,
      kindModifiers: info.kindModifiers,
    };
  }

  getDefinition(filePath: string, line: number, column: number): DefinitionResult[] {
    const ctx = this.getServiceForFile(filePath);
    if (!ctx) return [];

    const pos = this.getPosition(ctx.service, ctx.absolutePath, line, column);
    const defs = ctx.service.getDefinitionAndBoundSpan(ctx.absolutePath, pos);
    if (!defs?.definitions) return [];

    return defs.definitions.map((def) => {
      const sourceFile = ctx.service.getProgram()?.getSourceFile(def.fileName);
      const start = sourceFile
        ? this.getLineCol(sourceFile, def.textSpan.start)
        : { line: 0, column: 0 };
      const end = sourceFile
        ? this.getLineCol(sourceFile, def.textSpan.start + def.textSpan.length)
        : undefined;

      const result: {
        file: string;
        line: number;
        column: number;
        kind: ts.ScriptElementKind;
        name: string;
        containerName: string;
        endLine?: number;
        endColumn?: number;
      } = {
        file: relative(this.projectRoot, def.fileName),
        line: start.line,
        column: start.column,
        kind: def.kind,
        name: def.name,
        containerName: def.containerName,
      };
      if (end?.line !== undefined) {
        result.endLine = end.line;
      }
      if (end?.column !== undefined) {
        result.endColumn = end.column;
      }
      return result;
    });
  }

  getReferences(filePath: string, line: number, column: number): ReferenceResult[] {
    const ctx = this.getServiceForFile(filePath);
    if (!ctx) return [];

    const pos = this.getPosition(ctx.service, ctx.absolutePath, line, column);
    const referencedSymbols = ctx.service.findReferences(ctx.absolutePath, pos);
    if (!referencedSymbols) return [];

    const results: ReferenceResult[] = [];

    for (const symbol of referencedSymbols) {
      for (const ref of symbol.references) {
        const sourceFile = ctx.service.getProgram()?.getSourceFile(ref.fileName);
        const loc = sourceFile
          ? this.getLineCol(sourceFile, ref.textSpan.start)
          : { line: 0, column: 0 };

        let lineText = "";
        if (sourceFile) {
          const lineStart = sourceFile.getPositionOfLineAndCharacter(loc.line - 1, 0);
          const lineEnd =
            loc.line < sourceFile.getLineStarts().length
              ? sourceFile.getPositionOfLineAndCharacter(loc.line, 0) - 1
              : sourceFile.getEnd();
          lineText = sourceFile.text.slice(lineStart, lineEnd).trim();
        }

        results.push({
          file: relative(this.projectRoot, ref.fileName),
          line: loc.line,
          column: loc.column,
          lineText: lineText.slice(0, 200),
          isDefinition: ref.isDefinition === true,
          isWriteAccess: ref.isWriteAccess,
        });
      }
    }

    return results;
  }

  getCompletions(
    filePath: string,
    line: number,
    column: number,
    options?: { maxItems?: number; triggerChar?: string }
  ): CompletionResult[] {
    const ctx = this.getServiceForFile(filePath);
    if (!ctx) return [];

    const pos = this.getPosition(ctx.service, ctx.absolutePath, line, column);
    const completionOptions: {
      includeCompletionsForModuleExports: true;
      includeCompletionsWithInsertText: true;
      triggerCharacter?: ts.CompletionsTriggerCharacter;
    } = {
      includeCompletionsForModuleExports: true,
      includeCompletionsWithInsertText: true,
    };
    if (options?.triggerChar !== undefined) {
      completionOptions.triggerCharacter = options.triggerChar as ts.CompletionsTriggerCharacter;
    }
    const completions = ctx.service.getCompletionsAtPosition(
      ctx.absolutePath,
      pos,
      completionOptions
    );
    if (!completions) return [];

    const maxItems = options?.maxItems ?? 50;

    return completions.entries.slice(0, maxItems).map((entry) => {
      const documentation = "";

      const result: {
        name: string;
        kind: ts.ScriptElementKind;
        sortText: string;
        documentation: string;
        insertText?: string;
      } = {
        name: entry.name,
        kind: entry.kind,
        sortText: entry.sortText,
        documentation,
      };
      if (entry.insertText !== undefined) {
        result.insertText = entry.insertText;
      }
      return result;
    });
  }

  getCompletionDetails(
    filePath: string,
    line: number,
    column: number,
    entryName: string
  ): { documentation: string; detail: string } | null {
    const ctx = this.getServiceForFile(filePath);
    if (!ctx) return null;

    const pos = this.getPosition(ctx.service, ctx.absolutePath, line, column);
    const details = ctx.service.getCompletionEntryDetails(
      ctx.absolutePath,
      pos,
      entryName,
      undefined,
      undefined,
      undefined,
      undefined
    );
    if (!details) return null;

    return {
      documentation: ts.displayPartsToString(details.documentation),
      detail: ts.displayPartsToString(details.displayParts),
    };
  }

  getDiagnostics(filePath: string): DiagnosticResult[] {
    const ctx = this.getServiceForFile(filePath);
    if (!ctx) return [];

    const syntactic = ctx.service.getSyntacticDiagnostics(ctx.absolutePath);
    const semantic = ctx.service.getSemanticDiagnostics(ctx.absolutePath);
    const suggestion = ctx.service.getSuggestionDiagnostics(ctx.absolutePath);

    const all = [...syntactic, ...semantic, ...suggestion];

    return all.map((diag) => {
      const sourceFile = diag.file;
      let line = 0;
      let column = 0;

      if (sourceFile && diag.start !== undefined) {
        const lc = sourceFile.getLineAndCharacterOfPosition(diag.start);
        line = lc.line + 1;
        column = lc.character + 1;
      }

      return {
        file: diag.file ? relative(this.projectRoot, diag.file.fileName) : filePath,
        line,
        column,
        code: diag.code,
        message: ts.flattenDiagnosticMessageText(diag.messageText, "\n"),
        category: DIAGNOSTIC_CATEGORIES[diag.category] ?? "error",
      };
    });
  }

  getRenameEdits(
    filePath: string,
    line: number,
    column: number,
    newName: string
  ): { canRename: boolean; reason?: string; edits: RenameEdit[] } {
    const ctx = this.getServiceForFile(filePath);
    if (!ctx) return { canRename: false, reason: "File not found", edits: [] };

    const pos = this.getPosition(ctx.service, ctx.absolutePath, line, column);

    const renameInfo = ctx.service.getRenameInfo(ctx.absolutePath, pos);
    if (!renameInfo.canRename) {
      return {
        canRename: false,
        reason: renameInfo.localizedErrorMessage,
        edits: [],
      };
    }

    const renameLocations = ctx.service.findRenameLocations(ctx.absolutePath, pos, false, false);

    if (!renameLocations) return { canRename: true, edits: [] };

    const fileMap = new Map<string, RenameEdit>();

    for (const loc of renameLocations) {
      const relFile = relative(this.projectRoot, loc.fileName);
      if (!fileMap.has(relFile)) {
        fileMap.set(relFile, { file: relFile, changes: [] });
      }

      const sourceFile = ctx.service.getProgram()?.getSourceFile(loc.fileName);
      if (!sourceFile) continue;

      const start = this.getLineCol(sourceFile, loc.textSpan.start);
      const end = this.getLineCol(sourceFile, loc.textSpan.start + loc.textSpan.length);

      fileMap.get(relFile)?.changes.push({
        line: start.line,
        column: start.column,
        endLine: end.line,
        endColumn: end.column,
        newText: newName,
      });
    }

    return {
      canRename: true,
      edits: Array.from(fileMap.values()),
    };
  }

  getDocumentSymbols(filePath: string): DocumentSymbolResult[] {
    const ctx = this.getServiceForFile(filePath);
    if (!ctx) return [];

    const navTree = ctx.service.getNavigationTree(ctx.absolutePath);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (navTree == null) return [];

    const sourceFile = ctx.service.getProgram()?.getSourceFile(ctx.absolutePath);
    if (sourceFile == null) return [];

    const convert = (item: ts.NavigationTree): DocumentSymbolResult | null => {
      if (!item.spans[0]) return null;

      const start = this.getLineCol(sourceFile, item.spans[0].start);
      const end = this.getLineCol(sourceFile, item.spans[0].start + item.spans[0].length);

      const children = item.childItems
        ?.map(convert)
        .filter((c): c is DocumentSymbolResult => c !== null);

      const result: {
        name: string;
        kind: ts.ScriptElementKind;
        line: number;
        endLine: number;
        children?: DocumentSymbolResult[];
      } = {
        name: item.text,
        kind: item.kind,
        line: start.line,
        endLine: end.line,
      };
      if (children && children.length > 0) {
        result.children = children;
      }
      return result;
    };

    // NOTE: Root level is usually the module itself — return its children.
    if (navTree.childItems) {
      return navTree.childItems.map(convert).filter((c): c is DocumentSymbolResult => c !== null);
    }

    const root = convert(navTree);
    return root ? [root] : [];
  }

  getSignatureHelp(filePath: string, line: number, column: number): SignatureHelpResult[] {
    const ctx = this.getServiceForFile(filePath);
    if (!ctx) return [];

    const pos = this.getPosition(ctx.service, ctx.absolutePath, line, column);
    const sigHelp = ctx.service.getSignatureHelpItems(ctx.absolutePath, pos, {});
    if (!sigHelp) return [];

    return sigHelp.items.map((item) => ({
      label:
        ts.displayPartsToString(item.prefixDisplayParts) +
        item.parameters.map((p) => ts.displayPartsToString(p.displayParts)).join(", ") +
        ts.displayPartsToString(item.suffixDisplayParts),
      documentation: ts.displayPartsToString(item.documentation),
      parameters: item.parameters.map((p) => ({
        name: p.name,
        documentation: ts.displayPartsToString(p.documentation),
        type: ts.displayPartsToString(p.displayParts),
      })),
      activeParameter: sigHelp.argumentIndex,
    }));
  }

  getStats(): {
    loadedProjects: Array<{
      name: string;
      fileCount: number;
      lastUsedAgo: string;
    }>;
    totalFiles: number;
    availableConfigs: string[];
  } {
    const now = Date.now();
    const loadedProjects = Array.from(this.projects.entries()).map(([name, project]) => ({
      name,
      fileCount: project.fileNames.length,
      lastUsedAgo: `${Math.round((now - project.lastUsed) / 1000)}s ago`,
    }));

    return {
      loadedProjects,
      totalFiles: loadedProjects.reduce((sum, p) => sum + p.fileCount, 0),
      availableConfigs: this.configs.map((c) => c.name),
    };
  }

  dispose(configName?: string): void {
    if (configName != null && configName !== "") {
      const project = this.projects.get(configName);
      if (project) {
        project.service.dispose();
        this.projects.delete(configName);
      }
    } else {
      for (const [name, project] of this.projects) {
        project.service.dispose();
        this.projects.delete(name);
      }
    }
  }

  invalidateFile(filePath: string): void {
    const abs = filePath.startsWith("/") ? filePath : join(this.projectRoot, filePath);

    for (const project of this.projects.values()) {
      const currentVersion = project.fileVersions.get(abs);
      if (currentVersion !== undefined) {
        project.fileVersions.set(abs, currentVersion + 1);
      }
    }
  }

  shutdown(): void {
    this.dispose();
    if (this.disposeTimer) {
      clearInterval(this.disposeTimer);
      this.disposeTimer = null;
    }
  }
}

let _instance: TsLanguageServiceManager | null = null;

export function getTsLanguageService(projectRoot: string): TsLanguageServiceManager {
  _instance ??= new TsLanguageServiceManager(projectRoot);
  return _instance;
}

export function shutdownTsLanguageService(): void {
  if (_instance) {
    _instance.shutdown();
    _instance = null;
  }
}
