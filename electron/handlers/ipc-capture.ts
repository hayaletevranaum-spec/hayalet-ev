import { registerHandler } from "./ipc-helpers.ts";
import { captureService } from "../capture-service.ts";
import type {
  CaptureAmbientListenerOptions,
  CaptureTargetActionOptions,
  CaptureTorchOptions,
} from "../../src/types/capture.ts";

export function setupCaptureHandlers(): void {
  registerHandler("capture-status", async () => {
    return await captureService.getStatus();
  });

  registerHandler("capture-refresh-status", async () => {
    return await captureService.refreshStatus();
  });

  registerHandler("capture-consume-analyze-assets", async () => {
    return await captureService.consumeAnalyzeInboxAssets();
  });

  registerHandler("capture-prepare-host-dependencies", async () => {
    return await captureService.prepareHostDependencies();
  });

  registerHandler(
    "capture-install-companion",
    async (_event, options?: { allowBootstrap?: boolean }) => {
      return await captureService.installCompanion(options);
    }
  );

  registerHandler("capture-dismiss-operation", async () => {
    return await captureService.dismissOperation();
  });

  registerHandler("capture-connect-device", async (_event, address: string) => {
    return await captureService.connectDevice(address);
  });

  registerHandler("capture-disconnect-device", async (_event, deviceId: string) => {
    return await captureService.disconnectDevice(deviceId);
  });

  registerHandler(
    "capture-launch-companion",
    async (_event, options?: CaptureTargetActionOptions) => {
      return await captureService.launchCompanion(options);
    }
  );

  registerHandler(
    "capture-start-analyze-session",
    async (_event, options?: CaptureTargetActionOptions) => {
      return await captureService.requestAnalyzeSession(options);
    }
  );

  registerHandler(
    "capture-stop-analyze-session",
    async (_event, options?: CaptureTargetActionOptions) => {
      return await captureService.stopAnalyzeSession(options);
    }
  );

  registerHandler(
    "capture-start-analyze-preview",
    async (_event, options?: CaptureTargetActionOptions) => {
      return await captureService.startAnalyzePreviewStream(options);
    }
  );

  registerHandler(
    "capture-stop-analyze-preview",
    async (_event, options?: CaptureTargetActionOptions) => {
      return await captureService.stopAnalyzePreviewStream(options);
    }
  );

  registerHandler(
    "capture-start-camera-feed",
    async (_event, options?: CaptureTargetActionOptions) => {
      return await captureService.startCameraFeed(options);
    }
  );

  registerHandler(
    "capture-stop-camera-feed",
    async (_event, options?: CaptureTargetActionOptions) => {
      return await captureService.stopCameraFeed(options);
    }
  );

  registerHandler(
    "capture-start-interactive-mirror",
    async (_event, options?: CaptureTargetActionOptions) => {
      return await captureService.startInteractiveMirror(options);
    }
  );

  registerHandler("capture-stop-interactive-mirror", async () => {
    return await captureService.stopInteractiveMirror();
  });

  registerHandler(
    "capture-start-analyze-dictation",
    async (_event, options?: CaptureTargetActionOptions) => {
      return await captureService.requestAnalyzeDictation("start", options);
    }
  );

  registerHandler(
    "capture-stop-analyze-dictation",
    async (_event, options?: CaptureTargetActionOptions) => {
      return await captureService.requestAnalyzeDictation("stop", options);
    }
  );

  registerHandler(
    "capture-cancel-analyze-dictation",
    async (_event, options?: CaptureTargetActionOptions) => {
      return await captureService.cancelAnalyzeDictation(options);
    }
  );

  registerHandler(
    "capture-start-ambient-listener",
    async (_event, options?: CaptureAmbientListenerOptions) => {
      return await captureService.startAmbientListener(options);
    }
  );

  registerHandler(
    "capture-stop-ambient-listener",
    async (_event, options?: CaptureAmbientListenerOptions) => {
      return await captureService.stopAmbientListener(options);
    }
  );

  registerHandler("capture-set-torch", async (_event, options?: CaptureTorchOptions) => {
    return await captureService.setTorch(options);
  });

  registerHandler(
    "capture-request-analyze-photo",
    async (_event, options?: CaptureTargetActionOptions) => {
      return await captureService.requestAnalyzeCapture("capture-photo", options);
    }
  );

  registerHandler(
    "capture-retake-analyze-photo",
    async (_event, options?: CaptureTargetActionOptions) => {
      return await captureService.requestAnalyzeCapture("retake-photo", options);
    }
  );
}
