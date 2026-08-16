import { asLabRecord, asNonEmptyString } from "../../domain/lab-types.js";
import type { createLabStore } from "../lab-store.js";
import { buildUiEvent } from "./lab-controller-helpers.js";

type LabAssetActionControllerDeps = {
  dispatch: ReturnType<typeof createLabStore>["dispatch"];
  documentRef: Document;
  sendMediaAction: (action: string, payload?: Record<string, unknown>) => string | null;
  store: ReturnType<typeof createLabStore>;
  windowRef: Pick<Window, "confirm">;
};

export function createLabAssetActionController(deps: LabAssetActionControllerDeps) {
  function findAsset(assetId: string) {
    return (
      deps.store.getState().assets.find(function (asset) {
        return asset.id === assetId;
      }) || null
    );
  }

  function getAssetHref(assetId: string) {
    const asset = findAsset(assetId);
    if (asset === null) {
      return null;
    }
    const metadata = asLabRecord(asset.metadata);
    return (
      asNonEmptyString(asset.url) ||
      asNonEmptyString(asset.localPath) ||
      asNonEmptyString(metadata["thumbnailUrl"])
    );
  }

  function confirmAssetRemoval(assetIds: string[]) {
    const ids = assetIds.filter(function (assetId, index, allIds) {
      return assetId.trim() !== "" && allIds.indexOf(assetId) === index;
    });
    if (ids.length === 0) {
      return false;
    }
    if (typeof deps.windowRef.confirm !== "function") {
      return true;
    }

    const labels = ids.map(function (assetId) {
      const asset = findAsset(assetId);
      return asset ? asNonEmptyString(asset.name) || assetId : assetId;
    });
    const message =
      labels.length === 1
        ? `"${labels[0]}" varlığı silinsin mi?`
        : `${labels.length} varlık silinsin mi?\n${labels.join("\n")}`;
    return deps.windowRef.confirm(message);
  }

  function removeAssetsWithConfirmation(assetIds: string[]) {
    const ids = assetIds.filter(function (assetId, index, allIds) {
      return assetId.trim() !== "" && allIds.indexOf(assetId) === index;
    });
    if (!confirmAssetRemoval(ids)) {
      return false;
    }
    ids.forEach(function (assetId) {
      deps.sendMediaAction("asset-remove", { assetId });
    });
    return ids.length > 0;
  }

  function downloadAsset(assetId: string) {
    const asset = findAsset(assetId);
    const href = getAssetHref(assetId);
    if (asset === null || href === null) {
      return;
    }
    const link = deps.documentRef.createElement("a");
    link.href = href;
    link.download = asset.name;
    link.rel = "noopener";
    deps.documentRef.body.appendChild(link);
    link.click();
    link.remove();
  }

  function focusSourcePreview() {
    const preview = deps.documentRef.querySelector?.("#lab-workspace-preview") as {
      focus?: () => void;
      scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
    } | null;
    if (!preview || typeof preview.scrollIntoView !== "function") {
      deps.dispatch({
        type: "push-event",
        event: buildUiEvent("Source preview is unavailable.", "warning"),
      });
      return;
    }
    preview.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    if (typeof preview.focus === "function") {
      preview.focus();
    }
  }

  return {
    downloadAsset,
    focusSourcePreview,
    removeAssetsWithConfirmation,
  };
}
