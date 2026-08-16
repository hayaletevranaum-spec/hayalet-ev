import type { IpcMainInvokeEvent } from "electron";
import { registerHandler } from "./ipc-helpers.ts";
import { transcriptService } from "../transcript-service.ts";
import type {
  TranscriptFileTranscriptionRequest,
  TranscriptManagedModelId,
  TranscriptSubmitIngressRequest,
  TranscriptTranscriptionRequest,
} from "../../src/types/transcript.ts";

export function setupTranscriptHandlers(): void {
  registerHandler("transcript-status", async () => {
    return await transcriptService.getStatus();
  });

  registerHandler("transcript-ensure-runtime", async () => {
    return await transcriptService.ensureRuntime();
  });

  registerHandler(
    "transcript-transcribe-local",
    async (_event: IpcMainInvokeEvent, request: unknown) => {
      return await transcriptService.transcribeLocal(request as TranscriptTranscriptionRequest);
    }
  );

  registerHandler("transcript-transcribe-file", async (_event: IpcMainInvokeEvent, request) => {
    return await transcriptService.transcribeFile(request as TranscriptFileTranscriptionRequest);
  });

  registerHandler("transcript-list-models", async () => {
    return await transcriptService.listModels();
  });

  registerHandler("transcript-install-model", async (_event: IpcMainInvokeEvent, modelId) => {
    return await transcriptService.installModel(modelId as TranscriptManagedModelId);
  });

  registerHandler("transcript-remove-model", async (_event: IpcMainInvokeEvent, modelId) => {
    return await transcriptService.removeModel(modelId as TranscriptManagedModelId);
  });

  registerHandler("transcript-submit-ingress", (_event: IpcMainInvokeEvent, request) => {
    return transcriptService.submitIngress(request as TranscriptSubmitIngressRequest);
  });
}
