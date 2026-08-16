export function createForgePanel(
  documentRef: Document,
  options: {
    body: HTMLElement;
    eyebrow?: string;
    panelId: string;
    title: string;
  }
): HTMLElement {
  const section = documentRef.createElement("section");
  section.className = `forge-panel forge-panel--${options.panelId}`;
  section.dataset["forgePanel"] = options.panelId;

  const header = documentRef.createElement("header");
  header.className = "forge-panel__header";

  if (typeof options.eyebrow === "string" && options.eyebrow.trim() !== "") {
    const eyebrow = documentRef.createElement("p");
    eyebrow.className = "forge-panel__eyebrow";
    eyebrow.textContent = options.eyebrow;
    header.append(eyebrow);
  }

  const title = documentRef.createElement("h2");
  title.className = "forge-panel__title";
  title.textContent = options.title;
  header.append(title);

  section.append(header, options.body);
  return section;
}
