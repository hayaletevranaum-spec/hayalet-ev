import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = process.cwd();
const packageJsonPath = join(projectRoot, "package.json");
const roomPackageManagerPath = join(projectRoot, "electron", "room-package-manager.ts");
const installedRoomBuilderPath = join(
  projectRoot,
  "electron",
  "rooms",
  "installed-room-builder.ts"
);
const roomBundleOperationsPath = join(
  projectRoot,
  "electron",
  "rooms",
  "room-bundle-operations.ts"
);
const roomPackageTypesPath = join(projectRoot, "electron", "rooms", "room-package-types.ts");
const roomRegistryPath = join(projectRoot, "electron", "rooms", "room-registry.ts");
const rendererRoomRegistryPath = join(
  projectRoot,
  "src",
  "js",
  "modules",
  "rooms",
  "room-registry.ts"
);
const appIndexPath = join(projectRoot, "src", "js", "app", "index.ts");
const externalBootstrapPath = join(
  projectRoot,
  "src",
  "js",
  "pages",
  "shared",
  "bootstrap-external-tool-page.ts"
);
const mainPath = join(projectRoot, "electron", "main.ts");
const workspaceRoomOperationsPath = join(
  projectRoot,
  "electron",
  "rooms",
  "workspace-room-operations.ts"
);
const workspaceDiscoveryPath = join(projectRoot, "electron", "rooms", "workspace-discovery.ts");
const workspaceRoomBuildPath = join(projectRoot, "electron", "rooms", "workspace-room-build.ts");
const workspaceRoomBuildSupportPath = join(
  projectRoot,
  "electron",
  "rooms",
  "workspace-room-build-support.ts"
);
const packagedWorkspaceSeedPath = join(projectRoot, "electron", "packaged-workspace-seed.ts");
const ipcRoomsPath = join(projectRoot, "electron", "handlers", "ipc-rooms.ts");
const afterPackScriptPath = join(projectRoot, "scripts", "electron-builder-after-pack.mjs");
const pathsPath = join(projectRoot, "electron", "paths.ts");
const eslintConfigPath = join(projectRoot, "eslint.config.cjs");

void test("room package manager resolves Paths lazily instead of constructor time", async () => {
  const source = await readFile(roomPackageManagerPath, "utf8");

  assert.match(source, /private getWorkspaceRoot\(\): string/);
  assert.match(source, /private getRuntimeBuildRoot\(\): string/);
  assert.match(source, /private getDataRoot\(\): string/);
  assert.match(source, /private getRoomRuntimeBuildDir\(roomId: string\): string/);
  assert.match(source, /private getRegistryPath\(\): string/);
  assert.match(source, /export function getRoomPackageManager\(\): RoomPackageManager/);
  assert.doesNotMatch(source, /export const roomPackageManager = new RoomPackageManager\(\)/);

  const constructorMatch = source.match(
    /constructor\(options: RoomManagerOptions = \{\}\) \{([\s\S]*?)\n {2}\}/
  );
  assert.ok(constructorMatch, "constructor should exist");
  assert.doesNotMatch(
    constructorMatch[1] ?? "",
    /Paths\.get(ProjectRoot|GeneratedRoomsDir|DataDir|RoomsRegistryPath)/
  );
});

