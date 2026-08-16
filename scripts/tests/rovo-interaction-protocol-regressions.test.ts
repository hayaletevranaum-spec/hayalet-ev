import assert from "node:assert/strict";
import test from "node:test";
import {
  appendRovoInteractionToken,
  encodeRovoInteractionToken,
  parseRovoInteraction,
} from "../../src/js/modules/rovo-interactions/parser.ts";
import { loadRovoInteractionActivationSnapshot } from "../../src/js/modules/rovo-interactions/activation.ts";
import {
  buildPlanHarderLocalReply,
  findMissingRequiredPlanQuestions,
} from "../../src/js/modules/rovo-interactions/reply-builder.ts";
import type { RovoInteractionPayload, RovoPlanHarderLocalPayload } from "../../src/js/modules/rovo-interactions/types.ts";

async function withMockWindow<T>(
  electronApi: Record<string, unknown>,
  run: () => Promise<T> | T
): Promise<T> {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: { electronAPI: electronApi },
  });

  return await Promise.resolve(run()).finally(() => {
    if (originalDescriptor == null) {
      Reflect.deleteProperty(globalThis, "window");
      return;
    }

    Object.defineProperty(globalThis, "window", originalDescriptor);
  });
}

function createPlanPayload(): RovoPlanHarderLocalPayload {
  return {
    id: "plan-intake-card",
    version: 1,
    type: "plan-harder-local",
    title: "Plan Harder Local",
    fallbackText: "Plan intake fallback text",
    body: "Sorulari burada cevapla.",
    responseTitle: "Plan Intake",
    responsePreamble: "Bu sprint icin plan girdilerim:",
    persistDraft: true,
    questions: [
      {
        id: "scope",
        kind: "single-choice",
        label: "Hedef kapsam",
        required: true,
        options: [
          {
            value: "v1-core",
            label: "Sadece V1 iskeleti",
            recommended: true,
          },
          {
            value: "v1-plus-flow",
            label: "V1 + temel akislar",
          },
        ],
      },
      {
        id: "constraints",
        kind: "long-text",
        label: "Kisitlar",
      },
      {
        id: "success",
        kind: "short-text",
        label: "Basari olcutu",
        required: true,
      },
    ],
  };
}

