import { getErrorMessage } from "@shared/index.js";
import type {
  TranscriptManagedModelId,
  TranscriptManagedModelStatus,
  TranscriptRuntimeStatus,
} from "@shared/transcript.js";
import type { AppSettings } from "@shared/settings.js";
import { AppI18n } from "../../../modules/i18n/index.js";
import {
  ensureTranscriptRuntime,
  getTranscriptStatus,
  installTranscriptModel,
  listTranscriptModels,
  removeTranscriptModel,
} from "../../../modules/transcript/electron-client.js";

interface SettingsManagerLike {
  getSnapshot(): AppSettings;
}

type TranscriptPanelBusyState =
  | {
      kind: "refresh" | "ensure";
      modelId?: null;
    }
  | {
      kind: "install" | "remove";
      modelId: TranscriptManagedModelId;
    }
  | null;

type TranscriptRuntimePanelState = {
  busy: TranscriptPanelBusyState;
  error: string | null;
  loaded: boolean;
  models: TranscriptManagedModelStatus[];
  status: TranscriptRuntimeStatus | null;
};

export class CaptureTranscriptRuntimePanel {
  private readonly settingsManager: SettingsManagerLike;
  private readonly root: ParentNode;
  private readonly selectIdPrefix: string;
  private settingsSignature = "";
  private transcriptPanelState: TranscriptRuntimePanelState = {
    busy: null,
    error: null,
    loaded: false,
    models: [],
    status: null,
  };

  constructor(
    settingsManager: SettingsManagerLike,
    root: ParentNode = document,
    selectIdPrefix = "app-transcript"
  ) {
    this.settingsManager = settingsManager;
    this.root = root;
    this.selectIdPrefix = selectIdPrefix;
  }

  init(): void {
    this.setupListeners();
    this.render();
    void this.syncWithSettings({ forceRefresh: true });
  }

  render(): void {
    this.renderTranscriptRuntimePanel();
  }

  async refresh(): Promise<void> {
    await this.refreshTranscriptRuntimePanel();
  }

  async syncWithSettings(options: { forceRefresh?: boolean } = {}): Promise<void> {
    this.render();

    const nextSignature = this.getSettingsSignature();
    if (options.forceRefresh === true || this.settingsSignature !== nextSignature) {
      this.settingsSignature = nextSignature;
      await this.refreshTranscriptRuntimePanel();
    }
  }