void test("ipc room handlers resolve the room package manager at handler execution time", async () => {
  const source = await readFile(ipcRoomsPath, "utf8");

  assert.match(source, /import \{ getRoomPackageManager \} from "\.\.\/room-package-manager\.ts"/);
  assert.doesNotMatch(
    source,
    /import \{ roomPackageManager \} from "\.\.\/room-package-manager\.ts"/
  );
  assert.match(source, /const roomPackageManager = getRoomPackageManager\(\);/);
  assert.match(source, /registerHandler\("rooms-sync-linked-startup", async \(\) => \{/);
});

void test("room package manager keeps installed room record building in a dedicated builder module", async () => {
  const packageJsonSource = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonSource) as {
    scripts?: Record<string, string>;
  };
  const scripts = packageJson.scripts ?? {};
  const managerSource = await readFile(roomPackageManagerPath, "utf8");
  const builderSource = await readFile(installedRoomBuilderPath, "utf8");
  const bundleOperationsSource = await readFile(roomBundleOperationsPath, "utf8");
  const roomPackageTypesSource = await readFile(roomPackageTypesPath, "utf8");
  const registrySource = await readFile(roomRegistryPath, "utf8");
  const rendererRegistrySource = await readFile(rendererRoomRegistryPath, "utf8");
  const appIndexSource = await readFile(appIndexPath, "utf8");
  const externalBootstrapSource = await readFile(externalBootstrapPath, "utf8");
  const workspaceRoomOperationsSource = await readFile(workspaceRoomOperationsPath, "utf8");
  const workspaceDiscoverySource = await readFile(workspaceDiscoveryPath, "utf8");
  const workspaceRoomBuildSource = await readFile(workspaceRoomBuildPath, "utf8");
  const workspaceRoomBuildSupportSource = await readFile(workspaceRoomBuildSupportPath, "utf8");
  const eslintConfigSource = await readFile(eslintConfigPath, "utf8");

  assert.match(managerSource, /from "\.\/rooms\/installed-room-builder\.ts"/);
  assert.match(managerSource, /from "\.\/rooms\/room-bundle-operations\.ts"/);
  assert.match(managerSource, /from "\.\/rooms\/room-package-types\.ts"/);
  assert.match(managerSource, /from "\.\/rooms\/room-registry\.ts"/);
  assert.match(managerSource, /from "\.\/rooms\/workspace-room-operations\.ts"/);
  assert.match(managerSource, /from "\.\/rooms\/workspace-room-build\.ts"/);
  assert.match(managerSource, /from "\.\/rooms\/workspace-discovery\.ts"/);
  assert.match(managerSource, /from "\.\/rooms\/workspace-room-build-support\.ts"/);
  assert.match(managerSource, /export \{ buildInstalledRoomRecord \};/);
  assert.match(
    managerSource,
    /async buildWorkspaceRoom\(roomId: string\): Promise<RoomOperationResult>/
  );
  assert.match(
    managerSource,
    /private async buildWorkspaceRoomArtifact\(\s*roomId: string\s*\): Promise<BuildWorkspaceRoomArtifactResult>/
  );
  assert.match(
    managerSource,
    /async syncLinkedWorkspaceRoomsOnStartup\(\): Promise<StartupRoomsSyncResult>/
  );
  assert.match(managerSource, /private async workspaceRoomNeedsStartupSync\(/);
  assert.match(managerSource, /private async buildManagedStartupSnapshot\(\)/);
  assert.match(builderSource, /export function buildInstalledRoomRecord\(/);
  assert.match(builderSource, /export function optionalI18nBaseDir\(/);
  assert.match(bundleOperationsSource, /export async function packageWorkspaceRoomBundle\(/);
  assert.match(
    bundleOperationsSource,
    /prepareWorkspaceRoomBuild: \(\) => Promise<BuildWorkspaceRoomArtifactResult>/
  );
  assert.match(bundleOperationsSource, /export async function importRoomBundleFile\(/);
  assert.match(bundleOperationsSource, /export async function importValidatedRoomBundle\(/);
  assert.match(roomPackageTypesSource, /export interface RoomOperationResult/);
  assert.match(roomPackageTypesSource, /export type RoomPackageTranslator/);
  assert.match(registrySource, /export async function readRoomRegistry\(/);
  assert.match(registrySource, /export async function writeRoomRegistry\(/);
  assert.match(registrySource, /export async function hydrateInstalledRoomRecord\(/);
  assert.match(
    rendererRegistrySource,
    /function filterManagedInstalledRooms\(rooms: InstalledRoomRecord\[\]\): InstalledRoomRecord\[\]/
  );
  assert.match(
    rendererRegistrySource,
    /return rooms\.filter\(\(room\) => room\.isWorkspaceFallback !== true\);/
  );
  assert.match(rendererRegistrySource, /cloneRooms\(filterManagedInstalledRooms\(rooms\)\)/);
  assert.match(
    rendererRegistrySource,
    /Array\.isArray\(result\.rooms\)\s*\?\s*filterManagedInstalledRooms\(result\.rooms\)\s*:\s*\[\]/
  );
  assert.match(workspaceRoomOperationsSource, /export async function installRoomFromWorkspace\(/);
  assert.match(
    workspaceRoomOperationsSource,
    /prepareWorkspaceRoomBuild: \(\) => Promise<BuildWorkspaceRoomArtifactResult>/
  );
  assert.match(
    workspaceRoomOperationsSource,
    /export async function removeInstalledRoomOperation\(/
  );
  assert.match(
    workspaceRoomOperationsSource,
    /export async function deleteWorkspaceRoomOperation\(/
  );
  assert.match(
    workspaceRoomOperationsSource,
    /export async function exportInstalledRoomToWorkspaceOperation\(/
  );
  assert.match(workspaceDiscoverySource, /export function buildRoomWorkspaceRoots\(/);
  assert.match(workspaceDiscoverySource, /export async function readWorkspaceRoomsFromRoot\(/);
  assert.match(workspaceDiscoverySource, /export function pickPreferredWorkspaceRoom\(/);
  assert.match(workspaceRoomBuildSource, /export async function buildWorkspaceRoomArtifact\(/);
  assert.match(workspaceRoomBuildSource, /buildWorkspaceRoomOutput\(target\.dirPath, buildDir\)/);
  assert.match(
    workspaceRoomBuildSource,
    /const buildDir = getRoomRuntimeBuildDir\(target\.manifest\.id\);/
  );
  assert.match(workspaceRoomBuildSupportSource, /export async function buildWorkspaceRoomOutput\(/);
  assert.match(
    workspaceRoomBuildSupportSource,
    /export async function collectWorkspaceRoomSourceBuildState\(/
  );
  assert.match(workspaceRoomBuildSupportSource, /export function roomSourceSatisfiesRuntimePath\(/);
  assert.match(workspaceRoomBuildSupportSource, /app\.asar\.unpacked/);
  assert.match(workspaceRoomBuildSupportSource, /pathToFileURL/);
  assert.match(workspaceRoomBuildSupportSource, /async function loadEsbuildModule\(/);
  assert.equal(
    scripts["rooms:bundle"],
    "node scripts/run-with-env.mjs TSX_TSCONFIG_PATH=src/tsconfig.json -- node --import tsx scripts/rooms/build-room-bundle.mjs"
  );
  assert.equal(
    scripts["rooms:build"],
    "node scripts/run-with-env.mjs TSX_TSCONFIG_PATH=src/tsconfig.json -- node --import tsx scripts/rooms/build-workspace-rooms.ts"
  );
  assert.equal(
    scripts["rooms:paths"],
    "node scripts/run-with-env.mjs TSX_TSCONFIG_PATH=src/tsconfig.json -- node --import tsx scripts/rooms/report-room-paths.ts"
  );
  assert.equal(
    scripts["rooms:clean-generated"],
    "node scripts/run-with-env.mjs TSX_TSCONFIG_PATH=src/tsconfig.json -- node --import tsx scripts/rooms/clean-generated-room-artifacts.ts"
  );
  assert.equal(
    scripts["rooms:test:file"],
    "node scripts/run-with-env.mjs TSX_TSCONFIG_PATH=src/tsconfig.json -- node --import tsx --import ./scripts/tests/register-asset-loader.mjs --test --test-concurrency=1"
  );
  assert.equal(
    scripts["rooms:lint"],
    "node scripts/run-with-env.mjs NODE_OPTIONS=--max-old-space-size=4096 -- eslint --cache --cache-location node_modules/.cache/eslint \"rooms/**/*.{js,ts}\""
  );
  assert.equal(
    scripts["rooms:check"],
    "npm run rooms:typecheck && npm run rooms:lint:strict && npm run rooms:test:core"
  );
  assert.ok(scripts["rooms:lint"].includes('"rooms/**/*.{js,ts}"'));
  assert.match(rendererRegistrySource, /async prepareStartupSnapshot\(/);
  assert.match(rendererRegistrySource, /roomsSyncLinkedStartup/);
  assert.match(appIndexSource, /AppI18n\.t\("app\.startup\.syncingLinkedRooms"\)/);
  assert.match(appIndexSource, /await RoomRegistry\.prepareStartupSnapshot\(/);
  assert.match(externalBootstrapSource, /await RoomRegistry\.prepareStartupSnapshot\(/);
  assert.match(eslintConfigSource, /"rooms\/\.build\/\*\*"/);
  assert.match(eslintConfigSource, /"rooms\/\*\*\/ui\/\*\*\/\*\.ts"/);
  assert.match(eslintConfigSource, /"rooms\/\*\*\/main-functions\/\*\*\/host\/\*\*\/\*\.ts"/);
  assert.match(eslintConfigSource, /project:\s*"\.\/rooms\/tsconfig\.rooms\.json"/);
  assert.equal(scripts["check"], "npm run lint:strict && npm run check-types && npm run rooms:test:core");
  assert.ok(scripts["typecheck"]?.includes("rooms/tsconfig.rooms.json") === true);
});

void test("dev startup falls back to workspace rooms when installed registry is empty", async () => {
  const managerSource = await readFile(roomPackageManagerPath, "utf8");
  const mainSource = await readFile(mainPath, "utf8");

  assert.match(managerSource, /private shouldUseWorkspaceFallbackInstalledRooms\(\): boolean/);
  assert.match(
    managerSource,
    /private async buildWorkspaceInstalledRoomRecord\(\s*room: RoomWorkspaceEntry\s*\)/
  );
  assert.match(managerSource, /installedDir: buildResult\.artifact\.buildDir/);
  assert.match(managerSource, /sourceDir: room\.dirPath/);
  assert.match(managerSource, /if \(installedRooms\.length > 0\) \{/);
  assert.match(
    managerSource,
    /if \(this\.shouldUseWorkspaceFallbackInstalledRooms\(\) === false\) \{\s*return installedRooms;\s*\}/
  );
  assert.match(mainSource, /if \(rooms\.length === 0\) \{\s*return null;\s*\}/);
});

void test("packaged startup seeds the external workspace root and bootstraps installed rooms from rooms/", async () => {
  const managerSource = await readFile(roomPackageManagerPath, "utf8");
  const mainWrapperSource = await readFile(
    join(projectRoot, "electron", "packaged-wrapper-main.ts"),
    "utf8"
  );
  const cliWrapperSource = await readFile(
    join(projectRoot, "electron", "packaged-wrapper-cli.ts"),
    "utf8"
  );
  const seedSource = await readFile(packagedWorkspaceSeedPath, "utf8");
  const afterPackSource = await readFile(afterPackScriptPath, "utf8");
  const pathsSource = await readFile(pathsPath, "utf8");

  assert.match(pathsSource, /return join\(getConfig\(\)\.projectRoot, "rooms"\);/);
  assert.match(managerSource, /private usesDefaultRoomRoots\(\): boolean/);
  assert.match(managerSource, /private shouldBootstrapPackagedInstalledRooms\(\): boolean/);
  assert.match(
    managerSource,
    /return\s*\(\s*this\.usesDefaultRoomRoots\(\)\s*&&\s*Paths\.isPackaged\(\)\s*===\s*true\s*&&\s*existsSync\(this\.getRegistryPath\(\)\)\s*===\s*false\s*\);/
  );
  assert.match(
    managerSource,
    /private async bootstrapPackagedInstalledRoomsFromWorkspace\(\): Promise<void>/
  );
  assert.match(managerSource, /await this\.installFromWorkspace\(room\.manifest\.id\);/);
  assert.match(
    mainWrapperSource,
    /import \{ seedPackagedProjectRoot \} from "\.\/packaged-workspace-seed\.ts";/
  );
  assert.match(
    cliWrapperSource,
    /import \{ seedPackagedProjectRoot \} from "\.\/packaged-workspace-seed\.ts";/
  );
  assert.match(seedSource, /return dirname\(resourcesPath\);/);
  assert.match(seedSource, /"AGENTS\.md"/);
  assert.match(seedSource, /"rooms"/);
  assert.match(seedSource, /"scripts"/);
  assert.match(seedSource, /"rooms\/tsconfig\.rooms\.json"/);
  assert.match(seedSource, /includes\("\/rooms\/\.build"\)/);
  assert.match(afterPackSource, /includes\("\/rooms\/\.build"\)/);
  assert.doesNotMatch(seedSource, /"config\/rooms\.json"/);
  assert.doesNotMatch(afterPackSource, /"config\/rooms\.json"/);
});
