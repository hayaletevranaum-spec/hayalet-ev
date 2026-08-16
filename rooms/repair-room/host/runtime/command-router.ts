import {
  REPAIR_KNOWLEDGE_PACK_SCHEMA_VERSION,
  REPAIR_ROOM_ID,
  REPAIR_UI_COLORS,
  REPAIR_UI_COMMANDS,
} from "../../shared/repair-constants.js";
import { buildRepairAiAdaptation, createDefaultWizardState } from "../../shared/data/index.js";
import type {
  RepairChatTurn,
  RepairCommonFailure,
  RepairEvent,
  RepairInteractionSettingsState,
  RepairKnowledgePack,
  RepairKnowledgePackResource,
  RepairKnowledgePackResourceKind,
  RepairOverlayEntityRef,
  RepairPcbImageRef,
  RepairSession,
  RepairTestPoint,
  RepairVoiceGuidanceState,
  RepairWizardDraft,
  RepairWizardManualEvidenceDraft,
  RepairWizardManualNote,
  RepairWizardState,
} from "../../shared/types/index.js";
import type { ReplayRuntimeController } from "../repair-replay-runtime.js";
import type { RepairRuntimeState } from "../state/repair-runtime-state.js";
import type { RepairRuntimeStore } from "../state/repair-runtime-store.js";
import type { RepairAiController } from "./ai-controller.js";
import { isRepairAiTargetSlot } from "./ai-controller.js";
import {
  createAnnotationEvent,
  createEventId,
  createInvestigationRegionCreatedEvent,
  createMeasurementEvent,
  createMeasurementReading,
  createSnapshotEvent,
} from "./event-factory.js";
import {
  isAiMarkLifecycleState,
  isAmbientListeningState,
  isAnnotationTool,
  isCameraFeedPreference,
  isDictationRoute,
  isDictationSubmitMode,
  isInvestigationRegionStatus,
  isOperationalProfile,
  isSettingsOverlayTab,
  isSpokenGuidanceMode,
  isTtsRoute,
  isWorkbenchTool,
  normalizeRepairConsumablePatch,
  normalizeRepairPreferencesPatch,
  normalizeRepairSafetyPatch,
  normalizeRepairSkillsPatch,
  normalizeRepairToolPatch,
  safeImageRect,
  safeNumber,
  safeOverlayEntityRef,
  safeOverlayEntityRefs,
  safeRecord,
  safeString,
} from "./guards.js";
import type { RepairLayoutController } from "./layout-controller.js";
import type { RepairLiveController } from "./live-controller.js";
import type { RepairOperationsController } from "./operations-controller.js";
import {
  collectKnowledgePromotionLinkage,
  findKnowledgeSpatialRegion,
} from "./overlay-selection.js";
import type { RepairSessionController } from "./session-controller.js";
import {
  createEvidenceSelectionFromDraft,
  createDraftSession,
  getActiveSession,
  hasRequiredWizardDeviceInfo,
  hasWizardSymptoms,
  patchWizardDraftFromPayload,
} from "./session-helpers.js";
import type { RepairStorageController } from "./storage-controller.js";

