import {
  assert,
  createMinimalForgeUiEnvironment,
  createRoomInstalledCopy,
  fireEvent,
  loadTranslations,
  pathToFileURL,
  readTreeText,
  resolve,
  test,
} from "./forge-room-ui-smoke.helpers.ts";

void test("forge-room resets the guided surface when a previously selected panel becomes locked", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("forge-room");

  try {
    await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/index.js")).href}?surface-reset=${Date.now()}`
    );

    environment.emitHostMessage({
      type: "host-context",
      room: { id: "forge-room", name: "Forge Room" },
      activeFeature: { id: "forge-workbench" },
      locale: "en",
      translations: loadTranslations("en"),
      assistant: {
        assigned: true,
        nickname: "Hayalet",
        avatar: "/avatars/ai0.png",
        connected: true,
      },
      user: {
        nickname: "Operator",
      },
    });

    environment.emitHostMessage({
      type: "forge-state",
      snapshot: {
        activeSessionId: "forge-session-surface-reset",
        currentGoal: {
          id: "forge-goal-surface-reset",
          summary: "Repair Room integration",
          brief: "Guide the synthesis surface.",
          constraints: ["Keep the scope local."],
          acceptanceCriteria: ["Repair Room can read the handoff package."],
          status: "synthesis-ready",
          targetRoomId: "repair-room",
          createdAt: "2026-04-18T00:00:00.000Z",
          updatedAt: "2026-04-18T00:00:00.000Z",
        },
        responses: [
          {
            id: "forge-response-surface-reset",
            assignmentId: "forge-assignment-surface-reset",
            taskId: "forge-task-surface-reset",
            seatId: "ai1",
            roleId: "architect",
            personaPresetId: null,
            summary: "Keep the export local.",
            body: "Use a narrow export contract.",
            rawText: "Use a narrow export contract.",
            archiveRef: null,
            artifacts: [],
            status: "captured",
            createdAt: "2026-04-18T00:02:00.000Z",
          },
        ],
        syntheses: [
          {
            id: "forge-synthesis-surface-reset",
            summary: "Ready synthesis",
            body: "A selected export seam is ready.",
            decisionTrace: [],
            provenance: null,
            sourceTaskIds: ["forge-task-surface-reset"],
            selectedResponseIds: ["forge-response-surface-reset"],
            unresolvedConflictIds: [],
            acceptanceCriteria: ["Repair Room can read the handoff package."],
            openQuestions: [],
            status: "draft",
            createdAt: "2026-04-18T00:03:00.000Z",
          },
        ],
      },
      meta: {
        roleCatalog: {},
        personaPresets: {},
      },
    });

    assert.ok(environment.app.querySelector("[data-forge-panel='synthesis']"));
    const responsesSurfaceTab = environment.app
      .querySelectorAll("[data-forge-action='open-surface']")
      .find((element) => element.dataset["forgeSurface"] === "responses");
    assert.ok(responsesSurfaceTab);
    assert.equal(responsesSurfaceTab.disabled, false);
    fireEvent(responsesSurfaceTab, "click");
    assert.ok(environment.app.querySelector("[data-forge-panel='responses']"));

    environment.emitHostMessage({
      type: "forge-state",
      snapshot: {
        activeSessionId: "forge-session-surface-reset",
        currentGoal: {
          id: "forge-goal-surface-reset",
          summary: "Repair Room integration",
          brief: "Return to the flow surface.",
          constraints: ["Keep the scope local."],
          acceptanceCriteria: ["Repair Room can read the handoff package."],
          status: "approved",
          targetRoomId: "repair-room",
          createdAt: "2026-04-18T00:00:00.000Z",
          updatedAt: "2026-04-18T00:04:00.000Z",
        },
        approvedTasks: [
          {
            id: "forge-task-surface-reset",
            parentTaskId: null,
            level: 1,
            title: "Prepare export",
            summary: "Shape the handoff.",
            executionKind: "task",
            dependsOnTaskIds: [],
            assignable: true,
            dispatchMode: "single-owner",
            seatId: "ai1",
            roleId: "architect",
            compareSeatIds: [],
            personaPresetId: null,
            status: "approved",
          },
        ],
        responses: [],
        syntheses: [],
      },
      meta: {
        roleCatalog: {},
        personaPresets: {},
      },
    });

    assert.ok(environment.app.querySelector("[data-forge-panel='goal']"));
    assert.equal(environment.app.querySelector("[data-forge-panel='responses']"), null);
    const lockedResponsesSurfaceTab = environment.app
      .querySelectorAll("[data-forge-action='open-surface']")
      .find((element) => element.dataset["forgeSurface"] === "responses");
    assert.ok(lockedResponsesSurfaceTab);
    assert.equal(lockedResponsesSurfaceTab.disabled, true);
  } finally {
    await installedCopy.cleanup();
    environment.restore();
  }
});

