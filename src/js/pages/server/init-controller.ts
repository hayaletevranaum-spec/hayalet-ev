import { AppState } from "../../modules/app-state.js";
import { Logger } from "../../modules/logger/index.js";
import { SettingsManager } from "../../modules/settings-manager.js";
import { SlotController, SlotEvent } from "../../modules/slot-controller.js";
import { TrafficManager } from "../../modules/traffic-manager.js";
import { isAssistantAccountsSettingsPath, isAssistantSlotSettingsPath } from "@shared/settings.js";

export interface ServerInitContext {
  _unsubSettings: (() => void) | null;
  _unsubSlotController: (() => void) | null;
  unsubscribeTraffic: (() => void) | null;
  logUnsubscribe: (() => void) | null;
  commandSlotSelect: HTMLSelectElement | null;
  commandList: HTMLElement | null;
  commandDetail: HTMLTextAreaElement | null;
  commandTestArgs: HTMLInputElement | null;
  commandRunBtn: HTMLButtonElement | null;
  commandCategoryTabs: HTMLElement | null;
  timelineLog: HTMLElement | null;
  timelineMeta: HTMLElement | null;
  renderCommandPanel: () => void;
  syncCategoryWithSlot: () => void;
  syncServerSceneVisibility: () => void;
  renderServerSceneCharacters: () => Promise<void>;
  runSelectedCommand: () => Promise<void>;
  handleTimelineScroll: () => Promise<void>;
  handleLogEntry: (entry: unknown) => void;
  initializeTimeline: () => Promise<void>;
}

export async function initServerControllerPage(controller: ServerInitContext): Promise<void> {
  await SettingsManager.load();

  controller._unsubSettings ??= SettingsManager.subscribe(
    ({ changedPaths }: { changedPaths: string[] }) => {
      const shouldRenderCommandPanel =
        changedPaths.includes("*") ||
        changedPaths.some(
          (path) =>
            path.startsWith("slots") ||
            path.startsWith("us1Slot") ||
            isAssistantSlotSettingsPath(path) ||
            path.startsWith("accounts") ||
            isAssistantAccountsSettingsPath(path)
        );

      if (!shouldRenderCommandPanel) {
        return;
      }

      controller.renderCommandPanel();
      controller.syncServerSceneVisibility();
      void controller.renderServerSceneCharacters();
    }
  );

  controller.commandSlotSelect = document.getElementById(
    "server-command-slot-select"
  ) as HTMLSelectElement | null;
  controller.commandList = document.getElementById("server-command-list");
  controller.commandDetail = document.getElementById(
    "server-command-detail"
  ) as HTMLTextAreaElement | null;
  controller.commandTestArgs = document.getElementById(
    "server-command-test-args"
  ) as HTMLInputElement | null;
  controller.commandRunBtn = document.getElementById(
    "server-command-run"
  ) as HTMLButtonElement | null;
  controller.commandCategoryTabs = document.getElementById("server-command-category-tabs");
  controller.timelineLog = document.getElementById("server-command-timeline");
  controller.timelineMeta = document.getElementById("server-timeline-meta");

  controller.commandSlotSelect?.addEventListener("change", () => {
    controller.syncCategoryWithSlot();
    controller.renderCommandPanel();
  });

  controller.commandCategoryTabs?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const button = target.closest<HTMLButtonElement>(".command-category-tab");
    if (button === null) {
      return;
    }

    const categoryValue = button.dataset["category"];
    if (categoryValue !== "ai0" && categoryValue !== "ai1-ai2" && categoryValue !== "us1") {
      return;
    }

    if (categoryValue === "ai0") {
      if (controller.commandSlotSelect !== null) {
        controller.commandSlotSelect.value = "ai0";
      }
    } else if (categoryValue === "us1") {
      if (controller.commandSlotSelect !== null) {
        controller.commandSlotSelect.value = "us1";
      }
    } else if (
      controller.commandSlotSelect !== null &&
      (controller.commandSlotSelect.value === "ai0" || controller.commandSlotSelect.value === "us1")
    ) {
      controller.commandSlotSelect.value = "ai1";
    }

    controller.syncCategoryWithSlot();
    controller.renderCommandPanel();
  });

  controller.commandRunBtn?.addEventListener("click", () => {
    void controller.runSelectedCommand();
  });

  controller.commandTestArgs?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    void controller.runSelectedCommand();
  });

  controller.timelineLog?.addEventListener("scroll", () => {
    void controller.handleTimelineScroll();
  });

  controller.syncCategoryWithSlot();
  controller.renderCommandPanel();

  AppState.subscribe(() => {
    controller.syncServerSceneVisibility();
    void controller.renderServerSceneCharacters();
  });

  controller._unsubSlotController ??= SlotController.on(SlotEvent.STATE_CHANGED, () => {
    controller.syncServerSceneVisibility();
    void controller.renderServerSceneCharacters();
  });

  controller.unsubscribeTraffic = TrafficManager.onUpdate((_snapshot) => {
    void controller.renderServerSceneCharacters();
  });

  controller.logUnsubscribe = Logger.subscribe((entry) => {
    controller.handleLogEntry(entry);
  });

  await controller.initializeTimeline();
  controller.syncServerSceneVisibility();
  void controller.renderServerSceneCharacters();
}
