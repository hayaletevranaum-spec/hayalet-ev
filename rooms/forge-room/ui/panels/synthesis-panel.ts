import type { ForgeUiState, ForgeWorkbenchUiFlowState } from "../../shared/ui/state.js";
import { createForgePanel } from "./panel-shell.js";

function createButton(
  documentRef: Document,
  label: string,
  options: {
    action?: string;
    dataset?: Record<string, string>;
    disabled?: boolean;
    primary?: boolean;
  } = {}
): HTMLButtonElement {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = options.primary
    ? "forge-button forge-button--primary"
    : "forge-button forge-button--secondary";
  if (options.action) {
    button.dataset["forgeAction"] = options.action;
  }
  Object.entries(options.dataset ?? {}).forEach(([key, value]) => {
    button.dataset[key] = value;
  });
  button.disabled = options.disabled === true;
  button.textContent = label;
  return button;
}

function createStatusBadge(
  documentRef: Document,
  value: string,
  tone: "soft" | "warning" | "accent"
): HTMLElement {
  const badge = documentRef.createElement("span");
  badge.className =
    tone === "warning"
      ? "forge-chip forge-chip--warning"
      : tone === "accent"
        ? "forge-chip forge-chip--accent"
        : "forge-chip forge-chip--soft";
  badge.textContent = value;
  return badge;
}

function createGuideCard(
  documentRef: Document,
  titleText: string,
  summaryText: string,
  chips: Array<{
    label: string;
    tone?: "soft" | "warning" | "accent";
  }> = [],
  gateTone: "active" | "blocked" | "locked" | "monitor" = "active"
): HTMLElement {
  const card = documentRef.createElement("article");
  card.className = "forge-state-guide forge-state-guide--gate";
  card.dataset["forgeGateState"] = gateTone;
  const title = documentRef.createElement("strong");
  title.textContent = titleText;
  const summary = documentRef.createElement("p");
  summary.className = "forge-panel__hint";
  summary.textContent = summaryText;
  card.append(title, summary);
  if (chips.length > 0) {
    const meta = documentRef.createElement("div");
    meta.className = "forge-flow-item__meta";
    chips.forEach((chip) => {
      meta.append(createStatusBadge(documentRef, chip.label, chip.tone ?? "soft"));
    });
    card.append(meta);
  }
  return card;
}

function toCountLabel(
  text: (path: string[], fallback: string, params?: Record<string, number | string>) => string,
  pathPrefix: string[],
  count: number,
  oneFallback: string,
  otherFallback: string
): string {
  const pathRoot = [...pathPrefix];
  const leaf = pathRoot.pop();
  if (!leaf) {
    return count === 1
      ? oneFallback.replace("{count}", String(count))
      : otherFallback.replace("{count}", String(count));
  }
  return count === 1
    ? text([...pathRoot, `${leaf}One`], oneFallback, { count })
    : text([...pathRoot, `${leaf}Other`], otherFallback, { count });
}

