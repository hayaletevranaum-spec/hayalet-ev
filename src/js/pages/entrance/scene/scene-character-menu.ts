import { AppI18n } from "../../../modules/i18n/index.js";

import type { SceneCharacterDescriptor } from "../../../scene/characters/index.js";
import type {
  SceneCharacterMenuActionState,
  SceneCharacterMenuAdvancedState,
  SceneCharacterMenuSelectState,
  SceneCharacterMenuToggleState,
  SceneEntranceBridge,
} from "./scene-entrance-bridge.js";

interface SceneCharacterMenuCallbacks {
  onClose: () => void;
}

function isTurkishLocale(): boolean {
  return AppI18n.getLocale().startsWith("tr");
}

function getSectionTitle(section: "quick" | "controls" | "preferences" | "advanced"): string {
  const tr = isTurkishLocale();
  if (section === "quick") {
    return tr ? "Hızlı Aksiyonlar" : "Quick Actions";
  }
  if (section === "controls") {
    return tr ? "Seçimler" : "Controls";
  }
  if (section === "preferences") {
    return tr ? "Tercihler" : "Preferences";
  }
  return tr ? "Gelişmiş" : "Advanced";
}

function getButtonClass(tone: SceneCharacterMenuActionState["tone"]): string {
  if (tone === "primary") {
    return "btn-primary";
  }
  if (tone === "secondary") {
    return "btn-secondary";
  }
  return "btn-ghost";
}

export class SceneCharacterMenu {
  host: HTMLElement;
  bridge: SceneEntranceBridge;
  onClose: () => void;
  panel: HTMLElement | null = null;
  anchorElement: HTMLElement | null = null;
  character: SceneCharacterDescriptor | null = null;
  openCharacterId: string | null = null;
  advancedExpanded = false;
  boundPointerDown: (event: PointerEvent) => void;
  boundKeyDown: (event: KeyboardEvent) => void;
  boundResize: () => void;

  constructor(
    host: HTMLElement,
    bridge: SceneEntranceBridge,
    callbacks: SceneCharacterMenuCallbacks
  ) {
    this.host = host;
    this.bridge = bridge;
    this.onClose = callbacks.onClose;
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundResize = this.positionPanel.bind(this);
  }

  isOpenFor(characterId: string): boolean {
    return this.openCharacterId === characterId;
  }

  open(character: SceneCharacterDescriptor, anchorElement: HTMLElement): void {
    this.character = character;
    this.anchorElement = anchorElement;
    this.openCharacterId = character.id;
    this.render();
    this.attachListeners();
  }

  refresh(character: SceneCharacterDescriptor, anchorElement: HTMLElement): void {
    this.character = character;
    this.anchorElement = anchorElement;
    this.openCharacterId = character.id;
    this.render();
  }

  close(notify = true): void {
    this.host.replaceChildren();
    this.panel = null;
    this.anchorElement = null;
    this.character = null;
    this.openCharacterId = null;
    this.advancedExpanded = false;
    this.detachListeners();
    if (notify) {
      this.onClose();
    }
  }

  private attachListeners(): void {
    this.detachListeners();
    document.addEventListener("pointerdown", this.boundPointerDown, true);
    document.addEventListener("keydown", this.boundKeyDown);
    window.addEventListener("resize", this.boundResize);
  }

  private detachListeners(): void {
    document.removeEventListener("pointerdown", this.boundPointerDown, true);
    document.removeEventListener("keydown", this.boundKeyDown);
    window.removeEventListener("resize", this.boundResize);
  }

  private handlePointerDown(event: PointerEvent): void {
    const target = event.target as Node | null;
    if (target === null) {
      return;
    }

    if (this.panel?.contains(target) === true) {
      return;
    }

    if (this.anchorElement?.contains(target) === true) {
      return;
    }

    this.close();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape") {
      return;
    }

