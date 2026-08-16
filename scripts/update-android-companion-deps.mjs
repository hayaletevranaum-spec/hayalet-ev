import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { companionRoot } from "./android-companion-utils.mjs";

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check") || args.has("--dry-run");
const allowPrerelease = args.has("--allow-prerelease");
const userAgent = "HayaletEvAndroidCompanionUpdater/1.0";
const gradleCurrentVersionUrl = "https://services.gradle.org/versions/current";

const repositories = [
  {
    name: "Google Maven",
    baseUrl: "https://dl.google.com/dl/android/maven2",
  },
  {
    name: "Maven Central",
    baseUrl: "https://repo.maven.apache.org/maven2",
  },
  {
    name: "Gradle Plugin Portal",
    baseUrl: "https://plugins.gradle.org/m2",
  },
];

const files = [
  {
    path: join(companionRoot, "build.gradle.kts"),
    extract: extractPluginCoordinates,
  },
  {
    path: join(companionRoot, "app", "build.gradle.kts"),
    extract: extractDependencyCoordinates,
  },
];
const gradleWrapperPropertiesPath = join(companionRoot, "gradle", "wrapper", "gradle-wrapper.properties");

function coordinateKey(coordinate) {
  return `${coordinate.group}:${coordinate.artifact}`;
}

function escapePropertiesUrl(url) {
  return url.replace("https://", "https\\://");
}

function isPrereleaseVersion(version) {
  return /(?:^|[.\-_+])(?:alpha|a|beta|b|rc|cr|dev|eap|preview|snapshot|m)(?:[.\-_+]?\d*)?$/i.test(
    version
  );
}

function versionTokens(version) {
  return String(version)
    .toLowerCase()
    .split(/(?<=\d)(?=[a-z])|(?<=[a-z])(?=\d)|[.\-_+]/)
    .filter(Boolean);
}

function qualifierRank(token) {
  const normalized = token.toLowerCase();
  const ranks = new Map([
    ["snapshot", -7],
    ["dev", -6],
    ["eap", -5],
    ["preview", -4],
    ["alpha", -3],
    ["a", -3],
    ["beta", -2],
    ["b", -2],
    ["m", -1],
    ["milestone", -1],
    ["rc", 0],
    ["cr", 0],
    ["final", 1],
    ["ga", 1],
    ["release", 1],
    ["sp", 2],
  ]);
  return ranks.get(normalized) ?? 1;
}

function compareVersions(left, right) {
  const leftTokens = versionTokens(left);
  const rightTokens = versionTokens(right);
  const count = Math.max(leftTokens.length, rightTokens.length);

  for (let index = 0; index < count; index += 1) {
    const leftToken = leftTokens[index] ?? "";
    const rightToken = rightTokens[index] ?? "";
    if (leftToken === rightToken) {
      continue;
    }

    const leftNumber = /^\d+$/.test(leftToken) ? Number.parseInt(leftToken, 10) : null;
    const rightNumber = /^\d+$/.test(rightToken) ? Number.parseInt(rightToken, 10) : null;
    if (leftNumber !== null || rightNumber !== null) {
      if (leftNumber === null) {
        return -1;
      }
      if (rightNumber === null) {
        return 1;
      }
      return Math.sign(leftNumber - rightNumber);
    }

    if (leftToken === "") {
      return qualifierRank("release") > qualifierRank(rightToken) ? 1 : -1;
    }
    if (rightToken === "") {
      return qualifierRank(leftToken) > qualifierRank("release") ? 1 : -1;
    }

    const rankDifference = qualifierRank(leftToken) - qualifierRank(rightToken);
    if (rankDifference !== 0) {
      return Math.sign(rankDifference);
    }

    return leftToken.localeCompare(rightToken);
  }

  return 0;
}

function pickNewestVersion(versions, currentVersion) {
  const candidates = allowPrerelease ? versions : versions.filter((version) => !isPrereleaseVersion(version));
  const newest = [...candidates].sort(compareVersions).at(-1) ?? null;
  if (newest !== null && compareVersions(newest, currentVersion) > 0) {
    return newest;
  }

  return null;
}

function parseVersions(metadata) {
  return [...metadata.matchAll(/<version>([^<]+)<\/version>/g)]
    .map((match) => match[1]?.trim())
    .filter((version) => typeof version === "string" && version !== "");
}

function metadataUrl(repository, coordinate) {
  const groupPath = coordinate.group.replaceAll(".", "/");
  return `${repository.baseUrl}/${groupPath}/${coordinate.artifact}/maven-metadata.xml`;
}

async function fetchMetadata(coordinate) {
  for (const repository of repositories) {
    const url = metadataUrl(repository, coordinate);
    const response = await fetch(url, {
      headers: {
        "user-agent": userAgent,
      },
    }).catch((error) => ({
      ok: false,
      status: 0,
      statusText: error instanceof Error ? error.message : String(error),
    }));

    if (response.ok !== true) {
      continue;
    }

    return {
      repository: repository.name,
      metadata: await response.text(),
    };
  }

  return null;
}

