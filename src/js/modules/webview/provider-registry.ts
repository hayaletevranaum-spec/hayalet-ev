import { config as chatgpt } from "./providers/chatgpt/config.js";
import { config as grok } from "./providers/grok/config.js";
import { config as gemini } from "./providers/gemini/config.js";
import { config as llm } from "./providers/llm/config.js";
import { config as opencode } from "./providers/opencode/config.js";
import { config as opencodeUi } from "./providers/opencode-ui/config.js";

const providers = {
  chatgpt,
  grok,
  gemini,
  llm,
};

const assistantProviders = {
  opencode,
  "opencode-ui": opencodeUi,
};

const allProviders = {
  ...providers,
  ...assistantProviders,
};

type ProviderRecord = Record<string, unknown>;
type ProviderMap = Record<string, ProviderRecord | undefined>;

function updateProviderMaps(id: string, config: unknown): void {
  const record = config as Record<string, unknown>;
  if (id in providers) {
    (providers as Record<string, Record<string, unknown>>)[id] = record;
  }

  if (id in assistantProviders) {
    (assistantProviders as Record<string, Record<string, unknown>>)[id] = record;
  }

  (allProviders as Record<string, Record<string, unknown>>)[id] = record;
}

const providerRegistry = {
  get(id: string): Record<string, unknown> | null {
    return (allProviders as ProviderMap)[id] ?? null;
  },

  getAll(): Record<string, unknown>[] {
    return Object.values(providers);
  },

  getIds(): string[] {
    return Object.keys(providers);
  },

  getAssistant(id: string): Record<string, unknown> | null {
    return (assistantProviders as ProviderMap)[id] ?? null;
  },
  getAllAssistants(): Record<string, unknown>[] {
    return Object.values(assistantProviders);
  },
  getAssistantIds(): string[] {
    return Object.keys(assistantProviders);
  },

  getAny(id: string): Record<string, unknown> | null {
    return (allProviders as ProviderMap)[id] ?? null;
  },
  getAllAny(): Record<string, unknown>[] {
    return Object.values(allProviders);
  },
  getAllAnyIds(): string[] {
    return Object.keys(allProviders);
  },

  update(id: string, config: unknown): void {
    updateProviderMaps(id, config);
  },

  isAssistant(id: string): boolean {
    return id in assistantProviders;
  },
};

export { providerRegistry as ProviderRegistry };
