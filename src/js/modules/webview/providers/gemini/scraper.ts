interface ScrapedMessage {
  index: number;
  role: string;
  text: string;
  contentHash: string;
  domIndex: number;
  domId?: string | null;
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

  const config = (window.__app_provider_config ?? {}) as {
    scrapeSelectors?: Record<string, string>;
    roleSelectors?: Record<string, string>;
    selectors?: Record<string, string>;
  };
  const { scrapeSelectors = {}, roleSelectors = {}, selectors = {} } = config;

  const preferredSel = scrapeSelectors["preferred"] ?? ".message-content";
  const fallbackSel =
    scrapeSelectors["fallback"] ?? ".user-query-bubble-with-background, .markdown-main-panel";
  const messageIdSel = scrapeSelectors["messageId"] ?? '[id^="message-content-id-"]';
  const generatedImageSelector = selectors["generatedImage"] ?? "";

  const preferred = Array.from(document.querySelectorAll(preferredSel));
  const base =
    preferred.length !== 0 ? preferred : Array.from(document.querySelectorAll(fallbackSel));

  const nodes = base.filter((n, i, arr) => !arr.some((o, j) => i !== j && o.contains(n)));

  const result: ScrapedMessage[] = [];
  nodes.forEach((node, idx) => {
    let role = "assistant";
    const userSelector = roleSelectors["user"];
    const assistantSelector = roleSelectors["assistant"];

    if (userSelector !== undefined && userSelector !== "" && node.matches(userSelector)) {
      role = "user";
    } else if (
      assistantSelector !== undefined &&
      assistantSelector !== "" &&
      node.matches(assistantSelector)
    ) {
      role = "assistant";
    } else {
      if (userSelector !== undefined && userSelector !== "" && node.querySelector(userSelector)) {
        role = "user";
      } else if (
        assistantSelector !== undefined &&
        assistantSelector !== "" &&
        node.querySelector(assistantSelector)
      ) {
        role = "assistant";
      }
    }

    let textContent = "";
    const textSelector = roleSelectors["text"];
    if (textSelector !== undefined && textSelector !== "") {
      const textNodes = Array.from(node.querySelectorAll(textSelector));
      textContent = textNodes
        .map((t) => (t as HTMLElement).innerText)
        .join(" ")
        .trim();
    }

    if (textContent === "") {
      textContent = (node as HTMLElement).innerText.trim();
    }

    if (textContent === "") {
      const imgs = Array.from(node.querySelectorAll("img"));
      const alt = imgs
        .map((img) => img.alt.trim())
        .filter(Boolean)
        .join(" ");
      if (alt !== "") textContent = alt;
      else if (imgs.length !== 0) textContent = "[image]";
    }

    if (textContent === "") return;

    let domId = null;
    const idElement = node.matches(messageIdSel) ? node : node.querySelector(messageIdSel);
    if (idElement?.id !== undefined && idElement.id !== "") {
      domId = idElement.id;
    }

    // NOTE: Add a hash for fallback lookup or duplicate detection.
    const contentHash = hashString(textContent);

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

              const messageKey = domId ?? contentHash;
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
      text: textContent,
      contentHash,
      domIndex: idx,
      domId,
      ...(generatedImages.length > 0 ? { generatedImages } : {}),
    });
  });

  return result;
}
