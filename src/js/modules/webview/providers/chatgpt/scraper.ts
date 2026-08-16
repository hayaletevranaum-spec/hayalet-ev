interface ScrapedGeneratedImage {
  id: string;
  stableKey: string;
  src: string;
  currentSrc: string;
  alt: string;
  mimeType: string;
  originalName: string;
  imageIndex: number;
}

interface ScrapedMessage {
  index: number;
  role: string;
  text: string;
  contentHash: string;
  domIndex: number;
  domId?: string | null;
  generatedImages?: ScrapedGeneratedImage[];
}

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

  function cleanGeneratedImageCaption(value: string): string {
    const normalized = normalizeText(value);
    if (normalized === "") {
      return "";
    }

    return normalized
      .replace(/^(üretilen görsel|uretilen gorsel|generated image)\s*:\s*/i, "")
      .replace(/^(görsel oluşturuldu|gorsel olusturuldu|image created)\s*[•:.-]?\s*/i, "")
      .replace(/\b(düzenle|paylaş|edit|share)\b/gi, "")
      .replace(/\s*[•·]\s*/g, " ")
      .trim();
  }

  function readElementText(element: Element | null): string {
    if (element === null) {
      return "";
    }

    const maybeTextElement = element as Element & {
      innerText?: unknown;
    };
    const innerText =
      typeof maybeTextElement.innerText === "string" ? maybeTextElement.innerText.trim() : "";
    if (innerText !== "") {
      return innerText;
    }

    return maybeTextElement.textContent.trim();
  }

  function cleanAssistantChrome(value: string): string {
    const normalized = normalizeText(value)
      .replace(/^(chatgpt|chat gpt|assistant)\s*:\s*/i, "")
      .trim();
    if (normalized === "") {
      return "";
    }

    const lines = normalized
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    while (lines.length > 0 && /^(chatgpt|chat gpt|assistant)\s*:?\s*$/i.test(lines[0] ?? "")) {
      lines.shift();
    }

    return normalizeText(lines.join("\n"));
  }

  function isAssistantStatusOnlyText(value: string): boolean {
    const normalized = cleanAssistantChrome(value);
    if (normalized === "") {
      return false;
    }

    const collapsed = normalized
      .toLocaleLowerCase("tr-TR")
      .replace(/\s+/g, "")
      .replace(/[.!?…,:;'"`-]/g, "");

    return (
      collapsed === "düşünüyor" ||
      collapsed === "dusunuyor" ||
      collapsed === "thinking" ||
      collapsed === "thinking…" ||
      collapsed === "düşünmedurduruldu" ||
      collapsed === "dusunmedurduruldu" ||
      collapsed === "thinkingstopped" ||
      collapsed === "stoppedthinking" ||
      collapsed === "düşünmedurdurulduhızlıyanıt" ||
      collapsed === "dusunmedurdurulduhizliyanit" ||
      collapsed === "thinkingstoppedquickresponse"
    );
  }

  function selectBestTextCandidate(candidates: string[], role: string): string {
    const unique = Array.from(
      new Set(
        candidates
          .map((candidate) =>
            role === "assistant" ? cleanAssistantChrome(candidate) : normalizeText(candidate)
          )
          .filter((candidate) => candidate !== "")
      )
    );
    if (unique.length === 0) {
      return "";
    }

    unique.sort((left, right) => {
      const rightStructured = /^(?:\{|\[|```(?:json)?)/i.test(right) ? 1 : 0;
      const leftStructured = /^(?:\{|\[|```(?:json)?)/i.test(left) ? 1 : 0;
      if (rightStructured !== leftStructured) {
        return rightStructured - leftStructured;
      }

      return right.length - left.length;
    });

    return unique[0] ?? "";
  }

  function extractMessageText(node: Element, wrapper: Element, role: string): string {
    const assistantContentSelectors = [
      '[data-message-author-role="assistant"] .markdown',
      '[data-message-author-role="assistant"] [class*="prose"]',
      ".agent-turn .markdown",
      '.agent-turn [class*="prose"]',
      '[data-testid="conversation-turn"] .markdown',
      '[data-testid^="conversation-turn"] .markdown',
      '[data-testid*="conversation-turn"] .markdown',
      '[data-testid="conversation-turn"] [class*="prose"]',
      '[data-testid^="conversation-turn"] [class*="prose"]',
      '[data-testid*="conversation-turn"] [class*="prose"]',
      "article .markdown",
      'article [class*="prose"]',
      '[dir="auto"]',
    ];
    const userContentSelectors = [
      '[data-message-author-role="user"] [dir="auto"]',
      '.user-message-bubble-color [dir="auto"]',
      '[data-message-author-role="user"]',
      ".user-message-bubble-color",
      '[dir="auto"]',
    ];
    const contentSelectors =
      role === "assistant" ? assistantContentSelectors : userContentSelectors;
    const roots = Array.from(new Set([wrapper, node]));
    const contentNodes = roots.flatMap((root) =>
      contentSelectors.flatMap((selector) => {
        if (selector.trim() === "") {
          return [];
        }

        const matchesSelf = root.matches(selector) ? [root] : [];
        const descendants = Array.from(root.querySelectorAll(selector));
        return [...matchesSelf, ...descendants];
      })
    );
    const focusedText = selectBestTextCandidate(
      Array.from(new Set(contentNodes)).map((candidate) => readElementText(candidate)),
      role
    );
    if (focusedText !== "") {
      return focusedText;
    }

    return selectBestTextCandidate(
      roots.map((root) => readElementText(root)),
      role
    );
  }

  const defaultGeneratedImageSelector =
    '.group\\/imagegen-image, [id^="image-"].group\\/imagegen-image, [id^="image-"][role="button"], [data-testid="image-gen-overlay-actions"], img[src*="/backend-api/estuary/content?id=file_"], img[alt^="Üretilen görsel:"], img[alt^="Generated image:"], img[alt*="generated image" i]';
  const defaultScrapeSelectors = {
    preferred: "[data-message-author-role]",
    fallback: ".message-bubble, .markdown.prose",
    messageWrapper:
      '[data-testid="conversation-turn"], [data-testid^="conversation-turn"], [data-testid*="conversation-turn"], [data-message-id], [data-turn-id], main article',
    userWrapper: '[data-message-author-role="user"], .user-message-bubble-color',
    assistantWrapper: '[data-message-author-role="assistant"], .agent-turn',
  };

  const config: {
    scrapeSelectors?: {
      preferred?: string;
      fallback?: string;
      messageWrapper?: string;
      userWrapper?: string;
      assistantWrapper?: string;
    };
    selectors?: {
      generatedImage?: string;
    };
  } = window.__app_provider_config ?? {};
  const scrapeSelectors = config.scrapeSelectors ?? {};
  const preferredSel = scrapeSelectors.preferred ?? defaultScrapeSelectors.preferred;
  const fallbackSel = scrapeSelectors.fallback ?? defaultScrapeSelectors.fallback;
  const messageWrapperSel = scrapeSelectors.messageWrapper ?? defaultScrapeSelectors.messageWrapper;
  const userWrapperSel = scrapeSelectors.userWrapper ?? defaultScrapeSelectors.userWrapper;
  const assistantWrapperSel =
    scrapeSelectors.assistantWrapper ?? defaultScrapeSelectors.assistantWrapper;
  const configuredGeneratedImageSelector = config.selectors?.generatedImage?.trim() ?? "";
  const generatedImageSelector =
    configuredGeneratedImageSelector !== ""
      ? configuredGeneratedImageSelector
      : defaultGeneratedImageSelector;
  const rootSelectorParts = [messageWrapperSel, userWrapperSel, assistantWrapperSel].filter(
    (selector) => selector.trim() !== ""
  );
  const wrappedBase =
    rootSelectorParts.length === 0
      ? []
      : Array.from(document.querySelectorAll(rootSelectorParts.join(", ")));
  const preferred = Array.from(document.querySelectorAll(preferredSel));
  const fallback = Array.from(document.querySelectorAll(fallbackSel));
  // NOTE: ChatGPT can expose user turns with explicit role markers while assistant turns live
  // only on the surrounding conversation wrapper/article. Keep both sources so assistant replies
  // still get scraped when role attributes disappear during UI changes.
  const baseCandidates =
    wrappedBase.length !== 0 || preferred.length !== 0 ? [...wrappedBase, ...preferred] : fallback;
  const base = Array.from(new Set(baseCandidates));
  const nodes = Array.from(new Set(base)).filter(
    (n, i, arr) => !arr.some((o, j) => i !== j && o.contains(n))
  );
  const mid = window.innerWidth / 2;
  const result: ScrapedMessage[] = [];
  nodes.forEach((node, idx) => {
    const isUserWrapper = userWrapperSel !== "" && node.matches(userWrapperSel);
    const isAssistantWrapper = assistantWrapperSel !== "" && node.matches(assistantWrapperSel);
    const authorRole = node.getAttribute("data-message-author-role");
    const roleNode =
      authorRole !== null && authorRole !== "" ? node : node.closest("[data-message-author-role]");
    const roleAttr = roleNode?.getAttribute("data-message-author-role") ?? "";
    const role = ((): string => {
      if (isUserWrapper) return "user";
      if (isAssistantWrapper) return "assistant";
      if (roleAttr === "user") return "user";
      if (roleAttr === "assistant") return "assistant";
      if (userWrapperSel !== "" && node.querySelector(userWrapperSel) !== null) return "user";
      if (assistantWrapperSel !== "" && node.querySelector(assistantWrapperSel) !== null) {
        return "assistant";
      }

      const rect = node.getBoundingClientRect();
      return rect.left > mid ? "user" : "assistant";
    })();
    const wrapper =
      (messageWrapperSel !== "" ? node.closest(messageWrapperSel) : null) ??
      node.closest("[data-message-id]") ??
      node;
    let text = extractMessageText(node, wrapper, role);
    if (text === "") {
      const imgs = Array.from(node.querySelectorAll("img"));
      const alt = imgs
        .map((img) => img.alt.trim())
        .filter(Boolean)
        .join(" ");
      if (alt !== "") text = alt;
      else if (imgs.length !== 0) text = "[image]";
    }
    if (role === "assistant" && isAssistantStatusOnlyText(text)) return;
    if (text === "") return;
    const domIdCandidate =
      wrapper.getAttribute("data-message-id") ??
      wrapper.getAttribute("data-turn-id") ??
      wrapper.getAttribute("id") ??
      node.getAttribute("data-message-id") ??
      node.getAttribute("data-turn-id") ??
      node.getAttribute("id") ??
      "";
    const domId = domIdCandidate.trim() === "" ? null : domIdCandidate.trim();
    const domKey = domId ?? `node:${idx}`;

    const generatedImages =
      generatedImageSelector.trim() === ""
        ? []
        : ((): ScrapedGeneratedImage[] => {
            const roots = [
              ...(node.matches(generatedImageSelector) ? [node] : []),
              ...Array.from(node.querySelectorAll(generatedImageSelector)),
            ];
            const seenImages = new Set<HTMLImageElement>();
            const seenSignatures = new Set<string>();
            const images = roots.flatMap((root) => {
              const image = root instanceof HTMLImageElement ? root : root.querySelector("img");
              if (!(image instanceof HTMLImageElement) || seenImages.has(image)) {
                return [];
              }
              seenImages.add(image);
              return [image];
            });

            return images.flatMap((image, imageIndex) => {
              const src = image.getAttribute("src")?.trim() ?? "";
              const currentSrc = image.currentSrc.trim();
              const alt = image.getAttribute("alt")?.trim() ?? "";
              const effectiveSrc = currentSrc !== "" ? currentSrc : src;
              const signature = effectiveSrc !== "" ? effectiveSrc : `alt:${alt}`;
              if (seenSignatures.has(signature)) {
                return [];
              }
              seenSignatures.add(signature);

              if (effectiveSrc === "" && alt === "") {
                return [];
              }

              const messageKey = domKey;
              const stableKey = hashString(`${messageKey}|${imageIndex}|${alt}`);
              const id = hashString(signature);

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
    const generatedCaptionCandidates = generatedImages
      .map((image) => cleanGeneratedImageCaption(image.alt))
      .filter((caption) => caption !== "");
    const preferredGeneratedCaption = generatedCaptionCandidates[0] ?? "";
    const cleanedGeneratedText =
      generatedImages.length > 0 ? cleanGeneratedImageCaption(text) : text;
    if (
      preferredGeneratedCaption !== "" &&
      generatedImages.length > 0 &&
      (text === "" ||
        text === "[image]" ||
        cleanedGeneratedText !== text ||
        cleanedGeneratedText.includes(preferredGeneratedCaption))
    ) {
      text = preferredGeneratedCaption;
    } else if (generatedImages.length > 0 && cleanedGeneratedText !== "") {
      text = cleanedGeneratedText;
    }
    const contentHash = hashString(text);

    result.push({
      index: idx,
      role,
      text,
      contentHash,
      domIndex: idx,
      domId,
      ...(generatedImages.length > 0 ? { generatedImages } : {}),
    });
  });
  return result;
}
