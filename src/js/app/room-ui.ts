import { RoomRegistry } from "../modules/rooms/room-registry.js";
import {
  buildRoomNavMarkup,
  buildRoomPageMarkup,
  getRoomPageName,
} from "../modules/rooms/room-markup.js";
import { RoomPageController } from "../pages/room-page.js";
import { hydrateRoomNavIcons } from "./side-nav-icons.js";
import type { PageController } from "./types.js";

export function syncInstalledRoomChrome(controllers?: Record<string, PageController>): void {
  const rooms = RoomRegistry.getInstalledRooms();
  const navMenu = document.querySelector(".side-nav-menu");
  const pagesContainer = document.getElementById("pages-container");
  if (navMenu === null || pagesContainer === null) {
    return;
  }

  const activeIds = new Set(rooms.map((room) => room.id));

  navMenu.querySelectorAll<HTMLElement>("[data-room-nav='true']").forEach((button) => {
    const roomId = button.dataset["roomId"] ?? "";
    if (activeIds.has(roomId) === false) {
      button.remove();
    }
  });

  pagesContainer.querySelectorAll<HTMLElement>("[data-room-page='true']").forEach((page) => {
    const roomId = page.dataset["roomId"] ?? "";
    if (activeIds.has(roomId) === false) {
      page.remove();
      if (controllers !== undefined) {
        const controller = controllers[getRoomPageName(roomId)];
        controller?.dispose?.();
        delete controllers[getRoomPageName(roomId)];
      }
    }
  });

  rooms.forEach((room) => {
    const pageName = getRoomPageName(room.id);
    const navSelector = `[data-room-nav='true'][data-room-id='${room.id}']`;
    const pageSelector = `[data-room-page='true'][data-room-id='${room.id}']`;

    const existingNavButton = navMenu.querySelector<HTMLElement>(navSelector);
    if (existingNavButton === null) {
      navMenu.insertAdjacentHTML("beforeend", buildRoomNavMarkup(room));
    } else {
      const isActive = existingNavButton.classList.contains("is-active");
      existingNavButton.outerHTML = buildRoomNavMarkup(room);
      if (isActive) {
        navMenu.querySelector<HTMLElement>(navSelector)?.classList.add("is-active");
      }
    }

    if (pagesContainer.querySelector(pageSelector) === null) {
      pagesContainer.insertAdjacentHTML("beforeend", buildRoomPageMarkup(room));
    }

    if (controllers !== undefined) {
      const existing = controllers[pageName];
      if (existing instanceof RoomPageController) {
        existing.updateRoom(room);
      } else if (existing === undefined) {
        controllers[pageName] = new RoomPageController(room, pageName);
      }
    }
  });

  hydrateRoomNavIcons(navMenu);
}
