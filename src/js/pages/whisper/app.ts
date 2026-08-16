import { SettingsManager } from "../../modules/settings-manager.js";
import { WhisperManager } from "../../modules/whisper-manager.js";
import { bootstrapExternalToolPage } from "../shared/bootstrap-external-tool-page.js";
import { navigateMainShellPage, resolveExternalReturnPage } from "../shared/external-page.js";
import { WhisperDockController } from "./controller.js";
import { applyWhisperStaticTranslations } from "./i18n.js";

// NOTE: The whisper page edits deferred account whispers and does not manage speech transcription runtime state.
async function bootstrapWhisperPage(): Promise<void> {
  await bootstrapExternalToolPage({
    applyStaticTranslations: () => {
      applyWhisperStaticTranslations();
    },
  });

  await WhisperManager.init({
    settings: SettingsManager.getSnapshot(),
  });

  const closeButton = document.getElementById("whisper-page-close") as HTMLButtonElement | null;
  closeButton?.addEventListener("click", () => {
    navigateMainShellPage(resolveExternalReturnPage());
  });

  const controller = new WhisperDockController();
  controller.init();
  controller.setExpanded(true);
  await controller.render();

  window.requestAnimationFrame(() => {
    const addTextInput = document.getElementById("whisper-add-text");
    if (addTextInput instanceof HTMLTextAreaElement) {
      addTextInput.focus();
    }
  });
}

void bootstrapWhisperPage();
