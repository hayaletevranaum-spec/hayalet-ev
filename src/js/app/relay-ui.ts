import { getErrorMessage } from "@shared/index.js";
import { Logger, LogCategory } from "../modules/logger/index.js";
import { AppI18n } from "../modules/i18n/index.js";
import { AppState } from "../modules/app-state.js";
import { SettingsManager } from "../modules/settings-manager.js";
import { RelayManager } from "../modules/relay-manager.js";
import { TrafficManager } from "../modules/traffic-manager.js";
import { CoreEngine } from "../modules/core-engine.js";
import { sendProtocolThroughSlotBridge } from "../modules/commands/slot-bridge-runtime.js";
import { shellT } from "./shell-i18n.js";

type RelayRoute = "ai1Assistant" | "assistantAi2" | "assistantUs1" | "ai1Ai2" | "ai2Ai1";
type RelaySlot = "ai0" | "ai1" | "ai2" | "us1";
type RelayEdge = "top" | "bottom";

let relayI18nBound = false;
let relaySettingsBound = false;

function relayLogKey(key: string): string {
  return `app.logs.${key}`;
}

function relayDebug(
  key: string,
  params?: Record<string, string>,
  context?: Record<string, unknown>
): void {
  Logger.debugT(LogCategory.RELAY, relayLogKey(key), params, context);
}

function relayInfo(
  key: string,
  params?: Record<string, string>,
  context?: Record<string, unknown>
): void {
  Logger.infoT(LogCategory.RELAY, relayLogKey(key), params, context);
}

function relayWarn(
  key: string,
  params?: Record<string, string>,
  context?: Record<string, unknown>
): void {
  Logger.warnT(LogCategory.RELAY, relayLogKey(key), params, context);
}

function relayError(
  key: string,
  params?: Record<string, string>,
  context?: Record<string, unknown>
): void {
  Logger.errorT(LogCategory.RELAY, relayLogKey(key), params, context);
}

async function sendRelayProtocol(options: {
  room: string;
  scenario: string;
  targets: string[];
  context?: Record<string, unknown>;
  mode?: string | null;
}): Promise<{ success: boolean; message?: string }> {
  return await sendProtocolThroughSlotBridge(options, {
    ensureReady: CoreEngine.ensureReady.bind(CoreEngine),
    relay: RelayManager,
  });
}

function getRelayLabel(route: RelayRoute): string {
  switch (route) {
    case "ai1Assistant":
      return shellT("relay.label.ai1Assistant");
    case "assistantAi2":
      return shellT("relay.label.assistantAi2");
    case "assistantUs1":
      return shellT("relay.label.assistantUs1");
    case "ai1Ai2":
      return shellT("relay.label.ai1Ai2");
    case "ai2Ai1":
      return shellT("relay.label.ai2Ai1");
    default:
      return "";
  }
}

function getSlotLabel(slot: RelaySlot): string {
  switch (slot) {
    case "ai0":
      return shellT("relay.participants.assistant");
    case "ai1":
      return shellT("relay.participants.ai1");
    case "ai2":
      return shellT("relay.participants.ai2");
    case "us1":
      return shellT("relay.participants.us1");
    default:
      return "";
  }
}

function applyDefaultRelayTitles(): void {
  const flowAi1Ai0 = document.getElementById("relay-flow-ai1-ai0");
  const flowAi0Ai2 = document.getElementById("relay-flow-ai0-ai2");
  const flowAi1Ai2 = document.getElementById("relay-flow-ai1-ai2");

  if (flowAi1Ai0 !== null) {
    flowAi1Ai0.title = shellT("relay.flow.ai1Assistant");
  }
  if (flowAi0Ai2 !== null) {
    flowAi0Ai2.title = shellT("relay.flow.assistantAi2");
  }
  if (flowAi1Ai2 !== null) {
    flowAi1Ai2.title = shellT("relay.flow.ai1Ai2");
  }
}

function bindRelayI18n(): void {
  if (relayI18nBound) {
    return;
  }

  AppI18n.subscribe(() => {
    applyDefaultRelayTitles();
    updateRelayIndicator();
    updateRelayButtonStates();
  });
  relayI18nBound = true;
}

