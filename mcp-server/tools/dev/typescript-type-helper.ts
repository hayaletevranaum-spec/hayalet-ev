import { readFileSync } from "fs";
import { join } from "path";
import { createMcpTranslatorSync } from "../../utils/i18n/index.js";
import { logToolError } from "../../utils/mcp-logger.js";
import { getTsLanguageService } from "../../utils/ts-language-service.js";
import type { DiagnosticResult } from "../../utils/ts-language-service.js";

interface TypeHelperOptions {
  file_path: string;
  show_interfaces?: boolean;
  suggest_fixes?: boolean;
  analyze_conflicts?: boolean;
}

interface TypeConflict {
  error_code: number;
  line: number;
  column: number;
  expected_type: string;
  actual_type: string;
  missing_fields?: string[];
  extra_fields?: string[];
  suggestion?: string;
  raw_message: string;
}

interface TypeHelperResult {
  success: boolean;
  output: string;
  conflicts: TypeConflict[];
  interface_definitions?: Record<string, string>;
}

function tsTypeHelperT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(`mcpServer.devTools.typescriptTypeHelper.${key}`, params);
}

function tsTypeHelperDefT(key: string, params?: Record<string, string | number | boolean>): string {
  return createMcpTranslatorSync()(
    `mcpServer.devTools.typescriptTypeHelper.definition.${key}`,
    params
  );
}

export function analyzeTypeConflicts(
  options: TypeHelperOptions,
  projectRoot: string
): TypeHelperResult {
  const {
    file_path: filePath,
    show_interfaces: showInterfaces = true,
    suggest_fixes: suggestFixes = true,
  } = options;

  const fullPath = projectRoot !== "" ? join(projectRoot, filePath) : filePath;

  try {
    const mgr = getTsLanguageService(projectRoot);
    const allDiagnostics = mgr.getDiagnostics(filePath);

    const typeMismatchCodes = [2345, 2322, 2339, 2741, 2304, 2305];
    const typeMismatchErrors = allDiagnostics.filter(
      (d) => d.category === "error" && typeMismatchCodes.includes(d.code)
    );

    if (typeMismatchErrors.length === 0) {
      const otherErrors = allDiagnostics.filter(
        (d) => d.category === "error" && !typeMismatchCodes.includes(d.code)
      );

      let message = tsTypeHelperT("runtime.noConflicts") + "\n";

      if (otherErrors.length > 0) {
        message +=
          "\n" + tsTypeHelperT("runtime.otherErrorsFound", { count: otherErrors.length }) + "\n";
        otherErrors.slice(0, 10).forEach((err) => {
          const truncatedMsg =
            err.message.length > 80
              ? tsTypeHelperT("runtime.truncatedMessage", {
                  message: err.message.slice(0, 80),
                })
              : err.message;
          message +=
            tsTypeHelperT("runtime.otherErrorLine", {
              line: err.line,
              code: err.code,
              message: truncatedMsg,
            }) + "\n";
        });
        if (otherErrors.length > 10) {
          message += tsTypeHelperT("runtime.moreErrors", { count: otherErrors.length - 10 }) + "\n";
        }
        message += "\n" + tsTypeHelperT("runtime.useDashboard");
      } else if (allDiagnostics.filter((d) => d.category === "error").length === 0) {
        message += "\n" + tsTypeHelperT("runtime.noErrorsInFile");
      }

      return {
        success: true,
        output: message,
        conflicts: [],
      };
    }

    const conflicts: TypeConflict[] = [];
    for (const error of typeMismatchErrors) {
      const conflict = analyzeDiagnostic(error);
      if (conflict) {
        conflicts.push(conflict);
      }
    }

    let interfaceDefinitions: Record<string, string> = {};
    if (showInterfaces) {
      interfaceDefinitions = extractInterfacesWithApi(mgr, filePath, fullPath);
    }

    const output = formatTypeHelperOutput(conflicts, interfaceDefinitions, filePath, suggestFixes);

    return {
      success: true,
      output,
      conflicts,
      interface_definitions: interfaceDefinitions,
    };
  } catch (error) {
    logToolError("typescript-type-helper", error as Error, {});
    return {
      success: false,
      output: tsTypeHelperT("runtime.error", { message: String(error) }),
      conflicts: [],
    };
  }
}

