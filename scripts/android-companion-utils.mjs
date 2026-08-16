import { createReadStream, createWriteStream, constants as fsConstants } from "node:fs";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createRequire } from "node:module";
import { inspectCompanionArtifactCache } from "./lib/android-companion-artifact.mjs";

const currentDir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const tar = require("tar");
const unbzip2Stream = require("unbzip2-stream");
const yauzl = require("yauzl");

const ANDROID_COMPILE_SDK = "37.0";
const ANDROID_BUILD_TOOLS = "37.0.0";
const ANDROID_CMAKE_VERSION = "3.22.1";
const ANDROID_NDK_VERSION = "26.3.11579264";
const ANDROID_CMDLINE_TOOLS_REPOSITORY_URL =
  "https://dl.google.com/android/repository/repository2-1.xml";
const ADOPTIUM_API_URL = "https://api.adoptium.net/v3/assets/latest/21/hotspot";
const WHISPER_CPP_REPOSITORY_URL = "https://github.com/ggml-org/whisper.cpp.git";
const WHISPER_CPP_TAG = "v1.8.4";
const SHERPA_ONNX_VERSION = "v1.13.2";
const SHERPA_ANDROID_RUNTIME_URL = `https://github.com/k2-fsa/sherpa-onnx/releases/download/${SHERPA_ONNX_VERSION}/sherpa-onnx-${SHERPA_ONNX_VERSION}-android.tar.bz2`;
const SHERPA_TTS_KOTLIN_API_URL = `https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/${SHERPA_ONNX_VERSION}/sherpa-onnx/kotlin-api/Tts.kt`;
const NCNN_ANDROID_VERSION = "20260113";
const NCNN_ANDROID_RUNTIME_URL = `https://github.com/Tencent/ncnn/releases/download/${NCNN_ANDROID_VERSION}/ncnn-${NCNN_ANDROID_VERSION}-android-vulkan.zip`;
const NCNN_PIPER_RELEASE = "20260114.270a6be";
const NCNN_PIPER_APK_URL = `https://github.com/nihui/ncnn-android-piper/releases/download/${NCNN_PIPER_RELEASE}/ncnn-android-piper-${NCNN_PIPER_RELEASE}.apk`;
const NCNN_PIPER_TR_MODEL = {
  modelId: "tr_TR-fahrettin",
  archiveName: "tr_TR-fahrettin-ncnn.zip",
  url: "https://huggingface.co/gyroing/PiperTTS-NCNN-Models/resolve/main/tr_TR-fahrettin.zip",
};
const SHERPA_TTS_MODELS = [
  {
    modelId: "tr_TR-dfki-medium",
    archiveName: "vits-piper-tr_TR-dfki-medium.tar.bz2",
    assetDir: "vits-piper-tr_TR-dfki-medium",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-tr_TR-dfki-medium.tar.bz2",
  },
  {
    modelId: "en_US-lessac-medium",
    archiveName: "vits-piper-en_US-lessac-medium.tar.bz2",
    assetDir: "vits-piper-en_US-lessac-medium",
    url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-en_US-lessac-medium.tar.bz2",
  },
];
const USER_AGENT = "HayaletEvAndroidCompanion/1.0";

export const projectRoot = resolve(currentDir, "..");
export const companionRoot = join(projectRoot, "android-companion");
export const artifactRoot = join(projectRoot, "dist", "android-companion");
export const toolchainRoot = join(projectRoot, "dist", "android-toolchain");
export const downloadCacheRoot = join(toolchainRoot, "downloads");
export const managedJdkRoot = join(toolchainRoot, "jdk");
export const managedAndroidSdkRoot = join(toolchainRoot, "android-sdk");
export const whisperCppSourceRoot = join(projectRoot, "data", "transcript", "whisper.cpp-src");
export const sherpaTtsRoot = join(projectRoot, "dist", "android-sherpa-tts");
export const sherpaTtsGeneratedKotlinRoot = join(sherpaTtsRoot, "generated", "kotlin");
export const sherpaTtsJniLibsRoot = join(sherpaTtsRoot, "jniLibs");
export const sherpaTtsAssetsRoot = join(sherpaTtsRoot, "assets");
export const ncnnPiperRoot = join(projectRoot, "dist", "android-ncnn-piper");
export const ncnnPiperSdkRoot = join(ncnnPiperRoot, `ncnn-${NCNN_ANDROID_VERSION}-android-vulkan`);
export const ncnnPiperAssetsRoot = join(ncnnPiperRoot, "assets");
export const ncnnPiperJniLibsRoot = join(ncnnPiperRoot, "jniLibs");
export const sourceManifestPath = join(
  companionRoot,
  "app",
  "src",
  "main",
  "assets",
  "companion-manifest.json"
);
export const artifactManifestPath = join(artifactRoot, "manifest.json");
export const wrapperPath =
  process.platform === "win32"
    ? join(companionRoot, "gradlew.bat")
    : join(companionRoot, "gradlew");

