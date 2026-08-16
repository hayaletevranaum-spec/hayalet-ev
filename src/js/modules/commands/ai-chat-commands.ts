import type { TranslationParams } from "@shared/i18n.js";
import { LogCategory, LogLevel } from "@shared/logging-core";
import { Logger } from "../logger/index.js";

import { AppI18n } from "../i18n/index.js";
import { AppState } from "../app-state.js";
import { RelayManager } from "../relay-manager.js";
import type { CommandPayload } from "./utils.js";
import { logCommandResult } from "./utils.js";
import { getErrorMessage } from "@shared/index.js";
import {
  dispatchInternalSlotBridge,
  sendProtocolThroughSlotBridge,
  type SlotBridgeProtocolRequest,
} from "./slot-bridge-runtime.js";

type CommandHandlerResult = { success: boolean; message?: string; [key: string]: unknown };

function aiChatT(key: string, params?: TranslationParams): string {
  return AppI18n.t(`app.commands.aiChat.${key}`, params);
}

function formatCommandTimestamp(): string {
  return new Date().toLocaleString(AppI18n.getLocale());
}

export const aiChatRuntime = {
  slotBridge: async (payload: CommandPayload = {}): Promise<CommandHandlerResult> => {
    return (await dispatchInternalSlotBridge(payload)) as CommandHandlerResult;
  },
  sendProtocol: async (
    request: SlotBridgeProtocolRequest = {}
  ): Promise<{ success: boolean; message?: string }> => {
    return await sendProtocolThroughSlotBridge(request, {
      relay: RelayManager,
    });
  },
};

export async function aiaiChatStartHandler(
  payload: CommandPayload = {}
): Promise<CommandHandlerResult> {
  const providerRaw = payload.provider ?? "ai1";
  const provider = providerRaw === "ai1" || providerRaw === "ai2" ? providerRaw : "ai1";
  const argsLabel = payload.args ?? "";

  try {
    const ai1Assigned = AppState.isAssigned("ai1");
    const ai2Assigned = AppState.isAssigned("ai2");

    if (ai1Assigned !== true || ai2Assigned !== true) {
      throw new Error(aiChatT("aiaiStartRequiresConnections"));
    }

    try {
      const radio = document.querySelector<HTMLInputElement>(
        `input[name="relay-starter"][value="${provider}"]`
      );
      if (radio !== null && !radio.disabled) {
        radio.checked = true;
      }
    } catch {}

    Logger.panel(
      LogCategory.COMMAND,
      LogLevel.INFO,
      aiChatT("commandStarting", { command: "AIAIChatStart", provider })
    );

    const result = await aiChatRuntime.sendProtocol({
      room: "analyze",
      scenario: "ai-ai",
      targets: ["ai1", "ai2"],
      mode: "aiRelaySequential",
      context: { starter: provider },
    });

    if (result.success === true) {
      Logger.panel(LogCategory.COMMAND, LogLevel.INFO, aiChatT("relaySendTriggered"), {
        eventType: "coreengine-ai-send",
        provider,
        triggerCommand: "AIAIChatStart",
        triggerSource: payload.source ?? "manual",
        detail: "ai1, ai2 protocol-start",
        timestamp: formatCommandTimestamp(),
      });
    }

    logCommandResult("AIAIChatStart", {
      providerRaw,
      sender: payload.sender ?? providerRaw,
      args: argsLabel,
      success: result.success,
      detail:
        result.message ?? (result.success ? aiChatT("statusStarted") : aiChatT("statusError")),
    });

    return result;
  } catch (err) {
    const errMsg = getErrorMessage(err);
    Logger.panel(
      LogCategory.COMMAND,
      LogLevel.ERROR,
      aiChatT("commandError", { command: "AIAIChatStart", message: errMsg })
    );
    return { success: false, message: errMsg };
  }
}

