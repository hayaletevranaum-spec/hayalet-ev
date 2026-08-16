#!/usr/bin/env node

import { createHash } from "crypto";
import {
  createReadStream,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { google } from "googleapis";
import { dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const SYNC_DIR = "HayaletEv";
const CACHE_FILE = join(PROJECT_ROOT, ".sync-cache.json");
const SETTINGS_FILE = join(PROJECT_ROOT, "settings.json");

function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix =
    {
      info: "✓",
      warn: "⚠",
      error: "✗",
      debug: "→",
    }[level] || "•";
  const output = `[${timestamp}] ${prefix} ${message}`;
  if (data) {
    console.log(output, data);
  } else {
    console.log(output);
  }
}

function loadSettings() {
  if (!existsSync(SETTINGS_FILE)) {
    throw new Error(`Settings dosyası bulunamadı: ${SETTINGS_FILE}`);
  }
  const content = readFileSync(SETTINGS_FILE, "utf-8");
  return JSON.parse(content);
}

function saveSettings(settings) {
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function loadSyncCache() {
  if (existsSync(CACHE_FILE)) {
    try {
      const content = readFileSync(CACHE_FILE, "utf-8");
      return JSON.parse(content);
    } catch {
      log("warn", "Cache dosyası okunamadı, yeniden oluşturulacak");
    }
  }
  return {};
}

function saveSyncCache(cache) {
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function getFileHash(filePath) {
  try {
    const content = readFileSync(filePath);
    return createHash("md5").update(content).digest("hex");
  } catch {
    return null;
  }
}

function isFileChanged(filePath, cache) {
  const relativePath = relative(PROJECT_ROOT, filePath);
  const cachedHash = cache[relativePath];
  const currentHash = getFileHash(filePath);
  return !currentHash || currentHash !== cachedHash;
}

function shouldIgnoreFile(filePath) {
  const ignorePatterns = [
    "node_modules/",
    "dist/",
    ".env",
    ".env.local",
    ".env.*.local",
    "settings.json",
    "settings.json.template",
    "*.tokens",
    "logs/",
    "*.log",
    "npm-debug.log*",
    "yarn-debug.log*",
    "yarn-error.log*",
    ".DS_Store",
    "Thumbs.db",
    "Desktop.ini",
    "archives/",
    "screenshots/",
    "captures/",
    "output/",
    "tmp/",
    "temp/",
    "*.tmp",
    "*.temp",
    "out/",
    "build/",
    "*.dmg",
    "*.exe",
    "*.AppImage",
    "*.deb",
    "*.rpm",
    "user-data/",
    "cache/",
    ".git/",
    ".sync-cache.json",
    "scripts/",
  ];

  const relativePath = relative(PROJECT_ROOT, filePath);

  for (const pattern of ignorePatterns) {
    if (pattern.endsWith("/")) {
      if (relativePath.startsWith(pattern)) return true;
    } else if (pattern.includes("*")) {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*").replace(/\./g, "\\.") + "$");
      if (regex.test(relativePath)) return true;
    } else if (relativePath === pattern) {
      return true;
    }
  }

  return false;
}

function collectFiles(dir, fileList = []) {
  const files = readdirSync(dir);

  for (const file of files) {
    const filePath = join(dir, file);
    const stat = statSync(filePath);

    if (stat.isDirectory()) {
      if (!shouldIgnoreFile(filePath)) {
        collectFiles(filePath, fileList);
      }
    } else {
      if (!shouldIgnoreFile(filePath)) {
        fileList.push(filePath);
      }
    }
  }

  return fileList;
}

async function getOrCreateFolder(drive, name, parentId = null) {
  try {
    let query = `name = '${name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    if (parentId) {
      query += ` and '${parentId}' in parents`;
    }

    const response = await drive.files.list({
      q: query,
      fields: "files(id,name)",
      spaces: "drive",
    });

    if (response.data.files.length > 0) {
      return response.data.files[0].id;
    }

    const folderMetadata = {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    };

    const folder = await drive.files.create({
      requestBody: folderMetadata,
      fields: "id",
    });

    return folder.data.id;
  } catch (err) {
    log("error", `Klasör oluşturma hatası: ${name}`, err.message);
    throw err;
  }
}

async function getOrCreateFolderStructure(drive, filePath, rootFolderId) {
  const relativePath = relative(PROJECT_ROOT, filePath);
  const parts = relativePath.split("/");
  parts.pop();

  let currentFolderId = rootFolderId;

  for (const part of parts) {
    currentFolderId = await getOrCreateFolder(drive, part, currentFolderId);
  }

  return currentFolderId;
}

async function uploadFile(drive, filePath, folderId, fileName) {
  const fileMetadata = {
    name: fileName,
    parents: [folderId],
  };

  const media = {
    mimeType: "application/octet-stream",
    body: createReadStream(filePath),
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: "id,name,size",
  });

  return response.data;
}

async function main() {
  try {
    log("info", "Google Drive senkronizasyon başlatılıyor...");

    const settings = loadSettings();
    const gconf = settings.integrations?.googledrive || {};

    const clientId = gconf.clientId || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = gconf.clientSecret || process.env.GOOGLE_CLIENT_SECRET;
    const tokens = gconf.tokens;

    if (!clientId || !clientSecret) {
      throw new Error(
        "Google Client ID/Secret ayarlı değil. Lütfen önce uygulamada Google Drive'a bağlanın."
      );
    }

    if (!tokens) {
      throw new Error(
        "Google Drive yetkilendirme eksik. Lütfen önce uygulamada Google Drive'a bağlanın."
      );
    }

    const redirect = "urn:ietf:wg:oauth:2.0:oob";
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirect);
    oauth2Client.setCredentials(tokens);

    oauth2Client.on("tokens", (newTokens) => {
      if (newTokens.access_token || newTokens.refresh_token) {
        log("info", "Token yenilendi, settings güncelleniyor...");
        settings.integrations = settings.integrations || {};
        settings.integrations.googledrive = settings.integrations.googledrive || {};
        settings.integrations.googledrive.tokens = { ...tokens, ...newTokens };
        saveSettings(settings);
      }
    });

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    try {
      await drive.files.list({ pageSize: 1, fields: "files(id)" });
    } catch (err) {
      if (err.code === 401 || err.message.includes("invalid_grant")) {
        throw new Error("Token süresi geçmiş. Lütfen uygulamada Google Drive'a yeniden bağlanın.", { cause: err });
      }
      throw err;
    }

    log("info", "Google Drive bağlantısı başarılı");

    const rootFolderId = await getOrCreateFolder(drive, SYNC_DIR);
    log("info", `Klasör hazır: ${SYNC_DIR} (ID: ${rootFolderId})`);

    const cache = loadSyncCache();
    const allFiles = collectFiles(PROJECT_ROOT);
    log("info", `${allFiles.length} dosya tespit edildi`);

    const filesToUpload = [];
    const unchangedFiles = [];

    for (const filePath of allFiles) {
      if (isFileChanged(filePath, cache)) {
        filesToUpload.push(filePath);
      } else {
        unchangedFiles.push(filePath);
      }
    }

    log("info", `${filesToUpload.length} dosya değişmiş, ${unchangedFiles.length} dosya güncel`);

    if (filesToUpload.length === 0) {
      log("info", "Yüklenecek dosya yok, senkronizasyon tamamlandı");
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < filesToUpload.length; i++) {
      const filePath = filesToUpload[i];
      const fileName = relative(PROJECT_ROOT, filePath);

      try {
        log("info", `[${i + 1}/${filesToUpload.length}] Yükleniyor: ${fileName}`);

        const folderId = await getOrCreateFolderStructure(drive, filePath, rootFolderId);

        const fileBaseName = fileName.split("/").pop();

        const uploadResult = await uploadFile(drive, filePath, folderId, fileBaseName);

        if (uploadResult && uploadResult.id) {
          const fileHash = getFileHash(filePath);
          if (fileHash) {
            cache[fileName] = fileHash;
          }
          successCount++;
        } else {
          log("error", `Yükleme başarısız (ID eksik): ${fileName}`);
          errorCount++;
        }
      } catch (err) {
        log("error", `Yükleme başarısız: ${fileName}`, err.message);
        errorCount++;
      }
    }

    saveSyncCache(cache);

    log("info", "Senkronizasyon tamamlandı");
    log("info", `Başarılı: ${successCount}, Hatalı: ${errorCount}`);

    if (errorCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    log("error", "Senkronizasyon hatası:", err.message);
    process.exit(1);
  }
}

main();