void test("forge-room resets the active stage when the selected stage is no longer reachable", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("forge-room");

  try {
    await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/index.js")).href}?stage-reset=${Date.now()}`
    );

    environment.emitHostMessage({
      type: "host-context",
      room: { id: "forge-room", name: "Forge Room" },
      activeFeature: { id: "forge-workbench" },
      locale: "en",
      translations: loadTranslations("en"),
      assistant: {
        assigned: true,
        nickname: "Hayalet",
        avatar: "/avatars/ai0.png",
        connected: true,
      },
      user: {
        nickname: "Operator",
      },
    });

    environment.emitHostMessage({
      type: "forge-state",
      snapshot: {
        activeSessionId: "forge-session-stage-reset",
        currentGoal: {
          id: "forge-goal-stage-reset",
          summary: "Repair Room integration",
          brief: "Open the preflight stage.",
          constraints: ["Keep the scope local."],
          acceptanceCriteria: ["Repair Room can read the handoff package."],
          status: "draft",
          targetRoomId: "repair-room",
          createdAt: "2026-04-18T00:00:00.000Z",
          updatedAt: "2026-04-18T00:00:00.000Z",
        },
        sessionList: [],
      },
      meta: {
        roleCatalog: {},
        personaPresets: {},
      },
    });

    const preflightStageButton = environment.app
      .querySelectorAll("[data-forge-action='open-stage']")
      .find((element) => element.dataset["forgeActionValue"] === "preflight");
    assert.ok(preflightStageButton);
    fireEvent(preflightStageButton, "click");
    environment.emitHostMessage({
      type: "command-result",
      command: "ForgeRoomUpdateGoal",
      result: {
        success: true,
        message: null,
      },
    });
    assert.ok(environment.app.querySelector("[data-forge-active-stage='preflight']"));

    const trackingStageButton = environment.app
      .querySelectorAll("[data-forge-action='open-stage']")
      .find((element) => element.dataset["forgeActionValue"] === "tracking");
    assert.ok(trackingStageButton);
    fireEvent(trackingStageButton, "click");
    environment.emitHostMessage({
      type: "command-result",
      command: "ForgeRoomSaveSession",
      result: {
        success: true,
        message: null,
      },
    });
    assert.ok(environment.app.querySelector("[data-forge-active-stage='tracking']"));

    environment.emitHostMessage({
      type: "forge-state",
      snapshot: {
        activeSessionId: null,
        currentGoal: null,
        sessionList: [],
      },
      meta: {
        roleCatalog: {},
        personaPresets: {},
      },
    });

    assert.ok(environment.app.querySelector("[data-forge-active-stage='session']"));
  } finally {
    await installedCopy.cleanup();
    environment.restore();
  }
});

