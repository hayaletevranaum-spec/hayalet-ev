const LAB_ASSET_MENU_SELECTOR = "details.labx-sp-asset__menu";

type QueryableDocument = Document & {
  querySelectorAll?: Document["querySelectorAll"];
};

function getAssetMenus(documentRef: QueryableDocument): HTMLDetailsElement[] {
  if (typeof documentRef.querySelectorAll !== "function") {
    return [];
  }
  return Array.from(documentRef.querySelectorAll<HTMLDetailsElement>(LAB_ASSET_MENU_SELECTOR));
}

function closeLabAssetMenus(
  documentRef: QueryableDocument,
  except: HTMLDetailsElement | null = null
) {
  getAssetMenus(documentRef).forEach(function (menu) {
    if (menu !== except) {
      menu.open = false;
    }
  });
}

export function closeLabAssetMenusForClick(event: Event, documentRef: QueryableDocument) {
  const target = event.target instanceof Element ? event.target : null;
  if (target === null) {
    closeLabAssetMenus(documentRef);
    return;
  }

  const activeMenu = target.closest<HTMLDetailsElement>(LAB_ASSET_MENU_SELECTOR);
  closeLabAssetMenus(documentRef, activeMenu);
  if (activeMenu === null) {
    return;
  }

  const actionButton = target.closest<HTMLElement>("[data-lab-action]");
  if (actionButton !== null) {
    activeMenu.open = false;
  }
}

export function openLabAssetContextMenu(event: Event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) {
    return;
  }
  const assetRow = target.closest<HTMLElement>("[data-lab-asset-id], [data-asset-id]");
  if (!assetRow) {
    return;
  }
  const menu = assetRow.querySelector<HTMLDetailsElement>(LAB_ASSET_MENU_SELECTOR);
  if (!menu) {
    return;
  }
  event.preventDefault();
  const documentRef = menu.ownerDocument || target.ownerDocument;
  if (documentRef) {
    closeLabAssetMenus(documentRef, menu);
  }
  menu.open = true;
  const summary = menu.querySelector<HTMLElement>("summary");
  summary?.focus();
}
