export type ToolHandler = (args?: Record<string, unknown>) => unknown;

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export type ToolEntryDefinition = unknown;

export interface ToolEntry {
  definition: ToolEntryDefinition;
  handler: ToolHandler;
}

export interface ToolContext {
  PROJECT_ROOT: string;
  LOG_DIR: string;
}

export type ToolModuleFactory = (context: ToolContext) => ToolEntry[];

const definitionMap = new Map<string, ToolEntryDefinition>();
const handlerMap = new Map<string, ToolHandler>();

export function registerTools(entries: ToolEntry[], moduleName?: string): void {
  for (const entry of entries) {
    const def = entry.definition as { name?: unknown } | null | undefined;

    const name = typeof def?.name === "string" ? def.name : undefined;

    const hasModuleName = typeof moduleName === "string" && moduleName.trim().length > 0;

    // NOTE: Runtime validation to catch misconfigurations early.
    if (name === undefined || name.trim().length === 0) {
      throw new Error(
        `[Registry] Invalid tool definition${hasModuleName ? ` in module "${moduleName}"` : ""}: ` +
          `missing or invalid "name" field.`
      );
    }

    if (definitionMap.has(name)) {
      throw new Error(
        `[Registry] DUPLICATE tool "${name}"${hasModuleName ? ` in module "${moduleName}"` : ""}. ` +
          `Already registered. Each tool name must be unique.`
      );
    }
    definitionMap.set(name, entry.definition);
    handlerMap.set(name, entry.handler);
  }
}

export function getAllDefinitions(): ToolEntryDefinition[] {
  return Array.from(definitionMap.values());
}

export function getHandler(name: string): ToolHandler | undefined {
  return handlerMap.get(name);
}

export function getToolCount(): number {
  return definitionMap.size;
}

export function getRegisteredToolNames(): string[] {
  return Array.from(definitionMap.keys());
}

export function hasTool(name: string): boolean {
  return definitionMap.has(name);
}

export function getRegistryStats(): Record<string, number> {
  const stats: Record<string, number> = { total: definitionMap.size };

  for (const def of definitionMap.values()) {
    const category =
      (def as { metadata?: { category?: string } }).metadata?.category ?? "uncategorized";
    stats[category] = (stats[category] ?? 0) + 1;
  }

  return stats;
}

export function clearRegistry(): void {
  definitionMap.clear();
  handlerMap.clear();
}
