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

void test("forge-room session context empty states route operator profile entry through the top bar", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("forge-room");

  try {
    await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/index.js")).href}?smoke=${Date.now()}-empty-context`
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
        activeSessionId: "forge-session-empty",
        currentGoal: {
          id: "forge-goal-empty",
          summary: "Prepare the empty operator state",
          brief: "Route the operator setup through the top bar only.",
          constraints: ["Keep the session context empty."],
          acceptanceCriteria: [],
          status: "draft",
          targetRoomId: "repair-room",
          createdAt: "2026-04-17T00:00:00.000Z",
          updatedAt: "2026-04-17T00:00:00.000Z",
        },
        draftTasks: [],
        draftSourceText: null,
        validationMessages: [],
        decisionTrace: [],
        approvedTasks: [],
        assignments: [],
        responses: [],
        conflicts: [],
        syntheses: [],
        selectedSynthesisId: null,
        operatorProfile: {
          schemaVersion: 2,
          updatedAt: "2026-04-17T00:00:00.000Z",
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
        sessionContextSelection: {
          skillKeys: [],
          equipmentKeys: [],
          preferenceKeys: [],
        },
        runOverride: null,
        runSignature: null,
        exports: [],
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
          note: "Waiting for the first goal draft.",
          lastUpdatedAt: "2026-04-17T00:00:00.000Z",
        },
        sessionList: [],
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

    const profileActions = environment.app.querySelectorAll(
      "[data-forge-action='toggle-profile-editor']"
    );
    assert.equal(profileActions.length, 1);
    assert.ok(environment.app.querySelector("[data-forge-active-stage='session']"));
    assert.equal(
      environment.app.querySelectorAll("[data-forge-action='toggle-profile-editor']").length,
      1
    );
    assert.match(readTreeText(environment.app), /No saved skills/);
    assert.match(readTreeText(environment.app), /No saved equipment/);
    assert.match(readTreeText(environment.app), /Operator Profile from the top bar/);
  } finally {
    await installedCopy.cleanup();
    environment.restore();
  }
});

void test("forge-room control surface renders the Turkish control copy from room translations", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("forge-room");

  try {
    await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/index.js")).href}?smoke-tr=${Date.now()}`
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
      locale: "tr",
      translations: loadTranslations("tr"),
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
        activeSessionId: "forge-session-tr",
        currentGoal: {
          id: "forge-goal-tr",
          summary: "Kontrol yuzeyi duzenle",
          brief: "Operator baglamini topbar odakli birak.",
          constraints: ["Session alani sade kalsin."],
          acceptanceCriteria: [],
          status: "draft",
          targetRoomId: "repair-room",
          createdAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
        draftTasks: [],
        draftSourceText: null,
        validationMessages: [],
        operatorProfile: {
          schemaVersion: 1,
          updatedAt: "2026-04-15T00:00:00.000Z",
          skill: {
            level: null,
            soldering: null,
            measurement: null,
            mechanical: null,
          },
          tools: {
            multimeter: null,
            solderingIron: null,
            hotAir: null,
            benchPowerSupply: null,
            magnification: null,
          },
          preferences: {
            mode: null,
            riskTolerance: null,
          },
        },
        preflight: {
          bundle: null,
          errorMessage: null,
          promptCharCount: 0,
          ranAt: null,
          staleReason: null,
          status: "stale",
          warnings: [],
        },
        approvedTasks: [],
        assignments: [],
        exports: [],
        exportSummary: {
          acceptanceCriteriaCount: 0,
          exportReady: false,
          missingRequirements: ["Taslak sec"],
          openConflictCount: 0,
          reason: "Export blocked: Taslak sec.",
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
          note: "Bekliyor.",
          lastUpdatedAt: "2026-04-15T00:00:00.000Z",
        },
        sessionList: [],
        runOverride: null,
        runSignature: null,
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

    const uiText = readTreeText(environment.app);
    assert.match(uiText, /Operatör Profili/);
    assert.match(uiText, /Oturum \+ Hedef/);
    assert.match(uiText, /Kayıtlı oturumlar/);
    assert.match(uiText, /Ön kontrol/);
    assert.match(uiText, /Önceki/);
    assert.match(uiText, /Sonraki/);
    assert.doesNotMatch(uiText, /Gerekli adım/);
    assert.doesNotMatch(uiText, /Aktif oturum bağlandı/);
    assert.doesNotMatch(uiText, /Taslak öncesi ön kontrol çalıştır/);

    assert.ok(environment.app.querySelector("[data-forge-active-stage='session']"));
    const operatorText = readTreeText(environment.app);
    assert.doesNotMatch(operatorText, /BU RUN ICIN BAGLAM/);
    assert.match(operatorText, /Kayıtlı yetenek yok/);
    assert.match(operatorText, /Kayıtlı ekipman yok/);
    assert.match(operatorText, /Mod/);
    assert.match(operatorText, /Risk toleransı/);
  } finally {
    await installedCopy.cleanup();
    environment.restore();
  }
});

