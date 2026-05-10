/**
 * Image decoder for Cloudflare Workers
 * Uses OffscreenCanvas when available
 */

export interface DecodedImage {
  width: number;
  height: number;
  pixels: [number, number, number][];
}

/**
 * Decode image from ArrayBuffer using OffscreenCanvas
 */
export async function decodeImage(buffer: ArrayBuffer): Promise<DecodedImage> {
  // Create blob from buffer
  const blob = new Blob([buffer]);

  // Try to create ImageBitmap
  try {
    const bitmap = await createImageBitmap(blob);

    // Use OffscreenCanvas to extract pixels
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas context");

    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Convert to pixel array
    const pixels: [number, number, number][] = [];
    for (let i = 0; i < imageData.data.length; i += 4) {
      pixels.push([
        imageData.data[i],
        imageData.data[i + 1],
        imageData.data[i + 2],
      ]);
    }

    return {
      width: canvas.width,
      height: canvas.height,
      pixels,
    };
  } catch (e: any) {
    throw new Error(`Image decoding failed: ${e.message}`);
  }
}

/**
 * Sample pixels from decoded image
 */
export function samplePixels(image: DecodedImage, maxPixels: number = 10000): [number, number, number][] {
  const total = image.pixels.length;

  if (total <= maxPixels) {
    return image.pixels;
  }

  const step = total / maxPixels;
  const sampled: [number, number, number][] = [];

  for (let i = 0; i < total; i += step) {
    sampled.push(image.pixels[Math.floor(i)]);
  }

  return sampled;
}
