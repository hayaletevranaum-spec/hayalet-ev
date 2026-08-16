import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import createForgeRoomHostRuntime from "../../rooms/forge-room/host/runtime.ts";

type ForgeNotification = {
  payload: Record<string, unknown>;
  type: string;
};

type ForgeSnapshot = {
  activeSessionId: string | null;
  conflicts: Array<{ id: string }>;
  exports: Array<{ filePath: string }>;
  preflight: {
    status: string;
  };
  responses: Array<{ id: string }>;
  runOverride: {
    architectSeatId?: "ai2";
    enableRovoPreAnalysis: boolean;
    notes: string;
    temporaryConditions: string[];
  } | null;
  runSignature: {
    value: string;
  } | null;
  selectedSynthesisId: string | null;
  sessionContextSelection: {
    preferences: { mode: boolean };
    skill: { measurement: boolean };
    tools: { multimeter: boolean };
    skillKeys: string[];
    equipmentKeys: string[];
    preferenceKeys: string[];
  };
  syntheses: Array<{
    id: string;
    provenance?: {
      operatorProfileSummary?: string[];
      preflightWarnings?: string[];
      runSignature?: string | null;
    } | null;
    status: string;
  }>;
};

function encodeBase64Text(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

function createElectronApi(storageDir: string) {
  return {
    async fmWriteFileAtomic(payload: { data: string; path: string }) {
      await mkdir(dirname(payload.path), { recursive: true });
      await writeFile(payload.path, payload.data, "utf8");
      return {
        success: true,
        path: payload.path,
      };
    },
    async readDirectoryFiles(dirPath: string) {
      try {
        const entries = await readdir(dirPath, { withFileTypes: true });
        return entries.map((entry) => ({
          isDirectory: entry.isDirectory(),
          name: entry.name,
          path: join(dirPath, entry.name),
        }));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return [];
        }
        throw error;
      }
    },
    async readFile(filePath: string) {
      try {
        return encodeBase64Text(await readFile(filePath, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        throw error;
      }
    },
    async roomToolsCall(request: { operation: string; targetPath?: string }) {
      if (request.operation === "resolve-paths") {
        return {
          success: true,
          paths: {
            storageDir,
          },
        };
      }
      if (request.operation === "ensure-dir") {
        if (typeof request.targetPath !== "string") {
          return {
            success: false,
            error: "targetPath is required",
          };
        }
        await mkdir(request.targetPath, { recursive: true });
        return {
          success: true,
        };
      }
      return {
        success: false,
        error: `Unsupported room tool operation: ${request.operation}`,
      };
    },
  };
}

function createDispatchBridge(dispatchCalls: Array<Record<string, unknown>>) {
  return async (payload: Record<string, unknown>) => {
    dispatchCalls.push(payload);
    const protocol = (payload["payload"] as { protocol?: { protocolKey?: string } } | undefined)
      ?.protocol;
    const protocolKey = protocol?.protocolKey;
    if (protocolKey === "forge-room-breakdown-architect") {
      return {
        success: true,
        reply: {
          text: JSON.stringify({
            acceptanceCriteria: ["Repair Room can read the exported handoff JSON."],
            tasks: [
              {
                title: "Frame repair boundary",
                summary: "Define the minimal Repair Room handoff seam.",
                dispatchMode: "compare",
                seatId: "ai1",
                roleId: "architect",
                compareSeatIds: ["ai2"],
                personaPresetId: "rovo",
                checklist: ["List the export contract fields"],
              },
              {
                title: "Review runtime fit",
                summary: "Check the room-local execution constraints.",
                dispatchMode: "single-owner",
                seatId: "us1",
                roleId: "external-perspective",
                personaPresetId: "gok",
                checklist: [],
              },
              {
                title: "Prepare export package",
                summary: "Shape the final Repair Room handoff payload.",
                dispatchMode: "single-owner",
                seatId: "ai1",
                roleId: "architect",
                dependsOnTaskTitles: ["Frame repair boundary"],
                checklist: [],
              },
            ],
          }),
          provider: "forge-test",
          messageId: "breakdown-message-1",
          conversationId: "breakdown-conversation-1",
        },
        session: {
          id: "breakdown-session-1",
          conversationId: "breakdown-conversation-1",
        },
      };
    }
    if (protocolKey === "forge-room-task-response") {
      const toSlot = payload["toSlot"];
      if (toSlot === "ai1") {
        return {
          success: true,
          reply: {
            text: JSON.stringify({
              summary: "Keep the handoff JSON local and explicit.",
              body: "Use a room-local JSON export and keep the Repair Room intake narrow.",
              artifacts: [],
            }),
            provider: "forge-test",
            messageId: "task-message-ai1",
            conversationId: "task-conversation-ai1",
          },
          session: {
            id: "task-session-ai1",
            conversationId: "task-conversation-ai1",
          },
        };
      }
      if (toSlot === "ai2") {
        return {
          success: true,
          reply: {
            text: JSON.stringify({
              summary: "Document risks before implementation starts.",
              body: "Keep scope minimal, but call out validation and regression risk up front.",
              artifacts: [],
            }),
            provider: "forge-test",
            messageId: "task-message-ai2",
            conversationId: "task-conversation-ai2",
          },
          session: {
            id: "task-session-ai2",
            conversationId: "task-conversation-ai2",
          },
        };
      }
      return {
        success: true,
        reply: {
          text: JSON.stringify({
            summary: "The remote perspective validates the export contract.",
            body: "Keep the handoff readable, explicit, and easy to import downstream.",
            artifacts: [],
          }),
          provider: "forge-test",
          messageId: "task-message-us1",
          conversationId: "task-conversation-us1",
        },
        session: {
          id: "task-session-us1",
          conversationId: "task-conversation-us1",
        },
      };
    }
    if (protocolKey === "forge-room-synthesis") {
      const promptText = String((payload["payload"] as { text?: string } | undefined)?.text ?? "");
      const responseIds = Array.from(promptText.matchAll(/responseId:\s+([a-z0-9-]+)/gi)).map(
        (match) => match[1]
      );
      const conflictIds = Array.from(promptText.matchAll(/conflictId:\s+([a-z0-9-]+)/gi)).map(
        (match) => match[1]
      );
      return {
        success: true,
        reply: {
          text: JSON.stringify({
            summary: "Selected Forge synthesis",
            body: "Combine the practical export seam with explicit risk notes for Repair Room intake.",
            selectedResponseIds: responseIds.slice(0, 2),
            unresolvedConflictIds: conflictIds,
            acceptanceCriteria: ["Repair Room can read the exported handoff JSON."],
            openQuestions: ["Should Repair Room keep the import boundary manual in v1?"],
          }),
          provider: "forge-test",
          messageId: "synthesis-message-1",
          conversationId: "synthesis-conversation-1",
        },
        session: {
          id: "synthesis-session-1",
          conversationId: "synthesis-conversation-1",
        },
      };
    }
    return {
      success: false,
      message: `Unhandled protocol: ${String(protocolKey)}`,
    };
  };
}

function latestForgeSnapshot(notifications: ForgeNotification[]): ForgeSnapshot {
  const snapshot = notifications
    .filter((entry) => entry.type === "forge-state")
    .at(-1)?.payload["snapshot"];
  return snapshot as ForgeSnapshot;
}

void test("forge-room host runtime runs breakdown, dispatch, synthesis, export, and reopen through the live room-local flow", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "forge-room-host-flow-"));
  const notifications: ForgeNotification[] = [];
  const hostState = new Map<string, unknown>();
  const dispatchCalls: Array<Record<string, unknown>> = [];
  const electronApi = createElectronApi(storageDir);
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      electronAPI: electronApi,
    },
  });

  try {
    const hostRuntime = createForgeRoomHostRuntime().activate({
      dispatchBridge: createDispatchBridge(dispatchCalls),
      getLocale() {
        return "tr";
      },
      getState(key: string) {
        return hostState.get(key);
      },
      log() {
        return undefined;
      },
      notifyRoom(type: string, payload: Record<string, unknown> = {}) {
        notifications.push({
          type,
          payload,
        });
      },
      setState(key: string, value: unknown) {
        hostState.set(key, value);
        return value;
      },
    });

    const createResult = await (hostRuntime.commands["ForgeRoomCreateSession"]! as unknown as (...args: unknown[]) => Record<string, unknown>)();
    assert.equal(createResult["success"], true);

    const addRunOverrideResult = await (hostRuntime.commands["ForgeRoomUpdateRunOverride"]! as unknown as (...args: unknown[]) => Record<string, unknown>)({
      notes: "Bench is borrowed for this run.",
      temporaryConditions: ["borrowed microscope"],
    });
    assert.equal(addRunOverrideResult["success"], true);
    const snapshotAfterRunOverride = latestForgeSnapshot(notifications);
    assert.deepEqual(snapshotAfterRunOverride.runOverride, {
      enableRovoPreAnalysis: false,
      notes: "Bench is borrowed for this run.",
      temporaryConditions: ["borrowed microscope"],
    });

    const clearRunOverrideResult = await (hostRuntime.commands["ForgeRoomUpdateRunOverride"]! as unknown as (...args: unknown[]) => Record<string, unknown>)({
      notes: "",
      temporaryConditions: [],
    });
    assert.equal(clearRunOverrideResult["success"], true);
    const snapshotAfterRunOverrideClear = latestForgeSnapshot(notifications);
    assert.equal(snapshotAfterRunOverrideClear.runOverride, null);

    const updateOperatorProfileResult = await (hostRuntime.commands["ForgeRoomUpdateOperatorProfile"]! as unknown as (...args: unknown[]) => Record<string, unknown>)({
      skills: [{ skillKey: "measurement", level: "basic" }],
      equipment: [{ equipmentKey: "multimeter", status: "unavailable" }],
      preferences: {
        mode: "learn_first",
      },
    });
    assert.equal(updateOperatorProfileResult["success"], true);

    const architectSeatResult = await (hostRuntime.commands["ForgeRoomUpdateRunOverride"]! as unknown as (...args: unknown[]) => Record<string, unknown>)({
      architectSeatId: "ai2",
    });
    assert.equal(architectSeatResult["success"], true);
    const snapshotAfterArchitectSeat = latestForgeSnapshot(notifications);
    assert.deepEqual(snapshotAfterArchitectSeat.runOverride, {
      architectSeatId: "ai2",
      enableRovoPreAnalysis: false,
      notes: "",
      temporaryConditions: [],
    });

    const updateSessionContextResult = await (hostRuntime.commands["ForgeRoomUpdateSessionContext"]! as unknown as (...args: unknown[]) => Record<string, unknown>)({
      skillKeys: ["measurement"],
      equipmentKeys: ["multimeter"],
      preferenceKeys: ["mode"],
    });
    assert.equal(updateSessionContextResult["success"], true);

    const snapshotAfterSessionContext = latestForgeSnapshot(notifications);
    assert.deepEqual(snapshotAfterSessionContext.sessionContextSelection.skillKeys, ["measurement"]);
    assert.deepEqual(snapshotAfterSessionContext.sessionContextSelection.equipmentKeys, ["multimeter"]);
    assert.deepEqual(snapshotAfterSessionContext.sessionContextSelection.preferenceKeys, ["mode"]);
    assert.equal(snapshotAfterSessionContext.preflight.status, "idle");
    assert.equal(snapshotAfterSessionContext.runSignature, null);

    const draftResult = await (hostRuntime.commands["ForgeRoomGenerateDraft"]! as unknown as (...args: unknown[]) => Record<string, unknown>)({
      architectSeatId: "ai2",
      summary: "Repair Room integration",
      brief: "Drive the first Forge Room handoff into Repair Room.",
      constraints: ["Keep orchestration room-local."],
      targetRoomId: "repair-room",
    });
    assert.equal(draftResult["success"], true);
    assert.equal(
      dispatchCalls.filter(
        (call) =>
          (call["payload"] as { protocol?: { protocolKey?: string } } | undefined)?.protocol
            ?.protocolKey === "forge-room-preflight-pre-analysis"
      ).length,
      0
    );
    const snapshotAfterDraftGeneration = latestForgeSnapshot(notifications);
    assert.equal(snapshotAfterDraftGeneration.preflight.status, "idle");
    const breakdownDispatch = dispatchCalls.find(
      (call) =>
        (call["payload"] as { protocol?: { protocolKey?: string } } | undefined)?.protocol
          ?.protocolKey === "forge-room-breakdown-architect"
    );
    assert.equal(breakdownDispatch?.["toSlot"], "ai2");
    assert.match(
      String((breakdownDispatch["payload"] as { text?: string } | undefined)?.text ?? ""),
      /Use Turkish for every human-readable JSON string value\./
    );

    const runPreflightResult = await (hostRuntime.commands["ForgeRoomRunPreflight"]! as unknown as (...args: unknown[]) => Record<string, unknown>)();
    assert.equal(runPreflightResult["success"], true);
    const preflightDispatchCalls = dispatchCalls.filter(
      (call) =>
        (call["payload"] as { protocol?: { protocolKey?: string } } | undefined)?.protocol
          ?.protocolKey === "forge-room-preflight-pre-analysis"
    );
    assert.ok(preflightDispatchCalls.length >= 1);
    const preflightDispatchCountAfterManualRun = preflightDispatchCalls.length;

    const snapshotAfterDraft = latestForgeSnapshot(notifications);
    assert.notEqual(snapshotAfterDraft.preflight.status, "idle");
    assert.equal(snapshotAfterDraft.responses.length, 0);
    assert.match(snapshotAfterDraft.runSignature?.value ?? "", /learn[_-]first/);

    const forgeStateCountAfterPreflight = notifications.filter(
      (entry) => entry.type === "forge-state"
    ).length;
    const noOpSessionContextResult = await (hostRuntime.commands["ForgeRoomUpdateSessionContext"]! as unknown as (...args: unknown[]) => Record<string, unknown>)({
      skillKeys: ["measurement"],
      equipmentKeys: ["multimeter"],
      preferenceKeys: ["mode"],
    });
    assert.equal(noOpSessionContextResult["success"], true);
    assert.equal(
      notifications.filter((entry) => entry.type === "forge-state").length,
      forgeStateCountAfterPreflight
    );

    const approvedTaskId = (
      notifications.filter((entry) => entry.type === "forge-state").at(-1)?.payload["snapshot"] as {
        draftTasks: Array<{ id: string; level: number }>;
      }
    ).draftTasks.find((task) => task.level === 1)?.id;
    assert.ok(approvedTaskId != null);

    const approveResult = await (hostRuntime.commands["ForgeRoomApproveDraft"]! as unknown as (...args: unknown[]) => Record<string, unknown>)();
    assert.equal(approveResult["success"], true);

    const updateApprovedResult = await (hostRuntime.commands["ForgeRoomUpdateApprovedTask"]! as unknown as (...args: unknown[]) => Record<string, unknown>)({
      taskId: approvedTaskId,
      seatId: "ai1",
      roleId: "architect",
      dispatchMode: "compare",
      compareSeatIds: ["ai2"],
      personaPresetId: "rovo",
    });
    assert.equal(updateApprovedResult["success"], true);

    const dispatchResult = await (hostRuntime.commands["ForgeRoomDispatchAssignments"]! as unknown as (...args: unknown[]) => Record<string, unknown>)();
    assert.equal(dispatchResult["success"], true);
    assert.ok((dispatchResult["completedAssignments"] as number) >= 3);
    const taskDispatches = dispatchCalls.filter(
      (call) =>
        (call["payload"] as { protocol?: { protocolKey?: string } } | undefined)?.protocol
          ?.protocolKey === "forge-room-task-response"
    );
    assert.ok(taskDispatches.length >= 3);
    taskDispatches.forEach((call) => {
      assert.match(
        String((call["payload"] as { text?: string } | undefined)?.text ?? ""),
        /Use Turkish for every human-readable JSON string value\./
      );
    });
    assert.equal(
      dispatchCalls.filter(
        (call) =>
          (call["payload"] as { protocol?: { protocolKey?: string } } | undefined)?.protocol
            ?.protocolKey === "forge-room-preflight-pre-analysis"
      ).length,
      preflightDispatchCountAfterManualRun
    );

    const snapshotAfterDispatch = latestForgeSnapshot(notifications);
    const conflictId = snapshotAfterDispatch.conflicts[0]?.id;
    const preferredResponseId = snapshotAfterDispatch.responses[0]?.id;
    assert.ok(conflictId != null);
    assert.ok(preferredResponseId != null);

    const preferResult = await (hostRuntime.commands["ForgeRoomResolveConflict"]! as unknown as (...args: unknown[]) => Record<string, unknown>)({
      conflictId,
      preferredResponseId,
      status: "open",
    });
    assert.equal(preferResult["success"], true);

    const resolveResult = await (hostRuntime.commands["ForgeRoomResolveConflict"]! as unknown as (...args: unknown[]) => Record<string, unknown>)({
      conflictId,
      status: "resolved",
    });
    assert.equal(resolveResult["success"], true);

    const synthesisResult = await (hostRuntime.commands["ForgeRoomGenerateSynthesis"]! as unknown as (...args: unknown[]) => Record<string, unknown>)();
    assert.equal(synthesisResult["success"], true);
    const synthesisDispatch = dispatchCalls.findLast(
      (call) =>
        (call["payload"] as { protocol?: { protocolKey?: string } } | undefined)?.protocol
          ?.protocolKey === "forge-room-synthesis"
    );
    assert.match(
      String((synthesisDispatch?.["payload"] as { text?: string } | undefined)?.text ?? ""),
      /Use Turkish for every human-readable JSON string value\./
    );
    assert.equal(
      dispatchCalls.filter(
        (call) =>
          (call["payload"] as { protocol?: { protocolKey?: string } } | undefined)?.protocol
            ?.protocolKey === "forge-room-preflight-pre-analysis"
      ).length,
      preflightDispatchCountAfterManualRun
    );
    const snapshotAfterSynthesis = latestForgeSnapshot(notifications);
    const selectedSynthesis = snapshotAfterSynthesis.syntheses.find(
      (entry) => entry.id === synthesisResult["synthesisId"]
    );
    assert.ok(selectedSynthesis?.provenance);
    assert.equal(typeof selectedSynthesis.provenance.runSignature, "string");

    const exportCheckResult = await (hostRuntime.commands["ForgeRoomExportHandoffCheck"]! as unknown as (...args: unknown[]) => Record<string, unknown>)();
    assert.equal(exportCheckResult["success"], true);

    const exportResult = await (hostRuntime.commands["ForgeRoomExportHandoff"]! as unknown as (...args: unknown[]) => Record<string, unknown>)();
    assert.equal(exportResult["success"], true);
    assert.ok(typeof exportResult["filePath"] === "string");

    const exportedJson = JSON.parse(await readFile(String(exportResult["filePath"]), "utf8")) as {
      contextSummary?: {
        operatorProfileSummary?: string[];
        preflightWarnings?: string[];
      };
      runSignature?: string;
      selectedSynthesis: { id: string };
      targetRoomId: string;
    };
    assert.equal(exportedJson.targetRoomId, "repair-room");
    assert.equal(exportedJson.selectedSynthesis.id, synthesisResult["synthesisId"]);
    assert.equal(exportedJson.runSignature, selectedSynthesis.provenance.runSignature);
    assert.deepEqual(exportedJson.contextSummary?.operatorProfileSummary, [
      "Selected skills: Measurement (basic).",
      "Unavailable equipment: Multimeter.",
      "Preferences: Mode learn first.",
      "Session-specific: Draft architect AI2.",
    ]);

    const sessionId = String(createResult["sessionId"]);
    const sessionPath = join(storageDir, "sessions", sessionId, "session.json");
    const savedSession = JSON.parse(await readFile(sessionPath, "utf8")) as {
      conflicts: Array<{ preferredResponseId: string | null; status: string }>;
      exports: Array<{ filePath: string }>;
      responses: Array<{ id: string }>;
      runOverride: {
        architectSeatId?: "ai2";
        enableRovoPreAnalysis: boolean;
        notes: string;
        temporaryConditions: string[];
      } | null;
      sessionContextSelection: {
        equipmentKeys: string[];
        preferenceKeys: string[];
        skillKeys: string[];
      };
      selectedSynthesisId: string | null;
    };
    assert.equal(savedSession.responses.length >= 3, true);
    assert.equal(savedSession.selectedSynthesisId, synthesisResult["synthesisId"]);
    assert.equal(savedSession.conflicts[0]?.status, "resolved");
    assert.equal(savedSession.conflicts[0].preferredResponseId, preferredResponseId);
    assert.equal(savedSession.exports.length, 1);
    assert.deepEqual(savedSession.runOverride, {
      architectSeatId: "ai2",
      enableRovoPreAnalysis: false,
      notes: "",
      temporaryConditions: [],
    });
    assert.deepEqual(savedSession.sessionContextSelection.skillKeys, ["measurement"]);
    assert.deepEqual(savedSession.sessionContextSelection.equipmentKeys, ["multimeter"]);
    assert.deepEqual(savedSession.sessionContextSelection.preferenceKeys, ["mode"]);

    const reopenNotifications: ForgeNotification[] = [];
    const reopenedRuntime = createForgeRoomHostRuntime().activate({
      dispatchBridge: createDispatchBridge(dispatchCalls),
      getLocale() {
        return "tr";
      },
      getState(key: string) {
        return hostState.get(key);
      },
      log() {
        return undefined;
      },
      notifyRoom(type: string, payload: Record<string, unknown> = {}) {
        reopenNotifications.push({
          type,
          payload,
        });
      },
      setState(key: string, value: unknown) {
        hostState.set(key, value);
        return value;
      },
    });
    const loadResult = await (reopenedRuntime.commands["ForgeRoomLoadLatestSession"]! as unknown as (...args: unknown[]) => Record<string, unknown>)();
    assert.equal(loadResult["success"], true);
    const reopenedSnapshot = latestForgeSnapshot(reopenNotifications);
    assert.equal(reopenedSnapshot.selectedSynthesisId, synthesisResult["synthesisId"]);
    assert.equal(reopenedSnapshot.exports.length, 1);
    assert.equal(reopenedSnapshot.responses.length >= 3, true);
    assert.equal(reopenedSnapshot.conflicts.length >= 1, true);
    assert.deepEqual(reopenedSnapshot.sessionContextSelection.skillKeys, ["measurement"]);
    assert.deepEqual(reopenedSnapshot.sessionContextSelection.equipmentKeys, ["multimeter"]);
    assert.deepEqual(reopenedSnapshot.sessionContextSelection.preferenceKeys, ["mode"]);

    const reopenedConflictId = reopenedSnapshot.conflicts[0]?.id;
    assert.ok(reopenedConflictId != null);
    const reopenConflictResult = await (reopenedRuntime.commands["ForgeRoomResolveConflict"]! as unknown as (...args: unknown[]) => Record<string, unknown>)({
      conflictId: reopenedConflictId,
      status: "open",
    });
    assert.equal(reopenConflictResult["success"], true);
    const snapshotAfterConflictReopen = latestForgeSnapshot(reopenNotifications);
    assert.equal(snapshotAfterConflictReopen.exports.length, 1);
    assert.equal(snapshotAfterConflictReopen.selectedSynthesisId, null);

    const protocolKeys = dispatchCalls.map(
      (call) =>
        (call["payload"] as { protocol?: { protocolKey?: string } } | undefined)?.protocol
          ?.protocolKey ?? null
    );
    assert.ok(protocolKeys.includes("forge-room-breakdown-architect"));
    assert.ok(protocolKeys.includes("forge-room-task-response"));
    assert.ok(protocolKeys.includes("forge-room-synthesis"));
  } finally {
    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
    await rm(storageDir, { recursive: true, force: true });
  }
});
