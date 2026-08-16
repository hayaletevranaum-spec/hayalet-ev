import type { RepairEvent } from "../../shared/types/index.js";
import type { RepairUiSnapshotMeta, RepairUiState } from "../../shared/ui/state.js";
import { resolveRepairAssetUrl } from "../repair-asset-url.js";
import {
  formatRepairMomentDateTime,
  getEventKindLabel,
  REPAIR_TIMELINE_PAGE_SIZE,
  getRepairMomentIconSvg,
  getRepairMomentImageSrc,
  getRepairMomentLastPageIndex,
  getRepairMomentOrderedEvents,
  getRepairMomentPageEvents,
  getRepairMomentPageLabel,
  getRepairMomentSummary,
  getRepairMomentValue,
} from "../runtime/timeline-helpers.js";
import { createRepairPanel } from "./panel-shell.js";

type TextFn = (path: string[], fallback: string) => string;

function resolveMomentImageSrc(
  event: RepairEvent,
  orderedEvents: RepairEvent[],
  state: RepairUiState
): string | null {
  const src = getRepairMomentImageSrc(
    event,
    orderedEvents,
    state.sessions.detail?.pcbImage?.src ?? null
  );
  return src === null ? null : (resolveRepairAssetUrl(src) ?? src);
}

function appendTimelineMomentDetail(
  documentRef: Document,
  parent: HTMLElement,
  event: RepairEvent,
  orderedEvents: RepairEvent[],
  state: RepairUiState,
  text: TextFn
): void {
  const detail = documentRef.createElement("div");
  detail.className = "repair-timeline__detail";
  detail.dataset["eventId"] = event.id;

  const imageWrap = documentRef.createElement("div");
  imageWrap.className = "repair-timeline__detail-image";
  const image = documentRef.createElement("img");
  const imageSrc = resolveMomentImageSrc(event, orderedEvents, state);
  image.alt = getEventKindLabel(event, text);
  if (imageSrc !== null) {
    image.dataset["imageSrc"] = imageSrc;
  }
  imageWrap.append(image);
  detail.append(imageWrap);

  const copy = documentRef.createElement("div");
  copy.className = "repair-timeline__detail-copy";

  const kind = documentRef.createElement("strong");
  kind.className = "repair-timeline__detail-kind";
  kind.textContent = getEventKindLabel(event, text);
  copy.append(kind);

  const date = documentRef.createElement("span");
  date.className = "repair-timeline__detail-date";
  date.textContent = formatRepairMomentDateTime(event.occurredAt);
  copy.append(date);

  const summary = documentRef.createElement("span");
  summary.className = "repair-timeline__detail-summary";
  summary.textContent = getRepairMomentSummary(event, text);
  copy.append(summary);

  const value = getRepairMomentValue(event);
  if (value !== null) {
    const valueEl = documentRef.createElement("span");
    valueEl.className = "repair-timeline__detail-value";
    valueEl.textContent = value;
    copy.append(valueEl);
  }

  detail.append(copy);

  const actions = documentRef.createElement("div");
  actions.className = "repair-timeline__detail-actions";

  const focus = documentRef.createElement("button");
  focus.type = "button";
  focus.className = "repair-timeline__control-btn";
  focus.textContent = text(["timeline", "focusMoment"], "Bu ana odaklan");
  focus.dataset["repairAction"] = "jump-to-event";
  focus.dataset["eventId"] = event.id;
  actions.append(focus);

  if (
    state.workbench.focusedEventId !== null ||
    state.workbench.timeline.replayMode === "replay" ||
    state.workbench.timeline.replayMode === "paused"
  ) {
    const live = documentRef.createElement("button");
    live.type = "button";
    live.className = "repair-timeline__control-btn";
    live.textContent = text(["timeline", "returnLive"], "Canlı ana dön");
    live.dataset["repairAction"] = "timeline-live";
    actions.append(live);
  }

  const snapshot = documentRef.createElement("button");
  snapshot.type = "button";
  snapshot.className = "repair-timeline__control-btn repair-timeline__control-btn--primary";
  snapshot.textContent = text(["timeline", "cleanSnapshot"], "Temiz snapshot al");
  snapshot.dataset["repairAction"] = "timeline-clean-snapshot";
  actions.append(snapshot);

  detail.append(actions);
  parent.append(detail);
}

