import { getTsLanguageService } from "../../utils/ts-language-service.js";
import { createMcpTranslatorSync } from "../../utils/i18n/index.js";
import type {
  TypeInfoResult,
  DefinitionResult,
  ReferenceResult,
  DiagnosticResult,
} from "../../utils/ts-language-service.js";

const TS_TOOL_METADATA_BASE = {
  category: "development" as const,
  subcategory: "typescript-language" as const,
  requiresConfirmation: false,
  riskLevel: "low" as const,
};

function tsLangT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.tsLanguage.${key}`, params);
}

function tsLangDefT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.tsLanguage.definition.${key}`, params);
}

function formatTypeInfo(result: TypeInfoResult): string {
  let output = `${tsLangT("runtime.typeInfoTitle")}\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output += tsLangT("runtime.kind", { kind: result.kind });
  if (result.kindModifiers !== "") output += ` (${result.kindModifiers})`;
  output += `\n\n${result.displayString}`;
  if (result.documentation !== "") {
    output += `\n\n${tsLangT("runtime.documentationTitle")}\n${result.documentation}`;
  }
  return output;
}

function formatDefinitions(results: DefinitionResult[]): string {
  if (results.length === 0) return tsLangT("runtime.noDefinition");
  let output = `${tsLangT("runtime.definitionTitle", { count: results.length })}\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  for (const def of results) {
    output += `📁 ${def.file}:${def.line}:${def.column}`;
    if (def.kind !== undefined && def.kind.length > 0) output += ` [${def.kind}]`;
    if (def.name !== undefined && def.name.length > 0) output += ` ${def.name}`;
    if (def.containerName !== undefined && def.containerName.length > 0) {
      output += ` in ${def.containerName}`;
    }
    output += `\n`;
  }
  return output;
}

