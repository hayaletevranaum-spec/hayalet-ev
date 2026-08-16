import type Konva from "konva";

export type RepairKonvaNamespace = typeof Konva;
type KonvaGlobal = typeof globalThis & { Konva?: unknown };

let konvaLoadPromise: Promise<RepairKonvaNamespace> | null = null;

function isKonvaNamespace(value: unknown): value is RepairKonvaNamespace {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["Stage"] === "function" &&
    typeof candidate["Layer"] === "function" &&
    typeof candidate["Group"] === "function" &&
    typeof candidate["Rect"] === "function" &&
    typeof candidate["Line"] === "function" &&
    typeof candidate["Circle"] === "function" &&
    typeof candidate["Text"] === "function"
  );
}

function getGlobalKonva(): RepairKonvaNamespace | null {
  const value = (globalThis as KonvaGlobal).Konva;
  return isKonvaNamespace(value) ? value : null;
}

export async function loadKonvaNamespace(documentRef: Document): Promise<RepairKonvaNamespace> {
  const existing = getGlobalKonva();
  if (existing !== null) return existing;

  if (konvaLoadPromise === null) {
    konvaLoadPromise = new Promise<RepairKonvaNamespace>((resolve, reject) => {
      const script = documentRef.createElement("script");
      script.async = true;
      script.dataset["repairVendor"] = "konva";
      script.src = new URL("../../shared/vendor/konva.min.js", import.meta.url).href;
      script.onload = () => {
        const loaded = getGlobalKonva();
        if (loaded === null) {
          reject(new Error("Repair Room Konva vendor loaded without exposing window.Konva."));
          return;
        }
        resolve(loaded);
      };
      script.onerror = () => {
        reject(new Error(`Repair Room failed to load Konva vendor from ${script.src}`));
      };
      documentRef.head.append(script);
    });
  }

  try {
    return await konvaLoadPromise;
  } catch (error) {
    konvaLoadPromise = null;
    throw error;
  }
}
