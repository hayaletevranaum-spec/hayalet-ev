import {
  assert,
  createMinimalForgeUiEnvironment,
  createRoomInstalledCopy,
  findElementsByClass,
  fireEvent,
  loadTranslations,
  pathToFileURL,
  readTreeText,
  resolve,
  test,
} from "./forge-room-ui-smoke.helpers.ts";

void test("forge-room installed UI shell renders the Phase 2 panel controls under a minimal runtime", async () => {
  const environment = createMinimalForgeUiEnvironment();
  const installedCopy = await createRoomInstalledCopy("forge-room");

  try {
    await import(
      `${pathToFileURL(resolve(installedCopy.rootDir, "ui/index.js")).href}?smoke=${Date.now()}`
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
        activeSessionId: "forge-session-smoke",
        currentGoal: {
          id: "forge-goal-smoke",
          summary: "Repair Room integration",
          brief: "Prepare the first Forge session.",
          constraints: ["Keep the scope local."],
          acceptanceCriteria: ["Repair Room can read the handoff package."],
          status: "draft-ready",
          targetRoomId: "repair-room",
          createdAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:00:00.000Z",
        },
        draftTasks: [
          {
            id: "forge-task-draft-1",
            parentTaskId: null,
            level: 1,
            title: "Frame boundary",
            summary: "Define the seam.",
            executionKind: "task",
            dependsOnTaskIds: [],
            assignable: true,
            dispatchMode: "compare",
            seatId: "ai1",
            roleId: "architect",
            compareSeatIds: ["ai2"],
            personaPresetId: "rovo",
            status: "draft",
          },
          {
            id: "forge-task-draft-1-checklist",
            parentTaskId: "forge-task-draft-1",
            level: 2,
            title: "Map fields",
            summary: "Checklist item.",
            executionKind: "checklist",
            dependsOnTaskIds: [],
            assignable: false,
            dispatchMode: "single-owner",
            seatId: null,
            roleId: null,
            compareSeatIds: [],
            personaPresetId: null,
            status: "draft",
          },
        ],
        draftSourceText: null,
        validationMessages: [],
        operatorProfile: {
          schemaVersion: 1,
          updatedAt: "2026-04-15T00:00:00.000Z",
          skill: {
            level: null,
            soldering: null,
            measurement: "basic",
            mechanical: null,
          },
          tools: {
            multimeter: false,
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
          bundle: null,
          errorMessage: null,
          promptCharCount: 0,
          ranAt: null,
          staleReason: null,
          status: "stale",
          warnings: [],
        },
        approvedTasks: [
          {
            id: "forge-task-approved-1",
            parentTaskId: null,
            level: 1,
            title: "Prepare export",
            summary: "Shape the final handoff.",
            executionKind: "task",
            dependsOnTaskIds: [],
            assignable: true,
            dispatchMode: "single-owner",
            seatId: "ai1",
            roleId: "architect",
            compareSeatIds: [],
            personaPresetId: "gok",
            status: "approved",
          },
        ],
        assignments: [
          {
            id: "forge-assignment-1",
            taskId: "forge-task-approved-1",
            mode: "single-owner",
            seatId: "ai1",
            roleId: "architect",
            personaPresetId: "gok",
            requestId: "forge-request-1",
            startedAt: null,
            status: "queued",
            queuedAt: "2026-04-15T00:00:00.000Z",
            responseId: null,
            errorMessage: null,
            archiveRef: null,
            completedAt: null,
          },
        ],
        exports: [],
        exportSummary: {
          acceptanceCriteriaCount: 0,
          exportReady: false,
          missingRequirements: ["Select a synthesis"],
          openConflictCount: 0,
          reason: "Export blocked: Select a synthesis.",
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
            measurement: true,
            mechanical: false,
          },
          tools: {
            multimeter: true,
            solderingIron: false,
            hotAir: false,
            benchPowerSupply: false,
            magnification: false,
          },
          preferences: {
            mode: true,
            riskTolerance: false,
          },
        },
        coordinatorState: {
          actorId: "coordinator",
          planStatus: "awaiting-approval",
          assignmentQueueTotal: 0,
          pendingAssignmentCount: 0,
          completedResponseCount: 0,
          pendingConflictCount: 0,
          synthesisStatus: "idle",
          exportReady: false,
          lastExportPath: null,
          note: "Coordinator is waiting for the first approval.",
          lastUpdatedAt: "2026-04-15T00:00:00.000Z",
        },
        sessionList: [],
      },
      meta: {
        roleCatalog: {
          architect: {
            id: "architect",
            label: "Architect",
            localActor: false,
          },
          challenger: {
            id: "challenger",
            label: "Challenger",
            localActor: false,
          },
          "external-perspective": {
            id: "external-perspective",
            label: "External Perspective",
            localActor: false,
          },
        },
        personaPresets: {
          gok: {
            id: "gok",
            label: "Gok",
          },
          rovo: {
            id: "rovo",
            label: "Rovo",
          },
        },
      },
    });

    assert.ok(environment.app.querySelector("[data-forge-panel='goal']"));
    assert.equal(findElementsByClass(environment.app, "forge-statusbar").length, 1);
    const surfaceTabs = environment.app.querySelectorAll("[data-forge-action='open-surface']");
    assert.equal(surfaceTabs.length, 3);
    const goalSurfaceTab = surfaceTabs.find((element) => element.dataset["forgeSurface"] === "goal");
    const responsesSurfaceTab = surfaceTabs.find(
      (element) => element.dataset["forgeSurface"] === "responses"
    );
    const synthesisSurfaceTab = surfaceTabs.find(
      (element) => element.dataset["forgeSurface"] === "synthesis"
    );
    assert.ok(goalSurfaceTab);
    assert.ok(responsesSurfaceTab);
    assert.ok(synthesisSurfaceTab);
    assert.equal(goalSurfaceTab.disabled, false);
    assert.equal(responsesSurfaceTab.disabled, true);
    assert.equal(synthesisSurfaceTab.disabled, true);
    fireEvent(responsesSurfaceTab, "click");
    assert.equal(environment.app.querySelector("[data-forge-panel='responses']"), null);
    assert.equal(environment.app.querySelector("[data-forge-panel='synthesis']"), null);
    assert.ok(environment.app.querySelector("[data-forge-panel='goal']"));

    assert.deepEqual(environment.readyPayload(), {
      room: "forge-room",
      feature: "forge-workbench",
      stage: "ui-ready",
    });
    assert.ok(environment.sentCommands.includes("ForgeRoomUiReady"));
    assert.ok(environment.app.querySelector("[data-forge-stage-panel='true']"));
    assert.ok(environment.app.querySelector("[data-forge-active-stage='session']"));
    assert.ok(environment.app.querySelector("#forge-goal-summary"));
    assert.ok(environment.app.querySelector("#forge-goal-brief"));
    environment.emitHostMessage({
      type: "command-result",
      command: "ForgeRoomCreateSession",
      result: {
        success: true,
        message: null,
      },
    });
    const statusBarActions = findElementsByClass(environment.app, "forge-statusbar__action");
    assert.equal(statusBarActions.length, 0);

    const uiText = readTreeText(environment.app);
    assert.match(uiText, /QUEUE 1/);
    assert.match(uiText, /Draft Complete/);
    assert.match(uiText, /Flow/);
    assert.match(uiText, /Responses/);
    assert.match(uiText, /Output/);
    assert.match(uiText, /Locked/);
    assert.match(uiText, /Operator Profile/);
    assert.match(uiText, /Preflight/);
    assert.match(uiText, /Session \+ goal/);
    assert.match(uiText, /Previous/);
    assert.match(uiText, /Next/);
    assert.doesNotMatch(uiText, /Required action/);
    assert.doesNotMatch(uiText, /Active session attached/);
    assert.doesNotMatch(uiText, /Goal saved for this run/);
    assert.doesNotMatch(uiText, /Export blocked:/);
    assert.doesNotMatch(uiText, /Check handoff/);
    assert.doesNotMatch(uiText, /Export handoff/);

    const briefInput = environment.app.querySelector("#forge-goal-brief");
    assert.ok(briefInput);
    briefInput.value = "Document the repair boundary.";
    fireEvent(briefInput, "input");
    const constraintsInput = environment.app.querySelector(
      "#forge-goal-constraints"
    );
    assert.ok(constraintsInput);
    constraintsInput.value = "Keep the scope local.\nPreserve host logic.";
    fireEvent(constraintsInput, "input");

    const toggleProfileButtonsBeforeOpen = environment.app.querySelectorAll(
      "[data-forge-action='toggle-profile-editor']"
    );
    assert.equal(toggleProfileButtonsBeforeOpen.length, 1);
    fireEvent(toggleProfileButtonsBeforeOpen[0]!, "click");
    const profileOverlayText = readTreeText(environment.app);
    assert.match(profileOverlayText, /OPERATOR PROFILE/);
    assert.doesNotMatch(profileOverlayText, /Persistent operator records live here/);
    assert.doesNotMatch(profileOverlayText, /Autosave on close/);
    const profileGrid = findElementsByClass(environment.app, "forge-profile-grid");
    assert.equal(profileGrid.length, 1);
    const profileSectionBodies = findElementsByClass(environment.app, "forge-profile-section__body");
    assert.equal(profileSectionBodies.length, 2);

    const editEquipmentButton = environment.app
      .querySelectorAll("[data-forge-action='start-profile-edit']")
      .find(
        (element) =>
          element.dataset["forgeProfileKind"] === "equipment" &&
          element.dataset["forgeProfileKey"] === "multimeter"
      );
    assert.ok(editEquipmentButton);
    fireEvent(editEquipmentButton, "click");
    const equipmentLabelInput = environment.app.querySelector(
      "#forge-profile-editor-equipment-label"
    );
    assert.ok(equipmentLabelInput);
    assert.equal(equipmentLabelInput.value, "Multimeter");
    const inlineEditor = equipmentLabelInput.parentElement;
    assert.ok(inlineEditor);
    assert.equal(inlineEditor.className.includes("forge-inline-editor"), true);
    const equipmentEditorWrap = inlineEditor.parentElement;
    assert.ok(equipmentEditorWrap);
    assert.equal(equipmentEditorWrap.className.includes("forge-profile-record__editor"), true);
    const equipmentRecord = equipmentEditorWrap.parentElement;
    assert.ok(equipmentRecord);
    assert.equal(equipmentRecord.className.includes("forge-profile-record"), true);
    assert.match(readTreeText(equipmentRecord), /Multimeter/);
    const cancelProfileEntryButton = environment.app.querySelector(
      "[data-forge-action='cancel-profile-entry']"
    );
    assert.ok(cancelProfileEntryButton);
    fireEvent(cancelProfileEntryButton, "click");

    const addSkillButton = environment.app
      .querySelectorAll("[data-forge-action='start-profile-create']")
      .find((element) => element.dataset["forgeProfileKind"] === "skill");
    assert.ok(addSkillButton);
    fireEvent(addSkillButton, "click");
    const skillLabelInput = environment.app.querySelector(
      "#forge-profile-editor-skill-label"
    );
    const skillLevelSelect = environment.app.querySelector(
      "#forge-profile-editor-skill-level"
    );
    assert.ok(skillLabelInput);
    assert.ok(skillLevelSelect);
    skillLabelInput.value = "Soldering";
    skillLevelSelect.value = "advanced";
    const commitProfileEntryButton = environment.app.querySelector(
      "[data-forge-action='commit-profile-entry']"
    );
    assert.ok(commitProfileEntryButton);
    fireEvent(commitProfileEntryButton, "click");
    const toggleProfileButtonsAfterOpen = environment.app.querySelectorAll(
      "[data-forge-action='toggle-profile-editor']"
    );
    assert.equal(toggleProfileButtonsAfterOpen.length, 3);
    fireEvent(toggleProfileButtonsAfterOpen.at(-1)!, "click");
    assert.equal(environment.sentEvents.at(-1)?.command, "ForgeRoomUpdateOperatorProfile");
    const profilePayload = environment.sentEvents.at(-1)?.payload as {
      equipment?: Array<{ equipmentKey: string; label?: string; status: string }>;
      preferences?: { mode?: string };
      skills?: Array<{ label?: string; level: string; skillKey: string }>;
    };
    assert.equal(profilePayload.preferences?.mode, "learn_first");
    assert.ok(
      profilePayload.skills?.some(
        (entry) =>
          entry.label === "Soldering" &&
          entry.level === "advanced" &&
          entry.skillKey.startsWith("skill-")
      )
    );
    assert.ok(
      profilePayload.skills?.some(
        (entry) => entry.skillKey === "measurement" && entry.level === "basic"
      )
    );
    assert.deepEqual(profilePayload.equipment, [
      {
        equipmentKey: "multimeter",
        label: "Multimeter",
        status: "unavailable",
      },
    ]);
    assert.equal(toggleProfileButtonsAfterOpen.length >= 2, true);
    environment.emitHostMessage({
      type: "command-result",
      command: "ForgeRoomUpdateOperatorProfile",
      result: {
        success: true,
        message: null,
      },
    });
    const closeProfileButton = environment.app.querySelector(
      "[data-forge-action='toggle-profile-editor']"
    );
    assert.ok(closeProfileButton);
    fireEvent(closeProfileButton, "click");

    const sessionStageNavButtons = environment.app.querySelectorAll("[data-forge-action='open-stage']");
    const sessionNextButton = sessionStageNavButtons.find(
      (element) => element.dataset["forgeActionValue"] === "preflight"
    );
    assert.ok(sessionNextButton);
    assert.equal(sessionNextButton.disabled, false);
    fireEvent(sessionNextButton, "click");
    assert.deepEqual(environment.sentEvents.at(-1), {
      command: "ForgeRoomUpdateGoal",
      payload: {
        summary: "Repair Room integration",
        brief: "Document the repair boundary.",
        constraints: ["Keep the scope local.", "Preserve host logic."],
        targetRoomId: "repair-room",
      },
    });
    environment.emitHostMessage({
      type: "command-result",
      command: "ForgeRoomUpdateGoal",
      result: {
        success: true,
        message: null,
      },
    });
    assert.ok(environment.app.querySelector("[data-forge-active-stage='preflight']"));

    const stageHeaders = findElementsByClass(environment.app, "forge-stage__header");
    const sessionHeader = stageHeaders.find((element) => element.dataset["forgeActionValue"] === "session");
    assert.ok(sessionHeader);
    fireEvent(sessionHeader, "click");
    assert.equal(environment.sentEvents.at(-1)?.command, "ForgeRoomSaveSession");
    environment.emitHostMessage({
      type: "command-result",
      command: "ForgeRoomSaveSession",
      result: {
        success: true,
        message: null,
      },
    });
    assert.ok(environment.app.querySelector("[data-forge-active-stage='session']"));

    const contextChips = environment.app.querySelectorAll("[data-forge-context-chip]");
    assert.ok(contextChips.some((element) => element.dataset["forgeContextKey"] === "measurement"));
    assert.ok(contextChips.some((element) => element.dataset["forgeContextKey"] === "multimeter"));
    assert.ok(environment.app.querySelector("#forge-run-override-mode"));
    assert.ok(environment.app.querySelector("#forge-run-override-risk"));

    const sessionStageButtons = environment.app.querySelectorAll("[data-forge-action='open-stage']");
    const preflightNextButton = sessionStageButtons.find(
      (element) => element.dataset["forgeActionValue"] === "preflight"
    );
    assert.ok(preflightNextButton);
    fireEvent(preflightNextButton, "click");
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
    assert.ok(environment.app.querySelector("[data-forge-action='run-preflight']"));
    assert.match(readTreeText(environment.app), /Hayalet/);
    assert.match(readTreeText(environment.app), /Run Preflight/);
    assert.match(readTreeText(environment.app), /Result preview/);

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
      presence: {
        assistant: {
          assigned: false,
          nickname: "Hayalet",
          avatar: "/avatars/ai0.png",
          connected: false,
        },
        user: {
          nickname: "Operator",
        },
        slots: {
          ai1: {
            assigned: true,
            nickname: "Architect One",
            avatar: "/avatars/ai1.png",
            connected: true,
          },
          ai2: {
            assigned: true,
            nickname: "Architect Two",
            avatar: "/avatars/ai2.png",
            connected: false,
          },
        },
      },
      assistant: {
        assigned: false,
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
        ...({
          activeSessionId: "forge-session-smoke",
          currentGoal: {
            id: "forge-goal-smoke",
            summary: "Repair Room integration",
            brief: "Prepare the first Forge session.",
            constraints: ["Keep the scope local."],
            acceptanceCriteria: ["Repair Room can read the handoff package."],
            status: "draft",
            targetRoomId: "repair-room",
            createdAt: "2026-04-15T00:00:00.000Z",
            updatedAt: "2026-04-15T00:10:00.000Z",
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
              measurement: "basic",
              mechanical: null,
            },
            tools: {
              multimeter: false,
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
          approvedTasks: [
            {
              id: "forge-task-approved-1",
              parentTaskId: null,
              level: 1,
              title: "Prepare export",
              summary: "Shape the final handoff.",
              executionKind: "task",
              dependsOnTaskIds: [],
              assignable: true,
              dispatchMode: "single-owner",
              seatId: "ai1",
              roleId: "architect",
              compareSeatIds: [],
              personaPresetId: "gok",
              status: "approved",
            },
          ],
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
            lastUpdatedAt: "2026-04-15T00:00:00.000Z",
          },
          sessionList: [],
          runOverride: null,
          runSignature: {
            value: "repair-room-signature",
            updatedAt: "2026-04-15T00:00:00.000Z",
            source: ["goal", "operator"],
          },
          decisionTrace: [],
        } as Record<string, unknown>),
        preflight: {
          activeStepId: null,
          bundle: {
            rovoPreAnalysis: {
              summary: "AI0 is offline",
            },
          },
          errorMessage: "AI0 is offline",
          promptCharCount: 1791,
          ranAt: "2026-04-15T00:00:00.000Z",
          staleReason: null,
          status: "warning",
          warnings: ["AI0 is offline", "AI0 is offline"],
        },
      },
      meta: {
        roleCatalog: {},
        personaPresets: {},
      },
    });
    const disabledPreflightButton = environment.app.querySelector(
      "[data-forge-action='run-preflight']"
    );
    assert.ok(disabledPreflightButton);
    assert.equal(disabledPreflightButton.disabled, true);
    const offlineText = readTreeText(environment.app);
    assert.equal((offlineText.match(/AI0 is offline/g) ?? []).length, 1);
    const preflightAgent = findElementsByClass(environment.app, "forge-preflight-agent")[0] ?? null;
    assert.ok(preflightAgent);
    assert.equal(
      findElementsByClass(preflightAgent, "forge-profile-identity__avatar--fallback").length,
      0
    );
    assert.ok(
      findElementsByClass(preflightAgent, "forge-profile-identity__avatar").some(
        (element) => element.tagName === "img"
      )
    );

    const preflightStageButtons = environment.app.querySelectorAll("[data-forge-action='open-stage']");
    const preflightPreviousButton = preflightStageButtons.find(
      (element) => element.dataset["forgeActionValue"] === "session"
    );
    assert.ok(preflightPreviousButton);
    assert.equal(preflightPreviousButton.disabled, false);

    const runConditionInput = environment.app.querySelector(
      "#forge-run-override-condition-input"
    );
    assert.ok(runConditionInput);
    runConditionInput.value = "Protect nearby plastic";
    fireEvent(runConditionInput, "input");
    const commitConditionButton = environment.app.querySelector(
      "[data-forge-action='commit-run-condition']"
    );
    assert.ok(commitConditionButton);
    fireEvent(commitConditionButton, "click");
    assert.deepEqual(environment.sentEvents.at(-1), {
      command: "ForgeRoomUpdateRunOverride",
      payload: {
        architectSeatId: "ai1",
        enableRovoPreAnalysis: false,
        notes: "",
        temporaryConditions: ["Protect nearby plastic"],
      },
    });
    const removeConditionButton = environment.app.querySelector(
      "[data-forge-remove-run-condition]"
    );
    assert.ok(removeConditionButton);
    fireEvent(removeConditionButton, "click");
    assert.deepEqual(environment.sentEvents.at(-1), {
      command: "ForgeRoomUpdateRunOverride",
      payload: {
        architectSeatId: "ai1",
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

    const refreshedPreflightStageButtons = environment.app.querySelectorAll(
      "[data-forge-action='open-stage']"
    );
    const refreshedPreflightPreviousButton = refreshedPreflightStageButtons.find(
      (element) => element.dataset["forgeActionValue"] === "session"
    );
    assert.ok(refreshedPreflightPreviousButton);
    fireEvent(refreshedPreflightPreviousButton, "click");
    environment.emitHostMessage({
      type: "command-result",
      command: "ForgeRoomSaveSession",
      result: {
        success: true,
        message: null,
      },
    });
    assert.ok(environment.app.querySelector("[data-forge-active-stage='session']"));

    const multimeterSelection = environment.app
      .querySelectorAll("[data-forge-context-chip]")
      .find((element) => element.dataset["forgeContextKey"] === "multimeter");
    assert.ok(multimeterSelection);
    fireEvent(multimeterSelection, "click");
    assert.ok(environment.sentCommands.includes("ForgeRoomUpdateSessionContext"));
    const measurementSelection = environment.app
      .querySelectorAll("[data-forge-context-chip]")
      .find((element) => element.dataset["forgeContextKey"] === "measurement");
    assert.ok(measurementSelection);
    fireEvent(measurementSelection, "click");
    assert.deepEqual(environment.sentEvents.at(-1), {
      command: "ForgeRoomUpdateSessionContext",
      payload: {
        skillKeys: ["measurement"],
        equipmentKeys: ["multimeter"],
        preferenceKeys: [],
      },
    });
    assert.match(readTreeText(environment.app), /Multimeter/);

    const operatorToPreflightButtons = environment.app.querySelectorAll(
      "[data-forge-action='open-stage']"
    );
    const operatorToPreflightButton = operatorToPreflightButtons.find(
      (element) => element.dataset["forgeActionValue"] === "preflight"
    );
    assert.ok(operatorToPreflightButton);
    fireEvent(operatorToPreflightButton, "click");
    environment.emitHostMessage({
      type: "command-result",
      command: "ForgeRoomSaveSession",
      result: {
        success: true,
        message: null,
      },
    });

    const preflightToTrackingButtons = environment.app.querySelectorAll(
      "[data-forge-action='open-stage']"
    );
    const trackingNextButton = preflightToTrackingButtons.find(
      (element) => element.dataset["forgeActionValue"] === "tracking"
    );
    assert.ok(trackingNextButton);
    fireEvent(trackingNextButton, "click");
    environment.emitHostMessage({
      type: "command-result",
      command: "ForgeRoomSaveSession",
      result: {
        success: true,
        message: null,
      },
    });
    const trackingText = readTreeText(environment.app);
    assert.match(trackingText, /Architect One/);
    assert.match(trackingText, /Architect Two/);
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
    const trackingToDraftButtons = environment.app.querySelectorAll(
      "[data-forge-action='open-stage']"
    );
    const draftNextButton = trackingToDraftButtons.find(
      (element) => element.dataset["forgeActionValue"] === "draft"
    );
    assert.ok(draftNextButton);
    fireEvent(draftNextButton, "click");
    environment.emitHostMessage({
      type: "command-result",
      command: "ForgeRoomSaveSession",
      result: {
        success: true,
        message: null,
      },
    });
    assert.ok(environment.app.querySelector("[data-forge-active-stage='draft']"));
    assert.ok(environment.app.querySelector("[data-forge-panel='approved']"));
    assert.ok(environment.app.querySelector("#forge-approved-mode-forge-task-approved-1"));
    assert.equal(
      environment.app.querySelector("#forge-approved-capsule-summary-forge-task-approved-1"),
      null
    );
    assert.match(readTreeText(environment.app), /Advanced capsule/);

    environment.emitHostMessage({
      type: "forge-state",
      snapshot: {
        activeSessionId: "forge-session-smoke",
        currentGoal: {
          id: "forge-goal-smoke",
          summary: "Repair Room integration",
          brief: "Prepare the first Forge session.",
          constraints: ["Keep the scope local."],
          acceptanceCriteria: ["Repair Room can read the handoff package."],
          status: "synthesis-ready",
          targetRoomId: "repair-room",
          createdAt: "2026-04-15T00:00:00.000Z",
          updatedAt: "2026-04-15T00:10:00.000Z",
        },
        draftTasks: [],
        draftSourceText: null,
        validationMessages: [],
        approvedTasks: [
          {
            id: "forge-task-approved-1",
            parentTaskId: null,
            level: 1,
            title: "Prepare export",
            summary: "Shape the final handoff.",
            executionKind: "task",
            dependsOnTaskIds: [],
            assignable: true,
            dispatchMode: "compare",
            seatId: "ai1",
            roleId: "architect",
            compareSeatIds: ["ai2"],
            personaPresetId: "gok",
            status: "answered",
          },
        ],
        assignments: [
          {
            id: "forge-assignment-1",
            taskId: "forge-task-approved-1",
            mode: "compare",
            seatId: "ai1",
            roleId: "architect",
            personaPresetId: "gok",
            requestId: "forge-request-1",
            startedAt: "2026-04-15T00:02:00.000Z",
            status: "completed",
            queuedAt: "2026-04-15T00:00:00.000Z",
            responseId: "forge-response-1",
            errorMessage: null,
            archiveRef: null,
            completedAt: "2026-04-15T00:03:00.000Z",
          },
          {
            id: "forge-assignment-2",
            taskId: "forge-task-approved-1",
            mode: "compare",
            seatId: "ai2",
            roleId: "challenger",
            personaPresetId: "rovo",
            requestId: "forge-request-2",
            startedAt: "2026-04-15T00:02:00.000Z",
            status: "completed",
            queuedAt: "2026-04-15T00:00:00.000Z",
            responseId: "forge-response-2",
            errorMessage: null,
            archiveRef: null,
            completedAt: "2026-04-15T00:03:30.000Z",
          },
        ],
        exports: [],
        exportSummary: {
          acceptanceCriteriaCount: 1,
          exportReady: false,
          missingRequirements: ["Resolve the open conflict"],
          openConflictCount: 1,
          reason: "Export blocked: Resolve the open conflict.",
          selectedSynthesisId: null,
          status: "blocked",
          targetRoomId: "repair-room",
        },
        responses: [
          {
            id: "forge-response-1",
            assignmentId: "forge-assignment-1",
            taskId: "forge-task-approved-1",
            seatId: "ai1",
            roleId: "architect",
            personaPresetId: "gok",
            summary: "Lead with a compact export contract.",
            body: "Create the export around a compact contract first.",
            rawText: "Create the export around a compact contract first.",
            archiveRef: null,
            artifacts: [],
            status: "captured",
            createdAt: "2026-04-15T00:03:00.000Z",
          },
          {
            id: "forge-response-2",
            assignmentId: "forge-assignment-2",
            taskId: "forge-task-approved-1",
            seatId: "ai2",
            roleId: "challenger",
            personaPresetId: "rovo",
            summary: "Favor a wider checklist before export.",
            body: "Add a broader checklist before packaging the handoff.",
            rawText: "Add a broader checklist before packaging the handoff.",
            archiveRef: null,
            artifacts: [],
            status: "captured",
            createdAt: "2026-04-15T00:03:30.000Z",
          },
        ],
        conflicts: [
          {
            id: "forge-conflict-1",
            taskId: "forge-task-approved-1",
            kind: "approach",
            status: "open",
            summary: "The two answers disagree on how much contract detail should ship first.",
            responseIds: ["forge-response-1", "forge-response-2"],
            preferredResponseId: null,
            resolutionNote: null,
            createdAt: "2026-04-15T00:04:00.000Z",
          },
        ],
        syntheses: [],
        selectedSynthesisId: null,
        coordinatorState: {
          actorId: "coordinator",
          planStatus: "reviewing-conflicts",
          assignmentQueueTotal: 0,
          pendingAssignmentCount: 0,
          completedResponseCount: 2,
          pendingConflictCount: 1,
          synthesisStatus: "blocked",
          exportReady: false,
          lastExportPath: null,
          note: "A decision is needed before synthesis.",
          lastUpdatedAt: "2026-04-15T00:04:00.000Z",
        },
        sessionList: [],
      },
      meta: {
        roleCatalog: {
          architect: {
            id: "architect",
            label: "Architect",
            localActor: false,
          },
          challenger: {
            id: "challenger",
            label: "Challenger",
            localActor: false,
          },
        },
        personaPresets: {
          gok: {
            id: "gok",
            label: "Gok",
          },
          rovo: {
            id: "rovo",
            label: "Rovo",
          },
        },
      },
    });

    const conflictButtons = findElementsByClass(environment.app, "forge-statusbar__action");
    assert.equal(conflictButtons.length, 0);

    const conflictText = readTreeText(environment.app);
    assert.match(conflictText, /Responses & Decisions/);
    assert.match(conflictText, /RESPONSE LANE BLOCKED/);
    assert.match(conflictText, /REQUIRES: CONFLICT RESOLUTION/);
    assert.match(conflictText, /Lead with a compact export contract\./);
    assert.match(conflictText, /Favor a wider checklist before export\./);
    assert.match(conflictText, /SELECT ONE RESPONSE/);
    assert.match(conflictText, /1 decision left/);
    assert.ok(environment.app.querySelector("[data-forge-panel='responses']"));
    const conflictFlowSurfaceTab = environment.app
      .querySelectorAll("[data-forge-action='open-surface']")
      .find((element) => element.dataset["forgeSurface"] === "goal");
    const conflictOutputSurfaceTab = environment.app
      .querySelectorAll("[data-forge-action='open-surface']")
      .find((element) => element.dataset["forgeSurface"] === "synthesis");
    assert.ok(conflictFlowSurfaceTab);
    assert.ok(conflictOutputSurfaceTab);
    assert.equal(conflictFlowSurfaceTab.disabled, true);
    assert.equal(conflictOutputSurfaceTab.disabled, true);
    fireEvent(conflictFlowSurfaceTab, "click");
    assert.ok(environment.app.querySelector("[data-forge-panel='responses']"));
    assert.doesNotMatch(conflictText, /Required action/);
  } finally {
    await installedCopy.cleanup();
    environment.restore();
  }
});
