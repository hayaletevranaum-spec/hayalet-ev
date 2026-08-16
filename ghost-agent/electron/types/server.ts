/**
 * Server Manager Type Definitions (Ghost-Agent)
 *
 * @module ghost-agent/electron/types/server
 */

export interface ServerOptions {
  port?: number;
  cors?: string[];
}

export interface ServerInfo {
  running: boolean;
  port?: number;
  url?: string;
  pid?: number;
  startTime?: number;
  /** Mevcut çalışan sunucuya bağlanıldıysa true */
  alreadyRunning?: boolean;
  /** Sunucunun kaynağı: harici mevcut süreç veya bu oturumda başlatılan süreç */
  source?: "existing" | "started";
}
