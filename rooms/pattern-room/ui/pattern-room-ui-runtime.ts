import {
  applyPatternRoomCaseReview,
  previewPatternRoomCaseReviewApply,
  type PatternRoomCaseReviewApplyOptions,
} from "../shared/adapters/pattern-room-case-review-apply.js";
import { adaptDomainToViewModels } from "../shared/adapters/pattern-room-view-adapters.js";
import { PATTERN_ROOM_DOMAIN } from "../shared/data/pattern-room-domain.js";
import {
  createPatternRoomCaseReviewRuntimeState,
  isPatternRoomCaseReviewRuntimeState,
} from "../shared/state/pattern-room-case-review-state.js";
import { createLocalState } from "../shared/state/pattern-room-local-state.js";
import { createSnapshot, restoreFromSnapshot } from "../shared/state/pattern-room-snapshot.js";
import {
  PATTERN_ROOM_LOADED_EVENT,
  PATTERN_ROOM_SAVE_COMMAND,
  PATTERN_ROOM_SAVED_EVENT,
  PATTERN_ROOM_SAVE_FAILED_EVENT,
} from "../shared/types/pattern-room-persistence.js";
import {
  PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_FAILED_EVENT,
  PATTERN_ROOM_CASE_REVIEW_DISPATCHED_EVENT,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_ACTION,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_CONNECT_POLICY,
  PATTERN_ROOM_CASE_REVIEW_DISPATCH_PROTOCOL,
  type PatternRoomCaseReviewControlCommandPayload,
  type PatternRoomCaseReviewDispatchCommandPayload,
  type PatternRoomCaseReviewDispatchDraft,
} from "../shared/types/pattern-room-case-review-dispatch.js";
import {
  getPatternRoomCaseReviewRoleProfile,
  isPatternRoomCaseReviewRoleSlot,
  type PatternRoomCaseReviewRoleSlot,
} from "../shared/types/pattern-room-case-review-role.js";
import {
  PATTERN_ROOM_CASE_REVIEW_EVENT,
  type PatternRoomCaseReviewApplyMode,
  type PatternRoomCaseReviewEvent,
  type PatternRoomCaseReviewEventPayload,
} from "../shared/types/pattern-room-case-review-session.js";
import type {
  PatternLongTextSourceImportInput,
  PatternLongTextSourceImportStatus,
  PatternPanelActions,
  PatternRoomWorkspaceModel,
  PatternUserTextSourceImportInput,
  PatternUserTextSourceImportStatus,
  PatternViewId,
} from "../shared/types/pattern-room.js";
import {
  createLongTextProducer,
  createUserTextProducer,
  produceAndImportSource,
  type LongTextInput,
  type PastedTextInput,
  type SourceProducerOrchestrationResult,
} from "../shared/source-producers/index.js";
import type {
  PatternRoomPresentationState,
  PatternRoomSessionSnapshot,
} from "../shared/types/pattern-room-snapshot.js";
import type { PatternRoomEvidenceCandidatePromotionInput } from "../shared/types/pattern-room-evidence-candidate.js";
import { createArchivePanel } from "./panels/pattern-archive-panel.js";
import { createPatternCaseIdentityInspector } from "./panels/pattern-case-identity-inspector.js";
import { createInvestigationInspectorContent } from "./panels/pattern-investigation-inspector.js";
import {
  createInvestigationPanel,
  type PatternInvestigationCanvasMode,
} from "./panels/pattern-investigation-panel.js";
import { createOverviewPanel } from "./panels/pattern-overview-panel.js";
import { createReportPanel } from "./panels/pattern-report-panel.js";
import { createTenthManPanel } from "./panels/pattern-tenth-man-panel.js";
import type { PatternCaseReviewApplyFeedback } from "./panels/pattern-case-review-runtime-view.js";
import { createPatternCaseReviewTranslator } from "./pattern-case-review-i18n.js";
import {
  createPatternWorkspaceTranslator,
  type PatternWorkspaceTextKey,
} from "./pattern-room-workspace-i18n.js";
import {
  createPatternWorkspaceShell,
  type PatternWorkspaceFeedbackTone,
  type PatternWorkspaceSection,
  type PatternWorkspaceShell,
} from "./panels/pattern-workspace-shell.js";
import {
  PATTERN_CASE_REVIEW_DEFAULT_ROLE_SLOT,
  createPatternCaseReviewPreviewDraft,
  type PatternCaseReviewDispatchStatus,
  type PatternCaseReviewPreviewDraft,
} from "./pattern-case-review-preview.js";
import { importSampleSourcePackage } from "./pattern-source-import-demo.js";

type FocusedPatternViewId = Exclude<PatternViewId, "overview">;
type HostMessageUnsubscribe = () => void;
const AUTOSAVE_DEBOUNCE_MS = 2000;
const CASE_REVIEW_EVENT_TYPES: readonly PatternRoomCaseReviewEvent["type"][] = [
  "preview-created",
  "dispatch-started",
  "dispatch-sent",
  "waiting-reply",
  "reply-received",
  "parsed",
  "review-ready",
  "review-applied",
  "dispatch-failed",
  "timeout",
  "reply-invalid",
  "parse-failed",
  "cancelled",
];
const CASE_REVIEW_IDLE_STATUS: PatternCaseReviewDispatchStatus = {
  kind: "idle",
  message: null,
};

