import type {
  SceneBackConfig,
  SceneCharacterPlacementConfig,
  SceneDebugNodeListEntry,
  SceneDebugNodeSelection,
  SceneObjectConfig,
  SceneLayoutConfig,
  SceneLayoutLabelFontPreset,
} from "../scene/layout/index.js";
import type { SceneClickableThemeDefinition } from "../scene/schema.js";
import type { SceneAlphaWindowBounds } from "../scene/alpha-window.js";
import type { SceneEditorAssetTargetDescriptor } from "./scene-theme-asset-state.js";
import {
  SCENE_LAYOUT_LABEL_FONT_PRESETS,
  listSceneDebugNodes,
  resolveSceneBackForSelection,
  resolveSceneCharacterForSelection,
  resolveSceneObjectForSelection,
} from "../scene/layout/index.js";
import { AppI18n } from "../modules/i18n/index.js";
import {
  SCENE_LAYOUT_EDITOR_CAPABILITIES,
  type SceneLayoutEditorCapabilityContext,
} from "./scene-editor-capabilities.js";

export type SceneLayoutEditorSelection = SceneDebugNodeSelection;

export interface SceneLayoutEditorRoomOption {
  id: string;
  label: string;
}

interface SceneLayoutEditorCallbacks {
  isActive(): boolean;
  getSceneLayout(): SceneLayoutConfig;
  getSceneClickableTheme(): SceneClickableThemeDefinition;
  getSelection(): SceneLayoutEditorSelection;
  getRoomOptions(): SceneLayoutEditorRoomOption[];
  getActiveRoomId(): string;
  setSelection(selection: SceneLayoutEditorSelection): void;
  navigateToRoom(roomId: string): void;
  updateObject(id: string, updater: (node: SceneObjectConfig) => SceneObjectConfig): void;
  updateBack(id: string, updater: (node: SceneBackConfig) => SceneBackConfig): void;
  updateCharacter(
    id: string,
    updater: (node: SceneCharacterPlacementConfig) => SceneCharacterPlacementConfig
  ): void;
  resetDraft(): void;
  copySceneLayout(): Promise<void>;
  saveSceneLayoutToSource(): Promise<void>;
  updateSceneClickableTheme(
    updater: (theme: SceneClickableThemeDefinition) => SceneClickableThemeDefinition
  ): void;
  resetSceneClickableThemeDraft(): void;
  copySceneClickableTheme(): Promise<void>;
  saveSceneClickableThemeToSource(): Promise<void>;
  getSceneAssetTargets?(): SceneEditorAssetTargetDescriptor[];
  getSuggestedSceneAssetTargetId?(): string | null;
  pickSceneAsset?(targetId: string): Promise<void>;
  clearSceneAsset?(targetId: string): void;
  resetSceneAssetDraft?(): void;
  saveSceneAssetDraftToSource?(): Promise<void>;
  detectSceneAssetTransparentWindow?(targetId: string): Promise<void>;
  clearSceneAssetTransparentWindow?(targetId: string): void;
  updateSceneAssetTransparentWindow?(
    targetId: string,
    nextBounds: SceneAlphaWindowBounds | null
  ): void;
}

const INTERACTIVE_FIELDS = [
  ["rect.leftPx", "X"],
  ["rect.topPx", "Y"],
  ["rect.widthPx", "W"],
  ["rect.heightPx", "H"],
  ["frame.rotateDeg", "Frame R"],
  ["frame.perspectiveDeg", "Frame P"],
  ["frame.hueDeg", "Glow H"],
  ["frame.alpha", "Glow A"],
] as const;

const BACK_FIELDS = [
  ["rect.leftPx", "X"],
  ["rect.topPx", "Y"],
  ["rect.widthPx", "W"],
  ["rect.heightPx", "H"],
  ["glow.hueDeg", "Glow H"],
  ["glow.alpha", "Glow A"],
] as const;

const LABEL_FIELDS = [
  ["label.centerXPx", "Label X"],
  ["label.topPx", "Label Y"],
  ["label.widthPx", "Label W"],
  ["label.heightPx", "Label H"],
  ["label.rotateDeg", "Label R"],
  ["label.fontSizePx", "Text"],
  ["label.letterSpacingPx", "Track"],
  ["label.framePerspectiveDeg", "Label P"],
] as const;

const CHARACTER_FIELDS = [
  ["leftPx", "X"],
  ["bottomPx", "Bottom"],
  ["scale", "Scale"],
  ["depth", "Depth"],
] as const;

const OBJECT_THEME_FIELDS = [
  ["glowHueShiftDeg", "Glow H"],
  ["glowAlphaScale", "Glow A"],
  ["frame.depthRem", "Depth"],
  ["frame.insetRem", "Inset"],
  ["frame.borderAlpha", "Border"],
  ["frame.innerRingAlpha", "Inner"],
  ["frame.liftPx", "Lift"],
  ["frame.shadowYPx", "Shadow Y"],
  ["frame.shadowBlurPx", "Shadow B"],
] as const;

const BACK_THEME_FIELDS = [
  ["glowHueShiftDeg", "Glow H"],
  ["glowAlphaScale", "Glow A"],
  ["arrowShiftRem", "Arrow"],
] as const;

const THEME_LABEL_FIELDS = [
  ["label.fontScale", "Text"],
  ["label.trackingScale", "Track"],
  ["label.padYRem", "Pad Y"],
  ["label.padXRem", "Pad X"],
  ["label.borderAlpha", "Border"],
  ["label.backgroundAlpha", "BG"],
  ["label.activeBackgroundAlpha", "BG+"],
  ["label.activeRingAlpha", "Ring"],
] as const;

const DEBUG_NODE_SECTIONS = [
  { kind: "object", title: "Objects" },
  { kind: "back", title: "Backs" },
  { kind: "character", title: "Characters" },
] as const;

type SceneEditorNodeKind = (typeof DEBUG_NODE_SECTIONS)[number]["kind"];
type SceneClickableNodeKind = "object" | "back";
type SceneClickableNode = SceneObjectConfig | SceneBackConfig;
type SceneThemeClickableKind = "object" | "back";

