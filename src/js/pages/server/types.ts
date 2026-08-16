export type CommandCategory = "ai1-ai2" | "ai0" | "us1";
export type CommandSlot = "ai1" | "ai2" | "ai0" | "us1";

export interface CommandCatalogItem {
  name: string;
  category: CommandCategory;
  isCustom: boolean;
  supportsTestMode: boolean;
}

export interface CommandRunResult {
  success?: boolean;
  message?: string;
  detail?: string;
  [key: string]: unknown;
}

export interface ServerCommandsApi {
  list(): string[];
  run(name: string, payload?: Record<string, unknown>): Promise<unknown>;
  getDescriptionText(name: string): string;
  listByCategory?: (category: CommandCategory) => string[];
  getCatalog?: (category?: CommandCategory) => CommandCatalogItem[];
}