function describeOutputState(
  flowState: ForgeWorkbenchUiFlowState,
  options: {
    exportBlockedReason: string | null;
    synthesisBlockedReason: string | null;
  },
  text: (path: string[], fallback: string, params?: Record<string, number | string>) => string
): {
  summary: string;
  title: string;
  tone: "active" | "blocked" | "locked" | "monitor";
} {
  switch (flowState) {
    case "IDLE":
    case "SESSION_CREATED":
    case "GOAL_DEFINED":
    case "DRAFT_READY":
    case "APPROVED":
    case "DISPATCHED":
      return {
        title: text(
          ["workbench", "synthesisPanel", "guide", "locked", "title"],
          "OUTPUT GATE LOCKED"
        ),
        summary: text(
          ["workbench", "synthesisPanel", "guide", "locked", "summary"],
          "REQUIRES: RESPONSES"
        ),
        tone: "locked",
      };
    case "RESPONSES_READY":
      return {
        title: text(
          ["workbench", "synthesisPanel", "guide", "ready", "title"],
          "OUTPUT GATE READY"
        ),
        summary:
          options.synthesisBlockedReason ??
          text(
            ["workbench", "synthesisPanel", "guide", "ready", "summary"],
            "NEXT ACTION: GENERATE SYNTHESIS"
          ),
        tone: "active",
      };
    case "CONFLICT":
      return {
        title: text(
          ["workbench", "synthesisPanel", "guide", "blocked", "title"],
          "OUTPUT GATE BLOCKED"
        ),
        summary: text(
          ["workbench", "synthesisPanel", "guide", "blocked", "summary"],
          "REQUIRES: CONFLICT RESOLUTION"
        ),
        tone: "blocked",
      };
    case "SYNTHESIS_READY":
      return {
        title: text(["workbench", "synthesisPanel", "guide", "open", "title"], "OUTPUT GATE OPEN"),
        summary:
          options.exportBlockedReason ??
          text(
            ["workbench", "synthesisPanel", "guide", "open", "summary"],
            "NEXT ACTION: SELECT SYNTHESIS"
          ),
        tone: "active",
      };
    case "EXPORTED":
      return {
        title: text(
          ["workbench", "synthesisPanel", "guide", "archive", "title"],
          "OUTPUT GATE ARCHIVE"
        ),
        summary: text(
          ["workbench", "synthesisPanel", "guide", "archive", "summary"],
          "STATE: EXPORT COMPLETE"
        ),
        tone: "monitor",
      };
    default:
      return {
        title: text(
          ["workbench", "synthesisPanel", "guide", "locked", "title"],
          "OUTPUT GATE LOCKED"
        ),
        summary: text(
          ["workbench", "synthesisPanel", "guide", "locked", "summary"],
          "REQUIRES: RESPONSES"
        ),
        tone: "locked",
      };
  }
}

function toOutputStatusLabel(
  exportSummary: ForgeUiState["snapshot"]["exportSummary"],
  flowState: ForgeWorkbenchUiFlowState,
  text: (path: string[], fallback: string, params?: Record<string, number | string>) => string
): string {
  if (flowState === "EXPORTED") {
    return text(["workbench", "synthesisPanel", "outputStatus", "shipped"], "shipped");
  }
  if (exportSummary.exportReady) {
    return text(["workbench", "synthesisPanel", "outputStatus", "ready"], "ready");
  }
  if (exportSummary.selectedSynthesisId === null) {
    return text(
      ["workbench", "synthesisPanel", "outputStatus", "needsSelection"],
      "needs selection"
    );
  }
  if (exportSummary.openConflictCount > 0) {
    return text(["workbench", "synthesisPanel", "outputStatus", "needsDecision"], "needs decision");
  }
  if (exportSummary.acceptanceCriteriaCount === 0) {
    return text(["workbench", "synthesisPanel", "outputStatus", "needsCriteria"], "needs criteria");
  }
  return text(["workbench", "synthesisPanel", "outputStatus", "blocked"], "blocked");
}

