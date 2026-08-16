import { AppI18n } from "../../modules/i18n/index.js";

export interface OverlayStage {
  title: string;
  subtitle: string;
}

function assistantT(key: string): string {
  return AppI18n.t(`shell.assistant.${key}`);
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function getDefaultOverlayStageForProvider(providerId?: string): OverlayStage {
  if (providerId === "opencode-ui") {
    return {
      title: assistantT("connectOverlay.connectingTitle"),
      subtitle: assistantT("connectOverlay.preparingOpencodeUiSubtitle"),
    };
  }

  return {
    title: assistantT("connectOverlay.connectingTitle"),
    subtitle: assistantT("connectOverlay.pleaseWaitSubtitle"),
  };
}

export function resolveOverlayStage(options: {
  providerId?: string;
  connectFlowActive: boolean;
  stage?: OverlayStage | null;
}): OverlayStage {
  const fallback = getDefaultOverlayStageForProvider(options.providerId);

  if (!options.connectFlowActive) {
    return fallback;
  }

  const title = options.stage?.title;
  const subtitle = options.stage?.subtitle;

  if (!isNonEmptyText(title) || !isNonEmptyText(subtitle)) {
    return fallback;
  }

  return {
    title,
    subtitle,
  };
}

function usesToolsReadyOverlayGate(providerId?: string): boolean {
  return providerId === "opencode-ui";
}

export function shouldKeepOverlayVisibleForToolsReady(options: {
  providerId?: string;
  isConnected: boolean;
  connectFlowActive: boolean;
  toolsReady: boolean;
}): boolean {
  if (!usesToolsReadyOverlayGate(options.providerId)) {
    return false;
  }

  if (!options.isConnected) {
    return false;
  }

  if (options.connectFlowActive) {
    return false;
  }

  return options.toolsReady !== true;
}
