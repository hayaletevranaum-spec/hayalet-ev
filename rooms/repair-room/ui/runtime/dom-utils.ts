export type RepairMutableStyleProperty =
  "gridTemplateColumns" | "left" | "width" | "transform" | "transformOrigin";

export function setClassNameIfChanged(element: HTMLElement, className: string): void {
  if (element.className !== className) element.className = className;
}

export function setTextIfChanged(element: HTMLElement, textContent: string): void {
  if (element.textContent !== textContent) element.textContent = textContent;
}

export function setDatasetIfChanged(element: HTMLElement, key: string, value: string): void {
  if (element.dataset[key] !== value) element.dataset[key] = value;
}

export function setStyleIfChanged(
  element: HTMLElement,
  property: RepairMutableStyleProperty,
  value: string
): void {
  if (element.style[property] !== value) {
    element.style[property] = value;
  }
}