export class SceneLayoutEditor {
  host: HTMLElement;
  callbacks: SceneLayoutEditorCallbacks;
  step = 1;
  panelPosition: { left: number; top: number } | null = null;
  dragState: { pointerId: number; offsetX: number; offsetY: number } | null = null;
  panelScroll = { top: 0, left: 0 };
  openSections = new Set<string>();
  activeAssetTargetId: string | null = null;

  constructor(host: HTMLElement, callbacks: SceneLayoutEditorCallbacks) {
    this.host = host;
    this.callbacks = callbacks;
    this.host.addEventListener("click", this.handleClick);
    this.host.addEventListener("change", this.handleChange);
    this.host.addEventListener("pointerdown", this.handlePointerDown);
    window.addEventListener("pointermove", this.handlePointerMove);
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("keydown", this.handleKeydown);
  }

  refresh(): void {
    const sceneLayout = this.callbacks.getSceneLayout();
    const sceneClickableTheme = this.callbacks.getSceneClickableTheme();
    const selection = this.callbacks.getSelection();
    const roomOptions = this.callbacks.getRoomOptions();
    const activeRoomId = this.callbacks.getActiveRoomId();
    const debugNodes = listSceneDebugNodes(sceneLayout);
    const assetTargets = this.callbacks.getSceneAssetTargets?.() ?? [];
    const suggestedAssetTargetId = this.callbacks.getSuggestedSceneAssetTargetId?.() ?? null;
    const previousPanel = this.host.querySelector<HTMLElement>(".entrance-scene__editor-panel");
    if (previousPanel !== null) {
      this.panelScroll = {
        top: previousPanel.scrollTop,
        left: previousPanel.scrollLeft,
      };
    }
    const previousOpenSections = Array.from(
      this.host.querySelectorAll<HTMLDetailsElement>("details[data-editor-section]")
    )
      .filter((section) => section.open)
      .map((section) => section.dataset["editorSection"] ?? "")
      .filter((sectionId) => sectionId !== "");
    if (previousOpenSections.length > 0) {
      this.openSections = new Set(previousOpenSections);
    }

    const panel = document.createElement("aside");
    panel.className = "entrance-scene__editor-panel";

    const selectedObject = resolveSceneObjectForSelection(sceneLayout, selection);
    const selectedBack = resolveSceneBackForSelection(sceneLayout, selection);
    const selectedCharacter = resolveSceneCharacterForSelection(sceneLayout, selection);
    this.syncActiveAssetTargetId(assetTargets, suggestedAssetTargetId);
    const activeAssetTarget =
      assetTargets.find((target) => target.id === this.activeAssetTargetId) ?? null;
    const capabilityContext = this.buildCapabilityContext(assetTargets, activeAssetTarget);
    const capabilityMarkup = SCENE_LAYOUT_EDITOR_CAPABILITIES.map((capability) =>
      capability.render(capabilityContext)
    )
      .filter((section): section is string => section !== null && section.trim() !== "")
      .join("");
    const activeRoomLabel = this.escapeHtml(
      roomOptions.find((room) => room.id === activeRoomId)?.label ?? activeRoomId
    );
    const selectionSummary = this.escapeHtml(
      this.formatSelectionSummary(selection, selectedObject, selectedBack, selectedCharacter)
    );

    panel.innerHTML = `
      <div class="entrance-scene__editor-shell">
        <div class="entrance-scene__editor-header" data-editor-drag-handle="true">
          <div class="entrance-scene__editor-heading">
            <span class="entrance-scene__editor-eyebrow">Scene Workbench</span>
            <div>
              <h3 class="entrance-scene__editor-title">Scene Editor</h3>
              <p class="entrance-scene__editor-subtitle">
                Edit layout, theme, assets, and screen placement from a guided scene editor surface.
              </p>
            </div>
          </div>
          <div class="entrance-scene__editor-toolbar">
            <button type="button" class="btn btn-ghost btn-sm" data-editor-action="copy">Copy Layout</button>
            <button type="button" class="btn btn-ghost btn-sm" data-editor-action="reset">Reset Layout</button>
            <button type="button" class="btn btn-ghost btn-sm" data-editor-action="save-source">Save Layout</button>
            <button type="button" class="btn btn-ghost btn-sm" data-editor-action="save-theme">Save Theme</button>
            ${
              assetTargets.length > 0 && this.callbacks.saveSceneAssetDraftToSource !== undefined
                ? `<button type="button" class="btn btn-ghost btn-sm" data-editor-action="save-assets">Save Assets</button>`
                : ""
            }
          </div>
        </div>
        <div class="entrance-scene__editor-status" aria-label="Scene workbench status">
          <span class="entrance-scene__editor-status-pill is-active">Room ${activeRoomLabel}</span>
          <span class="entrance-scene__editor-status-pill">${selectionSummary}</span>
          <span class="entrance-scene__editor-status-pill">${debugNodes.length} Nodes</span>
          ${
            assetTargets.length > 0
              ? `<span class="entrance-scene__editor-status-pill">${assetTargets.length} Assets</span>`
              : ""
          }
        </div>
        <div class="entrance-scene__editor-controlbar">
          <div class="entrance-scene__editor-cluster">
            <span class="entrance-scene__editor-cluster-label">Rooms</span>
            <div class="entrance-scene__editor-room-list" role="tablist" aria-label="Scene rooms">
              ${roomOptions
                .map(
                  (room) => `
                  <button
                    type="button"
                    class="entrance-scene__editor-room-btn${room.id === activeRoomId ? " is-active" : ""}"
                    data-editor-action="room"
                    data-room-id="${room.id}"
                    aria-pressed="${String(room.id === activeRoomId)}"
                  >
                    ${room.label}
                  </button>
                `
                )
                .join("")}
            </div>
          </div>
          <div class="entrance-scene__editor-cluster">
            <span class="entrance-scene__editor-cluster-label">Step</span>
            <div class="entrance-scene__editor-stepper" role="group" aria-label="Editor step size">
              ${[1, 5, 10]
                .map(
                  (step) => `
                  <button
                    type="button"
                    class="entrance-scene__editor-chip${step === this.step ? " is-active" : ""}"
                    data-editor-action="step"
                    data-step="${step}"
                  >
                    ${step}px
                  </button>
                `
                )
                .join("")}
            </div>
          </div>
        </div>
        <div class="entrance-scene__editor-workspace">
          <div class="entrance-scene__editor-main">
            ${
              assetTargets.length > 0
                ? this.renderAccordionSection(
                    "assets",
                    "Assets",
                    this.renderAssetSection(assetTargets, activeAssetTarget),
                    true
                  )
                : ""
            }
            ${this.renderAccordionSection(
              "theme-defaults",
              "Theme Defaults",
              this.renderThemeDefaultsBlock(sceneClickableTheme),
              false
            )}
            ${this.renderAccordionSection(
              "scene-nodes",
              "Scene Nodes",
              `<div class="entrance-scene__editor-list-wrap entrance-scene__editor-list-wrap--sections">
                ${DEBUG_NODE_SECTIONS.map(({ kind, title }) =>
                  this.renderNodeSection(
                    title,
                    debugNodes.filter((node) => node.kind === kind),
                    selection
                  )
                ).join("")}
              </div>`,
              false
            )}
          </div>
          <div class="entrance-scene__editor-sidebar">
            <section class="entrance-scene__editor-sidecard entrance-scene__editor-sidecard--selected">
              <div class="entrance-scene__editor-sidecard-header">
                <span class="entrance-scene__editor-sidecard-kicker">Inspector</span>
                <div class="entrance-scene__editor-sidecard-title">Selected Item</div>
              </div>
              <div class="entrance-scene__editor-selected">${this.renderSelectedBlock(
                selection,
                selectedObject,
                selectedBack,
                selectedCharacter
              )}</div>
            </section>
            ${capabilityMarkup}
            ${this.renderAccordionSection(
              "scene-notes",
              "Scene Notes",
              `<div class="entrance-scene__editor-help">
                <span>Arrow keys move selected nodes</span>
                <span>Shift multiplies the current step</span>
                <span>Drafts stay local until you save the room layout or theme defaults.</span>
                <span>Asset drafts stay local until you save assets.</span>
                <span>Run transparent detection manually from the asset tools</span>
              </div>`,
              false
            )}
          </div>
        </div>
      </div>
    `;

    this.host.replaceChildren(panel);
    this.applyPanelPosition(panel);
    panel.scrollTop = this.panelScroll.top;
    panel.scrollLeft = this.panelScroll.left;
  }

