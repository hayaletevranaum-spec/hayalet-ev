import type { CustomSelectAPI, CustomSelectCallback, CustomSelectItem } from "./types.js";
import { t } from "./i18n.js";

export function setupCustomSelect(
  dropdownId: string,
  onSelect: CustomSelectCallback
): CustomSelectAPI {
  const dropdown = document.getElementById(dropdownId) as HTMLElement;
  const trigger = dropdown.querySelector(".ds-custom-select__trigger") as HTMLElement;
  const label = dropdown.querySelector(".ds-custom-select__label") as HTMLElement;
  const menu = dropdown.querySelector(".ds-custom-select__menu") as HTMLElement;

  trigger.addEventListener("click", function (e: Event) {
    e.stopPropagation();
    document.querySelectorAll(".ds-custom-select.is-expanded").forEach(function (el) {
      if (el !== dropdown) el.classList.remove("is-expanded");
    });
    dropdown.classList.toggle("is-expanded");
  });

  menu.addEventListener("click", function (e: Event) {
    const item = (e.target as HTMLElement).closest(".ds-custom-select__item");
    if (!item) return;
    const value = (item as HTMLElement).dataset["value"] ?? "";
    const datasetLabel = (item as HTMLElement).dataset["label"];
    const text = typeof datasetLabel === "string" ? datasetLabel : item.textContent;
    menu.querySelectorAll(".ds-custom-select__item").forEach(function (el) {
      el.classList.remove("is-active");
    });
    item.classList.add("is-active");
    label.textContent = text + " \u25be";
    dropdown.classList.remove("is-expanded");
    void (async (): Promise<void> => {
      try {
        await onSelect(value, text);
      } catch (_error) {}
    })();
  });

  return {
    setItems: function (items: CustomSelectItem[], activeValue?: string): void {
      menu.innerHTML = "";
      if (items.length === 0) {
        label.textContent = `${t("common.none")} \u25be`;
        return;
      }
      let activeLabel = "";
      items.forEach(function (item) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ds-custom-select__item" + (item.value === activeValue ? " is-active" : "");
        (btn as HTMLElement).dataset["value"] = item.value;
        (btn as HTMLElement).dataset["label"] = item.label;

        if (
          (item.subtitle !== undefined && item.subtitle !== "") ||
          (item.badge !== undefined && item.badge !== "")
        ) {
          const labelSpan = document.createElement("span");
          labelSpan.className = "ds-custom-select__item-label";
          labelSpan.textContent = item.label;
          btn.appendChild(labelSpan);

          if (item.subtitle !== undefined && item.subtitle !== "") {
            const sub = document.createElement("span");
            sub.className = "ds-custom-select__item-subtitle";
            sub.textContent = item.subtitle;
            btn.appendChild(sub);
          }

          if (item.badge !== undefined && item.badge !== "") {
            const badge = document.createElement("span");
            badge.className =
              "ds-custom-select__item-badge" +
              (item.badgeClass !== undefined && item.badgeClass !== ""
                ? " " + item.badgeClass
                : "");
            badge.textContent = item.badge;
            btn.appendChild(badge);
          }
        } else {
          btn.textContent = item.label;
        }

        menu.appendChild(btn);
        if (item.value === activeValue) activeLabel = item.label;
      });
      let firstLabel = "";
      if (items.length > 0) {
        const firstItem = items[0];
        if (firstItem !== undefined) {
          firstLabel = firstItem.label;
        }
      }
      label.textContent = (activeLabel !== "" ? activeLabel : firstLabel) + " \u25be";
    },
    setError: function (msg?: string): void {
      menu.innerHTML = "";
      label.textContent = (msg ?? t("common.error")) + " \u25be";
    },
  };
}

export function setupSidebarToggle(btnId: string, sidebarId: string): void {
  const btn = document.getElementById(btnId) as HTMLElement;
  const sidebar = document.getElementById(sidebarId) as HTMLElement;
  btn.addEventListener("click", function () {
    const collapsed = sidebar.classList.toggle("ds-sidebar--collapsed");
    btn.classList.toggle(btn.className.split(" ")[0] + "--active", !collapsed);
  });
}

export function initUIHelpers(): void {
  setupSidebarToggle("toggle-left", "sidebar-left");
  setupSidebarToggle("toggle-right", "sidebar-right");

  document.addEventListener("click", function () {
    document.querySelectorAll(".ds-custom-select.is-expanded").forEach(function (el) {
      el.classList.remove("is-expanded");
    });
  });

  const rightTabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".ds-right-tab[data-rtab]")
  );
  const rightPanels = Array.from(document.querySelectorAll<HTMLElement>(".ds-rtab-panel"));
  const rightBody = document.querySelector<HTMLElement>(".ds-sidebar__body--right");
  const rightTabsVisibilityBtn = document.getElementById(
    "rtab-visibility-btn"
  ) as HTMLButtonElement | null;

  const activateRightTab = function (name: string): void {
    rightTabs.forEach(function (tab) {
      const isActive = tab.dataset["rtab"] === name;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
      tab.setAttribute("tabindex", isActive ? "0" : "-1");
    });
    rightPanels.forEach(function (panel) {
      panel.classList.toggle("is-active", panel.id === "rtab-" + name);
    });
  };

  const setRightPanelsVisibility = function (visible: boolean): void {
    if (rightBody != null) {
      rightBody.classList.toggle("is-tabs-hidden", !visible);
    }

    if (rightTabsVisibilityBtn != null) {
      rightTabsVisibilityBtn.textContent = visible ? "▾" : "▸";
      rightTabsVisibilityBtn.setAttribute(
        "title",
        visible ? t("panel.tabsHideTitle") : t("panel.tabsShowTitle")
      );
      rightTabsVisibilityBtn.setAttribute(
        "aria-label",
        visible ? t("panel.tabsHideAria") : t("panel.tabsShowAria")
      );
      rightTabsVisibilityBtn.setAttribute("aria-pressed", visible ? "false" : "true");
    }
  };

  rightTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      const name = tab.dataset["rtab"];
      if (name != null && name !== "") activateRightTab(name);
    });
  });

  rightTabsVisibilityBtn?.addEventListener("click", function () {
    const currentlyHidden = rightBody?.classList.contains("is-tabs-hidden") === true;
    setRightPanelsVisibility(currentlyHidden);
  });

  activateRightTab("health");
  setRightPanelsVisibility(true);

  document.querySelectorAll(".ds-panel__header[data-toggle]").forEach(function (header) {
    header.addEventListener("click", function () {
      const panel = (header as HTMLElement).closest(".ds-panel");
      panel?.classList.toggle("ds-panel--collapsed");
    });
  });

  const toolSearchEl = document.getElementById("tool-search") as HTMLInputElement | null;
  if (toolSearchEl != null) {
    toolSearchEl.addEventListener("input", function () {
      const query = toolSearchEl.value.toLowerCase();
      const items = document.querySelectorAll("#tools-list .ds-panel__item");
      items.forEach(function (item) {
        const name = item.textContent.toLowerCase();
        item.classList.toggle("is-hidden", name.indexOf(query) < 0);
      });
    });
  }
}
