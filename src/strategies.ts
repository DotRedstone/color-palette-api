/**
 * Color extraction strategies
 */

import type { Color, Palette } from "./types";
import { rgbToHex, rgbToHsl, hslToHex, createColor, colorDistance } from "./utils";

/** Extract dominant colors using k-means-like quantization */
export function extractDominant(pixels: [number, number, number][], count: number = 5): Palette {
  // Simple color quantization using median cut
  const colors = medianCut(pixels, count);

  return {
    name: "Dominant Colors",
    strategy: "dominant",
    colors: colors.map(([r, g, b]) => createColor(r, g, b)),
    description: `Top ${count} most frequent colors`,
  };
}

/** Extract vibrant colors */
export function extractVibrant(pixels: [number, number, number][]): Palette {
  const vibrant: { score: number; color: Color }[] = [];
  const muted: { score: number; color: Color }[] = [];
  const darkVibrant: { score: number; color: Color }[] = [];
  const lightMuted: { score: number; color: Color }[] = [];

  for (const [r, g, b] of pixels) {
    const [h, s, l] = rgbToHsl(r, g, b);
    const color = createColor(r, g, b);

    // Skip near-white, near-black, and grays
    if (l < 5 || l > 95 || s < 10) continue;

    const score = s * (1 - Math.abs(l - 50) / 50);

    if (s >= 50) {
      if (l >= 50) vibrant.push({ score, color });
      else darkVibrant.push({ score, color });
    } else {
      if (l >= 50) lightMuted.push({ score, color });
      else muted.push({ score, color });
    }
  }

  // Sort by score
  vibrant.sort((a, b) => b.score - a.score);
  muted.sort((a, b) => b.score - a.score);
  darkVibrant.sort((a, b) => b.score - a.score);
  lightMuted.sort((a, b) => b.score - a.score);

  // Pick top from each category
  const seen = new Set<string>();
  const colors: Color[] = [];

  for (const source of [vibrant, muted, darkVibrant, lightMuted]) {
    if (source.length > 0 && !seen.has(source[0].color.hex)) {
      colors.push(source[0].color);
      seen.add(source[0].color.hex);
    }
  }

  // Pad to 5
  const all = [...vibrant, ...muted, ...darkVibrant, ...lightMuted];
  all.sort((a, b) => b.score - a.score);
  for (const { color } of all) {
    if (colors.length >= 5) break;
    if (!seen.has(color.hex)) {
      colors.push(color);
      seen.add(color.hex);
    }
  }

  return {
    name: "Vibrant Palette",
    strategy: "vibrant",
    colors: colors.slice(0, 5),
    description: "Colors extracted by vibrancy and saturation",
  };
}

/** Extract MD3 (Material Design 3) tonal palette */
export function extractMD3(pixels: [number, number, number][]): Palette {
  // Get dominant color
  const dominant = medianCut(pixels, 1)[0];
  const [h, s] = rgbToHsl(dominant[0], dominant[1], dominant[2]);

  // Secondary: shift hue 30 degrees
  const secH = (h + 30) % 360;

  // Tertiary: shift hue 60 degrees
  const terH = (h + 60) % 360;

  const colors: Color[] = [];

  // Primary tonal palette (5 tones)
  for (const tone of [10, 30, 50, 70, 90]) {
    colors.push(createColorFromHSL(h, s, tone));
  }

  // Secondary tonal palette (2 tones)
  for (const tone of [30, 70]) {
    colors.push(createColorFromHSL(secH, Math.max(20, s - 10), tone));
  }

  // Tertiary (1 tone)
  colors.push(createColorFromHSL(terH, Math.max(20, s - 20), 50));

  return {
    name: "MD3 Palette",
    strategy: "md3",
    colors: colors.slice(0, 8),
    description: "Material Design 3 tonal palette",
  };
}

/** Extract complementary colors */
export function extractComplementary(pixels: [number, number, number][]): Palette {
  const dominant = medianCut(pixels, 1)[0];
  const [h, s, l] = rgbToHsl(dominant[0], dominant[1], dominant[2]);
  const compH = (h + 180) % 360;

  return {
    name: "Complementary",
    strategy: "complementary",
    colors: [
      createColorFromHSL(h, s, l),
      createColorFromHSL(h, s, Math.min(100, l + 20)),
      createColorFromHSL(compH, s, l),
      createColorFromHSL(compH, s, Math.min(100, l + 20)),
      createColorFromHSL(h, Math.max(0, s - 20), l),
    ],
    description: "Dominant color + its complement",
  };
}