  private renderSelectedBlock(
    selection: SceneLayoutEditorSelection,
    sceneObject: SceneObjectConfig | null,
    back: SceneBackConfig | null,
    character: SceneCharacterPlacementConfig | null
  ): string {
    if (selection === null || (sceneObject === null && back === null && character === null)) {
      return `<p class="entrance-scene__editor-empty">Select an object, back, or character node from the scene.</p>`;
    }

    if (sceneObject !== null) {
      return `
        <div class="entrance-scene__editor-selected-title">Object: ${sceneObject.id}</div>
        ${this.renderNumericSection("Placement", "object", sceneObject.id, INTERACTIVE_FIELDS, sceneObject)}
        ${this.renderLabelSection("object", sceneObject.id, sceneObject)}
      `;
    }

    if (back !== null) {
      return `
        <div class="entrance-scene__editor-selected-title">Back: ${back.id}</div>
        ${this.renderNumericSection("Placement", "back", back.id, BACK_FIELDS, back)}
        ${this.renderLabelSection("back", back.id, back)}
      `;
    }

    if (character !== null) {
      return `
        <div class="entrance-scene__editor-selected-title">Character: ${character.id}</div>
        <div class="entrance-scene__editor-grid">
          ${CHARACTER_FIELDS.map(([field, label]) =>
            this.renderControlRow(
              "character",
              character.id,
              field,
              label,
              this.readNumericField(character, field)
            )
          ).join("")}
        </div>
      `;
    }

    return "";
  }

  private renderAccordionSection(
    id: string,
    title: string,
    content: string,
    defaultOpen: boolean
  ): string {
    const open = this.openSections.has(id) || (this.openSections.size === 0 && defaultOpen);
    return `
      <details class="entrance-scene__editor-accordion" data-editor-section="${id}" ${open ? "open" : ""}>
        <summary class="entrance-scene__editor-accordion-summary">${title}</summary>
        <div class="entrance-scene__editor-accordion-body">${content}</div>
      </details>
    `;
  }

  private renderAssetSection(
    assetTargets: SceneEditorAssetTargetDescriptor[],
    activeAssetTarget: SceneEditorAssetTargetDescriptor | null
  ): string {
    return `
      <div class="entrance-scene__editor-section">
        <div class="entrance-scene__editor-section-head">
          <div>
            <div class="entrance-scene__editor-section-title">Asset Slots</div>
            <p class="entrance-scene__editor-section-copy">
              Focus a surface, swap its preview, then keep transparent-window tuning next to the active asset.
            </p>
          </div>
          <div class="entrance-scene__editor-toolbar">
          ${
            this.callbacks.resetSceneAssetDraft !== undefined
              ? `<button type="button" class="btn btn-ghost btn-sm" data-editor-action="reset-assets">Reset Assets</button>`
              : ""
          }
        </div>
        </div>
        <div class="entrance-scene__editor-asset-list">
          ${assetTargets
            .map((target) => this.renderAssetCard(target, activeAssetTarget?.id === target.id))
            .join("")}
        </div>
      </div>
    `;
  }

