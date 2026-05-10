/** Color type */
export interface Color {
  hex: string;
  rgb: [number, number, number];
  hsl: [number, number, number];
}

/** Palette type */
export interface Palette {
  name: string;
  strategy: string;
  colors: Color[];
  description: string;
}

/** Extraction result */
export interface ExtractionResult {
  palettes: Palette[];
  source: string;
  metadata: {
    width: number;
    height: number;
    strategies: string[];
  };
}

/** API request */
export interface ExtractRequest {
  image: string;
  strategies?: string[];
}

/** Worker environment */
export interface Env {
  ALLOWED_ORIGINS: string;
  MAX_IMAGE_SIZE: string;
}

/** Image data from decoder */
export interface ImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}
