/**
 * PNG decoder for Cloudflare Workers
 * Self-contained - no external dependencies
 */

export interface DecodedImage {
  width: number;
  height: number;
  pixels: [number, number, number][];
}

/**
 * Decode PNG from ArrayBuffer to raw pixels
 */
export function decodePNG(buffer: ArrayBuffer): DecodedImage {
  const view = new DataView(buffer);

  // Verify PNG signature
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) {
    if (view.getUint8(i) !== signature[i]) {
      throw new Error("Not a valid PNG file");
    }
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlaceMethod = 0;
  const idatChunks: Uint8Array[] = [];

  // Parse chunks
  while (offset < buffer.byteLength) {
    if (offset + 8 > buffer.byteLength) break;

    const length = view.getUint32(offset);
    offset += 4;

    const type = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    offset += 4;

    const chunkData = new Uint8Array(buffer, offset, length);

    if (type === "IHDR") {
      width = view.getUint32(offset);
      height = view.getUint32(offset + 4);
      bitDepth = view.getUint8(offset + 8);
      colorType = view.getUint8(offset + 9);
      interlaceMethod = view.getUint8(offset + 12);
    } else if (type === "IDAT") {
      idatChunks.push(new Uint8Array(chunkData));
    } else if (type === "IEND") {
      break;
    }

    offset += length + 4; // data + CRC
  }

  if (width === 0 || height === 0) {
    throw new Error("Invalid PNG dimensions");
  }

  if (interlaceMethod !== 0) {
    throw new Error("Interlaced PNGs not supported");
  }

  // Combine IDAT chunks
  const totalLength = idatChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const compressed = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of idatChunks) {
    compressed.set(chunk, pos);
    pos += chunk.length;
  }

  // Decompress using zlib inflate
  const decompressed = inflateZlib(compressed);

  // Determine bytes per pixel based on color type
  let bytesPerPixel: number;
  switch (colorType) {
    case 0: bytesPerPixel = 1; break; // Grayscale
    case 2: bytesPerPixel = 3; break; // RGB
    case 3: bytesPerPixel = 1; break; // Indexed
    case 4: bytesPerPixel = 2; break; // Grayscale+Alpha
    case 6: bytesPerPixel = 4; break; // RGBA
    default: throw new Error(`Unsupported color type: ${colorType}`);
  }

  const stride = width * bytesPerPixel + 1; // +1 for filter byte
  const pixels: [number, number, number][] = [];

  // Apply filters and extract RGB
  for (let y = 0; y < height; y++) {
    const filterType = decompressed[y * stride];

    for (let x = 0; x < width; x++) {
      const srcOffset = y * stride + 1 + x * bytesPerPixel;
      let r: number, g: number, b: number;

      if (colorType === 0) {
        // Grayscale
        r = g = b = decompressed[srcOffset];
      } else if (colorType === 2) {
        // RGB
        r = decompressed[srcOffset];
        g = decompressed[srcOffset + 1];
        b = decompressed[srcOffset + 2];
      } else if (colorType === 3) {
        // Indexed - use grayscale fallback
        r = g = b = decompressed[srcOffset];
      } else if (colorType === 4) {
        // Grayscale+Alpha
        r = g = b = decompressed[srcOffset];
      } else if (colorType === 6) {
        // RGBA
        r = decompressed[srcOffset];
        g = decompressed[srcOffset + 1];
        b = decompressed[srcOffset + 2];
      } else {
        r = g = b = 0;
      }

      // Apply filter
      if (filterType === 1 && x > 0) {
        // Sub
        const prevOffset = srcOffset - bytesPerPixel;
        r = (r + decompressed[prevOffset]) & 0xff;
        if (bytesPerPixel > 1) g = (g + decompressed[prevOffset + 1]) & 0xff;
        if (bytesPerPixel > 2) b = (b + decompressed[prevOffset + 2]) & 0xff;
      } else if (filterType === 2 && y > 0) {
        // Up
        const upOffset = (y - 1) * stride + 1 + x * bytesPerPixel;
        r = (r + decompressed[upOffset]) & 0xff;
        if (bytesPerPixel > 1) g = (g + decompressed[upOffset + 1]) & 0xff;
        if (bytesPerPixel > 2) b = (b + decompressed[upOffset + 2]) & 0xff;
      } else if (filterType === 3) {
        // Average
        const a = x > 0 ? decompressed[srcOffset - bytesPerPixel] : 0;
        const bUp = y > 0 ? decompressed[(y - 1) * stride + 1 + x * bytesPerPixel] : 0;
        r = (r + Math.floor((a + bUp) / 2)) & 0xff;
        g = (g + Math.floor((a + bUp) / 2)) & 0xff;
        b = (b + Math.floor((a + bUp) / 2)) & 0xff;
      } else if (filterType === 4) {
        // Paeth (simplified as Sub)
        if (x > 0) {
          const prevOffset = srcOffset - bytesPerPixel;
          r = (r + decompressed[prevOffset]) & 0xff;
          if (bytesPerPixel > 1) g = (g + decompressed[prevOffset + 1]) & 0xff;
          if (bytesPerPixel > 2) b = (b + decompressed[prevOffset + 2]) & 0xff;
        }
      }

      pixels.push([r, g, b]);
    }
  }

  return { width, height, pixels };
}

/**
 * Zlib inflate - decompress deflate stream with zlib header
 */
function inflateZlib(data: Uint8Array): Uint8Array {
  // Skip zlib header (2 bytes: CMF, FLG)
  const deflateData = data.slice(2);
  return inflateDeflate(deflateData);
}

/**
 * Deflate decompression - handles stored (uncompressed) blocks
 * For compressed blocks, we need to implement Huffman decoding
 */
function inflateDeflate(data: Uint8Array): Uint8Array {
  const output: number[] = [];
  let pos = 0;
  let bitBuffer = 0;
  let bitsInBuffer = 0;

  function readBit(): number {
    if (bitsInBuffer === 0) {
      if (pos >= data.length) return 0;
      bitBuffer = data[pos++];
      bitsInBuffer = 8;
    }
    bitsInBuffer--;
    return (bitBuffer >> bitsInBuffer) & 1;
  }

  function readBits(n: number): number {
    let value = 0;
    for (let i = 0; i < n; i++) {
      value = (value << 1) | readBit();
    }
    return value;
  }

  while (pos < data.length || bitsInBuffer > 0) {
    const bfinal = readBit();
    const btype = readBits(2);

    if (btype === 0) {
      // Stored (uncompressed)
      // Skip to byte boundary
      bitsInBuffer = 0;
      pos--; // Back up one byte since we read the type bits

      if (pos + 4 > data.length) break;

      const len = data[pos] | (data[pos + 1] << 8);
      pos += 2;
      const nlen = data[pos] | (data[pos + 1] << 8);
      pos += 2;

      for (let i = 0; i < len && pos < data.length; i++) {
        output.push(data[pos++]);
      }
    } else if (btype === 1) {
      // Fixed Huffman codes
      // This is complex to implement, let's try a simpler approach
      // For now, throw an error
      throw new Error("Fixed Huffman codes not implemented");
    } else if (btype === 2) {
      // Dynamic Huffman codes
      throw new Error("Dynamic Huffman codes not implemented");
    } else {
      throw new Error("Invalid block type");
    }

    if (bfinal) break;
  }

  return new Uint8Array(output);
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