  private renderAssetCard(target: SceneEditorAssetTargetDescriptor, active: boolean): string {
    const label = this.escapeHtml(target.label);
    const sourceHint = this.escapeHtml(target.sourceHint);
    const previewMarkup =
      target.runtimeSrc.trim() === ""
        ? `<div class="entrance-scene__editor-asset-preview entrance-scene__editor-asset-preview--empty">No Preview</div>`
        : `<div class="entrance-scene__editor-asset-preview">
            <img
              src="${this.escapeAttribute(target.runtimeSrc)}"
              alt=""
              loading="lazy"
              class="entrance-scene__editor-asset-preview-image"
            />
          </div>`;

    return `
      <div class="entrance-scene__editor-asset-card${active ? " is-selected" : ""}">
        ${previewMarkup}
        <button
          type="button"
          class="entrance-scene__editor-asset-focus"
          data-editor-action="focus-asset"
          data-target-id="${target.id}"
        >
          <span class="entrance-scene__editor-asset-title">${label}</span>
          <span class="entrance-scene__editor-asset-meta">${sourceHint}</span>
        </button>
        <div class="entrance-scene__editor-row-controls">
          ${
            target.hasSourceOverride
              ? `<span class="entrance-scene__editor-chip is-active">Draft Asset</span>`
              : `<span class="entrance-scene__editor-chip">Theme Default</span>`
          }
          ${
            this.callbacks.pickSceneAsset !== undefined
              ? `<button type="button" class="entrance-scene__editor-adjust" data-editor-action="pick-asset" data-target-id="${target.id}">Pick</button>`
              : ""
          }
          ${
            this.callbacks.clearSceneAsset !== undefined && target.hasSourceOverride
              ? `<button type="button" class="entrance-scene__editor-adjust" data-editor-action="clear-asset" data-target-id="${target.id}">Reset</button>`
              : ""
          }
          ${
            target.supportsTransparentWindow
              ? `<span class="entrance-scene__editor-chip${target.transparentWindow !== null ? " is-active" : ""}">${
                  target.transparentWindow !== null ? "Window Saved" : "Window Empty"
                }</span>`
              : ""
          }
        </div>
      </div>
    `;
  }

  private renderThemeDefaultsBlock(sceneClickableTheme: SceneClickableThemeDefinition): string {
    return `
      <div class="entrance-scene__editor-section">
        <div class="entrance-scene__editor-section-head">
          <div>
            <div class="entrance-scene__editor-section-title">Theme Defaults</div>
            <p class="entrance-scene__editor-section-copy">
              Tune the shared frame, glow, and label behavior before saving a new default theme.
            </p>
          </div>
          <div class="entrance-scene__editor-toolbar">
            <button type="button" class="btn btn-ghost btn-sm" data-editor-action="copy-theme">Copy Theme</button>
            <button type="button" class="btn btn-ghost btn-sm" data-editor-action="reset-theme">Reset Theme</button>
          </div>
        </div>
        <div class="entrance-scene__editor-list-wrap entrance-scene__editor-list-wrap--sections">
          ${this.renderThemeDefaultsSection("object", "Object Defaults", sceneClickableTheme)}
          ${this.renderThemeDefaultsSection("back", "Back Defaults", sceneClickableTheme)}
        </div>
      </div>
    `;
  }

  private renderThemeDefaultsSection(
    kind: SceneThemeClickableKind,
    title: string,
    sceneClickableTheme: SceneClickableThemeDefinition
  ): string {
    const themeNode = sceneClickableTheme[kind];
    const numericFields = kind === "object" ? OBJECT_THEME_FIELDS : BACK_THEME_FIELDS;
    return `
      <div class="entrance-scene__editor-section">
        <div class="entrance-scene__editor-section-title">${title}</div>
        <div class="entrance-scene__editor-grid">
          ${numericFields
            .map(([field, label]) =>
              this.renderThemeControlRow(
                kind,
                field,
                label,
                this.readNumericField(themeNode, field)
              )
            )
            .join("")}
        </div>
        <div class="entrance-scene__editor-section-title">Label Defaults</div>
        <div class="entrance-scene__editor-grid">
          ${THEME_LABEL_FIELDS.map(([field, label]) =>
            this.renderThemeControlRow(kind, field, label, this.readNumericField(themeNode, field))
          ).join("")}
        </div>
        <label class="entrance-scene__editor-row">
          <span class="entrance-scene__editor-row-label">Visible</span>
          <input
            type="checkbox"
            ${themeNode.label.visible ? "checked" : ""}
            data-editor-action="toggle-theme-label"
            data-kind="${kind}"
          />
        </label>
        ${this.renderThemeFontPresetRow(kind, themeNode.label.fontPresetOverride)}
      </div>
    `;
  }

  private renderNumericSection(
    title: string,
    kind: SceneClickableNodeKind,
    id: string,
    fields: readonly (readonly [string, string])[],
    node: SceneClickableNode
  ): string {
    return `
      <div class="entrance-scene__editor-section">
        <div class="entrance-scene__editor-section-title">${title}</div>
        <div class="entrance-scene__editor-grid">
          ${fields
            .map(([field, label]) =>
              this.renderControlRow(kind, id, field, label, this.readNumericField(node, field))
            )
            .join("")}
        </div>
      </div>
    `;
  }

  private renderLabelSection(
    kind: SceneClickableNodeKind,
    id: string,
    node: SceneClickableNode
  ): string {
    const value = typeof node.label.customText === "string" ? node.label.customText : "";
    const placeholder = this.escapeAttribute(
      AppI18n.t("entrance.scene.editor.customLabelPlaceholder")
    );
    return `
      <div class="entrance-scene__editor-section">
        <div class="entrance-scene__editor-section-title">Label</div>
        <div class="entrance-scene__editor-grid">
          ${LABEL_FIELDS.map(([field, label]) =>
            this.renderControlRow(kind, id, field, label, this.readNumericField(node, field))
          ).join("")}
        </div>
        <label class="entrance-scene__editor-row entrance-scene__editor-row--stack">
          <span class="entrance-scene__editor-row-label">Custom label</span>
          <input
            type="text"
            class="entrance-scene__editor-input"
            value="${this.escapeAttribute(value)}"
            placeholder="${placeholder}"
            data-editor-action="text"
            data-kind="${kind}"
            data-id="${id}"
          />
        </label>
        <label class="entrance-scene__editor-row">
          <span class="entrance-scene__editor-row-label">Visible</span>
          <input
            type="checkbox"
            ${node.label.visible ? "checked" : ""}
            data-editor-action="toggle-label"
            data-kind="${kind}"
            data-id="${id}"
          />
        </label>
        ${this.renderFontPresetRow(kind, id, node.label.fontPreset)}
      </div>
    `;
  }