export async function aiaiChatStopHandler(
  payload: CommandPayload = {}
): Promise<CommandHandlerResult> {
  const providerRaw = payload.provider ?? "AI";

  try {
    Logger.panel(
      LogCategory.COMMAND,
      LogLevel.INFO,
      aiChatT("commandRequested", { command: "AIAIChatStop" })
    );

    if (RelayManager.isAIAIActive() !== true) {
      const message = aiChatT("aiaiRelayInactive");
      logCommandResult("AIAIChatStop", {
        providerRaw,
        sender: payload.sender ?? providerRaw,
        args: "",
        success: false,
        detail: message,
      });
      return { success: false, message };
    }

    const result = await aiChatRuntime.sendProtocol({
      room: "analyze",
      scenario: "ai-ai-stop",
      targets: ["ai1", "ai2"],
    });

    if (result.success === true) {
      Logger.panel(LogCategory.COMMAND, LogLevel.INFO, aiChatT("relayStopTriggered"), {
        eventType: "coreengine-ai-send",
        provider: providerRaw,
        triggerCommand: "AIAIChatStop",
        triggerSource: payload.source ?? "manual",
        detail: "ai1, ai2 protocol-stop",
        timestamp: formatCommandTimestamp(),
      });
    }

    logCommandResult("AIAIChatStop", {
      providerRaw,
      sender: payload.sender ?? providerRaw,
      args: "",
      success: result.success === true,
      detail:
        result.success === true
          ? aiChatT("stopSignalSent")
          : (result.message ?? aiChatT("stopSignalFailed")),
    });

    return result;
  } catch (err) {
    const errMsg = getErrorMessage(err);
    Logger.panel(
      LogCategory.COMMAND,
      LogLevel.ERROR,
      aiChatT("commandError", { command: "AIAIChatStop", message: errMsg })
    );
    return { success: false, message: errMsg };
  }
}

export async function aiAssistantChatStartHandler(
  payload: CommandPayload = {}
): Promise<CommandHandlerResult> {
  const providerRaw = payload.provider ?? "ai1";
  const provider = providerRaw === "ai1" || providerRaw === "ai2" ? providerRaw : "ai1";

  try {
    const sourceAssigned = AppState.isAssigned(provider);
    const assistantAssigned = AppState.isAssigned("ai0");

    if (sourceAssigned !== true) {
      throw new Error(aiChatT("aiAssistantSourceDisconnected", { provider }));
    }

    if (assistantAssigned !== true) {
      throw new Error(aiChatT("aiAssistantDisconnected"));
    }

    Logger.panel(
      LogCategory.COMMAND,
      LogLevel.INFO,
      aiChatT("commandStarting", { command: "AIAssistantChatStart", provider: `${provider} ↔ ai0` })
    );

    await RelayManager.startAIAssistantSession(provider);

    logCommandResult("AIAssistantChatStart", {
      providerRaw,
      sender: payload.sender ?? providerRaw,
      args: "",
      success: true,
      detail: aiChatT("aiAssistantRelayStarted", { provider }),
    });

    return { success: true, message: aiChatT("aiAssistantRelayStarted", { provider }) };
  } catch (err) {
    const errMsg = getErrorMessage(err);
    Logger.panel(
      LogCategory.COMMAND,
      LogLevel.ERROR,
      aiChatT("commandError", { command: "AIAssistantChatStart", message: errMsg })
    );
    return { success: false, message: errMsg };
  }
}

export async function aiAssistantChatStopHandler(
  payload: CommandPayload = {}
): Promise<CommandHandlerResult> {
  const providerRaw = payload.provider ?? "AI";

  try {
    Logger.panel(
      LogCategory.COMMAND,
      LogLevel.INFO,
      aiChatT("commandRequested", { command: "AIAssistantChatStop" })
    );

    if (RelayManager.isAssistantRelayActive() !== true) {
      const message = aiChatT("aiAssistantRelayInactive");
      logCommandResult("AIAssistantChatStop", {
        providerRaw,
        sender: payload.sender ?? providerRaw,
        args: "",
        success: false,
        detail: message,
      });
      return { success: false, message };
    }

    const sourceSlot = RelayManager.getAssistantRelaySourceSlot();
    if (sourceSlot !== "ai1" && sourceSlot !== "ai2" && sourceSlot !== "us1") {
      const message = aiChatT("aiAssistantSourceUnknown");
      logCommandResult("AIAssistantChatStop", {
        providerRaw,
        sender: payload.sender ?? providerRaw,
        args: "",
        success: false,
        detail: message,
      });
      return { success: false, message };
    }

    const result = await aiChatRuntime.sendProtocol({
      room: "analyze",
      scenario: "ai-assistant-stop",
      targets: [sourceSlot],
    });

    if (result.success !== true) {
      return result;
    }

    logCommandResult("AIAssistantChatStop", {
      providerRaw,
      sender: payload.sender ?? providerRaw,
      args: "",
      success: true,
      detail: aiChatT("aiAssistantRelayStopped"),
    });

    return { success: true, message: aiChatT("aiAssistantRelayStopped") };
  } catch (err) {
    const errMsg = getErrorMessage(err);
    Logger.panel(
      LogCategory.COMMAND,
      LogLevel.ERROR,
      aiChatT("commandError", { command: "AIAssistantChatStop", message: errMsg })
    );
    return { success: false, message: errMsg };
  }
}
