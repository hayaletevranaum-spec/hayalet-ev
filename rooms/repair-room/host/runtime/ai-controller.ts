import { REPAIR_PROTOCOL_KEYS, REPAIR_ROOM_ID } from "../../shared/repair-constants.js";
import type {
  RepairChatTurn,
  RepairEvent,
  RepairKnowledgePack,
  RepairKnowledgePackProgress,
  RepairMeasurementEvent,
  RepairSession,
  RepairWizardDraft,
} from "../../shared/types/index.js";
import type {
  RepairAiDispatchActivity,
  RepairAiDispatchStatus,
  RepairAiTargetSlot,
} from "../../shared/ui/state.js";
import {
  requestRepairAiChatReply,
  requestRepairAiKnowledgeResearch,
  requestRepairAiRiskDetection,
  requestRepairAiTacticalObservations,
  type RepairAiDispatchBridge,
  type RepairAiRiskObservation,
  type RepairAiRoomCommand,
  type RepairAiTacticalObservation,
} from "../repair-ai-bridge.js";
import type { RepairRuntimeStore } from "../state/repair-runtime-store.js";
import { createEventId } from "./event-factory.js";
import { uniqueStringList } from "./guards.js";
import type { RepairLiveController } from "./live-controller.js";
import type { RepairOperationsController } from "./operations-controller.js";
import { getActiveSession } from "./session-helpers.js";
import type { RepairStorageController } from "./storage-controller.js";

const REPAIR_RESEARCH_PROGRESS_TEMPLATE: RepairKnowledgePackProgress[] = [
  { step: "searching-device-info", label: "Reading device context", completed: false },
  { step: "finding-schematics", label: "Looking for schematic candidates", completed: false },
  { step: "collecting-board-images", label: "Collecting board references", completed: false },
  { step: "analyzing-common-failures", label: "Analyzing common failures", completed: false },
  { step: "preparing-knowledge-pack", label: "Preparing knowledge pack", completed: false },
];

interface RepairAiControllerApi {
  dispatchBridge?: RepairAiDispatchBridge;
  getLocale?: () => string;
  log: (level: string, message: string) => void;
}

type RepairCommandHandler = (
  command: string,
  payload?: Record<string, unknown>
) => { success: boolean; message?: string };

export interface RepairAiController {
  getKnowledgePack: (packId: string) => RepairKnowledgePack | null;
  readGeneratedKnowledgePack: () => RepairKnowledgePack | null;
  requestChatReply: (operatorTurn: RepairChatTurn) => Promise<void>;
  requestMeasurementAiObservation: (measurementEvent: RepairMeasurementEvent) => Promise<void>;
  requestSessionRiskDetection: () => Promise<void>;
  setAiDispatchStatus: (
    activity: RepairAiDispatchActivity,
    status: RepairAiDispatchStatus,
    params?: { message?: string | null; contextRefs?: string[] }
  ) => void;
  startKnowledgeResearch: (params?: { targetSlot?: RepairAiTargetSlot }) => Promise<void>;
  upsertKnowledgePack: (
    pack: RepairKnowledgePack,
    options?: { cacheByBoardCode?: boolean }
  ) => void;
}

export function isRepairAiTargetSlot(value: unknown): value is RepairAiTargetSlot {
  return value === "ai0" || value === "ai1" || value === "ai2";
}