function analyzeDiagnostic(diag: DiagnosticResult): TypeConflict | null {
  const conflict: TypeConflict = {
    error_code: diag.code,
    line: diag.line,
    column: diag.column,
    expected_type: "",
    actual_type: "",
    raw_message: diag.message,
  };

  if (diag.code === 2345) {
    const match = diag.message.match(
      /Argument of type '([^']+)' is not assignable to parameter of type '([^']+)'/
    );
    const actualType = match?.[1];
    const expectedType = match?.[2];
    if (actualType !== undefined && expectedType !== undefined) {
      conflict.actual_type = actualType;
      conflict.expected_type = expectedType;
      conflict.suggestion = generateTypeMismatchSuggestion(
        conflict.actual_type,
        conflict.expected_type
      );
    }
  }

  if (diag.code === 2322) {
    const match = diag.message.match(/Type '([^']+)' is not assignable to type '([^']+)'/);
    const actualType = match?.[1];
    const expectedType = match?.[2];
    if (actualType !== undefined && expectedType !== undefined) {
      conflict.actual_type = actualType;
      conflict.expected_type = expectedType;
      conflict.suggestion = generateTypeMismatchSuggestion(
        conflict.actual_type,
        conflict.expected_type
      );
    }
  }

  if (diag.code === 2339) {
    const match = diag.message.match(/Property '([^']+)' does not exist on type '([^']+)'/);
    const missingProp = match?.[1];
    const typeName = match?.[2];
    if (missingProp !== undefined && typeName !== undefined) {
      conflict.expected_type = typeName;
      conflict.actual_type = typeName;
      conflict.missing_fields = [missingProp];
      conflict.suggestion = tsTypeHelperT("suggestions.addFieldToInterface", {
        field: missingProp,
        typeName,
      });
    }
  }

  if (diag.code === 2741) {
    const match = diag.message.match(
      /Property '([^']+)' is missing in type '([^']+)' but required in type '([^']+)'/
    );
    const missingProp = match?.[1];
    const actualType = match?.[2];
    const expectedType = match?.[3];
    if (missingProp !== undefined && actualType !== undefined && expectedType !== undefined) {
      conflict.actual_type = actualType;
      conflict.expected_type = expectedType;
      conflict.missing_fields = [missingProp];
      conflict.suggestion = tsTypeHelperT("suggestions.addFieldToType", {
        field: missingProp,
        typeName: conflict.actual_type,
      });
    }
  }

  if (diag.code === 2304) {
    const match = diag.message.match(/Cannot find name '([^']+)'/);
    const missingName = match?.[1];
    if (missingName !== undefined) {
      conflict.actual_type = missingName;
      conflict.suggestion = tsTypeHelperT("suggestions.importOrDeclare", {
        missingName,
      });
    }
  }

  if (diag.code === 2305) {
    const match = diag.message.match(/Module '"([^"]+)"' has no exported member '([^']+)'/);
    const moduleName = match?.[1];
    const memberName = match?.[2];
    if (moduleName !== undefined && memberName !== undefined) {
      conflict.actual_type = memberName;
      conflict.expected_type = moduleName;
      conflict.suggestion = tsTypeHelperT("suggestions.checkExportedMember", {
        memberName,
        moduleName,
      });
    }
  }

  return conflict;
}

function generateTypeMismatchSuggestion(actualType: string, expectedType: string): string {
  if (actualType.includes("undefined") && !expectedType.includes("undefined")) {
    return tsTypeHelperT("suggestions.addUndefinedGuard");
  }

  if (actualType.includes("null") && !expectedType.includes("null")) {
    return tsTypeHelperT("suggestions.addNullGuard");
  }

  if (actualType === "unknown") {
    return tsTypeHelperT("suggestions.typeAssertion", { expectedType });
  }

  if (expectedType.includes("|")) {
    return tsTypeHelperT("suggestions.typeNarrowing");
  }

  return tsTypeHelperT("suggestions.updateTypeDefinition");
}

function extractInterfacesWithApi(
  mgr: ReturnType<typeof getTsLanguageService>,
  filePath: string,
  fullPath: string
): Record<string, string> {
  const interfaces: Record<string, string> = {};

  try {
    const symbols = mgr.getDocumentSymbols(filePath);
    const interfaceSymbols = symbols.filter((s) => s.kind === "interface" || s.kind === "type");

    if (interfaceSymbols.length > 0) {
      const content = readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");

      for (const sym of interfaceSymbols) {
        const startLine = sym.line - 1;
        const endLine = sym.endLine - 1;
        if (startLine >= 0 && endLine < lines.length) {
          const body = lines.slice(startLine, endLine + 1).join("\n");
          interfaces[sym.name] = body;
        }
      }
    }
  } catch {
    try {
      const content = readFileSync(fullPath, "utf-8");
      const interfaceRegex = /interface\s+(\w+)\s*\{([^}]+)\}/g;
      let match;
      while ((match = interfaceRegex.exec(content)) !== null) {
        if (match[1] !== undefined && match[2] !== undefined) {
          interfaces[match[1]] = match[2].trim();
        }
      }
    } catch {
      // NOTE: Intentionally ignored.
    }
  }

  return interfaces;
}