function bindRelaySettings(): void {
  if (relaySettingsBound) {
    return;
  }

  SettingsManager.subscribe(({ changedPaths }) => {
    const shouldRefresh =
      changedPaths.includes("*") ||
      changedPaths.some(
        (path) =>
          path.startsWith("us1Slot") ||
          path.startsWith("assistantSlot") ||
          path.startsWith("slots.ai1") ||
          path.startsWith("slots.ai2") ||
          path.startsWith("accounts")
      );
    if (!shouldRefresh) {
      return;
    }

    updateRelayButtonStates();
    updateRelayIndicator();
  });

  relaySettingsBound = true;
}

function getRelayCluster(slot: RelaySlot): HTMLElement | null {
  return document.getElementById(`cluster-${slot}`);
}

function clearRelayClusterVisuals(): void {
  (["ai0", "ai1", "ai2", "us1"] as const).forEach((slot) => {
    const cluster = getRelayCluster(slot);
    if (cluster === null) {
      return;
    }
    cluster.classList.remove(
      "is-relay-top-active",
      "is-relay-top-rtl",
      "is-relay-bottom-active",
      "is-relay-bottom-rtl"
    );
  });
}

function applyRelayClusterVisuals(slots: RelaySlot[], edge: RelayEdge, rtl: boolean): void {
  const activeClass = edge === "top" ? "is-relay-top-active" : "is-relay-bottom-active";
  const rtlClass = edge === "top" ? "is-relay-top-rtl" : "is-relay-bottom-rtl";

  slots.forEach((slot) => {
    const cluster = getRelayCluster(slot);
    if (cluster === null) {
      return;
    }
    cluster.classList.add(activeClass);
    cluster.classList.toggle(rtlClass, rtl);
  });
}

export function updateRelayIndicator(): void {
  const flowAi1Ai0 = document.getElementById("relay-flow-ai1-ai0");
  const flowAi0Ai2 = document.getElementById("relay-flow-ai0-ai2");
  const flowAi1Ai2 = document.getElementById("relay-flow-ai1-ai2");
  flowAi1Ai0?.classList.remove("is-active", "flow-rtl");
  flowAi0Ai2?.classList.remove("is-active", "flow-rtl");
  flowAi1Ai2?.classList.remove("is-active", "flow-rtl");
  clearRelayClusterVisuals();
  applyDefaultRelayTitles();

  const isAIAIActive = RelayManager.isAIAIActive();
  const isAssistantRelayActive = RelayManager.isAssistantRelayActive();
  const assistantSourceSlot = RelayManager.getAssistantRelaySourceSlot();

  const getThinking = (slot: string): boolean =>
    TrafficManager.state[slot]?.status.thinking === "busy";

  if (isAIAIActive) {
    const rtl = getThinking("ai2");
    flowAi1Ai2?.classList.add("is-active");
    flowAi1Ai2?.classList.toggle("flow-rtl", rtl);
    applyRelayClusterVisuals(["ai1", "ai2"], "bottom", rtl);
    if (rtl) {
      if (flowAi1Ai2 !== null) {
        flowAi1Ai2.title = shellT("relay.active.ai2ToAi1");
      }
    } else if (flowAi1Ai2 !== null) {
      flowAi1Ai2.title = shellT("relay.active.ai1ToAi2");
    }
  } else if (isAssistantRelayActive && assistantSourceSlot === "ai1") {
    const rtl = getThinking("ai0");
    flowAi1Ai0?.classList.add("is-active");
    flowAi1Ai0?.classList.toggle("flow-rtl", rtl);
    applyRelayClusterVisuals(["ai1", "ai0"], "top", rtl);
    if (rtl) {
      if (flowAi1Ai0 !== null) {
        flowAi1Ai0.title = shellT("relay.active.assistantToAi1");
      }
    } else if (flowAi1Ai0 !== null) {
      flowAi1Ai0.title = shellT("relay.active.ai1ToAssistant");
    }
  } else if (isAssistantRelayActive && assistantSourceSlot === "ai2") {
    const rtl = getThinking("ai2");
    flowAi0Ai2?.classList.add("is-active");
    flowAi0Ai2?.classList.toggle("flow-rtl", rtl);
    applyRelayClusterVisuals(["ai0", "ai2"], "top", rtl);
    if (rtl) {
      if (flowAi0Ai2 !== null) {
        flowAi0Ai2.title = shellT("relay.active.ai2ToAssistant");
      }
    } else if (flowAi0Ai2 !== null) {
      flowAi0Ai2.title = shellT("relay.active.assistantToAi2");
    }
  } else if (isAssistantRelayActive && assistantSourceSlot === "us1") {
    applyRelayClusterVisuals(["ai0", "us1"], "top", false);
  }
}

