import assert from "node:assert/strict";
import test from "node:test";

import { AppState } from "../../src/js/modules/app-state.ts";
import { ProtocolHandler } from "../../src/js/modules/protocol-handler.ts";
import { SlotController, SlotState } from "../../src/js/modules/slot-controller.ts";

void test("user-ai-ai-stop payload stays header-only by omitting protocolKey", () => {
  const originalGetState = SlotController.getState;
  const originalIsAssigned = AppState.isAssigned;

  try {
    AppState.isAssigned = () => true;
    SlotController.getState = () => {
      return {
        state: SlotState.CONNECTED,
        urlExcluded: false,
      } as unknown as ReturnType<typeof SlotController.getState>;
    };

    const payload = ProtocolHandler.buildPayload({
      room: "analyze",
      scenario: "user-ai-ai-stop",
      targets: ["ai1", "ai2"],
    });

    assert.ok(payload !== null);
    assert.equal(payload.message, "[STOP][ANALYZE][USER-AI-AI]");
    assert.equal(payload.protocolKey, undefined);
    assert.deepEqual(payload.targets, ["ai1", "ai2"]);
  } finally {
    SlotController.getState = originalGetState;
    AppState.isAssigned = originalIsAssigned;
  }
});

void test("ai-assistant-stop payload is produced without protocol body key", () => {
  const originalGetState = SlotController.getState;
  const originalIsAssigned = AppState.isAssigned;

  try {
    AppState.isAssigned = () => true;
    SlotController.getState = () => {
      return {
        state: SlotState.CONNECTED,
        urlExcluded: false,
      } as unknown as ReturnType<typeof SlotController.getState>;
    };

    const payload = ProtocolHandler.buildPayload({
      room: "analyze",
      scenario: "ai-assistant-stop",
      targets: ["ai1"],
    });

    assert.ok(payload !== null);
    assert.equal(payload.message, "[STOP][ANALYZE][AI-ASSISTANT]");
    assert.equal(payload.protocolKey, undefined);
    assert.deepEqual(payload.targets, ["ai1"]);
  } finally {
    SlotController.getState = originalGetState;
    AppState.isAssigned = originalIsAssigned;
  }
});

void test("user-ai-ai start payload uses unified start header format", () => {
  const originalGetState = SlotController.getState;
  const originalIsAssigned = AppState.isAssigned;

  try {
    AppState.isAssigned = () => true;
    SlotController.getState = () => {
      return {
        state: SlotState.CONNECTED,
        urlExcluded: false,
      } as unknown as ReturnType<typeof SlotController.getState>;
    };

    const payload = ProtocolHandler.buildPayload({
      room: "analyze",
      scenario: "user-ai-ai",
      targets: ["ai1", "ai2"],
    });

    assert.ok(payload !== null);
    assert.equal(payload.message, "[START][ANALYZE][USER-AI-AI]");
    assert.equal(payload.protocolKey, "analyze-user-AI-AI");
  } finally {
    SlotController.getState = originalGetState;
    AppState.isAssigned = originalIsAssigned;
  }
});