export interface RepairCommandPayload {
  roomArgs?: Record<string, unknown>;
  roomPayload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface RepairCommandRouter {
  handleCommand: (
    command: string,
    payload?: RepairCommandPayload
  ) => {
    success: boolean;
    message?: string;
  };
}

const WIZARD_STEP_ORDER: RepairWizardState["currentStep"][] = [
  "device-info",
  "symptoms",
  "ai-research",
  "evidence-review",
  "ready",
];
const LOCAL_KNOWLEDGE_RESOURCE_PREFIXES = ["shared/assets/", "main-functions/", "i18n/"];

function nowIso(): string {
  return new Date().toISOString();
}

export function createRepairCommandRouter(params: {
  aiController: RepairAiController;
  api: { log: (level: string, message: string) => void };
  layoutController: RepairLayoutController;
  liveController: RepairLiveController;
  operationsController: RepairOperationsController;
  pushState: () => void;
  replayController: ReplayRuntimeController;
  sessionController: RepairSessionController;
  setActiveSessionDerivedState: (session: RepairSession | null) => void;
  storageController: RepairStorageController;
  store: RepairRuntimeStore;
}): RepairCommandRouter {
  const {
    aiController,
    api,
    layoutController,
    liveController,
    operationsController,
    pushState,
    replayController,
    sessionController,
    setActiveSessionDerivedState,
    storageController,
    store,
  } = params;

  function isWizardStep(value: unknown): value is RepairWizardState["currentStep"] {
    return WIZARD_STEP_ORDER.includes(value as RepairWizardState["currentStep"]);
  }

  function canEnterWizardStep(
    wizard: RepairWizardState,
    step: RepairWizardState["currentStep"]
  ): boolean {
    const deviceReady = hasRequiredWizardDeviceInfo(wizard.draft);
    const symptomsReady = hasWizardSymptoms(wizard.draft);
    if (step === "device-info") return true;
    if (step === "symptoms") return deviceReady;
    if (step === "ai-research") return deviceReady && symptomsReady;
    if (step === "evidence-review") {
      return (
        deviceReady &&
        symptomsReady &&
        (wizard.generatedKnowledgePackId !== null || wizard.draft.researchSkipped)
      );
    }
    return (
      deviceReady &&
      symptomsReady &&
      (wizard.generatedKnowledgePackId !== null || wizard.draft.researchSkipped)
    );
  }

  function createResetWizardState(): RepairWizardState {
    return {
      ...createDefaultWizardState(),
      draft: {
        ...createDefaultWizardState().draft,
        customSymptoms: [],
        primarySymptoms: [],
        selectedEvidenceResourceIds: [],
        selectedFailureIds: [],
        selectedTestPointIds: [],
      },
      foundResources: [],
      researchProgress: [],
    };
  }

  function readStringArrayField(value: unknown): string[] | null {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : null;
  }

  function isKnowledgeResourceKind(value: unknown): value is RepairKnowledgePackResourceKind {
    return (
      value === "schematic" ||
      value === "board-image" ||
      value === "thread" ||
      value === "datasheet" ||
      value === "note"
    );
  }

  function normalizeKnowledgeResourceUrl(value: unknown): string | null {
    const raw = safeString(value);
    if (raw === null) return null;
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    if (LOCAL_KNOWLEDGE_RESOURCE_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
      return trimmed;
    }
    try {
      const url = new URL(trimmed);
      return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "file:"
        ? url.toString()
        : null;
    } catch {
      if (trimmed.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(trimmed)) {
        return trimmed;
      }
      return null;
    }
  }

  function slugifyKnowledgeResourceId(value: string, fallback: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug === "" ? fallback : slug;
  }

  function createManualKnowledgeResourceId(
    kind: RepairKnowledgePackResourceKind,
    label: string,
    resources: RepairKnowledgePackResource[]
  ): string {
    const existing = new Set(resources.map((resource) => resource.id));
    const base = `manual-${kind}-${slugifyKnowledgeResourceId(label, "resource")}`;
    if (!existing.has(base)) return base;
    let index = 2;
    while (existing.has(`${base}-${index}`)) {
      index += 1;
    }
    return `${base}-${index}`;
  }

  function createManualKnowledgePack(
    wizard: RepairWizardState,
    createdAt: string
  ): RepairKnowledgePack {
    const draft = wizard.draft;
    const modelNumber = draft.boardCode.trim() || draft.model.trim() || "Manual intake";
    const deviceLabel = [draft.manufacturer, draft.model]
      .map((value) => value.trim())
      .filter((value) => value !== "")
      .join(" / ");
    return {
      schemaVersion: REPAIR_KNOWLEDGE_PACK_SCHEMA_VERSION,
      id: `manual-${slugifyKnowledgeResourceId(modelNumber, "intake")}`,
      modelNumber,
      deviceLabel: deviceLabel || modelNumber,
      stats: {
        schematics: 0,
        boardImages: 0,
        commonFailures: 0,
        repairNotes: 0,
        testPoints: 0,
      },
      resources: [],
      commonFailures: [],
      testPoints: [],
      notes: [],
      createdAt,
    };
  }

  function createManualFailureId(
    label: string,
    pack: RepairKnowledgePack,
    manualEvidence: RepairWizardManualEvidenceDraft
  ): string {
    const existing = new Set([
      ...pack.commonFailures.map((failure) => failure.id),
      ...manualEvidence.failures.map((failure) => failure.id),
    ]);
    const base = `manual-failure-${slugifyKnowledgeResourceId(label, "finding")}`;
    if (!existing.has(base)) return base;
    let index = 2;
    while (existing.has(`${base}-${index}`)) index += 1;
    return `${base}-${index}`;
  }

  function createManualTestPointId(
    label: string,
    pack: RepairKnowledgePack,
    manualEvidence: RepairWizardManualEvidenceDraft
  ): string {
    const existing = new Set([
      ...pack.testPoints.map((point) => point.id),
      ...manualEvidence.testPoints.map((point) => point.id),
    ]);
    const base = `manual-test-point-${slugifyKnowledgeResourceId(label, "point")}`;
    if (!existing.has(base)) return base;
    let index = 2;
    while (existing.has(`${base}-${index}`)) index += 1;
    return `${base}-${index}`;
  }

  function createManualNoteId(
    text: string,
    manualEvidence: RepairWizardManualEvidenceDraft
  ): string {
    const existing = new Set(manualEvidence.notes.map((note) => note.id));
    const base = `manual-note-${slugifyKnowledgeResourceId(text.slice(0, 48), "note")}`;
    if (!existing.has(base)) return base;
    let index = 2;
    while (existing.has(`${base}-${index}`)) index += 1;
    return `${base}-${index}`;
  }

  function createPackNoteId(index: number): string {
    return `note-ai-${index + 1}`;
  }

  function addUniqueId(values: string[], id: string): string[] {
    return values.includes(id) ? values : [...values, id];
  }

  function removeId(values: string[], id: string): string[] {
    return values.filter((value) => value !== id);
  }

  function parseNumericField(value: unknown, fallback: number): number {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }

  function createKnowledgePackStats(
    resources: RepairKnowledgePackResource[],
    failures: RepairCommonFailure[],
    testPoints: RepairTestPoint[],
    notes: string[]
  ): RepairKnowledgePack["stats"] {
    return {
      schematics: resources.filter((item) => item.kind === "schematic").length,
      boardImages: resources.filter((item) => item.kind === "board-image").length,
      commonFailures: failures.length,
      repairNotes: notes.length + resources.filter((item) => item.kind === "note").length,
      testPoints: testPoints.length,
    };
  }

  function createCapturedBoardImageRef(
    session: RepairSession,
    eventId: string,
    payload: Record<string, unknown>,
    fallbackIso: string
  ): RepairPcbImageRef | null {
    const src = safeString(payload["thumbnailSrc"] ?? payload["assetPath"] ?? payload["src"]);
    if (src === null) return null;
    const preview = store.getState().livePreview;
    const widthPx = Math.max(
      1,
      Math.round(
        parseNumericField(payload["widthPx"], preview?.width ?? session.pcbImage?.widthPx ?? 1280)
      )
    );
    const heightPx = Math.max(
      1,
      Math.round(
        parseNumericField(payload["heightPx"], preview?.height ?? session.pcbImage?.heightPx ?? 720)
      )
    );
    const pixelsPerMm = Math.max(
      0.1,
      parseNumericField(payload["pixelsPerMm"], session.pcbImage?.pixelsPerMm ?? 8)
    );
    return {
      id: `pcb-capture-${eventId}`,
      label:
        safeString(payload["boardImageLabel"]) ??
        safeString(payload["caption"]) ??
        `Captured board image ${fallbackIso}`,
      src,
      pixelsPerMm,
      widthPx,
      heightPx,
    };
  }

  function createKnowledgePackFromReviewDraft(
    pack: RepairKnowledgePack,
    draft: RepairWizardDraft
  ): RepairKnowledgePack {
    const manualEvidence = draft.manualEvidence;
    const removedResourceIds = new Set(manualEvidence.removedResourceIds);
    const removedFailureIds = new Set(manualEvidence.removedFailureIds);
    const removedTestPointIds = new Set(manualEvidence.removedTestPointIds);
    const removedNoteIds = new Set(manualEvidence.removedNoteIds);
    const resources = [
      ...pack.resources.filter((resource) => !removedResourceIds.has(resource.id)),
      ...manualEvidence.resources,
    ];
    const commonFailures = [
      ...pack.commonFailures.filter((failure) => !removedFailureIds.has(failure.id)),
      ...manualEvidence.failures,
    ];
    const testPoints = [
      ...pack.testPoints.filter((point) => !removedTestPointIds.has(point.id)),
      ...manualEvidence.testPoints,
    ];
    const notes = [
      ...pack.notes.filter((_note, index) => !removedNoteIds.has(createPackNoteId(index))),
      ...manualEvidence.notes.map((note) => note.text),
    ];
    return {
      ...pack,
      commonFailures,
      notes,
      resources,
      stats: createKnowledgePackStats(resources, commonFailures, testPoints, notes),
      testPoints,
    };
  }

  function uniqueStringList(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    values.forEach((value) => {
      const trimmed = value.trim();
      if (trimmed === "" || seen.has(trimmed)) return;
      seen.add(trimmed);
      result.push(trimmed);
    });
    return result;
  }

  function isHistoricalReviewState(): boolean {
    const workbench = store.getState().workbench;
    return (
      workbench.timeline.replayMode === "replay" ||
      workbench.timeline.replayMode === "paused" ||
      workbench.focusedEventId !== null ||
      workbench.investigationModeEnabled ||
      workbench.selection.selectedEventIds.length > 0 ||
      workbench.selection.selectedEntityRefs.length > 0 ||
      workbench.selection.inspectorEventId !== null ||
      workbench.selection.inspectorEntityRef !== null
    );
  }

  function clearHistoricalReviewForNewEvidence(): void {
    if (!isHistoricalReviewState()) return;
    replayController.followLive();
    store.dispatchMany([
      { type: "workbench/set-investigation-mode", enabled: false },
      { type: "knowledge-pack/set-spatial-focus", spatialRefId: null },
      { type: "workbench/focus-entity", ref: null, eventId: null },
      {
        type: "workbench/set-selection",
        focusedEventId: null,
        selection: {
          hoveredEventId: null,
          hoveredEntityRef: null,
          selectedEventIds: [],
          selectedEntityRefs: [],
          inspectorEventId: null,
          inspectorEntityRef: null,
          focusJumpEventId: null,
          focusJumpEntityRef: null,
        },
      },
    ]);
  }

  function readLinkedEventIds(payload: Record<string, unknown>): string[] {
    const linkedEventId = safeString(payload["linkedEventId"]);
    const linkedEventIds = Array.isArray(payload["linkedEventIds"])
      ? payload["linkedEventIds"].filter(
          (value): value is string => typeof value === "string" && value.trim() !== ""
        )
      : [];
    return uniqueStringList([
      ...linkedEventIds,
      ...(linkedEventId === null ? [] : [linkedEventId]),
    ]);
  }

  function getLatestSnapshotEventId(session: RepairSession, iso: string): string | null {
    const occurredAtMs = Date.parse(iso);
    for (let index = session.events.length - 1; index >= 0; index -= 1) {
      const event = session.events[index];
      if (event?.kind !== "snapshot") continue;
      const eventAtMs = Date.parse(event.occurredAt);
      if (!Number.isFinite(occurredAtMs) || eventAtMs <= occurredAtMs) return event.id;
    }
    return null;
  }

  function linkEventToActiveSnapshot<T extends RepairEvent>(
    event: T,
    session: RepairSession,
    payload: Record<string, unknown>
  ): T {
    if (event.kind === "snapshot" || event.kind === "session-start") return event;
    const snapshotEventId = getLatestSnapshotEventId(session, event.occurredAt);
    const linkedEventIds = uniqueStringList([
      ...event.linkedEventIds,
      ...readLinkedEventIds(payload),
      ...(snapshotEventId === null ? [] : [snapshotEventId]),
    ]);
    if (
      linkedEventIds.length === event.linkedEventIds.length &&
      linkedEventIds.every((eventId, index) => eventId === event.linkedEventIds[index])
    ) {
      return event;
    }
    return { ...event, linkedEventIds };
  }

  function handleCommand(
    command: string,
    payload: RepairCommandPayload = {}
  ): { success: boolean; message?: string } {
    const { roomArgs: cmdRoomArgs, roomPayload: cmdRoomPayload, ...rest } = payload;
    const flat = {
      ...(cmdRoomArgs ?? {}),
      ...(cmdRoomPayload ?? {}),
      ...rest,
    };

    switch (command) {
      case REPAIR_UI_COMMANDS.uiReady: {
        pushState();
        liveController.startLiveLoops();
        api.log("info", `[${REPAIR_ROOM_ID}] ui-ready phase=${store.getState().phase}`);
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.activateSession: {
        const sessionId = safeString(flat["sessionId"]);
        const session = sessionId === null ? null : (store.getState().sessions[sessionId] ?? null);
        const chatTurns =
          storageController.isReady() && session !== null
            ? storageController.getSessionChatTurns(session.id)
            : [];
        store.batch(() => {
          store.dispatch({ type: "session/activate", sessionId: session?.id ?? null });
          if (storageController.isReady()) {
            store.dispatch({
              type: "chat/set-turns",
              turns: chatTurns,
            });
          }
          setActiveSessionDerivedState(session);
        });
        liveController.resetTimelineAnchor(session);
        liveController.scheduleFeedStream();
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.createSession: {
        const iso = nowIso();
        const state = store.getState();
        const wizard = state.wizard;
        if (!hasRequiredWizardDeviceInfo(wizard.draft)) {
          return { success: false, message: "device intake is incomplete" };
        }
        if (!hasWizardSymptoms(wizard.draft)) {
          return { success: false, message: "at least one symptom is required" };
        }
        if (!canEnterWizardStep(wizard, "ready")) {
          return { success: false, message: "repair intake is not ready" };
        }
        const baseKnowledgePack = aiController.readGeneratedKnowledgePack();
        if (baseKnowledgePack !== null && !wizard.evidenceReviewed) {
          return { success: false, message: "evidence review is required before creating session" };
        }
        const sessionKnowledgePack =
          baseKnowledgePack === null
            ? null
            : createKnowledgePackFromReviewDraft(baseKnowledgePack, wizard.draft);
        const draftSession = createDraftSession(state, iso);
        const session: RepairSession = {
          ...draftSession,
          status: "in-progress",
          knowledgePackId: sessionKnowledgePack?.id ?? null,
          knowledgePack: sessionKnowledgePack,
          updatedAt: iso,
        };
        if (storageController.isReady()) {
          storageController.setSessionChatTurns(session.id, []);
          storageController.queuePersistEvidenceSelection(
            createEvidenceSelectionFromDraft(session.id, store.getState().wizard.draft, iso)
          );
        }
        store.batch(() => {
          sessionController.setSessionAndList(session, { skipTransitionCheck: true });
          store.dispatch({ type: "session/activate", sessionId: session.id });
          if (storageController.isReady()) {
            store.dispatch({ type: "chat/set-turns", turns: [] });
          }
          setActiveSessionDerivedState(session);
        });
        liveController.resetTimelineAnchor(session);
        store.dispatch({ type: "wizard/set", wizard: createResetWizardState() });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.updateSession: {
        const wizardPatch = patchWizardDraftFromPayload(flat);
        const state = store.getState();
        const session = getActiveSession(state);
        if (session === null) {
          if (wizardPatch !== null) {
            store.dispatch({ type: "wizard/patch-draft", patch: wizardPatch });
          }
          return { success: wizardPatch !== null, message: "active session is required" };
        }
        const iso = nowIso();
        const nextSession: RepairSession = {
          ...session,
          deviceInfo: {
            ...session.deviceInfo,
            deviceType: safeString(flat["deviceType"]) ?? session.deviceInfo.deviceType,
            manufacturer: safeString(flat["manufacturer"]) ?? session.deviceInfo.manufacturer,
            model: safeString(flat["model"]) ?? session.deviceInfo.model,
            boardCode: safeString(flat["boardCode"]) ?? session.deviceInfo.boardCode,
            serialNumber: safeString(flat["serialNumber"]) ?? session.deviceInfo.serialNumber,
            intakeNotes: safeString(flat["intakeNotes"]) ?? session.deviceInfo.intakeNotes,
          },
          symptoms: {
            ...session.symptoms,
            primarySymptoms:
              readStringArrayField(flat["primarySymptoms"]) ?? session.symptoms.primarySymptoms,
            freeText: safeString(flat["symptomFreeText"]) ?? session.symptoms.freeText,
          },
          updatedAt: iso,
        };
        store.batch(() => {
          if (wizardPatch !== null) {
            store.dispatch({ type: "wizard/patch-draft", patch: wizardPatch });
          }
          sessionController.setSessionAndList(nextSession, { skipTransitionCheck: true });
        });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.archiveSession: {
        const sessionId = safeString(flat["sessionId"]) ?? store.getState().activeSessionId;
        if (sessionId === null) return { success: false, message: "sessionId is required" };
        const session = store.getState().sessions[sessionId];
        if (session === undefined) return { success: false, message: "session was not found" };
        const iso = nowIso();
        const nextSession: RepairSession = {
          ...session,
          status: "archived",
          archivedAt: iso,
          updatedAt: iso,
        };
        const wasActive = store.getState().activeSessionId === sessionId;
        const saved = sessionController.setSessionAndList(nextSession);
        if (!saved) {
          return { success: false, message: "illegal session transition to archived" };
        }
        store.batch(() => {
          if (wasActive) {
            store.dispatch({ type: "session/activate", sessionId: null });
            setActiveSessionDerivedState(null);
          }
        });
        if (wasActive) {
          liveController.resetTimelineAnchor(null);
        }
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.deleteSession: {
        const sessionId = safeString(flat["sessionId"]) ?? store.getState().activeSessionId;
        if (sessionId === null) return { success: false, message: "sessionId is required" };
        const session = store.getState().sessions[sessionId];
        if (session === undefined) return { success: false, message: "session was not found" };
        const wasActive = store.getState().activeSessionId === sessionId;
        storageController.deleteSessionChatTurns(sessionId);
        store.batch(() => {
          sessionController.deleteSessionAndList(sessionId);
          if (wasActive) {
            store.dispatch({ type: "chat/set-turns", turns: [] });
            setActiveSessionDerivedState(null);
          }
        });
        if (wasActive) {
          liveController.resetTimelineAnchor(null);
          liveController.clearFeedStream();
        }
        storageController.updateReadyStorageState();
        storageController.queueDeleteSession(sessionId);
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.advanceWizard: {
        const requested = safeString(flat["step"]);
        const wizard = store.getState().wizard;
        const current = wizard.currentStep;
        const currentIndex = Math.max(0, WIZARD_STEP_ORDER.indexOf(current));
        const fallbackStep =
          WIZARD_STEP_ORDER[Math.min(currentIndex + 1, WIZARD_STEP_ORDER.length - 1)] ?? "ready";
        const nextStep = isWizardStep(requested) ? requested : fallbackStep;
        if (!canEnterWizardStep(wizard, nextStep)) {
          return { success: false, message: `wizard step ${nextStep} is not available yet` };
        }
        if (
          nextStep === "ready" &&
          wizard.generatedKnowledgePackId !== null &&
          !wizard.evidenceReviewed
        ) {
          store.dispatch({
            type: "wizard/set",
            wizard: {
              ...wizard,
              currentStep: "ready",
              evidenceReviewed: true,
            },
          });
          store.dispatch({ type: "phase/set", phase: "wizard-active" });
          return { success: true };
        }
        store.dispatchMany([
          { type: "wizard/advance", step: nextStep },
          {
            type: "phase/set",
            phase: "wizard-active",
          },
        ]);
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.startKnowledgeResearch: {
        const wizard = store.getState().wizard;
        if (!hasRequiredWizardDeviceInfo(wizard.draft)) {
          return { success: false, message: "device intake is incomplete" };
        }
        if (!hasWizardSymptoms(wizard.draft)) {
          return { success: false, message: "at least one symptom is required" };
        }
        const targetSlot = flat["targetSlot"];
        if (targetSlot !== undefined && !isRepairAiTargetSlot(targetSlot)) {
          return { success: false, message: "valid Assistant AI target slot is required" };
        }
        void aiController.startKnowledgeResearch(targetSlot === undefined ? {} : { targetSlot });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.skipKnowledgeResearch: {
        const wizard = store.getState().wizard;
        if (!hasRequiredWizardDeviceInfo(wizard.draft)) {
          return { success: false, message: "device intake is incomplete" };
        }
        if (!hasWizardSymptoms(wizard.draft)) {
          return { success: false, message: "at least one symptom is required" };
        }
        const manualPack = createManualKnowledgePack(wizard, nowIso());
        aiController.upsertKnowledgePack(manualPack, { cacheByBoardCode: false });
        store.dispatchMany([
          {
            type: "knowledge-pack/set",
            pack: manualPack,
            attachedToSessionId: null,
          },
          {
            type: "wizard/set",
            wizard: {
              ...wizard,
              currentStep: "evidence-review",
              draft: {
                ...wizard.draft,
                researchMessage:
                  "Asistan AI kanıt araştırması atlandı. Kanıtları incelemede manuel ekle.",
                researchSkipped: true,
                researchStatus: "skipped",
                selectedEvidenceResourceIds: [],
                selectedFailureIds: [],
                selectedTestPointIds: [],
              },
              evidenceReviewed: false,
              foundResources: [],
              generatedKnowledgePackId: manualPack.id,
              researchProgress: [],
            },
          },
          { type: "phase/set", phase: "wizard-active" },
        ]);
        aiController.setAiDispatchStatus("idle", "idle", {
          message: "Asistan AI kanıt araştırması atlandı; tamir kanıt paketi olmadan başlayabilir.",
          contextRefs: [wizard.draft.boardCode, wizard.draft.model].filter(
            (value) => value.trim() !== ""
          ),
        });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.updateEvidenceSelection: {
        const wizard = store.getState().wizard;
        const selectedEvidenceResourceIds =
          readStringArrayField(flat["selectedEvidenceResourceIds"]) ??
          wizard.draft.selectedEvidenceResourceIds;
        const selectedFailureIds =
          readStringArrayField(flat["selectedFailureIds"]) ?? wizard.draft.selectedFailureIds;
        const selectedTestPointIds =
          readStringArrayField(flat["selectedTestPointIds"]) ?? wizard.draft.selectedTestPointIds;
        const changed =
          selectedEvidenceResourceIds !== wizard.draft.selectedEvidenceResourceIds ||
          selectedFailureIds !== wizard.draft.selectedFailureIds ||
          selectedTestPointIds !== wizard.draft.selectedTestPointIds;
        if (!changed) return { success: false, message: "evidence selection patch is required" };

        const nextWizard: RepairWizardState = {
          ...wizard,
          draft: {
            ...wizard.draft,
            selectedEvidenceResourceIds,
            selectedFailureIds,
            selectedTestPointIds,
          },
        };
        store.dispatch({ type: "wizard/set", wizard: nextWizard });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.addKnowledgeResource: {
        const state = store.getState();
        const pack = aiController.readGeneratedKnowledgePack() ?? state.knowledgePack.pack;
        if (pack === null) {
          return { success: false, message: "knowledge pack is required" };
        }
        const wizard = state.wizard;
        const manualEvidence = wizard.draft.manualEvidence;
        const label = safeString(flat["label"] ?? flat["title"]);
        const url = normalizeKnowledgeResourceUrl(
          flat["url"] ?? flat["src"] ?? flat["sourceUrl"] ?? flat["downloadUrl"]
        );
        if (label === null || url === null) {
          return { success: false, message: "resource label and valid url are required" };
        }
        const kind = isKnowledgeResourceKind(flat["kind"]) ? flat["kind"] : "schematic";
        const resource: RepairKnowledgePackResource = {
          id: createManualKnowledgeResourceId(kind, label, [
            ...pack.resources,
            ...manualEvidence.resources,
          ]),
          label,
          kind,
          src: url,
          sourceUrl: url,
          downloadUrl: url,
          addedBy: "operator",
          source: "Operator added",
          pages: null,
          confidence: 1,
        };
        const selectedEvidenceResourceIds = addUniqueId(
          wizard.draft.selectedEvidenceResourceIds,
          resource.id
        );
        const foundResources = wizard.foundResources.some((item) => item.id === resource.id)
          ? wizard.foundResources
          : [
              ...wizard.foundResources,
              { id: resource.id, label: resource.label, kind: resource.kind },
            ];
        store.dispatch({
          type: "wizard/set",
          wizard: {
            ...wizard,
            draft: {
              ...wizard.draft,
              manualEvidence: {
                ...manualEvidence,
                resources: [...manualEvidence.resources, resource],
                removedResourceIds: removeId(manualEvidence.removedResourceIds, resource.id),
              },
              selectedEvidenceResourceIds,
              researchMessage: `${resource.label} staged for the repair session.`,
            },
            evidenceReviewed: false,
            foundResources,
          },
        });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.addKnowledgeFailure: {
        const state = store.getState();
        const pack = aiController.readGeneratedKnowledgePack() ?? state.knowledgePack.pack;
        if (pack === null) return { success: false, message: "knowledge pack is required" };
        const wizard = state.wizard;
        const manualEvidence = wizard.draft.manualEvidence;
        const label = safeString(flat["label"]);
        if (label === null) return { success: false, message: "failure label is required" };
        const failure: RepairCommonFailure = {
          id: createManualFailureId(label, pack, manualEvidence),
          label,
          rationale: safeString(flat["rationale"]) ?? "Operator added during manual review.",
          affectedPart: safeString(flat["affectedPart"]),
          recommendedAction:
            safeString(flat["recommendedAction"]) ?? "Inspect and verify manually.",
          confidence: 1,
        };
        store.dispatch({
          type: "wizard/set",
          wizard: {
            ...wizard,
            draft: {
              ...wizard.draft,
              manualEvidence: {
                ...manualEvidence,
                failures: [...manualEvidence.failures, failure],
                removedFailureIds: removeId(manualEvidence.removedFailureIds, failure.id),
              },
              selectedFailureIds: addUniqueId(wizard.draft.selectedFailureIds, failure.id),
              researchMessage: `${failure.label} staged for the repair session.`,
            },
            evidenceReviewed: false,
          },
        });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.addKnowledgeTestPoint: {
        const state = store.getState();
        const pack = aiController.readGeneratedKnowledgePack() ?? state.knowledgePack.pack;
        if (pack === null) return { success: false, message: "knowledge pack is required" };
        const wizard = state.wizard;
        const manualEvidence = wizard.draft.manualEvidence;
        const label = safeString(flat["label"]);
        const rail = safeString(flat["rail"]);
        if (label === null || rail === null) {
          return { success: false, message: "test point label and rail are required" };
        }
        const point: RepairTestPoint = {
          id: createManualTestPointId(label, pack, manualEvidence),
          label,
          rail,
          expectedValue: parseNumericField(flat["expectedValue"], 0),
          unit: safeString(flat["unit"]) ?? "V",
          tolerance:
            flat["tolerance"] === undefined ? null : parseNumericField(flat["tolerance"], 0),
          pinAt: null,
        };
        store.dispatch({
          type: "wizard/set",
          wizard: {
            ...wizard,
            draft: {
              ...wizard.draft,
              manualEvidence: {
                ...manualEvidence,
                removedTestPointIds: removeId(manualEvidence.removedTestPointIds, point.id),
                testPoints: [...manualEvidence.testPoints, point],
              },
              selectedTestPointIds: addUniqueId(wizard.draft.selectedTestPointIds, point.id),
              researchMessage: `${point.label} staged for the repair session.`,
            },
            evidenceReviewed: false,
          },
        });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.addKnowledgeNote: {
        const state = store.getState();
        const wizard = state.wizard;
        const manualEvidence = wizard.draft.manualEvidence;
        const textValue = safeString(flat["text"] ?? flat["note"]);
        if (textValue === null) return { success: false, message: "note text is required" };
        const note: RepairWizardManualNote = {
          id: createManualNoteId(textValue, manualEvidence),
          text: textValue,
          source: safeString(flat["source"]) ?? "Operator note",
          confidence: 1,
        };
        store.dispatch({
          type: "wizard/set",
          wizard: {
            ...wizard,
            draft: {
              ...wizard.draft,
              manualEvidence: {
                ...manualEvidence,
                notes: [...manualEvidence.notes, note],
                removedNoteIds: removeId(manualEvidence.removedNoteIds, note.id),
              },
              researchMessage: "Manual note staged for the repair session.",
            },
            evidenceReviewed: false,
          },
        });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.removeKnowledgeEvidence: {
        const state = store.getState();
        const wizard = state.wizard;
        const manualEvidence = wizard.draft.manualEvidence;
        const kind = safeString(flat["kind"] ?? flat["itemKind"]);
        const id = safeString(flat["id"] ?? flat["evidenceId"]);
        if (kind === null || id === null) {
          return { success: false, message: "evidence kind and id are required" };
        }
        let nextManualEvidence: RepairWizardManualEvidenceDraft;
        let selectedEvidenceResourceIds = wizard.draft.selectedEvidenceResourceIds;
        let selectedFailureIds = wizard.draft.selectedFailureIds;
        let selectedTestPointIds = wizard.draft.selectedTestPointIds;
        let foundResources = wizard.foundResources;
        if (kind === "resource") {
          const resources = manualEvidence.resources.filter((resource) => resource.id !== id);
          const removedResourceIds =
            resources.length === manualEvidence.resources.length
              ? addUniqueId(manualEvidence.removedResourceIds, id)
              : manualEvidence.removedResourceIds;
          nextManualEvidence = { ...manualEvidence, removedResourceIds, resources };
          selectedEvidenceResourceIds = removeId(selectedEvidenceResourceIds, id);
          foundResources = foundResources.filter((resource) => resource.id !== id);
        } else if (kind === "failure") {
          const failures = manualEvidence.failures.filter((failure) => failure.id !== id);
          const removedFailureIds =
            failures.length === manualEvidence.failures.length
              ? addUniqueId(manualEvidence.removedFailureIds, id)
              : manualEvidence.removedFailureIds;
          nextManualEvidence = { ...manualEvidence, failures, removedFailureIds };
          selectedFailureIds = removeId(selectedFailureIds, id);
        } else if (kind === "test-point") {
          const testPoints = manualEvidence.testPoints.filter((point) => point.id !== id);
          const removedTestPointIds =
            testPoints.length === manualEvidence.testPoints.length
              ? addUniqueId(manualEvidence.removedTestPointIds, id)
              : manualEvidence.removedTestPointIds;
          nextManualEvidence = { ...manualEvidence, removedTestPointIds, testPoints };
          selectedTestPointIds = removeId(selectedTestPointIds, id);
        } else if (kind === "note") {
          const notes = manualEvidence.notes.filter((note) => note.id !== id);
          const removedNoteIds =
            notes.length === manualEvidence.notes.length
              ? addUniqueId(manualEvidence.removedNoteIds, id)
              : manualEvidence.removedNoteIds;
          nextManualEvidence = { ...manualEvidence, notes, removedNoteIds };
        } else {
          return { success: false, message: "valid evidence kind is required" };
        }
        store.dispatch({
          type: "wizard/set",
          wizard: {
            ...wizard,
            draft: {
              ...wizard.draft,
              manualEvidence: nextManualEvidence,
              selectedEvidenceResourceIds,
              selectedFailureIds,
              selectedTestPointIds,
              researchMessage: "Evidence change staged for the repair session.",
            },
            evidenceReviewed: false,
            foundResources,
          },
        });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.attachKnowledgePack: {
        const state = store.getState();
        const packId = safeString(flat["packId"]) ?? state.wizard.generatedKnowledgePackId;
        const session = getActiveSession(state);
        const pack = packId === null ? null : aiController.getKnowledgePack(packId);
        if (session === null || pack === null)
          return { success: false, message: "session and pack are required" };
        if (state.wizard.generatedKnowledgePackId === pack.id && !state.wizard.evidenceReviewed) {
          return { success: false, message: "evidence review is required before attaching" };
        }
        const nextSession: RepairSession = {
          ...session,
          status: "in-progress",
          knowledgePackId: pack.id,
          knowledgePack: pack,
          updatedAt: nowIso(),
        };
        const saved = sessionController.setSessionAndList(nextSession);
        if (!saved) {
          return { success: false, message: "illegal session transition to in-progress" };
        }
        store.batch(() => {
          store.dispatch({
            type: "knowledge-pack/set",
            pack,
            attachedToSessionId: session.id,
          });
          store.dispatch({ type: "phase/set", phase: "session-active" });
        });
        liveController.resetTimelineAnchor(nextSession);
        liveController.scheduleFeedStream();
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.setActiveTool: {
        const tool = flat["tool"];
        if (!isWorkbenchTool(tool)) return { success: false, message: "valid tool is required" };
        const viewport = store.getState().workbench.viewport;
        if (tool === "zoom-in" || tool === "zoom-out") {
          const nextZoom = Math.min(
            4,
            Math.max(0.5, viewport.zoom + (tool === "zoom-in" ? 0.25 : -0.25))
          );
          return layoutController.applyViewportUpdate({
            viewportZoom: nextZoom,
            panXPx: viewport.panXPx,
            panYPx: viewport.panYPx,
          });
        }
        if (tool === "snapshot") {
          clearHistoricalReviewForNewEvidence();
          const session = getActiveSession(store.getState());
          if (session === null) return { success: false, message: "active session is required" };
          return {
            success: sessionController.appendEventToActiveSession(
              createSnapshotEvent(
                session.id,
                liveController.createLiveSessionIso(session),
                "Manual workbench snapshot captured."
              )
            ),
          };
        }
        if (tool === "freeze-frame") {
          return handleCommand(REPAIR_UI_COMMANDS.toggleFreezeFrame, {});
        }
        store.dispatch({ type: "workbench/set-tool", tool });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.toggleFreezeFrame: {
        let state = store.getState();
        const next = state.workbench.isFrozen === false;
        if (next) {
          clearHistoricalReviewForNewEvidence();
          state = store.getState();
        }
        const session = getActiveSession(state);
        const iso = session === null ? nowIso() : liveController.createLiveSessionIso(session);
        let success = true;
        store.batch(() => {
          store.dispatch({
            type: "workbench/set-frozen",
            isFrozen: next,
            frozenAt: next ? iso : null,
          });
          store.dispatch({
            type: "workbench/set-timeline",
            playheadMs: state.workbench.timeline.playheadMs,
            zoom: state.workbench.timeline.zoom,
            rangeStartMs: state.workbench.timeline.rangeStartMs,
            rangeEndMs: state.workbench.timeline.rangeEndMs,
            autoFollowLive: next === false && state.workbench.timeline.autoFollowLive,
            replayMode: next ? "freeze" : state.workbench.timeline.replayMode,
            isPlaying: next === false && state.workbench.timeline.isPlaying,
          });
          if (next && session !== null) {
            success = sessionController.appendEventToActiveSession(
              linkEventToActiveSnapshot(
                {
                  kind: "freeze-frame",
                  id: createEventId("evt-freeze", iso),
                  sessionId: session.id,
                  occurredAt: iso,
                  source: "operator",
                  linkedEventIds: [],
                  durationMs: 0,
                  reason: "Operator froze the live workbench frame.",
                },
                session,
                flat
              )
            );
          }
        });
        return { success };
      }
      case REPAIR_UI_COMMANDS.toggleOverlayLayer: {
        const layerId = safeString(flat["layerId"]);
        const visible = flat["visible"];
        if (layerId === null || typeof visible !== "boolean") {
          return { success: false, message: "layerId and visible are required" };
        }
        if (layerId in store.getState().workbench.visibleLayers) {
          store.dispatch({
            type: "workbench/toggle-layer",
            layerId: layerId as keyof RepairRuntimeState["workbench"]["visibleLayers"],
            visible,
          });
        }
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.addTimelineEvent: {
        clearHistoricalReviewForNewEvidence();
        const session = getActiveSession(store.getState());
        if (session === null) return { success: false, message: "active session is required" };
        const iso = liveController.createLiveSessionIso(session);
        const kind = safeString(flat["kind"]);
        const event =
          kind === "snapshot"
            ? createSnapshotEvent(
                session.id,
                iso,
                safeString(flat["caption"]) ?? "Snapshot captured.",
                safeString(flat["thumbnailSrc"] ?? flat["assetPath"] ?? flat["src"])
              )
            : linkEventToActiveSnapshot(
                createAnnotationEvent(
                  session.id,
                  iso,
                  isAnnotationTool(flat["tool"]) ? flat["tool"] : "rect",
                  flat
                ),
                session,
                flat
              );
        const success = sessionController.appendEventToActiveSession(event);
        if (success && kind === "snapshot" && flat["useAsBoardImage"] === true) {
          const nextSession = getActiveSession(store.getState());
          const boardImage = createCapturedBoardImageRef(session, event.id, flat, iso);
          if (nextSession !== null && boardImage !== null) {
            sessionController.setSessionAndList(
              {
                ...nextSession,
                pcbImage: boardImage,
                updatedAt: iso,
              },
              { skipTransitionCheck: true }
            );
          }
        }
        return { success };
      }
      case REPAIR_UI_COMMANDS.jumpToEvent: {
        const eventId = safeString(flat["eventId"]);
        replayController.jump(eventId);
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.scrubTimeline: {
        const session = getActiveSession(store.getState());
        const positionMs = safeNumber(flat["positionMs"]);
        if (session === null || positionMs === null)
          return { success: false, message: "positionMs is required" };
        const start = Date.parse(session.startedAt);
        const target = start + positionMs;
        const closest = session.events.reduce<RepairEvent | null>((best, event) => {
          if (best === null) return event;
          return Math.abs(Date.parse(event.occurredAt) - target) <
            Math.abs(Date.parse(best.occurredAt) - target)
            ? event
            : best;
        }, null);
        store.dispatchMany([{ type: "workbench/set-focus-event", eventId: closest?.id ?? null }]);
        replayController.scrub(positionMs);
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.addMeasurement: {
        const existingEventId = safeString(flat["eventId"]);
        if (existingEventId === null) clearHistoricalReviewForNewEvidence();
        const session = getActiveSession(store.getState());
        if (session === null) return { success: false, message: "active session is required" };
        const iso = liveController.createLiveSessionIso(session);
        if (existingEventId !== null) {
          const nextSession: RepairSession = {
            ...session,
            updatedAt: iso,
            events: session.events.map((event) =>
              event.kind === "measurement" && event.id === existingEventId
                ? {
                    ...event,
                    pinAt: {
                      xPx: safeNumber(flat["xPx"]) ?? event.pinAt?.xPx ?? 624,
                      yPx: safeNumber(flat["yPx"]) ?? event.pinAt?.yPx ?? 320,
                    },
                  }
                : event
            ),
          };
          store.batch(() => {
            sessionController.setSessionAndList(nextSession, { skipTransitionCheck: true });
            store.dispatch({ type: "workbench/set-focus-event", eventId: existingEventId });
          });
          return { success: true };
        }
        const reading = createMeasurementReading(iso, flat);
        const event = linkEventToActiveSnapshot(
          createMeasurementEvent(session.id, iso, reading, flat),
          session,
          flat
        );
        store.batch(() => {
          store.dispatch({ type: "measurement/append-reading", reading });
          store.dispatch({
            type: "measurement/set-display",
            display: reading.rawDisplay,
            value: reading.value,
            unit: reading.unit,
            range: reading.range,
            mode: reading.mode,
            label: reading.reference ?? reading.channel,
            hold: false,
          });
        });
        const success = sessionController.appendEventToActiveSession(event);
        if (success) {
          void aiController.requestMeasurementAiObservation(event);
          void aiController.requestSessionRiskDetection();
        }
        return { success };
      }
      case REPAIR_UI_COMMANDS.dismissAiMark: {
        const eventId = safeString(flat["eventId"]);
        const session = getActiveSession(store.getState());
        if (session === null || eventId === null)
          return { success: false, message: "eventId is required" };
        const target = session.events.find((event) => event.id === eventId);
        if (target?.kind !== "ai-mark") {
          return { success: false, message: "ai mark target is required" };
        }
        const iso = liveController.createLiveSessionIso(session);
        const lifecycleState = isAiMarkLifecycleState(flat["state"]) ? flat["state"] : "dismissed";
        const lifecycleEvent: RepairEvent = {
          kind: "ai-mark-lifecycle",
          id: createEventId("evt-ai-life", iso),
          sessionId: session.id,
          occurredAt: iso,
          source: "operator",
          linkedEventIds: [target.id],
          targetEventId: target.id,
          state: lifecycleState,
          reason:
            safeString(flat["reason"]) ?? `Operator moved Assistant AI mark to ${lifecycleState}.`,
        };
        return { success: sessionController.appendEventToActiveSession(lifecycleEvent) };
      }
      case REPAIR_UI_COMMANDS.setAiTargetSlot: {
        const targetSlot = flat["targetSlot"];
        if (!isRepairAiTargetSlot(targetSlot)) {
          return { success: false, message: "valid Assistant AI target slot is required" };
        }
        store.dispatch({ type: "ai-dispatch/set-target-slot", targetSlot });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.sendChatTurn: {
        const text = safeString(flat["text"]);
        if (text === null) return { success: false, message: "text is required" };
        const state = store.getState();
        const session = getActiveSession(state);
        const activeSessionId = state.activeSessionId;
        const turn: RepairChatTurn = {
          id: createEventId("chat-operator", nowIso()),
          role: "operator",
          text,
          occurredAt: nowIso(),
          contextRefs: activeSessionId === null ? [] : [activeSessionId],
        };
        store.batch(() => {
          store.dispatch({ type: "chat/append-turn", turn });
          store.dispatch({ type: "chat/set-composer", draft: "" });
          store.dispatch({ type: "chat/set-pending", turnId: turn.id });
          aiController.setAiDispatchStatus("chat-reply", "pending", {
            message: "Asistan AI cevap hazırlıyor.",
            contextRefs: Array.from(
              new Set([
                ...(session === null ? [] : [session.id, session.deviceInfo.boardCode]),
                turn.id,
              ])
            ),
          });
        });
        storageController.queuePersistActiveSessionChat();
        void aiController.requestChatReply(turn);
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.setChatComposer: {
        const draft = safeString(flat["draft"]) ?? "";
        store.dispatch({ type: "chat/set-composer", draft });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.updateOperatorProfile: {
        const profile = store.getState().operatorProfile;
        const displayName = safeString(flat["displayName"]);
        const profilePatch = safeRecord(flat["profile"]);
        const benchPatch = safeRecord(flat["bench"] ?? profilePatch?.["bench"]);
        const nextTools = normalizeRepairToolPatch(
          flat["tools"] ?? benchPatch?.["tools"],
          profile.bench.tools
        );
        const nextConsumables = normalizeRepairConsumablePatch(
          flat["consumables"] ?? benchPatch?.["consumables"],
          profile.bench.consumables
        );
        const nextSafety = normalizeRepairSafetyPatch(
          flat["safety"] ?? benchPatch?.["safety"],
          profile.bench.safety
        );
        const nextSkills = normalizeRepairSkillsPatch(
          flat["skills"] ?? profilePatch?.["skills"],
          profile.skills
        );
        const preferencePatch = normalizeRepairPreferencesPatch(
          flat["preferences"] ?? profilePatch?.["preferences"],
          profile.preferences
        );
        const nextProfile = {
          ...profile,
          bench: {
            tools: nextTools ?? profile.bench.tools,
            consumables: nextConsumables ?? profile.bench.consumables,
            safety: nextSafety ?? profile.bench.safety,
          },
          displayName:
            displayName ?? safeString(profilePatch?.["displayName"]) ?? profile.displayName,
          preferences: {
            ...profile.preferences,
            ...(preferencePatch ?? {}),
          },
          skills: nextSkills ?? profile.skills,
          updatedAt: nowIso(),
        };
        store.dispatch({
          type: "operator-profile/set",
          adaptation: buildRepairAiAdaptation(nextProfile),
          profile: nextProfile,
        });
        storageController.queuePersistActiveSessionChat();
        storageController.queuePersistOperatorProfile();
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.updateViewport:
        return layoutController.applyViewportUpdate(flat);
      case REPAIR_UI_COMMANDS.updateTimeline:
        return layoutController.applyTimelineUpdate(flat);
      case REPAIR_UI_COMMANDS.updatePanelLayout: {
        const result = layoutController.applyPanelLayoutUpdate(flat);
        if (result.success) storageController.queuePersistLayout();
        return result;
      }
      case REPAIR_UI_COMMANDS.updatePanelTab:
        return layoutController.applyPanelTabUpdate(flat);
      case REPAIR_UI_COMMANDS.updateFocus:
        return layoutController.applyFocusUpdate(flat);
      case REPAIR_UI_COMMANDS.setOperationalProfile: {
        const profile = flat["profile"] ?? flat["operationalProfile"];
        if (!isOperationalProfile(profile)) {
          return { success: false, message: "valid operational profile is required" };
        }
        store.dispatch({ type: "layout/set-operational-profile", profile });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.setVoiceGuidance: {
        const ambientListeningState = flat["ambientListeningState"];
        const spokenGuidanceMode = flat["spokenGuidanceMode"];
        const handsBusyMode = flat["handsBusyMode"];
        if (
          ambientListeningState !== undefined &&
          !isAmbientListeningState(ambientListeningState)
        ) {
          return { success: false, message: "valid ambient listening state is required" };
        }
        if (spokenGuidanceMode !== undefined && !isSpokenGuidanceMode(spokenGuidanceMode)) {
          return { success: false, message: "valid spoken guidance mode is required" };
        }
        if (handsBusyMode !== undefined && typeof handsBusyMode !== "boolean") {
          return { success: false, message: "handsBusyMode must be boolean" };
        }
        const voiceGuidance: Partial<RepairVoiceGuidanceState> = {};
        if (isAmbientListeningState(ambientListeningState)) {
          voiceGuidance.ambientListeningState = ambientListeningState;
        }
        if (isSpokenGuidanceMode(spokenGuidanceMode)) {
          voiceGuidance.spokenGuidanceMode = spokenGuidanceMode;
        }
        if (typeof handsBusyMode === "boolean") {
          voiceGuidance.handsBusyMode = handsBusyMode;
        }
        store.dispatch({
          type: "layout/set-voice-guidance",
          voiceGuidance,
        });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.setInteractionSettings: {
        const androidCompanionEnabled = flat["androidCompanionEnabled"];
        const dictationRoute = flat["dictationRoute"];
        const ttsRoute = flat["ttsRoute"];
        const cameraFeedPreference = flat["cameraFeedPreference"];
        const dictationSubmitMode = flat["dictationSubmitMode"];
        const autoReadAiReplies = flat["autoReadAiReplies"];
        if (androidCompanionEnabled !== undefined && typeof androidCompanionEnabled !== "boolean") {
          return { success: false, message: "androidCompanionEnabled must be boolean" };
        }
        if (dictationRoute !== undefined && !isDictationRoute(dictationRoute)) {
          return { success: false, message: "valid dictation route is required" };
        }
        if (ttsRoute !== undefined && !isTtsRoute(ttsRoute)) {
          return { success: false, message: "valid TTS route is required" };
        }
        if (cameraFeedPreference !== undefined && !isCameraFeedPreference(cameraFeedPreference)) {
          return { success: false, message: "valid camera feed preference is required" };
        }
        if (dictationSubmitMode !== undefined && !isDictationSubmitMode(dictationSubmitMode)) {
          return { success: false, message: "valid dictation submit mode is required" };
        }
        if (autoReadAiReplies !== undefined && typeof autoReadAiReplies !== "boolean") {
          return { success: false, message: "autoReadAiReplies must be boolean" };
        }
        const interactionSettings: Partial<RepairInteractionSettingsState> = {};
        if (typeof androidCompanionEnabled === "boolean") {
          interactionSettings.androidCompanionEnabled = androidCompanionEnabled;
        }
        if (isDictationRoute(dictationRoute)) {
          interactionSettings.dictationRoute = dictationRoute;
        }
        if (isTtsRoute(ttsRoute)) {
          interactionSettings.ttsRoute = ttsRoute;
        }
        if (isCameraFeedPreference(cameraFeedPreference)) {
          interactionSettings.cameraFeedPreference = cameraFeedPreference;
        }
        if (isDictationSubmitMode(dictationSubmitMode)) {
          interactionSettings.dictationSubmitMode = dictationSubmitMode;
        }
        if (typeof autoReadAiReplies === "boolean") {
          interactionSettings.autoReadAiReplies = autoReadAiReplies;
        }
        if (Object.keys(interactionSettings).length === 0) {
          return { success: false, message: "interaction settings update is required" };
        }
        store.dispatch({
          type: "layout/set-interaction-settings",
          interactionSettings,
        });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.setSettingsOverlay: {
        const open = flat["open"];
        const tabId = flat["tabId"];
        if (open !== undefined && typeof open !== "boolean") {
          return { success: false, message: "settings overlay open must be boolean" };
        }
        if (tabId !== undefined && !isSettingsOverlayTab(tabId)) {
          return { success: false, message: "valid settings overlay tab is required" };
        }
        if (open === undefined && tabId === undefined) {
          return { success: false, message: "settings overlay update is required" };
        }
        store.dispatch({
          type: "layout/set-settings-overlay",
          ...(typeof open === "boolean" ? { open } : {}),
          ...(isSettingsOverlayTab(tabId) ? { tabId } : {}),
        });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.startDictation:
        return operationsController.startDictationRequest();
      case REPAIR_UI_COMMANDS.stopDictation:
        return operationsController.stopDictationRequest();
      case REPAIR_UI_COMMANDS.startAmbientListener:
        return operationsController.startAmbientRequest();
      case REPAIR_UI_COMMANDS.stopAmbientListener:
        return operationsController.stopAmbientRequest();
      case REPAIR_UI_COMMANDS.startCameraFeed:
        return operationsController.startCameraFeedRequest();
      case REPAIR_UI_COMMANDS.stopCameraFeed:
        return operationsController.stopCameraFeedRequest();
      case REPAIR_UI_COMMANDS.capturePhoto:
        return operationsController.capturePhotoRequest();
      case REPAIR_UI_COMMANDS.setCameraTorch: {
        const enabled = flat["enabled"];
        if (typeof enabled !== "boolean") {
          return { success: false, message: "camera torch enabled flag is required" };
        }
        return operationsController.setCameraTorchRequest(enabled);
      }
      case REPAIR_UI_COMMANDS.speakGuidance: {
        return operationsController.speakGuidanceRequest(safeString(flat["text"]));
      }
      case REPAIR_UI_COMMANDS.stopSpeech:
        return operationsController.stopSpeechRequest();
      case REPAIR_UI_COMMANDS.setAttentionBudget: {
        const windowMs = safeNumber(flat["windowMs"]);
        const maxAiInterruptions = safeNumber(flat["maxAiInterruptions"]);
        if (windowMs === null && maxAiInterruptions === null) {
          return { success: false, message: "attention budget update is required" };
        }
        store.dispatch({
          type: "layout/set-attention-budget",
          attentionBudget: {
            ...(windowMs === null ? {} : { windowMs: Math.max(30000, Math.round(windowMs)) }),
            ...(maxAiInterruptions === null
              ? {}
              : { maxAiInterruptions: Math.max(1, Math.round(maxAiInterruptions)) }),
          },
        });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.toggleInvestigationMode: {
        const enabled =
          typeof flat["enabled"] === "boolean"
            ? flat["enabled"]
            : !store.getState().workbench.investigationModeEnabled;
        store.dispatch({ type: "workbench/set-investigation-mode", enabled });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.selectOverlayEntities: {
        const refs = safeOverlayEntityRefs(flat["refs"] ?? flat["selectedEntityRefs"]);
        if (refs === null) return { success: false, message: "refs are required" };
        layoutController.applyOverlayEntitySelection({
          refs,
          mode: safeString(flat["mode"] ?? flat["selectionMode"]),
          inspectorRef: safeOverlayEntityRef(flat["inspectorRef"] ?? flat["inspectorEntityRef"]),
          focusJump: flat["focusJump"] !== false,
        });
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.focusOverlayEntity: {
        const ref = safeOverlayEntityRef(flat["ref"] ?? flat["entityRef"]);
        if (ref === null) return { success: false, message: "ref is required" };
        if (ref.kind === "event" && flat["focusJump"] !== false) {
          replayController.jump(ref.id);
        }
        if (ref.kind === "live-edge") {
          replayController.followLive();
        }
        layoutController.applyOverlayEntitySelection({
          refs: ref.kind === "live-edge" ? [] : [ref],
          mode: "replace",
          inspectorRef: ref,
          focusJump: flat["focusJump"] !== false,
        });
        if (ref.kind !== "event") {
          store.dispatch({ type: "workbench/focus-entity", ref, eventId: null });
        }
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.focusInvestigationRegion: {
        const regionId = safeString(flat["regionId"]);
        if (regionId === null) return { success: false, message: "regionId is required" };
        const ref: RepairOverlayEntityRef = { kind: "investigation-region", id: regionId };
        store.dispatchMany([
          { type: "workbench/set-investigation-mode", enabled: true },
          { type: "workbench/focus-entity", ref, eventId: null },
          {
            type: "workbench/set-selection",
            focusedEventId: null,
            selection: {
              selectedEventIds: [],
              selectedEntityRefs: [ref],
              inspectorEventId: null,
              inspectorEntityRef: ref,
              focusJumpEventId: null,
              focusJumpEntityRef: ref,
            },
          },
        ]);
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.focusKnowledgeSpatialRef: {
        const spatialRefId = safeString(flat["spatialRefId"]);
        if (spatialRefId === null) return { success: false, message: "spatialRefId is required" };
        const ref: RepairOverlayEntityRef = { kind: "knowledge-region", id: spatialRefId };
        store.dispatchMany([
          { type: "knowledge-pack/set-spatial-focus", spatialRefId },
          { type: "knowledge-pack/set-preview-tab", tabId: "board-view" },
          { type: "workbench/set-investigation-mode", enabled: true },
          { type: "workbench/focus-entity", ref, eventId: null },
          {
            type: "workbench/set-selection",
            focusedEventId: null,
            selection: {
              selectedEventIds: [],
              selectedEntityRefs: [ref],
              inspectorEventId: null,
              inspectorEntityRef: ref,
              focusJumpEventId: null,
              focusJumpEntityRef: ref,
            },
          },
        ]);
        return { success: true };
      }
      case REPAIR_UI_COMMANDS.promoteKnowledgeRegion: {
        const session = getActiveSession(store.getState());
        const spatialRefId = safeString(flat["spatialRefId"]);
        if (session === null || spatialRefId === null) {
          return { success: false, message: "active session and spatialRefId are required" };
        }
        const knowledgeRegion = findKnowledgeSpatialRegion(session, spatialRefId);
        if (knowledgeRegion === null) {
          return { success: false, message: "knowledge spatial ref was not found" };
        }
        const linkage = collectKnowledgePromotionLinkage(
          store.getState(),
          session,
          spatialRefId,
          knowledgeRegion.linkedEventIds
        );
        const iso = liveController.createLiveSessionIso(session);
        const event = linkEventToActiveSnapshot(
          createInvestigationRegionCreatedEvent(session, iso, {
            label: safeString(flat["label"]) ?? knowledgeRegion.label,
            region: safeImageRect(flat["region"]) ?? knowledgeRegion.region,
            status: isInvestigationRegionStatus(flat["status"]) ? flat["status"] : "active",
            color: safeString(flat["color"]) ?? REPAIR_UI_COLORS.cyan,
            sourceRef: { kind: "knowledge-region", id: spatialRefId },
            knowledgeSpatialRefId: spatialRefId,
            promotedFromTemporaryRegionId: `tmp-knowledge-${spatialRefId}`,
            linkedEventIds: linkage.linkedEventIds,
            measurementEventIds: linkage.measurementEventIds,
            annotationEventIds: linkage.annotationEventIds,
            aiMarkEventIds: linkage.aiMarkEventIds,
          }),
          session,
          flat
        );
        let success = false;
        store.batch(() => {
          success = sessionController.appendEventToActiveSession(event);
          if (success) {
            store.dispatchMany([
              { type: "workbench/set-investigation-mode", enabled: true },
              { type: "knowledge-pack/set-spatial-focus", spatialRefId },
              {
                type: "workbench/set-selection",
                focusedEventId: null,
                selection: {
                  selectedEventIds: [],
                  selectedEntityRefs: [{ kind: "investigation-region", id: event.regionId }],
                  inspectorEventId: null,
                  inspectorEntityRef: { kind: "investigation-region", id: event.regionId },
                  focusJumpEventId: null,
                  focusJumpEntityRef: { kind: "investigation-region", id: event.regionId },
                },
              },
            ]);
          }
        });
        return { success };
      }
      case REPAIR_UI_COMMANDS.focusLiveEdge: {
        replayController.followLive();
        store.dispatchMany([
          { type: "workbench/set-investigation-mode", enabled: false },
          { type: "workbench/focus-entity", ref: null, eventId: null },
          { type: "knowledge-pack/set-spatial-focus", spatialRefId: null },
          {
            type: "workbench/set-selection",
            focusedEventId: null,
            selection: {
              hoveredEventId: null,
              hoveredEntityRef: null,
              selectedEventIds: [],
              selectedEntityRefs: [],
              inspectorEventId: null,
              inspectorEntityRef: null,
              focusJumpEventId: null,
              focusJumpEntityRef: null,
            },
          },
        ]);
        return { success: true };
      }
      default:
        api.log(
          "warn",
          `[${REPAIR_ROOM_ID}] unsupported command='${command}' phase=${store.getState().phase}`
        );
        return { success: false, message: `unsupported command: ${command}` };
    }
  }

  return { handleCommand };
}
