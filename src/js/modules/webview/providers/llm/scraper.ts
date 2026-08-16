interface ScrapedMessage {
  index: number;
  role: string;
  text: string;
  contentHash: string;
  domIndex: number;
  domId?: string | null;
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
    if (normalized === "") return "0";
    let hash = 5381;
    for (let i = 0; i < normalized.length; i++) {
      hash = (hash << 5) + hash + normalized.charCodeAt(i);
      hash = hash >>> 0;
    }
    return hash.toString(16);
  }

  const config = (window.__app_provider_config ?? {}) as {
    scrapeSelectors?: Record<string, string>;
    selectors?: Record<string, string>;
  };
  const { scrapeSelectors = {} } = config;

  const preferredSel = scrapeSelectors["preferred"] ?? "[data-message-author-role]";
  const fallbackSel = scrapeSelectors["fallback"] ?? ".message";

  const preferred = Array.from(document.querySelectorAll(preferredSel));
  const base =
    preferred.length !== 0 ? preferred : Array.from(document.querySelectorAll(fallbackSel));

  const nodes = base.filter((n, i, arr) => !arr.some((o, j) => i !== j && o.contains(n)));

  const result: ScrapedMessage[] = [];
  nodes.forEach((node, idx) => {
    const role = node.getAttribute("data-message-author-role") ?? "assistant";
    if (role !== "user" && role !== "assistant") return;
    const textContent = (node as HTMLElement).innerText.trim();
    if (textContent === "") return;

    const contentHash = hashString(textContent);

    result.push({
      index: idx,
      role,
      text: textContent,
      contentHash,
      domIndex: idx,
      domId: node.getAttribute("data-message-id"),
    });
  });

  return result;
}
