// NOTE: To add a provider, implement AssistantProviderAdapter and register it here.
import type { AssistantProviderAdapter } from "@shared/assistant.js";
import { OpenCodeAdapter } from "./opencode-adapter.js";
import { OpenCodeUiAdapter } from "./opencode-ui-adapter.js";

const adapters = new Map<string, AssistantProviderAdapter>();

function initDefaults(): void {
  registerAdapter(new OpenCodeAdapter());
  registerAdapter(new OpenCodeUiAdapter());
}

export function registerAdapter(adapter: AssistantProviderAdapter): void {
  adapters.set(adapter.id, adapter);
}

export function getAdapter(providerId: string): AssistantProviderAdapter | null {
  return adapters.get(providerId) ?? null;
}

export function getAllAdapters(): AssistantProviderAdapter[] {
  return Array.from(adapters.values());
}

export function getAdapterIds(): string[] {
  return Array.from(adapters.keys());
}

export function hasAdapter(providerId: string): boolean {
  return adapters.has(providerId);
}

initDefaults();

const assistantProviderRegistry = {
  registerAdapter,
  getAdapter,
  getAllAdapters,
  getAdapterIds,
  hasAdapter,
};

export { assistantProviderRegistry as AssistantProviderRegistry };
