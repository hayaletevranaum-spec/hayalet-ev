export type PatternEmptyStateKind =
  "data-empty" | "selection" | "filter-empty" | "pending" | "complete-empty";

export type PatternEmptyStateOptions = {
  readonly className?: string;
  readonly live?: boolean;
  readonly compact?: boolean;
};

export function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tagName);
  if (className !== undefined) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

export function appendText(
  parent: HTMLElement,
  tagName: keyof HTMLElementTagNameMap,
  text: string
): void {
  parent.append(createElement(tagName, undefined, text));
}

export function createBackButton(onBack: () => void): HTMLButtonElement {
  const button = createElement("button", "pattern-room-back", "Genel oda");
  button.type = "button";
  button.dataset["patternBack"] = "true";
  button.ariaLabel = "Genel oda görünümüne dön";
  button.title = "Genel oda";
  button.addEventListener("click", onBack);
  return button;
}

export function createActionButton(label: string, onClick: () => void): HTMLButtonElement {
  const button = createElement("button", "pattern-room-action-button", label);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

export function createEmptyState(
  message: string,
  kind: PatternEmptyStateKind,
  options: PatternEmptyStateOptions = {}
): HTMLParagraphElement {
  const classNames = [
    "pattern-room-empty-state",
    options.className,
    options.compact === true ? "compact" : undefined,
  ].filter((className): className is string => className !== undefined && className !== "");
  const emptyState = createElement("p", classNames.join(" "), message);
  emptyState.dataset["patternEmptyState"] = "true";
  emptyState.dataset["patternEmptyStateKind"] = kind;
  if (options.live === true) {
    emptyState.role = "status";
    emptyState.ariaLive = "polite";
  }
  return emptyState;
}

export function createPanelShell(viewId: string, title: string, onBack: () => void): HTMLElement {
  const shell = createElement("section", "pattern-room-panel");
  shell.dataset["patternView"] = viewId;
  shell.ariaLabel = title;
  shell.tabIndex = -1;

  const header = createElement("header", "pattern-room-panel-header");
  const titleWrap = createElement("div", "pattern-room-panel-title");
  titleWrap.append(createElement("span", "pattern-room-kicker", "Pattern Room"));
  titleWrap.append(createElement("h1", undefined, title));
  header.append(titleWrap, createBackButton(onBack));
  shell.append(header);

  return shell;
}

export function createMetric(label: string, value: string): HTMLElement {
  const metric = createElement("div", "pattern-room-metric");
  metric.append(createElement("span", undefined, label), createElement("strong", undefined, value));
  return metric;
}

export function createListItem(
  title: string,
  detail: string,
  tone: string,
  eyebrow?: string
): HTMLElement {
  const item = createElement("article", `pattern-room-list-item ${tone}`);
  if (eyebrow !== undefined) {
    item.append(createElement("span", "pattern-room-list-eyebrow", eyebrow));
  }
  item.append(createElement("h3", undefined, title), createElement("p", undefined, detail));
  return item;
}
