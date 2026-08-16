import type { RepairUiState } from "../../shared/ui/state.js";

type TextFn = (path: string[], fallback: string) => string;

type RepairSettingsButtonDataset = Record<string, string>;

function createSettingsSection(
  documentRef: Document,
  title: string,
  subtitle: string
): HTMLElement {
  const section = documentRef.createElement("section");
  section.className = "repair-settings-section";

  const header = documentRef.createElement("div");
  header.className = "repair-settings-section__header";

  const titleEl = documentRef.createElement("h3");
  titleEl.className = "repair-settings-section__title";
  titleEl.textContent = title;
  header.append(titleEl);

  const subtitleEl = documentRef.createElement("p");
  subtitleEl.className = "repair-settings-section__subtitle";
  subtitleEl.textContent = subtitle;
  header.append(subtitleEl);

  section.append(header);
  return section;
}

function createButtonGroup(
  documentRef: Document,
  label: string
): { group: HTMLElement; buttons: HTMLElement } {
  const group = documentRef.createElement("div");
  group.className = "repair-settings-group";

  const labelEl = documentRef.createElement("span");
  labelEl.className = "repair-settings-group__label";
  labelEl.textContent = label;
  group.append(labelEl);

  const buttons = documentRef.createElement("div");
  buttons.className = "repair-settings-group__buttons";
  buttons.dataset["repairSettingsButtons"] = label;
  group.append(buttons);

  return { group, buttons };
}

function appendSettingsButton(
  documentRef: Document,
  parent: HTMLElement,
  options: {
    label: string;
    title: string;
    action: string;
    active?: boolean;
    dataset: RepairSettingsButtonDataset;
  }
): void {
  const button = documentRef.createElement("button");
  button.type = "button";
  button.className = `repair-settings-button${
    options.active === true ? " repair-settings-button--active" : ""
  }`;
  button.textContent = options.label;
  button.title = options.title;
  button.dataset["repairAction"] = options.action;
  Object.entries(options.dataset).forEach(([key, value]) => {
    button.dataset[key] = value;
  });
  parent.append(button);
}

export function renderRepairSettingsPanelBody(
  documentRef: Document,
  state: RepairUiState,
  text: TextFn
): HTMLElement {
  const body = documentRef.createElement("div");
  body.className = "repair-panel__body repair-settings-panel";

  const voice = state.layout.voiceGuidance;
  const settings = state.layout.interactionSettings;
  const handsFreeEnabled = voice.handsBusyMode && voice.ambientListeningState === "listening";

  const handsFree = createSettingsSection(
    documentRef,
    text(["settings", "handsFreeTitle"], "Hands-free repair"),
    text(
      ["settings", "handsFreeSubtitle"],
      "Choose how the assistant listens, speaks, and handles voice notes while your hands are busy."
    )
  );

  const handsGroup = createButtonGroup(documentRef, text(["settings", "mode"], "Stance"));
  appendSettingsButton(documentRef, handsGroup.buttons, {
    label: text(["settings", "handsFree"], "Guide me"),
    title: handsFreeEnabled
      ? "Return to manual repair controls"
      : "Enable hands-free listening and step guidance",
    action: "set-voice-guidance",
    active: handsFreeEnabled,
    dataset: {
      handsBusyMode: handsFreeEnabled ? "false" : "true",
      ambientListeningState: handsFreeEnabled ? "idle" : "listening",
      spokenGuidanceMode: handsFreeEnabled ? voice.spokenGuidanceMode : "step-by-step",
    },
  });
  appendSettingsButton(documentRef, handsGroup.buttons, {
    label: text(["settings", "readReplies"], "Read replies aloud"),
    title: settings.autoReadAiReplies
      ? "Disable automatic Assistant AI reply reading"
      : "Read Assistant AI replies aloud",
    action: "set-interaction-settings",
    active: settings.autoReadAiReplies,
    dataset: { autoReadAiReplies: String(!settings.autoReadAiReplies) },
  });
  handsFree.append(handsGroup.group);

  const ambientGroup = createButtonGroup(documentRef, text(["settings", "ambient"], "Ambient"));
  (["idle", "listening", "muted"] as const).forEach((ambientListeningState) => {
    appendSettingsButton(documentRef, ambientGroup.buttons, {
      label:
        ambientListeningState === "idle"
          ? text(["settings", "ambientIdle"], "Standby")
          : ambientListeningState === "listening"
            ? text(["settings", "ambientListening"], "Short listen")
            : text(["settings", "ambientMuted"], "Muted"),
      title:
        ambientListeningState === "idle"
          ? "Keep the assistant ready but not listening"
          : ambientListeningState === "listening"
            ? "Listen for short repair commands"
            : "Mute ambient command listening",
      action: "set-voice-guidance",
      active: voice.ambientListeningState === ambientListeningState,
      dataset: {
        ambientListeningState,
        spokenGuidanceMode: voice.spokenGuidanceMode,
        handsBusyMode: String(voice.handsBusyMode),
      },
    });
  });
  handsFree.append(ambientGroup.group);

  const spokenGroup = createButtonGroup(documentRef, text(["settings", "spoken"], "Read aloud"));
  (["silent", "brief", "step-by-step"] as const).forEach((spokenGuidanceMode) => {
    appendSettingsButton(documentRef, spokenGroup.buttons, {
      label:
        spokenGuidanceMode === "silent"
          ? text(["settings", "spokenSilent"], "Silent")
          : spokenGuidanceMode === "brief"
            ? text(["settings", "spokenBrief"], "Brief")
            : text(["settings", "spokenStep"], "Step-by-step"),
      title:
        spokenGuidanceMode === "silent"
          ? "Do not read guidance aloud"
          : spokenGuidanceMode === "brief"
            ? "Read only short guidance prompts"
            : "Read each guided repair step aloud",
      action: "set-voice-guidance",
      active: voice.spokenGuidanceMode === spokenGuidanceMode,
      dataset: {
        ambientListeningState: voice.ambientListeningState,
        spokenGuidanceMode,
        handsBusyMode: String(voice.handsBusyMode),
      },
    });
  });
  handsFree.append(spokenGroup.group);

  const submitGroup = createButtonGroup(
    documentRef,
    text(["settings", "dictationSubmit"], "Voice notes")
  );
  (["composer", "send"] as const).forEach((dictationSubmitMode) => {
    appendSettingsButton(documentRef, submitGroup.buttons, {
      label:
        dictationSubmitMode === "composer"
          ? text(["settings", "dictationComposer"], "Review first")
          : text(["settings", "dictationSend"], "Send after voice"),
      title:
        dictationSubmitMode === "composer"
          ? "Place dictated text in the composer"
          : "Send dictated text to Assistant AI when accepted",
      action: "set-interaction-settings",
      active: settings.dictationSubmitMode === dictationSubmitMode,
      dataset: { dictationSubmitMode },
    });
  });
  handsFree.append(submitGroup.group);
  body.append(handsFree);

  return body;
}
