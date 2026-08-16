import assert from "node:assert/strict";
import test from "node:test";

import { SlotStateMachine, SlotStates } from "../../src/js/modules/slot/state-machine.ts";

void test("allows connecting to disconnecting transition for cancellation", () => {
  const machine = new SlotStateMachine("ai0", SlotStates.CONNECTING);

  const result = machine.transition(SlotStates.DISCONNECTING, {
    reason: "cancel-connect",
  });

  assert.equal(result.success, true);
  assert.equal(machine.state, SlotStates.DISCONNECTING);
});

void test("allows connecting to assigned transition after cancellation", () => {
  const machine = new SlotStateMachine("ai0", SlotStates.CONNECTING);

  const result = machine.transition(SlotStates.ASSIGNED, {
    reason: "cancel-complete",
  });

  assert.equal(result.success, true);
  assert.equal(machine.state, SlotStates.ASSIGNED);
});

void test("blocks invalid empty to connected transition", () => {
  const machine = new SlotStateMachine("ai0", SlotStates.EMPTY);

  const result = machine.transition(SlotStates.CONNECTED, {
    reason: "invalid-hop",
  });

  assert.equal(result.success, false);
  assert.equal(machine.state, SlotStates.EMPTY);
});
