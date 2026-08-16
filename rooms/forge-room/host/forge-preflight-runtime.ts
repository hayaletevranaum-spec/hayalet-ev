import { FORGE_TASK_PROMPT_CONTEXT_BUDGET } from "../shared/forge-constants.js";
import type {
  ForgeContextCapsule,
  ForgeGoal,
  ForgeOperatorProfile,
  ForgePreflightBundle,
  ForgePreflightStepId,
  ForgePreflightState,
  ForgeRunOverride,
  ForgeRunSignature,
  ForgeRovoPreAnalysis,
  ForgeSessionContextSelection,
  ForgeSelectedOperatorProfile,
  ForgeSynthesisProvenance,
} from "../shared/types/index.js";
import {
  toJsonText,
  toRecord,
  asNonEmptyString,
  asStringArray,
  buildForgeOutputLanguageRule,
  createForgeId,
  uniqueStrings,
} from "./forge-runtime-support.js";
import {
  buildForgeAppArchitectureSummary,
  buildForgeCoreSystemMetadata,
  buildForgeSelectedOperatorProfile,
  buildForgeDerivedConstraints,
  buildForgeTargetRoomContext,
  createForgePreflightCreatedAt,
  listForgeCapabilityDescriptors,
  summarizeForgeSelectedOperatorContext,
} from "./forge-preflight-metadata.js";
import { selectForgeCapabilityContext } from "./forge-capability-selector.js";
import { buildContextDigest } from "./forge-context-digest.js";
import { buildForgeRunSignature } from "./forge-run-signature.js";
import { serializeForAI0, serializeForAI1 } from "./forge-stage-serializers.js";

type ForgeDispatchBridge = (payload: Record<string, unknown>) => Promise<unknown>;

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function appendBudgetedSegments(segments: string[], budget: number): string {
  let remaining = Math.max(0, budget);
  const rendered: string[] = [];

  for (const segment of segments) {
    const separatorLength = rendered.length > 0 ? 2 : 0;
    const available = remaining - separatorLength;
    if (available <= 0) {
      break;
    }
    if (segment.length <= available) {
      rendered.push(segment);
      remaining -= separatorLength + segment.length;
      continue;
    }
    if (available > 12) {
      rendered.push(`${segment.slice(0, Math.max(0, available - 1)).trimEnd()}…`);
    }
    break;
  }

  return rendered.join("\n\n").trim();
}

function normalizeRovoPreAnalysis(value: unknown): ForgeRovoPreAnalysis | null {
  const record = toRecord(value);
  const summary = asNonEmptyString(record["summary"]);
  if (summary === null) {
    return null;
  }
  return {
    status: asNonEmptyString(record["status"]) === "warning" ? "warning" : "completed",
    summary,
    warnings: asStringArray(record["warnings"]).slice(0, 3),
    missingInfo: asStringArray(record["missingInfo"]).slice(0, 3),
  };
}