export type PatternRoomUiRuntime = {
  start: () => void;
  dispose: () => void;
  createSnapshot: () => PatternRoomSessionSnapshot;
  restoreSnapshot: (snapshot: unknown) => boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHostMessageUnsubscribe(value: unknown): value is HostMessageUnsubscribe {
  return typeof value === "function";
}

function readCaseReviewDispatchDraft(value: unknown): PatternRoomCaseReviewDispatchDraft | null {
  if (
    !isRecord(value) ||
    !isPatternRoomCaseReviewRoleSlot(value["roleSlot"]) ||
    typeof value["packetHash"] !== "string" ||
    value["packetHash"].trim() === "" ||
    !Array.isArray(value["warnings"]) ||
    !value["warnings"].every((warning) => typeof warning === "string") ||
    !isRecord(value["payload"])
  ) {
    return null;
  }

  const targetSlot = getPatternRoomCaseReviewRoleProfile(value["roleSlot"]).targetSlot;
  const bridgePayload = value["payload"];
  const payload = bridgePayload["payload"];
  if (
    value["targetSlot"] !== targetSlot ||
    bridgePayload["action"] !== PATTERN_ROOM_CASE_REVIEW_DISPATCH_ACTION ||
    bridgePayload["toSlot"] !== targetSlot ||
    bridgePayload["connectPolicy"] !== PATTERN_ROOM_CASE_REVIEW_DISPATCH_CONNECT_POLICY ||
    typeof bridgePayload["timeoutMs"] !== "number" ||
    !Number.isInteger(bridgePayload["timeoutMs"]) ||
    bridgePayload["timeoutMs"] <= 0 ||
    !isRecord(payload) ||
    typeof payload["text"] !== "string" ||
    payload["text"].trim() === "" ||
    !isRecord(payload["protocol"]) ||
    payload["protocol"]["room"] !== PATTERN_ROOM_CASE_REVIEW_DISPATCH_PROTOCOL.room ||
    payload["protocol"]["scenario"] !== PATTERN_ROOM_CASE_REVIEW_DISPATCH_PROTOCOL.scenario ||
    payload["protocol"]["protocolKey"] !== PATTERN_ROOM_CASE_REVIEW_DISPATCH_PROTOCOL.protocolKey
  ) {
    return null;
  }

  return value as PatternRoomCaseReviewDispatchDraft;
}

function createRecoveredCaseReviewPreview(
  draft: PatternRoomCaseReviewDispatchDraft,
  reviewLabel: string
): PatternCaseReviewPreviewDraft {
  return {
    dispatchDraft: draft,
    roleSlot: draft.roleSlot,
    targetSlot: draft.targetSlot,
    protocol: draft.payload.payload.protocol,
    reviewLabel,
    text: draft.payload.payload.text,
    warnings: draft.warnings,
  };
}

function resolveRoot(): HTMLElement {
  const existingRoot = document.getElementById("app");
  if (existingRoot !== null) {
    return existingRoot;
  }

  const root = document.createElement("div");
  root.id = "app";
  document.body.append(root);
  return root;
}

export type PatternRoomUiRuntimeOptions = {
  readonly domain?: typeof PATTERN_ROOM_DOMAIN;
};

export function createPatternRoomUiRuntime(
  options: PatternRoomUiRuntimeOptions = {}
): PatternRoomUiRuntime {
  const root = resolveRoot();
  const domain = options.domain ?? PATTERN_ROOM_DOMAIN;
  const localState = createLocalState(domain);
  let activeView: PatternViewId = "overview";
  let activeWorkspaceSection: PatternWorkspaceSection = "default";
  let selectedNodeId: string | null = null;
  let selectedConnectionId: string | null = null;
  let selectedArchiveSourceId: string | null = null;
  let archiveEvidenceCaptureStatus: string | null = null;
  let archiveSearchQuery = "";
  let archiveSourceTypeFilter = "all";
  let investigationCanvasMode: PatternInvestigationCanvasMode = "board";
  let workspaceShell: PatternWorkspaceShell | null = null;
  let renderedView: PatternViewId | null = null;
  const workspacePanelCache = new Map<PatternViewId, HTMLElement>();
  const workspaceScrollOffsets = new Map<PatternViewId, number>();
  let viewModels: PatternRoomWorkspaceModel = adaptDomainToViewModels(
    domain,
    localState.getOverlay()
  );
  let hostMessagesConnected = false;
  let removeHostMessageListener: HostMessageUnsubscribe | null = null;
  let beforeUnloadConnected = false;
  let persistenceReady = false;
  let isRestoring = false;
  let dirty = false;
  let pendingSaveTimer: number | null = null;
  let sourceImportDemoStatus: ReturnType<typeof importSampleSourcePackage> | null = null;
  let userTextSourceImportStatus: PatternUserTextSourceImportStatus | null = null;
  let longTextSourceImportStatus: PatternLongTextSourceImportStatus | null = null;
  let caseReviewPreviewDraft: PatternCaseReviewPreviewDraft | null = null;
  let caseReviewDispatchStatus: PatternCaseReviewDispatchStatus = CASE_REVIEW_IDLE_STATUS;
  let caseReviewRuntimeState = createPatternRoomCaseReviewRuntimeState();
  let selectedCaseReviewRole: PatternRoomCaseReviewRoleSlot = PATTERN_CASE_REVIEW_DEFAULT_ROLE_SLOT;
  let caseReviewApplyFeedback: PatternCaseReviewApplyFeedback | null = null;
  let evidenceCandidateFeedback: PatternCaseReviewApplyFeedback | null = null;
  let caseReviewLocale = "tr";
  let caseReviewTranslations: unknown = null;
  let caseReviewIdSequence = 0;
  const caseReviewDraftsBySessionId = new Map<string, PatternRoomCaseReviewDispatchDraft>();
  const locallyAppliedCaseReviewSessions = new Set<string>();
  const importedUserTextPackageIds = new Set<string>();
  const importedLongTextPackageIds = new Set<string>();

  function createEmptyUserTextStatus(message: string): PatternUserTextSourceImportStatus {
    return {
      packageIds: [],
      message,
      success: false,
      duplicate: false,
      sourcesAdded: 0,
      evidenceAdded: 0,
      nodesAdded: 0,
      edgesAdded: 0,
      notesAdded: 0,
      duplicatesSkipped: 0,
      warningCount: 0,
      errorCount: 0,
    };
  }

  function createEmptyLongTextStatus(message: string): PatternLongTextSourceImportStatus {
    return {
      ...createEmptyUserTextStatus(message),
      segmentCount: 0,
    };
  }

  function createUserTextProducerInput(input: PatternUserTextSourceImportInput): PastedTextInput {
    const producerInput: PastedTextInput = {
      inputKind: "pasted_text",
      text: input.text.trim(),
      language: input.language?.trim() || "tr",
    };
    const title = input.title.trim();
    if (title !== "") {
      producerInput.title = title;
    }
    return producerInput;
  }

  function createLongTextProducerInput(input: PatternLongTextSourceImportInput): LongTextInput {
    const producerInput: LongTextInput = {
      inputKind: "long_text",
      title: input.title.trim(),
      origin: input.origin.trim(),
      sourceKind: input.sourceKind,
      text: input.text.trim(),
      language: input.language?.trim() || "tr",
    };
    const chapter = input.chapter?.trim();
    const page = input.page?.trim();
    if (chapter !== undefined && chapter !== "") {
      producerInput.chapter = chapter;
    }
    if (page !== undefined && page !== "") {
      producerInput.page = page;
    }
    return producerInput;
  }

  function summarizeUserTextImportResult(
    result: SourceProducerOrchestrationResult
  ): PatternUserTextSourceImportStatus {
    let sourcesAdded = 0;
    let evidenceAdded = 0;
    let nodesAdded = 0;
    let edgesAdded = 0;
    let notesAdded = 0;
    let duplicatesSkipped = 0;
    let applyWarningCount = 0;

    result.importResults.forEach((packageResult) => {
      const summary = localState.applySourceImportResult(packageResult.importResult);
      sourcesAdded += summary.sourcesAdded;
      evidenceAdded += summary.evidenceAdded;
      nodesAdded += summary.nodesAdded;
      edgesAdded += summary.edgesAdded;
      notesAdded += summary.notesAdded;
      duplicatesSkipped +=
        summary.duplicatesSkipped + packageResult.importResult.stats.duplicatesSkipped;
      applyWarningCount += summary.warnings.length;

      if (
        summary.sourcesAdded > 0 ||
        summary.evidenceAdded > 0 ||
        summary.nodesAdded > 0 ||
        summary.edgesAdded > 0 ||
        summary.notesAdded > 0
      ) {
        importedUserTextPackageIds.add(packageResult.packageId);
      }
    });

    const packageIds = result.packagesProduced.map((sourcePackage) => {
      return sourcePackage.sourcePackageId;
    });
    const importedCount = sourcesAdded + evidenceAdded + nodesAdded + edgesAdded + notesAdded;
    const duplicate = importedCount === 0 && duplicatesSkipped > 0;
    const errorCount = result.errors.length;
    const warningCount = result.warnings.length + applyWarningCount;
    const message =
      errorCount > 0
        ? "Metin kaynak paketine dönüştürülemedi."
        : duplicate
          ? "Bu metin zaten odada kayıtlı görünüyor."
          : importedCount > 0
            ? `Metin kaynak olarak odaya eklendi: ${String(sourcesAdded)} kaynak, ${String(
                evidenceAdded
              )} kanıt, ${String(nodesAdded)} düğüm.`
            : "Metinden içe aktarılacak kaynak bulunamadı.";

    return {
      packageIds,
      message,
      success: importedCount > 0,
      duplicate,
      sourcesAdded,
      evidenceAdded,
      nodesAdded,
      edgesAdded,
      notesAdded,
      duplicatesSkipped,
      warningCount,
      errorCount,
    };
  }

  function summarizeLongTextImportResult(
    result: SourceProducerOrchestrationResult
  ): PatternLongTextSourceImportStatus {
    let sourcesAdded = 0;
    let evidenceAdded = 0;
    let nodesAdded = 0;
    let edgesAdded = 0;
    let notesAdded = 0;
    let duplicatesSkipped = 0;
    let applyWarningCount = 0;

    result.importResults.forEach((packageResult) => {
      const summary = localState.applySourceImportResult(packageResult.importResult);
      sourcesAdded += summary.sourcesAdded;
      evidenceAdded += summary.evidenceAdded;
      nodesAdded += summary.nodesAdded;
      edgesAdded += summary.edgesAdded;
      notesAdded += summary.notesAdded;
      duplicatesSkipped +=
        summary.duplicatesSkipped + packageResult.importResult.stats.duplicatesSkipped;
      applyWarningCount += summary.warnings.length;

      if (
        summary.sourcesAdded > 0 ||
        summary.evidenceAdded > 0 ||
        summary.nodesAdded > 0 ||
        summary.edgesAdded > 0 ||
        summary.notesAdded > 0
      ) {
        importedLongTextPackageIds.add(packageResult.packageId);
      }
    });

    const packageIds = result.packagesProduced.map((sourcePackage) => {
      return sourcePackage.sourcePackageId;
    });
    const segmentCount = result.packagesProduced.reduce((count, sourcePackage) => {
      return count + sourcePackage.segments.length;
    }, 0);
    const importedCount = sourcesAdded + evidenceAdded + nodesAdded + edgesAdded + notesAdded;
    const duplicate = importedCount === 0 && duplicatesSkipped > 0;
    const errorCount = result.errors.length;
    const warningCount = result.warnings.length + applyWarningCount;
    const message =
      errorCount > 0
        ? "Uzun metin kaynak paketine dönüştürülemedi."
        : duplicate
          ? "Bu uzun metin zaten odada kayıtlı görünüyor."
          : importedCount > 0
            ? `Uzun metin kaynak olarak eklendi: ${String(segmentCount)} segment.`
            : "Uzun metinden içe aktarılacak kaynak bulunamadı.";

    return {
      packageIds,
      message,
      success: importedCount > 0,
      duplicate,
      sourcesAdded,
      evidenceAdded,
      nodesAdded,
      edgesAdded,
      notesAdded,
      duplicatesSkipped,
      warningCount,
      errorCount,
      segmentCount,
    };
  }

  function archiveSourceExists(sourceId: string): boolean {
    return viewModels.sources.some((source) => {
      return source.id === sourceId;
    });
  }

  function selectArchiveSource(sourceId: string | null): void {
    selectedArchiveSourceId = sourceId;
    archiveEvidenceCaptureStatus = null;
    render();
  }

  function setArchiveEvidenceCaptureStatus(message: string | null): void {
    archiveEvidenceCaptureStatus = message;
  }

  function setArchiveSearchQuery(query: string): void {
    archiveSearchQuery = query;
  }

  function setArchiveSourceTypeFilter(sourceType: string): void {
    archiveSourceTypeFilter = sourceType;
  }

  function getCaseReviewText() {
    return createPatternCaseReviewTranslator(caseReviewLocale, caseReviewTranslations);
  }

  function getWorkspaceText() {
    return createPatternWorkspaceTranslator(caseReviewLocale, caseReviewTranslations);
  }

  function showWorkspaceActionFeedback(
    key: PatternWorkspaceTextKey,
    tone: PatternWorkspaceFeedbackTone = "success"
  ): void {
    ensureWorkspaceShell().showActionFeedback({
      tone,
      message: getWorkspaceText()(key),
    });
  }

  function createCaseReviewApplyOptions(
    mode: PatternRoomCaseReviewApplyMode,
    sessionId: string
  ): PatternRoomCaseReviewApplyOptions {
    const text = getCaseReviewText();
    return {
      mode,
      sessionId,
      copy: {
        reviewPrefix: text("apply.reviewPrefix"),
        evidenceSuggestionLabel: text("apply.evidenceSuggestionLabel"),
        openQuestionLabel: text("apply.openQuestionLabel"),
        userAppliedSuggestion: text("apply.userAppliedSuggestion"),
        sectionLabels: {
          observation: text("sections.observation"),
          evidence: text("sections.evidence"),
          analysis: text("sections.analysis"),
          counterArgument: text("sections.counterArgument"),
          missingInformation: text("sections.missingInformation"),
          openQuestions: text("sections.openQuestions"),
          confidenceNotes: text("sections.confidenceNotes"),
        },
      },
    };
  }

  function createCaseReviewId(kind: "session" | "request"): string {
    caseReviewIdSequence += 1;
    return `pattern-review-${kind}-${Date.now().toString(36)}-${caseReviewIdSequence.toString(36)}`;
  }

  function selectCaseReviewRole(role: PatternRoomCaseReviewRoleSlot): void {
    selectedCaseReviewRole = role;
    caseReviewPreviewDraft = null;
    caseReviewDispatchStatus = CASE_REVIEW_IDLE_STATUS;
    caseReviewApplyFeedback = null;
    render();
  }

  function prepareCaseReviewPreview(): void {
    const draft = createPatternCaseReviewPreviewDraft(
      {
        domain,
        overlay: localState.getOverlay(),
        topicLabel: viewModels.subject,
        researchQuestion: viewModels.researchQuestion,
      },
      selectedCaseReviewRole
    );
    caseReviewPreviewDraft = draft;
    selectedCaseReviewRole = draft.roleSlot;
    caseReviewDispatchStatus = CASE_REVIEW_IDLE_STATUS;
    caseReviewApplyFeedback = null;
    render();
  }

  function setCaseReviewDispatchStatus(status: PatternCaseReviewDispatchStatus): void {
    caseReviewDispatchStatus = status;
    render();
  }

  function sendCaseReviewDispatch(
    payload: PatternRoomCaseReviewDispatchCommandPayload,
    draft: PatternRoomCaseReviewDispatchDraft
  ): boolean {
    const sendCommand = window.roomAPI?.sendCommand;
    if (typeof sendCommand !== "function") {
      setCaseReviewDispatchStatus({
        kind: "failed",
        message: getCaseReviewText()("messages.dispatchFailed"),
      });
      return false;
    }

    caseReviewDraftsBySessionId.set(payload.sessionId, draft);
    caseReviewApplyFeedback = null;
    setCaseReviewDispatchStatus({
      kind: "sending",
      message: getCaseReviewText()("statuses.running"),
    });
    try {
      if (!sendCommand(PATTERN_ROOM_CASE_REVIEW_DISPATCH_COMMAND, payload)) {
        setCaseReviewDispatchStatus({
          kind: "failed",
          message: getCaseReviewText()("messages.dispatchFailed"),
        });
        return false;
      }
      return true;
    } catch (error) {
      console.warn("Pattern Room case review dispatch command failed.", error);
      setCaseReviewDispatchStatus({
        kind: "failed",
        message: getCaseReviewText()("messages.dispatchFailed"),
      });
      return false;
    }
  }

  function dispatchCaseReviewPreview(): void {
    const preview = caseReviewPreviewDraft;
    if (preview === null) {
      return;
    }

    const text = getCaseReviewText();
    if (
      window.confirm(
        text("messages.confirmDispatch", {
          role: preview.roleSlot,
        })
      ) !== true
    ) {
      return;
    }

    const sessionId = createCaseReviewId("session");
    sendCaseReviewDispatch(
      {
        sessionId,
        requestId: createCaseReviewId("request"),
        operation: "start",
        parentSessionId: null,
        attempt: 1,
        draft: preview.dispatchDraft,
      },
      preview.dispatchDraft
    );
  }

  function retryCaseReview(): void {
    const session = caseReviewRuntimeState.activeSession;
    if (session === null) {
      return;
    }
    const draft = caseReviewDraftsBySessionId.get(session.sessionId);
    if (draft === undefined) {
      caseReviewApplyFeedback = {
        tone: "error",
        message: getCaseReviewText()("messages.controlFailed"),
      };
      render();
      return;
    }

    sendCaseReviewDispatch(
      {
        sessionId: session.sessionId,
        requestId: createCaseReviewId("request"),
        operation: "retry",
        parentSessionId: session.parentSessionId,
        attempt: session.attempt + 1,
        draft,
      },
      draft
    );
  }

  function resendCaseReview(): void {
    const session = caseReviewRuntimeState.activeSession;
    if (session === null) {
      return;
    }
    const draft = caseReviewDraftsBySessionId.get(session.sessionId);
    if (draft === undefined) {
      caseReviewApplyFeedback = {
        tone: "error",
        message: getCaseReviewText()("messages.controlFailed"),
      };
      render();
      return;
    }

    const sessionId = createCaseReviewId("session");
    sendCaseReviewDispatch(
      {
        sessionId,
        requestId: createCaseReviewId("request"),
        operation: "resend",
        parentSessionId: session.sessionId,
        attempt: 1,
        draft,
      },
      draft
    );
  }

  function sendCaseReviewControl(payload: PatternRoomCaseReviewControlCommandPayload): boolean {
    const sendCommand = window.roomAPI?.sendCommand;
    if (typeof sendCommand !== "function") {
      caseReviewApplyFeedback = {
        tone: "error",
        message: getCaseReviewText()("messages.controlFailed"),
      };
      render();
      return false;
    }

    try {
      if (!sendCommand(PATTERN_ROOM_CASE_REVIEW_CONTROL_COMMAND, payload)) {
        caseReviewApplyFeedback = {
          tone: "error",
          message: getCaseReviewText()("messages.controlFailed"),
        };
        render();
        return false;
      }
      return true;
    } catch (error) {
      console.warn("Pattern Room case review control command failed.", error);
      caseReviewApplyFeedback = {
        tone: "error",
        message: getCaseReviewText()("messages.controlFailed"),
      };
      render();
      return false;
    }
  }

  function cancelCaseReview(): void {
    const session = caseReviewRuntimeState.activeSession;
    if (session === null || session.requestId === null) {
      return;
    }
    caseReviewApplyFeedback = null;
    sendCaseReviewControl({
      action: "cancel",
      sessionId: session.sessionId,
      requestId: session.requestId,
    });
  }

  function applyCaseReview(mode: PatternRoomCaseReviewApplyMode): void {
    const session = caseReviewRuntimeState.activeSession;
    if (
      session?.status !== "ready" ||
      session.result === null ||
      session.requestId === null ||
      locallyAppliedCaseReviewSessions.has(session.sessionId)
    ) {
      caseReviewApplyFeedback = {
        tone: "error",
        message: getCaseReviewText()("messages.noResult"),
      };
      render();
      return;
    }

    if (typeof window.roomAPI?.sendCommand !== "function") {
      caseReviewApplyFeedback = {
        tone: "error",
        message: getCaseReviewText()("messages.controlFailed"),
      };
      render();
      return;
    }

    try {
      const applyOptions = createCaseReviewApplyOptions(mode, session.sessionId);
      const summary = previewPatternRoomCaseReviewApply(session.result, localState, applyOptions);
      locallyAppliedCaseReviewSessions.add(session.sessionId);
      if (
        !sendCaseReviewControl({
          action: "apply",
          sessionId: session.sessionId,
          requestId: session.requestId,
          mode,
          summary,
        })
      ) {
        locallyAppliedCaseReviewSessions.delete(session.sessionId);
        render();
        return;
      }

      applyPatternRoomCaseReview(session.result, localState, applyOptions);
      caseReviewApplyFeedback = {
        tone: "success",
        message: getCaseReviewText()("messages.applied"),
      };
      render();
    } catch (error) {
      locallyAppliedCaseReviewSessions.delete(session.sessionId);
      console.warn("Pattern Room case review apply failed.", error);
      caseReviewApplyFeedback = {
        tone: "error",
        message: getCaseReviewText()("messages.applyFailed"),
      };
      render();
    }
  }

  function promoteEvidenceCandidateFromReview(
    input: PatternRoomEvidenceCandidatePromotionInput
  ): void {
    const result = localState.promoteEvidenceCandidate(input);
    evidenceCandidateFeedback = result.promoted
      ? { tone: "success", message: getCaseReviewText()("candidates.promoted") }
      : {
          tone: "error",
          message: result.warnings.join(" ") || getCaseReviewText()("candidates.promotionFailed"),
        };
    render();
  }

  function removeEvidenceCandidateFromReview(candidateId: string): void {
    const removed = localState.removeEvidenceCandidate(candidateId);
    evidenceCandidateFeedback = removed
      ? { tone: "success", message: getCaseReviewText()("candidates.discarded") }
      : { tone: "error", message: getCaseReviewText()("candidates.discardFailed") };
    render();
  }

  const actions: PatternPanelActions = {
    updateCaseIdentity(caseLabel: string, researchQuestion: string): void {
      const updated = localState.updateCaseIdentity(caseLabel, researchQuestion);
      if (updated) {
        caseReviewPreviewDraft = null;
        caseReviewDispatchStatus = CASE_REVIEW_IDLE_STATUS;
        showWorkspaceActionFeedback("feedback.caseIdentityUpdated");
        render();
        return;
      }
      showWorkspaceActionFeedback("feedback.caseIdentityUnchanged", "info");
    },
    getSelectedNodeId(): string | null {
      return selectedNodeId;
    },
    selectNode(nodeId: string | null): void {
      selectedNodeId = nodeId;
      if (workspaceShell !== null && (activeView === "board" || activeView === "desk")) {
        renderWorkspaceInspector(workspaceShell);
      }
      scheduleAutosave();
    },
    getSelectedConnectionId(): string | null {
      return selectedConnectionId;
    },
    selectConnection(connectionId: string | null): void {
      selectedConnectionId = connectionId;
      if (workspaceShell !== null && (activeView === "board" || activeView === "desk")) {
        renderWorkspaceInspector(workspaceShell);
      }
      scheduleAutosave();
    },
    sendNodeToDesk(nodeId: string): void {
      const beforeCount = localState.getOverlay().deskNodeIds.length;
      localState.sendToDesk(nodeId);
      const added = localState.getOverlay().deskNodeIds.length > beforeCount;
      showWorkspaceActionFeedback(
        added ? "feedback.sentToDesk" : "feedback.alreadyOnDesk",
        added ? "success" : "info"
      );
    },
    addNodeToDebate(nodeId: string): void {
      const beforeCount = localState.getOverlay().debateReferenceIds.length;
      localState.addToDebate(nodeId);
      const added = localState.getOverlay().debateReferenceIds.length > beforeCount;
      showWorkspaceActionFeedback(
        added ? "feedback.addedToReview" : "feedback.alreadyInReview",
        added ? "success" : "info"
      );
    },
    pinSourceToBoard(sourceId: string, layer): void {
      localState.pinSource(sourceId, layer);
      showWorkspaceActionFeedback("feedback.sourcePinned");
    },
    addSourceToDebate(sourceId: string): void {
      const beforeCount = localState.getOverlay().debateReferenceIds.length;
      localState.addToDebate(sourceId);
      const added = localState.getOverlay().debateReferenceIds.length > beforeCount;
      showWorkspaceActionFeedback(
        added ? "feedback.addedToReview" : "feedback.alreadyInReview",
        added ? "success" : "info"
      );
    },
    addLocalNote(text: string): void {
      localState.addLocalNote(text);
      showWorkspaceActionFeedback("feedback.noteAdded");
    },
    addAuthoredClaim(label: string, content: string): void {
      localState.addAuthoredClaim(label, content);
      showWorkspaceActionFeedback("feedback.boardItemAdded");
    },
    addAuthoredInspiration(label: string, content: string): void {
      localState.addAuthoredInspiration(label, content);
      showWorkspaceActionFeedback("feedback.boardItemAdded");
    },
    addAuthoredUncertainty(label: string, content: string): void {
      localState.addAuthoredUncertainty(label, content);
      showWorkspaceActionFeedback("feedback.boardItemAdded");
    },
    addAuthoredSource(label: string, origin: string, note: string): void {
      localState.addAuthoredSource(label, origin, note);
      showWorkspaceActionFeedback("feedback.sourceAdded");
    },
    removeLocalSource(sourceId: string): void {
      const summary = localState.removeLocalSource(sourceId);
      showWorkspaceActionFeedback(
        summary.sourcesRemoved > 0 ? "feedback.sourceRemoved" : "feedback.importFailed",
        summary.sourcesRemoved > 0 ? "success" : "error"
      );
    },
    removeLocalNode(nodeId: string): void {
      const summary = localState.removeLocalNode(nodeId);
      showWorkspaceActionFeedback(
        summary.nodesRemoved > 0 ? "feedback.boardItemRemoved" : "feedback.importFailed",
        summary.nodesRemoved > 0 ? "success" : "error"
      );
    },
    removeLocalEvidence(evidenceId: string): void {
      const summary = localState.removeLocalEvidence(evidenceId);
      showWorkspaceActionFeedback(
        summary.evidenceRemoved > 0 ? "feedback.boardItemRemoved" : "feedback.importFailed",
        summary.evidenceRemoved > 0 ? "success" : "error"
      );
    },
    resetLocalSession(): void {
      const summary = localState.resetOverlayToEmpty();
      showWorkspaceActionFeedback(
        summary.resetPerformed ? "feedback.sessionReset" : "feedback.importFailed",
        summary.resetPerformed ? "success" : "error"
      );
    },
    addAuthoredEvidence(label: string, excerpt: string, interpretation, layer, options): void {
      localState.addAuthoredEvidence(label, excerpt, interpretation, layer, options);
      showWorkspaceActionFeedback("feedback.evidenceAdded");
    },
    addAuthoredEdge(edgeType, sourceId: string, targetId: string, note?: string): void {
      const beforeCount = localState.getOverlay().localAuthoredEdges.length;
      localState.addAuthoredEdge(edgeType, sourceId, targetId, note);
      const added = localState.getOverlay().localAuthoredEdges.length > beforeCount;
      showWorkspaceActionFeedback(
        added ? "feedback.connectionAdded" : "feedback.importFailed",
        added ? "success" : "error"
      );
    },
    updateLocalEdge(edgeId, edgeType, note?: string): void {
      const updated = localState.updateLocalEdge(edgeId, edgeType, note);
      showWorkspaceActionFeedback(
        updated ? "feedback.connectionUpdated" : "feedback.connectionUnchanged",
        updated ? "success" : "info"
      );
    },
    importUserTextSource(input: PatternUserTextSourceImportInput) {
      if (input.text.trim() === "") {
        userTextSourceImportStatus = createEmptyUserTextStatus("Metin boş olamaz.");
        return userTextSourceImportStatus;
      }

      const producer = createUserTextProducer();
      const result = produceAndImportSource(producer, createUserTextProducerInput(input), {
        importOptions: {
          existingPackageIds: [...importedUserTextPackageIds],
        },
      });
      userTextSourceImportStatus = summarizeUserTextImportResult(result);
      render();
      showWorkspaceActionFeedback(
        userTextSourceImportStatus.success ? "feedback.importSucceeded" : "feedback.importFailed",
        userTextSourceImportStatus.success ? "success" : "error"
      );
      return userTextSourceImportStatus;
    },
    importLongTextSource(input: PatternLongTextSourceImportInput) {
      if (input.title.trim() === "") {
        longTextSourceImportStatus = createEmptyLongTextStatus("Başlık boş olamaz.");
        return longTextSourceImportStatus;
      }
      if (input.origin.trim() === "") {
        longTextSourceImportStatus = createEmptyLongTextStatus("Kaynak bilgisi boş olamaz.");
        return longTextSourceImportStatus;
      }
      if (input.text.trim() === "") {
        longTextSourceImportStatus = createEmptyLongTextStatus("Metin boş olamaz.");
        return longTextSourceImportStatus;
      }

      const producer = createLongTextProducer();
      const result = produceAndImportSource(producer, createLongTextProducerInput(input), {
        importOptions: {
          existingPackageIds: [...importedLongTextPackageIds],
        },
      });
      longTextSourceImportStatus = summarizeLongTextImportResult(result);
      render();
      showWorkspaceActionFeedback(
        longTextSourceImportStatus.success ? "feedback.importSucceeded" : "feedback.importFailed",
        longTextSourceImportStatus.success ? "success" : "error"
      );
      return longTextSourceImportStatus;
    },
    importSampleSourcePackage(packageId?: string) {
      sourceImportDemoStatus = importSampleSourcePackage(localState, packageId);
      render();
      const importedCount =
        sourceImportDemoStatus.sourcesAdded +
        sourceImportDemoStatus.evidenceAdded +
        sourceImportDemoStatus.nodesAdded +
        sourceImportDemoStatus.edgesAdded +
        sourceImportDemoStatus.notesAdded;
      showWorkspaceActionFeedback(
        importedCount > 0 ? "feedback.importSucceeded" : "feedback.importFailed",
        importedCount > 0 ? "success" : sourceImportDemoStatus.duplicate ? "info" : "error"
      );
      return sourceImportDemoStatus;
    },
    prepareDebate(): void {
      localState.prepareDebate();
      showWorkspaceActionFeedback("feedback.debateUpdated");
    },
    assignDebateRoles(): void {
      localState.assignDebateRoles();
      showWorkspaceActionFeedback("feedback.debateUpdated");
    },
    startDebate(): void {
      localState.startDebate();
      showWorkspaceActionFeedback("feedback.debateUpdated");
    },
    advanceDebatePhase(): void {
      localState.advanceDebatePhase();
      showWorkspaceActionFeedback("feedback.debateUpdated");
    },
    completeDebate(): void {
      localState.completeDebate();
      showWorkspaceActionFeedback("feedback.debateUpdated");
    },
    reflectDebateToReport(): void {
      localState.reflectDebateToReport();
      showWorkspaceActionFeedback("feedback.debateUpdated");
    },
  };

  localState.subscribe(() => {
    viewModels = adaptDomainToViewModels(domain, localState.getOverlay());
    if (selectedArchiveSourceId !== null && !archiveSourceExists(selectedArchiveSourceId)) {
      selectedConnectionId = null;
      selectedArchiveSourceId = null;
      archiveEvidenceCaptureStatus = null;
    }
    if (
      selectedNodeId !== null &&
      !viewModels.boardCategories.some((category) =>
        category.pins.some((pin) => pin.id === selectedNodeId)
      )
    ) {
      selectedNodeId = null;
    }

    if (
      selectedConnectionId !== null &&
      !viewModels.connections.some((connection) => connection.id === selectedConnectionId)
    ) {
      selectedConnectionId = null;
    }
    render();
    scheduleAutosave();
  });

  function createCurrentSnapshot(): PatternRoomSessionSnapshot {
    const presentation: PatternRoomPresentationState = {
      canvasMode: investigationCanvasMode,
      selectedBoardItemId: selectedNodeId,
      selectedConnectionId,
    };
    return createSnapshot(localState, activeView, presentation);
  }

  function clearPendingAutosave(): void {
    if (pendingSaveTimer === null) {
      return;
    }

    window.clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }

  function sendPersistenceSave(flush = false): void {
    const sendCommand = window.roomAPI?.sendCommand;
    if (typeof sendCommand !== "function") {
      return;
    }

    const payload: Record<string, unknown> = {
      snapshot: createCurrentSnapshot(),
    };
    if (flush) {
      payload["flush"] = true;
    }

    try {
      if (sendCommand(PATTERN_ROOM_SAVE_COMMAND, payload)) {
        dirty = false;
      }
    } catch (error) {
      console.warn("Pattern Room save command failed.", error);
    }
  }

  function scheduleAutosave(): void {
    if (!persistenceReady || isRestoring) {
      return;
    }

    dirty = true;
    clearPendingAutosave();
    pendingSaveTimer = window.setTimeout(() => {
      pendingSaveTimer = null;
      if (dirty) {
        sendPersistenceSave();
      }
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  function markPersistenceReady(): void {
    persistenceReady = true;
    dirty = false;
    clearPendingAutosave();
  }

  function flushPendingSave(): void {
    clearPendingAutosave();
    if (!persistenceReady || isRestoring || !dirty) {
      return;
    }

    sendPersistenceSave(true);
  }

  function handleBeforeUnload(): void {
    flushPendingSave();
  }

  function setActiveView(
    viewId: PatternViewId,
    section: PatternWorkspaceSection = "default"
  ): void {
    const previousView = activeView;
    if (viewId === "desk") {
      investigationCanvasMode = "graph";
    } else if (viewId === "board" && previousView !== "board" && previousView !== "desk") {
      investigationCanvasMode = "board";
    }
    activeView = viewId;
    activeWorkspaceSection = section;
    render(true);
    scheduleAutosave();
  }

  function renderFocusedView(viewId: FocusedPatternViewId): HTMLElement {
    const onBack = (): void => {
      setActiveView("overview");
    };
    const workspaceText = getWorkspaceText();
    const createInvestigationView = (): HTMLElement =>
      createInvestigationPanel(
        viewModels,
        actions,
        onBack,
        {
          initialMode: investigationCanvasMode,
          onModeChange(mode) {
            investigationCanvasMode = mode;
            activeView = mode === "graph" ? "desk" : "board";
            renderedView = activeView;
            workspacePanelCache.clear();
            const shell = ensureWorkspaceShell();
            shell.updateActiveView(activeView, activeWorkspaceSection);
            renderWorkspaceInspector(shell);
            scheduleAutosave();
          },
        },
        workspaceText
      );
    const panelFactories: Record<FocusedPatternViewId, () => HTMLElement> = {
      archive: () =>
        createArchivePanel(
          viewModels,
          actions,
          onBack,
          userTextSourceImportStatus,
          longTextSourceImportStatus,
          sourceImportDemoStatus,
          {
            selectedSourceId: selectedArchiveSourceId,
            onSelectSource: selectArchiveSource,
            evidenceCaptureStatus: archiveEvidenceCaptureStatus,
            onEvidenceCaptureStatusChange: setArchiveEvidenceCaptureStatus,
            searchQuery: archiveSearchQuery,
            onSearchQueryChange: setArchiveSearchQuery,
            sourceTypeFilter: archiveSourceTypeFilter,
            onSourceTypeFilterChange: setArchiveSourceTypeFilter,
          },
          workspaceText
        ),
      board: createInvestigationView,
      desk: createInvestigationView,
      report: () => createReportPanel(viewModels, actions, onBack, workspaceText),
      "tenth-man": () =>
        createTenthManPanel(
          viewModels,
          actions,
          onBack,
          {
            applyDisabled:
              caseReviewRuntimeState.activeSession !== null &&
              locallyAppliedCaseReviewSessions.has(caseReviewRuntimeState.activeSession.sessionId),
            applyFeedback: caseReviewApplyFeedback,
            evidenceCandidateFeedback,
            evidenceCandidates: localState.getOverlay().localEvidenceCandidates ?? [],
            evidenceCandidateSources: viewModels.sources.map((source) => {
              return { id: source.id, label: source.label };
            }),
            dispatchStatus: caseReviewDispatchStatus,
            history: caseReviewRuntimeState.history,
            onApply: applyCaseReview,
            onCancel: cancelCaseReview,
            onPrepare: prepareCaseReviewPreview,
            onPromoteEvidenceCandidate: promoteEvidenceCandidateFromReview,
            onRemoveEvidenceCandidate: removeEvidenceCandidateFromReview,
            onResend: resendCaseReview,
            onRetry: retryCaseReview,
            onRoleChange: selectCaseReviewRole,
            onSend: dispatchCaseReviewPreview,
            preview: caseReviewPreviewDraft,
            selectedRole: selectedCaseReviewRole,
            session: caseReviewRuntimeState.activeSession,
            text: getCaseReviewText(),
          },
          workspaceText
        ),
    };
    return panelFactories[viewId]();
  }

  function createWorkspaceSummary() {
    const overlay = localState.getOverlay();
    return {
      subject: viewModels.subject,
      sourceCount: viewModels.sources.length,
      evidenceCount: domain.evidence.length + overlay.localAuthoredEvidence.length,
      boardNoteCount:
        domain.nodes.filter((node) => {
          return node.nodeType !== "source";
        }).length + overlay.localAuthoredNodes.length,
      connectionCount: domain.edges.length + overlay.localAuthoredEdges.length,
      reviewCount: caseReviewRuntimeState.history.length,
    };
  }

  function ensureWorkspaceShell(): PatternWorkspaceShell {
    if (workspaceShell !== null) {
      return workspaceShell;
    }

    workspaceShell = createPatternWorkspaceShell(
      getWorkspaceText(),
      createWorkspaceSummary(),
      setActiveView
    );
    root.replaceChildren(workspaceShell.element);
    renderedView = null;
    return workspaceShell;
  }

  function renderWorkspaceInspector(shell: PatternWorkspaceShell = ensureWorkspaceShell()): void {
    if (activeView === "overview") {
      shell.setInspectorContent(
        createPatternCaseIdentityInspector(viewModels, actions, getWorkspaceText())
      );
      return;
    }
    if (activeView !== "board" && activeView !== "desk") {
      shell.setInspectorContent(null);
      return;
    }

    const mode: PatternInvestigationCanvasMode = activeView === "desk" ? "graph" : "board";
    shell.setInspectorContent(
      createInvestigationInspectorContent(
        mode,
        viewModels,
        actions,
        selectedNodeId,
        selectedConnectionId,
        getWorkspaceText()
      )
    );
  }

  function focusActiveWorkspaceSection(shell: PatternWorkspaceShell): void {
    if (activeWorkspaceSection !== "review-history") {
      return;
    }

    const target = shell.outlet.querySelector<HTMLElement>(
      "[data-pattern-case-review-history='true']"
    );
    if (target === null) {
      return;
    }
    target.tabIndex = -1;
    target.focus();
    target.scrollIntoView({ block: "start" });
  }

  function render(preserveWorkspace = false): void {
    const shell = ensureWorkspaceShell();
    if (renderedView !== null) {
      workspaceScrollOffsets.set(renderedView, shell.outlet.scrollTop);
    }
    if (!preserveWorkspace) {
      workspacePanelCache.clear();
    }

    let content = preserveWorkspace ? workspacePanelCache.get(activeView) : undefined;
    if (content === undefined) {
      content =
        activeView === "overview"
          ? createOverviewPanel(viewModels, setActiveView, getWorkspaceText())
          : renderFocusedView(activeView);
      workspacePanelCache.set(activeView, content);
    }

    shell.outlet.replaceChildren(content);
    shell.outlet.scrollTop = workspaceScrollOffsets.get(activeView) ?? 0;
    renderedView = activeView;
    shell.updateSummary(createWorkspaceSummary());
    shell.updateActiveView(activeView, activeWorkspaceSection);
    renderWorkspaceInspector(shell);
    focusActiveWorkspaceSection(shell);
  }

  function restoreSnapshot(snapshot: unknown): boolean {
    const restoredState = restoreFromSnapshot(snapshot, domain);
    if (restoredState === null) {
      return false;
    }

    isRestoring = true;
    try {
      activeView = restoredState.activeView;
      investigationCanvasMode =
        restoredState.presentation?.canvasMode ?? (activeView === "desk" ? "graph" : "board");
      if (activeView === "board" || activeView === "desk") {
        activeView = investigationCanvasMode === "graph" ? "desk" : "board";
      }
      activeWorkspaceSection = "default";
      selectedNodeId = restoredState.presentation?.selectedBoardItemId ?? null;
      selectedConnectionId = restoredState.presentation?.selectedConnectionId ?? null;
      selectedArchiveSourceId = null;
      archiveEvidenceCaptureStatus = null;
      evidenceCandidateFeedback = null;
      localState.restoreOverlay(restoredState.overlay, restoredState.guards);
      return true;
    } finally {
      isRestoring = false;
    }
  }

  function handleLoadedPayload(payload: unknown): void {
    if (!isRecord(payload) || payload["snapshot"] === null || payload["snapshot"] === undefined) {
      markPersistenceReady();
      return;
    }

    try {
      restoreSnapshot(payload["snapshot"]);
    } catch (error) {
      console.warn("Pattern Room snapshot restore failed.", error);
    } finally {
      markPersistenceReady();
    }
  }

  function handleSaveFailedPayload(payload: unknown): void {
    const message =
      isRecord(payload) && typeof payload["error"] === "string"
        ? payload["error"]
        : "Pattern Room save failed.";
    dirty = true;
    console.warn(message);
  }

  function readCaseReviewEventPayload(value: unknown): PatternRoomCaseReviewEventPayload | null {
    if (!isRecord(value) || !isRecord(value["event"])) {
      return null;
    }
    const event = value["event"];
    if (
      typeof event["type"] !== "string" ||
      !CASE_REVIEW_EVENT_TYPES.includes(event["type"] as PatternRoomCaseReviewEvent["type"]) ||
      typeof event["sessionId"] !== "string" ||
      typeof event["occurredAt"] !== "string" ||
      !isPatternRoomCaseReviewRuntimeState(value["state"])
    ) {
      return null;
    }
    return {
      event: event as PatternRoomCaseReviewEvent,
      state: value["state"],
    };
  }

  function handleCaseReviewEventPayload(payload: unknown): void {
    const parsed = readCaseReviewEventPayload(payload);
    if (parsed === null) {
      return;
    }

    caseReviewRuntimeState = parsed.state;
    caseReviewDispatchStatus = CASE_REVIEW_IDLE_STATUS;
    const activeSession = parsed.state.activeSession;
    if (activeSession !== null) {
      selectedCaseReviewRole = activeSession.role;
      for (const sessionId of caseReviewDraftsBySessionId.keys()) {
        if (sessionId !== activeSession.sessionId) {
          caseReviewDraftsBySessionId.delete(sessionId);
        }
      }
      if (!caseReviewDraftsBySessionId.has(activeSession.sessionId)) {
        const recoveredDraft = readCaseReviewDispatchDraft(activeSession.metadata["dispatchDraft"]);
        if (recoveredDraft !== null) {
          caseReviewDraftsBySessionId.set(activeSession.sessionId, recoveredDraft);
          caseReviewPreviewDraft = createRecoveredCaseReviewPreview(
            recoveredDraft,
            activeSession.reviewLabel
          );
        }
      }
    }
    caseReviewApplyFeedback =
      parsed.event.type === "review-applied"
        ? {
            tone: "success",
            message: getCaseReviewText()("messages.applied"),
          }
        : null;
    render();
  }

  function handleHostContext(message: Record<string, unknown>): void {
    const source = isRecord(message["payload"]) ? message["payload"] : message;
    if (typeof source["locale"] === "string" && source["locale"].trim() !== "") {
      caseReviewLocale = source["locale"].trim();
      document.documentElement.lang = caseReviewLocale;
    }
    if (isRecord(source["translations"])) {
      caseReviewTranslations = source["translations"];
    }
    workspaceShell = null;
    renderedView = null;
    workspacePanelCache.clear();
    render();
  }

  function handleCaseReviewDispatchedPayload(): void {
    setCaseReviewDispatchStatus({
      kind: "sent",
      message: getCaseReviewText()("messages.dispatched", { role: selectedCaseReviewRole }),
    });
  }

  function handleCaseReviewDispatchFailedPayload(): void {
    setCaseReviewDispatchStatus({
      kind: "failed",
      message: getCaseReviewText()("messages.dispatchFailed"),
    });
  }

  function handleHostMessage(message: unknown): void {
    if (!isRecord(message)) {
      return;
    }

    if (message["type"] === "host-context") {
      handleHostContext(message);
      return;
    }

    if (message["type"] === PATTERN_ROOM_LOADED_EVENT) {
      handleLoadedPayload(message["payload"]);
      return;
    }

    if (message["type"] === PATTERN_ROOM_SAVED_EVENT) {
      return;
    }

    if (message["type"] === PATTERN_ROOM_SAVE_FAILED_EVENT) {
      handleSaveFailedPayload(message["payload"]);
      return;
    }

    if (message["type"] === PATTERN_ROOM_CASE_REVIEW_EVENT) {
      handleCaseReviewEventPayload(message["payload"]);
      return;
    }

    if (message["type"] === PATTERN_ROOM_CASE_REVIEW_DISPATCHED_EVENT) {
      handleCaseReviewDispatchedPayload();
      return;
    }

    if (message["type"] === PATTERN_ROOM_CASE_REVIEW_DISPATCH_FAILED_EVENT) {
      handleCaseReviewDispatchFailedPayload();
    }
  }

  function connectHostMessages(): void {
    if (hostMessagesConnected || typeof window.roomAPI?.onHostMessage !== "function") {
      return;
    }

    hostMessagesConnected = true;
    const maybeRemoveListener = window.roomAPI.onHostMessage(handleHostMessage) as unknown;
    removeHostMessageListener = isHostMessageUnsubscribe(maybeRemoveListener)
      ? maybeRemoveListener
      : null;
  }

  function disconnectHostMessages(): void {
    if (!hostMessagesConnected) {
      return;
    }

    removeHostMessageListener?.();
    removeHostMessageListener = null;
    hostMessagesConnected = false;
  }

  function connectBeforeUnload(): void {
    if (beforeUnloadConnected || typeof window.addEventListener !== "function") {
      return;
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    beforeUnloadConnected = true;
  }

  function disconnectBeforeUnload(): void {
    if (!beforeUnloadConnected || typeof window.removeEventListener !== "function") {
      return;
    }

    window.removeEventListener("beforeunload", handleBeforeUnload);
    beforeUnloadConnected = false;
  }

  function announceReady(): void {
    window.roomAPI?.ready?.({
      roomId: "pattern-room",
      featureId: "pattern-workbench",
      status: "ready",
    });
  }

  return {
    start(): void {
      connectHostMessages();
      connectBeforeUnload();
      render();
      announceReady();
    },
    dispose(): void {
      flushPendingSave();
      disconnectHostMessages();
      disconnectBeforeUnload();
      clearPendingAutosave();
    },
    createSnapshot(): PatternRoomSessionSnapshot {
      return createCurrentSnapshot();
    },
    restoreSnapshot,
  };
}
