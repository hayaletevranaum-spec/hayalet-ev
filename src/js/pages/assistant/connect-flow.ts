import { ConnectButtonState } from "@shared/assistant.js";

export function resolveAssistantConnectButtonState(options: {
  slotState?: string;
  isServerRunning?: boolean;
  connectFlowActive: boolean;
}): ConnectButtonState {
  if (options.slotState === "connecting" || options.connectFlowActive) {
    return ConnectButtonState.CANCEL_CONNECTING;
  }

  if (options.slotState === "connected" || options.isServerRunning === true) {
    return ConnectButtonState.CONNECTED;
  }

  return ConnectButtonState.IDLE;
}
