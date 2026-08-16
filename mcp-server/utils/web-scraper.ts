import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { WEB_TIMEOUTS } from "@timeouts";
import { createMcpTranslatorSync, readMcpAppLanguageSync } from "./i18n/index.js";
const REMOVE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "svg",
  "canvas",
  "video",
  "audio",
  "nav",
  "footer",
  "header",
  "aside",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  ".ad",
  ".ads",
  ".advertisement",
  ".social",
  ".share",
  ".comment",
  ".comments",
  ".sidebar",
  ".menu",
  ".navigation",
  ".cookie",
  ".popup",
  ".modal",
  "[role='navigation']",
  "[role='banner']",
  "[role='complementary']",
  "[aria-hidden='true']",
];
const CONTENT_SELECTORS = [
  "article",
  "main",
  "[role='main']",
  ".content",
  ".post",
  ".article",
  ".entry",
  "#content",
  "#main",
  ".markdown-body",
  ".post-content",
  ".article-content",
  ".entry-content",
];

export interface ScrapedContent {
  title: string;
  description: string;
  content: string;
  markdown: string;
  url: string;
  wordCount: number;
  language?: string;
}

export interface FetchOptions {
  timeout?: number;
  maxLength?: number;
  includeLinks?: boolean;
  userAgent?: string;
}

const DEFAULT_OPTIONS: FetchOptions = {
  timeout: WEB_TIMEOUTS.PAGE_FETCH,
  maxLength: 50000,
  includeLinks: true,
  userAgent: "Mozilla/5.0 (compatible; app/1.0; +https://github.com/)",
};

export async function fetchAndParse(
  url: string,
  options: FetchOptions = {}
): Promise<ScrapedContent> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const t = createMcpTranslatorSync();
  const locale = readMcpAppLanguageSync();
  const acceptLanguage =
    locale === "en" ? "en-US,en;q=0.9,tr-TR,tr;q=0.7" : "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7";
  const parsedUrl = new URL(url);
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error(t("mcpServer.webTools.scraper.errors.httpHttpsOnly"));
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, opts.timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": opts.userAgent ?? "Mozilla/5.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": acceptLanguage,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(
        t("mcpServer.webTools.scraper.errors.httpStatus", {
          status: response.status,
          statusText: response.statusText,
        })
      );
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new Error(
        t("mcpServer.webTools.scraper.errors.unsupportedContentType", {
          contentType,
        })
      );
    }

    const html = await response.text();
    return parseHTML(html, url, opts);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function parseHTML(html: string, url: string, options: FetchOptions = {}): ScrapedContent {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const t = createMcpTranslatorSync();
  const $ = cheerio.load(html);
  void $;

  REMOVE_SELECTORS.forEach((selector) => {
    $(selector).remove();
  });

  const title =
    ($("title").text().trim().length > 0 ? $("title").text().trim() : null) ??
    $('meta[property="og:title"]').attr("content") ??
    ($("h1").first().text().trim().length > 0 ? $("h1").first().text().trim() : null) ??
    t("mcpServer.webTools.scraper.titleMissing");

  const description =
    $('meta[name="description"]').attr("content") ??
    $('meta[property="og:description"]').attr("content") ??
    "";

  const language =
    $("html").attr("lang") ?? $('meta[http-equiv="content-language"]').attr("content");

  let contentElement = null;
  for (const selector of CONTENT_SELECTORS) {
    const el = $(selector).first();
    if (el.length > 0 && el.text().trim().length > 100) {
      contentElement = el;
      break;
    }
  }

  contentElement ??= $("body");

  const content = extractText(contentElement, $, opts.includeLinks ?? false);
  const markdown = extractMarkdown(contentElement, $, opts.includeLinks ?? false);

  const truncatedContent = content.slice(0, opts.maxLength ?? 50000);
  const truncatedMarkdown = markdown.slice(0, opts.maxLength ?? 50000);

  const result: {
    title: string;
    description: string;
    content: string;
    markdown: string;
    url: string;
    wordCount: number;
    language?: string;
  } = {
    title: title.slice(0, 500),
    description: description.slice(0, 1000),
    content: truncatedContent,
    markdown: truncatedMarkdown,
    url,
    wordCount: truncatedContent.split(/\s+/).filter(Boolean).length,
  };
  if (language !== undefined) {
    result.language = language;
  }
  return result;
}

