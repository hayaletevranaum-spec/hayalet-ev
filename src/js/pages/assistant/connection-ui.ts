import type { ConnectButtonState, SlotStateInfo, WebviewElement } from "@shared/assistant.js";

import { AppState } from "../../modules/app-state.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { SlotController, SlotState } from "../../modules/slot-controller.js";
import type { InlineStatusOverlayState } from "../../ui/overlay-system.js";
import { formatConnectionIndicatorText } from "./connection-indicator.js";
import { resolveAssistantConnectButtonState } from "./connect-flow.js";
import { resolveOverlayStage, shouldKeepOverlayVisibleForToolsReady } from "./overlay-stage.js";
import type { OverlayStage } from "./overlay-stage.js";

export interface AssistantConnectionUiController {
  providerSelect: HTMLSelectElement | null;
  devtoolsBtn: HTMLButtonElement | null;
  testBtn: HTMLButtonElement | null;
  urlDisplay: HTMLElement | null;
  statusDot: HTMLElement | null;
  statusText: HTMLElement | null;
  _activeAdapter: { id: string } | null;
  _connectFlowActive: boolean;
  _connectOverlayStage: OverlayStage | null;
  _providerToolsReady: boolean;
  _isServerRunning: boolean;
  _systemServerPort: number | null;
  _setupWebviewEvents: (webviewEl: WebviewElement) => void;
  _setButtonState: (state: ConnectButtonState, errorMsg?: string) => void;
  setWebviewStatusOverlayState: (state: InlineStatusOverlayState | null) => void;
  _syncSystemServerStatus: (options?: { refreshUi?: boolean }) => Promise<void>;
}

function assistantConnectionT(key: string): string {
  return AppI18n.t(`shell.assistant.connectionUi.${key}`);
}

export function updateAssistantConnectionUI(
  controller: AssistantConnectionUiController,
  skipSystemServerSync = false
): void {
  const slotState = SlotController.getState("ai0") as SlotStateInfo | null;

  const isConnected = slotState?.state === SlotState.CONNECTED;
  const isConnecting = slotState?.state === SlotState.CONNECTING;
  const isConnectingUi = isConnecting || controller._connectFlowActive;
  const isError = slotState?.state === SlotState.ERROR;
  const hasAccount = AppState.isAssigned("ai0");
  const providerId = controller.providerSelect?.value ?? controller._activeAdapter?.id;
  const shouldHoldToolsReadyOverlay = shouldKeepOverlayVisibleForToolsReady({
    ...(typeof providerId === "string" && providerId !== "" ? { providerId } : {}),
    isConnected,
    connectFlowActive: controller._connectFlowActive,
    toolsReady: controller._providerToolsReady,
  });

  const webviewEl = document.getElementById("ai0-webview");
  const mountEl = document.getElementById("ai0-webview-mount");
  const overlayEl = document.getElementById("ai0-webview-overlay");

  if (webviewEl != null && mountEl != null && !mountEl.contains(webviewEl)) {
    SlotController.ensureWebviewMounted("ai0");
    webviewEl.classList.add("webview-frame");
  }

  if (webviewEl !== null && webviewEl.dataset["eventsSetup"] === undefined) {
    controller._setupWebviewEvents(webviewEl);
    webviewEl.dataset["eventsSetup"] = "true";
  }

  if (overlayEl != null) {
    let overlayState: InlineStatusOverlayState | null = null;

    if (!hasAccount) {
      overlayState = {
        stateClass: "is-empty",
        icon: "🤖",
        title: assistantConnectionT("noAccountTitle"),
        subtitle: assistantConnectionT("noAccountSubtitle"),
      };
    } else if (isConnectingUi) {
      const stage = resolveOverlayStage({
        ...(typeof providerId === "string" && providerId !== "" ? { providerId } : {}),
        connectFlowActive: controller._connectFlowActive,
        stage: controller._connectOverlayStage,
      });
      overlayState = {
        stateClass: "is-connecting",
        icon: "🔄",
        title: stage.title,
        subtitle: stage.subtitle,
      };
    } else if (shouldHoldToolsReadyOverlay) {
      const holdTitle =
        typeof controller._connectOverlayStage?.title === "string" &&
        controller._connectOverlayStage.title.trim() !== ""
          ? controller._connectOverlayStage.title
          : assistantConnectionT("toolsLoadingTitle");
      const holdSubtitle =
        typeof controller._connectOverlayStage?.subtitle === "string" &&
        controller._connectOverlayStage.subtitle.trim() !== ""
          ? controller._connectOverlayStage.subtitle
          : assistantConnectionT("toolsLoadingSubtitle");

      overlayState = {
        stateClass: "is-connecting",
        icon: "🔄",
        title: holdTitle,
        subtitle: holdSubtitle,
      };
    } else if (isError) {
      overlayState = {
        stateClass: "is-error",
        icon: "❌",
        title: assistantConnectionT("connectionErrorTitle"),
        subtitle: slotState.error ?? assistantConnectionT("connectionErrorRetry"),
      };
    } else if (!isConnected) {
      overlayState = {
        stateClass: "is-disconnected",
        icon: "⚡",
        title: assistantConnectionT("disconnectedTitle"),
        subtitle: assistantConnectionT("disconnectedSubtitle"),
      };
    }

    controller.setWebviewStatusOverlayState(overlayState);
    if (overlayState === null && webviewEl != null) {
      SlotController.ensureWebviewAttached("ai0");
    }
  }

  const buttonState = resolveAssistantConnectButtonState({
    ...(slotState?.state !== undefined ? { slotState: slotState.state } : {}),
    connectFlowActive: controller._connectFlowActive,
  });
  controller._setButtonState(buttonState);

  if (controller.devtoolsBtn != null) {
    controller.devtoolsBtn.disabled = !isConnected;
  }

  if (controller.testBtn != null) {
    controller.testBtn.disabled = !hasAccount;
    controller.testBtn.title = !hasAccount
      ? assistantConnectionT("noAccountTitle")
      : assistantConnectionT("testButtonReady");
  }

  if (controller.statusDot != null) {
    controller.statusDot.classList.toggle("is-connected", isConnected);
  }

  if (controller.statusText != null) {
    controller.statusText.textContent = formatConnectionIndicatorText({
      isConnected,
      isServerRunning: controller._isServerRunning,
      ...(typeof controller._systemServerPort === "number"
        ? { port: controller._systemServerPort }
        : {}),
    });
  }

  if (controller.urlDisplay !== null) {
    if (slotState?.currentUrl !== undefined && slotState.currentUrl !== "") {
      controller.urlDisplay.textContent = slotState.currentUrl;
    } else {
      controller.urlDisplay.textContent = "-";
    }
  }

  if (!skipSystemServerSync) {
    void controller._syncSystemServerStatus();
  }
}
