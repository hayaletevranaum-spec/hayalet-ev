import type { WebviewElement } from "@shared/assistant.js";
import type { TranscriptIngressPayload } from "../../../types/transcript.js";

import { AppState } from "../../modules/app-state.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { ProviderRegistry } from "../../modules/webview/provider-registry.js";
import type { OverlayStage } from "./overlay-stage.js";

interface BindAssistantWebviewIpcEventsOptions {
  webviewEl: HTMLElement | null;
  providerSelect: HTMLSelectElement | null;
  getActiveProviderId: () => string | null;
  isConnectFlowActive: () => boolean;
  getProviderToolsReady: () => boolean;
  setProviderToolsReady: (ready: boolean) => void;
  setConnectOverlayStage: (stage: OverlayStage | null) => void;
  updateConnectionUI: () => void;
  onMcpToggleFromHealth: (server: string, enabled: boolean) => Promise<void> | void;
  onOpencodeSessionChanged: (sessionId: string) => Promise<void> | void;
  onAssistantRuntimeControl: (patch: Record<string, unknown>) => Promise<void> | void;
}

export function bindAssistantWebviewIpcEvents(options: BindAssistantWebviewIpcEventsOptions): void {
  options.webviewEl?.addEventListener(
    "ipc-message",
    (event: Event & { channel?: string; args?: unknown[] }) => {
      if (event.channel === "mcp-toggle-change") {
        const data = event.args?.[0] as { server: string; enabled: boolean } | undefined;
        if (data?.server != null) {
          void options.onMcpToggleFromHealth(data.server, data.enabled);
        }
      }

      if (event.channel === "opencode-ui-connect-stage") {
        const data = event.args?.[0] as { title?: string; subtitle?: string } | undefined;
        const selectedProviderId = options.providerSelect?.value ?? options.getActiveProviderId();
        const canShowStage =
          selectedProviderId === "opencode-ui" &&
          (options.isConnectFlowActive() || options.getProviderToolsReady() !== true);

        if (canShowStage) {
          const title = typeof data?.title === "string" ? data.title.trim() : "";
          const subtitle = typeof data?.subtitle === "string" ? data.subtitle.trim() : "";
          if (title !== "" && subtitle !== "") {
            options.setConnectOverlayStage({ title, subtitle });
            options.updateConnectionUI();
          }
        }
      }

      if (event.channel === "opencode-ui-tools-ready") {
        const data = event.args?.[0] as
          { ready?: boolean; mcpStatus?: string; unresolvedServers?: string[] } | undefined;
        const selectedProviderId = options.providerSelect?.value ?? options.getActiveProviderId();
        if (selectedProviderId === "opencode-ui") {
          options.setProviderToolsReady(data?.ready === true);

          if (data?.ready !== true) {
            const unresolved = Array.isArray(data?.unresolvedServers)
              ? data.unresolvedServers.filter((item): item is string => typeof item === "string")
              : [];
            const unresolvedPreview = unresolved.slice(0, 3).join(", ");
            const mcpStatus = typeof data?.mcpStatus === "string" ? data.mcpStatus.trim() : "";

            options.setConnectOverlayStage({
              title: AppI18n.t("opencodeUi.connectOverlay.mcpWaitingTitle"),
              subtitle:
                unresolvedPreview !== ""
                  ? AppI18n.t("opencodeUi.connectOverlay.mcpWaitingSubtitle", {
                      servers: unresolvedPreview,
                    })
                  : mcpStatus !== ""
                    ? AppI18n.t("opencodeUi.connectOverlay.mcpStatusSubtitle", {
                        status: mcpStatus,
                      })
                    : AppI18n.t("opencodeUi.connectOverlay.preparingSubtitle"),
            });
          }

          options.updateConnectionUI();
        }
      }

      if (event.channel === "opencode-ui-session-changed") {
        const data = event.args?.[0] as { sessionId?: string | null } | undefined;
        const sessionId = data?.sessionId;
        if (typeof sessionId === "string" && sessionId !== "") {
          void options.onOpencodeSessionChanged(sessionId);
        }
      }

      if (event.channel === "assistant-runtime-control") {
        const data = event.args?.[0] as Record<string, unknown> | undefined;
        if (data !== undefined) {
          void options.onAssistantRuntimeControl(data);
        }
      }
    }
  );
}

interface BindAssistantPrimaryWebviewEventsOptions {
  webviewEl: WebviewElement;
  providerSelect: HTMLSelectElement | null;
  urlDisplay: HTMLElement | null;
  scheduleSaveLastOpencodeUrl: (url: string) => void;
  syncDisabledMcpToHealth: () => void;
  syncThemeToWebview: () => void;
  onTranscriptDomReady?: () => void;
}

export function bindAssistantPrimaryWebviewEvents(
  options: BindAssistantPrimaryWebviewEventsOptions
): void {
  options.webviewEl.addEventListener("dom-ready", () => {
    void (async (): Promise<void> => {
      const currentProviderId =
        options.providerSelect?.value ?? AppState.getProviderIdForSlot("ai0");
      const cfg =
        typeof currentProviderId === "string" && currentProviderId !== ""
          ? ProviderRegistry.getAny(currentProviderId)
          : null;
      if (cfg !== null) {
        try {
          if (typeof options.webviewEl.send === "function" && currentProviderId !== "") {
            options.webviewEl.send("app-set-provider", {
              providerId: currentProviderId,
              slot: "ai0",
            });
          } else {
            const configScript = `
              (function() {
                try {
                  window.__app_slot = "ai0";
                  window.__app_provider_config = ${JSON.stringify(cfg)};
                  return true;
                } catch (e) {
                  console.error(
                    ${JSON.stringify(
                      AppI18n.t("webview.messageSender.logs.providerConfigInjectionFailed", {
                        provider: "ai0",
                        providerId: currentProviderId,
                        message: "{{message}}",
                      })
                    )}.replace("{{message}}", e instanceof Error ? e.message : String(e)),
                    e
                  );
                  return false;
                }
              })();
            `;
            await options.webviewEl.executeJavaScript?.(configScript);
          }
        } catch (_err) {
          void _err;
        }
      }

      options.syncDisabledMcpToHealth();
      options.syncThemeToWebview();
      options.onTranscriptDomReady?.();
    })();
  });

  options.webviewEl.addEventListener("did-navigate", () => {
    try {
      const url = options.webviewEl.getURL?.() ?? "";
      if (options.urlDisplay != null) {
        options.urlDisplay.textContent = url;
      }

      const providerId = options.providerSelect?.value ?? AppState.getProviderIdForSlot("ai0");
      if (providerId === "opencode") {
        options.scheduleSaveLastOpencodeUrl(url);
      }
    } catch (_) {}
  });
}

export function sendTranscriptIngressToAssistantWebview(
  webviewEl: WebviewElement | null,
  payload: TranscriptIngressPayload
): boolean {
  if (webviewEl == null || typeof webviewEl.send !== "function") {
    return false;
  }

  try {
    webviewEl.send("assistant-transcript-ingress", payload);
    return true;
  } catch {
    return false;
  }
}