function extractText(
  element: cheerio.Cheerio<AnyNode>,
  $: cheerio.CheerioAPI,
  _includeLinks: boolean
): string {
  const lines: string[] = [];

  element.find("p, h1, h2, h3, h4, h5, h6, li, td, th, pre, blockquote, div").each((_, el) => {
    const $el = $(el);
    const tagName = el.type === "tag" ? el.tagName.toLowerCase() : "";
    if ($el.find("p, div").length > 0 && !["pre", "blockquote"].includes(tagName)) {
      return;
    }

    let text = $el.text().trim();

    if (text.length < 3) return;

    if (tagName.startsWith("h")) {
      text = `\n## ${text}\n`;
    }

    if (tagName === "li") {
      text = `• ${text}`;
    }

    if (tagName === "pre") {
      text = `\n\`\`\`\n${text}\n\`\`\`\n`;
    }

    if (tagName === "blockquote") {
      text = `> ${text}`;
    }

    lines.push(text);
  });

  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMarkdown(
  element: cheerio.Cheerio<AnyNode>,
  $: cheerio.CheerioAPI,
  includeLinks: boolean
): string {
  const lines: string[] = [];

  element
    .find("p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, a, code, strong, em")
    .each((_, el) => {
      const $el = $(el);
      const tagName = el.type === "tag" ? el.tagName.toLowerCase() : "";
      if ($el.parents("p, li, h1, h2, h3, h4, h5, h6").length > 0) {
        return;
      }

      let text = "";

      switch (tagName) {
        case "h1":
          text = `# ${$el.text().trim()}\n`;
          break;
        case "h2":
          text = `## ${$el.text().trim()}\n`;
          break;
        case "h3":
          text = `### ${$el.text().trim()}\n`;
          break;
        case "h4":
          text = `#### ${$el.text().trim()}\n`;
          break;
        case "h5":
        case "h6":
          text = `##### ${$el.text().trim()}\n`;
          break;
        case "p":
          text = `${processInlineElements($el, $, includeLinks)}\n`;
          break;
        case "li":
          text = `- ${processInlineElements($el, $, includeLinks)}`;
          break;
        case "pre": {
          const code = $el.find("code").text().length > 0 ? $el.find("code").text() : $el.text();
          const lang =
            $el
              .find("code")
              .attr("class")
              ?.match(/language-(\w+)/)?.[1] ?? "";
          text = `\n\`\`\`${lang}\n${code.trim()}\n\`\`\`\n`;
          break;
        }
        case "blockquote":
          text = `> ${$el.text().trim()}\n`;
          break;
        default:
          break;
      }

      if (text.trim() !== "") {
        lines.push(text);
      }
    });

  return lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function processInlineElements(
  $el: cheerio.Cheerio<AnyNode>,
  _$: cheerio.CheerioAPI,
  includeLinks: boolean
): string {
  let html = $el.html() ?? "";
  html = html.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  html = html.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  html = html.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  html = html.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
  html = html.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");
  if (includeLinks) {
    html = html.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  } else {
    html = html.replace(/<a[^>]*>(.*?)<\/a>/gi, "$1");
  }
  return html.replace(/<[^>]+>/g, "").trim();
}

export function truncateText(text: string, maxLength: number, suffix = "..."): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > maxLength * 0.8) {
    return truncated.slice(0, lastSpace) + suffix;
  }

  return truncated + suffix;
}

export async function checkUrlAccessible(
  url: string,
  timeout = WEB_TIMEOUTS.URL_CHECK
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}
