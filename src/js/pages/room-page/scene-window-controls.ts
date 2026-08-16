import type { InstalledRoomRecord } from "@shared/index.js";
import {
  mountSceneWindowControls,
  unmountSceneWindowControls,
} from "../../scene/window-controls.js";

export function syncRoomPageSceneWindowControls(
  page: HTMLElement,
  room: InstalledRoomRecord,
  visibility: "scene-only" | "all-pages" | "hidden"
): void {
  unmountSceneWindowControls(page);

  if (visibility === "hidden") {
    return;
  }

  if (visibility === "all-pages") {
    if (page.querySelector<HTMLElement>("[data-room-role='page-shell']") !== null) {
      mountSceneWindowControls(page, {
        surfaceSelector: "[data-room-role='page-shell']",
      });
    }
    return;
  }

  if (room.scene === undefined) {
    return;
  }

  mountSceneWindowControls(page, {
    surfaceSelector: "[data-room-role='scene-root']",
  });
}

export function getRoomSceneStandardBackHost(page: HTMLElement): HTMLElement | null {
  return page.querySelector<HTMLElement>("[data-room-role='scene-standard-back']");
}

export function ensureRoomSceneStandardBackHost(
  page: HTMLElement,
  view: HTMLElement,
  documentRef: Document = document
): HTMLElement {
  const existing = getRoomSceneStandardBackHost(page);
  if (existing !== null) {
    return existing;
  }

  const host = documentRef.createElement("div");
  host.className = "room-scene-view__standard-back";
  host.dataset["roomRole"] = "scene-standard-back";

  const runtimeSlot = view.querySelector<HTMLElement>("[data-room-role='scene-runtime-slot']");
  if (runtimeSlot !== null) {
    runtimeSlot.insertAdjacentElement("beforebegin", host);
  } else {
    view.insertAdjacentElement("beforeend", host);
  }

  return host;
}
