import assert from "node:assert/strict";
import test from "node:test";

import { ConnectButtonState } from "../../src/types/assistant.ts";
import { resolveAssistantConnectButtonState } from "../../src/js/pages/assistant/connect-flow.ts";

void test("returns cancel state while slot is connecting", () => {
  const state = resolveAssistantConnectButtonState({
    slotState: "connecting",
    isServerRunning: false,
    connectFlowActive: false,
  });

  assert.equal(state, ConnectButtonState.CANCEL_CONNECTING);
});

void test("returns cancel state while custom connect flow is active", () => {
  const state = resolveAssistantConnectButtonState({
    slotState: "assigned",
    isServerRunning: false,
    connectFlowActive: true,
  });

  assert.equal(state, ConnectButtonState.CANCEL_CONNECTING);
});

void test("returns connected state when server is running", () => {
  const state = resolveAssistantConnectButtonState({
    slotState: "assigned",
    isServerRunning: true,
    connectFlowActive: false,
  });

  assert.equal(state, ConnectButtonState.CONNECTED);
});

void test("keeps cancel state while connect flow is active even if server is running", () => {
  const state = resolveAssistantConnectButtonState({
    slotState: "connected",
    isServerRunning: true,
    connectFlowActive: true,
  });

  assert.equal(state, ConnectButtonState.CANCEL_CONNECTING);
});

void test("returns idle when not connecting and server is passive", () => {
  const state = resolveAssistantConnectButtonState({
    slotState: "assigned",
    isServerRunning: false,
    connectFlowActive: false,
  });

  assert.equal(state, ConnectButtonState.IDLE);
});
