import type { ServerResponse } from "http";
import type { CaptureAnalyzePreviewVideoStatus } from "../../src/types/capture.ts";
import type { TranscriptTargetId } from "../../src/types/transcript.ts";

const MJPEG_BOUNDARY = "hayalet-ev-live-frame";
const MAX_FRAME_BYTES = 1_000_000;

export interface CompanionLiveFramePayload {
  deviceId: string;
  target: TranscriptTargetId;
  requestId: string;
  contentBase64: string;
  width: number;
  height: number;
  capturedAt: number;
}

interface CompanionLiveFeedSession {
  deviceId: string;
  target: TranscriptTargetId;
  requestId: string;
  startedAt: number;
  previewVideo: CaptureAnalyzePreviewVideoStatus;
}

interface CompanionLiveFrame {
  deviceId: string;
  target: TranscriptTargetId;
  requestId: string;
  data: Buffer;
  width: number;
  height: number;
  capturedAt: number;
  receivedAt: number;
}

interface CompanionLiveFeedClient {
  response: ServerResponse;
  deviceId: string | null;
  target: TranscriptTargetId | null;
  requestId: string | null;
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : fallback;
}

function writeMjpegFrame(response: ServerResponse, frame: CompanionLiveFrame): void {
  response.write(`--${MJPEG_BOUNDARY}\r\n`);
  response.write("Content-Type: image/jpeg\r\n");
  response.write(`Content-Length: ${String(frame.data.byteLength)}\r\n`);
  response.write(`X-Hayalet-Captured-At: ${String(frame.capturedAt)}\r\n`);
  response.write(`X-Hayalet-Received-At: ${String(frame.receivedAt)}\r\n`);
  response.write("\r\n");
  response.write(frame.data);
  response.write("\r\n");
}

export class CompanionLiveFeedHub {
  private activeSession: CompanionLiveFeedSession | null = null;
  private latestFrame: CompanionLiveFrame | null = null;
  private readonly clients = new Set<CompanionLiveFeedClient>();

  start(options: {
    bridgePort: number;
    deviceId: string;
    target: TranscriptTargetId;
    requestId: string;
    width: number;
    height: number;
    fps: number;
  }): { previewVideo: CaptureAnalyzePreviewVideoStatus; startedAt: number } {
    this.stop();

    const streamUrl = `http://127.0.0.1:${String(options.bridgePort)}/api/v1/live/camera/stream?deviceId=${encodeURIComponent(
      options.deviceId
    )}&target=${encodeURIComponent(options.target)}&requestId=${encodeURIComponent(options.requestId)}`;
    const previewVideo: CaptureAnalyzePreviewVideoStatus = {
      source: "mjpeg-stream",
      devicePath: streamUrl,
      streamUrl,
      contentType: `multipart/x-mixed-replace; boundary=${MJPEG_BOUNDARY}`,
      label: "Hayalet Ev Companion Live Camera",
      width: options.width,
      height: options.height,
      fps: options.fps,
    };
    const startedAt = Date.now();
    this.activeSession = {
      deviceId: options.deviceId,
      target: options.target,
      requestId: options.requestId,
      startedAt,
      previewVideo,
    };
    this.latestFrame = null;
    return { previewVideo, startedAt };
  }

  stop(options: { target?: TranscriptTargetId | null; requestId?: string | null } = {}): boolean {
    const session = this.activeSession;
    if (session === null) {
      return false;
    }
    if (
      options.target !== undefined &&
      options.target !== null &&
      session.target !== options.target
    ) {
      return false;
    }
    if (
      options.requestId !== undefined &&
      options.requestId !== null &&
      session.requestId !== options.requestId
    ) {
      return false;
    }

    this.activeSession = null;
    this.latestFrame = null;
    for (const client of this.clients) {
      client.response.end();
    }
    this.clients.clear();
    return true;
  }

  getActivePreviewVideo(options: {
    deviceId?: string | null;
    target: TranscriptTargetId;
  }): CaptureAnalyzePreviewVideoStatus | null {
    const session = this.activeSession;
    if (session?.target !== options.target) {
      return null;
    }

    if (
      options.deviceId !== undefined &&
      options.deviceId !== null &&
      session.deviceId !== options.deviceId
    ) {
      return null;
    }

    return session.previewVideo;
  }

  acceptFrame(payload: CompanionLiveFramePayload): { ok: true } | { ok: false; message: string } {
    const session = this.activeSession;
    if (session?.deviceId !== payload.deviceId) {
      return { ok: false, message: "No matching live camera feed is active." };
    }

    if (session.target !== payload.target || session.requestId !== payload.requestId) {
      return { ok: false, message: "No matching live camera feed is active." };
    }

    const data = Buffer.from(payload.contentBase64, "base64");
    if (data.byteLength <= 0 || data.byteLength > MAX_FRAME_BYTES) {
      return { ok: false, message: "Live camera frame size is invalid." };
    }

    const frame: CompanionLiveFrame = {
      deviceId: payload.deviceId,
      target: payload.target,
      requestId: payload.requestId,
      data,
      width: normalizePositiveInteger(payload.width, session.previewVideo.width),
      height: normalizePositiveInteger(payload.height, session.previewVideo.height),
      capturedAt: normalizePositiveInteger(payload.capturedAt, Date.now()),
      receivedAt: Date.now(),
    };
    this.latestFrame = frame;
    for (const client of this.clients) {
      if (this.clientMatchesFrame(client, frame)) {
        writeMjpegFrame(client.response, frame);
      }
    }
    return { ok: true };
  }

  attachClient(options: {
    response: ServerResponse;
    deviceId: string | null;
    target: TranscriptTargetId | null;
    requestId: string | null;
  }): boolean {
    const session = this.activeSession;
    if (session?.target !== options.target) {
      return false;
    }

    if (
      (options.deviceId !== null && options.deviceId !== session.deviceId) ||
      (options.requestId !== null && options.requestId !== session.requestId)
    ) {
      return false;
    }

    const client: CompanionLiveFeedClient = {
      response: options.response,
      deviceId: options.deviceId,
      target: options.target,
      requestId: options.requestId,
    };
    options.response.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Connection: "close",
      "Content-Type": `multipart/x-mixed-replace; boundary=${MJPEG_BOUNDARY}`,
      Pragma: "no-cache",
    });
    this.clients.add(client);
    options.response.on("close", () => {
      this.clients.delete(client);
    });
    options.response.on("error", () => {
      this.clients.delete(client);
    });

    const latestFrame = this.latestFrame;
    if (latestFrame !== null && this.clientMatchesFrame(client, latestFrame)) {
      writeMjpegFrame(options.response, latestFrame);
    }
    return true;
  }

  private clientMatchesFrame(client: CompanionLiveFeedClient, frame: CompanionLiveFrame): boolean {
    return (
      (client.deviceId === null || client.deviceId === frame.deviceId) &&
      (client.target === null || client.target === frame.target) &&
      (client.requestId === null || client.requestId === frame.requestId)
    );
  }
}
