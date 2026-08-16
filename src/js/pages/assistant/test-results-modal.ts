import { LogCategory } from "@shared/logging-core";
import type { ProviderTestSuite } from "@shared/provider.js";
import { AppI18n } from "../../modules/i18n/index.js";
import { Logger } from "../../modules/logger/index.js";
import {
  buildProviderTestResultsModalTitle,
  generateProviderTestResultsHTML,
} from "../shared/provider-test-presentation.js";

export async function openTestResultsModal(results: ProviderTestSuite): Promise<void> {
  const module = await import("../../ui/modal-manager.js");
  const { ModalManager: modalManager } = module;
  const content = generateProviderTestResultsHTML(results);

  modalManager.open({
    title: buildProviderTestResultsModalTitle(results),
    content,
    size: "large",
    buttons: [
      {
        text: AppI18n.t("providerTest.modal.copyJsonButton"),
        class: "btn-ghost",
        onClick: (): void => {
          void navigator.clipboard.writeText(JSON.stringify(results, null, 2));
          Logger.info(LogCategory.ASSISTANT_CORE, AppI18n.t("providerTest.modal.copiedLog"));
        },
      },
      {
        text: AppI18n.t("providerTest.modal.closeButton"),
        class: "btn-primary",
        onClick: (): void => {
          modalManager.close();
        },
      },
    ],
  });
}
