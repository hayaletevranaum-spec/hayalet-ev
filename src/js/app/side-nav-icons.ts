import entranceIconMarkup from "../../assets/nav-icons/entrance.svg?raw";
import analyzeIconMarkup from "../../assets/nav-icons/analyze.svg?raw";
import assistantIconMarkup from "../../assets/nav-icons/assistant.svg?raw";
import serverIconMarkup from "../../assets/nav-icons/server.svg?raw";
import roomsIconMarkup from "../../assets/nav-icons/rooms.svg?raw";
import { decodeBase64 } from "../constants/index.js";
import {
  getRoomRuntimeAssetSource,
  resolveRoomRuntimeAssetSource,
} from "../modules/rooms/room-runtime-url.js";

const STATIC_PAGE_NAV_ICON_MARKUP: Record<string, string> = {
  analyze: analyzeIconMarkup,
  assistant: assistantIconMarkup,
  entrance: entranceIconMarkup,
  rooms: roomsIconMarkup,
  server: serverIconMarkup,
};

const sideNavSvgMarkupCache = new Map<string, Promise<string | null>>();
let sideNavIconRenderCounter = 0;

function normalizeIconSource(rawSource: string): string {
  return rawSource.replace(/\\/g, "/").trim();
}

function getSideNavIconFallback(icon: HTMLElement): string {
  const configuredFallback = icon.dataset["sideNavIconFallback"]?.trim();
  if (configuredFallback !== undefined && configuredFallback !== "") {
    return configuredFallback;
  }

  return icon.textContent.trim();
}

function renderSideNavIconFallback(icon: HTMLElement, fallback: string): void {
  icon.dataset["sideNavIconKind"] = "text";
  icon.replaceChildren(document.createTextNode(fallback));
}

function renderSideNavImageIcon(icon: HTMLElement, source: string, fallback: string): void {
  const image = document.createElement("img");
  image.className = "side-nav-icon-image";
  image.alt = "";
  image.decoding = "async";
  image.loading = "lazy";
  image.src = source;
  image.addEventListener(
    "error",
    () => {
      renderSideNavIconFallback(icon, fallback);
    },
    { once: true }
  );

  icon.dataset["sideNavIconKind"] = "image";
  icon.replaceChildren(image);
}