function formatTypeHelperOutput(
  conflicts: TypeConflict[],
  interfaces: Record<string, string>,
  filePath: string,
  suggestFixes: boolean
): string {
  let output = "";

  output += `${tsTypeHelperT("runtime.title")}\n`;
  output += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  output += `${tsTypeHelperT("runtime.fileLine", { filePath })}\n`;
  output += `${tsTypeHelperT("runtime.conflictsLine", { count: conflicts.length })}\n`;
  output += `${tsTypeHelperT("runtime.poweredBy")}\n`;
  output += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n";

  conflicts.forEach((conflict, idx) => {
    output +=
      tsTypeHelperT("runtime.conflictHeader", {
        index: idx + 1,
        line: conflict.line,
        column: conflict.column,
        errorCode: conflict.error_code,
      }) + "\n";
    if (conflict.expected_type !== "")
      output += `${tsTypeHelperT("runtime.expectedLine", { expectedType: conflict.expected_type })}\n`;
    if (conflict.actual_type !== "")
      output += `${tsTypeHelperT("runtime.actualLine", { actualType: conflict.actual_type })}\n`;

    if (conflict.missing_fields && conflict.missing_fields.length > 0) {
      output += `${tsTypeHelperT("runtime.missingLine", { fields: conflict.missing_fields.join(", ") })}\n`;
    }

    if (conflict.extra_fields && conflict.extra_fields.length > 0) {
      output += `${tsTypeHelperT("runtime.extraLine", { fields: conflict.extra_fields.join(", ") })}\n`;
    }

    if (suggestFixes === true && conflict.suggestion !== undefined) {
      output += `${tsTypeHelperT("runtime.suggestionLine", { suggestion: conflict.suggestion })}\n`;
    }

    output +=
      tsTypeHelperT("runtime.rawMessageLine", {
        message: conflict.raw_message.slice(0, 120),
      }) + "\n";
    output += "\n";
  });

  if (Object.keys(interfaces).length > 0) {
    output += `${tsTypeHelperT("runtime.interfaceDefinitionsTitle")}\n`;
    output += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";

    Object.entries(interfaces).forEach(([name, body]) => {
      output += `\n${tsTypeHelperT("runtime.interfaceBlockTitle", { name })}\n${body}\n`;
    });
  }

  return output;
}

export const TYPESCRIPT_TYPE_HELPER_TOOL = {
  name: "hev_dev_typescript_type_helper",
  description: tsTypeHelperDefT("description"),
  inputSchema: {
    type: "object" as const,
    properties: {
      file_path: {
        type: "string" as const,
        description: tsTypeHelperDefT("filePath"),
      },
      show_interfaces: {
        type: "boolean" as const,
        description: tsTypeHelperDefT("showInterfaces"),
        default: true,
      },
      suggest_fixes: {
        type: "boolean" as const,
        description: tsTypeHelperDefT("suggestFixes"),
        default: true,
      },
      analyze_conflicts: {
        type: "boolean" as const,
        description: tsTypeHelperDefT("analyzeConflicts"),
        default: true,
      },
    },
    required: ["file_path"],
  },
  metadata: {
    category: "development" as const,
    subcategory: "typescript" as const,
    priority: "medium" as const,
    complexity: "medium" as const,
    useCases: [
      tsTypeHelperDefT("useCases.analyzeMismatches"),
      tsTypeHelperDefT("useCases.interfaceImprovements"),
      tsTypeHelperDefT("useCases.identifySources"),
    ],
    relatedTools: [
      "hev_dev_typescript_dashboard",
      "hev_dev_fix_typescript_batch",
      "hev_dev_ts_diagnostics",
    ],
    agentGuidance: tsTypeHelperDefT("agentGuidance"),
    requiresConfirmation: false,
    riskLevel: "low" as const,
    tags: ["typescript", "type-analysis", "interface", "conflict-resolution"],
  },
};