function findStructuredReplyBoundary(text: string): number | null {
  const startChar = text.charAt(0);
  if (startChar !== "{" && startChar !== "[") {
    return null;
  }

  let braceDepth = startChar === "{" ? 1 : 0;
  let bracketDepth = startChar === "[" ? 1 : 0;
  let inString = false;
  let escapeNext = false;

  for (let index = 1; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (inString) {
      if (char === "\\") {
        escapeNext = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      braceDepth += 1;
      continue;
    }

    if (char === "}") {
      braceDepth -= 1;
      if (braceDepth < 0) {
        return null;
      }
    } else if (char === "[") {
      bracketDepth += 1;
    } else if (char === "]") {
      bracketDepth -= 1;
      if (bracketDepth < 0) {
        return null;
      }
    }

    if (braceDepth === 0 && bracketDepth === 0) {
      return index + 1;
    }
  }

  return null;
}

function extractStructuredJsonText(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }

  const withoutJsonPrefix = trimmed.replace(/^json\b\s*/i, "").trimStart();
  const fencedMatch = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(withoutJsonPrefix);
  const searchSpace = (fencedMatch?.[1] ?? withoutJsonPrefix).trim();
  const jsonStart = searchSpace.search(/[{[]/);
  if (jsonStart < 0) {
    return null;
  }

  const candidate = searchSpace.slice(jsonStart).trimStart();
  const boundary = findStructuredReplyBoundary(candidate);
  if (boundary === null) {
    return null;
  }

  return candidate.slice(0, boundary).trim();
}

function parseRovoPreAnalysisReply(text: string): ForgeRovoPreAnalysis | null {
  const structuredJsonText = extractStructuredJsonText(text);
  if (structuredJsonText === null) {
    return null;
  }

  try {
    return normalizeRovoPreAnalysis(JSON.parse(structuredJsonText));
  } catch {
    return null;
  }
}

function buildPreAnalysisPrompt(params: {
  appArchitectureSummary: string;
  capabilitySummary: string | null;
  contextDigest: string;
  constraints: string[];
  contextPayload: Record<string, unknown>;
  goal: ForgeGoal;
  locale?: string | null;
  runId: string;
  runOverride: ForgeRunOverride | null;
  selectedOperatorProfile: ForgeSelectedOperatorProfile;
  sessionRevision: number;
  sessionContextSelection: ForgeSessionContextSelection;
  targetRoomSummary: string | null;
}): string {
  return [
    "Return JSON only using this exact schema:",
    toJsonText({
      summary: "Short software pre-analysis summary",
      warnings: ["Optional warning"],
      missingInfo: ["Optional missing information item"],
      status: "completed",
    }),
    "Goal: Provide a short Hayalet Ev software infrastructure pre-analysis for this Forge run.",
    `Run id: ${params.runId}`,
    `Context digest: ${params.contextDigest}`,
    `Session revision: ${String(params.sessionRevision)}`,
    `Architecture summary: ${params.appArchitectureSummary}`,
    params.targetRoomSummary ? `Target room context: ${params.targetRoomSummary}` : "",
    params.capabilitySummary ? `Capability context: ${params.capabilitySummary}` : "",
    `Allowed context payload:\n${toJsonText(params.contextPayload)}`,
    "Rules:",
    `- ${buildForgeOutputLanguageRule(params.locale)}`,
    "- Observations only. Do not make decisions or produce task breakdowns.",
    "- Focus on software boundaries, integration risks, missing system context, and implementation guardrails.",
    "- Mention blockers or missing information only if they are explicit from the context.",
    "- Keep warnings factual and concise.",
  ]
    .filter((entry) => entry.trim() !== "")
    .join("\n");
}

async function maybeRunForgeRovoPreAnalysis(params: {
  dispatchBridge: ForgeDispatchBridge | null;
  appArchitectureSummary: string;
  capabilitySummary: string | null;
  contextDigest: string;
  constraints: string[];
  contextPayload: Record<string, unknown>;
  goal: ForgeGoal;
  protocol: {
    key: string;
    scenario: string;
    room: string;
  };
  runId: string;
  runOverride: ForgeRunOverride | null;
  selectedOperatorProfile: ForgeSelectedOperatorProfile;
  sessionRevision: number;
  sessionContextSelection: ForgeSessionContextSelection;
  targetRoomSummary: string | null;
}): Promise<ForgeRovoPreAnalysis | null> {
  if (params.dispatchBridge === null) {
    return {
      status: "warning",
      summary:
        "AI0 software pre-analysis is unavailable because the assistant bridge is disconnected.",
      warnings: ["AI0 bridge is unavailable for preflight analysis."],
      missingInfo: [],
    };
  }

  const result = toRecord(
    await params.dispatchBridge({
      action: "message.sendWait",
      timeoutMs: 180000,
      toSlot: "ai0",
      payload: {
        page: "forge-room:preflight",
        text: buildPreAnalysisPrompt(params),
        protocol: {
          room: params.protocol.room,
          scenario: params.protocol.scenario,
          protocolKey: params.protocol.key,
        },
      },
    })
  );
  if (result["success"] !== true) {
    return {
      status: "warning",
      summary:
        asNonEmptyString(result["message"]) ??
        "AI0 software pre-analysis did not complete cleanly.",
      warnings: [asNonEmptyString(result["message"]) ?? "AI0 pre-analysis request failed."],
      missingInfo: [],
    };
  }

  const reply = toRecord(result["reply"]);
  const replyText = asNonEmptyString(reply["text"]);
  if (replyText === null) {
    return {
      status: "warning",
      summary: "AI0 software pre-analysis returned without readable text.",
      warnings: ["AI0 pre-analysis reply text was empty."],
      missingInfo: [],
    };
  }

  return (
    parseRovoPreAnalysisReply(replyText) ?? {
      status: "warning",
      summary: "AI0 software pre-analysis reply was not valid observation JSON.",
      warnings: ["AI0 pre-analysis response could not be parsed."],
      missingInfo: [],
    }
  );
}

export async function buildForgePreflightState(params: {
  contextDigest?: string;
  dispatchBridge: ForgeDispatchBridge | null;
  goal: ForgeGoal;
  locale?: string | null;
  onStepStart?: (stepId: ForgePreflightStepId) => void;
  operatorProfile: ForgeOperatorProfile;
  protocol: {
    key: string;
    room: string;
    scenario: string;
  };
  runId?: string | null;
  runOverride: ForgeRunOverride | null;
  sessionRevision?: number;
  sessionContextSelection: ForgeSessionContextSelection;
  sessionId: string | null;
}): Promise<{ runSignature: ForgeRunSignature; state: ForgePreflightState }> {
  params.onStepStart?.("operatorContext");
  const selectedOperatorProfile = buildForgeSelectedOperatorProfile({
    operatorProfile: params.operatorProfile,
    sessionContextSelection: params.sessionContextSelection,
  });
  const contextDigest =
    params.contextDigest ??
    buildContextDigest({
      goal: params.goal,
      preflightInputFields: {
        enableRovoPreAnalysis: params.runOverride?.enableRovoPreAnalysis === true,
      },
      runOverride: params.runOverride,
      selectedOperatorProfile,
      sessionContextSelection: params.sessionContextSelection,
    });
  const runId = asNonEmptyString(params.runId) ?? createForgeId("forge-run");
  const sessionRevision = Math.max(0, params.sessionRevision ?? 0);
  params.onStepStart?.("constraints");
  const capabilityContext = selectForgeCapabilityContext({
    descriptors: listForgeCapabilityDescriptors(),
    goal: params.goal,
  });
  const appArchitectureSummary = buildForgeAppArchitectureSummary();
  const targetRoomContext = buildForgeTargetRoomContext(params.goal.targetRoomId);
  const constraints = buildForgeDerivedConstraints({
    goal: params.goal,
    runOverride: params.runOverride,
    selectedOperatorProfile,
  });
  const contextPayload = serializeForAI0({
    appArchitectureSummary,
    capabilityContext,
    constraints,
    contextDigest,
    goal: params.goal,
    runId,
    runOverride: params.runOverride,
    selectedOperatorProfile,
    sessionRevision,
    targetRoomContext,
  });
  params.onStepStart?.("ai0Analysis");
  const rovoPreAnalysis = await maybeRunForgeRovoPreAnalysis({
    ...params,
    appArchitectureSummary: appArchitectureSummary.summary,
    capabilitySummary: capabilityContext?.summary ?? null,
    contextDigest,
    contextPayload,
    constraints,
    selectedOperatorProfile,
    runId,
    sessionRevision,
    targetRoomSummary: targetRoomContext?.summary ?? null,
  });
  const warnings = [
    ...(rovoPreAnalysis?.warnings ?? []),
    ...(rovoPreAnalysis?.status === "warning" && rovoPreAnalysis.summary.trim() !== ""
      ? [rovoPreAnalysis.summary]
      : []),
  ];
  const bundle: ForgePreflightBundle = {
    schemaVersion: "v3",
    createdAt: createForgePreflightCreatedAt(),
    contextDigest,
    coreSystemMetadata: buildForgeCoreSystemMetadata(params.sessionId),
    appArchitectureSummary,
    targetRoomContext,
    capabilityContext,
    preflightId: createForgeId("forge-preflight"),
    runId,
    sessionRevision,
    selectedOperatorProfile,
    runOverride: params.runOverride,
    rovoPreAnalysis,
    sessionContextSelection: params.sessionContextSelection,
    constraints,
  };
  params.onStepStart?.("runSignature");
  const runSignature = buildForgeRunSignature({
    goal: params.goal,
    selectedOperatorProfile,
    runOverride: params.runOverride,
  });
  const promptCharCount = renderForgePromptContext({
    bundle,
    contextCapsule: null,
    decisionTrace: [],
    runSignature,
  }).length;

  return {
    runSignature,
    state: {
      activeStepId: null,
      bundle,
      contextDigest,
      errorMessage: null,
      expectedContextDigest: contextDigest,
      preflightId: bundle.preflightId,
      promptCharCount,
      ranAt: bundle.createdAt,
      runId,
      sessionRevision,
      staleReason: null,
      status: warnings.length > 0 ? "warning" : "fresh",
      warnings,
    },
  };
}

export function buildForgeFallbackPreflightState(params: {
  contextDigest?: string;
  errorMessage: string;
  goal: ForgeGoal;
  operatorProfile: ForgeOperatorProfile;
  runId?: string | null;
  runOverride: ForgeRunOverride | null;
  sessionRevision?: number;
  sessionContextSelection: ForgeSessionContextSelection;
  sessionId: string | null;
}): { runSignature: ForgeRunSignature; state: ForgePreflightState } {
  const selectedOperatorProfile = buildForgeSelectedOperatorProfile({
    operatorProfile: params.operatorProfile,
    sessionContextSelection: params.sessionContextSelection,
  });
  const contextDigest =
    params.contextDigest ??
    buildContextDigest({
      goal: params.goal,
      preflightInputFields: {
        enableRovoPreAnalysis: params.runOverride?.enableRovoPreAnalysis === true,
      },
      runOverride: params.runOverride,
      selectedOperatorProfile,
      sessionContextSelection: params.sessionContextSelection,
    });
  const runId = asNonEmptyString(params.runId) ?? createForgeId("forge-run");
  const sessionRevision = Math.max(0, params.sessionRevision ?? 0);
  const bundle: ForgePreflightBundle = {
    schemaVersion: "v3",
    createdAt: createForgePreflightCreatedAt(),
    contextDigest,
    coreSystemMetadata: buildForgeCoreSystemMetadata(params.sessionId),
    appArchitectureSummary: buildForgeAppArchitectureSummary(),
    targetRoomContext: buildForgeTargetRoomContext(params.goal.targetRoomId),
    capabilityContext: null,
    preflightId: createForgeId("forge-preflight"),
    runId,
    sessionRevision,
    selectedOperatorProfile,
    runOverride: params.runOverride,
    rovoPreAnalysis: null,
    sessionContextSelection: params.sessionContextSelection,
    constraints: buildForgeDerivedConstraints({
      goal: params.goal,
      runOverride: params.runOverride,
      selectedOperatorProfile,
    }),
  };
  const runSignature = buildForgeRunSignature({
    goal: params.goal,
    selectedOperatorProfile,
    runOverride: params.runOverride,
  });
  const warnings = [
    "Preflight fell back to minimal context because the full bundle could not be prepared.",
    params.errorMessage,
  ];

  return {
    runSignature,
    state: {
      activeStepId: null,
      bundle,
      contextDigest,
      errorMessage: params.errorMessage,
      expectedContextDigest: contextDigest,
      preflightId: bundle.preflightId,
      promptCharCount: renderForgePromptContext({
        bundle,
        contextCapsule: null,
        decisionTrace: [],
        runSignature,
      }).length,
      ranAt: bundle.createdAt,
      runId,
      sessionRevision,
      staleReason: null,
      status: "warning",
      warnings,
    },
  };
}

export function summarizeForgePreflightWarningsForExport(preflight: ForgePreflightState): string[] {
  const rawError = preflight.errorMessage?.trim() ?? "";
  return uniqueStrings(
    preflight.warnings.filter((warning) => {
      const normalized = warning.trim();
      if (normalized === "") {
        return false;
      }
      if (rawError === "") {
        return true;
      }
      return normalized !== rawError && normalized.includes(rawError) === false;
    })
  ).slice(0, 3);
}

export function buildForgeSynthesisProvenance(params: {
  preflight: ForgePreflightState;
  runOverride: ForgeRunOverride | null;
  runSignature: ForgeRunSignature | null;
  selectedOperatorProfile: ForgeSelectedOperatorProfile;
  sessionContextSelection: ForgeSessionContextSelection;
}): ForgeSynthesisProvenance {
  return {
    contextDigest: params.preflight.contextDigest ?? params.preflight.bundle?.contextDigest ?? null,
    runSignature: params.runSignature?.value ?? null,
    operatorProfileSummary: summarizeForgeSelectedOperatorContext({
      runOverride: params.runOverride,
      selectedOperatorProfile: params.selectedOperatorProfile,
      sessionContextSelection: params.sessionContextSelection,
    }),
    preflightId: params.preflight.preflightId ?? params.preflight.bundle?.preflightId ?? null,
    preflightWarnings: summarizeForgePreflightWarningsForExport(params.preflight),
    runId: params.preflight.runId ?? params.preflight.bundle?.runId ?? null,
    sessionRevision:
      params.preflight.sessionRevision ?? params.preflight.bundle?.sessionRevision ?? null,
  };
}

export function getPreflightForRun(
  runId: string | null,
  contextDigest: string | null,
  preflight: ForgePreflightState
): ForgePreflightState | null {
  if (runId === null || contextDigest === null) {
    return null;
  }
  const preflightRunId = preflight.runId ?? preflight.bundle?.runId ?? null;
  const preflightDigest = preflight.contextDigest ?? preflight.bundle?.contextDigest ?? null;
  if (preflightRunId !== runId || preflightDigest !== contextDigest) {
    return null;
  }
  return preflight;
}

export function assertFreshPreflight(params: {
  contextDigest: string;
  preflight: ForgePreflightState;
  runId: string;
}): ForgePreflightState {
  const matched = getPreflightForRun(params.runId, params.contextDigest, params.preflight);
  if (matched === null) {
    throw new Error("Preflight does not match the active Forge run context.");
  }
  if (matched.status !== "fresh" && matched.status !== "warning") {
    throw new Error(matched.staleReason ?? "Preflight must be refreshed before continuing.");
  }
  const expectedDigest = matched.expectedContextDigest ?? matched.contextDigest;
  if (expectedDigest !== params.contextDigest) {
    throw new Error("Preflight context digest is stale for the active Forge run.");
  }
  return matched;
}

export function classifyFreshPreflightError(params: {
  contextDigest: string;
  preflight: ForgePreflightState;
  runId: string;
}): "forge.context.digest_mismatch" | "forge.preflight.stale_reject" {
  const matched = getPreflightForRun(params.runId, params.contextDigest, params.preflight);
  if (matched === null) {
    return "forge.context.digest_mismatch";
  }
  const expectedDigest = matched.expectedContextDigest ?? matched.contextDigest;
  if (expectedDigest !== params.contextDigest) {
    return "forge.context.digest_mismatch";
  }
  return "forge.preflight.stale_reject";
}

export function renderForgePromptContext(params: {
  bundle: ForgePreflightBundle | null;
  contextCapsule: ForgeContextCapsule | null;
  decisionTrace: string[];
  runSignature: ForgeRunSignature | null;
  budget?: number;
}): string {
  const budget = Math.max(240, params.budget ?? FORGE_TASK_PROMPT_CONTEXT_BUDGET);
  const segments: string[] = [];

  if (params.runSignature?.value) {
    segments.push(`Run signature: ${params.runSignature.value}`);
  }

  if (params.bundle !== null) {
    segments.push(
      `Run revision: ${params.bundle.runId}/${params.bundle.contextDigest}/${String(
        params.bundle.sessionRevision
      )}`
    );
    segments.push(
      `Architecture summary: ${compactWhitespace(params.bundle.appArchitectureSummary.summary)}`
    );
    if (params.bundle.targetRoomContext?.summary) {
      segments.push(
        `Target room context: ${compactWhitespace(params.bundle.targetRoomContext.summary)}`
      );
    }
    if (params.bundle.capabilityContext?.summary) {
      segments.push(
        `Capability context: ${compactWhitespace(params.bundle.capabilityContext.summary)}`
      );
    }
    const promptPayload = serializeForAI1({
      bundle: params.bundle,
      decisionTrace: params.decisionTrace,
      goal: null,
      taskContextCapsule: params.contextCapsule,
    });
    segments.push(`Operator context: ${toJsonText(promptPayload)}`);
    if (params.bundle.constraints.length > 0) {
      segments.push(`Context constraints: ${params.bundle.constraints.join(" | ")}`);
    }
    if (params.bundle.rovoPreAnalysis?.summary) {
      segments.push(
        `AI0 preflight observations: ${compactWhitespace(params.bundle.rovoPreAnalysis.summary)}`
      );
    }
  }

  if (params.decisionTrace.length > 0) {
    segments.push(`Decision trace: ${params.decisionTrace.join(" | ")}`);
  }

  if (params.contextCapsule !== null) {
    const capsuleSegments = [
      params.contextCapsule.summary.trim()
        ? `Summary: ${params.contextCapsule.summary.trim()}`
        : "",
    ].filter((entry) => entry !== "");
    if (capsuleSegments.length > 0) {
      segments.push(`Task capsule: ${capsuleSegments.join(" ; ")}`);
    }
  }

  return appendBudgetedSegments(
    segments.filter((entry) => entry.trim() !== "").map((entry) => compactWhitespace(entry)),
    budget
  );
}
