export const IMAGE_EXTENSIONS: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

/** Convert raw image bytes to a data URL, returning dimensions too */
export async function imageToDataURL(
  uint8: Uint8Array,
  mimeType: string
): Promise<{ dataUrl: string; width: number; height: number }> {
  const blob = new Blob([uint8.buffer as ArrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });
  URL.revokeObjectURL(url);

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  return { dataUrl: canvas.toDataURL("image/png"), width: img.width, height: img.height };
}

/** Get MIME type for an image file path, or null if not an image */
export function mimeTypeForPath(path: string): string | null {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  return IMAGE_EXTENSIONS[ext] || null;
}
