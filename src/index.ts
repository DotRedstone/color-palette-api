/**
 * Color Palette Extractor - Cloudflare Worker
 *
 * 从图片中提取多种配色方案，支持 8 种策略。
 *
 * API:
 *   POST /api/extract  - 提取配色
 *   POST /api/css      - 生成 CSS 变量
 *   GET  /api/strategies - 列出所有策略
 *   GET  /              - 返回 HTML 页面
 */

import type { Env, ExtractRequest, ExtractionResult, Palette } from "./types";
import { STRATEGIES } from "./strategies";
import { decodePNG, samplePixels } from "./png-decoder";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders: Record<string, string> = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGINS || "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle OPTIONS
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Routes
      if (path === "/" || path === "/index.html") {
        return new Response(HTML_PAGE, {
          headers: { "Content-Type": "text/html;charset=utf-8", ...corsHeaders },
        });
      }

      if (path === "/api/strategies") {
        return jsonResponse(
          {
            strategies: Object.keys(STRATEGIES).map((name) => ({
              name,
              description: getStrategyDescription(name),
            })),
          },
          corsHeaders
        );
      }

      if (path === "/api/extract" && request.method === "POST") {
        return handleExtract(request, env, corsHeaders);
      }

      if (path === "/api/css" && request.method === "POST") {
        return handleCSS(request, env, corsHeaders);
      }

      return jsonResponse({ error: "Not found" }, corsHeaders, 404);
    } catch (err: any) {
      return jsonResponse({ error: err.message || "Internal error" }, corsHeaders, 500);
    }
  },
};

/** Handle /api/extract */
async function handleExtract(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = (await request.json()) as ExtractRequest;

    if (!body.image) {
      return jsonResponse({ error: "image is required" }, corsHeaders, 400);
    }

    const pixels = await fetchAndDecode(body.image, env.MAX_IMAGE_SIZE ? parseInt(env.MAX_IMAGE_SIZE) : 10 * 1024 * 1024);

    const strategies = body.strategies || Object.keys(STRATEGIES);
    const palettes: Palette[] = [];

    for (const name of strategies) {
      if (STRATEGIES[name]) {
        palettes.push(STRATEGIES[name](pixels));
      }
    }

    const result: ExtractionResult = {
      palettes,
      source: body.image,
      metadata: {
        width: 0,
        height: 0,
        strategies,
      },
    };

    return jsonResponse({ success: true, data: result }, corsHeaders);
  } catch (e: any) {
    return jsonResponse({ error: `Extract failed: ${e.message}` }, corsHeaders, 500);
  }
}

/** Handle /api/css */
async function handleCSS(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    const body = (await request.json()) as ExtractRequest;
    const strategy = body.strategies?.[0] || "md3";

    if (!body.image) {
      return jsonResponse({ error: "image is required" }, corsHeaders, 400);
    }

    const pixels = await fetchAndDecode(body.image, env.MAX_IMAGE_SIZE ? parseInt(env.MAX_IMAGE_SIZE) : 10 * 1024 * 1024);

    if (!STRATEGIES[strategy]) {
      return jsonResponse({ error: `Unknown strategy: ${strategy}` }, corsHeaders, 400);
    }

    const palette = STRATEGIES[strategy](pixels);
    const css = generateCSS(palette);

    return new Response(css, {
      headers: {
        "Content-Type": "text/css;charset=utf-8",
        ...corsHeaders,
      },
    });
  } catch (e: any) {
    return jsonResponse({ error: `CSS failed: ${e.message}` }, corsHeaders, 500);
  }
}

/** Fetch image and extract pixels */
async function fetchAndDecode(imageUrl: string, maxSize: number): Promise<[number, number, number][]> {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const buffer = await response.arrayBuffer();

  // Check size
  if (buffer.byteLength > maxSize) {
    throw new Error(`Image too large: ${buffer.byteLength} bytes (max: ${maxSize})`);
  }

  // Decode based on content type
  if (contentType.includes("png") || imageUrl.toLowerCase().endsWith(".png")) {
    const decoded = decodePNG(buffer);
    return samplePixels(decoded);
  }

  // For other formats, try to use a simple approach
  // In production, you'd want to support JPEG, WebP, etc.
  throw new Error(`Unsupported image format: ${contentType || "unknown"}. Currently only PNG is supported.`);
}

/** Generate CSS variables from palette */
function generateCSS(palette: Palette): string {
  const lines = [":root {"];
  palette.colors.forEach((color, i) => {
    lines.push(`  --color-${i + 1}: ${color.hex};`);
    lines.push(`  --color-${i + 1}-rgb: ${color.rgb.join(", ")};`);
  });
  lines.push("}");
  return lines.join("\n");
}

/** Get strategy description */
function getStrategyDescription(name: string): string {
  const descriptions: Record<string, string> = {
    dominant: "最常出现的颜色",
    vibrant: "鲜艳/柔和/暗色变体",
    md3: "Material Design 3 色调系统",
    complementary: "互补色",
    analogous: "色轮上相邻的颜色",
    triadic: "三等分色轮",
    split_complementary: "分裂互补色",
    monochromatic: "单一色相，不同亮度",
  };
  return descriptions[name] || name;
}

