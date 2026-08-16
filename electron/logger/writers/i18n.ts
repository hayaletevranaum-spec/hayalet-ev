import { translateElectronMessage } from "../../i18n/language-service.ts";

export async function loggerWriterT(
  key: string,
  params?: Record<string, string | number>
): Promise<string> {
  return await translateElectronMessage(`electron.logger.logs.${key}`, params);
}
