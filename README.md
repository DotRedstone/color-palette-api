# Color Palette Extractor

从图片中提取多种配色方案，支持 8 种策略。可一键部署到 Cloudflare Workers/Pages。

[English](#english) | [中文](#中文)

---

## 中文

### 功能特性

- 🎨 **8 种配色策略**：MD3、Dominant、Vibrant、Complementary、Analogous、Triadic、Split Complementary、Monochromatic
- ⚡ **Cloudflare Workers**：全球边缘部署，毫秒级响应
- 🔧 **多种使用方式**：REST API、前端 JS、CLI
- 📦 **输出格式**：JSON、CSS 变量、Tailwind Config

### 快速部署

#### 方式一：一键部署 Cloudflare Workers

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/DotRedstone/color-palette-extractor)

#### 方式二：手动部署

```bash
# 克隆仓库
git clone https://github.com/DotRedstone/color-palette-extractor.git
cd color-palette-extractor

# 安装依赖
npm install

# 本地开发
npm run dev

# 部署到 Workers
npm run deploy

# 部署到 Pages
npm run build
npm run deploy:pages
```

#### 方式三：GitHub Actions 自动部署

1. Fork 仓库
2. 在 Cloudflare Dashboard 创建 API Token
3. 在 GitHub 仓库设置 Secrets：`CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`
4. Push 代码自动部署

### API 文档

#### 提取配色

```bash
POST /api/extract
Content-Type: application/json

{
  "image": "https://example.com/image.jpg",
  "strategies": ["md3", "dominant", "vibrant"]
}
```

**响应**

```json
{
  "success": true,
  "data": {
    "palettes": [
      {
        "name": "MD3 Palette",
        "strategy": "md3",
        "colors": [
          {
            "hex": "#e91e63",
            "rgb": [233, 30, 99],
            "hsl": [340, 84, 52]
          }
        ]
      }
    ],
    "metadata": { "strategies": ["md3"] }
  }
}
```

#### 生成 CSS 变量

```bash
POST /api/css
Content-Type: application/json

{
  "image": "https://example.com/image.jpg",
  "strategies": ["md3"]
}
```

**响应**

```css
:root {
  --color-1: #e91e63;
  --color-1-rgb: 233, 30, 99;
  --color-2: #f48fb1;
  --color-2-rgb: 244, 143, 177;
}
```

#### 列出所有策略

```bash
GET /api/strategies
```

**响应**

```json
{
  "strategies": [
    { "name": "md3", "description": "Material Design 3 色调系统" },
    { "name": "dominant", "description": "最常出现的颜色" },
    { "name": "vibrant", "description": "鲜艳/柔和/暗色变体" }
  ]
}
```

### 前端集成

#### React / Next.js

```jsx
// hooks/useImageColors.ts
import { useState, useEffect } from 'react';

export function useImageColors(imageUrl: string, strategies = ['md3']) {
  const [colors, setColors] = useState(null);

  useEffect(() => {
    fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageUrl, strategies })
    })
      .then(res => res.json())
      .then(data => setColors(data.data));
  }, [imageUrl]);

  return colors;
}

// 使用
function Card({ imageUrl }) {
  const colors = useImageColors(imageUrl);
  if (!colors) return null;

  return (
    <div style={{ backgroundColor: colors.palettes[0].colors[0].hex }}>
      <img src={imageUrl} />
    </div>
  );
}
```

#### Vue

```vue
<script setup>
import { ref, onMounted } from 'vue';

const props = defineProps({ imageUrl: String });
const colors = ref(null);

onMounted(async () => {
  const res = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: props.imageUrl, strategies: ['md3'] })
  });
  colors.value = (await res.json()).data;
});
</script>

<template>
  <div v-if="colors" :style="{ backgroundColor: colors.palettes[0].colors[0].hex }">
    <img :src="imageUrl" />
  </div>
</template>
```

#### Astro（博客主题）

```astro
---
const res = await fetch('https://your-worker.workers.dev/api/extract', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image: frontmatter.cover, strategies: ['md3'] })
});
const { data } = await res.json();
const primary = data.palettes[0].colors[0].hex;
---

<article style={`--accent: ${primary}`}>
  <img src={frontmatter.cover} />
  <h1>{frontmatter.title}</h1>
</article>

<style>
  article { border-left: 4px solid var(--accent); }
</style>
```

### 配色策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| `md3` | Material Design 3 色调系统 | Material Design UI |
| `dominant` | 最常出现的颜色 | 图片主色提取 |
| `vibrant` | 鲜艳/柔和/暗色变体 | 动态背景 |
| `complementary` | 互补色 | 对比设计 |
| `analogous` | 色轮相邻色 | 和谐配色 |
| `triadic` | 三色组 | 活泼设计 |
| `split_complementary` | 分裂互补色 | 平衡对比 |
| `monochromatic` | 单色系 | 简洁设计 |

### 项目结构

```
color-palette-extractor/
├── src/
│   ├── index.ts        # Worker 入口
│   ├── types.ts        # 类型定义
│   ├── utils.ts        # 颜色工具函数
│   ├── strategies.ts   # 配色策略
│   └── image.ts        # 图片解码（备用）
├── wrangler.toml       # CF Workers 配置
├── package.json
├── tsconfig.json
└── README.md
```

### 许可证

MIT

---

## English

### Quick Deploy

#### Cloudflare Workers (Recommended)

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/DotRedstone/color-palette-extractor)

```bash
git clone https://github.com/DotRedstone/color-palette-extractor.git
cd color-palette-extractor
npm install
npm run deploy
```

### API

```bash
# Extract palettes
POST /api/extract
{ "image": "url", "strategies": ["md3", "dominant"] }

# Get CSS variables
POST /api/css
{ "image": "url", "strategy": "md3" }

# List strategies
GET /api/strategies
```

### License

MIT