export function renderSynthesisPanel(
  documentRef: Document,
  state: ForgeUiState,
  text: (path: string[], fallback: string, params?: Record<string, number | string>) => string,
  options: {
    expandedSynthesisIds: Set<string>;
    exportBlockedReason: string | null;
    flowState: ForgeWorkbenchUiFlowState;
    synthesisBlockedReason: string | null;
  }
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "forge-panel__body";
  const exportSummary = state.snapshot.exportSummary;
  const outputState = describeOutputState(options.flowState, options, text);
  const selectedSynthesis =
    state.snapshot.syntheses.find((entry) => entry.id === state.snapshot.selectedSynthesisId) ??
    null;
  const selectedRunSignature =
    selectedSynthesis?.provenance?.runSignature ?? state.snapshot.runSignature?.value ?? null;
  const selectedDecisionTrace = selectedSynthesis?.decisionTrace ?? state.snapshot.decisionTrace;
  const selectedPreflightWarnings =
    selectedSynthesis?.provenance?.preflightWarnings ?? state.snapshot.preflight.warnings;

  body.append(
    createGuideCard(
      documentRef,
      outputState.title,
      outputState.summary,
      [
        {
          label: toCountLabel(
            text,
            ["workbench", "synthesisPanel", "chips", "answers"],
            state.snapshot.responses.length,
            "{count} answer",
            "{count} answers"
          ),
        },
        {
          label: toCountLabel(
            text,
            ["workbench", "synthesisPanel", "chips", "decisionsLeft"],
            state.snapshot.conflicts.filter((conflict) => conflict.status === "open").length,
            "{count} decision left",
            "{count} decisions left"
          ),
          tone:
            state.snapshot.conflicts.filter((conflict) => conflict.status === "open").length > 0
              ? "warning"
              : "soft",
        },
        {
          label: toCountLabel(
            text,
            ["workbench", "synthesisPanel", "chips", "syntheses"],
            state.snapshot.syntheses.length,
            "{count} synthesis",
            "{count} syntheses"
          ),
        },
      ],
      outputState.tone
    )
  );

  if (options.flowState === "SYNTHESIS_READY" || options.flowState === "EXPORTED") {
    const readiness = documentRef.createElement("div");
    readiness.className = "forge-output-status";
    readiness.append(
      createStatusBadge(
        documentRef,
        toOutputStatusLabel(exportSummary, options.flowState, text),
        exportSummary.exportReady
          ? "accent"
          : exportSummary.status === "missing-criteria"
            ? "warning"
            : "soft"
      )
    );
    const readinessText = documentRef.createElement("p");
    readinessText.className = "forge-panel__hint";
    readinessText.textContent = exportSummary.exportReady
      ? text(["workbench", "synthesisPanel", "readiness", "ready"], "STATE: HANDOFF READY")
      : (options.exportBlockedReason ??
        text(["workbench", "synthesisPanel", "readiness", "blocked"], "BLOCKER: HANDOFF CHECK"));
    readiness.append(readinessText);
    body.append(readiness);

    const selectedCard = documentRef.createElement("div");
    selectedCard.className = "forge-selected-synthesis";
    if (selectedSynthesis) {
      const selectedExpanded = options.expandedSynthesisIds.has(selectedSynthesis.id);
      const head = documentRef.createElement("div");
      head.className = "forge-selected-synthesis__head";
      const title = documentRef.createElement("strong");
      title.textContent = selectedSynthesis.summary;
      const chips = documentRef.createElement("div");
      chips.className = "forge-flow-item__meta";
      chips.append(
        createStatusBadge(
          documentRef,
          text(["workbench", "synthesisPanel", "badges", "selected"], "selected"),
          "accent"
        ),
        createStatusBadge(
          documentRef,
          toCountLabel(
            text,
            ["workbench", "synthesisPanel", "chips", "criteria"],
            selectedSynthesis.acceptanceCriteria.length,
            "{count} criterion",
            "{count} criteria"
          ),
          "soft"
        )
      );
      head.append(title, chips);
      selectedCard.append(head);
      selectedCard.append(
        createButton(
          documentRef,
          selectedExpanded
            ? text(["workbench", "actions", "collapse"], "Collapse")
            : text(["workbench", "actions", "expand"], "Expand"),
          {
            dataset: {
              forgeToggleSynthesis: selectedSynthesis.id,
            },
          }
        )
      );
      if (selectedExpanded) {
        const bodyText = documentRef.createElement("p");
        bodyText.className = "forge-response-option__body";
        bodyText.textContent = selectedSynthesis.body;
        selectedCard.append(bodyText);
      }
    } else {
      const empty = documentRef.createElement("p");
      empty.className = "forge-panel__hint";
      empty.textContent = text(
        ["workbench", "synthesisPanel", "readiness", "requiresSelected"],
        "REQUIRES: SELECTED SYNTHESIS"
      );
      selectedCard.append(empty);
    }
    body.append(selectedCard);

    const contextCard = documentRef.createElement("article");
    contextCard.className = "forge-state-guide";
    const contextTitle = documentRef.createElement("strong");
    contextTitle.textContent = text(
      ["workbench", "synthesisPanel", "context", "title"],
      "Run context"
    );
    const contextSummary = documentRef.createElement("p");
    contextSummary.className = "forge-panel__hint";
    contextSummary.textContent =
      selectedRunSignature ??
      text(["workbench", "synthesisPanel", "context", "pending"], "Run signature pending");
    contextCard.append(contextTitle, contextSummary);
    if (selectedDecisionTrace.length > 0) {
      const traceList = documentRef.createElement("ul");
      traceList.className = "forge-list";
      selectedDecisionTrace.forEach((line) => {
        const item = documentRef.createElement("li");
        item.className = "forge-list__item";
        item.textContent = line;
        traceList.append(item);
      });
      contextCard.append(traceList);
    }
    if (selectedPreflightWarnings.length > 0) {
      const warningRow = documentRef.createElement("div");
      warningRow.className = "forge-flow-item__meta";
      selectedPreflightWarnings.slice(0, 3).forEach((warning) => {
        warningRow.append(createStatusBadge(documentRef, warning, "warning"));
      });
      contextCard.append(warningRow);
    }
    body.append(contextCard);

    if (state.snapshot.syntheses.length > 0) {
      const list = documentRef.createElement("div");
      list.className = "forge-card-list";
      state.snapshot.syntheses.forEach((synthesis) => {
        const expanded = options.expandedSynthesisIds.has(synthesis.id);
        const card = documentRef.createElement("article");
        card.className = "forge-card forge-card--synthesis";
        card.dataset["selected"] =
          synthesis.id === state.snapshot.selectedSynthesisId ? "true" : "false";

        const header = documentRef.createElement("div");
        header.className = "forge-card__header";
        const title = documentRef.createElement("strong");
        title.textContent = synthesis.summary;
        const meta = documentRef.createElement("div");
        meta.className = "forge-flow-item__meta";
        meta.append(
          createStatusBadge(
            documentRef,
            toCountLabel(
              text,
              ["workbench", "synthesisPanel", "chips", "tasks"],
              synthesis.sourceTaskIds.length,
              "{count} task",
              "{count} tasks"
            ),
            "soft"
          ),
          createStatusBadge(
            documentRef,
            toCountLabel(
              text,
              ["workbench", "synthesisPanel", "chips", "answers"],
              synthesis.selectedResponseIds.length,
              "{count} answer",
              "{count} answers"
            ),
            "soft"
          ),
          createStatusBadge(
            documentRef,
            toCountLabel(
              text,
              ["workbench", "synthesisPanel", "chips", "decisionsLeft"],
              synthesis.unresolvedConflictIds.length,
              "{count} decision left",
              "{count} decisions left"
            ),
            synthesis.unresolvedConflictIds.length > 0 ? "warning" : "soft"
          )
        );
        header.append(title, meta);
        card.append(header);

        const actionRail = documentRef.createElement("div");
        actionRail.className = "forge-actions";
        actionRail.append(
          createButton(
            documentRef,
            expanded
              ? text(["workbench", "actions", "collapse"], "Collapse")
              : text(["workbench", "actions", "expand"], "Expand"),
            {
              dataset: {
                forgeToggleSynthesis: synthesis.id,
              },
            }
          )
        );
        if (options.flowState === "SYNTHESIS_READY") {
          actionRail.append(
            createButton(
              documentRef,
              synthesis.id === state.snapshot.selectedSynthesisId
                ? text(["workbench", "actions", "selected"], "Selected")
                : text(["workbench", "actions", "select"], "Select"),
              {
                dataset: {
                  forgeSelectSynthesis: synthesis.id,
                },
                disabled: synthesis.id === state.snapshot.selectedSynthesisId,
              }
            )
          );
        }
        card.append(actionRail);

        if (expanded) {
          const bodyText = documentRef.createElement("p");
          bodyText.className = "forge-response-option__body";
          bodyText.textContent = synthesis.body;
          card.append(bodyText);
        }
        list.append(card);
      });
      body.append(list);
    }
  }

  if (state.snapshot.exports.length > 0) {
    const exportList = documentRef.createElement("ol");
    exportList.className = "forge-list forge-list--compact";
    state.snapshot.exports.slice(0, 3).forEach((entry) => {
      const item = documentRef.createElement("li");
      item.className = "forge-list__item";
      const title = documentRef.createElement("strong");
      title.textContent = entry.filePath.split("/").at(-1) ?? entry.filePath;
      const meta = documentRef.createElement("span");
      meta.className = "forge-field__hint";
      meta.textContent = `${entry.createdAt} • ${entry.targetRoomId}`;
      item.append(title, meta);
      exportList.append(item);
    });
    body.append(exportList);
  }

  return createForgePanel(documentRef, {
    panelId: "synthesis",
    title: text(["workbench", "panels", "synthesis"], "Synthesis & Export"),
    body,
  });
}
