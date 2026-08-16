import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { SpawnOptions } from "node:child_process";
import {
  ScrcpySessionManager,
  type ScrcpyChildProcess,
  type ScrcpyUnexpectedCloseEvent,
} from "../../electron/scrcpy-session-manager.ts";
import type { CaptureScrcpyPreviewVideoStatus } from "../../src/types/capture.ts";

const PREVIEW_VIDEO: CaptureScrcpyPreviewVideoStatus = {
  source: "v4l2",
  devicePath: "/dev/video42",
  label: "Hayalet Ev Camera Feed",
  width: 640,
  height: 480,
  fps: 30,
};

class MockScrcpyProcess extends EventEmitter implements ScrcpyChildProcess {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly killedSignals: NodeJS.Signals[] = [];

  kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
    this.killedSignals.push(signal);
    this.signalCode = signal;
    setImmediate(() => {
      this.emitClose(null, signal);
    });
    return true;
  }

  emitClose(exitCode: number | null, signal: NodeJS.Signals | null): void {
    this.exitCode = exitCode;
    this.signalCode = signal;
    this.emit("close", exitCode, signal);
  }
}

function createHarness(options: { scrcpyPath?: string | null } = {}) {
  const spawnCalls: Array<{
    scrcpyPath: string;
    args: string[];
    options: SpawnOptions;
    process: MockScrcpyProcess;
  }> = [];
  const unexpectedCloseEvents: ScrcpyUnexpectedCloseEvent[] = [];
  const manager = new ScrcpySessionManager({
    onUnexpectedClose: (event) => {
      unexpectedCloseEvents.push(event);
    },
    resolveScrcpyPath: async () =>
      Object.prototype.hasOwnProperty.call(options, "scrcpyPath")
        ? (options.scrcpyPath ?? null)
        : "/usr/bin/scrcpy",
    inspectScrcpyVersion: async () => "scrcpy 2.7",
    resolveV4l2Sink: async () => ({
      ok: true,
      previewVideo: PREVIEW_VIDEO,
    }),
    spawnProcess: (scrcpyPath, args, spawnOptions) => {
      const process = new MockScrcpyProcess();
      spawnCalls.push({
        scrcpyPath,
        args: [...args],
        options: spawnOptions,
        process,
      });
      return process;
    },
    getProjectRoot: () => "/repo",
    getSetupHint: () => "sudo modprobe v4l2loopback ...",
    startupGraceMs: 1,
    stopTimeoutMs: 20,
    logLimit: 24,
    cameraSize: "640x480",
    cameraFps: 30,
    v4l2BufferMs: 0,
  });

  return { manager, spawnCalls, unexpectedCloseEvents };
}

void test("ScrcpySessionManager reuses an active camera-feed session for the same device", async () => {
  const { manager, spawnCalls } = createHarness();

  const first = await manager.startCameraFeed({
    deviceId: "device-1",
    target: "analyze-compose",
    requestId: "request-1",
    cameraFacing: "back",
    action: "start-camera-feed",
  });
  assert.equal(first.ok, true);
  assert.equal(first.reused, false);
  assert.equal(spawnCalls.length, 1);
  assert.match(spawnCalls[0]?.args.join(" ") ?? "", /--video-source=camera/);
  assert.match(spawnCalls[0]?.args.join(" ") ?? "", /--no-window/);
  assert.match(spawnCalls[0]?.args.join(" ") ?? "", /--v4l2-sink=\/dev\/video42/);

  const second = await manager.startCameraFeed({
    deviceId: "device-1",
    target: "analyze-compose",
    requestId: "request-2",
    cameraFacing: "back",
    action: "start-camera-feed",
  });

  assert.equal(second.ok, true);
  assert.equal(second.reused, true);
  assert.equal(spawnCalls.length, 1);
});

void test("ScrcpySessionManager switches from camera-feed to native interactive mirror args", async () => {
  const { manager, spawnCalls } = createHarness();

  await manager.startCameraFeed({
    deviceId: "device-1",
    target: "analyze-compose",
    requestId: "request-1",
    cameraFacing: "front",
    action: "start-camera-feed",
  });
  const cameraProcess = spawnCalls[0]?.process;
  assert.ok(cameraProcess);

  const mirror = await manager.startInteractiveMirror({
    deviceId: "device-1",
    target: "room:android-game-dev",
    requestId: "request-2",
    action: "start-interactive-mirror",
  });

  assert.equal(mirror.ok, true);
  assert.equal(cameraProcess.killedSignals[0], "SIGTERM");
  assert.equal(spawnCalls.length, 2);
  assert.deepEqual(spawnCalls[1]?.args, ["--serial", "device-1"]);
  const mirrorArgs = spawnCalls[1].args.join(" ");
  assert.doesNotMatch(mirrorArgs, /--video-source=camera/);
  assert.doesNotMatch(mirrorArgs, /--v4l2-sink/);
  assert.doesNotMatch(mirrorArgs, /--no-window/);
});

void test("ScrcpySessionManager preserves logs and reports unexpected close failures", async () => {
  const { manager, spawnCalls, unexpectedCloseEvents } = createHarness();

  await manager.startCameraFeed({
    deviceId: "device-1",
    target: "analyze-compose",
    requestId: "request-1",
    cameraFacing: "back",
    action: "start-camera-feed",
  });
  const process = spawnCalls[0]?.process;
  assert.ok(process);

  process.stderr.emit("data", "INFO camera attached\nERROR camera busy\n");
  process.emitClose(1, null);

  assert.equal(unexpectedCloseEvents.length, 1);
  assert.equal(unexpectedCloseEvents[0]?.message, "ERROR camera busy");
  assert.deepEqual(unexpectedCloseEvents[0].logs, ["INFO camera attached", "ERROR camera busy"]);

  const status = await manager.getStatus();
  assert.equal(status.activeSession, null);
  assert.equal(status.lastError, "ERROR camera busy");
  assert.deepEqual(status.lastLogs, ["INFO camera attached", "ERROR camera busy"]);
});

void test("ScrcpySessionManager reports missing scrcpy without spawning a process", async () => {
  const { manager, spawnCalls } = createHarness({ scrcpyPath: null });

  const outcome = await manager.startInteractiveMirror({
    deviceId: "device-1",
    target: "room:android-game-dev",
    requestId: "request-1",
    action: "start-interactive-mirror",
  });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.message, "scrcpy is not available on PATH.");
  assert.equal(spawnCalls.length, 0);

  const status = await manager.getStatus();
  assert.equal(status.available, false);
  assert.equal(status.lastError, "scrcpy is not available on PATH.");
});