function createTimelineMoment(
  documentRef: Document,
  event: RepairEvent,
  orderedEvents: RepairEvent[],
  state: RepairUiState,
  text: TextFn
): HTMLElement {
  const moment = documentRef.createElement("article");
  moment.className = `repair-timeline__moment repair-timeline__moment--${event.kind}${
    state.workbench.focusedEventId === event.id ? " repair-timeline__moment--active" : ""
  }`;
  moment.dataset["eventId"] = event.id;
  moment.dataset["eventKind"] = event.kind;

  const chip = documentRef.createElement("button");
  chip.className = `repair-timeline__chip repair-timeline__chip--${event.kind}`;
  chip.type = "button";
  chip.title = `${getEventKindLabel(event, text)} - ${formatRepairMomentDateTime(event.occurredAt)}`;
  chip.dataset["repairAction"] = "jump-to-event";
  chip.dataset["eventId"] = event.id;

  const icon = documentRef.createElement("span");
  icon.className = "repair-timeline__icon";
  icon.innerHTML = getRepairMomentIconSvg(event.kind);
  chip.append(icon);

  moment.append(chip);
  appendTimelineMomentDetail(documentRef, moment, event, orderedEvents, state, text);
  return moment;
}

export function renderVisualTimelinePanel(
  documentRef: Document,
  state: RepairUiState,
  meta: RepairUiSnapshotMeta,
  text: TextFn
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "repair-panel__body";
  body.style.padding = "0";

  const orderedEvents = getRepairMomentOrderedEvents(meta.events);
  const pageSize = REPAIR_TIMELINE_PAGE_SIZE;
  const lastPageIndex = getRepairMomentLastPageIndex(orderedEvents.length, pageSize);
  const pageEvents = getRepairMomentPageEvents(orderedEvents, lastPageIndex, pageSize);

  const timeline = documentRef.createElement("div");
  timeline.className = "repair-timeline";
  timeline.dataset["pageIndex"] = String(lastPageIndex);
  timeline.dataset["pageCount"] = String(lastPageIndex + 1);
  timeline.dataset["pageSize"] = String(pageSize);
  timeline.dataset["autoPage"] = "latest";

  const controls = documentRef.createElement("div");
  controls.className = "repair-timeline__controls";

  const readout = documentRef.createElement("span");
  readout.className = "repair-timeline__readout";
  readout.textContent =
    orderedEvents.length === 0
      ? ""
      : getRepairMomentPageLabel(lastPageIndex, orderedEvents.length, text, pageSize);
  controls.append(readout);

  const previous = documentRef.createElement("button");
  previous.className = "repair-timeline__control-btn";
  previous.type = "button";
  previous.textContent = text(["timeline", "previous"], "Önceki");
  previous.dataset["repairAction"] = "timeline-page";
  previous.dataset["direction"] = "previous";
  previous.disabled = lastPageIndex === 0;
  controls.append(previous);

  const next = documentRef.createElement("button");
  next.className = "repair-timeline__control-btn";
  next.type = "button";
  next.textContent = text(["timeline", "next"], "Sonraki");
  next.dataset["repairAction"] = "timeline-page";
  next.dataset["direction"] = "next";
  next.disabled = true;
  controls.append(next);

  const latest = documentRef.createElement("button");
  latest.className = "repair-timeline__control-btn repair-timeline__control-btn--active";
  latest.type = "button";
  latest.textContent = text(["timeline", "latest"], "Son kayıt");
  latest.dataset["repairAction"] = "timeline-page";
  latest.dataset["direction"] = "latest";
  controls.append(latest);

  timeline.append(controls);

  const scroller = documentRef.createElement("div");
  scroller.className = "repair-timeline__scroller";

  const track = documentRef.createElement("div");
  track.className = "repair-timeline__track";

  if (pageEvents.length === 0) {
    const empty = documentRef.createElement("div");
    empty.className = "repair-timeline__empty";
    empty.textContent = text(["timeline", "empty"], "Kayıt yok");
    track.append(empty);
  } else {
    pageEvents.forEach((event) => {
      track.append(createTimelineMoment(documentRef, event, orderedEvents, state, text));
    });
  }

  scroller.append(track);
  timeline.append(scroller);
  body.append(timeline);

  return createRepairPanel(documentRef, {
    panelId: "visual-timeline",
    title: text(["timeline", "title"], "Onarım Anları"),
    statusDot: state.phase === "session-active" ? "live" : "idle",
    collapsed: state.layout.collapsedPanels["visual-timeline"],
    noPanelControls: true,
    body,
  });
}