void test("forge-room enables session advance only after all combined goal fields are filled", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("forge-room");

  try {
    await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/index.js")).href}?smoke-save=${Date.now()}`
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
        activeSessionId: null,
        currentGoal: null,
        draftTasks: [],
        draftSourceText: null,
        validationMessages: [],
        operatorProfile: {
          schemaVersion: 1,
          updatedAt: "2026-04-15T00:00:00.000Z",
          skill: {
            level: null,
            soldering: null,
            measurement: null,
            mechanical: null,
          },
          tools: {
            multimeter: null,
            solderingIron: null,
            hotAir: null,
            benchPowerSupply: null,
            magnification: null,
          },
          preferences: {
            mode: null,
            riskTolerance: null,
          },
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
        exports: [],
        exportSummary: {
          acceptanceCriteriaCount: 0,
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
          note: "Waiting for a goal.",
          lastUpdatedAt: "2026-04-15T00:00:00.000Z",
        },
        sessionList: [],
        runOverride: null,
        runSignature: null,
        decisionTrace: [],
      },
      meta: {
        roleCatalog: {},
        personaPresets: {},
      },
    });

    assert.deepEqual(environment.sentEvents.at(-1), {
      command: "ForgeRoomCreateSession",
      payload: {
        persist: false,
      },
    });

    environment.emitHostMessage({
      type: "forge-state",
      snapshot: {
        activeSessionId: "forge-session-draft",
        currentGoal: null,
        draftTasks: [],
        draftSourceText: null,
        validationMessages: [],
        operatorProfile: {
          schemaVersion: 1,
          updatedAt: "2026-04-15T00:00:00.000Z",
          skill: {
            level: null,
            soldering: null,
            measurement: null,
            mechanical: null,
          },
          tools: {
            multimeter: null,
            solderingIron: null,
            hotAir: null,
            benchPowerSupply: null,
            magnification: null,
          },
          preferences: {
            mode: null,
            riskTolerance: null,
          },
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
        exports: [],
        exportSummary: {
          acceptanceCriteriaCount: 0,
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
          note: "Waiting for a goal.",
          lastUpdatedAt: "2026-04-15T00:00:00.000Z",
        },
        sessionList: [],
        runOverride: null,
        runSignature: null,
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

    let nextButton = environment.app
      .querySelectorAll("[data-forge-action='open-stage']")
      .find((element) => element.dataset["forgeActionValue"] === "preflight");
    assert.ok(nextButton);
    assert.equal(nextButton.disabled, true);

    const goalSummaryInput = environment.app.querySelector("#forge-goal-summary");
    assert.ok(goalSummaryInput);
    goalSummaryInput.value = "Repair Room integration";
    fireEvent(goalSummaryInput, "input");
    assert.equal(environment.app.querySelector("#forge-goal-summary"), goalSummaryInput);
    nextButton = environment.app
      .querySelectorAll("[data-forge-action='open-stage']")
      .find((element) => element.dataset["forgeActionValue"] === "preflight");
    assert.ok(nextButton);
    assert.equal(nextButton.disabled, true);

    const briefInput = environment.app.querySelector("#forge-goal-brief");
    assert.ok(briefInput);
    briefInput.value = "Document the repair boundary.";
    fireEvent(briefInput, "input");
    nextButton = environment.app
      .querySelectorAll("[data-forge-action='open-stage']")
      .find((element) => element.dataset["forgeActionValue"] === "preflight");
    assert.ok(nextButton);
    assert.equal(nextButton.disabled, true);

    const constraintsInput = environment.app.querySelector(
      "#forge-goal-constraints"
    );
    assert.ok(constraintsInput);
    constraintsInput.value = "Keep the scope local.\nPreserve host logic.";
    fireEvent(constraintsInput, "input");
    assert.equal(environment.app.querySelector("#forge-goal-constraints"), constraintsInput);
    nextButton = environment.app
      .querySelectorAll("[data-forge-action='open-stage']")
      .find((element) => element.dataset["forgeActionValue"] === "preflight");
    assert.ok(nextButton);
    assert.equal(nextButton.disabled, true);

    const targetRoomInput = environment.app.querySelector(
      "#forge-goal-target-room"
    );
    assert.ok(targetRoomInput);
    targetRoomInput.value = "repair-room";
    fireEvent(targetRoomInput, "input");
    nextButton = environment.app
      .querySelectorAll("[data-forge-action='open-stage']")
      .find((element) => element.dataset["forgeActionValue"] === "preflight");
    assert.ok(nextButton);
    assert.equal(nextButton.disabled, false);

    fireEvent(nextButton, "click");

    assert.deepEqual(environment.sentEvents.at(-1), {
      command: "ForgeRoomUpdateGoal",
      payload: {
        summary: "Repair Room integration",
        brief: "Document the repair boundary.",
        constraints: ["Keep the scope local.", "Preserve host logic."],
        targetRoomId: "repair-room",
      },
    });
  } finally {
    await installedCopy.cleanup();
    environment.restore();
  }
});
