import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { dirname, join, posix } from "node:path";

function readTarString(buffer, start, length) {
  return buffer
    .subarray(start, start + length)
    .toString("utf8")
    .replace(/\0.*$/u, "")
    .trim();
}

function parseTarSize(buffer) {
  const rawSize = readTarString(buffer, 124, 12);
  if (rawSize === "") {
    return 0;
  }

  const parsed = Number.parseInt(rawSize, 8);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid tar entry size: ${rawSize}`);
  }

  return parsed;
}

function resolveSafeTarPath(destinationDir, entryName) {
  const normalized = posix.normalize(entryName).replace(/^\/+/u, "");
  const segments = normalized.split("/").filter((segment) => segment !== "");

  if (segments.length === 0 || segments.some((segment) => segment === "..")) {
    throw new Error(`Unsafe tar entry path: ${entryName}`);
  }

  return join(destinationDir, ...segments);
}

export function extractTgz(tarballPath, destinationDir) {
  const tarBuffer = gunzipSync(readFileSync(tarballPath));
  let offset = 0;
  let extractedEntries = 0;

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }

    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const entryName = prefix === "" ? name : `${prefix}/${name}`;
    const typeFlag = readTarString(header, 156, 1) || "0";
    const size = parseTarSize(header);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;

    if (dataEnd > tarBuffer.length) {
      throw new Error(`Tar entry extends beyond archive: ${entryName}`);
    }

    const targetPath = resolveSafeTarPath(destinationDir, entryName);
    if (typeFlag === "5") {
      mkdirSync(targetPath, { recursive: true });
      extractedEntries += 1;
    } else if (typeFlag === "0") {
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, tarBuffer.subarray(dataStart, dataEnd));
      extractedEntries += 1;
    }

    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  if (extractedEntries === 0) {
    throw new Error(`No extractable entries found in ${tarballPath}`);
  }
}
