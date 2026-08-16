import { getExtension, getFilename, getMimeTypeFromPath } from "../../constants/index.js";
import { AppI18n } from "../../modules/i18n/index.js";
export interface StagedFile {
  name: string;
  path: string;
  commandPath?: string;
  originalName?: string;
}

interface OpenPathResult {
  success?: boolean;
  message?: string;
}

function analyzeUploadT(key: string, params?: Record<string, string | number>): string {
  return AppI18n.t(`app.analyze.upload.${key}`, params);
}

function resolveUploadFilePath(file: StagedFile): string {
  const path = file.path.trim();
  if (path !== "") {
    return path;
  }

  return file.commandPath?.trim() ?? "";
}

function resolveUploadDisplayName(file: StagedFile): string {
  const displayName = (file.originalName ?? file.name).trim();
  if (displayName !== "") {
    return displayName;
  }

  return getFilename(resolveUploadFilePath(file));
}

function resolveUploadDetectionPath(file: StagedFile): string {
  const displayName = resolveUploadDisplayName(file);
  return displayName !== "" ? displayName : resolveUploadFilePath(file);
}

function isImageUpload(file: StagedFile): boolean {
  return getMimeTypeFromPath(resolveUploadDetectionPath(file)).startsWith("image/");
}

function getUploadKindLabel(file: StagedFile): string {
  const extension = getExtension(resolveUploadDetectionPath(file));
  if (extension === "") {
    return "FILE";
  }

  return extension.slice(0, 4).toUpperCase();
}

async function hydrateUploadThumbnail(
  image: HTMLImageElement,
  fallback: HTMLElement,
  file: StagedFile
): Promise<void> {
  try {
    const filePath = resolveUploadFilePath(file);
    const readFile = window.electronAPI?.readFile;
    if (filePath === "" || typeof readFile !== "function") {
      return;
    }

    const base64 = await readFile(filePath);
    if (base64 === null || base64.trim() === "") {
      return;
    }

    image.src = `data:${getMimeTypeFromPath(resolveUploadDetectionPath(file))};base64,${base64}`;
    fallback.hidden = true;
  } catch (_err) {
    fallback.hidden = false;
  }
}

async function openUploadFile(file: StagedFile): Promise<void> {
  try {
    const filePath = resolveUploadFilePath(file);
    const openPath = window.electronAPI?.openPath;
    if (filePath === "" || typeof openPath !== "function") {
      return;
    }

    const result = (await openPath(filePath)) as OpenPathResult | undefined;
    if (result?.success === false) {
      return;
    }
  } catch (_err) {
    return;
  }
}

export function renderUploadList(
  stagedFiles: StagedFile[],
  onRemove: (name: string) => void
): void {
  const box = document.getElementById("upload-list");
  const info = document.querySelector(".files-header div");

  if (!box) return;

  box.innerHTML = "";

  if (stagedFiles.length === 0) {
    box.textContent = analyzeUploadT("empty");
    if (info) info.textContent = analyzeUploadT("empty");
    return;
  }

  if (info) info.textContent = analyzeUploadT("count", { count: stagedFiles.length });

  stagedFiles.forEach((file: StagedFile) => {
    const row = document.createElement("div");
    row.className = "upload-item";

    const displayName = resolveUploadDisplayName(file);
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "upload-open";
    openButton.title = displayName;
    openButton.setAttribute("aria-label", displayName);
    openButton.addEventListener("click", () => {
      void openUploadFile(file);
    });

    const thumb = document.createElement("span");
    thumb.className = "upload-thumb";

    const kind = document.createElement("span");
    kind.className = "upload-kind";
    kind.textContent = getUploadKindLabel(file);
    thumb.appendChild(kind);

    if (isImageUpload(file)) {
      thumb.classList.add("upload-thumb--image");
      const image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      thumb.appendChild(image);
      void hydrateUploadThumbnail(image, kind, file);
    }

    const name = document.createElement("span");
    name.className = "upload-name";
    name.textContent = displayName;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "upload-remove";
    btn.textContent = "×";
    btn.title = analyzeUploadT("removeTitle");
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onRemove(file.name);
    });

    openButton.appendChild(thumb);
    openButton.appendChild(name);
    row.appendChild(openButton);
    row.appendChild(btn);
    box.appendChild(row);
  });
}

export async function addUploadFiles(currentFiles: StagedFile[]): Promise<StagedFile[]> {
  try {
    const showOpenDialog = window.electronAPI?.showOpenDialog;
    if (typeof showOpenDialog !== "function") {
      return currentFiles;
    }

    const selection = await showOpenDialog({
      properties: ["openFile", "multiSelections"],
    });

    if (selection.canceled) return currentFiles;

    const paths = selection.filePaths;
    if (paths.length === 0) return currentFiles;

    const newEntries = paths.map((p) => {
      const name = getFilename(String(p));
      return { name, path: p };
    });

    return mergeUploadFiles(currentFiles, newEntries);
  } catch (_err) {
    return currentFiles;
  }
}

export function mergeUploadFiles(
  currentFiles: StagedFile[],
  nextFiles: StagedFile[]
): StagedFile[] {
  const merged = [...currentFiles];

  nextFiles.forEach((file) => {
    const exists = merged.some(
      (entry) => entry.path === file.path || (entry.name === file.name && entry.path === file.path)
    );
    if (exists) {
      return;
    }

    merged.push(file);
  });

  return merged;
}

export function removeUploadFile(currentFiles: StagedFile[], name: string): StagedFile[] {
  return currentFiles.filter((f: StagedFile) => f.name !== name);
}
