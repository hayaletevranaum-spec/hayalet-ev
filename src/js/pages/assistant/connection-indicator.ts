import { AppI18n } from "../../modules/i18n/index.js";

interface ConnectionIndicatorInput {
  isConnected: boolean;
  isServerRunning: boolean;
  port?: number;
}

function isValidPort(port: number | undefined): port is number {
  return typeof port === "number" && Number.isFinite(port) && port > 0;
}

export function formatConnectionIndicatorText(input: ConnectionIndicatorInput): string {
  if (input.isConnected && isValidPort(input.port)) {
    return AppI18n.t("shell.assistant.connectionIndicator.connectedPort", { port: input.port });
  }

  if (input.isServerRunning && isValidPort(input.port)) {
    return AppI18n.t("shell.assistant.connectionIndicator.disconnectedServer", {
      port: input.port,
    });
  }

  return AppI18n.t("shell.assistant.connectionIndicator.disconnectedPassive");
}
