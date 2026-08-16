export interface SystemActiveServerStatus {
  running: boolean;
  port?: number;
}

export async function detectSystemActiveServerStatus(): Promise<SystemActiveServerStatus> {
  const electronApi = window.electronAPI;
  if (electronApi === undefined) {
    return { running: false };
  }

  try {
    const opencodeServeStatus = electronApi["opencodeServeStatus"] as
      (() => Promise<SystemActiveServerStatus>) | undefined;
    if (typeof opencodeServeStatus === "function") {
      const status = await opencodeServeStatus();
      if (status.running === true) {
        return {
          running: true,
          ...(typeof status.port === "number" ? { port: status.port } : {}),
        };
      }
    }
  } catch {
    // NOTE: Intentionally ignored.
  }

  try {
    const opencodeServeFindRunning = electronApi["opencodeServeFindRunning"] as
      (() => Promise<SystemActiveServerStatus>) | undefined;
    if (typeof opencodeServeFindRunning === "function") {
      const status = await opencodeServeFindRunning();
      if (status.running === true) {
        return {
          running: true,
          ...(typeof status.port === "number" ? { port: status.port } : {}),
        };
      }
    }
  } catch {
    // NOTE: Intentionally ignored.
  }

  return {
    running: false,
  };
}
