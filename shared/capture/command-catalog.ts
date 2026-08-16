export const DEFAULT_CAPTURE_COMMAND_PHRASES = {
  openCamera: ["kamerayı aç", "kamerayi ac", "kamera aç", "kamera ac", "open camera"],
  capture: [
    "çek",
    "cek",
    "fotoğraf çek",
    "fotograf cek",
    "resim çek",
    "resim cek",
    "capture",
  ],
  stop: ["durdur", "kapat", "oturumu durdur", "kamerayı kapat", "kamerayi kapat", "stop"],
} as const;

export type CaptureCommandPhraseKey = keyof typeof DEFAULT_CAPTURE_COMMAND_PHRASES;

export function normalizeCapturePhraseList(
  value: unknown,
  fallback: readonly string[]
): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  const normalized = source
    .map((entry) =>
      typeof entry === "string" ? entry.trim().toLocaleLowerCase("tr-TR") : ""
    )
    .filter((entry, index, list) => entry !== "" && list.indexOf(entry) === index);

  return normalized.length > 0 ? normalized : [...fallback];
}
