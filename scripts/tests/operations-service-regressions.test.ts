import test from "node:test";
import assert from "node:assert/strict";
import { OperationsService } from "../../electron/operations-service.ts";

const repairRoom = {
  id: "repair-room",
  label: "Repair Room",
  roomId: "repair",
};

const analyzeRoom = {
  id: "analyze-room",
  label: "Analyze Room",
  roomId: "analyze",
};

void test("operations service allows one owner per capability", () => {
  const service = new OperationsService();
  const first = service.acquire("local-microphone", repairRoom);
  assert.equal(first.success, true);

  const second = service.acquire("local-microphone", analyzeRoom);
  assert.equal(second.success, false);
  assert.equal(second.conflict?.owner.id, repairRoom.id);
});

void test("operations service only releases resources for the active owner", () => {
  const service = new OperationsService();
  service.acquire("android-camera", repairRoom);

  const rejected = service.release("android-camera", analyzeRoom);
  assert.equal(rejected.success, false);
  assert.equal(service.getStatus().records.length, 1);

  const released = service.release("android-camera", repairRoom);
  assert.equal(released.success, true);
  assert.equal(released.released, true);
  assert.equal(service.getStatus().records.length, 0);
});

void test("operations service treats repeated acquire by the same owner as idempotent", () => {
  const service = new OperationsService();
  const first = service.acquire("local-tts", repairRoom);
  const second = service.acquire("local-tts", repairRoom);

  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(service.getStatus().records.length, 1);
});

void test("operations service reports invalid requests without changing state", () => {
  const service = new OperationsService();

  const invalidCapability = service.acquire("camera", repairRoom);
  assert.equal(invalidCapability.success, false);

  const invalidOwner = service.acquire("live-feed", { id: "", label: "" });
  assert.equal(invalidOwner.success, false);
  assert.deepEqual(service.getStatus().records, []);
});
