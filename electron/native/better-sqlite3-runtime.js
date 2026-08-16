import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * @typedef {"node" | "electron"} BetterSqlite3RuntimeTarget
 */

/**
 * @typedef {{
 *   target: BetterSqlite3RuntimeTarget
 *   version: string
 *   abi: string
 *   activeBinaryPath: string
 *   cacheBinaryPath: string
 * }} BetterSqlite3RuntimeInfo
 */

const require = createRequire(import.meta.url)
const nodeAbi = require("node-abi")

const currentDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(currentDir, "..", "..")
const betterSqlite3PackagePath = require.resolve("better-sqlite3/package.json")
const betterSqlite3Root = dirname(betterSqlite3PackagePath)
const betterSqlite3Version = require(betterSqlite3PackagePath).version
const defaultActiveBinaryPath = join(betterSqlite3Root, "build", "Release", "better_sqlite3.node")
const cacheDir = join(projectRoot, "node_modules", ".cache", "better-sqlite3-runtimes")

function getElectronApp() {
  try {
    const electronModule = require("electron")
    if (electronModule === null || typeof electronModule !== "object") {
      return null
    }

    const { app } = electronModule
    return app !== undefined && typeof app === "object" ? app : null
  } catch {
    return null
  }
}

function isPackagedElectronApp() {
  return getElectronApp()?.isPackaged === true
}

function resolveActiveBinaryPath() {
  if (!isPackagedElectronApp()) {
    return defaultActiveBinaryPath
  }

  const resourcesPath = typeof process.resourcesPath === "string" ? process.resourcesPath.trim() : ""
  if (resourcesPath === "") {
    return defaultActiveBinaryPath
  }

  return join(
    resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    "better-sqlite3",
    "build",
    "Release",
    "better_sqlite3.node"
  )
}

/**
 * @param {unknown} target
 * @returns {BetterSqlite3RuntimeTarget}
 */
function normalizeTarget(target) {
  if (target === "node" || target === "electron") {
    return target
  }

  throw new Error(`Unsupported better-sqlite3 runtime target: ${String(target)}`)
}

/**
 * @returns {string}
 */
function resolveElectronVersion() {
  if (typeof process.versions.electron === "string" && process.versions.electron !== "") {
    return process.versions.electron
  }

  return require("electron/package.json").version
}

/**
 * @param {BetterSqlite3RuntimeTarget} target
 * @returns {string}
 */
function resolveTargetVersion(target) {
  return target === "electron" ? resolveElectronVersion() : process.versions.node
}

/**
 * @param {BetterSqlite3RuntimeTarget} target
 * @returns {string}
 */
function resolveTargetAbi(target) {
  return target === "electron"
    ? nodeAbi.getAbi(resolveElectronVersion(), "electron")
    : process.versions.modules
}

/**
 * @param {unknown} target
 * @returns {BetterSqlite3RuntimeInfo}
 */
function getRuntimeInfo(target) {
  const normalizedTarget = normalizeTarget(target)
  const version = resolveTargetVersion(normalizedTarget)
  const abi = resolveTargetAbi(normalizedTarget)
  const fileName = `${normalizedTarget}-abi${abi}-${process.platform}-${process.arch}-v${betterSqlite3Version}.node`

  return {
    target: normalizedTarget,
    version,
    abi,
    activeBinaryPath: resolveActiveBinaryPath(),
    cacheBinaryPath: join(cacheDir, fileName),
  }
}

/**
 * @param {string} filePath
 * @returns {string | null}
 */
function hashFile(filePath) {
  if (!existsSync(filePath)) {
    return null
  }

  const hash = createHash("sha1")
  hash.update(readFileSync(filePath))
  return hash.digest("hex")
}

function resolveNodeExecutable() {
  const npmNodeExecPath = process.env["npm_node_execpath"]?.trim()
  if (npmNodeExecPath) {
    return npmNodeExecPath
  }

  const nodeFromEnv = process.env["NODE"]?.trim()
  if (nodeFromEnv) {
    return nodeFromEnv
  }

  if (typeof process.versions.electron === "string" && process.versions.electron !== "") {
    return "node"
  }

  return process.execPath
}