async function persistLastActiveRelay(relayName: string): Promise<void> {
  try {
    await SettingsManager.set("assistants.lastActiveRelay", relayName);
  } catch (err) {
    relayWarn("relayLastActiveSaveFailed", { message: getErrorMessage(err) });
  }
}

export function setupTopBarRelayButtons(): void {
  try {
    bindRelayI18n();
    bindRelaySettings();
    relayInfo("relaySetupStarted");

    const btnAi1Ai0 = document.getElementById("relay-btn-ai1-ai0") as HTMLButtonElement | null;
    relayDebug("relayButtonFound", {
      relay: getRelayLabel("ai1Assistant"),
      found: String(!!btnAi1Ai0),
      disabled: String(btnAi1Ai0?.disabled ?? false),
    });
    if (btnAi1Ai0) {
      btnAi1Ai0.addEventListener("click", (): void => {
        void (async (): Promise<void> => {
          relayInfo("relayButtonClicked", { relay: getRelayLabel("ai1Assistant") });
          try {
            if (
              RelayManager.isAIAssistantActive() &&
              RelayManager.getAIAssistantSourceSlot() === "ai1"
            ) {
              await sendRelayProtocol({
                room: "analyze",
                scenario: "ai-assistant-stop",
                targets: ["ai1"],
              });
              relayInfo("relayStopped", { relay: getRelayLabel("ai1Assistant") });
            } else {
              if (AppState.isAssigned("ai1") !== true) {
                relayWarn("relayStartBlocked", { slot: getSlotLabel("ai1") });
                return;
              }
              if (AppState.isAssigned("ai0") !== true) {
                relayWarn("relayStartBlocked", { slot: getSlotLabel("ai0") });
                return;
              }
              await RelayManager.startAIAssistantSession("ai1");
              relayInfo("relayStarted", { relay: getRelayLabel("ai1Assistant") });
              await persistLastActiveRelay("ai1-assistant");
            }
            updateRelayButtonStates();
            updateRelayIndicator();
          } catch (err) {
            relayError("relayError", {
              relay: getRelayLabel("ai1Assistant"),
              message: getErrorMessage(err),
            });
          }
        })();
      });
    }

    const btnAi0Ai2 = document.getElementById("relay-btn-ai0-ai2") as HTMLButtonElement | null;
    relayDebug("relayButtonFound", {
      relay: getRelayLabel("assistantAi2"),
      found: String(!!btnAi0Ai2),
      disabled: String(btnAi0Ai2?.disabled ?? false),
    });
    if (btnAi0Ai2) {
      btnAi0Ai2.addEventListener("click", (): void => {
        void (async (): Promise<void> => {
          relayInfo("relayButtonClicked", { relay: getRelayLabel("assistantAi2") });
          try {
            if (
              RelayManager.isAIAssistantActive() &&
              RelayManager.getAIAssistantSourceSlot() === "ai2"
            ) {
              await sendRelayProtocol({
                room: "analyze",
                scenario: "ai-assistant-stop",
                targets: ["ai2"],
              });
              relayInfo("relayStopped", { relay: getRelayLabel("assistantAi2") });
            } else {
              if (AppState.isAssigned("ai2") !== true) {
                relayWarn("relayStartBlocked", { slot: getSlotLabel("ai2") });
                return;
              }
              if (AppState.isAssigned("ai0") !== true) {
                relayWarn("relayStartBlocked", { slot: getSlotLabel("ai0") });
                return;
              }
              await RelayManager.startAIAssistantSession("ai2");
              relayInfo("relayStarted", { relay: getRelayLabel("assistantAi2") });
              await persistLastActiveRelay("assistant-ai2");
            }
            updateRelayButtonStates();
            updateRelayIndicator();
          } catch (err) {
            relayError("relayError", {
              relay: getRelayLabel("assistantAi2"),
              message: getErrorMessage(err),
            });
          }
        })();
      });
    }

    const btnAi0Us1 = document.getElementById("relay-btn-ai0-us1") as HTMLButtonElement | null;
    relayDebug("relayButtonFound", {
      relay: getRelayLabel("assistantUs1"),
      found: String(!!btnAi0Us1),
      disabled: String(btnAi0Us1?.disabled ?? false),
    });
    if (btnAi0Us1) {
      btnAi0Us1.addEventListener("click", (): void => {
        void (async (): Promise<void> => {
          relayInfo("relayButtonClicked", { relay: getRelayLabel("assistantUs1") });
          try {
            if (RelayManager.isUs1AssistantActive()) {
              await sendRelayProtocol({
                room: "analyze",
                scenario: "ai-assistant-stop",
                targets: ["us1"],
              });
              relayInfo("relayStopped", { relay: getRelayLabel("assistantUs1") });
            } else {
              if (AppState.hasUs1Identity() !== true) {
                relayWarn("relayStartBlocked", { slot: getSlotLabel("us1") });
                return;
              }
              if (AppState.isAssigned("ai0") !== true) {
                relayWarn("relayStartBlocked", { slot: getSlotLabel("ai0") });
                return;
              }
              await RelayManager.startUs1AssistantSession();
              relayInfo("relayStarted", { relay: getRelayLabel("assistantUs1") });
              await persistLastActiveRelay("assistant-us1");
            }
            updateRelayButtonStates();
            updateRelayIndicator();
          } catch (err) {
            relayError("relayError", {
              relay: getRelayLabel("assistantUs1"),
              message: getErrorMessage(err),
            });
          }
        })();
      });
    }

    const btnAi1Ai2Left = document.getElementById(
      "relay-btn-ai1-ai2-left"
    ) as HTMLButtonElement | null;
    relayDebug("relayButtonFound", {
      relay: getRelayLabel("ai1Ai2"),
      found: String(!!btnAi1Ai2Left),
      disabled: String(btnAi1Ai2Left?.disabled ?? false),
    });
    if (btnAi1Ai2Left) {
      btnAi1Ai2Left.addEventListener("click", (): void => {
        void (async (): Promise<void> => {
          relayInfo("relayButtonClicked", { relay: getRelayLabel("ai1Ai2") });
          try {
            if (RelayManager.isAIAIActive()) {
              await sendRelayProtocol({
                room: "analyze",
                scenario: "ai-ai-stop",
                targets: ["ai1", "ai2"],
              });
              relayInfo("relayStopped", { relay: getRelayLabel("ai1Ai2") });
            } else {
              if (AppState.isAssigned("ai1") !== true || AppState.isAssigned("ai2") !== true) {
                relayWarn("relayStartBlockedMultiple", {
                  slots: `${getSlotLabel("ai1")} / ${getSlotLabel("ai2")}`,
                });
                return;
              }
              await sendRelayProtocol({
                room: "analyze",
                scenario: "ai-ai",
                targets: ["ai1", "ai2"],
                mode: "aiRelaySequential",
                context: { starter: "ai1" },
              });
              relayInfo("relayStarted", { relay: getRelayLabel("ai1Ai2") });
            }
            updateRelayButtonStates();
            updateRelayIndicator();
          } catch (err) {
            relayError("relayError", {
              relay: getRelayLabel("ai1Ai2"),
              message: getErrorMessage(err),
            });
          }
        })();
      });
    }

    const btnAi1Ai2Right = document.getElementById(
      "relay-btn-ai1-ai2-right"
    ) as HTMLButtonElement | null;
    relayDebug("relayButtonFound", {
      relay: getRelayLabel("ai2Ai1"),
      found: String(!!btnAi1Ai2Right),
      disabled: String(btnAi1Ai2Right?.disabled ?? false),
    });
    if (btnAi1Ai2Right) {
      btnAi1Ai2Right.addEventListener("click", (): void => {
        void (async (): Promise<void> => {
          relayInfo("relayButtonClicked", { relay: getRelayLabel("ai2Ai1") });
          try {
            if (RelayManager.isAIAIActive()) {
              await sendRelayProtocol({
                room: "analyze",
                scenario: "ai-ai-stop",
                targets: ["ai1", "ai2"],
              });
              relayInfo("relayStopped", { relay: getRelayLabel("ai2Ai1") });
            } else {
              if (AppState.isAssigned("ai1") !== true || AppState.isAssigned("ai2") !== true) {
                relayWarn("relayStartBlockedMultiple", {
                  slots: `${getSlotLabel("ai1")} / ${getSlotLabel("ai2")}`,
                });
                return;
              }
              await sendRelayProtocol({
                room: "analyze",
                scenario: "ai-ai",
                targets: ["ai1", "ai2"],
                mode: "aiRelaySequential",
                context: { starter: "ai2" },
              });
              relayInfo("relayStarted", { relay: getRelayLabel("ai2Ai1") });
            }
            updateRelayButtonStates();
            updateRelayIndicator();
          } catch (err) {
            relayError("relayError", {
              relay: getRelayLabel("ai2Ai1"),
              message: getErrorMessage(err),
            });
          }
        })();
      });
    }

    updateRelayButtonStates();

    window.addEventListener("slot-state-changed", () => {
      updateRelayButtonStates();
    });

    window.addEventListener("relay-changed", () => {
      updateRelayButtonStates();
      updateRelayIndicator();
    });

    TrafficManager.onUpdate(() => {
      if (RelayManager.isAIAIActive() || RelayManager.isAssistantRelayActive()) {
        updateRelayIndicator();
      }
    });
  } catch (error) {
    Logger.debugT(
      LogCategory.SYSTEM,
      relayLogKey("relayButtonSetupError"),
      { message: getErrorMessage(error) },
      {
        error: error instanceof Error ? error : new Error(String(error)),
      }
    );
  }
}

