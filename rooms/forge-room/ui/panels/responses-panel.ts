import type { ForgeUiState, ForgeWorkbenchUiFlowState } from "../../shared/ui/state.js";
import { createForgePanel } from "./panel-shell.js";

function createButton(
  documentRef: Document,
  label: string,
  options: {
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
  Object.entries(options.dataset ?? {}).forEach(([key, value]) => {
    button.dataset[key] = value;
  });
  button.disabled = options.disabled === true;
  button.textContent = label;
  return button;
}

function createMetaChip(documentRef: Document, label: string, soft = false): HTMLElement {
  const chip = documentRef.createElement("span");
  chip.className = soft ? "forge-chip forge-chip--soft" : "forge-chip";
  chip.textContent = label;
  return chip;
}

function createGuideCard(
  documentRef: Document,
  titleText: string,
  summaryText: string,
  chips: string[] = [],
  tone: "active" | "blocked" | "locked" | "monitor" = "active"
): HTMLElement {
  const card = documentRef.createElement("article");
  card.className = "forge-state-guide forge-state-guide--gate";
  card.dataset["forgeGateState"] = tone;
  const title = documentRef.createElement("strong");
  title.textContent = titleText;
  const summary = documentRef.createElement("p");
  summary.className = "forge-panel__hint";
  summary.textContent = summaryText;
  card.append(title, summary);
  if (chips.length > 0) {
    const meta = documentRef.createElement("div");
    meta.className = "forge-flow-item__meta";
    chips.forEach((chipLabel) => {
      meta.append(createMetaChip(documentRef, chipLabel, true));
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

function describeResponseState(
  flowState: ForgeWorkbenchUiFlowState,
  counts: {
    openConflicts: number;
    responses: number;
  },
  text: (path: string[], fallback: string, params?: Record<string, number | string>) => string
): { summary: string; title: string; tone: "active" | "blocked" | "locked" | "monitor" } {
  switch (flowState) {
    case "IDLE":
    case "SESSION_CREATED":
      return {
        title: text(
          ["workbench", "responsesPanel", "guide", "savedGoalLocked", "title"],
          "RESPONSE LANE LOCKED"
        ),
        summary: text(
          ["workbench", "responsesPanel", "guide", "savedGoalLocked", "summary"],
          "REQUIRES: SAVED GOAL"
        ),
        tone: "locked",
      };
    case "GOAL_DEFINED":
    case "DRAFT_READY":
      return {
        title: text(
          ["workbench", "responsesPanel", "guide", "approvedDraftLocked", "title"],
          "RESPONSE LANE LOCKED"
        ),
        summary: text(
          ["workbench", "responsesPanel", "guide", "approvedDraftLocked", "summary"],
          "REQUIRES: APPROVED DRAFT"
        ),
        tone: "locked",
      };
    case "APPROVED":
      return {
        title: text(
          ["workbench", "responsesPanel", "guide", "dispatchLocked", "title"],
          "RESPONSE LANE LOCKED"
        ),
        summary: text(
          ["workbench", "responsesPanel", "guide", "dispatchLocked", "summary"],
          "REQUIRES: DISPATCH"
        ),
        tone: "locked",
      };
    case "DISPATCHED":
      return {
        title: text(
          ["workbench", "responsesPanel", "guide", "responseInbound", "title"],
          "RESPONSE LANE ACTIVE"
        ),
        summary:
          counts.responses > 0
            ? text(
                ["workbench", "responsesPanel", "guide", "responseInbound", "summary"],
                "STATE: RESPONSE INBOUND"
              )
            : text(
                ["workbench", "responsesPanel", "guide", "awaitingResponses", "summary"],
                "STATE: AWAITING RESPONSES"
              ),
        tone: "active",
      };
    case "RESPONSES_READY":
      return {
        title: text(
          ["workbench", "responsesPanel", "guide", "responseInbound", "title"],
          "RESPONSE LANE ACTIVE"
        ),
        summary: text(
          ["workbench", "responsesPanel", "guide", "reviewResponses", "summary"],
          "STATE: REVIEW RESPONSES"
        ),
        tone: "active",
      };
    case "CONFLICT":
      return {
        title: text(
          ["workbench", "responsesPanel", "guide", "conflictBlocked", "title"],
          "RESPONSE LANE BLOCKED"
        ),
        summary: text(
          ["workbench", "responsesPanel", "guide", "conflictBlocked", "summary"],
          "REQUIRES: CONFLICT RESOLUTION"
        ),
        tone: "blocked",
      };
    case "SYNTHESIS_READY":
      return {
        title: text(
          ["workbench", "responsesPanel", "guide", "readOnly", "title"],
          "RESPONSE LANE MONITOR"
        ),
        summary: text(
          ["workbench", "responsesPanel", "guide", "readOnly", "summary"],
          "STATE: READ ONLY"
        ),
        tone: "monitor",
      };
    case "EXPORTED":
      return {
        title: text(
          ["workbench", "responsesPanel", "guide", "exportInputs", "title"],
          "RESPONSE LANE ARCHIVE"
        ),
        summary: text(
          ["workbench", "responsesPanel", "guide", "exportInputs", "summary"],
          "STATE: EXPORT INPUTS"
        ),
        tone: "monitor",
      };
    default:
      return {
        title: text(
          ["workbench", "responsesPanel", "guide", "savedGoalLocked", "title"],
          "RESPONSE LANE LOCKED"
        ),
        summary: text(
          ["workbench", "responsesPanel", "guide", "savedGoalLocked", "summary"],
          "REQUIRES: SAVED GOAL"
        ),
        tone: "locked",
      };
  }
}

function toResponseStatusLabel(
  status: string,
  text: (path: string[], fallback: string, params?: Record<string, number | string>) => string
): string {
  if (status === "selected") {
    return text(["workbench", "responsesPanel", "statuses", "selected"], "chosen");
  }
  if (status === "rejected") {
    return text(["workbench", "responsesPanel", "statuses", "rejected"], "set aside");
  }
  if (status === "captured") {
    return text(["workbench", "responsesPanel", "statuses", "captured"], "received");
  }
  return status;
}

export function renderResponsesPanel(
  documentRef: Document,
  state: ForgeUiState,
  text: (path: string[], fallback: string, params?: Record<string, number | string>) => string,
  options: {
    expandedResponseIds: Set<string>;
    flowState: ForgeWorkbenchUiFlowState;
  }
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "forge-panel__body";
  const approvedTasks = state.snapshot.approvedTasks.filter((task) => task.level === 1);
  const openConflictCount = state.snapshot.conflicts.filter(
    (conflict) => conflict.status === "open"
  ).length;
  const responseState = describeResponseState(
    options.flowState,
    {
      openConflicts: openConflictCount,
      responses: state.snapshot.responses.length,
    },
    text
  );
  const conflictByTaskId = new Map(
    state.snapshot.conflicts.map((conflict) => [conflict.taskId, conflict])
  );
  const responsesByTaskId = new Map<string, typeof state.snapshot.responses>();
  state.snapshot.responses.forEach((response) => {
    const bucket = responsesByTaskId.get(response.taskId) ?? [];
    bucket.push(response);
    responsesByTaskId.set(response.taskId, bucket);
  });

  body.append(
    createGuideCard(
      documentRef,
      responseState.title,
      responseState.summary,
      [
        toCountLabel(
          text,
          ["workbench", "responsesPanel", "chips", "tasks"],
          approvedTasks.length,
          "{count} task",
          "{count} tasks"
        ),
        toCountLabel(
          text,
          ["workbench", "responsesPanel", "chips", "answers"],
          state.snapshot.responses.length,
          "{count} answer",
          "{count} answers"
        ),
        toCountLabel(
          text,
          ["workbench", "responsesPanel", "chips", "decisionsLeft"],
          openConflictCount,
          "{count} decision left",
          "{count} decisions left"
        ),
      ],
      responseState.tone
    )
  );

  if (
    approvedTasks.length > 0 &&
    options.flowState !== "IDLE" &&
    options.flowState !== "SESSION_CREATED" &&
    options.flowState !== "GOAL_DEFINED" &&
    options.flowState !== "DRAFT_READY" &&
    options.flowState !== "APPROVED"
  ) {
    const list = documentRef.createElement("div");
    list.className = "forge-card-list";
    approvedTasks.forEach((task) => {
      const taskResponses = responsesByTaskId.get(task.id) ?? [];
      const taskAssignments = state.snapshot.assignments.filter(
        (assignment) => assignment.taskId === task.id
      );
      const conflict = conflictByTaskId.get(task.id) ?? null;

      const card = documentRef.createElement("article");
      card.className = "forge-card forge-card--decision";

      const header = documentRef.createElement("div");
      header.className = "forge-card__header";
      const title = documentRef.createElement("strong");
      title.textContent = task.title;
      const summary = documentRef.createElement("p");
      summary.className = "forge-flow-item__summary";
      summary.textContent = task.summary;
      const meta = documentRef.createElement("div");
      meta.className = "forge-flow-item__meta";
      meta.append(
        createMetaChip(
          documentRef,
          task.dispatchMode === "compare"
            ? text(["workbench", "dispatchModes", "compare"], "Compare")
            : text(["workbench", "dispatchModes", "singleOwner"], "Single owner"),
          true
        ),
        createMetaChip(
          documentRef,
          toCountLabel(
            text,
            ["workbench", "responsesPanel", "chips", "responses"],
            taskResponses.length,
            "{count} response",
            "{count} responses"
          ),
          true
        ),
        createMetaChip(
          documentRef,
          toCountLabel(
            text,
            ["workbench", "responsesPanel", "chips", "queued"],
            taskAssignments.filter((assignment) => assignment.status === "queued").length,
            "{count} queued",
            "{count} queued"
          ),
          true
        )
      );
      if (conflict) {
        meta.append(
          createMetaChip(
            documentRef,
            conflict.status === "resolved"
              ? text(["workbench", "responsesPanel", "statuses", "decisionMade"], "decision made")
              : text(
                  ["workbench", "responsesPanel", "statuses", "decisionNeeded"],
                  "decision needed"
                ),
            conflict.status === "resolved"
          )
        );
      }
      header.append(title, summary, meta);
      card.append(header);

      if (taskResponses.length === 0) {
        const empty = documentRef.createElement("p");
        empty.className = "forge-panel__hint";
        empty.textContent = (() => {
          if (options.flowState === "APPROVED") {
            return text(
              ["workbench", "responsesPanel", "empty", "approved"],
              "Send this task from Plan to start collecting answers."
            );
          }
          if (taskAssignments.length > 0) {
            return text(
              ["workbench", "responsesPanel", "empty", "waiting"],
              "Waiting for the assigned seat to answer this task."
            );
          }
          return text(
            ["workbench", "responsesPanel", "empty", "unsent"],
            "This task will start showing answers as soon as it is sent."
          );
        })();
        card.append(empty);
      } else {
        const responseList = documentRef.createElement("div");
        responseList.className = "forge-response-options";
        taskResponses.forEach((response) => {
          const expanded = options.expandedResponseIds.has(response.id);
          const option = documentRef.createElement("article");
          option.className = "forge-response-option";
          option.dataset["selected"] = response.status === "selected" ? "true" : "false";

          const optionHead = documentRef.createElement("div");
          optionHead.className = "forge-response-option__head";
          optionHead.append(
            createMetaChip(documentRef, response.seatId),
            createMetaChip(
              documentRef,
              text(["workbench", "roles", response.roleId], response.roleId),
              true
            ),
            createMetaChip(
              documentRef,
              toResponseStatusLabel(response.status, text),
              response.status !== "selected"
            )
          );
          if (response.artifacts.length > 0) {
            optionHead.append(
              createMetaChip(
                documentRef,
                toCountLabel(
                  text,
                  ["workbench", "responsesPanel", "chips", "artifacts"],
                  response.artifacts.length,
                  "{count} artifact",
                  "{count} artifacts"
                ),
                true
              )
            );
          }
          if (response.archiveRef?.messageId) {
            optionHead.append(
              createMetaChip(
                documentRef,
                text(["workbench", "responsesPanel", "statuses", "traceSaved"], "trace saved"),
                true
              )
            );
          }

          const responseSummary = documentRef.createElement("strong");
          responseSummary.textContent = response.summary;

          const toggle = createButton(
            documentRef,
            expanded
              ? text(["workbench", "actions", "collapse"], "Collapse")
              : text(["workbench", "actions", "expand"], "Expand"),
            {
              dataset: {
                forgeToggleResponse: response.id,
              },
            }
          );

          option.append(optionHead, responseSummary, toggle);
          if (expanded) {
            const responseBody = documentRef.createElement("p");
            responseBody.className = "forge-response-option__body";
            responseBody.textContent = response.body;
            option.append(responseBody);
          }
          responseList.append(option);
        });
        card.append(responseList);
      }

      if (conflict) {
        const conflictCard = documentRef.createElement("div");
        conflictCard.className = "forge-conflict-box";
        const conflictInteractive = conflict.status === "open" && options.flowState === "CONFLICT";
        const conflictTitle = documentRef.createElement("strong");
        conflictTitle.textContent =
          conflict.status === "resolved"
            ? text(
                ["workbench", "responsesPanel", "conflict", "recordedTitle"],
                "DECISION RECORDED"
              )
            : conflictInteractive
              ? text(
                  ["workbench", "responsesPanel", "conflict", "selectTitle"],
                  "SELECT ONE RESPONSE"
                )
              : text(
                  ["workbench", "responsesPanel", "conflict", "blockedTitle"],
                  "DECISION HOLDS RUN"
                );
        const conflictSummary = documentRef.createElement("p");
        conflictSummary.className = "forge-panel__hint";
        conflictSummary.textContent = conflictInteractive
          ? conflict.summary
          : conflict.status === "resolved"
            ? text(
                ["workbench", "responsesPanel", "conflict", "recordedSummary"],
                "STATE: PREFERENCE SAVED"
              )
            : text(
                ["workbench", "responsesPanel", "conflict", "blockedSummary"],
                "USE NEXT STEP TO RETURN HERE."
              );
        conflictCard.append(conflictTitle, conflictSummary);
        if (conflict.preferredResponseId) {
          const preferredResponse =
            taskResponses.find((response) => response.id === conflict.preferredResponseId) ?? null;
          const preferredNote = documentRef.createElement("p");
          preferredNote.className = "forge-inline-status";
          preferredNote.textContent = text(
            ["workbench", "responsesPanel", "conflict", "currentPick"],
            "Current pick: {seatId}",
            { seatId: preferredResponse?.seatId ?? conflict.preferredResponseId }
          );
          conflictCard.append(preferredNote);
        }
        if (conflict.resolutionNote) {
          const note = documentRef.createElement("p");
          note.className = "forge-field__hint";
          note.textContent = conflict.resolutionNote;
          conflictCard.append(note);
        }
        if (conflictInteractive) {
          const preferenceRail = documentRef.createElement("div");
          preferenceRail.className = "forge-actions";
          taskResponses.forEach((response) => {
            preferenceRail.append(
              createButton(
                documentRef,
                text(["workbench", "actions", "preferSeat"], "Prefer {seatId}", {
                  seatId: response.seatId,
                }),
                {
                  dataset: {
                    forgeResolveConflict: conflict.id,
                    forgeConflictStatus: "open",
                    forgePreferredResponseId: response.id,
                  },
                }
              )
            );
          });

          const actionRail = documentRef.createElement("div");
          actionRail.className = "forge-actions";
          actionRail.append(
            createButton(
              documentRef,
              text(["workbench", "actions", "markResolved"], "Mark resolved"),
              {
                dataset: {
                  forgeResolveConflict: conflict.id,
                  forgeConflictStatus: "resolved",
                },
                disabled: conflict.preferredResponseId === null,
              }
            ),
            createButton(documentRef, text(["workbench", "actions", "leaveOpen"], "Leave open"), {
              dataset: {
                forgeResolveConflict: conflict.id,
                forgeConflictStatus: "open",
              },
            })
          );
          conflictCard.append(preferenceRail, actionRail);
        }
        card.append(conflictCard);
      }

      list.append(card);
    });
    body.append(list);
  }

  return createForgePanel(documentRef, {
    panelId: "responses",
    title: text(["workbench", "panels", "responses"], "Responses & Decisions"),
    body,
  });
}