function normalizeRepairAiTargetSlot(
  value: unknown,
  fallback: RepairAiTargetSlot = "ai2"
): RepairAiTargetSlot {
  return isRepairAiTargetSlot(value) ? value : fallback;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createKnowledgePackSelectionPatch(
  pack: RepairKnowledgePack
): Pick<
  RepairWizardDraft,
  "selectedEvidenceResourceIds" | "selectedFailureIds" | "selectedTestPointIds"
> {
  return {
    selectedEvidenceResourceIds: pack.resources.map((resource) => resource.id),
    selectedFailureIds: pack.commonFailures.map((failure) => failure.id),
    selectedTestPointIds: pack.testPoints.map((point) => point.id),
  };
}

export function createRepairAiController(params: {
  api: RepairAiControllerApi;
  appendEventsToSession: (sessionId: string, events: RepairEvent[]) => boolean;
  getDisposed: () => boolean;
  handleCommand: RepairCommandHandler;
  liveController: RepairLiveController;
  operationsController: RepairOperationsController;
  storageController: RepairStorageController;
  store: RepairRuntimeStore;
}): RepairAiController {
  const {
    api,
    appendEventsToSession,
    getDisposed,
    handleCommand,
    liveController,
    operationsController,
    storageController,
    store,
  } = params;
  const generatedKnowledgePacks = new Map<string, RepairKnowledgePack>();
  const boardCodeCache = new Map<string, RepairKnowledgePack>();
  const pendingTurnIds = new Set<string>();
  let chatReplySequence = 0;
  const pendingChatReplies = new Map<number, { turnId: string; resolved: boolean }>();

  function setAiDispatchStatus(
    activity: RepairAiDispatchActivity,
    status: RepairAiDispatchStatus,
    dispatchParams: { message?: string | null; contextRefs?: string[] } = {}
  ): void {
    const previous = store.getState().aiDispatch;
    const iso = nowIso();
    store.dispatch({
      type: "ai-dispatch/set",
      state: {
        ...previous,
        status,
        targetSlot: normalizeRepairAiTargetSlot(previous.targetSlot),
        startedAt: status === "pending" ? iso : previous.startedAt,
        completedAt: status === "pending" ? null : iso,
        message: dispatchParams.message ?? null,
        contextRefs: dispatchParams.contextRefs ?? previous.contextRefs,
        activity,
      },
    });
  }

  function getKnowledgePack(packId: string): RepairKnowledgePack | null {
    return generatedKnowledgePacks.get(packId) ?? boardCodeCache.get(packId) ?? null;
  }

  function readGeneratedKnowledgePack(): RepairKnowledgePack | null {
    const packId = store.getState().wizard.generatedKnowledgePackId;
    return packId === null ? null : getKnowledgePack(packId);
  }

  function upsertKnowledgePack(
    pack: RepairKnowledgePack,
    options: { cacheByBoardCode?: boolean } = {}
  ): void {
    generatedKnowledgePacks.set(pack.id, pack);
    const boardCode = store.getState().wizard.draft.boardCode.trim().toLowerCase();
    if (options.cacheByBoardCode !== false && boardCode !== "") {
      boardCodeCache.set(boardCode, pack);
    }
  }

  async function startKnowledgeResearch(
    researchParams: { targetSlot?: RepairAiTargetSlot } = {}
  ): Promise<void> {
    const currentWizard = store.getState().wizard;
    const boardCode = currentWizard.draft.boardCode.trim().toLowerCase();
    const targetSlot = normalizeRepairAiTargetSlot(
      researchParams.targetSlot ?? store.getState().aiDispatch.targetSlot
    );

    const cachedPack = boardCode === "" ? undefined : boardCodeCache.get(boardCode);
    if (cachedPack !== undefined) {
      api.log("info", `[${REPAIR_ROOM_ID}] Using cached knowledge pack for ${boardCode}`);
      generatedKnowledgePacks.set(cachedPack.id, cachedPack);
      store.batch(() => {
        store.dispatch({
          type: "knowledge-pack/set",
          pack: cachedPack,
          attachedToSessionId: null,
        });
        store.dispatch({
          type: "wizard/set",
          wizard: {
            ...currentWizard,
            currentStep: "evidence-review",
            draft: {
              ...currentWizard.draft,
              ...createKnowledgePackSelectionPatch(cachedPack),
              researchMessage: "Asistan AI kanıt paketi önbellekten yüklendi.",
              researchSkipped: false,
              researchStatus: "succeeded",
            },
            researchProgress: REPAIR_RESEARCH_PROGRESS_TEMPLATE.map((item) => ({
              ...item,
              completed: true,
            })),
            foundResources: cachedPack.resources.map((resource) => ({
              id: resource.id,
              label: resource.label,
              kind: resource.kind,
            })),
            generatedKnowledgePackId: cachedPack.id,
            evidenceReviewed: false,
          },
        });
        store.dispatch({ type: "phase/set", phase: "wizard-active" });
        store.dispatch({ type: "ai-dispatch/set-target-slot", targetSlot });
        setAiDispatchStatus("evidence-research", "succeeded", {
          message: "Asistan AI kanıt paketi önbellekten yüklendi.",
          contextRefs: [boardCode],
        });
      });
      return;
    }

    generatedKnowledgePacks.clear();
    const resetProgress = REPAIR_RESEARCH_PROGRESS_TEMPLATE.map((item) => ({ ...item }));

    store.batch(() => {
      store.dispatch({
        type: "knowledge-pack/set",
        pack: null,
        attachedToSessionId: null,
      });
      store.dispatch({
        type: "wizard/set",
        wizard: {
          ...currentWizard,
          currentStep: "ai-research",
          draft: {
            ...currentWizard.draft,
            researchMessage: "Asistan AI kanıt paketini hazırlıyor.",
            researchSkipped: false,
            researchStatus: "running",
            selectedEvidenceResourceIds: [],
            selectedFailureIds: [],
            selectedTestPointIds: [],
          },
          researchProgress: resetProgress,
          foundResources: [],
          generatedKnowledgePackId: null,
          evidenceReviewed: false,
        },
      });
      store.dispatch({ type: "phase/set", phase: "wizard-active" });
      store.dispatch({ type: "ai-dispatch/set-target-slot", targetSlot });
      setAiDispatchStatus("evidence-research", "pending", {
        message: "Asistan AI kanıt paketini hazırlıyor.",
        contextRefs: [
          currentWizard.draft.boardCode,
          currentWizard.draft.model,
          ...currentWizard.draft.primarySymptoms,
        ].filter((value) => value.trim() !== ""),
      });
    });

    const advanceResearchProgress = async (index: number): Promise<void> => {
      if (index >= Math.min(3, resetProgress.length)) return;
      await Promise.resolve();
      if (getDisposed()) return;
      const nextProgress = resetProgress.map((item, progressIndex) => ({
        ...item,
        completed: progressIndex <= index,
      }));
      const wizard = store.getState().wizard;
      store.dispatch({
        type: "wizard/set",
        wizard: {
          ...wizard,
          draft: {
            ...wizard.draft,
            researchMessage: nextProgress[index]?.label ?? wizard.draft.researchMessage,
            researchStatus: "running",
          },
          researchProgress: nextProgress,
        },
      });
      await advanceResearchProgress(index + 1);
    };

    await advanceResearchProgress(0);

    const result = await requestRepairAiKnowledgeResearch({
      ...(typeof api.dispatchBridge === "function" ? { dispatchBridge: api.dispatchBridge } : {}),
      draft: currentWizard.draft,
      locale: typeof api.getLocale === "function" ? api.getLocale() : "en",
      operatorProfile: store.getState().operatorProfile,
      targetSlot,
    }).catch((error: unknown) => ({
      success: false,
      pack: null,
      contextRefs: [],
      message: error instanceof Error ? error.message : String(error),
    }));

    if (getDisposed()) return;

    const researchedPack = result.pack;
    if (result.success !== true || researchedPack === null) {
      api.log(
        "debug",
        `[${REPAIR_ROOM_ID}] Asistan AI evidence research failed: ${result.message ?? "unknown error"}`
      );
      setAiDispatchStatus("evidence-research", "failed", {
        message: result.message ?? "Asistan AI kanıt paketi döndürmedi.",
        contextRefs: result.contextRefs,
      });
      const wizard = store.getState().wizard;
      store.dispatch({
        type: "wizard/set",
        wizard: {
          ...wizard,
          currentStep: "ai-research",
          draft: {
            ...wizard.draft,
            researchMessage: result.message ?? "Asistan AI kanıt paketi döndürmedi.",
            researchSkipped: false,
            researchStatus: "failed",
          },
        },
      });
      return;
    }

    generatedKnowledgePacks.set(researchedPack.id, researchedPack);
    if (boardCode !== "") {
      boardCodeCache.set(boardCode, researchedPack);
    }
    const completedProgress = resetProgress.map((item) => ({ ...item, completed: true }));
    store.batch(() => {
      store.dispatch({
        type: "knowledge-pack/set",
        pack: researchedPack,
        attachedToSessionId: null,
      });
      store.dispatch({
        type: "wizard/set",
        wizard: {
          ...store.getState().wizard,
          currentStep: "evidence-review",
          draft: {
            ...store.getState().wizard.draft,
            ...createKnowledgePackSelectionPatch(researchedPack),
            researchMessage: "Asistan AI kanıt paketi hazırladı.",
            researchSkipped: false,
            researchStatus: "succeeded",
          },
          researchProgress: completedProgress,
          foundResources: researchedPack.resources.map((resource) => ({
            id: resource.id,
            label: resource.label,
            kind: resource.kind,
          })),
          generatedKnowledgePackId: researchedPack.id,
          evidenceReviewed: false,
        },
      });
      store.dispatch({
        type: "phase/set",
        phase: getActiveSession(store.getState()) === null ? "wizard-active" : "session-active",
      });
      setAiDispatchStatus("evidence-research", "succeeded", {
        message: "Asistan AI kanıt paketi hazırladı.",
        contextRefs: result.contextRefs,
      });
    });
  }

  function createAiObservationEvents(aiParams: {
    baseIso: string;
    measurementEvent: RepairMeasurementEvent;
    observations: RepairAiTacticalObservation[];
    session: RepairSession;
  }): RepairEvent[] {
    return aiParams.observations.map((observation, index): RepairEvent => {
      const occurredAt = new Date(Date.parse(aiParams.baseIso) + index * 250).toISOString();
      const linkedMeasurementIds = uniqueStringList([
        aiParams.measurementEvent.id,
        ...observation.linkedMeasurementIds,
      ]);
      const linkedEventIds = uniqueStringList([
        aiParams.measurementEvent.id,
        ...observation.linkedEventIds,
      ]);
      if (observation.kind === "risk") {
        return {
          kind: "risk-flag",
          id: createEventId("evt-ai-risk", occurredAt),
          sessionId: aiParams.session.id,
          occurredAt,
          source: "ai",
          linkedEventIds,
          severity: "risk",
          message: observation.text,
          region: observation.region,
          acknowledged: false,
          linkedMeasurementIds,
          linkedAnnotationIds: [],
        };
      }

      return {
        kind: "ai-mark",
        id: createEventId("evt-ai-mark", occurredAt),
        sessionId: aiParams.session.id,
        occurredAt,
        source: "ai",
        linkedEventIds,
        severity: observation.kind,
        region: observation.region,
        rationale: observation.text,
        protocolKey: REPAIR_PROTOCOL_KEYS.assistantObservation,
        dismissed: false,
        lifecycleState: "detected",
        linkedMeasurementIds,
        linkedAnnotationIds: [],
        linkedNoteIds: [],
        linkedReplayEventIds: linkedEventIds,
      };
    });
  }

  async function requestMeasurementAiObservation(
    measurementEvent: RepairMeasurementEvent
  ): Promise<void> {
    const state = store.getState();
    const session = state.sessions[measurementEvent.sessionId];
    const dispatchBridge = api.dispatchBridge;
    if (session === undefined) return;
    const targetSlot = normalizeRepairAiTargetSlot(state.aiDispatch.targetSlot);
    const measurementRefs = uniqueStringList([
      measurementEvent.id,
      ...(measurementEvent.reference === null ? [] : [measurementEvent.reference]),
      session.id,
      session.deviceInfo.boardCode,
    ]);
    if (typeof dispatchBridge !== "function") {
      return;
    }

    setAiDispatchStatus("measurement-observation", "pending", {
      message: `Asistan AI son ölçümü kontrol ediyor: ${measurementEvent.reference}.`,
      contextRefs: measurementRefs,
    });

    const aiResult = await requestRepairAiTacticalObservations({
      dispatchBridge,
      locale: typeof api.getLocale === "function" ? api.getLocale() : "en",
      operatorProfile: state.operatorProfile,
      session,
      targetSlot,
      triggeringEvent: measurementEvent,
    }).catch((error: unknown) => ({
      success: false,
      observations: [],
      message: error instanceof Error ? error.message : String(error),
    }));

    if (aiResult.success !== true) {
      api.log(
        "debug",
        `[${REPAIR_ROOM_ID}] Asistan AI measurement observation skipped: ${
          aiResult.message ?? "unknown error"
        }`
      );
      setAiDispatchStatus("measurement-observation", "failed", {
        message: aiResult.message ?? "Asistan AI ölçüm gözlemi döndürmedi.",
        contextRefs: measurementRefs,
      });
      return;
    }

    const currentState = store.getState();
    const currentSession = currentState.sessions[measurementEvent.sessionId];
    if (currentSession === undefined) return;
    const baseIso =
      currentState.activeSessionId === currentSession.id
        ? liveController.createLiveSessionIso(currentSession)
        : new Date(
            Math.max(
              Date.parse(currentSession.updatedAt),
              Date.parse(measurementEvent.occurredAt)
            ) + 1000
          ).toISOString();
    appendEventsToSession(
      currentSession.id,
      createAiObservationEvents({
        baseIso,
        measurementEvent,
        observations: aiResult.observations,
        session: currentSession,
      })
    );
    setAiDispatchStatus("measurement-observation", "succeeded", {
      message: `Asistan AI ${aiResult.observations.length} gözlem ekledi.`,
      contextRefs: uniqueStringList([
        ...measurementRefs,
        ...aiResult.observations.flatMap((observation) => observation.contextRefs),
      ]),
    });
  }

  function createRiskFlagEvents(aiParams: {
    baseIso: string;
    risks: RepairAiRiskObservation[];
    session: RepairSession;
  }): RepairEvent[] {
    return aiParams.risks.map((risk, index): RepairEvent => {
      const occurredAt = new Date(Date.parse(aiParams.baseIso) + index * 250).toISOString();
      const categoryLabel = risk.category === "operator-safety" ? "OPERATOR SAFETY" : "EQUIPMENT";
      return {
        kind: "risk-flag",
        id: createEventId("evt-ai-risk", occurredAt),
        sessionId: aiParams.session.id,
        occurredAt,
        source: "ai",
        linkedEventIds: risk.contextRefs,
        severity: risk.category === "operator-safety" ? "risk" : "risk",
        message: `[${risk.severity.toUpperCase()}][${categoryLabel}] ${risk.text} Action: ${risk.recommendedAction}`,
        region: risk.region,
        acknowledged: false,
        linkedMeasurementIds: [],
        linkedAnnotationIds: [],
      };
    });
  }

  async function requestSessionRiskDetection(): Promise<void> {
    const state = store.getState();
    const session = getActiveSession(state);
    if (session === null) return;
    const targetSessionId = session.id;
    const dispatchBridge = api.dispatchBridge;
    if (typeof dispatchBridge !== "function") return;

    const targetSlot = normalizeRepairAiTargetSlot(state.aiDispatch.targetSlot);
    const sessionRefs = uniqueStringList([session.id, session.deviceInfo.boardCode]);

    setAiDispatchStatus("risk-scan", "pending", {
      message: "Asistan AI oturum risklerini tarıyor.",
      contextRefs: sessionRefs,
    });

    const aiResult = await requestRepairAiRiskDetection({
      dispatchBridge,
      locale: typeof api.getLocale === "function" ? api.getLocale() : "en",
      operatorProfile: state.operatorProfile,
      session,
      targetSlot,
    }).catch((error: unknown) => ({
      success: false,
      risks: [],
      message: error instanceof Error ? error.message : String(error),
    }));

    if (aiResult.success !== true) {
      api.log(
        "debug",
        `[${REPAIR_ROOM_ID}] Asistan AI risk scan skipped: ${aiResult.message ?? "unknown error"}`
      );
      setAiDispatchStatus("risk-scan", "failed", {
        message: aiResult.message ?? "Asistan AI risk gözlemi döndürmedi.",
        contextRefs: sessionRefs,
      });
      return;
    }

    const currentState = store.getState();
    const currentSession = currentState.sessions[targetSessionId];
    if (currentSession === undefined) return;
    const baseIso =
      currentState.activeSessionId === currentSession.id
        ? liveController.createLiveSessionIso(currentSession)
        : new Date(Math.max(Date.parse(currentSession.updatedAt), Date.now()) + 1000).toISOString();

    appendEventsToSession(
      currentSession.id,
      createRiskFlagEvents({
        baseIso,
        risks: aiResult.risks,
        session: currentSession,
      })
    );
    setAiDispatchStatus("risk-scan", "succeeded", {
      message: `Asistan AI ${aiResult.risks.length} risk buldu.`,
      contextRefs: uniqueStringList([
        ...sessionRefs,
        ...aiResult.risks.flatMap((risk) => risk.contextRefs),
      ]),
    });
  }

  function appendChatReply(
    operatorTurn: RepairChatTurn,
    text: string,
    contextRefs: string[]
  ): void {
    if (!pendingTurnIds.has(operatorTurn.id) || getDisposed()) return;
    pendingTurnIds.delete(operatorTurn.id);
    const reply: RepairChatTurn = {
      id: createEventId("chat-ai", nowIso()),
      role: "ai",
      text,
      occurredAt: nowIso(),
      contextRefs,
    };
    const turns = store.getState().chat.turns;
    const operatorIndex = turns.findIndex((turn) => turn.id === operatorTurn.id);
    const insertAt = operatorIndex === -1 ? turns.length : operatorIndex + 1;
    const nextTurns = [...turns.slice(0, insertAt), reply, ...turns.slice(insertAt)];
    store.batch(() => {
      store.dispatch({ type: "chat/set-turns", turns: nextTurns });
      store.dispatch({
        type: "chat/set-pending",
        turnId: pendingTurnIds.size === 0 ? null : (Array.from(pendingTurnIds).at(-1) ?? null),
      });
    });
    storageController.queuePersistActiveSessionChat();
    if (store.getState().layout.interactionSettings.autoReadAiReplies) {
      const result = operationsController.speakGuidanceRequest(reply.text);
      if (result.success === false && result.message !== undefined) {
        api.log("debug", `[${REPAIR_ROOM_ID}] auto-read skipped: ${result.message}`);
      }
    }
  }

  function failChatReply(
    operatorTurn: RepairChatTurn,
    message: string,
    contextRefs: string[]
  ): void {
    if (!pendingTurnIds.has(operatorTurn.id) || getDisposed()) return;
    pendingTurnIds.delete(operatorTurn.id);
    if (pendingTurnIds.size === 0) {
      store.dispatch({ type: "chat/set-pending", turnId: null });
    }
    setAiDispatchStatus("chat-reply", "failed", {
      message,
      contextRefs,
    });
    storageController.queuePersistActiveSessionChat();
  }

  function applyRepairAiRoomCommands(commands: RepairAiRoomCommand[]): {
    applied: number;
    failed: number;
  } {
    return commands.reduce(
      (summary, command) => {
        const result = handleCommand(command.commandName, command.payload);
        if (result.success) {
          summary.applied += 1;
        } else {
          summary.failed += 1;
          api.log(
            "warn",
            `[${REPAIR_ROOM_ID}] AI room command rejected command=${command.commandName} reason=${
              result.message ?? "unknown"
            }`
          );
        }
        return summary;
      },
      { applied: 0, failed: 0 }
    );
  }

  async function requestChatReply(operatorTurn: RepairChatTurn): Promise<void> {
    pendingTurnIds.add(operatorTurn.id);
    const sequenceId = ++chatReplySequence;
    pendingChatReplies.set(sequenceId, { turnId: operatorTurn.id, resolved: false });
    const state = store.getState();
    const session = getActiveSession(state);
    const targetSlot = normalizeRepairAiTargetSlot(state.aiDispatch.targetSlot);
    const baseContextRefs = session === null ? [] : [session.id, session.deviceInfo.boardCode];
    const dispatchBridge = api.dispatchBridge;
    const aiResult = await requestRepairAiChatReply({
      ...(typeof dispatchBridge === "function" ? { dispatchBridge } : {}),
      locale: typeof api.getLocale === "function" ? api.getLocale() : "en",
      operatorProfile: state.operatorProfile,
      operatorTurn,
      recentTurns: state.chat.turns,
      session,
      targetSlot,
    }).catch((error: unknown) => ({
      success: false,
      text: null,
      contextRefs: [],
      rejectedRoomCommandCount: 0,
      roomCommands: [],
      message: error instanceof Error ? error.message : String(error),
    }));

    const pendingEntry = pendingChatReplies.get(sequenceId);
    if (pendingEntry === undefined || pendingEntry.resolved || getDisposed()) return;
    pendingEntry.resolved = true;

    if (aiResult.success !== true) {
      api.log(
        "debug",
        `[${REPAIR_ROOM_ID}] Asistan AI reply failed: ${aiResult.message ?? "unknown error"}`
      );
      failChatReply(
        operatorTurn,
        aiResult.message ?? "Asistan AI cevap döndürmedi.",
        uniqueStringList([...baseContextRefs, operatorTurn.id])
      );
      return;
    }
    const chatContextRefs = uniqueStringList([...baseContextRefs, ...aiResult.contextRefs]);
    if (aiResult.text === null) {
      failChatReply(operatorTurn, "Asistan AI okunabilir cevap döndürmedi.", chatContextRefs);
      return;
    }
    const commandSummary = applyRepairAiRoomCommands(aiResult.roomCommands);
    const commandMessageParts = [
      aiResult.roomCommands.length > 0
        ? `${commandSummary.applied}/${aiResult.roomCommands.length} room command applied`
        : null,
      aiResult.rejectedRoomCommandCount > 0
        ? `${aiResult.rejectedRoomCommandCount} malformed room command ignored`
        : null,
      commandSummary.failed > 0 ? `${commandSummary.failed} room command failed` : null,
    ].filter((part): part is string => part !== null);
    setAiDispatchStatus("chat-reply", commandSummary.failed > 0 ? "failed" : "succeeded", {
      message:
        commandMessageParts.length === 0
          ? "Asistan AI cevap döndürdü."
          : `Asistan AI cevap döndürdü; ${commandMessageParts.join(", ")}.`,
      contextRefs: chatContextRefs,
    });
    appendChatReply(operatorTurn, aiResult.text, chatContextRefs);
  }

  return {
    getKnowledgePack,
    readGeneratedKnowledgePack,
    requestChatReply,
    requestMeasurementAiObservation,
    requestSessionRiskDetection,
    setAiDispatchStatus,
    startKnowledgeResearch,
    upsertKnowledgePack,
  };
}
