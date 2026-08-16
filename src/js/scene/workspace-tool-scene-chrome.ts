import { applyShellStaticTranslations } from "../app/shell-i18n.js";
import { mountSceneWindowControls } from "./window-controls.js";

const CHROME_SELECTOR = "[data-workspace-tool-scene-chrome='true']";
const BACK_BUTTON_SELECTOR = "[data-workspace-tool-scene-back='true']";

function buildBackButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className =
    "scene-clickable__button scene-clickable__button--back workspace-tool-scene-chrome__back";
  button.dataset["workspaceToolSceneBack"] = "true";
  button.dataset["frameVariant"] = "flat";
  button.setAttribute("data-shell-i18n-title", "settingsHub.scene.returnRoom");
  button.setAttribute("data-shell-i18n-aria-label", "settingsHub.scene.returnRoom");

  const arrow = document.createElement("span");
  arrow.className = "scene-clickable__arrow";
  arrow.ariaHidden = "true";
  arrow.textContent = "←";

  const label = document.createElement("span");
  label.className = "scene-clickable__label scene-clickable__label--back";
  label.ariaHidden = "true";
  label.setAttribute("data-shell-i18n-text", "settingsHub.scene.returnRoom");

  button.append(arrow, label);
  return button;
}

export function mountWorkspaceToolSceneChrome(options: {
  root: HTMLElement;
  onBack: () => void;
}): void {
  const { root, onBack } = options;

  let chrome = root.querySelector<HTMLElement>(CHROME_SELECTOR);
  if (!(chrome instanceof HTMLElement)) {
    chrome = document.createElement("div");
    chrome.className = "workspace-tool-scene-chrome scene-shell__surface";
    chrome.dataset["workspaceToolSceneChrome"] = "true";
    root.insertAdjacentElement("afterbegin", chrome);
  }

  mountSceneWindowControls(root);

  let backButton = chrome.querySelector<HTMLButtonElement>(BACK_BUTTON_SELECTOR);
  if (!(backButton instanceof HTMLButtonElement)) {
    backButton = buildBackButton();
    chrome.append(backButton);
  }

  if (backButton.dataset["workspaceToolSceneBackBound"] !== "true") {
    backButton.addEventListener("click", () => {
      onBack();
    });
    backButton.dataset["workspaceToolSceneBackBound"] = "true";
  }

  applyShellStaticTranslations(chrome);
}
