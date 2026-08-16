export enum ConnectButtonState {
  IDLE = "idle",
  STARTING = "starting",
  CANCEL_CONNECTING = "cancel_connecting",
  CONNECTED = "connected",
  STOPPING = "stopping",
  ERROR = "error",
  SUCCESS_START = "success_start",
  SUCCESS_STOP = "success_stop",
}

export interface ButtonStateConfig {
  text: string;
  classes: string[];
  disabled: boolean;
}

export interface WebviewElement extends HTMLElement {
  src?: string;
  getWebContentsId?: () => number;
  getURL?: () => string;
  openDevTools?: () => void;
  executeJavaScript?: (script: string) => Promise<unknown>;
}

export interface SlotStateInfo {
  state?: string;
  accountId?: string | null;
  currentUrl?: string;
  providerId?: string | null;
  urlExcluded?: boolean;
  error?: string;
}

export interface ServerResult {
  success: boolean;
  url?: string;
  error?: string;
  alreadyRunning?: boolean;
  existingServer?: boolean;
  workspaceId?: string;
}

export interface AssistantTrafficState {
  state?: {
    status?: {
      loading?: string;
      thinking?: string;
      send?: string;
    };
  };
}

export interface ServerStatus {
  running: boolean;
  port?: number;
}

// NOTE: To add a provider, create an adapter under src/js/pages/assistant,
// NOTE: implement AssistantProviderAdapter, and register it in provider-registry.ts.
export interface AssistantProviderAdapter {
  readonly id: string;
  readonly name: string;
  startServer(portSelection?: string): Promise<ServerResult>;
  stopServer(): Promise<ServerResult>;
  waitForReady(url: string, timeoutMs?: number, signal?: AbortSignal): Promise<boolean>;
  getServerStatus(): ServerStatus;
  setRunning(value: boolean): void;
}