async function fetchCurrentGradleVersion() {
  const response = await fetch(gradleCurrentVersionUrl, {
    headers: {
      "user-agent": userAgent,
    },
  });
  if (response.ok !== true) {
    throw new Error(`Gradle current version metadata returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (
    typeof payload.version !== "string" ||
    typeof payload.downloadUrl !== "string" ||
    payload.version.trim() === "" ||
    payload.downloadUrl.trim() === ""
  ) {
    throw new Error("Gradle current version metadata did not include version and downloadUrl.");
  }

  return {
    version: payload.version.trim(),
    downloadUrl: payload.downloadUrl.trim(),
  };
}

async function resolveGradleWrapperUpdate() {
  const source = await readFile(gradleWrapperPropertiesPath, "utf8");
  const match = source.match(/^distributionUrl=(.+gradle-([^-]+)-(?:bin|all)\.zip)$/m);
  if (match === null) {
    throw new Error("Could not find Gradle wrapper distributionUrl.");
  }

  const currentVersion = match[2];
  const currentGradle = await fetchCurrentGradleVersion();
  if (compareVersions(currentGradle.version, currentVersion) <= 0) {
    return null;
  }

  return {
    kind: "gradle-wrapper",
    filePath: gradleWrapperPropertiesPath,
    currentVersion,
    nextVersion: currentGradle.version,
    sourceText: match[1],
    nextText: escapePropertiesUrl(currentGradle.downloadUrl),
  };
}

function extractPluginCoordinates(source) {
  return [...source.matchAll(/id\("([^"]+)"\)\s+version\s+"([^"]+)"/g)].map((match) => {
    const pluginId = match[1];
    return {
      group: pluginId,
      artifact: `${pluginId}.gradle.plugin`,
      currentVersion: match[2],
      sourceText: match[0],
      nextText(version) {
        return match[0].replace(`version "${match[2]}"`, `version "${version}"`);
      },
    };
  });
}

function extractDependencyCoordinates(source) {
  return [
    ...source.matchAll(
      /(implementation|api|compileOnly|runtimeOnly|testImplementation|androidTestImplementation)\("([^":]+):([^":]+):([^"]+)"\)/g
    ),
  ].map((match) => ({
    group: match[2],
    artifact: match[3],
    currentVersion: match[4],
    sourceText: match[0],
    nextText(version) {
      return `${match[1]}("${match[2]}:${match[3]}:${version}")`;
    },
  }));
}

async function resolveUpdates() {
  const updates = [];
  const failures = [];

  for (const file of files) {
    const source = await readFile(file.path, "utf8");
    const coordinates = file.extract(source);

    for (const coordinate of coordinates) {
      const metadataResult = await fetchMetadata(coordinate);
      if (metadataResult === null) {
        failures.push(`${coordinateKey(coordinate)} (${file.path})`);
        continue;
      }

      const versions = parseVersions(metadataResult.metadata);
      const nextVersion = pickNewestVersion(versions, coordinate.currentVersion);
      if (nextVersion === null) {
        continue;
      }

      updates.push({
        kind: "maven-coordinate",
        filePath: file.path,
        coordinate,
        nextVersion,
        repository: metadataResult.repository,
      });
    }
  }

  try {
    const gradleWrapperUpdate = await resolveGradleWrapperUpdate();
    if (gradleWrapperUpdate !== null) {
      updates.push(gradleWrapperUpdate);
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  return { updates, failures };
}

function printSummary(updates, failures) {
  if (updates.length === 0) {
    console.log("Android companion Gradle dependencies are up to date.");
  } else {
    console.log(
      `Android companion Gradle ${updates.length === 1 ? "update" : "updates"} ${
        checkOnly ? "available" : "applied"
      }:`
    );
    for (const update of updates) {
      if (update.kind === "gradle-wrapper") {
        console.log(`- Gradle wrapper ${update.currentVersion} -> ${update.nextVersion}`);
      } else {
        console.log(
          `- ${coordinateKey(update.coordinate)} ${update.coordinate.currentVersion} -> ${
            update.nextVersion
          } (${update.repository})`
        );
      }
    }
  }

  if (failures.length > 0) {
    console.error("Could not resolve metadata for:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
  }
}

async function applyUpdates(updates) {
  const updatesByFile = Map.groupBy(updates, (update) => update.filePath);
  for (const [filePath, fileUpdates] of updatesByFile) {
    let source = await readFile(filePath, "utf8");
    for (const update of fileUpdates) {
      if (update.kind === "gradle-wrapper") {
        source = source.replace(update.sourceText, update.nextText);
      } else {
        source = source.replace(update.coordinate.sourceText, update.coordinate.nextText(update.nextVersion));
      }
    }
    await writeFile(filePath, source, "utf8");
  }
}

const { updates, failures } = await resolveUpdates();
if (checkOnly !== true && updates.length > 0) {
  await applyUpdates(updates);
}
printSummary(updates, failures);

if (failures.length > 0) {
  process.exitCode = 1;
}
