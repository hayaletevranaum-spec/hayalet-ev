type GhostProvider = "opencode";

type GhostLaunchTarget = {
  provider: GhostProvider;
  targetUrl: string;
  details: string;
};

type GhostProviderServerState = {
  provider: GhostProvider;
  running: boolean;
  port?: number;
  url?: string;
  alreadyRunning?: boolean;
  source?: "existing" | "started";
};

type GhostExitAction = "close" | "return-main";

interface GhostElectronAPI {
  ghostServerStatus?: () => Promise<{
    success: boolean;
    server?: GhostProviderServerState;
    error?: string;
  }>;
  ghostServerConnect?: (payload: { autoStart?: boolean }) => Promise<{
    success: boolean;
    target?: GhostLaunchTarget;
    server?: GhostProviderServerState;
    error?: string;
  }>;
  ghostServerStop?: () => Promise<{
    success: boolean;
    server?: GhostProviderServerState;
    error?: string;
  }>;
  ghostOpenTarget: (target: GhostLaunchTarget) => Promise<{ success: boolean; error?: string }>;
  ghostExitAction: (action: GhostExitAction) => Promise<{ success: boolean; error?: string }>;
  showOpenDialog?: (options: Electron.OpenDialogOptions) => Promise<Electron.OpenDialogReturnValue>;
  fmTempPath?: (
    prefix: string,
    ext: string
  ) => Promise<{ success: boolean; path?: string; message?: string }>;
  fmWriteFileAtomic?: (payload: {
    path: string;
    data: string;
    encoding?: "utf-8" | "base64";
  }) => Promise<{ success: boolean; message?: string }>;
  ghostLog?: (payload: {
    level: "debug" | "info" | "warn" | "error";
    message: string;
    context?: Record<string, unknown>;
  }) => Promise<{ success: boolean; error?: string }>;
  sendToHost?: (channel: string, data: unknown) => void;
}

declare global {
  interface Window {
    electronAPI?: GhostElectronAPI;
  }
}

export {};
