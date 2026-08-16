import test from "node:test";
import assert from "node:assert/strict";

import { createLaboratoryJobRuntime } from "../../rooms/laboratory/shared/host/job-runtime.ts";

function toRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

void test("laboratory host treats preview/apply edit jobs as action-scoped slots", () => {
  const jobRuntime = createLaboratoryJobRuntime({
    roomId: "laboratory",
    toRecord,
    cancelRoomTool: async () => null,
    clearJob() {},
    pushJobState() {},
  });
  const runtime = {
    jobs: {
      previewJob: {
        requestId: "req-preview",
        action: "edit-preview",
        projectId: "project-1",
      },
      applyJob: {
        requestId: "req-apply",
        action: "edit-apply",
        projectId: "project-1",
      },
    },
  };

  assert.throws(() => {
    jobRuntime.ensureEditJobSlotAvailable(runtime, "project-1", "edit-preview");
  }, /already running/i);

  assert.throws(() => {
    jobRuntime.ensureEditJobSlotAvailable(runtime, "project-1", "edit-apply");
  }, /already running/i);

  assert.doesNotThrow(() => {
    jobRuntime.ensureEditJobSlotAvailable(
      {
        jobs: {
          applyOnly: runtime.jobs.applyJob,
        },
      },
      "project-1",
      "edit-preview"
    );
  });
});