    this.close();
  }

  private render(): void {
    if (this.character === null) {
      this.close(false);
      return;
    }

    const state = this.bridge.getMenuState(this.character);
    const character = this.character;
    const panel = document.createElement("section");
    panel.className = "entrance-scene__menu-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");

    const header = document.createElement("header");
    header.className = "entrance-scene__menu-header";

    const title = document.createElement("h3");
    title.className = "entrance-scene__menu-title";
    title.textContent = state.label;

    const subtitle = document.createElement("p");
    subtitle.className = "entrance-scene__menu-subtitle";
    subtitle.textContent = state.subtitle;

    header.append(title, subtitle);
    panel.appendChild(header);

    if (state.quickActions.length > 0) {
      panel.appendChild(this.renderQuickSection(character, state.quickActions));
    }

    if (state.controls.length > 0) {
      panel.appendChild(this.renderControlsSection(character, state.controls));
    }

    if (state.preferences.length > 0) {
      panel.appendChild(this.renderPreferencesSection(character, state.preferences));
    }

    if (state.advanced !== null) {
      panel.appendChild(this.renderAdvancedSection(character, state.advanced));
    }

    this.host.replaceChildren(panel);
    this.panel = panel;
    this.positionPanel();
  }

  private renderQuickSection(
    character: SceneCharacterDescriptor,
    actions: SceneCharacterMenuActionState[]
  ): HTMLElement {
    const section = this.createSection(getSectionTitle("quick"));
    const row = document.createElement("div");
    row.className = "entrance-scene__menu-action-row";
    actions.forEach((action) => {
      row.appendChild(
        this.createActionButton(action, () => {
          void this.runAction(async () => {
            await this.bridge.triggerAction(character, action.id);
          });
        })
      );
    });
    section.appendChild(row);
    return section;
  }

  private renderControlsSection(
    character: SceneCharacterDescriptor,
    selects: SceneCharacterMenuSelectState[]
  ): HTMLElement {
    const section = this.createSection(getSectionTitle("controls"));
    selects.forEach((selectState) => {
      section.appendChild(
        this.createSelectField(selectState, (value) => {
          void this.runAction(async () => {
            await this.bridge.updateSelect(character, selectState.id, value);
          });
        })
      );
    });
    return section;
  }

  private renderPreferencesSection(
    character: SceneCharacterDescriptor,
    toggles: SceneCharacterMenuToggleState[]
  ): HTMLElement {
    const section = this.createSection(getSectionTitle("preferences"));
    toggles.forEach((toggleState) => {
      section.appendChild(
        this.createToggleField(toggleState, (checked) => {
          void this.runAction(async () => {
            await this.bridge.updateToggle(character, toggleState.id, checked);
          });
        })
      );
    });
    return section;
  }

  private renderAdvancedSection(
    character: SceneCharacterDescriptor,
    state: SceneCharacterMenuAdvancedState
  ): HTMLElement {
    const details = document.createElement("details");
    details.className = "entrance-scene__menu-advanced";
    details.open = this.advancedExpanded;
    details.addEventListener("toggle", () => {
      this.advancedExpanded = details.open;
      this.positionPanel();
    });

    const summary = document.createElement("summary");
    summary.className = "entrance-scene__menu-advanced-summary";
    summary.textContent = `${getSectionTitle("advanced")} · ${state.summary}`;
    details.appendChild(summary);

    const content = document.createElement("div");
    content.className = "entrance-scene__menu-advanced-content";
    state.selects.forEach((selectState) => {
      content.appendChild(
        this.createSelectField(selectState, (value) => {
          void this.runAction(async () => {
            await this.bridge.updateSelect(character, selectState.id, value);
          });
        })
      );
    });

    if (state.actions.length > 0) {
      const actions = document.createElement("div");
      actions.className = "entrance-scene__menu-advanced-actions";
      state.actions.forEach((action) => {
        actions.appendChild(
          this.createActionButton(action, () => {
            void this.runAction(async () => {
              await this.bridge.triggerAction(character, action.id);
            });
          })
        );
      });
      content.appendChild(actions);
    }

    details.appendChild(content);
    return details;
  }

  private createSection(titleText: string): HTMLElement {
    const section = document.createElement("section");
    section.className = "entrance-scene__menu-section";

    const title = document.createElement("h4");
    title.className = "entrance-scene__menu-section-title";
    title.textContent = titleText;
    section.appendChild(title);

    return section;
  }

  private createActionButton(
    state: SceneCharacterMenuActionState,
    onClick: () => void
  ): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "entrance-scene__menu-control";

    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn btn-sm entrance-scene__menu-button ${getButtonClass(state.tone)}`;
    button.textContent = state.label;
    button.disabled = state.disabled;
    button.addEventListener("click", onClick);

    wrapper.appendChild(button);
    this.appendReason(wrapper, state.reason, state.disabled);
    return wrapper;
  }

  private createToggleField(
    state: SceneCharacterMenuToggleState,
    onChange: (checked: boolean) => void
  ): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "entrance-scene__menu-control";

    const row = document.createElement("label");
    row.className = "entrance-scene__menu-field entrance-scene__menu-field--toggle";

    const label = document.createElement("span");
    label.className = "entrance-scene__menu-field-label";
    label.textContent = state.label;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "entrance-scene__menu-checkbox";
    input.checked = state.checked;
    input.disabled = state.disabled;
    input.addEventListener("change", () => {
      onChange(input.checked);
    });

    row.append(label, input);
    wrapper.appendChild(row);
    this.appendReason(wrapper, state.reason, state.disabled);
    return wrapper;
  }

  private createSelectField(
    state: SceneCharacterMenuSelectState,
    onChange: (value: string) => void
  ): HTMLElement {
    const wrapper = document.createElement("label");
    wrapper.className = "entrance-scene__menu-field";

    const label = document.createElement("span");
    label.className = "entrance-scene__menu-field-label";
    label.textContent = state.label;

    const select = document.createElement("select");
    select.className = "select-compact entrance-scene__menu-select";
    select.disabled = state.disabled;
    state.options.forEach((optionState) => {
      const option = document.createElement("option");
      option.value = optionState.value;
      option.textContent = optionState.label;
      option.disabled = optionState.disabled;
      select.appendChild(option);
    });
    select.value = state.value;
    select.addEventListener("change", () => {
      onChange(select.value);
    });

    wrapper.append(label, select);
    this.appendReason(wrapper, state.reason, state.disabled);
    return wrapper;
  }

  private appendReason(container: HTMLElement, reason: string | null, disabled: boolean): void {
    if (!disabled || reason === null || reason.trim() === "") {
      return;
    }

    const reasonNode = document.createElement("p");
    reasonNode.className = "entrance-scene__menu-reason";
    reasonNode.textContent = reason;
    container.appendChild(reasonNode);
  }

  private async runAction(action: () => Promise<void> | void): Promise<void> {
    try {
      await action();
    } catch {}

    if (this.character !== null && this.anchorElement !== null) {
      this.render();
    }
  }

  private positionPanel(): void {
    if (this.panel === null || this.anchorElement === null) {
      return;
    }

    const hostRect = this.host.getBoundingClientRect();
    const anchorRect = this.anchorElement.getBoundingClientRect();
    const panelRect = this.panel.getBoundingClientRect();
    const gutter = 12;
    const preferRight = anchorRect.left < hostRect.left + hostRect.width / 2;

    let left = preferRight
      ? anchorRect.right - hostRect.left + gutter
      : anchorRect.left - hostRect.left - panelRect.width - gutter;
    let top = anchorRect.top - hostRect.top + anchorRect.height * 0.1;

    left = Math.max(gutter, Math.min(left, hostRect.width - panelRect.width - gutter));
    top = Math.max(gutter, Math.min(top, hostRect.height - panelRect.height - gutter));

    this.panel.style.left = `${left}px`;
    this.panel.style.top = `${top}px`;
  }
}