/** Extract analogous colors */
export function extractAnalogous(pixels: [number, number, number][]): Palette {
  const dominant = medianCut(pixels, 1)[0];
  const [h, s, l] = rgbToHsl(dominant[0], dominant[1], dominant[2]);

  return {
    name: "Analogous",
    strategy: "analogous",
    colors: [-30, -15, 0, 15, 30].map((offset) =>
      createColorFromHSL((h + offset + 360) % 360, s, l)
    ),
    description: "Colors adjacent on the color wheel",
  };
}

/** Extract triadic colors */
export function extractTriadic(pixels: [number, number, number][]): Palette {
  const dominant = medianCut(pixels, 1)[0];
  const [h, s, l] = rgbToHsl(dominant[0], dominant[1], dominant[2]);

  return {
    name: "Triadic",
    strategy: "triadic",
    colors: [
      createColorFromHSL(h, s, l),
      createColorFromHSL((h + 120) % 360, s, l),
      createColorFromHSL((h + 240) % 360, s, l),
      createColorFromHSL(h, s, Math.min(100, l + 20)),
      createColorFromHSL(h, s, Math.max(0, l - 20)),
    ],
    description: "Three colors equally spaced on the wheel",
  };
}

/** Extract split complementary colors */
export function extractSplitComplementary(pixels: [number, number, number][]): Palette {
  const dominant = medianCut(pixels, 1)[0];
  const [h, s, l] = rgbToHsl(dominant[0], dominant[1], dominant[2]);

  return {
    name: "Split Complementary",
    strategy: "split_complementary",
    colors: [
      createColorFromHSL(h, s, l),
      createColorFromHSL((h + 150) % 360, s, l),
      createColorFromHSL((h + 210) % 360, s, l),
      createColorFromHSL(h, s, Math.min(100, l + 20)),
      createColorFromHSL(h, s, Math.max(0, l - 20)),
    ],
    description: "Base color + two colors adjacent to its complement",
  };
}

/** Extract monochromatic colors */
export function extractMonochromatic(pixels: [number, number, number][]): Palette {
  const dominant = medianCut(pixels, 1)[0];
  const [h, s] = rgbToHsl(dominant[0], dominant[1], dominant[2]);

  return {
    name: "Monochromatic",
    strategy: "monochromatic",
    colors: [90, 70, 50, 30, 10].map((l) => createColorFromHSL(h, s, l)),
    description: "Single hue with varying lightness",
  };
}

// Helper functions

function createColorFromHSL(h: number, s: number, l: number): Color {
  const hex = hslToHex(h, s, l);
  const [r, g, b] = hexToRgb(hex);
  return { hex, rgb: [r, g, b], hsl: [h, s, l] };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** Median cut color quantization */
function medianCut(pixels: [number, number, number][], count: number): [number, number, number][] {
  if (pixels.length === 0) return [];

  let buckets: [number, number, number][][] = [pixels];

  while (buckets.length < count) {
    // Find bucket with largest range
    let maxRange = -1;
    let maxIndex = 0;
    let maxChannel = 0;

    buckets.forEach((bucket, i) => {
      if (bucket.length < 2) return;

      for (let ch = 0; ch < 3; ch++) {
        const values = bucket.map((p) => p[ch]);
        const range = Math.max(...values) - Math.min(...values);
        if (range > maxRange) {
          maxRange = range;
          maxIndex = i;
          maxChannel = ch;
        }
      }
    });

    if (maxRange <= 0) break;

    // Split bucket
    const bucket = buckets.splice(maxIndex, 1)[0];
    bucket.sort((a, b) => a[maxChannel] - b[maxChannel]);
    const mid = Math.floor(bucket.length / 2);
    buckets.push(bucket.slice(0, mid), bucket.slice(mid));
  }

  // Get average color from each bucket
  return buckets
    .filter((b) => b.length > 0)
    .map((bucket) => {
      const avg: [number, number, number] = [0, 0, 0];
      for (const [r, g, b] of bucket) {
        avg[0] += r;
        avg[1] += g;
        avg[2] += b;
      }
      return [
        Math.round(avg[0] / bucket.length),
        Math.round(avg[1] / bucket.length),
        Math.round(avg[2] / bucket.length),
      ] as [number, number, number];
    });
}

/** All available strategies */
export const STRATEGIES: Record<string, (pixels: [number, number, number][]) => Palette> = {
  dominant: (p) => extractDominant(p),
  vibrant: (p) => extractVibrant(p),
  md3: (p) => extractMD3(p),
  complementary: (p) => extractComplementary(p),
  analogous: (p) => extractAnalogous(p),
  triadic: (p) => extractTriadic(p),
  split_complementary: (p) => extractSplitComplementary(p),
  monochromatic: (p) => extractMonochromatic(p),
};
