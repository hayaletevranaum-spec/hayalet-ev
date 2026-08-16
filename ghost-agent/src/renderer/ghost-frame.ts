export type GhostProvider = "opencode";

export interface GhostProviderFramePlanInput {
  provider: GhostProvider;
  targetUrl: string;
}

export interface GhostProviderFramePlan {
  tagName: "webview";
  attributes: Record<string, string>;
}

export function buildGhostProviderFramePlan(
  input: GhostProviderFramePlanInput
): GhostProviderFramePlan {
  const attributes: Record<string, string> = {
    partition: "persist:ai0",
    allowpopups: "true",
    spellcheck: "false",
    webpreferences:
      "spellcheck=false, backgroundThrottling=false, contextIsolation=true, nodeIntegration=false",
    src: input.targetUrl,
  };

  return {
    tagName: "webview",
    attributes,
  };
}
