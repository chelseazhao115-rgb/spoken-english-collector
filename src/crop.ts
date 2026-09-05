import type { SelectionRect } from "./messages";

export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function selectionToPixels(
  rect: SelectionRect,
  viewportWidth: number,
  viewportHeight: number,
  imageWidth: number,
  imageHeight: number,
): PixelRect {
  if (viewportWidth <= 0 || viewportHeight <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    throw new Error("Invalid viewport or screenshot dimensions.");
  }

  const scaleX = imageWidth / viewportWidth;
  const scaleY = imageHeight / viewportHeight;
  const x = Math.max(0, Math.round(rect.left * scaleX));
  const y = Math.max(0, Math.round(rect.top * scaleY));
  const right = Math.min(imageWidth, Math.round((rect.left + rect.width) * scaleX));
  const bottom = Math.min(imageHeight, Math.round((rect.top + rect.height) * scaleY));

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

export async function cropScreenshot(
  imageDataUrl: string,
  rect: SelectionRect,
  viewportWidth: number,
  viewportHeight: number,
): Promise<string> {
  const image = new Image();
  image.src = imageDataUrl;
  await image.decode();

  const pixelRect = selectionToPixels(
    rect,
    viewportWidth,
    viewportHeight,
    image.naturalWidth,
    image.naturalHeight,
  );
  const canvas = document.createElement("canvas");
  canvas.width = pixelRect.width;
  canvas.height = pixelRect.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  context.drawImage(
    image,
    pixelRect.x,
    pixelRect.y,
    pixelRect.width,
    pixelRect.height,
    0,
    0,
    pixelRect.width,
    pixelRect.height,
  );
  return canvas.toDataURL("image/png");
}
