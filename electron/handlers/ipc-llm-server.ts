import { registerHandler } from "./ipc-helpers.ts";
import { llmServerManager } from "../llm-server-manager.ts";

export function setupLlmServerHandlers(): void {
  registerHandler("llm-serve-start", async (_event, payload?: { slot?: string; port?: number }) => {
    const port = typeof payload?.port === "number" ? payload.port : undefined;
    return await llmServerManager.start(payload?.slot, port);
  });

  registerHandler(
    "llm-serve-stop",
    async (_event, payload?: { slot?: string; force?: boolean }) => {
      return await llmServerManager.stop(payload?.slot, { force: payload?.force === true });
    }
  );

  registerHandler("llm-serve-status", () => {
    return llmServerManager.getStatus();
  });
}