void test("forge-room waits for the first forge-state snapshot before rendering empty session and operator panels", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("forge-room");

  try {
    await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/index.js")).href}?bootstrap=${Date.now()}`
    );

    environment.emitHostMessage({
      type: "host-context",
      room: {
        id: "forge-room",
        name: "Forge Room",
      },
      activeFeature: {
        id: "forge-workbench",
      },
      locale: "en",
      translations: loadTranslations("en"),
      assistant: {
        assigned: true,
        nickname: "Hayalet",
        avatar: "/avatars/ai0.png",
        connected: true,
      },
      user: {
        nickname: "Operator",
      },
    });

    const bootstrapText = readTreeText(environment.app);
    assert.match(bootstrapText, /Connecting to Forge host/i);
    assert.match(bootstrapText, /waiting for host state/i);
    assert.match(
      bootstrapText,
      /hydrate sessions, operator details, and workbench state/i
    );
    assert.equal(environment.app.querySelector("#forge-goal-summary"), null);

    environment.emitHostMessage({
      type: "forge-state",
      snapshot: {
        activeSessionId: "forge-session-bootstrap",
        currentGoal: {
          id: "forge-goal-bootstrap",
          summary: "Repair Room integration",
          brief: "Wait for the first host snapshot.",
          constraints: ["Keep the scope local."],
          acceptanceCriteria: ["Render the hydrated goal panel."],
          status: "draft",
          targetRoomId: "repair-room",
          createdAt: "2026-04-18T00:00:00.000Z",
          updatedAt: "2026-04-18T00:00:00.000Z",
        },
        draftTasks: [],
        draftSourceText: null,
        validationMessages: [],
        operatorProfile: {
          schemaVersion: 2,
          updatedAt: "2026-04-18T00:00:00.000Z",
          skills: [],
          equipment: [],
          preferences: {},
        },
        preflight: {
          bundle: null,
          errorMessage: null,
          promptCharCount: 0,
          ranAt: null,
          staleReason: null,
          status: "idle",
          warnings: [],
        },
        approvedTasks: [],
        assignments: [],
        responses: [],
        conflicts: [],
        syntheses: [],
        selectedSynthesisId: null,
        sessionContextSelection: {
          skillKeys: [],
          equipmentKeys: [],
          preferenceKeys: [],
        },
        coordinatorState: {
          actorId: "coordinator",
          planStatus: "idle",
          assignmentQueueTotal: 0,
          pendingAssignmentCount: 0,
          completedResponseCount: 0,
          pendingConflictCount: 0,
          synthesisStatus: "idle",
          exportReady: false,
          lastExportPath: null,
          note: "Coordinator is idle.",
          lastUpdatedAt: "2026-04-18T00:00:00.000Z",
        },
        sessionList: [],
        runOverride: null,
      },
      meta: {
        roleCatalog: {},
        personaPresets: {},
      },
    });

    assert.ok(environment.app.querySelector("#forge-goal-summary"));
    assert.doesNotMatch(readTreeText(environment.app), /Connecting to Forge host/i);
  } finally {
    await installedCopy.cleanup();
    environment.restore();
  }
});

