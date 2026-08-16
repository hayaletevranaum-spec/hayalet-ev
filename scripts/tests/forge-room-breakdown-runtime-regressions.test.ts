import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeForgeBreakdownDraft,
  parseForgeBreakdownDraft,
} from "../../rooms/forge-room/host/forge-breakdown-runtime.ts";

void test("forge-room breakdown runtime parses and normalizes a valid draft payload", () => {
  const parsed = parseForgeBreakdownDraft(
    JSON.stringify({
      acceptanceCriteria: ["Repair Room can import the handoff package."],
      tasks: [
        {
          title: "Frame the seam",
          summary: "Define the Forge to Repair boundary.",
          dispatchMode: "single-owner",
          seatId: "ai1",
          roleId: "architect",
          checklist: ["Map the handoff fields"],
        },
        {
          title: "Compare dispatch paths",
          summary: "Gather competing implementation options.",
          dispatchMode: "compare",
          seatId: "ai1",
          roleId: "architect",
          compareSeatIds: ["ai2"],
          dependsOnTaskTitles: ["Frame the seam"],
          checklist: [],
        },
        {
          title: "Prepare export package",
          summary: "Shape the final Repair Room handoff payload.",
          dispatchMode: "single-owner",
          seatId: "us1",
          roleId: "external-perspective",
          dependsOnTaskTitles: ["Compare dispatch paths"],
          checklist: [],
        },
      ],
    })
  );

  assert.deepEqual(parsed.validationMessages, []);
  assert.equal(parsed.payload?.tasks.length, 3);

  const normalized = normalizeForgeBreakdownDraft(parsed.payload);
  assert.equal(normalized.draftTasks.filter((task) => task.level === 1).length, 3);
  assert.equal(normalized.draftTasks.filter((task) => task.level === 2).length, 1);
  assert.equal(normalized.acceptanceCriteria[0], "Repair Room can import the handoff package.");
});

void test("forge-room breakdown runtime rejects drafts outside the 3-7 task budget", () => {
  const parsed = parseForgeBreakdownDraft(
    JSON.stringify({
      tasks: [
        {
          title: "One",
          summary: "A",
          dispatchMode: "single-owner",
          seatId: "ai1",
          roleId: "architect",
        },
        {
          title: "Two",
          summary: "B",
          dispatchMode: "single-owner",
          seatId: "ai1",
          roleId: "architect",
        },
      ],
    })
  );

  assert.match(parsed.validationMessages.join(" "), /3 to 7 top-level tasks/i);
});