  private renderControlRow(
    kind: SceneEditorNodeKind,
    id: string,
    field: string,
    label: string,
    value: number
  ): string {
    return `
      <div class="entrance-scene__editor-row">
        <span class="entrance-scene__editor-row-label">${label}</span>
        <div class="entrance-scene__editor-row-controls">
          <button type="button" class="entrance-scene__editor-adjust" data-editor-action="adjust" data-kind="${kind}" data-id="${id}" data-field="${field}" data-direction="-1">-</button>
          <span class="entrance-scene__editor-row-value">${value}</span>
          <button type="button" class="entrance-scene__editor-adjust" data-editor-action="adjust" data-kind="${kind}" data-id="${id}" data-field="${field}" data-direction="1">+</button>
        </div>
      </div>
    `;
  }

  private renderThemeControlRow(
    kind: SceneThemeClickableKind,
    field: string,
    label: string,
    value: number
  ): string {
    return `
      <div class="entrance-scene__editor-row">
        <span class="entrance-scene__editor-row-label">${label}</span>
        <div class="entrance-scene__editor-row-controls">
          <button type="button" class="entrance-scene__editor-adjust" data-editor-action="adjust-theme" data-kind="${kind}" data-field="${field}" data-direction="-1">-</button>
          <span class="entrance-scene__editor-row-value">${value}</span>
          <button type="button" class="entrance-scene__editor-adjust" data-editor-action="adjust-theme" data-kind="${kind}" data-field="${field}" data-direction="1">+</button>
        </div>
      </div>
    `;
  }

  private renderNodeSection(
    title: string,
    nodes: SceneDebugNodeListEntry[],
    selection: SceneLayoutEditorSelection
  ): string {
    const content =
      nodes.length > 0
        ? nodes
            .map((node) => this.renderListItem(node.kind, node.id, node.label, selection))
            .join("")
        : `<p class="entrance-scene__editor-empty">No ${title.toLowerCase()}.</p>`;

    return `
      <div class="entrance-scene__editor-section">
        <div class="entrance-scene__editor-section-title">${title}</div>
        <div class="entrance-scene__editor-list">${content}</div>
      </div>
    `;
  }

  private renderListItem(
    kind: SceneEditorNodeKind,
    id: string,
    label: string,
    selection: SceneLayoutEditorSelection
  ): string {
    const selected = selection?.kind === kind && selection.id === id;
    return `
      <button
        type="button"
        class="entrance-scene__editor-item${selected ? " is-selected" : ""}"
        data-editor-action="select"
        data-kind="${kind}"
        data-id="${id}"
      >
        ${this.escapeHtml(label)}
      </button>
    `;
  }

  private renderFontPresetRow(
    kind: SceneClickableNodeKind,
    id: string,
    fontPreset: SceneLayoutLabelFontPreset
  ): string {
    return `
      <div class="entrance-scene__editor-row">
        <span class="entrance-scene__editor-row-label">Font</span>
        <div class="entrance-scene__editor-row-controls">
          <button type="button" class="entrance-scene__editor-adjust" data-editor-action="cycle-font" data-kind="${kind}" data-id="${id}" data-direction="-1">-</button>
          <span class="entrance-scene__editor-row-value entrance-scene__editor-row-value--wide">${this.formatFontPreset(fontPreset)}</span>
          <button type="button" class="entrance-scene__editor-adjust" data-editor-action="cycle-font" data-kind="${kind}" data-id="${id}" data-direction="1">+</button>
        </div>
      </div>
    `;
  }

  private renderThemeFontPresetRow(
    kind: SceneThemeClickableKind,
    fontPresetOverride: SceneLayoutLabelFontPreset | null
  ): string {
    return `
      <div class="entrance-scene__editor-row">
        <span class="entrance-scene__editor-row-label">Font</span>
        <div class="entrance-scene__editor-row-controls">
          <button type="button" class="entrance-scene__editor-adjust" data-editor-action="cycle-theme-font" data-kind="${kind}" data-direction="-1">-</button>
          <span class="entrance-scene__editor-row-value entrance-scene__editor-row-value--wide">${this.formatThemeFontPreset(fontPresetOverride)}</span>
          <button type="button" class="entrance-scene__editor-adjust" data-editor-action="cycle-theme-font" data-kind="${kind}" data-direction="1">+</button>
        </div>
      </div>
    `;
  }

  private handleClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const actionButton = target?.closest<HTMLElement>("[data-editor-action]") ?? null;
    if (actionButton === null) {
      return;
    }

    const action = actionButton.dataset["editorAction"] ?? "";
    if (action === "step") {
      const parsedStep = Number(actionButton.dataset["step"] ?? "1");
      this.step = Number.isNaN(parsedStep) || parsedStep === 0 ? 1 : parsedStep;
      this.refresh();
      return;
    }

    if (action === "copy") {
      void this.callbacks.copySceneLayout();
      return;
    }

    if (action === "save-source") {
      void this.callbacks.saveSceneLayoutToSource();
      return;
    }

    if (action === "copy-theme") {
      void this.callbacks.copySceneClickableTheme();
      return;
    }

    if (action === "save-theme") {
      void this.callbacks.saveSceneClickableThemeToSource();
      return;
    }

    if (action === "save-assets") {
      void this.callbacks.saveSceneAssetDraftToSource?.();
      return;
    }

    if (action === "room") {
      const roomId = actionButton.dataset["roomId"] ?? "";
      if (roomId !== "") {
        this.callbacks.navigateToRoom(roomId);
      }
      return;
    }

    if (action === "reset") {
      this.callbacks.resetDraft();
      return;
    }

    if (action === "reset-theme") {
      this.callbacks.resetSceneClickableThemeDraft();
      return;
    }

