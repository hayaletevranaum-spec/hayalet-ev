export interface PathConfig {
  projectRoot: string;
  dataDir: string;
  configDir: string;
  logsDir: string;
  commandsDir: string;
  assetsDir: string;
  isPackaged: boolean;
}

export interface PathResolver {
  getProjectRoot(): string;
  getDataDir(): string;
  getConfigDir(): string;
  getLogsDir(): string;
  getMainAppLogsDir(): string;
  getCommandsDir(): string;
  getAssetsDir(): string;
  getRoomsWorkspaceDir(): string;
  getBundledRoomsDir(): string;
  getGeneratedRoomsDir(): string;
  getRoomRuntimeBuildDir(roomId: string): string;
  getInstalledRoomsDir(): string;
  getInstalledSceneThemesDir(): string;
  getRoomStorageDir(roomId: string): string;
  getRoomPartitionsRoot(): string;
  getRoomPartitionDir(roomId: string): string;
  getRoomRuntimeResiduePolicy(): {
    readonly cleanupTrigger: "deleteData";
    readonly ownsPackageContent: false;
    readonly preserveByDefault: true;
  };
  getRoomsRegistryPath(): string;
  getInstalledRoomDir(roomId: string): string;
  getInstalledSceneThemeDir(themeId: string): string;

  getAccountDir(accountId: string): string;
  getAccountDbPath(accountId: string): string;
  getAccountMailSidecarDbPath(accountId: string): string;
  getWhispersPath(): string;

  getPreloadPath(filename: string): string;
  getPreloadFileUrl(filename: string): string;
  getIconPath(): string;
  getHtmlEntryPath(): string;

  getProviderConfigPath(providerId: string): string;

  getProtocolsPath(): string;

  isPackaged(): boolean;
  sanitizeAccountId(accountId: string): string;
}