export async function fileExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export async function isExecutable(targetPath) {
  try {
    await access(targetPath, fsConstants.X_OK);
    return true;
  } catch {
    if (process.platform !== "win32") {
      return false;
    }
    try {
      await access(targetPath, fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

export async function resolveExecutableOnPath(name) {
  const entries = (process.env.PATH ?? "")
    .split(process.platform === "win32" ? ";" : ":")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const suffixes = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];

  for (const entry of entries) {
    for (const suffix of suffixes) {
      const candidate = join(entry, `${name}${suffix}`);
      if (await isExecutable(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

export async function readJsonFile(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}

export async function loadSourceManifest() {
  return await readJsonFile(sourceManifestPath);
}

export async function readArtifactManifest() {
  if ((await fileExists(artifactManifestPath)) !== true) {
    return null;
  }

  return await readJsonFile(artifactManifestPath);
}

export async function writeJsonFile(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function runCommand(command, args, options = {}) {
  const { cwd = projectRoot, stdio = "pipe", env = process.env, input = null } = options;
  const isWindowsBatchCommand =
    process.platform === "win32" && /\.(?:bat|cmd)$/i.test(String(command));
  const spawnCommand = isWindowsBatchCommand ? (process.env.ComSpec ?? "cmd.exe") : command;
  const spawnArgs = isWindowsBatchCommand ? ["/d", "/s", "/c", command, ...args] : args;

  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(spawnCommand, spawnArgs, {
      cwd,
      env,
      stdio,
    });

    let stdout = "";
    let stderr = "";

    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += String(chunk);
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += String(chunk);
      });
    }

    if (typeof input === "string" && child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    }

    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({
        exitCode: typeof code === "number" ? code : -1,
        stdout,
        stderr,
      });
    });
  });
}

function escapeZipPatternToken(token) {
  return token.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function normalizeZipPath(value) {
  return String(value).replace(/\\/g, "/");
}

function createZipPatternMatcher(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return () => true;
  }

  const expressions = patterns.map((pattern) => {
    const normalized = normalizeZipPath(pattern);
    const source = normalized
      .split("*")
      .map((token) => escapeZipPatternToken(token))
      .join("[^/]*");
    return new RegExp(`^${source}$`);
  });

  return (entryName) => expressions.some((expression) => expression.test(entryName));
}

function resolveZipEntryDestination(destinationRoot, entryName, options = {}) {
  const normalizedName = normalizeZipPath(entryName);
  const relativeName = options.junkPaths === true ? basename(normalizedName) : normalizedName;
  if (relativeName === "" || relativeName.includes("\0")) {
    return null;
  }

  const resolvedRoot = resolve(destinationRoot);
  const resolvedPath = resolve(resolvedRoot, relativeName);
  const rootPrefix = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`;
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(rootPrefix)) {
    throw new Error(`Zip entry escapes destination: ${entryName}`);
  }

  return resolvedPath;
}

async function extractZipArchive(archivePath, destinationRoot, options = {}) {
  const shouldExtract = createZipPatternMatcher(options.entries);
  await mkdir(destinationRoot, { recursive: true });

  let extractedCount = 0;
  await new Promise((resolvePromise, rejectPromise) => {
    yauzl.open(archivePath, { lazyEntries: true, autoClose: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        rejectPromise(openError ?? new Error("Zip archive could not be opened."));
        return;
      }

      let settled = false;
      const rejectOnce = (error) => {
        if (settled) {
          return;
        }
        settled = true;
        zipFile.close();
        rejectPromise(error);
      };

      zipFile.on("error", rejectOnce);
      zipFile.on("end", () => {
        if (settled) {
          return;
        }
        settled = true;
        if (Array.isArray(options.entries) && options.entries.length > 0 && extractedCount === 0) {
          rejectPromise(new Error(`No matching zip entries found in ${archivePath}.`));
          return;
        }
        resolvePromise();
      });

      zipFile.on("entry", (entry) => {
        void (async () => {
          const entryName = normalizeZipPath(entry.fileName);
          const isDirectory = entryName.endsWith("/");
          if (!shouldExtract(entryName)) {
            zipFile.readEntry();
            return;
          }

          const destinationPath = resolveZipEntryDestination(destinationRoot, entryName, options);
          if (destinationPath === null) {
            zipFile.readEntry();
            return;
          }

          if (isDirectory) {
            if (options.junkPaths !== true) {
              await mkdir(destinationPath, { recursive: true });
            }
            zipFile.readEntry();
            return;
          }

          await mkdir(dirname(destinationPath), { recursive: true });
          const readStream = await new Promise((resolveStream, rejectStream) => {
            zipFile.openReadStream(entry, (streamError, stream) => {
              if (streamError || !stream) {
                rejectStream(streamError ?? new Error(`Zip entry could not be read: ${entryName}`));
                return;
              }
              resolveStream(stream);
            });
          });
          await pipeline(readStream, createWriteStream(destinationPath));
          extractedCount += 1;
          zipFile.readEntry();
        })().catch(rejectOnce);
      });

      zipFile.readEntry();
    });
  });

  return extractedCount;
}

async function extractTarBzipArchive(archivePath, destinationRoot) {
  await mkdir(destinationRoot, { recursive: true });
  await pipeline(createReadStream(archivePath), unbzip2Stream(), tar.x({ cwd: destinationRoot }));
}

function parseJavaMajorVersion(output) {
  const text = typeof output === "string" ? output.trim() : "";
  if (text === "") {
    return null;
  }

  const versionToken =
    text.match(/version "([^"]+)"/)?.[1] ?? text.match(/openjdk (\d+(?:\.\d+){0,2})/)?.[1] ?? null;
  if (versionToken == null) {
    return null;
  }

  const major = Number.parseInt(versionToken.split(".")[0] ?? "", 10);
  return Number.isFinite(major) ? major : null;
}

function normalizeProgressEmitter(emitProgress) {
  return typeof emitProgress === "function" ? emitProgress : () => {};
}


function getManagedJdkHome() {
  return join(managedJdkRoot, "current");
}


function getManagedSdkManagerPath() {
  return join(
    managedAndroidSdkRoot,
    "cmdline-tools",
    "latest",
    "bin",
    process.platform === "win32" ? "sdkmanager.bat" : "sdkmanager"
  );
}

function getAndroidSdkCandidatePaths() {
  const homeDir = homedir();
  const candidates = [
    managedAndroidSdkRoot,
    process.env.ANDROID_SDK_ROOT ?? null,
    process.env.ANDROID_HOME ?? null,
  ];

  if (process.platform === "win32") {
    candidates.push(
      process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Android", "Sdk") : null,
      process.env.USERPROFILE
        ? join(process.env.USERPROFILE, "AppData", "Local", "Android", "Sdk")
        : null
    );
  } else if (process.platform === "darwin") {
    candidates.push(join(homeDir, "Library", "Android", "sdk"), join(homeDir, "Android", "Sdk"));
  } else {
    candidates.push(join(homeDir, "Android", "Sdk"), "/usr/lib/android-sdk");
  }

  return candidates.filter(
    (value, index, list) =>
      typeof value === "string" && value.trim() !== "" && list.indexOf(value) === index
  );
}

function getExpectedAndroidSdkPaths(rootPath) {
  return {
    platformPath: join(rootPath, "platforms", `android-${ANDROID_COMPILE_SDK}`),
    buildToolsPath: join(rootPath, "build-tools", ANDROID_BUILD_TOOLS),
    cmakePath: join(rootPath, "cmake", ANDROID_CMAKE_VERSION),
    ndkPath: join(rootPath, "ndk", ANDROID_NDK_VERSION),
    sdkManagerPath: join(
      rootPath,
      "cmdline-tools",
      "latest",
      "bin",
      process.platform === "win32" ? "sdkmanager.bat" : "sdkmanager"
    ),
  };
}

async function inspectJavaHome(javaHome) {
  if (typeof javaHome !== "string" || javaHome.trim() === "") {
    return null;
  }

  const candidateHome = javaHome.trim();
  const javaPath = join(candidateHome, "bin", process.platform === "win32" ? "java.exe" : "java");
  if ((await isExecutable(javaPath)) !== true) {
    return null;
  }

  const version = await runCommand(javaPath, ["-version"]).catch(() => null);
  const major = parseJavaMajorVersion(`${version?.stderr ?? ""}\n${version?.stdout ?? ""}`);
  if (major === null || major < 17 || major > 21) {
    return null;
  }

  return {
    javaHome: candidateHome,
    javaPath,
    major,
    source: candidateHome === getManagedJdkHome() ? "managed" : "system",
  };
}

async function inspectPathJava() {
  const javaPath = await resolveExecutableOnPath("java");
  if (javaPath === null) {
    return null;
  }

  const version = await runCommand(javaPath, ["-version"]).catch(() => null);
  const major = parseJavaMajorVersion(`${version?.stderr ?? ""}\n${version?.stdout ?? ""}`);
  if (major === null || major < 17 || major > 21) {
    return null;
  }

  return {
    javaHome: dirname(dirname(javaPath)),
    javaPath,
    major,
    source: "system",
  };
}

export async function resolveCompatibleJavaRuntime() {
  const fromManaged = await inspectJavaHome(getManagedJdkHome());
  if (fromManaged) {
    return fromManaged;
  }

  const fromHome = await inspectJavaHome(process.env.JAVA_HOME ?? "");
  if (fromHome) {
    return fromHome;
  }

  return await inspectPathJava();
}

async function inspectAndroidSdkRoot(rootPath) {
  if (typeof rootPath !== "string" || rootPath.trim() === "") {
    return null;
  }

  const normalizedRoot = rootPath.trim();
  const { platformPath, buildToolsPath, cmakePath, ndkPath, sdkManagerPath } =
    getExpectedAndroidSdkPaths(normalizedRoot);
  const [platformReady, buildToolsReady, cmakeReady, ndkReady, sdkManagerReady] = await Promise.all(
    [
      fileExists(platformPath),
      fileExists(buildToolsPath),
      fileExists(cmakePath),
      fileExists(ndkPath),
      isExecutable(sdkManagerPath),
    ]
  );

  return {
    rootPath: normalizedRoot,
    sdkManagerPath,
    platformReady,
    buildToolsReady,
    cmakeReady,
    ndkReady,
    sdkManagerReady,
    complete: platformReady && buildToolsReady && cmakeReady && ndkReady && sdkManagerReady,
    source: normalizedRoot === managedAndroidSdkRoot ? "managed" : "system",
  };
}

export async function resolveUsableAndroidSdk() {
  for (const candidate of getAndroidSdkCandidatePaths()) {
    const inspected = await inspectAndroidSdkRoot(candidate);
    if (inspected?.complete === true) {
      return inspected;
    }
  }

  return null;
}

function resolveAdoptiumPlatform() {
  switch (process.platform) {
    case "linux":
      return "linux";
    case "darwin":
      return "mac";
    case "win32":
      return "windows";
    default:
      throw new Error(`Unsupported platform for managed JDK bootstrap: ${process.platform}`);
  }
}

function resolveAdoptiumArch() {
  switch (process.arch) {
    case "x64":
      return "x64";
    case "arm64":
      return "aarch64";
    default:
      throw new Error(`Unsupported architecture for managed JDK bootstrap: ${process.arch}`);
  }
}

function resolveAndroidCmdlineToolsHost() {
  switch (process.platform) {
    case "linux":
      return "linux";
    case "darwin":
      return "mac";
    case "win32":
      return "win";
    default:
      throw new Error(
        `Unsupported platform for managed Android SDK bootstrap: ${process.platform}`
      );
  }
}

async function downloadFile(url, destinationPath) {
  const response = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
    },
    redirect: "follow",
  });
  if (!response.ok || response.body == null) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  await mkdir(dirname(destinationPath), { recursive: true });
  const bodyStream = Readable.fromWeb(response.body);
  await pipeline(bodyStream, createWriteStream(destinationPath));
  return destinationPath;
}

async function findDirectoryContaining(rootPath, relativeSegments, maxDepth = 4) {
  const queue = [{ dir: rootPath, depth: 0 }];

  while (queue.length > 0) {
    const entry = queue.shift();
    if (!entry) {
      continue;
    }

    const candidate = join(entry.dir, ...relativeSegments);
    if (await fileExists(candidate)) {
      return entry.dir;
    }

    if (entry.depth >= maxDepth) {
      continue;
    }

    const children = await readdir(entry.dir, { withFileTypes: true }).catch(() => []);
    for (const child of children) {
      if (child.isDirectory()) {
        queue.push({ dir: join(entry.dir, child.name), depth: entry.depth + 1 });
      }
    }
  }

  return null;
}

async function fetchManagedJdkPackageInfo() {
  const apiUrl = new URL(ADOPTIUM_API_URL);
  apiUrl.searchParams.set("architecture", resolveAdoptiumArch());
  apiUrl.searchParams.set("heap_size", "normal");
  apiUrl.searchParams.set("image_type", "jdk");
  apiUrl.searchParams.set("jvm_impl", "hotspot");
  apiUrl.searchParams.set("os", resolveAdoptiumPlatform());
  apiUrl.searchParams.set("page_size", "1");
  apiUrl.searchParams.set("project", "jdk");
  apiUrl.searchParams.set("vendor", "eclipse");

  const response = await fetch(apiUrl, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`Temurin download manifest could not be loaded: ${response.statusText}`);
  }

  const records = await response.json();
  const packageRecord = records?.[0]?.binary?.package ?? null;
  const link = typeof packageRecord?.link === "string" ? packageRecord.link : null;
  if (link === null) {
    throw new Error("Temurin download manifest did not include a JDK package link.");
  }

  return {
    link,
    name:
      typeof packageRecord?.name === "string" && packageRecord.name.trim() !== ""
        ? packageRecord.name.trim()
        : (new URL(link).pathname.split("/").pop() ?? "temurin-jdk.tar.gz"),
  };
}

async function fetchAndroidCmdlineToolsInfo() {
  const response = await fetch(ANDROID_CMDLINE_TOOLS_REPOSITORY_URL, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/xml,text/xml",
    },
  });
  if (!response.ok) {
    throw new Error(
      `Android command-line tools manifest could not be loaded: ${response.statusText}`
    );
  }

  const xml = await response.text();
  const hostToken = resolveAndroidCmdlineToolsHost();
  const urlMatches = [
    ...xml.matchAll(
      new RegExp(`<url>(commandlinetools-${hostToken}-(\\d+)_latest\\.zip)</url>`, "g")
    ),
  ];
  const latestMatch =
    urlMatches
      .map((match) => ({
        full: match[1] ?? null,
        version: Number.parseInt(match[2] ?? "", 10),
      }))
      .filter((entry) => entry.full !== null && Number.isFinite(entry.version))
      .sort((left, right) => right.version - left.version)[0] ?? null;
  const relativeUrl = latestMatch?.full ?? null;
  if (relativeUrl === null) {
    throw new Error("Android command-line tools manifest did not include a matching host package.");
  }

  return {
    link: `https://dl.google.com/android/repository/${relativeUrl}`,
    name: relativeUrl,
  };
}

async function installManagedJdk(emitProgress) {
  const notify = normalizeProgressEmitter(emitProgress);
  const existing = await inspectJavaHome(getManagedJdkHome());
  if (existing) {
    notify({
      message: "Managed JDK 21 is already ready.",
      progress: 0.18,
      detail: `Managed JDK is already available at ${existing.javaHome}.`,
    });
    return existing;
  }

  notify({
    message: "Downloading the managed JDK 21 bundle.",
    progress: 0.12,
    detail: `Hayalet Ev will install a repo-local JDK into ${managedJdkRoot}.`,
  });
  const jdkPackage = await fetchManagedJdkPackageInfo();
  const archivePath = join(downloadCacheRoot, jdkPackage.name);
  if ((await fileExists(archivePath)) !== true) {
    await downloadFile(jdkPackage.link, archivePath);
  }

  notify({
    message: "Extracting the managed JDK 21 bundle.",
    progress: 0.22,
    detail: `The downloaded JDK archive is being unpacked from ${archivePath}.`,
  });
  const extractDir = await mkdtemp(join(tmpdir(), "hayalet-ev-jdk-"));
  const extractResult = await runCommand("tar", ["-xzf", archivePath, "-C", extractDir]);
  if (extractResult.exitCode !== 0) {
    throw new Error(
      extractResult.stderr.trim() || extractResult.stdout.trim() || "Managed JDK extraction failed."
    );
  }

  const extractedHome = await findDirectoryContaining(
    extractDir,
    ["bin", process.platform === "win32" ? "java.exe" : "java"],
    4
  );
  if (extractedHome === null) {
    throw new Error("The managed JDK archive did not expose a usable java binary.");
  }

  await mkdir(managedJdkRoot, { recursive: true });
  await rm(getManagedJdkHome(), { recursive: true, force: true });
  await rename(extractedHome, getManagedJdkHome());
  await rm(extractDir, { recursive: true, force: true });

  const runtime = await inspectJavaHome(getManagedJdkHome());
  if (runtime === null) {
    throw new Error("Managed JDK installation completed but java could not be resolved.");
  }

  notify({
    message: "Managed JDK 21 is ready.",
    progress: 0.32,
    detail: `Managed JDK is ready at ${runtime.javaHome}.`,
  });
  return runtime;
}

async function installManagedAndroidSdk(javaRuntime, emitProgress) {
  const notify = normalizeProgressEmitter(emitProgress);
  const existing = await inspectAndroidSdkRoot(managedAndroidSdkRoot);
  if (existing?.complete === true) {
    notify({
      message: "Managed Android SDK is already ready.",
      progress: 0.48,
      detail: `Managed Android SDK is already available at ${existing.rootPath}.`,
    });
    return existing;
  }

  notify({
    message: "Downloading Android command-line tools.",
    progress: 0.36,
    detail: `Hayalet Ev will install a repo-local Android SDK into ${managedAndroidSdkRoot}.`,
  });
  const sdkPackage = await fetchAndroidCmdlineToolsInfo();
  const archivePath = join(downloadCacheRoot, sdkPackage.name);
  if ((await fileExists(archivePath)) !== true) {
    await downloadFile(sdkPackage.link, archivePath);
  }

  notify({
    message: "Extracting Android command-line tools.",
    progress: 0.46,
    detail: `The command-line tools archive is being unpacked from ${archivePath}.`,
  });
  const extractDir = await mkdtemp(join(tmpdir(), "hayalet-ev-android-sdk-"));
  await extractZipArchive(archivePath, extractDir).catch((error) => {
    throw new Error(
      `Android command-line tools extraction failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  });

  const extractedTools = await findDirectoryContaining(
    extractDir,
    ["bin", process.platform === "win32" ? "sdkmanager.bat" : "sdkmanager"],
    4
  );
  if (extractedTools === null) {
    throw new Error("The Android command-line tools archive did not expose sdkmanager.");
  }

  const latestToolsDir = join(managedAndroidSdkRoot, "cmdline-tools", "latest");
  await mkdir(join(managedAndroidSdkRoot, "cmdline-tools"), { recursive: true });
  await rm(latestToolsDir, { recursive: true, force: true });
  try {
    await rename(extractedTools, latestToolsDir);
  } catch (error) {
    if (error?.code !== "EXDEV") {
      throw error;
    }
    await cp(extractedTools, latestToolsDir, { recursive: true });
    await rm(extractedTools, { recursive: true, force: true });
  }
  await rm(extractDir, { recursive: true, force: true });

  const sdkManagerPath = getManagedSdkManagerPath();
  const sdkEnv = {
    ...process.env,
    JAVA_HOME: javaRuntime.javaHome,
    ANDROID_HOME: managedAndroidSdkRoot,
    ANDROID_SDK_ROOT: managedAndroidSdkRoot,
  };

  notify({
    message: "Accepting Android SDK licenses.",
    progress: 0.54,
    detail: "Android SDK license prompts are being accepted for the managed toolchain.",
  });
  const licensesResult = await runCommand(
    sdkManagerPath,
    [`--sdk_root=${managedAndroidSdkRoot}`, "--licenses"],
    {
      env: sdkEnv,
      input: `${"y\n".repeat(80)}`,
    }
  );
  if (licensesResult.exitCode !== 0) {
    throw new Error(
      licensesResult.stderr.trim() ||
        licensesResult.stdout.trim() ||
        "Android SDK license acceptance failed."
    );
  }

  notify({
    message: `Installing Android SDK packages for API ${ANDROID_COMPILE_SDK}.`,
    progress: 0.64,
    detail: `platform-tools, platforms;android-${ANDROID_COMPILE_SDK}, build-tools;${ANDROID_BUILD_TOOLS}, CMake, and NDK are being installed.`,
  });
  const packageResult = await runCommand(
    sdkManagerPath,
    [
      `--sdk_root=${managedAndroidSdkRoot}`,
      "platform-tools",
      `platforms;android-${ANDROID_COMPILE_SDK}`,
      `build-tools;${ANDROID_BUILD_TOOLS}`,
      `cmake;${ANDROID_CMAKE_VERSION}`,
      `ndk;${ANDROID_NDK_VERSION}`,
    ],
    {
      env: sdkEnv,
      input: `${"y\n".repeat(20)}`,
    }
  );
  if (packageResult.exitCode !== 0) {
    throw new Error(
      packageResult.stderr.trim() ||
        packageResult.stdout.trim() ||
        "Android SDK package installation failed."
    );
  }

  const sdk = await inspectAndroidSdkRoot(managedAndroidSdkRoot);
  if (sdk?.complete !== true) {
    throw new Error(
      "Managed Android SDK installation completed but required packages are still missing."
    );
  }

  notify({
    message: "Managed Android SDK is ready.",
    progress: 0.72,
    detail: `Managed Android SDK is ready at ${sdk.rootPath}.`,
  });
  return sdk;
}

export async function planCompanionBuildEnvironment() {
  const plan = {
    needsConfirmation: false,
    details: [],
  };

  const javaRuntime = await resolveCompatibleJavaRuntime();
  if (javaRuntime === null) {
    plan.details.push(`JDK 21 will be downloaded into ${managedJdkRoot}.`);
  }

  const androidSdk = await resolveUsableAndroidSdk();
  if (androidSdk === null) {
    plan.details.push(
      `Android SDK command-line tools, API ${ANDROID_COMPILE_SDK}, CMake, and NDK packages will be installed into ${managedAndroidSdkRoot}.`
    );
  }

  if ((await fileExists(join(whisperCppSourceRoot, "CMakeLists.txt"))) !== true) {
    plan.details.push(
      `whisper.cpp ${WHISPER_CPP_TAG} will be cloned into ${whisperCppSourceRoot}.`
    );
  }

  if (
    (await fileExists(join(sherpaTtsJniLibsRoot, "arm64-v8a", "libsherpa-onnx-jni.so"))) !== true
  ) {
    plan.details.push(
      `sherpa-onnx ${SHERPA_ONNX_VERSION} Android TTS runtime will be cached into ${sherpaTtsRoot}.`
    );
  }

  for (const model of SHERPA_TTS_MODELS) {
    if (
      (await fileExists(join(sherpaTtsAssetsRoot, "tts-models", model.assetDir, "tokens.txt"))) !==
      true
    ) {
      plan.details.push(
        `${model.modelId} Piper TTS assets will be cached into ${sherpaTtsAssetsRoot}.`
      );
    }
  }

  if (
    (await fileExists(
      join(ncnnPiperSdkRoot, "armeabi-v7a", "lib", "cmake", "ncnn", "ncnnConfig.cmake")
    )) !== true
  ) {
    plan.details.push(
      `ncnn ${NCNN_ANDROID_VERSION} Android runtime will be cached into ${ncnnPiperRoot}.`
    );
  }

  if ((await fileExists(join(ncnnPiperAssetsRoot, "en-word_id.bin"))) !== true) {
    plan.details.push(
      `ncnn Piper English assets will be extracted from ${NCNN_PIPER_RELEASE} into ${ncnnPiperAssetsRoot}.`
    );
  }

  if ((await fileExists(join(ncnnPiperAssetsRoot, "tr_enc_p.ncnn.bin"))) !== true) {
    plan.details.push(
      `${NCNN_PIPER_TR_MODEL.modelId} ncnn Piper assets will be cached into ${ncnnPiperAssetsRoot}.`
    );
  }

  if (
    (await fileExists(join(ncnnPiperJniLibsRoot, "armeabi-v7a", "libhayalet_tts_ncnn.so"))) !==
      true ||
    (await fileExists(join(ncnnPiperJniLibsRoot, "arm64-v8a", "libhayalet_tts_ncnn.so"))) !== true
  ) {
    plan.details.push(
      `Hayalet ncnn Piper native TTS libraries will be built into ${ncnnPiperJniLibsRoot}.`
    );
  }

  plan.needsConfirmation = plan.details.length > 0;
  return plan;
}

async function resolveWhisperCppCheckoutTag(rootPath) {
  if ((await fileExists(join(rootPath, ".git"))) !== true) {
    return null;
  }

  const gitPath = await resolveExecutableOnPath("git");
  if (gitPath === null) {
    return null;
  }

  const result = await runCommand(gitPath, ["-C", rootPath, "describe", "--tags", "--exact-match"]);
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

async function ensureWhisperCppSource(emitProgress) {
  const notify = normalizeProgressEmitter(emitProgress);
  if ((await fileExists(join(whisperCppSourceRoot, "CMakeLists.txt"))) === true) {
    const checkoutTag = await resolveWhisperCppCheckoutTag(whisperCppSourceRoot);
    if (checkoutTag === WHISPER_CPP_TAG) {
      notify({
        message: "Using the prepared whisper.cpp source checkout.",
        progress: 0.76,
        detail: `whisper.cpp ${WHISPER_CPP_TAG} source is ready at ${whisperCppSourceRoot}.`,
      });
      return whisperCppSourceRoot;
    }

    notify({
      message: "Refreshing whisper.cpp source checkout.",
      progress: 0.73,
      detail: `Existing checkout is ${checkoutTag ?? "unverified"}; ${WHISPER_CPP_TAG} is required.`,
    });
  }

  const gitPath = await resolveExecutableOnPath("git");
  if (gitPath === null) {
    throw new Error("Android companion build needs git to prepare whisper.cpp sources.");
  }

  notify({
    message: "Cloning whisper.cpp for the Android native transcript runtime.",
    progress: 0.74,
    detail: `whisper.cpp ${WHISPER_CPP_TAG} will be cloned into ${whisperCppSourceRoot}.`,
  });
  await mkdir(dirname(whisperCppSourceRoot), { recursive: true });
  await rm(whisperCppSourceRoot, { recursive: true, force: true });
  const cloneResult = await runCommand(gitPath, [
    "clone",
    "--depth",
    "1",
    "--branch",
    WHISPER_CPP_TAG,
    WHISPER_CPP_REPOSITORY_URL,
    whisperCppSourceRoot,
  ]);
  if (cloneResult.exitCode !== 0) {
    throw new Error(
      cloneResult.stderr.trim() || cloneResult.stdout.trim() || "whisper.cpp clone failed."
    );
  }
  return whisperCppSourceRoot;
}

async function ensureSherpaTtsRuntime(emitProgress) {
  const notify = normalizeProgressEmitter(emitProgress);
  const runtimeLibraryPath = join(sherpaTtsJniLibsRoot, "arm64-v8a", "libsherpa-onnx-jni.so");
  const bindingPath = join(
    sherpaTtsGeneratedKotlinRoot,
    "com",
    "k2fsa",
    "sherpa",
    "onnx",
    "Tts.kt"
  );
  const ttsModelsRoot = join(sherpaTtsAssetsRoot, "tts-models");

  notify({
    message: "Preparing sherpa-onnx Android TTS runtime.",
    progress: 0.78,
    detail: `sherpa-onnx Android runtime and Piper voices are prepared under ${sherpaTtsRoot}.`,
  });

  await mkdir(downloadCacheRoot, { recursive: true });
  const runtimeArchivePath = join(
    downloadCacheRoot,
    `sherpa-onnx-${SHERPA_ONNX_VERSION}-android.tar.bz2`
  );
  if ((await fileExists(runtimeArchivePath)) !== true) {
    await downloadFile(SHERPA_ANDROID_RUNTIME_URL, runtimeArchivePath);
  }

  if ((await fileExists(runtimeLibraryPath)) !== true) {
    const extractDir = await mkdtemp(join(tmpdir(), "hayalet-ev-sherpa-android-"));
    try {
      await extractTarBzipArchive(runtimeArchivePath, extractDir);
    } catch (error) {
      throw new Error(
        `sherpa-onnx Android runtime extraction failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error }
      );
    }
    await rm(sherpaTtsJniLibsRoot, { recursive: true, force: true });
    await mkdir(dirname(sherpaTtsJniLibsRoot), { recursive: true });
    await cp(join(extractDir, "jniLibs"), sherpaTtsJniLibsRoot, { recursive: true });
    await rm(extractDir, { recursive: true, force: true });
  }

  await downloadFile(SHERPA_TTS_KOTLIN_API_URL, bindingPath);

  await mkdir(ttsModelsRoot, { recursive: true });
  for (const model of SHERPA_TTS_MODELS) {
    const modelRoot = join(ttsModelsRoot, model.assetDir);
    if ((await fileExists(join(modelRoot, "tokens.txt"))) === true) {
      continue;
    }

    const archivePath = join(downloadCacheRoot, model.archiveName);
    if ((await fileExists(archivePath)) !== true) {
      await downloadFile(model.url, archivePath);
    }

    await rm(modelRoot, { recursive: true, force: true });
    try {
      await extractTarBzipArchive(archivePath, ttsModelsRoot);
    } catch (error) {
      throw new Error(
        `${model.modelId} Piper TTS model extraction failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error }
      );
    }
  }

  notify({
    message: "sherpa-onnx Android TTS runtime is ready.",
    progress: 0.8,
    detail: `TTS runtime, bindings, and Piper voices are ready at ${sherpaTtsRoot}.`,
  });
}

async function buildNcnnPiperNativeLibraries(env) {
  const sdkRootCandidate = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT ?? null;
  const androidSdk =
    typeof sdkRootCandidate === "string"
      ? await inspectAndroidSdkRoot(sdkRootCandidate)
      : await resolveUsableAndroidSdk();
  if (androidSdk === null) {
    throw new Error("ncnn Piper native TTS build needs a usable Android SDK.");
  }

  const { cmakePath, ndkPath } = getExpectedAndroidSdkPaths(androidSdk.rootPath);
  const executableSuffix = process.platform === "win32" ? ".exe" : "";
  const cmakeBin = join(cmakePath, "bin", `cmake${executableSuffix}`);
  const ninjaBin = join(cmakePath, "bin", `ninja${executableSuffix}`);
  const toolchainFile = join(ndkPath, "build", "cmake", "android.toolchain.cmake");
  const sourceDir = join(projectRoot, "scripts", "android-ncnn-piper-native");

  for (const executable of [cmakeBin, ninjaBin, toolchainFile]) {
    if ((await fileExists(executable)) !== true) {
      throw new Error(`ncnn Piper native TTS build dependency is missing: ${executable}`);
    }
  }

  for (const abi of ["armeabi-v7a", "arm64-v8a"]) {
    const buildDir = join(ncnnPiperRoot, "native-build", abi);
    const outputDir = join(ncnnPiperJniLibsRoot, abi);
    await mkdir(buildDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    const configureResult = await runCommand(
      cmakeBin,
      [
        "-S",
        sourceDir,
        "-B",
        buildDir,
        "-G",
        "Ninja",
        `-DCMAKE_MAKE_PROGRAM=${ninjaBin}`,
        `-DANDROID_ABI=${abi}`,
        "-DANDROID_PLATFORM=android-28",
        `-DANDROID_NDK=${ndkPath}`,
        `-DCMAKE_TOOLCHAIN_FILE=${toolchainFile}`,
        "-DCMAKE_BUILD_TYPE=Release",
        `-DNCNN_ANDROID_SDK_DIR=${ncnnPiperSdkRoot}`,
      ],
      { env }
    );
    if (configureResult.exitCode !== 0) {
      throw new Error(
        configureResult.stderr.trim() ||
          configureResult.stdout.trim() ||
          `ncnn Piper native TTS configure failed for ${abi}.`
      );
    }

    const buildResult = await runCommand(
      cmakeBin,
      ["--build", buildDir, "--target", "hayalet_tts_ncnn", "--parallel", "2"],
      { env }
    );
    if (buildResult.exitCode !== 0) {
      throw new Error(
        buildResult.stderr.trim() ||
          buildResult.stdout.trim() ||
          `ncnn Piper native TTS build failed for ${abi}.`
      );
    }

    const builtLibraryPath = join(buildDir, "libhayalet_tts_ncnn.so");
    if ((await fileExists(builtLibraryPath)) !== true) {
      throw new Error(`ncnn Piper native TTS output is missing: ${builtLibraryPath}`);
    }
    await cp(builtLibraryPath, join(outputDir, "libhayalet_tts_ncnn.so"));
  }
}

async function ensureNcnnPiperTtsRuntime(emitProgress, env = process.env) {
  const notify = normalizeProgressEmitter(emitProgress);
  const ncnnConfigPath = join(
    ncnnPiperSdkRoot,
    "armeabi-v7a",
    "lib",
    "cmake",
    "ncnn",
    "ncnnConfig.cmake"
  );

  notify({
    message: "Preparing ncnn Piper Android TTS runtime.",
    progress: 0.81,
    detail: `ncnn runtime and Piper assets are prepared under ${ncnnPiperRoot}.`,
  });

  await mkdir(downloadCacheRoot, { recursive: true });
  const runtimeArchivePath = join(
    downloadCacheRoot,
    `ncnn-${NCNN_ANDROID_VERSION}-android-vulkan.zip`
  );
  if ((await fileExists(runtimeArchivePath)) !== true) {
    await downloadFile(NCNN_ANDROID_RUNTIME_URL, runtimeArchivePath);
  }

  if ((await fileExists(ncnnConfigPath)) !== true) {
    await rm(ncnnPiperSdkRoot, { recursive: true, force: true });
    await mkdir(ncnnPiperRoot, { recursive: true });
    await extractZipArchive(runtimeArchivePath, ncnnPiperRoot).catch((error) => {
      throw new Error(
        `ncnn Android runtime extraction failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });
  }

  await mkdir(ncnnPiperAssetsRoot, { recursive: true });

  const sampleApkPath = join(downloadCacheRoot, `ncnn-android-piper-${NCNN_PIPER_RELEASE}.apk`);
  if ((await fileExists(sampleApkPath)) !== true) {
    await downloadFile(NCNN_PIPER_APK_URL, sampleApkPath);
  }

  if ((await fileExists(join(ncnnPiperAssetsRoot, "en-word_id.bin"))) !== true) {
    await extractZipArchive(sampleApkPath, ncnnPiperAssetsRoot, {
      entries: ["assets/en_*", "assets/en-word_id.bin"],
      junkPaths: true,
    }).catch((error) => {
      throw new Error(
        `ncnn Piper English asset extraction failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });
  }

  const trArchivePath = join(downloadCacheRoot, NCNN_PIPER_TR_MODEL.archiveName);
  if ((await fileExists(trArchivePath)) !== true) {
    await downloadFile(NCNN_PIPER_TR_MODEL.url, trArchivePath);
  }

  if ((await fileExists(join(ncnnPiperAssetsRoot, "tr_enc_p.ncnn.bin"))) !== true) {
    await extractZipArchive(trArchivePath, ncnnPiperAssetsRoot, {
      entries: ["tr_TR-fahrettin/tr_*"],
      junkPaths: true,
    }).catch((error) => {
      throw new Error(
        `${NCNN_PIPER_TR_MODEL.modelId} ncnn Piper asset extraction failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });
  }

  await buildNcnnPiperNativeLibraries(env);

  notify({
    message: "ncnn Piper Android TTS runtime is ready.",
    progress: 0.82,
    detail: `ncnn runtime and Piper assets are ready at ${ncnnPiperRoot}.`,
  });
}

export async function prepareCompanionBuildEnvironment(options = {}) {
  const { autoInstall = false, emitProgress = null } = options;
  const notify = normalizeProgressEmitter(emitProgress);
  const plan = await planCompanionBuildEnvironment();
  if (plan.needsConfirmation && autoInstall !== true) {
    return {
      ...plan,
      javaRuntime: await resolveCompatibleJavaRuntime(),
      androidSdk: await resolveUsableAndroidSdk(),
      env: null,
    };
  }

  let javaRuntime = await resolveCompatibleJavaRuntime();
  if (javaRuntime === null) {
    javaRuntime = await installManagedJdk(notify);
  } else {
    notify({
      message: "Using the detected Java runtime.",
      progress: 0.14,
      detail: `Builds will use Java ${String(javaRuntime.major)} from ${javaRuntime.javaHome}.`,
    });
  }

  let androidSdk = await resolveUsableAndroidSdk();
  if (androidSdk === null) {
    androidSdk = await installManagedAndroidSdk(javaRuntime, notify);
  } else {
    notify({
      message: "Using the detected Android SDK.",
      progress: 0.42,
      detail: `Builds will use the Android SDK at ${androidSdk.rootPath}.`,
    });
  }

  return {
    needsConfirmation: false,
    details: [],
    javaRuntime,
    androidSdk,
    env: {
      ...process.env,
      JAVA_HOME: javaRuntime.javaHome,
      ANDROID_HOME: androidSdk.rootPath,
      ANDROID_SDK_ROOT: androidSdk.rootPath,
      PATH: `${join(javaRuntime.javaHome, "bin")}${process.platform === "win32" ? ";" : ":"}${
        process.env.PATH ?? ""
      }`,
    },
  };
}

async function writeCompanionLocalProperties(androidSdkRoot) {
  const normalizedSdkRoot = String(androidSdkRoot).replace(/\\/g, "/");
  await writeFile(
    join(companionRoot, "local.properties"),
    `sdk.dir=${normalizedSdkRoot}\n`,
    "utf8"
  );
}

export async function buildCompanionArtifact(options = {}) {
  const { env = process.env, emitProgress = null, stdio = "inherit" } = options;
  const notify = normalizeProgressEmitter(emitProgress);
  await mkdir(artifactRoot, { recursive: true });

  if ((await fileExists(wrapperPath)) !== true) {
    throw new Error(
      "android-companion Gradle wrapper is missing. Run npm run android:check after syncing wrapper files."
    );
  }

  await ensureWhisperCppSource(notify);
  await ensureSherpaTtsRuntime(notify);
  await ensureNcnnPiperTtsRuntime(notify, env);

  const javaRuntime = (await inspectJavaHome(env.JAVA_HOME ?? "")) ?? (await inspectPathJava());
  if (javaRuntime === null) {
    throw new Error("Android companion build is blocked: Java was not found on PATH.");
  }
  if (javaRuntime.major > 21) {
    throw new Error(
      `Android companion build is blocked: Java ${String(javaRuntime.major)} is not supported. Use JDK 17 or 21.`
    );
  }
  const androidSdkRoot = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT ?? null;
  if (typeof androidSdkRoot !== "string" || androidSdkRoot.trim() === "") {
    throw new Error("Android companion build is blocked: Android SDK root was not resolved.");
  }
  await writeCompanionLocalProperties(androidSdkRoot);

  notify({
    message: "Building the Android companion APK with Gradle.",
    progress: 0.82,
    detail: "Gradle is running assembleDebug for android-companion.",
  });
  const buildResult = await runCommand(wrapperPath, ["assembleDebug"], {
    cwd: companionRoot,
    stdio,
    env: {
      ...env,
      HAYALET_EV_WHISPER_CPP_DIR: whisperCppSourceRoot,
    },
  });
  if (buildResult.exitCode !== 0) {
    throw new Error(
      buildResult.stderr.trim() ||
        buildResult.stdout.trim() ||
        `android-companion build failed with exit code ${String(buildResult.exitCode)}`
    );
  }

  const manifest = await loadSourceManifest();
  const apkSourcePath = join(
    companionRoot,
    "app",
    "build",
    "outputs",
    "apk",
    "debug",
    "app-debug.apk"
  );
  if ((await fileExists(apkSourcePath)) !== true) {
    throw new Error(`Expected APK was not found at ${apkSourcePath}`);
  }

  notify({
    message: "Publishing the APK into the artifact cache.",
    progress: 0.94,
    detail: `The APK is being copied into ${artifactRoot}.`,
  });
  await rm(artifactRoot, { recursive: true, force: true });
  await mkdir(artifactRoot, { recursive: true });
  const apkArtifactPath = join(artifactRoot, `${manifest.applicationId}-debug.apk`);
  await cp(apkSourcePath, apkArtifactPath);

  const artifactManifest = {
    ...manifest,
    builtAt: new Date().toISOString(),
    sourceManifestPath,
    apkPath: apkArtifactPath,
    sourceApkPath: apkSourcePath,
  };
  await writeJsonFile(artifactManifestPath, artifactManifest);

  notify({
    message: "Android companion artifact is ready.",
    progress: 1,
    detail: `Artifact manifest was published to ${artifactManifestPath}.`,
  });
  return artifactManifest;
}

/**
 * @param {object} [options]
 * @param {boolean} [options.buildIfMissing]
 * @param {boolean} [options.autoBootstrap]
 * @param {Function|null} [options.emitProgress]
 * @param {{ companionRoot?: string; artifactManifestPath?: string; extraInputRoots?: string[]; } | null} [options.paths]
 */
export async function resolveInstallableArtifact({
  buildIfMissing = false,
  autoBootstrap = false,
  emitProgress = null,
  paths = null,
} = {}) {
  const resolvedPaths = {
    companionRoot: typeof paths?.companionRoot === "string" ? paths.companionRoot : companionRoot,
    artifactManifestPath:
      typeof paths?.artifactManifestPath === "string"
        ? paths.artifactManifestPath
        : artifactManifestPath,
    extraInputRoots: [whisperCppSourceRoot],
  };
  const artifactState = await inspectCompanionArtifactCache(resolvedPaths);
  if (artifactState.artifactReady === true && artifactState.artifactFresh === true) {
    return artifactState.artifactManifest;
  }

  if (buildIfMissing !== true) {
    return null;
  }

  const prepared = await prepareCompanionBuildEnvironment({
    autoInstall: autoBootstrap,
    emitProgress,
  });
  if (prepared.needsConfirmation === true) {
    return null;
  }

  return await buildCompanionArtifact({
    env: prepared.env,
    emitProgress,
    stdio: "inherit",
  });
}
