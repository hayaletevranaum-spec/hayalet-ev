import type { RepairEvent, RepairPanelId } from "../../shared/types/index.js";
import type { RepairUiSnapshotMeta, RepairUiState } from "../../shared/ui/state.js";
import { resolveRepairAssetUrl } from "../repair-asset-url.js";
import { setClassNameIfChanged, setDatasetIfChanged, setTextIfChanged } from "./dom-utils.js";
import {
  REPAIR_TIMELINE_PAGE_SIZE,
  formatRepairMomentDateTime,
  getEventKindLabel,
  getRepairMomentIconSvg,
  getRepairMomentImageSrc,
  getRepairMomentLastPageIndex,
  getRepairMomentOrderedEvents,
  getRepairMomentPageEvents,
  getRepairMomentPageLabel,
  getRepairMomentSummary,
  getRepairMomentValue,
  normalizeRepairMomentPageSize,
  type RepairTimelineTextFn,
} from "./timeline-helpers.js";

export function createRepairVisualTimelineDomRuntime(params: {
  applyLiveSnapshotUpdates: () => void;
  documentRef: Document;
  meta: RepairUiSnapshotMeta;
  state: RepairUiState;
  text: RepairTimelineTextFn;
  updatePanelChrome: (panel: HTMLElement, panelId: RepairPanelId) => void;
}) {
  const { documentRef, meta, state, text, updatePanelChrome } = params;
  let lockedPageIndex: number | null = null;
  let currentPageSize = REPAIR_TIMELINE_PAGE_SIZE;

  function getResolvedPageIndex(eventCount: number, pageSize = currentPageSize): number {
    const lastPageIndex = getRepairMomentLastPageIndex(eventCount, pageSize);
    if (lockedPageIndex === null) return lastPageIndex;
    return Math.min(lastPageIndex, Math.max(0, lockedPageIndex));
  }

  function resolveTimelinePageSize(timeline: HTMLElement): number {
    const scroller = timeline.querySelector<HTMLElement>(".repair-timeline__scroller");
    const availableWidth = scroller?.clientWidth ?? timeline.clientWidth;
    if (!Number.isFinite(availableWidth) || availableWidth <= 0) return currentPageSize;
    const horizontalPaddingPx = 24;
    const itemWidthPx = 56;
    const gapPx = 6;
    const nextPageSize = Math.floor(
      Math.max(0, availableWidth - horizontalPaddingPx + gapPx) / (itemWidthPx + gapPx)
    );
    return normalizeRepairMomentPageSize(nextPageSize);
  }

  function resolveMomentImageSrc(event: RepairEvent, orderedEvents: RepairEvent[]): string | null {
    const src = getRepairMomentImageSrc(
      event,
      orderedEvents,
      state.sessions.detail?.pcbImage?.src ?? null
    );
    return src === null ? null : (resolveRepairAssetUrl(src) ?? src);
  }

  function appendTimelineMomentDetail(
    parent: HTMLElement,
    event: RepairEvent,
    orderedEvents: RepairEvent[]
  ): void {
    const detail = documentRef.createElement("div");
    detail.className = "repair-timeline__detail";
    detail.dataset["eventId"] = event.id;

    const imageWrap = documentRef.createElement("div");
    imageWrap.className = "repair-timeline__detail-image";
    const image = documentRef.createElement("img");
    const imageSrc = resolveMomentImageSrc(event, orderedEvents);
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

  function createTimelineMoment(event: RepairEvent, orderedEvents: RepairEvent[]): HTMLElement {
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
    appendTimelineMomentDetail(moment, event, orderedEvents);
    return moment;
  }

  function syncTimelineControls(
    timeline: HTMLElement,
    pageIndex: number,
    eventCount: number,
    lastPageIndex: number,
    pageSize: number
  ): void {
    setDatasetIfChanged(timeline, "pageIndex", String(pageIndex));
    setDatasetIfChanged(timeline, "pageCount", String(lastPageIndex + 1));
    setDatasetIfChanged(timeline, "pageSize", String(pageSize));
    setDatasetIfChanged(timeline, "autoPage", lockedPageIndex === null ? "latest" : "locked");
    timeline.style.setProperty("--repair-timeline-page-size", String(pageSize));

    const readout = timeline.querySelector<HTMLElement>(".repair-timeline__readout");
    if (readout !== null) {
      setTextIfChanged(
        readout,
        eventCount === 0 ? "" : getRepairMomentPageLabel(pageIndex, eventCount, text, pageSize)
      );
    }

    const previous = timeline.querySelector<HTMLButtonElement>(
      "[data-repair-action='timeline-page'][data-direction='previous']"
    );
    if (previous !== null) previous.disabled = pageIndex <= 0;

    const next = timeline.querySelector<HTMLButtonElement>(
      "[data-repair-action='timeline-page'][data-direction='next']"
    );
    if (next !== null) next.disabled = pageIndex >= lastPageIndex;

    const latest = timeline.querySelector<HTMLElement>(
      "[data-repair-action='timeline-page'][data-direction='latest']"
    );
    latest?.classList.toggle("repair-timeline__control-btn--active", lockedPageIndex === null);
  }

  function syncTimelineChips(
    track: HTMLElement,
    events: RepairEvent[],
    orderedEvents: RepairEvent[]
  ): void {
    track.replaceChildren();
    if (events.length === 0) {
      const empty = documentRef.createElement("div");
      empty.className = "repair-timeline__empty";
      empty.textContent = text(["timeline", "empty"], "Kayıt yok");
      track.append(empty);
      return;
    }

    events.forEach((event) => {
      track.append(createTimelineMoment(event, orderedEvents));
    });
  }

  function updateVisualTimelinePanelDom(panel: HTMLElement): void {
    updatePanelChrome(panel, "visual-timeline");
    const dot = panel.querySelector<HTMLElement>(".repair-panel__status-dot");
    if (dot !== null) {
      setClassNameIfChanged(
        dot,
        `repair-panel__status-dot repair-panel__status-dot--${
          state.phase === "session-active" ? "live" : "idle"
        }`
      );
    }

    const timeline = panel.querySelector<HTMLElement>(".repair-timeline");
    const track = panel.querySelector<HTMLElement>(".repair-timeline__track");
    if (timeline === null || track === null) return;

    const orderedEvents = getRepairMomentOrderedEvents(meta.events);
    currentPageSize = resolveTimelinePageSize(timeline);
    const lastPageIndex = getRepairMomentLastPageIndex(orderedEvents.length, currentPageSize);
    const pageIndex = getResolvedPageIndex(orderedEvents.length, currentPageSize);
    if (lockedPageIndex !== null && lockedPageIndex > lastPageIndex) {
      lockedPageIndex = pageIndex === lastPageIndex ? null : pageIndex;
    }

    syncTimelineControls(timeline, pageIndex, orderedEvents.length, lastPageIndex, currentPageSize);
    syncTimelineChips(
      track,
      getRepairMomentPageEvents(orderedEvents, pageIndex, currentPageSize),
      orderedEvents
    );
  }

  function setTimelinePage(direction: "previous" | "next" | "latest"): void {
    const orderedEvents = getRepairMomentOrderedEvents(meta.events);
    const panel = documentRef.querySelector<HTMLElement>(".repair-panel--visual-timeline");
    const timeline = panel?.querySelector<HTMLElement>(".repair-timeline") ?? null;
    if (timeline !== null) currentPageSize = resolveTimelinePageSize(timeline);
    const lastPageIndex = getRepairMomentLastPageIndex(orderedEvents.length, currentPageSize);
    const currentPageIndex = getResolvedPageIndex(orderedEvents.length, currentPageSize);

    if (direction === "latest") {
      lockedPageIndex = null;
    } else if (direction === "previous") {
      lockedPageIndex = Math.max(0, currentPageIndex - 1);
    } else {
      const nextPageIndex = Math.min(lastPageIndex, currentPageIndex + 1);
      lockedPageIndex = nextPageIndex >= lastPageIndex ? null : nextPageIndex;
    }

    if (panel !== null) updateVisualTimelinePanelDom(panel);
  }

  function hydrateTimelineDetailImage(target: EventTarget | null): void {
    if (!(target instanceof Element)) return;
    const moment = target.closest<HTMLElement>(".repair-timeline__moment");
    if (moment === null) return;
    const image = moment.querySelector<HTMLImageElement>(".repair-timeline__detail-image img");
    const imageSrc = image?.dataset["imageSrc"];
    if (image === null || imageSrc === undefined || imageSrc.trim() === "") return;
    if (image.getAttribute("src") !== imageSrc) {
      image.setAttribute("src", imageSrc);
    }
    setDatasetIfChanged(moment, "detailHydrated", "true");
  }

  function refreshTimelinePageSize(): void {
    const panel = documentRef.querySelector<HTMLElement>(".repair-panel--visual-timeline");
    if (panel !== null) updateVisualTimelinePanelDom(panel);
  }

  function updateTimelineLiveDom(): void {
    // Repair Moments is event-driven; no per-tick playhead DOM mutation is needed.
  }

  return {
    hydrateTimelineDetailImage,
    refreshTimelinePageSize,
    setTimelinePage,
    updateTimelineLiveDom,
    updateVisualTimelinePanelDom,
  };
}
