export interface GeneratedImageExtractionResult {
  success?: boolean;
  base64?: string;
  mimeType?: string;
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  error?: string;
}

export function parseGeneratedImageDataUrl(
  dataUrl: string
): { base64: string; mimeType: string | null } | null {
  const match = /^data:([^;,]+)?(?:;[^,]*)?,(.+)$/.exec(dataUrl);
  if (match === null) {
    return null;
  }

  return {
    mimeType: typeof match[1] === "string" && match[1].trim() !== "" ? match[1].trim() : null,
    base64: match[2] ?? "",
  };
}

export function buildGeneratedImageExtractionScript(asset: Record<string, unknown>): string {
  return `
    (async () => {
      const asset = ${JSON.stringify(asset)};
      const matchesAsset = (image) => {
        if (!(image instanceof HTMLImageElement)) {
          return false;
        }

        const srcCandidates = [
          asset.currentSrc,
          asset.src,
        ].filter((value) => typeof value === "string" && value.trim() !== "");

        const imageSrc = image.getAttribute("src") ?? "";
        const currentSrc = image.currentSrc ?? "";
        if (srcCandidates.some((candidate) => candidate === imageSrc || candidate === currentSrc)) {
          return true;
        }

        if (
          typeof asset.alt === "string" &&
          asset.alt.trim() !== "" &&
          image.getAttribute("alt")?.trim() === asset.alt.trim()
        ) {
          return true;
        }

        return false;
      };

      const blobToDataUrl = (blob) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
          reader.onerror = () => reject(reader.error ?? new Error("reader-failed"));
          reader.readAsDataURL(blob);
        });

      const parseDataUrl = (value) => {
        const match = /^data:([^;,]+)?(?:;[^,]*)?,(.+)$/.exec(value);
        if (!match) {
          return null;
        }

        return {
          mimeType: typeof match[1] === "string" && match[1].trim() !== "" ? match[1].trim() : null,
          base64: match[2] ?? "",
        };
      };

      const image = Array.from(document.images).find(matchesAsset) ?? null;
      const resolvedSrc =
        image?.currentSrc ??
        image?.getAttribute("src") ??
        asset.currentSrc ??
        asset.src ??
        "";
      const rect =
        image instanceof HTMLImageElement
          ? (() => {
              const bounds = image.getBoundingClientRect();
              return {
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
              };
            })()
          : null;

      if (typeof resolvedSrc === "string" && resolvedSrc.startsWith("data:")) {
        const parsed = parseDataUrl(resolvedSrc);
        if (parsed && parsed.base64 !== "") {
          return {
            success: true,
            base64: parsed.base64,
            mimeType:
              parsed.mimeType ??
              (typeof asset.mimeType === "string" && asset.mimeType.trim() !== ""
                ? asset.mimeType.trim()
                : "image/png"),
            rect,
          };
        }
      }

      if (typeof resolvedSrc === "string" && resolvedSrc.trim() !== "") {
        try {
          const response = await fetch(resolvedSrc, { credentials: "include" });
          if (response.ok) {
            const blob = await response.blob();
            const dataUrl = await blobToDataUrl(blob);
            const parsed = parseDataUrl(dataUrl);
            if (parsed && parsed.base64 !== "") {
              return {
                success: true,
                base64: parsed.base64,
                mimeType:
                  blob.type ||
                  parsed.mimeType ||
                  (typeof asset.mimeType === "string" && asset.mimeType.trim() !== ""
                    ? asset.mimeType.trim()
                    : "image/png"),
                rect,
              };
            }
          }
        } catch {}
      }

      if (
        image instanceof HTMLImageElement &&
        image.naturalWidth > 0 &&
        image.naturalHeight > 0
      ) {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const context = canvas.getContext("2d");
          if (context) {
            context.drawImage(image, 0, 0);
            const dataUrl = canvas.toDataURL("image/png");
            const parsed = parseDataUrl(dataUrl);
            if (parsed && parsed.base64 !== "") {
              return {
                success: true,
                base64: parsed.base64,
                mimeType: "image/png",
                rect,
              };
            }
          }
        } catch {}
      }

      return {
        success: false,
        rect,
        error: "generated-image-bytes-unavailable",
      };
    })()
  `;
}