void test("Rovo interaction parser round-trips a plan-harder-local token", () => {
  const payload = createPlanPayload();
  const message = appendRovoInteractionToken(payload.fallbackText, payload);
  const parsed = parseRovoInteraction(message);

  assert.ok(parsed);
  assert.equal(parsed.payload.type, "plan-harder-local");
  assert.equal(parsed.payload.id, payload.id);
  assert.equal(parsed.displayText, payload.fallbackText);
  assert.match(parsed.rawToken, /^\[rovo-ui:v1:/u);
});

void test("Rovo interaction parser accepts a same-line transport spacer before the token", () => {
  const payload = createPlanPayload();
  const token = encodeRovoInteractionToken(payload);
  const parsed = parseRovoInteraction(`${payload.fallbackText} ${token}`);

  assert.ok(parsed);
  assert.equal(parsed.payload.type, "plan-harder-local");
  assert.equal(parsed.displayText, payload.fallbackText);
});

void test("change-approval parser rejects canonical replies other than evet", () => {
  const parsed = parseRovoInteraction(
    appendRovoInteractionToken("Approval fallback", {
      id: "approval-card",
      version: 1,
      type: "change-approval",
      title: "Change Approval",
      fallbackText: "Approval fallback",
      issue: "Example issue",
      solution: "Example solution",
      canonicalReply: "tamam",
    })
  );

  assert.equal(parsed, null);
});

void test("change-approval parser rejects missing canonical replies", () => {
  const incompletePayload = {
    id: "approval-card",
    version: 1,
    type: "change-approval",
    title: "Change Approval",
    fallbackText: "Approval fallback",
    issue: "Example issue",
    solution: "Example solution",
  } satisfies Record<string, unknown>;
  const parsed = parseRovoInteraction(
    appendRovoInteractionToken(
      "Approval fallback",
      incompletePayload as unknown as RovoInteractionPayload
    )
  );

  assert.equal(parsed, null);
});

void test("parser ignores non-final interaction tokens and falls back to plain text", () => {
  const payload = createPlanPayload();
  const parsed = parseRovoInteraction(
    `${appendRovoInteractionToken(payload.fallbackText, payload)}\nextra trailing text`
  );

  assert.equal(parsed, null);
});

void test("parser preserves fallback text whitespace exactly", () => {
  const payload = {
    ...createPlanPayload(),
    fallbackText: "  Plan intake fallback text  \n",
  } satisfies RovoPlanHarderLocalPayload;
  const parsed = parseRovoInteraction(appendRovoInteractionToken(payload.fallbackText, payload));

  assert.ok(parsed);
  assert.equal(parsed.displayText, payload.fallbackText);
});

void test("parser rejects visible text drift from fallback text", () => {
  const payload = createPlanPayload();
  const parsed = parseRovoInteraction(
    appendRovoInteractionToken("Visible fallback block", payload)
  );

  assert.equal(parsed, null);
});

void test("appendRovoInteractionToken preserves visible text formatting", () => {
  const payload = {
    ...createPlanPayload(),
    fallbackText: "  Visible fallback block\n",
  } satisfies RovoPlanHarderLocalPayload;
  const message = appendRovoInteractionToken(payload.fallbackText, payload);

  assert.match(message, /^ {2}Visible fallback block\n\[rovo-ui:v1:/u);
});

void test("appendRovoInteractionToken falls back to payload fallback text when visible text is blank", () => {
  const payload = createPlanPayload();
  const message = appendRovoInteractionToken("", payload);
  const parsed = parseRovoInteraction(message);

  assert.ok(parsed);
  assert.equal(parsed.displayText, payload.fallbackText);
});

void test("plan-harder-local reply builder uses labels and keeps multiline answers readable", () => {
  const payload = createPlanPayload();
  const answers = {
    scope: "v1-core",
    constraints: "OpenCode serve kapaliysa fallback calissin.\nPlain text akisi bozulmasin.",
    success: "Approval ve plan kartlari render olsun.",
  };

  const reply = buildPlanHarderLocalReply(payload, answers);

  assert.match(reply, /\[Plan Intake\]/u);
  assert.match(reply, /Bu sprint icin plan girdilerim:/u);
  assert.match(reply, /- Hedef kapsam: Sadece V1 iskeleti/u);
  assert.match(reply, /- Kisitlar: OpenCode serve kapaliysa fallback calissin\./u);
  assert.match(reply, /Plain text akisi bozulmasin\./u);
});

void test("plan-harder-local reports missing required questions", () => {
  const payload = createPlanPayload();
  const missing = findMissingRequiredPlanQuestions(payload, {
    scope: "v1-core",
    success: "",
  });

  assert.deepEqual(
    missing.map((question) => question.id),
    ["success"]
  );
});

void test("plan-harder-local reply stays empty until at least one answer exists", () => {
  const payload = createPlanPayload();
  const reply = buildPlanHarderLocalReply(payload, {
    scope: "",
    constraints: "",
    success: "",
  });

  assert.equal(reply, "");
});

void test("activation snapshot becomes active only for OpenCode UI account with serve running", async () => {
  const snapshot = await withMockWindow(
    {
      loadSettings: () => ({
        assistantSlot: { accountId: "opencode_ui_opencode_at_opencode_com" },
      }),
      rovoInteractionContextRead: () => ({
        success: true,
        appMode: "app",
        effectiveMode: "app",
        opencodeServerRunning: true,
        terminalOwner: "opencode-server",
        cliProvider: "opencode",
      }),
      assistantRuntimeRead: () => ({
        success: true,
        state: { desiredMode: "soft", phase: "idle" },
      }),
      opencodeServeStatus: () => ({ running: true, port: 4096 }),
    },
    async () => await loadRovoInteractionActivationSnapshot("opencode-ui")
  );

  assert.equal(snapshot.active, true);
  assert.equal(snapshot.opencodeServeRunning, true);
  assert.equal(snapshot.assistantAccountId, "opencode_ui_opencode_at_opencode_com");
  assert.equal(snapshot.appMode, "app");
  assert.equal(snapshot.effectiveMode, "app");
  assert.equal(snapshot.assistantRuntimeMode, "soft");
  assert.equal(snapshot.assistantRuntimePhase, "idle");
});

void test("activation snapshot stays inactive when serve is down or account does not match", async () => {
  const snapshot = await withMockWindow(
    {
      loadSettings: () => ({
        assistantSlot: { accountId: "different-account" },
      }),
      rovoInteractionContextRead: () => ({
        success: true,
        appMode: "app",
        effectiveMode: "app",
        opencodeServerRunning: false,
        terminalOwner: "opencode-server",
        cliProvider: "opencode",
      }),
      assistantRuntimeRead: () => ({
        success: true,
        state: { desiredMode: "soft", phase: "idle" },
      }),
      opencodeServeStatus: () => ({ running: false }),
    },
    async () => await loadRovoInteractionActivationSnapshot("opencode-ui")
  );

  assert.equal(snapshot.active, false);
  assert.equal(snapshot.opencodeServeRunning, false);
  assert.match(snapshot.reason, /OpenCode serve is not active/u);
});

void test("activation snapshot stays active when app context matches even if runtime state is stale", async () => {
  const snapshot = await withMockWindow(
    {
      loadSettings: () => ({
        assistantSlot: { accountId: "opencode_ui_opencode_at_opencode_com" },
      }),
      rovoInteractionContextRead: () => ({
        success: true,
        appMode: "app",
        effectiveMode: "app",
        opencodeServerRunning: true,
        terminalOwner: "opencode-server",
        cliProvider: "opencode",
      }),
      assistantRuntimeRead: () => ({
        success: true,
        state: { desiredMode: "ghost-agent", phase: "in-ghost" },
      }),
      opencodeServeStatus: () => ({ running: true, port: 4096 }),
    },
    async () => await loadRovoInteractionActivationSnapshot("opencode-ui")
  );

  assert.equal(snapshot.active, true);
  assert.equal(snapshot.effectiveMode, "app");
  assert.equal(snapshot.assistantRuntimeMode, "ghost-agent");
  assert.equal(snapshot.assistantRuntimePhase, "in-ghost");
});

void test("activation snapshot stays inactive outside app effective mode", async () => {
  const snapshot = await withMockWindow(
    {
      loadSettings: () => ({
        assistantSlot: { accountId: "opencode_ui_opencode_at_opencode_com" },
      }),
      rovoInteractionContextRead: () => ({
        success: true,
        appMode: "ghost-agent",
        effectiveMode: "ghost-agent",
        opencodeServerRunning: true,
        terminalOwner: "opencode-server",
        cliProvider: "opencode",
      }),
      assistantRuntimeRead: () => ({
        success: true,
        state: { desiredMode: "ghost-agent", phase: "in-ghost" },
      }),
      opencodeServeStatus: () => ({ running: true, port: 4096 }),
    },
    async () => await loadRovoInteractionActivationSnapshot("opencode-ui")
  );

  assert.equal(snapshot.active, false);
  assert.equal(snapshot.effectiveMode, "ghost-agent");
  assert.match(snapshot.reason, /outside the V1 interaction scope/u);
});
