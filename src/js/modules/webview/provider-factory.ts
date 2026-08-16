export type ProviderModule = Record<string, unknown>;

import * as chatgptProvider from "./providers/chatgpt/index.js";
import * as grokProvider from "./providers/grok/index.js";
import * as geminiProvider from "./providers/gemini/index.js";
import * as llmProvider from "./providers/llm/index.js";
import * as opencodeProvider from "./providers/opencode/index.js";
import * as opencodeUiProvider from "./providers/opencode-ui/index.js";

const providers: Record<string, ProviderModule> = {
  chatgpt: chatgptProvider,
  grok: grokProvider,
  gemini: geminiProvider,
  llm: llmProvider,
};

const assistantProviders: Record<string, ProviderModule> = {
  opencode: opencodeProvider,
  "opencode-ui": opencodeUiProvider,
};

const allProviders: Record<string, ProviderModule> = {
  ...providers,
  ...assistantProviders,
};

export function getProvider(providerId: string): ProviderModule | undefined {
  return allProviders[providerId];
}
