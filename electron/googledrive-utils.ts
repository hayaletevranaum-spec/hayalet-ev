export function shouldConvertToGoogleDoc(mimeType: string | undefined, fileName: string): boolean {
  const normalizedMimeType = (mimeType ?? "").toLowerCase();
  const normalizedName = fileName.toLowerCase();

  return (
    normalizedMimeType.startsWith("text") ||
    normalizedName.endsWith(".txt") ||
    normalizedName.endsWith(".md")
  );
}