void test("forge-room routes draft generation through the selected architect seat from the tracking stage", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("forge-room");

  try {
    await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/index.js")).href}?architect-seat=${Date.now()}`
    );

    environment.emitHostMessage({
      type: "host-context",
      room: {
        id: "forge-room",
        name: "Forge Room",
      },
      activeFeature: {
        id: "forge-workbench",
      },
      locale: "en",
      translations: loadTranslations("en"),
      assistant: {
        assigned: true,
        nickname: "Hayalet",
        avatar: "/avatars/ai0.png",
        connected: true,
      },
      user: {
        nickname: "Operator",
      },
    });

    environment.emitHostMessage({
      type: "forge-state",
      snapshot: {
        activeSessionId: "forge-session-architect-seat",
        currentGoal: {
          id: "forge-goal-architect-seat",
          summary: "Repair Room integration",
          brief: "Route the first draft to the selected architect seat.",
          constraints: ["Keep the scope local."],
          acceptanceCriteria: ["AI2 can own the draft request."],
          status: "draft",
          targetRoomId: "repair-room",
          createdAt: "2026-04-18T00:00:00.000Z",
          updatedAt: "2026-04-18T00:00:00.000Z",
        },
        draftTasks: [],
        draftSourceText: null,
        validationMessages: [],
        operatorProfile: {
          schemaVersion: 2,
          updatedAt: "2026-04-18T00:00:00.000Z",
          skills: [],
          equipment: [],
          preferences: {},
        },
        preflight: {
          bundle: null,
          errorMessage: null,
          promptCharCount: 0,
          ranAt: null,
          staleReason: null,
          status: "idle",
          warnings: [],
        },
        approvedTasks: [],
        assignments: [],
        responses: [],
        conflicts: [],
        syntheses: [],
        selectedSynthesisId: null,
        sessionContextSelection: {
          skillKeys: [],
          equipmentKeys: [],
          preferenceKeys: [],
        },
        coordinatorState: {
          actorId: "coordinator",
          planStatus: "idle",
          assignmentQueueTotal: 0,
          pendingAssignmentCount: 0,
          completedResponseCount: 0,
          pendingConflictCount: 0,
          synthesisStatus: "idle",
          exportReady: false,
          lastExportPath: null,
          note: "Coordinator is idle.",
          lastUpdatedAt: "2026-04-18T00:00:00.000Z",
        },
        sessionList: [],
        runOverride: null,
      },
      meta: {
        roleCatalog: {
          architect: {
            id: "architect",
            label: "Architect",
            localActor: false,
          },
        },
        personaPresets: {},
      },
    });

    const trackingStageButton = environment.app
      .querySelectorAll("[data-forge-action='open-stage']")
      .find((element) => element.dataset["forgeActionValue"] === "tracking");
    assert.ok(trackingStageButton);
    fireEvent(trackingStageButton, "click");
    environment.emitHostMessage({
      type: "command-result",
      command: "ForgeRoomSaveSession",
      result: {
        success: true,
        message: null,
      },
    });

    const architectSeatSelect = environment.app.querySelector(
      "#forge-run-override-architect-seat"
    );
    assert.ok(architectSeatSelect);
    architectSeatSelect.value = "ai2";
    fireEvent(architectSeatSelect, "change");
    assert.deepEqual(environment.sentEvents.at(-1), {
      command: "ForgeRoomUpdateRunOverride",
      payload: {
        architectSeatId: "ai2",
        enableRovoPreAnalysis: false,
        notes: "",
        temporaryConditions: [],
      },
    });
    environment.emitHostMessage({
      type: "command-result",
      command: "ForgeRoomUpdateRunOverride",
      result: {
        success: true,
        message: null,
      },
    });

    const generateDraftButton = environment.app.querySelector(
      "[data-forge-action='generate-draft']"
    );
    assert.ok(generateDraftButton);
    fireEvent(generateDraftButton, "click");
    assert.deepEqual(environment.sentEvents.at(-1), {
      command: "ForgeRoomGenerateDraft",
      payload: {
        architectSeatId: "ai2",
        brief: "Route the first draft to the selected architect seat.",
        constraints: ["Keep the scope local."],
        summary: "Repair Room integration",
        targetRoomId: "repair-room",
      },
    });
  } finally {
    await installedCopy.cleanup();
    environment.restore();
  }
});

