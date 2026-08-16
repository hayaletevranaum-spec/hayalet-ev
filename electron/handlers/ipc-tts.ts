import type { IpcMainInvokeEvent } from "electron";
import { registerHandler } from "./ipc-helpers.ts";
import { ttsService } from "../tts-service.ts";
import type { TtsManagedModelId, TtsRequest } from "../../src/types/tts.ts";

export function setupTtsHandlers(): void {
  registerHandler("tts-status", async () => {
    return await ttsService.getStatus();
  });

  registerHandler("tts-speak", async (_event: IpcMainInvokeEvent, request: unknown) => {
    return await ttsService.speak(request as TtsRequest);
  });

  registerHandler("tts-stop", async (_event: IpcMainInvokeEvent, requestId: unknown) => {
    return await ttsService.stop(requestId);
  });

  registerHandler("tts-list-models", async () => {
    return await ttsService.listModels();
  });

  registerHandler("tts-install-model", async (_event: IpcMainInvokeEvent, modelId: unknown) => {
    return await ttsService.installModel(modelId as TtsManagedModelId);
  });
}
