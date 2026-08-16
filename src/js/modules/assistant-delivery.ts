import { LogCategory } from "@shared/logging-core";
import { showPage } from "../app/navigation.js";
import { AppI18n } from "./i18n/index.js";
import { Logger } from "./logger/index.js";

export interface AssistantDeliveryRequest {
  message: string;
  page?: string;
  metadata?: Record<string, unknown>;
}

export interface AssistantDeliveryResult {
  success: boolean;
  message?: string;
}

type AssistantDeliveryHandler = (
  request: AssistantDeliveryRequest
) => Promise<AssistantDeliveryResult>;

let activeAssistantDeliveryHandler: AssistantDeliveryHandler | null = null;

function assistantT(key: string): string {
  return AppI18n.t(`shell.assistant.${key}`);
}

export function registerAssistantDeliveryHandler(handler: AssistantDeliveryHandler | null): void {
  activeAssistantDeliveryHandler = handler;
}

export async function deliverToAssistant(
  request: AssistantDeliveryRequest
): Promise<AssistantDeliveryResult> {
  showPage("assistant");

  if (activeAssistantDeliveryHandler === null) {
    return {
      success: false,
      message: assistantT("runtime.deliveryHandlerNotReady"),
    };
  }

  Logger.info(LogCategory.ASSISTANT_CORE, assistantT("logs.deliveryRequested"), {
    page: request.page ?? "generic",
  });

  return await activeAssistantDeliveryHandler(request);
}