void test("forge-room generate-draft uses the live architect select value before host echo arrives", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("forge-room");

  try {
    await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/index.js")).href}?architect-live-value=${Date.now()}`
    );

    environment.emitHostMessage({
      type: "host-context",
      room: {
        id: "forge-room",
        name: "Forge Room",
      },
      activeFeature: {
        id: "forge-workbench",
      },
      locale: "en",
      translations: loadTranslations("en"),
      assistant: {
        assigned: true,
        nickname: "Hayalet",
        avatar: "/avatars/ai0.png",
        connected: true,
      },
      user: {
        nickname: "Operator",
      },
    });

    environment.emitHostMessage({
      type: "forge-state",
      snapshot: {
        activeSessionId: "forge-session-architect-live",
        currentGoal: {
          id: "forge-goal-architect-live",
          summary: "Repair Room integration",
          brief: "Respect the visible architect lane.",
          constraints: ["Keep the scope local."],
          acceptanceCriteria: ["Visible lane drives the outbound draft request."],
          status: "draft",
          targetRoomId: "repair-room",
          createdAt: "2026-04-18T00:00:00.000Z",
          updatedAt: "2026-04-18T00:00:00.000Z",
        },
        draftTasks: [],
        draftSourceText: null,
        validationMessages: [],
        operatorProfile: {
          schemaVersion: 2,
          updatedAt: "2026-04-18T00:00:00.000Z",
          skills: [],
          equipment: [],
          preferences: {},
        },
        preflight: {
          bundle: null,
          errorMessage: null,
          promptCharCount: 0,
          ranAt: null,
          staleReason: null,
          status: "idle",
          warnings: [],
        },
        approvedTasks: [],
        assignments: [],
        responses: [],
        conflicts: [],
        syntheses: [],
        selectedSynthesisId: null,
        sessionContextSelection: {
          skillKeys: [],
          equipmentKeys: [],
          preferenceKeys: [],
        },
        coordinatorState: {
          actorId: "coordinator",
          planStatus: "idle",
          assignmentQueueTotal: 0,
          pendingAssignmentCount: 0,
          completedResponseCount: 0,
          pendingConflictCount: 0,
          synthesisStatus: "idle",
          exportReady: false,
          lastExportPath: null,
          note: "Coordinator is idle.",
          lastUpdatedAt: "2026-04-18T00:00:00.000Z",
        },
        sessionList: [],
        runOverride: {
          architectSeatId: "ai2",
          enableRovoPreAnalysis: false,
          notes: "",
          temporaryConditions: [],
        },
      },
      meta: {
        roleCatalog: {
          architect: {
            id: "architect",
            label: "Architect",
            localActor: false,
          },
        },
        personaPresets: {},
      },
    });

    const trackingStageButton = environment.app
      .querySelectorAll("[data-forge-action='open-stage']")
      .find((element) => element.dataset["forgeActionValue"] === "tracking");
    assert.ok(trackingStageButton);
    fireEvent(trackingStageButton, "click");
    environment.emitHostMessage({
      type: "command-result",
      command: "ForgeRoomSaveSession",
      result: {
        success: true,
        message: null,
      },
    });

    const architectSeatSelect = environment.app.querySelector(
      "#forge-run-override-architect-seat"
    );
    assert.ok(architectSeatSelect);
    assert.equal(architectSeatSelect.value, "ai2");
    architectSeatSelect.value = "ai1";

    const generateDraftButton = environment.app.querySelector(
      "[data-forge-action='generate-draft']"
    );
    assert.ok(generateDraftButton);
    fireEvent(generateDraftButton, "click");
    assert.deepEqual(environment.sentEvents.at(-1), {
      command: "ForgeRoomGenerateDraft",
      payload: {
        architectSeatId: "ai1",
        brief: "Respect the visible architect lane.",
        constraints: ["Keep the scope local."],
        summary: "Repair Room integration",
        targetRoomId: "repair-room",
      },
    });
  } finally {
    await installedCopy.cleanup();
    environment.restore();
  }
});