    if (action === "reset-assets") {
      this.callbacks.resetSceneAssetDraft?.();
      return;
    }

    if (action === "select") {
      const kind = actionButton.dataset["kind"];
      const id = actionButton.dataset["id"];
      if ((kind === "object" || kind === "back" || kind === "character") && id !== undefined) {
        this.callbacks.setSelection({ kind, id });
      }
      return;
    }

    if (action === "cycle-font") {
      const kind = actionButton.dataset["kind"];
      const id = actionButton.dataset["id"] ?? "";
      const direction = Number(actionButton.dataset["direction"] ?? "0");
      if (kind === "object" || kind === "back") {
        this.updateClickableNode(kind, id, (node) => ({
          ...node,
          label: {
            ...node.label,
            fontPreset: this.shiftFontPreset(node.label.fontPreset, direction),
          },
        }));
      }
      return;
    }

    if (action === "cycle-theme-font") {
      const kind = actionButton.dataset["kind"];
      const direction = Number(actionButton.dataset["direction"] ?? "0");
      if (kind === "object" || kind === "back") {
        this.updateThemeClickable(kind, (themeNode) => ({
          ...themeNode,
          label: {
            ...themeNode.label,
            fontPresetOverride: this.shiftThemeFontPreset(
              themeNode.label.fontPresetOverride,
              direction
            ),
          },
        }));
      }
      return;
    }

    if (action === "focus-asset") {
      const targetId = actionButton.dataset["targetId"] ?? "";
      if (targetId !== "") {
        this.activeAssetTargetId = targetId;
        this.refresh();
      }
      return;
    }

    if (action === "pick-asset") {
      const targetId = actionButton.dataset["targetId"] ?? "";
      if (targetId !== "") {
        void this.callbacks.pickSceneAsset?.(targetId);
      }
      return;
    }

    if (action === "clear-asset") {
      const targetId = actionButton.dataset["targetId"] ?? "";
      if (targetId !== "") {
        this.callbacks.clearSceneAsset?.(targetId);
      }
      return;
    }

    if (action === "adjust") {
      const kind = actionButton.dataset["kind"];
      const id = actionButton.dataset["id"] ?? "";
      const field = actionButton.dataset["field"] ?? "";
      const direction = Number(actionButton.dataset["direction"] ?? "0");
      this.adjustField(kind, id, field, this.getAdjustDelta(field, direction));
      return;
    }

    if (action === "adjust-theme") {
      const kind = actionButton.dataset["kind"];
      const field = actionButton.dataset["field"] ?? "";
      const direction = Number(actionButton.dataset["direction"] ?? "0");
      if (kind === "object" || kind === "back") {
        this.adjustThemeField(kind, field, this.getAdjustDelta(field, direction));
      }
      return;
    }

