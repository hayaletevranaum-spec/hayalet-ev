import { bootstrapExternalToolPage } from "../shared/bootstrap-external-tool-page.js";
import { ArchivesPageController } from "./controller.js";

async function bootstrapArchivesPage(): Promise<void> {
  await bootstrapExternalToolPage({
    initializeRooms: true,
  });

  const controller = new ArchivesPageController();
  await controller.init();
  await controller.open();
}

void bootstrapArchivesPage();