void test("forge-room keeps preflight dispatch enabled when AI0 is assigned but disconnected", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("forge-room");

  try {
    await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/index.js")).href}?smoke-recoverable=${Date.now()}`
    );

    environment.emitHostMessage({
      type: "host-context",
      room: {
        id: "forge-room",
        name: "Forge Room",
      },
      activeFeature: {
        id: "forge-workbench",
      },
      locale: "en",
      translations: loadTranslations("en"),
      assistant: {
        assigned: true,
        nickname: "Hayalet",
        avatar: "/avatars/ai0.png",
        connected: false,
      },
      user: {
        nickname: "Operator",
      },
    });

    environment.emitHostMessage({
      type: "forge-state",
      snapshot: {
        activeSessionId: "forge-session-recoverable",
        currentGoal: {
          id: "forge-goal-recoverable",
          summary: "Repair Room integration",
          brief: "Prepare the preflight dispatch.",
          constraints: ["Keep the scope local."],
          acceptanceCriteria: ["Repair Room can read the handoff package."],
          status: "draft",
          targetRoomId: "repair-room",
          createdAt: "2026-04-18T00:00:00.000Z",
          updatedAt: "2026-04-18T00:00:00.000Z",
        },
        draftTasks: [],
        draftSourceText: null,
        validationMessages: [],
        operatorProfile: {
          schemaVersion: 1,
          updatedAt: "2026-04-18T00:00:00.000Z",
          skill: {
            level: null,
            soldering: null,
            measurement: "basic",
            mechanical: null,
          },
          tools: {
            multimeter: true,
            solderingIron: null,
            hotAir: null,
            benchPowerSupply: null,
            magnification: null,
          },
          preferences: {
            mode: "learn-first",
            riskTolerance: null,
          },
        },
        preflight: {
          activeStepId: null,
          bundle: {
            rovoPreAnalysis: {
              summary: "AI0 is offline",
            },
          },
          errorMessage: "AI0 is offline",
          promptCharCount: 1791,
          ranAt: "2026-04-18T00:00:00.000Z",
          staleReason: null,
          status: "warning",
          warnings: ["AI0 is offline", "AI0 is offline"],
        },
        approvedTasks: [],
        assignments: [],
        exports: [],
        exportSummary: {
          acceptanceCriteriaCount: 1,
          exportReady: false,
          missingRequirements: ["Select a synthesis"],
          openConflictCount: 0,
          reason: "Export blocked: no selected synthesis.",
          selectedSynthesisId: null,
          status: "blocked",
          targetRoomId: "repair-room",
        },
        responses: [],
        conflicts: [],
        syntheses: [],
        selectedSynthesisId: null,
        sessionContextSelection: {
          skill: {
            level: false,
            soldering: false,
            measurement: false,
            mechanical: false,
          },
          tools: {
            multimeter: false,
            solderingIron: false,
            hotAir: false,
            benchPowerSupply: false,
            magnification: false,
          },
          preferences: {
            mode: false,
            riskTolerance: false,
          },
        },
        coordinatorState: {
          actorId: "coordinator",
          planStatus: "idle",
          assignmentQueueTotal: 0,
          pendingAssignmentCount: 0,
          completedResponseCount: 0,
          pendingConflictCount: 0,
          synthesisStatus: "idle",
          exportReady: false,
          lastExportPath: null,
          note: "Coordinator is idle.",
          lastUpdatedAt: "2026-04-18T00:00:00.000Z",
        },
        sessionList: [],
        runOverride: null,
        runSignature: {
          value: "repair-room-signature",
          updatedAt: "2026-04-18T00:00:00.000Z",
          source: ["goal", "operator"],
        },
        decisionTrace: [],
      },
      meta: {
        roleCatalog: {},
        personaPresets: {},
      },
    });
    environment.emitHostMessage({
      type: "command-result",
      command: "ForgeRoomCreateSession",
      result: {
        success: true,
        message: null,
      },
    });

    const sessionNextButton = environment.app
      .querySelectorAll("[data-forge-action='open-stage']")
      .find((element) => element.dataset["forgeActionValue"] === "preflight");
    assert.ok(sessionNextButton);
    assert.equal(sessionNextButton.disabled, false);
    fireEvent(sessionNextButton, "click");
    assert.equal(environment.sentEvents.at(-1)?.command, "ForgeRoomUpdateGoal");
    environment.emitHostMessage({
      type: "command-result",
      command: "ForgeRoomUpdateGoal",
      result: {
        success: true,
        message: null,
      },
    });
    assert.ok(environment.app.querySelector("[data-forge-active-stage='preflight']"));

    const runPreflightButton = environment.app.querySelector(
      "[data-forge-action='run-preflight']"
    );
    assert.ok(runPreflightButton);
    assert.equal(runPreflightButton.disabled, false);
    const recoverableText = readTreeText(environment.app);
    assert.equal(
      (recoverableText.match(/AI0 will reconnect during preflight\./g) ?? []).length,
      1
    );
    assert.doesNotMatch(recoverableText, /AI0 is offline/);
  } finally {
    await installedCopy.cleanup();
    environment.restore();
  }
});