/**
 * @param {string[]} args
 * @param {string} label
 * @returns {void}
 */
function runLocalNodeCommand(args, label) {
  const result = spawnSync(resolveNodeExecutable(), args, {
    cwd: projectRoot,
    encoding: "utf8",
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit code ${String(result.status)}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim()
    )
  }
}

/**
 * @returns {string}
 */
function resolveNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm"
}

/**
 * @param {string[]} args
 * @param {string} label
 * @returns {void}
 */
function runLocalNpmCommand(args, label) {
  const npmExecPath = process.env["npm_execpath"]?.trim()
  const result = npmExecPath
    ? spawnSync(resolveNodeExecutable(), [npmExecPath, ...args], {
        cwd: projectRoot,
        encoding: "utf8",
      })
    : spawnSync(resolveNpmCommand(), args, {
        cwd: projectRoot,
        encoding: "utf8",
        shell: process.platform === "win32",
      })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(
      `${label} failed with exit code ${String(result.status)}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim()
    )
  }
}

/**
 * @param {BetterSqlite3RuntimeTarget} target
 * @returns {BetterSqlite3RuntimeInfo}
 */
function captureRuntimeBinary(target) {
  const runtime = getRuntimeInfo(target)
  if (!existsSync(runtime.activeBinaryPath)) {
    throw new Error(`better-sqlite3 active binary not found at ${runtime.activeBinaryPath}`)
  }

  mkdirSync(cacheDir, { recursive: true })
  copyFileSync(runtime.activeBinaryPath, runtime.cacheBinaryPath)
  return runtime
}

export function detectBetterSqlite3RuntimeTarget() {
  return typeof process.versions.electron === "string" && process.versions.electron !== ""
    ? "electron"
    : "node"
}

/**
 * @param {BetterSqlite3RuntimeTarget} target
 * @returns {BetterSqlite3RuntimeInfo}
 */
export function rebuildBetterSqlite3Runtime(target) {
  const normalizedTarget = normalizeTarget(target)

  if (normalizedTarget === "electron") {
    // better-sqlite3 v13 ships prebuilds for Node.js; electron-rebuild skips
    // building when it detects prebuilds on disk. Temporarily hide them so
    // node-gyp actually compiles the Electron native addon.
    const prebuildsDir = join(betterSqlite3Root, "prebuilds")
    const prebuildsBackup = prebuildsDir + ".bak"
    let movedPrebuilds = false
    if (existsSync(prebuildsDir)) {
      renameSync(prebuildsDir, prebuildsBackup)
      movedPrebuilds = true
    }
    try {
      runLocalNodeCommand(
        [
          join(projectRoot, "node_modules", "@electron", "rebuild", "lib", "cli.js"),
          "-f",
          "-w",
          "better-sqlite3",
          "--build-from-source",
        ],
        "Electron better-sqlite3 rebuild"
      )
    } finally {
      if (movedPrebuilds && existsSync(prebuildsBackup)) {
        renameSync(prebuildsBackup, prebuildsDir)
      }
    }
  } else {
    runLocalNpmCommand(["rebuild", "better-sqlite3"], "Node better-sqlite3 rebuild")
  }

  return captureRuntimeBinary(normalizedTarget)
}

/**
 * @param {BetterSqlite3RuntimeTarget} target
 * @returns {BetterSqlite3RuntimeInfo & { activeHash: string | null, cacheHash: string }}
 */
export function activateBetterSqlite3Runtime(target) {
  const runtime = getRuntimeInfo(target)
  if (!existsSync(runtime.cacheBinaryPath)) {
    throw new Error(
      `better-sqlite3 cache missing for ${runtime.target}. Run the prepare command before activation.`
    )
  }

  mkdirSync(dirname(runtime.activeBinaryPath), { recursive: true })

  const activeHash = hashFile(runtime.activeBinaryPath)
  const cacheHash = hashFile(runtime.cacheBinaryPath)
  if (cacheHash === null) {
    throw new Error(`better-sqlite3 cache binary missing at ${runtime.cacheBinaryPath}`)
  }

  if (activeHash !== cacheHash) {
    copyFileSync(runtime.cacheBinaryPath, runtime.activeBinaryPath)
  }

  return {
    ...runtime,
    activeHash: hashFile(runtime.activeBinaryPath),
    cacheHash,
  }
}

/**
 * @param {BetterSqlite3RuntimeTarget} target
 * @returns {BetterSqlite3RuntimeInfo & { activeHash: string | null, cacheHash: string }}
 */
export function prepareBetterSqlite3Runtime(target) {
  const runtime = getRuntimeInfo(target)
  if (!existsSync(runtime.cacheBinaryPath)) {
    rebuildBetterSqlite3Runtime(runtime.target)
  }

  return activateBetterSqlite3Runtime(runtime.target)
}

/**
 * @param {BetterSqlite3RuntimeTarget} [target=detectBetterSqlite3RuntimeTarget()]
 * @returns {BetterSqlite3RuntimeInfo & { activeHash: string | null, cacheHash: string }}
 */
export function ensureBetterSqlite3Runtime(target = detectBetterSqlite3RuntimeTarget()) {
  const runtime = getRuntimeInfo(target)
  if (isPackagedElectronApp()) {
    // Packaged builds already ship the Electron ABI binary under app.asar.unpacked.
    if (!existsSync(runtime.activeBinaryPath)) {
      throw new Error(`Packaged better-sqlite3 binary not found at ${runtime.activeBinaryPath}`)
    }

    return {
      ...runtime,
      activeHash: hashFile(runtime.activeBinaryPath),
      cacheHash: hashFile(runtime.cacheBinaryPath) ?? "",
    }
  }

  return prepareBetterSqlite3Runtime(target)
}

/**
 * @returns {{
 *   projectRoot: string
 *   activeBinaryPath: string
 *   activeHash: string | null
 *   detectedTarget: BetterSqlite3RuntimeTarget
 *   runtimes: Array<BetterSqlite3RuntimeInfo & {
 *     cacheExists: boolean
 *     cacheHash: string | null
 *     activeMatchesCache: boolean
 *   }>
 * }}
 */
export function getBetterSqlite3RuntimeStatus() {
  const activeBinaryPath = resolveActiveBinaryPath()
  const activeHash = hashFile(activeBinaryPath)
  const runtimes = ["node", "electron"].map((target) => {
    const runtime = getRuntimeInfo(target)
    const cacheHash = hashFile(runtime.cacheBinaryPath)

    return {
      ...runtime,
      cacheExists: cacheHash !== null,
      cacheHash,
      activeMatchesCache: activeHash !== null && cacheHash !== null && activeHash === cacheHash,
    }
  })

  return {
    projectRoot,
    activeBinaryPath,
    activeHash,
    detectedTarget: detectBetterSqlite3RuntimeTarget(),
    runtimes,
  }
}

/**
 * @param {string[]} [argv=process.argv.slice(2)]
 * @returns {void}
 */
export function runBetterSqlite3RuntimeCli(argv = process.argv.slice(2)) {
  const [command = "status", maybeTarget] = argv

  switch (command) {
    case "status":
      console.info(JSON.stringify(getBetterSqlite3RuntimeStatus(), null, 2))
      return
    case "prepare-node":
      console.info(JSON.stringify(prepareBetterSqlite3Runtime("node"), null, 2))
      return
    case "prepare-electron":
      console.info(JSON.stringify(prepareBetterSqlite3Runtime("electron"), null, 2))
      return
    case "rebuild-node":
      console.info(JSON.stringify(rebuildBetterSqlite3Runtime("node"), null, 2))
      return
    case "rebuild-electron":
      console.info(JSON.stringify(rebuildBetterSqlite3Runtime("electron"), null, 2))
      return
    case "activate":
      console.info(JSON.stringify(activateBetterSqlite3Runtime(normalizeTarget(maybeTarget)), null, 2))
      return
    default:
      throw new Error(
        `Unknown better-sqlite3 runtime command: ${command}. Expected status, prepare-node, prepare-electron, rebuild-node, rebuild-electron, or activate <node|electron>.`
      )
  }
}