  private setupListeners(): void {
    const ensureButton = this.getElement("runtime-ensure-btn");
    if (ensureButton instanceof HTMLElement) {
      ensureButton.onclick = (): void => {
        void this.ensureActiveTranscriptRuntime();
      };
    }

    const refreshButton = this.getElement("runtime-refresh-btn");
    if (refreshButton instanceof HTMLElement) {
      refreshButton.onclick = (): void => {
        void this.refreshTranscriptRuntimePanel();
      };
    }

    const modelsContainer = this.getElement("runtime-models");
    if (modelsContainer instanceof HTMLElement) {
      modelsContainer.addEventListener("click", (event): void => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        const button = target?.closest<HTMLElement>("[data-transcript-model-action]");
        if (!(button instanceof HTMLElement)) {
          return;
        }

        const modelId = this.normalizeTranscriptModelId(button.dataset["transcriptModelId"]);
        if (modelId === null) {
          return;
        }

        const action = button.dataset["transcriptModelAction"];
        if (action === "install") {
          void this.installTranscriptRuntimeModel(modelId);
          return;
        }
        if (action === "remove") {
          void this.removeTranscriptRuntimeModel(modelId);
        }
      });
    }
  }

  private async ensureActiveTranscriptRuntime(): Promise<void> {
    this.transcriptPanelState.busy = { kind: "ensure", modelId: null };
    this.transcriptPanelState.error = null;
    this.renderTranscriptRuntimePanel();

    try {
      const status = await ensureTranscriptRuntime();
      const models = await listTranscriptModels();
      this.transcriptPanelState = {
        busy: null,
        error: null,
        loaded: true,
        models,
        status,
      };
    } catch (error) {
      this.transcriptPanelState.busy = null;
      this.transcriptPanelState.loaded = true;
      this.transcriptPanelState.error = getErrorMessage(error);
    }

    this.renderTranscriptRuntimePanel();
  }

  private async refreshTranscriptRuntimePanel(): Promise<void> {
    this.transcriptPanelState.busy = { kind: "refresh", modelId: null };
    this.transcriptPanelState.error = null;
    this.renderTranscriptRuntimePanel();

    try {
      const [status, models] = await Promise.all([getTranscriptStatus(), listTranscriptModels()]);
      this.transcriptPanelState = {
        busy: null,
        error: null,
        loaded: true,
        models,
        status,
      };
    } catch (error) {
      this.transcriptPanelState.busy = null;
      this.transcriptPanelState.loaded = true;
      this.transcriptPanelState.error = getErrorMessage(error);
    }

    this.renderTranscriptRuntimePanel();
  }

  private async installTranscriptRuntimeModel(modelId: TranscriptManagedModelId): Promise<void> {
    this.transcriptPanelState.busy = { kind: "install", modelId };
    this.transcriptPanelState.error = null;
    this.renderTranscriptRuntimePanel();

    try {
      const result = await installTranscriptModel(modelId);
      if (result === null) {
        throw new Error("Transcript runtime bridge is unavailable.");
      }
      await this.refreshTranscriptRuntimePanel();
    } catch (error) {
      this.transcriptPanelState.busy = null;
      this.transcriptPanelState.error = getErrorMessage(error);
      this.renderTranscriptRuntimePanel();
    }
  }

  private async removeTranscriptRuntimeModel(modelId: TranscriptManagedModelId): Promise<void> {
    this.transcriptPanelState.busy = { kind: "remove", modelId };
    this.transcriptPanelState.error = null;
    this.renderTranscriptRuntimePanel();

    try {
      const result = await removeTranscriptModel(modelId);
      if (result === null) {
        throw new Error("Transcript runtime bridge is unavailable.");
      }
      await this.refreshTranscriptRuntimePanel();
    } catch (error) {
      this.transcriptPanelState.busy = null;
      this.transcriptPanelState.error = getErrorMessage(error);
      this.renderTranscriptRuntimePanel();
    }
  }

  private renderTranscriptRuntimePanel(): void {
    const labelEl = this.getElement("runtime-label");
    const statusLabelEl = this.getElement("runtime-status-label");
    const statusValueEl = this.getElement("runtime-status-value");
    const activeLanguageLabelEl = this.getElement("runtime-active-language-label");
    const activeLanguageEl = this.getElement("runtime-active-language");
    const activeModelLabelEl = this.getElement("runtime-active-model-label");
    const activeModelEl = this.getElement("runtime-active-model");
    const hintEl = this.getElement("runtime-hint");
    const feedbackEl = this.getElement("runtime-feedback");
    const ensureBtn = this.getElement("runtime-ensure-btn") as HTMLButtonElement | null;
    const refreshBtn = this.getElement("runtime-refresh-btn") as HTMLButtonElement | null;
    const modelsEl = this.getElement("runtime-models");

    if (labelEl) {
      labelEl.textContent = AppI18n.t("entrance.user.transcriptRuntime.label");
    }
    if (statusLabelEl) {
      statusLabelEl.textContent = AppI18n.t("entrance.user.transcriptRuntime.statusLabel");
    }
    if (activeLanguageLabelEl) {
      activeLanguageLabelEl.textContent = AppI18n.t(
        "entrance.user.transcriptRuntime.activeLanguageLabel"
      );
    }
    if (activeModelLabelEl) {
      activeModelLabelEl.textContent = AppI18n.t(
        "entrance.user.transcriptRuntime.activeModelLabel"
      );
    }
    if (hintEl) {
      hintEl.textContent = AppI18n.t("entrance.user.transcriptRuntime.hint");
    }

    const status = this.transcriptPanelState.status;
    const activeModel =
      status === null
        ? null
        : (this.transcriptPanelState.models.find((entry) => entry.modelId === status.modelId) ??
          null);
    const statusKey = status?.state ?? "missing-runtime";
    const activeLanguage = status?.activeLanguage ?? "tr";

    if (statusValueEl) {
      statusValueEl.textContent = AppI18n.t(`entrance.user.transcriptRuntime.states.${statusKey}`);
    }
    if (activeLanguageEl) {
      activeLanguageEl.textContent = AppI18n.t(
        `entrance.user.transcriptRuntime.languages.${activeLanguage}`
      );
    }
    if (activeModelEl) {
      activeModelEl.textContent = activeModel
        ? this.getTranscriptRuntimeModelTitle(activeModel)
        : (status?.modelId ?? "--");
    }
    this.setCaptureSummary(
      statusKey,
      activeModel ? this.getTranscriptRuntimeModelTitle(activeModel) : (status?.message ?? "")
    );

    if (ensureBtn) {
      ensureBtn.textContent = AppI18n.t("entrance.user.transcriptRuntime.actions.prepare");
      ensureBtn.disabled = this.transcriptPanelState.busy !== null;
    }
    if (refreshBtn) {
      refreshBtn.textContent = AppI18n.t("entrance.user.transcriptRuntime.actions.refresh");
      refreshBtn.disabled = this.transcriptPanelState.busy !== null;
    }

    if (feedbackEl) {
      if (this.transcriptPanelState.error !== null) {
        feedbackEl.textContent = this.transcriptPanelState.error;
      } else if (this.transcriptPanelState.loaded !== true) {
        feedbackEl.textContent = AppI18n.t("entrance.user.transcriptRuntime.loading");
      } else {
        feedbackEl.textContent = status?.message ?? "";
      }
    }

    if (modelsEl) {
      if (this.transcriptPanelState.models.length === 0) {
        modelsEl.innerHTML = `
          <div class="user-profile-inline__runtime-model">
            <div class="user-profile-inline__runtime-status-text">${this.escapeHtml(
              AppI18n.t("entrance.user.transcriptRuntime.empty")
            )}</div>
          </div>
        `;
      } else {
        modelsEl.innerHTML = this.transcriptPanelState.models
          .map((model) => this.renderTranscriptRuntimeModelCard(model, status))
          .join("");
      }
    }
  }

  private renderTranscriptRuntimeModelCard(
    model: TranscriptManagedModelStatus,
    status: TranscriptRuntimeStatus | null
  ): string {
    const isActive = status?.modelId === model.modelId;
    const busyState = this.transcriptPanelState.busy;
    const isBusyForModel =
      busyState !== null &&
      (busyState.kind === "install" || busyState.kind === "remove") &&
      busyState.modelId === model.modelId;
    const canRemove = model.ready === true && isActive !== true;
    const action =
      canRemove === true
        ? "remove"
        : model.installed === true && model.ready !== true
          ? "install"
          : model.installed === true
            ? null
            : "install";
    const actionLabel =
      canRemove === true
        ? AppI18n.t("entrance.user.transcriptRuntime.actions.remove")
        : model.installed === true && model.ready !== true
          ? AppI18n.t("entrance.user.transcriptRuntime.actions.repair")
          : model.installed === true
            ? AppI18n.t("entrance.user.transcriptRuntime.actions.active")
            : AppI18n.t("entrance.user.transcriptRuntime.actions.install");
    const footerStatus = model.ready
      ? AppI18n.t("entrance.user.transcriptRuntime.states.ready")
      : model.installed
        ? AppI18n.t("entrance.user.transcriptRuntime.actions.repair")
        : AppI18n.t("entrance.user.transcriptRuntime.states.missing-runtime");

    return `
      <article class="user-profile-inline__runtime-model" data-active="${isActive ? "true" : "false"}">
        <div class="user-profile-inline__runtime-model-head">
          <div class="user-profile-inline__runtime-model-title">
            <strong>${this.escapeHtml(this.getTranscriptRuntimeModelTitle(model))}</strong>
            <span class="user-profile-inline__runtime-model-meta">${this.escapeHtml(
              this.getTranscriptRuntimeModelMeta(model)
            )}</span>
          </div>
          ${
            isActive
              ? `<span class="user-profile-inline__runtime-badge">${this.escapeHtml(
                  AppI18n.t("entrance.user.transcriptRuntime.actions.active")
                )}</span>`
              : ""
          }
        </div>
        <div class="user-profile-inline__runtime-model-footer">
          <span class="user-profile-inline__runtime-status-text">${this.escapeHtml(
            model.lastError ?? footerStatus
          )}</span>
          <button
            class="btn btn-secondary btn-sm"
            type="button"
            data-transcript-model-action="${action ?? ""}"
            data-transcript-model-id="${this.escapeHtml(model.modelId)}"
            ${action === null || this.transcriptPanelState.busy !== null || isBusyForModel ? "disabled" : ""}
          >
            ${this.escapeHtml(actionLabel)}
          </button>
        </div>
      </article>
    `;
  }

  private getTranscriptRuntimeModelTitle(model: TranscriptManagedModelStatus): string {
    const backendLabel = AppI18n.t(
      `entrance.user.transcriptRuntime.backends.${model.backend === "vosk" ? "vosk" : "whisper"}`
    );
    const languageLabel = AppI18n.t(`entrance.user.transcriptRuntime.languages.${model.locale}`);
    const variantLabel = AppI18n.t(
      `entrance.user.transcriptProfile.options.${model.variant === "light" ? "light" : "full"}`
    );
    return `${backendLabel} · ${languageLabel} · ${variantLabel}`;
  }

  private getTranscriptRuntimeModelMeta(model: TranscriptManagedModelStatus): string {
    const familyLabel = AppI18n.t(`entrance.user.transcriptRuntime.families.${model.family}`);
    return `${model.modelId} · ${familyLabel}`;
  }

  private normalizeTranscriptModelId(value: string | undefined): TranscriptManagedModelId | null {
    switch (value) {
      case undefined:
        return null;
      case "tiny":
      case "base":
      case "tiny.en":
      case "base.en":
      case "vosk-small-tr":
      case "vosk-small-en":
      case "vosk-full-en":
        return value;
      default:
        return null;
    }
  }

  private getElement(suffix: string): HTMLElement | null {
    return this.root.querySelector<HTMLElement>(`#${this.selectIdPrefix}-${suffix}`);
  }

  private setCaptureSummary(statusKey: string, note: string): void {
    const card = this.root.querySelector<HTMLElement>('[data-capture-summary="runtime"]');
    const valueEl = this.root.querySelector<HTMLElement>("#capture-summary-runtime");
    const noteEl = this.root.querySelector<HTMLElement>("#capture-summary-runtime-note");
    const state =
      statusKey === "ready"
        ? "ready"
        : this.transcriptPanelState.busy !== null
          ? "running"
          : this.transcriptPanelState.error !== null
            ? "blocked"
            : "warning";
    if (card) {
      card.dataset["state"] = state;
    }
    if (valueEl) {
      valueEl.textContent = AppI18n.t(`entrance.user.transcriptRuntime.states.${statusKey}`);
    }
    if (noteEl) {
      noteEl.textContent = note;
    }
  }

  private getSettingsSignature(): string {
    const settings = this.settingsManager.getSnapshot();
    return JSON.stringify({
      language: settings.general?.language ?? "tr",
      transcriptBackend: settings.general?.transcriptBackend ?? "whisper.cpp",
      transcriptModelVariant: settings.general?.transcriptModelVariant ?? "full",
    });
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
}
