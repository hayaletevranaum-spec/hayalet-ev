export interface ServerOptions {
  port?: number;
  cors?: string[];
}

export interface ServerInfo {
  running: boolean;
  port?: number;
  url?: string;
  workspacePath?: string;
  pid?: number;
  startTime?: number;
  alreadyRunning?: boolean;
  source?: "existing" | "started";
}

export interface ServerBinaryInfo {
  available: boolean;
  command: string;
  version?: string;
  resolvedPath?: string;
  error?: string;
}