/** Helper: JSON response */
function jsonResponse(data: any, headers: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** HTML demo page */
const HTML_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Color Palette Extractor</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      padding: 2rem;
    }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { margin-bottom: 1.5rem; color: #333; }
    .upload-zone {
      border: 2px dashed #ccc;
      border-radius: 12px;
      padding: 3rem;
      text-align: center;
      background: white;
      cursor: pointer;
      transition: all 0.2s;
    }
    .upload-zone:hover { border-color: #666; }
    .upload-zone.dragover { border-color: #0066ff; background: #f0f7ff; }
    .preview { max-width: 100%; border-radius: 8px; margin: 1rem 0; }
    .strategies { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 1rem 0; }
    .strategy-btn {
      padding: 0.5rem 1rem;
      border: 1px solid #ddd;
      border-radius: 6px;
      background: white;
      cursor: pointer;
      font-size: 0.9rem;
    }
    .strategy-btn.active { background: #0066ff; color: white; border-color: #0066ff; }
    .palette { margin: 1rem 0; }
    .palette-title { font-weight: 600; margin-bottom: 0.5rem; }
    .colors { display: flex; gap: 0.5rem; flex-wrap: wrap; }
    .color-swatch {
      width: 60px; height: 60px; border-radius: 8px;
      border: 1px solid rgba(0,0,0,0.1);
      display: flex; align-items: end; justify-content: center;
      padding: 4px; font-size: 10px; color: white;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5);
    }
    .css-output {
      background: #1e1e1e; color: #d4d4d4; padding: 1rem;
      border-radius: 8px; font-family: monospace; font-size: 0.85rem;
      white-space: pre-wrap; margin: 1rem 0;
    }
    .error { color: #e53e3e; margin: 1rem 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎨 Color Palette Extractor</h1>
    <p style="color: #666; margin-bottom: 1rem;">目前仅支持 PNG 格式</p>

    <div class="upload-zone" id="dropZone">
      <p>拖拽 PNG 图片到这里，或点击选择</p>
      <input type="file" id="fileInput" accept="image/png" hidden>
    </div>

    <img id="preview" class="preview" style="display:none">

    <div class="strategies" id="strategies"></div>

    <div id="palettes"></div>

    <div class="css-output" id="cssOutput" style="display:none"></div>

    <div class="error" id="error" style="display:none"></div>
  </div>

  <script>
    const API = location.origin;
    let selectedStrategies = ['md3', 'dominant', 'vibrant'];

    // Load strategies
    fetch(API + '/api/strategies')
      .then(r => r.json())
      .then(data => {
        const container = document.getElementById('strategies');
        data.strategies.forEach(s => {
          const btn = document.createElement('button');
          btn.className = 'strategy-btn' + (selectedStrategies.includes(s.name) ? ' active' : '');
          btn.textContent = s.name;
          btn.onclick = () => {
            btn.classList.toggle('active');
            if (selectedStrategies.includes(s.name)) {
              selectedStrategies = selectedStrategies.filter(x => x !== s.name);
            } else {
              selectedStrategies.push(s.name);
            }
          };
          container.appendChild(btn);
        });
      });

    // File handling
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    dropZone.onclick = () => fileInput.click();
    dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add('dragover'); };
    dropZone.ondragleave = () => dropZone.classList.remove('dragover');
    dropZone.ondrop = e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      handleFile(e.dataTransfer.files[0]);
    };
    fileInput.onchange = e => handleFile(e.target.files[0]);

    async function handleFile(file) {
      if (!file) return;

      const errorEl = document.getElementById('error');
      errorEl.style.display = 'none';

      const preview = document.getElementById('preview');
      preview.src = URL.createObjectURL(file);
      preview.style.display = 'block';

      // Convert to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = reader.result.split(',')[1];
        // We'll send the file as a data URL for now
        // In production, you'd upload to R2 or similar
        document.getElementById('palettes').innerHTML = '<p>请使用 API 直接调用，或上传图片到可公开访问的 URL</p>';
      };
      reader.readAsDataURL(file);
    }

    // API test function
    window.testExtract = async function(imageUrl) {
      const errorEl = document.getElementById('error');
      errorEl.style.display = 'none';

      try {
        const response = await fetch(API + '/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: imageUrl, strategies: selectedStrategies })
        });

        const data = await response.json();

        if (data.error) {
          errorEl.textContent = data.error;
          errorEl.style.display = 'block';
          return;
        }

        displayPalettes(data.data.palettes);
      } catch (e) {
        errorEl.textContent = e.message;
        errorEl.style.display = 'block';
      }
    };

    function displayPalettes(palettes) {
      const container = document.getElementById('palettes');
      container.innerHTML = '';

      palettes.forEach(palette => {
        const div = document.createElement('div');
        div.className = 'palette';
        div.innerHTML = '<div class="palette-title">' + palette.name + '</div>';
        
        const colors = document.createElement('div');
        colors.className = 'colors';
        
        palette.colors.forEach(color => {
          const swatch = document.createElement('div');
          swatch.className = 'color-swatch';
          swatch.style.backgroundColor = color.hex;
          swatch.textContent = color.hex;
          colors.appendChild(swatch);
        });
        
        div.appendChild(colors);
        container.appendChild(div);
      });
    }
  </script>
</body>
</html>`;
