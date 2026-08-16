interface ScrapedMessage {
  index: number;
  role: string;
  text: string;
  contentHash: string;
  domIndex: number;
  generatedImages?: Array<{
    id: string;
    stableKey: string;
    src: string;
    currentSrc: string;
    alt: string;
    mimeType: string;
    originalName: string;
    imageIndex: number;
  }>;
}

type ScrapedGeneratedImage = NonNullable<ScrapedMessage["generatedImages"]>[number];

export function scrapeMessages(): ScrapedMessage[] {
  function normalizeText(str: string): string {
    if (str === "") return "";
    return str
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[\t ]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function hashString(str: string): string {
    if (str === "") return "0";
    const normalized = normalizeText(str);
    if (normalized === "") return "0";
    let hash = 5381;
    for (let i = 0; i < normalized.length; i++) {
      hash = (hash << 5) + hash + normalized.charCodeAt(i);
      hash = hash >>> 0;
    }
    return hash.toString(16);
  }

  function inferMimeType(src: string): string {
    const normalized = src.trim().toLowerCase();
    if (normalized.startsWith("data:image/")) {
      const match = /^data:([^;,]+)[;,]/.exec(normalized);
      return match?.[1] ?? "image/png";
    }
    if (normalized.includes(".webp")) return "image/webp";
    if (normalized.includes(".gif")) return "image/gif";
    if (normalized.includes(".bmp")) return "image/bmp";
    if (normalized.includes(".svg")) return "image/svg+xml";
    if (normalized.includes(".jpg") || normalized.includes(".jpeg")) return "image/jpeg";
    return "image/png";
  }

  function extensionFromMime(mimeType: string): string {
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("bmp")) return "bmp";
    if (mimeType.includes("svg")) return "svg";
    if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
    return "png";
  }

  const config: {
    scrapeSelectors: {
      preferred: string;
      fallback: string;
    };
    selectors?: {
      generatedImage?: string;
    };
  } = window.__app_provider_config ?? {
    scrapeSelectors: {
      preferred: "[data-message-author-role]",
      fallback: ".message-bubble",
    },
  };
  const preferredSel = config.scrapeSelectors.preferred;
  const fallbackSel = config.scrapeSelectors.fallback;
  const generatedImageSelector = config.selectors?.generatedImage ?? "";
  const preferred = Array.from(document.querySelectorAll(preferredSel));
  const fallback = Array.from(document.querySelectorAll(fallbackSel));
  const base = preferred.length !== 0 ? preferred : fallback;
  const nodes = base.filter((n, i, arr) => !arr.some((o, j) => i !== j && o.contains(n)));
  const mid = window.innerWidth / 2;
  const result: ScrapedMessage[] = [];
  nodes.forEach((node, idx) => {
    const authorRole = node.getAttribute("data-message-author-role");
    const roleNode =
      authorRole !== null && authorRole !== "" ? node : node.closest("[data-message-author-role]");
    const roleAttr = roleNode?.getAttribute("data-message-author-role") ?? "";
    let text = (node as HTMLElement).innerText.trim();
    if (text === "") {
      const imgs = Array.from(node.querySelectorAll("img"));
      const alt = imgs
        .map((img) => img.alt.trim())
        .filter(Boolean)
        .join(" ");
      if (alt !== "") text = alt;
      else if (imgs.length !== 0) text = "[image]";
    }
    if (text === "") return;
    const cls = node.className.toString();
    const hasUserBorder = /border-border/i.test(cls) || /bg-surface/i.test(cls);
    const isFullWidth = /max-w-none/i.test(cls);
    const role = ((): string => {
      if (roleAttr === "user") return "user";
      if (roleAttr === "assistant") return "assistant";
      if (hasUserBorder) return "user";
      if (isFullWidth) return "assistant";

      const rect = node.getBoundingClientRect();
      return rect.left > mid ? "user" : "assistant";
    })();
    const contentHash = hashString(text);

    const generatedImages =
      generatedImageSelector.trim() === ""
        ? []
        : ((): ScrapedGeneratedImage[] => {
            const seen = new Set<string>();
            const roots = [
              ...(node.matches(generatedImageSelector) ? [node] : []),
              ...Array.from(node.querySelectorAll(generatedImageSelector)),
            ];

            return roots.flatMap((root, imageIndex) => {
              const image = root instanceof HTMLImageElement ? root : root.querySelector("img");
              if (!(image instanceof HTMLImageElement)) {
                return [];
              }

              const src = image.getAttribute("src")?.trim() ?? "";
              const currentSrc = image.currentSrc.trim();
              const alt = image.getAttribute("alt")?.trim() ?? "";
              const effectiveSrc = currentSrc !== "" ? currentSrc : src;
              if (effectiveSrc === "" && alt === "") {
                return [];
              }

              const messageKey = contentHash !== "" ? contentHash : String(idx);
              const stableKey = hashString(`${messageKey}|${imageIndex}|${alt}`);
              const id = hashString(`${effectiveSrc}|${alt}|${imageIndex}`);
              if (seen.has(id)) {
                return [];
              }
              seen.add(id);

              const mimeType = inferMimeType(effectiveSrc);
              return [
                {
                  id,
                  stableKey,
                  src,
                  currentSrc,
                  alt,
                  mimeType,
                  originalName: `generated-image-${String(imageIndex + 1).padStart(2, "0")}-${stableKey}.${extensionFromMime(mimeType)}`,
                  imageIndex,
                },
              ];
            });
          })();

    result.push({
      index: idx,
      role,
      text,
      contentHash,
      domIndex: idx,
      ...(generatedImages.length > 0 ? { generatedImages } : {}),
    });
  });
  return result;
}
