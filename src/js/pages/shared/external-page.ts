const DEFAULT_RETURN_PAGE = "entrance";

function isHostedInMainShell(): boolean {
  return document.getElementById("pages-container") instanceof HTMLElement;
}

function dispatchHostPageNavigation(page: string): void {
  document.dispatchEvent(
    new CustomEvent<{ page: string }>("navigate-page", {
      detail: { page },
    })
  );
}

function normalizePageName(value: string | null | undefined, fallback: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized === "" ? fallback : normalized;
}

function setOptionalParam(url: URL, key: string, value: string | null | undefined): void {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized === "") {
    url.searchParams.delete(key);
    return;
  }

  url.searchParams.set(key, normalized);
}

export function buildMainShellUrl(returnPage?: string | null): URL {
  const url = new URL("../index.html", window.location.href);
  setOptionalParam(url, "page", normalizePageName(returnPage, DEFAULT_RETURN_PAGE));
  return url;
}

export function navigateMainShellPage(pageName: string, options: { replace?: boolean } = {}): void {
  const normalizedPageName = normalizePageName(pageName, DEFAULT_RETURN_PAGE);
  if (isHostedInMainShell()) {
    dispatchHostPageNavigation(normalizedPageName);
    return;
  }

  const targetUrl = buildMainShellUrl(normalizedPageName).toString();
  if (options.replace === true) {
    window.location.replace(targetUrl);
    return;
  }

  window.location.assign(targetUrl);
}

export function resolveExternalReturnPage(fallback = DEFAULT_RETURN_PAGE): string {
  return normalizePageName(new URLSearchParams(window.location.search).get("returnPage"), fallback);
}

export function resolveExternalPanel(): string | null {
  const panel = new URLSearchParams(window.location.search).get("panel");
  const normalized = typeof panel === "string" ? panel.trim() : "";
  return normalized === "" ? null : normalized;
}