export function updateRelayButtonStates(): void {
  try {
    const btnAi1Ai0 = document.getElementById("relay-btn-ai1-ai0") as HTMLButtonElement | null;
    const btnAi0Ai2 = document.getElementById("relay-btn-ai0-ai2") as HTMLButtonElement | null;
    const btnAi0Us1 = document.getElementById("relay-btn-ai0-us1") as HTMLButtonElement | null;
    const btnAi1Ai2Left = document.getElementById(
      "relay-btn-ai1-ai2-left"
    ) as HTMLButtonElement | null;
    const btnAi1Ai2Right = document.getElementById(
      "relay-btn-ai1-ai2-right"
    ) as HTMLButtonElement | null;

    const ai1Assigned = AppState.isAssigned("ai1") === true;
    const ai2Assigned = AppState.isAssigned("ai2") === true;
    const ai0Assigned = AppState.isAssigned("ai0") === true;
    const us1Assigned = AppState.hasUs1Identity() === true;

    relayDebug("relayButtonStates", {
      ai1: String(ai1Assigned),
      ai2: String(ai2Assigned),
      ai0: String(ai0Assigned),
      us1: String(us1Assigned),
    });

    const isAIAIActive = RelayManager.isAIAIActive() === true;
    const isAssistantRelayActive = RelayManager.isAssistantRelayActive() === true;
    const assistantSourceSlot = RelayManager.getAssistantRelaySourceSlot();
    const anyRelayActive = isAIAIActive || isAssistantRelayActive;

    if (btnAi1Ai0) {
      const isThisActive = isAssistantRelayActive && assistantSourceSlot === "ai1";
      const canEnable = ai1Assigned && ai0Assigned && (!anyRelayActive || isThisActive);
      btnAi1Ai0.disabled = !canEnable;
      btnAi1Ai0.classList.toggle("is-active", isThisActive);
    }

    if (btnAi0Ai2) {
      const isThisActive = isAssistantRelayActive && assistantSourceSlot === "ai2";
      const canEnable = ai2Assigned && ai0Assigned && (!anyRelayActive || isThisActive);
      btnAi0Ai2.disabled = !canEnable;
      btnAi0Ai2.classList.toggle("is-active", isThisActive);
    }

    if (btnAi0Us1) {
      const isThisActive = isAssistantRelayActive && assistantSourceSlot === "us1";
      const canEnable = us1Assigned && ai0Assigned && (!anyRelayActive || isThisActive);
      btnAi0Us1.disabled = !canEnable;
      btnAi0Us1.classList.toggle("is-active", isThisActive);
    }

    if (btnAi1Ai2Left) {
      const isThisActive = isAIAIActive;
      const canEnable = ai1Assigned && ai2Assigned && (!anyRelayActive || isThisActive);
      btnAi1Ai2Left.disabled = !canEnable;
      btnAi1Ai2Left.classList.toggle("is-active", isThisActive);
    }

    if (btnAi1Ai2Right) {
      const isThisActive = isAIAIActive;
      const canEnable = ai1Assigned && ai2Assigned && (!anyRelayActive || isThisActive);
      btnAi1Ai2Right.disabled = !canEnable;
      btnAi1Ai2Right.classList.toggle("is-active", isThisActive);
    }
  } catch (error) {
    Logger.debugT(
      LogCategory.SYSTEM,
      relayLogKey("relayButtonStateUpdateError"),
      { message: getErrorMessage(error) },
      {
        error: error instanceof Error ? error : new Error(String(error)),
      }
    );
  }
}
