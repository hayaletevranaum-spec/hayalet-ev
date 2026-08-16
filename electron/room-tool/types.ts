export type PlatformKey =
  | "linux-x64"
  | "linux-arm64"
  | "linux-musl-x64"
  | "linux-musl-arm64"
  | "darwin-x64"
  | "darwin-arm64"
  | "win32-x64"
  | "win32-arm64";

export type ToolchainManifest = {
  version: number;
  roomId: string;
  tools: Record<string, ToolManifest>;
};

export type ToolAvailability = "installable" | "system-command" | "planned";

export type SystemCommandSpec = {
  executableName: string;
  companionExecutables?: string[];
  envVarNames?: string[];
  candidatePaths?: string[];
  setupHint?: string;
};

export type PythonVenvPipInstallerSpec = {
  type: "python-venv-pip";
  bootstrapExecutableNames?: string[];
  estimatedDownloadSize?: string;
  estimatedInstalledSize?: string;
  packages: string[];
  supportedPythonVersions?: string[];
  venvDir: string;
};

export type ToolInstallerSpec = PythonVenvPipInstallerSpec;

export type ToolManifest = {
  displayName: string;
  installDirName?: string;
  availability?: ToolAvailability;
  installer?: ToolInstallerSpec;
  plannedReason?: string;
  releaseProvider?: ToolReleaseProvider;
  assets?: Partial<Record<PlatformKey, ToolAssetSpec>>;
  probe?: {
    args: string[];
    versionRegex: string;
  };
  systemCommand?: SystemCommandSpec;
};

export type InstallableToolManifest = ToolManifest & {
  releaseProvider?: ToolReleaseProvider;
  assets: Partial<Record<PlatformKey, ToolAssetSpec>>;
  probe: {
    args: string[];
    versionRegex: string;
  };
};

export type SystemCommandToolManifest = ToolManifest & {
  availability: "system-command";
  systemCommand: SystemCommandSpec;
  probe: {
    args: string[];
    versionRegex: string;
  };
};

export type ResolvedPythonVenvPipInstaller = {
  manifest: ToolManifest;
  probe: NonNullable<ToolManifest["probe"]>;
  systemCommand: SystemCommandSpec;
  installer: {
    type: "python-venv-pip";
    bootstrapExecutableNames: string[];
    packages: string[];
    supportedPythonVersions: string[];
    venvDir: string;
  };
};

export type PythonBootstrapCandidate = {
  argsPrefix: string[];
  commandName: string;
  label: string;
};

export type GitHubReleaseProvider = {
  type: "github-release";
  owner: string;
  repo: string;
  releaseUrl: string;
};

export type WebPageReleaseProvider = {
  type: "web-page";
  latestPageUrl: string;
  releaseUrl: string;
  versionRegex: string;
};

export type ToolReleaseProvider = GitHubReleaseProvider | WebPageReleaseProvider;

export type ArchiveType = "tar.xz" | "tar.gz" | "zip";

export type ToolAssetSpec = {
  assetMatch: string;
  archive: "none" | ArchiveType;
  copyArchiveContents?: boolean;
  downloadUrlTemplate?: string;
  executableName: string;
  companionExecutables?: string[];
  releaseProvider?: ToolReleaseProvider;
  sourceExecutableName?: string;
};

export type GitHubReleaseAsset = {
  name: string;
  browser_download_url: string;
};

export type GitHubReleasePayload = {
  tag_name?: string;
  name?: string;
  html_url?: string;
  assets?: GitHubReleaseAsset[];
};

export const MANAGED_PYTHON_RELEASE_PROVIDER: GitHubReleaseProvider = {
  type: "github-release",
  owner: "astral-sh",
  repo: "python-build-standalone",
  releaseUrl: "https://github.com/astral-sh/python-build-standalone/releases/latest",
};

export const MANAGED_PYTHON_ASSET_TARGETS: Partial<Record<PlatformKey, string>> = {
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
  "linux-musl-x64": "x86_64-unknown-linux-musl",
  "linux-musl-arm64": "aarch64-unknown-linux-musl",
  "darwin-x64": "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
  "win32-x64": "x86_64-pc-windows-msvc",
  "win32-arm64": "aarch64-pc-windows-msvc",
};

export type ToolReleaseInfo = {
  tag: string | null;
  name: string | null;
  releaseUrl: string | null;
  asset: GitHubReleaseAsset;
};

export type PythonOutdatedPackage = {
  latestVersion: string | null;
  name: string;
  version: string | null;
};