function isSvgIconSource(source: string): boolean {
  return source.startsWith("data:image/svg+xml") || /\.svg(?:[?#].*)?$/i.test(source);
}

function decodeSvgDataUrl(source: string): string | null {
  const commaIndex = source.indexOf(",");
  if (commaIndex < 0) {
    return null;
  }

  const metadata = source.slice(0, commaIndex).toLowerCase();
  const payload = source.slice(commaIndex + 1);
  if (metadata.includes(";base64")) {
    return decodeBase64(payload);
  }

  try {
    return decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function isFetchableIconSource(source: string): boolean {
  return (
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    source.startsWith("/assets/") ||
    (!source.startsWith("/") && !source.startsWith("file://") && !/^[A-Za-z]:\//.test(source))
  );
}

function toLocalFilePath(source: string): string {
  if (!source.startsWith("file://")) {
    return source;
  }

  try {
    return decodeURIComponent(new URL(source).pathname);
  } catch {
    return source;
  }
}

async function readLocalSvgIconSource(source: string): Promise<string | null> {
  const readFile = window.electronAPI?.readFile;
  if (typeof readFile !== "function") {
    return null;
  }

  try {
    const base64 = await readFile(toLocalFilePath(source));
    if (typeof base64 !== "string" || base64 === "") {
      return null;
    }
    return decodeBase64(base64);
  } catch {
    return null;
  }
}

async function readSvgIconSource(source: string): Promise<string | null> {
  if (source.startsWith("data:image/svg+xml")) {
    return decodeSvgDataUrl(source);
  }

  if (isFetchableIconSource(source)) {
    try {
      const response = await fetch(source);
      return response.ok ? await response.text() : null;
    } catch {
      return null;
    }
  }

  return await readLocalSvgIconSource(source);
}

async function getSvgIconMarkup(source: string): Promise<string | null> {
  const cached = sideNavSvgMarkupCache.get(source);
  if (cached !== undefined) {
    return await cached;
  }

  const pending = readSvgIconSource(source);
  sideNavSvgMarkupCache.set(source, pending);
  return await pending;
}

function createInlineSvgIcon(markup: string): SVGSVGElement | null {
  const parsed = new DOMParser().parseFromString(markup, "image/svg+xml");
  const svg = parsed.documentElement;
  if (svg.nodeName.toLowerCase() !== "svg") {
    return null;
  }

  svg.querySelectorAll("script, foreignObject").forEach((node) => {
    node.remove();
  });
  const imported = document.importNode(svg, true) as unknown as SVGSVGElement;
  imported.classList.add("side-nav-icon-svg");
  imported.setAttribute("aria-hidden", "true");
  imported.setAttribute("focusable", "false");
  return imported;
}

async function renderSideNavSvgIcon(
  icon: HTMLElement,
  source: string,
  fallback: string,
  renderToken: string
): Promise<void> {
  const markup = await getSvgIconMarkup(source);
  if ((icon.dataset["sideNavIconRenderToken"] ?? "") !== renderToken) {
    return;
  }

  const svg = markup !== null ? createInlineSvgIcon(markup) : null;
  if (svg === null) {
    renderSideNavIconFallback(icon, fallback);
    return;
  }

  icon.dataset["sideNavIconKind"] = "svg";
  icon.replaceChildren(svg);
}

async function renderResolvedImageIcon(
  icon: HTMLElement,
  source: string,
  fallback: string,
  renderToken: string
): Promise<void> {
  const resolvedSource = await resolveRoomRuntimeAssetSource(source);
  if ((icon.dataset["sideNavIconRenderToken"] ?? "") !== renderToken) {
    return;
  }

  if (resolvedSource === "") {
    renderSideNavIconFallback(icon, fallback);
    return;
  }

  renderSideNavImageIcon(icon, resolvedSource, fallback);
}

export function hydrateSideNavIcon(icon: HTMLElement): void {
  const fallback = getSideNavIconFallback(icon);
  const source = normalizeIconSource(icon.dataset["sideNavIconSrc"] ?? "");
  const renderToken = String(++sideNavIconRenderCounter);
  icon.dataset["sideNavIconRenderToken"] = renderToken;

  renderSideNavIconFallback(icon, fallback);
  if (source === "") {
    return;
  }

  if (isSvgIconSource(source)) {
    void renderSideNavSvgIcon(icon, source, fallback, renderToken);
    return;
  }

  const immediateSource = getRoomRuntimeAssetSource(source);
  if (immediateSource !== "") {
    renderSideNavImageIcon(icon, immediateSource, fallback);
    return;
  }

  void renderResolvedImageIcon(icon, source, fallback, renderToken);
}

export function hydrateStaticSideNavIcons(documentRef: Document = document): void {
  documentRef.querySelectorAll<HTMLElement>(".side-nav-btn[data-page]").forEach((button) => {
    const pageName = button.dataset["page"] ?? "";
    const markup = STATIC_PAGE_NAV_ICON_MARKUP[pageName];
    if (markup === undefined) {
      return;
    }

    const icon = button.querySelector<HTMLElement>(".side-nav-icon");
    if (icon === null) {
      return;
    }

    icon.dataset["sideNavIconFallback"] ??= icon.textContent.trim();
    const fallback = getSideNavIconFallback(icon);
    const svg = createInlineSvgIcon(markup);
    if (svg === null) {
      renderSideNavIconFallback(icon, fallback);
      return;
    }

    icon.dataset["sideNavIconKind"] = "svg";
    icon.replaceChildren(svg);
  });
}

export function hydrateRoomNavIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-room-nav='true'] .side-nav-icon").forEach((icon) => {
    hydrateSideNavIcon(icon);
  });
}