    const capabilityContext = this.getCapabilityContext();
    for (const capability of SCENE_LAYOUT_EDITOR_CAPABILITIES) {
      if (capability.handleAction?.(capabilityContext, actionButton) === true) {
        return;
      }
    }
  };

  private handleChange = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const capabilityContext = this.getCapabilityContext();
    for (const capability of SCENE_LAYOUT_EDITOR_CAPABILITIES) {
      if (capability.handleChange?.(capabilityContext, target) === true) {
        return;
      }
    }

    const action = target.dataset["editorAction"] ?? "";
    const kind = target.dataset["kind"] ?? "";
    const id = target.dataset["id"] ?? "";
    if (action === "text") {
      if (id === "") {
        return;
      }
      this.updateLabelText(kind, id, target.value.trim());
      return;
    }

    if (action === "toggle-label") {
      if (id === "") {
        return;
      }
      this.updateLabelVisible(kind, id, target.checked);
      return;
    }

    if (action === "toggle-theme-label" && (kind === "object" || kind === "back")) {
      this.updateThemeLabelVisible(kind, target.checked);
    }
  };

  private handleKeydown = (event: KeyboardEvent): void => {
    if (!this.callbacks.isActive()) {
      return;
    }

    const selection = this.callbacks.getSelection();
    if (selection === null) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return;
    }

    const step = event.shiftKey ? this.step * 10 : this.step;

    if (selection.kind === "object" || selection.kind === "back") {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        this.adjustField(selection.kind, selection.id, "rect.leftPx", -step);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        this.adjustField(selection.kind, selection.id, "rect.leftPx", step);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        this.adjustField(selection.kind, selection.id, "rect.topPx", -step);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        this.adjustField(selection.kind, selection.id, "rect.topPx", step);
      } else if (selection.kind === "object" && event.key === "[") {
        event.preventDefault();
        this.adjustField(
          selection.kind,
          selection.id,
          "frame.rotateDeg",
          this.getAdjustDelta("frame.rotateDeg", -1)
        );
      } else if (selection.kind === "object" && event.key === "]") {
        event.preventDefault();
        this.adjustField(
          selection.kind,
          selection.id,
          "frame.rotateDeg",
          this.getAdjustDelta("frame.rotateDeg", 1)
        );
      }
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.adjustField("character", selection.id, "leftPx", -step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      this.adjustField("character", selection.id, "leftPx", step);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      this.adjustField("character", selection.id, "bottomPx", step);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      this.adjustField("character", selection.id, "bottomPx", -step);
    } else if (event.key === "[") {
      event.preventDefault();
      this.adjustField("character", selection.id, "scale", -this.getScaleStep());
    } else if (event.key === "]") {
      event.preventDefault();
      this.adjustField("character", selection.id, "scale", this.getScaleStep());
    }
  };

  private handlePointerDown = (event: PointerEvent): void => {
    const target = event.target as HTMLElement | null;
    const dragHandle = target?.closest<HTMLElement>("[data-editor-drag-handle]") ?? null;
    if (dragHandle === null || target?.closest("button") !== null) {
      return;
    }

    const panel = dragHandle.closest<HTMLElement>(".entrance-scene__editor-panel");
    if (panel === null) {
      return;
    }

    const hostRect = this.host.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    this.panelPosition = {
      left: panelRect.left - hostRect.left,
      top: panelRect.top - hostRect.top,
    };
    this.dragState = {
      pointerId: event.pointerId,
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top,
    };
    panel.classList.add("is-dragging");
    event.preventDefault();
  };

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.callbacks.isActive() || this.dragState?.pointerId !== event.pointerId) {
      return;
    }

    const panel = this.host.querySelector<HTMLElement>(".entrance-scene__editor-panel");
    if (panel === null) {
      return;
    }

    const hostRect = this.host.getBoundingClientRect();
    this.panelPosition = this.clampPanelPosition(
      event.clientX - hostRect.left - this.dragState.offsetX,
      event.clientY - hostRect.top - this.dragState.offsetY,
      panel
    );
    this.applyPanelPosition(panel);
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (!this.callbacks.isActive() || this.dragState?.pointerId !== event.pointerId) {
      return;
    }

    const panel = this.host.querySelector<HTMLElement>(".entrance-scene__editor-panel");
    panel?.classList.remove("is-dragging");
    this.dragState = null;
  };

  private updateClickableNode(
    kind: SceneClickableNodeKind,
    id: string,
    updater: (node: SceneClickableNode) => SceneClickableNode
  ): void {
    if (kind === "object") {
      this.callbacks.updateObject(id, (node) => updater(node) as SceneObjectConfig);
      return;
    }

    this.callbacks.updateBack(id, (node) => updater(node) as SceneBackConfig);
  }

  private updateThemeClickable(
    kind: SceneThemeClickableKind,
    updater: (
      node: SceneClickableThemeDefinition[SceneThemeClickableKind]
    ) => SceneClickableThemeDefinition[SceneThemeClickableKind]
  ): void {
    this.callbacks.updateSceneClickableTheme((theme) => ({
      ...theme,
      [kind]: updater(theme[kind]),
    }));
  }

  private adjustField(kind: string | undefined, id: string, field: string, delta: number): void {
    if (kind === "object" || kind === "back") {
      this.updateClickableNode(kind, id, (node) => this.patchNumericField(node, field, delta));
      return;
    }

    if (kind === "character") {
      this.callbacks.updateCharacter(id, (node) => this.patchNumericField(node, field, delta));
    }
  }

  private adjustThemeField(kind: SceneThemeClickableKind, field: string, delta: number): void {
    this.updateThemeClickable(kind, (themeNode) => this.patchNumericField(themeNode, field, delta));
  }

  private updateLabelText(kind: string, id: string, nextValue: string): void {
    if (kind === "object" || kind === "back") {
      this.updateClickableNode(kind, id, (node) => {
        const label = { ...node.label };
        if (nextValue === "") {
          delete label.customText;
        } else {
          label.customText = nextValue;
        }
        return {
          ...node,
          label,
        };
      });
    }
  }

  private updateLabelVisible(kind: string, id: string, visible: boolean): void {
    if (kind === "object" || kind === "back") {
      this.updateClickableNode(kind, id, (node) => ({
        ...node,
        label: {
          ...node.label,
          visible,
        },
      }));
    }
  }

  private updateThemeLabelVisible(kind: SceneThemeClickableKind, visible: boolean): void {
    this.updateThemeClickable(kind, (themeNode) => ({
      ...themeNode,
      label: {
        ...themeNode.label,
        visible,
      },
    }));
  }

  private patchNumericField<T extends object>(node: T, fieldPath: string, delta: number): T {
    const segments = fieldPath.split(".");
    const nextNode = structuredClone(node) as Record<string, unknown>;
    let cursor: Record<string, unknown> = nextNode;
    while (segments.length > 1) {
      const segment = segments.shift();
      if (segment === undefined) {
        break;
      }
      cursor = cursor[segment] as Record<string, unknown>;
    }
    const leaf = segments[0];
    if (leaf === undefined) {
      return nextNode as T;
    }

    const currentValue = Number(cursor[leaf] ?? 0);
    cursor[leaf] = this.roundField(fieldPath, currentValue, delta);
    return nextNode as T;
  }

  private readNumericField(node: object, fieldPath: string): number {
    const segments = fieldPath.split(".");
    let cursor: unknown = node;
    for (const segment of segments) {
      if (cursor === null || cursor === undefined || typeof cursor !== "object") {
        return 0;
      }
      cursor = (cursor as Record<string, unknown>)[segment];
    }
    return Number(cursor ?? 0);
  }

  private roundField(field: string, current: number, delta: number): number {
    const next = current + delta;
    if (field.endsWith("scale")) {
      return Number(Math.max(0.2, next).toFixed(2));
    }
    if (field.endsWith("Scale")) {
      return Number(Math.max(0.2, next).toFixed(2));
    }
    if (field.endsWith("alpha") || field.endsWith("Alpha")) {
      return Number(Math.min(1, Math.max(0, next)).toFixed(2));
    }
    if (field.endsWith("Rem")) {
      return Number(Math.max(0, next).toFixed(2));
    }
    if (field.endsWith("hueDeg") || field.endsWith("HueDeg")) {
      const wrapped = ((next % 360) + 360) % 360;
      return Math.round(wrapped);
    }
    if (field.endsWith("rotateDeg") || field.endsWith("perspectiveDeg")) {
      return Number(next.toFixed(1));
    }
    return Math.round(next);
  }

  private getScaleStep(): number {
    return Math.max(0.01, this.step / 100);
  }

  private getAdjustDelta(field: string, direction: number): number {
    if (field.endsWith("scale")) {
      return direction * this.getScaleStep();
    }
    if (field.endsWith("Scale")) {
      return direction * this.getScaleStep();
    }
    if (field.endsWith("rotateDeg")) {
      return direction * (this.step / 10);
    }
    if (field.endsWith("alpha") || field.endsWith("Alpha")) {
      return direction * this.getScaleStep();
    }
    if (field.endsWith("Rem")) {
      return direction * this.getScaleStep();
    }
    if (field.endsWith("hueDeg") || field.endsWith("HueDeg")) {
      return direction * this.step;
    }
    return direction * this.step;
  }

  private shiftFontPreset(
    current: SceneLayoutLabelFontPreset,
    direction: number
  ): SceneLayoutLabelFontPreset {
    const currentIndex = SCENE_LAYOUT_LABEL_FONT_PRESETS.indexOf(current);
    const nextIndex =
      (currentIndex + direction + SCENE_LAYOUT_LABEL_FONT_PRESETS.length) %
      SCENE_LAYOUT_LABEL_FONT_PRESETS.length;
    return SCENE_LAYOUT_LABEL_FONT_PRESETS[nextIndex] ?? "display";
  }

  private shiftThemeFontPreset(
    current: SceneLayoutLabelFontPreset | null,
    direction: number
  ): SceneLayoutLabelFontPreset | null {
    const presets: Array<SceneLayoutLabelFontPreset | null> = [
      null,
      ...SCENE_LAYOUT_LABEL_FONT_PRESETS,
    ];
    const currentIndex = presets.indexOf(current);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (safeIndex + direction + presets.length) % presets.length;
    return presets[nextIndex] ?? null;
  }

  private formatFontPreset(preset: SceneLayoutLabelFontPreset): string {
    if (preset === "inscription") {
      return "Inscription";
    }
    if (preset === "classic") {
      return "Classic";
    }
    if (preset === "sans") {
      return "Sans";
    }
    if (preset === "rounded") {
      return "Rounded";
    }
    if (preset === "condensed") {
      return "Condensed";
    }
    if (preset === "mono") {
      return "Mono";
    }
    return "Display";
  }

  private formatThemeFontPreset(preset: SceneLayoutLabelFontPreset | null): string {
    if (preset === null) {
      return "Inherit";
    }
    return this.formatFontPreset(preset);
  }

  private formatSelectionSummary(
    selection: SceneLayoutEditorSelection,
    sceneObject: SceneObjectConfig | null,
    back: SceneBackConfig | null,
    character: SceneCharacterPlacementConfig | null
  ): string {
    if (sceneObject !== null) {
      return `Object · ${sceneObject.id}`;
    }
    if (back !== null) {
      return `Back · ${back.id}`;
    }
    if (character !== null) {
      return `Character · ${character.id}`;
    }
    if (selection !== null) {
      return `${this.formatSelectionKind(selection.kind)} · ${selection.id}`;
    }
    return "No item selected";
  }

  private formatSelectionKind(kind: SceneEditorNodeKind): string {
    if (kind === "object") {
      return "Object";
    }
    if (kind === "back") {
      return "Back";
    }
    return "Character";
  }

  private syncActiveAssetTargetId(
    assetTargets: SceneEditorAssetTargetDescriptor[],
    suggestedAssetTargetId: string | null
  ): void {
    if (assetTargets.length === 0) {
      this.activeAssetTargetId = null;
      return;
    }

    if (
      this.activeAssetTargetId !== null &&
      assetTargets.some((target) => target.id === this.activeAssetTargetId)
    ) {
      return;
    }

    if (
      suggestedAssetTargetId !== null &&
      assetTargets.some((target) => target.id === suggestedAssetTargetId)
    ) {
      this.activeAssetTargetId = suggestedAssetTargetId;
      return;
    }

    this.activeAssetTargetId = assetTargets[0]?.id ?? null;
  }

  private buildCapabilityContext(
    assetTargets: SceneEditorAssetTargetDescriptor[],
    activeAssetTarget: SceneEditorAssetTargetDescriptor | null
  ): SceneLayoutEditorCapabilityContext {
    const callbacks: SceneLayoutEditorCapabilityContext["callbacks"] = {};
    if (this.callbacks.detectSceneAssetTransparentWindow !== undefined) {
      callbacks.detectSceneAssetTransparentWindow =
        this.callbacks.detectSceneAssetTransparentWindow;
    }
    if (this.callbacks.clearSceneAssetTransparentWindow !== undefined) {
      callbacks.clearSceneAssetTransparentWindow = this.callbacks.clearSceneAssetTransparentWindow;
    }
    if (this.callbacks.updateSceneAssetTransparentWindow !== undefined) {
      callbacks.updateSceneAssetTransparentWindow =
        this.callbacks.updateSceneAssetTransparentWindow;
    }

    return {
      assetTargets,
      activeAssetTarget,
      callbacks,
    };
  }

  private getCapabilityContext(): SceneLayoutEditorCapabilityContext {
    const assetTargets = this.callbacks.getSceneAssetTargets?.() ?? [];
    const suggestedAssetTargetId = this.callbacks.getSuggestedSceneAssetTargetId?.() ?? null;
    this.syncActiveAssetTargetId(assetTargets, suggestedAssetTargetId);
    const activeAssetTarget =
      assetTargets.find((target) => target.id === this.activeAssetTargetId) ?? null;
    return this.buildCapabilityContext(assetTargets, activeAssetTarget);
  }

  private escapeHtml(value: string): string {
    return this.escapeAttribute(value);
  }

  private escapeAttribute(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/'/g, "&#39;");
  }

  private applyPanelPosition(panel: HTMLElement): void {
    if (this.panelPosition === null) {
      panel.style.removeProperty("left");
      panel.style.removeProperty("top");
      panel.style.removeProperty("right");
      panel.style.removeProperty("bottom");
      return;
    }

    const clampedPosition = this.clampPanelPosition(
      this.panelPosition.left,
      this.panelPosition.top,
      panel
    );
    this.panelPosition = clampedPosition;
    panel.style.left = `${clampedPosition.left}px`;
    panel.style.top = `${clampedPosition.top}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  private clampPanelPosition(
    left: number,
    top: number,
    panel: HTMLElement
  ): { left: number; top: number } {
    const maxLeft = Math.max(16, this.host.clientWidth - panel.offsetWidth - 16);
    const maxTop = Math.max(16, this.host.clientHeight - panel.offsetHeight - 16);
    return {
      left: Math.min(Math.max(16, left), maxLeft),
      top: Math.min(Math.max(16, top), maxTop),
    };
  }
}