function formatReferences(results: ReferenceResult[]): string {
  if (results.length === 0) return tsLangT("runtime.noReferences");
  const defs = results.filter((ref) => ref.isDefinition);
  const usages = results.filter((ref) => !ref.isDefinition);
  const writes = results.filter((ref) => ref.isWriteAccess);
  const files = [...new Set(results.map((ref) => ref.file))];

  let output = `${tsLangT("runtime.referencesTitle", { count: results.length })}\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output +=
    tsLangT("runtime.referencesSummary", {
      definitions: defs.length,
      usages: usages.length,
      writes: writes.length,
    }) + "\n";
  output += `${tsLangT("runtime.filesCount", { count: files.length })}\n\n`;

  for (const file of files) {
    const fileRefs = results.filter((ref) => ref.file === file);
    output += `📄 ${file}\n`;
    for (const ref of fileRefs) {
      const tag = ref.isDefinition ? "DEF" : ref.isWriteAccess ? "WRITE" : "READ";
      output += `  L${ref.line}:${ref.column} [${tag}] ${ref.lineText}\n`;
    }
    output += `\n`;
  }

  return output;
}

function formatDiagnostics(results: DiagnosticResult[], filePath: string): string {
  const errors = results.filter((diag) => diag.category === "error");
  const warnings = results.filter((diag) => diag.category === "warning");
  const suggestions = results.filter((diag) => diag.category === "suggestion");

  let output = `${tsLangT("runtime.diagnosticsTitle", { filePath })}\n`;
  output += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  output +=
    tsLangT("runtime.diagnosticsSummary", {
      errors: errors.length,
      warnings: warnings.length,
      suggestions: suggestions.length,
    }) + "\n\n";

  if (results.length === 0) {
    output += `${tsLangT("runtime.noIssues")}\n`;
    return output;
  }

  const icons: Record<string, string> = {
    error: "❌",
    warning: "⚠️",
    suggestion: "💡",
    message: "ℹ️",
  };

  for (const diag of results) {
    const icon = icons[diag.category] ?? "ℹ️";
    output += `${icon} L${diag.line}:${diag.column} TS${diag.code}: ${diag.message}\n`;
  }

  return output;
}

export function tsGetTypeInfo(
  projectRoot: string,
  filePath: string,
  line: number,
  column: number
): string {
  const mgr = getTsLanguageService(projectRoot);
  const result = mgr.getTypeInfo(filePath, line, column);
  if (!result) return tsLangT("runtime.noTypeInfo");
  return formatTypeInfo(result);
}

export function tsGetDefinition(
  projectRoot: string,
  filePath: string,
  line: number,
  column: number
): string {
  const mgr = getTsLanguageService(projectRoot);
  const results = mgr.getDefinition(filePath, line, column);
  return formatDefinitions(results);
}

export function tsGetReferences(
  projectRoot: string,
  filePath: string,
  line: number,
  column: number
): string {
  const mgr = getTsLanguageService(projectRoot);
  const results = mgr.getReferences(filePath, line, column);
  return formatReferences(results);
}

export function tsGetDiagnostics(projectRoot: string, filePath: string): string {
  const mgr = getTsLanguageService(projectRoot);
  const results = mgr.getDiagnostics(filePath);
  return formatDiagnostics(results, filePath);
}

export const TS_TYPE_INFO_TOOL = {
  name: "hev_dev_type_info",
  description: tsLangDefT("typeInfo.description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      file_path: {
        type: "string" as const,
        description: tsLangDefT("common.filePath"),
      },
      line: {
        type: "number" as const,
        description: tsLangDefT("common.line"),
      },
      column: {
        type: "number" as const,
        description: tsLangDefT("common.column"),
      },
    },
    required: ["file_path", "line", "column"],
  },
  metadata: {
    ...TS_TOOL_METADATA_BASE,
    priority: "high",
    complexity: "low",
    useCases: [
      tsLangDefT("typeInfo.useCases.viewTypes"),
      tsLangDefT("typeInfo.useCases.functionSignatures"),
      tsLangDefT("typeInfo.useCases.cursorType"),
    ],
    relatedTools: ["hev_dev_go_to_definition", "hev_dev_find_references"],
    agentGuidance: tsLangDefT("typeInfo.agentGuidance"),
    tags: ["typescript", "type-info", "hover", "inspection"],
  },
};

export const TS_GO_TO_DEFINITION_TOOL = {
  name: "hev_dev_go_to_definition",
  description: tsLangDefT("goToDefinition.description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      file_path: {
        type: "string" as const,
        description: tsLangDefT("common.filePath"),
      },
      line: {
        type: "number" as const,
        description: tsLangDefT("common.line"),
      },
      column: {
        type: "number" as const,
        description: tsLangDefT("common.column"),
      },
    },
    required: ["file_path", "line", "column"],
  },
  metadata: {
    ...TS_TOOL_METADATA_BASE,
    priority: "high",
    complexity: "low",
    useCases: [
      tsLangDefT("goToDefinition.useCases.navigate"),
      tsLangDefT("goToDefinition.useCases.findDeclaration"),
      tsLangDefT("goToDefinition.useCases.importSource"),
    ],
    relatedTools: ["hev_dev_type_info", "hev_dev_find_references"],
    agentGuidance: tsLangDefT("goToDefinition.agentGuidance"),
    tags: ["typescript", "navigation", "definition", "go-to"],
  },
};

export const TS_FIND_REFERENCES_TOOL = {
  name: "hev_dev_find_references",
  description: tsLangDefT("findReferences.description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      file_path: {
        type: "string" as const,
        description: tsLangDefT("common.filePath"),
      },
      line: {
        type: "number" as const,
        description: tsLangDefT("common.line"),
      },
      column: {
        type: "number" as const,
        description: tsLangDefT("common.column"),
      },
    },
    required: ["file_path", "line", "column"],
  },
  metadata: {
    ...TS_TOOL_METADATA_BASE,
    priority: "high",
    complexity: "medium",
    useCases: [
      tsLangDefT("findReferences.useCases.allUsages"),
      tsLangDefT("findReferences.useCases.impactAnalysis"),
      tsLangDefT("findReferences.useCases.dependencies"),
    ],
    relatedTools: ["hev_dev_go_to_definition", "hev_dev_type_info"],
    agentGuidance: tsLangDefT("findReferences.agentGuidance"),
    tags: ["typescript", "references", "cross-file", "impact-analysis"],
  },
};

export const TS_DIAGNOSTICS_TOOL = {
  name: "hev_dev_ts_diagnostics",
  description: tsLangDefT("diagnostics.description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      file_path: {
        type: "string" as const,
        description: tsLangDefT("common.filePath"),
      },
    },
    required: ["file_path"],
  },
  metadata: {
    ...TS_TOOL_METADATA_BASE,
    priority: "medium",
    complexity: "low",
    useCases: [
      tsLangDefT("diagnostics.useCases.checkFile"),
      tsLangDefT("diagnostics.useCases.semanticDiagnostics"),
      tsLangDefT("diagnostics.useCases.validateChanges"),
    ],
    relatedTools: ["hev_dev_type_info", "hev_dev_typescript_type_helper"],
    agentGuidance: tsLangDefT("diagnostics.agentGuidance"),
    tags: ["typescript", "diagnostics", "errors", "validation"],
  },
};

export const TS_LANGUAGE_TOOL_DEFINITIONS = [
  TS_TYPE_INFO_TOOL,
  TS_GO_TO_DEFINITION_TOOL,
  TS_FIND_REFERENCES_TOOL,
  TS_DIAGNOSTICS_TOOL,
];
